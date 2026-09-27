/**
 * 全局搜索源注册表 —— 见 plans/020-site-global-search.md
 *
 * 设计要点（为什么不是一个统一 RPC）：
 *   1. 帖子搜索已有 `list_forum_posts`（CJK 子串兜底 + 分层 rank + 中文高亮）。在 SQL 里
 *      再包一层 UNION 要么复制这三样（第二个真相源），要么动态拼多表 union all。
 *   2. 其余多是「小表 + 简单 ILIKE」或「纯静态前端数据」，前端并行查比新建 RPC 更轻，
 *      也不必新增函数授权面（仓库有 check-anon-execute 棘轮）。
 *   3. 加一类内容 = 加一个 source 对象，不动数据库。
 *
 * 分级触发（面板限高装不下 20 个来源的全量结果）：
 *   - `instant`  ：随输入触发（debounce）。只放「本地索引」与「帖子 / 用户」两条网络查询。
 *   - `deferred` ：按回车、切类型 chip、或点「查看全部」时才查。
 *
 * ⚠️ 排序是「组内排序，不做跨组融合加权」——跨类别分数没有可比性：
 *    搜「周边」不该让商品压过帖子，搜「生日」不该让祝福语压过活动。
 *    面板按 SOURCE_ORDER 固定组序 + 每组条数上限。
 */
import { getPosts } from '@/utils/api/forum/post-api.js';
import {
  searchProfiles,
  searchProducts,
  searchLotteries,
  searchActivityCampaigns,
  searchBlockWallItems,
  searchCreatorShows,
  searchBirthdayWishes,
  searchBirthdayEvents,
  searchAvatarFrames,
  searchForumWeeklyReports,
  searchComments,
  searchMyCloudEntries,
} from '@/utils/api/site-search-api';
import { searchMinecraftResourcesForBohAI } from '@/utils/api/resource-search-api.js';
import { SITE_NAV_ITEMS, flattenSiteNavPages } from '@/config/site-nav';
import { TUTORIAL_SECTIONS, tutorialSectionLabel } from '@/data/tutorials';
import { downloadsData } from '@/data/downloads.js';
import { CHARACTER_BOOK_ENTRIES } from '@/data/character-book';
import { MBTI_TYPES } from '@/data/mbti-data.js';
import { formatSmartTime } from '@/utils/time.js';
import { themeManager } from '@/utils/theme-manager.js';
import { matchQuickAnswers } from '@/data/quick-answers';

/** 结果项统一形状（面板只认这套字段，不认各来源的原始行） */
export interface SiteSearchHit {
  /** 稳定且全局唯一，供 v-for key 与键盘选中 */
  key: string;
  /** 所属来源 id（对应 source.id） */
  source: string;
  title: string;
  excerpt: string;
  /** 右侧次要信息：作者 / 分类 / 时间 */
  meta: string;
  /** router.push 的目标（动作项为空串，执行走 action） */
  route: string;
  /** 小标签（如「新闻」「活动」），可空 */
  badge: string;
  /**
   * 动作项（Spotlight 式「搜到即执行」）：命中后不跳转，交给导航栏的
   * handleMenuAction 执行（经 useGlobalSearch 的 onAction 透传）。
   * 取值 = handleMenuAction 的 action 词表：'toggleTheme' | 'logout' |
   * 'openAiAssistant' | 'checkVersion' | 'createDesktop'。
   */
  action?: string;
}

export interface SiteSearchSource {
  id: string;
  label: string;
  /** instant = 随输入查；deferred = 显式触发才查 */
  group: 'instant' | 'deferred';
  /**
   * @param {string} query 已 trim 的搜索词
   * @param {{ limit: number, signal?: AbortSignal }} ctx
   * @returns {Promise<SiteSearchHit[]>}
   */
  search: (query: string, ctx: { limit: number; signal?: AbortSignal }) => Promise<SiteSearchHit[]>;
}

