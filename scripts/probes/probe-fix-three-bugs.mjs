import { chromium } from 'playwright';

// 三 bug 修复验证探针：
//  A) 首页：全部 hero 行 t0 即渲染、无 content-visibility、页高从加载起稳定不漂移
//  B) 论坛多图帖：列表只回 4 张预览 + image_count=6 → 角标 +2，大图从第 4 张可翻到第 6 张
//  C) 论坛官方新闻卡详情：按 source_type/source_id 回源 news.content 渲染完整正文
// 数据全部走 supabase REST mock，不依赖真实库数据。

const BASE = 'http://localhost:5173';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`);
};

const IMG = (n) => `https://picsum.photos/seed/bohfix${n}/480/360`;
const previewFour = [1, 2, 3, 4].map((n, i) => ({
  id: `img-${n}`, url: IMG(n), publicId: '', width: 480, height: 360, format: 'webp', sortOrder: i, isCover: i === 0
}));
const fullSix = [1, 2, 3, 4, 5, 6].map((n, i) => ({
  id: `img-${n}`, url: IMG(n), public_id: '', width: 480, height: 360, format: 'webp', sort_order: i
}));

const sixImagePost = {
  id: 'test-post-6img',
  content: '【六图测试帖】\n这是用于验证多图翻页的正文。',
  title: '六图测试帖',
  body: '这是用于验证多图翻页的正文。',
  tag: 'daily',
  author_id: null,
  author_username: '测试员',
  author_avatar_url: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'approved',
  comment_count: 0,
  like_count: 0,
  image_count: 6,
  cover_image_url: '',
  images: previewFour,
  post_kind: 'post'
};

const officialNewsPost = {
  id: 'test-news-1',
  post_kind: 'news',
  source_type: 'news',
  source_id: 'news-1',
  content: '【测试新闻公告】\n这是列表与降级场景下显示的摘要文本。',
  title: '测试新闻公告',
  body: '这是列表与降级场景下显示的摘要文本。',
  author_id: null,
  author_username: '方块之家',
  status: 'approved',
  created_at: new Date().toISOString(),
  like_count: 0,
  comment_count: 2,
  // 模拟老镜像卡：posts 无封面，封面只在原表 news.image
  cover_image_url: ''
};

const fullNewsRow = {
  id: 'news-1',
  title: '测试新闻公告',
  content: '<h2>完整公告正文标题</h2><p>这是新闻的完整正文第一段，用于验证详情页回源渲染是否生效。</p><ul><li>要点一</li><li>要点二</li></ul>',
  image: '@/assets/images/favicon.webp'
};

// 转发帖 + 被引用的原帖
const originalPostRow = {
  id: 'test-original-1',
  title: '翼儿说要画头像框，各位有什么想要的动物嘛，还是想要精灵🧚',
  body: '',
  // 纯标题帖的真实形态：content 只有【标题】行，正文为空
  content: '【翼儿说要画头像框，各位有什么想要的动物嘛，还是想要精灵🧚】\n',
  author_id: 'author-orig',
  author_username: '小牛无聊',
  created_at: new Date(Date.now() - 86400000).toISOString(),
  cover_image_url: ''
};
const repostPostRow = {
  id: 'test-repost-1',
  post_kind: 'repost',
  repost_of_post_id: 'test-original-1',
  content: '快来看看！',
  title: null,
  body: '快来看看！',
  tag: 'daily',
  // 与探针伪造登录用户一致：个人空间"我的帖子"网格按 author_id 过滤命中
  author_id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
  author_username: 'Ryyik',
  author_avatar_url: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'approved',
  comment_count: 0,
  like_count: 0,
  image_count: 0,
  cover_image_url: '',
  images: []
};

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
});

// ============ A) 首页滚动与渲染稳定性 ============
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.home-hero-row', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const top = await page.evaluate(() => ({
    rows: document.querySelectorAll('.home-hero-row').length,
    rendered: [...document.querySelectorAll('.home-hero-row')]
      .filter((r) => (r.querySelector('.home-hero-row-inner')?.children.length || 0) > 0).length,
    cvValues: [...new Set([...document.querySelectorAll('.home-hero-row')]
      .map((r) => getComputedStyle(r).contentVisibility))],
    pageH: document.documentElement.scrollHeight,
  }));
  check('A1 首页 hero 行数=7', top.rows === 7, String(top.rows));
  check('A2 全部行 t0 即渲染（无占位空窗）', top.rendered === top.rows, `${top.rendered}/${top.rows}`);
  check('A3 行不再挂 content-visibility:auto', !top.cvValues.includes('auto'), top.cvValues.join(','));

  for (const frac of [0.25, 0.5, 0.75, 1]) {
    await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * f), frac);
    await page.waitForTimeout(400);
  }
  const bottom = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    pageH: document.documentElement.scrollHeight,
    rendered: [...document.querySelectorAll('.home-hero-row')]
      .filter((r) => (r.querySelector('.home-hero-row-inner')?.children.length || 0) > 0).length,
    footerVisible: (() => {
      const f = document.querySelector('.home-footer');
      if (!f) return false;
      const r = f.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    })(),
  }));
  check('A4 滚动到底后行仍全部渲染', bottom.rendered === top.rows, `${bottom.rendered}/${top.rows}`);
  check('A5 页高全程稳定（无占位→真实跳变）', Math.abs(bottom.pageH - top.pageH) <= 2, `top=${top.pageH} bottom=${bottom.pageH}`);
  check('A6 页脚可达且可见', bottom.footerVisible && bottom.y > 0, `y=${bottom.y}`);
  check('A7 无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.close();
}

