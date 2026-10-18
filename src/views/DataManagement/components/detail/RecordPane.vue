<template>
  <div class="record-pane">
    <DetailHeader :crumbs="crumbs" :title="recordTitle" @crumb="onCrumb" @back="$emit('back')" />

    <div v-if="loading" class="record-pane-state">加载中…</div>

    <div v-else-if="notFound" class="record-pane-state">
      <p>记录不存在或已被删除。</p>
      <button type="button" class="btn btn-secondary" @click="$emit('back')">返回列表</button>
    </div>

    <div v-else-if="error" class="record-pane-error" role="alert">
      <p>加载失败：{{ error }}</p>
      <button type="button" class="btn btn-secondary" @click="fetchRecord">重试</button>
    </div>

    <template v-else>
      <div class="record-pane-layout">
        <div class="record-pane-main">
          <!-- D2 升级：编辑态 = 完整抽屉表单 Teleport 进本槽位（全部字段类型可用），
               只读视图与编辑表单互斥显示；槽位必须常驻（Teleport 目标） -->
          <DetailFields v-show="!editing" :fields="fields" :record="record" />
          <div id="detail-edit-slot" v-show="editing"></div>
        </div>
        <DetailAside
          v-if="!editing"
          :record="record"
          :related-labels="getRelatedLabels?.(record) || []"
          :can-delete="canDelete"
          @delete="$emit('delete', record)"
        />
      </div>
      <DetailActionBar
        :editing="editing"
        :saving="saving"
        :can-edit="canEdit"
        @edit="$emit('edit', record)"
        @save="$emit('save')"
        @cancel="$emit('cancel-edit')"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import DetailHeader from './DetailHeader.vue';
import DetailFields from './DetailFields.vue';
import DetailAside from './DetailAside.vue';
import DetailActionBar from './DetailActionBar.vue';
import { fetchRecordById } from '@/utils/api/data-admin-table-api.js';
import { buildRecordBreadcrumb } from '../../composables/detail-breadcrumb.js';

const props = defineProps({
  recordId: { type: String, required: true },
  table: { type: String, default: '' },
  selectColumns: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  moduleLabel: { type: String, default: '' },
  tabLabel: { type: String, default: '' },
  getRelatedLabels: { type: Function, default: null },
  canDelete: { type: Boolean, default: false },
  // 页内编辑（D2 升级）：editing 由 DataAdmin 的 detailEditing 驱动，
  // editModel 即 DataAdmin 的 editingItem（保存管线直接消费）
  editing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  editModel: { type: Object, default: null },
});
const emit = defineEmits(['back', 'edit', 'crumb', 'delete', 'save', 'cancel-edit', 'open-drawer']);

const record = ref(null);
const loading = ref(false);
const notFound = ref(false);
const error = ref('');

const recordTitle = computed(
  () => record.value?.title || record.value?.username || record.value?.name || props.recordId,
);

const crumbs = computed(() =>
  buildRecordBreadcrumb({
    moduleLabel: props.moduleLabel,
    tabLabel: props.tabLabel,
    recordTitle: recordTitle.value,
  }),
);

const fetchRecord = async () => {
  loading.value = true;
  notFound.value = false;
  error.value = '';
  try {
    const row = await fetchRecordById({
      table: props.table,
      selectColumns: props.selectColumns,
      id: props.recordId,
    });
    record.value = row || null;
    notFound.value = !row;
  } catch (e) {
    // 错误只 banner + 重试，不 toast（D1 口径：错误状态要可见可恢复）
    error.value = String(e?.message || e || '未知错误');
  } finally {
    loading.value = false;
  }
};

const onCrumb = (idx) => emit('crumb', idx);

watch(
  () => [props.recordId, props.table],
  () => {
    if (props.recordId && props.table) fetchRecord();
  },
  { immediate: true },
);

// 详情页内编辑保存后由父级调用，刷新只读视图
defineExpose({ fetchRecord });
</script>

<style scoped>
.record-pane-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--muted-foreground);
}

.record-pane-error {
  padding: 16px 18px;
  border: 1px solid var(--destructive, #e5484d);
  border-radius: 12px;
  color: var(--foreground);
}

.record-pane-error p {
  margin: 0 0 10px;
}

.record-pane-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .record-pane-layout {
    grid-template-columns: 1fr;
  }
}
</style>
