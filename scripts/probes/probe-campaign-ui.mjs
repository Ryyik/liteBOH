/**
 * 活动页面探针 v3（2026-09-17 活动页重构：顶部报名卡 + 按月份分组横向轨道）
 *
 * v2 的两个前提已经失效：
 *   1) 它断言的 .campaign-section/.campaign-title/.campaign-stage-chip 等类名已随重构改名；
 *   2) 它依赖 2026090901_probe_seed 写入的数据库 seed，而该数据已被
 *      2026090902_probe_cleanup 删除 —— 真库 activity_campaigns 恒为 0 行。
 * 因此 v3 不再依赖数据库里有活动数据：报名卡路径用 Playwright 路由拦截 mock。
 *
 * 三个场景：
 *   A. mock 一条 signup 阶段活动 → 报名卡 / 阶段徽章 / 报名按钮 / 未登录反馈
 *   B. 真库数据 → 报名区空态 + 月份轨道分组 + 缺「日」不补 1 日
 *   C. 窄视口 → 双卡月份轨道真的可以横向滚动（横向滚动机制不是摆设）
 *
 * 注：A 与 B 必须用两个独立 page。在同一个 page 上 unroute 后再 reload
 * 不足以保证 mock 完全撤除，B 会读到 A 的 mock 数据（v3 首轮实测踩过）。
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const results = [];
const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  " + extra : ""));
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--proxy-server=direct://", "--proxy-bypass-list=*"]
});
const pageErrors = [];
const watchErrors = (p) => p.on("pageerror", (e) => pageErrors.push(String(e)));

const MOCK_CAMPAIGN = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "probe-campaign",
  title: "【探针】报名卡冒烟活动",
  description: "端到端探针 mock 数据",
  stage: "signup",
  signup_start_at: "2026-09-01T00:00:00+08:00",
  signup_end_at: "2026-09-20T00:00:00+08:00",
  start_at: null,
  end_at: null,
  config: {},
  created_at: "2026-09-01T00:00:00+08:00"
};

// ================= 场景 A：拦截 activity_campaigns，验证报名卡 =================
const pageA = await browser.newPage({ viewport: { width: 1440, height: 960 } });
watchErrors(pageA);
await pageA.route("**/rest/v1/activity_campaigns*", async (route) => {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-range": "0-0/1",
      "access-control-expose-headers": "Content-Range"
    },
    body: JSON.stringify([MOCK_CAMPAIGN])
  });
});

await pageA.goto(BASE + "/#/activities-wall", { waitUntil: "domcontentloaded" });
await pageA.locator(".signup-hero").first().waitFor({ timeout: 15000 }).catch(() => {});

const heroCount = await pageA.locator(".signup-hero").count();
check("A 报名主卡渲染", heroCount > 0);

if (heroCount > 0) {
  const title = (await pageA.locator(".signup-hero__title").first().textContent()) || "";
  check("A 活动标题渲染", title.includes("报名卡冒烟"), title.trim().slice(0, 20));

  const chip = (await pageA.locator(".signup-hero .signup-stage-chip").first().textContent()) || "";
  check("A 阶段徽章 = 报名中", chip.includes("报名中"), chip.trim());

  const desc = (await pageA.locator(".signup-hero__desc").first().textContent()) || "";
  check("A 活动描述渲染", desc.includes("端到端探针"), desc.trim().slice(0, 16));

  const btn = pageA.locator(".signup-hero .signup-btn").first();
  const btnText = (await btn.textContent()) || "";
  check("A 报名按钮文案", btnText.includes("立即报名"), btnText.trim());

  const windowText = (await pageA.locator(".signup-hero .signup-window").first().textContent()) || "";
  check("A 报名窗口", windowText.includes("9.1") && windowText.includes("9.20"), windowText.trim());

  // 未登录点击 → 应提示登录（通知岛）而非静默失败
  await btn.click();
  await pageA.waitForTimeout(1200);
  const hinted = await pageA.evaluate(() => document.body.innerText.includes("请先登录"));
  check("A 未登录报名反馈", hinted);

  await pageA.screenshot({ path: "debug-screenshots/campaign-1-signup-hero.png" });
}
await pageA.close();

