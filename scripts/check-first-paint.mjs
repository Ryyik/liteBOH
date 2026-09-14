#!/usr/bin/env node
/**
 * check-first-paint.mjs — 首屏启动骨架的不变量门禁
 *
 * 背景：index.html 的内联启动骨架必须早于一切 CSS / 模块脚本生效，所以它
 * 不能引用任何 CSS 变量（--liquid-* / --boh-* 在骨架阶段还不存在），只能
 * 硬编码色值、并且要自带一份主题白名单（theme-manager 还没跑）。这类
 * "必须重复"的常量一旦漂移就是静默 bug（暗色用户白闪、主题判断不一致），
 * 所以用门禁把三件事钉住：
 *
 *   1. 骨架色值 === 对应 token 的值（tokens.css / themes/dark-mode.css）；
 *   2. 骨架 <style> 位于 </head> 之前，且之前没有任何 <link rel=stylesheet>；
 *   3. index.html 内联的 VALID_THEMES === src/utils/theme-manager.js 的同名常量。
 *
 * 退出码 1 表示违反（可挂进 build:ci）。
 */
import { readFileSync } from "node:fs";

const INDEX_HTML = "index.html";
const TOKENS_CSS = "src/styles/common/tokens.css";
const DARK_MODE_CSS = "src/styles/themes/dark-mode.css";
const THEME_MANAGER_JS = "src/utils/theme-manager.js";

const violations = [];
const fail = (msg) => violations.push(msg);

const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    fail(`读不到 ${file}`);
    return "";
  }
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 取某个选择器块里某属性的值（同一选择器出现多次时取第一次命中） */
const pickDecl = (css, selector, prop) => {
  const re = new RegExp(`${escapeRe(selector)}\\s*\\{([^}]*)\\}`, "g");
  let m;
  while ((m = re.exec(css))) {
    // 声明可能位于块首（前面只有换行/注释），故边界用 ^ 或空白/;/{ 而非仅 ;
    const dm = m[1].match(new RegExp(`(?:^|[\\s;{])${escapeRe(prop)}\\s*:\\s*([^;]+)`, "i"));
    if (dm) return dm[1].trim();
  }
  return null;
};

/** 取某个作用域块（:root / [data-theme="dark"]）里的自定义属性值 */
const pickVar = (css, scopeSelector, name) => {
  const block = pickDecl(css, scopeSelector, name);
  return block;
};

const normColor = (value) => {
  if (value == null) return null;
  let s = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  const short = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) s = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return s;
};

// ---------- 取材 ----------
const html = read(INDEX_HTML);
const tokensCss = read(TOKENS_CSS);
const darkModeCss = read(DARK_MODE_CSS);
const themeManagerJs = read(THEME_MANAGER_JS);

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  fail(`${INDEX_HTML} 里找不到骨架 <style>（若骨架已移除，请同步删除 scripts/check-first-paint.mjs 与 package.json 的 check:first-paint）`);
}
const skeletonCss = styleMatch ? styleMatch[1] : "";

if (!/boh-boot/.test(html)) {
  fail(`${INDEX_HTML} 里找不到骨架结构（.boh-boot）`);
}