// ============ supabase REST mock（B/C 共用） ============
const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.route('**/rest/v1/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const method = req.method();
  const q = url.searchParams;

  if (path.endsWith('/rpc/list_forum_posts') && method === 'POST') {
    // 列表 RPC 路径：只给 4 张预览图 + image_count=6（复刻线上 RPC 行为）
    return json(route, [sixImagePost]);
  }
  if (path.includes('/forum_post_images')) {
    // 按需补全：仅六图帖返回全量；官方卡（其余 post_id）无图行 → 走封面回源
    if (q.get('post_id') === 'eq.test-post-6img') return json(route, fullSix);
    return json(route, []);
  }
  if (path.includes('/posts') && !q.get('id') && (req.url().includes('author_id.eq.') || q.get('or')?.includes('author_id.eq.'))) {
    // 个人空间"我的帖子"网格（getPostsByUsername 按作者 or 过滤）：给一条转发帖
    return json(route, [{ ...repostPostRow, forum_post_images: [] }]);
  }
  if (path.includes('/posts') && !q.get('id')) {
    // 列表直查路径（cursor/降级模式）：join forum_post_images 全量 6 张，
    // 客户端 normalizePostListRecord 负责截 4 张预览 → 复刻线上行为
    return json(route, [
      { ...sixImagePost, forum_post_images: fullSix },
      { ...repostPostRow, forum_post_images: [] }
    ]);
  }
  if (path.includes('/posts') && (q.get('id') || '').startsWith('in.')) {
    // 转发原帖批量回源（ensureQuotedPostsForReposts 的 .in() 查询）
    return json(route, [originalPostRow]);
  }
  if (path.includes('/news')) {
    if (q.get('id') === 'eq.news-1') return json(route, fullNewsRow);
    return json(route, []);
  }
  if (path.includes('/activities')) return json(route, []);
  if (path.includes('/posts')) {
    if (q.get('id') === 'eq.test-news-1') return json(route, officialNewsPost);
    if (q.get('id') === 'eq.test-original-1') return json(route, originalPostRow);
    return json(route, []);
  }
  if (path.endsWith('/rpc/get_user_subscription_tier')) {
    // 原帖作者订阅层级：返回 max → 引用框应带 tier-max 卡色
    return json(route, 'max');
  }
  if (path.endsWith('/rpc/list_forum_post_comments') || path.includes('/comments')) {
    return json(route, []);
  }
  // 兜底：其余表/RPC 一律空
  return json(route, method === 'POST' ? null : []);
});

