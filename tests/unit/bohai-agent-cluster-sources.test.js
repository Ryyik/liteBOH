import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api/treehole-api.js', () => ({
  searchBohAIKnowledgeForAI: vi.fn(),
  searchSharedAIMemoriesForAI: vi.fn(),
}));

vi.mock('../../src/utils/api/boh-cloud-api.js', () => ({
  getMyCloudEntriesForAI: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  searchBohAIKnowledgeForAI,
  searchSharedAIMemoriesForAI,
} from '../../src/utils/api/treehole-api.js';
import { getMyCloudEntriesForAI } from '../../src/utils/api/boh-cloud-api.js';
import { useAgentClusterSources } from '../../src/views/BOHAI/composables/useAgentClusterSources.js';

// 开关口径与主链路 useKnowledgeRetrieval 一致：
// 个人记忆管 cloud_entry/core_memory，社区知识管 shared_memory，两个都关则不发起向量检索。
const makeDeps = ({ treehole = false, shared = false, userId = '' } = {}) => ({
  isTreeholeMemoryEnabled: { value: treehole },
  isSharedMemoryEnabled: { value: shared },
  getUserId: () => userId,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAgentClusterSources.invokeRetriever', () => {
  it('两个知识开关都关时不发起向量检索', async () => {
    const { invokeRetriever } = useAgentClusterSources(makeDeps());

    const result = await invokeRetriever({ query: '什么是 BOH' });

    expect(searchBohAIKnowledgeForAI).not.toHaveBeenCalled();
    expect(result.evidence).toEqual([]);
  });

  it('开启个人记忆时检索 cloud_entry 与 core_memory，并把 chunks 适配成 evidence', async () => {
    searchBohAIKnowledgeForAI.mockResolvedValue({
      ok: true,
      data: {
        chunks: [{ content: 'Cloud+ 条目内容', source_type: 'cloud_entry', similarity: 0.82 }],
      },
    });
    const { invokeRetriever } = useAgentClusterSources(makeDeps({ treehole: true }));

    const result = await invokeRetriever({ query: '我写过什么' });

    expect(searchBohAIKnowledgeForAI).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '我写过什么',
        sourceTypes: ['cloud_entry', 'core_memory'],
      }),
    );
    expect(result.evidence).toEqual([
      expect.objectContaining({ text: 'Cloud+ 条目内容', source: 'cloud_entry', confidence: 0.82 }),
    ]);
    expect(result.context).toContain('Cloud+ 条目内容');
  });

  it('开启社区知识时追加 shared_memory 源', async () => {
    searchBohAIKnowledgeForAI.mockResolvedValue({ ok: true, data: { chunks: [] } });
    const { invokeRetriever } = useAgentClusterSources(makeDeps({ shared: true }));

    await invokeRetriever({ query: '社区里大家怎么用' });

    expect(searchBohAIKnowledgeForAI).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTypes: ['shared_memory'] }),
    );
  });

  it('检索失败时返回空 evidence 且不抛错', async () => {
    searchBohAIKnowledgeForAI.mockResolvedValue({ ok: false, error: { message: '超时' } });
    const { invokeRetriever } = useAgentClusterSources(makeDeps({ treehole: true }));

    const result = await invokeRetriever({ query: '任意问题' });

    expect(result.evidence).toEqual([]);
    expect(result.error).toEqual({ message: '超时' });
  });
});

describe('useAgentClusterSources.invokeSharedMemory', () => {
  it('社区知识开关关闭时不调用', async () => {
    const { invokeSharedMemory } = useAgentClusterSources(makeDeps());

    await invokeSharedMemory({ query: '公共记忆' });

    expect(searchSharedAIMemoriesForAI).not.toHaveBeenCalled();
  });

  it('开启时把公共记忆行适配成 evidence', async () => {
    searchSharedAIMemoriesForAI.mockResolvedValue({
      ok: true,
      data: [{ content: '大家普遍反映签到积分周日刷新' }],
    });
    const { invokeSharedMemory } = useAgentClusterSources(makeDeps({ shared: true }));

    const result = await invokeSharedMemory({ query: '签到积分' });

    expect(searchSharedAIMemoriesForAI).toHaveBeenCalledWith(
      expect.objectContaining({ query: '签到积分', limit: 8 }),
    );
    expect(result.evidence).toEqual([
      expect.objectContaining({ text: '大家普遍反映签到积分周日刷新', source: 'AI 公共记忆' }),
    ]);
  });
});

describe('useAgentClusterSources.invokeCloud', () => {
  it('无 userId 时不调用', async () => {
    const { invokeCloud } = useAgentClusterSources(makeDeps({ treehole: true }));

    await invokeCloud({ userId: '' });

    expect(getMyCloudEntriesForAI).not.toHaveBeenCalled();
  });

  it('个人记忆开关关闭时不调用', async () => {
    const { invokeCloud } = useAgentClusterSources(makeDeps({ userId: 'u-1' }));

    await invokeCloud({ userId: 'u-1' });

    expect(getMyCloudEntriesForAI).not.toHaveBeenCalled();
  });

  it('有 userId 且开关开启时拉取 Cloud+，最多截取 10 条', async () => {
    const rows = Array.from({ length: 12 }, (_item, index) => ({ content: `第 ${index + 1} 条` }));
    getMyCloudEntriesForAI.mockResolvedValue({ ok: true, data: rows });
    const { invokeCloud } = useAgentClusterSources(makeDeps({ treehole: true, userId: 'u-1' }));

    const result = await invokeCloud({ userId: 'u-1' });

    expect(getMyCloudEntriesForAI).toHaveBeenCalledWith('u-1', { limit: 40 });
    expect(result.evidence).toHaveLength(10);
    expect(result.evidence[0]).toEqual(
      expect.objectContaining({ text: '第 1 条', source: 'BOH Cloud+' }),
    );
  });
});
