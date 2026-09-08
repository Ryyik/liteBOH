/**
 * 全站玻璃视觉回归探针（plan 007 P0-0 收尾）：
 * 1) token 计算值可解析 —— --liquid-filter* 与 --glass-filter* 含 blur()（自引用 bug 复发即空）
 * 2) 关键玻璃类 backdrop-filter 实际生效（非 none、含 blur）
 * 3) 首页/论坛/用户空间/新闻四页截图肉眼走查
 * 截图存 debug-screenshots/glass-*.png
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const results = [];
const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  " + extra : ""));
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

const auditGlass = () =>
  page.evaluate(() => {
    const rootCS = getComputedStyle(document.documentElement);
    const tokens = {};
    for (const t of ["--liquid-filter", "--liquid-filter-sm", "--liquid-filter-lg", "--glass-filter-light", "--glass-filter-medium", "--glass-filter-heavy"]) {
      tokens[t] = (rootCS.getPropertyValue(t) || "").trim();
    }
    const probes = [];
    const sels = [
      ".glass-container-light",
      ".glass-container-medium",
      ".glass-container-heavy",
      ".glass-navbar",
      ".liquid-glass",
      "#unified-nav-container",
      ".unified-nav-surface",
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = getComputedStyle(el);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter || "none";
        probes.push({ sel, bf, ok: bf !== "none" && bf.includes("blur(") });
      }
    }
    let blurCount = 0;
    for (const el of document.querySelectorAll("*")) {
      const bf = getComputedStyle(el).backdropFilter;
      if (bf && bf !== "none" && bf.includes("blur(")) blurCount++;
    }
    return { tokens, probes, blurCount };
  });

// ---------- 全局 token 检查（任一页面均可读 :root） ----------
await page.goto(BASE + "/#/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
let a = await auditGlass();

for (const [t, v] of Object.entries(a.tokens)) {
  check(`token ${t} 计算值含 blur()`, v.includes("blur("), v.slice(0, 60));
}
check("页面存在生效中的 backdrop-filter 元素", a.blurCount > 0, `count=${a.blurCount}`);

// ---------- 首页 ----------
check("首页玻璃元素生效", a.probes.filter((p) => p.ok).length > 0, JSON.stringify(a.probes.map((p) => p.sel + ":" + (p.ok ? "✓" : "✗"))));
await page.screenshot({ path: "debug-screenshots/glass-1-home.png" });

// ---------- 论坛 ----------
await page.goto(BASE + "/#/forum", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
a = await auditGlass();
check("论坛玻璃元素生效", a.probes.filter((p) => p.ok).length > 0, JSON.stringify(a.probes.map((p) => p.sel + ":" + (p.ok ? "✓" : "✗"))));
await page.screenshot({ path: "debug-screenshots/glass-2-forum.png" });

// ---------- 用户空间（伪造登录态拿真实布局） ----------
await page.goto(BASE + "/#/user-space", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  const app = document.querySelector("#app");
  if (app && app.__vue_app__) {
    app.__vue_app__.config.globalProperties.$pinia.state.value.auth.isLoggedIn = true;
  }
});
await page.waitForTimeout(3200);
a = await auditGlass();
check("用户空间玻璃元素生效", a.probes.filter((p) => p.ok).length > 0, JSON.stringify(a.probes.map((p) => p.sel + ":" + (p.ok ? "✓" : "✗"))));
await page.screenshot({ path: "debug-screenshots/glass-3-user-space.png" });

// ---------- 新闻 ----------
await page.goto(BASE + "/#/newsroom", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
a = await auditGlass();
check("新闻页玻璃元素生效", a.probes.filter((p) => p.ok).length > 0, JSON.stringify(a.probes.map((p) => p.sel + ":" + (p.ok ? "✓" : "✗"))));
await page.screenshot({ path: "debug-screenshots/glass-4-newsroom.png" });

console.log("pageerrors:", pageErrors.length ? pageErrors.join(" | ").slice(0, 300) : "none");
const failed = results.filter((r) => !r.pass).length;
console.log(failed === 0 ? "\nGLASS REGRESSION PROBE: ALL PASS" : `\nGLASS REGRESSION PROBE: ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 2);
