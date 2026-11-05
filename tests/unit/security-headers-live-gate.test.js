// @vitest-environment node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CSP_REQUIRED_DIRECTIVES,
  buildSecurityHeaders,
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
const FULL_HEADERS = buildSecurityHeaders({
  cspEnforce: false,
  cspReportUri: 'https://nplnlefdwfgtyimfkyih.supabase.co/functions/v1/csp-report',
  imageOrigins: ['https://res.cloudinary.com'],
});

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
 */
const probeAgainst = (headers, args = []) =>
  new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
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
