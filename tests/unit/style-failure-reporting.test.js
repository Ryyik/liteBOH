/**
 * 样式失败的上报守约（2026-10-13）
 *
 * 目的：把「用户看到样式错乱」从**只能靠用户口述**变成服务端可见的信号。
 * 两条信号成对看才有意义：
 *   · `css_load_failure`      —— 任何一次 CSS 预加载失败（含 recoveryTriggered 真假）
 *   · `style_repair_giveup`   —— 页内自愈退避用尽，样式仍然缺（真·带病运行）
 *
 * 本文件锁三件事（都是真行为，不是源文字面量）：
 *   1. `reportEvent` 在配了端点时确实发 beacon、没配时不发（且不抛）；
 *   2. 资源名从 Vite 的真实错误消息里解析得出来（含查询串/异常形状）；
 *   3. 同一会话里同一资源**只报一次**（否则持续故障会把信号淹掉）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const EP = 'https://mon.example/collect';
let beacons = [];

const installDom = () => {
  beacons = [];
  // ⚠️ node 22 的 globalThis.navigator 是**只读 getter**，直接赋值会抛
  //（Cannot set property navigator … only a getter）⇒ 必须走 defineProperty。
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      userAgent: 'probe-agent',
      sendBeacon: (url, body) => {
        beacons.push({ url, body: JSON.parse(body) });
        return true;
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { location: { href: 'https://app.example/#/user-space?tab=posts' } },
  });
};

const dropDom = () => {
  delete globalThis.navigator;
  delete globalThis.window;
};

beforeEach(() => {
  installDom();
});
afterEach(() => {
  dropDom();
  vi.unstubAllEnvs();
});

const loadMonitoring = async () => import('../../src/utils/monitoring.js');
const loadRecovery = async () => import('../../src/utils/vite-preload-recovery.js');

describe('reportEvent —— 通用上报出口', () => {
  it('配了端点：发 beacon，载荷带 type / ts / url / ua', async () => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', EP);
    const { reportEvent } = await loadMonitoring();

    expect(reportEvent('css_load_failure', { asset: 'profile-base-abc.css' })).toBe(true);
    expect(beacons).toHaveLength(1);
    expect(beacons[0].url).toBe(EP);
    expect(beacons[0].body).toMatchObject({
      type: 'css_load_failure',
      asset: 'profile-base-abc.css',
      url: 'https://app.example/#/user-space?tab=posts',
      ua: 'probe-agent',
    });
    expect(typeof beacons[0].body.ts).toBe('number');
  });

  it('没配端点：不发 beacon、返回 false、也不抛（本地/预览属正常）', async () => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', '');
    const { reportEvent } = await loadMonitoring();

    expect(() => reportEvent('css_load_failure', { asset: 'a.css' })).not.toThrow();
    expect(reportEvent('css_load_failure', { asset: 'a.css' })).toBe(false);
    expect(beacons).toHaveLength(0);
  });

  it('没有 type 时直接跳过（不允许空事件污染统计）', async () => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', EP);
    const { reportEvent } = await loadMonitoring();
    expect(reportEvent('', { asset: 'a.css' })).toBe(false);
    expect(beacons).toHaveLength(0);
  });

  it('sendBeacon 抛错时不冒泡（上报永不能反过来影响页面）', async () => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', EP);
    globalThis.navigator.sendBeacon = () => {
      throw new Error('beacon exploded');
    };
    const { reportEvent } = await loadMonitoring();
    expect(() => reportEvent('css_load_failure', { asset: 'a.css' })).not.toThrow();
  });
});

describe('CSS 失败信号', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_MONITORING_ENDPOINT', EP);
  });

  it('从 Vite 的真实消息里解析出资源名（不带域名/查询串）', async () => {
    const { extractCssAssetName } = await loadRecovery();
    expect(
      extractCssAssetName(
        new Error(
          'Unable to preload CSS for https://cdn.example.com/static/css/profile-base-BZMeLna9.css',
        ),
      ),
    ).toBe('profile-base-BZMeLna9.css');
    expect(
      extractCssAssetName(new Error('Unable to preload CSS for /static/css/dark-mode-abc.css?v=2')),
    ).toBe('dark-mode-abc.css');
    expect(
      extractCssAssetName(new Error('Failed to fetch dynamically imported module: /a.js')),
    ).toBe('');
  });

  it('同一资源一次会话只报一次（持续故障不刷屏）', async () => {
    const { reportCssPreloadFailure, resetCssPreloadFailureReports } = await loadRecovery();
    resetCssPreloadFailureReports();

    const err = new Error('Unable to preload CSS for /static/css/profile-base-abc.css');
    expect(reportCssPreloadFailure(err, true)).toBe(true);
    expect(reportCssPreloadFailure(err, false)).toBe(false);
    expect(beacons).toHaveLength(1);
    expect(beacons[0].body).toMatchObject({
      type: 'css_load_failure',
      asset: 'profile-base-abc.css',
      recoveryTriggered: true,
    });

    // 另一个资源照常报（去重是按资源名，不是全局只报一次）
    expect(
      reportCssPreloadFailure(
        new Error('Unable to preload CSS for /static/css/dark-mode-x.css'),
        false,
      ),
    ).toBe(true);
    expect(beacons).toHaveLength(2);
  });

  it('解析不出资源名时不上报（宁可少报，也不要一堆无主数据）', async () => {
    const { reportCssPreloadFailure, resetCssPreloadFailureReports } = await loadRecovery();
    resetCssPreloadFailureReports();
    expect(reportCssPreloadFailure(new Error('boom'), false)).toBe(false);
    expect(beacons).toHaveLength(0);
  });
});

describe('「退避用尽」信号在两个自愈宿主上都接好了', () => {
  const loaders = squeezeSource(read('src/views/user-center/UserSpace/async-loaders.js'));
  const theme = squeezeSource(read('src/utils/theme-css-loader.js'));

  it('「我的」页与暗色主题各有独立 scope，便于服务端分档统计', () => {
    expect(loaders).toContain(
      squeezeSource("reportEvent('style_repair_giveup', { scope: 'profile' })"),
    );
    expect(theme).toContain(
      squeezeSource("reportEvent('style_repair_giveup', { scope: 'dark-theme' })"),
    );
  });

  it('上报入口来自单源 monitoring，不再各写一份 sendBeacon', () => {
    expect(loaders).toContain("from '@/utils/monitoring.js'");
    expect(theme).toContain("from './monitoring.js'");
    expect(loaders).not.toContain('sendBeacon');
    expect(theme).not.toContain('sendBeacon');
  });
});
