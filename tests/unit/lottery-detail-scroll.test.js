import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* 抽奖详情竖屏（2026-11-02 用户口径「滚动的时候把封面也可以滚上去，报名按钮
   始终固定在底部」）的三条结构契约。全部是 CSS 行为，JS 模拟不出来，只能锁源码：
   ① 竖屏滚动容器是整个 surface（封面在滚动流内）——不是内容区独立滚动；
   ② footer sticky 贴底（横屏分栏例外，static）；
   ③ 关闭键竖屏 fixed（封面滚走后仍可关闭）。
   反证：把①的 overflow-y:auto 删掉封面就钉死在顶部，③改回 absolute 关闭键会跟着
   封面滚走 —— 都会在这里红。 */

describe('LotteryDetailSheet 竖屏滚动结构', () => {
  const src = read('src/views/Shop/LotteryDetailSheet.vue');

  it('竖屏滚动容器是整个 surface（封面才可能跟着滚出去）', () => {
    const block = src.match(/\.is-portrait \.detail-surface \{[^}]+\}/);
    expect(block, '找不到竖屏 surface 规则块').toBeTruthy();
    expect(block[0]).toContain('overflow-y: auto');
    // 滚动容器换了，overscroll 兜底必须跟过去（内容区的 contain 不再兜住整页回弹）
    expect(block[0]).toContain('overscroll-behavior: contain');
  });

  it('报名按钮 sticky 贴底；横屏分栏保持 static', () => {
    /* `.surface-footer {` 出现多次（reduce/perf-lite 降级块里也有），取全部再断言 */
    const blocks = [...src.matchAll(/\.surface-footer \{[^}]+\}/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.some((b) => b.includes('position: sticky'))).toBe(true);
    expect(blocks.some((b) => b.includes('bottom: 0'))).toBe(true);
    const landscape = src.match(/\.is-landscape \.surface-footer \{[^}]+\}/);
    expect(landscape, '找不到横屏 footer 覆盖').toBeTruthy();
    expect(landscape[0]).toContain('position: static');
  });

  it('竖屏关闭键 fixed 在视口上（不随封面滚走）', () => {
    const close = src.match(/\.is-portrait \.surface-close \{[^}]+\}/);
    expect(close, '找不到竖屏关闭键规则块').toBeTruthy();
    expect(close[0]).toContain('position: fixed');
    // 刘海屏：fixed 的 top 必须带 safe-area，否则全屏设备上按钮顶进挖孔区
    expect(close[0]).toContain('safe-area-inset-top');
  });

  it('入场动画的时长/步长/封顶只读 --motion-* token，不写第二份毫秒数', () => {
    expect(src).toContain('var(--motion-enter,');
    expect(src).toContain('var(--motion-stagger,');
    expect(src).toContain('var(--motion-stagger-max,');
  });

  it('reduce-motion 与 perf-lite 两档降级都在（动效不许对两种用户硬跑）', () => {
    expect(src).toContain('@media (prefers-reduced-motion: reduce)');
    expect(src).toContain('html.boh-perf-lite .surface-footer');
  });
});
