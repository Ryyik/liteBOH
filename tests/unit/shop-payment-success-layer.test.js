import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments } from '../helpers/source.js';

/**
 * 支付成功弹窗的层级 / 暗色契约（2026-11-02 用户截图报障的回归锁）。
 *
 * 当时的现场：弹窗 z-index 写了 1000，而全局导航容器 #unified-nav-container 是 9999，
 * 灵动岛（通知卡）就挂在导航容器里面 —— 于是「BOH STORE」和关闭按钮被岛压住，
 * 卡片翻转动画也被切掉一截。
 *
 * ⚠️ 2026-11-23 迁进 BohModal 后，层级与遮罩归壳管：本文件不再断言宿主自己写了
 * 哪个 z-index（那些规则已经不存在），改为断言「壳用的那一档压得过导航」——
 * 约束力一点没少：壳把 --boh-z-modal 改低、或导航把 9999 抬上去，这里照样会红。
 * 宿主侧改锁三件事：
 *   ① 层级仍走壳（宿主不许自己写死 z-index 另起一层）；
 *   ② 标题/正文显式吃 --boh-text-primary，不吃壳 body 的 --liquid-text-secondary
 *      （迁移时踩过：漏给基色 → 标题变 rgb(110,110,115) 中灰，只有截图看得出）；
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
const SHELL = read('src/components/ui/BohModal.vue');
const SHELL_CSS = styleSection(SHELL);

const navCss = read('src/styles/vendor/unified-nav.css');
const NAV_Z = Number((navCss.match(/#unified-nav-container\s*\{[^}]*z-index:\s*(\d+)/) || [])[1]);

const tokensCss = read('src/styles/common/tokens.css');
const Z_MODAL = Number((tokensCss.match(/--boh-z-modal:\s*(\d+)/) || [])[1]);

describe('支付成功弹窗层级', () => {
  it('壳的 --boh-z-modal 高于全局导航容器（灵动岛挂在导航里，低了就会被盖住）', () => {
    expect(NAV_Z, '取不到导航容器的 z-index，样式结构可能变了').toBeGreaterThan(0);
    expect(Z_MODAL, '取不到 --boh-z-modal，token 可能改名了').toBeGreaterThan(0);
    expect(Z_MODAL).toBeGreaterThan(NAV_Z);
  });

  it('壳的 overlay 读 --boh-z-modal，而不是在组件里写死数字', () => {
    expect(ruleOf(SHELL_CSS, '.boh-modal__overlay')).toContain('z-index: var(--boh-z-modal)');
  });

  it('宿主不自己另起一层（层级只由壳决定）', () => {
    // 宿主没有 overlay/dialog 了：若有人补一条 position:fixed + z-index，
    // 就会绕开壳、重新变成"两层账"，这里直接拦住
    expect(MODAL_CSS).not.toMatch(/\.payment-success-(overlay|dialog)\s*\{/);
  });
});

describe('支付成功弹窗暗色', () => {
  it('壳的弹窗底色跟随 --liquid-bg-strong（不是写死白色）', () => {
    const rule = ruleOf(SHELL_CSS, '.boh-modal__dialog');
    expect(rule).toContain('var(--liquid-bg-strong)');
  });

  it('标题区显式吃 --boh-text-primary，不吃壳 body 的继承色', () => {
    // 壳 body 自带 --liquid-text-secondary（亮 #6e6e73 / 暗 #a1a1a6）；
    // 标题必须自己给基色，否则会继承成中灰
    expect(ruleOf(MODAL_CSS, '.payment-success-head')).toContain('color: var(--boh-text-primary');
  });

  it('正文区显式吃 --boh-text-primary', () => {
    expect(ruleOf(MODAL_CSS, '.payment-success-body')).toContain('color: var(--boh-text-primary');
  });

  it('自带 shop-sheet-tokens（商城域 token 不靠祖先继承）', () => {
    /* 本组件挂在壳的 #head / body 两个槽里，两个槽是兄弟节点 ⇒ 必须各自挂。
       ⚠️ 只认 class 属性：注释里也提到了这个类名，数裸词会假绿。 */
    expect(MODAL).toContain('class="payment-success-head shop-sheet-tokens"');
    expect(MODAL).toContain('class="payment-success-body shop-sheet-tokens"');
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
