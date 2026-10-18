/**
 * 2026-10-17 全面审查 P1-2：admin 直达链接的初始 tab 判定。
 *
 * 症状（修前）：`/admin/data-management?section=keys-models`（不带 `tab`）——
 *   分组头与模块 tab 正常，内容区却渲染「用户管理」表、4 个模块 tab 全无选中态。
 * 根因：初始 tab 只做两级兜底，缺 `ADMIN_SECTION_DEFAULT_TABS[section]` 这一级。
 *
 * 这里锁三级兜底的**优先级**与两个边界（非法 query.tab / 配置表里已失效的默认 tab）。
 */
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ADMIN_TAB,
  resolveInitialAdminTab,
} from '@/views/DataManagement/composables/resolveInitialAdminTab.js';
import { ADMIN_SECTION_DEFAULT_TABS } from '@/views/DataManagement/query-config.js';

/** 与真实 tabs 清单同形：键集合来自 query-config 的 section 默认值 + users */
const VALID_TABS = new Set(['users', 'keys-models', 'moderation-model', 'lab-ai-model']);
const isValidTab = (tabId) => VALID_TABS.has(tabId);

describe('resolveInitialAdminTab — 三级兜底', () => {
  it('① 合法 query.tab 最高优先（即使 section 有别的默认值）', () => {
    expect(
      resolveInitialAdminTab({ queryTab: 'lab-ai-model', section: 'keys-models', isValidTab }),
    ).toBe('lab-ai-model');
  });

  it('② 无 query.tab 时取该 section 的默认 tab（P1-2 的回归点）', () => {
    expect(resolveInitialAdminTab({ queryTab: '', section: 'keys-models', isValidTab })).toBe(
      'keys-models',
    );
    expect(resolveInitialAdminTab({ section: 'moderation-model', isValidTab })).toBe(
      'moderation-model',
    );
    expect(resolveInitialAdminTab({ section: 'lab-ai-model', isValidTab })).toBe('lab-ai-model');
  });

  it('② 旧 section 别名走同一张表（api-keys / freemodels → keys-models）', () => {
    expect(resolveInitialAdminTab({ section: 'api-keys', isValidTab })).toBe('keys-models');
    expect(resolveInitialAdminTab({ section: 'freemodels', isValidTab })).toBe('keys-models');
  });

  it('③ section 无默认值（overview / 未知 / 空）时落到 users', () => {
    expect(resolveInitialAdminTab({ section: 'overview', isValidTab })).toBe(FALLBACK_ADMIN_TAB);
    expect(resolveInitialAdminTab({ section: 'no-such-section', isValidTab })).toBe(
      FALLBACK_ADMIN_TAB,
    );
    expect(resolveInitialAdminTab({ isValidTab })).toBe(FALLBACK_ADMIN_TAB);
  });

  it('非法 query.tab 不得生效，回落到 section 默认值', () => {
    expect(
      resolveInitialAdminTab({ queryTab: 'users-old', section: 'keys-models', isValidTab }),
    ).toBe('keys-models');
  });

  it('query.tab 是数组 / 空白（Vue Router 的 ?tab=a&tab=b 形态）时按缺失处理', () => {
    expect(
      resolveInitialAdminTab({ queryTab: ['users'], section: 'keys-models', isValidTab }),
    ).toBe('keys-models');
    expect(resolveInitialAdminTab({ queryTab: '   ', section: 'keys-models', isValidTab })).toBe(
      'keys-models',
    );
  });

  it('配置表里的默认 tab 若已从 tabs 清单删除，仍回落到 users（不留空白内容区）', () => {
    const onlyUsers = (tabId) => tabId === 'users';
    expect(resolveInitialAdminTab({ section: 'keys-models', isValidTab: onlyUsers })).toBe(
      FALLBACK_ADMIN_TAB,
    );
  });

  it('section 带首尾空白（手写 URL）也能命中默认值', () => {
    expect(resolveInitialAdminTab({ section: ' keys-models ', isValidTab })).toBe('keys-models');
  });

  it('不传 isValidTab 时视为「全部合法」，仍然优先 query.tab', () => {
    expect(resolveInitialAdminTab({ queryTab: 'anything', section: 'keys-models' })).toBe(
      'anything',
    );
  });
});

describe('ADMIN_SECTION_DEFAULT_TABS — 与真实 tabs 清单的一致性', () => {
  it('每个默认 tab 都必须存在于 tabs 清单（否则直达链接会静默回落 users）', () => {
    for (const [section, tabId] of Object.entries(ADMIN_SECTION_DEFAULT_TABS)) {
      expect(isValidTab(tabId), `section=${section} 的默认 tab=${tabId} 不在 tabs 清单里`).toBe(
        true,
      );
    }
  });
});
