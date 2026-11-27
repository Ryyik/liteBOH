/**
 * 设置页「层级必须住 URL」的源码守卫（2026-11-26）
 *
 * 报障：在「通行密钥」屏刷新，回来却是「更换邮箱」页。
 * 真因：二级组页（activeEntryId）与账户安全面板（settingsSecurityPanel）**全在内存**，
 * 刷新等于清空内存，于是回落到 settingsSection 的初值 + panel 默认 'email'。
 *
 * 修复：层级搬进 URL —— `?group=`（二级组页）与 `?panel=`（账户安全开哪一屏）。
 *
 * 为什么用源码断言而不是行为测试：
 *   断言的本质是「层级真源不许退回内存态」。要真的跑行为，得把整个
 *   UserSpaceMain + 路由 + Pinia 都拉起来，噪声远大于收益；而这条回归的形态很固定
 *   —— 有人把 `emit('open-group')` 改回 `activeEntryId.value = ...`，
 *   或把 `settingsSecurityPanel` 改成纯 ref 写入、不落 query。
 *   ⚠️ 断言只挑「契约句」，不挑整段代码 —— 避免被 prettier 重排打成假红
 *      （见 docs/guides/gate-matrix.md 关于 format-immunity 的记录）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const PANEL_SRC = read('src/views/user-center/UserSpace/components/ProfileSettingsPanel.vue');
const MAIN_SRC = read('src/views/user-center/UserSpace/UserSpaceMain.vue');

describe('设置页层级住 URL（刷新后可恢复）', () => {
  it('面板不再自己持有 activeEntryId ref（层级由 props.activeGroup 镜像）', () => {
    // 旧写法：const activeEntryId = ref('');
    expect(PANEL_SRC).not.toMatch(/const\s+activeEntryId\s*=\s*ref\(/);
    // 新写法：computed 读 props.activeGroup
    expect(PANEL_SRC).toContain('props.activeGroup');
  });

  it('面板用 emit 表达层级意图，不直接改状态', () => {
    expect(PANEL_SRC).toContain("emit('open-group'");
    expect(PANEL_SRC).toContain("emit('close-group'");
    // 反向断言：这两个函数体里不该再出现对 activeEntryId 的赋值语句
    const openEntryBody = PANEL_SRC.slice(PANEL_SRC.indexOf('const openEntry ='));
    expect(openEntryBody.slice(0, 600)).not.toContain('activeEntryId.value =');
  });

  it('宿主把 group / panel 写进 query 并读回来（单一真源）', () => {
    expect(MAIN_SRC).toContain('applySettingsLayersToQuery');
    expect(MAIN_SRC).toContain('syncSettingsLayersFromRoute');
    // `?group=` 必须有专门的 watch —— 只靠 view watch 抓不到「同一 view 内换组」
    expect(MAIN_SRC).toMatch(/route\.query\.group/);
    // `?panel=` 要能被读回账户安全面板
    expect(MAIN_SRC).toContain('normalizeAccountSecurityPanel(route.query.panel)');
  });

  it('导航岛沉浸态不再依赖「二级页不改 URL」这个旧前提', () => {
    // 旧注释里写着「竖屏点组行进二级页不改 URL（openEntry 是纯内存态）」——
    // 那句话随本次修复失效，留着会误导后来者按旧前提改判据。
    expect(PANEL_SRC).not.toContain('openEntry 是纯内存态');
  });
});
