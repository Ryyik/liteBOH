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
    expect(src).toContain('name="boh-pop"');
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

  it('定制只开 maxWidth / #head / flush / portraitPage 四个口子', () => {
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
