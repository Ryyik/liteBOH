/**
 * BOH AI 能力决策（保存意图 / Cloud+ 引用）—— 2026-10-02 大幅收口
 * ------------------------------------------------------------
 * 历史：本文件原是一套「auto 模式」的路由器，含 23 类意图正则与 19 个决策字段。
 * auto 模式已于 2026-06-08 移除（`chat-engine-config.js` 的 BOH_AUTO_MODE_ID），
 * 但路由子系统一直留在每轮对话里空转 —— 其中 9 类正则的产物没有任何消费方。
 * 收口依据见 `plans/024-bohai-rules-and-latency-slimming.md` §1.4。
 *
 * 现在只回答两个问题：
 *   1. 用户这句话是不是要「保存记忆」？保存到哪里（Cloud+ / 公共记忆 / 都存 / 问用户）？
 *   2. 用户这句话是不是要「参考我的 Cloud+」？
 *
 * 维护约定：
 * 1. ROUTING_PATTERNS 里的每一类正则都必须有真实消费方。新增前先确认调用点，
 *    否则会重演「正则照跑、结果没人读」。
 * 2. 删除任何一类正则前，必须追到它的消费方链终点。professionalHealth / personalSupport
 *    被 `useChatEngine.js` 直接 import —— 这两类最容易被误删。
 *    ⚠️ 旧注释点名的另 4 类（community / question / memoryQuery / memoryShare）曾因
 *    `shouldAskMemoryDestination` 而「间接存活」，但那个下游 2026-10-04 就下线了
 *    ⇒ 2026-10-12 已连同 `isLikelyCommunityMemoryShare` 一并删除（见下方注释）。
 *    追消费方链时**别再拿这条旧口径当免死金牌** —— 先 grep。
 * 3. 缓存键只看文本指纹：决策结果已不依赖登录态或 Cloud+ 开关。
 * ------------------------------------------------------------
 */

import { ROUTE_DECISION_CACHE_MAX_SIZE } from '../../../utils/bohai-constants.js';

// ------------------------------------------------------------
// LRU 缓存：最近访问的 key 排在最前，超过容量时淘汰最久未访问的。
// 之前的实现使用 Map 的插入顺序做 FIFO，长会话中最久的决策反而
// 容易被踢出，命中率较差。
// ------------------------------------------------------------
class LRUCache {
  constructor(maxSize) {
    this.maxSize = Math.max(1, Number(maxSize) || 1);
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    // 读取即刷新顺序
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
  has(key) {
    return this.map.has(key);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
}

const normalizeText = (text) =>
  String(text || '')
    .toLowerCase()
    .trim();

// 轻量哈希（FNV-1a 32 位），用于把长文本压缩为定长 key。
const fnv1a32 = (str) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(36);
};

// 文本指纹：取归一化前 200 字符 + 长度哈希
const buildTextFingerprint = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return '0:0';
  const head = normalized.slice(0, 200);
  return `${normalized.length}:${fnv1a32(head)}`;
};

