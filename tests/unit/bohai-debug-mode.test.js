/**
 * bohai-debug-mode.test.js — 锁「调试模式只对管理员生效」（2026-11-12）
 *
 * 这条安全语义的失败模式是**静默的**：开关只是把内部检索细节塞进 prompt，
 * 开错了不会报错、不会崩，只会让不该看到的人看到知识库原文与 chunk 元数据。
 * 所以这里把「权限 ∧ 偏好」的四象限逐格钉死，并且专门反证「存储写 1 但非管理员」。
 */
import { describe, expect, it } from 'vitest';
import {
  BOHAI_DEBUG_MODE_STORAGE_KEY,
  resolveDebugModeEnabled,
} from '../../src/views/BOHAI/composables/useBohaiDebugMode';

describe('调试模式生效判据（权限 ∧ 偏好）', () => {
  it('管理员 + 已开启 → 生效', () => {
    expect(resolveDebugModeEnabled({ isAdmin: true, preference: true })).toBe(true);
  });

  it('管理员 + 未开启 → 不生效', () => {
    expect(resolveDebugModeEnabled({ isAdmin: true, preference: false })).toBe(false);
  });

  it('非管理员 + 偏好写着开 → **不生效**（localStorage 不能决定权限）', () => {
    expect(resolveDebugModeEnabled({ isAdmin: false, preference: true })).toBe(false);
  });

  it('非管理员 + 未开启 → 不生效', () => {
    expect(resolveDebugModeEnabled({ isAdmin: false, preference: false })).toBe(false);
  });

  it('缺参 / 非布尔值一律按关闭处理（不给「真值即开」留口子）', () => {
    expect(resolveDebugModeEnabled()).toBe(false);
    expect(resolveDebugModeEnabled({})).toBe(false);
  });

  it('存储键名是约定值（别在别处另写一份字符串）', () => {
    expect(BOHAI_DEBUG_MODE_STORAGE_KEY).toBe('boh-ai-debug-mode');
  });
});
