// @vitest-environment node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CSP_REQUIRED_DIRECTIVES,
  buildSecurityHeaders,
  buildServiceWorkerCacheHeaders,
} from '../../scripts/lib/security-headers-config.mjs';

/**
 * 反证式验证：`scripts/check-security-headers-live.mjs` 真的有牙
 *
 * ## 为什么需要这份测试
 *
 * 那道门禁跑在 `deploy.yml` 的**发布之后**，是「安全头是否还活着」的唯一外部观测点。
 * 它失效时的表现不是报错，而是**永远绿** —— 缺头、错值、CSP 少了一条指令，照样 ✅。
 * 这正是它要解决的 2026-11-03 F8 那类病，所以不能让它自己也患上。
 *
 * 这里不起线上请求：本地起一个假站，按场景发不同的响应头，断言退出码与输出。
 * ⇒ 不需要网络，CI 里也能跑；且每个场景都是一条**独立的反证**。
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = fileURLToPath(
  new URL('../../scripts/check-security-headers-live.mjs', import.meta.url),
);

/** 与线上同构的一套完整头（值由单一真源生成，不手写） */
const FULL_HEADERS = {
  ...buildSecurityHeaders({
    cspEnforce: false,
    cspReportUri: 'https://nplnlefdwfgtyimfkyih.supabase.co/functions/v1/csp-report',
    imageOrigins: ['https://res.cloudinary.com'],
  }),
  // sw.js / push-sw.js 在线上是 no-cache（[boh-sw-cache] 规则）；基线场景必须带上，
  // 否则「完整头 ⇒ 通过」这条会因为 SW 缓存断言而红，掩盖它真正要守的东西。
  ...buildServiceWorkerCacheHeaders(),
};

const withoutHeader = (name) =>
  Object.fromEntries(Object.entries(FULL_HEADERS).filter(([key]) => key !== name));

/** 从 CSP 里抠掉一条指令，模拟「有人手改 CSP 时删过头」 */
const cspWithout = (directive) =>
  FULL_HEADERS['Content-Security-Policy-Report-Only']
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${directive} `) && part !== directive)
    .join('; ');

/**
 * 起一个临时假站 + 跑一次探测。
 * `--attempts=1`：反证要的是「第一次就红」，不能让默认的 6 次重试把测试拖到 12 秒。
 * `swOverride`：单独给 sw.js / push-sw.js 换一组响应（缓存断言要能分路径做反证）。
 */
const probeAgainst = (headers, args = [], swOverride = null) =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      const isServiceWorkerScript = /^\/(sw|push-sw)\.js$/.test(pathname);

      if (isServiceWorkerScript && swOverride) {
        res.writeHead(swOverride.status || 200, swOverride.headers || headers);
        res.end('/* sw */');
        return;
      }

      res.writeHead(200, headers);
      res.end('<!doctype html><title>probe</title>');
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const child = spawn(
        process.execPath,
        [SCRIPT, `--url=http://127.0.0.1:${port}/`, '--attempts=1', ...args],
        { cwd: ROOT, env: process.env },
      );

      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));

      child.on('error', (error) => {
        server.close();
        reject(error);
      });
      child.on('close', (code) => {
        server.close();
        resolve({ code, output });
      });
    });
  });

