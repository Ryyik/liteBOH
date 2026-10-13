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
