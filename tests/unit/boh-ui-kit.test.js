/**
 * Boh UI Kit 第一批（plans/045 阶段 0 + 首批组件）防回归锁。
 *
 * 测试环境是 node（本仓不挂载组件，见 tests/unit/scroll-stage.test.js 头注）：
 *   · boh-toast-controller 走**纯函数行为测试**（fake timers 驱动状态机）；
 *   · BohButton / BohModal / motion.css / tokens.css 走**源码守卫**（读源码断言约定），
 *     逐字断言一律经过 helpers/source.js 的归一工具（prettier 会重排源码）。
 *
 * 守卫三条主线：
 *   ① 语义色层单源 —— 组件不得写死 hex（6 位）与毫秒动画；
 *   ② 浮层安全件 —— BohModal 必须内置滚锁（useBodyScrollLock）+ 焦点陷阱
 *      （v-dialog-focus）+ Teleport + aria，少一件即红；
 *   ③ motion 预设 —— 预设类存在、reduced-motion 降级存在、不写死毫秒。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createToastController,
  DEFAULT_DURATION_MS,
  bohtoast,
} from '../../src/components/ui/boh-toast-controller.js';
import { squeezeSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

const buttonSrc = () => squeezeSource(stripComments(read('src/components/ui/BohButton.vue')));
const modalSrc = () => squeezeSource(stripComments(read('src/components/ui/BohModal.vue')));
const hostSrc = () => squeezeSource(stripComments(read('src/components/ui/BohToastHost.vue')));
const motionSrc = () => squeezeSource(stripComments(read('src/components/ui/motion.css')));

describe('boh-toast-controller · 状态机纯函数', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('show 入队并带自增 id', () => {
    const c = createToastController();
    const a = c.show('ok', '第一条');
    const b = c.show('err', '第二条');
    expect(a).not.toBe(b);
    expect(c.snapshot().length).toBe(2);
    expect(c.snapshot()[0].message).toBe('第一条');
  });

  it('非法语义回落为 info', () => {
    const c = createToastController();
    c.show('boom', 'x');
    expect(c.snapshot()[0].type).toBe('info');
  });

  it('到达停留时长自动出队', () => {
    const c = createToastController();
    c.show('ok', '会自动消失');
    expect(c.snapshot().length).toBe(1);
    vi.advanceTimersByTime(DEFAULT_DURATION_MS + 1);
    expect(c.snapshot().length).toBe(0);
  });

  it('dismiss 提前关且取消定时器（不重复触发）', () => {
    const c = createToastController();
    const id = c.show('warn', '手动关');
    expect(c.dismiss(id)).toBe(true);
    expect(c.dismiss(id)).toBe(false); // 幂等
    expect(c.snapshot().length).toBe(0);
    vi.advanceTimersByTime(DEFAULT_DURATION_MS + 1); // 已取消，不得报错
    expect(c.snapshot().length).toBe(0);
  });

  it('栈上限挤掉最旧的', () => {
    const c = createToastController({ maxStack: 3 });
    const ids = [
      c.show('info', '1'),
      c.show('info', '2'),
      c.show('info', '3'),
      c.show('info', '4'),
    ];
    expect(c.snapshot().length).toBe(3);
    expect(c.snapshot()[0].message).toBe('2'); // 「1」被挤掉
    expect(c.dismiss(ids[0])).toBe(false); // 被挤掉的已不在
  });

  it('subscribe 收到当前快照与后续变更', () => {
    const c = createToastController();
    const seen = [];
    const off = c.subscribe((list) => seen.push(list.length));
    expect(seen[0]).toBe(0); // 订阅即推快照
    c.show('ok', 'a');
    expect(seen[seen.length - 1]).toBe(1);
    off();
    c.show('ok', 'b');
    expect(seen.length).toBe(2); // 退订后不再推送
  });

  it('迁移别名归一：success/error/warning → ok/err/warn', () => {
    const c = createToastController();
    c.show('success', 'a');
    c.show('error', 'b');
    c.show('warning', 'c');
    expect(c.snapshot().map((t) => t.type)).toEqual(['ok', 'err', 'warn']);
  });

  it('sticky=true 不自动消失，dismiss 可手动关', () => {
    const c = createToastController();
    const id = c.show('error', '必须用户处理', { sticky: true });
    vi.advanceTimersByTime(DEFAULT_DURATION_MS * 10);
    expect(c.snapshot().length).toBe(1);
    expect(c.dismiss(id)).toBe(true);
  });

  it('action 透传给渲染层（label 收成字符串，run 透传）', () => {
    const c = createToastController();
    const run = vi.fn();
    c.show('info', '已删除', { action: { label: '撤销', run } });
    const item = c.snapshot()[0];
    expect(item.action).toEqual({ label: '撤销', run });
    c.show('info', '无动作');
    expect(c.snapshot()[1].action).toBeNull();
    c.show('info', 'label 缺失不算动作', { action: { run } });
    expect(c.snapshot()[2].action).toBeNull();
  });

  it('全站单例 bohtoast 存在且接口齐全', () => {
    expect(typeof bohtoast.show).toBe('function');
    expect(typeof bohtoast.dismiss).toBe('function');
    expect(typeof bohtoast.subscribe).toBe('function');
  });
});

describe('BohButton · 源码守卫', () => {
  it('四档权重类齐全', () => {
    const src = buttonSrc();
    for (const v of ['primary', 'secondary', 'ghost', 'danger']) {
      expect(src).toContain(`boh-btn--${v}`);
    }
  });

  it('不写死 6 位 hex / 毫秒动画（语义色层与 motion token 单源）', () => {
    const src = buttonSrc();
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src).not.toMatch(/\b\d+ms\b/);
    expect(src).toContain('var(--boh-accent)');
    expect(src).toContain('var(--duration-press)');
    expect(src).toContain('var(--ease-emphasized)');
  });

  it('loading 时 aria-busy 且阻断点击', () => {
    const src = buttonSrc();
    expect(src).toContain('aria-busy');
    expect(src).toContain('isBusy.value');
  });
});

describe('BohModal · 浮层安全件守卫', () => {
  it('Teleport + role=dialog + aria-modal 一个不少', () => {
    const src = modalSrc();
    expect(src).toContain('Teleport');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
  });

  it('滚动锁走 useBodyScrollLock（禁止直写 body.style.overflow）', () => {
    const src = modalSrc();
    expect(src).toContain('useBodyScrollLock');
    expect(src).not.toContain('body.style.overflow');
  });

  it('焦点陷阱走 v-dialog-focus（Esc/Tab/焦点归还内置）', () => {
    const src = modalSrc();
    expect(src).toContain('createDialogFocusTrapDirective');
    expect(src).toContain('v-dialog-focus');
  });

  it('动画走 motion.css 预设，遮罩材质读 --liquid-filter（不裸写 blur）', () => {
    const src = modalSrc();
    expect(src).toContain('name="boh-fade"');
    /* 面板预设 2026-11-24 起是**动态的**：默认 boh-pop，`morph` 宿主换成 boh-morph
       （见下面「第五个口子」那条）。所以这里断言「两种都在、且默认仍是 boh-pop」，
       而不是钉死一个静态字面量。 */
    expect(src).toContain(":name=\"morph ? 'boh-morph' : 'boh-pop'\"");
    expect(src).toMatch(/backdrop-filter:\s*var\(--liquid-filter/);
    expect(src).not.toMatch(/blur\(\d+px\)/);
    expect(src).not.toMatch(/\b\d+ms\b/);
  });

  it('层级只读 --boh-z-modal（组件里不写第二份数字）', () => {
    const src = modalSrc();
    expect(src).toContain('z-index: var(--boh-z-modal)');
    expect(src).not.toMatch(/z-index:\s*[0-9]{3,}/);
    const tokens = stripComments(read('src/styles/common/tokens.css'));
    const decl = tokens.match(/--boh-z-modal:\s*(\d+)/)?.[1];
    // 落在「详情层(2147482400)之上、图片查看器(2147483000)之下」这一格
    expect(Number(decl)).toBeGreaterThan(2147482400);
    expect(Number(decl)).toBeLessThan(2147483000);
  });

  it('定制只开 maxWidth / #head / flush / portraitPage / morph 五个口子', () => {
    const src = modalSrc();
    expect(src).toContain('maxWidth');
    expect(src).toContain('--boh-modal-max-w');
    expect(src).toContain('$slots.head');
    expect(src).toContain('boh-modal__body--flush');
    /* portraitPage 是第四个口子（2026-11-23 第四家族时开的），理由写在组件头：
       窄屏默认是贴底 Sheet，但 Shop 那一族（OrderDetail/AdminOrder/Checkout）的
       既定用户口径是「竖屏整页 = 翻到下一页」，靠 maxWidth/flush 都表达不了
       —— 形态是几何问题，只能由壳给变体。开这一个口子，后面三个同形态宿主不用各写一套。 */
    expect(src).toContain('portraitPage');
    expect(src).toContain('boh-modal__dialog--page');

    /* morph 是第五个口子（2026-11-24 C 类第一份时开的，plans/047）：
       C 类宿主（商品详情 / 抽奖详情）的进出场是**从被点卡片推开的形变**，不是淡入缩放。
       两者不能共存于同一个元素 —— CSS transitions 在级联里压过 animations，
       壳的 boh-pop 会把 WAAPI 形变整段吃掉（论坛详情 2026-10-31 实测）。
       所以壳必须能「让出面板的动画通道」，这是壳自己的职责，不该让每个宿主
       各自去写 transition-property: width 那种补丁。
       ⚠️ 这条口子只能解决「谁动面板」。几何（双列 / 封面区）仍然归宿主，
          见 plans/047 §3.3 —— 别把它扩成一堆只服务一份的几何口子。 */
    expect(src).toContain('morph');
    expect(src).toContain('boh-morph');
    // 形变要作用在壳的 dialog 上 ⇒ 壳必须把该元素暴露出去
    expect(src).toContain('dialogRef');
    expect(src).toContain('defineExpose');
  });
});

