import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ============================================================
// 通行密钥（Passkey / WebAuthn）接入守卫
// 1. 逻辑：错误文案映射（首次使用引导在这里给出，不许丢）
// 2. 委托：auth-api 薄包装正确转发 supabase.auth 的 passkey API
// 3. 源码：能力检测门控 / 登录按钮 / 设置面板 / store 共用封禁检查
// ============================================================

const {
  signInWithPasskeyMock,
  registerPasskeyMock,
  passkeyListMock,
  passkeyUpdateMock,
  passkeyDeleteMock,
  mockLogger,
} = vi.hoisted(() => {
  const signInWithPasskeyMock = vi.fn();
  const registerPasskeyMock = vi.fn();
  const passkeyListMock = vi.fn();
  const passkeyUpdateMock = vi.fn();
  const passkeyDeleteMock = vi.fn();
  const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return {
    signInWithPasskeyMock,
    registerPasskeyMock,
    passkeyListMock,
    passkeyUpdateMock,
    passkeyDeleteMock,
    mockLogger,
  };
});

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    auth: {
      signInWithPasskey: signInWithPasskeyMock,
      registerPasskey: registerPasskeyMock,
      passkey: {
        list: passkeyListMock,
        update: passkeyUpdateMock,
        delete: passkeyDeleteMock,
      },
    },
  },
}));

vi.mock('../../src/utils/logger.js', () => ({ logger: mockLogger }));

import {
  isPasskeySupported,
  signInWithPasskey,
  registerPasskey,
  listPasskeys,
  deletePasskey,
  renamePasskey,
  toPasskeyLoginMessage,
  toPasskeyRegisterMessage,
} from '../../src/utils/api/auth-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC = join(__dirname, '../../src');
const strip = (code) => code.replace(/\s+/g, ' ');
const read = (relative) => readFile(join(SRC, relative), 'utf-8');

const makeWindow = (isUVPAA) => {
  const impl = isUVPAA === null
    ? undefined
    : (isUVPAA ? vi.fn().mockResolvedValue(true) : vi.fn().mockResolvedValue(false));
  const win = {};
  if (isUVPAA !== 'missing-api') {
    win.PublicKeyCredential = impl === undefined
      ? {}
      : { isUserVerifyingPlatformAuthenticatorAvailable: impl };
  }
  return win;
};

describe('passkey 错误文案映射（用户可读，含首次使用引导）', () => {
  it('登录：NotAllowedError → 引导先用密码登录并到设置面板添加（不暴露技术细节）', () => {
    const message = toPasskeyLoginMessage({ name: 'NotAllowedError', message: 'The operation either timed out or was not allowed.' });
    expect(message).toContain('密码登录');
    expect(message).toContain('账户安全');
    expect(message).toContain('通行密钥');
  });

  it('登录：SecurityError / NotSupportedError → 指出环境问题并回落密码登录', () => {
    expect(toPasskeyLoginMessage({ name: 'SecurityError', message: 'rp.id mismatch' })).toContain('密码登录');
    expect(toPasskeyLoginMessage({ name: 'NotSupportedError', message: 'not supported' })).toContain('密码登录');
  });

  it('登录：unknown 错误 → 保留原始 message；空错误 → 兜底文案', () => {
    expect(toPasskeyLoginMessage({ message: '服务器开小差了' })).toBe('服务器开小差了');
    expect(toPasskeyLoginMessage(null)).toContain('密码登录');
  });

  it('注册：InvalidStateError → 「已注册过」；NotAllowedError → 「已取消」', () => {
    expect(toPasskeyRegisterMessage({ name: 'InvalidStateError', message: 'credential already exists' })).toContain('已经注册过');
    expect(toPasskeyRegisterMessage({ name: 'NotAllowedError', message: 'not allowed' })).toContain('取消');
    expect(toPasskeyRegisterMessage({ message: '' })).toContain('失败');
  });
});

describe('passkey API 薄包装转发', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signInWithPasskey / registerPasskey 无参转发', async () => {
    signInWithPasskeyMock.mockResolvedValue({ data: { session: {}, user: {} }, error: null });
    registerPasskeyMock.mockResolvedValue({ data: { id: 'pk1' }, error: null });
    await signInWithPasskey();
    await registerPasskey();
    expect(signInWithPasskeyMock).toHaveBeenCalledTimes(1);
    expect(registerPasskeyMock).toHaveBeenCalledTimes(1);
  });

  it('list / delete / rename 按管理接口签名转发', async () => {
    passkeyListMock.mockResolvedValue({ data: [], error: null });
    passkeyUpdateMock.mockResolvedValue({ error: null });
    passkeyDeleteMock.mockResolvedValue({ error: null });

    await listPasskeys();
    expect(passkeyListMock).toHaveBeenCalledTimes(1);

    await deletePasskey('pk-9');
    expect(passkeyDeleteMock).toHaveBeenCalledWith({ passkeyId: 'pk-9' });

    await renamePasskey('pk-9', '我的手机');
    expect(passkeyUpdateMock).toHaveBeenCalledWith({ passkeyId: 'pk-9', friendlyName: '我的手机' });
  });
});

