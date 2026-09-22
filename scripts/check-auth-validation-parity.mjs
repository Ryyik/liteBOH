#!/usr/bin/env node

/**
 * 密码策略口径检查（零容忍，超出直接 exit 1）。
 *
 * 背景：密码长度下限在历史上被抄了七份，且**下限各不相同** ——
 *   注册 8 位、重置密码 6 位、改密 8 位、各自的「当前密码」6 位，
 *   而服务端 EF（supabase/functions/_shared/auth-validation.ts）还停在 6 位。
 *   结果是前端 UI 要求 8 位、服务端只认 6 位：前端校验可被绕过，并且
 *   重置密码页给了一条把密码设回 6 位的合法路径。
 *
 * 现在的口径：
 *   · 前端真源  src/utils/auth-validation.js           （PASSWORD_MIN_LENGTH = 8）
 *   · 服务端真源 supabase/functions/_shared/auth-validation.ts（同值）
 *   两份是**独立副本**（Deno 不能 import src/），无法合并，只能靠本脚本锁死一致性。
 *
 * 三类检查：
 *   A. 两份真源的常量必须存在且相等；且 LEGACY 必须**严格小于** MIN
 *      （LEGACY 是给「当前密码」用的历史下限，一旦追平就会把 6~7 位密码的
 *        老用户锁死 —— 改不了邮箱、也删不了账号）。
 *   B. 真源之外不得再出现「密码变量 .length 与数字字面量比较」的写法。
 *   C. 真源之外不得再出现写死数字的密码长度文案（如「密码长度至少6位」）。
 *      走常量插值（`至少 ${PASSWORD_MIN_LENGTH} 位`）不算违反。
 *
 * 注意：本脚本纯静态、不联网、不需要任何凭据，因此可以安全地挂进 build:ci。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FRONTEND_SOURCE = "src/utils/auth-validation.js";
const EDGE_SOURCE = "supabase/functions/_shared/auth-validation.ts";

/** 允许出现密码常量定义的唯二文件（它们就是真源本身） */
const SOURCE_FILES = new Set([FRONTEND_SOURCE, EDGE_SOURCE]);

const SCAN_ROOTS = ["src", "supabase/functions"];
const SCAN_EXTENSIONS = new Set([".js", ".ts", ".vue"]);
const DEFAULT_IGNORES = new Set([".git", "node_modules", "dist", "dist-check"]);

const PASSWORD_MIN_CONST = "PASSWORD_MIN_LENGTH";
const PASSWORD_MIN_LEGACY_CONST = "PASSWORD_MIN_LENGTH_LEGACY";

/** 密码变量 `.length` 与数字字面量比较：口径漂移的典型写法 */
const LITERAL_LENGTH_COMPARE = /(?:password|Password|PASSWORD)\w*\s*\.length\s*[<>]=?\s*\d+/g;
/** 写死数字的密码长度文案：如「密码长度至少6位」「至少 6 位」 */
const HARDCODED_LENGTH_COPY = /至少\s*\d+\s*位/g;
/** 命中上面那条时，要求同一行确实在讲密码 —— 否则「码至少 6 位」之类误伤 */
const PASSWORD_CONTEXT = /密码|[Pp]assword/;

const walkFiles = (root) => {
  const out = [];
  const visit = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
};

const toRelative = (absolute) => path.relative(PROJECT_ROOT, absolute).split(path.sep).join("/");

const readSource = (relativePath) => readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");

