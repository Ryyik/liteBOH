#!/usr/bin/env node
/**
 * check-theme-coverage.mjs — 自定义主题页面覆盖盘点（观察档）
 *
 * 目的：回答「哪些页面根还完全没有 home-cat / anniversary-mc 的钩子」。
 * 不是「视觉已适配」的证明 —— 有 token 消费不等于每个硬编码白卡都已修；
 * 它只把「零钩子」这种最明显的漏网页列出来，避免下一轮全站主题化时靠记忆找。
 *
 * 判据：
 *   explicit = 该页 CSS 里出现 data-theme="home-cat" / "anniversary-mc"
 *              （含 html[data-theme] 前缀；先剥注释，避免注释里提到也算）
 *   token    = 没有专属选择器，但页面 CSS 已消费 --boh-* / --liquid-* 站点 token
 *   none     = 两者都没有 —— 最可能需要补页面级适配
 *
 * 默认 exit 0（观察档）；加 --strict 时只有 none 会让退出码变 1。
 * ⚠️ 暂不挂进 verify：当前仍有 none / token 页，先观察，稳定后再谈 strict。
 *
 * 用法：
 *   node scripts/check-theme-coverage.mjs
 *   node scripts/check-theme-coverage.mjs --strict
 */
import { readFileSync, existsSync } from 'node:fs';

const STRICT = process.argv.includes('--strict');

const PAGES = [
  {
    name: '首页',
    root: '.home',
    files: ['src/views/Home/style.scoped.css', 'src/views/Home/style.global.css'],
  },
  {
    name: '资讯',
    root: '.newsroom-page',
    files: ['src/views/Newsroom/index.vue', 'src/views/Newsroom/style.scoped.css'],
  },
  {
    name: '论坛',
    root: '.forum-page',
    files: [
      'src/views/Forum/styles/anniversary.css',
      'src/views/Forum/styles/drawers-skeletons.css',
      'src/views/Forum/styles/feed.css',
    ],
  },
  {
    name: '帖子详情',
    root: '.post-detail-page',
    files: ['src/views/PostDetail/style.scoped.css'],
  },
  { name: '个人主页', root: '.profile-page', files: ['src/views/Profile/style.scoped.css'] },
  {
    name: '消息中心',
    root: '.x-notifications-container',
    files: ['src/views/user-center/Messages/style.scoped.css'],
  },
  {
    name: 'Cloud+',
    root: '.cloud-page',
    files: ['src/views/user-center/Cloud+/style.scoped.css'],
  },
  {
    name: '设置',
    root: '.settings-page',
    files: ['src/views/user-center/UserSpace/styles/settings-glass.css'],
  },
  { name: '摄影集', root: '.photo-albums-page', files: ['src/views/PhotoAlbums/index.vue'] },
  {
    name: '商城',
    root: '.shop-page',
    files: ['src/views/Shop/style.scoped.css', 'src/views/Shop/store-tokens.css'],
  },
];

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const THEME_RE = /data-theme\s*=\s*["'](?:home-cat|anniversary-mc)["']/;
const TOKEN_RE = /var\(\s*--(?:boh|liquid)-/;

const rows = [];
for (const page of PAGES) {
  let css = '';
  for (const file of page.files) {
    if (existsSync(file)) css += `\n${readFileSync(file, 'utf8')}`;
  }
  if (!css) {
    rows.push({ ...page, status: 'missing', reason: '文件不存在' });
    continue;
  }
  const source = stripComments(css);
  if (THEME_RE.test(source)) rows.push({ ...page, status: 'explicit', reason: '有主题选择器' });
  else if (TOKEN_RE.test(source)) rows.push({ ...page, status: 'token', reason: '走站点 token' });
  else rows.push({ ...page, status: 'none', reason: '无主题钩子' });
}

const badge = { explicit: '✅', token: '◐', none: '❌', missing: '⚠️' };
const label = { explicit: '专属', token: 'token', none: '无钩子', missing: '缺文件' };
console.log('[check:theme-coverage] 自定义主题页面覆盖（观察档）\n');
for (const row of rows) {
  console.log(
    `${badge[row.status]} ${row.name.padEnd(5, '　')} ${row.root.padEnd(24)} ` +
      `${label[row.status].padEnd(4)} ${row.reason}`,
  );
}

const uncovered = rows.filter((r) => r.status === 'none' || r.status === 'missing');
console.log(
  `\n合计 ${rows.length} 页：专属 ${rows.filter((r) => r.status === 'explicit').length} / ` +
    `token ${rows.filter((r) => r.status === 'token').length} / ` +
    `无钩子 ${rows.filter((r) => r.status === 'none').length} / ` +
    `缺文件 ${rows.filter((r) => r.status === 'missing').length}`,
);

if (STRICT && uncovered.length) {
  console.error('\n[check:theme-coverage] --strict：以上页面没有任何主题钩子。');
  process.exitCode = 1;
}
