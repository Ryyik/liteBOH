import { describe, expect, it } from 'vitest';
import {
  HIDDEN_TAB_IDS,
  NAV_GROUPS,
  NAV_GROUPS_WITH_ROW_META,
  ROW_ID_BY_TAB_ID,
  resolveNavRowIdForModule,
  resolveNavRowIdForTab,
} from '@/views/DataManagement/config/nav-groups.js';
import { tabs, tabModules } from '@/views/DataManagement/config/tabs.js';

/**
 * 后台侧栏「设置页式分组」的结构守卫（plans/048 期 2，2026-11-25）。
 *
 * ── 为什么需要这道守卫 ────────────────────────────────────────────────
 * 分组结构是**纯配置**（`config/nav-groups.js`），没有任何类型能保证它和
 * `config/tabs.js` 保持一致。这类漂移不会报错、不会白屏，只表现为：
 *   · 某个页签在侧栏里消失了，但 `?tab=` 还能打开 ⇒ 「有的页面像是不存在」
 *   · 某个控制台路由没有行 ⇒ 只能手敲地址（gate-console 当初就是这么漏的）
 *   · 某组塞了 12 行 ⇒ 「一屏看全」这个目标当场失效，但没人在提交时发现
 * 所以在源码层把三条关系锁死。
 *
 * ── 反证（改任一条都必须让它变红）─────────────────────────────────────
 *   1) 从 `NAV_GROUPS` 里删掉「社区」整个分组 ⇒ 「每个可见页签都有去处」红
 *   2) 给「用户」组加第 9 行 ⇒ 「每组行数 ≤ 8」红
 *   3) 把某个 `-console` 的 module 行删掉 ⇒ 「每个控制台路由都有行」红
 *   4) 把 `points` 移出 `mergedFrom` ⇒ 「融合页签能反查到行」红
 */

/** 侧栏结构化遍历：拿到所有行（含 children） */
const allRows = () => {
  const out = [];
  const walk = (rows) =>
    rows.forEach((row) => {
      out.push(row);
      if (Array.isArray(row.children)) walk(row.children);
    });
  NAV_GROUPS.forEach((group) => walk(group.rows));
  return out;
};

/** 侧栏里**可直达**的页签 id（不含 hidden） */
const reachableTabIds = () => {
  const ids = new Set();
  allRows().forEach((row) => {
    if (row.kind === 'tab' && row.tabId) ids.add(row.tabId);
    // mergedFrom：被并进这一行的页签。它们没有自己的行，但通过这一行可达
    (row.mergedFrom || []).forEach((tabId) => ids.add(tabId));
  });
  return ids;
};

const allTabIds = tabs.map((tab) => tab.id);

/**
 * 「只留 label 供旧深链」的过渡页签（plans/048 §8.1 末行）。
 *
 * 它们**本来就不在任何 `tabIds` 里**（实测：`tabIds` 去重后正好 54 = `tabs` 54 条，
 * 所以这两个不在其中的话，说明它们从来没被侧栏渲染过）。
 * 留着定义只为 `?tab=api-keys` / `?tab=freemodels` 能取到标题、并落到 `keys-models`。
 *
 * ⚠️ 不要把它们塞进 `HIDDEN_TAB_IDS` —— 那个列表的语义是「曾经在侧栏、现在移除」，
 *    而这两个从未在侧栏出现过。混在一起会让「可达 + 隐藏 = 全部」这条等式失去意义。
 */
const LEGACY_LABEL_ONLY_TABS = new Set(['api-keys', 'freemodels']);

/** 每组的「顶层行数」上限：44px × 8 ≈ 352px，加组头正好一屏 */
const MAX_ROWS_PER_GROUP = 8;

