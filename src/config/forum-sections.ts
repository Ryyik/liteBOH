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

export type ForumSectionId =
  | 'official'
  | 'latest'
  | 'following'
  | 'news'
  | 'activity'
  | 'members'
  | 'impressions'

/** ForumMain 能承载的四个分区（其余走独立面板） */
export type ForumExternalFeed = 'latest' | 'following' | 'news' | 'activity'

export interface ForumSectionItem {
  id: ForumSectionId
  label: string
}

/**
 * 七席。**官方居首是用户指定**，但默认落点仍是「最新」——
 * 两者是独立的：要改默认落点只改 FORUM_DEFAULT_SECTION。
 */
export const FORUM_SECTION_ITEMS: ForumSectionItem[] = [
  { id: 'official', label: '官方' },
  { id: 'latest', label: '最新' },
  { id: 'following', label: '关注' },
  { id: 'news', label: '新闻' },
  { id: 'activity', label: '活动' },
  { id: 'members', label: '成员' },
  { id: 'impressions', label: '印象' }
]

export const FORUM_SECTION_IDS: ForumSectionId[] = FORUM_SECTION_ITEMS.map((item) => item.id)

/** 默认分区：官方仅排序居首，默认落点仍为最新 */
export const FORUM_DEFAULT_SECTION: ForumSectionId = 'latest'

/** 由 ForumMain（AsyncForum）承载的分区 */
export const FORUM_FEED_SECTIONS: ForumExternalFeed[] = ['latest', 'following', 'news', 'activity']

export const isForumSection = (value: unknown): value is ForumSectionId =>
  FORUM_SECTION_IDS.includes(String(value) as ForumSectionId)

export const isForumFeedSection = (value: unknown): value is ForumExternalFeed =>
  FORUM_FEED_SECTIONS.includes(String(value) as ForumExternalFeed)

/** 非法/缺失的 view 一律回落默认分区（URL 深链与路由 watch 共用同一口径） */
export const resolveForumSection = (value: unknown): ForumSectionId =>
  (isForumSection(value) ? (String(value) as ForumSectionId) : FORUM_DEFAULT_SECTION)

/** 分区 → ForumMain 的 externalFeed；非 feed 分区回落 latest（ForumMain 不接受空值） */
export const resolveExternalFeed = (value: unknown): ForumExternalFeed =>
  (isForumFeedSection(value) ? (String(value) as ForumExternalFeed) : 'latest')
