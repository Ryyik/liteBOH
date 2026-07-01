import { computed, ref, watch } from 'vue';

/**
 * 根据用户 ID 列表计算 tier map（等级映射）。
 *
 * 替代原先多处重复的 `watch(ids, ..., { immediate: true, deep: true })` 模式：
 * 原方案对用户对象数组的每个字段变化都会重建整个 tier map，开销过大。
 *
 * 本 composable 用 computed 构建 map，computed 仅依赖 idsGetter 实际访问到的
 * 字段（通常是数组 length 与 id / author_id），不再 deep 遍历全部字段。
 *
 * 注意：useUserTier 的 tierCache 为非响应式 Map，getNicknameClass 读取缓存后
 * computed 不会自动重算。因此内部用一个浅 watch（无 deep）在数据源引用/结构
 * 变化时调用 fetchUserTier 拉取并缓存等级，完成后自增 fetchVersion 触发
 * computed 重新求值。
 *
 * @param {() => string[]} idsGetter - 返回去重后用户 ID 列表的响应式 getter
 *   （需遍历源数组以建立 length 依赖，从而捕获 push/splice 等变更）
 * @param {(id: string) => string} getNicknameClassFn - 根据缓存返回等级样式类名
 * @param {(id: string) => Promise<string>} fetchUserTierFn - 拉取并缓存用户等级
 * @returns {import('vue').ComputedRef<Record<string, string>>} tierMap
 */
export function useTierMap(idsGetter, getNicknameClassFn, fetchUserTierFn) {
  // fetch 完成后自增，使 computed 在缓存被填充后重新求值
  const fetchVersion = ref(0);

  const tierMap = computed(() => {
    fetchVersion.value; // 依赖 fetch 完成事件
    const idList = idsGetter();
    const map = {};
    if (!idList || !Array.isArray(idList)) return map;
    idList.forEach((id) => {
      if (id) map[id] = getNicknameClassFn(id);
    });
    return map;
  });

  // 浅 watch：仅当 idsGetter 访问到的响应式依赖变化时触发 fetch，避免 deep 遍历
  watch(idsGetter, async () => {
    const idList = idsGetter();
    if (!idList || !Array.isArray(idList)) return;
    try {
      await Promise.all(idList.map((id) => fetchUserTierFn(id)));
    } catch {
      // 静默处理，fetchUserTierFn 内部已有兜底
    } finally {
      fetchVersion.value++;
    }
  }, { immediate: true });

  return tierMap;
}
