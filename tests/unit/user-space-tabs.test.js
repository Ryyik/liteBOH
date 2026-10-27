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
      // 空白宽容：prettier 可能把解构重排为单行/加尾逗号，只守卫「mountedTabs 被解构消费」语义
      /const\s*\{[^}]*ensureTabMounted[^}]*mountedTabs[^}]*\}\s*=\s*useUserSpaceTabs\(/,
    );
  });

  it('latches the settings tab with v-if + v-show instead of bare v-if', () => {
    // 只改成裸 v-show 是错的：元素从 UserSpace 首帧就渲染，
    // 该 tab 的子面板会在用户从未访问时就被挂载并取数（提前付费）。
    // 闩锁 = 没访问过不挂载，访问过一次就复用。
    const tab = 'settings';
    expect(mainSource).toMatch(
      new RegExp(
        `v-if="currentTab === '${tab}' \\|\\| leavingTab === '${tab}' \\|\\| mountedTabs\\.${tab}"`,
      ),
    );
    expect(mainSource).toMatch(
      new RegExp(`v-show="currentTab === '${tab}' \\|\\| leavingTab === '${tab}'"`),
    );
  });

  it('资产 tab 走「访问过」闩锁，不退回裸 v-show', () => {
    // 2026-10-26：资产从「我」页分段**还原为独立 tab**（?tab=assets，底栏无席位），
    // 所以它回到上面的 tab 闩锁体系里；闩锁语义不变 ——
    // 分段/独立页若是裸 v-show，AssetsHubPanel 会在进入 UserSpace 首帧就挂载并跑
    // onMounted 取数（fetchUserTier / products / 抽奖 / 订阅），正是当初加闩锁要防的事。
    expect(mainSource).toMatch(/v-if="mountedTabs\.assets"/);
    expect(mainSource).toMatch(/v-show="currentTab === 'assets'/);
  });

  it('印象降为「我」页内容 tab，数据由父层单实例供给（切走不重取）', () => {
    // 2026-10-26：段控压成一层（底栏 → 内容 tab），印象不再是「我」页段控的第三段。
    // 它由 activeContentTab 驱动，但**数据不在这里取**：impressions 来自父层
    // useProfileImpressions 的单实例缓存，本组件只透传 props ⇒ 来回切不重复请求。
    const homeSource = readFileSync(
      resolve(root, 'src/views/user-center/UserSpace/components/ProfileHomePanel.vue'),
      'utf8',
    );
    expect(homeSource).toMatch(/v-else-if="activeContentTab === 'impressions'"/);
    expect(homeSource).toContain(':impressions="impressions"');
    expect(homeSource).toContain('@load-more-impressions="$emit(\'load-more-impressions\')"');
  });

  it('keeps the other sections on plain v-show', () => {
    // community / posts / messages 本来就是常驻 + v-show；被加上闩锁条件也不会更差，
    // 但如果反过来被改成 v-if，就会退回「离开即销毁」。方向性守卫。
    for (const tab of ['community', 'posts', 'messages']) {
      // 空白宽容：prettier 会把 <div v-show="…"> 的属性折行，不再锚定 <div 前缀，
      // 只守卫「这三个分区保持 v-show 常驻、不退回 v-if」的方向性。
      expect(mainSource).toMatch(new RegExp(`v-show="currentTab === '${tab}'`));
    }
  });

  it('does not latch the settings sub-panels (DataExportPanel polls while mounted)', () => {
    // 闩锁只能加在外层 tab-page。内层档位若一并常驻，DataExportPanel 的
    // pollTimer（setInterval 轮询导出进度）就会变成后台常驻轮询。
    // 内层必须继续由 settingsSection 驱动 v-if / v-else-if。
    // ⚠️ 2026-10-26 四组收敛为「账户与隐私 / 内容与存储 / 通用 / 账户」后，
    // home 档由 ProfileSettingsPanel 自己按 active-section 渲染，不再有独立的
    // `settingsSection === 'home'` 分支；这里只锁「内层档位仍是条件渲染」这一契约。
    expect(mainSource).toMatch(/v-if="settingsSection === 'data-export'"/);
    expect(mainSource).toMatch(/v-else-if="settingsSection === 'data-management'"/);
    expect(mainSource).toMatch(/v-else-if="settingsSection === 'account-security'"/);
    expect(mainSource).not.toMatch(/mountedTabs\.(data-export|edit-profile|data-management)/);
  });
});