/* 首批试点（plans/045 阶段 2）：抽奖选择器从手写 Teleport+遮罩 迁到 BohModal。
   这条守卫锁的是「接线」：以后有人重写这块，不能悄悄长出第二套浮层壳。 */
describe('BohModal · 试点宿主接线（HeroConsole 抽奖选择器）', () => {
  const hostSrc = () => squeezeSource(stripComments(read('src/views/HeroConsole/index.vue')));
  const hostCss = () => stripComments(read('src/views/HeroConsole/style.scoped.css'));

  it('壳走 BohModal（自带 Teleport/遮罩/滚锁/焦点陷阱）', () => {
    const src = hostSrc();
    expect(src).toContain('BohModal');
    expect(src).toContain('v-model="lotteryPickerVisible"');
    expect(src).toContain('max-width="520px"');
    expect(src).toContain('flush');
  });

  it('旧壳类名与暗色补丁不再回来', () => {
    const html = hostSrc();
    expect(html).not.toContain('lottery-picker-overlay');
    expect(html).not.toContain('lottery-picker-modal');
    const css = hostCss();
    for (const legacy of [
      '.lottery-picker-overlay',
      '.lottery-picker-modal',
      '.lottery-picker-header',
    ]) {
      expect(css).not.toContain(legacy);
    }
  });
});

