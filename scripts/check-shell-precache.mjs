#!/usr/bin/env node
/**
 * check-shell-precache.mjs — 应用壳预缓存覆盖门禁（必须在 vite build 之后运行）
 *
 * 背景：vite.config.js 的 workbox.globPatterns 是**手写名单**，CSS 部分还要经过
 * manifestTransforms 二次收窄。workbox 只对"整条 glob 零匹配"告警，对名单里
 * **单个未命中的名字不出声** —— 所以漏配一个壳依赖不会有任何提示。ui-sanitize
 * 就这样漏过一次：sw.js 少了它，弱网/离线时应用壳缺模块、整站白屏（连导航栏
 * 都没有），而构建日志干干净净。
 *
 * 这里不去信任任何名单，而是从产物反推三件事：
 *
 *   A. **壳样式**：index.html 里 <link rel="stylesheet"> 引用的每个 CSS 必须进
 *      预缓存。SW 的 NavigationRoute 会把 index.html 离线交给浏览器，若它引用的
 *      样式没进预缓存，离线首屏就是「有 HTML、无样式」。这是本门禁存在的**首要
 *      理由**，也是任何「收窄 CSS 预缓存」改动的安全底线：壳样式是硬保证，路由
 *      样式才允许交给运行时缓存。
 *   B. **壳脚本**：入口 app-*.js 的静态 import（Vue mount 前必须全部到位）必须
 *      ⊆ 预缓存。
 *   C. **路由样式归宿**：每个动态 import 的路由 chunk 携带的 CSS，必须要么进预
 *      缓存，要么被某条 runtimeCaching 规则覆盖。二者都没有 = 弱网/离线切到该
 *      路由时无样式（sw.js 里那条 /static/css/ 的 CacheFirst 就是为此存在的）。
 *
 * 用法：npm run build && npm run check:shell-precache
 * 退出码 1 表示违反。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const DIST = process.env.DIST_DIR || "dist";
const JS_DIR = path.join(DIST, "static/js");
const SW_FILE = path.join(DIST, "sw.js");
const INDEX_HTML = path.join(DIST, "index.html");

const violations = [];
const warnings = [];
const fail = (msg) => violations.push(msg);

if (!existsSync(SW_FILE) || !existsSync(JS_DIR) || !existsSync(INDEX_HTML)) {
  console.error(`[check:shell-precache] 读不到 ${SW_FILE} / ${INDEX_HTML} / ${JS_DIR} —— 请先执行 vite build。`);
  process.exit(1);
}

const baseName = (u) => u.split("/").pop();

// ---------- 入口 chunk 与其静态 import ----------
const entryFiles = readdirSync(JS_DIR).filter((f) => /^app-.*\.js$/.test(f));
if (entryFiles.length === 0) {
  fail(`${JS_DIR} 下找不到入口 chunk（app-*.js）—— 产物结构变了，请同步本脚本`);
} else if (entryFiles.length > 1) {
  fail(`${JS_DIR} 下出现 ${entryFiles.length} 个 app-*.js（${entryFiles.join(", ")}），无法确定入口`);
}

const entrySource = entryFiles.length === 1 ? readFileSync(path.join(JS_DIR, entryFiles[0]), "utf8") : "";
const shellDeps = new Set(entryFiles);
for (const re of [/from"\.\/([\w.-]+\.js)"/g, /import"\.\/([\w.-]+\.js)"/g]) {
  let m;
  while ((m = re.exec(entrySource))) shellDeps.add(m[1]);
}
// 防"正则失配 → 空集 → 全通过"的假绿：入口至少应有 1 个静态依赖
if (shellDeps.size < 2) {
  fail(`只解析到 ${shellDeps.size} 个壳依赖（含入口自身）—— 解析规则可能已失效，请不要放行`);
}

// ---------- sw.js：预缓存清单 + 运行时规则 ----------
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
  [...precached].filter((u) => u.startsWith("static/js/") && u.endsWith(".js")).map(baseName)
);
const precachedCss = new Set(
  [...precached].filter((u) => u.startsWith("static/css/") && u.endsWith(".css")).map(baseName)
);

/**
 * 从 sw.js 里抠出 registerRoute(/regex/flags, ...) 的每一个正则。
 * 用扫描器而非正则，因为正则字面量内部含转义的 `/`，且有字符类。
 */
