#!/usr/bin/env node
// =====================================================================
// 探针：本机网络 → 线上站点的分段耗时
//
//   为什么需要它：这个仓库的"慢"投诉来自国内用户，而 agent 侧的测量环境
//   会**按规则分流**——国内域名走本地 ISP 直连、境外域名走境外出口。
//   所以只看 `curl cloudflare.com` 的出口 IP 会得出"我在新加坡"的错误结论，
//   实际测本站时走的是本地链路。判定"本次数据可信吗"的可靠办法是：
//   看 `myip.ipip.net` 报的归属地是不是国内 + 用国内 CDN（baidu）做 RTT 基线。
//
//   测什么（每一段都可独立归因）：
//     0. 出口归属地 + 国内基线               → 本次数据是否可信
//     1. 首页 HTML ×3                        → 跨境一跳 + 边缘是否缓存
//     2. 首屏入口 JS/CSS 逐个                → 首屏并发请求的真实代价
//     3. Supabase /auth/v1/health            → 首屏数据接口的跨境 RTT
//     4. Cloudinary CDN                      → 图片链路的跨境 RTT
//
//   用法：
//     node scripts/probes/probe-latency.mjs
//     node scripts/probes/probe-latency.mjs --site=https://boh.pages.dev/
//
//   判读要点（2026-10-31 实测基线，浙江温州移动）：
//     baidu 0.10s / 本站首页 0.73s / 边缘已命中的 JS 仍 0.70–1.04s
//     ⇒ 边缘命中与否差别很小，说明代价几乎全是「跨境 RTT + TLS 握手」，
//       不是源站处理。这类瓶颈改配置只能省一两百毫秒。
// =====================================================================

import { request as httpsRequest } from 'node:https';
import { performance } from 'node:perf_hooks';
import { Resolver } from 'node:dns/promises';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SITE = argOf('site', 'https://www.blockofhome.cn/').replace(/\/?$/, '/');
const SUPABASE = argOf('supabase', 'https://nplnlefdwfgtyimfkyih.supabase.co/');
const CDN = argOf('cdn', 'https://cdn.blockofhome.cn/');
const TIMEOUT = 15_000;

const ms = (v) => `${Math.round(v)}ms`;

/**
 * CDN 常常无视 `accept-encoding: identity` 照样回 br/gzip，
 * 不解码就是二进制，正则永远匹配不到（踩过一次）。
 */
function decodeBody(buf, encoding = '') {
  try {
    if (encoding === 'br') return brotliDecompressSync(buf).toString('utf8');
    if (encoding === 'gzip') return gunzipSync(buf).toString('utf8');
  } catch {
    return '';
  }
  return buf.toString('utf8');
}

/**
 * 单次 GET，返回分段耗时与关键响应头。
 * 用 node:https 而不是 fetch —— fetch 拿不到 connect/secureConnect 时刻。
 * 不取 body 时拿到 ttfb 就断开，避免被慢速流式响应拖住（踩过 20s 挂死）。
 */
function probe(url, { keepBody = false } = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const marks = { connect: null, secure: null };
    let bytes = 0;

    const req = httpsRequest(
      url,
      {
        method: 'GET',
        headers: {
          // 要解析 HTML 时必须拿明文：node 不会自动解 br/gzip，
          // 拿到的是二进制，正则必然匹配不到（踩过一次）。
          'accept-encoding': keepBody ? 'identity' : 'br, gzip',
          'user-agent': 'boh-latency-probe/1.0',
          accept: 'text/html,application/json,*/*',
        },
        timeout: TIMEOUT,
        // 不复用 socket：前一次 res.destroy() 会让 keep-alive 池里的连接处于半死状态，
        // 下一个请求拿到它就会永久挂住（实测 exit 137 卡在这里）。
        agent: false,
      },
      (res) => {
        const ttfb = performance.now() - t0;
        const h = res.headers;
        const result = {
          ok: true,
          code: res.statusCode,
          tcp: marks.connect == null ? null : marks.connect - t0,
          tls: marks.secure == null ? null : marks.secure - t0,
          ttfb,
          total: ttfb,
          bytes: Number(h['content-length'] ?? 0) || 0,
          ip: res.socket?.remoteAddress ?? '',
          cacheControl: h['cache-control'] ?? '',
          cacheStatus: h['cf-cache-status'] ?? '',
          encoding: h['content-encoding'] ?? '',
          age: h.age ?? '',
        };

        if (!keepBody) {
          res.destroy();
          resolve(result);
          return;
        }

        const chunks = [];
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes < 400_000) chunks.push(c);
        });
        res.on('end', () => {
          result.bytes = bytes;
          result.total = performance.now() - t0;
          result.body = decodeBody(Buffer.concat(chunks), h['content-encoding']);
          resolve(result);
        });
      },
    );

    req.on('socket', (socket) => {
      const stamp = (key) => () => {
        if (marks[key] == null) marks[key] = performance.now();
      };
      if (socket.connecting) {
        socket.once('connect', stamp('connect'));
        socket.once('secureConnect', stamp('secure'));
      } else {
        marks.connect = performance.now();
        marks.secure = performance.now();
      }
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    // 硬看门狗：node 的 timeout 只管 socket 空闲，某些半死连接上不会触发。
    const watchdog = setTimeout(() => req.destroy(new Error('watchdog')), TIMEOUT + 3000);
    req.on('error', (err) => {
      clearTimeout(watchdog);
      resolve({ ok: false, error: err.code || err.message, total: performance.now() - t0 });
    });
    req.on('close', () => clearTimeout(watchdog));
    req.end();
  });
}

