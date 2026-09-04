<template>
  <HkSheet title="健康档案" done-text="保存" :done-disabled="!title.trim()" @close="$emit('close')" @save="submit">
    <div class="hk-field">
      <input class="hk-input" type="text" maxlength="48" placeholder="标题，如 2026 年度体检" v-model="title" />
    </div>
    <div class="hk-field">
      <input class="hk-input" type="text" placeholder="指标，如 血压:118/76, 空腹血糖:5.2" v-model="raw" />
      <div class="hk-hint">用逗号分隔，格式「指标名:数值」</div>
    </div>

    <div v-if="!records.length" class="hk-empty">还没有记录</div>
    <div v-else style="margin-top:6px">
      <div v-for="r in records" :key="r.id" class="hk-vault-item">
        <div style="min-width:0;flex:1">
          <strong>{{ r.title }}</strong>
          <div><small>{{ r.createdAt.slice(0, 10) }}</small></div>
          <div class="hk-vault-badges">
            <span v-for="(v, k) in r.indicators" :key="k" class="hk-vault-badge">{{ k }} {{ v }}</span>
          </div>
        </div>
        <button type="button" class="hk-step-btn" @click="$emit('remove', r.id)" aria-label="删除">×</button>
      </div>
    </div>
  </HkSheet>
</template>

<script setup>
import { ref } from 'vue'
import HkSheet from './HkSheet.vue'

const props = defineProps({
  records: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'add', 'remove'])

const title = ref('')
const raw = ref('')

const submit = () => {
  const indicators = {}
  raw.value.split(',').forEach((pair) => {
    const [k, v] = pair.split(':').map((s) => s?.trim())
    if (k && v) indicators[k] = v
  })
  emit('add', { title: title.value.trim(), indicators })
  title.value = ''
  raw.value = ''
}
</script>
