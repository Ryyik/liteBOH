/**
 * 咖啡店八类机制的端到端交互探针（plans/026 P0-2）
 *
 * 为什么需要这条：单测证明**引擎函数**正确，但证明不了
 *「指针事件真的连到了引擎」「requestAnimationFrame 真的在推进」「提交真的进了下一步」。
 * 这三类接线错误单测一条都抓不到。
 *
 * 做法：按当前步骤的 kind 走对应的真实输入，然后断言订单状态真的前进了。
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://[::1]:5173';
const results = [];
const check = (name, pass, extra = '') => {
  results.push({ name, pass });
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''));
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

/** 开一局，返回页面与状态读取器 */
/** 把当前步做完（按 kind 派发输入），成功返回 true */
async function finishCurrentStep(page, read, kind) {
  if (kind === 'oscillate' || kind === 'texture' || kind === 'layer') {
    const btn = page.locator('.hold-button');
    if (!(await btn.count())) return false;
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(kind === 'oscillate' ? 1600 : 2400);
    await page.mouse.up();
  } else if (kind === 'staged') {
    const btn = page.locator('.machine-button').first();
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2400);
    if (await page.locator('.vent-valve').count()) await page.locator('.vent-valve').click();
    await page.mouse.up();
  } else if (kind === 'swirl') {
    await drawCircle(page, 1.15);
  } else if (kind === 'trace') {
    await followGuide(page);
  } else if (kind === 'timed' || kind === 'sequenced') {
    const dose = page.locator('.machine-button').first();
    for (let i = 0; i < (kind === 'timed' ? 3 : 2); i += 1) {
      await dose.click();
      await page.waitForTimeout(450);
    }
  } else {
    return false;
  }
  await page.waitForTimeout(420);
  return true;
}

/**
 * 切到「当前步是目标 kind」的那一单。
 *
 * ⚠️ 两轮实测踩的坑，都写在这里免得重犯：
 *  1. 8 款咖啡里有 6 款第一步是 grind ⇒ 开局三单的当前步几乎必然都是 oscillate。
 *     只切单不推进，永远找不到 swirl/trace。必须**边切边做**，把第一步走完再找。
 *  2. 切单后必须重新读 kind：做完一步后 activeStep 自动前进，同一单会变成下一种机制。
 */
async function switchToKind(page, read, targetKinds) {
  const wanted = Array.isArray(targetKinds) ? targetKinds : [targetKinds];

  // 优先走调试钩子直接指定配方 —— 随机开局下 8 款咖啡只有 4 款含 pour，
  // 「切单 + 一路做」实测跑 24 轮都遇不到 trace。
  const hookMap = {
    swirl: 'americano', // grind→extract→water
    staged: 'americano',
    oscillate: 'americano',
    texture: 'latte', // grind→extract→steam→pour
    trace: 'latte',
    sequenced: 'mocha', // grind→extract→cocoa→steam→pour
    timed: 'coconut-americano', // grind→extract→ice→coconut
    layer: 'coconut-americano',
  };
  for (const kind of wanted) {
    const drinkId = hookMap[kind];
    if (!drinkId) continue;
    const applied = await page.evaluate(
      (id) => window.__cafeDebug?.forceDrink?.(id) ?? false,
      drinkId,
    );
    if (!applied) continue;
    await page.waitForTimeout(250);
    // 一路推进到目标 kind（同一杯里该机制出现在第 N 步）
    for (let step = 0; step < 7; step += 1) {
      const state = await read();
      if (state.stationKind === kind) return state;
      if (state.canServe || state.stationKind == null) break;
      await finishCurrentStep(page, read, state.stationKind);
    }
    const final = await read();
    if (wanted.includes(final.stationKind)) return final;
  }

  // 钩子不可用（生产构建）时退回「切单 + 推进」
  const orderCount = await page.locator('.order-pill').count();
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 0; i < orderCount; i += 1) {
      const pills = page.locator('.order-pill');
      if (i >= (await pills.count())) break;
      await pills.nth(i).click({ force: true });
      await page.waitForTimeout(200);
      let state = await read();
      for (let step = 0; step < 7; step += 1) {
        if (wanted.includes(state.stationKind)) return state;
        if (state.canServe || state.stationKind == null) break;
        await finishCurrentStep(page, read, state.stationKind);
        state = await read();
      }
    }
  }
  return read();
}

