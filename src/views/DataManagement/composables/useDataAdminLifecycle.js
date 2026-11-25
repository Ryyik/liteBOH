/**
 * DataAdmin 生命周期 + 副作用清理
 * 拆分自 DataAdmin.vue (P2 拆分第二阶段)
 *
 * 集中管理:
 *   - onMounted: 初始化 localStorage 偏好 + 首次加载数据
 *   - onUnmounted: 清理 debounce / toast 等定时器, 避免内存泄漏
 *   - watch: 分页 / 输入草稿 / user picker debounce / plan_code 联动
 *
 * 工厂模式: 接收所有需要的 ref + 函数, 在内部 watch / lifecycle 中调用
 */

import { onMounted, onUnmounted, watch, ref } from 'vue';
import { hydrateAdminPreferences } from './useDataAdminPersistence.js';

/**
 * 安装生命周期与 watches
 * @param {Object} deps
 * @param {Object} deps.columnSettings      - ref<{}>
 * @param {Object} deps.savedFilterViews     - ref<{}>
 * @param {Object} deps.pinnedTabIds         - ref<string[]>
 * @param {Object} deps.recentRecords        - ref<Array>
 * @param {Object} deps.changeLogEntries     - ref<Array>
 * @param {Object} deps.pageSize             - ref<number>
 * @param {Object} deps.currentPage          - ref<number>
 * @param {Object} deps.currentTab           - ref<string>
 * @param {Object} deps.editingItem          - ref<{}>
 * @param {Object} deps.showModal            - ref<boolean>
 * @param {Object} deps.suppressDraftSave    - ref<boolean>
 * @param {Object} deps.suppressNextPageFetch - ref<boolean>
 * @param {Object} deps.totalPages           - computed<number>
 * @param {Object} deps.userPickerKeyword    - ref<string>
 * @param {Object} deps.searchDebounceTimer  - ref<any>
 * @param {Object} deps.userPickerSearchDebounceTimer - ref<any>
 * @param {Object} deps.isSubscriptionTab    - computed<boolean>
 * @param {Object} deps.showUserPickerModal  - ref<boolean>
 * @param {Object} deps.SUBSCRIPTION_PLAN_NAMES - 套餐名映射
 * @param {Function} deps.fetchData          - 首次加载主函数
 * @param {Function} deps.fetchTabData       - (tabId) => Promise<void>
 * @param {Function} deps.fetchUserPickerUsers - () => Promise<void>
 * @param {Function} deps.saveCurrentDraft   - () => void
 * @returns {{ draftSaveDebounceTimer: Ref<any> }}
 */
export const setupDataAdminLifecycle = (deps) => {
  const {
    columnSettings,
    savedFilterViews,
    pinnedTabIds,
    recentRecords,
    changeLogEntries,
    pageSize,
    currentPage,
    currentTab,
    editingItem,
    showModal,
    suppressDraftSave,
    suppressNextPageFetch,
    totalPages,
    userPickerKeyword,
    searchDebounceTimer,
    userPickerSearchDebounceTimer,
    isSubscriptionTab,
    showUserPickerModal,
    SUBSCRIPTION_PLAN_NAMES,
    fetchData,
    fetchTabData,
    fetchUserPickerUsers,
    saveCurrentDraft,
  } = deps;

  // ==================== onMounted ====================
  onMounted(() => {
    hydrateAdminPreferences({
      columnSettings,
      savedFilterViews,
      pinnedTabIds,
      recentRecords,
      changeLogEntries,
    });
    fetchData({ deferSecondary: true });
  });

  // ==================== watches ====================
  // 分页大小变化
  watch(pageSize, () => {
    if (currentPage.value !== 1) {
      currentPage.value = 1;
    } else {
      fetchTabData(currentTab.value);
    }
  });

  // 分页页码变化
  watch(currentPage, () => {
    if (suppressNextPageFetch.value) {
      suppressNextPageFetch.value = false;
      return;
    }
    fetchTabData(currentTab.value);
  });

  // 订阅套餐联动: 选 plan_code 自动填 plan_name
  watch(
    () => editingItem.value?.plan_code,
    (planCode) => {
      if (!isSubscriptionTab.value) return;
      const normalizedPlanCode = String(planCode || '').trim();
      const planName = SUBSCRIPTION_PLAN_NAMES[normalizedPlanCode];
      if (planName) {
        editingItem.value.plan_name = planName;
      }
    },
  );

  // 总页数变化时修正 currentPage 范围
  watch(totalPages, (pages) => {
    const safePages = Math.max(1, pages || 1);
    if (currentPage.value > safePages) {
      currentPage.value = safePages;
    }
    if (currentPage.value < 1) {
      currentPage.value = 1;
    }
  });

  // User picker 关键词 debounce
  watch(userPickerKeyword, () => {
    if (!showUserPickerModal.value) return;
    if (userPickerSearchDebounceTimer.value) {
      clearTimeout(userPickerSearchDebounceTimer.value);
    }
    userPickerSearchDebounceTimer.value = setTimeout(() => {
      fetchUserPickerUsers();
    }, 300);
  });

  // 编辑草稿自动保存: debounce 800ms 避免每键都做 JSON.stringify
  // editingItem 是 deep reactive, 频繁输入会触发序列化 + localStorage 写入
  const draftSaveDebounceTimer = ref(null);
  watch(
    editingItem,
    () => {
      if (!showModal.value || suppressDraftSave.value) return;
      if (draftSaveDebounceTimer.value) {
        clearTimeout(draftSaveDebounceTimer.value);
      }
      draftSaveDebounceTimer.value = setTimeout(() => {
        saveCurrentDraft();
        draftSaveDebounceTimer.value = null;
      }, 800);
    },
    { deep: true },
  );

  // ==================== onUnmounted ====================
  onUnmounted(() => {
    if (searchDebounceTimer.value) {
      clearTimeout(searchDebounceTimer.value);
      searchDebounceTimer.value = null;
    }
    if (userPickerSearchDebounceTimer.value) {
      clearTimeout(userPickerSearchDebounceTimer.value);
      userPickerSearchDebounceTimer.value = null;
    }
    if (draftSaveDebounceTimer.value) {
      clearTimeout(draftSaveDebounceTimer.value);
      draftSaveDebounceTimer.value = null;
    }
    /* ⚠️ 这里原本还有一段 `if (toast.timer) clearTimeout(toast.timer)` —— 已删（2026-11-25）。
       `toast` 这个依赖**从来没有被传入过**（DataAdmin 的 setupDataAdminLifecycle 调用里
       没有这个字段），而提示早已改走全站 `bohtoast` 单例（见 DataAdmin 的 showToast）。
       所以它是「引用了不存在的变量」的死代码，后果是**每次卸载都抛
       TypeError: Cannot read properties of undefined (reading 'timer')**。
       这个洞长期没暴露，是因为它只在「从详情页卸载」时触发，而详情页以往是低频深链；
       plans/049 把详情页变成高频往返之后它立刻把整页打崩（全局错误边界接住，
       用户看到「页面出了点问题」）。 */
  });
};
