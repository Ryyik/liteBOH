import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GATE_CONFIG_FALLBACK,
  isGateConfigActive,
  normalizeGateConfig,
  resolveGateCtaTarget,
} from '../../src/utils/api/gate-config-api.js';
import { buildHalloweenSceneSvg } from '../../src/views/Home/components/halloween-scene.js';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
/** 只取 script 区再剥注释：注释里会合法地复述被禁的写法，直接断言会假绿 */
const codeOf = (rel) => flattenSource(stripComments(scriptSection(read(rel))));

// ---------------------------------------------------------------------------
// 开屏配置（home_gate_config）
//
// 这里锁的是三件「错了就静默出问题」的事：
//   ① 归一化的兜底值 —— 脏数据不能让首屏崩；
//   ② 生效判定 —— 活动结束了还在播，或刚开始就没播；
//   ③ CTA 目标解析 —— 用户配置的路径直接进 router，必须只放行站内绝对路径。
// ---------------------------------------------------------------------------

describe('normalizeGateConfig', () => {
  it('空行回落安全默认值', () => {
    const config = normalizeGateConfig({});
    expect(config.enabled).toBe(false);
    expect(config.theme).toBe('halloween');
    expect(config.cta_target_type).toBe('none');
    expect(config.title).toBe('');
    expect(config.starts_at).toBe(null);
  });

  it('未知主题 / 未知 CTA 类型一律收口到安全值', () => {
    const config = normalizeGateConfig({ theme: 'christmas', cta_target_type: 'modal:foo' });
    expect(config.theme).toBe('halloween');
    expect(config.cta_target_type).toBe('none');
  });

  it('文案两端空白被 trim，纯空白视为空', () => {
    const config = normalizeGateConfig({ title: '  万圣节，来方块街有惊喜  ', subtitle: '   ' });
    expect(config.title).toBe('万圣节，来方块街有惊喜');
    expect(config.subtitle).toBe('');
  });

  it('非法时间被丢掉，合法时间归一为 ISO', () => {
    expect(normalizeGateConfig({ starts_at: 'not-a-date' }).starts_at).toBe(null);
    expect(normalizeGateConfig({ starts_at: '2026-10-31T00:00:00+08:00' }).starts_at).toBe(
      '2026-10-30T16:00:00.000Z',
    );
  });
});

describe('isGateConfigActive', () => {
  const base = normalizeGateConfig({
    enabled: true,
    theme: 'halloween',
    title: '万圣节，来方块街有惊喜',
  });
  const at = (iso) => new Date(iso).getTime();

  it('总开关关掉就不播', () => {
    expect(isGateConfigActive({ ...base, enabled: false })).toBe(false);
  });

  it('主题为 default 时不播（等价于停用）', () => {
    expect(isGateConfigActive({ ...base, theme: 'default' })).toBe(false);
  });

  it('时间窗两端都是开区间：开始那一刻算、结束那一刻不算', () => {
    const config = {
      ...base,
      starts_at: '2026-10-31T00:00:00.000Z',
      ends_at: '2026-11-02T00:00:00.000Z',
    };
    expect(isGateConfigActive(config, at('2026-10-30T23:59:59.000Z'))).toBe(false);
    expect(isGateConfigActive(config, at('2026-10-31T00:00:00.000Z'))).toBe(true);
    expect(isGateConfigActive(config, at('2026-11-01T12:00:00.000Z'))).toBe(true);
    expect(isGateConfigActive(config, at('2026-11-02T00:00:00.000Z'))).toBe(false);
  });

  it('时间留空 = 不限', () => {
    expect(isGateConfigActive({ ...base, starts_at: null, ends_at: null })).toBe(true);
  });
});

describe('resolveGateCtaTarget', () => {
  const withCta = (patch) =>
    normalizeGateConfig({ cta_text: '看看有什么惊喜', cta_target_type: 'lottery', ...patch });

  it('没有按钮文字就不渲染按钮', () => {
    expect(resolveGateCtaTarget(withCta({ cta_text: '' }))).toBe(null);
  });

  it('绑定抽奖：带 id 时带上参数，没选抽奖时落到列表页', () => {
    const id = '6f1c2f7e-3d4a-4a2b-9c1d-2e3f4a5b6c7d';
    expect(resolveGateCtaTarget(withCta({ cta_lottery_id: id }))).toEqual({
      to: `/lotteries?lottery=${id}`,
    });
    expect(resolveGateCtaTarget(withCta({ cta_lottery_id: null }))).toEqual({ to: '/lotteries' });
  });

  it('站内路径：只放行单个 / 开头的绝对路径', () => {
    const route = (path) =>
      resolveGateCtaTarget(withCta({ cta_target_type: 'route', cta_route: path }));
    expect(route('/newsroom?tab=activities')).toEqual({ to: '/newsroom?tab=activities' });
    expect(route('newsroom')).toBe(null);
    expect(route('//evil.example.com')).toBe(null);
    expect(route('https://evil.example.com')).toBe(null);
    expect(route('javascript:alert(1)')).toBe(null);
  });

  it('不绑定任何目标时返回 null', () => {
    expect(resolveGateCtaTarget(withCta({ cta_target_type: 'none' }))).toBe(null);
  });
});

