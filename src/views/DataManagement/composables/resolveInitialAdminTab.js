/**
 * 管理后台「进入页面时该停在哪张表」的**唯一判定**（2026-10-17 全面审查 P1-2）。
 *
 * 背景（线上症状）：
 *   分享链接 / 书签 / 外链指向 `/admin/data-management?section=keys-models`（不带 `tab`）时，
 *   分组头与模块 tab 都正常，**内容区却渲染「用户管理」表**，4 个模块 tab 全无选中态。
 *   原因：`DataAdmin.vue` 的初始 tab 只做了两级兜底
 *     `isValidAdminTab(query.tab) ? query.tab : 'users'`
 *   —— 硬编码 `'users'`，完全没查 `ADMIN_SECTION_DEFAULT_TABS[section]`
 *   （那张表此前只在**点击**路径 `useDataAdminNavigation.js` 里用，直达链接走不到）。
 *
 * 三级兜底（顺序即优先级，别调换）：
 *   ① URL 里的合法 `tab` —— 用户/分享者显式指定，最高优先；
 *   ② 该 section 的默认 tab（`ADMIN_SECTION_DEFAULT_TABS`）—— 直达链接的语义；
 *   ③ `'users'` —— 真正无处可依时的最后落点（`data` 段本来也是 users）。
 *
 * ⚠️ ② 必须再过一次 `isValidTab`：`ADMIN_SECTION_DEFAULT_TABS` 是配置表，配置里写了
 *    一个已被删掉的 tab id 时不能让页面落到「空白内容区 + 无选中态」——
 *    这种情况按 ③ 处理，至少还有一张能用的表。
 *
 * 抽成纯函数是为了能被单测直接覆盖（`DataAdmin.vue` 有 6000+ 行，跑不动组件级测试）：
 * 见 `tests/unit/admin-initial-tab.test.js`。
 */
import { ADMIN_SECTION_DEFAULT_TABS } from '../query-config.js';

export const FALLBACK_ADMIN_TAB = 'users';

/**
 * @param {object} input
 * @param {string} [input.queryTab]  URL query 里的 tab（可能是 undefined / 数组 / 空串）
 * @param {string} [input.section]   URL query 或路由 meta 解析出的 section
 * @param {(tabId: string) => boolean} [input.isValidTab] 判定 tab 是否仍存在于当前 tabs 清单
 * @returns {string} 初始 tab id
 */
export function resolveInitialAdminTab({ queryTab, section, isValidTab } = {}) {
  const canUse = typeof isValidTab === 'function' ? isValidTab : () => true;

  const fromQuery = typeof queryTab === 'string' ? queryTab.trim() : '';
  if (fromQuery && canUse(fromQuery)) return fromQuery;

  const sectionId = typeof section === 'string' ? section.trim() : '';
  const fromSection = sectionId ? ADMIN_SECTION_DEFAULT_TABS[sectionId] : '';
  if (fromSection && canUse(fromSection)) return fromSection;

  return FALLBACK_ADMIN_TAB;
}
