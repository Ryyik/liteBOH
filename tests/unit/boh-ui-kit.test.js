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
