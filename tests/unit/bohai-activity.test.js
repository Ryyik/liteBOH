import { describe, expect, it } from 'vitest';
import {
  BOH_ACTIVITY_LABELS,
  BOH_ACTIVITY_SURFACE,
  canExpandActivity,
  formatCommunityActivityLine,
  pickCommunityPostTitle,
  resolveActivityLine,
  resolveBohActivityStage,
  shouldRevealWebTitle,
} from '@/views/BOHAI/BOHAI/components/boh-activity.js';

/**
 * 活动行唯一真源（2026-10-19）。
 *
 * 这些断言锁的是**用户口径**，不是实现细节：
 *   「正在思考 / 连接社区记忆 / 联网搜索是同样的光效闪动切换，始终显示一个动作」
 * ⇒ 任何输入组合下，`resolveBohActivityStage` 只能返回**一个**阶段；
 *   空闲时返回 ''（整行不渲染）。
 */
describe('BOH 活动行：唯一真源', () => {
  it('闲时不返回任何阶段（整行不渲染）', () => {
    expect(resolveBohActivityStage({})).toBe('');
    expect(resolveBohActivityStage({ isThinking: false, isLoading: false })).toBe('');
  });

  it('网页搜索在途 → 只显示「网页搜索」（其余状态一律让位）', () => {
    expect(
      resolveBohActivityStage({
        isThinking: true,
        isLoading: true,
        webSearchActive: true,
        webSearchResultCount: 3,
        communitySearchActive: true,
      }),
    ).toBe('web-searching');
  });

  it('⭐ 网页先回、社区还在读 → 「社区」压过网页标题（此刻真正在进行的那一个）', () => {
    expect(
      resolveBohActivityStage({
        isThinking: true,
        isLoading: true,
        webSearchActive: false,
        webSearchResultCount: 3,
        communitySearchActive: true,
      }),
    ).toBe('community');
  });

  it('⭐ 同属「还没开口」的段：先露一拍标题，露过之后进「正在思考」', () => {
    // 这一对是这次改动的核心：只靠优先级排序会让其中一个**整段消失**（实测两种都踩过）。
    const base = {
      isThinking: true,
      isLoading: true,
      webSearchActive: false,
      webSearchResultCount: 3,
      communitySearchActive: false,
    };
    expect(shouldRevealWebTitle({ webSearchResultCount: 3, revealCount: 0 })).toBe(true);
    expect(resolveBohActivityStage({ ...base, webTitleRevealed: false })).toBe('web-results');
    expect(resolveBohActivityStage({ ...base, webTitleRevealed: true })).toBe('thinking');
    // 露过一次之后不再回到「网页检索」
    expect(shouldRevealWebTitle({ webSearchResultCount: 3, revealCount: 1 })).toBe(false);
    // 没有结果 ⇒ 从来没有「露标题」这一段
    expect(shouldRevealWebTitle({ webSearchResultCount: 0, revealCount: 0 })).toBe(false);
  });

  it('社区检索在途、网页侧没结果 → 「社区」优先于「正在思考」', () => {
    expect(
      resolveBohActivityStage({
        isThinking: true,
        isLoading: true,
        webSearchActive: false,
        webSearchResultCount: 0,
        communitySearchActive: true,
      }),
    ).toBe('community');
  });

  it('仅模型思考 → 「正在思考」；进入流式 → 「正在撰写回复」', () => {
    // 没有网页结果时，「还没开口」这一段直接是 thinking（没有「露标题」这一步）
    expect(resolveBohActivityStage({ isThinking: true, isLoading: true })).toBe('thinking');
    expect(resolveBohActivityStage({ isThinking: false, isLoading: true })).toBe('answering');
  });

  it('社区读完即让位：流式期不许再抢行', () => {
    expect(
      resolveBohActivityStage({
        isThinking: false,
        isLoading: true,
        communitySearchActive: false,
      }),
    ).toBe('answering');
  });

  it('所有阶段都有唯一文案与展开面登记（新增阶段不许漏登记）', () => {
    const stages = ['web-searching', 'web-results', 'community', 'thinking', 'answering'];
    for (const stage of stages) {
      expect(BOH_ACTIVITY_LABELS[stage], stage).toBeTruthy();
      expect(Object.hasOwn(BOH_ACTIVITY_SURFACE, stage), stage).toBeTruthy();
    }
    // 只允许这两阶段有展开面 —— 其余点了没反应就不该出箭头
    const expandable = Object.entries(BOH_ACTIVITY_SURFACE)
      .filter(([, surface]) => surface)
      .map(([stage]) => stage)
      .sort();
    expect(expandable).toEqual(['thinking', 'web-results', 'web-searching']);
  });

  it('用户口径：社区一行点名帖子标题「正在读取《标题》」', () => {
    expect(formatCommunityActivityLine('周末线下聚会回顾')).toBe('正在读取《周末线下聚会回顾》');
    // 模型/用户内容里可能自带书名号或换行 —— 归一后只保留一层《》
    expect(formatCommunityActivityLine('《 周末 线下聚会回顾 》')).toBe(
      '正在读取《周末 线下聚会回顾》',
    );
    expect(formatCommunityActivityLine('')).toBe(BOH_ACTIVITY_LABELS.community);
    expect(formatCommunityActivityLine('   ')).toBe(BOH_ACTIVITY_LABELS.community);
    expect(formatCommunityActivityLine(null)).toBe(BOH_ACTIVITY_LABELS.community);
  });

  it('行文案：调用方可覆盖（网页轮换标题 / 思考标题），空覆盖退回阶段默认', () => {
    expect(resolveActivityLine('web-results', '方块之家 BOH 官方发布公告')).toBe(
      '方块之家 BOH 官方发布公告',
    );
    expect(resolveActivityLine('web-results', '')).toBe('网页检索');
    expect(resolveActivityLine('thinking')).toBe('正在思考');
    expect(resolveActivityLine('')).toBe('');
  });

  it('展开能力：只有真有内容时才出箭头', () => {
    expect(canExpandActivity('web-searching', { webPageCount: 0 })).toBe(false);
    expect(canExpandActivity('web-results', { webPageCount: 3 })).toBe(true);
    expect(canExpandActivity('community', { webPageCount: 3, hasReasoning: true })).toBe(false);
    expect(canExpandActivity('thinking', { hasReasoning: true })).toBe(true);
    expect(canExpandActivity('thinking', { hasReasoning: false })).toBe(false);
    expect(canExpandActivity('answering', { hasReasoning: true })).toBe(false);
  });

  it('挑「正在读取的那一篇」：取最新、去空白、无标题的略过', () => {
    expect(
      pickCommunityPostTitle([
        { title: '旧帖', latestAt: '2026-10-01T00:00:00Z' },
        { title: '  新帖   标题 ', latestAt: '2026-10-18T00:00:00Z' },
      ]),
    ).toBe('新帖 标题');
    // 没有日期的排在最后：不惩罚（不丢弃），但不能顶掉有日期的
    expect(
      pickCommunityPostTitle([{ title: '无日期' }, { title: '有日期', latestAt: '2020-01-01' }]),
    ).toBe('有日期');
    expect(pickCommunityPostTitle([{ title: '只有无日期' }])).toBe('只有无日期');
    expect(pickCommunityPostTitle([{ title: '  ' }, { latestAt: '2026-10-01' }])).toBe('');
    expect(pickCommunityPostTitle([])).toBe('');
    expect(pickCommunityPostTitle(null)).toBe('');
  });
});
