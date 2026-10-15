/**
 * bohai-glass-look-spec.test.js — 锁「折射玻璃官方样貌」单源（2026-10-14）
 *
 * 背景：观感参数曾分散在组件 props / CSS 令牌 / 壳逻辑 / 设置滑杆四处，两轮校准
 * 各改各的，酿成「白底上玻璃彻底隐形」且**跨会话复发**（本仓一次 + 并行会话一次，
 * 见 `src/config/liquid-glass-spec.js` 文件头的事故档案）。
 * 本文件锁三件事：
 *   1. spec 单源的官方校准值（防手滑改参）；
 *   2. 消费链全部引用 spec（玻璃组件 / 壳 / 偏好默认 / 滑杆边界 / 令牌兜底）；
 *   3. 白底三要素反证：玻璃模式**禁止**撤投影与边框（两次事故的直接死因）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIQUID_GLASS_SPEC } from '../../src/config/liquid-glass-spec.js';
import { scriptSection, stripComments } from '../helpers/source.js';

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');
const REFRACT = 'src/components/ui/BohGlassRefract.vue';
const COMPOSER_CSS = 'src/views/BOHAI/BOHAI/components/styles/boh-composer.css';
const SHELL = 'src/views/BOHAI/composables/useBohShell.js';
const PREFS = 'src/composables/useGlobalAiPreferences.js';
const PANEL = 'src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue';
/* §21.11：白膜令牌提为**站点级**（与 `--liquid-*` 平级）⇒ 兜底值断言改读全局 tokens */
const TOKENS = 'src/styles/common/tokens.css';
const LIQUID_CSS = 'src/styles/common/liquid-glass.css';
const GLASS_UI = 'src/styles/common/glass-ui.css';
const BLUR_COMPOSABLE = 'src/composables/useGlassBlur.js';