/* 第二家族（Shop 规格面板）：同一套壳，但用 #head / #footer 槽保住 kicker + 双按钮底栏。
   守卫同样只锁「接线」，不锁排版细节。 */
describe('BohModal · 商城规格面板接线（ProductSpecsSheet）', () => {
  const src = () => squeezeSource(stripComments(read('src/views/Shop/ProductSpecsSheet.vue')));

  it('壳走 BohModal，头部与底栏走槽位', () => {
    const code = src();
    expect(code).toContain('BohModal');
    expect(code).toContain('v-model="modalOpen"');
    expect(code).toContain('max-width="560px"');
    expect(code).toContain('template #head');
    expect(code).toContain('template #footer');
  });

  it('关闭统一走 requestClose（saving 闸门只此一处）', () => {
    const code = src();
    expect(code).toContain('const modalOpen = computed');
    expect(code).toContain('requestClose');
    // 组件级 Esc 监听已交给焦点陷阱，别再手写一份
    expect(code).not.toContain("addEventListener('keydown'");
  });

  it('旧壳（Teleport/遮罩/panel/过渡名）不再回来', () => {
    const code = src();
    expect(code).not.toContain('Teleport');
    expect(code).not.toContain('specs-root');
    expect(code).not.toContain('specs-panel');
    expect(code).not.toContain('specs-sheet-enter');
  });
});

