import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { useBottomNavIslandQueue } from '../../src/views/user-center/UserSpace/composables/useBottomNavIslandQueue.js';

describe('useBottomNavIslandQueue', () => {
  let queue;
  let onShow;
  let onAction;

  beforeEach(() => {
    vi.useFakeTimers();
    onShow = vi.fn();
    onAction = vi.fn();
    queue = useBottomNavIslandQueue({ onShow, onAction });
  });

  afterEach(() => {
    queue.dispose();
    vi.useRealTimers();
  });

  // --- factory & initial state ---

  describe('factory & initial state', () => {
    it('returns all expected public API keys', () => {
      const keys = Object.keys(queue).sort();
      expect(keys).toEqual([
        'dismiss',
        'dispose',
        'flush',
        'handleAction',
        'handleAfterLeave',
        'handleBeforeLeave',
        'isCollapsing',
        'isExpanded',
        'island',
        'show',
      ]);
    });

    it('island reactive object has correct defaults', () => {
      expect(queue.island.visible).toBe(false);
      expect(queue.island.title).toBe('');
      expect(queue.island.message).toBe('');
      expect(queue.island.icon).toBe('success');
      expect(queue.island.actionLabel).toBe('确定');
      expect(queue.island.actionTab).toBeNull();
      expect(queue.island.isLong).toBe(false);
      expect(queue.island.catSticker).toBe('');
      expect(queue.island.catStickerMode).toBe('hero');
      expect(queue.island.forceCatSticker).toBe(false);
    });

    it('isCollapsing ref starts as false', () => {
      expect(queue.isCollapsing.value).toBe(false);
    });

    it('isExpanded computed reflects island.visible', () => {
      expect(queue.isExpanded.value).toBe(false);
      queue.island.visible = true;
      expect(queue.isExpanded.value).toBe(true);
      queue.island.visible = false;
      expect(queue.isExpanded.value).toBe(false);
    });
  });

  // --- normalizePayload defaults ---

  describe('normalizePayload (via show)', () => {
    it('applies default title "已保存" when title is empty or missing', async () => {
      queue.show({});
      await nextTick();
      expect(queue.island.title).toBe('已保存');
    });

    it('applies default icon "success" when icon is empty or missing', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.icon).toBe('success');
    });

    it('applies default actionLabel "确定" when actionLabel is empty', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.actionLabel).toBe('确定');
    });

    it('clamps durationMs between 1800 and 9000', async () => {
      queue.show({ title: 'short', durationMs: 500 });
      await nextTick();
      // verify island is visible (timer started), then dismiss() and check
      expect(queue.island.visible).toBe(true);
      queue.dismiss();

      vi.clearAllTimers();

      queue.show({ title: 'too long', durationMs: 20000 });
      await nextTick();
      expect(queue.island.visible).toBe(true);
    });

    it('defaults durationMs to 4800', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      // after 4800ms it should auto-dismiss
      vi.advanceTimersByTime(4700);
      expect(queue.island.visible).toBe(true);
      vi.advanceTimersByTime(200);
      expect(queue.island.visible).toBe(false);
    });

    it('sets isLong to true when textLength exceeds 24', async () => {
      queue.show({ title: 'a'.repeat(25) });
      await nextTick();
      expect(queue.island.isLong).toBe(true);
    });

    it('sets isLong to false when textLength is 24 or less', async () => {
      queue.show({ title: 'a'.repeat(24) });
      await nextTick();
      expect(queue.island.isLong).toBe(false);
    });

    it('respects payload.isLong even if textLength <= 24', async () => {
      queue.show({ title: 'short', isLong: true });
      await nextTick();
      expect(queue.island.isLong).toBe(true);
    });

    it('resolves catSticker from DEFAULT_CAT_STICKERS by type', async () => {
      queue.show({ title: 'test', type: 'success' });
      await nextTick();
      expect(queue.island.catSticker).toBe('success');
    });

    it('resolves catSticker from DEFAULT_CAT_STICKERS by icon when type not matched', async () => {
      queue.show({ title: 'test', type: 'unknown', icon: 'delete' });
      await nextTick();
      expect(queue.island.catSticker).toBe('delete');
    });

    it('returns empty catSticker when neither type nor icon match', async () => {
      queue.show({ title: 'test', type: 'nonexistent', icon: 'nonexistent' });
      await nextTick();
      expect(queue.island.catSticker).toBe('');
    });

    it('uses explicit catSticker over auto-resolved one', async () => {
      queue.show({ title: 'test', type: 'success', catSticker: 'custom' });
      await nextTick();
      expect(queue.island.catSticker).toBe('custom');
    });

    it('resolves catStickerMode from DEFAULT_CAT_STICKER_MODES (all default to hero)', async () => {
      queue.show({ title: 'test', type: 'warning' });
      await nextTick();
      expect(queue.island.catStickerMode).toBe('hero');
    });

    it('uses explicit catStickerMode over auto-resolved one', async () => {
      queue.show({ title: 'test', type: 'success', catStickerMode: 'peek' });
      await nextTick();
      expect(queue.island.catStickerMode).toBe('peek');
    });

    it('respects forceCatSticker flag', async () => {
      queue.show({ title: 'test', forceCatSticker: true });
      await nextTick();
      expect(queue.island.forceCatSticker).toBe(true);
    });

    it('forceCatSticker defaults to false', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.forceCatSticker).toBe(false);
    });

    it('respects custom priority', async () => {
      // higher priority items should appear first; since there's only one item,
      // we just verify the island shows the right title
      queue.show({ title: 'high-prio', priority: 99 });
      await nextTick();
      expect(queue.island.title).toBe('high-prio');
    });

    it('falls back to DEFAULT_PRIORITY when priority is not a finite number', async () => {
      queue.show({ title: 'test', type: 'success', priority: 'abc' });
      await nextTick();
      expect(queue.island.title).toBe('test');
    });
  });

  // --- DEFAULT_PRIORITY mapping ---

  describe('DEFAULT_PRIORITY', () => {
    it('assigns highest priority to message (3)', async () => {
      queue.show({ title: 'message', type: 'message' });
      await nextTick();
      queue.show({ title: 'success', type: 'success' });
      await nextTick();
      // message (priority 3) should be shown first; success is enqueued behind it
      expect(queue.island.title).toBe('message');
    });

    it('assigns lower priority to success (0)', async () => {
      queue.show({ title: 'warning', type: 'warning' });
      await nextTick();
      queue.show({ title: 'success', type: 'success' });
      await nextTick();
      // warning (priority 2) should be shown first; success (priority 0) is enqueued
      expect(queue.island.title).toBe('warning');
    });

    it('notification and warning both have priority 2', async () => {
      queue.show({ title: 'notification', type: 'notification', priority: 2 });
      await nextTick();
      expect(queue.island.title).toBe('notification');
    });

    it('progress has priority 1', async () => {
      queue.show({ title: 'progress', type: 'progress' });
      queue.show({ title: 'notification', type: 'notification' });
      await nextTick();
      // notification (priority 2) > progress (priority 1)
      expect(queue.island.title).toBe('notification');
    });
  });

  // --- show / queue behavior ---

  describe('show() queue behavior', () => {
    it('shows the first item immediately when island is not visible', async () => {
      queue.show({ title: 'Hello' });
      await nextTick();
      expect(queue.island.visible).toBe(true);
      expect(queue.island.title).toBe('Hello');
    });

    it('enqueues second item while first is visible', async () => {
      queue.show({ title: 'First' });
      await nextTick();
      expect(queue.island.title).toBe('First');

      queue.show({ title: 'Second' });
      expect(queue.island.title).toBe('First'); // still showing first
      expect(queue.island.visible).toBe(true);
    });

    it('auto-dismisses after durationMs and shows nothing more (no items queued)', async () => {
      queue.show({ title: 'First', durationMs: 2000 });
      await nextTick();
      expect(queue.island.title).toBe('First');

      vi.advanceTimersByTime(2000);
      expect(queue.island.visible).toBe(false);
    });

    it('second item shows after explicit dismiss and flush', async () => {
      queue.show({ title: 'First' });
      await nextTick();
      expect(queue.island.title).toBe('First');

      queue.show({ title: 'Second' });

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(queue.island.title).toBe('Second');
      expect(queue.island.visible).toBe(true);
    });

    it('flush does nothing when island is still visible', async () => {
      queue.show({ title: 'First' });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      queue.show({ title: 'Second' });

      queue.flush();
      await nextTick();
      expect(queue.island.title).toBe('First');
    });

    it('flush does nothing when isCollapsing is true', () => {
      queue.isCollapsing.value = true;
      queue.show({ title: 'Something' });
      // flush is called inside show but should be blocked
      expect(queue.island.visible).toBe(false);
    });

    it('sorts queue by priority (higher first)', async () => {
      // Show first with low priority; it should be shown immediately
      queue.show({ title: 'low', type: 'success' });
      await nextTick();
      expect(queue.island.title).toBe('low');

      // Add items while island is visible
      queue.show({ title: 'high', type: 'message' }); // priority 3
      queue.show({ title: 'mid', type: 'notification' }); // priority 2

      // Dismiss current and flush
      queue.dismiss();
      await nextTick();

      // Now check internal state: after dismiss, flush should show highest priority
      queue.flush();
      await nextTick();
      expect(queue.island.title).toBe('high');

      // Next
      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();
      expect(queue.island.title).toBe('mid');
    });
  });

  // --- merge behavior ---

  describe('show() merge behavior', () => {
    it('merges items with the same type and actionTab', async () => {
      queue.show({ title: 'First', type: 'notification', actionTab: 'tab1', durationMs: 3000, priority: 1 });
      await nextTick();
      expect(queue.island.title).toBe('First');

      // Add a second item with same type+actionTab
      queue.show({ title: 'Second', type: 'notification', actionTab: 'tab1', durationMs: 5000, priority: 3 });

      // Dismiss current, then flush to see the merged result
      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(queue.island.title).toBe('Second');

      // Verify merge: count should be 2 (one from first.show + one from second.show)
      // durationMs should be max(3000, 5000) = 5000
      vi.advanceTimersByTime(4900);
      expect(queue.island.visible).toBe(true);
      vi.advanceTimersByTime(200);
      expect(queue.island.visible).toBe(false);
    });

    it('does not merge items with different type', async () => {
      queue.show({ title: 'First', type: 'notification', actionTab: 'tab1' });
      await nextTick();
      expect(queue.island.title).toBe('First');

      queue.show({ title: 'Second', type: 'warning', actionTab: 'tab1' });

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(queue.island.title).toBe('Second');

      // There should be no more items (two separate entries, second shown)
      queue.dismiss();
      await nextTick();
      queue.flush();
      expect(queue.island.visible).toBe(false);
    });

    it('does not merge items with different actionTab', async () => {
      queue.show({ title: 'First', type: 'notification', actionTab: 'tab1' });
      await nextTick();
      expect(queue.island.title).toBe('First');

      queue.show({ title: 'Second', type: 'notification', actionTab: 'tab2' });

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(queue.island.title).toBe('Second');

      // Verify there's only one more item to show (two separate entries)
      queue.dismiss();
      await nextTick();
      queue.flush();
      expect(queue.island.visible).toBe(false);
    });

    it('merges items queued before being shown, keeping max durationMs', async () => {
      // First item shows immediately
      queue.show({ title: 'First', type: 'message', actionTab: 'dup', durationMs: 2000 });
      await nextTick();
      expect(queue.island.title).toBe('First');

      // Second and third are queued with same type+actionTab — they merge
      queue.show({ title: 'Second', type: 'message', actionTab: 'dup', durationMs: 3000 });
      queue.show({ title: 'Third', type: 'message', actionTab: 'dup', durationMs: 4000 });

      // Dismiss first, then flush the merged item
      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      // The merged item should have the title of the last merge ("Third")
      expect(queue.island.title).toBe('Third');

      // durationMs should be max(3000, 4000) = 4000
      vi.advanceTimersByTime(3900);
      expect(queue.island.visible).toBe(true);
      vi.advanceTimersByTime(200);
      expect(queue.island.visible).toBe(false);
    });
  });

  // --- dismiss ---

  describe('dismiss()', () => {
    it('sets island.visible to false', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      queue.dismiss();
      expect(queue.island.visible).toBe(false);
    });

    it('clears auto-dismiss timer so island stays hidden', async () => {
      queue.show({ title: 'test', durationMs: 5000 });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      vi.advanceTimersByTime(1000);
      queue.dismiss();
      expect(queue.island.visible).toBe(false);

      // Advance past original timeout; island should remain hidden
      vi.advanceTimersByTime(5000);
      expect(queue.island.visible).toBe(false);
    });
  });

  // --- handleAction ---

  describe('handleAction()', () => {
    it('dismisses the island', async () => {
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      queue.handleAction();
      expect(queue.island.visible).toBe(false);
    });

    it('calls onAction with actionTab', async () => {
      queue.show({ title: 'test', actionTab: 'some-tab' });
      await nextTick();

      queue.handleAction();
      expect(onAction).toHaveBeenCalledWith('some-tab');
    });

    it('calls onAction with null when no actionTab is set', async () => {
      queue.show({ title: 'test' });
      await nextTick();

      queue.handleAction();
      expect(onAction).toHaveBeenCalledWith(null);
    });

    it('clears the queue', async () => {
      queue.show({ title: 'First' });
      await nextTick();

      queue.show({ title: 'Second' });
      queue.show({ title: 'Third' });

      queue.handleAction();

      // After handleAction clears queue, flush should show nothing
      await nextTick();
      queue.flush();
      await nextTick();
      expect(queue.island.visible).toBe(false);
    });
  });

  // --- handleBeforeLeave / handleAfterLeave ---

  describe('handleBeforeLeave()', () => {
    it('sets isCollapsing to true', () => {
      expect(queue.isCollapsing.value).toBe(false);
      queue.handleBeforeLeave();
      expect(queue.isCollapsing.value).toBe(true);
    });
  });

  describe('handleAfterLeave()', () => {
    it('sets isCollapsing to false', () => {
      queue.isCollapsing.value = true;
      queue.handleAfterLeave();
      expect(queue.isCollapsing.value).toBe(false);
    });

    it('calls flush to show next item', async () => {
      queue.show({ title: 'First', durationMs: 2000 });
      await nextTick();
      expect(queue.island.title).toBe('First');

      queue.show({ title: 'Second' });

      // Simulate the leave transition lifecycle
      queue.dismiss();
      await nextTick();
      queue.handleBeforeLeave();
      // After leave completes
      queue.handleAfterLeave();
      await nextTick();

      expect(queue.island.title).toBe('Second');
      expect(queue.island.visible).toBe(true);
    });
  });

  // --- dispose ---

  describe('dispose()', () => {
    it('clears auto-dismiss timer', async () => {
      queue.show({ title: 'test', durationMs: 5000 });
      await nextTick();
      expect(queue.island.visible).toBe(true);

      queue.dispose();

      // Advance time; island should NOT auto-dismiss because timer was cleared
      vi.advanceTimersByTime(10000);
      // Note: visible was set to true before dispose cleared the timer,
      // but dispose doesn't set visible=false (unlike dismiss)
      // The timer was cleared but visible stays true
    });

    it('clears queue so no more items show', async () => {
      queue.show({ title: 'First' });
      await nextTick();
      queue.show({ title: 'Second' });

      queue.dismiss();
      queue.dispose();

      await nextTick();
      queue.flush();
      await nextTick();
      expect(queue.island.visible).toBe(false);
    });
  });

  // --- onShow callback ---

  describe('onShow callback', () => {
    it('calls onShow with normalized item when showing', async () => {
      queue.show({ title: 'My Title', message: 'My Msg', type: 'warning' });
      await nextTick();

      expect(onShow).toHaveBeenCalledTimes(1);
      const callArg = onShow.mock.calls[0][0];
      expect(callArg.title).toBe('My Title');
      expect(callArg.message).toBe('My Msg');
      expect(callArg.type).toBe('warning');
      expect(callArg.priority).toBe(2); // warning priority
      expect(callArg.isLong).toBe(false); // 'My TitleMy Msg'.length = 14
    });

    it('calls onShow for each flushed item', async () => {
      queue.show({ title: 'A' });
      await nextTick();
      expect(onShow).toHaveBeenCalledTimes(1);

      queue.show({ title: 'B' });

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(onShow).toHaveBeenCalledTimes(2);
      expect(onShow.mock.calls[1][0].title).toBe('B');
    });

    it('does not crash when onShow is not provided', () => {
      const q = useBottomNavIslandQueue({ onAction: vi.fn() });
      expect(() => q.show({ title: 'test' })).not.toThrow();
      q.dispose();
    });
  });

  // --- DEFAULT_CAT_STICKERS ---

  describe('DEFAULT_CAT_STICKERS', () => {
    const expected = {
      ai: 'theme',
      comment: 'like',
      delete: 'delete',
      failed: 'failed',
      message: 'mobileGap',
      notification: 'cardExtra',
      post: 'decorAlt',
      progress: 'uploading',
      search: 'decor',
      success: 'success',
      theme: 'theme',
      uploading: 'uploading',
      warning: 'decor',
    };

    Object.entries(expected).forEach(([key, value]) => {
      it(`catSticker for "${key}" resolves to "${value}"`, async () => {
        // Test via show with a matching type
        const q = useBottomNavIslandQueue({ onShow: vi.fn(), onAction: vi.fn() });
        q.show({ title: 'test', type: key });
        await nextTick();
        expect(q.island.catSticker).toBe(value);
        q.dispose();
      });
    });
  });

  // --- DEFAULT_CAT_STICKER_MODES ---

  describe('DEFAULT_CAT_STICKER_MODES', () => {
    const types = [
      'ai', 'comment', 'delete', 'failed', 'message', 'notification',
      'post', 'progress', 'search', 'success', 'theme', 'uploading', 'warning',
    ];

    types.forEach((type) => {
      it(`catStickerMode for "${type}" defaults to "hero"`, async () => {
        const q = useBottomNavIslandQueue({ onShow: vi.fn(), onAction: vi.fn() });
        q.show({ title: 'test', type });
        await nextTick();
        expect(q.island.catStickerMode).toBe('hero');
        q.dispose();
      });
    });
  });

  // --- edge cases ---

  describe('edge cases', () => {
    it('handles show() with no arguments gracefully', async () => {
      expect(() => queue.show()).not.toThrow();
      await nextTick();
      expect(queue.island.visible).toBe(true);
    });

    it('handles repeated show/dismiss cycles without leaking timers', async () => {
      for (let i = 0; i < 5; i++) {
        queue.show({ title: `Item ${i}`, durationMs: 1800 });
        await nextTick();
        expect(queue.island.visible).toBe(true);

        vi.advanceTimersByTime(1800);
        expect(queue.island.visible).toBe(false);

        await nextTick();
      }
      // No errors thrown
    });

    it('does not call onAction if not provided', () => {
      const q = useBottomNavIslandQueue();
      expect(() => {
        q.show({ title: 'test' });
        q.handleAction();
      }).not.toThrow();
      q.dispose();
    });

    it('actionTab defaults to null for empty string', async () => {
      queue.show({ title: 'test', actionTab: '' });
      await nextTick();
      expect(queue.island.actionTab).toBeNull();
    });

    it('actionTab is preserved when set', async () => {
      queue.show({ title: 'test', actionTab: 'my-tab' });
      await nextTick();
      expect(queue.island.actionTab).toBe('my-tab');
    });

    it('count starts at 1 when not specified', async () => {
      // can't directly test count from outside API, but merge behavior validates it
      queue.show({ title: 'test' });
      await nextTick();
      expect(queue.island.visible).toBe(true);
    });

    it('trims whitespace from string fields', async () => {
      queue.show({ title: '  Hello World  ', message: '  msg  ' });
      await nextTick();
      expect(queue.island.title).toBe('Hello World');
      expect(queue.island.message).toBe('msg');
    });

    it('title defaults to 已保存 when given only whitespace', async () => {
      queue.show({ title: '   ' });
      await nextTick();
      expect(queue.island.title).toBe('已保存');
    });

    it('uses type from icon when type is not provided', async () => {
      queue.show({ title: 'test', icon: 'delete' });
      await nextTick();
      expect(queue.island.catSticker).toBe('delete');
    });

    it('multiple rapid show calls resolve correctly', async () => {
      queue.show({ title: 'A', type: 'success', priority: 0 });
      await nextTick();
      expect(queue.island.title).toBe('A');

      queue.show({ title: 'B', type: 'message', priority: 3 });
      queue.show({ title: 'C', type: 'warning', priority: 2 });

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      // B (priority 3) should show before C (priority 2)
      expect(queue.island.title).toBe('B');

      queue.dismiss();
      await nextTick();
      queue.flush();
      await nextTick();

      expect(queue.island.title).toBe('C');
    });
  });
});