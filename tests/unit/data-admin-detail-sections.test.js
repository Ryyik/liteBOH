import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataConfig } from '@/views/DataManagement/config/tables.js';
import {
  DETAIL_SECTIONS,
  DETAIL_SECTION_OMITTED_FIELDS,
} from '@/views/DataManagement/config/detail-sections.js';

/**
 * 详情页分段 + 就地操作（plans/050 期 1 / 期 3）。
 *
 * 三条不能退化的口径：
 *   ① 配置分段必须覆盖该表全部列 —— 少写一个 key，详情页就少显示一列；
 *   ② 未配置的表必须退回原来的单组平铺（49 个页签零回归）；
 *   ③ 配置里声明的每个 action 都必须有处理点，否则就是点了没反应的入口。
 *
 * 反证：
 *   - 从 gifts 段里删掉 `shipping_phone` ⇒ 「覆盖全部列」红
 *   - 把 DetailFields 的 `v-else` 旧网格删掉 ⇒ 「未配置表零回归」红
 *   - 把 edit-points 的 action 从 DetailQuickActions 里去掉 ⇒ 「每个 action 都有处理点」红
 */

const readSrc = (relPath) => readFileSync(resolve(process.cwd(), relPath), 'utf8');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// 不在 columns 里的合成行：值来自 fetch 阶段或运行时计算，必须有显式 label
const SYNTHETIC_KEYS = new Set([
  'subscription_tier',
  'birthday',
  '__copy_address',
  '__delete_record',
]);

const flattenKeys = (sections) =>
  sections.flatMap((section) =>
    section.fields.map((item) => (typeof item === 'string' ? item : item.key)),
  );

describe('分段配置与表列一一对应', () => {
  it('只给已有的表配置分段', () => {
    for (const tabId of Object.keys(DETAIL_SECTIONS)) {
      expect(dataConfig[tabId], `未定义的表不该出现在分段配置里：${tabId}`).toBeTruthy();
    }
  });

  it('每个字段 key 都能在 columns 里找到（合成行必须带 label）', () => {
    for (const [tabId, sections] of Object.entries(DETAIL_SECTIONS)) {
      const columnKeys = new Set((dataConfig[tabId]?.columns || []).map((col) => col.key));
      for (const section of sections) {
        for (const item of section.fields) {
          if (typeof item === 'string') {
            expect(columnKeys.has(item), `${tabId} 缺少列：${item}`).toBe(true);
            continue;
          }
          if (SYNTHETIC_KEYS.has(item.key)) {
            expect(item.label, `合成行 ${item.key} 必须带 label`).toBeTruthy();
            continue;
          }
          expect(columnKeys.has(item.key), `${tabId} 缺少列：${item.key}`).toBe(true);
        }
      }
    }
  });

  it('展示字段 + 登记的不展示字段 = 全部列（新增列必须二选一）', () => {
    for (const [tabId, sections] of Object.entries(DETAIL_SECTIONS)) {
      const used = flattenKeys(sections);
      const shown = used.filter((key) => !SYNTHETIC_KEYS.has(key));
      const omitted = DETAIL_SECTION_OMITTED_FIELDS[tabId] || [];
      const columnKeys = (dataConfig[tabId]?.columns || []).map((col) => col.key);
      expect(new Set(shown).size, `${tabId} 有重复展示字段`).toBe(shown.length);
      expect(new Set([...shown, ...omitted]).size, `${tabId} 展示/不展示清单有重叠`).toBe(
        shown.length + omitted.length,
      );
      expect([...shown, ...omitted].sort(), `${tabId} 有列既没展示也没登记`).toEqual(
        [...columnKeys].sort(),
      );
    }
  });

  it('用户详情按草稿收敛为「身份 / 资产 / 操作」；订单详情含收货与进度', () => {
    const userSections = DETAIL_SECTIONS.users.map((section) => section.id);
    expect(userSections).toEqual(['identity', 'assets', 'actions']);

    const giftSections = DETAIL_SECTIONS.gifts.map((section) => section.id);
    expect(giftSections).toEqual(['order', 'shipping', 'progress', 'actions']);
  });

  it('未配置的表没有条目（DetailFields 会退回旧平铺）', () => {
    expect(DETAIL_SECTIONS.forum).toBeUndefined();
    expect(DETAIL_SECTIONS.shopOrders).toBeUndefined();
  });
});

describe('每个 action 都有处理点', () => {
  const adminSrc = stripComments(readSrc('src/views/DataManagement/DataAdmin.vue'));
  const quickSrc = stripComments(
    readSrc('src/views/DataManagement/components/detail/DetailQuickActions.vue'),
  );

  const actions = new Set(
    Object.values(DETAIL_SECTIONS)
      .flat()
      .flatMap((section) => section.fields)
      .filter((item) => typeof item === 'object' && item.action)
      .map((item) => item.action),
  );

  it('配置里声明的 action 集合就是这几个（新增必须先实现）', () => {
    expect([...actions].sort()).toEqual([
      'copy-address',
      'delete-record',
      'edit-points',
      'edit-status',
      'edit-tier',
      'toggle-ban',
      'toggle-mute',
    ]);
  });

  it('copy-address / toggle-ban / toggle-mute 在 DataAdmin 里处理', () => {
    expect(adminSrc).toContain("field.action === 'copy-address'");
    expect(adminSrc).toContain('copyTextToClipboard(');
    expect(adminSrc).toContain("field.action === 'toggle-ban' || field.action === 'toggle-mute'");
    expect(adminSrc).toContain("field.action === 'delete-record'");
    expect(adminSrc).toContain('banUser');
    expect(adminSrc).toContain('muteUser');
  });

  it('edit-status / edit-points / edit-tier 在就地面板里处理', () => {
    for (const action of ['edit-status', 'edit-points', 'edit-tier']) {
      expect(quickSrc, `缺少 ${action} 的分支`).toContain(`actionType === '${action}'`);
    }
  });
});