/* 第三家族（Shop 商品设置面板）：与规格面板同源，同一套壳 + 两个动作按钮槽。 */
describe('BohModal · 商城商品设置面板接线（ProductEditSheet）', () => {
  const src = () => squeezeSource(stripComments(read('src/views/Shop/ProductEditSheet.vue')));

  it('壳走 BohModal，头部与底栏走槽位', () => {
    const code = src();
    expect(code).toContain('BohModal');
    expect(code).toContain('v-model="modalOpen"');
    expect(code).toContain('max-width="600px"');
    expect(code).toContain('template #head');
    expect(code).toContain('template #footer');
  });

  it('关闭统一走 requestClose（saving 闸门只此一处）', () => {
    const code = src();
    expect(code).toContain('const modalOpen = computed');
    expect(code).toContain('requestClose');
    // 组件级 Esc 监听已交给焦点陷阱，别再手写一份
    expect(code).not.toContain("addEventListener('keydown'");
  });

  it('旧壳（Teleport/根/面板/过渡名）不再回来', () => {
    const code = src();
    expect(code).not.toContain('Teleport');
    expect(code).not.toContain('pes-root');
    expect(code).not.toContain('pes-panel');
    expect(code).not.toContain('pes-enter');
  });
});

/* 第四家族（Shop 订单管理）：首个用 portraitPage 的宿主，也是「竖屏整页」这一族的样板。 */
describe('BohModal · 商城订单管理接线（AdminOrderSheet）', () => {
  const src = () => squeezeSource(stripComments(read('src/views/Shop/AdminOrderSheet.vue')));

  it('壳走 BohModal，头部与筛选条走 #head 槽', () => {
    const code = src();
    expect(code).toContain('BohModal');
    expect(code).toContain('v-model="modalOpen"');
    expect(code).toContain('max-width="720px"');
    expect(code).toContain('template #head');
    // flush 让滚动交给壳的 body，列表自己只管内衬
    expect(code).toContain('flush');
  });

  it('竖屏整页形态靠 portraitPage（形态是用户口径，不许悄悄退化成贴底 Sheet）', () => {
    expect(src()).toContain('portrait-page');
  });

  /* 商城域 token 不能丢：本组件 Teleport 到 body、不在 .store-page 里，
     只能靠自带 `shop-sheet-tokens` 拿到 store-tokens.css 的暗色档。
     丢了的表现是卡片比页面更暗（层次反了），探针 F3 抓这个 —— 这里再加一道源码锁，
     免得有人「清理无用类名」时凭感觉删掉它。 */
  it('自带 shop-sheet-tokens（商城域 token 不靠祖先继承）', () => {
    expect(src()).toContain('shop-sheet-tokens');
  });

  /* 列表区必须用次级底：整页形态若把页面色一路铺到底，亮色下页面 #fff + 白卡 #fff
     ⇒ 卡片边界消失（实测一片纯白）。头部/筛选条用页面色、列表用 --boh-bg-secondary，
     与迁移前「白头部 + 浅灰列表」一致。探针 C11 锁视觉值，这里锁源码口径。 */
  it('列表区走次级底（卡片才浮得起来）', () => {
    const code = src();
    const bodyBlock = code.slice(code.indexOf('.ao-body'));
    expect(bodyBlock).toContain('--boh-bg-secondary');
  });

  it('关闭统一走 requestClose，Esc/滚锁交给壳', () => {
    const code = src();
    expect(code).toContain('const modalOpen = computed');
    expect(code).toContain('requestClose');
    expect(code).not.toContain("addEventListener('keydown'");
    // 滚锁是壳内置的同一份真源；再 import 一次就是双层引用计数
    expect(code).not.toContain('useBodyScrollLock');
  });

  it('旧手写外壳（Teleport/根/遮罩/面板/过渡名）不再回来', () => {
    const code = src();
    for (const legacy of [
      'Teleport',
      'ao-root',
      'ao-scrim',
      'ao-sheet',
      'name="ao"',
      'ao-enter-active',
    ]) {
      expect(code).not.toContain(legacy);
    }
  });
});

