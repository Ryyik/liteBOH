import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

/* plans/035 复核（2026-10-31）：评论区展开动画的「该不该播」判据。
 *
 * 旧实现是 `let skipRepliesEnter = props.isExpanded`（setup 求值一次）。
 * 那个前提是错的：两个 `<transition>` 都没有 `appear`，初始渲染时 `v-if` 已为真
 * Vue 根本不调 `@enter` —— 于是这个标志在挂载时**没有任何机会被消费**，
 * 只会留着把用户真正的第一次展开静音（实测：滚出虚拟窗口再滚回来 → 收起 → 展开，
 * `getAnimations()` 为 0、25ms 时高度已是终值）。
 *
 * 现在的判据是「状态翻转」：只有 `isExpanded` 由 false 变 true（以及回复目标切到本卡）
 * 才算用户动作。挂载复现、评论异步到达都直接放行。
 *
 * 这是源码级守卫：行为验证在浏览器里做过（见 plans/035 §13），但那段需要 >40 条帖子
 * 才会触发虚拟化重挂载，不适合放进常驻探针。 */

const root = resolve(import.meta.dirname, '../..');
const vueSource = readFileSync(resolve(root, 'src/views/Forum/components/PostCard.vue'), 'utf8');
const script = flattenSource(stripComments(scriptSection(vueSource)));

describe('PostCard：展开动画只认「状态翻转」', () => {
  it('不再残留 setup 快照式的跳过标志（那种写法只会静音用户第一次展开）', () => {
    expect(script).not.toContain('skipRepliesEnter');
    expect(script).not.toContain('skipReplyEnter');
  });

  it('isExpanded 由 false 翻成 true 时才置位', () => {
    expect(script).toContain('()=>Boolean(props.isExpanded)');
    expect(script).toContain('(next,prev)=>{if(next&&!prev)animateRepliesEnter=true');
  });

  it('回复框同理：回复目标切到「本卡」才置位', () => {
    expect(script).toContain('replyTargetPostId');
    expect(script).toContain("if(next===String(props.post.id||''))animateReplyEnter=true");
  });

  it('enter 钩子：没置位就直接放行，置位则消费掉（保证「收起再展开」每次都有动画）', () => {
    expect(script).toContain('if(!animateRepliesEnter){done();return;}animateRepliesEnter=false;');
    expect(script).toContain('if(!animateReplyEnter){done();return;}animateReplyEnter=false;');
  });
});
