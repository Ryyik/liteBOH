// Re-export entry — all implementations have been moved to ./treehole/ sub-modules.
// Import paths from consumer code remain unchanged: import { ... } from '@/utils/api/treehole-api.js'

// 公共记忆 CRUD
export {
  getSharedAIMemoriesForAI,
  searchSharedAIMemoriesForAI,
  createSharedAIMemory,
  getMySharedAIMemories,
  updateSharedAIMemory,
  updateSharedAIMemoryStatus,
  deleteSharedAIMemory
} from './treehole/memory-api.js';

// 私人记忆/日记 CRUD
export {
  getMyTreeholeMemories,
  getMyTreeholeMemoriesByRange,
  getMyTreeholeMemoryDensity,
  getMyTreeholeMemoriesForAI,
  getMyTreeholeStats,
  createTreeholeMemory,
  updateTreeholeMemory,
  deleteTreeholeMemory
} from './treehole/cloud-entry-api.js';

// 树洞空间管理 + AI 功能
export {
  getMyTreeholeSpace,
  createMyTreeholeSpace,
  updateMyTreeholeSpace,
  deleteMyTreeholeSpace,
  extractMemoryCandidatesFromDialogue,
  captureTreeholeMemoriesFromDialogue,
  extractTreeholeMemoryHighlights,
  askTreeholeQwen
} from './treehole/treehole-space-api.js';

// 知识库/向量检索
export {
  searchBohAIKnowledgeForAI
} from './treehole/knowledge-search-api.js';