describe('官方样貌单源（liquid-glass-spec）', () => {
  it('spec 冻结值 = 官方校准（改样貌必须改这里并跑本文件）', () => {
    expect(LIQUID_GLASS_SPEC).toEqual({
      blurAmount: 0.4,
      displacementScale: 70,
      saturation: 140,
      aberrationIntensity: 2,
      elasticity: 0,
      tintAlphaDefault: 0.1,
      tintAlphaMin: 0.1,
      tintAlphaMax: 0.85,
      blurScaleDefault: 1,
      blurScaleMin: 0,
      blurScaleMax: 2,
    });
    expect(Object.isFrozen(LIQUID_GLASS_SPEC)).toBe(true);
  });

  it('玻璃组件的观感参数全部引用 spec（饱和/色差/弹性不许写死）', () => {
    const s = read(REFRACT);
    expect(s).toContain('@/config/liquid-glass-spec.js');
    expect(s).toContain('LIQUID_GLASS_SPEC.blurAmount');
    expect(s).toContain('LIQUID_GLASS_SPEC.displacementScale');
    expect(s).toContain('SPEC.saturation');
    expect(s).toContain('SPEC.aberrationIntensity');
    expect(s).toContain('SPEC.elasticity');
    // 事故 1 反证：裸 JS SFC 不许用 withDefaults（dev server 当场 500）。
    //    ⚠️ 断言前剥注释——组件头部留着警示注释，裸断言会假红。
    expect(stripComments(scriptSection(s))).not.toContain('withDefaults');
    // 事故 2 反证：观感数值不许在组件里写死第二份
    expect(s).not.toMatch(/:saturation="\d/);
    expect(s).not.toMatch(/:elasticity="\d/);
  });

  it('壳与偏好的钳制/默认值引用 spec（白膜 α 链）', () => {
    const shell = read(SHELL);
    expect(shell).toContain('@/config/liquid-glass-spec.js');
    expect(shell).toContain('LIQUID_GLASS_SPEC.tintAlphaMax');
    expect(shell).toContain('LIQUID_GLASS_SPEC.tintAlphaMin');
    expect(shell).toContain('LIQUID_GLASS_SPEC.tintAlphaDefault');
    // 事故 1 反证：手写边界数字不许回来
    expect(shell).not.toMatch(/Math\.min\(0\.85/);
    const prefs = read(PREFS);
    expect(prefs).toContain('LIQUID_GLASS_SPEC.tintAlphaDefault');
    expect(prefs).not.toContain('glassOpacity: 0.55');
  });

  it('令牌兜底值与 spec 一致（无 JS 时也不走样）', () => {
    const tokens = read(TOKENS);
    const m = tokens.match(/--refract-alpha-default:\s*([\d.]+)/);
    expect(m?.[1]).toBe(String(LIQUID_GLASS_SPEC.tintAlphaDefault));
  });

  it('白底三要素反证：折射级 @supports 块不许撤投影/边框（两次事故的直接死因）', () => {
    const css = read(COMPOSER_CSS);
    const at = css.indexOf('折射级（2026-10-14');
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('@supports not', at));
    expect(block).not.toContain('box-shadow: none');
    expect(block).not.toContain('border-color: transparent');
  });

  it('设置滑杆边界引用 spec（不许写死 30/85）', () => {
    const panel = read(PANEL);
    expect(panel).toContain('@/config/liquid-glass-spec.js');
    expect(panel).toContain('GLASS_SPEC.tintAlphaMin * 100');
    expect(panel).toContain('GLASS_SPEC.tintAlphaMax * 100');
    expect(panel).not.toContain('min="30"');
  });
});

describe('全站玻璃「模糊度」单源（blur scale，§21.12）', () => {
  it('spec 冻结值 = 默认/上下限（改档位只改这里）', () => {
    expect(LIQUID_GLASS_SPEC.blurScaleDefault).toBe(1);
    expect(LIQUID_GLASS_SPEC.blurScaleMin).toBe(0);
    expect(LIQUID_GLASS_SPEC.blurScaleMax).toBe(2);
  });

  it('CSS 侧：根变量默认值 == spec 默认值，且三档基准全部乘倍数', () => {
    const tokens = read(TOKENS);
    const m = tokens.match(/--glass-blur-scale:\s*([\d.]+)/);
    expect(m?.[1]).toBe(String(LIQUID_GLASS_SPEC.blurScaleDefault));
    for (const name of ['--liquid-blur', '--liquid-blur-sm', '--liquid-blur-lg']) {
      expect(tokens).toMatch(
        new RegExp(`${name}:\\s*calc\\(\\d+px \\* var\\(--glass-blur-scale\\)\\)`),
      );
    }
    // 反证锚：不许再有**裸 px 的基准** —— 漏一处就是「某页 / 某模式不跟用户那一档」
    expect(tokens).not.toMatch(/--liquid-blur(-sm|-lg)?:\s*\d+px/);
  });

  it('其它基准档（窄屏 / 低性能模式）也必须乘倍数', () => {
    for (const [file, label] of [
      [LIQUID_CSS, 'liquid-glass.css 移动档'],
      [GLASS_UI, 'glass-ui.css 断点档'],
      [TOKENS, 'tokens.css 低性能档'],
    ]) {
      const bare = read(file).match(/--liquid-blur(-sm|-lg)?:\s*\d+px/g) || [];
      expect(bare, `${label} 仍有裸 px 基准：${bare.join(', ')}`).toHaveLength(0);
    }
  });

  it('唯一写入者：只有 useGlassBlur 写根变量，钳制引用 spec（不写死上下限）', () => {
    const c = read(BLUR_COMPOSABLE);
    expect(c).toContain("'--glass-blur-scale'");
    expect(c).toContain('LIQUID_GLASS_SPEC.blurScaleMin');
    expect(c).toContain('LIQUID_GLASS_SPEC.blurScaleMax');
    expect(c).toContain('LIQUID_GLASS_SPEC.blurScaleDefault');
    expect(c).not.toMatch(/blurScale(Min|Max|Default)\s*[:=]\s*[\d.]/);
  });

  it('折射级消费**同一个**倍数（CSS 与 JS 读同一个数）', () => {
    const g = read(REFRACT);
    expect(g).toContain("from '@/composables/useGlassBlur.js'");
    expect(g).toContain('useGlassBlur()');
    expect(g).toContain('effectiveBlurAmount');
  });
});
