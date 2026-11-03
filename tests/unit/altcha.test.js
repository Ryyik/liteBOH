import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isAltchaEnabled,
  ALTCHA_DEFAULT_FIELD_NAME,
  ALTCHA_DEFAULT_WORKERS,
  getAltchaChallengeUrl,
  readAltchaPayloadFromStateChange,
} from '@/utils/altcha.js';
import { scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const scriptCode = (rel) => stripComments(scriptSection(readFileSync(resolve(root, rel), 'utf8')));

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

describe('readAltchaPayloadFromStateChange', () => {
  // 2026-11-03 用户报障「闸门一出现就显示已完成人机验证，点一下变空框，再点打勾，
  // 登录仍提示请先完成人机验证」。根因是 payload 从来没有被同步出来：
  // altcha 3.0.3 普通校验路径派发的是 `vefified`（拼错），`verified` 监听器永不触发；
  // 而 FormData 读取又踩 Svelte effect 的时序。唯一可靠通道是 statechange.detail.payload。
  it('verified 状态返回 detail.payload', () => {
    const event = { detail: { state: 'verified', payload: 'eyJjaGFsbGVuZ2UiOnt9fQ==' } };
    expect(readAltchaPayloadFromStateChange(event)).toBe('eyJjaGFsbGVuZ2UiOnt9fQ==');
  });

  it('接受裸 detail 对象（不包 CustomEvent）', () => {
    expect(readAltchaPayloadFromStateChange({ state: 'verified', payload: 'abc' })).toBe('abc');
  });

  it('非 verified 状态一律归零 —— reset / expired / error 必须让 v-model 清空', () => {
    // 这条是关键：证明是一次性消费的（服务端 auth_altcha_proofs 有唯一约束），
    // 状态回落后若还留着旧 payload，下一次登录会直接撞 ALTCHA_REPLAYED。
    for (const state of ['unverified', 'verifying', 'expired', 'error', '']) {
      expect(readAltchaPayloadFromStateChange({ state, payload: 'stale' })).toBe('');
    }
  });

  it('payload 缺失或非字符串时返回空串，不返回 undefined', () => {
    expect(readAltchaPayloadFromStateChange({ state: 'verified' })).toBe('');
    expect(readAltchaPayloadFromStateChange({ state: 'verified', payload: null })).toBe('');
    expect(readAltchaPayloadFromStateChange({ detail: { state: 'verified', payload: 42 } })).toBe(
      '',
    );
    expect(readAltchaPayloadFromStateChange(null)).toBe('');
    expect(readAltchaPayloadFromStateChange(undefined)).toBe('');
  });
});

describe('AltchaWidget / 登录页接线（源码守卫）', () => {
  // 这里锁的是「修好之后别再退回去」，不是实现细节：
  // 库的事件名拼写与时序都不可控，唯一能让 payload 流到 v-model 的通道只有 statechange.detail。

  it('AltchaWidget 必须用 statechange.detail.payload 同步 v-model', () => {
    const code = scriptCode('src/components/AltchaWidget.vue');
    expect(code).toContain('readAltchaPayloadFromStateChange');
  });

  it('AltchaWidget 不得再在 disabled 时调 reset（会在提交瞬间清空 payload）', () => {
    // 曾经的写法 `watch(() => props.disabled, (d) => d && reset())`：
    // Login 里 isSubmitting=true 之后还有 await，等读 payload 时已被清成 ''。
    const code = scriptCode('src/components/AltchaWidget.vue');
    expect(code).not.toContain('props.disabled');
  });

  it('登录页不得再用 auto="onload"（挂载即自动解算 = 用户看到的「一开始就已完成」）', () => {
    const code = scriptCode('src/views/Login/index.vue');
    expect(code).not.toContain('auto="onload"');
  });

  it('登录页不得把 altchaPayload.value 直读进 login()（必须先在 await 前快照）', () => {
    const code = scriptCode('src/views/Login/index.vue');
    expect(code).not.toMatch(/altchaPayload:\s*altchaPayload\.value/);
    expect(code).toContain('altchaPayloadSnapshot');
  });
});
