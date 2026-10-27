/**
 * audit-scope.mjs —— 依赖审计「严格档 / 告警档」的变更域判定（纯函数）
 *
 * ## 为什么需要它
 *
 * `security:audit` 的判据不是本仓代码，而是 **npm 公告库**：同一份 lock，昨天绿、今天红。
 * 2026-10-27 实证 —— fast-uri / esbuild / serialize-javascript 三条新公告同时发布，
 * 把一次与依赖毫无关系的推送卡红，`main` 一直红到有人手动升包。
 *
 * 这类失败的处置不应该是「一律阻断」：改一行 CSS 也会红，作者无从下手，
 * 久了就学会无视门禁（比没有门禁更糟）。所以按**变更域**分档：
 *
 *   · 本次推送动了依赖清单 ⇒ 严格档（谁动依赖谁清账，必须红）；
 *   · 没动 ⇒ 告警档（annotation + step summary，不阻断）；
 *   · 列表被截断（一次推送 >300 个文件，GitHub compare 的上限）⇒ **保守选严格**：
 *     截断意味着「已知改动很多」，不能断言没碰依赖。
 *   · 完全拿不到比对基线（无网络 / 权限）⇒ 由调用方降为告警档 + 醒目提示，
 *     因为瞬时 API 故障若一律阻断，等于把本节要解决的问题原样搬回来。
 *     漏判的代价有界：每日定时审计最迟次日会把它变成 issue。
 *
 * 新公告的跟踪由 `.github/workflows/audit-scheduled.yml`（每日严格档 + 自动开 issue）兜底。
 *
 * ## 为什么单独成文件
 *
 * 判定逻辑若写在 ci.yml 的 bash 里，**没有任何门禁能测它** —— 本仓在「跑了但永远绿」
 * 上吃过两次亏，不值得再来一次。抽成纯函数后由
 * `tests/unit/audit-scope.test.js` 逐个分支锁死。
 */

/** 依赖清单：改这两个文件等于改了依赖树（`npm ci` 的输入）。 */
export const DEP_MANIFESTS = ['package.json', 'package-lock.json'];

export const SCOPE_STRICT = 'strict';
export const SCOPE_ADVISORY = 'advisory';

/**
 * 决定本次推送用哪一档。
 *
 * @param {string[] | null | undefined} files 本次变更的文件路径（compare API 的 filename）
 * @param {{ truncated?: boolean }} [opts] truncated = 文件列表被平台截断（GitHub compare 最多 300 条）
 * @returns {'strict' | 'advisory'}
 */
export function decideScope(files, opts = {}) {
  // 列表被截断时无法断言「没碰依赖清单」⇒ 保守按严格处理。
  if (opts.truncated) return SCOPE_STRICT;
  if (!Array.isArray(files) || files.length === 0) return SCOPE_ADVISORY;
  return files.some((f) => DEP_MANIFESTS.includes(f)) ? SCOPE_STRICT : SCOPE_ADVISORY;
}