// ================= 场景 B：真实数据（campaigns 为空 → 空态）+ 月份分组 =================
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
watchErrors(page);
await page.goto(BASE + "/#/activities-wall", { waitUntil: "domcontentloaded" });
// 报名区（campaigns）与月份轨道（activities）是两条独立的异步链，
// 只等其中一条会让另一条还在 loading 时就被断言 —— 分别等各自的终态。
await page.locator(".signup-section .empty-state, .signup-section .signup-hero").first()
  .waitFor({ timeout: 15000 })
  .catch(() => {});
await page.locator(".month-rail").first().waitFor({ timeout: 15000 }).catch(() => {});

const emptyBox = await page
  .locator(".signup-section .empty-state")
  .first()
  .boundingBox()
  .catch(() => null);
const paneDiag = await page.evaluate(() => {
  const pane = document.querySelector(".aw-pane--activities");
  const section = document.querySelector(".signup-section");
  return {
    pane: pane ? getComputedStyle(pane).display : "no-pane",
    section: section ? getComputedStyle(section).display : "no-section"
  };
});
check(
  "B 报名区空态（真库 0 行活动数据）",
  Boolean(emptyBox),
  emptyBox ? `可见 ${Math.round(emptyBox.width)}x${Math.round(emptyBox.height)}` : `不可见 pane=${paneDiag.pane} section=${paneDiag.section}`
);

const railCount = await page.locator(".month-rail").count();
check("B 月份轨道数量（17 条摊成 16 组）", railCount === 16, `实际 ${railCount}`);

const railLabels = await page.locator(".month-rail__title").allTextContents();
check("B 最新月份在最前", railLabels[0] === "2026年8月", railLabels[0] || "");
check("B 缺「日」的月份显示为 2025年10月", railLabels.includes("2025年10月"));

// 精度语义：卡片角标按「精度」渲染，缺「日」的不得补成 1 日
const octShort = await page
  .locator('.month-rail[data-month="2025-10"] .activity-card__date-short')
  .first()
  .textContent()
  .catch(() => "");
check("B 缺「日」的卡片角标 = 10月（不是 10月1日）", String(octShort || "").trim() === "10月", String(octShort || "").trim());

const decShort = await page
  .locator('.month-rail[data-month="2024-12"] .activity-card__date-short')
  .first()
  .textContent()
  .catch(() => "");
check("B 有「日」的卡片角标 = 12月31日", String(decShort || "").trim() === "12月31日", String(decShort || "").trim());

const pageText = await page.evaluate(() => document.body.innerText);
check("B 不出现臆造的「10月1日」", !/10月1日/.test(pageText));

// 月份顺序：字符串比较会把 7 月排到 12 月前面，这里校验真实的月份降序
const monthIndex = (label) => railLabels.indexOf(label);
check(
  "B 2025年12月 排在 2025年7月 之前",
  monthIndex("2025年12月") >= 0 &&
    monthIndex("2025年7月") >= 0 &&
    monthIndex("2025年12月") < monthIndex("2025年7月")
);

await page.screenshot({ path: "debug-screenshots/campaign-2-timeline.png" });

// ================= 场景 C：窄视口下双卡轨道真的能横向滚动 =================
const decemberRail = page.locator('.month-rail[data-month="2024-12"] .month-rail__track');
await page.setViewportSize({ width: 480, height: 900 });
await page.waitForTimeout(500);

const scrollInfo = await decemberRail
  .evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  .catch(() => null);

check(
  "C 窄屏下双卡轨道可横向滚动",
  Boolean(scrollInfo && scrollInfo.scrollWidth - scrollInfo.clientWidth > 4),
  scrollInfo ? `scrollWidth=${scrollInfo.scrollWidth} clientWidth=${scrollInfo.clientWidth}` : "未取到"
);