/* 第五家族（Shop 支付成功）：结构最特殊的一份 —— 卡片钉住、只有文字滚。
   2026-11-10 用户报障「结算动画全部飘到页面外面」，修法就是这条分区，
   迁壳时最容易被摊平成"整块一起滚"。 */
describe('BohModal · 商城支付成功接线（ShopPaymentSuccessModal）', () => {
  const src = () =>
    squeezeSource(stripComments(read('src/views/Shop/ShopPaymentSuccessModal.vue')));

  it('壳走 BohModal，钉住区走 #head 槽、文字走默认槽', () => {
    const code = src();
    expect(code).toContain('BohModal');
    expect(code).toContain('v-model="modalOpen"');
    expect(code).toContain('max-width="424px"');
    expect(code).toContain('template #head');
  });

  it('关闭钮在 #head 槽内（不能靠 absolute 挂在滚动容器上）', () => {
    const code = src();
    const headBlock = code.slice(
      code.indexOf('template #head'),
      code.indexOf('payment-success-body'),
    );
    expect(headBlock).toContain('payment-success-close');
    // 卡片（动画本体）也必须钉住
    expect(headBlock).toContain('payment-card-scene');
  });

  it('两个槽各自挂 shop-sheet-tokens（兄弟节点不继承）', () => {
    /* ⚠️ 不能数裸词出现次数：CSS/模板注释里也会提到 `.shop-sheet-tokens`
       （"为什么必须挂这里"的说明），数词会让断言在真删掉类名后依然满足 —— 假绿。
       只认 class 属性里的实际挂载。 */
    const code = src();
    expect(code).toContain('class="payment-success-head shop-sheet-tokens"');
    expect(code).toContain('class="payment-success-body shop-sheet-tokens"');
  });

  it('标题/正文显式给基色（否则继承壳 body 的中灰）', () => {
    const code = src();
    expect(code).toContain('color: var(--boh-text-primary');
  });

  it('不点遮罩关闭（这是"已提交"确认态，误关会让人以为没成功）', () => {
    expect(src()).toContain(':close-on-backdrop="false"');
  });

  it('旧手写外壳与过渡不再回来', () => {
    const code = src();
    for (const legacy of [
      'Teleport',
      'payment-success-overlay',
      'payment-success-dialog',
      'payment-success-enter-active',
    ]) {
      expect(code).not.toContain(legacy);
    }
  });
});

/* 第六家族（Shop 订单详情）：B 类最后一份，也是第二个 portraitPage 宿主。
   它和第一家族（AdminOrderSheet）是"同一形态、不同内容"的两端：
   前者管理台表格、后者用户看的进度时间线，迁完这两份摸清了整族的边界。 */
