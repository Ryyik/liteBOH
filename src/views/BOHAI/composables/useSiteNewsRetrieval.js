/**
 * useSiteNewsRetrieval — 站内新闻 / 公告读连接器实现（2026-11-12 新增）
 *
 * 为什么需要独立连接器：`news` 表此前**只经向量库**（`source_type = 'site_news'`）进入上下文，
 * 而 EF 的补索引是 fire-and-forget ⇒ 新公告要**下一轮**才可能被检索到。用户问「最近有什么
 * 官方消息」时，这是最不该晚一步的数据。这里改成直查表（无缓存、无向量），一次就能拿到最新。
 *
 * ⚠️ 三条口径：
 *   ① **不要求登录**：`news` 表的 RLS 是 `允许所有人读取新闻 using true`（2026-11-12 实测），
 *      与站内活动同级别，属于公开数据。
 *   ② **只给列表级字段**：标题 / 摘要 / 日期 / 分类 / 作者。不拉 `content` 全文 ——
 *      17 条新闻的正文足够吃光上下文预算，而摘要已能回答「最近发布了什么」。
 *   ③ 空表/失败都要给一句明确空态，避免模型拿不到证据却「编」一条公告出来。
 *
 * 数据量参考（2026-11-12 线上）：17 条，最新 2026-11-05。
 */
import { supabase } from '@/utils/supabase-client.js';
import { normalizePromptLine } from '../utils/text/normalize.js';

/** 单次最多展示几条（再多只是烧 token） */
const MAX_NEWS = 6;
/** 拉取上限：先拿一批再按关键词挑，比只取 6 条更容易命中具体事件 */
const FETCH_LIMIT = 24;
const LINE_MAX_CHARS = 200;

const clamp = (value, max = LINE_MAX_CHARS) => normalizePromptLine(value, max);

const formatDate = (value) => {
  const text = clamp(value, 24);
  return text || '日期未知';
};

/**
 * 关键词相关度：标题命中权重高于摘要（用户问「XX 事件」时标题才是信号）。
 * 纯函数、无分词 —— 与站内其他「轻打分」口径一致，别在这里引入新的检索框架。
 */
const scoreNewsRow = (row, queryText) => {
  const query = clamp(queryText, 120).toLowerCase();
  if (!query) return 0;
  const title = clamp(row?.title, 120).toLowerCase();
  const excerpt = clamp(row?.excerpt, 300).toLowerCase();
  const category = clamp(row?.category, 40).toLowerCase();
  let score = 0;
  // 用 2 字滑窗做粗匹配：中文无空格，整串 includes 几乎永远不命中
  for (let i = 0; i < query.length - 1; i += 1) {
    const token = query.slice(i, i + 2);
    if (!token.trim()) continue;
    if (title.includes(token)) score += 3;
    else if (category.includes(token)) score += 2;
    else if (excerpt.includes(token)) score += 1;
  }
  return score;
};

/**
 * @param {string} queryText
 * @returns {Promise<{context: string, total: number, labels: string[], latestAt: string}>}
 */
export const getNewsContext = async (queryText = '') => {
  const { data, error } = await supabase
    .from('news')
    .select('id, category, title, excerpt, date, author')
    .order('date', { ascending: false })
    .limit(FETCH_LIMIT);

  if (error) throw error;

  const rows = Array.isArray(data) ? data.filter((row) => clamp(row?.title, 80)) : [];
  if (rows.length === 0) {
    return {
      context: '【站内新闻】当前没有可展示的新闻或公告。',
      total: 0,
      labels: [],
      latestAt: '',
    };
  }

  const scored = rows.map((row) => ({ row, score: scoreNewsRow(row, queryText) }));
  const hasHit = scored.some((item) => item.score > 0);
  // 有命中就只在命中里挑（宁缺毋滥，与论坛连接器同口径）；
  // 没命中（「最近有什么新闻」这类泛问）才回退到最新几条。
  const pool = hasHit ? scored.filter((item) => item.score > 0) : scored;

  const picked = pool
    .slice()
    .sort((a, b) => {
      if (hasHit && b.score !== a.score) return b.score - a.score;
      return String(b.row?.date || '').localeCompare(String(a.row?.date || ''));
    })
    .slice(0, MAX_NEWS)
    .map((item) => item.row);

  const lines = picked.map((row) => {
    const title = clamp(row?.title, 60);
    const date = formatDate(row?.date);
    const category = clamp(row?.category, 20);
    const author = clamp(row?.author, 24);
    const excerpt = clamp(row?.excerpt, 140);
    const meta = [date, category, author ? `作者 ${author}` : ''].filter(Boolean).join('，');
    return `- 「${title}」（${meta}）${excerpt ? `：${excerpt}` : ''}`;
  });

  return {
    context: `【站内新闻】\n${lines.join('\n')}`,
    total: picked.length,
    labels: ['站内新闻'],
    // 最新发布日期（不是 created_at）：ranking 用它判断「这批证据新不新」
    latestAt: formatDate(rows[0]?.date) === '日期未知' ? '' : String(rows[0]?.date || ''),
  };
};
