<template>
  <section class="hk-card hk-trend">
    <div class="hk-trend-head">
      <span class="hk-trend-title">近 7 天睡眠</span>
      <span class="hk-trend-sub">均值 {{ avg === null ? '—' : avg + ' h' }}</span>
    </div>
    <div class="hk-bars">
      <div
        v-for="d in days"
        :key="d.date"
        class="hk-bar"
        :class="{ 'is-empty': d.sleepHours === null }"
        :style="{ height: barHeight(d.sleepHours) }"
      ></div>
    </div>
    <div class="hk-bar-labels">
      <span v-for="d in days" :key="d.date">{{ weekday(d.date) }}</span>
    </div>
  </section>
</template>

<script setup>
defineProps({
  days: { type: Array, default: () => [] },
  avg: { type: Number, default: null }
})

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const weekday = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? '' : WEEK[d.getDay()]
}
const barHeight = (h) => {
  if (h === null || h === undefined) return '6%'
  return Math.max(8, Math.min(100, (Number(h) / 10) * 100)).toFixed(0) + '%'
}
</script>