// ============ B) 论坛多图帖翻页 ============
{
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + '/#/user-space?tab=community', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('[data-forum-post-id="test-post-6img"]', { timeout: 20000 });
  } catch { /* 下面统一断言 */ }

  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-forum-post-id="test-post-6img"]');
    if (!el) return null;
    return {
      strip: !!el.querySelector('.image-post-strip'),
      thumbs: el.querySelectorAll('.image-post-strip .image-post-thumb-shell').length,
      moreCard: el.querySelector('.image-post-strip-more')?.textContent.replace(/\s+/g, '') || '',
      dots: el.querySelectorAll('.image-strip-dot').length,
      indicator: el.querySelector('.image-strip-indicator')?.textContent.replace(/\s+/g, '') || '',
    };
  });
  check('B1 图片条横向排列（strip）', !!card?.strip);
  check('B2 初始只渲染 4 张（列表数据截断）', card?.thumbs === 4, String(card?.thumbs));
  check('B3 末尾"+2 张"占位卡', card?.moreCard === '+2张', String(card?.moreCard));
  check('B3b 分段横条指示器段数=6', card?.dots === 6, String(card?.dots));
  check('B3c 初始指示 1/6', card?.indicator === '1/6', String(card?.indicator));

  if (card?.thumbs === 4) {
    // 滚动横向图片条到最右 → 触发按需补全 → 6 张全部出现、占位卡消失
    await page.evaluate(() => {
      const el = document.querySelector('[data-forum-post-id="test-post-6img"] .image-post-strip');
      el.scrollTo({ left: el.scrollWidth, behavior: 'instant' });
    });
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => {
      const el = document.querySelector('[data-forum-post-id="test-post-6img"]');
      return {
        thumbs: el.querySelectorAll('.image-post-strip .image-post-thumb-shell').length,
        moreGone: !el.querySelector('.image-post-strip-more'),
        indicator: el.querySelector('.image-strip-indicator')?.textContent.replace(/\s+/g, '') || '',
        dots: el.querySelectorAll('.image-strip-dot').length,
      };
    });
    check('B4 滚到末尾自动补全 → 6 张全部可见', after.thumbs === 6, String(after.thumbs));
    check('B5 占位卡补全后消失', after.moreGone);
    // 补全后用户停留在滚动到的位置（不重置回开头），指示应为合法页序 x/6
    check('B5b 补全后指示为有效页序 x/6', /^[1-6]\/6$/.test(after.indicator), after.indicator);

    // 点击第 5 段横条 → 触发补全（此处已补全）→ 平滑滚到第 5 张并高亮
    await page.evaluate(() => {
      document.querySelectorAll('[data-forum-post-id="test-post-6img"] .image-strip-dot')[4].click();
    });
    await page.waitForTimeout(1600);
    const jumped = await page.evaluate(() => {
      const el = document.querySelector('[data-forum-post-id="test-post-6img"]');
      const strip = el.querySelector('.image-post-strip');
      const dots = [...el.querySelectorAll('.image-strip-dot')];
      const target = strip.children[4];
      return {
        activeIdx: dots.findIndex((d) => d.classList.contains('is-active')),
        indicator: el.querySelector('.image-strip-indicator')?.textContent.replace(/\s+/g, '') || '',
        atTarget: Math.abs(strip.scrollLeft - (target?.offsetLeft || 0)) < 8,
      };
    });
    check('B5c 点第 5 段 → 高亮第 5 段', jumped.activeIdx === 4, String(jumped.activeIdx));
    check('B5d 指示更新为 5/6', jumped.indicator === '5/6', jumped.indicator);
    check('B5e 滚动落点对准第 5 张', jumped.atTarget);

    // 点第 4 张缩略图打开大图（大图保持左右按钮翻页）
    await page.click('[data-forum-post-id="test-post-6img"] .image-post-strip .image-post-thumb-shell:nth-child(4)');
    await page.waitForSelector('.forum-image-viewer', { timeout: 8000 });
    await page.waitForTimeout(600);
    const counter1 = await page.textContent('.forum-image-viewer-count');
    check('B6 打开即在第 4 张，计数 4/6', counter1?.trim() === '4 / 6', JSON.stringify(counter1));

    await page.click('.forum-image-viewer-nav.next');
    await page.waitForTimeout(300);
    const counter2 = await page.textContent('.forum-image-viewer-count');
    check('B7 右侧按钮 → 5/6', counter2?.trim() === '5 / 6', JSON.stringify(counter2));

    await page.click('.forum-image-viewer-nav.next');
    await page.waitForTimeout(300);
    const counter3 = await page.textContent('.forum-image-viewer-count');
    check('B8 右侧按钮 → 6/6（末图可达）', counter3?.trim() === '6 / 6', JSON.stringify(counter3));

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const counter4 = await page.textContent('.forum-image-viewer-count');
    check('B9 键盘左键回退 → 5/6', counter4?.trim() === '5 / 6', JSON.stringify(counter4));
  } else {
    check('B1 图片条横向排列（strip）', false, '未找到测试帖卡片');
  }
  check('B7 无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.close();
}

// ============ C) 官方新闻卡详情回源 ============
{
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + '/#/forum/post/test-news-1', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('.official-rich-content', { timeout: 15000 });
  } catch { /* 断言统一处理 */ }
  const detail = await page.evaluate(() => ({
    hasRich: !!document.querySelector('.official-rich-content'),
    richText: document.querySelector('.official-rich-content')?.textContent || '',
    summaryShown: [...document.querySelectorAll('.content-text')].some((el) => el.textContent.includes('摘要文本')),
    title: document.querySelector('.post-detail-title')?.textContent.trim() || '',
    hasCarousel: !!document.querySelector('.post-detail-image-carousel'),
    carouselImg: document.querySelector('.post-detail-image')?.getAttribute('src') || '',
  }));
  check('C1 官方卡渲染回源富文本容器', detail.hasRich);
  check('C2 正文为完整原文（含标题+要点）', detail.richText.includes('完整公告正文标题') && detail.richText.includes('要点二'), detail.richText.slice(0, 60));
  check('C3 不再只显示摘要', !detail.summaryShown);
  check('C4 帖子标题正确', detail.title.includes('测试新闻公告'), detail.title);
  check('C5 无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
  check('C6 无封面镜像卡回源出封面轮播', detail.hasCarousel, String(detail.hasCarousel));
  check('C7 封面图 src 为解析后的资源 URL', detail.carouselImg.includes('favicon.webp') || detail.carouselImg.startsWith('data:') || detail.carouselImg.startsWith('http'), detail.carouselImg.slice(0, 90));
  await page.screenshot({ path: 'debug-screenshots/fix-news-detail-official.png', fullPage: false });
  await page.close();
}

