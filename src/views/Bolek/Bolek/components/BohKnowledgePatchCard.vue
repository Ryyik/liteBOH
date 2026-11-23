<template>
  <!-- 知识库变更单确认卡（2026-11-12）
       模型只能「提议」，这里是人确认的唯一入口。三条口径：
       ① 每一条都要单独点「应用」，不做「打开就自动执行」；
       ② `archive`（下架）是软删，文案里写清「可恢复」，不给「删除」这种不可逆暗示；
       ③ 应用结果逐条显示（成功/失败原因），不弹全局 toast —— 一次可能有多条。 -->
  <section class="boh-kp" aria-label="知识库变更单">
    <header class="boh-kp-head">
      <span class="boh-kp-title">知识库变更单（需确认）</span>
      <button
        v-if="pendingCount > 1"
        type="button"
        class="boh-kp-all"
        :disabled="applying"
        @click="applyAll"
      >
        {{ applying ? '应用中…' : `全部应用（${pendingCount}）` }}
      </button>
    </header>

    <div
      v-for="(row, index) in rows"
      :key="`${row.id || 'new'}-${index}`"
      class="boh-kp-item"
      :class="{ 'is-danger': row.action === 'archive', 'is-done': row.status === 'applied' }"
    >
      <div class="boh-kp-row">
        <span class="boh-kp-badge">{{ actionLabel(row.action) }}</span>
        <code v-if="row.id" class="boh-kp-id">{{ shortId(row.id) }}</code>
        <span v-if="row.status === 'applied'" class="boh-kp-state is-ok">已应用</span>
        <span v-else-if="row.status === 'failed'" class="boh-kp-state is-err">{{
          row.error || '失败'
        }}</span>
        <button
          v-else
          type="button"
          class="boh-kp-apply"
          :disabled="row.status === 'applying'"
          @click="applyOne(index)"
        >
          {{ row.status === 'applying' ? '应用中…' : '应用' }}
        </button>
      </div>

      <div v-if="row.title" class="boh-kp-line">标题：{{ row.title }}</div>
      <div v-if="row.content" class="boh-kp-preview">{{ preview(row.content) }}</div>
      <!-- 局部替换：直接给「删什么 / 加什么」，让确认的人一眼看出改动面只有这几个字 -->
      <div v-else-if="row.action === 'edit'" class="boh-kp-diff">
        <div class="boh-kp-diff-row is-del">
          <span class="boh-kp-diff-sign">−</span>
          <span>{{ snippet(row.find) }}</span>
        </div>
        <div v-if="row.replace" class="boh-kp-diff-row is-add">
          <span class="boh-kp-diff-sign">+</span>
          <span>{{ snippet(row.replace) }}</span>
        </div>
        <div v-else class="boh-kp-diff-hint">替换为空 ⇒ 删除上面这段</div>
      </div>
      <div v-else-if="row.action === 'archive'" class="boh-kp-preview is-muted">
        这条知识将从检索结果中下架（软删，可恢复）。
      </div>
      <div v-if="row.reason" class="boh-kp-reason">{{ row.reason }}</div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
  archiveKnowledgeChunk,
  editKnowledgeChunk,
  upsertKnowledgeChunk,
} from '@/utils/api/boh-ai-knowledge-admin-api.js';

const props = defineProps({
  patches: { type: Array, default: () => [] },
  messageIndex: { type: Number, default: -1 },
});
const emit = defineEmits(['applied']);

const ACTION_LABELS = {
  update: '修改',
  create: '新增',
  edit: '局部改写',
  archive: '下架',
};

const toRows = (patches) =>
  (Array.isArray(patches) ? patches : []).map((patch) => ({
    ...patch,
    status: 'pending',
    error: '',
  }));

const rows = ref(toRows(props.patches));

/* 同一份 patch 数组引用不变（BohChatStream 侧有 WeakMap 缓存），所以这里正常不会重置；
   一旦内容真的变了（新消息复用了同一个气泡），重建状态是正确行为。 */
watch(
  () => props.patches,
  (next) => {
    rows.value = toRows(next);
  },
);

