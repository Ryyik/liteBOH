import { describe, it, expect } from 'vitest';
import {
  RESPONSE_STYLE_OPTIONS,
  PSYCH_INTERVIEW_GENERATION_PROFILE,
  GENERATION_PROFILE_BY_MODE
} from '../../src/views/BOHAI/composables/chat-engine-config.js';
import {
  PSYCH_INTERVIEW_APPENDIX,
  PSYCHOLOGIST_PROMPT_APPENDIX,
  PSYCH_CRISIS_RESOURCES,
  PSYCH_L0_RULES,
  PSYCH_L1_RULES
} from '../../src/views/BOHAI/expert-roles/psychologist.js';
import { getGenerationProfile } from '../../src/views/BOHAI/composables/bohai-engine-helpers.js';

const byId = (id) => RESPONSE_STYLE_OPTIONS.find((s) => s.id === id);
const psych = byId('psychologist');

/**
 * 心理专家提示附录拆成两层的回归锁（2026-09-24，方案 M3 / M1 / M6）。
 *
 * 旧结构的问题：访谈协议写在**风格**附录里，而风格是 localStorage 里的全局设置。
 * 于是「设置面板手动选心理风格」这条路径也会拿到整套访谈协议 —— 模型照着自己切进访谈模式，
 * 但那条路径没有 expertState、没有状态块、没有输出守门，也不是封闭域。
 */
describe('心理专家 · 附录分层（M3）', () => {
  it('陪伴式附录（风格级）在册，且保留 style 包裹与 id 对齐', () => {
    expect(psych.promptAppendix).toContain('<style id="psychologist">');
    ['<constraints>', '<instructions>', '<how_to_start_interview>', '<safety>']
      .forEach((tag) => expect(psych.promptAppendix).toContain(tag));
  });

  it('★ 访谈协议**不在**风格附录里（这条是 M3 的核心）', () => {
    ['<interview_protocol>', '<interview_mode>', '<no_options>', '<epistemic_layering>', '<report_format>', '<mode_switch>']
      .forEach((tag) => expect(psych.promptAppendix).not.toContain(tag));
  });

  it('风格附录明确要求「不要主动发起访谈」，并给出入口指引', () => {
    expect(psych.promptAppendix).toContain('不要主动发起发问式访谈');
    expect(psych.promptAppendix).toContain('心理分析');
  });

  it('访谈附录（会话级）在册，四个规则段齐全', () => {
    ['<interview_mode>', '<interview_protocol>', '<no_options>', '<epistemic_layering>', '<report_format>']
      .forEach((tag) => expect(PSYCH_INTERVIEW_APPENDIX).toContain(tag));
  });

  it('陪伴式仍保留默认语气（不劫持原有体验）', () => {
    expect(psych.promptAppendix).toContain('陪伴者');
  });

  it('其他风格不被访谈规则污染', () => {
    ['default', 'socratic', 'crisp'].forEach((id) => {
      const appendix = byId(id).promptAppendix;
      expect(appendix).not.toContain('<interview_protocol>');
      expect(appendix).not.toContain('<how_to_start_interview>');
    });
  });
});

/**
 * M1：把「禁令清单」改成「✗/✓ 对照」时，必须证明信息没丢。
 * 每条原禁令要么在示例里有对应的 ✗，要么由 guards 代码兜底 —— 两者都不在才算丢。
 */
