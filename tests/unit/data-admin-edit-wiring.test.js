import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* 数据管理面板的「接线」契约（2026-11-09）。
   起因是一条真实缺陷：EditDrawer 里「保存「商品信息」」按钮一直在 emit('saveGroup')，
   但两个 EditDrawer 实例都没绑处理器 —— 点了既不保存也不提示，是死 UI。
   Vue 不会为未监听的 emit 报错，所以这类洞只能靠源码级断言兜住。

   反证（都会在这里变红）：
   - 把 DataAdmin 里的 `@save-group="handleSaveGroup"` 删掉 → ① 的 missing 非空；
   - 把 handleSaveGroup 改回不传参（丢掉 keepOpen）→ ② 失败；
   - 模板复制时不清 id / 不顺延时间 → ③ 失败。 */

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

describe('数据管理 · 编辑抽屉接线', () => {
  const drawer = read('src/views/DataManagement/components/EditDrawer.vue');
  const admin = read('src/views/DataManagement/DataAdmin.vue');

  it('EditDrawer 声明的每个事件都有宿主监听（防死按钮）', () => {
    const block = drawer.match(/defineEmits\(\[([\s\S]*?)\]\)/);
    expect(block, '找不到 defineEmits 列表').toBeTruthy();
    const emits = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(emits.length).toBeGreaterThan(20);

    const missing = emits.filter((name) => {
      const k = kebab(name);
      return !(
        admin.includes(`@${k}=`) ||
        admin.includes(`@${k} `) ||
        admin.includes(`@${name}=`) ||
        admin.includes(`v-model:${name}`)
      );
    });

    expect(missing, `这些事件没有宿主监听，按钮会是死的：${missing.join(', ')}`).toEqual([]);
  });

  it('「保存「分组」」= 带 keepOpen 的整条保存（存完不关抽屉）', () => {
    // 两个 EditDrawer 实例（详情槽位 + 列表抽屉）都必须绑
    const bindings = admin.match(/@save-group="handleSaveGroup"/g) || [];
    expect(bindings.length, '两处 EditDrawer 实例都要绑 @save-group').toBe(2);

    const handler = admin.match(/const handleSaveGroup = ([^;]+);/);
    expect(handler, '找不到 handleSaveGroup').toBeTruthy();
    expect(handler[1]).toContain('saveData({ keepOpen: true })');
  });

  it('「以此为模板」清主键与开奖/统计字段，抽奖退回草稿并顺延一周', () => {
    const strip = admin.match(/const TEMPLATE_STRIP_KEYS = new Set\(\[([\s\S]*?)\]\)/);
    expect(strip, '找不到 TEMPLATE_STRIP_KEYS').toBeTruthy();
    for (const key of [
      'id',
      'drawn_at',
      'winner_username',
      'entry_count',
      'draw_failure_message',
    ]) {
      expect(strip[1], `模板复制必须清掉 ${key}`).toContain(`'${key}'`);
    }

    const fn = admin.match(/const handleCreateFromTemplate = \(\) => \{([\s\S]*?)\n\};/);
    expect(fn, '找不到 handleCreateFromTemplate').toBeTruthy();
    // 复制 = 切回新增态（否则保存会覆盖原记录，这是最危险的错法）
    expect(fn[1]).toContain('isEditing.value = false');
    expect(fn[1]).toContain("next.status = 'draft'");
    const shifts = fn[1].match(/shiftDateTimeValue\(next\.(entry_deadline_at|draw_at), 7\)/g) || [];
    expect(shifts.length, '报名截止与开奖时间都要顺延 7 天').toBe(2);
  });
});

describe('数据管理 · 未保存草稿角标', () => {
  const admin = read('src/views/DataManagement/DataAdmin.vue');
  const sidebar = read('src/views/DataManagement/components/AdminSidebar.vue');

  it('角标计数按 tabs 配置映射到侧栏模块，不另写一张映射表', () => {
    expect(admin).toContain(':module-badges="draftBadges"');
    const fn = admin.match(/const refreshDraftBadges = \(\) => \{([\s\S]*?)\n\};/);
    expect(fn, '找不到 refreshDraftBadges').toBeTruthy();
    expect(fn[1]).toContain('tabs.find((tab) => tab.id === tabId)?.module');
    expect(fn[1]).toContain('counts[moduleId] = (counts[moduleId] || 0) + 1');
  });

  it('草稿写入与清除后都会刷新角标（否则角标永远停在冷启动那一刻）', () => {
    const save = admin.match(/const saveCurrentDraft = \(\) => \{([\s\S]*?)\n\};/);
    const clear = admin.match(/const clearCurrentDraft = \(\) => \{([\s\S]*?)\n\};/);
    expect(save[1]).toContain('refreshDraftBadges()');
    expect(clear[1]).toContain('refreshDraftBadges()');
  });

  it('侧栏渲染数字角标，且 0 值不出角标', () => {
    expect(sidebar).toContain('moduleBadges: { type: Object, default: () => ({}) }');
    expect(sidebar).toContain('class="g-nav-badge"');
    const fn = sidebar.match(/const badgeCount = \(moduleId\) => \{([\s\S]*?)\n\};/);
    expect(fn, '找不到 badgeCount').toBeTruthy();
    expect(fn[1]).toContain('count > 0 ? count : 0');
  });
});

