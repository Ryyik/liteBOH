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
const res = await fetch(restBase + "/profiles?select=id,username&email=not.is.null&limit=5", { headers: H });
console.log("status:", res.status);
const rows = await res.json();
console.log("rows with non-null email:", Array.isArray(rows) ? rows.length : rows);
if (Array.isArray(rows) && rows.length) console.log(rows.map(r => r.username));