/**
 * 截取关键词周边窗口（对齐后端 forum_search_excerpt 的口径，让 Panel 展示更聚焦），
 * 并把命中片段包上 `[[..]]` 标记 —— 面板统一按标记渲染高亮（文本节点渲染，无 v-html）。
 */
export const buildLocalExcerpt = (text: string, query: string, before = 16, after = 44): string => {
  const src = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const q = String(query || '').trim();
  if (!src) return '';
  let window: string;
  if (!q) {
    window = src.slice(0, before + after);
  } else {
    const idx = src.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) {
      window = src.slice(0, before + after);
    } else {
      const start = Math.max(0, idx - before);
      const end = Math.min(src.length, idx + q.length + after);
      window = `${start > 0 ? '…' : ''}${src.slice(start, end)}${end < src.length ? '…' : ''}`;
    }
  }
  return markMatches(window, q);
};

/** 大小写不敏感地把 query 的每次出现包上 `[[..]]` 高亮标记 */
const markMatches = (text: string, query: string): string => {
  if (!text || !query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(q, i);
    if (idx < 0) {
      out += text.slice(i);
      break;
    }
    out += `${text.slice(i, idx)}[[${text.slice(idx, idx + q.length)}]]`;
    i = idx + q.length;
  }
  return out;
};

