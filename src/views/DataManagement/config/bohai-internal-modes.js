/**
 * ==============================================
 * 只供内部使用、不进用户侧模式列表的 bohai_model_configs 行
 * ==============================================
 *
 * ── 背景 ────────────────────────────────────────────────────────────
 * 审核专用的两行（moderation-text / moderation-image）与面向用户的 BOHAI 模式
 * **共用 bohai_model_configs 一张表**，靠 mode_id 前缀区分。它们该由「审核模型」
 * 页（ModerationModelConfig.vue）维护，不应出现在「BOHAI 模型」列表里 ——
 * 否则管理员会在这个列表里看到并误改它们（历史上只能靠写进 notes 的
 * 「请勿在 BOHAI 模式列表中启用给用户」来提醒，是约定式护栏，不是结构式隔离）。
 *
 * ── 单一真源约定 ────────────────────────────────────────────────────
 * mode_id 的**字面量只在这个文件里出现一次**：
 *   · 写入端 ModerationModelConfig.vue 从这里取 MODERATION_*_MODE_ID；
 *   · 展示端 DataAdmin.vue 用 excludeInternalBohaiModes() 排除同前缀的行。
 * 两者同源，改名只需改这里一处。改错了 tests/unit/bohai-internal-modes.test.js 会红。
 *
 * ── 用户侧的三道闸门（2026-10-18 补齐，别再只改后台列表）────────────────
 * 本文件只覆盖「后台列表」。审核行一旦被启用（status='active'），还会从另外两个口子漏出去：
 *   ① 用户侧模式选择器：RPC list_public_bohai_modes 的 WHERE 里必须有
 *      `mode_id not like 'moderation-%'`（迁移 2026101801）。**漏了就是
 *      「启用审核 → 用户菜单里多出『审核·文本 0.1x』」这个报障**（0.1x 的 gemini 等于廉价通道）。
 *   ② 直连 EF：mode 是请求体字段，绕开列表直接 POST 仍能指定它 ⇒
 *      api-key-vault 的 resolveRuntimeModelPolicy 按 purpose 兜底（非 'moderation' 一律 403）。
 * SQL 里没法 import 本文件，所以前缀字面量在迁移里硬编码一份；两边同步由
 * tests/unit/bohai-internal-modes.test.js 的最后一条断言锁死（它读最后一次重建该 RPC 的迁移）。
 */

export const MODERATION_TEXT_MODE_ID = 'moderation-text';
export const MODERATION_IMAGE_MODE_ID = 'moderation-image';

/** mode_id 的保留前缀：以此开头的行仅内部使用，不进用户侧模式列表。 */
export const INTERNAL_MODE_PREFIX = 'moderation-';

/**
 * 给 bohai_model_configs 的查询套上「排除内部模式」的过滤。
 * **列表查询与计数查询必须共用这一处口径**，否则会出现「列表 8 行、计数 10 条」。
 */
export const excludeInternalBohaiModes = (query) =>
  query.not('mode_id', 'like', `${INTERNAL_MODE_PREFIX}%`);
