import { describe, it, expect } from 'vitest';
import {
  VIOLATION_TYPES,
  detectViolations,
  hasHardViolation,
  shouldRewrite,
  buildRewriteInstruction,
  splitQuestions,
  summarizeViolations,
  similarity
} from '../../src/views/BOHAI/expert-roles/guards.js';

// 样本全部来自 2026-09-16 两次真实访谈的原句
const REAL_BAD_SAMPLES = {
  optionWithExample:
    '你能具体说说，当时是什么让你感到最难受吗？比如是某个具体的场景，或者是一种特别的情绪？',
  optionFiveChoices:
    '得知分手的消息时，你当时的心情和身体感受是怎样的？比如是感到难过、失落，还是身体上有什么反应，比如心跳加速或者胃部不适？',
  optionAfterWord:
    '难过的时候，你通常会通过什么方式来排解情绪？比如找人倾诉、运动、或者做些别的事情？',
  multiQuestionOnly:
    '你当时在哪儿？那天是几点的事？'
};

describe('输出守门 · 检测真实失败句式', () => {
  it('举例式选项（比如…或者…）判为 options', () => {
    const found = detectViolations(REAL_BAD_SAMPLES.optionWithExample);
    expect(found.map((f) => f.type)).toContain(VIOLATION_TYPES.OPTIONS);
  });

  it('一次塞五个选项（比如…还是…比如…或者…）判为 options', () => {
    const found = detectViolations(REAL_BAD_SAMPLES.optionFiveChoices);
    const types = found.map((f) => f.type);
    expect(types).toContain(VIOLATION_TYPES.OPTIONS);
    expect(types).toContain(VIOLATION_TYPES.MULTI_QUESTION);
  });

  it('「通常…比如…或者…」判为 options', () => {
    const found = detectViolations(REAL_BAD_SAMPLES.optionAfterWord);
    expect(found.map((f) => f.type)).toContain(VIOLATION_TYPES.OPTIONS);
  });

  it('一轮两个问号判为 multi_question', () => {
    const found = detectViolations(REAL_BAD_SAMPLES.multiQuestionOnly);
    expect(found.map((f) => f.type)).toContain(VIOLATION_TYPES.MULTI_QUESTION);
    expect(found[0].count).toBe(2);
  });
});

describe('输出守门 · 不误报', () => {
  it('干净的单问句不报任何违规', () => {
    expect(detectViolations('最近一次放弃背单词，是第几天？')).toEqual([]);
  });

  it('陈述句里的「还是」不算选项（只有问句才判）', () => {
    expect(detectViolations('他说那次还是照常去上课了。')).toEqual([]);
  });

  it('引用用户原话里的「还是」不算选项', () => {
    const text = '你提到「难过得吃不下饭还是照常去上课」，那时候你心里在想什么？';
    expect(detectViolations(text)).toEqual([]);
  });

  it('陈述收尾不产生违规（没有问号就没有问题）', () => {
    expect(detectViolations('好，我先把刚才听到的整理一下。')).toEqual([]);
  });
});

describe('输出守门 · 术语与建议', () => {
  it('技术术语泄露被捕获', () => {
    expect(detectViolations('我接下来用向下箭头问你一个问题？').map((f) => f.type))
      .toContain(VIOLATION_TYPES.TERMS);
  });

  it('访谈期给建议被捕获', () => {
    expect(detectViolations('你可以试试每天背十个单词？').map((f) => f.type))
      .toContain(VIOLATION_TYPES.ADVICE);
  });

  it('重写决策与硬违规判定', () => {
    const hard = detectViolations(REAL_BAD_SAMPLES.optionWithExample);
    expect(hasHardViolation(hard)).toBe(true);
    expect(shouldRewrite(hard)).toBe(true);
    expect(shouldRewrite([])).toBe(false);
    expect(hasHardViolation(detectViolations('你可以试试早点睡？'))).toBe(false);
  });
});

