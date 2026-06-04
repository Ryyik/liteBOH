const MODRINTH_API = 'https://api.modrinth.com/v2';

export const RESOURCE_SEARCH_TYPES = ['all', 'mod', 'modpack', 'resourcepack', 'shader'];

export const RESOURCE_TYPE_LABELS = {
  all: '全部',
  mod: 'Mod',
  modpack: '整合包',
  resourcepack: '材质包',
  shader: '光影'
};

const SORT_ALIASES = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated']);

const TYPE_PATTERNS = [
  { type: 'modpack', pattern: /(整合包|整合|modpack|pack)/i },
  { type: 'resourcepack', pattern: /(材质包|资源包|材质|纹理|resource\s*pack|texture)/i },
  { type: 'shader', pattern: /(光影|shader|shaders)/i },
  { type: 'mod', pattern: /(模组|mod|插件)/i }
];

const LOADER_PATTERNS = [
  { loader: 'fabric', pattern: /fabric/i },
  { loader: 'forge', pattern: /forge/i },
  { loader: 'neoforge', pattern: /neo\s*forge|neoforge/i },
  { loader: 'quilt', pattern: /quilt/i }
];

const SEARCH_STOP_WORDS = [
  '帮我找一下', '帮我找找', '帮我找', '我想要', '我需要', '给我', '帮我',
  '搜索', '搜一下', '查找', '找一下', '找几个', '找找', '找', '推荐', '下载',
  '想要', '我要', '需要', '求', '来点', '给点', '再来点', '再推荐', '继续推荐', '再', '继续', '接着',
  '资源', '资源中心', '列表', '看看', '一点', '一些', '几个', '有没有', '可以', '一下',
  '随便', '好玩', '热门', '优秀', '高质量', '有趣', '更多', '一点点',
  'mod', '模组', '整合包', '整合', '材质包', '资源包', '材质', '光影', 'shader',
  'fabric', 'forge', 'neoforge', 'quilt', 'minecraft', '我的世界', 'mc',
  'search', 'find', 'look for', 'recommend', 'recommendation', 'download', 'popular', 'best', 'top'
];

const KNOWN_RESOURCE_ALIASES = [
  { pattern: /(植物魔法|植物学|botania)/i, terms: ['botania'] },
  { pattern: /(暮色森林|twilight\s*forest)/i, terms: ['twilight forest'] },
  { pattern: /(匠魂|tinkers?\s*construct|tconstruct)/i, terms: ['tinkers construct'] },
  { pattern: /(机械动力|机械动能|create)/i, terms: ['create'] },
  { pattern: /(应用能源|ae2|applied\s*energistics)/i, terms: ['applied energistics 2', 'ae2'] },
  { pattern: /(热力膨胀|thermal\s*expansion|thermal\s*series)/i, terms: ['thermal series'] },
  { pattern: /(通用机械|mekanism)/i, terms: ['mekanism'] },
  { pattern: /(末影接口|ender\s*io)/i, terms: ['ender io'] },
  { pattern: /(沉浸工程|immersive\s*engineering)/i, terms: ['immersive engineering'] },
  { pattern: /(农夫乐事|farmers?\s*delight)/i, terms: ["farmer's delight"] },
  { pattern: /(暮色|twilight)/i, terms: ['twilight forest'] },
  { pattern: /(jei|just\s*enough\s*items|足够物品|物品管理器)/i, terms: ['jei', 'just enough items'] },
  { pattern: /(rei|roughly\s*enough\s*items)/i, terms: ['rei', 'roughly enough items'] },
  { pattern: /(jade|玉|waila|hwyla)/i, terms: ['jade'] },
  { pattern: /(旅行地图|journey\s*map|journeymap)/i, terms: ['journeymap'] },
  { pattern: /(xaero|小地图)/i, terms: ['xaero minimap'] }
];

