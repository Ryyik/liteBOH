import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
let sbBase = '';
let apiKey = '';
page.on('request', (req) => {
  const url = req.url();
  if (!sbBase && url.includes('/rest/v1/')) {
    try {
      const u = new URL(url);
      sbBase = u.origin;
      apiKey = req.headers().apikey || apiKey;
    } catch { /* ignore */ }
  }
});

await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await browser.close();

if (!sbBase || !apiKey) {
  console.log('NO_SUPABASE_CAPTURED');
  process.exit(1);
}

const get = async (table, select) => {
  const res = await fetch(`${sbBase}/rest/v1/${table}?select=${select}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  });
  return res.json();
};

const classify = (v) => {
  const s = String(v || '').trim();
  if (!s) return 'EMPTY';
  if (/^https?:\/\//.test(s)) {
    try {
      const u = new URL(s);
      return `ABS:${u.hostname}`;
    } catch { return 'ABS:INVALID'; }
  }
  if (/^\/\//.test(s)) return 'PROTO_REL';
  if (s.startsWith('/')) return 'ROOT_REL';
  return 'RELATIVE_PATH';
};

const [news, activities, cards] = await Promise.all([
  get('news', 'id,title,image'),
  get('activities', 'id,title,image'),
  get('posts', 'id,post_kind,title,cover_image_url,source_type,source_id&post_kind=in.(news,activity)')
]);

console.log('== news.image ==');
for (const n of news || []) console.log(`[${classify(n.image)}] ${String(n.title).slice(0, 22)} <- ${String(n.image).slice(0, 110)}`);
console.log('\n== activities.image ==');
for (const a of activities || []) console.log(`[${classify(a.image)}] ${String(a.title).slice(0, 22)} <- ${String(a.image).slice(0, 110)}`);
console.log('\n== mirrored posts cover ==');
for (const p of cards || []) console.log(`[${classify(p.cover_image_url)}] ${p.post_kind} ${String(p.title).slice(0, 22)} <- ${String(p.cover_image_url).slice(0, 110)}`);

// 抽样验证 ABS 非云存储的图是否真的可访问（HEAD）
const absUrls = [...(news || []), ...(activities || [])].map((r) => String(r.image || '').trim()).filter((u) => /^https?:\/\//.test(u)).slice(0, 8);
for (const u of absUrls) {
  try {
    const res = await fetch(u, { method: 'HEAD' });
    console.log(`HEAD ${res.status} ${u.slice(0, 90)}`);
  } catch (e) {
    console.log(`HEAD ERR ${String(e.message).slice(0, 60)} ${u.slice(0, 90)}`);
  }
}