const extractRuntimePatterns = (source) => {
  const out = [];
  const marker = "registerRoute(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    from = at + marker.length;
    if (source[from] !== "/") continue; // 非正则字面量（如 NavigationRoute）跳过
    let i = from + 1;
    let inClass = false;
    while (i < source.length) {
      const c = source[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i += 1;
    }
    const body = source.slice(from + 1, i);
    let j = i + 1;
    let flags = "";
    while (j < source.length && /[a-z]/.test(source[j])) { flags += source[j]; j += 1; }
    try {
      out.push({ re: new RegExp(body, flags), raw: `/${body}/${flags}` });
    } catch (err) {
      fail(`sw.js 里的正则无法解析（/${body}/${flags}）：${err.message}`);
    }
  }
  return out;
};

const runtimePatterns = extractRuntimePatterns(sw);
// 防"解析失配 → 无规则 → 全部判缺失"的假红：当前至少有 3 条运行时规则
if (runtimePatterns.length < 3) {
  fail(`只解析到 ${runtimePatterns.length} 条 runtimeCaching 规则 —— 解析规则可能已失效（当前预期 ≥3 条）`);
}
const coveredByRuntime = (url) => runtimePatterns.some((p) => p.re.test(url));

// ---------- 断言 A：壳样式（index.html 引用的 CSS）必须在预缓存里 ----------
const html = readFileSync(INDEX_HTML, "utf8");
const indexCss = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/(static\/css\/[^"]+)"/g)].map((m) => m[1]);
if (indexCss.length === 0) {
  fail(
    `${INDEX_HTML} 里找不到任何 <link rel="stylesheet" href="./static/css/...">。\n` +
      `  这通常意味着「入口 CSS 不再是 render-blocking 的静态 <link>」——首屏将失去样式优先加载保证，请不要放行。`
  );
}
const missingShellCss = indexCss.filter((u) => !precachedCss.has(baseName(u)));
if (missingShellCss.length) {
  fail(
    `壳样式未进 SW 预缓存（离线首屏会「有 HTML 无样式」）：${missingShellCss.map(baseName).join(", ")}\n` +
      `  修法：确认该 CSS 属于入口/壳 chunk，并在 vite.config.js 的 workbox.manifestTransforms 允许清单里放行`
  );
}

// ---------- 断言 B：壳脚本（入口静态 import）必须在预缓存里 ----------
const missingJs = [...shellDeps].filter((f) => !precachedJs.has(f));
if (missingJs.length) {
  fail(
    `壳依赖未进 SW 预缓存（弱网/离线时应用壳会缺模块 → 整站白屏）：${missingJs.join(", ")}\n` +
      `  修法：把对应 chunk 名补进 vite.config.js 的 workbox.globPatterns`
  );
}

