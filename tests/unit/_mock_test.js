import { describe, expect, it, vi } from 'vitest';

const nm = vi.hoisted(() => ({
  getUserNotifications: vi.fn(),
}));

vi.mock('@/utils/auth.js', () => ({
  getUserNotifications: nm.getUserNotifications,
}));

describe('mock test', () => {
  it('dynamic import uses mock', async () => {
    const mod = await import('@/utils/auth.js');
    expect(mod.getUserNotifications).toBe(nm.getUserNotifications);
    nm.getUserNotifications.mockReturnValue('test');
    expect(mod.getUserNotifications()).toBe('test');
  });
});
