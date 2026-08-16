import { expect, test } from '@playwright/test';

const mockPost = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '我的第一条论坛动态',
  body: '这是用于验证游客论坛体验的固定内容。',
  content: '【我的第一条论坛动态】\n这是用于验证游客论坛体验的固定内容。',
  author_id: '22222222-2222-4222-8222-222222222222',
  author_username: '测试用户',
  created_at: '2026-08-14T12:00:00.000Z',
  status: 'approved',
  tag: 'daily',
  comment_count: 0,
  like_count: 0,
  image_count: 0,
  is_liked: false
};

async function mockForumApi(page, { posts = [mockPost] } = {}) {
  await page.route('**://**.supabase.co/**', async (route) => {
    const url = route.request().url();
    let body = [];
    if (url.includes('/rest/v1/posts')) {
      // The keyset request for the next page contains the last post timestamp.
      body = decodeURIComponent(url).includes('created_at.lt.') ? posts.slice(20) : posts;
    }
    if (url.includes('get_forum_tag_stats')) {
      body = [{ tag: 'daily', post_count: 1 }, { tag: 'question', post_count: 0 }];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockForumApi(page);
  await page.goto('/#/forum');
});

test('legacy forum route opens the posts feed', async ({ page }) => {
  await expect(page).toHaveURL(/#\/user-space\?tab=posts/);
  await expect(page.getByRole('article')).toHaveCount(1);
});

test('tag filtering updates the selected feed state', async ({ page }) => {
  await page.getByRole('button', { name: '最新 · 全部标签' }).click();
  const dropdown = page.locator('.toolbar-filter-dropdown');
  await dropdown.getByRole('button', { name: '#提问' }).click();
  await expect(page.getByRole('button', { name: '最新 · #提问' })).toBeVisible();
});

test('mobile forum feed does not introduce horizontal scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Only applies to the mobile viewport.');
  await expect(page.locator('.mobile-compose-fab')).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate((element) => element.clientWidth));
});

test('mobile forum feed loads older posts while the document scrolls', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Only applies to the mobile viewport.');
  const posts = Array.from({ length: 21 }, (_, index) => ({
    ...mockPost,
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    title: `分页帖子 ${index + 1}`,
    content: `【分页帖子 ${index + 1}】\n用于验证手机端继续加载更早的帖子。`,
    created_at: new Date(Date.UTC(2026, 7, 14, 12, 0, -index)).toISOString()
  }));

  await page.unroute('**://**.supabase.co/**');
  await mockForumApi(page, { posts });
  await page.goto('/#/forum');
  await expect(page.getByRole('article')).toHaveCount(20);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole('article')).toHaveCount(21);
});
