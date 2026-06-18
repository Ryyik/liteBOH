<template>
  <div
    class="fu"
    :class="{ 'is-dragover': isDragover, 'has-file': !!modelValue }"
    @dragover.prevent="isDragover = true"
    @dragleave.prevent="isDragover = false"
    @drop.prevent="handleDrop"
    @click="inputRef?.click()"
  >
    <input ref="inputRef" type="file" accept=".docx" hidden @change="handleFileChange" />
    <div v-if="!modelValue" class="fu-empty">
      <div class="fu-icon">📄</div>
      <p class="fu-text">拖拽 .docx 文件到此处，或点击上传</p>
      <p class="fu-hint">仅支持 .docx 格式，所有处理在本地完成</p>
    </div>
    <div v-else class="fu-file">
      <span class="fu-file-icon">📄</span>
      <div class="fu-file-info">
        <span class="fu-file-name">{{ fileName }}</span>
        <span class="fu-file-size">{{ fileSize }}</span>
      </div>
      <button class="fu-remove" @click.stop="$emit('update:modelValue', null)">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
const props = defineProps({ modelValue: { type: File, default: null } })
const emit = defineEmits(['update:modelValue'])
const isDragover = ref(false)
const inputRef = ref(null)
const fileName = computed(() => props.modelValue?.name || '')
const fileSize = computed(() => {
  if (!props.modelValue) return ''
  const b = props.modelValue.size
  if (b < 1024) return `${b} B`
  return b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`
})
function handleDrop(e) {
  isDragover.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.name.endsWith('.docx')) emit('update:modelValue', file)
}
function handleFileChange(e) {
  const file = e.target?.files?.[0]
  if (file) emit('update:modelValue', file)
  if (inputRef.value) inputRef.value.value = ''
}
</script>

<style scoped>
.fu {
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 16px;
  padding: 28px;
  text-align: center;
  cursor: pointer;
  transition: all 0.16s ease;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.98),
    inset 0 -1px 0 rgba(148, 163, 184, 0.12),
    inset 1px 0 0 rgba(255, 255, 255, 0.58),
    inset -1px 0 0 rgba(255, 255, 255, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.38),
    0 14px 34px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}
.fu:hover {
  border-color: rgba(255, 255, 255, 0.96);
  background: rgba(255, 255, 255, 0.96);
}
.fu.is-dragover {
  border-color: #0f9f7a;
  background: rgba(15, 159, 122, 0.1);
}
.fu.has-file {
  border-color: rgba(255, 255, 255, 0.96);
  padding: 14px 16px;
}
.fu-empty { padding: 8px 0; }
.fu-icon { font-size: 40px; margin-bottom: 12px; }
.fu-text { font-size: 15px; color: #202123; margin: 0; font-weight: 500; }
.fu-hint { font-size: 12px; color: rgba(17, 17, 17, 0.58); margin: 8px 0 0; }
.fu-file { display: flex; align-items: center; gap: 10px; }
.fu-file-icon { font-size: 24px; }
.fu-file-info { flex: 1; text-align: left; min-width: 0; }
.fu-file-name { display: block; font-size: 13px; color: #202123; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fu-file-size { display: block; font-size: 11px; color: rgba(17, 17, 17, 0.58); margin-top: 2px; }
.fu-remove { background: none; border: none; color: #b0b0b0; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 7px; }
.fu-remove:hover { color: #ef4444; background: rgba(239, 68, 68, 0.08); }
</style>