// 早于任何样式表 / 模块脚本
const styleAt = html.indexOf("<style>");
const headEndAt = html.indexOf("</head>");
const bodyAt = html.indexOf("<body");
const firstSheetAt = html.search(/<link[^>]*rel=["']stylesheet["']/i);
if (styleAt === -1 || headEndAt === -1 || bodyAt === -1) {
  fail(`${INDEX_HTML} 结构异常：找不到 <style> / </head> / <body>`);
} else {
  if (!(styleAt < headEndAt)) fail(`骨架 <style>（${styleAt}）必须早于 </head>（${headEndAt}）`);
  if (!(styleAt < bodyAt)) fail(`骨架 <style>（${styleAt}）必须早于 <body>（${bodyAt}）`);
  if (firstSheetAt !== -1 && firstSheetAt < styleAt) {
    fail(`骨架 <style> 被样式表抢先（第一个 <link rel=stylesheet> 在 ${firstSheetAt}，骨架在 ${styleAt}）；骨架会被全局样式覆盖`);
  }
}

// ---------- 1. 色值 ↔ token ----------
const darkBgPrimary = pickVar(darkModeCss, '[data-theme="dark"]', "--boh-bg-primary");
if (darkBgPrimary == null) fail(`${DARK_MODE_CSS} 里读不到 --boh-bg-primary（暗色）`);

const pairs = [
  {
    label: "骨架底色（浅）",
    got: pickDecl(skeletonCss, ".boh-boot", "background"),
    want: pickVar(darkModeCss, ":root", "--boh-bg-primary"),
    token: "--boh-bg-primary",
  },
  {
    label: "骨架底色（暗）",
    got: pickDecl(skeletonCss, '[data-theme="dark"] .boh-boot', "background"),
    want: darkBgPrimary,
    token: "--boh-bg-primary",
  },
  {
    label: "body 兜底底色（暗）",
    got: pickDecl(skeletonCss, '[data-theme="dark"] body', "background-color"),
    want: darkBgPrimary,
    token: "--boh-bg-primary",
  },
  {
    label: "骨架文字（浅）",
    got: pickDecl(skeletonCss, ".boh-boot-text", "color"),
    want: pickVar(tokensCss, ":root", "--liquid-text-tertiary"),
    token: "--liquid-text-tertiary",
  },
  {
    label: "骨架文字（暗）",
    got: pickDecl(skeletonCss, '[data-theme="dark"] .boh-boot-text', "color"),
    want: pickVar(tokensCss, '[data-theme="dark"]', "--liquid-text-tertiary"),
    token: "--liquid-text-tertiary",
  },
  {
    label: "重试按钮文字（浅）",
    got: pickDecl(skeletonCss, ".boh-boot-retry", "color"),
    want: pickVar(tokensCss, ":root", "--liquid-text-primary"),
    token: "--liquid-text-primary",
  },
  {
    label: "重试按钮文字（暗）",
    got: pickDecl(skeletonCss, '[data-theme="dark"] .boh-boot-retry', "color"),
    want: pickVar(tokensCss, '[data-theme="dark"]', "--liquid-text-primary"),
    token: "--liquid-text-primary",
  },
];

for (const pair of pairs) {
  const got = normColor(pair.got);
  const want = normColor(pair.want);
  if (got == null) {
    fail(`${pair.label}：骨架里找不到色值（选择器或属性被改动了）`);
    continue;
  }
  if (want == null) {
    fail(`${pair.label}：读不到 token ${pair.token}`);
    continue;
  }
  if (got !== want) {
    fail(`${pair.label}：骨架为 ${got}，但 ${pair.token} 是 ${want} —— 骨架色值必须与 token 同步`);
  }
}

// ---------- 2. 主题白名单同步 ----------
const extractList = (source) => {
  const m = source.match(/VALID_THEMES\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((x) => x.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
};

const htmlThemes = extractList(html);
const managerThemes = extractList(themeManagerJs);

if (!htmlThemes) fail(`${INDEX_HTML} 里读不到内联 VALID_THEMES`);
if (!managerThemes) fail(`${THEME_MANAGER_JS} 里读不到 VALID_THEMES`);
if (htmlThemes && managerThemes) {
  const a = htmlThemes.join(",");
  const b = managerThemes.join(",");
  if (a !== b) {
    fail(`主题白名单不一致：index.html = [${a}]，theme-manager.js = [${b}]`);
  }
}

// ---------- 输出 ----------
if (violations.length) {
  console.error("[check:first-paint] 首屏骨架不变量被破坏：");
  violations.forEach((v) => console.error(`- ${v}`));
  process.exitCode = 1;
} else {
  console.log("[check:first-paint] 骨架色值 / 位置 / 主题白名单检查通过。");
}