describe('BohModal · 商城订单详情接线（OrderDetailSheet）', () => {
  const src = () => squeezeSource(stripComments(read('src/views/Shop/OrderDetailSheet.vue')));

  it('壳走 BohModal，头部走 #head 槽、动作区走 #footer 槽', () => {
    const code = src();
    expect(code).toContain('BohModal');
    expect(code).toContain('v-model="modalOpen"');
    expect(code).toContain('max-width="560px"');
    expect(code).toContain('portrait-page');
    expect(code).toContain('template #head');
    expect(code).toContain('template v-if="canCancel || adminNextStatus" #footer');
  });

  /* 三个槽（head / 默认 / footer）都是**兄弟节点**，token 只能各自继承。
     只挂一处的话另外两处会回落成全站暗色 —— 卡片比页面底更暗、层次反向。
     不能数裸词（注释里也写了类名），只认 class 属性的实际挂载。 */
  it('头部 / 正文 / 动作区各自挂 shop-sheet-tokens（兄弟节点不继承）', () => {
    const code = src();
    expect(code).toContain('class="od-head shop-sheet-tokens"');
    expect(code).toContain('class="od-body shop-sheet-tokens"');
    expect(code).toContain('class="od-foot shop-sheet-tokens"');
  });

  it('关闭统一走 requestClose，Esc/滚锁交给壳', () => {
    const code = src();
    expect(code).toContain('const modalOpen = computed');
    expect(code).toContain('requestClose');
    // 壳的焦点陷阱负责 Esc（且带 stopPropagation，不误关外层）
    expect(code).not.toContain("addEventListener('keydown'");
    // 滚锁是壳内置的同一份真源；再 import 一次就是双层引用计数
    expect(code).not.toContain('useBodyScrollLock');
  });

  /* 内容区自己再写 overflow-y:auto 会变成双层滚动：竖屏整页滑动时先滚内层、
     滚到底才带动外层（手感是断的）。滚动必须只归壳的 body。 */
  it('内容区不自己滚（滚动只归壳的 body）', () => {
    const code = src();
    const bodyBlock = code.slice(code.indexOf('.od-body {'), code.indexOf('.od-status {'));
    expect(bodyBlock).toContain('padding');
    expect(bodyBlock).not.toContain('overflow-y');
  });

  it('旧手写外壳（Teleport/遮罩/面板/过渡名/keyframes）不再回来', () => {
    const code = src();
    for (const legacy of [
      'Teleport',
      'od-overlay',
      'od-sheet',
      'od-slide-up',
      'od-fade-in',
      'od-leave-active',
      'name="od"',
    ]) {
      expect(code).not.toContain(legacy);
    }
  });
});