export const ROUTING_PATTERNS = {
  // ── 保存意图 ────────────────────────────────────────────────
  cloudSave: {
    pattern:
      /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(cloud\+|cloud|随手记|日记|笔记|我的记录|私有记录|私人记录))|((记一下|记录一下|帮我记|帮我保存|帮我存一下)(?!.*(公共记忆|共享记忆|社群记忆|记忆库)))/i,
    label: '保存到Cloud+',
  },
  sharedSave: {
    pattern:
      /((存|保存|记录|记下|写入|加入|放到|同步到|上传到).{0,12}(公共记忆|共享记忆|社群记忆|记忆库|boh ai 公共))|((公共记忆|共享记忆|社群记忆|记忆库).{0,12}(存|保存|记录|写入|加入))/i,
    label: '保存到共享记忆',
  },
  bothSave: {
    pattern: /(两者|两个都|两边|都存|都保存|都写入|同时|一起|cloud\+.*公共|公共.*cloud\+)/i,
    label: '双重保存',
  },
  // 发帖请求不应被当作「保存记忆」（见 resolveBOHAIAutoModeDecision 的 forumPostAction）
  forumPost: {
    pattern:
      /(发帖|发个帖|发(?:一条|一篇|个)?.{0,8}帖子|发布.{0,8}帖子|论坛发帖|论坛发布|论坛发布文案|起草.{0,12}(论坛|社区|帖子|发布文案)|写.{0,12}(论坛|社区|帖子|发布文案)|生成.{0,12}(论坛|社区|帖子|发布文案)|整理.{0,12}(论坛|社区|帖子|发布文案))/i,
    label: '论坛发帖',
  },

  // ── Cloud+ 引用意图 ─────────────────────────────────────────
  dailySummary: {
    pattern:
      /(总结|复盘|回顾|梳理).{0,12}(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录|cloud\+|cloud|笔记|日记)|(我的|我).{0,16}(最近|近期|日常|生活|状态|近况|记录).{0,16}(总结|复盘|回顾|梳理)/i,
    label: '日常总结',
  },
  cloudReference: {
    pattern:
      /(根据|结合|参考|看看|读取|分析).{0,18}(我的|我).{0,18}(cloud\+|cloud|随手记|笔记|日记|记录|近况|最近|近期|状态|情绪|生活)/i,
    label: 'Cloud+引用',
  },
  internalSource: {
    pattern:
      /(cloud\+|cloud|随手记|日记|笔记|我的记录|我的资料|我的数据|我的帖子|我的账号|方块之家|block of home|\bboh\b|社区|社群|论坛|公共记忆|共享记忆|记忆库)/i,
    label: '内部数据源',
  },

  // ── 代码/命令（`isLikelyCodeOrCommandRequest` 用它，另有消费方，勿删）──
  codeOrCommand: {
    pattern:
      /(```|\/(?:give|summon|execute|tp|scoreboard|effect|title|tellraw|setblock|fill)\b|代码|编程|函数|组件|接口|api|sql|脚本|报错|bug|debug|调试|重构|命令|指令|终端|shell|bash|npm|node|python|javascript|typescript|vue|react|css|html|json|正则|minecraft\s*command|mc\s*指令|命令方块)/i,
    label: '代码或命令',
  },

  // ── 个人支持（被 useChatEngine 直接 import，驱动 responseRules）──
  professionalHealth: {
    pattern:
      /(诊断|治疗|疗法|药物|用药|处方|剂量|副作用|禁忌|疾病|病症|症状|抑郁症|焦虑症|双相|精神分裂|创伤后|ptsd|adhd|ocd|心理学研究|论文|量表|指南|咨询师|心理医生|精神科|医院|危机干预|自杀|自残|轻生|严重失眠|连续.*睡不着|几天.*没睡)/i,
    label: '专业健康',
  },
  personalSupport: {
    pattern:
      /(睡不好|睡不着|失眠|焦虑|难过|伤心|低落|不开心|委屈|孤独|害怕|心里堵|压力大|内耗|烦躁|崩溃|撑不住|想哭|关系.{0,8}(难受|冲突|紧张|别扭)|朋友.{0,8}(吵架|冲突|疏远)|家人.{0,8}(冲突|吵架|压力)|恋爱.{0,8}(难受|分手|冲突)|分手).{0,24}(咋办|怎么办|怎么处理|怎么缓解|怎么调节|有点|很|太|一直|老是|总是)?/i,
    label: '个人支持',
  },
};

export const isLikelyCodeOrCommandRequest = (text) =>
  ROUTING_PATTERNS.codeOrCommand.pattern.test(normalizeText(text));

export const isLikelyDailySummaryRequest = (text) =>
  ROUTING_PATTERNS.dailySummary.pattern.test(normalizeText(text));

export const isLikelyCloudReferenceRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.dailySummary.pattern.test(normalized)) return true;
  if (ROUTING_PATTERNS.cloudReference.pattern.test(normalized)) return true;
  if (
    ROUTING_PATTERNS.internalSource.pattern.test(normalized) &&
    /(我|我的|自己|本人)/.test(normalized)
  ) {
    return true;
  }
  return false;
};

export const isLikelyPersonalSupportRequest = (text) => {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (ROUTING_PATTERNS.professionalHealth.pattern.test(normalized)) return false;
  return ROUTING_PATTERNS.personalSupport.pattern.test(normalized);
};

// 「这句是不是在分享社群记忆」的谓词与其 4 类正则（question / community /
// memoryShare / memoryQuery）已于 2026-10-12 删除：它唯一的下游
// `shouldAskMemoryDestination`（「保存到哪里」的询问）在 2026-10-04 随 Cloud+ 写入与
// 「两处同存」一起下线，此后它零产品调用点。plans/024 标注的「间接存活」以那个下游
// 存在为前提 —— 下游没了，它们就是死代码（删除范围含门面再导出与两处单测）。
// ⚠️ 需要社区关键词表时从 git 历史取，别凭记忆重写。

// 冻结的"中性空决策"
export const EMPTY_AUTO_DECISION = Object.freeze({
  shouldSaveSharedMemory: false,
  saveDestination: 'none',
  shouldReferenceCloud: false,
});

// LRU 缓存
const decisionCache = new LRUCache(ROUTE_DECISION_CACHE_MAX_SIZE);

export const clearRouteDecisionCache = () => {
  decisionCache.clear();
};

/**
 * 解析本轮的能力决策。
 *
 * ⚠️ 第二参数（isAutoMode / cloudReferenceEnabled / isLoggedIn）保留是为了不破坏调用方签名：
 * 它们原先只用于生成 actionNotes（进度文案），而 `SHOW_INTERNAL_PROGRESS_NOTES = false`
 * 使那些文案从不显示；相关字段已于 2026-10-02 删除，因此这些开关不再影响返回值，
 * 也不再进缓存键（否则同一句话会因登录态不同而各缓存一份）。
 */
export const resolveBOHAIAutoModeDecision = (text, _options = {}) => {
  const safeText = String(text || '').trim();
  if (!safeText) return EMPTY_AUTO_DECISION;

  const cacheKey = buildTextFingerprint(safeText);
  const cached = decisionCache.get(cacheKey);
  if (cached) return cached;

  const shouldReferenceCloud = isLikelyCloudReferenceRequest(safeText);
  const forumPostAction = ROUTING_PATTERNS.forumPost.pattern.test(safeText);
  // 2026-10-04：Cloud+ 写入（cloudSave）与「两处同存」（bothSave）已下线 ⇒ 目的地只剩
  // shared / none 两种；「问用户存哪里」（shouldAskMemoryDestination）也随之取消。
  // 该函数与它的 4 类正则已于 2026-10-12 删除（本注释原先写「先保留」，
  // 直到这次带反证地清理完 —— 见上方「删除说明」）。
  const wantsSharedSave = !forumPostAction && ROUTING_PATTERNS.sharedSave.pattern.test(safeText);
  const saveDestination = wantsSharedSave ? 'shared' : 'none';

  const decision = {
    shouldSaveSharedMemory: saveDestination === 'shared',
    saveDestination,
    shouldReferenceCloud,
  };

  decisionCache.set(cacheKey, decision);
  return decision;
};

export { buildTextFingerprint, LRUCache };
