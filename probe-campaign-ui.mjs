/**
 * 活动平台化前台探针 v2（seed 数据已由 090901 migration 注入）：
 * 验证区块渲染 / 卡片内容 / 阶段徽章 / 报名按钮与未登录态反馈路径。
 * 截图存 debug-screenshots/campaign-*.png
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

await page.goto(BASE + "/#/activities-wall", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const sectionCount = await page.locator(".campaign-section").count();
check("进行中活动区块出现", sectionCount > 0);

if (sectionCount > 0) {
  const title = (await page.locator(".campaign-title").first().textContent()) || "";
  check("测试活动标题渲染", title.includes("平台化冒烟"), title.trim().slice(0, 24));

  const chip = (await page.locator(".campaign-stage-chip").first().textContent()) || "";
  check("阶段徽章 = 报名中", chip.includes("报名中"), chip.trim());

  const desc = (await page.locator(".campaign-desc").first().textContent()) || "";
  check("活动描述渲染", desc.includes("端到端探针"), desc.trim().slice(0, 20));

  const btnText = (await page.locator(".campaign-signup-btn").first().textContent()) || "";
  check("报名按钮存在", btnText.includes("立即报名"), btnText.trim());

  await page.screenshot({ path: "debug-screenshots/campaign-1-section.png" });

  // 未登录点击 → 应提示登录（通知岛）而非静默失败
  await page.locator(".campaign-signup-btn").first().click();
  await page.waitForTimeout(1200);
  const bodyHasToast = await page.evaluate(() => document.body.innerText.includes("请先登录") || document.body.innerText.includes("登录"));
  check("未登录报名反馈", bodyHasToast);

  await page.screenshot({ path: "debug-screenshots/campaign-2-login-hint.png" });
}

console.log("pageerrors:", pageErrors.length ? pageErrors.join(" | ").slice(0, 200) : "none");
const failed = results.filter((r) => !r.pass).length;
console.log(failed === 0 ? "\nCAMPAIGN UI PROBE: ALL PASS" : `\nCAMPAIGN UI PROBE: ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 2);
