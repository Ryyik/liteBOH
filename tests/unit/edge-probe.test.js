/**
 * 边缘落点采样的守约（2026-11-23）
 *
 * 背景：两个真实样本（`colo=LAX` / `colo=LHR`）证明大陆用户被 Cloudflare
 * 丢到哪个 POP 完全取决于运营商 BGP 选路。要量化这个分布，采样器必须做到
 * 「能采到、不重复采、采不到别报错、别拖慢首屏」——本文件锁的就是这四条。
 *
 * 全部用真行为断言（喂真实 `/cdn-cgi/trace` 文本、假 storage、假 fetch），
 * 不锁源码字面量：
 *   1. 真实 trace 文本能解析出 LAX / LHR，且 IPv6 与缺字段不会炸；
 *   2. 非 Cloudflare 环境（返回 HTML）判定为「无边缘」，不产生任何上报；
 *   3. 20h 间隔与时钟回拨的极性（回拨要能继续采，否则会永久停采）；
 *   4. 上报失败不写时间戳（下次会话重试），服务端判重则写（不再重复请求）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  getOrCreateClientKey,
  parseTrace,
  readNavTiming,
  runEdgeProbe,
  shouldProbe,
} from '../../src/utils/edge-probe.js';

/** 2026-11-23 真实抓到的两条 trace（只保留参与解析的字段） */
const TRACE_LAX = `fl=1407f28
h=www.blockofhome.cn
ip=183.246.94.124
ts=1795408070.000
visit_scheme=https
uag=curl/8.7.1
colo=LAX
sliver=none
http=http/2
loc=CN
tls=TLSv1.3
sni=plaintext
`;

const TRACE_LHR = `fl=736f253
h=www.blockofhome.cn
ip=36.142.63.90
ts=1795408178.000
visit_scheme=https
uag=Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)
colo=LHR
sliver=none
http=http/2
loc=CN
tls=TLSv1.3
sni=plaintext
warp=off
`;

const createStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
};

const okResponse = (text) => ({ ok: true, status: 200, text: async () => text });

describe('parseTrace', () => {
  it('解析真实样本：LAX 与 LHR 都能认出来', () => {
    expect(parseTrace(TRACE_LAX)).toMatchObject({ colo: 'LAX', loc: 'CN', http: 'http/2' });
    expect(parseTrace(TRACE_LHR)).toMatchObject({ colo: 'LHR', loc: 'CN', ip: '36.142.63.90' });
  });

  it('IPv6 客户端不炸，且 colo 仍然可读', () => {
    const text = 'ip=2001:db8::1\ncolo=HKG\nloc=CN\nhttp=http/3\ntls=TLSv1.3\n';
    expect(parseTrace(text)).toMatchObject({ colo: 'HKG', ip: '2001:db8::1', http: 'http/3' });
  });

  it('非 Cloudflare 环境拿到的是 HTML ⇒ 返回 null（本地/预览的天然护栏）', () => {
    expect(parseTrace('<!DOCTYPE html><html><head><title>方块之家</title></head></html>')).toBe(
      null,
    );
    expect(parseTrace('')).toBe(null);
    expect(parseTrace(undefined)).toBe(null);
  });

  it('colo 缺失或格式不对一律拒绝；小写会被规范化', () => {
    expect(parseTrace('loc=CN\nhttp=http/2\n')).toBe(null);
    expect(parseTrace('colo=LA\n')).toBe(null);
    expect(parseTrace('colo=lhr\n')).toMatchObject({ colo: 'LHR' });
  });

  it('loc 脏值降级为 null，不阻止整条样本', () => {
    expect(parseTrace('colo=NRT\nloc=CHINA\n')).toMatchObject({ colo: 'NRT', loc: null });
  });
});

describe('shouldProbe', () => {
  const now = 1_795_408_070_000;
  const HOUR = 60 * 60 * 1000;

  it('没有历史记录 ⇒ 采', () => {
    expect(shouldProbe({ lastProbeAt: undefined, now })).toBe(true);
    expect(shouldProbe({ lastProbeAt: null, now })).toBe(true);
  });

  it('刚采过 ⇒ 不采；超过 20h ⇒ 采', () => {
    expect(shouldProbe({ lastProbeAt: now - HOUR, now })).toBe(false);
    expect(shouldProbe({ lastProbeAt: now - 19 * HOUR, now })).toBe(false);
    expect(shouldProbe({ lastProbeAt: now - 20 * HOUR, now })).toBe(true);
  });

  it('时钟回拨当作「该采」——否则一次误设时间会让这台设备永久停采', () => {
    expect(shouldProbe({ lastProbeAt: now + 48 * HOUR, now })).toBe(true);
  });

  it('now 不合法 ⇒ 不采（宁可少一条，也不要在坏时钟下反复发请求）', () => {
    expect(shouldProbe({ lastProbeAt: undefined, now: NaN })).toBe(false);
  });
});

