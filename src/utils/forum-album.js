/**
 * 影集帖（album post）—— 唯一真源。
 *
 * ## 形态：A 投影（2026-11-14 定稿，2026-11-15 补「一人一本」）
 * 影集帖**就是**一条普通帖子，不新建表、不复制图片：
 *   - `profiles.album_title/album_intro` → 影集名与简介（**一人一本，只在这存一次**）
 *   - `posts.title`        → 影集名（denormalized，供信息流卡片直接读；改名时回写）
 *   - `posts.content/body` → 这一篇的卷首配文（可空）
 *   - `forum_post_images`  → 照片（与普通帖同一套上传/审核/画质管线，**必传**）
 *   - `posts.album_entries`→ **每张照片**的文字 `[{ title, date, place, body }]`，
 *                            **按 sort_order 与图片一一对齐，不存 url**
 *
 * 发布流程：**初次创建**填名称 + 简介（`set_forum_album_book`）；
 * 之后每次只写配文 + 图。所以「一本影集」= 该用户的全部影集帖按时间倒序。
 *
 * ## 用语（2026-11-15 用户纠正，改任何可见文案前必读）
 *   · **本** = 一个人的影集（一人一本）
 *   · **篇** = **一次发布**（= 一条 `posts` 行）。**「篇」绝不指单张照片**
 *   · **张** = 篇内的照片（1..10 张，每张各带一段文字）
 *   ⚠️ `album_entries` 的每个元素是「**一张**照片的文字」。内部命名沿用 DB 列名，
 *      但用户可见文案一律写「张」；界面上「篇数」= 影集里的帖子条数。
 *
 * 因此「个人影集」只需读 `album_entries` 非空的帖子即可（零复制、零漂移），
 * 想换成正式摄影集时再单向物化。
 *
 * ⚠️ 三条硬约束（改动前先读）：
 * 1. **不在 entries 里存图片地址**。存了就是第二份副本，删图/换图会立刻漂移
 *    （plans/039 §9.2 已实测过 forum_post_images ↔ boh_cloud_entries 的单向漂移）。
 * 2. **上限只在这里定义一次**（`ALBUM_MAX_ENTRIES`）。发帖器、校验、RPC 参数都读它，
 *    服务端另有一份 SQL 常量 —— 两处必须同时改（迁移里带注释标注）。
 * 3. 空 entries 一律视为「普通帖」，展示层靠 `isAlbumPost()` 分派，**不要**用
 *    `post_kind === 'album'`：那会牵动 DB check 约束与 list RPC 的 kind 过滤器。
 */

/** 一篇最多几张照片（= `album_entries` 的最大长度）。服务端 `create_album_post_with_images` 同值。 */
export const ALBUM_MAX_ENTRIES = 10;

/** 每张照片的标题 / 地点长度上限（与发帖器输入框 maxlength 对齐）。 */
export const ALBUM_ENTRY_TITLE_MAX = 16;
export const ALBUM_ENTRY_PLACE_MAX = 16;
export const ALBUM_ENTRY_DATE_MAX = 12;
export const ALBUM_ENTRY_BODY_MAX = 2000;

const toText = (value) => String(value ?? '').trim();

const clip = (value, max) => {
  const text = toText(value);
  return max > 0 && text.length > max ? text.slice(0, max) : text;
};

/**
 * 把任意来源的 entries 归一成 `[{ title, date, place, body }]`。
 * - 非法/空元素被丢弃，长度按 `ALBUM_MAX_ENTRIES` 截断
 * - `body` 保留内部换行（段间空行由 `\n\n` 表达），不做 markdown 解析
 * - 输入可以是 JSON 字符串（RPC/本地草稿偶尔会给字符串）
 */
export function normalizeAlbumEntries(raw) {
  let source = raw;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];

  return source
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const title = clip(entry.title, ALBUM_ENTRY_TITLE_MAX);
      const date = clip(entry.date ?? entry.taken_on ?? entry.takenOn, ALBUM_ENTRY_DATE_MAX);
      const place = clip(entry.place ?? entry.location, ALBUM_ENTRY_PLACE_MAX);
      const body = clip(entry.body ?? entry.text ?? entry.caption, ALBUM_ENTRY_BODY_MAX);
      // 四个字段全空 = 这一张还没写字，留着（图片已经在了，位置必须对齐）
      return { title, date, place, body };
    })
    .filter(Boolean)
    .slice(0, ALBUM_MAX_ENTRIES);
}

