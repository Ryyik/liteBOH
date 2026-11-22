import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_STATES,
  DEFAULT_STATE,
  STAGE_STATE,
} from '../../src/views/BOHAI/BOHAI/components/activity-avatar-engine.js';
import { resolveBohActivityStage } from '../../src/views/BOHAI/BOHAI/components/boh-activity.js';
// 源码守卫断言必须格式宽容：prettier 会把长行拆行、给末项补尾逗号，
// 逐字断言会因此假红（详见 helpers/source.js）。
import { squeezeSource } from '../helpers/source.js';

const streamPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohChatStream.vue',
);
const streamCssPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/styles/boh-stream.css',
);
const avatarPath = resolve(
  import.meta.dirname,
  '../../src/views/BOHAI/BOHAI/components/BohActivityAvatar.vue',
);
const tokensCssPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/tokens.css');
const layoutCssPath = resolve(import.meta.dirname, '../../src/views/BOHAI/BOHAI/styles/layout.css');

/**
 * bohai-activity-avatar.test.js — 活动行「角色状态机」改版（2026-11-21 用户口径）守卫
 *
 * 口径：等待动画 = BohActivityAvatar（Grok 式角色状态机，MC 方块皮肤纯黑白，
 * 六状态连续 morph），文字回归普通文本（呼吸/流光/图标全退役）。
 * 探针 probe-bohai-search-status.mjs 锁运行时行为（A4 / A4b / A7）；这里锁：
 *   ① 「阶段 → 状态」映射不变量（STAGE_STATE 覆盖 boh-activity 阶段机的全部非空产出）；
 *   ② 角色状态配置的形状不变量；
 *   ③ 源码级接线（组件挂载 / 文字纯文本 / 旧痕迹清零 / reduce 与 keepAlive 纪律）。
 */
