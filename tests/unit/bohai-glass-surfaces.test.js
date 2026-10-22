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
 * ⚠️ 2026-10-14 升级（§21.7）：输入框 / 模型浮层 / 工具浮层三者从「模糊级」升级为
 *   **折射级**（`BohGlassRefract`，JS 覆盖层；材质不经过 `--liquid-filter-sm`）。
 *   本文件同步把材质串断言改为「三个保留消费者（斜杠/用量/详情卡）」，并新增折射级的
 *   关键约束断言（standard 免 worker / elasticity 0 / tint 令牌 / `.boh-main` 无 z-index）。
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
/* §21.11：折射级材质提为**站点级**，白膜令牌定义搬到全局 tokens（与 `--liquid-*` 平级） */
const GLOBAL_TOKENS = 'src/styles/common/tokens.css';
const COMPOSER_VUE = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';

describe('BOHAI 液态玻璃：哪些面上了玻璃', () => {
  it('斜杠 / hover 详情卡：锚无 z-index；斜杠改自带标准玻璃，详情卡仍走折射', () => {
    /* 剥 CSS 注释再断言：注释里合法地写着「无 z-index 锚」这类词（messages-glass 同款教训）；
       负向断言用「声明作用域」正则 —— @supports 查询条件里合法地含 "backdrop-filter:"，裸词必误伤 */
    const css = squeezeSource(String(read(COMPOSER)).replace(/\/\*[\s\S]*?\*\//g, ' '));
    // ① 2026-10-20 变更：`.boh-slash` 从「折射组件覆盖层」改成**自带**方块之家标准液态玻璃
    //    （`--glass-bg` + `--glass-filter-sm`，与论坛同款）⇒ 本文件**允许**出现一条
    //    backdrop-filter 声明，且它必须是玻璃 token，不许是裸 blur。
    //    仍然禁止的是「散落的模糊级材质组」（旧写法 `blur(20px) saturate(180%)` 攒在多个面板上）。
    const backdropDecls = css.match(/[{;]\s*backdrop-filter\s*:\s*([^;}]+)/g) || [];
    expect(
      backdropDecls.length,
      'backdrop-filter 声明数（只允许斜杠菜单那一条）',
    ).toBeLessThanOrEqual(2);
    for (const decl of backdropDecls) {
      expect(decl, 'backdrop-filter 必须走 --glass-filter-sm token，不许裸 blur').toContain(
        'var(--glass-filter-sm',
      );
    }
    // ② 两个锚存在且无 z-index（§21.7 采样根：锚不许建堆叠上下文）
    for (const anchor of ['.boh-slash-anchor', '.boh-mm-detail-anchor']) {
      const rule = css.match(new RegExp(`${anchor.replace(/\./g, '\\.')},?\\s*\\{[^}]*\\}`));
      const anchorRule = rule?.[0] || '';
      expect(anchorRule, `${anchor} 规则存在`).not.toBe('');
      expect(anchorRule, `${anchor} 不得带 z-index`).not.toMatch(/z-index/);
    }
    // ③ 2026-10-20：`.boh-slash` **已移出**撤实底名单（它现在自带玻璃，再撤就成浮字）；
    //    `.boh-mm-detail` 仍走折射组件，保留透明。
    expect(css).toContain(squeezeSource('.boh-mm-detail { background: transparent; }'));
    expect(css).not.toContain(
      squeezeSource('.boh-slash, .boh-mm-detail { background: transparent; }'),
    );
    // ④ 实例数 6 → **5**（2026-10-20：斜杠菜单不再挂折射组件，改自带标准玻璃）。
    //    门禁 `scripts/check-liquid-glass.mjs` 的 REFRACT_INSTANCE_BUDGET 仍是 6 上限，
    //    实际降到 5 —— 上限不动、实际值下降，属于好方向，不需要改预算。
    const source = read(COMPOSER_VUE);
    const template = squeezeSource(source.slice(0, source.indexOf('<script setup>')));
    expect(template).toContain('<div v-if="slashOpen" class="boh-slash-anchor">');
    expect(template).toContain('class="boh-mm-detail-anchor"');
    expect((template.match(/<BohGlassRefract/g) || []).length).toBe(5);
    // 斜杠锚里**不许**再有玻璃组件（两层玻璃会把 backdrop 采样做两遍、观感发灰）
    const slashAnchor = template.slice(
      template.indexOf('class="boh-slash-anchor"'),
      template.indexOf('class="boh-slash"'),
    );
    expect(slashAnchor).not.toContain('<BohGlassRefract');
  });

  it('输入框 / 模型 / 工具 / 用量浮层升级为**折射级**（§21.7；用量浮层见 §21.10）', () => {
    const css = squeezeSource(read(COMPOSER));
    // ① 四者已从模糊级材质串里移出（反证锚：旧组合不许回来）
    expect(css).not.toContain('.boh-mode-menu, .boh-tools-menu, .boh-slash');
    expect(css).not.toContain('.boh-mm-detail, .boh-composer {');
    expect(css).not.toContain('.boh-slash, .boh-usage-pop');
    // ② @supports 里撤掉 CSS 层材质（避免与折射玻璃双层过滤）
    //    ⚠️ 期望串必须过同款 squeeze（它会删闭括号前空白 ⇒ 裸字面量永远匹配不上，实测咬过一次）
    expect(css).toContain(squeezeSource('.boh-composer { background: transparent; }'));
    expect(css).toContain(
      squeezeSource('.boh-mode-menu, .boh-tools-menu { background: transparent;'),
    );
    expect(css).toContain(squeezeSource('.boh-usage-pop { background: transparent;'));
    // ②' 用量浮层的「无 z-index 锚」必须存在（采样根硬约束，§21.8 线1）——
    //    浮层的 z-index 留在自己身上、锚不许带，否则玻璃背板采样被裁。
    expect(css).toContain(squeezeSource('.boh-usage-anchor { position: absolute;'));
    expect(css).toMatch(/\.boh-usage-anchor\s*\{[^}]*\}/);
    expect(css.match(/\.boh-usage-anchor\s*\{[^}]*\}/)?.[0] || '').not.toContain('z-index');
    // ②'' 模板：玻璃挂进用量锚，与浮层**同开同关**（玻璃 `v-if` 与浮层 `v-show` 同一个状态源）
    const tplSource = read(COMPOSER_VUE);
    const tpl = squeezeSource(tplSource.slice(0, tplSource.indexOf('<script setup>')));
    expect(tpl).toContain(squeezeSource('<div class="boh-usage-anchor">'));
    // 2026-10-20：五处弹层（模型 / 工具 / hover 详情 / 斜杠 / 用量）改**磨砂**档
    // （`frosted` = 位移归零、只留模糊），输入框本体保持折射。
    // 断言同步：用量浮层这条从「无 frosted」升级为「必须带 frosted」——
    // 它锁的是"用量浮层也上了玻璃"，材质档位变了但契约仍在。
    expect(tpl).toContain(
      squeezeSource('<BohGlassRefract v-if="usagePopOpen" :radius="12" frosted />'),
    );
    // ③ 玻璃组件本体关键约束：standard 模式（免 worker）/ 弹性恒 0 / 百分比尺寸 / 白膜走令牌链
    //    ⚠️ §21.11：组件已从 BOHAI 域**升到 `src/components/ui/`**（站点级共享）
    const glass = read('src/components/ui/BohGlassRefract.vue');
    expect(glass).toContain('mode="standard"');
    expect(glass).toContain(':elasticity="SPEC.elasticity"');
    expect(glass).toContain("width: '100%'");
    expect(glass).toContain('rgba(var(--refract-tint-rgb), var(--refract-alpha))');
    // 白膜令牌的**定义**在站点级单源（与 `--liquid-*` 平级），不再锁在 BOHAI 域内
    const globalTokens = read(GLOBAL_TOKENS);
    expect(globalTokens).toMatch(/--refract-tint-rgb-light:/);
    expect(globalTokens).toMatch(/--refract-tint-rgb-dark:/);
    expect(globalTokens).toMatch(/--refract-alpha-default:\s*0\.1/);
    expect(globalTokens).toMatch(
      /\[data-theme="dark"\][\s\S]*--refract-tint-rgb:\s*var\(--refract-tint-rgb-dark\)/,
    );
    // BOHAI 域内只保留「按 BOHAI 主题覆写三元组」，且必须挂 `.bohai-page`（BOHAIMain 根）
    // —— `data-boh-theme` 离开 BOHAI 后**不会被清**，挂 :root 会把暗色白膜泄漏给站点级玻璃
    const bohTokens = read(TOKENS);
    expect(bohTokens).toMatch(
      /\.bohai-page\s*\{[\s\S]*?--refract-tint-rgb:\s*var\(--refract-tint-rgb-light\)/,
    );
    expect(bohTokens).toMatch(
      /:root\[data-boh-theme='dark'\]\s+\.bohai-page\s*\{[\s\S]*?--refract-tint-rgb:\s*var\(--refract-tint-rgb-dark\)/,
    );
    expect(bohTokens).not.toMatch(/--boh-refract-/);
    // ④ 采样根硬约束：`.boh-main` 不得再挂 z-index（守护 §21.7 的让位决定）
    const layout = squeezeSource(read('src/views/BOHAI/BOHAI/styles/layout.css'));
    expect(layout).not.toMatch(/\.boh-main\s*\{[^}]*z-index/);
  });

  it('玻璃透明度是用户偏好：令牌链 / 设置行 / 壳同步三处齐全（2026-10-14，§21.7）', () => {
    // ① 偏好默认值与持久化键（useGlobalAiPreferences 单源）
    const prefs = read('src/composables/useGlobalAiPreferences.js');
    expect(prefs).toContain('LIQUID_GLASS_SPEC.tintAlphaDefault');
    // ② 壳把偏好写到根（采样根变量），带 0.30~0.85 边界钳制（min 在外、max 在内）
    const shell = squeezeSource(read('src/views/BOHAI/composables/useBohShell.js'));
    expect(shell).toContain('syncGlassOpacity');
    expect(shell).toContain("'--refract-alpha'");
    expect(shell).toContain('LIQUID_GLASS_SPEC.tintAlphaMax');
    expect(shell).toContain('LIQUID_GLASS_SPEC.tintAlphaMin');
    // ③ 设置→外观 的滑杆行（含实时预览 chip，走同一对令牌）
    const panel = read('src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue');
    expect(panel).toContain('玻璃透明度');
    expect(panel).toContain('preferences.glassOpacity');
    expect(panel).toContain('rgba(var(--refract-tint-rgb), var(--refract-alpha))');
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

  it('输入框材质＝折射玻璃（2026-10-14 升级，§21.7）；基础规则仍留实色兜底', () => {
    const css = squeezeSource(read(COMPOSER));
    // ① 折射玻璃挂进输入框锚（模板 + 样式双锚点）——2026-10-12「进同组模糊材质」的形态已随之作废
    const source = read(COMPOSER_VUE);
    const template = squeezeSource(source.slice(0, source.indexOf('<script setup>')));
    expect(template).toContain('<BohGlassRefract :radius="20" />');
    expect(css).toContain('.boh-composer-anchor {');
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

  it('工具两件（Cloud+ / 心理）挂在工具胶囊下，不在模型面板里；社区搜索已并入官方记忆开关后下线', () => {
    expect(template).toContain('class="boh-tools-menu"');
    // 2026-10-16：BOH Health 下线 ⇒ 原「健康分析」那颗工具胶囊已移除。
    // 2026-10-19：官方记忆 / 社区搜索 / 社区知识 三合一 ⇒ 「社区搜索」按钮下线，工具只剩两件。
    for (const name of ['个人 Cloud+', '心理分析']) {
      expect(template).toContain(name);
    }
    expect(template).not.toContain('健康分析');
    expect(template).not.toContain('社区搜索');
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

  it('窄竖屏详情卡不挂；面板锚宽度受视口约束（2026-10-14 起钳制在 boh-composer.css）', () => {
    // 2026-10-22（plans/031 §2.5 / S0 ②）：这条规则**原写在 layout.css**，而 layout.css 是
    // scoped 到 BOHAIMain 的（选择器带 `[data-v-main]`），详情卡却在 BohComposer 模板内部
    // （只带 `[data-v-composer]`）⇒ 一条都没命中，是**死规则**。实测竖屏 hover 后卡片仍挂出，
    // 且 left=-215 / right=17（整卡在视口左侧之外、只露 17px 玻璃边，比不显示更糟）。
    // 断言随之改指真正生效的文件（与「源码守卫改指新文件」的既定纪律一致），
    // 并补一条负向断言防止有人把死规则加回 layout.css —— 断言数只增不减。
    const composerCss = squeezeSource(read(COMPOSER));
    expect(composerCss).toMatch(
      /@media\s*\(orientation:\s*portrait\)[\s\S]*?\.boh-mm-detail\s*\{\s*display:\s*none/,
    );
    const layout = squeezeSource(read('src/views/BOHAI/BOHAI/styles/layout.css'));
    expect(layout).not.toContain('.boh-mm-detail');
    // 宽度钳制随「锚」迁进 scoped 正确的文件 —— layout.css 是 scoped 到 BOHAIMain 的，
    // 原来那条选择器带 [data-v-main]、够不到 BohComposer 内部元素（半死规则，2026-10-14 修）
    // 2026-10-15 竖屏修复：≤480 从「宽 252 钳制」升级为「全宽减边距 action-sheet」
    // （工具胶囊 x≈170 时旧钳制仍右缘越出视口 32px，实测 right=422），
    // 且 wrap 退为 static 把锚交给 composer 承载（left/right 写在 wrap 内会锁进 wrap）。
    expect(composerCss).toMatch(
      /@media\s*\(max-width:\s*480px\)[\s\S]*?\.boh-mode-wrap,\s*\.boh-tools-wrap\s*\{[^}]*position:\s*static/,
    );
    expect(composerCss).toMatch(
      /@media\s*\(max-width:\s*480px\)[\s\S]*?\.boh-menu-anchor\s*\{[^}]*left:\s*12px[^}]*right:\s*12px[^}]*width:\s*auto/,
    );
  });
});