describe('侧栏分组结构 · 与 tabs.js 的对账', () => {
  it('分组结构非空（防止导入写错导致整组断言空跑）', () => {
    expect(NAV_GROUPS.length).toBeGreaterThanOrEqual(6);
    expect(allRows().length).toBeGreaterThan(30);
  });

  it('每个页签都有去处：要么在侧栏某一行里，要么在 HIDDEN_TAB_IDS 里', () => {
    const reachable = reachableTabIds();
    const hidden = new Set(HIDDEN_TAB_IDS);
    const orphans = allTabIds.filter(
      (id) => !reachable.has(id) && !hidden.has(id) && !LEGACY_LABEL_ONLY_TABS.has(id),
    );
    expect(orphans, `这些页签既不在侧栏、也没标记删除：${orphans.join(', ')}`).toEqual([]);
  });

  it('反向也成立：侧栏引用的 tabId 都必须真实存在于 tabs.js', () => {
    const known = new Set(allTabIds);
    const bogus = [...reachableTabIds()].filter((id) => !known.has(id));
    expect(bogus, `侧栏引用了不存在的页签：${bogus.join(', ')}`).toEqual([]);
  });

  it('HIDDEN_TAB_IDS 里的每个 id 都真实存在（防止删了个错名字的空跑）', () => {
    const known = new Set(allTabIds);
    const bogus = HIDDEN_TAB_IDS.filter((id) => !known.has(id));
    expect(bogus, `HIDDEN_TAB_IDS 里有不存在的页签：${bogus.join(', ')}`).toEqual([]);
  });

  it('HIDDEN_TAB_IDS 不该混进「只留 label」的过渡页签（两者语义不同）', () => {
    const mixed = HIDDEN_TAB_IDS.filter((id) => LEGACY_LABEL_ONLY_TABS.has(id));
    expect(mixed, `这些是过渡页签、从未在侧栏出现过：${mixed.join(', ')}`).toEqual([]);
  });

  it('隐藏与可达不重叠：一个页签不能既在侧栏又标成删除', () => {
    const reachable = reachableTabIds();
    const overlap = HIDDEN_TAB_IDS.filter((id) => reachable.has(id));
    expect(overlap, `这些页签既可见又被标删除：${overlap.join(', ')}`).toEqual([]);
  });

  it('可达 + 隐藏 = 全部页签（不多不少，这是对账的核心等式）', () => {
    // 排除「只留 label」的两个过渡页签：它们从来没有过侧栏入口，
    // 既不占「可达」也不该算「被移除」，混进等式会变成假账。
    const counted = allTabIds.length - LEGACY_LABEL_ONLY_TABS.size;
    expect(reachableTabIds().size + new Set(HIDDEN_TAB_IDS).size).toBe(counted);
  });
});

describe('侧栏分组结构 · 几何与可达性', () => {
  it(`每组顶层行数 ≤ ${MAX_ROWS_PER_GROUP}（超过一屏就失去「一屏看全」的意义）`, () => {
    const tooBig = NAV_GROUPS.filter((group) => group.rows.length > MAX_ROWS_PER_GROUP).map(
      (group) => `${group.label}(${group.rows.length} 行)`,
    );
    expect(tooBig, `这些组超过 ${MAX_ROWS_PER_GROUP} 行：${tooBig.join(', ')}`).toEqual([]);
  });

  it('每组至少一行（空组会渲染出一个空组头）', () => {
    const empty = NAV_GROUPS.filter((group) => group.rows.length === 0).map((g) => g.label);
    expect(empty).toEqual([]);
  });

  it('子页最多 6 项：再多就该重新分组，而不是继续往下堆', () => {
    const tooDeep = allRows()
      .filter((row) => Array.isArray(row.children) && row.children.length > 6)
      .map((row) => `${row.label}(${row.children.length})`);
    expect(tooDeep, `这些子页超过 6 项：${tooDeep.join(', ')}`).toEqual([]);
  });

  it('不支持第三层：子行不能再有 children（否则超出「两次点击可达」的预算）', () => {
    const nested = allRows()
      .filter((row) => Array.isArray(row.children))
      .flatMap((row) => row.children)
      .filter((child) => Array.isArray(child.children));
    expect(nested.map((row) => row.id)).toEqual([]);
  });

  it('行 id 全局唯一（v-for 的 :key 直接用它，重名会导致高亮串行）', () => {
    const ids = allRows().map((row) => row.id);
    const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(dup, `重复的行 id：${[...new Set(dup)].join(', ')}`).toEqual([]);
  });

  it('每个叶子行都有明确落点（kind 决定宿主怎么跳，缺了就是死按钮）', () => {
    const broken = allRows()
      .filter((row) => row.kind !== 'group')
      .filter((row) => {
        if (row.kind === 'tab') return !row.tabId;
        if (row.kind === 'module') return !row.moduleId;
        if (row.kind === 'section') return !row.section;
        return true;
      })
      .map((row) => `${row.id}(${row.kind})`);
    expect(broken, `这些行没有可用落点：${broken.join(', ')}`).toEqual([]);
  });

  it('kind 只用四种合法值（新增 kind 必须同时改宿主的 handleNavRowClick）', () => {
    const kinds = new Set(allRows().map((row) => row.kind));
    [...kinds].forEach((kind) => {
      expect(['tab', 'module', 'section', 'group']).toContain(kind);
    });
  });
});

