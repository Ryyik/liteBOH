#!/usr/bin/env node
/**
 * check-security-headers-live.mjs — 发布后线上安全响应头断言
 *
 * ## 为什么需要它（2026-11-03 外部审查 F8）
 *
 * 站点托管在 GitHub Pages，安全头只能由 Cloudflare 边缘注入。而
 * `cloudflare-security-headers.mjs` 按设计把「token 缺失 / 权限不足 / 网络失败」
 * 全部处理成「告警 + exit 0」—— 因为门禁不该把发布卡死。
 *
 * 这个取舍本身没错，但它留下一个洞：**token 过期、权限被收、Cloudflare API 变更，
 * CI 依然全绿，线上却是一个没有 CSP / HSTS / XFO 的裸站**。2026-11-03 之前
 * 甚至还有「CSP 是 Report-Only 但没有上报端点」这种跑了两个月没人发现的状态。
 *
 * ⇒ 唯一能发现「防护静默失效」的办法是**从外面看一眼真实的响应头**。
 *   本脚本就是那一看：发布完成后打一次线上请求，按 `lib/security-headers-config.mjs`
 *   的同一份定义逐条断言。
 *
 * ## 为什么它不在 `verify` 里
 *
 * 与 `check:db-lint` / `check:db-advisors` 同理：**它依赖线上可达，本地/CI 离线必失败**。
 * 接进 `verify` 会让「断网就红」。它属于发布链（`deploy.yml` 最后一步），不是提交链。
 *
 * ## 判定策略
 *
 * - **头的存在性 / CSP 指令完整性**：硬断言，缺即 exit 1。这是「防护是否还在」。
 * - **CSP 处于 Report-Only**：只报告，不红。切换 enforce 是产品决策，
 *   由 `--expect-enforce` 显式要求（切换当天打开它，之后它就是锁定项）。
 * - **`'unsafe-inline'`**：只报告。它是**已知的待收敛项**（根因是 index.html 的
 *   4 段内联脚本），在这里染红只会让门禁长期红着、然后被忽略 —— 那是假门禁。
 *
 * ## 边缘传播延迟
 *
 * Cloudflare Transform Rules 保存后不是瞬时全局生效。所以「头缺失」这一类失败
 * 会做**有界重试**（默认 6 次 × 2s），而不是一次定生死。
 * ⚠️ 重试只针对「缺头」，网络层失败不重试 —— 那种情况重试也没用。
 *
 * 用法：
 *   node scripts/check-security-headers-live.mjs                    # 断言默认域名
 *   node scripts/check-security-headers-live.mjs --warn-only        # 失败只告警（观察期）
 *   node scripts/check-security-headers-live.mjs --expect-enforce   # 要求 CSP 已是强制态
 *   node scripts/check-security-headers-live.mjs --url=https://...   # 换目标（可重复）
 */

import {
  CSP_REQUIRED_DIRECTIVES,
  buildCspValue,
  buildSafeHeaders,
} from './lib/security-headers-config.mjs';

const argv = process.argv.slice(2);
const WARN_ONLY = argv.includes('--warn-only');
const EXPECT_ENFORCE = argv.includes('--expect-enforce');
const RETRY_DELAY_MS = 2000;

/**
 * 重试次数可由 `--attempts=N` 覆盖。
 * 存在的理由是可测性：反证式验证要用一个「必然缺头」的本地假站跑，默认 6 次 × 2s
 * 会让每一条反证都白等 10 秒；CI 里保持默认（边缘规则传播需要那点时间）。
 */
const attemptsArg = argv.find((item) => item.startsWith('--attempts='));
const RETRY_ATTEMPTS = Math.max(
  1,
  Number(attemptsArg ? attemptsArg.slice('--attempts='.length) : 6) || 6,
);

const urls = argv
  .filter((item) => item.startsWith('--url='))
  .map((item) => item.slice('--url='.length).trim())
  .filter(Boolean);

const TARGETS = urls.length > 0 ? urls : ['https://www.blockofhome.cn/'];

/** 探测用的占位配置：只取「头名」与「CSP 指令骨架」，不参与值比对 */
const PLACEHOLDER_REPORT_URI = 'https://example.invalid/csp-report';
const EXPECTED_HEADER_NAMES = Object.keys(buildSafeHeaders(PLACEHOLDER_REPORT_URI)).map((name) =>
  name.toLowerCase(),
);
const CSP_DIRECTIVE_SKELETON = buildCspValue({
  cspReportUri: PLACEHOLDER_REPORT_URI,
  imageOrigins: [],
})
  .split(';')
  .map((part) => part.trim().split(/\s+/)[0])
  .filter(Boolean);

/**
 * 每条头的值断言。刻意用「关键子串 / 形态」而不是逐字比对：
 * 逐字比对会在每次调 CSP 域名清单时误红，而这里要守的是「这条防护还在」。
 */
