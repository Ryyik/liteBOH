import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api/api-key-runtime-api.js', () => ({
  callVaultSiliconChat: vi.fn(),
}));

import { callVaultSiliconChat } from '../../src/utils/api/api-key-runtime-api.js';
import { callBohAIModel } from '../../src/utils/bohai-model-client.js';

const mockOk = (content = 'ok') => ({ ok: true, data: { choices: [{ message: { content } }] } });

beforeEach(() => {
  vi.clearAllMocks();
  callVaultSiliconChat.mockResolvedValue(mockOk());
});

describe('callBohAIModel provider 识别', () => {
  it('大小写不敏感：GLM-4-Flash 走智谱通道', async () => {
    await callBohAIModel({ model: 'GLM-4-Flash', messages: [] });

    expect(callVaultSiliconChat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'zhipu' }),
    );
  });

  it('小写 glm- 同样走智谱通道', async () => {
    await callBohAIModel({ model: 'glm-4-flash', messages: [] });

    expect(callVaultSiliconChat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'zhipu' }),
    );
  });

  it('非 GLM 模型走 siliconflow 通道', async () => {
    await callBohAIModel({ model: 'deepseek-v3', messages: [] });

    expect(callVaultSiliconChat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'siliconflow' }),
    );
  });
});

describe('callBohAIModel 生成参数默认值', () => {
  it('未显式传 maxTokens 时使用底层默认 1800（此前 512 会截断长回答）', async () => {
    await callBohAIModel({ model: 'deepseek-v3', messages: [] });

    expect(callVaultSiliconChat).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ max_tokens: 1800 }) }),
    );
  });

  it('显式传入的 maxTokens 优先生效', async () => {
    await callBohAIModel({ model: 'deepseek-v3', messages: [], maxTokens: 600 });

    expect(callVaultSiliconChat).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ max_tokens: 600 }) }),
    );
  });
});