describe('侧栏分组结构 · 独立控制台不能丢', () => {
  /** 从 tabModules 里挑出所有 page 型独立控制台（即 /admin/*-console 那一族） */
  const consoleModuleIds = tabModules
    .filter((mod) => mod.type === 'page' && mod.id !== 'overview')
    .map((mod) => mod.id);

  it('确实有独立控制台（避免选择器写错导致这条断言空跑）', () => {
    expect(consoleModuleIds.length).toBeGreaterThanOrEqual(5);
    expect(consoleModuleIds).toContain('hero-console');
  });

  it('每个独立控制台在侧栏都有一行（否则只能手敲地址）', () => {
    const moduleRows = new Set(
      allRows()
        .filter((row) => row.kind === 'module' && row.moduleId)
        .map((row) => row.moduleId),
    );
    const missing = consoleModuleIds.filter((id) => !moduleRows.has(id));
    expect(missing, `这些控制台没有侧栏入口：${missing.join(', ')}`).toEqual([]);
  });

  it('resolveNavRowIdForModule 能把控制台反查到行（进页后侧栏要高亮）', () => {
    consoleModuleIds.forEach((id) => {
      expect(resolveNavRowIdForModule(id), `${id} 反查不到行`).toBeTruthy();
    });
  });
});

describe('侧栏分组结构 · 高亮反查', () => {
  it('每个可达页签都能反查到行（深链打开时侧栏不能「一个都没选中」）', () => {
    const reachable = reachableTabIds();
    const missing = [...reachable].filter((tabId) => !resolveNavRowIdForTab(tabId));
    expect(missing, `这些页签反查不到行：${missing.join(', ')}`).toEqual([]);
  });

  it('被融合的页签落回它被并进的那一行（?tab=points 要高亮「用户」）', () => {
    // points 是 profiles 表的另一个视图，被并进「用户」行
    expect(resolveNavRowIdForTab('points')).toBe('users');
    // shopOrders / gifts 是履约台的数据源视图
    expect(resolveNavRowIdForTab('shopOrders')).toBe('fulfillment');
    expect(resolveNavRowIdForTab('gifts')).toBe('fulfillment');
  });

  it('未知页签返回空串而不是抛错（宿主可能传进被删掉的旧 id）', () => {
    expect(resolveNavRowIdForTab('__not_a_tab__')).toBe('');
  });

  it('ROW_ID_BY_TAB_ID 覆盖全部可达页签', () => {
    const reachable = reachableTabIds();
    const missing = [...reachable].filter((tabId) => !ROW_ID_BY_TAB_ID.has(tabId));
    expect(missing).toEqual([]);
  });
});

describe('侧栏分组结构 · 行元信息', () => {
  it('NAV_GROUPS_WITH_ROW_META 给每个顶层行补上了 groupId', () => {
    NAV_GROUPS_WITH_ROW_META.forEach((group) => {
      group.rows.forEach((row) => {
        expect(row.groupId, `${row.id} 缺少 groupId`).toBe(group.id);
      });
    });
  });

  it('组的 id 唯一（侧栏 v-for :key 用它）', () => {
    const ids = NAV_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每组都有 label（组头要显示文字，空 label 就是个空行）', () => {
    NAV_GROUPS.forEach((group) => {
      expect(String(group.label || '').trim()).not.toBe('');
    });
  });
});
