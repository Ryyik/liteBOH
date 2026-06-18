<template>
  <div class="tpl">
    <div class="tpl-head">
      <span class="tpl-title">样式模板</span>
      <span class="tpl-count">{{ templates.length }}</span>
    </div>
    <div v-if="templates.length === 0" class="tpl-empty">暂无模板</div>
    <div v-else class="tpl-list">
      <div
        v-for="t in templates" :key="t.id"
        class="tpl-row"
        :class="{ active: activeId === t.id }"
        @click="$emit('select', t)"
      >
        <div class="tpl-info">
          <span class="tpl-name">{{ t.name }}</span>
          <span v-if="t.description" class="tpl-desc">{{ t.description }}</span>
        </div>
        <button v-if="!isPreset(t.id)" class="tpl-del" @click.stop="handleDelete(t.id)" title="删除">✕</button>
      </div>
    </div>
    <div v-if="canSave" class="tpl-save">
      <input v-model="saveName" class="tpl-input" placeholder="保存当前样式为模板..." @keydown.enter="handleSave" />
      <button class="tpl-save-btn" :disabled="!saveName.trim()" @click="handleSave">保存</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { PRESET_TEMPLATES } from '../utils/constants.js'
import { deleteTemplate } from '../engine/template-store.js'
defineProps({ templates: { type: Array, default: () => [] }, activeId: { type: String, default: null }, canSave: { type: Boolean, default: false } })
const emit = defineEmits(['select', 'save', 'delete', 'update'])
const saveName = ref('')
function isPreset(id) { return PRESET_TEMPLATES.some(t => t.id === id) }
function handleDelete(id) { deleteTemplate(id); emit('delete', id); emit('update') }
function handleSave() { if (!saveName.value.trim()) return; emit('save', saveName.value.trim()); saveName.value = '' }
</script>

<style scoped>
.tpl {
  border: 1px solid rgba(148, 163, 184, 0.42); border-radius: 16px; background: rgba(255, 255, 255, 0.88); padding: 14px;
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
.tpl-head {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
}
.tpl-title { font-size: 13px; font-weight: 600; color: #202123; }
.tpl-count {
  font-size: 11px; color: rgba(17, 17, 17, 0.58); background: rgba(255, 255, 255, 0.88); padding: 2px 8px; border-radius: 6px;
}
.tpl-empty { font-size: 13px; color: rgba(17, 17, 17, 0.58); text-align: center; padding: 20px; }
.tpl-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.tpl-row {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-radius: 12px; border: 1px solid rgba(15, 23, 42, 0.07);
  cursor: pointer; transition: all 0.15s;
  background: rgba(250, 250, 250, 0.86);
}
.tpl-row:hover { border-color: rgba(15, 23, 42, 0.15); background: rgba(255, 255, 255, 0.96); }
.tpl-row.active { border-color: #0f9f7a; background: rgba(15, 159, 122, 0.1); }
.tpl-info { flex: 1; min-width: 0; }
.tpl-name { display: block; font-size: 12px; font-weight: 500; color: #202123; }
.tpl-desc { display: block; font-size: 10px; color: rgba(17, 17, 17, 0.58); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-del { background: none; border: none; color: #b0b0b0; font-size: 13px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.tpl-del:hover { color: #ef4444; background: rgba(239, 68, 68, 0.08); }
.tpl-save { display: flex; gap: 6px; border-top: 1px solid rgba(17, 24, 39, 0.08); padding-top: 12px; }
.tpl-input {
  flex: 1; background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px; padding: 8px 12px; font-size: 12px; color: #202123; outline: none; font-family: inherit;
}
.tpl-input:focus { border-color: #0f9f7a; }
.tpl-save-btn {
  background: #0f9f7a; color: #fff; border: none; border-radius: 12px;
  padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all 0.15s;
}
.tpl-save-btn:hover:not(:disabled) { background: #0e8a6a; }
.tpl-save-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
