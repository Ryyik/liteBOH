import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenSource, stripComments, scriptSection, squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// plans/024 的「防回归锁」。
//
// 这些断言不是在测行为，是在**锁住一次删除**：2026-10-02 按 plans/024 移除了
// 一批已废弃的代码与规则，但它们在别处仍有**合法**的复述（计划文档、本文件注释、
// 源码里解释「为什么删掉它」的注释），所以逐字否定断言必须在**剥掉注释后**的
// 代码上做 —— 直接用原文会假红。
//
// ⚠️ 改这些断言前先读 tests/helpers/source.js 的文件头（format-tolerant 归一规则）。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const readCode = (relPath) => stripComments(scriptSection(read(relPath)));

const CHAT_ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';
const AUTO_ROUTER = 'src/views/BOHAI/engine/bohai-auto-router.js';
const CHAT_CONFIG = 'src/views/BOHAI/composables/chat-engine-config.js';
const SHARED_RULES = 'src/views/BOHAI/shared-rules.js';

describe('plans/024 · P0-2：追问改写的 LLM 调用不得回来', () => {
  it('useChatEngine 里不再有那次「上下文理解器」调用', () => {
    const code = readCode(CHAT_ENGINE);
    // 这是那段 prompt 的唯一标记；它回来了就说明无条件追问改写被重新引入
    expect(code).not.toContain('上下文理解器');
    // 连带：它当时用的 preset 也必须保持删除状态（生成参数真源里已移除）
    const params = readCode('src/views/BOHAI/generation-params.js');
    expect(params).not.toContain('titleExtract');
  });

  it('追问消解走本地规则', () => {
    const code = readCode(CHAT_ENGINE);
    expect(code).toContain('buildContextualFollowUpQuery');
    expect(code).toContain('const contextualQuery = localContextualQuery');
  });
});

describe('plans/024 · P0-3：阶段耗时埋点在位', () => {
  it('useChatEngine 记录 6 个检查点并写进消息 meta', () => {
    const code = readCode(CHAT_ENGINE);
    for (const key of [
      'configReadyMs',
      'contextReadyMs',
      'retrievalDoneMs',
      'requestSentMs',
      'firstTokenMs',
      'doneMs',
    ]) {
      expect(code).toContain(squeezeSource(`markTiming('${key}')`));
    }
    expect(code).toContain('bohaiTiming');
  });

  it('finally 里收尾，失败路径也能量到耗时', () => {
    // 用 flattenSource：分号不被归一工具处理，且 prettier 可能在两句之间断行
    const code = flattenSource(readCode(CHAT_ENGINE));
    expect(code).toContain(flattenSource("markTiming('doneMs'); flushTiming();"));
  });

  it('bohaiTiming 能通过会话持久化往返（否则埋点会被静默丢弃）', async () => {
    // 09-24 的 lastViolations / guardStats 就是因为没进白名单而被静默丢弃。
    // 实测确认：message.meta 在 sanitizer 里是**整块展开**（`...message`），
    // 不需要逐字段登记；这条断言把这个前提锁住 —— 若哪天改成显式白名单，它会红。
    const { createBohAIChatSessionSanitizer } =
      await import('../../src/utils/bohai-chat-session-store.js');
    const sanitize = createBohAIChatSessionSanitizer();
    const out = sanitize({
      title: 't',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: 'ok',
          meta: { bohaiTiming: { configReadyMs: 3, firstTokenMs: 812, doneMs: 2400 } },
        },
      ],
      expertState: null,
    });
    expect(out.messages[1].meta.bohaiTiming).toEqual({
      configReadyMs: 3,
      firstTokenMs: 812,
      doneMs: 2400,
    });
  });
});