describe('BohModal · morph 第五个口子（形变进出场，plans/047）', () => {
  const src = () => squeezeSource(stripComments(read('src/components/ui/BohModal.vue')));
  const motion = () => stripComments(read('src/components/ui/motion.css'));

  /* morph 为真时壳**不能**再挂自己的进场预设：boh-pop 的 transition 里带
     transform，CSS transitions 在层叠里排最后一档、压过 WAAPI —— 形变会整段
     失效且没有任何报错（只看到淡入）。所以过渡名必须二选一。 */
  it('morph 不挂 boh-pop（否则 CSS 过渡压掉形变）', () => {
    const code = src();
    expect(code).toContain("morph ? 'boh-morph' : 'boh-pop'");
  });

  /* morph 需要一条「只声明时长、不动 clip-path/opacity」的预设：
     Vue 靠它算离场时长（否则节点下一帧就摘掉、形变跑不到一半），
     但不能真的去动形变的通道。 */
  it('morph 走独立预设 boh-morph（只声明时长，不动 opacity/transform）', () => {
    const css = motion();
    const from = css.indexOf('.boh-morph-enter-active');
    const to = css.indexOf('.boh-slide-up-enter-active');
    expect(from).toBeGreaterThan(0);
    const block = css.slice(from, to > from ? to : undefined);
    /* ⚠️ 不许写死毫秒：motion 预设层一律读 token，缺 token 应视为错误
       （本文件头部第 ① 条纪律，单测逐个扫 `\d+ms`）。 */
    expect(block).not.toMatch(/\b\d+ms\b/);
    expect(block).toContain('var(--motion-morph');
    // 不许把形变自己的通道抢回来
    expect(block).not.toContain('opacity');
    expect(block).not.toContain('transform');
  });

  /* morph 下 dialog 只是定位容器。一旦它还画着玻璃底/边框/圆角/阴影，
     就会与宿主面板叠成双层外壳，形变缩回时两块一起缩。 */
  it('morph 模式把 dialog 的装饰全部摘掉', () => {
    const code = src();
    expect(code).toContain("'boh-modal__dialog--morph': morph");
    const block = code.slice(
      code.indexOf('.boh-modal__dialog--morph {'),
      code.indexOf('.boh-modal__dialog--morph.boh-modal__dialog--page'),
    );
    expect(block.length).toBeGreaterThan(0);
    for (const decl of ['background: none', 'border: 0', 'border-radius: 0', 'box-shadow: none']) {
      expect(block).toContain(decl);
    }
  });

  /* morph 下壳不许渲染自己的 header：即使 title 为空，showClose 默认 true 也会
     渲染出一个 52px 的空头把面板撑高（实测 dialog 904 vs 面板 852）。 */
  it('morph 模式不渲染默认 header', () => {
    const code = src();
    expect(code).toMatch(/v-else-if="!morph && \(title \|\| showClose\)"/);
  });

  it('壳把 dialog 元素 expose 给宿主（形变要作用在它上面）', () => {
    const code = src();
    expect(code).toMatch(/defineExpose\(\{\s*dialogRef\s*\}\)/);
  });
});

describe('BohModal · portraitPage 变体的几何契约', () => {
  it('断点走 orientation（与 Shop 九份弹层既有口径一致，不是宽度）', () => {
    const css = stripComments(read('src/components/ui/BohModal.vue'));
    const pageBlock = css.slice(css.indexOf('boh-modal__overlay--page'));
    // 整页变体必须挂在 orientation: portrait 里；用 max-width 断点会让
    // 900×1200 的竖屏平板退化成居中弹窗（属行为变化）
    expect(css).toContain('@media (orientation: portrait)');
    expect(pageBlock).toContain('height: 100%');
    expect(pageBlock).toContain('border-radius: 0');
  });

  it('整页不糊底层：不透明页面色 + 不跑全屏 backdrop-filter', () => {
    const css = stripComments(read('src/components/ui/BohModal.vue'));
    const dialogPage = css.slice(css.indexOf('.boh-modal__dialog--page'), css.indexOf('/* 窄屏'));
    expect(dialogPage).toContain('--boh-page-bg');
    expect(dialogPage).toContain('backdrop-filter: none');
  });

  it('整页下 grab 条消失（不是"浮一层"心智）', () => {
    const css = stripComments(read('src/components/ui/BohModal.vue'));
    expect(css).toMatch(/\.boh-modal__dialog--page\s+\.boh-modal__grab\s*\{\s*display:\s*none/);
  });
});

/* BohDropdown（组件 13）：首个真实宿主是 Messages 的筛选下拉。
   几何本身由 boh-dropdown-position.test.js 做行为测试，这里只锁"组件契约"——
   哪些能力必须内置、哪些刻意不做（下拉不是模态）。 */
describe('BohDropdown · 组件契约', () => {
  const src = () => squeezeSource(stripComments(read('src/components/ui/BohDropdown.vue')));

  it('内置外点关闭 + Esc 关闭，且都只在打开时挂监听', () => {
    const code = src();
    expect(code).toContain('pointerdown');
    expect(code).toContain('Escape');
    expect(code).toContain('startListeners');
    expect(code).toContain('stopListeners');
  });

  it('刻意不做焦点陷阱 / 不锁滚动（下拉不是模态，Tab 要能正常走出去）', () => {
    const code = src();
    expect(code).not.toContain('useBodyScrollLock');
    expect(code).not.toContain('v-dialog-focus');
  });

  it('焦点归还走 after-leave 且聚焦包裹层内真实可聚焦元素', () => {
    const code = src();
    /* 🔴 这条抓过两个坑：① 归还写在 emit 之后 → 面板已移除、判定恒 false；
       ② 直接 focus 包裹层 <span> → span 不可聚焦、focus 静默无效。
       所以三样必须在：after-leave 钩子、pendingFocusReturn 标记、querySelector 找真实控件。 */
    expect(code).toContain('after-leave');
    expect(code).toContain('pendingFocusReturn');
    expect(code).toContain('querySelector(');
    expect(code).toContain('button');
  });

  it('指示器可露出：面板不裁切，滚动在内层', () => {
    const code = src();
    expect(code).toContain('boh-dropdown__scroll');
    expect(code).toContain('overflow: visible');
  });

  it('定位交给纯函数，不在这里写死几何', () => {
    const code = src();
    expect(code).toContain('computeDropdownPosition');
    expect(code).not.toMatch(/window\.innerWidth\s*[-+]/);
  });

  it('层级读 --boh-z-modal（不在组件里写死数字）', () => {
    expect(src()).toContain('z-index: var(--boh-z-modal)');
  });

  it('出入场走 motion 预设，不自己写毫秒', () => {
    const code = src();
    expect(code).toContain("'./motion.css'");
    expect(code).toContain('name="boh-pop"');
    // 组件内不得出现裸毫秒时长（transition 一律读 token）
    expect(code).not.toMatch(/transition:[^;]*\d+ms/);
  });
});

describe('BohToastHost · 渲染层守卫', () => {
  it('消费单例 bohtoast + aria-live + TransitionGroup 预设', () => {
    const src = hostSrc();
    expect(src).toContain('boh-toast-controller');
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('TransitionGroup');
    expect(src).toContain('name="boh-slide-up"');
  });

  it('不写死 6 位 hex / 毫秒', () => {
    const src = hostSrc();
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src).not.toMatch(/\b\d+ms\b/);
  });
});

