<template>
  <nav class="page-strip" aria-label="页面缩略图条">
    <div ref="stripRef" class="strip-scroll">
      <div v-for="(page, index) in pages" :key="`page-${index}`" class="strip-item" :class="{
        active: index === currentIndex,
        dragging: dragIndex === index,
        'drop-before': dropIndex === index && dropSide === 'before',
        'drop-after': dropIndex === index && dropSide === 'after'
      }" draggable="canDrag(page)" role="button" :aria-label="`第 ${index + 1} 页 · ${pageLabel(page)}`"
        :aria-current="index === currentIndex ? 'true' : undefined" @click="$emit('select', index)"
        @dragstart="onDragStart(index, $event)" @dragover.prevent="onDragOver(index, $event)"
        @dragend="onDragEnd" @drop.prevent="onDrop(index)">
        <span class="strip-thumb">
          <img v-if="thumbUrl(page)" :src="thumbUrl(page)" alt="" loading="lazy" decoding="async" />
          <span v-else-if="page.pageType === 'cover'" class="strip-glyph">封面</span>
          <span v-else-if="page.pageType === 'chapter'" class="strip-glyph">章</span>
          <span v-else-if="page.pageType === 'end'" class="strip-glyph">尾</span>
          <span v-else class="strip-glyph">{{ getLayout(page.layoutId).icon }}</span>
        </span>
        <span class="strip-label">{{ pageLabel(page) }}</span>
        <button v-if="index > 0" type="button" class="strip-remove" :aria-label="`删除第 ${index + 1} 页`"
          @click.stop="$emit('remove', index)">
          <X :size="11" :stroke-width="2.6" aria-hidden="true" />
        </button>
      </div>

      <div class="strip-add-group">
        <button type="button" class="strip-add" aria-label="添加内容页" title="添加内容页" @click="$emit('add', 'content')">
          <Plus :size="15" :stroke-width="2.4" aria-hidden="true" />
        </button>
        <button type="button" class="strip-add" aria-label="添加章节页" title="添加章节页" @click="$emit('add', 'chapter')">
          <BookOpen :size="15" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <button type="button" class="strip-add" aria-label="添加尾页" title="添加尾页" @click="$emit('add', 'end')">
          <Flag :size="15" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed, ref } from 'vue';
import { BookOpen, Flag, Plus, X } from 'lucide-vue-next';
import { getLayout } from '@/utils/photo-albums/layouts.js';

const props = defineProps({
  pages: { type: Array, default: () => [] },
  photos: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: 0 },
  album: { type: Object, default: null }
});

const emit = defineEmits(['select', 'move', 'add', 'remove']);

const stripRef = ref(null);
const dragIndex = ref(-1);
const dropIndex = ref(-1);
const dropSide = ref('');

const photoById = computed(() => new Map(props.photos.map((p) => [String(p.id), p])));

function thumbUrl(page) {
  if (page.pageType === 'cover') return props.album?.coverUrl || '';
  const firstId = (page.photoRefs || [])[0];
  return firstId ? photoById.value.get(String(firstId))?.url || '' : '';
}

function pageLabel(page) {
  if (page.pageType === 'cover') return '封面';
  if (page.pageType === 'chapter') return page.chapterTitle || '章节页';
  if (page.pageType === 'end') return '尾页';
  return getLayout(page.layoutId).name;
}

function canDrag(page) {
  return page.pageType !== 'cover';
}

function onDragStart(index, event) {
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-album-page', String(index));
}

function onDragOver(index, event) {
  if (dragIndex.value < 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  dropSide.value = (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
  dropIndex.value = index;
}

function onDrop(index) {
  if (dragIndex.value < 0 || dropIndex.value < 0) return;
  let target = dropIndex.value + (dropSide.value === 'after' ? 1 : 0);
  // 计算移除原位置后的目标下标
  if (dragIndex.value < target) target -= 1;
  emit('move', dragIndex.value, target);
  onDragEnd();
}

function onDragEnd() {
  dragIndex.value = -1;
  dropIndex.value = -1;
  dropSide.value = '';
}
</script>

<style scoped>
.page-strip {
  background: var(--surface-primary, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.strip-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.strip-item {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  border-radius: 12px;
  padding: 4px 6px 6px;
  transition: background 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
}

.strip-item:hover { background: var(--surface-secondary, #f2f2f7); }
.strip-item.active { background: color-mix(in srgb, var(--brand, #0a84ff) 10%, transparent); }
.strip-item.dragging { opacity: 0.45; }

.strip-item.drop-before { box-shadow: -3px 0 0 0 var(--brand, #0a84ff); }
.strip-item.drop-after { box-shadow: 3px 0 0 0 var(--brand, #0a84ff); }

.strip-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 42px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-secondary, #f2f2f7);
}

.strip-thumb img { width: 100%; height: 100%; object-fit: cover; }

.strip-glyph {
  font-size: 11px;
  color: var(--text-tertiary, #86868b);
  letter-spacing: -1px;
}

.strip-label {
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--text-tertiary, #86868b);
}

.strip-item.active .strip-label { color: var(--brand, #0a84ff); font-weight: 600; }

.strip-remove {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  padding: 3px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.strip-item:hover .strip-remove { opacity: 1; }

.strip-add-group {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  padding-left: 10px;
  border-left: 1px solid var(--border-color, #e5e5ea);
}

.strip-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 42px;
  border: 1px dashed var(--border-color, #c7c7cc);
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary, #86868b);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.strip-add:hover {
  border-color: var(--brand, #0a84ff);
  color: var(--brand, #0a84ff);
}
</style>
