<template>
  <section class="storage-bar-card" aria-busy="loading ? 'true' : undefined">
    <div class="storage-bar-head">
      <div class="storage-bar-title">
        <span class="card-label">存储用量</span>
        <strong class="storage-bar-value"
          >{{ accounting.usedImages }}<span>/ {{ accounting.limit }} 张图片</span></strong
        >
      </div>
      <span v-if="accounting.overflow" class="storage-bar-overflow">已超出限额</span>
    </div>

    <div class="storage-bar-track" aria-hidden="true">
      <div
        class="storage-bar-segment private"
        :style="{ width: `${accounting.privatePercent}%` }"
      ></div>
      <div
        v-if="accounting.publicPercent > 0"
        class="storage-bar-segment public"
        :style="{ width: `${accounting.publicPercent}%` }"
      ></div>
    </div>

    <div class="storage-bar-legend">
      <button type="button" class="storage-legend-item" @click="$emit('jump-private')">
        <span class="legend-dot private" aria-hidden="true"></span>
        <span class="legend-name">私密</span>
        <span class="legend-meta"
          >{{ accounting.privateEntries }} 条 · {{ accounting.privateImages }} 张图</span
        >
      </button>
      <button
        v-if="accounting.publicEntries > 0"
        type="button"
        class="storage-legend-item"
        @click="$emit('manage-public')"
      >
        <span class="legend-dot public" aria-hidden="true"></span>
        <span class="legend-name">公开</span>
        <span class="legend-meta"
          >{{ accounting.publicEntries }} 条 · {{ accounting.publicImages }} 张图</span
        >
        <span class="legend-action">去作品格管理 ›</span>
      </button>
      <span class="storage-legend-item static">
        <span class="legend-dot remaining" aria-hidden="true"></span>
        <span class="legend-name">剩余</span>
        <span class="legend-meta">{{ accounting.remainingImages }} 张</span>
      </span>
    </div>

    <p class="storage-bar-hint">公开笔记在作品格展示，图片与私密内容共用同一 Cloud+ 额度。</p>
  </section>
</template>

<script setup>
/**
 * Cloud+ 存储条（类手机 storage）。
 *
 * 依据 2026-09-29 拍板：Cloud+ 的配额展示从「普通限额卡」升级为存储条，
 * 分段口径 = 私密 / 公开 / 剩余（Cloud+ 存的是带图笔记，配额单位是图片张数）。
 * 数字一律来自 utils/cloud-storage-accounting.js，本组件不做计算。
 */
defineProps({
  accounting: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['jump-private', 'manage-public']);
</script>

<style scoped>
.storage-bar-card {
  border: 1px solid var(--apple-border-light);
  background: linear-gradient(180deg, rgba(0, 113, 227, 0.04) 0%, rgba(255, 255, 255, 0.92) 100%);
  border-radius: var(--radius-lg);
  padding: 16px 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.storage-bar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.storage-bar-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.storage-bar-value {
  font-size: 15px;
  color: var(--apple-text);
}

.storage-bar-value span {
  font-size: 12px;
  font-weight: 500;
  color: var(--apple-text-tertiary);
  margin-left: 2px;
}

.storage-bar-overflow {
  font-size: 12px;
  color: #ff3b30;
}

.storage-bar-track {
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--apple-bg-secondary);
  border: 1px solid var(--apple-border-light);
  overflow: hidden;
  display: flex;
}

.storage-bar-segment {
  height: 100%;
  min-width: 0;
  transition: width 420ms cubic-bezier(0.23, 1, 0.32, 1);
}

.storage-bar-segment.private {
  background: linear-gradient(90deg, var(--apple-blue), var(--apple-blue-hover));
}

.storage-bar-segment.public {
  background: linear-gradient(90deg, #2fa84f, #34c759);
}

.storage-bar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
}

.storage-legend-item {
  appearance: none;
  -webkit-appearance: none;
  border: 0;
  background: none;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--apple-text-secondary);
  cursor: pointer;
}

.storage-legend-item.static {
  cursor: default;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.legend-dot.private {
  background: var(--apple-blue);
}

.legend-dot.public {
  background: #34c759;
}

.legend-dot.remaining {
  background: var(--apple-gray);
}

.legend-name {
  font-weight: 600;
  color: var(--apple-text);
}

.legend-action {
  color: var(--apple-blue);
  font-weight: 500;
}

.storage-legend-item:hover .legend-action {
  text-decoration: underline;
}

.storage-bar-hint {
  margin: 0;
  font-size: 12px;
  color: var(--apple-text-tertiary);
}
</style>