/** 本地数据源的通用过滤 + 映射 */
const searchLocal = <T>(
  rows: T[],
  query: string,
  limit: number,
  pick: (row: T) => { title: string; body: string; meta?: string } | null,
  toHit: (row: T, picked: { title: string; body: string; meta?: string }) => SiteSearchHit,
): SiteSearchHit[] => {
  const q = query.toLowerCase();
  const out: SiteSearchHit[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const picked = pick(row);
    if (!picked) continue;
    const haystack = `${picked.title} ${picked.body} ${picked.meta || ''}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    out.push(toHit(row, picked));
  }
  return out;
};

/** 页面与功能（顶栏菜单单源，静态） */
const PAGES = flattenSiteNavPages(SITE_NAV_ITEMS);

/** 空态「猜你想去」无点击记录时的兜底入口（path 需存在于 SITE_NAV_ITEMS） */
export const SITE_SEARCH_PAGES = PAGES;

/** 空态热门词（运营位：暂为静态配置，接运营数据源后换成本表的数据驱动版本） */
export const SITE_SEARCH_HOT_WORDS: string[] = ['八周年', '生日会', '抽奖', '云上咖啡店', '头像框'];

/**
 * 动作（Spotlight 式「搜到即执行」）—— 纯本地、零网络，排在来源最前。
 *
 * ⚠️ 执行权统一归导航栏的 handleMenuAction（单一真相源）：面板只带 action id 上报，
 * 由 useGlobalSearch 的 onAction 透传。本文件只负责「搜索词 → 动作」的匹配与展示。
 * 新增动作 = 在 ACTIONS 加条目 + 在 handleMenuAction 加对应分支，两处词表保持一致。
 */
interface SiteSearchAction {
  /** handleMenuAction 的 action 词表 */
  action: string;
  title: (current: { theme: string }) => string;
  excerpt: string;
  /** 额外匹配词（标题之外，小写、含空格分词） */
  keywords: string;
}

const SITE_SEARCH_ACTIONS: SiteSearchAction[] = [
  {
    action: 'toggleTheme',
    title: ({ theme }) => (theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'),
    excerpt: '立即切换全站主题外观',
    keywords: '主题 深色 浅色 暗色 黑夜 夜间 亮色 模式 theme dark light mode',
  },
  {
    action: 'logout',
    title: () => '退出登录',
    excerpt: '退出当前账号（需确认）',
    keywords: '退出登录 登出 注销 退出账号 logout signout',
  },
  {
    action: 'openAiAssistant',
    title: () => '打开 BOHAgent',
    excerpt: '唤起 AI 助手侧边栏',
    keywords: 'bohagent ai助手 ai 助手 智能体 agent',
  },
  {
    action: 'checkVersion',
    title: () => '检查版本更新',
    excerpt: '检测是否有可用的新版本',
    keywords: '版本 更新 检测 升级 version update',
  },
  {
    action: 'createDesktop',
    title: () => '创建桌面快捷方式',
    excerpt: '把 BOH 添加到桌面',
    keywords: '桌面 快捷方式 图标 desktop shortcut pwa 安装',
  },
];

const matchAction = (entry: SiteSearchAction, query: string): boolean => {
  const q = query.toLowerCase();
  const theme = themeManager.getTheme?.() || 'light';
  const haystack = `${entry.title({ theme })} ${entry.excerpt} ${entry.keywords}`.toLowerCase();
  return haystack.includes(q);
};

export const SITE_SEARCH_SOURCES: SiteSearchSource[] = [
  {
    id: 'answers',
    label: '速查',
    group: 'instant',
    async search(query) {
      // 即答卡（Spotlight 计算器/换算同款思路）：计算器 / MC 版本⇄Java / 端口，恒 ≤2 条。
      // 计算器项 route 为空 —— 面板对无 route 结果不跳转（答案已在标题里）。
      const answers = matchQuickAnswers(query, 2);
      return answers.map((answer) => ({
        key: `answer-${answer.id}`,
        source: 'answers',
        title: answer.title,
        excerpt: answer.excerpt,
        meta: '即答',
        route: answer.route,
        badge: '速查',
      }));
    },
  },
  {
    id: 'actions',
    label: '动作',
    group: 'instant',
    async search(query, { limit }) {
      const theme = themeManager.getTheme?.() || 'light';
      return SITE_SEARCH_ACTIONS.filter((entry) => matchAction(entry, query))
        .slice(0, limit)
        .map((entry) => ({
          key: `action-${entry.action}`,
          source: 'actions',
          title: entry.title({ theme }),
          excerpt: entry.excerpt,
          meta: '回车执行',
          route: '',
          badge: '动作',
          action: entry.action,
        }));
    },
  },
  {
    id: 'posts',
    label: '帖子',
    group: 'instant',
    async search(query, { limit, signal }) {
      // 复用论坛既有 RPC：CJK 子串兜底 + 分层 rank（标题 1.0 / 正文 0.4 / 向量 ≤0.3）+ 中文高亮
      const result = await getPosts(null, {
        searchQuery: query,
        pageSize: limit,
        sortMode: 'latest',
        signal,
      });
      // result.data 来自 .js 模块（推断为 any）→ 显式收窄，否则回调参数触发 noImplicitAny
      const rows = (Array.isArray(result?.data) ? result.data : []) as Array<Record<string, any>>;
      return rows.map((row) => ({
        key: `post-${row.id}`,
        source: 'posts',
        title: markMatches(String(row.title || '无标题'), query),
        // search_excerpt 自带 [[关键词]] 服务端标记 → 面板渲染高亮；缺省时前端兜底打标
        excerpt:
          row.search_excerpt ||
          markMatches(
            String(row.body || row.content || '')
              .replace(/\s+/g, ' ')
              .slice(0, 96),
            query,
          ),
        meta: [row.author_username, row.created_at ? formatSmartTime(row.created_at) : '']
          .filter(Boolean)
          .join(' · '),
        route: `/forum/post/${row.id}`,
        badge: row.post_kind === 'news' ? '新闻' : row.post_kind === 'activity' ? '活动' : '',
      }));
    },
  },
  {
    id: 'users',
    label: '用户',
    group: 'instant',
    async search(query, { limit, signal }) {
      const rows = await searchProfiles(query, { limit, signal });
      return rows.map((row) => ({
        key: `user-${row.id}`,
        source: 'users',
        title: String(row.username || '未命名'),
        excerpt: String(row.bio || '').slice(0, 96),
        meta: Array.isArray(row.tags) && row.tags.length ? row.tags.slice(0, 3).join(' · ') : '',
        route: `/profile/${row.username}`,
        badge: '',
      }));
    },
  },
  {
    id: 'comments',
    label: '评论',
    group: 'instant',
    async search(query, { limit, signal }) {
      const rows = await searchComments(query, { limit, signal });
      return rows.map((row) => ({
        key: `comment-${row.id}`,
        source: 'comments',
        title: buildLocalExcerpt(row.content || '', query, 0, 60) || '评论',
        excerpt: '',
        meta: [row.author_username, row.created_at ? formatSmartTime(row.created_at) : '']
          .filter(Boolean)
          .join(' · '),
        route: `/forum/post/${row.post_id}`,
        badge: '评论',
      }));
    },
  },
  {
    id: 'notes',
    label: '我的笔记',
    group: 'instant',
    async search(query, { limit, signal }) {
      // RLS 限定 auth.uid()=user_id：登录用户只搜到自己的；anon 恒空
      const rows = await searchMyCloudEntries(query, { limit, signal });
      return rows.map((row) => ({
        key: `note-${row.id}`,
        source: 'notes',
        title: String(
          row.title || buildLocalExcerpt(row.content_text || '', query, 0, 40) || '笔记',
        ),
        excerpt: row.title ? buildLocalExcerpt(row.content_text || '', query) : '',
        meta: row.entry_date ? String(row.entry_date).slice(0, 10) : '',
        route: '/user-space/note',
        badge: '笔记',
      }));
    },
  },
  {
    id: 'pages',
    label: '页面与功能',
    group: 'instant',
    async search(query, { limit }) {
      return searchLocal(
        PAGES,
        query,
        limit,
        (page) => ({ title: page.label, body: page.path, meta: page.category }),
        (page) => ({
          key: `page-${page.id}`,
          source: 'pages',
          title: markMatches(page.label, query),
          excerpt: page.category ? `${page.category} · ${page.path}` : page.path,
          meta: '',
          route: page.path,
          badge: '页面',
        }),
      );
    },
  },
  {
    id: 'tutorials',
    label: '教程',
    group: 'instant',
    async search(query, { limit }) {
      const flat = TUTORIAL_SECTIONS.flatMap((section) =>
        section.items.map((item) => ({ section: tutorialSectionLabel(section.title), item })),
      );
      return searchLocal(
        flat,
        query,
        limit,
        (row) => ({
          title: row.item.question,
          body: `${row.item.coreSteps} ${row.item.extraInfo}`,
          meta: row.section,
        }),
        (row, picked) => ({
          key: `tutorial-${row.item.id}`,
          source: 'tutorials',
          title: markMatches(row.item.question, query),
          excerpt: buildLocalExcerpt(picked.body, query),
          meta: row.section,
          route: `/download#${row.item.id}`,
          badge: '教程',
        }),
      );
    },
  },
  {
    id: 'downloads',
    label: '下载资源',
    group: 'instant',
    async search(query, { limit }) {
      // downloadsData 来自 .js 模块（推断为 any）→ 显式收窄，
      // 否则泛型 T 落到 any，回调参数会触发 noImplicitAny
      const rows = downloadsData as Array<Record<string, any>>;
      return searchLocal(
        rows,
        query,
        limit,
        (item) => ({ title: item.name, body: item.description || '', meta: item.version || '' }),
        (item, picked) => ({
          key: `download-${item.id}`,
          source: 'downloads',
          title: markMatches(String(item.name || ''), query),
          excerpt: buildLocalExcerpt(picked.body, query),
          meta: item.version || '',
          route: '/download',
          badge: '下载',
        }),
      );
    },
  },
  {
    id: 'characters',
    label: '设定集',
    group: 'instant',
    async search(query, { limit }) {
      return searchLocal(
        CHARACTER_BOOK_ENTRIES,
        query,
        limit,
        (entry) => ({
          title: entry.name,
          body: `${entry.role} ${entry.description} ${entry.facts.map((f) => f.value).join(' ')}`,
        }),
        (entry) => ({
          key: `character-${entry.id}`,
          source: 'characters',
          title: markMatches(entry.name, query),
          excerpt: buildLocalExcerpt(entry.description, query),
          meta: entry.role,
          route: '/character-book',
          badge: '设定',
        }),
      );
    },
  },
  {
    id: 'mbti',
    label: 'MBTI',
    group: 'instant',
    async search(query, { limit }) {
      const rows = Object.entries(MBTI_TYPES).map(([code, value]) => ({
        code,
        name: String((value as any)?.name || code),
        description: String((value as any)?.description || ''),
      }));
      return searchLocal(
        rows,
        query,
        limit,
        (row) => ({ title: `${row.code} ${row.name}`, body: row.description }),
        (row) => ({
          key: `mbti-${row.code}`,
          source: 'mbti',
          title: markMatches(`${row.code} · ${row.name}`, query),
          excerpt: buildLocalExcerpt(row.description, query),
          meta: '',
          route: '/mbti',
          badge: '测试',
        }),
      );
    },
  },
  {
    id: 'products',
    label: '商城',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchProducts(query, { limit, signal });
      return rows.map((row) => ({
        key: `product-${row.id}`,
        source: 'products',
        title: String(row.title || '未命名商品'),
        excerpt: buildLocalExcerpt(row.description || '', query),
        meta: String(row.category || ''),
        route: '/shop',
        badge: '商城',
      }));
    },
  },
  {
    id: 'lotteries',
    label: '抽奖',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchLotteries(query, { limit, signal });
      return rows.map((row) => ({
        key: `lottery-${row.id}`,
        source: 'lotteries',
        title: String(row.title || '未命名抽奖'),
        excerpt: buildLocalExcerpt(row.prize_title || row.description || '', query),
        meta: String(row.status || ''),
        route: '/lotteries',
        badge: '抽奖',
      }));
    },
  },
  {
    id: 'campaigns',
    label: '活动',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchActivityCampaigns(query, { limit, signal });
      return rows.map((row) => ({
        key: `campaign-${row.id}`,
        source: 'campaigns',
        title: String(row.title || row.slug || '未命名活动'),
        excerpt: buildLocalExcerpt(row.description || '', query),
        meta: String(row.stage || ''),
        route: '/activities-wall',
        badge: '活动',
      }));
    },
  },
  {
    id: 'blockwall',
    label: '方块墙',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchBlockWallItems(query, { limit, signal });
      return rows.map((row) => ({
        key: `wall-${row.id}`,
        source: 'blockwall',
        title: buildLocalExcerpt(row.content || '', query, 0, 40) || '方块墙纸条',
        excerpt: '',
        meta: String(row.author_username || ''),
        route: '/activities-wall?tab=wall',
        badge: '纸条',
      }));
    },
  },
  {
    id: 'shows',
    label: '节目',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchCreatorShows(query, { limit, signal });
      return rows.map((row) => ({
        key: `show-${row.id}`,
        source: 'shows',
        title: String(row.title || '未命名节目'),
        excerpt: buildLocalExcerpt(row.description || '', query),
        meta: String(row.author_username || ''),
        route: '/shows',
        badge: '节目',
      }));
    },
  },
  {
    id: 'frames',
    label: '头像框',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchAvatarFrames(query, { limit, signal });
      return rows.map((row) => ({
        key: `frame-${row.id}`,
        source: 'frames',
        title: String(row.name || '未命名头像框'),
        excerpt: buildLocalExcerpt(row.description || '', query),
        meta: String(row.tier || ''),
        route: '/user-space?tab=assets',
        badge: '装扮',
      }));
    },
  },
  {
    id: 'birthday',
    label: '生日会',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const [events, wishes] = await Promise.all([
        searchBirthdayEvents(query, { limit, signal }),
        searchBirthdayWishes(query, { limit, signal }),
      ]);
      return [
        ...events.map((row) => ({
          key: `birthday-event-${row.id}`,
          source: 'birthday',
          title: String(row.title || '生日活动'),
          excerpt: buildLocalExcerpt(row.subtitle || row.hero_quote || '', query),
          meta: '',
          route: '/birthday',
          badge: '活动',
        })),
        ...wishes.map((row) => ({
          key: `birthday-wish-${row.id}`,
          source: 'birthday',
          title: String(row.author_name || '匿名祝福'),
          excerpt: buildLocalExcerpt(row.content || '', query),
          meta: '',
          route: '/birthday',
          badge: '祝福',
        })),
      ].slice(0, limit);
    },
  },
  {
    id: 'weekly',
    label: '论坛周报',
    group: 'deferred',
    async search(query, { limit, signal }) {
      const rows = await searchForumWeeklyReports(query, { limit, signal });
      return rows.map((row) => ({
        key: `weekly-${row.id}`,
        source: 'weekly',
        title: `周报 ${row.week_start || ''} ~ ${row.week_end || ''}`.trim(),
        excerpt: buildLocalExcerpt(row.summary || '', query),
        meta: '',
        route: '/overview',
        badge: '周报',
      }));
    },
  },
  {
    id: 'modrinth',
    label: 'Mod 资源',
    group: 'deferred',
    async search(query, { limit, signal }) {
      // ⚠️ 第三方 API（api.modrinth.com 直连）：只允许「显式触发」（切 chip / 查看全部），
      // 绝不进 instant 组随输入打。复用 BOH AI 资源搜索的既有归一化链路（单源）。
      // options 显式收窄：该 .js 模块的 `signal = undefined` 默认值会把参数推断成 undefined 类型
      const result = await (
        searchMinecraftResourcesForBohAI as (opts: {
          query: string;
          type: string;
          sort: string;
          limit: number;
          signal?: AbortSignal;
        }) => Promise<{ results?: unknown }>
      )({
        query,
        type: 'all',
        sort: 'relevance',
        limit: Math.min(Math.max(limit, 1), 20),
        signal,
      });
      const rows = (Array.isArray(result?.results) ? result.results : []) as Array<
        Record<string, any>
      >;
      return rows.map((row) => ({
        key: `mod-${row.slug || row.project_id}`,
        source: 'modrinth',
        title: String(row.title || '未命名资源'),
        excerpt: String(row.description || '').slice(0, 96),
        meta: [
          row.author,
          row.downloads != null ? `⬇ ${Number(row.downloads).toLocaleString()}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        route: String(row.url || 'https://modrinth.com'),
        badge: 'Modrinth',
      }));
    },
  },
];

/** 面板展示顺序（组内排序，不做跨组融合） */
export const SITE_SEARCH_SOURCE_ORDER: string[] = SITE_SEARCH_SOURCES.map((s) => s.id);

export const getSiteSearchSource = (id: string): SiteSearchSource | undefined =>
  SITE_SEARCH_SOURCES.find((s) => s.id === id);

/** 一次「全部」搜索：并发跑 instant 组，按 source 归组返回（失败的组返回空数组，不拖垮面板） */
export const runInstantSearch = async (
  query: string,
  { limitPerSource = 3, signal }: { limitPerSource?: number; signal?: AbortSignal } = {},
): Promise<Record<string, SiteSearchHit[]>> => {
  const sources = SITE_SEARCH_SOURCES.filter((s) => s.group === 'instant');
  const settled = await Promise.all(
    sources.map(async (source) => {
      try {
        const hits = await source.search(query, { limit: limitPerSource, signal });
        return [source.id, Array.isArray(hits) ? hits : []] as const;
      } catch {
        return [source.id, [] as SiteSearchHit[]] as const;
      }
    }),
  );
  return Object.fromEntries(settled);
};

/** 单组全量搜索（点「查看全部」或切 chip 时用） */
export const runSourceSearch = async (
  sourceId: string,
  query: string,
  { limit = 20, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<SiteSearchHit[]> => {
  const source = getSiteSearchSource(sourceId);
  if (!source) return [];
  try {
    const hits = await source.search(query, { limit, signal });
    return Array.isArray(hits) ? hits : [];
  } catch {
    return [];
  }
};