const line = (label, r, extra = '') => {
  if (!r.ok) return `  ${label.padEnd(34)} 失败 (${r.error})`;
  const parts = [
    `tcp=${r.tcp == null ? '-' : ms(r.tcp)}`,
    `tls=${r.tls == null ? '-' : ms(r.tls)}`,
    `ttfb=${ms(r.ttfb)}`,
    `${Math.round(r.bytes / 1024)}KB`,
    r.encoding || 'raw',
    r.cacheStatus ? `cf=${r.cacheStatus}` : '',
    extra,
  ].filter(Boolean);
  return `  ${label.padEnd(34)} ${parts.join('  ')}`;
};

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// ---------------------------------------------------------------- 0. 前置检查
async function checkVantage() {
  console.log('\n== 0. 出口检查（决定本次数据是否可信）==');

  const egress = await probe('https://myip.ipip.net/', { keepBody: true });
  const egressText = (egress.body || '').replace(/\s+/g, ' ').trim();
  const isChina = egressText.includes('中国');
  console.log(`  出口: ${egressText.slice(0, 90) || '(取不到)'}`);

  const baseline = await probe('https://www.baidu.com/');
  console.log(line('国内基线 baidu', baseline));

  try {
    const resolved = await new Resolver({ timeout: 4000, tries: 1 }).resolve4(
      new URL(SITE).hostname,
    );
    console.log(`  DNS: ${new URL(SITE).hostname} → ${resolved.join(', ')}`);
  } catch (err) {
    console.log(`  DNS: 解析失败 (${err.code || err.message})`);
  }

  if (!isChina) {
    console.log('  ⚠️ 出口不在国内 —— 本次测的是代理出口，不能代表国内用户。');
  } else if (!baseline.ok || baseline.ttfb > 400) {
    console.log('  ⚠️ 国内基线本身异常（baidu > 400ms），先排查本机网络。');
  } else {
    console.log('  ✅ 出口在国内、基线正常 —— 本次数据可代表国内用户体验');
  }
  return { isChina, baseline: baseline.ok ? baseline.ttfb : null };
}

// ---------------------------------------------------------------- 1..4 分段
async function main() {
  const { isChina, baseline } = await checkVantage();

  console.log('\n== 1. 首页 HTML（连续 3 次，看跨境一跳的稳定性）==');
  const htmlRuns = [];
  for (let i = 0; i < 3; i++) {
    const r = await probe(SITE);
    htmlRuns.push(r);
    console.log(line(`第 ${i + 1} 次 ${new URL(SITE).pathname}`, r, `ip=${r.ip || '-'}`));
  }
  const firstOk = htmlRuns.find((r) => r.ok);
  if (firstOk) {
    console.log(
      `  缓存头: cache-control="${firstOk.cacheControl}"  age="${firstOk.age}"  ` +
        `压缩=${firstOk.encoding || 'none'}`,
    );
  }

  const entryAssets = [];
  if (firstOk) {
    const html = await probe(SITE, { keepBody: true });
    if (html.ok && html.body) {
      const re = /(?:href|src)="\.?\/?(static\/(?:js|css)\/[^"]+\.(?:js|css))"/g;
      let m;
      while ((m = re.exec(html.body))) if (!entryAssets.includes(m[1])) entryAssets.push(m[1]);
    }
  }

  if (entryAssets.length) {
    console.log(`\n== 2. 首屏入口资源（${entryAssets.length} 个）==`);
    let totalBytes = 0;
    let slowest = 0;
    for (const asset of entryAssets) {
      const r = await probe(new URL(asset, SITE).href);
      if (r.ok) {
        totalBytes += r.bytes;
        slowest = Math.max(slowest, r.ttfb);
      }
      console.log(line(asset.split('/').pop(), r));
    }
    console.log(
      `  合计 ${Math.round(totalBytes / 1024)}KB（压缩后）· 最慢单个 ttfb=${ms(slowest)}` +
        '（真实浏览器共用一个 h2 连接，只需一次 TLS）',
    );
  } else {
    console.log('\n== 2. 首屏入口资源：未从 HTML 中解析到，跳过 ==');
  }

  console.log('\n== 3. Supabase 接口（首屏数据链路）==');
  for (let i = 0; i < 2; i++) {
    const r = await probe(new URL('auth/v1/health', SUPABASE).href);
    console.log(line(`auth/v1/health #${i + 1}`, r));
  }

  console.log('\n== 4. Cloudinary CDN（图片链路）==');
  console.log(line('cdn 根路径', await probe(CDN)));

  // ---------------------------------------------------------------- 判定
  const siteTtfb = median(htmlRuns.filter((r) => r.ok).map((r) => r.ttfb));
  console.log('\n== 判定 ==');
  if (!isChina) {
    console.log('  ⚠️ 本次数据不可用（出口在境外）。关掉代理后重跑。');
  } else if (siteTtfb == null) {
    console.log('  ⚠️ 首页全部失败，先确认网络是否可达。');
  } else {
    const gap = baseline ? siteTtfb / baseline : null;
    console.log(
      `  首页 ttfb 中位数 ${ms(siteTtfb)}，国内基线 ${baseline ? ms(baseline) : '-'}` +
        (gap ? `，相差 ${gap.toFixed(1)}×` : ''),
    );
    if (siteTtfb < 300) {
      console.log('  ⇒ 跨境不是瓶颈。优先级：只修「更新及时」，别动 CF 规则。');
    } else if (siteTtfb < 800) {
      console.log('  ⇒ 中等。CF 侧配置（首页进边缘缓存）预期省 150–300ms，到不了国内 CDN 水平。');
      console.log('     真要根治需要备案 + 国内 CDN；迁 CF Pages 只是小幅改善。');
    } else {
      console.log('  ⇒ 跨境是主要瓶颈。改配置只能缓解，根治要国内节点。');
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('探针异常:', err);
  process.exit(1);
});
