import { chromium } from 'playwright';
import fs from 'node:fs';

// =====================================================================
// 探针：横屏帖子详情弹窗化（openForumPost 单源分流 + 小红书式布局）
//   A 横屏点卡 → 弹窗打开 + pushState 同步详情 URL + 列表原地保留
//     + router 未跳转 + 小红书式骨架渲染（左媒体/右信息/底栏）
//   A6 媒体区 16px 边距（panel↔media rect 差）
//   A7 关注按钮：mock user_follows，点击后「关注→已关注」翻转（不污染真库）
//   A8 底部操作栏固定：滚动评论区后 actionbar bottom 不变
//   A9 无图帖降级：无媒体区、单栏信息（feed 无无图帖时 SKIP）
//   B Esc 关闭 → overlay 消失 + URL 还原 + body 滚动锁解除
//   C 弹窗打开时浏览器后退 → 关弹窗 + URL 还原 + 列表仍可用（可再开）
//   D 遮罩点击关闭
//   E 关闭按钮关闭
//   F 竖屏点卡 → 无弹窗，保持整页路由（PostDetail 页 + 页头返回条）
//   G 弹窗开着退出横屏 → 判据失配自动关 + URL 还原
//   counter-proof：把 usePostDetailModal.openForumPost 的分流条件强制置 false
//     （横屏也走整页路由）后，A 组必红（无 overlay / 列表被卸载）。
// =====================================================================
const BASE = process.env.BASE || 'http://[::1]:5173';
const OUT = 'debug-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const launch = () =>
  chromium.launch({
    channel: 'chrome',
    args: ['--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pinia 伪造登录（探针惯例：reactive 须 Object.assign，id 用合法 UUID）。
// 注意：id 用真库不存在的随机 UUID —— 若撞上帖子作者本人，关注钮会被 canFollowAuthor 拦掉。
const injectAuth = async (page) => {
  await page.waitForFunction(() => document.querySelector('#app')?.__vue_app__, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    const auth = pinia.state.value.auth;
    auth.isLoggedIn = true;
    Object.assign(auth.userInfo, {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      username: 'probe_user',
      role: 'user',
      points: 42,
    });
  });
};

const openCommunity = async (page) => {
  // 真库/网络偶发抖动：最多 3 次尝试（goto + injectAuth + 等卡片），injectAuth 需逐次重打
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${BASE}/#/user-space?tab=community`, { waitUntil: 'domcontentloaded' });
      await injectAuth(page);
      await page.waitForSelector('.community-shell', { timeout: 15000 });
      await page.waitForSelector('.post-card-v2', { timeout: 15000 });
      await page.waitForTimeout(1200);
      return;
    } catch (error) {
      lastError = error;
      console.log(
        `  [openCommunity] attempt ${attempt}/3 failed: ${String(error).split('\n')[0].slice(0, 120)}`,
      );
      await sleep(1500);
    }
  }
  throw lastError;
};

const clickFirstCard = async (page) => {
  // 点标题文字区：竖屏卡片中心是多图缩略图（点图不触发 open），横屏同理避开按钮区
  await page.locator('.post-card-v2 .post-title-v2').first().click();
};

const clickCardAt = async (page, index) => {
  await page.locator('.post-card-v2 .post-title-v2').nth(index).click();
};

// 轮询直到条件满足，替换「定时等」避免假红
const waitForInPage = async (page, fn, { timeout = 15000, interval = 200 } = {}) => {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(fn).catch(() => null);
    if (last && last.done) return last;
    await sleep(interval);
  }
  return last;
};

const modalOpenState = () => {
  const overlay = document.querySelector('.pd-modal-overlay');
  return { done: Boolean(overlay), hasOverlay: Boolean(overlay) };
};

const modalContentState = () => {
  const overlay = document.querySelector('.pd-modal-overlay');
  if (!overlay) return { done: false };
  const body = overlay.querySelector('.pd-modal-body');
  const info = overlay.querySelector('.pd-modal-info');
  const media = overlay.querySelector('.pd-modal-media');
  const hasMedia = Boolean(overlay.querySelector('.pd-modal-body--has-media'));
  return {
    done: Boolean(body && info && hasMedia === Boolean(media)),
    hasBody: Boolean(body),
    hasInfo: Boolean(info),
    hasMedia: Boolean(media),
    hasMediaFlag: hasMedia,
  };
};