describe('活动行角色状态机改版（2026-11-21）', () => {
  it('⭐ 阶段映射不变量：STAGE_STATE 覆盖阶段机的全部非空产出，且不产出空状态', () => {
    /* 阶段机的全部非空取值（boh-activity.js 顶部注释即契约） */
    const STAGES = ['web-searching', 'web-results', 'community', 'thinking', 'answering'];
    for (const stage of STAGES) {
      expect(STAGE_STATE[stage], `阶段 ${stage} 必须有映射`).toBeTruthy();
      expect(AVATAR_STATES[STAGE_STATE[stage]], `映射目标必须是合法角色状态`).toBeTruthy();
    }
    expect(Object.keys(STAGE_STATE)).toHaveLength(STAGES.length);
    /* 语义锁：思考对号入座；其余「工具在跑」的阶段一律 working */
    expect(STAGE_STATE.thinking).toBe('thinking');
    for (const stage of ['web-searching', 'web-results', 'community', 'answering']) {
      expect(STAGE_STATE[stage]).toBe('working');
    }
    /* 双真源交叉验证：用阶段机本身跑一遍代表性输入，产出必须都有映射 */
    const produced = new Set(
      [
        { isThinking: true, isLoading: true, webSearchActive: true },
        { isThinking: true, isLoading: true, webSearchActive: true, webSearchResultCount: 1 },
        { isThinking: true, isLoading: true, communitySearchActive: true },
        { isThinking: true, isLoading: true },
        { isLoading: true },
      ].map((s) => resolveBohActivityStage(s)),
    );
    for (const stage of produced) {
      if (!stage) continue;
      expect(STAGE_STATE[stage], `阶段机产出 ${stage} 无映射`).toBeTruthy();
    }
  });

  it('角色状态配置：六状态、动作文案非空、参数在合法区间', () => {
    expect(Object.keys(AVATAR_STATES)).toEqual([
      'idle',
      'thinking',
      'working',
      'waiting',
      'blocked',
      'done',
      /* sleeping：小方挂件专用待机态（不进 STAGE_STATE 映射） */
      'sleeping',
    ]);
    const GAZES = ['drift', 'think', 'scan', 'up', 'down', 'center'];
    for (const [name, s] of Object.entries(AVATAR_STATES)) {
      expect(s.action.length, `${name}.action`).toBeGreaterThan(0);
      expect(s.eyeH, `${name}.eyeH`).toBeGreaterThan(0);
      expect(s.eyeH, `${name}.eyeH`).toBeLessThanOrEqual(1.5);
      expect(s.eyeW, `${name}.eyeW`).toBeGreaterThanOrEqual(1);
      expect(s.eyeW, `${name}.eyeW`).toBeLessThanOrEqual(1.5);
      expect(s.energy, `${name}.energy`).toBeGreaterThan(0);
      expect(GAZES, `${name}.gaze`).toContain(s.gaze);
      expect(['flat', 'frown', 'smile'], `${name}.mouthCurve`).toContain(s.mouthCurve);
      expect(Math.abs(s.yaw), `${name}.yaw`).toBeLessThanOrEqual(1);
    }
    /* done 是唯一的笑眼状态；idle 是兜底态 */
    expect(AVATAR_STATES.done.happy).toBe(1);
    expect(DEFAULT_STATE).toBe('idle');
  });

  it('接线守卫：活动行挂角色组件 + 阶段直喂；文字回普通文本，旧痕迹清零', () => {
    const stream = squeezeSource(readFileSync(streamPath, 'utf8'));
    expect(stream).toContain('<BohActivityAvatar');
    expect(stream).toContain(':stage="activityStage"');
    // 2026-11-22 用户报障修复：活动行必须逐消息判宿主（idx === activityHostIdx）。
    // 旧实现 isActivityHost 是流级布尔，v-for 里每条 AI 消息都满足 ——
    // 已完成的对话跟着新请求一起动（探针全是单轮对话所以没测出来）。
    expect(stream).toContain('idx === activityHostIdx');
    expect(stream).toContain('const activityHostIdx = computed');
    // 文字回归普通文本：不再有呼吸 spans / 门控 / 逐字拆分
    expect(stream).not.toContain('is-breathing');
    expect(stream).not.toContain('boh-breath-ch');
    expect(stream).not.toContain('activityBreathing');
    expect(stream).not.toContain('activityShimmer');
    expect(stream).not.toContain('activityIcon');
    expect(stream).not.toContain('BohActivityOrbit');
  });

  it('样式守卫：.boh-avatar 在场；呼吸/流光痕迹清零', () => {
    const css = squeezeSource(readFileSync(streamCssPath, 'utf8'));
    expect(css).toContain('.boh-avatar');
    expect(css).not.toContain('boh-breath-ch');
    expect(css).not.toContain('boh-search-shimmer');
    expect(css).not.toContain('is-shimmer');
    expect(css).not.toContain('boh-search-ico');
    // 一次性进场动画保留（换阶段文案的那一下淡入）
    expect(css).toContain('@keyframes boh-activity-swap-in');
  });

  it('壳层纪律：reduce v-if 退场 + keepAlive 停 rAF + 主题自愈 observer', () => {
    const comp = squeezeSource(readFileSync(avatarPath, 'utf8'));
    expect(comp).toContain('v-if="!reduced"');
    expect(comp).toContain('data-avatar-state');
    expect(comp).toContain('matchMedia');
    expect(comp).toContain('onDeactivated');
    expect(comp).toContain('STAGE_STATE');
    expect(comp).not.toContain('getPalette'); // 灰阶令牌引擎自读，不走调色板注入
  });

  it('颜色恒定守卫：黑身白五官不随主题反转（2026-11-22 口径），引擎不读 CSS 变量', () => {
    const engineSrc = squeezeSource(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../src/views/BOHAI/BOHAI/components/activity-avatar-engine.js',
        ),
        'utf8',
      ),
    );
    expect(engineSrc).not.toContain('getComputedStyle');
    expect(engineSrc).toContain("'#1d1d1f'"); // 身体恒近黑
    expect(engineSrc).toContain("'#ffffff'"); // 表情恒白
    expect(engineSrc).not.toContain('--boh-beam'); // 零彩色口径
  });

  it('令牌守卫：呼吸令牌已从 tokens/layout 清退', () => {
    const tokens = squeezeSource(readFileSync(tokensCssPath, 'utf8'));
    expect(tokens).not.toContain('--boh-breath-dur');
    expect(tokens).not.toContain('--boh-breath-stagger');
    const layout = squeezeSource(readFileSync(layoutCssPath, 'utf8'));
    expect(layout).not.toContain('--boh-breath-dur');
  });
});
