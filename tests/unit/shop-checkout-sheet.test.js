import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 周边「确认礼物」页结构契约（2026-11-03 改版，替代 shop-contact-modal.test.js）
 *
 * 原来测的是「确认收货信息」弹窗；改版后是整页的 CheckoutSheet。这里钉住的都是
 * 「删掉不会报错、但用户会立刻吃亏」的结构：
 *   · 竖屏必须是**整页**（不是浮在购物袋上的卡片），横屏才是居中弹窗；
 *   · 显式返回按钮（竖屏没有遮罩可点，只剩手势）；
 *   · 省份自绘箭头、textarea 不给拖拽手柄、收件人/电话两列；
 *   · 底部结算条固定、内容区可内滚；
 *   · 识别按钮的降级链与监听回收。
 */
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const compact = (s) => s.replace(/\s+/g, '');

describe('确认礼物页（CheckoutSheet）形态契约', () => {
  const sheet = compact(read('src/views/Shop/CheckoutSheet.vue'));

  it('竖屏是整页：root 与 sheet 都铺满视口，不留圆角/阴影的卡片感', () => {
    expect(sheet).toContain('.ck-root{position:fixed;inset:0');
    expect(sheet).toMatch(/\.ck-sheet\{position:absolute;inset:0/);
  });

  it('竖屏不渲染遮罩（遮罩只在横屏弹窗形态出现）', () => {
    expect(sheet).toMatch(/@media\(orientation:portrait\)\{\.ck-scrim\{display:none/);
  });

  it('横屏才切成居中弹窗（transform 居中 + 圆角）', () => {
    expect(sheet).toMatch(
      /@media\(orientation:landscape\)\{[\s\S]*?\.ck-sheet\{[\s\S]*?translate\(-50%,-50%\)/,
    );
  });

  it('有显式返回按钮：竖屏没有遮罩可点，只剩手势就太隐晦', () => {
    expect(sheet).toContain('class="ck-back"');
    expect(sheet).toContain('aria-label="返回购物袋"');
  });

  it('底部结算条独立于滚动区（header / body / footer 三段）', () => {
    expect(sheet).toContain('class="ck-body"');
    expect(sheet).toContain('class="ck-foot"');
    expect(sheet).toMatch(/\.ck-body\{flex:1;[\s\S]*?overflow-y:auto/);
    expect(sheet).toMatch(/\.ck-foot\{flex:none/);
  });

  it('内滚不把惯性传给背后页面（overscroll-behavior: contain）', () => {
    expect(sheet).toMatch(/\.ck-body\{[^}]*overscroll-behavior:contain/);
    expect(sheet).toMatch(/\.ck-picker-body\{[^}]*overscroll-behavior:contain/);
  });

  it('金额明细有独立的「应付」行（不是把积分与现金各写一行就完）', () => {
    // compact() 会去掉属性值里的空格：'ck-row is-total' → 'ck-rowis-total'
    expect(sheet).toContain('class="ck-rowis-total"');
    expect(sheet).toMatch(/\.ck-row\.is-total\{/);
  });
});

describe('新增地址表单契约', () => {
  const sheet = compact(read('src/views/Shop/CheckoutSheet.vue'));

  it('省份下拉自绘：appearance:none + ::after chevron + 右侧留出箭头空间', () => {
    expect(sheet).toContain('class="ck-select"');
    expect(sheet).toContain('v-model="form.province"');
    expect(sheet).toContain('.ck-select::after{');
    expect(sheet).toMatch(/\.ck-selectselect\{padding-right:30px;appearance:none/);
  });

  it('textarea 不给拖拽手柄（拖大会把竖屏版面顶变形）', () => {
    expect(sheet).toMatch(/\.ck-fieldtextarea\{[^}]*resize:none/);
  });

  it('收件人 + 电话走两列紧凑布局', () => {
    expect(sheet).toContain('class="ck-form-grid"');
    expect(sheet).toMatch(
      /\.ck-form-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)minmax\(0,1fr\)/,
    );
  });
});

/**
 * 地址「识别」按钮的降级链契约（2026-11-02 定，2026-11-03 随组件迁移）：
 *   A) clipboard.readText() 能读 → 直接拆分填表；
 *   B) 读不到（iOS WKWebView / iframe / 未授权）→ 进入等待粘贴态，
 *      文档捕获阶段的一次性 paste 监听把用户 Ctrl+V / 长按粘贴接住。
 * 这些都是「不做就静默失效」的行为：按钮点了没反应时用户只会以为坏了。
 */
describe('地址识别（剪贴板 + 粘贴兜底）契约', () => {
  const sheet = compact(read('src/views/Shop/CheckoutSheet.vue'));

  it('识别按钮绑 readClipboardAddress，并按识别中 / 等待粘贴切换文案', () => {
    expect(sheet).toContain('@click="readClipboardAddress"');
    expect(sheet).toContain(':disabled="recognizing"');
    expect(sheet).toContain("{{recognizing?'识别中':awaitingPaste?'等待粘贴':'识别'}}");
  });

  it('先走标准剪贴板 API（且必须有存在性守卫，无该 API 的 WebView 不能抛错）', () => {
    expect(sheet).toContain('if(navigator.clipboard?.readText){');
    expect(sheet).toMatch(/text=awaitnavigator\.clipboard\.readText\(\)/);
  });

  it('读不到时进入等待粘贴态：文档捕获阶段挂一次性 paste 监听 + 15s 自动解除', () => {
    expect(sheet).toContain("document.addEventListener('paste',onDocumentPaste,true)");
    expect(sheet).toContain('setTimeout(stopPasteWatch,15000)');
    expect(sheet).toContain('awaitingPaste.value=true');
  });

  it('兜底粘贴要拆分成三段并退出等待态（不能只把文本塞进输入框）', () => {
    expect(sheet).toMatch(/functiononDocumentPaste\(event\)\{[\s\S]*?applyAddressText\(text\)/);
    expect(sheet).toContain("form.pasteText=ok?'':text");
    expect(sheet).toMatch(/applyAddressText\(text\);[\s\S]*?stopPasteWatch\(\)/);
  });

  it('粘贴监听必须能被收回：关选择层、组件卸载都要 stopPasteWatch', () => {
    expect(sheet).toMatch(
      /constclosePicker=\(\)=>\{pickerOpen\.value=false;stopPasteWatch\(\);?\}/,
    );
    expect(sheet).toMatch(/onBeforeUnmount\(\(\)=>\{[^}]*stopPasteWatch\(\)/);
    expect(sheet).toMatch(
      /functionstopPasteWatch\(\)\{[\s\S]*?removeEventListener\('paste',onDocumentPaste,true\)/,
    );
  });

  it('等待态有可见反馈：按钮描边走品牌色（否则用户不知道「点了在等什么」）', () => {
    expect(sheet).toContain(':class="{\'is-awaiting\':awaitingPaste}"');
    expect(sheet).toMatch(/\.ck-paste-btn\.is-awaiting\{[^}]*border-color/);
  });
});

/**
 * 结果页话术契约（2026-11-03 定「不说支付成功」，2026-11-04 补「含现金要说待付」）：
 * 现金部分是管理员线下收的，说「支付成功」是事实性误导；而只写「订单已提交」
 * 也漏了半句 —— 用户不知道自己还欠一笔钱、以及谁来收。
 */
describe('下单结果页话术', () => {
  const modal = compact(read('src/views/Shop/ShopPaymentSuccessModal.vue'));

  it('标题与卡片背面都不许再出现「支付成功」', () => {
    // 标题按是否含现金分两档：纯积分「礼物已提交」，含现金「礼物已提交，还差一步」
    expect(modal).toContain('id="payment-success-title"');
    expect(modal).toContain("'礼物已提交，还差一步'");
    expect(modal).not.toContain('<strong>支付成功</strong>');
  });

  it('订单号完整显示并带复制入口（截断的单号没法报给管理员）', () => {
    expect(modal).toContain('class="payment-success-copy-btn"');
    expect(modal).toMatch(/\.payment-success-orderno\{[^}]*white-space:normal/);
  });

  it('两个出口：查看订单 + 继续逛逛（只留「完成」等于把用户扔回商品列表）', () => {
    expect(modal).toContain('@click="$emit(\'view-orders\')"');
    expect(modal).toContain('@click="$emit(\'continue\')"');
  });
});

/**
 * 动效契约（2026-11-03 用户口径「打开关闭任何操作都要有动画，不要硬切」）：
 * 每个会整块出现/消失的层都必须包在 Transition 里，且都要有减少动态的兜底。
 * 这些一旦被删，功能不会坏 —— 只会"啪"地一下换掉，所以用源码契约钉住。
 */
describe('交互动效契约：不许硬切', () => {
  const sheet = compact(read('src/views/Shop/CheckoutSheet.vue'));
  const bag = compact(read('src/views/Shop/BagPanel.vue'));
  const order = compact(read('src/views/Shop/OrderDetailSheet.vue'));

  it('确认礼物整页有进出场（竖屏从右推进来）', () => {
    expect(sheet).toContain('<Transitionname="ck">');
    expect(sheet).toMatch(/\.ck-enter-from\.ck-sheet,[^{]*\{transform:translateX\(100%\)/);
  });

  it('地址选择层与「列表 ⇄ 表单」切换都有过渡', () => {
    expect(sheet).toContain('<Transitionname="ck-layer">');
    expect(sheet).toContain('<Transitionname="ck-step"mode="out-in">');
  });

  it('移除失效商品时商品行淡出 + 其余行归位（TransitionGroup）', () => {
    expect(sheet).toContain('<TransitionGrouptag="ul"name="ck-line"');
    expect(sheet).toMatch(/\.ck-line-move\{transition:transform/);
  });

  it('购物袋结算条的出现/消失有过渡', () => {
    expect(bag).toContain('<Transitionname="bag-foot">');
    expect(bag).toMatch(/\.bag-foot-enter-from,[^{]*\{opacity:0/);
  });

  it('订单详情补了离场（进场原本就有 od-slide-up）', () => {
    expect(order).toContain('<Transitionname="od">');
    expect(order).toMatch(/\.od-leave-to\.od-sheet\{transform:translateY\(4%\)/);
  });

  it('每处过渡都尊重 prefers-reduced-motion', () => {
    expect(sheet).toMatch(
      /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?transition-duration:1ms/,
    );
    expect(bag).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?transition-duration:1ms/);
    expect(order).toMatch(
      /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?transition-duration:1ms/,
    );
  });
});
