import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useUserSpaceTabs } from '../../src/views/user-center/UserSpace/composables/useUserSpaceTabs.js';

const root = resolve(import.meta.dirname, '../..');
const mainSource = readFileSync(
  resolve(root, 'src/views/user-center/UserSpace/UserSpaceMain.vue'),
  'utf8',
);

// 2026-09 IA 重构后的底栏（与 UserSpaceMain.vue 的 navItems 一致）
const navItems = [
  { id: 'community' },
  { id: 'posts' },
  { id: 'assets' },
  { id: 'messages' },
  { id: 'settings' },
];

describe('useUserSpaceTabs', () => {
  it('mounts the requested route tab on the first render', () => {
    const tabs = useUserSpaceTabs(navItems, 'assets');

    expect(tabs.currentTab.value).toBe('assets');
    expect(tabs.mountedTabs.assets).toBe(true);
    expect(tabs.mountedTabs.community).toBe(false);
  });

  it('falls back to community for an invalid initial tab', () => {
    const tabs = useUserSpaceTabs(navItems, 'unknown');

    expect(tabs.currentTab.value).toBe('community');
    expect(tabs.mountedTabs.community).toBe(true);
  });
});

describe('UserSpaceMain 把 mountedTabs 闩锁接到模板上', () => {
  it('consumes mountedTabs from the composable (not just ensureTabMounted)', () => {
    // 背景：mountedTabs 曾长期是**死代码** —— composable 里定义好、ensureTabMounted 被调了
    // 三次，模板却从未读取它。于是 assets / settings 只能用「离开即销毁」的 v-if，
    // 每次切回都重建组件并重跑 onMounted 取数（实测切回资产稳定打 5 个数据请求）。
    // 接上闩锁后降到 0。这条守卫防的是「闩锁又被当成无用字段删掉」。
    expect(mainSource).toMatch(
      /ensureTabMounted,\s*\n\s*mountedTabs\s*\n\}\s*=\s*useUserSpaceTabs\(/,
    );
  });

  it('latches assets/settings with v-if + v-show instead of bare v-if', () => {
    // 只改成裸 v-show 是错的：元素从 UserSpace 首帧就渲染，
    // AssetsHubPanel 会在用户从未访问资产时就被挂载并取数（提前付费）。
    // 闩锁 = 没访问过不挂载，访问过一次就复用。
    for (const tab of ['assets', 'settings']) {
      expect(mainSource).toMatch(
        new RegExp(
          `v-if="currentTab === '${tab}' \\|\\| leavingTab === '${tab}' \\|\\| mountedTabs\\.${tab}"`,
        ),
      );
      expect(mainSource).toMatch(
        new RegExp(`v-show="currentTab === '${tab}' \\|\\| leavingTab === '${tab}'"`),
      );
    }
  });

  it('keeps the other three sections on plain v-show', () => {
    // community / posts / messages 本来就是常驻 + v-show；被加上闩锁条件也不会更差，
    // 但如果反过来被改成 v-if，就会退回「离开即销毁」。方向性守卫。
    for (const tab of ['community', 'posts', 'messages']) {
      expect(mainSource).toMatch(new RegExp(`<div v-show="currentTab === '${tab}'`));
    }
  });

  it('does not latch the settings sub-panels (DataExportPanel polls while mounted)', () => {
    // 闩锁只能加在外层 tab-page。内层档位若一并常驻，DataExportPanel 的
    // pollTimer（setInterval 轮询导出进度）就会变成后台常驻轮询。
    // 内层必须继续由 settingsSection 驱动 v-if / v-else-if。
    expect(mainSource).toMatch(/v-if="settingsSection === 'home'"/);
    expect(mainSource).toMatch(/v-else-if="settingsSection === 'data-export'"/);
    expect(mainSource).not.toMatch(/mountedTabs\.(data-export|edit-profile|data-management)/);
  });
});