// ============ D) 转发帖引用框 ============
{
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  await page.goto(BASE + '/#/user-space?tab=community', { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForSelector('[data-forum-post-id="test-repost-1"] .quoted-post-box', { timeout: 20000 });
  } catch { /* 断言统一处理 */ }
  const quote = await page.evaluate(() => {
    const el = document.querySelector('[data-forum-post-id="test-repost-1"]');
    if (!el) return null;
    return {
      title: el.querySelector('.post-title-v2')?.textContent.trim() || '',
      body: el.querySelector('.post-text-v2')?.textContent.trim() || '',
      box: !!el.querySelector('.quoted-post-box'),
      author: el.querySelector('.quoted-post-author')?.textContent.trim() || '',
      boxTitle: el.querySelector('.quoted-post-title')?.textContent.trim() || '',
      boxBody: el.querySelector('.quoted-post-body')?.textContent.trim() || '',
    };
  });
  check('D1 转发帖标题不再是无标题', quote?.title === '转发动态', String(quote?.title));
  check('D2 转发文字保留为正文', quote?.body === '快来看看！', String(quote?.body));
  check('D3 引用框渲染', !!quote?.box);
  check('D4 引用框带原帖作者', quote?.author === '@小牛无聊', String(quote?.author));
  check('D5 引用框带原帖标题', (quote?.boxTitle || '').includes('翼儿说要画头像框'), String(quote?.boxTitle));
  check('D6 纯标题原帖正文行不重复标题', !quote?.boxBody, String(quote?.boxBody));
  check('D6b 引用框随原帖作者层级显示卡色(tier-max)', await page.evaluate(() => {
    const box = document.querySelector('[data-forum-post-id="test-repost-1"] .quoted-post-box');
    return !!box && box.classList.contains('tier-max');
  }));

  // 点击引用框 → 跳原帖详情
  await page.click('[data-forum-post-id="test-repost-1"] .quoted-post-box');
  await page.waitForTimeout(1500);
  const jumped = await page.evaluate(() => ({
    hash: location.hash,
    detailTitle: document.querySelector('.post-detail-title')?.textContent.trim() || '',
  }));
  check('D7 点引用框跳原帖详情', jumped.hash.includes('/forum/post/test-original-1'), jumped.hash);
  check('D8 原帖详情标题正确', jumped.detailTitle.includes('翼儿说要画头像框'), jumped.detailTitle);
  check('D9 无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.close();
}

// ============ E) 个人空间帖子网格（登录态） ============
{
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  // 先等启动时的 initLoginState 跑完（它会用空 session 把登录态刷成 false），
  // 之后再注入登录态并站内跳转，避免被覆盖/被守卫弹回
  await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    auth.isInitialized = true;
    Object.assign(auth.userInfo, {
      id: '00ac36b4-6594-440f-a9c1-38b7bd47ee8b',
      username: 'Ryyik',
      role: 'user',
      points: 14
    });
    location.hash = '#/user-space?tab=posts';
  });
  // 等网格数据加载 + 转发原帖回源
  try {
    await page.waitForSelector('.profile-post-card', { timeout: 20000 });
  } catch { /* 断言统一处理 */ }
  await page.waitForTimeout(1800);
  const grid = await page.evaluate(() => {
    const card = document.querySelector('.profile-post-card');
    if (!card) return null;
    return {
      title: card.querySelector('h3')?.textContent.trim() || '',
      summary: card.querySelector('p')?.textContent.trim() || '',
      cover: card.querySelector('.profile-post-cover img')?.getAttribute('src') || '',
    };
  });
  check('E1 网格卡主体为转发者的话', grid?.title === '快来看看！', String(grid?.title));
  check('E2 摘要为小字原帖内容(带作者)', (grid?.summary || '').startsWith('@小牛无聊：') && (grid?.summary || '').includes('想要的动物'), String(grid?.summary));
  check('E3 无封面原帖不渲染封面区(text-only)', grid?.cover === '', String(grid?.cover || '(none)'));
  check('E4 无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
  await page.locator('.profile-post-grid').first().screenshot({ path: 'debug-screenshots/repost-userspace-grid.png' }).catch(() => {});
  await page.close();
}

await context.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== 结果: ${results.length - failed.length}/${results.length} PASS ====`);
process.exit(failed.length ? 1 : 0);
