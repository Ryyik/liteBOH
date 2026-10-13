/**
 * bohai-glass-surfaces.test.js — 锁「哪些面上液态玻璃」（2026-10-10 A 档口径）
 *
 * 口径（用户）：液态玻璃上**浮在内容之上**的面；
 *   · 上玻璃：跳转导航 hover 卡、模型/工具两个浮层、斜杠菜单、用量浮层、
 *     模型面板里的 hover 详情卡、灵动岛外壳（本来就已是）、**输入框**
 *     （2026-10-12 口径变更：「输入框应该是液态玻璃形式，带点透明，这样滚动的时候会透出
 *      下面的内容」—— 为此输入区**同时**改成浮在消息流之上，否则底下没有可透的内容）；
 *   · **不上**：常驻面板（侧栏 / 工作台）、阅读主体（用户气泡）—— 底下没有可透的内容。
 *
 * ⚠️ 材质必须引用全局单源 `--liquid-filter-sm`（`scripts/check-liquid-glass.mjs` 禁止在
 *    `liquid-glass.css` 之外重写 blur 材质；**注释里也别复述那条被禁的写法** —— 门禁读原文）。
 * ⚠️ 颜色必须走 `--boh-glass-*`：BOHAI 主题（`data-boh-theme`）不跟站点主题联动，
 *    直接吃 `--liquid-bg-*` 会在「站点浅色 + AI 暗色」时翻出一张亮白卡。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { squeezeSource } from '../helpers/source.js';
import { formatModeRateLabel } from '../../src/views/BOHAI/utils/mode-rate-label.js';

const read = (rel) => readFileSync(resolve(import.meta.dirname, '../..', rel), 'utf8');
const COMPOSER = 'src/views/BOHAI/BOHAI/components/styles/boh-composer.css';
const STREAM = 'src/views/BOHAI/BOHAI/components/styles/boh-stream.css';
const TOKENS = 'src/views/BOHAI/BOHAI/styles/tokens.css';
const COMPOSER_VUE = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';

describe('BOHAI 液态玻璃：哪些面上了玻璃', () => {
  it('六个面**共用一组材质**（模型/工具面板 / 斜杠菜单 / 用量浮层 / hover 详情卡 / 输入框）', () => {
    const css = squeezeSource(read(COMPOSER));
    expect(css).toContain(
      '.boh-mode-menu, .boh-tools-menu, .boh-slash, .boh-usage-pop, .boh-mm-detail, .boh-composer {',
    );
    expect(css).toContain('backdrop-filter: var(--liquid-filter-sm)');
    expect(css).not.toMatch(/backdrop-filter:\s*blur\((?:1[4-9]|[2-9]\d)px\)/);
    expect(css).toContain('background: var(--boh-glass-bg)');
    expect(css).toMatch(/@supports\s*\(\(backdrop-filter:\s*blur\(1px\)\)/);
  });

  it('跳转导航 hover 卡与浮层共用同一套 --boh-glass-* 令牌（单源）', () => {
    expect(squeezeSource(read(STREAM))).toContain('background: var(--boh-glass-bg)');
    const tokens = read(TOKENS);
    expect(tokens).toMatch(/--boh-glass-bg-light:/);
    expect(tokens).toMatch(/--boh-glass-bg-dark:/);
    expect(tokens).toMatch(
      /\[data-boh-theme='dark'\][\s\S]*--boh-glass-bg:\s*var\(--boh-glass-bg-dark\)/,
    );
  });

  it('输入框**上**玻璃（2026-10-12 口径反转），基础规则仍留实色兜底', () => {
    const css = squeezeSource(read(COMPOSER));
    // ① 进了同一组材质（`@supports` 块内）—— 这条 2026-10-11 时是反过来的
    expect(css).toContain('.boh-mm-detail, .boh-composer {');
    // ② `@supports` 之外的基础规则仍是实色 ⇒ 不支持 backdrop-filter 时自动落回
    const composerRule = css.match(/\.boh-composer \{[^}]*\}/);
    expect(composerRule?.[0] || '').toContain('background: var(--boh-composer-bg)');
    expect(composerRule?.[0] || '').not.toContain('backdrop-filter');
    // ③ 令牌单源：亮色 = 页面底（纯白），暗色 = 卡片色（别把暗色也刷白）
    const tokens = read(TOKENS);
    expect(tokens).toMatch(/--boh-composer-bg:\s*var\(--boh-bg-page\)/);
    expect(tokens).toMatch(
      /\[data-boh-theme='dark'\][\s\S]*--boh-composer-bg:\s*var\(--boh-bg-card\)/,
    );
  });

  it('输入框**浮在消息流之上** —— 否则玻璃底下没有可透的内容', () => {
    const composer = squeezeSource(read(COMPOSER));
    const stream = squeezeSource(read(STREAM));
    // 输入区负掉自身高度拉回消息区之上
    expect(composer).toContain('.boh-main:not(.is-empty) .boh-composer-wrap');
    expect(composer).toContain('margin-top: calc(-1 * var(--boh-composer-h');
    // 消息区补等高的底部内衬（否则最后一条消息被压在输入框底下）
    expect(stream).toContain('.boh-main:not(.is-empty) .boh-stream');
    expect(stream).toContain('padding-bottom: var(--boh-composer-h');
    // 高度必须实测：壳把 `--boh-composer-h` 写在共同祖先 `.boh-main` 上。
    // Step 7：实测逻辑搬进 composables/useBohShell.js ⇒ 断言改指新文件。
    const shell = read('src/views/BOHAI/composables/useBohShell.js');
    expect(shell).toContain("setProperty('--boh-composer-h'");
  });

  it('常驻面板与阅读主体不上玻璃（底下没有可透的内容）', () => {
    const css = squeezeSource(read(COMPOSER));
    for (const sel of ['.boh-sidebar', '.boh-work', '.boh-bubble']) {
      expect(css).not.toMatch(new RegExp(`${sel.replace('.', '\\.')}[^}]*backdrop-filter`));
    }
    const sidebar = squeezeSource(read('src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css'));
    expect(sidebar).not.toContain('backdrop-filter');
  });
});

describe('BOHAI 输入区：2026-10-11 两颗独立胶囊', () => {
  const source = read(COMPOSER_VUE);
  const template = squeezeSource(source.slice(0, source.indexOf('<script setup>')));
  const script = squeezeSource(source.slice(source.indexOf('<script setup>')));
  const mainTemplate = squeezeSource(
    read('src/views/BOHAI/BOHAI/BOHAIMain.vue').split('<script setup>')[0],
  );

  it('模型菜单是扁平列表：名称 + 统一倍率 + 当前勾选 + 底部 BYOK 配置入口', () => {
    expect(template).toContain('class="boh-mm-rows"');
    expect(template).toContain('class="boh-mm-row"');
    expect(template).toContain(':data-mode-id="mode.id"');
    expect(template).toContain('formatModeRateLabel(mode)');
    expect(template).toContain('class="boh-mm-custom"');
    expect(mainTemplate).toContain('@open-settings="openSettingsFromComposer"');
  });

  it('两颗胶囊各自触发各的浮层，且**互斥**（activeMenu 单状态，不是两个布尔）', () => {
    for (const [pill, menu] of [
      ['boh-mode-pill', 'boh-mode-menu'],
      ['boh-tools-pill', 'boh-tools-menu'],
    ]) {
      expect(template).toContain(`class="${pill}"`);
      expect(template).toContain(`class="${menu}"`);
      expect(template).toContain('aria-haspopup="dialog"');
    }
    expect(script).toContain('const activeMenu = ref(null)');
    expect(script).toContain('const toggleMenu = (name)');
    expect(script).toContain('activeMenu.value = activeMenu.value === name ? null : name');
    // 旧的两视图契约必须**彻底**消失（留着就是第二份真相）。
    // ⚠️ 只断言**代码形态**（`const menuView` / `menuView.value`），不断言裸词 ——
    //    「为什么从 menuView 换成 activeMenu」的注释里本来就该出现那个名字。
    expect(script).not.toContain('const menuView');
    expect(script).not.toContain('menuView.value');
    expect(script).not.toContain('advOpen');
  });

  it('思考强度已整体下线（2026-10-11 用户口径）：控件 / 菜单 / 状态一律不许回来', () => {
    // 背景：现有 5 个在用模式的模型里只有 gemini 支持调思考强度（其余是非推理模型或
    // 内置思考的推理模型），而服务端 buildRuntimePayload 本来就会用 DB 值覆盖客户端采样
    // 参数 ⇒ 这颗胶囊无论怎么调都不生效。用户拍板「不做，直接隐藏」。
    for (const dead of [
      'boh-effort-pill',
      'boh-effort-menu',
      'boh-effort-option',
      'boh-effort-wrap',
      'pickEffort',
      'effortName',
      'thinkingSpeedOptions',
    ]) {
      expect(template + script).not.toContain(dead);
    }
    // CSS 侧同样不许留残骸（玻璃白名单 / 面板宽度都按两颗胶囊写）
    expect(squeezeSource(read(COMPOSER))).not.toContain('boh-effort');
  });

  it('工具四件（社区搜索 / Cloud+ / 健康 / 心理）挂在工具胶囊下，不在模型面板里', () => {
    expect(template).toContain('class="boh-tools-menu"');
    for (const name of ['社区搜索', '个人 Cloud+', '健康分析', '心理分析']) {
      expect(template).toContain(name);
    }
    expect(template).toContain('class="boh-mm-tool"');
    // 「高级」折叠行已下线
    expect(template).not.toContain('is-adv');
    expect(template).not.toContain('class="boh-mm-back"');
  });

  it('hover 详情卡保留：描述 + 消耗速度 + 使用此模式', () => {
    expect(template).toContain('formatModeRateLabel(hoverMode)');
    expect(template).toContain('@click="pickMode(hoverMode.id)"');
    expect(template).toContain("'is-flipped': hoverFlipped");
    expect(script).toContain('const onModeRowEnter');
    expect(script).toContain('const scheduleCloseModeDetail');
    expect(script).toContain('const cancelCloseModeDetail');
  });

  it('用户要求删掉的项目不出现：上下文窗口 / logo / Free now / 促销', () => {
    expect(template).not.toMatch(/上下文窗口|Free now|promo|促销/i);
    expect(template).not.toContain('class="boh-mm-group-name"');
    expect(formatModeRateLabel({ quotaMultiplier: 0 })).toBe('0.00x');
  });

  it('窄竖屏详情卡不挂；两个面板宽度受视口约束', () => {
    const layout = squeezeSource(read('src/views/BOHAI/BOHAI/styles/layout.css'));
    expect(layout).toMatch(
      /@media\s*\(orientation:\s*portrait\)[\s\S]*?\.boh-mm-detail\s*\{\s*display:\s*none/,
    );
    expect(layout).toMatch(
      /@media\s*\(max-width:\s*480px\)[\s\S]*?\.boh-mode-menu,\s*\.boh-tools-menu\s*\{[^}]*width:\s*min\(252px,\s*calc\(100vw\s*-\s*24px\)\)/,
    );
  });
});
