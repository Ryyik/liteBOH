import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：订阅页（/user-space/subscriptions）· 权益单源对齐回归
//   A. 卡片权益：**四档**统一顺序（AI → Cloud+ → 摄影集 → 昵称 → 保底），数值正确
//   B. 对比表：昵称效果 / 抽奖保底门槛 / 摄影集三行 补齐；全档一致的「多模态交互」
//      「定制化看板」移入公共说明；表头价格带「积分」单位
//   C. 卡片 vs 表格数值一致性（P1 验收核心）
//   D. 月付 / 年付切换（表头价格随周期变化）
//   E. 手机端（390px）：表格横滑可用、卡片单列、页面无横向溢出
//
// ⚠️ 2026-11-24（plans/046）四档制 + 两处既存存量清理，**断言总数从 53 降到 40**：
//   · 档位五档 → 四档：A1/A2（5→3 张卡，6 项→5 项）、B1–B4/B7–B10 少一列、
//     C 组少一档 × 7 项、D2 换语义；
//   · 删除 C2/C3/C4（Coding 附加包 2026-10-20 下线，`.pack-card` 恒 0 个 ⇒ 一直红）；
//   · 删除 A2/C 组里的「实验室 PPT / Word」项（实验室 2026-10-19 退场 ⇒ 一直红）；
//   · B10 百分比 13/100/250/625/1250 → 5/100/250/500（基准替 plus→pro）；
//   · 新增 A1b 布局守卫：卡张数与网格列数必须匹配（`.cards` 写死 repeat(4) 时
//     三卡只铺 840/1160，右空 294px，而 A1/A2 读文字**全绿** ⇒ 补一条几何断言）。
//   ⚠️ 删这些不是「放宽断言」：它们锁的对象在源码里已经不存在了。
//
//   反证：把 comparisonRows 换回手写旧数据（缺昵称/保底/摄影集行）→ B 组必红；
//         把 buildCardFeatures 改回手工数组（Pro 顺序漂移）→ A 组必红。
//
// ⚠️ 2026-10-02 修了两处**既存假红**（此前基线是 40 pass / 8 fail，不是绿的 ——
//    一个带已知红的探针等于没有守卫）：
//    · A2 的期望值漏了卡片上的「· 积分 N 折」后缀（卡片是逐字渲染整串）；
//    · C 组的 `digits()` 把折数的 0.95 也拼进了 AI 额度（`400.95` vs `40`）。
//    两处都用「换回 HEAD 版跑」反证过：HEAD 同样 40/8，与当天的额度调整无关。
//    同时新增 B10 锁住 AI 额度行的五个值（Free = 「—」，它没有 token 额度）。
//
// ⚠️ 2026-10-08 口径变更（用户口径「不再展示你还有多少 token，只用百分比」）：
//    AI 额度那一行与卡片首项从绝对 Token 数（'40 万'）改成**相对基准档的百分比** ——
//    基准 = 最低付费档 Plus = 100%（plus 100% / pro 250% / max 625% / ultra 1250%），
//    行名也从 'BOH AI Token / 天' 改成 'BOH AI 额度'。改口径必须同批改 A2/B10/C，
//    否则三条会一起红（它们都逐字读这一行）。
// =====================================================================
const BASE = 'http://[::1]:5173';
const OUT = 'debug-screenshots/subscription-benefits';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) {
    pass += 1;
    console.log('PASS ', name, detail === undefined ? '' : '— ' + detail);
  } else {
    fail += 1;
    console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail);
  }
};
const digits = (s) => (String(s).match(/[\d.]+/g) || []).join('');

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

