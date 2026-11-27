import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const scriptOf = (relPath) => squeezeSource(stripComments(scriptSection(read(relPath))));
const wholeOf = (relPath) => squeezeSource(read(relPath));

describe('forum review regressions', () => {
  it('回复草稿按 postId 隔离，不再多卡共享同一份内容', () => {
    const code = scriptOf('src/views/Forum/ForumMain.vue');
    const whole = wholeOf('src/views/Forum/ForumMain.vue');
    expect(code).toContain('const replyDrafts = ref({})');
    expect(code).toContain('replyDrafts.value[post.id]');
    expect(whole).toContain(':reply-content="replyDrafts[item.post.id] || \'\'"');
    expect(whole).toContain('@update:reply-content="replyDrafts[item.post.id] = $event"');
  });

  it('回复父评论必须属于当前帖子，不能复用另一张卡的 activeReplyTarget', () => {
    const code = scriptOf('src/views/Forum/ForumMain.vue');
    expect(code).toMatch(/activeTarget\?\.postId\s*===\s*post\.id\s*\?\s*activeTarget\.parentId/);
  });

  it('举报结果按 API 的 ok 字段判定成功', () => {
    const code = scriptOf('src/views/Forum/ForumMain.vue');
    expect(code).toContain('if (!result.ok)');
    expect(code).not.toContain('if (!result.success)');
  });

  it('官方与成员分区没有 ForumMain 实例时，搜索仍跳转全屏搜索页', () => {
    const code = scriptOf('src/views/user-center/UserSpace/components/ForumSectionShell.vue');
    expect(code).toMatch(
      /openFullSearch[\s\S]*callForumView\('focusSearch'\)[\s\S]*router\.push\('\/search'\)/,
    );
  });

  it('顶部卡探针使用当前官方化圣诞文案', () => {
    const probe = wholeOf('scripts/probes/probe-forum-top-cards.mjs');
    expect(probe).toContain('圣诞交换礼物');
    expect(probe).toContain('挂上头像，随机配对');
    expect(probe).not.toContain('把头像挂上树');
  });
});
