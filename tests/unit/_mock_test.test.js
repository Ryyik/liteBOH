import { describe, expect, it, vi } from 'vitest';

const nm = vi.hoisted(() => ({
  getUserNotifications: vi.fn(),
}));

vi.mock('@/utils/auth.js', () => ({
  getUserNotifications: nm.getUserNotifications,
}));

// Simulate what the store does: dynamic import in a function
async function loadAuthApi() {
  return import('@/utils/auth.js');
}

describe('mock test - dynamic import in function', () => {
  it('dynamic import from function uses mock', async () => {
    const mod = await loadAuthApi();
    expect(mod.getUserNotifications).toBe(nm.getUserNotifications);
    nm.getUserNotifications.mockReturnValue('test');
    expect(mod.getUserNotifications()).toBe('test');
  });
});