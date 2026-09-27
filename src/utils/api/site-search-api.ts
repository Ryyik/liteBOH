/**
 * 全局搜索 · 组 B（小表）查询层  —— 见 plans/020-site-global-search.md
 *
 * 为什么不为这些表建统一 RPC：
 *   组 A 的帖子搜索已有 `list_forum_posts`（自带 CJK 子串兜底 + 分层 rank + 中文高亮）。
 *   在 SQL 里再包一层 UNION 要么复制这三样（立刻产生第二个真相源），要么在 PL/pgSQL 里
 *   动态拼 20 张表的 union all（退化成顺序扫描）。而这些表都是个位到百条量级 +
 *   简单 ILIKE，前端并行查更轻，也不新增函数授权面（仓库有 check-anon-execute 棘轮）。
 *
 * 可见性：公开数据走 anon 可读的表；私有数据只纳入「RLS 限定本人」的表
 * （boh_cloud_entries：四条策略全是 auth.uid()=user_id，登录用户只能搜到自己的），
 * health_*、notifications 等仍不纳入 —— 见方案文档 §2 / §14。
 *
 * ⚠️ 本层只负责「查回原始行」，字段 → 结果项的映射由 config/site-search-sources.ts
 * 的 search() 负责（路由知识属于 UI 层，不混进数据层）。
 */
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

/** 查询行：各表列不同，统一按宽松结构返回，由消费方按需取值 */
export type SiteSearchRow = Record<string, any>;

export interface SiteSearchQueryOptions {
  limit?: number;
  signal?: AbortSignal;
}

const DEFAULT_LIMIT = 5;

/**
 * 构造 ILIKE 模式串。
 * 1) 先清掉会破坏 PostgREST `or=` 语法的保留字符（逗号 / 括号）——用户输入 "周边, 商城"
 *    若不处理会让整个 or 表达式解析失败（表现为该来源静默零结果）；
 * 2) 再转义 LIKE 元字符，让 `%` `_` `\` 按字面匹配（否则用户输入 "%" 会匹配一切）。
 */
export const buildSearchPattern = (raw: string): string => {
  const cleaned = String(raw || '')
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\%_]/g, (m) => `\\${m}`);
  return cleaned ? `%${cleaned}%` : '';
};

/** 统一执行 + 容错：单个来源失败不能拖垮整个面板，记日志后返回空数组 */
const runQuery = async (
  label: string,
  build: () => PromiseLike<{ data: unknown; error: unknown }>,
  signal?: AbortSignal,
): Promise<SiteSearchRow[]> => {
  try {
    const { data, error } = await build();
    if (error) throw error;
    return Array.isArray(data) ? (data as SiteSearchRow[]) : [];
  } catch (error) {
    if (signal?.aborted) return [];
    logger.warn('site-search', `${label} 查询失败:`, error);
    return [];
  }
};

/** 可选挂 signal（supabase-js 的 abortSignal 传 undefined 会报错，故条件调用） */
const withSignal = <T>(query: T, signal?: AbortSignal): T =>
  signal ? ((query as any).abortSignal(signal) as T) : query;

/**
 * 用户（`profiles`）→ /profile/:username
 * `profiles.username` 已有 pg_trgm 索引（idx_profiles_username_trgm），
 * 中文与英文局部匹配都能吃上索引，无需另建。
 */