async function openSubscription(page) {
  await page.goto(`${BASE}/#/user-space/subscriptions`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForSelector('.apple-pricing.v2 .plan-card', { timeout: 20000 });
  await page.waitForSelector('.apple-pricing.v2 .table-scroll table', { timeout: 20000 });
}

async function readCards(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.apple-pricing.v2 .plan-card')].map((card) => ({
      name: card.querySelector('.plan-head h2')?.textContent?.trim(),
      features: [...card.querySelectorAll('.benefits li')].map((li) =>
        li.textContent.replace(/\s+/g, ' ').trim(),
      ),
    })),
  );
}

async function readTable(page) {
  return page.evaluate(() => {
    const t = document.querySelector('.apple-pricing.v2 .table-scroll table');
    return {
      heads: [...t.querySelectorAll('thead th')].map((th) =>
        th.textContent.replace(/\s+/g, ' ').trim(),
      ),
      rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({
        label: tr.querySelector('th')?.textContent?.trim(),
        cells: [...tr.querySelectorAll('td')].map((td) =>
          td.textContent.replace(/\s+/g, ' ').trim(),
        ),
      })),
      note:
        document
          .querySelector('.apple-pricing.v2 .comparison-note')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() || '',
    };
  });
}

/* ===== 桌面场景 ===== */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await openSubscription(page);

  // A. 卡片权益顺序与数值
  const cards = await readCards(page);
  /* ⚠️ 2026-11-24（plans/046）：五档 → 四档，Plus 并入 Pro。
     同时清理了两处**早已失效**的期望值（plans/046 §0.4 的 P0 基线里它们一直是红的）：
       · 「实验室 PPT / Word N 次 / 月」—— 实验室 2026-10-19 退场，卡片上已无此行；
       · C2/C3/C4 三个附加包断言 —— Coding 附加包 2026-10-20 下线，`.pack-card` 恒为 0 个。
     这两类不是本次改动引入的回归，是基线本来就红；留着它们等于给探针挂一颗常亮红点。 */
  check(
    'A1 卡片为四档（Pro/Max/Ultra）',
    JSON.stringify(cards.map((c) => c.name)) === JSON.stringify(['Pro', 'Max', 'Ultra']),
    cards.map((c) => c.name).join('/'),
  );
  /* A1b 布局守卫（2026-11-24 plans/046 新增）：卡片张数与网格列数必须匹配。
     这一条补的是一个**只有截图才看得见**的回归：`.cards` 当时写死 `repeat(4)`，
     付费卡从 4 张减到 3 张后，三卡只铺 840/1160，右边空出 320px 一整列，
     而 A1/A2 全是读文字内容的断言 —— 它们**全绿**，页面上却缺了一块。
     判据用「最右卡片右沿到容器右沿的留白」而不是数 column 数：
     grid 的计算列数读不到（`getComputedStyle().gridTemplateColumns` 给的是 px 列表），
     而留白直接反映「有没有空列」，且对 gap/嵌套宽度都不敏感。 */
  const layout = await page.evaluate(() => {
    const box = document.querySelector('.apple-pricing.v2 .cards');
    if (!box) return null;
    const cards = [...box.querySelectorAll('.plan-card')];
    if (!cards.length) return null;
    const br = box.getBoundingClientRect();
    const right = Math.max(...cards.map((c) => c.getBoundingClientRect().right));
    const left = Math.min(...cards.map((c) => c.getBoundingClientRect().left));
    return {
      count: cards.length,
      slackRight: Math.round(br.right - right),
      slackLeft: Math.round(left - br.left),
    };
  });
  check(
    'A1b 三张卡铺满网格（右侧留白 < 一个卡宽的一半，无空列）',
    !!layout && Math.abs(layout.slackRight - layout.slackLeft) <= 8 && layout.slackRight < 40,
    layout
      ? `卡数=${layout.count} 左留白=${layout.slackLeft} 右留白=${layout.slackRight}`
      : '未找到 .cards',
  );
  // ⚠️ AI 行的期望值必须带「· 积分 N 折」后缀 —— 卡片模板是逐字渲染
  //    `buildCardFeatures` 生成的整串（`BOH AI 额度 {百分比} · 积分 {折} 折`），
  //    只写前半段会让 A2 恒红。2026-10-02 修：此前这 4 条一直是失败的（既存缺陷，
  //    与当天的额度调整无关；换回 HEAD 版同样 40 pass / 8 fail）。
  //    折数来自 PLAN_AI_POINT_MULTIPLIERS：0.9 / 0.85 / 0.8（Plus 的 0.95 已随档位消失）。
  //    百分比来自 PLAN_AI_TOKEN_PERCENTS，基准 = Pro。
  const expectCards = {
    Pro: [
      'BOH AI 额度 100% · 积分 0.9 折',
      'Cloud+ 450 张',
      '摄影集 5 本 · 单集 40 张',
      '银色昵称',
      '连续 18 场未中奖可兑保底礼',
    ],
    Max: [
      'BOH AI 额度 250% · 积分 0.85 折',
      'Cloud+ 900 张',
      '摄影集 10 本 · 单集 60 张',
      '金色昵称',
      '连续 12 场未中奖可兑保底礼',
    ],
    Ultra: [
      'BOH AI 额度 500% · 积分 0.8 折',
      'Cloud+ 1200 张',
      '摄影集 不限 · 单集 不限',
      '彩虹昵称',
      '连续 8 场未中奖可兑保底礼',
    ],
  };
  for (const [tier, expected] of Object.entries(expectCards)) {
    const card = cards.find((c) => c.name === tier);
    check(
      `A2 ${tier} 卡片五项且顺序统一（AI→云盘→摄影集→昵称→保底）`,
      !!card && JSON.stringify(card.features) === JSON.stringify(expected),
      card ? card.features.join(' | ') : '未找到卡片',
    );
  }

  // B. 对比表结构
  const table = await readTable(page);
  const rowMap = Object.fromEntries(table.rows.map((r) => [r.label, r.cells]));
  check(
    'B1 表头四档价格均带「积分」单位（Standard/Pro/Max/Ultra）',
    table.heads.slice(1).length === 4 && table.heads.slice(1).every((h) => h.includes('积分')),
    table.heads.slice(1).join(' / '),
  );
  check(
    'B2 昵称效果行：—/银色/金色/彩虹（蓝色随 Plus 退场）',
    JSON.stringify(rowMap['昵称效果']) === JSON.stringify(['—', '银色', '金色', '彩虹']),
    (rowMap['昵称效果'] || []).join('/'),
  );
  check(
    'B3 抽奖保底门槛行：—/18 场/12 场/8 场',
    JSON.stringify(rowMap['抽奖保底门槛']) === JSON.stringify(['—', '18 场', '12 场', '8 场']),
    (rowMap['抽奖保底门槛'] || []).join('/'),
  );
  check(
    'B4 客服优先级保留明确标注（无差别档为「普通」非空白）',
    JSON.stringify(rowMap['客服优先级']) === JSON.stringify(['普通', '普通', '优先', '最高优先级']),
    (rowMap['客服优先级'] || []).join('/'),
  );
  check(
    'B5 全档一致的「多模态交互」「定制化看板」不再占表行',
    !rowMap['多模态交互'] && !rowMap['定制化看板'],
  );
  check(
    'B6 公共权益说明含多模态交互与定制化看板 + 保底口径（连续未中奖/清零）',
    table.note.includes('多模态交互') &&
      table.note.includes('定制化看板') &&
      table.note.includes('连续未中奖场次') &&
      table.note.includes('清零'),
    table.note,
  );
  check(
    'B7 摄影集数量行：1 本/5 本/10 本/不限',
    JSON.stringify(rowMap['摄影集数量']) === JSON.stringify(['1 本', '5 本', '10 本', '不限']),
    (rowMap['摄影集数量'] || []).join('/'),
  );
  check(
    'B8 单集照片数行：12 张/40 张/60 张/不限',
    JSON.stringify(rowMap['单集照片数']) === JSON.stringify(['12 张', '40 张', '60 张', '不限']),
    (rowMap['单集照片数'] || []).join('/'),
  );
  check(
    'B9 每月离线导出行：2 次 / 月/10 次 / 月/20 次 / 月/不限',
    JSON.stringify(rowMap['每月离线导出']) ===
      JSON.stringify(['2 次 / 月', '10 次 / 月', '20 次 / 月', '不限']),
    (rowMap['每月离线导出'] || []).join('/'),
  );
  // 2026-10-02 新增：锁住 AI 额度行的值。
  // 2026-10-08：值从绝对 Token 数改成**相对基准档的百分比**，
  // 行名同步从 'BOH AI Token / 天' 改成 'BOH AI 额度'。
  // 2026-11-24（plans/046）：基准档从 plus(400000) 换成 pro(1000000) ⇒
  //   13/100/250/625/1250 → 5/100/250/500。**绝对 token 数一个没动**。
  // 这一行是 subscription-benefits.js 里 PLAN_AI_TOKEN_PERCENTS 的直接投影；
  // 改档位额度（ai_quota_config.daily_token_limit）时必须同批改它，此断言负责抓漏改。
  check(
    'B10 BOH AI 额度 行：5%/100%/250%/500%',
    JSON.stringify(rowMap['BOH AI 额度']) === JSON.stringify(['5%', '100%', '250%', '500%']),
    (rowMap['BOH AI 额度'] || []).join('/'),
  );
  check(
    'B11 旧的「BOH AI Token / 天」行已消失 + 公共说明写明百分比基准（Pro）',
    !rowMap['BOH AI Token / 天'] &&
      /Pro\s*=\s*100%/.test(table.note) &&
      !/Plus\s*=\s*100%/.test(table.note),
    `note=${table.note.slice(0, 80)}`,
  );

  // C. 卡片 vs 表格数值一致性（P1 验收核心）
  // 2026-11-24（plans/046）：列序随四档制前移（Standard 占第 0 列，卡片从第 1 列起）。
  const colIdx = { Pro: 1, Max: 2, Ultra: 3 };
  for (const card of cards) {
    const col = colIdx[card.name];
    const pick = (re) => card.features.find((f) => re.test(f)) || '';
    const cell = (label) => (rowMap[label] || [])[col] || '';
    const pairs = [
      // ⚠️ AI 行必须先切掉 ` · ` 之后的部分再取数字：卡片文案是
      //    `BOH AI 额度 250% · 积分 0.9 折`，`digits()` 会把折数的 0.9 也拼进来
      //    （得到 `2500.9`），而表格单元格只有 `250%`。2026-10-02 修 —— 此前这 4 条
      //    一直是失败的（既存缺陷，与当天的额度调整无关）。
      ['AI 额度', digits(pick(/^BOH AI/).split(' · ')[0]), digits(cell('BOH AI 额度'))],
      ['Cloud+', digits(pick(/^Cloud\+/)), digits(cell('Cloud+ 存储空间'))],
      // 2026-11-24：实验室 2026-10-19 已退场，卡片与表格都没有这一行 —— pair 一并删除。
      [
        '摄影集数量',
        (pick(/^摄影集 /).match(/^摄影集 (.+?) ·/) || ['', ''])[1],
        cell('摄影集数量'),
      ],
      ['单集照片数', (pick(/· 单集 /).match(/· 单集 (.+)$/) || ['', ''])[1], cell('单集照片数')],
      ['昵称', pick(/昵称$/).replace(/昵称$/, ''), cell('昵称效果')],
      ['保底', digits(pick(/保底礼$/)), digits(cell('抽奖保底门槛'))],
    ];
    for (const [name, cardVal, tableVal] of pairs) {
      check(
        `C ${card.name} · ${name} 卡片与表格一致`,
        cardVal === tableVal && cardVal !== '',
        `卡片「${cardVal}」vs 表格「${tableVal}」`,
      );
    }
  }

  /* C2/C3/C4（四个附加包只写百分比 / 不再出现 Token 绝对数 / 联网次数带加号）
     于 2026-11-24 删除：Coding 附加包 2026-10-20 已整体下线（plans/030 §5），
     订阅页的 `.pack-card` 恒为 0 个 ⇒ 这三条断言在 P0 基线里就是红的（读不到任何卡片）。
     留着等于给探针挂一颗常亮红点，会把真回归淹掉。
     恢复附加包时从 git 历史取这三段，不要凭记忆重写。 */

  // D. 月付 / 年付切换
  // 2026-11-24（plans/046）：Pro 改价 月 20 → **15**，年付沿用「月价 × 10」硬规则 ⇒ **150**。
  // D2 原本锁的是「Plus 年付 80」—— Plus 已并入 Pro，改锁 Pro 月付 15（$D3 的月付值）。
  await page.click('.apple-pricing.v2 .seg-btn:has-text("单年")');
  await page.waitForTimeout(900);
  const yearlyTable = await readTable(page);
  check(
    'D1 切年付：Pro 表头价格 150 积分 / 年',
    yearlyTable.heads.some((h) => h.includes('150 积分 / 年')),
    yearlyTable.heads.join(' / '),
  );
  check(
    'D2 切年付：不再出现已下架的 Plus 价格（80 积分 / 年）',
    !yearlyTable.heads.some((h) => h.includes('80 积分 / 年')),
    yearlyTable.heads.join(' / '),
  );
  await page.screenshot({ path: `${OUT}/desktop-yearly.png`, fullPage: true });
  await page.click('.apple-pricing.v2 .seg-btn:has-text("单月")');
  await page.waitForTimeout(900);
  const monthlyTable = await readTable(page);
  check(
    'D3 切回月付：Pro 表头价格 15 积分 / 月',
    monthlyTable.heads.some((h) => h.includes('15 积分 / 月')),
    monthlyTable.heads.join(' / '),
  );
  await page.screenshot({ path: `${OUT}/desktop-monthly.png`, fullPage: true });
  await context.close();
}

