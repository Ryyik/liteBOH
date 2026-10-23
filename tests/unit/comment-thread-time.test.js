import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

/**
 * CommentThread 的两条硬约束守卫。
 *
 * ① 定义顺序（2026-10-23 实测事故）：
 *    useTierMap 内部是 `watch(idsGetter, …, { immediate: true })`，**在 setup 期间同步**执行
 *    idsGetter → collectCommentAuthorIds → getChildReplyState。而 getChildReplyState 当时写在
 *    useTierMap 之后（const 的 TDZ）⇒ setup 抛 ReferenceError：
 *      · dev 下 Vue 会把错误 rethrow ⇒ 整个评论区渲染成空白（`共 N 条评论` 下面什么都没有）；
 *      · prod 下只 console.error ⇒ 评论区照常出现，但昵称等级配色永远不生效（静默失效）。
 *    这条断言只锁顺序，不锁实现细节 —— 谁把 getChildReplyState 挪回 useTierMap 后面，立刻红。
 *
 * ② 时间必须渲染（同日报障「评论区评论不显示时间」）：
 *    顶层评论与楼中楼各有一处时间；且时间与「赞 / 回复」同处 .comment-foot 一行
 *    （原先时间独占一个 meta 行，视觉上像一条孤立灰线，容易被读成「没有时间」）。
 */
describe('CommentThread：setup 定义顺序 + 评论时间渲染', () => {
  const source = () => read('src/views/PostDetail/components/CommentThread.vue');
  const template = () => source().split('<template>')[1].split('</template>')[0];
  const script = () => source().split('<script setup>')[1].split('</script>')[0];

  it('getChildReplyState 必须在 useTierMap 之前定义（否则 setup 期 TDZ 崩）', () => {
    const code = script();
    const childStateAt = code.indexOf('const getChildReplyState = ');
    const tierMapAt = code.indexOf('const commentTierMap = useTierMap(');

    expect(childStateAt).toBeGreaterThan(-1);
    expect(tierMapAt).toBeGreaterThan(-1);
    expect(childStateAt).toBeLessThan(tierMapAt);
  });

  it('顶层评论与楼中楼都必须渲染时间，且时间取自各自行的 created_at', () => {
    const tpl = template();
    expect(tpl).toContain('formatDate(reply.created_at)');
    expect(tpl).toContain('formatDate(child.created_at)');
    // 时间标签只该有这两处（新增渲染点必须同步补断言）
    expect(tpl.match(/class="comment-date"/g) || []).toHaveLength(2);
  });

  it('时间与赞/回复同处 .comment-foot 一行', () => {
    const tpl = template();
    const chunks = tpl.split('class="comment-foot"').slice(1);
    expect(chunks).toHaveLength(2);
    // 每段只取紧随其后的 600 字符窗口（该窗口内一定包含时间与操作行的开头），
    // 要求时间在左、操作在右 —— 只认结构顺序，不认文案。
    chunks.forEach((chunk) => {
      const window = chunk.slice(0, 600);
      expect(window).toContain('comment-date');
      expect(window).toContain('comment-actions');
      expect(window.indexOf('comment-date')).toBeLessThan(window.indexOf('comment-actions'));
    });
  });
});