describe('输出守门 · 重写指令', () => {
  it('同类违规去重，且给出可执行要求', () => {
    const instruction = buildRewriteInstruction([
      { type: VIOLATION_TYPES.OPTIONS },
      { type: VIOLATION_TYPES.OPTIONS },
      { type: VIOLATION_TYPES.MULTI_QUESTION }
    ]);
    expect(instruction).toContain('【重写要求】');
    expect(instruction.match(/上一轮的问题里塞了举例或选项/g).length).toBe(1);
    expect(instruction).toContain('只保留最关键的那一个问句');
    expect(instruction).toContain('不要解释你做错了什么');
  });

  it('无违规时返回空串（不产生多余提示）', () => {
    expect(buildRewriteInstruction([])).toBe('');
  });

  it('摘要用于观测日志', () => {
    expect(summarizeViolations([])).toBe('none');
    expect(summarizeViolations([{ type: 'options' }, { type: 'terms' }])).toBe('options,terms');
  });
});

describe('输出守门 · 重复上一问（2026-09-16 对话实测抓到的）', () => {
  const prev = '你提到计划全废了，晚上刷手机到两点。当时刷手机时，你在想什么？';

  it('几乎原样重复 → 判 repeat，且算硬违规', () => {
    const findings = detectViolations(prev, { prevReply: prev });
    expect(findings.map((f) => f.type)).toContain(VIOLATION_TYPES.REPEAT);
    expect(hasHardViolation(findings)).toBe(true);
  });

  it('换个说法问同一件事 → 仍判 repeat', () => {
    const reworded = '你提到计划全废了，晚上刷手机到两点。那会儿刷手机的时候，你在想什么？';
    expect(detectViolations(reworded, { prevReply: prev }).map((f) => f.type))
      .toContain(VIOLATION_TYPES.REPEAT);
  });

  it('正常承接（只复现几个词）不误报', () => {
    const next = '那周四中午，是什么让你决定就此放弃？';
    expect(detectViolations(next, { prevReply: prev }).map((f) => f.type))
      .not.toContain(VIOLATION_TYPES.REPEAT);
  });

  it('不传 prevReply 时不做重复判定（向后兼容）', () => {
    expect(detectViolations(prev).map((f) => f.type)).not.toContain(VIOLATION_TYPES.REPEAT);
  });

  it('重写指令里说明了「换入口」而不是「换个说法」', () => {
    const instruction = buildRewriteInstruction([{ type: VIOLATION_TYPES.REPEAT }]);
    expect(instruction).toContain('从对方最新那句话里挑一个具体词');
    expect(instruction).toContain('不要再问同一件事');
  });
});

describe('输出守门 · 复述对方原话（2026-09-17 实测最主要的退化形态）', () => {
  const userSaid = '上周三晚上我列了特别详细的一周计划，周四中午就全废了，晚上刷手机刷到两点。';

  it('把用户原话整段重排 → 判 parrot，且算硬违规', () => {
    const reply = '上周三晚上你列了特别详细的一周计划，但到了周四中午就全废了，晚上还刷手机刷到两点。这种挫败感对你来说意味着什么？';
    const findings = detectViolations(reply, { prevUserText: userSaid });
    expect(findings.map((f) => f.type)).toContain(VIOLATION_TYPES.PARROT);
    expect(hasHardViolation(findings)).toBe(true);
  });

  it('只提几个词的正常承接 → 不误报复述', () => {
    const reply = '那周四中午，是什么让你决定就此放弃？';
    expect(detectViolations(reply, { prevUserText: userSaid }).map((f) => f.type))
      .not.toContain(VIOLATION_TYPES.PARROT);
  });

  it('相似度对称：长问 vs 短问不再漏检（修掉的方向 bug）', () => {
    const long = '上周三晚上你列了特别详细的一周计划，但到了周四中午就全废了，晚上还刷手机刷到两点。这种计划被打乱后的挫败感，对你来说意味着什么？';
    const short = '这种计划被打乱后的挫败感，对你来说意味着什么？';
    expect(similarity(long, short)).toBeGreaterThan(0.7);
    expect(similarity(short, long)).toBeGreaterThan(0.7);
  });

  it('重写指令要求「删掉复述，用自己的词」', () => {
    const instruction = buildRewriteInstruction([{ type: VIOLATION_TYPES.PARROT }]);
    expect(instruction).toContain('复述');
    expect(instruction).toContain('不要照搬他的原句');
  });
});

describe('输出守门 · 拆句', () => {
  it('只挑出问句', () => {
    const questions = splitQuestions('我听到了。你当时在哪儿？几点了。');
    expect(questions).toEqual(['你当时在哪儿？']);
  });
});
