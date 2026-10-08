import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// 源码守卫断言的格式宽容归一（readFileSync + toContain 必须过同一个归一，见 helpers/source.js）
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

/**
 * BOH AI 沉浸导航「球」（2026-10-08）
 *
 * 用户口径：打开 BOHAI 时顶部导航收成一颗球、落在横向左栏的品牌 logo 位上，
 * 页面因此顶到满屏；点那颗球唤醒完整导航。
 *
 * 这套能力**复用**阅读页/创作页已有的 `immersiveNav`（含球 ↔ 胶囊 FLIP morph），
 * 本次新增的是三件联动 —— 也就是本文件要锁死的东西：
 *   ① AI 路由声明 immersiveNav；
 *   ② 球几何收敛成 CSS 变量 `--nav-orb-*` 单一真源（静态球位与 FLIP 起点必须同源）；
 *   ③ 球态写 body ⇒ `--bohai-standalone-nav-height` 归零 ⇒ `.bohai-page` 顶满。
 *
 * 运行时几何另有 `scripts/probes/probe-nav-immersive-orb.mjs` 兜底。
 */
const root = resolve(import.meta.dirname, '../..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf-8');

describe('BOH AI 沉浸导航（收球 + 唤醒 + 页面顶满）', () => {
  it('AI 路由挂了 immersiveNav 标记', () => {
    const src = read('src/router/routes/public.ts');
    const start = src.indexOf("name: 'AiChat'");
    expect(start, '未找到 AiChat 路由').toBeGreaterThan(-1);
    // 只截这一段：别处（阅读页/创作页）也有 immersiveNav，整文件 toContain 会假绿
    const block = src.slice(start, src.indexOf('},', start));
    expect(block).toContain('immersiveNav: true');
  });

  it('球几何是 CSS 变量单一真源，且球规则消费它', () => {
    const css = squeezeSource(read('src/components/UnifiedNavbar/style.scoped.css'));
    expect(css).toContain('--nav-orb-x');
    expect(css).toContain('--nav-orb-y');
    expect(css).toContain('--nav-orb-size');
    // 球规则必须用变量，否则 AI 页覆盖不了它（回到写死 14/52 的状态）
    expect(css).toContain(squeezeSource('left: var(--nav-orb-x'));
    expect(css).toContain(squeezeSource('width: var(--nav-orb-size'));
    expect(css).not.toContain(squeezeSource('left: 14px'));
  });

  it('FLIP 起点读同一组变量（不再用写死的球几何常量）', () => {
    const nav = read('src/components/UnifiedNavbar/index.vue');
    expect(nav).toContain('readImmersiveOrb');
    expect(nav).toContain("readPx('--nav-orb-x'");
    const codeOnly = stripComments(scriptSection(nav));
    // 只认代码：注释里会提到旧常量名，直接在原文断言会假红（helpers/source.js 文件头）
    expect(codeOnly).not.toContain('IMMERSIVE_ORB.x');
    expect(codeOnly).not.toContain('IMMERSIVE_ORB.size');
  });

  it('球态写到 body，AI 页据此把页面顶满', () => {
    const nav = read('src/components/UnifiedNavbar/index.vue');
    expect(nav).toContain("classList.toggle('nav-orb-mode'");

    const css = squeezeSource(read('src/style.css'));
    expect(css).toContain(squeezeSource('body.page-aichat.nav-orb-mode'));
    expect(css).toContain(squeezeSource('--bohai-standalone-nav-height: 0px'));
    // 高度过渡只在形态切换窗口内挂 —— 常驻会把软键盘的 --kb-inset 适配拖慢 460ms
    expect(css).toContain(squeezeSource('body.page-aichat.nav-orb-transitioning .bohai-page'));
  });

  it('AI 页的球位钉在左栏品牌 logo 位上', () => {
    const css = squeezeSource(read('src/style.css'));
    expect(css).toContain(squeezeSource('body.page-aichat #unified-nav-container'));
    expect(css).toContain(squeezeSource('--nav-orb-x: 18px'));
    expect(css).toContain(squeezeSource('--nav-orb-y: 21px'));

    // 左栏侧：AI 页品牌位统一到窄栏档规格（宽栏档那套是按 240px 栏设计的）
    const rail = squeezeSource(read('src/views/user-center/UserSpace/components/side-rail.css'));
    expect(rail).toContain(squeezeSource('body.page-aichat .userspace-rail-brand {'));
    expect(rail).toContain(squeezeSource('body.page-aichat .userspace-rail-brand-mark'));
    expect(rail).toContain(squeezeSource('body.page-aichat .userspace-rail-brand-name'));
  });
});