// 小红书式布局状态（媒体边距 / 关注钮 / 底栏固定）
const modalLayoutMetrics = () => {
  const panel = document.querySelector('.pd-modal-panel');
  const media = document.querySelector('.pd-modal-media');
  const info = document.querySelector('.pd-modal-info');
  const followBtn = document.querySelector('.pd-follow-btn');
  const actionbar = document.querySelector('.pd-actionbar');
  const scroll = document.querySelector('.pd-info-scroll');
  if (!panel || !actionbar) return { done: false };
  const panelRect = panel.getBoundingClientRect();
  const mediaRect = media ? media.getBoundingClientRect() : null;
  const infoRect = info ? info.getBoundingClientRect() : null;
  return {
    done: true,
    mediaGapLeft: mediaRect ? Math.round(mediaRect.left - panelRect.left) : null,
    mediaGapTop: mediaRect ? Math.round(mediaRect.top - panelRect.top) : null,
    mediaBottom: mediaRect ? Math.round(panelRect.bottom - mediaRect.bottom) : null,
    mediaInfoGap: mediaRect && infoRect ? Math.round(infoRect.left - mediaRect.right) : null,
    /* 信息列自己承担的内衬（2026-11-24 补）：媒体满出血后容器 padding 归零，
       左右内衬搬到了 .pd-modal-info 的 padding 上 —— 这条必须一起量，否则
       「媒体贴边」和「正文也贴边」会被当成同一件好事。 */
    infoPaddingLeft: info ? Math.round(parseFloat(getComputedStyle(info).paddingLeft)) : null,
    hasFollowBtn: Boolean(followBtn),
    followLabel: followBtn ? followBtn.textContent.trim() : null,
    actionbarBottomGap: Math.round(panelRect.bottom - actionbar.getBoundingClientRect().bottom),
    scrollable: Boolean(scroll),
  };
};

const modalClosedState = () => {
  const overlay = document.querySelector('.pd-modal-overlay');
  const hash = window.location.hash || '';
  return {
    done: !overlay && hash.startsWith('#/user-space'),
    overlayGone: !overlay,
    hash,
  };
};

