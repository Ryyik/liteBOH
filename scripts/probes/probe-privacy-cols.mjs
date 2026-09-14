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
for (const col of ["shipping_phone", "pushplus_token", "gift_content", "gift_no", "shipping_address"]) {
  const res = await fetch(restBase + "/profiles?select=id,username," + col + "&limit=3", { headers: H });
  const body = await res.text();
  let note = body.slice(0, 80);
  try {
    const rows = JSON.parse(body);
    note = rows.map(r => r.username + ":" + (r[col] === null || r[col] === undefined || r[col] === "" ? "EMPTY" : "HAS-VALUE")).join(" | ");
  } catch {}
  console.log(col.padEnd(20), res.status, note);
}