const HEADER_ASSERTIONS = {
  'x-content-type-options': {
    test: (value) => value === 'nosniff',
    expect: 'nosniff',
    why: '禁止 MIME 嗅探，防「上传 .txt 被当脚本执行」',
  },
  'referrer-policy': {
    test: (value) => /strict-origin/i.test(value),
    expect: '含 strict-origin',
    why: '跨站跳转不泄露完整路径（token/查询参数常在 URL 里）',
  },
  'x-frame-options': {
    test: (value) => /^deny$/i.test(value.trim()),
    expect: 'DENY',
    why: '点击劫持防线；CSP enforce 前这是 frame-ancestors 的唯一替代',
  },
  'permissions-policy': {
    test: (value) => /camera=\(\)/.test(value) && /microphone=\(\)/.test(value),
    expect: 'camera=() 与 microphone=() 均被禁用',
    why: '即使被注入脚本，也拿不到摄像头/麦克风',
  },
  'strict-transport-security': {
    test: (value) => {
      const match = /max-age=(\d+)/i.exec(value);
      return Boolean(match) && Number(match[1]) >= 31536000;
    },
    expect: 'max-age ≥ 31536000',
    why: 'HSTS 一年期；低于一年等于没上',
  },
  'reporting-endpoints': {
    test: (value) => /csp/i.test(value) && /\/functions\/v1\/csp-report/.test(value),
    expect: '指向 /functions/v1/csp-report',
    why: 'Chrome 系上报通道；没有它 = 违规被静默丢弃',
  },
};

const probe = async (url) => {
  // cache-buster：Cloudflare / Pages 都可能缓存旧的响应头，带上随机参数绕开
  const target = new URL(url);
  target.searchParams.set('boh_header_probe', String(Date.now()));

  const response = await fetch(target, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(15000),
  });
  return { response, target: target.toString() };
};

/** 收集一次探测的全部问题（空数组 = 通过） */
const inspect = (headers) => {
  const problems = [];
  const notes = [];

  for (const name of EXPECTED_HEADER_NAMES) {
    const value = headers.get(name);
    if (value === null) {
      problems.push(`缺少响应头 ${name}`);
      continue;
    }
    const assertion = HEADER_ASSERTIONS[name];
    if (assertion && !assertion.test(value)) {
      problems.push(`响应头 ${name} 值不符：期望 ${assertion.expect}，实际 "${value}"`);
    }
  }

  // CSP：enforcing 优先，否则看 Report-Only
  const enforced = headers.get('content-security-policy');
  const reportOnly = headers.get('content-security-policy-report-only');
  const csp = enforced || reportOnly;

  if (!csp) {
    problems.push('缺少 Content-Security-Policy（enforcing 与 Report-Only 都没有）');
  } else {
    const directives = new Set(
      csp
        .split(';')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean),
    );
    for (const directive of CSP_REQUIRED_DIRECTIVES) {
      if (!directives.has(directive)) problems.push(`CSP 缺少指令 ${directive}`);
    }

    if (EXPECT_ENFORCE && !enforced) {
      problems.push('CSP 仍为 Report-Only，但本次要求已是强制态（--expect-enforce）');
    }
    if (!EXPECT_ENFORCE && !enforced && reportOnly) {
      notes.push('CSP 为 Report-Only（未强制）；确认收敛后加 --expect-enforce 锁定');
    }
    if (/'unsafe-inline'/.test(csp)) {
      notes.push("CSP 含 'unsafe-inline'（已知待收敛：index.html 的 4 段内联脚本）");
    }
    // 指令骨架漂移：防止有人手改 CSP 时误删整条指令以外的部分
    const declared = new Set(CSP_DIRECTIVE_SKELETON);
    const missingSkeleton = [...declared].filter((name) => !directives.has(name));
    if (missingSkeleton.length > 0) {
      problems.push(`CSP 指令骨架漂移：缺少 ${missingSkeleton.join(', ')}`);
    }
  }

  return { problems, notes };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  let failed = false;

  for (const target of TARGETS) {
    let lastProblems = null;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
      let result;
      try {
        result = await probe(target);
      } catch (error) {
        // 网络层失败不重试：重试也不会让 DNS 恢复
        console.error(`[security-headers-live] ${target} 请求失败：${error?.message || error}`);
        failed = true;
        lastProblems = null;
        break;
      }

      const { problems, notes } = inspect(result.response.headers);
      lastProblems = problems;

      if (problems.length === 0) {
        console.log(
          `[security-headers-live] ✅ ${target} HTTP ${result.response.status}，` +
            `${EXPECTED_HEADER_NAMES.length} 个头 + CSP ${CSP_REQUIRED_DIRECTIVES.length} 条指令齐备`,
        );
        for (const note of notes) console.log(`   · ${note}`);
        break;
      }

      if (attempt < RETRY_ATTEMPTS) {
        console.log(
          `[security-headers-live] ${target} 第 ${attempt}/${RETRY_ATTEMPTS} 次探测未通过` +
            `（${problems[0]}${problems.length > 1 ? ` 等 ${problems.length} 项` : ''}），` +
            `${RETRY_DELAY_MS}ms 后重试（边缘规则传播延迟）`,
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    if (lastProblems && lastProblems.length > 0) {
      failed = true;
      console.error(`[security-headers-live] ❌ ${target} 探测失败：`);
      for (const problem of lastProblems) console.error(`   - ${problem}`);
      console.error(
        '   → 排查顺序：CLOUDFLARE_API_TOKEN 是否失效/缺 Transform Rules 权限 → ' +
          '`node scripts/cloudflare-security-headers.mjs --dry-run` 看规则内容 → ' +
          'Cloudflare 控制台 Rules → Transform Rules 是否仍有 [boh-security-headers] 那条',
      );
    }
  }

  if (!failed) return;

  if (WARN_ONLY) {
    console.log('::warning::security-headers-live 未通过（--warn-only，不阻断发布）');
    return;
  }
  process.exit(1);
};

main().catch((error) => {
  console.error(`[security-headers-live] 未预期错误：${error?.message || error}`);
  process.exit(WARN_ONLY ? 0 : 1);
});