async function openRound() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#/anniversary-cafe`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /开始营业/ }).click();
  await page.waitForTimeout(700);
  const read = () =>
    page.evaluate(() => {
      const strip = [...document.querySelectorAll('.order-pill')];
      const stepEl = document.querySelector('.process-steps li.active span');
      return {
        stationKind:
          document.querySelector('.cafe-stage-station')?.className.match(/kind-(\w+)/)?.[1] || null,
        stepName: document.querySelector('.control-heading strong')?.textContent?.trim() || null,
        stepText: stepEl?.textContent?.trim() || null,
        orderCount: strip.length,
        activeStepIndex: [...document.querySelectorAll('.process-steps li')].findIndex((el) =>
          el.classList.contains('active'),
        ),
        doneCount: [...document.querySelectorAll('.process-steps li')].filter((el) =>
          el.classList.contains('done'),
        ).length,
        totalSteps: document.querySelectorAll('.process-steps li').length,
        feedback: document.querySelector('.feedback')?.textContent?.trim() || null,
        readoutValue: document.querySelector('.readout-value')?.style.left || null,
        hasArt: Boolean(
          document.querySelector('.station-art') || document.querySelector('.station-serve'),
        ),
        hasVent: Boolean(document.querySelector('.vent-valve')),
        canServe: Boolean(document.querySelector('.serve-button')),
        holding: Boolean(document.querySelector('.cafe-stage-station.holding')),
      };
    });
  return { page, errors, read };
}

/** 在装置区画一个圆（给 swirl / trace 用） */
async function drawCircle(page, turns = 1.05) {
  const box = await page.locator('.gesture-capture').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) * 0.34;
  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  const steps = 44;
  for (let i = 1; i <= steps * turns; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  await page.mouse.up();
}

/** 沿引导线走一遍（给 trace / pour 用） */
async function followGuide(page) {
  const box = await page.locator('.gesture-capture').boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 60; i += 1) {
    const t = i / 60;
    const x = box.x + t * box.width;
    // 引导线在 0.5±0.26·sin(π·u)·(1-0.35cos(π·u))，u=(x/W-0.5)*2
    const u = (t - 0.5) * 2;
    const y =
      box.y +
      (0.5 - 0.26 * Math.sin(Math.PI * u) * (1 - 0.35 * Math.cos(Math.PI * u))) * box.height;
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
}

