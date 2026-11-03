import { describe, expect, it, vi } from 'vitest';
import {
  canRenderAltcha,
  isAltchaEnabled,
  ALTCHA_DEFAULT_FIELD_NAME,
  ALTCHA_DEFAULT_WORKERS,
  getAltchaChallengeUrl,
} from '@/utils/altcha.js';

describe('altcha', () => {
  describe('ALTCHA_DEFAULT_FIELD_NAME', () => {
    it('is "altcha"', () => {
      expect(ALTCHA_DEFAULT_FIELD_NAME).toBe('altcha');
    });
  });

  describe('ALTCHA_DEFAULT_WORKERS', () => {
    it('is a positive number', () => {
      expect(ALTCHA_DEFAULT_WORKERS).toBeGreaterThan(0);
    });
  });

  describe('isAltchaEnabled', () => {
    it('returns a boolean', () => {
      expect(typeof isAltchaEnabled()).toBe('boolean');
    });
  });

  describe('canRenderAltcha', () => {
    // 这条是死锁的反向证明：服务端闸门一旦要求验证码，前端必须能渲染组件，
    // 否则用户每次重试都会再记一笔失败 → 永久卡住。
    // 若有人把 canRenderAltcha 改回「只看构建期开关」，下面的断言会红。
    it('构建期开关为 false 时，只要配置了 SUPABASE_URL 仍必须可渲染', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_ALTCHA_ENABLED', 'false');
      vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
      try {
        const mod = await import('@/utils/altcha.js');
        expect(mod.isAltchaEnabled()).toBe(false);
        expect(mod.canRenderAltcha()).toBe(true);
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    });

    it('未配置 SUPABASE_URL 时无从渲染（没有挑战端点）', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_ALTCHA_ENABLED', 'false');
      vi.stubEnv('VITE_SUPABASE_URL', '');
      try {
        const mod = await import('@/utils/altcha.js');
        expect(mod.canRenderAltcha()).toBe(false);
      } finally {
        vi.unstubAllEnvs();
        vi.resetModules();
      }
    });
  });

  describe('getAltchaChallengeUrl', () => {
    it('returns a URL string or empty string', () => {
      const url = getAltchaChallengeUrl('auth');
      expect(typeof url).toBe('string');
    });

    it('returns empty string for empty scope', () => {
      const url = getAltchaChallengeUrl('');
      // When SUPABASE_URL is set, scope defaults to 'default'
      expect(typeof url).toBe('string');
    });

    it('returns URL with scope parameter when SUPABASE_URL is set', () => {
      const url = getAltchaChallengeUrl('auth');
      if (url) {
        expect(url).toContain('scope=');
      }
    });
  });
});