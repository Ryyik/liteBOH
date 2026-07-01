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
  border: 2px dashed #dad9d4;
  border-radius: 20px;
  padding: 40px 28px;
  text-align: center;
  cursor: pointer;
  transition: all 0.16s ease;
  background: #ffffff;
}
.fu:hover {
  border-color: #C96442;
  background: #ffffff;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}
.fu.is-dragover {
  border-color: #C96442;
  background: #fbf2ed;
  box-shadow: 0 0 0 4px rgba(201, 100, 66, 0.1);
}
.fu.has-file {
  border-style: solid;
  border-color: #dad9d4;
  padding: 16px 20px;
}
.fu-empty { padding: 12px 0; }
.fu-icon { font-size: 48px; margin-bottom: 16px; }
.fu-text { font-size: 17px; color: #3d3929; margin: 0; font-weight: 600; }
.fu-hint { font-size: 13px; color: #6e6d68; margin: 8px 0 0; font-weight: 400; }
.fu-file { display: flex; align-items: center; gap: 14px; }
.fu-file-icon { font-size: 28px; }
.fu-file-info { flex: 1; text-align: left; min-width: 0; }
.fu-file-name { display: block; font-size: 14px; color: #3d3929; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fu-file-size { display: block; font-size: 12px; color: #6e6d68; margin-top: 3px; }
.fu-remove {
  background: #f5f4ef;
  border: none;
  color: #6e6d68;
  font-size: 15px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: all 0.16s ease;
}
.fu-remove:hover { color: #d64545; background: #fcecea; }
</style>