const QUERY_ALIASES = [
  { pattern: /(宝可梦|神奇宝贝|精灵宝可梦|口袋妖怪|pokemon|pixelmon|cobblemon)/i, terms: ['cobblemon', 'pixelmon', 'pokemon'] },
  { pattern: /(优化|性能|帧数|卡顿|流畅)/i, terms: ['performance'] },
  { pattern: /(小地图|地图导航|导航)/i, terms: ['minimap', 'map'] },
  { pattern: /(科技|工业|机械|自动化)/i, terms: ['tech', 'automation'] },
  { pattern: /(魔法|法术)/i, terms: ['magic'] },
  { pattern: /(冒险|探索|地牢)/i, terms: ['adventure', 'exploration', 'dungeon'] },
  { pattern: /(建筑|建造|装饰)/i, terms: ['building', 'decoration'] },
  { pattern: /(农业|种田|食物|料理)/i, terms: ['farming', 'food'] },
  { pattern: /(生存|养老)/i, terms: ['survival'] },
  { pattern: /(服务端|服务器)/i, terms: ['server'] },
  { pattern: /(菜单|物品栏|背包|库存)/i, terms: ['inventory', 'menu'] },
  { pattern: /(家具|家居|沙发|椅子|桌子|柜子)/i, terms: ['furniture', 'decoration'] },
  { pattern: /(室内|摆件|装饰)/i, terms: ['decoration', 'furniture'] },
  { pattern: /(高清|真实|写实)/i, terms: ['realistic', 'high resolution'] },
  { pattern: /(低配|轻量)/i, terms: ['lightweight', 'performance'] }
];

const clampInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const containsNonAscii = (value) => /[^\u0000-\u007f]/.test(String(value || ''));

export const getResourceTypeLabel = (type = 'all') => {
  return RESOURCE_TYPE_LABELS[type] || RESOURCE_TYPE_LABELS.all;
};

export const inferResourceSearchType = (text = '') => {
  const source = normalizeText(text);
  const hit = TYPE_PATTERNS.find((item) => item.pattern.test(source));
  return hit?.type || 'all';
};

export const inferResourceLoader = (text = '') => {
  const source = normalizeText(text);
  const hit = LOADER_PATTERNS.find((item) => item.pattern.test(source));
  return hit?.loader || '';
};

export const inferMinecraftVersion = (text = '') => {
  const source = normalizeText(text);
  const match = source.match(/\b(1\.(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22)(?:\.\d+)?)\b/);
  return match?.[1] || '';
};

