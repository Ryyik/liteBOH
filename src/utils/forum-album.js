/**
 * 图文帖（album post）—— 唯一真源。
 *
 * ## 形态：A 投影 + 2026-11-16 降级为「发帖格式」
 * 图文帖**就是**一条普通帖子，不新建表、不复制图片：
 *   - `posts.title`        → 这一篇的标题（就是普通帖的标题，不再是「影集名」）
 *   - `posts.content/body` → 这一篇的配文（可空）
 *   - `forum_post_images`  → 照片（与普通帖同一套上传/审核/画质管线，**必传**）
 *   - `posts.album_entries`→ **每张照片**的文字 `[{ title, date, place, body }]`，
 *                            **按 sort_order 与图片一一对齐，不存 url**
 *   - 字体                 → **固定宋体**（`ALBUM_FONT_STACK`），不落库、不可选；
 *                            普通帖不涉及
 *   - `posts.is_album`     → 生成列（`album_entries` 非空），只用于「我的图文」筛选
 *
 * ## 发布流程（2026-11-16 用户定稿）
 * 没有「建本」、没有三步、没有开场动画：发帖器里一个**格式切换**（常规 ⇄ 图文），
 * 选图文就是「多图 + 每张各写一段」，一屏写完，点一次「发布图文」。
 * 切换格式不清空任何已填内容（标题 / 正文 / 图片 / 逐张配字全部保留）。
 * `profiles.album_title / album_intro` 与 `set_forum_album_book` **不再使用**
 * （老数据还在，读出来也不展示，留给以后可能的重建）。
 *
 * ## 用语（2026-11-16 更新）
 *   · **图文** = 这个格式本身（界面上一律用这个词，不再叫「影集」）
 *   · **条** = 一次发布（= 一条 `posts` 行）
 *   · **张** = 篇内的照片（1..10 张，每张各带一段文字）
 *
 * ⚠️ 三条硬约束（改动前先读）：
 * 1. **不在 entries 里存图片地址**。存了就是第二份副本，删图/换图会立刻漂移
 *    （plans/039 §9.2 已实测过 forum_post_images ↔ boh_cloud_entries 的单向漂移）。
 * 2. **上限只在这里定义一次**（`ALBUM_MAX_ENTRIES`）。发帖器、校验、RPC 参数都读它，
 *    服务端另有一份 SQL 常量 —— 两处必须同时改（迁移里带注释标注）。
 * 3. 空 entries 一律视为「常规帖」，展示层靠 `isAlbumPost()` 分派，**不要**用
 *    `post_kind === 'album'`：那会牵动 DB check 约束与 list RPC 的 kind 过滤器。
 */

/** 一篇最多几张照片（= `album_entries` 的最大长度）。服务端 `create_album_post_with_images` 同值。 */
export const ALBUM_MAX_ENTRIES = 10;

/** 每张照片的标题 / 地点长度上限（与发帖器输入框 maxlength 对齐）。 */
export const ALBUM_ENTRY_TITLE_MAX = 16;
export const ALBUM_ENTRY_PLACE_MAX = 16;
export const ALBUM_ENTRY_DATE_MAX = 12;
export const ALBUM_ENTRY_BODY_MAX = 2000;

/**
 * 图文帖的字体 —— **固定宋体**（2026-11-16 用户定稿：只保留一种，不再给选择）。
 *
 * 字体栈只在这里写一份：发帖器预览、信息流卡片、阅读层三处都读它，
 * 任何一处另写一份都会让「编辑器是宋体、卡片却是别的字体」。
 * 纯系统字体、零下载：macOS/iOS 落 Songti，Windows 落 SimSun。
 *
 * 不落库（原先的 `posts.album_font` 与迁移 2026111602 已撤销）：
 * 只有一种字体时存一列恒等值，等于给自己留一个会漂移的第二真源。
 */
export const ALBUM_FONT_STACK =
  "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', STSong, SimSun, serif";

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
 * 图文帖是否可发布：
 *   - **图必传**（1..10 张）
 *   - **配文可空**（"每次发布可以写配文" ⇒ 允许只传图）
 * 标题与配文都不强制：标题最终由发布链路统一兜（见 ForumMain.handlePost）。
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
