/**
 * RLS 实测探针：拦截页面发出的 Supabase REST 请求抓取 anon apikey，
 * 在 node 侧用 anon（无登录态）打远程 PostgREST 验证敏感老表 RLS。只读、每表 limit 3。
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const PUBLIC_EXPECTED = ["posts", "news", "activities", "home_heroes"];
const SECRET_EXPECTED = [
  "profiles", "points_transactions", "user_subscriptions", "user_addresses",
  "health_profiles", "health_vault_records", "api_key_vault", "boh_cloud_entries",
  "messages", "boh_treehole_memories", "lotteries", "lottery_entries",
  "forum_post_reports", "moderation_logs", "shop_points_orders", "anniversary_subscription_claims",
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

let restBase = null;
let anonKey = null;
page.on("request", (req) => {
  const u = req.url();
  if (!restBase && u.includes("/rest/v1/")) {
    restBase = new URL(u).origin + "/rest/v1";
    anonKey = req.headers()["apikey"] || req.headers()["x-apikey"] || null;
  }
});

await page.goto(BASE + "/#/forum", { waitUntil: "domcontentloaded" });
for (let i = 0; i < 20 && !restBase; i += 1) {
  await page.waitForTimeout(500);
}
await browser.close();

if (!restBase || !anonKey) {
  console.error("FAIL: 未能从页面流量抓到 rest/v1 apikey");
  process.exit(1);
}
console.log("captured:", restBase, "key:", anonKey.slice(0, 12) + "...");

const results = [];
for (const t of [...PUBLIC_EXPECTED, ...SECRET_EXPECTED]) {
  try {
    const res = await fetch(`${restBase}/${t}?select=*&limit=3`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    let rows = null;
    let note = "";
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      if (Array.isArray(body)) {
        rows = body.length;
        note = body[0] ? Object.keys(body[0]).slice(0, 6).join(",") : "";
      } else if (body?.message) {
        note = String(body.message).slice(0, 50);
      }
    } catch { note = text.slice(0, 50); }
    results.push({ t, status: res.status, rows, note });
  } catch (e) {
    results.push({ t, status: "ERR", rows: null, note: String(e).slice(0, 50) });
  }
}

console.log("\n=== RLS ANON PROBE ===");
let leak = 0;
for (const r of results) {
  const isPublic = PUBLIC_EXPECTED.includes(r.t);
  const flag = r.status === 200 && r.rows > 0 ? (isPublic ? "PUBLIC-OK" : "!!LEAK!!") : r.status === 200 ? "empty" : "blocked";
  if (flag === "!!LEAK!!") leak += 1;
  console.log(`${r.t.padEnd(34)} status=${String(r.status).padEnd(4)} rows=${String(r.rows).padEnd(3)} ${flag} ${r.note ? "| " + r.note : ""}`);
}
console.log(`\nRESULT: ${leak === 0 ? "NO LEAKS" : leak + " LEAKS FOUND"}`);
process.exit(leak === 0 ? 0 : 2);