const run = async () => {
  const browser = await launch();

  // ============ 横屏组（1280×800） ============
  const ctxL = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pageL = await ctxL.newPage();

  // ⚠️ 单 handler 规则表（探针惯例）：只拦 user_follows / comments / 相关 RPC（不污染真库），
  // 其余请求照常 continue。横屏与竖屏两页共用同一套规则。
  const setupDetailRoutes = async (page) => {
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/user_follows')) {
        if (method === 'GET') {
          return route
            .fulfill({ status: 200, contentType: 'application/json', body: 'null' })
            .catch(() => {});
        }
        if (method === 'POST') {
          return route
            .fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({ id: 'probe-follow-row', follower_id: 'x', following_id: 'y' }),
            })
            .catch(() => {});
        }
        if (method === 'DELETE') {
          return route
            .fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ id: 'probe-follow-row', follower_id: 'x', following_id: 'y' }),
            })
            .catch(() => {});
        }
      }
      // 评论区 K 组 mock（必须在 id=eq. 规则之前：post_id=eq. 包含子串 id=eq.）
      if (url.includes('/comments?')) {
        if (url.includes('parent_id=eq.')) {
          return route
            .fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([
                {
                  id: 'probe-child-1',
                  post_id: 'probe-post',
                  parent_id: 'probe-comment-2',
                  author_id: 'probe-author-id',
                  author_username: 'probe_author',
                  content: '楼中楼回复甲',
                  created_at: '2026-09-19T02:00:00Z',
                  status: 'approved',
                  reply_to_username: null,
                  like_count: 3,
                },
                {
                  id: 'probe-child-2',
                  post_id: 'probe-post',
                  parent_id: 'probe-comment-2',
                  author_id: 'a1b2c3d4-0000-4000-8000-000000000001',
                  author_username: 'probe_user',
                  content: '楼中楼回复乙（本人）',
                  created_at: '2026-09-19T02:30:00Z',
                  status: 'approved',
                  reply_to_username: 'probe_author',
                  like_count: 0,
                },
              ]),
            })
            .catch(() => {});
        }
        return route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'probe-comment-1',
                post_id: 'probe-post',
                parent_id: null,
                author_id: 'probe-other-id',
                author_username: 'probe_other',
                content: '第一条他人评论',
                created_at: '2026-09-19T01:00:00Z',
                status: 'approved',
                like_count: 5,
              },
              {
                id: 'probe-comment-2',
                post_id: 'probe-post',
                parent_id: null,
                author_id: 'a1b2c3d4-0000-4000-8000-000000000001',
                author_username: 'probe_user',
                content: '第二条本人评论（可删）',
                created_at: '2026-09-19T01:30:00Z',
                status: 'approved',
                like_count: 1,
              },
            ]),
          })
          .catch(() => {});
      }
      // 子回复预览 RPC mock：probe-comment-2 有 1 条子回复
      if (url.includes('/rpc/get_comment_thread_previews')) {
        return route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                root_comment_id: 'probe-comment-2',
                has_more: false,
                id: 'probe-child-1',
                post_id: 'probe-post',
                parent_id: 'probe-comment-2',
                author_id: 'probe-author-id',
                author_username: 'probe_author',
                content: '楼中楼回复甲',
                created_at: '2026-09-19T02:00:00Z',
                like_count: 3,
                reply_to_username: null,
              },
            ]),
          })
          .catch(() => {});
      }
      // 评论点赞 RPC mock：固定返回 liked/6
      if (url.includes('/rpc/toggle_forum_comment_like')) {
        return route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ action: 'liked', like_count: 6, is_liked: true }]),
          })
          .catch(() => {});
      }
      // 已赞集合：空（全部未赞）
      if (url.includes('/comment_likes?')) {
        return route
          .fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          .catch(() => {});
      }
      // 帖子详情单查（id=eq.）延迟 1.5s：让骨架态停留足够久供 J1 几何断言
      if (method === 'GET' && url.includes('id=eq.')) {
        await sleep(1500);
        return route.continue().catch(() => {});
      }
      return route.continue().catch(() => {});
    });
  };

  await setupDetailRoutes(pageL);
  await openCommunity(pageL);
  check('L0 横屏打开社区并渲染卡片', true, 'cards ready');

  // 选第一张「非官方镜像卡」：官方卡（方块之家）无账号 → 无关注钮，canFollowAuthor 拦截属正确行为
  const cardIndex = await pageL.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.post-card-v2'));
    const idx = cards.findIndex(
      (card) =>
        !card.querySelector('.post-author-avatar.is-official') &&
        !card.querySelector('.post-kind-badge'),
    );
    return idx >= 0 ? idx : 0;
  });
  const clickTargetCard = async () => {
    // 点标题文字区：竖屏卡片中心是多图缩略图（点图不触发 open），横屏同理避开按钮区
    await pageL.locator('.post-card-v2 .post-title-v2').nth(cardIndex).click();
  };

  // ---- A 横屏点卡 → 弹窗 ----
  await clickTargetCard();
  const a1 = await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
  check('A1 横屏点卡弹出 .pd-modal-overlay', Boolean(a1?.hasOverlay));

  // ---- J1 加载骨架撑满弹窗（详情请求被 delay 1.5s，骨架停留可测） ----
  const j1 = await waitForInPage(
    pageL,
    () => {
      const panel = document.querySelector('.pd-modal-panel');
      const skeleton = document.querySelector('.post-detail-skeleton');
      if (!panel || !skeleton) return { done: false };
      const p = panel.getBoundingClientRect();
      const s = skeleton.getBoundingClientRect();
      return {
        done: s.height >= p.height - 60,
        skeletonH: Math.round(s.height),
        panelH: Math.round(p.height),
        topGap: Math.round(s.top - p.top),
      };
    },
    { timeout: 5000, interval: 120 },
  );
  check(
    'J1 加载骨架撑满弹窗面板',
    Boolean(j1?.done),
    j1
      ? `skeletonH=${j1.skeletonH} panelH=${j1.panelH} topGap=${j1.topGap}`
      : 'skeleton not captured',
  );
  await pageL.screenshot({ path: `${OUT}/pd-modal-skeleton.png` }).catch(() => {});

  const a2 = await pageL.evaluate(() => ({
    hash: window.location.hash || '',
    modalKey: String(window.history.state?.bohPdModal || ''),
    routePath:
      document.querySelector('#app').__vue_app__.config.globalProperties.$router.currentRoute.value
        .path,
  }));
  check(
    'A2 pushState 同步详情 URL + history 标记',
    /^#\/forum\/post\/[^/]+$/.test(a2.hash) && Boolean(a2.modalKey),
    `hash=${a2.hash}`,
  );
  check(
    'A3 router 未跳转（仍停在 /user-space）',
    a2.routePath === '/user-space',
    `path=${a2.routePath}`,
  );

  const a4 = await pageL.evaluate(() => ({
    cards: document.querySelectorAll('.post-card-v2').length,
  }));
  check('A4 列表原地保留（帖子卡仍在 DOM）', a4.cards > 0, `cards=${a4.cards}`);

  // 真库详情请求偶发失败 → 空态。失败时关闭重开一次重试（区分网络抖动与布局回归）
  let a5 = await waitForInPage(pageL, modalContentState, { timeout: 20000 });
  if (!a5?.done) {
    const emptyState = await pageL.evaluate(() =>
      Boolean(document.querySelector('.pd-modal-body, .pd-modal-overlay .boh-empty-state')),
    );
    if (emptyState) {
      console.log('  [A5] 详情加载空态（真库抖动），关闭重开重试');
      await pageL.keyboard.press('Escape');
      await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
      await clickTargetCard();
    }
    a5 = await waitForInPage(pageL, modalContentState, { timeout: 25000 });
  }
  check(
    'A5 小红书式骨架渲染（左媒体+右信息+has-media 标记一致）',
    Boolean(a5?.done),
    JSON.stringify(a5 || {}),
  );

  // ---- A6 媒体区 16px 边距 / A7 关注钮 / A8 底栏固定 ----
  // detail-content 有 fade-in-up 入场动画（0.1s delay + 0.5s），先等它结束再量几何，否则带 translateY 尾巴
  await pageL.waitForTimeout(900);
  // auth store 的异步初始化（getSession=null）会不定时重置伪造登录态 → 断言前幂等补打
  await injectAuth(pageL);
  const a6 = await waitForInPage(pageL, modalLayoutMetrics, { timeout: 15000 });
  /* A6 媒体满出血 + 信息列自担内衬（2026-11-24 修口径）。
     ⚠️ 旧期望是「左/顶约 16px、媒体↔信息列间距约 18px」，那是 2026-10-22 媒体满出血改造
     **之前**的旧口径（当时 `.detail-container` 有 16px 内衬、列间还有 18px gap）。改造后
     `.detail-container { padding: 0 }` + `gap: 0`，媒体贴面板边、内衬改由 `.pd-modal-info`
     的 `padding: 0 24px` 自己承担 ⇒ 旧值永远不成立，这条从此长红。
     与 A8 完全同源的失效模式：**红得久了就被当「环境问题」跳过，真正的契约无人守**。

     改后的判据按当前设计拆成两件事，都能量出真错：
       · 媒体满出血：左/上/下边距 ≤ 2px（只允许面板 1px 边框）—— 一旦有人把内衬写回去，
         媒体会缩进 16px，这条立刻红；
       · 信息列自担内衬：info 的左内边距必须是 24px 档（不是 0）—— 内衬不能两头都没，
         否则无图帖正文直接贴面板边（这正是当初把内衬从容器挪到 info 的原因）。
     媒体↔信息列的 gap 不再单独断言：满出血下它是 0，且已由上面两条间接锁住列宽关系。 */
  check(
    'A6 媒体满出血（贴面板边 ≤2px）+ 信息列自担 24px 左内衬',
    a6?.mediaGapLeft !== null &&
      a6.mediaGapLeft <= 2 &&
      a6.mediaGapTop <= 2 &&
      a6.mediaBottom <= 2 &&
      a6.infoPaddingLeft === 24,
    `边距 L${a6?.mediaGapLeft} T${a6?.mediaGapTop} B${a6?.mediaBottom}（要求 ≤2）；info 左内衬 ${a6?.infoPaddingLeft}px（要求 24）`,
  );
  check(
    'A7a 关注按钮渲染且为未关注态',
    a6?.hasFollowBtn && a6.followLabel === '关注',
    `label=${a6?.followLabel}`,
  );

  await pageL.locator('.pd-follow-btn').click();
  const a7 = await pageL
    .waitForFunction(
      () => {
        const btn = document.querySelector('.pd-follow-btn');
        return btn && btn.textContent.trim() === '已关注';
      },
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false);
  check('A7b 点击关注 → 状态翻转为已关注（mock 写入）', a7);

  const beforeScroll = a6;
  await pageL.evaluate(() => {
    const scroll = document.querySelector('.pd-info-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  });
  await pageL.waitForTimeout(300);
  const afterScroll = await pageL.evaluate(modalLayoutMetrics);
  /* A8 底部操作栏必须**贴住信息列底边**（2026-11-24 用户报障「评论区操作按钮应该贴底部」）。
     ⚠️ 旧期望是 `gap 10~26px`，那是媒体满出血改造**之前**的旧口径（当时信息列有 16px 内衬）；
     改造后内衬归零，实测 gap=1，这条断言从此长红 —— 红得久了就被当成「环境问题」忽略，
     于是真正丢失的「贴底」契约没人守。这次按现状把口径改对，并把它变成会真红的那一条：
       · 贴底：panel↔bar 底边距 ≤ 2px（只允许面板 1px 边框）；
       · 恒定：滚动前后该值不变（滚动不许把按钮顶走）。
     ⚠️ 它守的是**结果**而不是实现。贴底有两条独立通道（.pd-info-scroll 的 flex:1 吃满剩余，
     或 actionbar 自身的 margin-top:auto）；只守前者的话，一旦将来有人换掉 scroll 的 flex，
     按钮浮空而这条仍是绿的。所以这里量的是 bar 与 panel 的实际几何差。 */
  check(
    'A8 评论区滚动后，底部操作栏仍贴住面板底边（且位置恒定）',
    Math.abs(afterScroll.actionbarBottomGap - beforeScroll.actionbarBottomGap) <= 2 &&
      afterScroll.actionbarBottomGap <= 2 &&
      afterScroll.actionbarBottomGap >= 0,
    `gap before=${beforeScroll.actionbarBottomGap} after=${afterScroll.actionbarBottomGap}（要求 ≤2）`,
  );

  // ---- J2 弹窗滚动条隐藏 / J3 作者行固定条 ----
  const j2 = await pageL.evaluate(() => {
    const info = document.querySelector('.pd-info-scroll');
    return info
      ? { scrollbarWidth: getComputedStyle(info).scrollbarWidth }
      : { scrollbarWidth: null };
  });
  check(
    'J2 弹窗信息区滚动条隐藏（scrollbar-width: none）',
    j2.scrollbarWidth === 'none',
    `value=${j2.scrollbarWidth}`,
  );

  const j3Top = await pageL.evaluate(() => {
    const row = document.querySelector('.pd-modal-info > .pd-author-row');
    return row ? Math.round(row.getBoundingClientRect().top) : null;
  });
  check('J3a 作者行为固定条（info 直接子级，不在滚动区内）', j3Top !== null, `top=${j3Top}`);
  await pageL.evaluate(() => {
    const scroll = document.querySelector('.pd-info-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  });
  await pageL.waitForTimeout(250);
  const j3After = await pageL.evaluate(() => {
    const row = document.querySelector('.pd-modal-info > .pd-author-row');
    return row ? Math.round(row.getBoundingClientRect().top) : null;
  });
  check(
    'J3b 评论区滚动后作者条纹丝不动',
    j3Top !== null && j3After !== null && Math.abs(j3After - j3Top) <= 2,
    `before=${j3Top} after=${j3After}`,
  );

  // ---- K 组：评论区小红书式结构（mock 评论数据） ----
  const k0 = await waitForInPage(
    pageL,
    () => ({
      done: document.querySelectorAll('.comment-item-x').length === 2,
    }),
    { timeout: 15000 },
  );
  check('K0 mock 评论渲染（2 条顶层）', Boolean(k0?.done));

  const k1 = await pageL.evaluate(() => {
    const item = document.querySelector('.comment-item-x');
    const cs = item ? getComputedStyle(item) : null;
    return { display: cs?.display, cols: cs?.gridTemplateColumns };
  });
  check(
    'K1 评论条两栏结构（48px 头像列 + 内容列）',
    k1.display === 'grid' && /^48px/.test(k1.cols || ''),
    `display=${k1.display} cols=${k1.cols}`,
  );

  const k2 = await pageL.evaluate(() => ({
    moreBtns: document.querySelectorAll('.comment-more-btn').length,
    delTextInActions: Array.from(document.querySelectorAll('.comment-actions button')).some(
      (b) => b.textContent.trim() === '删除',
    ),
  }));
  check(
    'K2 删除收编「···」（仅本人评论 1 个，动作行无删除文字）',
    k2.moreBtns === 1 && !k2.delTextInActions,
    `moreBtns=${k2.moreBtns}`,
  );

  // 单条子回复且已全载时不显示「展开」链（正确产品逻辑：预览直接可见）
  const k3 = await pageL.evaluate(() => {
    const child = document.querySelector('.child-reply-item');
    const expandLink = document.querySelector('.child-expand-link');
    return {
      childVisible: Boolean(child),
      childText: (child?.textContent || '').includes('楼中楼回复甲'),
      expandLinkHidden: !expandLink,
    };
  });
  check(
    'K3 单条子回复直接预览可见（无需展开链）',
    k3.childVisible && k3.childText && k3.expandLinkHidden,
    JSON.stringify(k3),
  );

  const k4 = await pageL.evaluate(() => {
    const top = document.querySelector('.comment-item-x');
    const child = document.querySelector('.child-reply-item');
    if (!top || !child) return null;
    return Math.round(child.getBoundingClientRect().left - top.getBoundingClientRect().left);
  });
  check(
    'K4 楼中楼缩进对齐顶层内容列（≈60px）',
    k4 !== null && k4 >= 52 && k4 <= 70,
    `indent=${k4}px`,
  );

  await pageL.locator('.comment-like-btn').first().click();
  const k5 = await pageL
    .waitForFunction(
      () => {
        const btn = document.querySelector('.comment-item-x .comment-like-btn');
        return btn && btn.classList.contains('is-liked') && btn.textContent.includes('6');
      },
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false);
  check('K5 评论点赞：RPC mock 返回 → is-liked + 计数 6', k5);
  await pageL.evaluate(() => {
    const scroll = document.querySelector('.pd-info-scroll');
    if (scroll) scroll.scrollTop = 0;
  });
  await pageL.screenshot({ path: `${OUT}/pd-modal-landscape-open.png` }).catch(() => {});

  // ---- A9 无图帖降级：无媒体区 + 单栏信息铺满（**判据必须是 post.hasImages**） ----
  /* ⚠️ 旧实现有两个真错（2026-11-24 实测确认，这条之所以长红不是口径漂移，是选错了对象）：
     ① 选帖判据用的是 `!card.querySelector('.image-post-thumb')` —— 但那是个**懒加载 img**，
        没滚进视口时根本不渲染。于是「没有缩略图」命中的往往是一条**有图帖**，
        打开后 `media:true / hasMediaClass:true`，断言「无媒体区」必然红，且红得毫无意义。
        实测当前 feed 的 12 张卡**全是 hasImages:true**（一条无图帖都没有），
        旧判据却照样挑出一张来测 —— 等于每次都在用有图帖冒充无图帖。
     ② `infoFullWidth` 判 `|infoW - (panelW-32)| <= 4` —— 那 32 是媒体满出血改造**之前**的
        外层 16px×2 内衬。改造后容器内衬归零，info 应当是**整格宽**（只差面板 1px 边框），
        旧式子在满出血下永远差 30px ⇒ 即使真拿到无图帖也会红。
     现在：判据换成卡片上的 `image-post-card-v2` 类（由 `post.hasImages` 驱动，与懒加载无关）；
     断言改成「无媒体区 + 无 has-media 标记 + info 铺满整格」。
     ③ **广告位也带 `.post-card-v2`**（`ad-slot ad-slot-fixed`，实测 feed 里 12 张卡有 2 张是它）。
        广告卡没有 post、没有标题、没有缩略图 ⇒ 旧判据「没有 .image-post-thumb」**恰好优先命中广告卡**，
        随后 `clickCardAt` 去点 `.post-title-v2` 的第 N 个 —— 而它根本不存在，
        于是点到了**另一个真实帖子**（有图），这才是 A9 长红的最终真因。
        选帖必须用 `:not(.ad-slot)` 排除广告位。 */
  await pageL.keyboard.press('Escape');
  await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  /* ⚠️ 必须等 overlay 节点**真的从 DOM 移除**再开下一个（2026-11-24 踩到）。
     `modalClosedState` 只看 hash 前缀，而关闭是带离场过渡的 —— 实测此时旧 overlay 还挂在
     文档里。随后 `waitForInPage(readA9)` 第一次轮询就命中**旧面板**（有图的），
     读出 `media:true` + `panelW:760`（新旧两棵树的尺寸混在一起，数值自相矛盾），
     断言必红且红错原因。 */
  await pageL
    .waitForFunction(() => !document.querySelector('.pd-modal-overlay'), { timeout: 10000 })
    .catch(() => {});
  const textOnlyTarget = await pageL.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.post-card-v2'));
    // image-post-card-v2 由 post.hasImages 决定，**不受缩略图懒加载影响**（旧判据就栽在这）
    const card = cards.find(
      (c) => !c.classList.contains('ad-slot') && !c.classList.contains('image-post-card-v2'),
    );
    return card ? String(card.dataset.forumPostId || '') : '';
  });
  const textOnlyIndex = await pageL.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.post-card-v2'));
    return cards.findIndex(
      (card) =>
        !card.classList.contains('ad-slot') && !card.classList.contains('image-post-card-v2'),
    );
  });
  if (textOnlyIndex >= 0 && textOnlyTarget) {
    const readA9 = () => {
      const overlay = document.querySelector('.pd-modal-overlay');
      if (!overlay) return { done: false };
      const panel = overlay.querySelector('.pd-modal-panel');
      const info = overlay.querySelector('.pd-modal-info');
      const body = overlay.querySelector('.pd-modal-body');
      const p = panel ? panel.getBoundingClientRect() : null;
      const i = info ? info.getBoundingClientRect() : null;
      return {
        done: Boolean(body),
        media: Boolean(overlay.querySelector('.pd-modal-media')),
        hasMediaClass: Boolean(overlay.querySelector('.pd-modal-body--has-media')),
        panelW: p ? Math.round(p.width) : null,
        infoW: i ? Math.round(i.width) : null,
        infoLeftGap: p && i ? Math.round(i.left - p.left) : null,
        infoRightGap: p && i ? Math.round(p.right - i.right) : null,
        bodyCols: body ? getComputedStyle(body).gridTemplateColumns : null,
        // 满出血口径：info 只该让出面板左右各 1px 边框
        infoFillsCell: Boolean(p && i && Math.abs(i.width - (p.width - 2)) <= 4),
      };
    };
    await clickCardAt(pageL, textOnlyIndex);
    await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
    let a9 = await waitForInPage(pageL, readA9, { timeout: 20000 });
    if (!a9?.done) {
      const emptyState = await pageL.evaluate(() =>
        Boolean(document.querySelector('.pd-modal-overlay .boh-empty-state')),
      );
      if (emptyState) {
        console.log('  [A9] 详情加载空态（真库抖动），关闭重开重试');
        await pageL.keyboard.press('Escape');
        await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
        await pageL
          .waitForFunction(() => !document.querySelector('.pd-modal-overlay'), { timeout: 10000 })
          .catch(() => {});
        await clickCardAt(pageL, textOnlyIndex);
      }
      a9 = await waitForInPage(pageL, readA9, { timeout: 25000 });
    }
    /* 带上实际悬停的帖子 id：这一条历史上「红错原因」过，必须让输出能自证对象没选错。 */
    const openedId = await pageL.evaluate(() => {
      const m = /#\/forum\/post\/([^/?#]+)/.exec(location.hash || '');
      return m ? decodeURIComponent(m[1]) : '';
    });
    check(
      'A9 无图帖：无媒体区、info 单栏铺满整格',
      Boolean(a9?.done) && !a9.media && !a9.hasMediaClass && a9.infoFillsCell,
      `目标帖 ${textOnlyTarget} / 实开 ${openedId}｜${JSON.stringify(a9 || {})}`,
    );
    await pageL.keyboard.press('Escape');
    await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  } else {
    /* 当前 feed 一条无图帖都没有（2026-11-24 实测：12 张卡全 hasImages:true）。
       ⚠️ 这里刻意打 SKIP 而不是「假装通过」—— 无图帖单栏只是**没被覆盖**，
       不是「已验证」；要真覆盖得让 fixture 带一条无图帖，属于探针数据问题，
       别把 SKIP 读成绿色。 */
    check(
      'A9 无图帖降级（feed 无无图帖，SKIP —— 该路径本轮未被覆盖）',
      true,
      'skip: 当前 feed 无 hasImages:false 的帖子',
    );
  }

  // ---- B Esc 关闭 ----
  await pageL.keyboard.press('Escape');
  const b1 = await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  check('B1 Esc 关闭 + URL 还原到 /user-space', Boolean(b1?.done), `hash=${b1?.hash || ''}`);
  const b2 = await pageL.evaluate(() => ({
    overflow: document.body.style.overflow,
    cards: document.querySelectorAll('.post-card-v2').length,
  }));
  check('B2 body 滚动锁解除', b2.overflow === '', `overflow="${b2.overflow}"`);

  // ---- C 后退关闭 ----
  await clickTargetCard();
  const c0 = await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
  check('C0 再次打开弹窗（列表可复用）', Boolean(c0?.hasOverlay));
  await pageL.goBack();
  const c1 = await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  check('C1 浏览器后退 = 关弹窗 + URL 还原', Boolean(c1?.done), `hash=${c1?.hash || ''}`);
  const c2 = await waitForInPage(
    pageL,
    () => ({ done: document.querySelectorAll('.post-card-v2').length > 0 }),
    { timeout: 10000 },
  );
  check('C2 后退后列表仍可交互', Boolean(c2?.done));

  // ---- D 遮罩点击关闭 ----
  await clickTargetCard();
  await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
  await pageL.mouse.click(10, 400);
  const d1 = await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  check('D1 点击遮罩关闭 + URL 还原', Boolean(d1?.done), `hash=${d1?.hash || ''}`);

  // ---- E 关闭按钮 ----
  await clickTargetCard();
  await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
  await pageL.locator('.pd-modal-close').click();
  const e1 = await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  check('E1 关闭按钮关闭 + URL 还原', Boolean(e1?.done), `hash=${e1?.hash || ''}`);

  // ---- G 判据失配自动关（旋转退出横屏） ----
  await clickTargetCard();
  await waitForInPage(pageL, modalOpenState, { timeout: 20000 });
  await pageL.setViewportSize({ width: 800, height: 900 });
  const g1 = await waitForInPage(pageL, modalClosedState, { timeout: 10000 });
  check('G1 退出横屏自动关弹窗 + URL 还原', Boolean(g1?.done), `hash=${g1?.hash || ''}`);

  await ctxL.close();

  // ============ 竖屏组（480×800，保持整页路由现状） ============
  const ctxP = await browser.newContext({ viewport: { width: 480, height: 800 } });
  const pageP = await ctxP.newPage();
  await setupDetailRoutes(pageP);
  await openCommunity(pageP);
  await injectAuth(pageP);
  await clickFirstCard(pageP);
  await pageP.waitForSelector('.post-detail-page:not(.post-detail-page--modal)', {
    timeout: 30000,
  });
  const f1 = await pageP.evaluate(() => ({
    overlay: Boolean(document.querySelector('.pd-modal-overlay')),
    hash: window.location.hash || '',
    header: Boolean(document.querySelector('.user-center-page-header')),
    authorBarBack: Boolean(document.querySelector('.pd-author-bar-back')),
  }));
  check(
    'F1 竖屏无弹窗、走整页路由',
    !f1.overlay && /^#\/forum\/post\//.test(f1.hash),
    `hash=${f1.hash}`,
  );
  check('F2 窄屏身份条返回钮接管（替代通用页头）', f1.authorBarBack && !f1.header);

  // ---- J4 竖屏连续内容：主帖/评论玻璃壳透明化 ----
  await pageP.waitForSelector('.x-main-column', { timeout: 30000 });
  const j4 = await pageP.evaluate(() => {
    const mainCol = document.querySelector('.x-main-column');
    const sideContent = document.querySelector('.post-detail-page .x-side-content');
    const gap = getComputedStyle(document.querySelector('.post-x-layout')).rowGap;
    return {
      mainBg: mainCol ? getComputedStyle(mainCol).backgroundColor : null,
      mainBorder: mainCol ? getComputedStyle(mainCol).borderTopStyle : null,
      sideBg: sideContent ? getComputedStyle(sideContent).backgroundColor : null,
      layoutGap: gap,
    };
  });
  check(
    'J4 竖屏连续内容（主帖/评论玻璃壳透明 + 无分段间距）',
    j4.mainBg === 'rgba(0, 0, 0, 0)' &&
      j4.mainBorder === 'none' &&
      j4.sideBg === 'rgba(0, 0, 0, 0)',
    JSON.stringify(j4),
  );
  await pageP.screenshot({ path: `${OUT}/pd-modal-portrait-page.png` }).catch(() => {});

  // ---- H 组：竖屏底部固定操作栏（底栏接管，卡内动作栏移除） ----
  await injectAuth(pageP);
  await pageP.waitForSelector('.pd-actionbar--page', { timeout: 20000 });
  const h1 = await pageP.evaluate(() => {
    const dock = document.querySelector('.pd-actionbar--page');
    const style = dock ? getComputedStyle(dock) : null;
    return {
      exists: Boolean(dock),
      position: style ? style.position : null,
      cardFooterGone: !document.querySelector('.post-footer'),
      inlineComposerGone: !document.querySelector('.x-reply-box'),
    };
  });
  check('H1 整页渲染 fixed 底栏', h1.exists && h1.position === 'fixed', `position=${h1.position}`);
  check('H2 卡内动作栏已移除（底栏接管）', h1.cardFooterGone);
  check('H3 评论区无内嵌输入框（hideComposer）', h1.inlineComposerGone);

  const hasReplyBtn = await pageP.evaluate(() =>
    Boolean(document.querySelector('.comment-reply-btn-mini')),
  );
  if (hasReplyBtn) {
    await pageP.locator('.comment-reply-btn-mini').first().click();
    await pageP.waitForTimeout(400);
    const h4 = await pageP.evaluate(() => {
      const input = document.querySelector('.pd-actionbar--page .pd-reply-input');
      return {
        placeholder: input ? input.placeholder : null,
        focused: Boolean(input && document.activeElement === input),
      };
    });
    check(
      'H4 点评论回复 → 底栏接管上下文并聚焦',
      Boolean(h4.placeholder && h4.placeholder.startsWith('回复 @')),
      `placeholder=${h4.placeholder}`,
    );
  } else {
    check('H4 点评论回复 → 底栏接管（该帖无评论，SKIP）', true, 'skip: no comments');
  }
  await pageP.screenshot({ path: `${OUT}/pd-portrait-dock.png` }).catch(() => {});

  // ---- L 组：竖屏 Threads 式排版 ----
  await pageP.waitForSelector('.pd-author-bar', { timeout: 20000 });
  const l1 = await pageP.evaluate(() => ({
    bar: Boolean(document.querySelector('.pd-author-bar')),
    back: Boolean(document.querySelector('.pd-author-bar-back')),
    identity: Boolean(document.querySelector('.pd-author-bar-identity')),
    follow: Boolean(document.querySelector('.pd-author-bar-follow')),
    shareInBar: Boolean(document.querySelector('.pd-author-bar-share')),
    fixed: document.querySelector('.pd-author-bar')
      ? getComputedStyle(document.querySelector('.pd-author-bar')).position
      : null,
    followLabel:
      (document.querySelector('.pd-author-bar-follow') || {}).textContent?.trim() || null,
    genericHeader: Boolean(document.querySelector('.user-center-page-header')),
  }));
  check(
    'L1 头部身份条四元素（返回/头像昵称/关注）且固定屏幕',
    l1.bar && l1.back && l1.identity && l1.follow && !l1.shareInBar && l1.fixed === 'fixed',
    JSON.stringify(l1),
  );
  check('L2 通用页头在窄屏退位', !l1.genericHeader);

  await pageP.waitForSelector('.x-post-card-media', { timeout: 20000 });
  const l2 = await pageP.evaluate(() => {
    const media = document.querySelector('.x-post-card-media');
    const stage = media ? media.querySelector('.post-detail-image-stage') : null;
    const left = media ? Math.round(media.getBoundingClientRect().left) : null;
    const stageRadius = stage ? getComputedStyle(stage).borderTopLeftRadius : null;
    return { left, stageRadius };
  });
  check(
    'L3 媒体全出血贴屏（左缘≈0、无圆角）',
    l2.left !== null && Math.abs(l2.left) <= 2 && l2.stageRadius === '0px',
    `left=${l2.left} radius=${l2.stageRadius}`,
  );

  const l3 = await pageP.evaluate(() => ({
    endMark: Boolean(document.querySelector('.comments-end-mark')),
    endText: (document.querySelector('.comments-end-mark') || {}).textContent?.trim() || null,
    sectionHead: Boolean(document.querySelector('.pd-comments-head--page')),
    headText: (document.querySelector('.pd-comments-head--page') || {}).textContent?.trim() || null,
  }));
  check(
    'L4 评论区段头（共 N 条评论）',
    l3.sectionHead && /共 \d+ 条评论/.test(l3.headText || ''),
    `head=${l3.headText}`,
  );
  check(
    'L5 到底标记（- 到底啦 -）',
    l3.endMark && /到底/.test(l3.endText || ''),
    `text=${l3.endText}`,
  );

  const l4 = await pageP.evaluate(() => {
    const btn = document.querySelector('.pd-actionbar--page .pd-action-btn');
    return btn ? getComputedStyle(btn).flexDirection : null;
  });
  check('L6 底栏动作图标+文字横排', l4 === 'row', `direction=${l4}`);

  const l5 = await pageP.evaluate(() => {
    const wrap = document.querySelector('.x-post-card .author-section .boh-avatar-wrap');
    return wrap ? getComputedStyle(wrap).display : null;
  });
  check('L7 内容区作者行精简（头像隐藏，身份在头部）', l5 === 'none', `display=${l5}`);

  await pageP.screenshot({ path: `${OUT}/pd-portrait-threads.png` }).catch(() => {});
  await ctxP.close();

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('PROBE ERROR:', error);
  process.exit(1);
});
