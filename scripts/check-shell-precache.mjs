#!/usr/bin/env node
/**
 * check-shell-precache.mjs — 应用壳预缓存覆盖门禁（必须在 vite build 之后运行）
 *
 * 背景：vite.config.js 的 workbox.globPatterns 是**手写名单**。workbox 只对
 * "整条 glob 零匹配"告警，对名单里**单个未命中的名字不出声** —— 所以漏配一个
 * 壳依赖不会有任何提示。ui-sanitize 就这样漏过一次：sw.js 少了它，弱网/离线
 * 时应用壳缺模块、整站白屏（连导航栏都没有），而构建日志干干净净。
 *
 * 这里不去信任名单，而是从产物反推：
 *   入口 app-*.js 的静态 import（Vue mount 前必须全部到位）= 应用壳
 *   必须 ⊆ sw.js 的 precacheAndRoute 清单
 *
 * 用法：npm run build && npm run check:shell-precache
 * 退出码 1 表示违反。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIST = process.env.DIST_DIR || "dist";
const JS_DIR = path.join(DIST, "static/js");
const SW_FILE = path.join(DIST, "sw.js");

const violations = [];
const warnings = [];
const fail = (msg) => violations.push(msg);

if (!existsSync(SW_FILE) || !existsSync(JS_DIR)) {
  console.error(`[check:shell-precache] 读不到 ${SW_FILE} 或 ${JS_DIR} —— 请先执行 vite build。`);
  process.exit(1);
}

// ---------- 入口 chunk 与其静态 import = ----------
const entryFiles = readdirSync(JS_DIR).filter((f) => /^app-.*\.js$/.test(f));
if (entryFiles.length === 0) {
  fail(`${JS_DIR} 下找不到入口 chunk（app-*.js）—— 产物结构变了，请同步本脚本`);
} else if (entryFiles.length > 1) {
  fail(`${JS_DIR} 下出现 ${entryFiles.length} 个 app-*.js（${entryFiles.join(", ")}），无法确定入口`);
}

const shellDeps = new Set(entryFiles);
if (entryFiles.length === 1) {
  const source = readFileSync(path.join(JS_DIR, entryFiles[0]), "utf8");
  for (const re of [/from"\.\/([\w.-]+\.js)"/g, /import"\.\/([\w.-]+\.js)"/g]) {
    let m;
    while ((m = re.exec(source))) shellDeps.add(m[1]);
  }
}

// 防"正则失配 → 空集 → 全通过"的假绿：入口至少应有 1 个静态依赖
if (shellDeps.size < 2) {
  fail(`只解析到 ${shellDeps.size} 个壳依赖（含入口自身）—— 解析规则可能已失效，请不要放行`);
}

// ---------- sw.js 的预缓存清单 ----------
const sw = readFileSync(SW_FILE, "utf8");
const manifestMatch = sw.match(/precacheAndRoute\((\[[\s\S]*?\])[,)]/);
if (!manifestMatch) {
  fail(`${SW_FILE} 里找不到 precacheAndRoute([...]) —— 生成策略变了，请同步本脚本`);
}
const precached = new Set(
  ((manifestMatch && manifestMatch[1].match(/url:"([^"]+)"/g)) || []).map((x) => x.replace(/^url:"|"$/g, ""))
);
if (precached.size === 0) {
  fail(`${SW_FILE} 的预缓存清单为空 —— 解析规则可能已失效，请不要放行`);
}

const precachedJs = new Set(
  [...precached].filter((u) => u.startsWith("static/js/") && u.endsWith(".js")).map((u) => u.split("/").pop())
);

// ---------- 断言 ----------
const missing = [...shellDeps].filter((f) => !precachedJs.has(f));
if (missing.length) {
  fail(
    `壳依赖未进 SW 预缓存（弱网/离线时应用壳会缺模块 → 整站白屏）：${missing.join(", ")}\n` +
      `  修法：把对应 chunk 名补进 vite.config.js 的 workbox.globPatterns`
  );
}

const extra = [...precachedJs].filter((f) => !shellDeps.has(f));
if (extra.length) {
  warnings.push(
    `预缓存里有非壳依赖的 JS（会拖慢首次访问，确认是否有意为之）：${extra.join(", ")}`
  );
}

// ---------- 输出 ----------
console.log(
  `[check:shell-precache] 壳依赖 ${shellDeps.size} 个 / 预缓存 JS ${precachedJs.size} 个 / 预缓存总条目 ${precached.size} 个`
);
warnings.forEach((w) => console.warn(`[check:shell-precache] WARN ${w}`));

if (violations.length) {
  console.error("[check:shell-precache] 应用壳预缓存覆盖不完整：");
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log("[check:shell-precache] 应用壳预缓存覆盖检查通过。");
}