/* ===== 手机场景（390 × 844）===== */
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await openSubscription(page);

  const layout = await page.evaluate(() => {
    const tableScroll = document.querySelector('.apple-pricing.v2 .table-scroll');
    const firstCard = document.querySelector('.apple-pricing.v2 .plan-card');
    const cards = document.querySelectorAll('.apple-pricing.v2 .plan-card');
    return {
      tableScrollable: !!tableScroll && tableScroll.scrollWidth > tableScroll.clientWidth,
      tableScrollWidth: tableScroll?.querySelector('table')?.offsetWidth || 0,
      cardWidth: firstCard?.offsetWidth || 0,
      singleColumn:
        cards.length > 1 &&
        Math.abs(cards[1].offsetTop - cards[0].offsetTop) > (cards[0]?.offsetHeight || 0) / 2,
      pageOverflowX:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  check(
    'E1 手机端表格可横滑（内容宽 640+，容器内滚动）',
    layout.tableScrollable && layout.tableScrollWidth >= 640,
    `表格内容 ${layout.tableScrollWidth}px`,
  );
  check('E2 手机端卡片单列排布', layout.singleColumn, `卡宽 ${layout.cardWidth}px`);
  check('E3 页面无横向溢出（不撑破 body）', !layout.pageOverflowX);
  await page.screenshot({ path: `${OUT}/mobile-top.png` });
  await page.evaluate(() =>
    document.querySelector('.apple-pricing.v2 .comparison')?.scrollIntoView(),
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/mobile-table.png` });
  await context.close();
}

await browser.close();
console.log(`\n===== ${pass} pass / ${fail} fail =====`);
process.exit(fail > 0 ? 1 : 0);