const stripSearchNoise = (text = '') => {
  let next = normalizeText(text);
  SEARCH_STOP_WORDS.forEach((word) => {
    next = next.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  });
  next = next.replace(/\b1\.(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22)(?:\.\d+)?\b/g, ' ');
  next = next.replace(/[，。！？、；："'“”‘’()[\]{}<>]/g, ' ');
  return normalizeText(next);
};

export const buildResourceSearchQuery = (text = '', { type = 'all', loader = '', version = '' } = {}) => {
  const raw = normalizeText(text);
  const stripped = stripSearchNoise(raw);
  const terms = [];

  KNOWN_RESOURCE_ALIASES.forEach((item) => {
    if (item.pattern.test(raw)) {
      terms.push(...item.terms);
    }
  });

  if (terms.length === 0) {
    QUERY_ALIASES.forEach((item) => {
      if (item.pattern.test(raw)) {
        terms.push(...item.terms);
      }
    });
  }

  if (stripped && (!containsNonAscii(stripped) || terms.length === 0)) {
    terms.unshift(stripped);
  }

  return [...new Set(terms.map((item) => normalizeText(item)).filter(Boolean))]
    .join(' ')
    .slice(0, 180);
};

export const detectBohAIResourceSearchIntent = (text = '') => {
  const source = normalizeText(text);
  if (!source) {
    return { matched: false, query: '', type: 'all', loader: '', version: '' };
  }

  const hasResourceWord = /(资源|mod|模组|整合包|材质包|资源包|光影|shader|minecraft|我的世界|mc)/i.test(source);
  const hasResourceNeedWord = /(想要|我要|我想要|需要|求|来点|给点|有啥|有什么|want|need|looking\s*for)/i.test(source);
  const hasSearchWord = /(搜索|搜|查找|找|推荐|下载|有没有|给我|帮我|列表|search|find|look\s*for|recommend|download)/i.test(source);
  const hasResourceTopicWord = /(宝可梦|神奇宝贝|精灵宝可梦|口袋妖怪|pokemon|pixelmon|cobblemon|家具|家居|装饰|优化|性能|小地图|科技|魔法|冒险|建筑|农业|生存|服务端|背包|材质|光影)/i.test(source);
  const hasKnownResourceAlias = KNOWN_RESOURCE_ALIASES.some((item) => item.pattern.test(source));
  const type = inferResourceSearchType(source);
  const loader = inferResourceLoader(source);
  const version = inferMinecraftVersion(source);
  const matched = (
    (hasSearchWord || hasResourceNeedWord) && (hasResourceWord || type !== 'all' || hasKnownResourceAlias || Boolean(loader || version))
  ) || (hasResourceWord && hasResourceTopicWord) || ((hasSearchWord || hasResourceNeedWord) && hasKnownResourceAlias);

  return {
    matched,
    query: buildResourceSearchQuery(source, { type, loader, version }),
    type,
    loader,
    version
  };
};

export const buildModrinthFacets = ({ type = 'all', version = '', loader = '' } = {}) => {
  const facets = [];
  if (RESOURCE_SEARCH_TYPES.includes(type) && type !== 'all') {
    facets.push([`project_type:${type}`]);
  }
  if (version) {
    facets.push([`versions:${version}`]);
  }
  if (loader && !['shader', 'resourcepack'].includes(type)) {
    facets.push([`categories:${loader}`]);
  }
  return JSON.stringify(facets);
};

export const normalizeModrinthResource = (item = {}) => {
  const projectType = String(item.project_type || 'mod').trim() || 'mod';
  const slug = String(item.slug || item.project_id || '').trim();
  return {
    project_id: String(item.project_id || item.id || slug),
    title: String(item.title || slug || '未命名资源'),
    description: String(item.description || '').trim(),
    author: String(item.author || '').trim(),
    icon_url: item.icon_url || '',
    project_type: projectType,
    project_type_label: getResourceTypeLabel(projectType),
    downloads: Number(item.downloads || 0),
    follows: Number(item.follows || 0),
    date_modified: item.date_modified || item.date_created || '',
    source: 'modrinth',
    source_label: 'Modrinth',
    slug,
    url: slug ? `https://modrinth.com/${projectType}/${slug}` : 'https://modrinth.com'
  };
};

export async function searchMinecraftResourcesForBohAI({
  query = '',
  type = 'all',
  version = '',
  loader = '',
  limit = 10,
  sort = 'relevance',
  signal = undefined
} = {}) {
  const safeLimit = clampInteger(limit, 10, 1, 20);
  const safeType = RESOURCE_SEARCH_TYPES.includes(type) ? type : 'all';
  const safeSort = SORT_ALIASES.has(sort) ? sort : 'relevance';
  const safeQuery = normalizeText(query);

  const params = new URLSearchParams({
    limit: String(safeLimit),
    offset: '0',
    index: safeSort,
    facets: buildModrinthFacets({ type: safeType, version, loader })
  });
  if (safeQuery) params.set('query', safeQuery);

  const response = await fetch(`${MODRINTH_API}/search?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Modrinth 返回 ${response.status}`);
  }

  const payload = await response.json();
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  return {
    ok: true,
    query: safeQuery,
    type: safeType,
    typeLabel: getResourceTypeLabel(safeType),
    version: normalizeText(version),
    loader: normalizeText(loader),
    totalHits: Number(payload.total_hits || hits.length),
    results: hits.map(normalizeModrinthResource)
  };
}
