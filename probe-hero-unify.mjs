/**
 * Hero 规范 V1 代码统一回归探针（零视觉变化验证）：
 * 1) 关键计算样式数值快照（Beta6 headline/玻璃卡/AGC S 档标题/CTA 颜色）
 * 2) 明暗双主题整页截图 → 与改版前像素 diff（应 ~0%）
 * 用法：TAG=before node probe-hero-unify.mjs   TAG=after node probe-hero-unify.mjs
 * 截图存 debug-screenshots/hero-unify-<TAG>-<theme>.png
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const TAG = process.env.TAG || "run";
const results = [];
const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  " + extra : ""));
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server"],
});

for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion: "reduce",
  });
  await context.addInitScript((t) => {
    try { localStorage.setItem("boh-theme", t); } catch {}
  }, theme);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".beta6-hero", { timeout: 15000 });
  // 逐步滚到底触发 HomeHeroRow 的 IntersectionObserver 懒渲染与懒加载图片，再回顶
  await page.evaluate(async () => {
    const step = 800;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1600);

  const snap = await page.evaluate(() => {
    const pick = (sel, props) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = cs.getPropertyValue(p);
      return out;
    };
    const root = getComputedStyle(document.documentElement);
    return {
      heroHeadline: pick(".beta6-hero-headline", ["font-size", "font-weight", "line-height", "color"]),
      heroCard: pick(".beta6-hero-card", ["background-color", "border-radius", "backdrop-filter", "-webkit-backdrop-filter"]),
      heroEyebrow: pick(".beta6-hero-eyebrow", ["font-size", "letter-spacing", "color"]),
      heroBtn: pick(".beta6-hero-btn-primary", ["background-color", "height", "font-size"]),
      agcTitle: pick(".agc-title", ["font-size", "font-weight", "color"]),
      agcPrimary: pick(".agc-link-primary", ["background-color"]),
      tokens: {
        accent: (root.getPropertyValue("--hero-accent") || "").trim(),
        hL: (root.getPropertyValue("--hero-headline-l") || "").trim(),
        hM: (root.getPropertyValue("--hero-headline-m") || "").trim(),
        hS: (root.getPropertyValue("--hero-headline-s") || "").trim(),
        text: (root.getPropertyValue("--hero-text") || "").trim(),
        htmlTheme: document.documentElement.getAttribute("data-theme"),
      },
    };
  });

  const j = JSON.stringify(snap, null, 1);
  console.log(`\n===== ${TAG} / ${theme} =====`);
  console.log(j);

  check(`[${theme}] beta6 headline 存在且 76px/700`, !!snap.heroHeadline
    && parseFloat(snap.heroHeadline["font-size"]) === 76
    && (snap.heroHeadline["font-weight"] === "700" || snap.heroHeadline["font-weight"] === "bold"),
    snap.heroHeadline ? `${snap.heroHeadline["font-size"]} / ${snap.heroHeadline["font-weight"]}` : "missing");
  check(`[${theme}] beta6 玻璃卡 blur(36px) 生效`, !!snap.heroCard
    && JSON.stringify(snap.heroCard).includes("blur(36px)"),
    snap.heroCard ? (snap.heroCard["backdrop-filter"] || snap.heroCard["-webkit-backdrop-filter"] || "") : "missing");
  check(`[${theme}] beta6 CTA 药丸 accent 色`, !!snap.heroBtn
    && (snap.heroBtn["background-color"] || "").replace(/\s/g, "").includes("0,113,227"),
    snap.heroBtn ? snap.heroBtn["background-color"] : "missing");
  check(`[${theme}] AGC 标题 40px（S 档）`, !!snap.agcTitle && parseFloat(snap.agcTitle["font-size"]) === 40,
    snap.agcTitle ? snap.agcTitle["font-size"] : "missing");
  check(`[${theme}] --hero-accent token 已注入`, snap.tokens.accent === "#0071e3", snap.tokens.accent || "missing");
  check(`[${theme}] --hero-headline-* 三档注入`, snap.tokens.hL.includes("76px") && snap.tokens.hM.includes("64px") && snap.tokens.hS.includes("40px"),
    `${snap.tokens.hL} | ${snap.tokens.hM} | ${snap.tokens.hS}`);
  check(`[${theme}] 无页面 JS 错误`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  const file = `debug-screenshots/hero-unify-${TAG}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`screenshot -> ${file}`);

  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${TAG}: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
