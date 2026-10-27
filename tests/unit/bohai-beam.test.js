import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';

// ─────────────────────────────────────────────────────────────────────────────
// 边界光束（`BohBeam.vue`，2026-10-25）源码守卫
//
// 为什么用源码守卫：这层是**纯 CSS 接线**，node 环境不挂载组件，而它的失效方式全是静默的 ——
// 少一个 `is-active` 分支、`animation-play-state` 写反、`@property` 漏 `inherits: true`、
// 圆角没 `inherit`，症状都只是「光带不动了 / 不出现了」，不报错、不抛异常。
//
// 运行时自证另有一份（13 条，含「浮层没被光束层裁掉」与「角度真的在转」）——
// 那份是临时探针，口径与结论记在 `.workbuddy-ai/memory/2026-10-25.md`。
//
// ⚠️ 三条被这里锁死的硬约束（都是实测踩过的）：
//   1. **必须是绝对定位覆盖层，不能包 wrapper** —— 包住 `.boh-composer` 会把模型菜单 /
//      工具菜单 / 用量浮层（都从框体上沿弹出）整块裁掉；
//   2. **空闲要停表**（`animation-play-state: paused`），不能只靠 `opacity: 0` 藏起来；
//   3. **颜色只许来自 `--boh-beam-*`**，`boh-beam.css` 里出现裸色值就是单一真源被绕过。
// ─────────────────────────────────────────────────────────────────────────────

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const BOHAI = 'src/views/BOHAI/BOHAI';
const COMPOSER_VUE = `${BOHAI}/components/BohComposer.vue`;
const BEAM_VUE = `${BOHAI}/components/BohBeam.vue`;
const BEAM_CSS = `${BOHAI}/components/styles/boh-beam.css`;
const TOKENS = `${BOHAI}/styles/tokens.css`;

describe('接线：输入框生成在途时挂光束', () => {
  const vue = read(COMPOSER_VUE);

  it('`BohBeam` 的 `active` 绑在壳的 `isLoading` 上（不是本地自推状态）', () => {
    expect(vue).toContain('<BohBeam :active="isLoading" />');
    expect(vue).toContain("import BohBeam from './BohBeam.vue';");
  });

  it('光束是 `.boh-composer` 的**第一个子元素**（不包 wrapper ⇒ 浮层不被裁）', () => {
    const composerOpen = vue.indexOf('<div ref="composerEl" class="boh-composer">');
    const beam = vue.indexOf('<BohBeam :active="isLoading" />');
    // `.boh-ctx` 是原首子元素（条件渲染）；光束必须排在它前面，才能保证「盒子就是输入框本身」
    const firstCtx = vue.indexOf('<div v-if="attachedContext" class="boh-ctx">');
    expect(composerOpen).toBeGreaterThan(-1);
    expect(beam).toBeGreaterThan(composerOpen);
    expect(firstCtx).toBeGreaterThan(beam);
  });

  it('BohBeam 用 `<style scoped src>` 接入（写成内联 style 会漏掉整份 CSS）', () => {
    expect(read(BEAM_VUE)).toContain('<style scoped src="./styles/boh-beam.css"></style>');
  });
});

describe('光束样式：层序、停表、旋转', () => {
  const css = squeezeSource(read(BEAM_CSS));

  it('是绝对定位覆盖层，靠 `inset: -1px` 盖住输入框的 1px 描边', () => {
    expect(css).toMatch(/\.boh-beam\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.boh-beam\s*\{[^}]*inset:\s*-1px/);
    expect(css).toMatch(/\.boh-beam\s*\{[^}]*border-radius:\s*inherit/);
  });

  it('层级夹在「输入框背景之上、浮层之下」（1 < 20）', () => {
    expect(css).toMatch(/\.boh-beam\s*\{[^}]*z-index:\s*1/);
  });

  it('⭐ 空闲时**停表**，`is-active` 才 running', () => {
    expect(css).toMatch(/\.boh-beam\s*\{[^}]*animation-play-state:\s*paused/);
    expect(css).toMatch(/\.boh-beam\.is-active\s*\{[^}]*animation-play-state:\s*running/);
    expect(css).toMatch(/\.boh-beam\.is-active\s*\{[^}]*opacity:\s*1/);
  });

  it('旋转时长走 `--boh-dur-bob` 令牌（不写死毫秒 ⇒ reduce 下自动静止）', () => {
    expect(css).toContain('animation: boh-beam-spin var(--boh-dur-bob) linear infinite');
    expect(css).not.toMatch(/animation:[^;]*\d+m?s/);
  });

  it('行进窗口是 `conic-gradient(from var(--boh-beam-angle), …)`（角度一变窗口就转）', () => {
    expect(css).toContain('from var(--boh-beam-angle)');
    expect(css).toContain('@keyframes boh-beam-spin');
  });

  it('零 `!important`（全仓棘轮）', () => {
    expect(css).not.toContain('!important');
  });
});

describe('令牌：彩虹调色板单源', () => {
  const tokens = squeezeSource(read(TOKENS));

  it('九个彩虹色在 `:root` 定义（`c1..c9`，顺序即调色板顺序）', () => {
    for (let i = 1; i <= 9; i += 1) {
      expect(tokens).toContain(`--boh-beam-c${i}:`);
    }
  });

  it('`@property --boh-beam-angle` 必须 `inherits: true`（伪元素靠继承拿角度）', () => {
    expect(tokens).toMatch(/@property --boh-beam-angle\s*\{[^}]*inherits:\s*true/);
    expect(tokens).toMatch(/@property --boh-beam-angle\s*\{[^}]*syntax:\s*'<angle>'/);
  });

  it('描边层不透明度按主题切（浅 0.9 / 暗 0.48）', () => {
    expect(tokens).toContain('--boh-beam-stroke-o-light: 0.9');
    expect(tokens).toContain('--boh-beam-stroke-o-dark: 0.48');
  });

  it('九个色值在 boh-beam.css 里**每一层都消费到**（描边 + 内辉各一次）', () => {
    const css = squeezeSource(read(BEAM_CSS));
    for (let i = 1; i <= 9; i += 1) {
      const hits = (css.match(new RegExp(`var\\(--boh-beam-c${i}\\)`, 'g')) || []).length;
      expect(hits, `--boh-beam-c${i} 消费次数`).toBe(2);
    }
  });
});
