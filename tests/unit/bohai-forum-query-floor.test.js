/**
 * bohai-forum-query-floor.test.js — 论坛检索的两道闸（2026-11-12）
 *
 * 用户报障：问「End 是谁」（End 是站内成员，库里明明有「成员档案：End」
 * 与「方块之家群聊人物志 / 叫我End～喵～」），BOHAI 却回「知识库里没找到与 end
 * 相关的条目」，并罗列 3 条完全无关的内容。
 *
 * 抓包实证（真实浏览器，拿到的 system prompt）：
 *   检索词：End 是谁 End 叫我End～喵～ / end 是谁 叫我 / end / 是谁 / 叫我
 *   输出约束：必须严格按 [F1] 到 [F5] 的顺序总结……   ← 问「End 是谁」也在命令它总结帖子
 *   [F1]…[F5] 全是日常帖，没有一条提到 End
 *   [K1] 方块之家群聊人物志…End是即将高考的广西群友   ← 答案其实就在 prompt 里
 *
 * 两个根因（本文件各锁一半）：
 *   1. 关键词回退把问法切成了「是谁」「叫我」这种通用词 → 抓回无关帖；
 *   2. `getForumSortModeFromQuery` 对**任何**问题都返回 'latest'（ALLOWED_SORT_MODE
 *      只有 latest/hottest，没有相关性档）⇒ 上层用 `sortMode === 'latest'` 判断
 *      「是否在问最新」恒成立 ⇒「必须按 F1..Fn 顺序总结」的硬约束恒注入，
 *      且 2026-10-08 那次「宁缺毋滥」收紧成了死代码。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QUERY_STOPWORDS, extractQueryKeywords } from '../../src/views/BOHAI/utils/text/keywords';
import {
  buildForumSearchQueries,
  forumQueryHasAnyHit,
  getForumSortModeFromQuery,
  isForumLatestQuery,
} from '../../src/views/BOHAI/composables/useForumSummary';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const post = (title, content, extra = {}) => ({
  title,
  body: content,
  author_username: 'Ryyik',
  tag: 'daily',
  tagLabel: '日常',
  created_at: '2026-11-05T10:36:47Z',
  ...extra,
});

describe('问法词不该进检索词（关键词回退）', () => {
  it('「End 是谁」只留 end，不留「是谁」', () => {
    const keywords = extractQueryKeywords('End 是谁');
    expect(keywords).toContain('end');
    expect(keywords).not.toContain('是谁');
  });

  it('实体别名里的「叫我」不会从 2-gram 展开泄漏回来', () => {
    // 「叫我End～喵～」长度 ≥4 会走 2-gram 展开，若不二次过滤就会产出「叫我」
    const keywords = extractQueryKeywords('End 叫我End～喵～');
    expect(keywords).not.toContain('叫我');
    expect(keywords).toContain('end');
  });

  it('停用表里的词一个都不出现在检索词里', () => {
    const keywords = extractQueryKeywords('请问一下这是谁 为什么 哪个');
    keywords.forEach((keyword) => {
      expect(QUERY_STOPWORDS.has(keyword)).toBe(false);
    });
  });

  it('buildForumSearchQueries 的**关键词候选**不再产出通用问法片段', () => {
    const query = 'End 是谁 End 叫我End～喵～';
    // 第一个候选是用户原话（保留整句做精确匹配，本身不会命中任何帖子），
    // 只检查由关键词拼出来的候选 —— 那才是噪声来源。
    const [, ...keywordCandidates] = buildForumSearchQueries(query);
    const joined = keywordCandidates.join(' / ');
    expect(joined).toContain('end');
    expect(joined).not.toContain('是谁');
    expect(joined).not.toContain('叫我');
  });
});

describe('「是否真的在问最新」不能拿 sortMode 代替', () => {
  it('回归前提：getForumSortModeFromQuery 对任何问题都返回 latest（这就是坑本身）', () => {
    // 这条断言是**故意锁住现状**的：它说明「sortMode === latest」不能当作
    // 「是否在问最新」的判据。哪天这个函数真的支持相关性了，这条会红，
    // 那时才可以把上层改回用 sortMode。
    expect(getForumSortModeFromQuery('End 是谁')).toBe('latest');
    expect(getForumSortModeFromQuery('随便问点什么')).toBe('latest');
  });

  it('时间语义才算「问最新」', () => {
    expect(isForumLatestQuery('最近有什么新帖')).toBe(true);
    expect(isForumLatestQuery('今天大家发了什么')).toBe(true);
    expect(isForumLatestQuery('End 是谁')).toBe(false);
    expect(isForumLatestQuery('Beta7 滤镜怎么用')).toBe(false);
  });
});

describe('论坛相关性地板', () => {
  const relevant = [post('成员档案讨论', 'End 是我们群的老成员')];
  const irrelevant = [
    post('分享最近', '还有三十多天考六级'),
    post('介绍BOH Beta7新功能', '我们提供了多种胶片模拟色调'),
    post('晚课下课了', '新搞了一台 iPadMini'),
  ];

  it('一条都没命中 ⇒ false（该整块不注入）', () => {
    expect(forumQueryHasAnyHit(irrelevant, 'End 是谁')).toBe(false);
  });

  it('有一条命中 ⇒ true', () => {
    expect(forumQueryHasAnyHit([...irrelevant, ...relevant], 'End 是谁')).toBe(true);
  });

  it('空数组 / 无关键词 ⇒ false（不因为「没有关键词」就放行）', () => {
    expect(forumQueryHasAnyHit([], 'End 是谁')).toBe(false);
    expect(forumQueryHasAnyHit(irrelevant, '是谁')).toBe(false);
  });

  it('英文关键词按词边界判命中：weekend / friend 不算命中 end', () => {
    const decoys = [
      post('周末安排', '这 weekend 打算去爬山'),
      post('友情', 'my friend is nice'),
      post('发送', '稍后 send 给你'),
    ];
    expect(forumQueryHasAnyHit(decoys, 'End 是谁')).toBe(false);
  });

  it('紧贴中文的 End 仍算命中（群里就是这么写的）', () => {
    expect(forumQueryHasAnyHit([post('社区梗', '打 LOL 一直坑End，笑死')], 'End 是谁')).toBe(true);
  });
});

describe('接线守卫（纯函数测试看不见「有没有真的接上」）', () => {
  const retrieval = read('src/views/BOHAI/composables/useKnowledgeRetrieval.js');

  it('getForumContext 必须用最新判据，不许再拿 sortMode === latest 顶替', () => {
    expect(retrieval).toContain('isForumLatestQuery(queryText)');
    // 精确锁住被替换掉的那两处旧写法。注意：`sortMode === 'latest'` 本身在别处有
    // 合法用途（决定按时间排序），所以不能做全局禁用断言。
    expect(retrieval).not.toContain("latestSummaryMode || sortMode === 'latest'");
    expect(retrieval).not.toContain(
      "latestSummaryMode || sortMode === 'latest' || Boolean(tagFilter)",
    );
  });

  it('补位与「必须按 F1..Fn 总结」都要挂在 latestIntent 上', () => {
    expect(retrieval).toMatch(/allowBroadFallback\s*=\s*[\s\S]{0,120}latestIntent/);
    expect(retrieval).toMatch(/\$\{latestIntent \? `\\n输出约束/);
  });

  it('非最新提问要过相关性地板', () => {
    expect(retrieval).toMatch(/!latestIntent && !forumQueryHasAnyHit\(/);
  });
});
