const DEFAULT_POST_TITLE = '无标题';

/**
 * 去掉正文开头残留的 `【标题】` 前缀。
 *
 * ⚠️ 这是**数据契约**的一半（另一半是 `splitForumPostContent` 的锚定解析），
 * `src/utils/api/forum-format.js` 直接委托到这里 —— 全仓只有这一份实现。
 * 展示层要的是另一套宽松口径（见文件末尾 `extractDisplayPostTitle`），
 * 两者**故意不同**：这里必须锚定行首，否则正文中间出现的 `【求助】` 会被误删。
 */
export function stripLegacyTitlePrefix(body = '', title = '') {
  const safeBody = String(body || '').trim();
  const safeTitle = String(title || '').trim();
  if (!safeBody) return '';
  if (!safeTitle) return safeBody.replace(/^【[^】]+】\s*/, '');
  const titlePattern = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeBody.replace(new RegExp(`^【\\s*${titlePattern}\\s*】\\s*`), '');
}

export function splitForumPostContent(content = '', title = '', body = '') {
  const explicitTitle = String(title || '').trim();
  const explicitBody = String(body || '').trim();

  if (explicitTitle || explicitBody) {
    return {
      title: explicitTitle || DEFAULT_POST_TITLE,
      body: stripLegacyTitlePrefix(explicitBody, explicitTitle)
    };
  }

  const raw = String(content || '').trim();
  if (!raw) {
    return { title: DEFAULT_POST_TITLE, body: '' };
  }

  const match = raw.match(/^【(.*?)】\n?([\s\S]*)$/);
  if (!match) {
    return { title: DEFAULT_POST_TITLE, body: raw };
  }

  const parsedTitle = String(match[1] || '').trim();
  return {
    title: parsedTitle || DEFAULT_POST_TITLE,
    body: stripLegacyTitlePrefix(String(match[2] || '').trim(), parsedTitle)
  };
}

export function getForumPostParts(postOrContent = {}) {
  if (postOrContent && typeof postOrContent === 'object') {
    return splitForumPostContent(postOrContent.content, postOrContent.title, postOrContent.body);
  }
  return splitForumPostContent(postOrContent);
}

export function getForumPostTitle(postOrContent = {}) {
  return getForumPostParts(postOrContent).title;
}

export function getForumPostBody(postOrContent = {}) {
  return getForumPostParts(postOrContent).body;
}

export function getForumPostExcerpt(postOrContent = {}, maxLength = 80) {
  const body = getForumPostBody(postOrContent);
  const title = getForumPostTitle(postOrContent);
  const text = String(body || title || '').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/* ─────────────────────────────────────────────────────────────────────────
   展示层口径（宽松）—— 与上面的数据契约**故意不同**，别再合并。

   数据契约（`splitForumPostContent`）要求 `【标题】` 必须**锚定行首**，否则正文中间的
   `【求助】` 会被当成标题删掉，写库时就丢了用户原文。
   但列表卡与详情页的展示一直是宽松口径：全文第一个 `【…】` 就当标题，正文则去掉
   第一个 `【…】` 再清残留前缀。两种口径各自被两个视图复制过（ForumMain / PostDetailMain），
   2026-10-30 收口到这里：**一份模块、两个契约**，而不是四份副本。
   ⚠️ 改这里等于改「老数据在列表里显示成什么」，属于可见变更，必须走截图/探针。
   ───────────────────────────────────────────────────────────────────────── */

/** 展示用标题：显式 title 优先，否则取正文里**任意位置**第一个 `【…】`。 */
export function extractDisplayPostTitle(postOrContent) {
  let source = postOrContent;
  if (source && typeof source === 'object') {
    const explicitTitle = String(source.title || '').trim();
    if (explicitTitle) return explicitTitle;
    source = source.content;
  }
  const safeContent = String(source || '').trim();
  return safeContent.match(/【(.*?)】/)?.[1] || DEFAULT_POST_TITLE;
}

/** 展示用正文：显式 body 优先，否则去掉第一个 `【…】` 并清掉残留前缀。 */
export function extractDisplayPostBody(postOrContent) {
  const title = extractDisplayPostTitle(postOrContent);
  let source = postOrContent;
  if (source && typeof source === 'object') {
    const explicitBody = String(source.body || '').trim();
    if (explicitBody) return stripLegacyTitlePrefix(explicitBody, title);
    source = source.content;
  }
  return stripLegacyTitlePrefix(String(source || '').replace(/【.*?】\n?/, ''), title);
}

/* ─────────────────────────────────────────────────────────────────────────
   内容类型派生 —— 单源（2026-10-30 P2-2）

   这段逻辑曾被复制 4 份：post-api 的 `rowKind`、post-api 旧 RPC 降级分支里的
   `kindOfRow`、ForumMain 的 `prepareForumPosts`、ForumMain 的 `hydrateOfficialPostKinds`。
   而且**已经漂移**：数据层两处兜底是 'post'，视图层两处是 'unknown'。
   当前不出事只因为 `matchesForumContentKind` 把两者都归进「普通帖」，但
   `hydrateOfficialPostKinds` 会把这个值写回 `post_kind` ⇒ 同一条老数据经
   「列表接口」与「详情页/官方目录补全」两条链路，落库值可能是 post 或 unknown。

   所以兜底值**做成显式参数**，不统一成其中一个（统一哪个都是在改数据）。
   ───────────────────────────────────────────────────────────────────────── */

/**
 * 一行内容属于哪类。
 * @param {object} row 帖子行（读 `post_kind` / `content` / `title`）
 * @param {object} [options]
 * @param {string} [options.fallback='post'] 都判不出来时的兜底值
 *   （数据层用 'post'，视图层用 'unknown' —— 历史口径不同，别改）
 * @param {{newsByTitle?: Set<string>, activityByTitle?: Set<string>}} [options.titleIndex]
 *   官方目录索引：老数据没有 `post_kind` 也没有 `【新闻】/【活动】` 前缀时，
 *   按标题去官方目录里认（仅详情页/列表补全链路用）
 */
export function deriveForumPostKind(row, options = {}) {
  const { fallback = 'post', titleIndex = null } = options;
  const explicit = String(row?.post_kind || '').trim();
  if (explicit) return explicit;

  const content = String(row?.content || '');
  if (/^【新闻】/.test(content)) return 'news';
  if (/^【活动】/.test(content)) return 'activity';

  if (titleIndex) {
    const title = String(row?.title || '').trim();
    if (titleIndex.newsByTitle?.has?.(title)) return 'news';
    if (titleIndex.activityByTitle?.has?.(title)) return 'activity';
  }

  return fallback;
}
