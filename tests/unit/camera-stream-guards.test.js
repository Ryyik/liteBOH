/**
 * 相机取流的前置判定（纯函数，无 DOM 依赖）。
 *
 * 这几条对应 2026-11-06 的线上问题：「打开相机页就黑屏、系统不弹权限框」。
 * 黑屏不是渲染问题，而是**三类根本不会弹窗的环境**被当成了「可以试试」：
 * 非 https、内置浏览器、浏览器压根没有这个 API。判定错一次，用户就得到一块
 * 没有任何解释的黑屏。所以这里把每条分支都钉住。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  describeCameraError,
  detectCameraBlocker,
  isCameraSupported,
  readCameraPermission,
} from '@/composables/useCameraStream.js';

const ORIGINAL = {
  window: globalThis.window,
  navigator: globalThis.navigator,
};

/** node 环境没有 window/navigator，按用例临时装一套（用完必须还原） */
function stubEnv({ secure = true, mediaDevices = {}, userAgent = 'Mozilla/5.0 Safari' } = {}) {
  Object.defineProperty(globalThis, 'window', {
    value: { isSecureContext: secure },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices, userAgent },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) {
      delete globalThis[key];
      continue;
    }
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
});

describe('detectCameraBlocker', () => {
  it('没有 window 时按不支持处理（SSR / node）', () => {
    expect(detectCameraBlocker()).toBe('unsupported');
  });

  it('非安全上下文优先于其他判断（http 永远不会弹权限框）', () => {
    stubEnv({ secure: false, mediaDevices: { getUserMedia: () => {} } });
    expect(detectCameraBlocker()).toBe('insecure');
  });

  it('微信内置浏览器 → webview（不是不支持，得换成浏览器打开）', () => {
    stubEnv({
      mediaDevices: undefined,
      userAgent: 'Mozilla/5.0 (iPhone) MicroMessenger/8.0.49',
    });
    expect(detectCameraBlocker()).toBe('webview');
  });

  it('QQ 内置浏览器同样算 webview', () => {
    stubEnv({ mediaDevices: undefined, userAgent: 'Mozilla/5.0 QQ/8.9.88' });
    expect(detectCameraBlocker()).toBe('webview');
  });

  it('普通浏览器但没有 mediaDevices → unsupported', () => {
    stubEnv({ mediaDevices: undefined, userAgent: 'Mozilla/5.0 (Macintosh) Firefox/128' });
    expect(detectCameraBlocker()).toBe('unsupported');
  });

  it('有 getUserMedia 且是 https → 空串（值得一试）', () => {
    stubEnv({ mediaDevices: { getUserMedia: () => {} } });
    expect(detectCameraBlocker()).toBe('');
  });

  it('isCameraSupported 跟着 mediaDevices 走', () => {
    stubEnv({ mediaDevices: { getUserMedia: () => {} } });
    expect(isCameraSupported()).toBe(true);
    stubEnv({ mediaDevices: undefined });
    expect(isCameraSupported()).toBe(false);
  });
});

describe('readCameraPermission', () => {
  it('读到状态就原样返回', async () => {
    stubEnv({
      mediaDevices: { getUserMedia: () => {} },
    });
    globalThis.navigator.permissions = { query: async () => ({ state: 'granted' }) };
    expect(await readCameraPermission()).toBe('granted');
  });

  it('不支持 Permissions API 时返回空串（Safari 常见），不能当成拒绝', async () => {
    stubEnv({ mediaDevices: { getUserMedia: () => {} } });
    globalThis.navigator.permissions = {
      query: () => {
        throw new TypeError('The name provided is not a valid enum value of type PermissionName.');
      },
    };
    expect(await readCameraPermission()).toBe('');
  });
});

describe('describeCameraError', () => {
  it('超时单独一类（授权框挂住时不能一直停在「正在打开相机」）', () => {
    expect(describeCameraError({ name: 'TimeoutError' })).toBe('timeout');
  });

  it('拒绝与占用不能混为一谈', () => {
    expect(describeCameraError({ name: 'NotAllowedError' })).toBe('denied');
    expect(describeCameraError({ name: 'NotReadableError' })).toBe('in-use');
    expect(describeCameraError({ name: 'NotFoundError' })).toBe('not-found');
  });

  it('未知错误兜底成 error，而不是当成拒绝', () => {
    expect(describeCameraError(new Error('boom'))).toBe('error');
    expect(describeCameraError(undefined)).toBe('error');
  });
});
