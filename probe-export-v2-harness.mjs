import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

// ---------- 1. 从 index.ts 抽出生产 previewHtml 模板并插值 ----------
const src = readFileSync('supabase/functions/user-data-export/index.ts', 'utf8');
const open = src.indexOf('const previewHtml = `');
const close = src.indexOf('`;', open + 20);
if (open < 0 || close < 0) throw new Error('template anchors not found');
const tpl = src.slice(open + 'const previewHtml = `'.length, close);
if (/\$\{(?!\{)/.test(tpl.replace(/\$\{previewDataJson\}/g, ''))) throw new Error('unexpected interpolation in template');

// ---------- 2. 渐变占位图（模拟 ZIP 内图片，走 resolvedImages 相对路径语义） ----------
const PH = [
  ['#ffd3a5','#fd6585'],['#a1c4fd','#c2e9fb'],['#d4fc79','#96e6a1'],['#84fab0','#8fd3f4'],
  ['#fbc2eb','#a6c1ee'],['#f6d365','#fda085'],['#5ee7df','#b490ca'],['#30cfd0','#330867']
];
const ph = (i) => {
  const [a, b] = PH[i % PH.length];
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>" +
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='" + a + "'/><stop offset='1' stop-color='" + b + "'/></linearGradient></defs>" +
    "<rect width='800' height='500' fill='url(#g)'/><circle cx='300' cy='160' r='80' fill='#fff' opacity='.2'/></svg>";
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
};

// ---------- 3. 示例数据：字段名 = 真实导出 JSON schema ----------
const U1 = 'u-1111-aaaa', U2 = 'u-2222-bbbb', U3 = 'u-3333-cccc';
const P1 = 'p-aaaa-1111', P2 = 'p-bbbb-2222', P3 = 'p-cccc-3333', P4 = 'p-dddd-4444';
const IMG1 = 'https://res.cloudinary.com/demo/a1b2c3d4/img1.jpg';
const IMG2 = 'https://res.cloudinary.com/demo/a1b2c3d4/img2.jpg';
const IMG3 = 'https://res.cloudinary.com/demo/e5f6a7b8/cat.jpg';
const COVER = 'https://res.cloudinary.com/demo/c9d0e1f2/sea.jpg';
const WALLIMG = 'https://res.cloudinary.com/demo/w0x1y2z3/sky.jpg';
const AVATAR = 'https://res.cloudinary.com/demo/avatar/me.jpg';

const files = {
  'profile/profile.json': [{ id: U1, username: '瑞一颗', avatar_url: AVATAR, created_at: '2024-03-12T00:00:00+08:00' }],
  'profile/following.json': [{ follower_id: U1, following_id: U2 }],
  'forum/posts.json': [
    { id: P1, content: '九月的第一个周末去爬了山，山顶的风把整个夏天都吹散了。\n\n下山路上买了冰美式，突然觉得生活也没有那么难。', author_id: U1, author_username: '瑞一颗', created_at: '2026-09-06T18:20:00+08:00', post_kind: 'post', tag: '生活记录', location_name: '杭州', status: 'approved' },
    { id: P2, content: '路灯下的猫好像也在加班。我蹲下来看了一会儿，原来是在看飞蛾。大家都各有各的 KPI。', author_id: U2, author_username: '小满', created_at: '2026-08-25T22:47:00+08:00', post_kind: 'post', tag: '日常', status: 'approved' },
    { id: P3, content: 'Beta 6 更新说明：全新灵动岛与数据导出中心。导出中心支持一键打包全部个人数据，全部离线可读。', author_id: null, author_username: '方块之家', created_at: '2026-09-05T10:00:00+08:00', post_kind: 'news', status: 'approved' },
    { id: P4, content: '关于把房间改成工作室的 12 个决定：桌子面向窗户；灯光全部换成 4000K；扔掉三年没打开过的纸箱；线材全部上墙；留一面空墙给眼睛休息；椅子比桌子贵，这是原则。', author_id: U3, author_username: '阿澈', created_at: '2026-08-21T15:30:00+08:00', post_kind: 'post', status: 'approved' }
  ],
  'forum/post_images.json': [
    { id: 'pi1', post_id: P1, url: IMG1 },
    { id: 'pi2', post_id: P1, url: IMG2 },
    { id: 'pi3', post_id: P2, url: IMG3 }
  ],
  'forum/comments.json': [
    { id: 'c1', post_id: P1, author_id: U2, author_username: '小满', content: '这张构图好棒，是山顶拍的吗？', created_at: '2026-09-06T19:00:00+08:00', parent_id: null, status: 'approved' },
    { id: 'c2', post_id: P1, author_id: U1, author_username: '瑞一颗', content: '对，观景台那边！', created_at: '2026-09-06T19:10:00+08:00', parent_id: 'c1', reply_to_username: '小满', status: 'approved' },
    { id: 'c3', post_id: P3, author_id: U3, author_username: '阿澈', content: '导出中心太好用了。', created_at: '2026-09-05T11:02:00+08:00', parent_id: null, status: 'approved' }
  ],
  'forum/likes.json': [
    { id: 'l1', post_id: P1, user_id: U1 },
    { id: 'l2', post_id: P2, user_id: U1 }
  ],
  'cloud/entries.json': [
    { id: 'e1', title: '九月的第一片海', content_blocks: [{ type: 'paragraph', text: '把周末的照片整理成一个小合集。海是那种很干净的蓝，风把云吹得很薄。' }], tags: ['摄影', '旅行'], cover_image_url: COVER, created_at: '2026-09-06T17:20:00+08:00' },
    { id: 'e2', title: '读书笔记：《夜晚的潜水艇》', content_blocks: [{ type: 'paragraph', text: '「想象力能抵达的地方，现实未必需要抵达。」' }], tags: ['读书'], cover_image_url: null, created_at: '2026-08-30T22:05:00+08:00' }
  ],
  'treehole/memories.json': [
    { id: 'm1', content: '今天终于把那件拖了很久的事做完了。原来开始做只需要五分钟，焦虑却花掉了五个星期。', mood: '平静', created_at: '2026-09-07T23:41:00+08:00' },
    { id: 'm2', content: '下雨天适合原谅自己。今天什么都没做成，也没关系。', mood: '雨', created_at: '2026-08-14T19:26:00+08:00' }
  ],
  'interactions/notifications.json': [
    { id: 'n1', recipient_id: U1, sender_id: U2, type: 'like', post_id: P1, comment_id: null, status: 'unread', created_at: '2026-09-06T19:00:00+08:00' },
    { id: 'n2', recipient_id: U1, sender_id: U3, type: 'comment', post_id: P1, comment_id: 'c2', status: 'read', created_at: '2026-09-06T19:10:00+08:00' },
    { id: 'n3', recipient_id: U1, sender_id: U2, type: 'follow', post_id: null, comment_id: null, status: 'read', created_at: '2026-08-29T15:00:00+08:00' }
  ],
  'interactions/impressions_received.json': [
    { id: 'i1', author_id: U2, target_id: U1, content: '认真生活的人', category: 'general', created_at: '2026-08-28T12:00:00+08:00' },
    { id: 'i2', author_id: U3, target_id: U1, content: '脑洞很大', category: 'general', created_at: '2026-07-22T20:00:00+08:00' }
  ],
  'interactions/impressions_authored.json': [
    { id: 'i3', author_id: U1, target_id: U2, content: '温柔', category: 'general', created_at: '2026-08-25T21:00:00+08:00' }
  ],
  'interactions/block_wall_items.json': [
    { id: 'w1', author_id: U2, author_username: '小满', item_type: 'text', content: '给未来的你：记得继续保持每周整理一次碎片！', color: 'blue', image_url: null, created_at: '2026-08-29T10:00:00+08:00' },
    { id: 'w2', author_id: U3, author_username: '阿澈', item_type: 'image', content: '路过留言墙，留一张今天的天空。', color: 'cyan', image_url: WALLIMG, created_at: '2026-08-15T16:20:00+08:00' }
  ],
  'records/points_transactions.json': [
    { id: 't1', amount: 20, balance_after: 128, reason: '发布帖子奖励', remark: null, created_at: '2026-09-05T10:05:00+08:00' },
    { id: 't2', amount: -30, balance_after: 98, reason: '兑换头像框「液态玻璃」', remark: null, created_at: '2026-08-20T14:22:00+08:00' }
  ],
  'records/gifts.json': [
    { id: 'g1', gift_no: 'G-001', gift_content: '小星星', gift_price: 10, gift_status: 'completed', created_at: '2026-08-29T08:25:00+08:00' }
  ],
  'records/messages.json': [
    { id: 'msg1', sender_id: U2, sender_name: '小满', receiver_id: U1, receiver_name: '瑞一颗', subject: '周末爬山吗？', content: '下周六天气不错，一起去看日出？', status: 'read', created_at: '2026-09-02T09:00:00+08:00' }
  ],
  'records/lottery_entries.json': [
    { id: 'lot1', campaign_name: '九月社区摄影周', status: '已报名', created_at: '2026-09-01T10:20:00+08:00' }
  ],
  'records/poster_requests.json': [
    { id: 'pr1', theme: '液态玻璃', status: '审核通过', created_at: '2026-08-26T15:00:00+08:00' }
  ]
};

const resolvedImages = {
  [IMG1]: 'forum/images/a1b2c3d4/img_001.jpg',
  [IMG2]: 'forum/images/a1b2c3d4/img_002.jpg',
  [IMG3]: 'forum/images/e5f6a7b8/img_001.jpg',
  [COVER]: 'cloud/images/cloud_001.jpg',
  [WALLIMG]: 'interactions/block_wall_images/wall_001.jpg',
  [AVATAR]: 'profile/avatar_001.jpg'
};
// 挖一个坑：故意让 IMG2「下载失败」，验证缺图时布局不炸
delete resolvedImages[IMG2];

const payload = {
  totals: { 论坛帖子: 4, 论坛评论: 3, 'Cloud+ 条目': 2, 树洞记忆: 2 },
  files,
  images: Object.values(resolvedImages),
  resolvedImages,
  exportedAt: '2026-09-09T12:00:00+08:00',
  meta: { failedImages: 1, truncated: false }
};
const previewDataJson = JSON.stringify(payload).replace(/</g, '\\u003c');
const html = new Function('previewDataJson', 'return `' + tpl + '`')(previewDataJson);

// ---------- 4. 写入仿 ZIP 目录并冒烟 ----------
const dir = '/tmp/boh-export-v2-test/BOH_export_2026-09-09';
mkdirSync(dir, { recursive: true });
writeFileSync(dir + '/index.html', html);
writeFileSync(dir + '/manifest.json', JSON.stringify({ type: 'boh-user-data-export', preview: 'liquid-glass-v2' }));
writeFileSync(dir + '/README.txt', 'BOH 个人数据导出');
// 按 resolvedImages 的相对路径落真实 PNG（1x1），模拟 ZIP 内图片，消除环境性 404
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
for (const relPath of Object.values(resolvedImages)) {
  const p = dir + '/' + relPath;
  mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true });
  writeFileSync(p, TINY_PNG);
}
console.log('harness html written:', (html.length / 1024).toFixed(1) + ' KB');

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1500 } });
const errors = [];
page.on('pageerror', (e) => { console.error('PAGEERROR:', e.message); errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error') { console.error('CONSOLE:', m.text()); errors.push(m.text()); } });
await page.goto('file://' + dir + '/index.html');
await page.waitForTimeout(700);

const stats = await page.evaluate(() => ({
  records: document.getElementById('stRecords')?.textContent,
  posts: document.querySelectorAll('#view-forum .post').length,
  comments: document.querySelectorAll('#view-forum .comment').length,
  grids: document.querySelectorAll('#view-forum .thumb-grid').length,
  tabs: document.querySelectorAll('.tab').length,
  badges: [...document.querySelectorAll('.kind-badge')].map((b) => b.textContent),
  likedBadges: document.querySelectorAll('.badge-self').length,
  fileLinks: [...document.querySelectorAll('#view-files .file')].slice(0, 3).map((a) => a.getAttribute('href'))
}));
console.log('STATS:', JSON.stringify(stats, null, 2));

await page.screenshot({ path: 'debug-screenshots/export-v2-harness-light.png', clip: { x: 0, y: 0, width: 1080, height: 1500 } });

for (const id of ['cloud', 'treehole', 'activity', 'records', 'files']) {
  await page.click(`.tab[data-tab="${id}"]`);
  await page.waitForTimeout(120);
  const len = await page.evaluate(() => document.querySelector('.view.active')?.innerHTML.length);
  console.log(`TAB ${id}: innerHTML ${len}`);
}
await page.click('.tab[data-tab="activity"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'debug-screenshots/export-v2-harness-activity.png', clip: { x: 0, y: 0, width: 1080, height: 900 } });

// 灯箱 + 搜索 + 暗色
await page.click('.tab[data-tab="forum"]');
await page.fill('#searchInput', '猫');
await page.waitForTimeout(150);
const searchHits = await page.evaluate(() => document.getElementById('searchLine')?.textContent);
console.log('SEARCH 猫:', searchHits);
await page.fill('#searchInput', '');
await page.waitForTimeout(100);
const thumbs = await page.locator('#view-forum .thumb').all();
if (thumbs.length) {
  await thumbs[0].click();
  await page.waitForTimeout(250);
  const lb = await page.evaluate(() => ({
    open: document.getElementById('lightbox').classList.contains('open'),
    cap: document.getElementById('lbCap').textContent,
    items: 1
  }));
  console.log('LIGHTBOX:', JSON.stringify(lb), 'total:', await page.evaluate(() => document.querySelectorAll('[data-lb-src]').length));
  await page.keyboard.press('Escape');
}
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(300);
await page.screenshot({ path: 'debug-screenshots/export-v2-harness-dark.png', clip: { x: 0, y: 0, width: 1080, height: 1500 } });

await browser.close();
console.log(errors.length ? 'FAILED with errors' : 'ALL GREEN, no page errors');
process.exit(errors.length ? 1 : 0);
