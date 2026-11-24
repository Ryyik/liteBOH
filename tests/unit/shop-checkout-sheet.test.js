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
/**
 * 只取 **`<template>` 段**并剥掉 HTML 注释后再 compact。
 * 为什么不用 `tests/helpers/source.js` 的 `stripComments`：它只剥 JS 的 `/* *\/`
 * 与 `//`，**不剥 `<!-- -->`，也不管 `<style>` 里的 CSS 注释**（plans/045 第六家族
 * 记过同一个坑）。本文件有几条「不许出现 X」的负断言，而 X 恰恰会被写在注释里
 * 解释「为什么删掉它」—— 模板注释和 style 注释都可能命中，所以两头都剥掉。
 */
const templateOnly = (vueSource) => {
  /* ⚠️ 两个坑叠在一起：
     ① 不能用 `indexOf('</template>')` 切 —— 模板内部有 `<template #head>` 这类
        **内层** template（结算把页头交给壳的 #head 槽），会切在第一个内层的收尾上，
        量到半截，负断言全部假绿；
     ② 也不能用 `lastIndexOf('</template>')` —— 那样会把 `<script>` 与 `<style>`
        一起圈进来，而它们里面正好写着「原来 .ck-enter-from 已删除」的注释，
        负断言会自己撞自己。
     正解：从 `<template>` 切到 `<script` / `<style` 的**最早出现处**为止。 */
  const start = vueSource.indexOf('<template>');
  const stops = ['<script', '<style'].map((t) => vueSource.indexOf(t)).filter((i) => i > start);
  const stop = stops.length ? Math.min(...stops) : vueSource.length;
  const tpl = start >= 0 ? vueSource.slice(start, stop) : '';
  return compact(tpl.replace(/<!--[\s\S]*?-->/g, ''));
};

