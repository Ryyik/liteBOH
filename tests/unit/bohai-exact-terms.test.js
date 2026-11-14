/**
 * bohai-exact-terms.test.js — 字面精确词加权 + 精确词补召回（2026-11-12）
 *
 * 实测依据（真实 EF 调用）：
 *   「2019 年」                    → 大事记：2019 年 排第 1，rs 0.995
 *   「2019 年方块之家发生了什么」  → 该切片**连候选都没进**（返回 24 条里没有）
 *   ⇒ 语义被长问句稀释，关键词兜底也没兜住。字面可判的年份不该交给语义模型去猜。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EXACT_TERM_BOOST,
  chunkMatchesExactTerms,
  extractExactTerms,
  rankChunksByExactTerms,
} from '../../src/views/BOHAI/utils/retrieval/exact-terms';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const chunk = (title, content, rerankScore) => ({ id: title, title, content, rerankScore });

describe('精确词抽取', () => {
  it('抽 4 位年份，并去掉「年」字（正文里是 2019 而不是 2019 年）', () => {
    expect(extractExactTerms('2019 年方块之家发生了什么')).toEqual(['2019']);
  });

  it('抽英文专名 / 型号', () => {
    const terms = extractExactTerms('Beta7 和 Minecraft 有什么关系');
    expect(terms).toEqual(expect.arrayContaining(['Beta7', 'Minecraft']));
  });

  it('纯中文问句抽不到精确词（⇒ 不重排、不补召回）', () => {
    expect(extractExactTerms('End 是谁')).toEqual(['End']);
    expect(extractExactTerms('内战魔咒是什么梗')).toEqual([]);
  });

  it('纯数字不被当成专名（避免把 12345 当型号）', () => {
    expect(extractExactTerms('12345')).toEqual([]);
  });
});

describe('切片命中判定', () => {
  it('标题或正文任一含该词即命中（大小写不敏感）', () => {
    expect(chunkMatchesExactTerms(chunk('大事记：2019 年', '转折'), ['2019'])).toBe(true);
    expect(chunkMatchesExactTerms(chunk('介绍BOH Beta7新功能', ''), ['beta7'])).toBe(true);
    expect(chunkMatchesExactTerms(chunk('无关', '没有那个年份'), ['2019'])).toBe(false);
  });

  it('空词表 ⇒ 不命中（不能因为「没有词」就放行）', () => {
    expect(chunkMatchesExactTerms(chunk('大事记：2019 年', ''), [])).toBe(false);
  });
});

describe('字面精确词重排', () => {
  it('命中的切片被提到第一位（这正是 2019 那条的修法）', () => {
    const chunks = [
      chunk('4周年庆典', '2026-03-18 举办', 0.8),
      chunk('5周年庆典', '2026-03-18 举办', 0.77),
      chunk('大事记：2019 年', '7.21 群解散事件', 0.59),
    ];
    const ranked = rankChunksByExactTerms(chunks, '2019 年方块之家发生了什么');
    expect(ranked[0].title).toBe('大事记：2019 年');
    expect(Number(ranked[0].rerankScore)).toBeCloseTo(0.59 + EXACT_TERM_BOOST, 5);
  });

  it('抽不到精确词 ⇒ 原样返回（同一引用，不重排）', () => {
    const chunks = [chunk('A', '', 0.2), chunk('B', '', 0.9)];
    expect(rankChunksByExactTerms(chunks, '内战魔咒是什么梗')).toBe(chunks);
  });

  it('全部没有 rerankScore（重排整体失败）⇒ 原样返回', () => {
    // 否则会给命中块造 0.32、其余补 0，再被 rerank 地板一次性清空
    const chunks = [chunk('大事记：2019 年', '', undefined), chunk('其它', '', undefined)];
    expect(rankChunksByExactTerms(chunks, '2019 年')).toBe(chunks);
  });

  it('加成后封顶 1，且不改动原对象', () => {
    const source = chunk('大事记：2019 年', '', 0.95);
    const ranked = rankChunksByExactTerms([source], '2019 年');
    expect(Number(ranked[0].rerankScore)).toBe(1);
    expect(source.rerankScore).toBe(0.95);
  });

  it('都没命中时保持原有相对顺序（稳定排序，不引入抖动）', () => {
    const chunks = [chunk('甲', '', 0.5), chunk('乙', '', 0.6), chunk('丙', '', 0.55)];
    const ranked = rankChunksByExactTerms(chunks, 'Minecraft 是什么');
    expect(ranked.map((item) => item.title)).toEqual(['乙', '丙', '甲']);
  });
});

describe('接线守卫（纯函数测试看不见「有没有真的接上」）', () => {
  const retrieval = read('src/views/BOHAI/composables/useKnowledgeRetrieval.js');

  it('getMemoryContext 必须走精确词重排 + 补召回', () => {
    expect(retrieval).toContain('rankChunksByExactTerms(candidates, queryText)');
    expect(retrieval).toContain('chunkMatchesExactTerms(chunk, exactTerms)');
  });

  it('补召回的触发条件必须收紧为「一个精确词都没命中」', () => {
    // 若写成无条件补召回，每个含英文词的提问都会多打一次 EF（延迟白给）
    expect(retrieval).toMatch(
      /exactTerms\.length > 0 && !chunks\.some\(\(chunk\) => chunkMatchesExactTerms\(chunk, exactTerms\)\)/,
    );
  });

  it('候选池必须用 MEMORY_CANDIDATE_COUNT，不许退回写死的 8', () => {
    expect(retrieval).toContain('limit: MEMORY_CANDIDATE_COUNT');
    expect(retrieval).not.toContain('Math.max(MEMORY_MAX_CHUNKS, 8)');
  });
});
