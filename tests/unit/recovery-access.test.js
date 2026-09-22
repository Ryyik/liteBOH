import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';

// ============================================================
// 被测：src/utils/recovery-access.js（amr 判定，纯函数）
// + AccountSecurity / ResetPassword 源码守卫
//
// amr 语义：GoTrue 服务端写进 access_token 的认证方法引用，
// 形如 [{ method: 'otp', timestamp: <unix 秒> }]。这里用手工构造的
// JWT 覆盖三分支：窗内免密 / 过窗要求 / 密码登录要求。
// ============================================================
const ENCODER = new TextEncoder();

const makeJwt = (payload) => {
  const body = ENCODER.encode(JSON.stringify(payload));
  let binary = '';
  for (const byte of body) binary += String.fromCharCode(byte);
  const segment = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${segment}.signature`;
};

const secondsAgo = (seconds) => Math.floor((Date.now() - seconds * 1000) / 1000);

// 源码守卫断言一律跑在「剥离注释后」的源码上：注释里的设计说明会让
// indexOf 定位与「不包含」断言失真。
const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

// 提取单个箭头函数体（起于 `const <name>`，止于其后的第一个 `\n};`）。
// 不能用「下一个函数的起点」做终点 —— 函数定义顺序不定，终点小于起点时
// slice 返回空串，断言会对空串虚假通过（本文件踩过）。
const fnBody = (code, name) => {
  const start = code.indexOf(`const ${name}`);
  if (start === -1) return '';
  const end = code.indexOf('\n};', start);
  return end === -1 ? '' : code.slice(start, end);
};

const RESET_VIEW = 'src/views/ResetPassword/index.vue';
const ACCOUNT_VIEW = 'src/views/user-center/AccountSecurity/index.vue';
const LOGIN_VIEW = 'src/views/Login/index.vue';
const PANEL_VIEW = 'src/views/Login/TokenLoginPanel.vue';

describe('recovery-access：isRecentTokenLogin 判定', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../src/utils/recovery-access.js');
  });

  it('宽限窗内（5 分钟前 otp 登录）→ true', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'password', timestamp: secondsAgo(3600) }, { method: 'otp', timestamp: secondsAgo(300) }] });
    expect(mod.isRecentTokenLogin(jwt)).toBe(true);
  });

  it('过窗（20 分钟前 otp 登录）→ false（爆炸半径收敛）', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: secondsAgo(20 * 60) }] });
    expect(mod.isRecentTokenLogin(jwt)).toBe(false);
  });

  it('密码登录（即使刚刚）→ false', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'password', timestamp: secondsAgo(10) }] });
    expect(mod.isRecentTokenLogin(jwt)).toBe(false);
  });

  it('magiclink / recovery / email 方法同样计入（覆盖 GoTrue 版本差异）', () => {
    for (const method of ['magiclink', 'recovery', 'email']) {
      const jwt = makeJwt({ sub: 'u1', amr: [{ method, timestamp: secondsAgo(60) }] });
      expect(mod.isRecentTokenLogin(jwt)).toBe(true);
    }
  });

  it('取 amr 中最近一次 token 类登录的时间戳（先 password 后 otp 仍成立）', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: secondsAgo(120) }, { method: 'password', timestamp: secondsAgo(60) }] });
    expect(mod.isRecentTokenLogin(jwt)).toBe(true);
  });

  it('未来时间戳（时钟偏差）→ false（不把 elapsed<0 当作窗内）', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) + 600 }] });
    expect(mod.isRecentTokenLogin(jwt)).toBe(false);
  });

  it('损坏 JWT / 无 amr / 空 token → false（判不出就按最严处理）', () => {
    expect(mod.isRecentTokenLogin('not-a-jwt')).toBe(false);
    expect(mod.isRecentTokenLogin(makeJwt({ sub: 'u1' }))).toBe(false);
    expect(mod.isRecentTokenLogin('')).toBe(false);
    expect(mod.isRecentTokenLogin(null)).toBe(false);
  });

  it('接受 supabase session 对象（取 access_token）', () => {
    const session = { access_token: makeJwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: secondsAgo(60) }] }) };
    expect(mod.isRecentTokenLogin(session)).toBe(true);
  });

  it('自定义宽限窗生效', () => {
    const jwt = makeJwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: secondsAgo(20 * 60) }] });
    expect(mod.isRecentTokenLogin(jwt, Date.now(), 30 * 60 * 1000)).toBe(true);
    expect(mod.isRecentTokenLogin(jwt, Date.now(), 10 * 60 * 1000)).toBe(false);
  });

  it('RECOVERY_GRACE_MS 默认 15 分钟', () => {
    expect(mod.RECOVERY_GRACE_MS).toBe(15 * 60 * 1000);
  });
});

describe('recovery-access：readClipboardText（一键粘贴）', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mod = await import('../../src/utils/recovery-access.js');
  });

  it('剪贴板有文本 → 返回 trim 后的内容', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => '  token-abc  ') } });
    await expect(mod.readClipboardText()).resolves.toBe('token-abc');
  });

  it('剪贴板为空 → null（让调用方走手动粘贴提示）', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => '   ') } });
    await expect(mod.readClipboardText()).resolves.toBeNull();
  });

  it('权限被拒 / 读取抛错 → null（不向调用方抛错）', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: vi.fn(async () => { throw new Error('NotAllowedError'); }) } });
    await expect(mod.readClipboardText()).resolves.toBeNull();
  });

  it('浏览器不支持 readText（如 Firefox）→ null', async () => {
    vi.stubGlobal('navigator', { clipboard: {} });
    await expect(mod.readClipboardText()).resolves.toBeNull();
    vi.stubGlobal('navigator', {});
    await expect(mod.readClipboardText()).resolves.toBeNull();
  });
});

describe('AccountSecurity：token 登录宽限窗接入（源码守卫）', () => {
  let code = '';
  beforeEach(async () => {
    const source = await readFile(ACCOUNT_VIEW, 'utf-8');
    code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n');
  });

  it('判定依据是 amr（recovery-access），不是 localStorage 标志', () => {
    expect(code).toContain('isRecentTokenLogin');
    expect(code).not.toMatch(/localStorage/);
  });

  it('宽限窗内不要求当前密码（校验与提交双分支）', () => {
    // 当前密码校验必须仍然落在 !tokenLoginActive.value 的守卫之内。
    // 这里刻意不锚定具体的比较写法（原先锚的是 `currentPassword.length < 6`）——
    // 长度口径已改为走共用的 validateCurrentPassword，锚死写法会在重构时误报。
    expect(code).toMatch(/if\s*\(!tokenLoginActive\.value\)\s*\{[\s\S]{0,200}?validateCurrentPassword\(currentPassword\)/);
    expect(code).toMatch(/tokenLoginActive\.value\s*\n?\s*\?\s*await authStore\.updatePassword\(passwordForm\.newPassword\)/);
  });

  it('当前密码输入框仅在非宽限窗渲染', () => {
    expect(code).toMatch(/v-if="!tokenLoginActive"/);
  });

  it('窗内有提示文案（用户知道为什么不用填当前密码）', () => {
    expect(code).toContain('一次性 token 登录');
  });
});

describe('ResetPassword：粘贴 token 通道（源码守卫）', () => {
  let code = '';
  beforeEach(async () => {
    const source = await readFile(RESET_VIEW, 'utf-8');
    code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
      .join('\n');
  });

  it('存在手动粘贴输入框与提交处理', () => {
    expect(code).toContain('manualToken');
    expect(code).toMatch(/submitManualToken/);
    expect(code).toMatch(/autocomplete="one-time-code"/);
  });

  it('验证路径复用 verifyPasswordRecovery（与邮件链接同一 verifyOtp 代码路径）', () => {
    expect(code).toMatch(/authStore\.verifyPasswordRecovery\(tokenHash\)/);
  });

  it('上号后可直接设新密码 + 可跳过（一键上号语义）', () => {
    expect(code).toMatch(/authStore\.updatePassword\(password\)/);
    expect(code).toContain('暂不修改，直接进入');
  });

  it('有一键粘贴按钮：只填充不自动验证（令牌一次性，误触不烧凭证）', () => {
    expect(code).toMatch(/readClipboardText\(\)/);
    const pasteBody = fnBody(code, 'pasteManualToken');
    expect(pasteBody).not.toBe('');
    expect(pasteBody).toMatch(/readClipboardText/);
    expect(pasteBody).not.toMatch(/submitManualToken|verifyPasswordRecovery/);
    expect(code).toContain('粘贴');
  });

  it('用户可见文案统一为「令牌」', () => {
    expect(code).toContain('持有一次性登录令牌？');
    expect(code).toContain('验证令牌并登录');
    expect(code).not.toContain('验证 token 并登录');
  });
});

describe('Login：token 登录入口（源码守卫）', () => {
  it('登录页两套布局（移动浮层 + 桌面分栏）各有入口，面板各渲染一次', async () => {
    const code = strip(await readFile(LOGIN_VIEW, 'utf-8'));
    expect((code.match(/令牌登录/g) || []).length).toBe(2);
    expect((code.match(/<TokenLoginPanel/g) || []).length).toBe(2);
    expect(code).not.toContain('Token 登录');
  });

  it('面板必须在 </form> 之外 —— 否则 token 输入框的回车会触发密码登录表单', async () => {
    const code = strip(await readFile(LOGIN_VIEW, 'utf-8'));
    const formEnds = [...code.matchAll(/<\/form>/g)].map((m) => m.index);
    const panels = [...code.matchAll(/<TokenLoginPanel/g)].map((m) => m.index);
    expect(panels.length).toBe(2);
    for (const panelIndex of panels) {
      const lastFormEndBefore = formEnds.filter((i) => i < panelIndex).pop();
      expect(lastFormEndBefore).toBeDefined();
      // 面板与上一个 </form> 之间不得再出现新的 <form（即没有嵌进任何表单）
      const nextFormOpen = code.indexOf('<form', lastFormEndBefore);
      expect(nextFormOpen === -1 || nextFormOpen > panelIndex).toBe(true);
    }
  });

  it('面板复用 verifyPasswordRecovery；导航收尾在父级（面板 emit success）', async () => {
    const panel = strip(await readFile(PANEL_VIEW, 'utf-8'));
    expect(panel).toMatch(/verifyPasswordRecovery\(tokenHash\)/);
    expect(panel).toMatch(/autocomplete="one-time-code"/);
    // 面板自己不做路由跳转 —— 弹窗关闭链路（showLoginModal）在父级，
    // 由 @success 统一收尾后导航到 /reset-password。
    expect(panel).toMatch(/emit\('success'\)/);
    const login = strip(await readFile(LOGIN_VIEW, 'utf-8'));
    expect((login.match(/@success="handleTokenLoginSuccess"/g) || []).length).toBe(2);
    expect(login).toMatch(/router\.replace\('\/reset-password'\)/);
  });

  it('父级 handler 必须调用 handleClose —— 否则弹窗盖在重置页上不消失（回归守卫）', async () => {
    const login = strip(await readFile(LOGIN_VIEW, 'utf-8'));
    const handler = fnBody(login, 'handleTokenLoginSuccess');
    expect(handler).not.toBe('');
    expect(handler).toMatch(/handleClose\(\)/);
    expect(handler).toMatch(/tokenPanelOpen\.value = false/);
    expect(handler).toMatch(/props\.isModal/);
  });

  it('面板有一键粘贴按钮：只填充不自动验证（令牌一次性，误触不烧凭证）', async () => {
    const code = strip(await readFile(PANEL_VIEW, 'utf-8'));
    expect(code).toMatch(/readClipboardText\(\)/);
    const pasteBody = fnBody(code, 'pasteToken');
    expect(pasteBody).not.toBe('');
    expect(pasteBody).toMatch(/readClipboardText/);
    expect(pasteBody).not.toMatch(/submitToken|verifyPasswordRecovery/);
    expect(code).toContain('粘贴');
  });
});