const pendingCount = computed(() => rows.value.filter((row) => row.status === 'pending').length);
const applying = computed(() => rows.value.some((row) => row.status === 'applying'));

const actionLabel = (action) => ACTION_LABELS[action] || action;
const shortId = (id) => String(id || '').slice(0, 8);
const preview = (content) => {
  const text = String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
};

/** 局部替换的原文/新文展示：同样折叠空白（含换行），否则多行片段会把卡片撑很高 */
const snippet = (content) => {
  const text = String(content || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};

const submit = async (row) => {
  if (row.action === 'archive') {
    return archiveKnowledgeChunk({ id: row.id });
  }
  if (row.action === 'edit') {
    return editKnowledgeChunk({
      id: row.id,
      find: row.find,
      replace: row.replace,
      allowMultiple: row.allowMultiple === true,
    });
  }
  return upsertKnowledgeChunk({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    title: row.title,
    content: row.content,
  });
};

const applyOne = async (index) => {
  const row = rows.value[index];
  if (!row || row.status === 'applying' || row.status === 'applied') return;
  row.status = 'applying';
  row.error = '';
  try {
    const result = await submit(row);
    if (result?.ok) {
      row.status = 'applied';
      emit('applied', { index, action: row.action, id: row.id, messageIndex: props.messageIndex });
    } else {
      row.status = 'failed';
      row.error = result?.message || '变更失败';
    }
  } catch (error) {
    row.status = 'failed';
    row.error = error?.message || '变更异常';
  }
};

/* 顺序执行：一次可能命中同一个 source，并发写会互相覆盖 */
const applyAll = async () => {
  for (let index = 0; index < rows.value.length; index += 1) {
    if (rows.value[index].status === 'pending') {
      await applyOne(index); // 必须串行，理由见上
    }
  }
};
</script>

<style scoped>
.boh-kp {
  margin: 10px 0 2px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  background: color-mix(in srgb, currentColor 4%, transparent);
  font-size: 13px;
  line-height: 1.5;
}
.boh-kp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.boh-kp-title {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.boh-kp-all,
.boh-kp-apply {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.boh-kp-all:disabled,
.boh-kp-apply:disabled {
  opacity: 0.5;
  cursor: default;
}
.boh-kp-item + .boh-kp-item {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed color-mix(in srgb, currentColor 12%, transparent);
}
.boh-kp-item.is-danger .boh-kp-badge {
  color: #e5484d;
  border-color: color-mix(in srgb, #e5484d 40%, transparent);
}
.boh-kp-item.is-done {
  opacity: 0.72;
}
.boh-kp-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.boh-kp-badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  font-size: 11px;
  letter-spacing: 0.02em;
}
.boh-kp-id {
  flex: none;
  font-size: 11px;
  opacity: 0.7;
}
.boh-kp-state {
  margin-left: auto;
  font-size: 12px;
}
.boh-kp-state.is-ok {
  color: #12a594;
}
.boh-kp-state.is-err {
  color: #e5484d;
}
.boh-kp-apply {
  margin-left: auto;
}
.boh-kp-line,
.boh-kp-reason {
  margin-top: 4px;
  opacity: 0.86;
}
.boh-kp-preview {
  margin-top: 4px;
  opacity: 0.72;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.boh-kp-preview.is-muted {
  font-style: italic;
}
/* 局部改写：− 原文 / + 新文。用色块而不是字体色区分，暗色主题下也可读 */
.boh-kp-diff {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 5px;
  font-size: 12.5px;
}
.boh-kp-diff-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 6px;
}
.boh-kp-diff-row.is-del {
  color: #e5484d;
  background: color-mix(in srgb, #e5484d 10%, transparent);
}
.boh-kp-diff-row.is-add {
  color: #12a594;
  background: color-mix(in srgb, #12a594 10%, transparent);
}
.boh-kp-diff-sign {
  flex: none;
  font-weight: 600;
  opacity: 0.8;
}
.boh-kp-diff-hint {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.62;
}
.boh-kp-reason {
  font-size: 12px;
  opacity: 0.62;
}
</style>
