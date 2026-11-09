/**
 * 搜索单一真源（plans/042 D1）
 *
 * 三处搜索（列表 / 跨表 / 发放台找人）此前各写一套：列表 `ilike %kw%` 无排序、
 * 跨表按 tab 声明顺序拼接、找人按积分降序。同一个关键词四种结论。
 *
 * 这里只放三件纯逻辑，全部无副作用、可单测：
 *   1. 关键词规范化 + PostgREST 转义（**不是删除**：搜「50%」不能悄悄变成「50 」）
 *   2. 关键词 → or() 条件数组
 *   3. 匹配打分与排序（完全相等 > 前缀 > 词首 > 包含）
 *
 * 放在 utils/ 而不是 views/ 内：列表、跨表、发放台三处消费，
 * 不允许 views 之间互相 import（分层门禁）。
 */

export const KEYWORD_MAX_LENGTH = 120;

/* PostgREST or() 语法里的保留字符：出现在未加引号的值里会被当成语法分隔符。
   注意 % 与 _ 不在此列 —— 它们是 LIKE 通配符，用反斜杠转义即可，不需要引号。 */
const OR_RESERVED_RE = /[,(:."]/;

/* LIKE 通配符 + 转义符自身。反斜杠必须先处理，否则会把我们自己加的转义符再转一次。 */
const LIKE_ESCAPE_RE = /[\\%_]/g;

/*
 * UUID 形状判定：与 composables/useDataAdminValidation.js 的 UUID_REGEX 同源同义。
 * 两处各自定义是为了不把 views/ 的校验模块拉进 utils/（分层方向反了），
 * tests/unit/search-core.test.js 有一条用例锁住两者等价。
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/* 长文本列：命中的信息量低，权重压低 */
const CONTENT_COLUMNS = new Set([
  'content',
  'description',
  'body',
  'summary',
  'preview',
  'error_message',
  'gift_content',
  'fact',
  'remark',
  'note',
]);

/* 标识类列：只在精确命中时有意义（UUID 的 contains 命中没有参考价值） */
const IDENTIFIER_COLUMNS = new Set([
  'id',
  'user_id',
  'author_id',
  'post_id',
  'lottery_id',
  'owner_user_id',
  'source_post_id',
]);

/**
 * 关键词规范化：去首尾空白、折叠连续空白、截断。
 * **不做任何字符删除** —— 删字符会让用户看到的结果与输入不对应。
 */
export const normalizeKeyword = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, KEYWORD_MAX_LENGTH);

/** 兼容旧名（useDataAdminFilters / useDataAdminHelpers 仍在用） */
export const sanitizeSearchTerm = normalizeKeyword;

/**
 * 转义 LIKE 通配符：`50%` -> `50\%`，`a_b` -> `a\_b`，`c\d` -> `c\\d`。
 * PostgreSQL LIKE 的默认转义符就是反斜杠，所以这些值会按字面量匹配。
 */
export const escapeLikePattern = (value) =>
  String(value ?? '').replace(LIKE_ESCAPE_RE, (char) => `\\${char}`);

/**
 * 把 `%kw%` 这类模式包装成 or() 可接受的片段。
 * 含保留字符时整段加双引号（引号内仍保留 LIKE 通配符语义），内部引号转义。
 */
export const quoteFilterPattern = (pattern) => {
  const text = String(pattern ?? '');
  if (!OR_RESERVED_RE.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
};

/** `%kw%`（包含） */
export const buildContainsPattern = (keyword) =>
  quoteFilterPattern(`%${escapeLikePattern(normalizeKeyword(keyword))}%`);

/** `kw%`（开头是） */
export const buildStartsWithPattern = (keyword) =>
  quoteFilterPattern(`${escapeLikePattern(normalizeKeyword(keyword))}%`);

/* ==================== 快捷前缀（plans/042 C3） ==================== */

export const SEARCH_MODE_TEXT = 'text';
export const SEARCH_MODE_ID = 'id';
export const SEARCH_MODE_TAB = 'tab';
export const SEARCH_MODE_USER = 'user';

/** 输入框空态时展示的前缀提示（同时也是唯一一份「有哪些前缀」的说明） */
export const SEARCH_PREFIX_HINTS = [
  { prefix: 'id:', mode: SEARCH_MODE_ID, hint: '按记录 ID 精查（UUID 精确匹配）' },
  { prefix: 'tab:', mode: SEARCH_MODE_TAB, hint: '跳到某张表' },
  { prefix: '@', mode: SEARCH_MODE_USER, hint: '只在用户名里搜' },
];

/* 用户名类列：`@` 前缀只在这些列里匹配 */
const USERNAME_COLUMN_RE = /^(username|user_name|author_username|nickname|name)$/i;

/**
 * 解析快捷前缀：`id:xxx` / `tab:xxx` / `@xxx` / 其余按普通关键词。
 * 前缀只认**开头**且大小写不敏感；值仍走 normalizeKeyword（不删字符）。
 */
export const parseSearchQuery = (raw) => {
  const text = String(raw ?? '').trimStart();
  if (/^id:/i.test(text)) {
    return { mode: SEARCH_MODE_ID, prefix: 'id:', value: normalizeKeyword(text.slice(3)) };
  }
  if (/^tab:/i.test(text)) {
    return { mode: SEARCH_MODE_TAB, prefix: 'tab:', value: normalizeKeyword(text.slice(4)) };
  }
  if (text.startsWith('@')) {
    return { mode: SEARCH_MODE_USER, prefix: '@', value: normalizeKeyword(text.slice(1)) };
  }
  return { mode: SEARCH_MODE_TEXT, prefix: '', value: normalizeKeyword(text) };
};

/**
 * 用于「打分 / 高亮 / 展示」的词：去掉前缀后的值。
 * 打分必须用它，否则 `id:abc` 会拿整串去比分数字段，永远 0 分。
 */
export const searchTermOf = (raw) => parseSearchQuery(raw).value;

/** 根据 tabId + 关键词构造 supabase or() 过滤器数组。
 *   - `uuid` 字段仅在关键词本身是合法 UUID 时精确匹配（否则 contains 命中无意义）
 *   - `number` 字段仅在关键词是纯整数时精确匹配
 *   - 其余字段大小写不敏感包含，**通配符转义后**再拼
 *
 * 支持三个快捷前缀（plans/042 C3，见 parseSearchQuery）：
 *   - `id:`  只按主键匹配（UUID 精确 / 否则包含）
 *   - `@`    只在用户名类字段里搜（避免长文本命中一堆无关行）
 *   - `tab:` 不构造条件（跳表由调用方处理）
 */
export const buildSearchFilters = (tabId, keyword, tabSearchFields) => {
  const parsed = parseSearchQuery(keyword);
  const cleaned = parsed.value;
  if (!cleaned) return [];
  if (parsed.mode === SEARCH_MODE_TAB) return [];

  const fields = tabSearchFields?.[tabId] || [];

  if (parsed.mode === SEARCH_MODE_ID) {
    return [
      UUID_PATTERN.test(cleaned) ? `id.eq.${cleaned}` : `id.ilike.${buildContainsPattern(cleaned)}`,
    ];
  }

  const isUuid = UUID_PATTERN.test(cleaned);
  const isInteger = /^\d+$/.test(cleaned);
  const contains = buildContainsPattern(cleaned);
  const scoped =
    parsed.mode === SEARCH_MODE_USER
      ? fields.filter((field) => USERNAME_COLUMN_RE.test(String(field?.column || '')))
      : fields;
  // `@` 但没有用户名列的表：退回全字段搜，宁可宽一点也不给「搜不到」
  const effective = scoped.length ? scoped : fields;

  return effective.flatMap((field) => {
    const column = field?.column;
    if (!column) return [];
    if (field.type === 'uuid') return isUuid ? [`${column}.eq.${cleaned}`] : [];
    if (field.type === 'number') return isInteger ? [`${column}.eq.${cleaned}`] : [];
    return [`${column}.ilike.${contains}`];
  });
};

/* ==================== 相关性打分 ==================== */

export const MATCH_NONE = 0;
export const MATCH_CONTAINS = 40;
export const MATCH_WORD_START = 60;
export const MATCH_PREFIX = 80;
export const MATCH_EXACT = 100;

/** 词边界：空格与常见标点都算，中文连续文本只能落在 contains 档 */
const WORD_BOUNDARY_RE = /[\s\-_/·:：,，.。|()\[\]（）]/;

export const fieldWeight = (column) => {
  if (IDENTIFIER_COLUMNS.has(column)) return 1.05;
  if (CONTENT_COLUMNS.has(column)) return 0.6;
  return 1;
};

/**
 * 单字段得分（未乘权重）：
 *   完全相等 100 / 前缀 80 / 词首 60 / 包含 40 / 不命中 0
 */
export const scoreFieldValue = (value, keyword) => {
  const kw = normalizeKeyword(keyword).toLowerCase();
  if (!kw) return MATCH_NONE;
  const text = String(value ?? '').toLowerCase();
  if (!text) return MATCH_NONE;
  if (text === kw) return MATCH_EXACT;
  if (text.startsWith(kw)) return MATCH_PREFIX;
  const index = text.indexOf(kw);
  if (index === -1) return MATCH_NONE;
  if (index > 0 && WORD_BOUNDARY_RE.test(text[index - 1])) return MATCH_WORD_START;
  return MATCH_CONTAINS;
};

const normalizeField = (field) =>
  typeof field === 'string' ? { column: field } : field && field.column ? field : null;

/** 命中的最佳字段（C5「命中字段」与结果预览都用它） */
export const findMatchedField = (row, keyword, fields = []) => {
  let best = null;
  (fields || []).forEach((field) => {
    const normalized = normalizeField(field);
    if (!normalized || !row) return;
    const raw = scoreFieldValue(row[normalized.column], keyword);
    if (!raw) return;
    const weighted = raw * (normalized.weight ?? fieldWeight(normalized.column));
    if (!best || weighted > best.score) {
      best = { column: normalized.column, score: weighted, strength: raw };
    }
  });
  return best;
};

/** 整行得分：取所有声明字段里的最高分 */
export const scoreRow = (row, keyword, fields = []) =>
  findMatchedField(row, keyword, fields)?.score ?? MATCH_NONE;

/**
 * 按相关性排序。没有关键词时原样返回（保持数据库的排序口径）。
 * 同分保持原有顺序（stable），避免翻页时行序无谓抖动。
 */
export const rankRows = (rows, keyword, options = {}) => {
  const list = Array.isArray(rows) ? rows : [];
  const kw = normalizeKeyword(keyword);
  if (!kw) return [...list];
  const fields = Array.isArray(options.fields) ? options.fields : [];
  if (!fields.length) return [...list];

  return list
    .map((row, index) => ({ row, index, score: scoreRow(row, kw, fields) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.row);
};

/** 跨表结果按表分组（保留首次出现的顺序，组内维持传入顺序） */
export const groupByTab = (results = []) => {
  const groups = new Map();
  (results || []).forEach((item) => {
    const key = item?.tabId;
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { tabId: key, tabLabel: item.tabLabel || key, items: [] });
    }
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
};
