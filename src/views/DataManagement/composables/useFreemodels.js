import { computed, ref } from 'vue';
import {
  listFreemodels,
  insertFreemodel,
  insertFreemodels,
  updateFreemodel,
  deleteFreemodel,
  findExistingFreemodelIds,
  maxFreemodelSortOrder,
} from '@/utils/api/freemodels-api.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { MODEL_PLATFORM_IDS, providerLabel } from './useKeyVault.js';

/**
 * 可用模型清单（freemodels 表）的前端真源。
 *
 * 数据访问全部走 `@/utils/api/freemodels-api.js` —— 分层棘轮禁止组件/组合式函数
 * 直连 `supabase.from(...)`（表结构改名要只改一处）。
 *
 * 「免费模型库」这个旧名字有歧义：这里的模型**不一定免费**，
 * 是否免费取决于 `bohai_model_configs.quota_multiplier` 是否为 0。
 * 本文件统一叫「可用模型清单」。
 */

/** 新模型的默认值 —— 集中一处，避免新增路径各填一份。 */
export const FREEMODEL_DEFAULTS = {
  family_label: '通用',
  best_for: '多场景聊天',
};

/** 新增模型时的空壳（表单初值）。 */
export function createEmptyFreemodel(provider = MODEL_PLATFORM_IDS[0] || 'siliconflow') {
  return {
    model_id: '',
    name: '',
    provider,
    provider_label: providerLabel(provider),
    api_base_url: '',
    family_label: FREEMODEL_DEFAULTS.family_label,
    best_for: FREEMODEL_DEFAULTS.best_for,
    sort_order: 0,
    is_active: true,
  };
}

export function useFreemodels() {
  const { confirm } = useConfirmDialog();

  const models = ref([]);
  const loading = ref(false);
  const error = ref('');
  const workingId = ref('');

  const modelsByProvider = computed(() => {
    const map = {};
    models.value.forEach((m) => {
      if (!map[m.provider]) map[m.provider] = [];
      map[m.provider].push(m);
    });
    return map;
  });

  /** 每个平台的模型数（左栏平台卡用）。 */
  const providerCounts = computed(() => {
    const map = {};
    models.value.forEach((m) => {
      map[m.provider] = (map[m.provider] || 0) + 1;
    });
    return map;
  });

  /** 只统计模型平台的模型（工具类 provider 不该出现在模型筛选里）。 */
  const providerStats = computed(() =>
    MODEL_PLATFORM_IDS.map((id) => ({
      value: id,
      label: providerLabel(id),
      total: providerCounts.value[id] || 0,
    })).filter((item) => item.total > 0),
  );

  async function load() {
    loading.value = true;
    error.value = '';
    try {
      models.value = await listFreemodels();
      return true;
    } catch (e) {
      error.value = e?.message || '加载模型清单失败';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** 某个平台下的模型，按 sort_order 升序。 */
  function modelsOf(provider) {
    return (modelsByProvider.value[provider] || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async function create(row) {
    try {
      await insertFreemodel({ ...FREEMODEL_DEFAULTS, ...row });
      await load();
      return true;
    } catch (e) {
      error.value = e?.message || '添加模型失败';
      return false;
    }
  }

  async function update(id, patch) {
    try {
      await updateFreemodel(id, patch);
      await load();
      return true;
    } catch (e) {
      error.value = e?.message || '保存模型失败';
      return false;
    }
  }

  async function toggleStatus(model) {
    workingId.value = model.id;
    const ok = await update(model.id, { is_active: !model.is_active });
    workingId.value = '';
    return ok;
  }

  async function updateSort(model, value) {
    const next = Number(value);
    if (!Number.isInteger(next) || next < 0) {
      error.value = '排序必须是不小于 0 的整数。';
      return false;
    }
    return update(model.id, { sort_order: next });
  }

  async function remove(model) {
    const ok = await confirm({
      title: '删除这个模型？',
      message: `${model.name || model.model_id}\n已经被场景引用的模型删除后，那个场景会失效。`,
      tone: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    });
    if (!ok) return false;
    try {
      await deleteFreemodel(model.id);
      await load();
      return true;
    } catch (e) {
      error.value = e?.message || '删除模型失败';
      return false;
    }
  }

  /**
   * 批量导入（「添加平台」向导的落库动作 / 旧的批量添加弹窗共用）。
   * 自带查重与 sort_order 续号，返回 { added, skipped }。
   */
  async function importModels({ provider, providerLabel: label, apiBaseUrl, rows }) {
    const list = (Array.isArray(rows) ? rows : []).filter((m) => m && m.id);
    if (!list.length) return { added: 0, skipped: 0 };
    try {
      const existing = await findExistingFreemodelIds(list.map((m) => m.id));
      let sort = await maxFreemodelSortOrder();
      const toInsert = [];
      let skipped = 0;
      list.forEach((m) => {
        if (existing.has(m.id)) {
          skipped += 1;
          return;
        }
        sort += 1;
        const fallbackName = String(m.id).split('/').pop() || m.id;
        toInsert.push({
          model_id: m.id,
          name: m.name || fallbackName,
          provider,
          provider_label: label || providerLabel(provider),
          api_base_url: apiBaseUrl || null,
          family_label: FREEMODEL_DEFAULTS.family_label,
          best_for: FREEMODEL_DEFAULTS.best_for,
          sort_order: sort,
          is_active: true,
        });
      });
      const added = await insertFreemodels(toInsert);
      await load();
      return { added, skipped };
    } catch (e) {
      error.value = e?.message || '导入模型失败';
      return { added: 0, skipped: 0, error: error.value };
    }
  }

  return {
    models,
    loading,
    error,
    workingId,
    modelsByProvider,
    providerCounts,
    providerStats,
    load,
    modelsOf,
    create,
    update,
    toggleStatus,
    updateSort,
    remove,
    importModels,
  };
}