describe('心理专家 · 规则覆盖（M1 防丢）', () => {
  const codeEnforced = {
    一次只问一个问题: 'MULTI_QUESTION',
    不给选项: 'OPTIONS',
    不暴露技术名词: 'TERMS',
    不给建议: 'ADVICE',
    不重复上一问: 'REPEAT',
    不复述原话: 'PARROT'
  };

  it('六个可被代码检测的规则都有对应的 violation 类型（不是只写在 prompt 里）', () => {
    expect(Object.values(codeEnforced)).toEqual(
      expect.arrayContaining(['MULTI_QUESTION', 'OPTIONS', 'TERMS', 'ADVICE', 'REPEAT', 'PARROT'])
    );
  });

  it('原【四类禁止问的问题】的四类失败形态在示例里各有一条 ✗', () => {
    // 问卷句式（你通常会）/ 要方案（你会采取什么行动）/ 问卷句式（具体是什么方面）/ 复述（了解到你）
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('你通常会怎么处理这种情况');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('你认为自己会采取什么行动');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('你通常会用什么方法来应对');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('了解到你感到压力');
  });

  it('原【第五类禁问】的铁律在册（且它是可被正则检测的）', () => {
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('「比如」「例如」「还是」「或者」就算违规');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('比如是感到难过、失落，还是身体上有反应');
  });

  it('原【接住≠复述】的判断标准在册', () => {
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('接住 ≠ 复述');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('换了几个字但意思一样');
  });

  it('原【只能用他说过的话】在册（它没有代码兜底，删不得）', () => {
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('只能用他说过的话');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('一直陪伴你的老朋友');
  });

  it('对照示例在册（考不过 / 背单词 / 没办法应对 / 烦 / 不知道）', () => {
    ['考不过呗', '背单词好难坚持', '没办法应对', '烦。', '不知道，想不起来了']
      .forEach((sample) => expect(PSYCH_INTERVIEW_APPENDIX).toContain(sample));
  });

  it('示例段真的成对：每个 ✗ 后面都跟着一个 ✓', () => {
    const bad = (PSYCH_INTERVIEW_APPENDIX.match(/✗/g) || []).length;
    const good = (PSYCH_INTERVIEW_APPENDIX.match(/✓/g) || []).length;
    expect(bad).toBeGreaterThanOrEqual(8);
    expect(good).toBe(bad);
  });

  it('硬指标（30 字 / 一个问号）仍在册', () => {
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('一个问题不超过 30 字');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('一轮里只允许出现一个问号');
  });

  it('不再与 L1 逐字重复（旧版 P-2/P-3 是纯浪费注意力）', () => {
    PSYCH_L1_RULES.forEach((rule) => {
      const core = rule.replace(/[。；]/g, '');
      expect(PSYCH_INTERVIEW_APPENDIX).not.toContain(core);
    });
  });

  it('认识论分层仍在册（报告质量关键）', () => {
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('只引用，不推论');
    expect(PSYCH_INTERVIEW_APPENDIX).toContain('不许把自己的推论说成对方的真相');
  });
});

describe('心理专家 · 危机资源单一真源', () => {
  it('常量被 L0 与两个附录共同引用，不再各写一份字面量', () => {
    expect(PSYCH_CRISIS_RESOURCES).toContain('12356');
    expect(PSYCH_L0_RULES.join('')).toContain(PSYCH_CRISIS_RESOURCES);
    expect(PSYCHOLOGIST_PROMPT_APPENDIX).toContain(PSYCH_CRISIS_RESOURCES);
    expect(PSYCH_INTERVIEW_APPENDIX).toContain(PSYCH_CRISIS_RESOURCES);
  });

  it('安全边界在册：禁诊断标签 / 禁命理推演', () => {
    expect(PSYCHOLOGIST_PROMPT_APPENDIX).toContain('不使用诊断标签');
    expect(PSYCHOLOGIST_PROMPT_APPENDIX).toContain('星座');
  });
});

/**
 * M6：访谈态专属生成参数。
 * 重点是「不能影响非访谈态」——那张表是全局共享的，一旦泄漏出去，
 * 所有 pro 会话都会跟着变暖，而且很难从现象上归因。
 */
describe('心理专家 · 访谈态生成参数（M6）', () => {
  it('非访谈态仍是 pro 的原参数', () => {
    const normal = getGenerationProfile('pro', {});
    expect(normal.temperature).toBe(GENERATION_PROFILE_BY_MODE.pro.temperature);
    expect(normal.top_p).toBe(GENERATION_PROFILE_BY_MODE.pro.top_p);
  });

  it('访谈态提温，并略提 frequency_penalty（抑制重复提问）', () => {
    const interview = getGenerationProfile('pro', { psychInterview: true });
    expect(interview.temperature).toBe(PSYCH_INTERVIEW_GENERATION_PROFILE.temperature);
    expect(interview.temperature).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.pro.temperature);
    expect(interview.frequency_penalty).toBeGreaterThan(GENERATION_PROFILE_BY_MODE.pro.frequency_penalty);
  });

  it('max_tokens 继承 mode，不被访谈参数清掉', () => {
    const interview = getGenerationProfile('pro', { psychInterview: true });
    expect(interview.max_tokens).toBe(GENERATION_PROFILE_BY_MODE.pro.max_tokens);
  });

  it('★ 访谈态优先级高于 factual / operation 的降温 clamp', () => {
    const clamped = getGenerationProfile('pro', { operationQuestion: true });
    const interview = getGenerationProfile('pro', { operationQuestion: true, psychInterview: true });
    expect(clamped.temperature).toBeLessThanOrEqual(0.14);
    expect(interview.temperature).toBe(PSYCH_INTERVIEW_GENERATION_PROFILE.temperature);
  });

  it('★ 缓存不串味：psychInterview 进了 cacheKey', () => {
    const normal = getGenerationProfile('pro', {});
    const interview = getGenerationProfile('pro', { psychInterview: true });
    const normalAgain = getGenerationProfile('pro', {});
    expect(normal.temperature).toBe(GENERATION_PROFILE_BY_MODE.pro.temperature);
    expect(interview.temperature).toBe(PSYCH_INTERVIEW_GENERATION_PROFILE.temperature);
    expect(normalAgain.temperature).toBe(GENERATION_PROFILE_BY_MODE.pro.temperature);
  });
});