describe('GATE_CONFIG_FALLBACK（首帧兜底快照）', () => {
  /* 兜底存在的唯一理由：无缓存用户的首帧必须直接是活动版，否则会先播默认开屏、
     网络回来再切 —— 而这段窗口里用户往往已经上滑进站，CTA（广告）就白做了。
     所以这组断言锁的是「兜底本身能不能用」，不是某句文案写得好不好。 */

  it('必须是「可播的活动版」，否则等于没兜底', () => {
    expect(GATE_CONFIG_FALLBACK.enabled).toBe(true);
    expect(GATE_CONFIG_FALLBACK.theme).not.toBe('default');
    expect(GATE_CONFIG_FALLBACK.title).toBeTruthy();
  });

  it('CTA 必须能解析出站内落点（广告是这次兜底的全部意义）', () => {
    const target = resolveGateCtaTarget(GATE_CONFIG_FALLBACK);
    expect(target).toBeTruthy();
    expect(target.to.startsWith('/')).toBe(true);
  });

  it('带完整时间窗：活动结束自动失效，不需要回来改代码', () => {
    const start = Date.parse(GATE_CONFIG_FALLBACK.starts_at);
    const end = Date.parse(GATE_CONFIG_FALLBACK.ends_at);
    expect(Number.isFinite(start)).toBe(true);
    expect(Number.isFinite(end)).toBe(true);
    expect(end).toBeGreaterThan(start);
    expect(isGateConfigActive(GATE_CONFIG_FALLBACK, start + 1000)).toBe(true);
    expect(isGateConfigActive(GATE_CONFIG_FALLBACK, end)).toBe(false);
  });
});

describe('首页开屏的接线（源码守卫）', () => {
  it('开屏配置请求必须与英雄区并行，不许排在 await fetchPublished 之后', () => {
    /* 真事故（2026-10-31）：曾经写成 await fetchPublished() 之后才 fetchGateConfig()，
       而 fetchPublished 内部有 6s 竞速兜底 —— 弱网下开屏配置要排队 6 秒才发出，
       整段首屏都在播错误的开屏。两者没有任何依赖，这条断言锁的就是「不许再串回去」。 */
    const code = codeOf('src/views/Home/index.vue');
    const gateAt = code.indexOf('fetchGateConfig(');
    const heroesAt = code.indexOf('fetchPublished(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(heroesAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(heroesAt);
  });

  it('首帧配置三级回落：缓存 → 活动快照 → 默认开屏', () => {
    const code = codeOf('src/views/Home/index.vue');
    expect(code).toContain(flattenSource('readGateConfigCache() || GATE_CONFIG_FALLBACK'));
  });
});

describe('buildHalloweenSceneSvg', () => {
  it('产出可用的 svg，且不含脚本 / 事件属性', () => {
    const svg = buildHalloweenSceneSvg({ width: 126 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 126 212"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain('<script');
    expect(svg).not.toMatch(/\son[a-z]+=/i);
  });

  it('确定性：同样入参两次生成完全一致（截图与回归对比依赖这点）', () => {
    expect(buildHalloweenSceneSvg({ width: 126 })).toBe(buildHalloweenSceneSvg({ width: 126 }));
  });

  it('宽度随容器比例变化，并被夹在上下限内', () => {
    /* 下限 90 而不是 126：390×844 的窄屏按比例算出来是 98 格，
       卡到 126 会被 preserveAspectRatio="none" 横向拉伸（南瓜变扁）。 */
    expect(buildHalloweenSceneSvg({ width: 40 })).toContain('viewBox="0 0 90 212"');
    expect(buildHalloweenSceneSvg({ width: 9999 })).toContain('viewBox="0 0 460 212"');
    expect(buildHalloweenSceneSvg({ width: 212 })).toContain('viewBox="0 0 212 212"');
  });

  it('动画类名统一 gs- 前缀（这段是 v-html 注入的，不能污染全站样式）', () => {
    const svg = buildHalloweenSceneSvg({ width: 126 });
    const classes = [...svg.matchAll(/class="([^"]+)"/g)].map((match) => match[1]);
    expect(classes.length).toBeGreaterThan(0);
    classes.forEach((value) => {
      value.split(/\s+/).forEach((name) => expect(name.startsWith('gs-')).toBe(true));
    });
  });
});