describe('确认礼物页（CheckoutSheet）形态契约', () => {
  const sheet = compact(read('src/views/Shop/CheckoutSheet.vue'));

  /* 2026-11-24 迁壳（plans/045 C 类第三份 / plans/047 §8）：外框（整页/居中/遮罩/
     圆角/阴影/z-index/滚锁）全部归 BohModal，宿主只剩内部排版。
     判据从「宿主自己写 position:fixed + inset:0」改成**契约级**：
     宿主必须走壳、必须声明 portrait-page（竖屏整页）、必须给 max-width（横屏宽度）、
     必须给 max-height（横屏高度，壳默认 78vh 会裁掉底栏 46px）。
     迁移前那三条 `.ck-root{position:fixed` / `.ck-scrim` / `translate(-50%,-50%)`
     已全部失效 —— 留着它们只会让「谁负责形态」这个问题有两个答案。 */
  it('竖屏整页由壳的 portraitPage 承接（宿主不再自绘固定层）', () => {
    const tpl = templateOnly(read('src/views/Shop/CheckoutSheet.vue'));
    expect(tpl).toContain('<BohModal');
    expect(tpl).toContain('portrait-page');
    /* 负断言看模板：'ck-root' 这串字在 style 注释里出现过（说明已删） */
    expect(tpl).not.toContain('ck-root');
  });

  it('横屏几何两个口子都给：max-width（宽）+ max-height（高）', () => {
    /* max-height 是必须的：壳默认 min(78vh,720px)，844×390 下只有 304px，
       而结算需要 350px（min(620, 100vh-40)），少 46px 会把底部结算条裁掉。 */
    const tpl = templateOnly(read('src/views/Shop/CheckoutSheet.vue'));
    expect(tpl).toContain('max-width="880px"');
    expect(tpl).toContain(':max-height="shellMaxHeight"');
    expect(sheet).toMatch(/shellMaxHeight='min\(620px,calc\(100vh-40px\)\)'/);
  });

  it('遮罩归壳：宿主不再自带 scrim（竖屏整页本来就不该有）', () => {
    const tpl = templateOnly(read('src/views/Shop/CheckoutSheet.vue'));
    expect(tpl).not.toContain('ck-scrim');
    /* 壳默认 closeOnBackdrop=true；结算是关键路径，误点遮罩会丢掉当前订单 */
    expect(tpl).toContain(':close-on-backdrop="false"');
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

  /* 2026-11-24 迁壳：整页进出场归壳（竖屏 portraitPage / 横屏居中弹窗，壳统一
     boh-fade + boh-pop）。原来这条锁的是宿主自己的 `<Transition name="ck">` +
     `.ck-enter-from .ck-sheet{transform:translateX(100%)}`（竖屏从右推进）——
     迁壳后那两个类名不会再被任何元素匹配，断言留着就是「锁一段不跑的代码」。
     与上面「订单详情走 BohModal」那条同一口径：判据改成
     「宿主走壳 + 壳的 motion 预设真的覆盖了进出场」。 */
  it('确认礼物走 BohModal 的进出场预设（宿主不再自带 .ck- 进出场）', () => {
    /* 负断言只看模板段：那段「原来 .ck-enter-from 已删除」的说明写在 style 注释里，
       连 style 一起扫会自己撞自己（见 templateOnly 注释）。 */
    const tpl = templateOnly(read('src/views/Shop/CheckoutSheet.vue'));
    expect(tpl).toContain('<BohModal');
    expect(tpl).not.toContain('<Transitionname="ck">');
    expect(tpl).not.toContain('<Teleport');
    /* 面板内部的三层过渡仍然必须存在（它们没被壳接管） */
    expect(tpl).toContain('<Transitionname="ck-layer">');
    expect(tpl).toContain('<Transitionname="ck-step"mode="out-in">');
    const modal = read('src/components/ui/BohModal.vue');
    expect(modal).toContain('name="boh-fade"');
    expect(modal).toContain("morph ? 'boh-morph' : 'boh-pop'");
  });

  it('移除失效商品时商品行淡出 + 其余行归位（TransitionGroup）', () => {
    expect(sheet).toContain('<TransitionGrouptag="ul"name="ck-line"');
    expect(sheet).toMatch(/\.ck-line-move\{transition:transform/);
  });

  it('购物袋结算条的出现/消失有过渡', () => {
    expect(bag).toContain('<Transitionname="bag-foot">');
    expect(bag).toMatch(/\.bag-foot-enter-from,[^{]*\{opacity:0/);
  });

  /* 订单详情的进出场 2026-11-24 起归 BohModal（plans/045 阶段 2 第六家族）：
     原来这条锁的是宿主自己的 `od-slide-up` 进场 + `od-leave-to` 离场。
     迁壳后宿主不再持有过渡（写了也是死代码），判据改成
     「宿主走壳 + 壳的 motion 预设真的覆盖了进出场」。 */
  it('订单详情走 BohModal 的进出场预设（宿主不再自带过渡）', () => {
    expect(order).toContain('BohModal');
    expect(order).not.toContain('name="od"');
    const modal = read('src/components/ui/BohModal.vue');
    expect(modal).toContain('name="boh-fade"');
    /* 面板预设是二选一：默认 boh-pop（淡入缩放），形变宿主用 boh-morph
       （只声明时长、不动 transform/opacity，否则会压掉 WAAPI 形变）。
       判据从「字面写死 boh-pop」改成「默认分支仍是 boh-pop」—— 契约没变。 */
    expect(modal).toContain("morph ? 'boh-morph' : 'boh-pop'");
  });

  it('每处过渡都尊重 prefers-reduced-motion', () => {
    expect(sheet).toMatch(
      /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?transition-duration:1ms/,
    );
    expect(bag).toMatch(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?transition-duration:1ms/);
    /* 订单详情的过渡搬进壳之后，降级判据要落到壳的 motion.css 上 ——
       不能因为「宿主里没有了」就把这条删掉，那等于把无障碍要求一起丢了。 */
    const motion = read('src/components/ui/motion.css');
    expect(motion).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