describe('线上安全头探测门禁', () => {
  it('完整头 ⇒ 通过，并说明 CSP 当前处于哪个模式', async () => {
    const { code, output } = await probeAgainst(FULL_HEADERS, []);

    expect(code).toBe(0);
    expect(output).toContain('齐备');
    // Report-Only 只报告、不判红 —— 切换 enforce 是产品决策，不该由门禁替它决定
    expect(output).toContain('Report-Only');
    expect(output).toContain('unsafe-inline');
  }, 30000);

  it('缺任意一个头 ⇒ 红，且点名缺的是哪个', async () => {
    const { code, output } = await probeAgainst(withoutHeader('X-Frame-Options'), []);

    expect(code).toBe(1);
    expect(output).toContain('缺少响应头 x-frame-options');
  }, 30000);

  it('头的值被改宽 ⇒ 红（存在不等于有效）', async () => {
    const { code, output } = await probeAgainst(
      { ...FULL_HEADERS, 'X-Frame-Options': 'SAMEORIGIN' },
      [],
    );

    expect(code).toBe(1);
    expect(output).toContain('值不符');
  }, 30000);

  it('HSTS 有效期被缩短 ⇒ 红', async () => {
    const { code, output } = await probeAgainst(
      { ...FULL_HEADERS, 'Strict-Transport-Security': 'max-age=600' },
      [],
    );

    expect(code).toBe(1);
    expect(output).toContain('max-age');
  }, 30000);

  it('CSP 少一条指令 ⇒ 红（防止手改 CSP 时删掉 object-src 之类）', async () => {
    const { code, output } = await probeAgainst(
      {
        ...FULL_HEADERS,
        'Content-Security-Policy-Report-Only': cspWithout('object-src'),
      },
      [],
    );

    expect(code).toBe(1);
    expect(output).toContain('CSP 缺少指令 object-src');
  }, 30000);

  it('CSP 上报通道断掉 ⇒ 红（没有 report-uri 等于回到"跑着 CSP 却一无所知"）', async () => {
    const { code, output } = await probeAgainst(
      {
        ...FULL_HEADERS,
        'Content-Security-Policy-Report-Only': cspWithout('report-uri'),
      },
      [],
    );

    expect(code).toBe(1);
    expect(output).toContain('CSP 缺少指令 report-uri');
  }, 30000);

  it('--expect-enforce 时仍是 Report-Only ⇒ 红（切换当天用它锁定，防被改回去）', async () => {
    const { code, output } = await probeAgainst(FULL_HEADERS, ['--expect-enforce']);

    expect(code).toBe(1);
    expect(output).toContain('Report-Only');
  }, 30000);

  it('--warn-only 把失败降级为告警（观察期逃生口，不是永久开关）', async () => {
    const { code, output } = await probeAgainst(withoutHeader('Referrer-Policy'), ['--warn-only']);

    expect(code).toBe(0);
    expect(output).toContain('--warn-only');
  }, 30000);

  it('探测清单必须覆盖 CSP 的全部必需指令（防清单自己漏项）', () => {
    const csp = FULL_HEADERS['Content-Security-Policy-Report-Only'];
    const declared = new Set(
      csp
        .split(';')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean),
    );

    for (const directive of CSP_REQUIRED_DIRECTIVES) {
      expect(declared.has(directive), `CSP 真源缺少 ${directive}`).toBe(true);
    }
  });
});

describe('无 hash 入口脚本的缓存门禁（2026-11-10 弹窗循环）', () => {
  const CACHEABLE_SW_HEADERS = { ...FULL_HEADERS, 'Cache-Control': 'public, max-age=14400' };

  it('sw.js 仍被缓存 4 小时 ⇒ 红（这正是弹窗循环的原形态）', async () => {
    const { code, output } = await probeAgainst(FULL_HEADERS, [], {
      headers: CACHEABLE_SW_HEADERS,
    });

    // GitHub Pages 对 .js 发 max-age=14400 ⇒ registration.update() 可能拿到旧字节
    // ⇒ 旧 SW 用旧预缓存应答导航 ⇒ 点「立即更新」仍落旧壳
    expect(code).toBe(1);
    expect(output).toContain('仍可缓存');
    expect(output).toContain('max-age=14400');
  }, 30000);

  it('sw.js 完全没有 Cache-Control ⇒ 红（浏览器按启发式缓存，同样等于旧字节）', async () => {
    const { code, output } = await probeAgainst(FULL_HEADERS, [], {
      headers: withoutHeader('Cache-Control'),
    });

    expect(code).toBe(1);
    expect(output).toContain('缺少 Cache-Control');
  }, 30000);

  it('该文件 404（不参与本次构建）⇒ 跳过，不误红', async () => {
    const { code, output } = await probeAgainst(FULL_HEADERS, [], { status: 404 });

    expect(code).toBe(0);
    expect(output).toContain('跳过缓存断言');
  }, 30000);

  it('注入脚本的规则按 http.request.uri.path 匹配，值取自单一真源', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../scripts/cloudflare-security-headers.mjs', import.meta.url)),
      'utf8',
    );

    expect(source).toContain('[boh-sw-cache]');
    // 必须按 path 匹配：按 query 匹配会让 ?__boh_update= / ?_t= 之类绕过规则
    expect(source).toContain('http.request.uri.path');
    // 值不许在本文件里手写一份
    expect(source).not.toMatch(/['"]Cache-Control['"]\s*:/);
  });
});