export const searchProfiles = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '用户',
    () =>
      withSignal(
        supabase
          .from('profiles')
          .select('id,username,avatar_url,bio,tags')
          .ilike('username', p)
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 商城商品（`products`，anon 可读）→ /shop */
export const searchProducts = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '商城商品',
    () =>
      withSignal(
        supabase
          .from('products')
          .select('id,title,description,category')
          .or(`title.ilike.${p},description.ilike.${p},category.ilike.${p}`)
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 方块墙纸条（`block_wall_items`，anon 可读）→ /activities-wall?tab=wall */
export const searchBlockWallItems = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '方块墙',
    () =>
      withSignal(
        supabase
          .from('block_wall_items')
          .select('id,content,author_username,item_type,created_at')
          .or(`content.ilike.${p},author_username.ilike.${p}`)
          .order('created_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/**
 * 抽奖（`lotteries`）→ /lotteries
 * 可见性由 RLS 把关（is_home_visible / is_community_visible + status 组合条件），
 * 这里不重复加 status 过滤 —— 加了反而会与运营策略漂移。
 */
export const searchLotteries = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '抽奖',
    () =>
      withSignal(
        supabase
          .from('lotteries')
          .select('id,title,description,prize_title,prize_description,status')
          .or(
            `title.ilike.${p},description.ilike.${p},prize_title.ilike.${p},prize_description.ilike.${p}`,
          )
          .order('created_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 创作者节目（`boh_creator_shows`，anon 可读）→ /shows */
export const searchCreatorShows = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '创作者节目',
    () =>
      withSignal(
        supabase
          .from('boh_creator_shows')
          .select('id,title,description,author_username,creator_platform,video_url')
          .or(`title.ilike.${p},description.ilike.${p},author_username.ilike.${p}`)
          .order('created_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 生日祝福（`birthday_wishes`，仅 approved）→ /birthday */
export const searchBirthdayWishes = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '生日祝福',
    () =>
      withSignal(
        supabase
          .from('birthday_wishes')
          .select('id,content,author_name')
          .eq('status', 'approved')
          .or(`content.ilike.${p},author_name.ilike.${p}`)
          .order('created_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 生日活动（`birthday_events`，仅 is_active）→ /birthday */
export const searchBirthdayEvents = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '生日活动',
    () =>
      withSignal(
        supabase
          .from('birthday_events')
          .select('id,title,subtitle,hero_quote')
          .eq('is_active', true)
          .or(`title.ilike.${p},subtitle.ilike.${p},hero_quote.ilike.${p}`)
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 头像框（`avatar_frames`，仅 published）→ 用户空间装扮区 */
export const searchAvatarFrames = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '头像框',
    () =>
      withSignal(
        supabase
          .from('avatar_frames')
          .select('id,name,description,tier,url')
          .eq('status', 'published')
          .or(`name.ilike.${p},description.ilike.${p}`)
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/** 论坛周报（`forum_weekly_reports`，仅 published）→ /overview */
export const searchForumWeeklyReports = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '论坛周报',
    () =>
      withSignal(
        supabase
          .from('forum_weekly_reports')
          .select('id,summary,week_start,week_end')
          .eq('status', 'published')
          .ilike('summary', p)
          .order('week_end', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/**
 * 活动（新平台 `activity_campaigns`）→ /activities-wall
 * 2026092704 起 RLS 已收紧：`stage='draft'` 仅管理端可见（见迁移头注释）。
 * 前端保留 `.neq('stage','draft')` 作为纵深防御（与 RLS 语义一致，不构成第二真相源）。
 */
export const searchActivityCampaigns = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '活动',
    () =>
      withSignal(
        supabase
          .from('activity_campaigns')
          .select('id,slug,title,description,stage')
          .neq('stage', 'draft')
          .or(`title.ilike.${p},description.ilike.${p}`)
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/**
 * 评论（`comments`，anon 可读 approved）→ /forum/post/:id
 * 可见性由 RLS `comments_select_visible` 把关（approved 且帖子可见），
 * 这里再显式限定 approved / null 作为查询侧兜底（与 comment-api 的既有口径一致）。
 * ⚠️ 故意不建 trgm 索引也不走 RPC：评论量级小，ILIKE 顺序扫描够用，
 * 和帖子搜索（search_vector + trgm + 分层 rank）不是一个重量级。
 */
export const searchComments = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '评论',
    () =>
      withSignal(
        supabase
          .from('comments')
          .select('id,post_id,content,author_username,created_at')
          .or('status.is.null,status.eq.approved')
          .ilike('content', p)
          .order('created_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};

/**
 * 我的笔记（`boh_cloud_entries`，RLS 四条策略均 auth.uid()=user_id）→ /user-space/note
 * 登录用户只能搜到自己的条目（RLS 强制，无需显式 user_id 过滤）；anon 恒空。
 * 标题 + 正文双字段 ILIKE，按更新时间倒序。
 */
export const searchMyCloudEntries = (
  query: string,
  { limit = DEFAULT_LIMIT, signal }: SiteSearchQueryOptions = {},
) => {
  const p = buildSearchPattern(query);
  if (!p) return Promise.resolve<SiteSearchRow[]>([]);
  return runQuery(
    '我的笔记',
    () =>
      withSignal(
        supabase
          .from('boh_cloud_entries')
          .select('id,title,content_text,entry_date,updated_at')
          .or(`title.ilike.${p},content_text.ilike.${p}`)
          .order('updated_at', { ascending: false })
          .limit(limit),
        signal,
      ),
    signal,
  );
};
