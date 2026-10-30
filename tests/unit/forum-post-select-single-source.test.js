import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stripComments } from '../helpers/source.js';

/* 为什么要这组用例（2026-10-30 P2-1a）：
   帖子列表的 select 列串原先在 `post-api.js` 的 4 个分支里各有「有/无登录态」两份，
   共 8 处逐字重复。它的失效方式是**静默的** —— 加一个字段（如 `edited_at`）只改 7 处，
   症状是「论坛列表有、用户主页没有」这类只在特定入口复现的 bug；
   仓库 2026-10-16 的「活动报名明细静默空列表」是同型事故。
   ⚠️ 断言分两层：
     ① 源码层：列串只允许出现在单源文件里（按**文件集合**比，不数次数 —— 见 P2-2 的教训）；
     ② 行为层：真的有登录态才带 `user_likes`，否则省掉那次 join。
   只有 ① 的话，把两个变体写反了也照样绿。
   ⚠️ 行为层必须**两个入口都测**：`getPosts` 用 `userId`、`getUserPosts` 用 `currentUserId`，
   是两份独立的分支，只测一个的话另一个写反了没人管。 */

const fm = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
}));

vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: {
    from: fm.supabaseFrom,
    rpc: fm.supabaseRpc,
    auth: { getUser: vi.fn() },
  },
}));

import { clearRequestCache } from '../../src/utils/request-core.js';
import { getPosts, getUserPosts } from '../../src/utils/api/forum/post-api.js';

const LIKES_FIELD = 'user_likes:likes!left(user_id)';
const IMAGES_FIELD =
  'forum_post_images(id,url,public_id,width,height,format,sort_order,moderation_status)';

/** 让入口函数走「RPC 不可用 → 直连 posts 表」的降级分支，并抓下列串。 */
async function driveFallbackSelect(run, userId) {
  fm.supabaseRpc.mockResolvedValue({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function list_forum_posts' },
  });

  const selects = [];
  const q = {
    select: vi.fn((columns) => {
      if (typeof columns === 'string') selects.push(columns);
      return q;
    }),
    or: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    range: vi.fn(() => q),
    then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  fm.supabaseFrom.mockReturnValue(q);

  await run(userId);

  const postsSelect = selects.find((columns) => columns.includes(IMAGES_FIELD));
  expect(postsSelect).toBeDefined();
  return postsSelect;
}

const ENTRIES = [
  {
    name: 'getPosts（论坛列表）',
    run: (userId) => getPosts(userId, { page: 1, pageSize: 10 }),
  },
  {
    name: 'getUserPosts（用户主页）',
    run: (userId) => getUserPosts('target-user', userId, { page: 1, pageSize: 10 }),
  },
];

describe('论坛帖子列表列串单源（P2-1a）', () => {
  for (const entry of ENTRIES) {
    describe(entry.name, () => {
      beforeEach(() => {
        vi.clearAllMocks();
        clearRequestCache();
      });

      it('有登录态时带点赞态字段', async () => {
        const columns = await driveFallbackSelect(entry.run, 'user-1');
        expect(columns).toContain(LIKES_FIELD);
      });

      it('无登录态时不查点赞态字段（省一次 join）', async () => {
        const columns = await driveFallbackSelect(entry.run, null);
        expect(columns).not.toContain(LIKES_FIELD);
      });

      it('两个变体除点赞态字段外完全一致（加字段只需改一处）', async () => {
        const withLikes = await driveFallbackSelect(entry.run, 'user-1');
        clearRequestCache();
        const withoutLikes = await driveFallbackSelect(entry.run, null);

        // 只剔除点赞态那一项再比：剩下任何差异都说明两个变体各自漂移了
        const stripLikes = (columns) =>
          columns
            .split(',')
            .filter((field) => !field.includes('user_likes'))
            .join(',');
        expect(stripLikes(withLikes)).toBe(stripLikes(withoutLikes));
      });
    });
  }
});

describe('论坛帖子列表列串的源码守卫', () => {
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(full));
      else if (/\.(js|ts|vue|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  };

  it('列串只允许出现在 post-api.js 里', () => {
    const offenders = walk('src').filter((file) => {
      // 先剥注释：单源文件的注释里也会提到这个字段串，那是说明不是实现
      const code = stripComments(readFileSync(file, 'utf8'));
      return code.includes(IMAGES_FIELD);
    });
    expect(offenders).toEqual(['src/utils/api/forum/post-api.js']);
  });

  it('post-api.js 里这份列串只出现一次（不允许再长回第二份）', () => {
    const code = stripComments(readFileSync('src/utils/api/forum/post-api.js', 'utf8'));
    const occurrences = code.split(IMAGES_FIELD).length - 1;
    expect(occurrences).toBe(1);
  });
});
