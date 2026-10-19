/**
 * bohai-grounding-verify.test.js — 锁答案级依据校验（2026-10-19）
 *
 * 背景：`ensureGroundedReply` 只在零引用时加免责声明；只要出现任意 `[K1]` 就放行。
 * 本测试锁三条：
 *   ① 不存在的引用编号必须被摘掉；
 *   ② 引用存在但句子与证据无关（住北京 vs 杭州）必须记为 unsupported；
 *   ③ 没引用但含硬事实（年份/数字/人物名）必须记为 unsupported。
 */
import { describe, expect, it } from 'vitest';
import {
  buildEvidenceMap,
  containsHardFact,
  scoreSentenceSupport,
  splitAnswerSentences,
  validateAnswerGrounding,
} from '../../src/utils/grounding-verify.js';

const ENTITY_ALIASES = ['一二', '翼儿', '胡俊杰'];

describe('证据映射（buildEvidenceMap）', () => {
  it('解析 [K1]/[K2] 块，忽略普通 [1]', () => {
    const map = buildEvidenceMap(
      ['[K1] 时间: 2024\n内容: 一二是一名 B 站 UP 主。', '[K2] 内容: 小牛喜欢联机。'].join('\n\n'),
    );
    expect(map.K1).toContain('B 站 UP 主');
    expect(map.K2).toContain('小牛');
    expect(map.K3).toBeUndefined();
  });

  it('解析联网 <result ref="W1"> 上下文（否则 [W1] 会被误判成无依据）', () => {
    const map = buildEvidenceMap(
      '<search_results>\n<result index="1" ref="W1" title="天气" url="https://example.com">杭州今天下雨</result>\n</search_results>',
    );
    expect(map.W1).toContain('杭州今天下雨');
  });
});

describe('逐句支持度（scoreSentenceSupport）', () => {
  it('同义改写但词根重合 → 支持', () => {
    const score = scoreSentenceSupport(
      '他是一名B站UP主。',
      '一二（翼儿），B站UP主，频道以《我的世界》内容为主。',
      ENTITY_ALIASES,
    );
    expect(score.supported).toBe(true);
  });

  it('人名相同但属性不同（住北京 vs 杭州）→ 不支持', () => {
    const score = scoreSentenceSupport(
      '一二住在北京。',
      '一二，浙江杭州人，在温州读大学。',
      ENTITY_ALIASES,
    );
    expect(score.supported).toBe(false);
  });
});

describe('整段校验（validateAnswerGrounding）', () => {
  it('有引用且证据支持 → 原样保留、不追加说明', () => {
    const result = validateAnswerGrounding('他是一名B站UP主。[K1]', {
      evidenceMap: { K1: '一二（翼儿），B站UP主，频道以《我的世界》内容为主。' },
      availableRefs: ['K1'],
      entityAliases: ENTITY_ALIASES,
      enforce: true,
    });
    expect(result.report.unsupportedCount).toBe(0);
    expect(result.text).toContain('[K1]');
    expect(result.text).not.toContain('未在检索资料中找到直接依据');
  });

  it('引用存在但张冠李戴 → 记 unsupported + 统一说明', () => {
    const result = validateAnswerGrounding('一二住在北京。[K1]', {
      evidenceMap: { K1: '一二，浙江杭州人，在温州读大学。' },
      availableRefs: ['K1'],
      entityAliases: ENTITY_ALIASES,
      enforce: true,
    });
    expect(result.report.unsupportedCount).toBe(1);
    expect(result.report.unsupported[0].refs).toEqual(['K1']);
    expect(result.text).toContain('1 处内容未在检索资料中找到直接依据');
  });

  it('不存在的引用编号被摘掉并记入 unknownRefs', () => {
    const result = validateAnswerGrounding('结论是这样。[K9]', {
      evidenceMap: { K1: '证据' },
      availableRefs: ['K1'],
      enforce: false,
    });
    expect(result.text).toBe('结论是这样。');
    expect(result.report.unknownRefs).toContain('K9');
  });

  it('没引用但含硬事实（年份）→ unsupported', () => {
    const result = validateAnswerGrounding('一二出生于 2005 年。', {
      evidenceMap: {},
      availableRefs: ['K1'],
      entityAliases: ENTITY_ALIASES,
      enforce: true,
    });
    expect(result.report.unsupportedCount).toBe(1);
  });

  it('没引用、也没有硬事实的泛化句 → 不误伤', () => {
    const result = validateAnswerGrounding('总的来说，他很有组织能力。', {
      evidenceMap: {},
      availableRefs: ['K1'],
      entityAliases: ENTITY_ALIASES,
      enforce: true,
    });
    expect(result.report.unsupportedCount).toBe(0);
  });

  it('enforce=false 只做引用清理，不做支持度判断', () => {
    const result = validateAnswerGrounding('一二住在北京。[K1]', {
      evidenceMap: { K1: '一二，浙江杭州人。' },
      availableRefs: ['K1'],
      entityAliases: ENTITY_ALIASES,
      enforce: false,
    });
    expect(result.report.unsupportedCount).toBe(0);
    expect(result.text).toContain('[K1]');
  });
});

describe('辅助函数', () => {
  it('splitAnswerSentences 按中英文句号/问号/换行切分', () => {
    expect(splitAnswerSentences('第一句。第二句！第三句？\n第四句')).toEqual([
      '第一句。',
      '第二句！',
      '第三句？',
      '第四句',
    ]);
  });

  it('containsHardFact 覆盖年份/数字/人物名，且不误判歧义别名', () => {
    expect(containsHardFact('2024 年加入')).toBe(true);
    expect(containsHardFact('他加入了方块之家')).toBe(true);
    expect(containsHardFact('他很有想法')).toBe(false);
    expect(containsHardFact('一二线城市有哪些')).toBe(false);
  });
});
