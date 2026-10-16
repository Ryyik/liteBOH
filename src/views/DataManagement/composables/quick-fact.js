/**
 * quick-fact.js — 官方事实「速记输入框」的本地解析器（2026-10-16）。
 *
 * 目标：管理员打一句「人物：小牛 是技术担当…」回车，自动得到
 * { title, category, tags, content, priority, source_label, status }，
 * 免开抽屉直接入库 boh_ai_core_memories（入库后面板会自动同步向量索引）。
 *
 * 归类规则（优先级从高到低）：
 *   ① 显式类别前缀（最高）：人物/成员/档案 → member_profile；大事记/大事/时间线 → timeline；
 *      文化/理念/规则/传统 → culture；概况/社区/总览 → community_overview；
 *      「成员档案/人物档案」作为整体前缀优先匹配（避免吞掉后面的人名）；
 *   ② 已知成员名开头命中（knownNames 来自现有 member_profile 行的 tags）→ member_profile；
 *   ③ 关键词推断：年份（19xx/20xx 年）或「大事记」→ timeline；
 *      是谁/成员/档案/加入/身份/人脉 → member_profile；理念/文化/传统/规则/价值观 → culture；
 *   ④ 兜底 community_overview。
 * member_profile 的人名提取：优先 knownNames 前缀命中，否则在首个动词/分隔符处截断（≤12 字）。
 * priority 沿用官方事实种子的分节权重：overview 90 / member 70 / timeline 60 / culture 50。
 */

export const QUICK_FACT_PRIORITY = {
  community_overview: 90,
  member_profile: 70,
  timeline: 60,
  culture: 50,
};

export const QUICK_FACT_CATEGORY_LABELS = {
  member_profile: '成员档案',
  timeline: '发展大事记',
  culture: '社区文化与梗',
  community_overview: '社区概况',
};

const CATEGORY_PREFIXES = [
  { re: /^(成员档案|人物档案)[：:、\s-]*/, category: 'member_profile' },
  { re: /^(人物|成员|档案)[：:、\s-]*/, category: 'member_profile' },
  { re: /^(大事记|大事|时间线)[：:、\s-]*/, category: 'timeline' },
  { re: /^(文化|理念|规则|传统)[：:、\s-]*/, category: 'culture' },
  { re: /^(概况|社区|总览)[：:、\s-]*/, category: 'community_overview' },
];

/** 人名截断：在首个动词/分隔符处断开（中英文与常见标点都覆盖） */
const NAME_STOP_RE =
  /(是|为|在|加入|负责|运营|参与|创建|建立|搭建|邀请|拉入|曾任|曾经|当时|和|与|跟|，|,|。|；|;|：|:|、|—|–|-|\s)/;

const YEAR_RE = /(19|20)\d{2}\s*年/;

const extractName = (body, knownNames) => {
  const known = (Array.isArray(knownNames) ? knownNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean)
    .find((n) => n && body.startsWith(n));
  if (known) return known;
  const cutAt = body.search(NAME_STOP_RE);
  const raw = cutAt >= 0 ? body.slice(0, cutAt) : body;
  return raw.trim().slice(0, 12);
};

export const parseQuickFact = (rawText, { knownNames = [] } = {}) => {
  const original = String(rawText || '')
    .replace(/^[-*•\s]+/, '')
    .trim();
  if (!original) return null;

  const normalizedKnownNames = (Array.isArray(knownNames) ? knownNames : [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);

  // ① 显式类别前缀
  let category = '';
  let body = original;
  for (const { re, category: cat } of CATEGORY_PREFIXES) {
    const m = body.match(re);
    if (m) {
      category = cat;
      body = body.slice(m[0].length).trim();
      break;
    }
  }

  // ② 已知成员名开头（没写「人物：」前缀也算）
  let name = '';
  if (!category) {
    const known = normalizedKnownNames.find((n) => body.startsWith(n));
    if (known) {
      category = 'member_profile';
      name = known;
    }
  }

  // ③ 关键词推断
  if (!category) {
    if (YEAR_RE.test(body) || /大事记/.test(body)) category = 'timeline';
    else if (/是谁|成员|档案|加入|身份|人脉/.test(body)) category = 'member_profile';
    else if (/理念|文化|传统|规则|价值观/.test(body)) category = 'culture';
    else category = 'community_overview';
  }

  // ④ 兜底
  if (!category) category = 'community_overview';

  let title = '';
  let tags = [];
  if (category === 'member_profile') {
    if (!name) name = extractName(body, normalizedKnownNames) || body.slice(0, 12).trim();
    if (!name) name = original.slice(0, 12).trim();
    title = `成员档案：${name}`;
    tags = [name];
  } else if (category === 'timeline') {
    const year = body.match(YEAR_RE);
    const yearText = year ? year[0].replace(/\s+/g, '') : '';
    title = yearText
      ? `大事记：${yearText}`
      : `大事记：${body.slice(0, 16).trim() || original.slice(0, 16).trim()}`;
    if (yearText) tags = [yearText];
  } else {
    title = (body || original).slice(0, 24).trim();
  }
  if (!title) title = original.slice(0, 24).trim();

  return {
    title,
    category,
    tags,
    content: original,
    source_label: '管理员速记',
    priority: QUICK_FACT_PRIORITY[category] ?? 60,
    status: 'active',
  };
};
