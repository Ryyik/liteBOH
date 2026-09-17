import { describe, it, expect } from 'vitest';
import { createBohAIChatSessionSanitizer } from '../../src/utils/bohai-chat-session-store.js';
import { PSYCH_TRACKS, PSYCH_L2_RULES } from '../../src/views/BOHAI/expert-roles/psychologist.js';
import {
  INTERVIEW_LIMITS,
  extractSignals,
  pickEvidence,
  createExpertState,
  recordUserTurn,
  recordAssistantTurn,
  pickL2Rules,
  buildStateBlock,
  buildAnchorBlock,
  shouldWrapUp,
  findTrack
} from '../../src/views/BOHAI/expert-roles/interview-engine.js';

describe('心理访谈引擎 · 计数层', () => {
  it('信号抽取：绝对化 / 应该 / 身体 / 回避 / 时间 / 他人 / 例外', () => {
    expect(extractSignals('反正每次都这样')).toContain('absolute');
    expect(extractSignals('我应该早点睡')).toContain('should');
    expect(extractSignals('胸口有点闷')).toContain('body');
    expect(extractSignals('想不起来了')).toContain('avoid');
    expect(extractSignals('小学的时候我记得')).toContain('timeAnchor');
    expect(extractSignals('我妈当时说')).toContain('others');
    expect(extractSignals('有一次我做海报做到十一点没停')).toContain('exception');
  });

  it('信号抽取：普通回答不硬凑信号', () => {
    expect(extractSignals('今天天气挺好的我出去走了走')).toEqual([]);
  });

  it('原话采集：太短或没有具体信息的不采', () => {
    expect(pickEvidence('嗯')).toBeNull();
    expect(pickEvidence('不知道')).toBeNull();
    expect(pickEvidence('我就觉得整个人挺不对劲的也说不上来')).toBeNull();
  });

  it('原话采集：带具体信息的采下来，超长截断', () => {
    expect(pickEvidence('上周三晚上我列了一周计划，周四中午就全废了')).toContain('上周三');
    const long = pickEvidence('上个月' + '很长的描述'.repeat(40));
    expect(long.length).toBeLessThanOrEqual(INTERVIEW_LIMITS.evidenceMaxChars + 1);
    expect(long.endsWith('…')).toBe(true);
  });

  it('轮次推进：askedCount 递增，短答连击累加与清零', () => {
    let s = createExpertState({ trackId: 'blindspot' });
    expect(s.askedCount).toBe(0);
    s = recordUserTurn(s, '嗯');
    s = recordUserTurn(s, '不知道');
    expect(s.askedCount).toBe(2);
    expect(s.shortReplyStreak).toBe(2);
    s = recordUserTurn(s, '上周三晚上我列了很详细的一周计划，周四中午就全废掉了');
    expect(s.shortReplyStreak).toBe(0);
    expect(s.askedCount).toBe(3);
  });

  it('原话采集有上限，且不重复收录', () => {
    let s = createExpertState();
    const line = '上个月做那个海报我从下午三点做到晚上十一点，中间没有停';
    for (let i = 0; i < INTERVIEW_LIMITS.evidenceMax + 5; i += 1) {
      s = recordUserTurn(s, `${line}（第 ${i} 次）`);
    }
    expect(s.evidence.length).toBe(INTERVIEW_LIMITS.evidenceMax);
    const first = '上周三晚上我列了一周计划，周四中午就全废了';
    let s2 = recordUserTurn(createExpertState(), first);
    s2 = recordUserTurn(s2, first);
    expect(s2.evidence).toEqual([first]);
  });

  it('深度：意义类追问累加，反映性倾听归零并记小结点', () => {
    let s = createExpertState();
    s = recordUserTurn(s, '说明我可能就是那种只会想不会做的人');
    s = recordAssistantTurn(s, '那如果这是真的，对你来说意味着什么？');
    expect(s.ladderingDepth).toBe(1);
    s = recordAssistantTurn(s, '那说明你其实是个什么样的人？');
    expect(s.ladderingDepth).toBe(2);
    const askedBefore = s.askedCount;
    s = recordAssistantTurn(s, '我听到两件事：一是……二是……我理解得对吗？');
    expect(s.ladderingDepth).toBe(0);
    expect(s.lastSummaryAt).toBe(askedBefore);
  });

  it('纯函数：不改动传入的 state', () => {
    const s = createExpertState();
    const snapshot = JSON.stringify(s);
    recordUserTurn(s, '上周三我列了计划，周四废了');
    recordAssistantTurn(s, '那对你来说意味着什么？');
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('心理访谈引擎 · L2 情景规则选取', () => {
  const base = () => createExpertState();

  it('深度到 2 → 注入「禁止再追问」', () => {
    const s = { ...base(), askedCount: 6, ladderingDepth: 2 };
    expect(pickL2Rules(s)).toContain(PSYCH_L2_RULES.laddering);
  });

  it('距上次小结满 4 轮 → 注入小结指令', () => {
    const s = { ...base(), askedCount: 5, lastSummaryAt: 1 };
    expect(pickL2Rules(s)).toContain(PSYCH_L2_RULES.summary);
  });

  it('连续短答 → 注入「把问题换小」', () => {
    const s = { ...base(), askedCount: 3, shortReplyStreak: 2 };
    expect(pickL2Rules(s)).toContain(PSYCH_L2_RULES.shorten);
  });

  it('最多注入 2 条，且按优先级截断（深度 > 小结 > 换小 > 收尾）', () => {
    const s = { ...base(), askedCount: 16, lastSummaryAt: 10, ladderingDepth: 2, shortReplyStreak: 3 };
    const rules = pickL2Rules(s);
    expect(rules.length).toBe(2);
    expect(rules[0]).toBe(PSYCH_L2_RULES.laddering);
    expect(rules[1]).toBe(PSYCH_L2_RULES.summary);
  });

  it('状态干净时不注入任何 L2', () => {
    expect(pickL2Rules(base())).toEqual([]);
  });
});

describe('心理访谈引擎 · 注入文本', () => {
  it('状态块带轨道名 / 轮次 / 覆盖面清单 / 深度 / 原话', () => {
    let s = createExpertState({ trackId: 'blindspot' });
    s = recordUserTurn(s, '上周三晚上我列了一周计划，周四中午就全废了');
    const block = buildStateBlock(s, findTrack('blindspot'));
    expect(block).toContain('<interview_state>');
    expect(block).toContain('盲点发现');
    expect(block).toContain('第 2 轮');
    expect(block).toContain('自我描述');
    expect(block).toContain(`向下追问深度：0 / ${INTERVIEW_LIMITS.ladderingMax}`);
    expect(block).toContain('上周三');
    expect(block).toContain('</interview_state>');
  });

  it('状态块长度可控（不随证据无限膨胀）', () => {
    let s = createExpertState();
    for (let i = 0; i < 20; i += 1) {
      s = recordUserTurn(s, `上个月第 ${i} 次做海报我从下午三点做到晚上十一点，中间没有停过一下`);
    }
    expect(buildStateBlock(s).length).toBeLessThan(700);
  });

  it('锚定块三要素：唯一动作 / 当前状态 / 本轮必须', () => {
    const s = { ...createExpertState({ trackId: 'pattern' }), askedCount: 9, ladderingDepth: 2 };
    const anchor = buildAnchorBlock(s, findTrack('pattern'));
    expect(anchor).toContain('【本轮唯一动作】');
    expect(anchor).toContain('只问一个问题');
    expect(anchor).toContain('【当前状态】');
    expect(anchor).toContain('第 10 轮');
    expect(anchor).toContain('【本轮必须】');
  });

  it('收尾判定：轮次够且原话够，或到了硬上限', () => {
    expect(shouldWrapUp({ askedCount: 14, evidence: ['a', 'b', 'c'] })).toBe(true);
    expect(shouldWrapUp({ askedCount: 14, evidence: ['a'] })).toBe(false);
    expect(shouldWrapUp({ askedCount: 18, evidence: [] })).toBe(true);
    expect(shouldWrapUp({ askedCount: 5, evidence: ['a', 'b', 'c'] })).toBe(false);
  });

  it('轨道定义完整：7 条，含 6 探索 + 1 汇总', () => {
    expect(PSYCH_TRACKS.length).toBe(7);
    expect(PSYCH_TRACKS.filter((t) => t.summary).length).toBe(1);
    PSYCH_TRACKS.forEach((t) => {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(Array.isArray(t.coverage)).toBe(true);
      expect(t.coverage.length).toBeGreaterThan(0);
    });
  });
});

describe('会话白名单 · expertState 必须能活下来', () => {
  const sanitize = createBohAIChatSessionSanitizer();

  it('expertState 经过 sanitizer 后保留', () => {
    const out = sanitize({
      title: '访谈',
      messages: [],
      expertState: { roleId: 'psychologist', trackId: 'blindspot', askedCount: '7', evidence: ['a', 'b'] }
    });
    expect(out.expertState).toBeTruthy();
    expect(out.expertState.askedCount).toBe(7);
    expect(out.expertState.trackId).toBe('blindspot');
    expect(out.expertState.evidence).toEqual(['a', 'b']);
  });

  it('未列入白名单的键被丢掉，非法值被净化', () => {
    const out = sanitize({
      messages: [],
      expertState: { askedCount: -5, ladderingDepth: 'x', evidence: ['a', '', null], junk: 'should-drop' }
    });
    expect(out.expertState.askedCount).toBe(0);
    expect(out.expertState.ladderingDepth).toBe(0);
    expect(out.expertState.evidence).toEqual(['a']);
    expect(out.expertState.junk).toBeUndefined();
  });

  it('没有 expertState 时为 null，不伪造', () => {
    expect(sanitize({ messages: [] }).expertState).toBeNull();
  });

  it('幂等：重复 sanitize 结果稳定（刷新不重置进度）', () => {
    const once = sanitize({
      messages: [],
      expertState: { trackId: 'trigger', askedCount: 9, ladderingDepth: 1, evidence: ['上周三我列了计划，周四全废'] }
    });
    const twice = sanitize(once);
    expect(twice.expertState).toEqual(once.expertState);
    expect(twice.expertState.askedCount).toBe(9);
  });
});
