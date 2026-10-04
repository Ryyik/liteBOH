import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/**
 * 他人主页（/profile/:username → ProfileMain.vue）作品格模板的作用域守卫。
 *
 * 拿真事故换来的（2026-10-03 报障「打开别人的主页会报错」）：
 *   作品格列表的 v-for 别名是 `item`（元素形如 { key, kind, date, post?, card? }），
 *   但 `v-else` 那一支的 article 里通篇写的是裸 `post.*` —— 模板里**根本没有** post 这个绑定
 *   （唯一叫 post 的 v-for 在「代表作置顶」那段，作用域不覆盖这里）。
 *   编译成 `_ctx.post` 后取值为 undefined，渲染时先求值 :class 的 `post.images?.length`，
 *   于是整页抛 "undefined is not an object (evaluating 'e.post.images')"，
 *   兜底 UI 显示「页面出了点问题」，他人主页完全打不开。
 *
 * 为什么必须用「区域 + 前缀」断言而不是全文 toContain：
 *   全文里**合法**存在 `post.id` / `post.title`（代表作置顶的 `v-for="post in showcasePosts"`），
 *   直接对全文做否定断言会假红。所以先切出作品格那一段，再要求该段内的 post 访问全部带 item. 前缀。
 */
describe('ProfileMain 作品格模板：post 访问必须走 item.post（2026-10-03 事故防回退）', () => {
  const template = () => read('src/views/Profile/ProfileMain.vue').split('<script')[0];

  /**
   * 作品格那一段：从 `v-else class="profile-post-grid"` 到「加载更多」之前。
   * ⚠️ 锚点必须带上 `v-else`：文件里还有一处更早的 `class="profile-post-grid"`（另一个区块），
   * 用它当起点会把「代表作置顶」段（合法的 `v-for="post in showcasePosts"`）一起圈进来 → 假红。
   */
  const workGrid = () => {
    const tpl = template();
    const start = tpl.indexOf('v-else class="profile-post-grid"');
    const end = tpl.indexOf('list-load-more-wrap');
    expect(start, '未找到作品格的 v-else .profile-post-grid').toBeGreaterThan(-1);
    expect(end, '未找到 list-load-more-wrap（切片终点）').toBeGreaterThan(start);
    return tpl.slice(start, end);
  };

  it('作品格段内不存在裸 post.*（必须写成 item.post.*）', () => {
    // `[^.\w]` 排除 item.post.xxx / myPost.xxx；裸 `post.` 前面只可能是 `!` `(` `{` 空格之类。
    expect(workGrid()).not.toMatch(/(^|[^.\w])post\./);
  });

  it('帖子卡仍按 item.post 取图与标题（正面锚点，防「删干净了但也删没了」）', () => {
    const grid = workGrid();
    expect(grid).toContain('item.post.images?.length');
    expect(grid).toContain('item.post.title');
    expect(grid).toContain('navigateToPost(item.post.id)');
  });

  it('笔记卡与帖子卡分别走 item.card / item.post 两条分支', () => {
    const grid = workGrid();
    expect(grid).toContain("item.kind === 'note'");
    expect(grid).toContain('item.card');
    expect(grid).toContain('item.post');
  });
});
