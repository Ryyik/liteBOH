import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments } from '../helpers/source.js';

/**
 * 支付成功弹窗的层级 / 暗色契约（2026-11-02 用户截图报障的回归锁）。
 *
 * 当时的现场：弹窗 z-index 写了 1000，而全局导航容器 #unified-nav-container 是 9999，
 * 灵动岛（通知卡）就挂在导航容器里面 —— 于是「BOH STORE」和关闭按钮被岛压住，
 * 卡片翻转动画也被切掉一截。这里锁三件事：
 *   ① 弹窗永远高于导航容器（数值从 vendor 样式里现取，导航改层级时测试会跟着变）；
 *   ② 弹窗不再退回「白底 + 深字」的硬编码（暗色下会变成一块发光的白卡）；
 *   ③ 邮件失败改成弹窗内说明，岛只在关闭后补提醒。
 */

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const styleSection = (vue) =>
  [...vue.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

const ruleOf = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
};

const MODAL = read('src/views/Shop/ShopPaymentSuccessModal.vue');
const MODAL_CSS = styleSection(MODAL);

const navCss = read('src/styles/vendor/unified-nav.css');
const NAV_Z = Number((navCss.match(/#unified-nav-container\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]);
const OVERLAY_Z = Number(
  (ruleOf(MODAL_CSS, '.payment-success-overlay').match(/z-index:\s*(\d+)/) || [])[1],
);

describe('支付成功弹窗层级', () => {
  it('高于全局导航容器（灵动岛挂在导航里，低了就会被盖住）', () => {
    expect(NAV_Z, '取不到导航容器的 z-index，样式结构可能变了').toBeGreaterThan(0);
    expect(OVERLAY_Z).toBeGreaterThan(NAV_Z);
  });
});

describe('支付成功弹窗暗色', () => {
  it('弹窗底色跟随 --boh-page-bg，而不是写死白色', () => {
    const rule = ruleOf(MODAL_CSS, '.payment-success-dialog');
    expect(rule).toContain('background: color-mix(in srgb, var(--boh-page-bg');
  });

  it('遮罩底色跟随 --boh-page-bg', () => {
    const rule = ruleOf(MODAL_CSS, '.payment-success-overlay');
    expect(rule).toContain('var(--boh-page-bg');
  });

  it('正文文字跟随 --boh-text-primary', () => {
    expect(ruleOf(MODAL_CSS, '.payment-success-overlay')).toContain(
      'color: var(--boh-text-primary',
    );
  });
});

describe('邮件失败不再挤占岛的弹出时机', () => {
  const shop = read('src/views/Shop/index.vue');

  it('弹窗接收 emailState（结果就地展示）', () => {
    expect(MODAL).toContain('emailState');
    expect(shop).toContain(':email-state="paymentSuccess?.emailState');
  });

  it('支付成功分支不再无条件弹「订单已提交」', () => {
    // 必须走 scriptSection + stripComments：块注释里会合法地复述这句被删掉的调用，
    // 直接对 .vue 全文剥注释又会踩 `accept="image/*"` 那条老坑（见 tests/helpers/source.js）
    const code = stripComments(scriptSection(shop));
    expect(code).not.toContain("showOperationToast('订单已提交')");
  });
});
