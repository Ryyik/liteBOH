import { describe, expect, it } from 'vitest';
import { resolveXmasPrimaryAction } from '@/views/ChristmasGiftTree/xmas-login-gate.js';

describe('圣诞活动主按钮 · 登录闸门', () => {
  it('未登录且可报名时先要求登录', () => {
    expect(
      resolveXmasPrimaryAction({
        isLoggedIn: false,
        isSignedUp: false,
        ctaDisabled: false,
      }),
    ).toBe('login');
  });

  it('未登录也不能进入退出流程', () => {
    expect(
      resolveXmasPrimaryAction({
        isLoggedIn: false,
        isSignedUp: true,
        ctaDisabled: false,
      }),
    ).toBe('login');
  });

  it('登录后报名与退出恢复原动作', () => {
    expect(
      resolveXmasPrimaryAction({
        isLoggedIn: true,
        isSignedUp: false,
        ctaDisabled: false,
      }),
    ).toBe('intro');
    expect(
      resolveXmasPrimaryAction({
        isLoggedIn: true,
        isSignedUp: true,
        ctaDisabled: false,
      }),
    ).toBe('leave');
  });

  it('活动关闭或截止优先于登录提示', () => {
    expect(
      resolveXmasPrimaryAction({
        isLoggedIn: false,
        isSignedUp: false,
        ctaDisabled: true,
      }),
    ).toBe('noop');
  });
});
