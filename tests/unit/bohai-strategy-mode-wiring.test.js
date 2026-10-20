import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// plans/030 接线守卫：策略分隔线 + 游客锁定态 + 默认模式
//
// 为什么用源码守卫而不是探针：
//   `probe-bohai-composer.mjs` 在本机**无改动基线就已经红**（实测 2026-10-20：
//   stash 掉本次全部改动后，A2b 仍卡在 `waiting for locator('.boh-mm-row')`，
//   连第一步的 `.boh-mode-pill` 都取不到）⇒ 这个环境跑不出可信的探针结论。
//   按 AGENTS.md「判红之前先跑一遍无改动基线」的口径，探针在本机不构成判据。
//   所以接线按仓库既有惯例（见 AGENTS.md 里 cloud-album-order 那一条：
//   「探针不进 CI，接线必须由单测锁」）在这里锁死。
//
// ⚠️ 本文件锁的是**接线存在**，不是视觉效果。视觉仍须人眼/探针确认。
// ─────────────────────────────────────────────────────────────────────────────

const read = (rel) =>
  squeezeSource(readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8'));

const SHELL = 'src/views/BOHAI/composables/useBohShell.js';
const COMPOSER = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';
const CSS = 'src/views/BOHAI/BOHAI/components/styles/boh-composer.css';
const CONFIG = 'src/views/BOHAI/composables/chat-engine-config.js';

describe('plans/030 策略行与锁定态', () => {
  it('策略 id 集合只在壳里定义一份（视图层不重复维护）', () => {
    const shell = read(SHELL);
    // 三个策略 id 必须出现在壳的 STRATEGY_MODE_IDS 里
    expect(shell).toMatch(/STRATEGY_MODE_IDS\s*=\s*new Set\(\[[^\]]*'cost'/);
    expect(shell).toContain("'balance'");
    expect(shell).toContain("'intelligence'");

    // ⚠️ composer 不许再写一份 id 列表 —— 它只读 mode.strategy 标记
    const composer = read(COMPOSER);
    expect(composer).not.toContain("'intelligence'");
    expect(composer).toContain('Boolean(mode?.strategy)');
  });

  it('锁定判据：guest 档对游客放行，其余登录后可用', () => {
    const shell = read(SHELL);
    // 壳层是 locked 的唯一计算点：未登录 且 minTier !== 'guest' ⇒ locked
    expect(shell).toMatch(/locked:\s*!isLoggedIn\s*&&\s*String\(mode\.minTier/);
    expect(shell).toContain("=== 'guest'");

    // selectMode 必须拦截（放在 currentModeId 赋值之前，否则"先切过去再提示"）
    const selectIdx = shell.indexOf('const selectMode = (modeId) => {');
    const guardIdx = shell.indexOf('String(mode.minTier', selectIdx);
    const assignIdx = shell.indexOf('currentModeId.value = modeId;', selectIdx);
    expect(selectIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(selectIdx);
    expect(assignIdx).toBeGreaterThan(guardIdx);
  });

  it('游客点锁定项时必须真的弹得出来（走 showIsland.notify，不是 emit）', () => {
    const shell = read(SHELL);
    // emit('island-message') 会被 BOHAIIsland 的 onIslandMessage 静默丢弃
    // （它只消费 type==='thinking' / 'empty'）—— 这条是踩过的坑，锁住
    expect(shell).toContain('showIsland.notify(');
    // ⚠️ 不能直接对 squeezeSource 的结果断言 `not.toContain("emit('island-message'")`：
    //    squeezeSource 只压空白、**不删注释**，而 handleLockedMode 上方的注释里正好
    //    写着「不能用 emit('island-message')」这句说明 —— 断言会命中自己的注释（假红）。
    //    也正因如此，这里改读**原始源码**并按行过滤注释（squeeze 之后没有行可滤）。
    const raw = readFileSync(resolve(import.meta.dirname, '../..', SHELL), 'utf8');
    const fnStart = raw.indexOf('function handleLockedMode');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = raw.slice(fnStart, raw.indexOf('\n  }', fnStart));
    const codeOnly = fnBody
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(codeOnly).not.toContain("emit('island-message'");
    expect(codeOnly).toContain('showIsland.notify(');
  });

  it('分隔线只在策略区与模型区交界处渲染（单一列表，不分组）', () => {
    const composer = read(COMPOSER);
    // 判据是"当前行与上一行的 strategy 标记不同"，不是按索引硬切
    expect(composer).toContain('isStrategyRow(mode) !== isStrategyRow(modes[index - 1])');
    expect(composer).toContain('boh-mm-divider');
    // 锁定行用 .boh-mm-lock 取代倍率位
    expect(composer).toContain('boh-mm-lock');
  });

  it('分隔线颜色复用 --boh-border（不允许裸 rgba，会给暗色棘轮添债）', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../..', CSS), 'utf8');
    const block = css.slice(css.indexOf('.boh-mm-divider {'));
    const decl = block.slice(0, block.indexOf('}'));
    expect(decl).toContain('var(--boh-border)');
    expect(decl).not.toMatch(/rgba?\(/);
  });

  it('默认模式是 balance，游客回落是 fast，两者必须不同', () => {
    const config = read(CONFIG);
    expect(config).toContain("BOH_DEFAULT_MODE_ID = 'balance'");
    expect(config).toContain("BOH_GUEST_FALLBACK_MODE_ID = 'fast'");

    // 壳层的 watch 必须 immediate —— 否则游客首访会挂着 balance（无权使用）
    const shell = read(SHELL);
    const watchIdx = shell.indexOf('() => authStore.isLoggedIn');
    expect(watchIdx).toBeGreaterThan(-1);
    // prettier 会把多行参数压缩成 `{ immediate: true },`（带尾逗号）——
    // 所以用正则而不是 indexOf 精确串匹配，否则断言本身会因格式而假红。
    const watchBlock = shell.slice(watchIdx, watchIdx + 900);
    expect(watchBlock).toMatch(/immediate:\s*true/);
  });
});
