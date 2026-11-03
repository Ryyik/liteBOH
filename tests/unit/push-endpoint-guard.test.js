/**
 * B3 · 推送 endpoint 出站白名单
 *
 * 这是全站唯一「出站目标由用户决定」的入口，所以测试要钉三件事：
 *   1. 判别函数本身不能被骗（userinfo / 端口 / 大小写 / 后缀伪装）；
 *   2. TS 侧与 SQL 侧名单一致 —— 不一致会产生「能订阅但发不出去」的静默故障；
 *   3. 两个发送路径（outbox 投递、测试推送）都过了过滤，漏一处等于没做。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALLOWED_PUSH_HOSTS,
  ALLOWED_PUSH_HOST_SUFFIXES,
  isAllowedPushEndpoint,
} from '../../supabase/functions/_shared/push-endpoint.ts';

const root = resolve(__dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const migration = read('supabase/migrations/2026110315_push_endpoint_allowlist.sql');
const pushSend = read('supabase/functions/push-send/index.ts');

describe('isAllowedPushEndpoint —— 正向放行真实端点', () => {
  it.each([
    ['Safari', 'https://web.push.apple.com/QG3s7Y'],
    ['Firefox', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAA'],
    ['Edge WNS 分片', 'https://wns2-par02p.notify.windows.com/w/?token=BQ'],
    ['Chrome', 'https://fcm.googleapis.com/fcm/send/dQw4'],
  ])('%s 端点放行', (_name, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });
});

describe('isAllowedPushEndpoint —— 反向必须拒绝', () => {
  it.each([
    ['http 降级', 'http://web.push.apple.com/x'],
    ['内网 IP', 'https://127.0.0.1/x'],
    ['内网 host', 'https://10.0.0.1/x'],
    ['云厂商 metadata', 'https://169.254.169.254/latest/meta-data/'],
    ['userinfo 伪装', 'https://web.push.apple.com@evil.com/x'],
    ['非 443 端口', 'https://web.push.apple.com:8443/x'],
    ['查询串里带白名单域名', 'https://evil.com/?x=web.push.apple.com'],
    ['后缀拼接伪装', 'https://evilpush.apple.com/x'],
    ['非字符串', 12345],
    ['空串', ''],
    ['null', null],
    ['undefined', undefined],
    ['超长', `https://web.push.apple.com/${'a'.repeat(2100)}`],
  ])('%s 拒绝', (_name, endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it('末尾多一个点的 FQDN 也不放行（`push.apple.com.` 在 URL 解析后仍带点）', () => {
    // 宁可误拒也不放宽：DNS 末尾点等价于同名，但白名单按字符串比，
    // 放行它等于给「用等价写法绕过」留了口子。
    expect(isAllowedPushEndpoint('https://web.push.apple.com./x')).toBe(false);
  });
});

describe('TS 名单与 SQL 名单必须一致', () => {
  it('精确名单逐项出现在迁移函数里', () => {
    for (const host of ALLOWED_PUSH_HOSTS) {
      expect(migration).toContain(`'${host}'`);
    }
  });

  it('后缀名单逐项出现在迁移函数里', () => {
    for (const suffix of ALLOWED_PUSH_HOST_SUFFIXES) {
      expect(migration).toContain(`'%${suffix}'`);
    }
  });

  it('迁移里的精确名单数量与 TS 一致（防止只加了一边）', () => {
    const inSql = migration.match(/'[a-z0-9.-]+\.(com|apple\.com)'/g) || [];
    const exactBlock = inSql.filter((s) => !s.includes('%'));
    expect(exactBlock.length).toBeGreaterThanOrEqual(ALLOWED_PUSH_HOSTS.length);
  });
});

describe('push-send 的两条发送路径都过白名单', () => {
  it('outbox 正式投递与测试推送各过滤一次（两处都在 targets 赋值处）', () => {
    // 按调用点计数比按函数名切片稳：函数名会被重构，调用形态不会
    const occurrences = (pushSend.match(/isAllowedPushEndpoint\(sub\.endpoint\)/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('测试推送（action=test）同样过滤', () => {
    const testIdx = pushSend.indexOf("action === 'test'");
    expect(testIdx).toBeGreaterThan(-1);
    const body = pushSend.slice(testIdx);
    expect(body).toContain('isAllowedPushEndpoint(sub.endpoint)');
  });

  it('过滤在「无订阅」分支之前（否则脏订阅会让 skipped/failed 判断失真）', () => {
    const filterIdx = pushSend.indexOf('isAllowedPushEndpoint(sub.endpoint)');
    const emptyIdx = pushSend.indexOf('没有有效订阅');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeGreaterThan(filterIdx);
  });
});