describe('motion.css · 预设层守卫', () => {
  it('三组 Vue 过渡预设 + stagger 齐全', () => {
    const src = motionSrc();
    for (const name of [
      'boh-pop-enter-active',
      'boh-fade-enter-active',
      'boh-slide-up-enter-active',
      'boh-stagger-item',
    ]) {
      expect(src).toContain(name);
    }
  });

  it('不写死毫秒（时长全走 token），stagger 步长读 --motion-stagger', () => {
    const src = motionSrc();
    expect(src).not.toMatch(/\b\d+ms\b/);
    expect(src).toContain('var(--motion-stagger');
    expect(src).toContain('var(--duration-base)');
  });

  it('prefers-reduced-motion 降级存在', () => {
    expect(motionSrc()).toContain('prefers-reduced-motion');
  });
});

describe('tokens.css · 语义色层单源', () => {
  const tokensSrc = () => read('src/styles/common/tokens.css');

  it('语义五类 + accent-text 亮暗两套齐全', () => {
    const src = tokensSrc();
    for (const token of [
      '--boh-accent',
      '--boh-accent-text',
      '--boh-accent-strong',
      '--boh-accent-soft',
      '--boh-success',
      '--boh-warning',
      '--boh-danger',
      '--boh-info',
    ]) {
      expect(src).toContain(token);
    }
    // 暗色块：accent 压深值与彩字浅变体（对比度结论来自 demo 探针实测）
    expect(src).toContain('--boh-accent: #0a72da');
    expect(src).toContain('--boh-accent-text: #6cb0ff');
  });

  it('两套自定义主题有 accent 覆写（不落回默认蓝）', () => {
    const src = tokensSrc();
    expect(src).toContain('--boh-accent: #2f2f2f'); // home-cat
    expect(src).toContain('--boh-accent: #5f7d49'); // anniversary-mc
  });
});