if (scrollInfo) {
  await decemberRail.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await page.waitForTimeout(400);
  const moved = await decemberRail.evaluate((el) => el.scrollLeft);
  check("C 横向滚动实际生效", moved > 4, `scrollLeft=${Math.round(moved)}`);

  const dots = await page
    .locator('.month-rail[data-month="2024-12"] .month-rail__dot')
    .count()
    .catch(() => 0);
  check("C 溢出时出现位置指示点", dots === 2, `实际 ${dots}`);
}

await page.screenshot({ path: "debug-screenshots/campaign-3-narrow-rail.png" });

// ================= 场景 D：管理员投稿弹窗的两种活动类型 =================
// 验证「新建报名活动」写 activity_campaigns、「新建活动」写 activities —— 这是两条
// 完全不同的表（字段、id 生成方式、是否有论坛同步触发器都不同），必须端到端确认落点。
const ADMIN_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const pageD = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watchErrors(pageD);

let campaignInsert = null;
let archiveInsert = null;

const jsonHeaders = (range) => ({
  "content-type": "application/json",
  "content-range": range,
  "access-control-expose-headers": "Content-Range"
});

// profiles 必须 mock：会话校验会拿真库结果洗掉注入的 userInfo
await pageD.route("**/rest/v1/profiles*", async (route) => {
  await route.fulfill({
    status: 200,
    headers: jsonHeaders("0-0/1"),
    body: JSON.stringify([{ id: ADMIN_UUID, username: "瑞一颗", points: 100, role: "admin", avatar_url: null }])
  });
});

await pageD.route("**/rest/v1/activity_campaigns*", async (route) => {
  const req = route.request();
  if (req.method() === "POST") {
    campaignInsert = JSON.parse(req.postData() || "null");
    await route.fulfill({ status: 201, headers: jsonHeaders("0-0/1"), body: JSON.stringify([{ id: ADMIN_UUID }]) });
    return;
  }
  await route.fulfill({ status: 200, headers: jsonHeaders("*/0"), body: "[]" });
});

// activities 的 GET 放行走真库（月份轨道与自增 id 查询都要用），只拦 POST
await pageD.route("**/rest/v1/activities*", async (route) => {
  const req = route.request();
  if (req.method() === "POST") {
    archiveInsert = JSON.parse(req.postData() || "null");
    await route.fulfill({ status: 201, headers: jsonHeaders("0-0/1"), body: JSON.stringify([{ id: 99 }]) });
    return;
  }
  await route.continue();
});

await pageD.goto(BASE + "/#/activities-wall", { waitUntil: "domcontentloaded" });
await pageD.waitForFunction(() => document.querySelector("#app")?.__vue_app__, null, { timeout: 30000 });
await pageD.waitForTimeout(3000);
// 现注 admin 登录：userInfo 是 reactive({})，必须 Object.assign 原地改
await pageD.evaluate((uid) => {
  const pinia = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
  const s = pinia.state.value.auth;
  s.isLoggedIn = true;
  s.isInitialized = true;
  if (s.userInfo) Object.assign(s.userInfo, { username: "瑞一颗", id: uid, role: "admin", avatarUrl: "" });
}, ADMIN_UUID);
await pageD.waitForTimeout(700);

const publishBtn = pageD.locator(".activity-admin-publish-btn");
check("D 管理员可见投稿入口", (await publishBtn.count()) > 0);

await publishBtn.first().click();
await pageD.locator(".admin-publish-modal").waitFor({ timeout: 8000 }).catch(() => {});
check("D 投稿弹窗打开", (await pageD.locator(".admin-publish-modal").count()) > 0);

const activeKind = (
  (await pageD.locator(".ap-kind__option.is-active .ap-kind__label").textContent().catch(() => "")) || ""
).trim();
check("D 默认选中「新建报名活动」", activeKind === "新建报名活动", activeKind);

const slugInputSel = '.ap-input[placeholder="留空自动生成"]';
check("D 报名活动有 Slug 输入框", (await pageD.locator(slugInputSel).count()) === 1);
check(
  "D 报名活动有 4 个时间窗输入",
  (await pageD.locator('.ap-input[type="datetime-local"]').count()) === 4,
  `实际 ${await pageD.locator('.ap-input[type="datetime-local"]').count()}`
);
check(
  "D 报名活动不提供封面图（该表无 image 列）",
  (await pageD.locator('.ap-upload input[type="file"]').count()) === 0
);

