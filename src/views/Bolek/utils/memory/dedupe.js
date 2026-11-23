/**
 * dedupe.js — 记忆去重比较 + 显式记忆内容抽取
 *
 * 来源：从 `composables/bolek-engine-helpers.js` **原样拆出**（plans/025 v2 · Step 3「utils 归位」）。
 * 值逐字不变；原 barrel `bolek-engine-helpers.js` 已在 Step 3 ⑧ 删除，消费方直连本模块。
 *
 * ⚠️ 2026-11-22（plans/044 阶段 0）判重/supersede **判定已下沉**到
 * `@/utils/memory/memory-supersede.js`：`treehole-space-api.js`（utils/api 层）也要用，
 * 而 utils 层反向 import `views/Bolek/utils` 是架构债。本文件只做 **re-export**，
 * `useChatEngine` / `useActionDraft` / 存量测试的 import 路径一行不改。
 * 别再把判定实现抄回这里 —— 两份真源会立刻漂移（本文件曾与 supersede 并存的同一批
 * 函数逐字重复 150 行）。`extractExplicitMemoryContent` 是博莱克专属语义，留在这里。
 */
import { stripWrappingQuotes, truncateText } from '../text/normalize.js';

export {
  classifyMemoryWrite,
  findSupersededMemory,
  isLikelyMemoryDuplicate,
  normalizeMemoryCompareText,
} from '@/utils/memory/memory-supersede.js';

export const extractExplicitMemoryContent = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const patterns = [
    /^(?:请|麻烦|帮我)?(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)[：:，,\s]*(.+)$/u,
    /^(?:我要|我想|请)?(?:上传|添加|保存|沉淀)(?:一条)?记忆[：:，,\s]*(.+)$/u,
    /^(?:记忆沉淀|记忆)[：:，,\s]*(.+)$/u,
    /^(?:请|麻烦|帮我)?把(.+?)(?:记住|记下来|保存到记忆(?:库)?|加入记忆(?:库)?|存到记忆(?:库)?)(?:吧|一下)?$/u,
  ];

  for (const pattern of patterns) {
    const matched = raw.match(pattern);
    if (!matched?.[1]) continue;
    const cleaned = stripWrappingQuotes(matched[1]);
    if (cleaned.length >= 2) return truncateText(cleaned, 320);
  }

  return '';
};
