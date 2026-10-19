/**
 * boh-entity-resolver.js — 查询侧人物实体链接（2026-10-19）
 *
 * 解决三个已实测的问题：
 *   ① `BOH_MEMBER_NAMES` 硬编码 13 个名字，漏了「一二 / 翼儿 / 胡俊杰 / 刘镇福 / 武宇轩」；
 *   ② 「查看翼儿的资料」被判成操作题后 `memory=false`，人物库被关掉；
 *   ③ 别名只存在于知识库标题串里，检索前没有任何结构可用来扩展 query。
 *
 * 设计口径：
 *   - **最长匹配优先**：先匹配「发毕业证的一二」，再匹配「一二」，避免短别名抢走长别名；
 *   - **歧义别名需要人物信号**：「一二线城市」「橙子酱」不触发人物链接；
 *   - **宁可空类别，不要瞎链接**：匹配不到就返回空数组，不猜。
 *
 * 真源：`src/data/boh-entity-aliases.json`（bootstrap）。
 * 线上长期真源是 `boh_ai_entities` + `boh_ai_entity_aliases`；本模块只做查询侧解析，
 * 新增别名先改 JSON，再跑 `npm run seed:boh-entities` 播种到 DB。
 */
import entityData from '@/data/boh-entity-aliases.json';
import { isLatinAlias, normalizeEntityText } from './boh-entity-normalize.js';

export { normalizeEntityText } from './boh-entity-normalize.js';

/** 查询里出现这些词，才允许歧义别名（如「一二」「橙子」）参与人物链接。 */
const PERSON_SIGNAL_RE =
  /(是谁|什么人|哪位|哪个|资料|介绍|简介|近况|最近|现在|经历|关系|生日|年龄|住在|在哪|哪里人|上线|发帖|说过|提到|记得|认识|了解|怎么样|是什么|干什么|做什么|职业|身份|结婚|毕业|学校|工作)/;

/** 歧义别名的常见非人物搭配：命中即跳过，避免「一二线城市」「橙子酱」被当成人。 */
const AMBIGUOUS_ALIAS_BLOCKLIST = {
  一二: ['一二线', '一二三', '一二年级', '一二月', '一二战', '数一数二'],
  橙子: ['橙子酱', '橙子汁', '橙子味', '橙子皮'],
  汉堡: ['汉堡包', '汉堡店', '汉堡王'],
  河豚: ['河豚鱼', '河豚毒素'],
  笔墨: ['笔墨纸砚', '笔墨纸'],
  LF: ['LFW', 'LFG'],
  End: ['ending', 'endpoint', 'weekend'],
  百城: ['百城千店', '百城万店'],
};

const buildAliasIndex = () => {
  const rows = [];
  for (const entity of entityData.entities || []) {
    for (const alias of entity.aliases || []) {
      const normalized = normalizeEntityText(alias.value);
      if (!normalized) continue;
      rows.push({
        entityId: entity.id,
        canonicalName: entity.canonicalName,
        displayName: entity.displayName || entity.canonicalName,
        alias: alias.value,
        aliasType: alias.type || 'nickname',
        confidence: Number.isFinite(Number(alias.confidence)) ? Number(alias.confidence) : 1,
        ambiguous: Boolean(alias.ambiguous),
        legacyOnly: Boolean(alias.legacyOnly),
        normalized,
        latin: isLatinAlias(normalized),
      });
    }
  }
  return rows.sort((a, b) => b.normalized.length - a.normalized.length);
};

export const BOH_ENTITY_ALIAS_INDEX = buildAliasIndex();

const ENTITY_BY_ID = new Map(
  (entityData.entities || []).map((entity) => [
    entity.id,
    {
      id: entity.id,
      canonicalName: entity.canonicalName,
      displayName: entity.displayName || entity.canonicalName,
      aliases: (entity.aliases || []).map((alias) => ({
        value: alias.value,
        type: alias.type || 'nickname',
        confidence: Number.isFinite(Number(alias.confidence)) ? Number(alias.confidence) : 1,
        ambiguous: Boolean(alias.ambiguous),
        legacyOnly: Boolean(alias.legacyOnly),
      })),
    },
  ]),
);

const isBlockedByCompound = (text, index, length, aliasValue) => {
  const blocklist = AMBIGUOUS_ALIAS_BLOCKLIST[aliasValue];
  if (!Array.isArray(blocklist) || blocklist.length === 0) return false;
  return blocklist.some((entry) => {
    const normalizedEntry = normalizeEntityText(entry);
    if (!normalizedEntry) return false;
    let position = text.indexOf(normalizedEntry);
    while (position >= 0) {
      if (index >= position && index < position + normalizedEntry.length) return true;
      position = text.indexOf(normalizedEntry, position + 1);
    }
    return false;
  });
};

