/**
 * BOH AI 暗色主题接线守卫（2026-10-08）
 *
 * ## 背景：一次「verify 全绿但暗色整页失效」的回归
 *
 * Step 6 重绘把 BOHAI 的暗色实现统一成了「**只切语义别名**」：
 * 唯一的暗色入口是 `styles/tokens.css` 的 `:root[data-boh-theme='dark']`，
 * 组件树里 `boh-*.css` / `layout.css` 一条 `[data-theme]` 暗色规则都没有
 * （HEAD 时代是由 `src/styles/themes/bohai-dark.css` 里 139 行
 * `.bohai-page[data-theme="dark"]` 兜的底，随旧 CSS 一并删除）。
 *
 * 这个架构方向是对的（令牌单一真源），但驱动它的那根线接错了：
 * `BOHAIMain.vue` 的 `syncThemeAttribute()` 读的是 `currentSiteTheme`
 * （= `themeManager.isDark()`，**站点主题**），而 `:data-theme` 绑的是
 * `resolvedAiTheme`（**含 AI 外观偏好**，`useGlobalAiPreferences` 的 `appearance`）。
 * 两者只在「用户没设过 AI 外观偏好」时才一致，于是触发条件成立时整页保持浅色：
 *
 *     站点浅色  +  设置→外观→深色  ⇒  页面级 data-theme="dark" 已设，
 *                                     但 <html data-boh-theme> 没置位 ⇒ token 不换。
 *
 * 隐蔽之处：它**不报错、不告警、门禁全绿**，只有人在那个组合下才看得见。
 * 所以这里锁死两件事 —— ① 读的是解析后的有效主题；② 偏好变更会重跑同步。
 *
 * 反向对照实测：把 `resolvedAiTheme.value === 'dark'` 改回 `currentSiteTheme.value`，
 * 或删掉那条 `watch`，下面两条当场 FAIL。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const viewCode = () =>
  squeezeSource(stripComments(scriptSection(read('src/views/BOHAI/BOHAI/BOHAIMain.vue'))));
const tokensCss = () => read('src/views/BOHAI/BOHAI/styles/tokens.css');

describe('BOHAI 暗色：token 入口仍只有一处', () => {
  it("tokens.css 的 :root[data-boh-theme='dark'] 仍存在（唯一入口）", () => {
    expect(tokensCss()).toMatch(/:root\[data-boh-theme=['"]dark['"]\]/);
  });

  it('组件树不再自带 [data-theme] 暗色块（口径：暗色只能靠换 token）', () => {
    const files = [
      'src/views/BOHAI/BOHAI/components/styles/boh-composer.css',
      'src/views/BOHAI/BOHAI/components/styles/boh-sidebar.css',
      'src/views/BOHAI/BOHAI/components/styles/boh-stream.css',
      'src/views/BOHAI/BOHAI/components/styles/boh-work.css',
      'src/views/BOHAI/BOHAI/components/styles/boh-empty-state.css',
      'src/views/BOHAI/BOHAI/styles/layout.css',
    ];
    for (const f of files) {
      expect(read(f), `${f} 不应再有 data-theme 暗色块`).not.toMatch(/data-theme/);
    }
  });
});

describe('BOHAI 暗色：syncThemeAttribute 必须读有效主题（防整页浅色回归）', () => {
  it('判定条件用 resolvedAiTheme，不是 currentSiteTheme', () => {
    const code = viewCode();
    expect(code).toMatch(/if \(\s*resolvedAiTheme\.value === ['"]dark['"]\s*\)/);
    // 关键反证：若这里退回 currentSiteTheme，站点浅色 + AI 外观深色 就不再换 token
    expect(code).not.toMatch(
      /if \(\s*currentSiteTheme\.value === ['"]dark['"]\s*\)\s*\{\s*document\.documentElement/,
    );
  });

  it('resolvedAiTheme 仍把 AI 外观偏好纳入判定（site theme 只是兜底）', () => {
    const code = viewCode();
    expect(code).toMatch(/globalAiPreferences\.appearance === ['"]dark['"]/);
    expect(code).toMatch(/globalAiPreferences\.appearance === ['"]light['"]/);
  });

  it('外观偏好变更会重跑同步（不只挂载与站点主题切换两条路径）', () => {
    expect(viewCode()).toMatch(/watch\(\s*resolvedAiTheme\s*,\s*syncThemeAttribute\s*\)/);
  });

  it('页面级 :data-theme 绑定与 token 判定同源（都是 resolvedAiTheme）', () => {
    const src = read('src/views/BOHAI/BOHAI/BOHAIMain.vue');
    expect(src).toMatch(/:data-theme="resolvedAiTheme"/);
  });
});