// ---------- 断言 C：每个动态 import 路由 chunk 的 CSS 必须有归宿 ----------
// 依赖表：const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=[...])))，
// 元素是相对 app-*.js 的路径，形如 "./x.js" 与 "../css/y.css"。
const depTable = (() => {
  const at = entrySource.indexOf("m.f||(m.f=[");
  if (at === -1) return null;
  const end = entrySource.indexOf("]", at);
  if (end === -1) return null;
  return [...entrySource.slice(at, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
})();

if (!depTable || depTable.length === 0) {
  fail(`解析不出 __vite__mapDeps 依赖表 —— 收窄 CSS 预缓存的依据会失效，请不要放行`);
}

// 不假设路由对象的字段顺序（meta 可能插在 component 之前），所以逐条匹配
// 「带 deps 的动态 import」，再向前找最近的 name 作为标签。
const dynamicImports = depTable
  ? [...entrySource.matchAll(/import\("\.\/([\w.-]+\.js)"\),__vite__mapDeps\(\[([0-9,]+)\]/g)].map((m) => ({
      at: m.index,
      chunk: m[1],
      deps: m[2].split(",").map((x) => depTable[Number(x)]).filter(Boolean),
    }))
  : [];

if (dynamicImports.length === 0) {
  fail(`解析不出任何带依赖表的动态 import —— 路由解析规则可能已失效，请不要放行`);
}

const ORIGIN = "https://example.invalid/";
let routeCssChecked = 0;
const orphanCss = new Map(); // css 文件名 → 「路由标签」+ 入口 chunk

for (const item of dynamicImports) {
  const back = entrySource.slice(Math.max(0, item.at - 320), item.at);
  const named = [...back.matchAll(/name:"([A-Za-z0-9_]+)"/g)].pop();
  const label = named ? named[1] : item.chunk;
  for (const dep of item.deps) {
    if (!dep.startsWith("../css/") || !dep.endsWith(".css")) continue;
    const file = baseName(dep);
    routeCssChecked += 1;
    if (precachedCss.has(file)) continue;
    if (coveredByRuntime(`${ORIGIN}static/css/${file}`)) continue;
    if (!orphanCss.has(file)) orphanCss.set(file, `${label} → ${item.chunk}`);
  }
}
if (routeCssChecked === 0) {
  fail(`没有任何路由解析出 CSS 依赖 —— 路由解析规则可能已失效，请不要放行`);
}
if (orphanCss.size) {
  const list = [...orphanCss].map(([f, r]) => `${f}（${r}）`).join("\n  ");
  fail(
    `以下路由 CSS 既未进预缓存、也无 runtimeCaching 覆盖 —— 弱网/离线切到该路由会无样式：\n  ${list}\n` +
      `  修法：在 vite.config.js 的 workbox.runtimeCaching 里为 /static/css/ 补 CacheFirst 规则`
  );
}

// ---------- 观察项：预缓存里"非壳"的 JS / CSS ----------
const shellCssDeps = new Set(indexCss.map(baseName));
const extraJs = [...precachedJs].filter((f) => !shellDeps.has(f));
const extraCss = [...precachedCss].filter((f) => !shellCssDeps.has(f));
if (extraJs.length) {
  warnings.push(`预缓存里有非壳 JS（会拖慢首次访问，确认是否有意为之）：${extraJs.join(", ")}`);
}
if (extraCss.length) {
  warnings.push(`预缓存里有非壳 CSS（会拖慢首次访问，确认是否有意为之）：${extraCss.join(", ")}`);
}

// ---------- 体积汇总（raw，便于与 check-bundle-size 对齐量纲） ----------
const sizeOf = (url) => {
  const p = path.join(DIST, url);
  return existsSync(p) ? statSync(p).size : 0;
};
const precacheRaw = [...precached].reduce((s, u) => s + sizeOf(u), 0);
const cssRaw = [...precachedCss].reduce((s, u) => s + sizeOf(`static/css/${u}`), 0);

// ---------- 输出 ----------
console.log(
  `[check:shell-precache] 壳依赖 ${shellDeps.size} 个 / 预缓存 JS ${precachedJs.size} 个 / ` +
    `壳样式 ${indexCss.length} 个 / 预缓存 CSS ${precachedCss.size} 个 / 预缓存总条目 ${precached.size} 个`
);
console.log(
  `[check:shell-precache] 预缓存 raw 体积 ${(precacheRaw / 1024).toFixed(0)}KB，其中 CSS ${(cssRaw / 1024).toFixed(0)}KB`
);
warnings.forEach((w) => console.warn(`[check:shell-precache] WARN ${w}`));

if (violations.length) {
  console.error("[check:shell-precache] 应用壳预缓存覆盖不完整：");
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log("[check:shell-precache] 应用壳预缓存覆盖检查通过。");
}
