import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

/* 横屏详情弹窗「关闭缩回列表」的源码守卫（2026-10-31，用户报障两次）。
 *
 * 现象：横屏点开帖子后关闭，面板原地微缩一下就淡出，没有「缩回卡片」的感觉。
 *
 * 真因（浏览器实测，1280×800）：
 *   ① **`panelRef.value` 在退场时已经是 null**。v-if 翻假的瞬间 Vue 就解绑模板 ref，
 *      哪怕节点还被 <Transition> 的 leave 留着继续淡出 ⇒ playPanelMorph 拿到 null
 *      直接 return false，WAAPI 形变根本没跑（实测关闭全程面板宽 1024 → 1032，
 *      getAnimations() 只有 CSS 的两条 transition）。
 *   ② 即使拿得到元素，Vue 的 enter/leave 类会给面板挂 `transition: transform …`，
 *      而 CSS Cascade 里 **transitions 高于 animations** ⇒ 起跑后 rAF 一加 leave-to
 *      的 scale(1.008)，transition 就把形变整段压掉。所以形变期间要把
 *      transition-property 收成 width（面板随图变宽那条 520ms 过渡照常）。
 *   ③ 形变只能挂在 isOpen 的 watcher 上：关闭有五条路径（遮罩 / 关闭钮 / 详情内
 *      @close / Esc / 浏览器后退），挂在 handleClose 里会让后两条只剩淡出。
 *
 * 修好后实测（1280×800，卡片 667×644 @232,356）：关闭 340ms 时面板 667×645 @232,355，
 * 入场 20ms 时 677×654 @226,338 —— 两端都咬住卡片矩形。
 *
 * 这是源码级守卫：行为验证在浏览器里做过（见 plans/035 §15），但那需要真实登录态 +
 * 真实帖子数据，不适合放进常驻探针。 */

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const modalVue = read('src/views/PostDetail/PostDetailModal.vue');
const modalScript = squeezeSource(stripComments(scriptSection(modalVue)));
const modalStyle = modalVue.slice(modalVue.indexOf('<style'));

describe('PostDetailModal：关闭必须缩回列表卡片', () => {
  it('两个方向都走 isOpen watcher（Esc / 后退也能缩回，不再只有进场）', () => {
    expect(modalScript).toContain("playPanelMorph(open ? 'in' : 'out')");
    // 旧写法：只挂进场，关闭依赖 handleClose 自己调 —— Esc 与 popstate 两条路径漏掉
    expect(modalScript).not.toContain("if (open) void playPanelMorph('in')");
  });

  it('handleClose 不再自己起形变（否则退场只有三条入口有，后退没有）', () => {
    expect(modalScript).not.toContain("if (isOpen.value) void playPanelMorph('out')");
  });

  it('退场取元素回落到 DOM 查询：v-if 翻假时模板 ref 已解绑', () => {
    expect(modalScript).toContain(
      "const el = panelRef.value || document.querySelector('.pd-modal-panel')",
    );
  });

  it('形变期间把 transition-property 收成 width（transitions 在级联里压过 animations）', () => {
    expect(modalScript).toContain("el.style.transitionProperty = 'width'");
    expect(modalScript).toContain("el.style.transitionProperty = ''");
  });

  it('退场时长取自 --motion-morph-out（与详情整页返程同一个 token）', () => {
    expect(modalScript).toContain("motionMs('--motion-morph-out', 460)");
  });

  it('走窗口 clip-path，不再用 FLIP 矩形变形（2026-10-31 三改）', () => {
    expect(modalScript).toContain('insetFromRect(source, target');
    expect(modalScript).toContain('clipPath: win.value');
    // 旧口径：370×104 → 390×800 的非等比缩放，中途是一块被拉长的矩形
    expect(modalScript).not.toContain('flipFromRect');
    expect(modalScript).not.toContain('flipRadius');
  });

  it('纵深挂在面板内容层上，原点取卡片中心（默认 50% 会从面板中心发散）', () => {
    expect(modalScript).toContain("el.querySelector('.pd-modal-scroll')");
    expect(modalScript).toContain("motionNum('--morph-depth'");
    expect(modalScript).toContain('source.left + source.width / 2 - box.left');
  });

  it('退场形变必须 keepFinal：cancel 的瞬间面板会弹回全屏', () => {
    expect(modalScript).toContain('keepFinal: true');
  });

  it('leave 过渡时长必须长于形变时长，否则末帧被节点摘除截断', () => {
    const tokens = read('src/styles/common/tokens.css');
    const morphOut = Number(/--motion-morph-out:\s*(\d+)ms/.exec(tokens)?.[1] || 0);
    const leave = Number(
      /\.pd-modal-leave-active\s*\{[\s\S]*?transition:\s*opacity\s*(\d+)ms/.exec(modalStyle)?.[1] ||
        0,
    );
    expect(morphOut).toBeGreaterThan(0);
    expect(leave).toBeGreaterThan(morphOut);
  });
});

describe('ForumMain：横屏不挂发帖 FAB', () => {
  const forumScript = squeezeSource(
    stripComments(scriptSection(read('src/views/Forum/ForumMain.vue'))),
  );

  it('横屏判据命中时 FAB 直接不挂载（左栏「发布」才是该档位的入口）', () => {
    expect(forumScript).toContain('if (isLandscapeViewport.value) return false');
  });

  it('判据是响应式的：旋屏 / 拖窗后要重算，不能只在 setup 求值一次', () => {
    expect(forumScript).toContain('isLandscapeViewport.value = isForumLandscape()');
  });
});
