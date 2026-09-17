import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(
  resolve(root, 'src/views/user-center/SharedMemoryManagement.vue'),
  'utf8'
);

// 去掉 safePrompt / safeConfirm 两个封装体，剩下的部分不允许再出现裸 dialog 调用
const outsideSafeWrappers = source.replace(
  /const safe(Prompt|Confirm) = async[\s\S]*?\n\};/g,
  ''
);

describe('SharedMemoryManagement global dialog wiring', () => {
  it('instantiates the global confirm dialog that edit/remove depend on', () => {
    // 回归点：这两个函数曾经调用 dialog.prompt / dialog.confirm，但全文件既没有导入
    // 也没有实例化 → 点击后同步抛 ReferenceError，UI 完全无反应（release 报告 N1）。
    expect(source).toContain("import { useConfirmDialog } from '@/composables/useConfirmDialog.js';");
    expect(source).toMatch(/const dialog = useConfirmDialog\(\);/);
  });

  it('declares the dialog instance before the functions that use it', () => {
    const declaration = source.indexOf('const dialog = useConfirmDialog();');
    const firstUse = source.indexOf('dialog.prompt(');
    expect(declaration).toBeGreaterThan(-1);
    expect(firstUse).toBeGreaterThan(declaration);
  });

  it('keeps the edit and delete entry points wired in the template', () => {
    expect(source).toMatch(/@click="editMemory\(item\)"/);
    expect(source).toMatch(/@click="removeMemory\(item\)"/);
  });
});

describe('SharedMemoryManagement dialog mutex handling', () => {
  it('routes every dialog call through a safe wrapper', () => {
    expect(source).toContain('const safePrompt = async (options) => {');
    expect(source).toContain('const safeConfirm = async (options) => {');
    // 封装之外不得出现裸调用：useConfirmDialog 在「弹窗已被占用」时会直接 reject，
    // 裸 await 会冒泡成 unhandledrejection 并让按钮卡死。
    expect(outsideSafeWrappers).not.toMatch(/dialog\.(prompt|confirm|alert|confirmThree)\b/);
  });

  it('only swallows the mutex rejection and lets programming errors bubble', () => {
    // 反证教训：若写成无差别的 `catch { return null; }`，dialog 未定义之类的编程错误
    // 也会被吞掉 —— 用户依旧「点了没反应」，且错误不进监控。必须区分错误类型。
    expect(source).toMatch(/const isDialogBusy = \(err\) => \/already open\/i\.test/);
    expect(source).toMatch(/if \(isDialogBusy\(err\)\) return null;/);
    expect(source).toMatch(/if \(isDialogBusy\(err\)\) return false;/);
    expect(source.match(/throw err;/g) || []).toHaveLength(2);
  });

  it('does not swallow errors with a bare catch clause', () => {
    for (const block of source.match(/const safe(Prompt|Confirm) = async[\s\S]*?\n\};/g) || []) {
      expect(block).not.toMatch(/catch \{/);
    }
  });

  it('uses the safe wrappers in both write paths', () => {
    expect(source).toMatch(/const input = await safePrompt\(\{/);
    expect(source).toMatch(/const confirmed = await safeConfirm\(\{/);
  });
});

describe('SharedMemoryManagement optimistic rollback', () => {
  it('rolls back the optimistic value when the api rejects instead of returning ok:false', () => {
    // 三处写操作（改状态 / 改内容 / 删除）都必须把 await 包进 try/catch，
    // 把 reject 归一化成 { ok: false }，否则乐观值不回滚、按钮也不复位。
    const normalised = source.match(
      /catch \(err\) \{\s*\n\s*result = \{ ok: false, error: err \};/g
    );
    expect(normalised).toHaveLength(3);
  });

  it('resets the running-action flags in a finally block so buttons re-enable', () => {
    const resets = source.match(
      /finally \{\s*\n\s*runningAction\.id = '';\s*\n\s*runningAction\.type = '';/g
    );
    expect(resets).toHaveLength(3);
  });

  it('keeps the restore branches for each failed write', () => {
    expect(source).toContain('item.status = previousStatus;');
    expect(source).toContain('item.content = previousContent;');
    expect(source).toContain('sharedMemories.value = previousMemories;');
  });
});

describe('SharedMemoryManagement deferred refresh tracking', () => {
  it('routes all three write paths through the tracked refresh scheduler', () => {
    expect(source).toMatch(/const scheduleRefresh = \(\) => \{/);
    expect(source.match(/scheduleRefresh\(\);/g) || []).toHaveLength(3);
  });

  it('leaves no bare setTimeout outside the two tracked timers', () => {
    // 仅剩 scheduleRefresh 内部的 refreshTimer 与 showNotice 内部的 noticeTimer
    expect(source.match(/setTimeout\(/g) || []).toHaveLength(2);
    expect(source).toMatch(/let refreshTimer = null;/);
    expect(source).toMatch(/let noticeTimer = null;/);
  });

  it('clears the refresh timer on unmount', () => {
    const unmount = source.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] || '';
    expect(unmount).toContain('clearTimeout(noticeTimer)');
    expect(unmount).toContain('clearTimeout(refreshTimer)');
    expect(unmount).toContain('abortController.abort()');
  });
});
