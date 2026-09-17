/**
 * probe-profile-info-row.mjs — 他人主页「积分卡 + 用户信息」横屏并排验证
 *
 * 断言口径（几何/计算样式，不是 DOM 存在）：
 *  - 1440×900 桌面横屏：info-row 为 flex；积分卡与用户信息面板同一行（top 对齐）；
 *    积分卡固定 430px；两面板等高（stretch）；用户信息行垂直居中；热力图正常可见。
 *  - 390×844 手机竖屏 / 844×390 手机横屏：info-row 为 contents（布局隐形），两区块纵向排布。
 *
 * 他人主页无 requiresAuth，匿名可访问，无需注入登录态。
 */
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE || 'http://[::1]:5173';
const USERNAME = process.env.PROBE_USERNAME || '雨芙蕖酱酱酱酱';
const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*']
});

const measure = async (viewport, label) => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/#/profile/${encodeURIComponent(USERNAME)}?from=community`, { waitUntil: 'domcontentloaded' });
  // 条件等待：等真实内容区块出现（骨架页/未找到页都没有 service-panel）
  try {
    await page.waitForSelector('.profile-service-panel', { timeout: 15000 });
  } catch {
    ok(`${label} 页面加载`, false, 'profile-service-panel 未出现（用户名可能不存在）');
    await page.close();
    return;
  }
  await page.waitForSelector('.profile-activity-heatmap', { timeout: 8000 }).catch(() => {});

  const data = await page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { display: cs.display, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const row = document.querySelector('.profile-info-row');
    const card = document.querySelector('.profile-points-card-section');
    const service = document.querySelector('.profile-service-panel');
    const heat = document.querySelector('.profile-activity-heatmap');
    const firstServiceRow = service ? service.querySelector('.profile-service-row') : null;
    const servicePanelCs = service ? getComputedStyle(service) : null;
    return {
      row: pick(row),
      card: pick(card),
      service: pick(service),
      heat: pick(heat),
      serviceJustify: servicePanelCs ? servicePanelCs.justifyContent : '',
      firstRowTop: firstServiceRow ? Math.round(firstServiceRow.getBoundingClientRect().top) : null
    };
  });

  if (!data.row || !data.card || !data.service) {
    ok(`${label} 区块齐全`, false, 'row/card/service 有缺失');
    await page.close();
    return;
  }

  const isWide = viewport.width >= 1024 && viewport.height >= 600;
  if (isWide) {
    ok(`${label} info-row=flex`, data.row.display === 'flex', `display=${data.row.display}`);
    ok(`${label} 同一行(top对齐)`, Math.abs(data.card.top - data.service.top) <= 2, `card=${data.card.top} service=${data.service.top}`);
    ok(`${label} 积分卡430`, Math.abs(data.card.w - 430) <= 2, `w=${data.card.w}`);
    ok(`${label} 等高stretch`, Math.abs(data.card.h - data.service.h) <= 2, `card=${data.card.h} service=${data.service.h}`);
    ok(`${label} 不重叠(左右相邻)`, data.service.left >= data.card.left + data.card.w - 2, `card右缘=${data.card.left + data.card.w} service左=${data.service.left}`);
    ok(`${label} service行居中`, data.serviceJustify === 'center', `justify=${data.serviceJustify}`);
    if (data.heat) {
      ok(`${label} 热力图可见`, data.heat.w > 500 && data.heat.top < data.card.top, `w=${data.heat.w} top=${data.heat.top}`);
    }
  } else {
    ok(`${label} info-row=contents`, data.row.display === 'contents', `display=${data.row.display}`);
    ok(`${label} 纵向排布`, data.service.top > data.card.top + data.card.h - 2, `service top=${data.service.top} card底=${data.card.top + data.card.h}`);
  }

  const shot = `debug-screenshots/profile-info-row-${label}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`      screenshot -> ${shot}`);
  await page.close();
};

await measure({ width: 1440, height: 900 }, 'desktop-1440');
await measure({ width: 390, height: 844 }, 'mobile-390');
await measure({ width: 844, height: 390 }, 'mobile-landscape-844');

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== ${results.length - failed.length}/${results.length} PASS ==`);
process.exit(failed.length ? 1 : 0);