/** 从源码里读 `const NAME = 8;`（允许 export 前缀） */
const readNumericConst = (source, name) => {
  const matched = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*(\\d+)`));
  return matched ? Number(matched[1]) : null;
};

export const collectAuthValidationIssues = () => {
  const errors = [];
  const warnings = [];

  // ---------- A. 两份真源的常量一致性 ----------
  const sources = [
    { label: "前端", file: FRONTEND_SOURCE },
    { label: "服务端 EF", file: EDGE_SOURCE },
  ];

  const values = new Map();
  for (const { label, file } of sources) {
    if (!existsSync(path.join(PROJECT_ROOT, file))) {
      errors.push(`缺少密码校验真源文件：${file}（${label}）`);
      continue;
    }
    const source = readSource(file);
    const min = readNumericConst(source, PASSWORD_MIN_CONST);
    const legacy = readNumericConst(source, PASSWORD_MIN_LEGACY_CONST);
    if (min === null) {
      errors.push(`${file} 未定义 ${PASSWORD_MIN_CONST}（${label}）—— 常量必须是数字字面量，否则本脚本无法核对`);
    }
    // LEGACY 只在前端必填：服务端 EF 不做「当前密码」回填校验，没有这个场景。
    // 但一旦 EF 也定义了，就必须与前端同值。
    if (legacy === null && file === FRONTEND_SOURCE) {
      errors.push(`${file} 未定义 ${PASSWORD_MIN_LEGACY_CONST}（${label}）`);
    }
    values.set(label, { file, min, legacy });
  }

  const defined = [...values.values()].filter((item) => item.min !== null);
  if (defined.length > 1) {
    const mins = new Set(defined.map((item) => item.min));
    if (mins.size > 1) {
      errors.push(
        `${PASSWORD_MIN_CONST} 两份副本不一致：`
          + defined.map((item) => `${item.file} = ${item.min}`).join(" vs ")
          + " —— 前端与服务端必须同值，否则前端校验可被绕过",
      );
    }
    const legacyDefined = defined.filter((item) => item.legacy !== null);
    const legacies = new Set(legacyDefined.map((item) => item.legacy));
    if (legacies.size > 1) {
      errors.push(
        `${PASSWORD_MIN_LEGACY_CONST} 两份副本不一致：`
          + legacyDefined.map((item) => `${item.file} = ${item.legacy}`).join(" vs "),
      );
    }
    for (const item of defined) {
      if (item.legacy !== null && item.min !== null && item.legacy >= item.min) {
        errors.push(
          `${item.file}：${PASSWORD_MIN_LEGACY_CONST}(${item.legacy}) 必须严格小于 `
            + `${PASSWORD_MIN_CONST}(${item.min}) —— 追平会把历史短密码用户锁死（改不了邮箱、删不了账号）`,
        );
      }
    }
  }

  // ---------- B / C. 真源之外的硬编码 ----------
  const files = [];
  for (const root of SCAN_ROOTS) {
    files.push(...walkFiles(path.join(PROJECT_ROOT, root)));
  }
  for (const rootFile of SOURCE_FILES) {
    const absolute = path.join(PROJECT_ROOT, rootFile);
    if (existsSync(absolute) && !files.includes(absolute)) files.push(absolute);
  }

  for (const absolute of files) {
    const relative = toRelative(absolute);
    if (SOURCE_FILES.has(relative)) continue; // 真源自身免检
    const lines = readFileSync(absolute, "utf8").split("\n");
    lines.forEach((line, index) => {
      const at = `${relative}:${index + 1}`;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return; // 注释不判（本文件的说明里就要举例）

      if (LITERAL_LENGTH_COMPARE.test(line)) {
        LITERAL_LENGTH_COMPARE.lastIndex = 0;
        errors.push(
          `${at} 硬编码密码长度下限（${(line.match(LITERAL_LENGTH_COMPARE) || [""])[0].trim()}）`
            + ` —— 改为 import { validatePassword } / { validateCurrentPassword }，或与 ${PASSWORD_MIN_CONST} 比较`,
        );
        return;
      }
      LITERAL_LENGTH_COMPARE.lastIndex = 0;

      if (HARDCODED_LENGTH_COPY.test(line) && PASSWORD_CONTEXT.test(line)) {
        errors.push(
          `${at} 文案写死了密码长度（${(line.match(HARDCODED_LENGTH_COPY) || [""])[0].trim()}）`
            + " —— 改为常量插值，例如 `至少 ${PASSWORD_MIN_LENGTH} 位`",
        );
      }
      HARDCODED_LENGTH_COPY.lastIndex = 0;
    });
  }

  return { errors, warnings };
};

const runCli = () => {
  const { errors, warnings } = collectAuthValidationIssues();

  if (warnings.length) {
    for (const warning of warnings) console.warn(`[check:auth-validation] warn: ${warning}`);
  }

  if (errors.length === 0) {
    const frontMin = readNumericConst(readSource(FRONTEND_SOURCE), PASSWORD_MIN_CONST);
    const edgeMin = readNumericConst(readSource(EDGE_SOURCE), PASSWORD_MIN_CONST);
    console.log(
      `[check:auth-validation] Passed. 前端与服务端下限一致（${frontMin} 位，EF 侧 ${edgeMin} 位），`
        + "且真源之外无硬编码密码长度。",
    );
    return;
  }

  console.error("[check:auth-validation] Found password-policy drift:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
};

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli();
}
