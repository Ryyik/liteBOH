/**
 * bohai-degenerate-repair.test.js — 锁退化流修复（plans/025 v2 · Step 5-3）
 *
 * 关键口径：
 *   ① 重试稿**非退化** → 用重试稿；**退化或空** → 固定话术「回答出现异常…」；
 *   ② 三步顺序：ensureGroundedReply → cleanAssistantVisibleReply → sanitizeCommunityEvidenceClaims；
 *   ③ 无论成败都 `captureMemoryFromConversation`；`appendPromptSection` 收到 maxChars。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runDegenerateRepair } from '../../src/views/BOHAI/engine/stages/degenerate-repair';

const CHAT_ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';
const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');

const makeDeps = (over = {}) => ({
  appendPromptSection: vi.fn((base) => base),
  callModelInternal: vi.fn(async () => '重试成功'),
  filterThinkingContent: vi.fn((t) => t),
  cleanAssistantVisibleReply: vi.fn((t) => String(t || '').trim()),
  isDegenerateAssistantReply: vi.fn((t) => /^!+$/.test(String(t || ''))),
  ensureGroundedReply: vi.fn((t) => t),
  sanitizeCommunityEvidenceClaims: vi.fn((t) => t),
  updateContent: vi.fn(),
  scrollToBottom: vi.fn(),
  captureMemoryFromConversation: vi.fn(async () => {}),
  ...over,
});

const makeOptions = (over = {}) => ({
  finalPrompt: 'FP',
  maxFinalPromptChars: 9000,
  generationModelId: 'm1',
  systemPromptContent: 'SYS',
  recentMessages: [],
  requestController: new AbortController(),
  generationProfile: {},
  sessionIndex: 0,
  userText: '你好',
  ...over,
});

describe('BOHAI 退化流修复（Step 5-3）', () => {
  it('重试稿非退化 → 三步处理后写入 updateContent', async () => {
    const deps = makeDeps();
    await runDegenerateRepair(deps, makeOptions());
    expect(deps.callModelInternal).toHaveBeenCalled();
    expect(deps.ensureGroundedReply).toHaveBeenCalledWith('重试成功');
    expect(deps.sanitizeCommunityEvidenceClaims).toHaveBeenCalled();
    expect(deps.updateContent).toHaveBeenCalledWith('重试成功');
  });

  it('重试稿仍退化 → 固定话术', async () => {
    const deps = makeDeps({ callModelInternal: vi.fn(async () => '!!!!') });
    await runDegenerateRepair(deps, makeOptions());
    expect(deps.updateContent).toHaveBeenCalledWith(
      expect.stringContaining('回答出现异常，可以切换到'),
    );
  });

  it('重试稿为空 → 固定话术', async () => {
    const deps = makeDeps({ callModelInternal: vi.fn(async () => '   ') });
    await runDegenerateRepair(deps, makeOptions());
    expect(deps.updateContent).toHaveBeenCalledWith(
      expect.stringContaining('回答出现异常，可以切换到'),
    );
  });

  it('无论成败都沉淀记忆；appendPromptSection 收到 maxChars', async () => {
    const deps = makeDeps();
    await runDegenerateRepair(deps, makeOptions());
    expect(deps.captureMemoryFromConversation).toHaveBeenCalledWith(
      expect.objectContaining({ sessionIndex: 0, userText: '你好' }),
    );
    const call = deps.appendPromptSection.mock.calls[0];
    expect(call[0]).toBe('FP');
    expect(call[2]).toBe(9000);
    expect(call[1]).toContain('禁止输出连续重复标点');
  });

  it('壳仍接线：调用两个后处理 stage，且 SSE 回调内层早退**仍在**', () => {
    const code = read(CHAT_ENGINE);
    expect(code).toContain('await runDegenerateRepair(');
    expect(code).toContain('await finalizeAssistantReply(');
    // ⚠️ SSE 回调里另有一处**同名**早退（12 空格缩进）。抽外层 40 行块时按 `trim()` 匹配会误伤它
    //    （实测踩过：把内层 3 行也替换成了 stage 调用）。这条守卫专门钉住它。
    expect(code).toContain('              if (shouldRepairDegenerateStream) {');
  });
});
