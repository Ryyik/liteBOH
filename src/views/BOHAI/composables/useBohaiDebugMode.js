/**
 * useBohaiDebugMode.js — 管理员「知识库调试模式」的开关状态（2026-11-12 新增）
 *
 * 用途：管理员在 AI 设置里打开后，引擎会把本轮向量检索的**原始结果**
 * （chunk id / source_id / similarity / rerank / metadata / 未截断正文）追加进 prompt，
 * 于是可以直接问 AI「这条知识出自哪个切片、分数多少、为什么没被用上」。
 *
 * ⚠️ 三条安全口径（改之前先读完）：
 *   ① **localStorage 里只存「偏好」，不存「权限」**。真正的可用性每次由
 *      `authStore.isAdmin` 现算，且 `isEnabled = 可用 && 偏好`。
 *      ⇒ 普通用户手动把 `boh-ai-debug-mode` 写成 `1` 也**开不起来**（这是本文件存在的主因：
 *      把开关直接存成布尔值的写法，等于让前端 localStorage 决定谁能看内部数据）。
 *   ② 非管理员调用 `setEnabled(true)` 会被拒（返回 false）且不落盘，不会留下「看起来开着」的状态。
 *   ③ 调试态只影响**发给自己看的 prompt**，不放宽任何数据读取权限 —— 检索侧仍然是
 *      RLS + `getAllowedSyncSourceTypes` 那一套。别把这里当成鉴权。
 *
 * 存储键与「读/写」都在本文件收口；别在组件里再写一份 `localStorage.getItem(...)`。
 */
import { computed, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

export const BOHAI_DEBUG_MODE_STORAGE_KEY = 'boh-ai-debug-mode';

/**
 * 「最终是否生效」的**唯一判据**：权限 ∧ 偏好。
 *
 * 单独抽成纯函数是为了让这条安全语义可以被直接测（四象限），而不是只靠注释约定：
 * localStorage 里写着 `1`、但账号不是管理员 ⇒ **必须**是 false。
 *
 * @param {{ isAdmin?: boolean, preference?: boolean }} input
 * @returns {boolean}
 */
export const resolveDebugModeEnabled = ({ isAdmin = false, preference = false } = {}) =>
  Boolean(isAdmin) && Boolean(preference);

const readStoredPreference = () => {
  try {
    // 用 globalThis 而不是 window：单测跑在 node 环境（无 window），这里只需降级为「关闭」，
    // 不该因为环境缺 window 直接抛掉整个模块。
    return globalThis.localStorage?.getItem(BOHAI_DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    // 隐私模式 / 配额满 / 被策略禁用 —— 当作关闭，不要因此报错
    return false;
  }
};

const persistPreference = (enabled) => {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    if (enabled) storage.setItem(BOHAI_DEBUG_MODE_STORAGE_KEY, '1');
    else storage.removeItem(BOHAI_DEBUG_MODE_STORAGE_KEY);
  } catch {
    // 写不进去不影响本次会话（preference 已更新），下次打开会回到默认关闭
  }
};

/** 模块级单例：设置面板与引擎侧读的是同一份偏好 */
const preference = ref(readStoredPreference());

export const useBohaiDebugMode = () => {
  const authStore = useAuthStore();

  /** 当前账号有没有资格用调试模式（唯一判据：authStore.isAdmin） */
  const isAvailable = computed(() => Boolean(authStore?.isAdmin));

  /** 实际是否生效 —— 权限与偏好取交集，存储值不能单独说了算 */
  const isEnabled = computed(() =>
    resolveDebugModeEnabled({ isAdmin: isAvailable.value, preference: preference.value }),
  );

  /**
   * @param {boolean} next
   * @returns {boolean} 是否被接受（非管理员一律 false）
   */
  const setEnabled = (next) => {
    if (!isAvailable.value) {
      preference.value = false;
      persistPreference(false);
      return false;
    }
    preference.value = Boolean(next);
    persistPreference(preference.value);
    return true;
  };

  const toggle = () => setEnabled(!isEnabled.value);

  return { isAvailable, isEnabled, setEnabled, toggle };
};
