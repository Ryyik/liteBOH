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
 *    plans/051 批 3 起时间并入身份行（ReplyIdentityRow 的 :time 传参），
 *    顶层评论与楼中楼各有一处，且各自取自该行的 created_at；
 *    .comment-foot 只承担操作行（赞 / 回复 / 删除入口）。
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

  it('顶层评论与楼中楼都必须渲染时间，且时间取自各自行的 created_at（经身份行 :time 传入）', () => {
    const tpl = template();
    expect(tpl).toContain(':time="formatDate(reply.created_at)"');
    expect(tpl).toContain(':time="formatDate(child.created_at)"');
    // 旧的时间标签已并入身份行，不允许残留第二处渲染点
    expect(tpl.match(/class="comment-date"/g) || []).toHaveLength(0);
  });

  it('身份行（含时间）在操作行之前：先读到是谁·何时，再看到操作', () => {
    const tpl = template();
    // 每条评论行：身份行（:time → ReplyIdentityRow）在前，操作行（comment-foot）在后
    expect(tpl.match(/:time="formatDate\(/g) || []).toHaveLength(2);
    const identityAt = tpl.indexOf('<ReplyIdentityRow');
    const footAt = tpl.indexOf('class="comment-foot"');
    expect(identityAt).toBeGreaterThan(-1);
    expect(footAt).toBeGreaterThan(identityAt);
    // comment-foot 内只有操作（赞 / 回复 / 删除入口），不再有时间标签
    const chunks = tpl.split('class="comment-foot"').slice(1);
    expect(chunks).toHaveLength(2);
    chunks.forEach((chunk) => {
      expect(chunk.slice(0, 900)).not.toContain('comment-date');
    });
  });
});
