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

async function exists(table, col) {
  const res = await fetch(restBase + "/" + table + "?select=" + col + "&limit=1", { headers: H });
  return res.status === 200;
}
function mask(v) {
  if (v === null || v === undefined) return "null";
  const s = String(v);
  return s.length > 18 ? s.slice(0, 6) + "...(" + s.length + ")" : s;
}

console.log("== profiles column existence ==");
const pcols = ["email", "bio", "avatar_url", "level", "xp", "title", "signature", "banned", "is_banned", "settings", "preferences"];
const pExist = [];
for (const c of pcols) { if (await exists("profiles", c)) pExist.push(c); }
console.log("existing extra cols:", pExist.join(", ") || "(none)");
if (pExist.length) {
  const res = await fetch(restBase + "/profiles?select=id,username,role,points," + pExist.join(",") + "&limit=3", { headers: H });
  const rows = await res.json();
  for (const r of rows) console.log(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, mask(v)])));
}
console.log("== lotteries column existence ==");
const lcols = ["config", "settings", "pity_config", "internal_config", "rules", "metadata", "extra"];
const lExist = [];
for (const c of lcols) { if (await exists("lotteries", c)) lExist.push(c); }
console.log("existing extra cols:", lExist.join(", ") || "(none)");
