import { describe, expect, it, beforeEach } from 'vitest';
import {
  DIALOG_BUSY_MESSAGE,
  isDialogBusy,
  useConfirmDialog,
} from '@/composables/useConfirmDialog.js';

/**
 * useConfirmDialog 的**互斥保护**契约。
 *
 * 为什么单独立一份用例：这条拒绝语义有两个相反的失败方向，各自都咬过人 ——
 *   · 判据写太宽（例如无差别 `catch { return null }`）→ 真错误被吞成「点了没反应」；
 *   · 调用点不加防御 → 预期内的拒绝上浮成错误（Vue 会把它交给 app.config.errorHandler）。
 * 判据 `isDialogBusy` 自 2026-09-29 起是**单一真源**（本文件所在模块导出），
 * 三个调用点（SharedMemoryManagement / CopyEditor / BlockWall）共用它。
 */
describe('useConfirmDialog 互斥保护', () => {
  let dialog;

  beforeEach(() => {
    dialog = useConfirmDialog();
    // state 是模块级单例：先关干净，避免用例互相污染
    dialog.close('cancel');
  });

  it('弹窗已打开时，第二个请求被拒绝，且拒绝的是真源那条文案', async () => {
    const first = dialog.confirm({ title: 'A' });
    const second = dialog.confirm({ title: 'B' });
    await expect(second).rejects.toThrow(DIALOG_BUSY_MESSAGE);
    dialog.close('cancel');
    await expect(first).resolves.toBe(false);
  });

  it('isDialogBusy 认得自家这条拒绝（Error 与裸字符串两种形态）', () => {
    expect(isDialogBusy(new Error(DIALOG_BUSY_MESSAGE))).toBe(true);
    expect(isDialogBusy(DIALOG_BUSY_MESSAGE)).toBe(true);
  });

  it('反证：其它异常不得被当成互斥拒绝（否则真错误会被静默吞掉）', () => {
    expect(isDialogBusy(new Error('boom'))).toBe(false);
    expect(isDialogBusy(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(isDialogBusy(new Error(''))).toBe(false);
    expect(isDialogBusy(undefined)).toBe(false);
    expect(isDialogBusy(null)).toBe(false);
  });

  it('关闭后可以再次打开（互斥不是永久锁死）', async () => {
    const first = dialog.confirm({ title: 'A' });
    dialog.close('confirm');
    await expect(first).resolves.toBe(true);
    const third = dialog.confirm({ title: 'C' });
    dialog.close('cancel');
    await expect(third).resolves.toBe(false);
  });
});