/** 这条帖子是不是影集帖（**唯一判据**）。 */
export function isAlbumPost(post) {
  if (!post) return false;
  const entries = post.album_entries ?? post.albumEntries;
  if (Array.isArray(entries)) return entries.length > 0;
  return false;
}

/**
 * 这一篇里有几张照片：以 entries 为准，缺 entries 时退回图片数（老数据兜底）。
 * 返回值直接用于界面上的「N 张」——**不是篇数**，篇数由调用方按 posts 条数算。
 */
export function getAlbumPhotoCount(post) {
  const entries = normalizeAlbumEntries(post?.album_entries ?? post?.albumEntries);
  if (entries.length) return entries.length;
  const images = post?.images || post?.forum_post_images || [];
  return Array.isArray(images) ? Math.min(images.length, ALBUM_MAX_ENTRIES) : 0;
}

/**
 * 取第 index 张照片的文字；越界时返回空结构（渲染不要因为 entries 比图少就崩）。
 */
export function getAlbumEntry(post, index = 0) {
  const entries = normalizeAlbumEntries(post?.album_entries ?? post?.albumEntries);
  const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
  return entries[safeIndex] || { title: '', date: '', place: '', body: '' };
}

/** 发帖器初始化：按图片数生成同长度的空 entries（保证图与字一一对齐，一张一条）。 */
export function buildEmptyAlbumEntries(count = 0) {
  const total = Math.max(0, Math.min(Number(count) || 0, ALBUM_MAX_ENTRIES));
  return Array.from({ length: total }, () => ({ title: '', date: '', place: '', body: '' }));
}

/**
 * 图片增删后重新对齐 entries：
 * entries 与图片按下标对应，删第 2 张时第 3 张的文字必须跟着前移，不能错位。
 * @param {Array} entries 现有 entries
 * @param {number} nextCount 变更后的图片数
 */
export function syncAlbumEntriesToCount(entries, nextCount) {
  const total = Math.max(0, Math.min(Number(nextCount) || 0, ALBUM_MAX_ENTRIES));
  const safe = normalizeAlbumEntries(entries);
  if (safe.length === total) return safe;
  if (safe.length > total) return safe.slice(0, total);
  return safe.concat(buildEmptyAlbumEntries(total - safe.length));
}

/**
 * 发给 RPC 的 entries 载荷：逐张输出（含没写字的空白项），并**保留原始下标**
 * （服务端按 `image_index` 与图片对齐，不能压缩掉中间的空缺）。
 */
export function toAlbumEntriesRpcPayload(entries) {
  const safe = normalizeAlbumEntries(entries);
  return safe.map((entry, index) => ({
    image_index: index,
    title: entry.title,
    date: entry.date,
    place: entry.place,
    body: entry.body,
  }));
}

/**
 * 影集帖是否可发布（2026-11-15 流程定稿）：
 *   - **图必传**（1..10 张）
 *   - **配文可空**（"每次发布可以写配文" ⇒ 允许只传图）
 * 名称与简介不在这里校验：它们属于「影集本体」，初次创建时写入 profiles，
 * 之后的每次发布只写配文 + 图（见 utils/forum-album.js 顶部的形态说明）。
 */
export function validateAlbumDraft({ entries, imageCount } = {}) {
  const count = Number(imageCount) || 0;
  if (count < 1) return { ok: false, code: 'NO_IMAGE', message: '这一篇至少要有 1 张照片' };
  if (count > ALBUM_MAX_ENTRIES) {
    return {
      ok: false,
      code: 'TOO_MANY_IMAGES',
      message: `一篇最多 ${ALBUM_MAX_ENTRIES} 张照片`,
    };
  }
  void entries;
  return { ok: true, code: 'OK', message: '' };
}

/** 影集名称 / 简介长度上限（与服务端 profiles_album_meta_shape 约束同值）。 */
export const ALBUM_TITLE_MAX = 30;
export const ALBUM_INTRO_MAX = 200;

/** 影集本体元数据归一：`{ title, intro }`（一人一本，空 title = 还没建过）。 */
export function normalizeAlbumBook(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    title: clip(source.title ?? source.album_title, ALBUM_TITLE_MAX),
    intro: clip(source.intro ?? source.album_intro, ALBUM_INTRO_MAX),
  };
}

/** 影集本体是否已创建（决定发帖器显示「名称/简介」还是「配文」）。 */
export function hasAlbumBook(book) {
  return Boolean(normalizeAlbumBook(book).title);
}
