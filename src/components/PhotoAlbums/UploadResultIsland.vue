<!--
  上传结果岛（聚合一次性通知）

  来源：PhotoAlbumEditor 的 onUpload
  渲染位置：导航 surface 的 custom 槽（showIsland.custom 调用）
  设计：本组件只负责"汇总卡片 + 可展开被拒明细"，关闭由调用方或自定义定时器负责。

  ⚠️ 不要新增单张 notify 调用 —— 上传结果只能走这里统一呈现。
-->
<template>
  <div class="uri-root" role="status" aria-live="polite">
    <header class="uri-head">
      <CheckCircle2
        v-if="!hasReject"
        :size="16"
        :stroke-width="2.4"
        class="uri-icon uri-icon--ok"
        aria-hidden="true"
      />
      <AlertCircle
        v-else
        :size="16"
        :stroke-width="2.4"
        class="uri-icon uri-icon--warn"
        aria-hidden="true"
      />
      <span class="uri-title">{{ headline }}</span>
      <button
        v-if="closable"
        type="button"
        class="uri-close"
        aria-label="关闭"
        @click="$emit('close')"
      >
        <X :size="13" :stroke-width="2.2" aria-hidden="true" />
      </button>
    </header>

    <p v-if="hasReject" class="uri-summary">
      <span>{{ rejected.length }} 张未通过安全检测</span>
      <button
        v-if="rejected.length > 0"
        type="button"
        class="uri-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '查看' }}
        <ChevronDown
          :size="13"
          :stroke-width="2.2"
          :class="{ rotate: expanded }"
          aria-hidden="true"
        />
      </button>
    </p>

    <ul v-if="expanded && rejected.length" class="uri-list">
      <li v-for="item in rejected" :key="item.name + '|' + item.reason">
        <span class="uri-name">{{ item.name }}</span>
        <span class="uri-reason">{{ item.reason }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, CheckCircle2, ChevronDown, X } from 'lucide-vue-next';

const props = defineProps({
  total: { type: Number, required: true },
  okCount: { type: Number, required: true },
  rejected: { type: Array, default: () => [] },
  closable: { type: Boolean, default: true },
});

defineEmits(['close']);

const expanded = ref(false);

const hasReject = computed(() => props.rejected.length > 0);

const headline = computed(() => {
  if (props.total === 0) return '没有文件可上传';
  if (props.okCount === 0) return `0 / ${props.total} 张加入影集`;
  return `${props.okCount} / ${props.total} 张已加入影集`;
});
</script>

<style scoped>
/*
  外层 class="liquid-glass liquid-glass--strong" 由调用方加；
  这里只放内容布局，避免和外层 liquid-shadow 等打架。
  嵌套 liquid-glass → 自动落 nested（不重复 backdrop-filter），
  所以本组件根不再叠 liquid 类。
*/
.uri-root {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 240px;
  max-width: 320px;
  padding: 4px 6px;
  color: var(--text-primary, #1d1d1f);
  font-size: 13px;
}

.uri-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.uri-icon {
  flex-shrink: 0;
  color: var(--text-tertiary, #86868b);
}

.uri-icon--ok {
  color: #34c759;
}
.uri-icon--warn {
  color: #ff9f0a;
}

.uri-title {
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.uri-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary, #86868b);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.uri-close:hover {
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-primary, #1d1d1f);
}

.uri-summary {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary, #515154);
}

.uri-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--brand, #0a84ff);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.uri-toggle:hover {
  background: var(--surface-secondary, #f2f2f7);
}
.uri-toggle :deep(svg).rotate {
  transform: rotate(180deg);
  transition: transform 0.2s ease;
}
.uri-toggle :deep(svg) {
  transition: transform 0.2s ease;
}

.uri-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 144px;
  overflow: auto;
  border-top: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.06));
  padding-top: 6px;
}

.uri-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.uri-name {
  flex: 0 0 auto;
  max-width: 50%;
  font-weight: 600;
  color: var(--text-primary, #1d1d1f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uri-reason {
  flex: 1 1 auto;
  text-align: right;
  color: var(--text-tertiary, #86868b);
}
</style>