describe('plans/024 · P0-1：废弃的 auto 路由链不得回来', () => {
  it('9 类无消费方的正则与派生函数已删除', () => {
    const code = readCode(AUTO_ROUTER);
    for (const dead of [
      'bohInternalFact',
      'webFreshness',
      'explicitWebSearch',
      'externalKnowledge',
      'healthOrSafety',
      'multiStepReasoning',
      'isLikelyWebSearchRequest',
      'isLikelyComplexQuestion',
      'isLikelyPlanModeRequest',
      'isLikelyMinecraftCommandRequest',
      'pickModeFromLocalSignals',
      'pickMoreCapableMode',
    ]) {
      expect(code).not.toContain(dead);
    }
  });

  it('14 类有消费方的正则仍在（收口不许误伤）', () => {
    const code = readCode(AUTO_ROUTER);
    for (const alive of [
      'cloudSave',
      'sharedSave',
      'bothSave',
      'forumPost',
      'dailySummary',
      'cloudReference',
      'internalSource',
      'question',
      'community',
      'memoryShare',
      'memoryQuery',
      'codeOrCommand',
      'professionalHealth',
      'personalSupport',
    ]) {
      expect(code).toContain(`${alive}: {`);
    }
  });

  it('决策对象只剩 5 个有消费方的字段', () => {
    const code = readCode(AUTO_ROUTER);
    for (const key of [
      'shouldSaveCloud',
      'shouldSaveSharedMemory',
      'shouldAskMemoryDestination',
      'saveDestination',
      'shouldReferenceCloud',
    ]) {
      expect(code).toContain(key);
    }
    // 已废弃字段：这几个名字只在注释里合法出现，剥注释后不该有
    for (const dead of ['modeId', 'forceCloudReference', 'shouldAskSharedMemory', 'actionNotes']) {
      expect(code).not.toContain(dead);
    }
  });

  it('lastRoutedMode 只有写没有读，已连根删除', () => {
    expect(readCode(CHAT_ENGINE)).not.toContain('lastRoutedMode');
    expect(readCode('src/views/BOHAI/composables/useModelConfig.js')).not.toContain(
      'lastRoutedMode',
    );
  });
});

describe('plans/024 · P1-1：跨轮证据的时效护栏', () => {
  it('复用上一轮证据前先判时效', () => {
    const code = readCode(CHAT_ENGINE);
    expect(code).toContain('ROUTING_FORUM_REALTIME_PATTERN');
    expect(code).toContain('isRealtimeQuery');
    expect(code).toContain('stale_evidence_note');
  });
});

describe('plans/024 · P1-2：参数与规则不再同向叠加', () => {
  it('responseRules 里那句与 frequency_penalty 打架的「不要重复」已删', () => {
    const code = readCode(CHAT_ENGINE);
    expect(code).not.toContain('不要重复已说过的内容');
    // 承接意图改成正向表述，必须仍在
    expect(code).toContain('承接上一轮的结论直接推进');
  });
});

describe('plans/024 · P2-2：规则单一真源', () => {
  it('shared-rules 导出三个常量，且被引用', () => {
    const rules = readCode(SHARED_RULES);
    for (const name of ['NO_FABRICATION_RULE', 'NO_TECH_TERMS_RULE', 'NO_RAW_JSON_RULE']) {
      expect(rules).toContain(`export const ${name}`);
    }
    expect(readCode(CHAT_CONFIG)).toContain('NO_FABRICATION_RULE');
    expect(readCode('src/views/BOHAI/agents/prompts/synthesizer-prompt.js')).toContain(
      'NO_FABRICATION_RULE',
    );
  });
});

describe('plans/024 · P2-1：BASE 系统提示的约束以肯定式为主', () => {
  // 只锁 BASE 的 <constraints> 块 —— role / continuity / instructions 段不在本次范围内，
  // plan 模式附录与健康附录的否定式约束也**刻意保留**（它们的范围限定本身是信息）
  const constraintsBlock = () => {
    const code = readCode(CHAT_CONFIG);
    const base = (code.match(/export const BASE_SYSTEM_PROMPT[\s\S]*?(?=export const )/) || [
      '',
    ])[0];
    return (base.match(/<constraints>[\s\S]*?<\/constraints>/) || [''])[0];
  };

  it('「绝对不能：」式长清单已改写', () => {
    expect(constraintsBlock()).not.toContain('绝对不能：');
    expect(constraintsBlock()).not.toContain('绝对不能');
  });

  it('<constraints> 的否定式约束降到 2 条以内（改动前是 5 条）', () => {
    const negatives = (constraintsBlock().match(/绝对不能|不要|禁止|不许|不得/g) || []).length;
    expect(negatives).toBeLessThanOrEqual(2);
  });

  it('「不编造」改为引用规则真源，而不是再写一份副本', () => {
    expect(constraintsBlock()).toContain('${NO_FABRICATION_RULE}');
    // 真源里的那句话必须是「缺依据时该做什么」的正向表述
    expect(readCode(SHARED_RULES)).toContain('没有依据的部分直接说「不确定」');
  });
});