describe('安全头定义单一真源', () => {
  it('注入脚本必须 import 共享配置，不能自己再定义一份头的清单', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../scripts/cloudflare-security-headers.mjs', import.meta.url)),
      'utf8',
    );

    // 正向：确实引用了共享配置
    expect(source).toMatch(/from\s+['"]\.\/lib\/security-headers-config\.mjs['"]/);
    // 反向：不许在本地重新定义头名（出现 `'X-Frame-Options':` 这种字面量键就说明又抄了一份）
    expect(source).not.toMatch(/['"]X-Frame-Options['"]\s*:/);
    expect(source).not.toMatch(/['"]Reporting-Endpoints['"]\s*:/);
    expect(source).not.toMatch(/['"]Strict-Transport-Security['"]\s*:/);
  });
});

/**
 * CSP 内联收敛守卫（2026-11-05）
 *
 * `script-src 'unsafe-inline'` 的唯一来源曾是 index.html 的 4 段内联启动脚本。
 * 它们已外置到 public/boot.js，所以那条必须从 CSP 里消失 —— 否则 CSP 对注入型
 * XSS 依然没有边界。这组断言防的是「有人图省事又写回一段内联」：
 * 这类回退不会报错、不会让任何页面坏掉，只会在下一次安全审查时才发现边界又没了。
 */
describe('CSP 内联收敛守卫', () => {
  const readRepo = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');

  it('index.html 里没有内联 <script>（注释里的字面量不算）', () => {
    const html = readRepo('index.html');
    const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const tags = [...withoutComments.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
    const inline = tags.filter((tag) => !/\bsrc=/.test(tag));

    expect(inline, `发现内联脚本：${inline.join(' | ')}`).toEqual([]);
  });

  it('启动脚本 public/boot.js 存在，且带着主题白名单', () => {
    const boot = readRepo('public/boot.js');

    // 主题预置必须仍在最前面执行，否则暗色用户会白闪
    expect(boot).toMatch(/VALID_THEMES\s*=\s*\[/);
    expect(boot.indexOf('data-theme')).toBeGreaterThan(-1);
  });

  it("script-src 不含 'unsafe-inline'（含了就等于没有 XSS 边界）", () => {
    const csp = buildSecurityHeaders({
      cspEnforce: false,
      cspReportUri: 'https://example.invalid/csp-report',
      imageOrigins: ['https://cdn.example.com'],
    })['Content-Security-Policy-Report-Only'];

    const scriptSrc = csp
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // 反向保证：上一步不是靠「script-src 整条被删掉」才通过的
    expect(scriptSrc).toContain("'self'");
  });

  it('CSP 仍带 report-uri / report-to（否则收敛了也拿不到证据）', () => {
    const csp = buildSecurityHeaders({
      cspEnforce: false,
      cspReportUri: 'https://example.invalid/csp-report',
      imageOrigins: [],
    })['Content-Security-Policy-Report-Only'];

    expect(csp).toContain('report-uri https://example.invalid/csp-report');
    expect(csp).toContain('report-to csp-endpoint');
  });
});