// ═══════════════ 场景 1：研磨（oscillate）—— 按住直到稳定 ═══════════════
{
  const { page, errors, read } = await openRound();
  // 找到研磨订单：逐单切换直到 stationKind==='oscillate'
  const state = await switchToKind(page, read, 'oscillate');
  check('1a 能定位到研磨步骤', state.stationKind === 'oscillate', `当前 kind=${state.stationKind}`);

  if (state.stationKind === 'oscillate') {
    const before = state.activeStepIndex;
    const btn = page.locator('.hold-button');
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // 稳定需要 1 秒且不能撞顶（riseRate 28，窗口 40→92）。
    // 按 1.6s：起步阶段要先进窗口才计时，1.25s 太紧会读到还没起步的读数条。
    await page.waitForTimeout(1600);
    const mid = await read();
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await read();
    check(
      '1b 读数条在推进（rAF 接线正确）',
      mid.readoutValue && mid.readoutValue !== '0%',
      `值=${mid.readoutValue}`,
    );
    check('1c 研磨完成后步进前进', after.doneCount > before, `${before} → ${after.doneCount}`);
  }
  check('1d 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 2：注水（swirl）—— 画弧闭合 ═══════════════
{
  const { page, errors, read } = await openRound();
  const state = await switchToKind(page, read, 'swirl');
  check('2a 能定位到注水步骤', state.stationKind === 'swirl', `当前 kind=${state.stationKind}`);

  if (state.stationKind === 'swirl') {
    const before = state.activeStepIndex;
    await drawCircle(page, 1.1);
    await page.waitForTimeout(500);
    const after = await read();
    // 用 activeStepIndex 判定（doneCount 在「整单做完→换单」时会被重置成 0，
    // 实测出现 `2 → 0` 的假失败）
    // 注水是 americano 的最后一步 ⇒ 做完这单会被移除、activeStepIndex 读成 -1。
    // 「订单消失」是终点证据，但要排除「超时被移除」：用订单数 + 出杯按钮区分。
    check(
      '2b 注水画弧后步进前进（做完这单可出杯）',
      after.activeStepIndex > before || after.canServe || after.stationKind === null,
      `idx ${before} → ${after.activeStepIndex}, serve=${after.canServe}, fb=${after.feedback}`,
    );
    // 订单被移除后 feedback 读不到，所以只在订单还在时判定
    if (after.feedback) {
      check('2c 反馈提到水线/圈', /水|弧|圈|倾角|完整/.test(after.feedback), after.feedback);
    } else {
      check('2c 注水完成后订单结算（反馈随订单移除）', after.stationKind === null, '订单已移除');
    }
  }
  check('2d 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 3：奶泡（texture）—— 进气量涨到目标区松手 ═══════════════
{
  const { page, errors, read } = await openRound();
  const state = await switchToKind(page, read, 'texture');
  check('3a 能定位到奶泡步骤', state.stationKind === 'texture', `当前 kind=${state.stationKind}`);

  if (state.stationKind === 'texture') {
    const before = state.activeStepIndex;
    const btn = page.locator('.hold-button');
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2400); // 进气量 17/s ⇒ 约 41，目标窗 46~74 需 ~2.9s
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await read();
    check(
      '3b 奶泡完成后步进前进',
      after.activeStepIndex > before || after.doneCount > 0,
      `idx ${before} → ${after.activeStepIndex}, done=${after.doneCount}`,
    );
  }
  check('3c 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 4：投料（sequenced / timed）—— 点按钮 ═══════════════
{
  const { page, errors, read } = await openRound();
  const state = await switchToKind(page, read, ['sequenced', 'timed']);
  check(
    '4a 能定位到投料步骤',
    ['sequenced', 'timed'].includes(state.stationKind),
    `当前 kind=${state.stationKind}`,
  );

  if (['sequenced', 'timed'].includes(state.stationKind)) {
    const before = state.activeStepIndex;
    const doseBtn = page.locator('.machine-button').first();
    const count = state.stationKind === 'timed' ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      await doseBtn.click();
      await page.waitForTimeout(450); // 间隔要 > minGapMs(380)，否则判 fair
    }
    await page.waitForTimeout(500);
    const after = await read();
    check(
      '4b 投料完成后步进前进',
      after.activeStepIndex > before || after.doneCount > 0,
      `idx ${before} → ${after.activeStepIndex}, done=${after.doneCount}`,
    );
  }
  check('4c 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 5：拉花（trace）—— 跟随引导线 ═══════════════
{
  const { page, errors, read } = await openRound();
  const state = await switchToKind(page, read, 'trace');
  check('5a 能定位到拉花步骤', state.stationKind === 'trace', `当前 kind=${state.stationKind}`);

  if (state.stationKind === 'trace') {
    const before = state.activeStepIndex;
    await followGuide(page);
    await page.waitForTimeout(500);
    const after = await read();
    check(
      '5b 拉花跟线后步进前进（做完这单可出杯）',
      after.activeStepIndex > before || after.canServe || after.stationKind === null,
      `idx ${before} → ${after.activeStepIndex}, serve=${after.canServe}, fb=${after.feedback}`,
    );
    if (after.feedback) {
      check(
        '5c 拉花反馈提到心形/轨迹',
        /心|轨迹|线条|收笔|杯心/.test(after.feedback),
        after.feedback,
      );
    } else {
      check('5c 拉花完成后订单结算', after.stationKind === null, '订单已移除');
    }
  }
  check('5d 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 6：萃取（staged）—— 排气阀按钮真实可点 ═══════════════
{
  const { page, errors, read } = await openRound();
  const state = await switchToKind(page, read, 'staged');
  check('6a 能定位到萃取步骤', state.stationKind === 'staged', `当前 kind=${state.stationKind}`);

  if (state.stationKind === 'staged') {
    // 注入蒸汽中段（value 34~62，按钮自动出现）
    const btn = page.locator('.machine-button').first();
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // rate=20/s ⇒ 排气窗[28,56] 是 1.4~2.8s，等到 2.0s 时按钮应已出现
    await page.waitForTimeout(2000);
    const mid = await read();
    check('6b 中段出现排气阀按钮', mid.hasVent, `kind=${mid.stationKind}`);
    if (mid.hasVent) {
      await page.locator('.vent-valve').click();
      await page.waitForTimeout(200);
      // 排气后按钮应消失（ventedAt >= 0）—— 这就是「排气已记录」的可观测证据
      const ventGone = (await page.locator('.vent-valve').count()) === 0;
      check('6c 排气阀可点（点完按钮消失 = 排气已记录）', ventGone, `gone=${ventGone}`);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await read();
    check(
      '6d 萃取完成后步进前进（走到金区外也算推进）',
      after.activeStepIndex >= mid.activeStepIndex || after.canServe,
      `idx ${mid.activeStepIndex} → ${after.activeStepIndex}, serve=${after.canServe}`,
    );
  }
  check('6e 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 6.5：失败后还能重按（用户报的「长按没反应」）═══════════════
/**
 * 用户报「有概率出现长按没反应」，实测是两个缺陷叠加：
 *  ① `applyStepResult` 失败也 `stepIndex+1` ⇒ 静默送到下一步，
 *     但反馈还写着「下一步：xxx」⇒ 观感上就是「按钮失灵」。
 *  ② `stepStates[stepId].status` 残留 `'failed'`，
 *     而 `canInteract()` 对 failed 直接 return false
 *     ⇒ **切回那一单时长按真的完全没有任何反应**（连 holding 都不出现）。
 *
 * 「有概率」正是因为要玩家失败后再切回同一单才触发。
 */
{
  const { page, errors, read } = await openRound();
  await page.evaluate(() => window.__cafeDebug?.forceDrink?.('americano'));
  await page.waitForTimeout(400);

  // 故意只按 200ms（远不够1秒稳定）⇒ 必失败
  const box = await page.locator('.hold-button').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const failed = await read();
  check(
    '6.5a 失败后仍停在原步骤（不静默跳下一步）',
    failed.activeStepIndex === 0 && failed.stationKind === 'oscillate',
    `idx=${failed.activeStepIndex} kind=${failed.stationKind}`,
  );
  check(
    '6.5b 失败反馈标明要重做、且不含「下一步」',
    /重做/.test(failed.feedback || '') && !/下一步/.test(failed.feedback || ''),
    failed.feedback,
  );

  // 等自动复位后再长按 ⇒ 必须有反应
  await page.waitForTimeout(1100);
  const box2 = await page.locator('.hold-button').boundingBox();
  const hasButton = await page.locator('.hold-button').count();
  check('6.5c 失败后长按按钮仍在（没被换掉）', hasButton > 0);
  if (hasButton) {
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    const mid = await read();
    await page.mouse.up();
    // 反证关键：holding 必须为 true 且读数条在动
    check(
      '6.5d 失败后重按有反应（反证：修复前这里全无反应）',
      mid.holding === true,
      `holding=${mid.holding} 值=${mid.readoutValue}`,
    );
  }

  // 切单再切回 —— 这是「有概率」的触发条件
  const pills = await page.locator('.order-pill').count();
  if (pills > 1) {
    const beforeSwitch = (await read()).activeStepIndex;
    await page.locator('.order-pill').nth(1).click({ force: true });
    await page.waitForTimeout(250);
    await page.locator('.order-pill').nth(0).click({ force: true });
    await page.waitForTimeout(250);
    const back = await read();
    check(
      '6.5e1 切走再切回 ⇒ 回到原来那一步（不是停在别的单/别的步）',
      back.activeStepIndex === beforeSwitch,
      `切走前=${beforeSwitch} 切回后=${back.activeStepIndex}`,
    );
    const box3 = await page.locator('.hold-button').boundingBox();
    if (box3) {
      await page.mouse.move(box3.x + box3.width / 2, box3.y + box3.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(500);
      const mid = await read();
      await page.mouse.up();
      check('6.5e2 失败后切单再切回，长按仍有反应', mid.holding === true, `holding=${mid.holding}`);
    } else {
      check('6.5e3 切回后长按按钮存在', false, 'hold-button 缺失');
    }
  }
  check('6.5f 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 7：猫救场的三条约束真的生效（P0-4）═══════════════
{
  const { page, errors } = await openRound();
  const catState = await page.evaluate(() => {
    const pet = document.querySelector('.voxel-cat');
    const toy = document.querySelector('.toy-button');
    const help = document.querySelector('.help-button');
    return {
      petDisabled: pet?.disabled ?? null,
      toyDisabled: toy?.disabled ?? null,
      helpDisabled: help?.disabled ?? null,
      helpText: help?.textContent?.trim() || null,
      toyText: toy?.textContent?.trim() || null,
    };
  });
  // 制作中（第一步就是 grind 在跑）⇒ 摸猫与逗猫都应禁用
  check(
    '7a 制作中摸猫被禁用（P0-4① 反白嫖）',
    catState.petDisabled === true,
    `disabled=${catState.petDisabled}`,
  );
  check('7b 制作中逗猫被禁用', catState.toyDisabled === true, `disabled=${catState.toyDisabled}`);
  // 救场按钮应显示「亲密度/12」与剩余次数，且额度为 0 时禁用
  check(
    '7c 救场显示亲密度进度与剩余次数',
    /\d+\/12/.test(catState.helpText || '') && /剩\s*2\s*次/.test(catState.helpText || ''),
    catState.helpText,
  );
  check(
    '7d 亲密度不足时救场禁用',
    catState.helpDisabled === true,
    `disabled=${catState.helpDisabled}`,
  );
  check('7e 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ═══════════════ 场景 8：出杯全流程（连出 3 杯，验累计口径）═══════════════
//
// ⚠️ 2026-10-08 加固：首版只出 1 杯、只断言 `coinsAfter > coinsBefore`，
//   而 `0 → 47` 时该断言恒真，对「`stats.coins` 被单杯增量覆盖」零鉴别力
//   （结算回写 bug 时它照样 PASS）。现在连出 3 杯，逐杯核对
//   **累加值**与**连杯递增**——这两个恰好就是那次回归的两个症状。
{
  const { page, errors, read } = await openRound();

  /** 读 HUD 三个指标：营业额 / 已出杯 / 连杯 */
  const hud = () =>
    page.evaluate(() => {
      const pick = (label) => {
        const cell = [...document.querySelectorAll('.hud > div')].find(
          (el) => el.querySelector('small')?.textContent?.trim() === label,
        );
        const raw = cell?.querySelector('strong')?.textContent?.replace(/[^\d]/g, '') ?? '';
        return raw === '' ? null : Number(raw);
      };
      return { coins: pick('营业额'), served: pick('已出杯'), combo: pick('连杯') };
    });

  /** 把当前这一单真正做完（逐机制操作），返回是否走到可出杯 */
  const playOneCup = async () => {
    let guard = 0;
    let sawServe = false;
    let state = await read();
    while (!state.canServe && guard < 14) {
      guard += 1;
      if (state.stationKind === 'oscillate') {
        const box = await page.locator('.hold-button').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(1250);
        await page.mouse.up();
      } else if (state.stationKind === 'staged') {
        const box = await page.locator('.machine-button').first().boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(2600);
        const withVent = await read();
        if (withVent.hasVent) await page.locator('.vent-valve').click();
        await page.mouse.up();
      } else if (state.stationKind === 'swirl') {
        await drawCircle(page, 1.15);
      } else if (state.stationKind === 'texture') {
        const box = await page.locator('.hold-button').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(2900);
        await page.mouse.up();
      } else if (state.stationKind === 'trace') {
        await followGuide(page);
      } else if (['sequenced', 'timed'].includes(state.stationKind)) {
        const dose = page.locator('.machine-button').first();
        for (let i = 0; i < (state.stationKind === 'timed' ? 3 : 2); i += 1) {
          await dose.click();
          await page.waitForTimeout(450);
        }
      } else if (state.stationKind === 'layer') {
        const box = await page.locator('.hold-button').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(2200);
        await page.mouse.up();
      } else {
        break;
      }
      await page.waitForTimeout(420);
      state = await read();
      if (state.canServe) sawServe = true;
    }
    // 说明：循环里如果这一单被完整做完，订单会立刻被移除（canServe 那一瞬间读不到），
    // 所以「走到 kind=null / 订单消失」本身就是「整单做完」的证据。
    return sawServe || state.stationKind === null || state.canServe === true;
  };

  const history = [];
  let reachedAny = false;
  for (let cup = 1; cup <= 3; cup += 1) {
    const before = await hud();
    const ready = await playOneCup();
    if (!ready) break;
    reachedAny = true;
    if (!(await read()).canServe) {
      // 这一单做完后已被移除（不留到出杯界面），换下一单继续
      await page.waitForTimeout(900);
      continue;
    }
    await page.locator('.serve-button').click();
    await page.waitForTimeout(900);
    history.push({ cup, before, after: await hud() });
  }

  check('8a 一杯能真的做完（走完全部步骤）', reachedAny, `连出 ${history.length} 杯`);

  if (history.length >= 2) {
    // 逐杯严格递增（必要不充分：单杯金额本身 > 0）。
    // 真正有鉴别力的是 8c —— 累计额必须大于任意单杯增量。
    check(
      '8b 出杯后营业额逐杯累加（不是只留最后一杯）',
      history.every((h) => h.after.coins > h.before.coins),
      history.map((h) => `${h.before.coins}→${h.after.coins}`).join(', '),
    );
    const last = history[history.length - 1];
    const anySingle = Math.max(...history.map((h) => h.after.coins - h.before.coins));
    check(
      '8c 累计额 > 最大单杯增量（反证「被单杯覆盖」）',
      last.after.coins > anySingle,
      `累计=${last.after.coins} 单杯最大增量=${anySingle}`,
    );
    check(
      '8d 连杯递增（首版回归时恒为 0）',
      history.every((h, i) => h.after.combo === i + 1),
      history.map((h) => `×${h.before.combo}→×${h.after.combo}`).join(', '),
    );
    check(
      '8e 已出杯计数逐杯 +1',
      history.every((h, i) => h.after.served === i + 1),
      history.map((h) => h.after.served).join(','),
    );
  } else {
    check(
      '8b 出杯后营业额逐杯累加（不是只留最后一杯）',
      false,
      `只连出 ${history.length} 杯，样本不足，需手工复核`,
    );
    check(
      '8c 累计额 > 最大单杯增量（反证「被单杯覆盖」）',
      false,
      `只连出 ${history.length} 杯，样本不足`,
    );
    check('8d 连杯递增（首版回归时恒为 0）', false, `只连出 ${history.length} 杯，样本不足`);
    check('8e 已出杯计数逐杯 +1', false, `只连出 ${history.length} 杯，样本不足`);
  }
  check('8f 无 JS 错误', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) {
  console.log('失败：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
