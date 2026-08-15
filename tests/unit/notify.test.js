import { describe, expect, it, vi, beforeEach } from 'vitest';

// Stub window for Node.js test environment
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  removeEventListener: vi.fn(),
});

import { notify } from '@/utils/notify.js';

describe('notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches custom event with message and default type', () => {
    notify('请先登录');

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = window.dispatchEvent.mock.calls[0][0];
    expect(event.detail).toEqual({ message: '请先登录', type: 'info' });
  });

  it('dispatches custom event with custom type', () => {
    notify('操作成功', 'success');

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = window.dispatchEvent.mock.calls[0][0];
    expect(event.detail).toEqual({ message: '操作成功', type: 'success' });
  });

  it('dispatches event with warning type', () => {
    notify('警告信息', 'warning');

    const event = window.dispatchEvent.mock.calls[0][0];
    expect(event.detail.type).toBe('warning');
  });

  it('dispatches event with error type', () => {
    notify('错误信息', 'error');

    const event = window.dispatchEvent.mock.calls[0][0];
    expect(event.detail.type).toBe('error');
  });
});