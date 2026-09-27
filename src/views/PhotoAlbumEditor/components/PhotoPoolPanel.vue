<template>
  <aside class="pool-panel" aria-label="照片池">
    <header class="pool-head">
      <span class="pool-title">照片池</span>
      <span class="pool-count">{{ photos.length }} 张待用</span>
    </header>

    <div class="pool-upload">
      <button type="button" class="pool-upload-btn" :disabled="uploading" @click="fileInput?.click()">
        <ImagePlus :size="16" :stroke-width="2" aria-hidden="true" />
        {{ uploading ? uploadStageLabel : '上传照片' }}
      </button>
      <button v-if="uploading" type="button" class="pool-cancel-btn" @click="$emit('cancel-upload')">取消</button>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        :disabled="uploading" @change="onFileChange" />
      <div v-if="uploading" class="pool-progress" role="status">
        <span class="pool-progress-fill" :style="{ width: `${progressPercent}%` }"></span>
      </div>
      <p class="pool-hint">支持多选；上传即安全检测，自动初排进页面</p>
    </div>

    <div v-if="!photos.length" class="pool-empty">
      <p>照片上传后会出现在这里，<br>点击或拖入右侧页面即可排版。</p>
    </div>

    <div v-else class="pool-grid">
      <div v-for="photo in photos" :key="photo.id" class="pool-item" draggable="true"
        @dragstart="onDragStart(photo, $event)" @click="$emit('use', photo)">
        <img :src="photo.url" :alt="photo.caption || '照片'" loading="lazy" decoding="async" />
        <button type="button" class="pool-remove" :aria-label="`移除照片 ${photo.id}`" @click.stop="$emit('remove', photo)">
          <Trash2 :size="12" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { ImagePlus, Trash2 } from 'lucide-vue-next';

const props = defineProps({
  photos: { type: Array, default: () => [] },
  uploading: { type: Boolean, default: false },
  uploadProgress: { type: Object, default: () => ({ done: 0, total: 0, stage: '' }) }
});

const emit = defineEmits(['upload', 'remove', 'use', 'cancel-upload']);

const fileInput = ref(null);

const progressPercent = computed(() => {
  const { done, total } = props.uploadProgress || {};
  if (!total) return 0;
  return Math.round((Number(done) / Number(total)) * 100);
});

const uploadStageLabel = computed(() => {
  const { done, total, stage } = props.uploadProgress || {};
  return stage ? `${stage} ${done}/${total}` : '处理中…';
});

function onFileChange(event) {
  const files = Array.from(event?.target?.files || []);
  event.target.value = '';
  if (files.length) emit('upload', files);
}

function onDragStart(photo, event) {
  event.dataTransfer?.setData('application/x-album-photo', String(photo.id));
  event.dataTransfer.effectAllowed = 'copy';
}

onBeforeUnmount(() => {
  if (fileInput.value) fileInput.value = null;
});
</script>

<style scoped>
.pool-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface-primary, #fff);
  border-radius: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.pool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.pool-title {
  font-size: 14px;
  font-weight: 650;
}

.pool-count {
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
}

.pool-upload {
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pool-upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--brand, #0a84ff);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.pool-upload-btn:disabled { opacity: 0.6; cursor: default; }

.pool-cancel-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #e5e5ea);
  border-radius: 10px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary, #1d1d1f);
}

.pool-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--surface-secondary, #f2f2f7);
  overflow: hidden;
}

.pool-progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--brand, #0a84ff);
  transition: width 0.2s ease;
}

.pool-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-tertiary, #86868b);
}

.pool-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
}

.pool-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 14px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  align-content: start;
}

.pool-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  cursor: grab;
  background: var(--surface-secondary, #f2f2f7);
}

.pool-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pool-item:active { cursor: grabbing; }

.pool-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  padding: 4px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
}
</style>
