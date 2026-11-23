import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api/api-key-runtime-api.js', () => ({
  callVaultSiliconChat: vi.fn(),
}));
vi.mock('../../src/utils/supabase-client.js', () => ({ supabase: { from: vi.fn() } }));

import { callVaultSiliconChat } from '../../src/utils/api/api-key-runtime-api.js';
import { extractMemoryCandidatesFromDialogue } from '../../src/utils/api/treehole/treehole-space-api.js';
import { BOH_MEMORY_MODE_ID } from '../../src/utils/bolek-constants.js';

// =====================================================================
// 记忆抽取的模型口径守卫（2026-11-17）
//
//   背景：`api-key-vault` 的 runtime-chat 在 `mode` 为空时会 `|| 'fast'` 兜底。
//   记忆抽取此前正是「不带 mode」⇒ 实际跑的是 fast 行（GLM-4-9B），而且**改不动**：
//   想换模型必须动 fast，可 fast 同时是游客默认模式 + 周报/文档排版/PPT 的后台绑定行。
//   现在改成显式指定 BOH_MEMORY_MODE_ID（internal-memory，魔搭 DeepSeek）。
//
//   反证（2026-11-17 实测）：把 `extractMemoryCandidatesFromDialogue` 的 `mode` 默认值改回
//        `''` ⇒ 第 1 条必红（Expected "internal-memory" / Received ""）。
//        ⚠️ 别只改 `requestTreeholeCompletion` 的默认值 —— 抽取对它是**显式透传**，
//        改那一处测不出来（实测仍是绿），能救场的是调用点这一处默认值。
// =====================================================================

/** 一个能通过 buildDialogueContextForMemoryCapture 的最短对话（必须有 user 轮）。 */
const dialogue = [
  { role: 'user', content: '我在上海工作，长期目标是攒钱买一台相机，平时喜欢喝美式。' },
  { role: 'assistant', content: '记下了。' },
];

const stubReply = (content = '{"candidates":[]}') => ({
  ok: true,
  data: { choices: [{ message: { content } }], model: 'stub' },
});

beforeEach(() => {
  vi.clearAllMocks();
  callVaultSiliconChat.mockResolvedValue(stubReply());
});

describe('记忆抽取必须显式指定模型模式', () => {
  it('默认带 BOH_MEMORY_MODE_ID —— 空 mode 会被 EF 兜底到 fast（游客/周报共用那行）', async () => {
    await extractMemoryCandidatesFromDialogue({ messages: dialogue });

    expect(callVaultSiliconChat).toHaveBeenCalledTimes(1);
    const arg = callVaultSiliconChat.mock.calls[0][0];
    expect(arg.mode).toBe(BOH_MEMORY_MODE_ID);
    expect(arg.mode).not.toBe('');
    // purpose 仍是 chat：记忆抽取走普通对话通道，不是 moderation 那条白名单通道
    expect(arg.purpose).toBe('chat');
  });

  it('mode 可被显式覆盖：换模型只改调用参数，不改函数体', async () => {
    await extractMemoryCandidatesFromDialogue({ messages: dialogue, mode: 'deepseek' });

    expect(callVaultSiliconChat.mock.calls[0][0].mode).toBe('deepseek');
  });
});
