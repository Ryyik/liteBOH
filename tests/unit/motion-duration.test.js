import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collapseDuration, expandDuration } from '../../src/utils/motion.js';

// plans/035 §4 L4：评论区展开/收起的时长必须**跟着内容高度走**。
// 这里锁三件纯函数性质 + 一条源码守卫，真实布局交给探针
// （scripts/probes/probe-forum-motion.mjs 断言"短评/长评耗时差 ≥90ms"）。
//
// 2026-10-31 二改：整体节奏由「慢速」档降到**标准**档
// （用户原话「动画速度都改成标准吧」），档位随 tokens.css 的 --motion-* 同步。

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

describe('展开时长：跟着高度走', () => {
  it('短评取档位下沿 200ms —— 不再因为"目标 1200px"在 37ms 内冲完', () => {
    expect(expandDuration(0)).toBe(200);
    expect(expandDuration(60)).toBe(200);
    expect(expandDuration(120)).toBe(200);
  });

  it('长评按 130 + h×0.36 递增（900px → 454ms）', () => {
    expect(expandDuration(900)).toBe(454);
  });

  it('上沿封顶 460ms：再长的楼中楼也不无限拖', () => {
    expect(expandDuration(2000)).toBe(460);
    expect(expandDuration(99999)).toBe(460);
  });

  it('单调不减：内容越高走得越久', () => {
    const heights = [0, 80, 160, 320, 480, 720, 1200];
    const durations = heights.map((h) => expandDuration(h));
    for (let i = 1; i < durations.length; i += 1) {
      expect(durations[i]).toBeGreaterThanOrEqual(durations[i - 1]);
    }
    // 首尾必须真的拉开差距，否则"按高度算"就是空话
    expect(durations[durations.length - 1] - durations[0]).toBeGreaterThanOrEqual(220);
  });

  it('异常输入不炸：负数 / NaN / 非数字一律归到下沿', () => {
    expect(expandDuration(-100)).toBe(200);
    expect(expandDuration(Number.NaN)).toBe(200);
    expect(expandDuration('abc')).toBe(200);
    expect(expandDuration(null)).toBe(200);
  });
});

describe('收起时长：恒快于展开', () => {
  it('同一高度下收<开（关闭不耐等，iOS 口径约 1.33:1）', () => {
    for (const h of [0, 120, 400, 900, 2000]) {
      expect(collapseDuration(h)).toBeLessThan(expandDuration(h));
    }
  });

  it('上沿 320ms / 下沿 150ms', () => {
    expect(collapseDuration(0)).toBe(150);
    expect(collapseDuration(99999)).toBe(320);
  });
});

describe('节奏档：tokens.css 与消费方的兜底值必须同档', () => {
  const tokens = read('src/styles/common/tokens.css');

  it('标准档 ladder（慢速档 640/480 不许回潮）', () => {
    expect(tokens).toMatch(/--motion-morph-in:\s*460ms/);
    expect(tokens).toMatch(/--motion-morph-in-near:\s*380ms/);
    expect(tokens).toMatch(/--motion-morph-out:\s*340ms/);
    expect(tokens).toMatch(/--motion-enter:\s*320ms/);
    expect(tokens).toMatch(/--motion-exit:\s*240ms/);
  });

  it('形变专用曲线 --ease-morph 已声明（drawer 曲线会让入场"一闪而过"）', () => {
    expect(tokens).toMatch(/--ease-morph:\s*cubic-bezier\(0\.3,\s*0\.12,\s*0\.15,\s*1\)/);
  });

  it('详情入场的拐点必须是 0.2（0.45 = 亮起来时已长完了）', () => {
    const main = read('src/views/PostDetail/PostDetailMain.vue');
    expect(main).toMatch(/\{ opacity: 1, offset: 0\.2 \}/);
    expect(main).toMatch(/motionEase\('--ease-morph'\)/);
  });
});

describe('源码守卫：旧实现不许回潮', () => {
  const card = read('src/views/Forum/components/PostCard.vue');
  const feed = read('src/views/Forum/styles/feed.css');

  it('评论区展开改由 JS 驱动（:css="false" + onRepliesEnter）', () => {
    // 用正则而不是连续子串：lint-staged 会重排属性，写死空格会假红
    expect(card).toMatch(/<transition[^>]*:css="false"[^>]*@enter="onRepliesEnter"/);
  });

  it('feed.css 里不再有 expand-replies 的固定 max-height 过渡', () => {
    expect(feed).not.toMatch(/\.expand-replies-enter-active/);
  });

  it('回复框不再用 fade-slide（从上方 -10px 落下，方向是反的）', () => {
    expect(card).not.toMatch(/<transition[^>]*name="fade-slide"/);
  });
});