describe('接线守卫（源码级）', () => {
  const adminSrc = stripComments(readSrc('src/views/DataManagement/DataAdmin.vue'));
  const recordPaneSrc = stripComments(
    readSrc('src/views/DataManagement/components/detail/RecordPane.vue'),
  );
  const detailFieldsSrc = stripComments(
    readSrc('src/views/DataManagement/components/detail/DetailFields.vue'),
  );
  const quickSrc = stripComments(
    readSrc('src/views/DataManagement/components/detail/DetailQuickActions.vue'),
  );
  const grantSrc = stripComments(
    readSrc('src/views/DataManagement/components/SubscriptionGrantConsole.vue'),
  );

  it('DataAdmin → RecordPane → DetailFields 三段都把 sections / overrides 传下去', () => {
    expect(adminSrc).toContain(':sections="detailSections"');
    expect(adminSrc).toContain(':overrides="detailOverrides"');
    expect(recordPaneSrc).toContain(':sections="sections"');
    expect(recordPaneSrc).toContain(':overrides="overrides"');
    expect(recordPaneSrc).toContain('@field-action="$emit(\'field-action\', $event)"');
    expect(detailFieldsSrc).toContain("emit('field-action'");
  });

  it('未配置分段的表走旧网格（v-else），不退化成空白', () => {
    expect(detailFieldsSrc).toMatch(/v-if="resolvedSections"/);
    expect(detailFieldsSrc).toContain('v-else class="detail-fields"');
  });

  it('记录加载完成把 record 交回 DataAdmin（订阅层级/状态标签要用）', () => {
    expect(recordPaneSrc).toContain("emit('loaded'");
    expect(adminSrc).toContain('@loaded="onDetailRecordLoaded"');
  });

  it('改造后仍是「页内展开」而不是浮层（延续 plans/049）', () => {
    expect(quickSrc).not.toContain('<Teleport');
    expect(quickSrc).not.toContain('position: fixed');
  });

  it('积分允许扣除（不再有 amount > 0 的纯 UI 硬校验）', () => {
    expect(quickSrc).toContain("pointsMode.value === 'deduct'");
    expect(quickSrc).toMatch(/const signed =[\s\S]{0,120}-normalizedAmount/);
    expect(quickSrc).toContain('grantPoints({');
  });

  it('扣超余额在前端就拦住（RPC 的 greatest(0,…) 会静默截断）', () => {
    expect(quickSrc).toMatch(/normalizedAmount\.value > currentPoints\.value/);
  });

  it('订阅层级跳转带预填意图，订阅页签挂载时消费', () => {
    expect(adminSrc).toContain('setSubscriptionGrantPrefill(user)');
    expect(grantSrc).toContain('consumeSubscriptionGrantPrefill()');
    expect(grantSrc).toMatch(/mode\.value = 'selected'[\s\S]{0,160}selectedUsers\.value =/);
  });

  it('用户列表批量补订阅层级，失败只留空', () => {
    expect(adminSrc).toMatch(/fetchUserTiersBatch\(tierIds\)/);
    expect(adminSrc).toContain('row.subscription_tier =');
  });

  it('对象页在桌面也用纯文字列表（不再渲染表格）', () => {
    expect(adminSrc).toContain('isCompactRowTab || isMobileView');
    expect(adminSrc).toContain('!isMobileView && !emptyState && !isCompactRowTab');
  });

  it('详情页的纯文字形态由 plain 一路传到子组件', () => {
    expect(adminSrc).toContain(':plain="isPlainRecordTab"');
    expect(recordPaneSrc).toContain(':plain="plain"');
    expect(recordPaneSrc).toContain('v-if="!editing && !plain"');
  });

  it('竖屏紧凑行：点整行进详情，勾选只在「选择」模式出现', () => {
    expect(adminSrc).toContain('isCompactRowTab');
    expect(adminSrc).toContain("new Set(['users', 'gifts'])");
    expect(adminSrc).toContain('onCompactRowClick');
    expect(adminSrc).toContain('toggleCompactSelectMode');
    expect(adminSrc).toContain('mobile-row-card');
    expect(adminSrc).toMatch(/onCompactRowClick[\s\S]{0,240}openRecordDetail\(item\)/);
    expect(adminSrc).toMatch(/v-if="compactSelectMode"[\s\S]{0,160}checkbox-wrapper/);
  });

  it('订单行的进度 tag 复用 cardView.statusMeta（不写第二份标签/色调）', () => {
    expect(adminSrc).toMatch(/compactRowTag[\s\S]{0,360}cardView\?\.statusMeta/);
  });
});
