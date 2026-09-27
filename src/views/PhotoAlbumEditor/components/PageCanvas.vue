<template>
  <div
    class="page-canvas"
    :class="{ 'drop-target': isDragOver }"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop="onDrop"
  >
    <!-- 封面页 -->
    <div v-if="page?.pageType === 'cover'" class="canvas-cover">
      <div class="cover-frame">
        <img v-if="album?.coverUrl" :src="album.coverUrl" alt="封面" />
        <div v-else class="cover-placeholder">
          <ImageIcon :size="28" :stroke-width="1.5" aria-hidden="true" />
          <span>在右侧「页面设置」上传封面</span>
        </div>
      </div>
      <h2 class="cover-title">{{ album?.title || '未命名影集' }}</h2>
      <p v-if="album?.subtitle" class="cover-subtitle">{{ album.subtitle }}</p>
    </div>

    <!-- 章节页 -->
    <div v-else-if="page?.pageType === 'chapter'" class="canvas-chapter">
      <span class="chapter-kicker">CHAPTER</span>
      <h2>{{ page.chapterTitle || '未命名章节' }}</h2>
      <p v-if="page.note">{{ page.note }}</p>
    </div>

    <!-- 尾页 -->
    <div v-else-if="page?.pageType === 'end'" class="canvas-end">
      <span class="end-mark">FIN</span>
      <p>{{ page.note || '感谢翻阅' }}</p>
    </div>

    <!-- 内容页（版式渲染） -->
    <div
      v-else-if="page"
      class="canvas-grid"
      :style="{
        gridTemplateAreas: layout.gridAreas,
        gridTemplateRows: layout.gridRows,
        gridTemplateColumns: layout.gridColumns,
        gap: gapValue,
      }"
    >
      <figure
        v-for="(photoId, slotIndex) in page.photoRefs"
        :key="`${page}-${slotIndex}`"
        class="canvas-slot"
        :style="{ gridArea: `p${slotIndex}` }"
      >
        <img
          v-if="photoById.get(String(photoId))"
          :src="photoById.get(String(photoId)).url"
          :alt="photoById.get(String(photoId)).caption || '照片'"
          loading="lazy"
          decoding="async"
        />
        <div v-else class="slot-missing"><span>照片已移除</span></div>
        <button
          type="button"
          class="slot-remove"
          :aria-label="`移除第 ${slotIndex + 1} 张`"
          @click="$emit('remove-photo', slotIndex)"
        >
          <X :size="13" :stroke-width="2.4" aria-hidden="true" />
        </button>
      </figure>

      <aside
        v-if="layout.textArea || layout.heroText"
        class="canvas-text"
        :style="{ gridArea: 't' }"
      >
        <p v-if="page.note" class="text-note">{{ page.note }}</p>
        <template v-for="(photoId, slotIndex) in page.photoRefs" :key="`cap-${slotIndex}`">
          <p v-if="photoById.get(String(photoId))?.caption" class="text-caption">
            {{ photoById.get(String(photoId)).caption }}
          </p>
        </template>
        <p v-if="!page.note && !pageHasCaption" class="text-placeholder">在右侧为照片写配文</p>
      </aside>

      <!-- 空槽占位 -->
      <div
        v-for="emptyIndex in emptySlotCount"
        :key="`empty-${emptyIndex}`"
        class="canvas-slot slot-empty"
        :style="{ gridArea: `p${(page.photoRefs?.length || 0) + emptyIndex - 1}` }"
      >
        <span>空槽</span>
      </div>
    </div>

    <div v-else class="canvas-empty">
      <p>这一页是空的</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { X, Image as ImageIcon } from 'lucide-vue-next';
import { getLayout } from '@/utils/photo-albums/layouts.js';

const props = defineProps({
  page: { type: Object, default: null },
  album: { type: Object, default: null },
  photos: { type: Array, default: () => [] },
});

const emit = defineEmits(['drop-photo', 'remove-photo']);

const isDragOver = ref(false);

const photoById = computed(() => new Map(props.photos.map((p) => [String(p.id), p])));
const layout = computed(() => getLayout(props.page?.layoutId));

const gapValue = computed(() => (layout.value.gap === 'sm' ? '8px' : '14px'));

const pageHasCaption = computed(() =>
  (props.page?.photoRefs || []).some((id) => photoById.value.get(String(id))?.caption),
);

const emptySlotCount = computed(() => {
  if (props.page?.pageType !== 'content') return 0;
  const filled = (props.page.photoRefs || []).length;
  return Math.max(0, layout.value.maxPhotos - filled);
});

function onDrop(event) {
  isDragOver.value = false;
  const photoId = event.dataTransfer?.getData('application/x-album-photo');
  if (photoId) emit('drop-photo', photoId);
}
</script>

<style scoped>
.page-canvas {
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  transition: outline-color 0.15s ease;
  outline: 2px dashed transparent;
  outline-offset: 6px;
  border-radius: 18px;
}

.page-canvas.drop-target {
  outline-color: var(--brand, #0a84ff);
}

.canvas-cover,
.canvas-chapter,
.canvas-end,
.canvas-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--surface-primary, #fff);
  border-radius: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  padding: 28px;
}

.cover-frame {
  width: min(420px, 80%);
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 22px;
  background: var(--surface-secondary, #f2f2f7);
}

.cover-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary, #86868b);
  font-size: 13px;
}

.cover-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.cover-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
}

.chapter-kicker,
.end-mark {
  font-size: 11px;
  letter-spacing: 0.5em;
  color: var(--brand, #0a84ff);
  margin-bottom: 12px;
}

.canvas-chapter h2 {
  margin: 0 0 8px;
  font-size: 24px;
  letter-spacing: 0.14em;
}

.canvas-chapter p,
.canvas-end p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
}

.canvas-empty {
  color: var(--text-tertiary, #86868b);
  font-size: 13px;
}
.canvas-empty p {
  margin: 0;
}

.canvas-grid {
  flex: 1;
  display: grid;
  min-height: 420px;
}

.canvas-slot {
  position: relative;
  margin: 0;
  border-radius: 14px;
  overflow: hidden;
  /* 与画布同底：照片原比例完整显示（编辑所见即阅读所得，不裁切） */
  background: var(--surface-secondary, #f2f2f7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.canvas-slot img {
  flex: 1 1 auto;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
}

.slot-missing,
.slot-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-quaternary, #c7c7cc);
  border: 1.5px dashed var(--border-color, #d1d1d6);
  border-radius: 14px;
}
.slot-missing span {
  background: var(--surface-primary, #fff);
  padding: 2px 8px;
  border-radius: 8px;
}

.slot-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  padding: 5px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.canvas-slot:hover .slot-remove {
  opacity: 1;
}

.canvas-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 8px 6px;
  min-height: 0;
  overflow-y: auto;
}

.text-note {
  margin: 0;
  font-size: 15px;
  line-height: 1.9;
  color: var(--text-primary, #1d1d1f);
  white-space: pre-wrap;
  word-break: break-word;
}

.text-caption {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary, #515154);
  border-left: 3px solid var(--brand, #0a84ff);
  padding-left: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.text-placeholder {
  margin: 0;
  font-size: 12px;
  color: var(--text-quaternary, #c7c7cc);
}

@media (max-width: 720px) {
  .canvas-grid {
    display: flex;
    flex-direction: column;
    min-height: auto;
  }
  .canvas-slot {
    aspect-ratio: 4 / 3;
  }
  .canvas-slot[style*='grid-area:t'] {
    aspect-ratio: auto;
  }
}
</style>