describe('数据管理 · 抽奖开奖失败可见性', () => {
  const ops = read('src/views/DataManagement/composables/useLotteryOperations.js');
  const panel = read('src/views/DataManagement/components/LotteryOperationsPanel.vue');

  it('到期抽奖的快照必须带上失败原因字段', () => {
    /* 查询链中间夹了一段说明注释（为什么必须取失败原因），所以不能要求 from→select 紧邻 */
    const selects = [...ops.matchAll(/\.select\(\s*'([^']*draw_failure_message[^']*)'\s*\)/g)];
    expect(
      selects.length,
      'dueLotteries 的查询没有取 draw_failed_at / draw_failure_message',
    ).toBeGreaterThan(0);
    const fields = selects[0][1];
    expect(fields).toContain('draw_failed_at');
    expect(fields).toContain('id');
    expect(fields).toContain('title');
  });

  it('工作台把「开奖失败」与「等待开奖」区分开，失败用 danger 语气并展示原因', () => {
    const fn = panel.match(
      /\.\.\.\(props\.snapshot\.dueLotteries \|\| \[\]\)\.map\(\(item\) => \{([\s\S]*?)\n    \}\),/,
    );
    expect(fn, '找不到 dueLotteries 的展示映射').toBeTruthy();
    expect(fn[1]).toContain('item.draw_failed_at');
    expect(fn[1]).toContain('draw_failure_message');
    expect(fn[1]).toContain("tone: failed ? 'danger' : 'info'");
  });

  it('到期未开奖时侧栏「抽奖管理」亮红点，且冷启动就拉一次快照', () => {
    const sidebar = read('src/views/DataManagement/components/AdminSidebar.vue');
    const admin = read('src/views/DataManagement/DataAdmin.vue');

    expect(sidebar).toContain('alertModules: { type: Array, default: () => [] }');
    const hasAlert = sidebar.match(/const hasAlert = \(moduleId\) =>([\s\S]*?);/);
    expect(hasAlert, '找不到 hasAlert').toBeTruthy();
    // 审核红点的既有语义不能被这次改造吞掉
    expect(hasAlert[1]).toContain("moduleId === 'moderation' && props.hasUnmoderated");
    expect(hasAlert[1]).toContain('alertSet.value.has(moduleId)');

    expect(admin).toContain(':alert-modules="lotteryAlertModules"');
    const alertModules = admin.match(/const lotteryAlertModules = computed\(([\s\S]*?)\n\);/);
    expect(alertModules, '找不到 lotteryAlertModules').toBeTruthy();
    expect(alertModules[1]).toContain('lotteryOperationsSnapshot.dueLotteryCount > 0');

    /* 原实现只在切到抽奖模块时才刷新快照 ⇒ 直接进别的 tab 时红点永不亮（漏报） */
    const mount = admin.match(/onMounted\(\(\) => \{([\s\S]*?)\n\}\);/);
    expect(mount, '找不到 onMounted').toBeTruthy();
    expect(mount[1]).toContain('refreshLotteryOperationsSnapshot()');
  });
});

describe('数据管理 · 最近删除（本机快照）', () => {
  const admin = read('src/views/DataManagement/DataAdmin.vue');
  const mut = read('src/views/DataManagement/composables/useDataAdminMutations.js');
  const persist = read('src/views/DataManagement/composables/useDataAdminPersistence.js');

  it('存储键独立，不与草稿/变更日志混用', () => {
    expect(persist).toContain("deletedSnapshots: 'boh-admin-deleted-snapshots-v1'");
  });

  it('单条与批量删除成功后都落一份快照', () => {
    const calls = mut.match(/recordDeletedSnapshots\?\.\(\{/g) || [];
    expect(calls.length, '单条与批量两条删除路径都要接上').toBe(2);
  });

  it('快照写在删除成功之后，不是删除之前', () => {
    const block = mut.match(/const deleteItem = async \(item\) => \{([\s\S]*?)\n  \};/);
    expect(block, '找不到 deleteItem').toBeTruthy();
    const throwAt = block[1].indexOf('if (error) throw error;');
    const recordAt = block[1].indexOf('recordDeletedSnapshots?.({');
    expect(throwAt).toBeGreaterThan(-1);
    expect(recordAt).toBeGreaterThan(throwAt);
  });

  it('最多留 30 条，恢复走 API 模块 insert 回原表并从快照里移除', () => {
    expect(admin).toContain('const DELETED_SNAPSHOT_LIMIT = 30;');
    const record = admin.match(
      /const recordDeletedSnapshots = \(\{ table, tab, tabLabel, items \} = \{\}\) => \{([\s\S]*?)\n\};/,
    );
    expect(record, '找不到 recordDeletedSnapshots').toBeTruthy();
    expect(record[1]).toContain('.slice(0, DELETED_SNAPSHOT_LIMIT)');

    const restore = admin.match(
      /const restoreDeletedSnapshot = async \(entry\) => \{([\s\S]*?)\n\};/,
    );
    expect(restore, '找不到 restoreDeletedSnapshot').toBeTruthy();
    /* 视图里不许直连 supabase（check:layering 对 DataAdmin 的直连次数有棘轮），
       恢复统一走 data-admin-table-api 的 insertAdminRow */
    expect(restore[1]).toContain('await insertAdminRow(entry.table, row)');
    expect(restore[1]).not.toContain('supabase.from(');
    expect(restore[1]).toContain('removeDeletedSnapshot(entry)');
  });
});
