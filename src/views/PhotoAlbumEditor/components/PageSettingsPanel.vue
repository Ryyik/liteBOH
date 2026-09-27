<template>
  <aside class="settings-panel" aria-label="页面设置">
    <!-- 封面页设置 -->
    <template v-if="isCover">
      <header class="sp-head"><span>封面设置</span></header>
      <div class="sp-field">
        <span class="sp-label">封面图</span>
        <button type="button" class="sp-cover" @click="coverInput?.click()">
          <img v-if="album?.coverUrl" :src="album.coverUrl" alt="封面" />
          <span v-else><ImagePlus :size="16" :stroke-width="1.8" aria-hidden="true" /> 上传封面</span>
        </button>
        <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onCoverChange" />
      </div>
      <label class="sp-field">
        <span class="sp-label">副标题</span>
        <input :value="album?.subtitle || ''" type="text" maxlength="120" placeholder="一句话点题"
          @change="$emit('update-album', { subtitle: $event.target.value })" />
      </label>
      <p class="sp-hint">标题在顶部工具栏修改；封面可自由裁切。</p>
    </template>

    <!-- 章节页设置 -->
    <template v-else-if="page?.pageType === 'chapter'">
      <header class="sp-head"><span>章节设置</span></header>
      <label class="sp-field">
        <span class="sp-label">章节标题</span>
        <input :value="page.chapterTitle" type="text" maxlength="80" placeholder="例如：山海之间"
          @input="$emit('update-page', { chapterTitle: $event.target.value })" />
      </label>
      <label class="sp-field">
        <span class="sp-label">章节引言（可选）</span>
        <textarea :value="page.note" rows="3" maxlength="500" placeholder="写一点引子"
          @input="$emit('update-page', { note: $event.target.value })"></textarea>
      </label>
    </template>

    <!-- 尾页设置 -->
    <template v-else-if="page?.pageType === 'end'">
      <header class="sp-head"><span>尾页设置</span></header>
      <label class="sp-field">
        <span class="sp-label">结束语（可选）</span>
        <textarea :value="page.note" rows="3" maxlength="500" placeholder="默认显示「感谢翻阅」"
          @input="$emit('update-page', { note: $event.target.value })"></textarea>
      </label>
    </template>

    <!-- 内容页设置 -->
    <template v-else-if="page">
      <header class="sp-head"><span>页面设置</span></header>

      <div class="sp-field">
        <span class="sp-label">版式</span>
        <div class="sp-layouts" role="listbox" aria-label="版式选择">
          <button v-for="option in layoutOptions" :key="option.id" type="button" role="option"
            class="sp-layout" :class="{ active: option.id === page.layoutId }"
            :aria-selected="option.id === page.layoutId" :title="option.description"
            @click="$emit('set-layout', option.id)">
            <span class="sp-layout-icon">{{ option.icon }}</span>
            <span>{{ option.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="pagePhotos.length" class="sp-field">
        <span class="sp-label">配文</span>
        <div class="sp-captions">
          <label v-for="(photo, index) in pagePhotos" :key="photo.id" class="sp-caption">
            <span class="sp-caption-index">图 {{ index + 1 }}</span>
            <input :value="photo.caption" type="text" maxlength="300" placeholder="给这张照片写一句话"
              @change="$emit('set-caption', photo.id, $event.target.value)" />
          </label>
        </div>
      </div>

      <label class="sp-field">
        <span class="sp-label">页面手记（可选）</span>
        <textarea :value="page.note" rows="3" maxlength="500" placeholder="只属于这一页的话"
          @input="$emit('update-page', { note: $event.target.value })"></textarea>
      </label>
    </template>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { ImagePlus } from 'lucide-vue-next';
import { getLayoutOptions } from '@/utils/photo-albums/layouts.js';

const props = defineProps({
  page: { type: Object, default: null },
  album: { type: Object, default: null },
  photos: { type: Array, default: () => [] }
});

const emit = defineEmits(['set-layout', 'update-page', 'update-album', 'set-caption', 'cover-file']);

const coverInput = ref(null);
const layoutOptions = getLayoutOptions();

const isCover = computed(() => props.page?.pageType === 'cover');

const pagePhotos = computed(() => {
  const map = new Map(props.photos.map((p) => [String(p.id), p]));
  return (props.page?.photoRefs || [])
    .map((id) => map.get(String(id)))
    .filter(Boolean);
});

function onCoverChange(event) {
  const file = event?.target?.files?.[0];
  event.target.value = '';
  if (file) emit('cover-file', file);
}

onBeforeUnmount(() => {
  if (coverInput.value) coverInput.value = null;
});
</script>

<style scoped>
.settings-panel {
  min-height: 0;
  overflow-y: auto;
  background: var(--surface-primary, #fff);
  border-radius: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sp-head span {
  font-size: 14px;
  font-weight: 650;
}

.sp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #515154);
}

.sp-field input,
.sp-field textarea {
  padding: 9px 12px;
  border: 1px solid var(--border-color, #d1d1d6);
  border-radius: 10px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface-secondary, #f8f8fa);
  color: var(--text-primary, #1d1d1f);
  outline: none;
  resize: vertical;
}

.sp-field input:focus,
.sp-field textarea:focus { border-color: var(--brand, #0a84ff); }

.sp-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96px;
  border: 1.5px dashed var(--border-color, #c7c7cc);
  border-radius: 12px;
  background: var(--surface-secondary, #f8f8fa);
  color: var(--text-tertiary, #86868b);
  font-size: 13px;
  cursor: pointer;
  overflow: hidden;
}

.sp-cover:hover { border-color: var(--brand, #0a84ff); }
.sp-cover img { width: 100%; height: 100%; object-fit: cover; }
.sp-cover span { display: inline-flex; align-items: center; gap: 6px; }

.sp-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-tertiary, #86868b);
}

.sp-layouts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.sp-layout {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-color, #e5e5ea);
  border-radius: 10px;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary, #1d1d1f);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.sp-layout:hover { background: var(--surface-secondary, #f2f2f7); }

.sp-layout.active {
  border-color: var(--brand, #0a84ff);
  background: color-mix(in srgb, var(--brand, #0a84ff) 8%, transparent);
}

.sp-layout-icon { font-size: 13px; letter-spacing: -1px; }

.sp-captions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sp-caption {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp-caption-index {
  font-size: 11px;
  color: var(--text-tertiary, #86868b);
}
</style>
