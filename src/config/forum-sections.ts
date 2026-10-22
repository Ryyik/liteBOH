/**
 * 方块（论坛）分区单源
 *
 * 两处共用同一份分区定义 —— 原先这套定义长在 UserSpaceMain.vue 内部，
 * 首页下滑直达的论坛复用时若再抄一份必然漂移，故抽到这里做唯一真源。
 *
 * 消费方：
 *   · views/user-center/UserSpace/components/ForumSectionShell.vue（分区壳本体）
 *   · views/user-center/UserSpace/UserSpaceMain.vue（合法 view 值集合）
 *   · views/Home/index.vue（首页 `/` 下滑直达时把 view 写回 URL）
 */

export type ForumSectionId = 'official' | 'latest' | 'following' | 'news' | 'activity' | 'members';

/** ForumMain 能承载的四个分区（其余走独立面板） */
export type ForumExternalFeed = 'latest' | 'following' | 'news' | 'activity';

export interface ForumSectionItem {
  id: ForumSectionId;
  label: string;
}

/**
 * 六席（2026-10-01 由七席收掉「印象」）。**官方居首是用户指定**，
 * 但默认落点仍是「最新」—— 两者是独立的：要改默认落点只改 FORUM_DEFAULT_SECTION。
 *
 * 「印象」已移出论坛成为「我」页的第三个分段（plans/022 §4.5），原因有两条：
 *   ① 「我看我收到的印象」与「别人看我主页的印象」是同一份数据的私人/公开两侧，
 *      论坛分区是给别人的内容面，自己收的印象不该混在里面；
 *   ② 它天然是「管理自己的资产」，与「资产」分段同类。
 * 旧深链 `?view=impressions` 会被 resolveForumSection 优雅回落成「最新」，
 * 不做 404 —— 见下。
 */
export const FORUM_SECTION_ITEMS: ForumSectionItem[] = [
  { id: 'official', label: '官方' },
  { id: 'latest', label: '最新' },
  { id: 'following', label: '关注' },
  /* 2026-10-22：「新闻」「活动」两席合并为「资讯」——
     **指的是论坛里官方的新闻 + 活动内容**，不是跳去 /newsroom 资讯页。
     id 沿用 'news'（旧深链 `?view=news` 不改），ForumMain 收到 news 分区时
     映射成 kindFilter 'info' 同时拉两类，见 ForumMain 的 externalFeed watch。
     activity 席已撤（不再显示），但 id 仍在 FORUM_SECTION_IDS 里 ⇒
     旧链接 `?view=activity` 仍能渲染活动流，不会 404。 */
  { id: 'news', label: '资讯' },
  { id: 'members', label: '成员' },
];

/* ⚠️ 不再严格等于 items.map(id)：activity 已从展示列表撤掉，但保留为合法 view
   （旧深链兼容）。别为了「好看」把它从 ids 里删掉，那会让老链接落到默认分区。 */
export const FORUM_SECTION_IDS: ForumSectionId[] = [
  ...FORUM_SECTION_ITEMS.map((item) => item.id),
  'activity',
];

/** 默认分区：官方仅排序居首，默认落点仍为最新 */
export const FORUM_DEFAULT_SECTION: ForumSectionId = 'latest';

/** 由 ForumMain（AsyncForum）承载的分区 */
export const FORUM_FEED_SECTIONS: ForumExternalFeed[] = ['latest', 'following', 'news', 'activity'];

export const isForumSection = (value: unknown): value is ForumSectionId =>
  FORUM_SECTION_IDS.includes(String(value) as ForumSectionId);

export const isForumFeedSection = (value: unknown): value is ForumExternalFeed =>
  FORUM_FEED_SECTIONS.includes(String(value) as ForumExternalFeed);

/** 非法/缺失的 view 一律回落默认分区（URL 深链与路由 watch 共用同一口径） */
export const resolveForumSection = (value: unknown): ForumSectionId =>
  isForumSection(value) ? (String(value) as ForumSectionId) : FORUM_DEFAULT_SECTION;

/** 分区 → ForumMain 的 externalFeed；非 feed 分区回落 latest（ForumMain 不接受空值） */
export const resolveExternalFeed = (value: unknown): ForumExternalFeed =>
  isForumFeedSection(value) ? (String(value) as ForumExternalFeed) : 'latest';
