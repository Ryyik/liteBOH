/**
 * Agent 集群共用的轻量正则/词表常量。
 * 把零散在 useChatEngine.js / agents 内的"触发词/抑制词"集中到一处，
 * 方便 worker / orchestrator / cluster helpers 共享同一份词法判断口径。
 */

export const RESOURCE_QUERY_NOISE_PATTERN = /(帮我找一下|帮我找找|帮我找|我想要|我需要|我要|想要|需要|找一下|找几个|找找|找|求|来点|给点|再来点|再推荐|继续推荐|再|继续|接着|推荐|搜索|搜一下|搜|查找|下载|看看|有没有|可以|一下|一点点|一点|一些|几个|随便|好玩|热门|优秀|高质量|有趣|更多|资源中心|资源|列表|整合包|整合|模组|资源包|材质包|材质|光影|minecraft|我的世界|mc|modpack|mods?|shader|resource\s*pack|texture\s*pack|recommendations?|popular|best|top|download|search|find|look\s*for)/ig;

export const WEAK_RESOURCE_QUERY_PATTERN = /^(一点点|一点|一些|几个|随便|好玩|热门|优秀|高质量|有趣|更多|推荐|资源|列表|整合包|整合|模组|mod|mods|modpack|modpacks|材质|材质包|资源包|resourcepack|resource pack|shader|光影|minecraft|mc|popular|best|top|recommend|recommendation)$/i;

export const RESOURCE_FOLLOW_UP_PATTERN = /(再|继续|接着|还是|类似|同类|相关|刚刚|刚才|上面|这些|这种|那个)/;

export const RESOURCE_RECOMMENDATION_PATTERN = /(推荐|来点|给点|找几个|找一些|随便|好玩|热门|优秀|高质量|有趣|有什么|有啥|有没有)/i;

export const KNOWN_RESOURCE_NAME_ALIASES = Object.freeze([
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
]);

/**
 * 资源/Minecraft 模组查询的"噪声词"剥离工具：把"帮我找一下""推荐""热门"之类的辅助动词去掉，
 * 仅留下实体关键词供检索 Agent 使用。
 */
export const stripResourceQueryNoise = (normalizePromptLine, value = '') => {
  if (typeof normalizePromptLine !== 'function') return String(value || '').trim();
  return normalizePromptLine(value, 120)
    .toLowerCase()
    .replace(RESOURCE_QUERY_NOISE_PATTERN, ' ')
    .replace(/\b1\.(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22)(?:\.\d+)?\b/g, ' ')
    .replace(/[，。！？、；："'“”‘’()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};
