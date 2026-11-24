import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/source.js';

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

/**
 * 弹层形态已下线（2026-11-24，plans/047 §5 收尾）。
 *
 * 背景：本组件曾经有「周边页弹层」与「独立详情页」两种身份。但列表 2026-11-20
 * 就改成 `router.push` 跳 `/lottery/:id` 了，弹层形态**再没有任何宿主**：
 * `Teleport`、遮罩、`standalone` 分流、`acquireBodyScrollLock`、来源卡片形变
 * （`morphWindow` / `playOpen` / clip-path 退场）全都成了**任何路径都跑不到**的死代码。
 *
 * 为什么必须用测试钉住「不许回来」：
 *   ① 那批代码的失效方式是**静默**的 —— 形变没播，弹窗照常打开、内容全对，
 *      没有任何测试会红（`plans/047 §1` 记的就是这件事）；
 *   ② 更隐蔽的是 `captureOrigin`：列表侧采了来源矩形、详情侧没人消费，
 *      `motion-origin.js` 的 Map 会一直持有已卸载卡片的 DOM 引用，直到 TTL 或上限淘汰；
 *   ③ 删完后如果有人"顺手"把 Teleport / 遮罩加回来，功能仍然正常，
 *      只是又变成两套身份 —— 光看 diff 发现不了。
 *
 * ⚠️ 断言查的是**实现**而不是注释：文件头有一段解释性注释复述了这些名字
 *   （那是「为什么删」的记录，有价值），所以这里用剥注释后的正文判。
 */
describe('LotteryDetailSheet 只剩独立页一种身份', () => {
  /* ⚠️ `stripComments` 只剥 JS 注释（`/* *\/` 与 `//`），**不剥模板里的 `<!-- -->`**。
     这个坑本仓已经踩过一次（plans/045 第六家族：迁壳时把旧标识符逐字写进文件头注，
     否定断言被注释满足而假红）。这里既剥 JS 注也剥 HTML 注 ——
     注释正是记录「为什么删」的地方，不该让它们把守卫弄假红。 */
  const body = stripComments(read('src/views/Shop/LotteryDetailSheet.vue')).replace(
    /<!--[\s\S]*?-->/g,
    '',
  );
  /* ⚠️ 不能用 `indexOf('</template>')` 切：模板内部有 `<template v-if>` 片段
     （分享按钮的「已复制 / 分享」两套），会切在最内层那个，量到的是半截。 */
  const tplStart = body.indexOf('<template>');
  const tplEnd = body.lastIndexOf('</template>');
  const template = tplStart >= 0 && tplEnd > tplStart ? body.slice(tplStart, tplEnd) : '';

  it('模板取到了（切片失败会让下面几条假绿）', () => {
    expect(template.length).toBeGreaterThan(500);
    expect(template).toContain('detail-surface');
  });

  it('不再有 Teleport / 遮罩（路由页不叠在别人上面）', () => {
    expect(template).not.toContain('Teleport');
    expect(template).not.toContain('detail-scrim');
    expect(body).not.toMatch(/\.detail-scrim\s*\{/);
  });

  it('不再有 standalone 双身份开关', () => {
    expect(body).not.toContain('standalone');
    expect(body).not.toContain('is-standalone');
  });

  it('不再有形变（无来源卡片可推）', () => {
    for (const legacy of ['animateMorph', 'peekOrigin', 'insetFromRect', 'clipPath', 'originKey']) {
      expect(body, `${legacy} 不该再出现`).not.toContain(legacy);
    }
  });

  it('不再自己锁 body 滚动（路由页锁了反而让 iOS 回弹异常）', () => {
    expect(body).not.toContain('acquireBodyScrollLock');
    expect(body).not.toContain('useBodyScrollLock');
  });

  it('根元素自己铺底色（原来这活是遮罩层干的）', () => {
    const root = body.match(/\.detail-root \{[^}]+\}/);
    expect(root, '找不到 .detail-root 规则块').toBeTruthy();
    expect(root[0]).toContain('background:');
  });
});
