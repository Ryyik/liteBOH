import { describe, expect, it, vi } from 'vitest';

/**
 * 跨表搜索中心（P1-2 反证 + 功能名匹配）。
 *
 * 历史故障（2026-11-11 用户实测「搜广告什么都搜不到」）：
 *   ① 某张表查询报错（如 42883）时只 `logger.warn` 就 `return []`，
 *      面板照样显示「全部表里没有包含「广告」的记录」——
 *      把「查不动」说成「没有」，是最坏的一种撒谎。
 *   ② 页签/功能名从来不参与匹配，只有 `tab:` 前缀能命中，
 *      而用户不可能知道存在这个前缀。
 *
 * 这两个契约都在本文件里用真实 composable 钉住。
 */

const queriedTables = [];

const makeBuilder = (table) => {
  queriedTables.push(table);
  const result =
    table === 'post_reward_campaigns'
      ? { data: null, error: { message: 'operator does not exist: timestamp with time zone ~~*' } }
      : { data: [], error: null };
  const builder = {
    select: () => builder,
    or: () => builder,
    limit: () => builder,
    eq: () => builder,
    ilike: () => builder,
    abortSignal: () => builder,
    then: (resolve) => resolve(result),
  };
  return builder;
};

vi.mock('@/utils/supabase-client.js', () => ({
  supabase: { from: (table) => makeBuilder(table) },
}));

vi.mock('@/utils/logger.js', () => ({
  logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const makeCenter = async (allowedTabIds) => {
  const { createGlobalSearchCenter } =
    await import('@/views/DataManagement/composables/useDataAdminGlobalSearch.js');
  const { ref } = await import('vue');
  const searchQuery = ref('');
  return createGlobalSearchCenter({
    searchQueryRef: searchQuery,
    showToast: () => {},
    buildActionErrorMessage: (error, fallback) => error?.message || fallback,
    switchTab: () => {},
    addRecentRecord: () => {},
    allowedTabIds,
  });
};

describe('跨表搜索：失败必须可见（P1-2）', () => {
  it('某张表查询报错时，收进 globalSearchFailures 而不是静默变空', async () => {
    queriedTables.length = 0;
    const center = await makeCenter();
    await center.runGlobalSearch('广告');

    const failedTabs = center.globalSearchFailures.value.map((item) => item.tabId);
    expect(failedTabs).toContain('postReward');
    // 失败项要能说清是哪张表 + 为什么
    const entry = center.globalSearchFailures.value.find((item) => item.tabId === 'postReward');
    expect(entry.tabLabel).toBeTruthy();
    expect(entry.message).toContain('timestamp');
    // 其它表仍然正常返回（一次失败不能拖垮整次搜索）
    expect(center.isGlobalSearching.value).toBe(false);
  });

  it('收起面板会清掉失败清单，避免下次搜索带着旧故障', async () => {
    const center = await makeCenter();
    await center.runGlobalSearch('广告');
    expect(center.globalSearchFailures.value.length).toBeGreaterThan(0);
    center.closeGlobalSearchPanel();
    expect(center.globalSearchFailures.value).toEqual([]);
  });

  it('只搜当前角色可见的页签', async () => {
    queriedTables.length = 0;
    const center = await makeCenter(['ads']);
    await center.runGlobalSearch('广告');
    expect(queriedTables).toEqual(['advertisements']);
    expect(center.globalSearchTabMatches.value.map((tab) => tab.id)).toEqual(['ads']);
  });
});

describe('跨表搜索：功能名可搜', () => {
  it('搜「广告」能命中「广告管理」页签（而不是只能靠 tab: 前缀）', async () => {
    const center = await makeCenter();
    await center.runGlobalSearch('广告');
    const labels = center.globalSearchTabMatches.value.map((tab) => tab.label);
    expect(labels).toContain('广告管理');
  });

  it('搜「用户」按名称/ id 命中多个功能页签，但有条数上限', async () => {
    const center = await makeCenter();
    await center.runGlobalSearch('管理');
    const matches = center.globalSearchTabMatches.value;
    expect(matches.length).toBeGreaterThan(1);
    expect(matches.length).toBeLessThanOrEqual(6);
  });

  it('空关键词不产生功能候选', async () => {
    const center = await makeCenter();
    await center.runGlobalSearch('   ');
    expect(center.globalSearchTabMatches.value).toEqual([]);
  });

  it('`tab:` 前缀是跳表语义，不开结果面板也不列功能', async () => {
    const center = await makeCenter();
    await center.runGlobalSearch('tab:广告');
    expect(center.showGlobalSearchPanel.value).toBe(false);
  });
});
