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
  border: none;
  border-radius: 18px;
  background: #ffffff;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.tpl-head {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
}
.tpl-title { font-size: 14px; font-weight: 600; color: #3d3929; }
.tpl-count {
  font-size: 12px; color: #6e6d68; background: rgba(0, 0, 0, 0.04); padding: 3px 10px; border-radius: 8px; font-weight: 500;
}
.tpl-empty { font-size: 14px; color: #6e6d68; text-align: center; padding: 24px; }
.tpl-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.tpl-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-radius: 12px; border: none;
  cursor: pointer; transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
  background: #f5f4ef;
}
.tpl-row:hover { background: #e3e0d4; }
.tpl-row.active { background: #fbf2ed; }
.tpl-info { flex: 1; min-width: 0; }
.tpl-name { display: block; font-size: 13px; font-weight: 600; color: #3d3929; }
.tpl-desc { display: block; font-size: 11px; color: #6e6d68; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-del { background: #f5f4ef; border: none; color: #6e6d68; font-size: 13px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: all 0.2s; }
.tpl-del:hover { color: #d64545; background: #fcecea; }
.tpl-save { display: flex; gap: 8px; border-top: 1px solid #e3e0d4; padding-top: 14px; }
.tpl-input {
  flex: 1; background: #ffffff; border: 1px solid #e3e0d4;
  border-radius: 12px; padding: 10px 14px; font-size: 13px; color: #3d3929; outline: none; font-family: inherit;
  transition: all 0.2s;
}
.tpl-input:focus { border-color: #C96442; box-shadow: 0 0 0 3px rgba(201, 100, 66, 0.12); }
.tpl-save-btn {
  background: #C96442; color: #fff; border: none; border-radius: 12px;
  padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}
.tpl-save-btn:hover:not(:disabled) { background: #d6866a; transform: scale(1.02); }
.tpl-save-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
