import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchVaultTavily: vi.fn(),
  searchVaultFree: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/api/api-key-runtime-api.js', () => ({
  searchVaultTavily: mocks.searchVaultTavily,
  searchVaultFree: mocks.searchVaultFree,
}));

vi.mock('@/utils/logger.js', () => ({ logger: mocks.logger }));

import {
  resetTavilySearchAvailability,
  searchWebForPrompt,
} from '../../src/views/BOHAI/composables/bohai-engine-helpers.js';

const okResult = (answer = '答案') => ({
  ok: true,
  status: 200,
  data: { results: [{ title: '标题', url: 'https://example.com', content: '内容' }], answer },
  error: null,
});

const failResult = (message, code = 'API_KEY_RUNTIME_ERROR') => ({
  ok: false,
  status: 502,
  data: null,
  error: { message, code },
});

describe('联网搜索：Tavily 优先 + 免费通道兜底', () => {
  beforeEach(() => {
    mocks.searchVaultTavily.mockReset();
    mocks.searchVaultFree.mockReset();
    mocks.logger.warn.mockReset();
    resetTavilySearchAvailability();
  });

  it('A. Tavily 成功时不再触碰免费通道', async () => {
    mocks.searchVaultTavily.mockResolvedValue(okResult('tavily-answer'));

    const result = await searchWebForPrompt('今天的新闻');

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('tavily');
    expect(result.aiAnswer).toBe('tavily-answer');
    expect(mocks.searchVaultFree).not.toHaveBeenCalled();
  });

  it('B. Tavily 瞬态失败时回落到免费通道，整体仍算成功', async () => {
    mocks.searchVaultTavily.mockResolvedValue(failResult('Tavily 请求失败：502'));
    mocks.searchVaultFree.mockResolvedValue(okResult('free-answer'));

    const result = await searchWebForPrompt('今天有什么新闻');

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('free');
    expect(result.aiAnswer).toBe('free-answer');
    expect(mocks.searchVaultFree).toHaveBeenCalledTimes(1);
  });

  it('C. Tavily 配置类失败只白试一次，之后直接走免费通道', async () => {
    mocks.searchVaultTavily.mockResolvedValue(failResult('未找到该 API Key。'));
    mocks.searchVaultFree.mockResolvedValue(okResult());

    const first = await searchWebForPrompt('问题一');
    const second = await searchWebForPrompt('问题二');

    expect(first.provider).toBe('free');
    expect(second.provider).toBe('free');
    expect(mocks.searchVaultTavily).toHaveBeenCalledTimes(1);
    expect(mocks.searchVaultFree).toHaveBeenCalledTimes(2);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('D. 重置后重新尝试 Tavily（补配 key 的场景）', async () => {
    mocks.searchVaultTavily.mockResolvedValue(failResult('未找到该 API Key。'));
    mocks.searchVaultFree.mockResolvedValue(okResult());
    await searchWebForPrompt('问题一');

    resetTavilySearchAvailability();
    mocks.searchVaultTavily.mockResolvedValue(okResult());
    const result = await searchWebForPrompt('问题二');

    expect(result.provider).toBe('tavily');
    expect(mocks.searchVaultTavily).toHaveBeenCalledTimes(2);
  });

  it('E. 两条通道都失败时返回失败，disabled 由兜底通道判定', async () => {
    mocks.searchVaultTavily.mockResolvedValue(failResult('Tavily 请求失败：500'));
    mocks.searchVaultFree.mockResolvedValue(failResult('搜索服务暂时不可用'));

    const result = await searchWebForPrompt('问题');

    expect(result.ok).toBe(false);
    expect(result.provider).toBeNull();
    expect(result.count).toBe(0);
    expect(result.disabled).toBe(false);
  });

  it('F. 时效词把 days 透传给搜索通道', async () => {
    mocks.searchVaultTavily.mockResolvedValue(okResult());

    await searchWebForPrompt('索尼最近几天发布了什么相机');
    const { payload } = mocks.searchVaultTavily.mock.calls[0][0];

    expect(payload.days).toBe(7);
    expect(payload.search_depth).toBe('advanced');
    expect(payload.max_results).toBe(5);
    expect(payload.include_answer).toBe(true);
  });

  it('G. 非时效问题不携带 days', async () => {
    mocks.searchVaultTavily.mockResolvedValue(okResult());

    await searchWebForPrompt('如何清洁相机传感器');
    const { payload } = mocks.searchVaultTavily.mock.calls[0][0];

    expect('days' in payload).toBe(false);
  });

  it('H. 两段超时之和不超过 useChatEngine 那层 30s 兜底', async () => {
    mocks.searchVaultTavily.mockResolvedValue(failResult('Tavily 请求失败：502'));
    mocks.searchVaultFree.mockResolvedValue(okResult());

    await searchWebForPrompt('问题');

    const tavilyTimeoutMs = mocks.searchVaultTavily.mock.calls[0][0].timeoutMs;
    const freeTimeoutMs = mocks.searchVaultFree.mock.calls[0][0].timeoutMs;

    expect(tavilyTimeoutMs).toBeGreaterThan(0);
    expect(freeTimeoutMs).toBeGreaterThan(0);
    expect(tavilyTimeoutMs + freeTimeoutMs).toBeLessThan(30_000);
  });

  it('I. 外层已中断时不再发起兜底请求', async () => {
    const controller = new AbortController();
    mocks.searchVaultTavily.mockImplementation(async () => {
      controller.abort();
      return failResult('API Key 代理服务调用超时', 'API_KEY_RUNTIME_TIMEOUT');
    });

    const result = await searchWebForPrompt('问题', controller.signal);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('联网搜索已取消');
    expect(mocks.searchVaultFree).not.toHaveBeenCalled();
  });
});
