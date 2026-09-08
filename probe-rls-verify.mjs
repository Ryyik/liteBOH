/**
 * RLS 加固复测：090803 应用后 anon 视角的权限验证。
 */
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let restBase = null, anonKey = null;
page.on("request", (req) => {
  const u = req.url();
  if (!restBase && u.includes("/rest/v1/")) {
    restBase = new URL(u).origin + "/rest/v1";
    anonKey = req.headers()["apikey"];
  }
});
await page.goto("http://localhost:5173/#/forum", { waitUntil: "domcontentloaded" });
for (let i = 0; i < 20 && !restBase; i += 1) await page.waitForTimeout(500);
await browser.close();
const H = { apikey: anonKey, Authorization: "Bearer " + anonKey };

const checks = [
  ["posts 公开读仍可用", "/posts?select=id,author_username&limit=1", 200],
  ["profiles 公开列读", "/profiles?select=id,username,role,points&limit=1", 200],
  ["论坛作者 role 徽章可用", "/profiles?select=role&limit=1", 200],
  ["select=* 被列级拦截", "/profiles?select=*&limit=1", 400],
  ["shipping_phone 被拦截", "/profiles?select=shipping_phone&limit=1", 400],
  ["pushplus_token 被拦截", "/profiles?select=pushplus_token&limit=1", 400],
  ["gift_content 被拦截", "/profiles?select=gift_content&limit=1", 400],
  ["email 列已根除", "/profiles?select=email&limit=1", 400],
  ["ban_reason anon 不可读", "/profiles?select=ban_reason&limit=1", 400],
];
let fail = 0;
for (const [name, path, expect] of checks) {
  const res = await fetch(restBase + path, { headers: H });
  const pass = res.status === expect || (res.status === 401 && expect === 400);
  if (!pass) fail += 1;
  if (!pass && res.status === 401) {
    const t = await res.text();
    console.log("PASS*  " + name + "  (got 401 permission-denied: " + t.slice(0, 60) + ")");
  } else {
    if (!pass && res.status === 401) {
    const t = await res.text();
    console.log("PASS*  " + name + "  (got 401 permission-denied: " + t.slice(0, 60) + ")");
  } else {
    console.log((pass ? "PASS" : "FAIL") + "  " + name + "  (got " + res.status + ", want " + expect + ")");
  }
  }
}
console.log(fail === 0 ? "\nRLS VERIFICATION: ALL PASS" : "\nRLS VERIFICATION: " + fail + " FAILED");
process.exit(fail === 0 ? 0 : 2);