describe('readNavTiming', () => {
  const perf = (entry) => ({ getEntriesByType: () => (entry ? [entry] : []) });

  it('取 responseStart 与 duration，并四舍五入到整数毫秒', () => {
    expect(readNavTiming(perf({ responseStart: 721.6, duration: 3990.2 }))).toEqual({
      ttfbMs: 722,
      loadMs: 3990,
    });
  });

  it('越界/缺失降级为 null，不把脏数值写进库', () => {
    expect(readNavTiming(perf({ responseStart: -1, duration: 9e9 }))).toEqual({
      ttfbMs: null,
      loadMs: null,
    });
    expect(readNavTiming(perf(null))).toEqual({ ttfbMs: null, loadMs: null });
    expect(readNavTiming(undefined)).toEqual({ ttfbMs: null, loadMs: null });
  });

  it('performance 实现抛错时不影响采样', () => {
    const broken = {
      getEntriesByType: () => {
        throw new Error('blocked');
      },
    };
    expect(readNavTiming(broken)).toEqual({ ttfbMs: null, loadMs: null });
  });
});

describe('runEdgeProbe', () => {
  const now = 1_795_408_070_000;

  it('正常路径：上报 payload 字段齐全，且写入时间戳', async () => {
    const storage = createStorage();
    const submit = vi.fn().mockResolvedValue(true);
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(TRACE_LHR));

    const result = await runEdgeProbe({
      now,
      storage,
      fetchImpl,
      performanceImpl: { getEntriesByType: () => [{ responseStart: 1800, duration: 9000 }] },
      submit,
    });

    expect(result.status).toBe('sent');
    expect(result.colo).toBe('LHR');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('/cdn-cgi/trace');
    expect(submit).toHaveBeenCalledTimes(1);

    const payload = submit.mock.calls[0][0];
    expect(payload).toMatchObject({
      p_colo: 'LHR',
      p_loc: 'CN',
      p_ip: '36.142.63.90',
      p_http_version: 'http/2',
      p_tls_version: 'TLSv1.3',
      p_ttfb_ms: 1800,
      p_load_ms: 9000,
    });
    expect(payload.p_client_key).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(JSON.parse(storage.getItem('boh_edge_probe_v1')).at).toBe(now);
  });

  it('20h 内重复调用：一个请求都不发（省的是跨境往返，不只是流量）', async () => {
    const storage = createStorage({
      boh_edge_probe_v1: JSON.stringify({ at: now - 5 * 3600 * 1000 }),
    });
    const submit = vi.fn();
    const fetchImpl = vi.fn();

    const result = await runEdgeProbe({ now, storage, fetchImpl, submit });

    expect(result).toEqual({ status: 'skipped', reason: 'interval' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('非 Cloudflare 环境（拿到 HTML）：判定无边缘，绝不误报一个假 colo', async () => {
    const storage = createStorage();
    const submit = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('<!DOCTYPE html><html></html>'));

    const result = await runEdgeProbe({ now, storage, fetchImpl, submit });

    expect(result.status).toBe('no-edge');
    expect(submit).not.toHaveBeenCalled();
    expect(storage.getItem('boh_edge_probe_v1')).toBe(null);
  });

  it('HTTP 非 2xx（被拦截/504）：不解析、不上报', async () => {
    const submit = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 504, text: async () => '' });

    const result = await runEdgeProbe({ now, storage: createStorage(), fetchImpl, submit });

    expect(result.status).toBe('no-edge');
    expect(submit).not.toHaveBeenCalled();
  });

  it('网络失败：返回 failed 且**不**写时间戳，下次会话可重试', async () => {
    const storage = createStorage();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await runEdgeProbe({ now, storage, fetchImpl, submit: vi.fn() });

    expect(result.status).toBe('failed');
    expect(storage.getItem('boh_edge_probe_v1')).toBe(null);
  });

  it('RPC 失败：同样不写时间戳；失败不外抛', async () => {
    const storage = createStorage();
    const submit = vi.fn().mockRejectedValue(new Error('rpc down'));

    const result = await runEdgeProbe({
      now,
      storage,
      fetchImpl: vi.fn().mockResolvedValue(okResponse(TRACE_LAX)),
      submit,
    });

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('submit');
    expect(storage.getItem('boh_edge_probe_v1')).toBe(null);
  });

  it('服务端判定今天已有记录（返回 false）⇒ duplicate，但仍记时间戳避免反复重试', async () => {
    const storage = createStorage();

    const result = await runEdgeProbe({
      now,
      storage,
      fetchImpl: vi.fn().mockResolvedValue(okResponse(TRACE_LAX)),
      submit: vi.fn().mockResolvedValue(false),
    });

    expect(result.status).toBe('duplicate');
    expect(storage.getItem('boh_edge_probe_v1')).not.toBe(null);
  });

  it('缺依赖（没有 fetch / submit）时直接放弃，不抛错', async () => {
    await expect(runEdgeProbe({ now, submit: undefined })).resolves.toMatchObject({
      status: 'failed',
    });
  });
});

describe('getOrCreateClientKey', () => {
  it('首次生成并持久化，第二次复用同一个值', () => {
    const storage = createStorage();
    const first = getOrCreateClientKey(storage);
    const second = getOrCreateClientKey(storage);
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(storage.getItem('boh_edge_probe_cid')).toBe(first);
  });

  it('存量值非法（被手工改坏/旧格式）时重新生成，而不是把脏值写进库', () => {
    const storage = createStorage({ boh_edge_probe_cid: 'a b' });
    const key = getOrCreateClientKey(storage);
    expect(key).not.toBe('a b');
    expect(key).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('storage 不可用（隐私模式）也能返回可用 key', () => {
    const key = getOrCreateClientKey(null);
    expect(key).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});
