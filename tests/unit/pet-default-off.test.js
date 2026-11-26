/**
 * pet-default-off.test.js — 「小方默认关 + 一次性迁移」（2026-11-24 用户口径）
 *
 * 用户原话：「设置里要允许关闭小方（默认为用户关闭）」。
 * 这句话有两半，缺任何一半都不算做到：
 *   ① 新用户默认**看不到**小方（不能只靠用户自己去关）；
 *   ② 老用户（盘上已经躺着 petEnabled: true）**也要**变成关 —— 只改默认值对他们是空操作。
 *
 * 为什么老用户这条必须单独测：
 *   `useGlobalAiPreferences` 的 `ensurePersistence` 用 deep watch 把**整份**偏好写盘，
 *   所以 2026-11-23 上线后任何一次「改主题 / 调玻璃透明度 / 切发送键」都会顺手把
 *   `petEnabled: true` 写进 localStorage。用户从没选过，但盘上有值 ⇒
 *   `{...defaults, ...saved}` 会用它覆盖新的 false 默认值。这是最容易漏的一层。
 *
 * 迁移必须**只发生一次**：用户迁移后自己打开小方，就是明确选择；
 * 若每次启动都无条件关，表现是「开了，刷新又没了」——比不做迁移更糟。
 * 所以这里第三条断言是反向的：代次已盖章时，petEnabled: true 必须被尊重。
 *
 * ⚠️ 测试环境是 `environment: 'node'`，没有 window —— 而本模块的读盘分支是
 *    `if (typeof window === 'undefined') return {...defaults}`。所以这里必须**先**
 *    造一个只带 localStorage 的 window，否则整组断言测的是「默认值」，
 *    迁移逻辑一行都没跑到，会假绿。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'boh_global_ai_preferences_v1';
const realWindow = globalThis.window;

beforeAll(() => {
  /* 极简 window：只用 localStorage，本模块不读别的 */
  globalThis.window = { localStorage };
});

afterAll(() => {
  if (realWindow === undefined) delete globalThis.window;
  else globalThis.window = realWindow;
});

/** 每个用例重新加载模块 —— preferences 是模块级单例，import 期就读盘 */
const load = async (saved) => {
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem(KEY, JSON.stringify(saved));
  vi.resetModules();
  return import('../../src/composables/useGlobalAiPreferences.js');
};

describe('小方默认关闭', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('干净盘（新用户）⇒ petEnabled 默认 false', async () => {
    const mod = await load(undefined);
    const { preferences } = mod.useGlobalAiPreferences();
    expect(preferences.petEnabled).toBe(false);
  });

  it('⭐ 老盘的 petEnabled: true 会被迁移成关（只改默认值没用）', async () => {
    const mod = await load({ petEnabled: true, appearance: 'dark' });
    const { preferences } = mod.useGlobalAiPreferences();
    expect(preferences.petEnabled).toBe(false);
    // 迁移不能顺手把其他偏好清掉
    expect(preferences.appearance).toBe('dark');
  });

  it('⭐ 迁移只做一次：盖章之后用户自己打开必须被尊重', async () => {
    // 先空盘加载一次拿到当前代次（不要把 2 写死 —— 常量改了这条会假绿）
    const { PET_DEFAULT_OFF_VERSION } = await load(undefined);
    const mod = await load({ petEnabled: true, petDefaultOffVersion: PET_DEFAULT_OFF_VERSION });
    const { preferences } = mod.useGlobalAiPreferences();
    expect(preferences.petEnabled).toBe(true);
  });

  it('老盘的未知键 / 脏数据不影响迁移（不抛错）', async () => {
    const mod = await load({ petEnabled: true, gestureEnabled: true, junk: { a: 1 } });
    const { preferences } = mod.useGlobalAiPreferences();
    expect(preferences.petEnabled).toBe(false);
  });

  it('代次常量导出且为正数（迁移靠它判新旧，别改成 0）', async () => {
    const mod = await import('../../src/composables/useGlobalAiPreferences.js');
    expect(typeof mod.PET_DEFAULT_OFF_VERSION).toBe('number');
    expect(mod.PET_DEFAULT_OFF_VERSION).toBeGreaterThan(0);
  });
});

describe('设置页有开关（小方关掉后的重开回路）', () => {
  /**
   * 这一条是源码级断言：面板是 2000+ 行的 SFC，挂载成本高且本仓没有
   * @vue/test-utils。用「模板/脚本里必须同时出现 toggle 行 + 偏好写回」锁住接线，
   * 真正的点击路径由 `probe-boh-pet-voice.mjs` 的端到端场景覆盖。
   */
  it('「通用」组里有小方开关，且直接写偏好（不经宿主 emit）', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { squeezeSource } = await import('../helpers/source.js');
    const src = readFileSync(
      resolve(
        import.meta.dirname,
        '../../src/views/user-center/UserSpace/components/ProfileSettingsPanel.vue',
      ),
      'utf8',
    );
    const squeezed = squeezeSource(src);
    expect(squeezed).toContain("id: 'pet'");
    expect(squeezed).toContain('label: ' + "'小方挂件'");
    // 开关读的是同一份偏好真源
    expect(squeezed).toMatch(/kind:\s*'toggle'[\s\S]{0,400}?preferences\.petEnabled/);
    // 点它就改偏好（App.vue 的 v-if 立刻生效），不发 emit
    expect(squeezed).toMatch(/preferences\.petEnabled\s*=\s*!/);
  });
});