describe('isPasskeySupported 能力检测', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('无 window（SSR/Node）→ false', async () => {
    delete globalThis.window;
    await expect(isPasskeySupported()).resolves.toBe(false);
  });

  it('无 PublicKeyCredential（微信内置浏览器等）→ false', async () => {
    globalThis.window = makeWindow('missing-api');
    await expect(isPasskeySupported()).resolves.toBe(false);
  });

  it('平台认证器不可用 → false', async () => {
    vi.resetModules();
    const mod = await import('../../src/utils/api/auth-api.js');
    globalThis.window = makeWindow(false);
    await expect(mod.isPasskeySupported()).resolves.toBe(false);
  });

  it('可用 → true，且结果被缓存（能力探测只发生一次）', async () => {
    vi.resetModules();
    const mod = await import('../../src/utils/api/auth-api.js');
    globalThis.window = makeWindow(true);
    const impl = globalThis.window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    await expect(mod.isPasskeySupported()).resolves.toBe(true);
    await expect(mod.isPasskeySupported()).resolves.toBe(true);
    expect(impl).toHaveBeenCalledTimes(1);
  });
});

describe('passkey 接入源码守卫', () => {
  it('supabase 客户端开启 experimental.passkey 开关', async () => {
    const code = strip(await read('utils/supabase-client.js'));
    expect(code).toContain('experimental: { passkey: true }');
  });

  it('auth store：loginWithPasskey 与 login 共用 checkBanAfterSignIn（封禁缝隙的客户端半堵）', async () => {
    const code = strip(await read('stores/auth.ts'));
    expect(code).toContain('const loginWithPasskey = async ()');
    expect(code).toContain('const checkBanAfterSignIn = async ()');
    // 两处登录都必须走同一封禁检查
    const loginBody = code.slice(code.indexOf('const login = async'), code.indexOf('const loginWithPasskey'));
    expect(loginBody).toContain('checkBanAfterSignIn()');
    expect(code.slice(code.indexOf('const loginWithPasskey'))).toContain('checkBanAfterSignIn()');
    // passkey 会话采纳与密码登录同构：先 updateLocalState 再 ban 检查
    const passkeyBody = code.slice(code.indexOf('const loginWithPasskey'), code.indexOf('const loginWithPasskey') + 1200);
    expect(passkeyBody).toContain('updateLocalState');
    expect(passkeyBody.indexOf('updateLocalState')).toBeLessThan(passkeyBody.indexOf('checkBanAfterSignIn'));
    // 错误文案必须来自 toPasskeyLoginMessage（首次使用引导不许被替换成裸 message）
    expect(passkeyBody).toContain('toPasskeyLoginMessage(error)');
  });

  it('auth-api / utils/auth.js / auth.d.ts 三处导出一致', async () => {
    const api = await read('utils/api/auth-api.js');
    const barrel = await read('utils/auth.js');
    for (const name of ['isPasskeySupported', 'signInWithPasskey', 'registerPasskey', 'listPasskeys', 'deletePasskey', 'toPasskeyLoginMessage']) {
      expect(api).toMatch(new RegExp(`export (?:async )?function ${name}|export const ${name} =`));
      expect(barrel).toContain(name);
    }
    // 类型声明也要覆盖（store 经 @/utils/auth.js 动态加载，靠 auth.d.ts 拿类型）
    const decl = await read('utils/auth.d.ts');
    for (const name of ['isPasskeySupported', 'signInWithPasskey', 'toPasskeyLoginMessage']) {
      expect(decl).toContain(`export function ${name}`);
    }
  });

  it('登录页：两套布局各有能力门控的通行密钥按钮，且不是 submit 类型', async () => {
    const code = await read('views/Login/index.vue');
    expect((code.match(/v-if="passkeySupported"/g) || []).length).toBe(2);
    expect((code.match(/class="boh-passkey-btn"/g) || []).length).toBe(2);
    expect((code.match(/type="button" class="boh-passkey-btn"/g) || []).length).toBe(2);
    expect(code).toContain('authStore.loginWithPasskey()');
    // 能力检测在 onMounted 触发
    expect(code).toContain('isPasskeySupported()');
  });

  it('设置面板：菜单行与注册/删除均为能力门控 + 两次点击删除确认', async () => {
    const code = strip(await read('views/user-center/AccountSecurity/index.vue'));
    expect(code).toContain('v-if="passkeySupported" type="button" class="gs-row"');
    expect(code).toContain('openPasskeyPanel');
    expect(code).toContain('registerPasskey()');
    expect(code).toContain('toPasskeyRegisterMessage(error)');
    expect(code).toContain("pendingDeletePasskeyId.value !== item.id");
    expect(code).toContain('refreshPasskeyList()');
  });
});