// 切到「新建活动」：栏目应整体换面
await pageD.locator(".ap-kind__option", { hasText: "新建活动" }).first().click();
await pageD.waitForTimeout(350);
check(
  "D 切到往期活动后时间窗消失",
  (await pageD.locator('.ap-input[type="datetime-local"]').count()) === 0
);
check("D 切到往期活动后 Slug 消失", (await pageD.locator(slugInputSel).count()) === 0);
check(
  "D 切到往期活动后封面图出现",
  (await pageD.locator('.ap-upload input[type="file"]').count()) === 1
);

await pageD.screenshot({ path: "debug-screenshots/campaign-4-kind-archive.png" });

// 切回报名活动，填表并提交
await pageD.locator(".ap-kind__option", { hasText: "新建报名活动" }).first().click();
await pageD.waitForTimeout(350);
await pageD.locator(".ap-body label.ap-field").first().locator("input.ap-input")
  .fill("【探针】管理员投稿报名活动");
await pageD.locator(".ap-body textarea.ap-textarea").first()
  .fill("端到端探针：验证写入 activity_campaigns");

await pageD.screenshot({ path: "debug-screenshots/campaign-5-kind-campaign.png" });

// 弹窗里承诺的 slug 必须在提交后真的落到同一个值（否则提示是骗人的）
const slugHint = (
  (await pageD.locator(".ap-help").first().textContent().catch(() => "")) || ""
).trim();

const submitBtn = pageD.locator(".ap-submit");

// 先验证时间窗逆序会被拦下（validateCampaignWindow 的端到端覆盖）
const dt = pageD.locator('.ap-input[type="datetime-local"]');
await dt.nth(0).fill("2026-09-20T10:00");
await dt.nth(1).fill("2026-09-01T10:00");
await submitBtn.click();
await pageD.waitForTimeout(800);
const errText = ((await pageD.locator(".ap-error").textContent().catch(() => "")) || "").trim();
check("D 时间窗逆序被拦截", errText.includes("报名截止"), errText.slice(0, 26));
check("D 被拦截时不发请求", campaignInsert === null);

// 改成正序再提交
await dt.nth(1).fill("2026-09-30T10:00");
await submitBtn.click();
await pageD.waitForTimeout(1400);

check("D 提交写入 activity_campaigns", Boolean(campaignInsert));
if (campaignInsert) {
  check(
    "D slug 留空时自动生成",
    typeof campaignInsert.slug === "string" && campaignInsert.slug.length > 0,
    String(campaignInsert.slug)
  );
  check(
    "D 弹窗提示的 slug 与实际写入一致",
    slugHint.includes(String(campaignInsert.slug)),
    `提示「${slugHint.slice(0, 34)}」`
  );
  check("D payload 不含 id（uuid 由 DB 生成）", !("id" in campaignInsert));
  check("D payload 不含 image（该表无此列）", !("image" in campaignInsert));
  check("D payload stage 默认 signup", campaignInsert.stage === "signup", String(campaignInsert.stage));
  check(
    "D 活动介绍写入 description",
    String(campaignInsert.description || "").includes("端到端探针")
  );
  check(
    "D 时间窗转成带时区的 ISO",
    /Z$/.test(String(campaignInsert.signup_start_at || "")),
    String(campaignInsert.signup_start_at || "").slice(0, 22)
  );
}

await pageD.screenshot({ path: "debug-screenshots/campaign-6-after-submit.png" });
await pageD.close();

console.log("pageerrors:", pageErrors.length ? pageErrors.join(" | ").slice(0, 240) : "none");
check("无页面错误", pageErrors.length === 0);

const failed = results.filter((r) => !r.pass).length;
console.log(failed === 0 ? "\nCAMPAIGN UI PROBE: ALL PASS" : `\nCAMPAIGN UI PROBE: ${failed} FAILED`);
await browser.close();
process.exit(failed === 0 ? 0 : 2);