const findLatinMatches = (rawText, alias) => {
  const pattern = new RegExp(
    `(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`,
    'gi',
  );
  const matches = [];
  let match = pattern.exec(rawText);
  while (match) {
    matches.push(match.index + match[1].length);
    match = pattern.exec(rawText);
  }
  return matches;
};

const findAliasPositions = (rawText, normalizedText, alias) => {
  if (alias.latin) return findLatinMatches(rawText, alias.alias);
  const positions = [];
  let position = normalizedText.indexOf(alias.normalized);
  while (position >= 0) {
    positions.push(position);
    position = normalizedText.indexOf(alias.normalized, position + 1);
  }
  return positions;
};

/**
 * 解析 query 里的人物实体。
 *
 * @param {string} query
 * @returns {{
 *   entities: Array<{ id: string, canonicalName: string, displayName: string, matchedAliases: string[], confidence: number, ambiguous: boolean, aliases: Array<{ value: string, type: string, confidence: number, ambiguous?: boolean, legacyOnly?: boolean }> }>,
 *   expandedQuery: string,
 *   needsClarification: boolean,
 *   matchedAliases: string[],
 * }}
 */
export const resolveQueryEntities = (query) => {
  const rawText = String(query || '').normalize('NFKC');
  const normalizedText = normalizeEntityText(rawText);
  if (!normalizedText) {
    return { entities: [], expandedQuery: rawText, needsClarification: false, matchedAliases: [] };
  }

  const hasPersonSignal = PERSON_SIGNAL_RE.test(normalizedText);
  const occupied = new Array(normalizedText.length).fill(false);
  const matched = [];

  for (const alias of BOH_ENTITY_ALIAS_INDEX) {
    if (alias.normalized.length < 2) continue;
    if (alias.ambiguous && !hasPersonSignal) continue;

    const positions = findAliasPositions(rawText, normalizedText, alias);
    for (const position of positions) {
      if (position < 0) continue;
      const end = position + alias.normalized.length;
      // 中文别名用归一化串做占位（去标点后下标一致）；拉丁别名在原文上匹配，
      // 下标不属于同一坐标系 ⇒ 不做占位判断，靠词边界避免 weekend 里的 end 这类误命中。
      if (!alias.latin) {
        if (occupied.slice(position, end).some(Boolean)) continue;
        if (
          alias.ambiguous &&
          isBlockedByCompound(normalizedText, position, end - position, alias.alias)
        ) {
          continue;
        }
        occupied.fill(true, position, end);
      }
      matched.push(alias);
      break;
    }
  }

  if (matched.length === 0) {
    return { entities: [], expandedQuery: rawText, needsClarification: false, matchedAliases: [] };
  }

  const byEntity = new Map();
  for (const alias of matched) {
    const entity = ENTITY_BY_ID.get(alias.entityId);
    if (!entity) continue;
    const existing = byEntity.get(alias.entityId) || {
      ...entity,
      matchedAliases: [],
      confidence: 0,
      ambiguous: false,
    };
    if (!existing.matchedAliases.includes(alias.alias)) {
      existing.matchedAliases.push(alias.alias);
    }
    existing.confidence = Math.max(existing.confidence, alias.confidence);
    existing.ambiguous = existing.ambiguous || alias.ambiguous;
    byEntity.set(alias.entityId, existing);
  }

  const entities = [...byEntity.values()].sort(
    (a, b) => b.matchedAliases.length - a.matchedAliases.length,
  );

  const expansionTerms = new Set();
  for (const entity of entities) {
    expansionTerms.add(entity.canonicalName);
    entity.aliases
      .filter((alias) => alias.type !== 'role' && !alias.legacyOnly)
      .slice(0, 4)
      .forEach((alias) => expansionTerms.add(alias.value));
  }

  const expandedQuery = expansionTerms.size
    ? `${rawText} ${[...expansionTerms].join(' ')}`
    : rawText;

  return {
    entities,
    expandedQuery,
    needsClarification: entities.some(
      (entity) => entity.ambiguous && entity.confidence < 0.8 && entity.matchedAliases.length === 1,
    ),
    matchedAliases: matched.map((alias) => alias.alias),
  };
};

/** query 是否命中任一人名/别名（供意图路由复用，避免再维护一份硬编码名单）。 */
export const hasEntityAlias = (text) => resolveQueryEntities(text).entities.length > 0;

/** 全部别名（长别名在前），供正则/提示词拼接；调用方负责转义。 */
export const getAllEntityAliases = () => BOH_ENTITY_ALIAS_INDEX.map((alias) => alias.alias);

export const getEntityById = (id) => ENTITY_BY_ID.get(id) || null;

export const getEntityAliasPattern = () =>
  getAllEntityAliases()
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
