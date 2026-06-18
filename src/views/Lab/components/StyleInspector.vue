<template>
  <div class="inspector">
    <div class="inspector-head">
      <span class="inspector-title">样式清单</span>
      <span class="inspector-count">{{ styles.length }}</span>
    </div>
    <div v-if="!styles || styles.length === 0" class="inspector-empty">暂无样式</div>
    <div v-else class="inspector-list">
      <div v-for="st in styles" :key="st.styleId" class="style-row" :class="{ heading: st.styleId?.toLowerCase().startsWith('heading') }">
        <div class="style-top">
          <span class="style-name">{{ st.name || st.styleId }}</span>
          <span class="style-type">{{ st.type }}</span>
        </div>
        <div class="style-tags">
          <span v-if="st.font?.ascii" class="tag" :title="`字体: ${st.font.ascii}`">{{ st.font.ascii }}</span>
          <span v-if="st.size" class="tag">{{ (st.size / 2).toFixed(1) }}pt</span>
          <span v-if="st.bold" class="tag tag-accent">B</span>
          <span v-if="st.italic" class="tag tag-accent">I</span>
          <span v-if="st.color" class="tag">
            <span class="color-dot" :style="{ background: '#' + st.color }"></span>
          </span>
          <span v-if="st.spacing?.line" class="tag">{{ (st.spacing.line / 240).toFixed(1) }}x</span>
          <span v-if="st.align" class="tag">{{ st.align }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({ styles: { type: Array, default: () => [] } })
</script>

<style scoped>
.inspector {
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 14px;
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
.inspector-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.inspector-title { font-size: 13px; font-weight: 600; color: #202123; }
.inspector-count {
  font-size: 11px; color: rgba(17, 17, 17, 0.58);
  background: rgba(255, 255, 255, 0.88); padding: 2px 8px; border-radius: 6px;
}
.inspector-empty { font-size: 13px; color: rgba(17, 17, 17, 0.58); text-align: center; padding: 20px; }
.inspector-list { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; }
.style-row {
  border: 1px solid rgba(15, 23, 42, 0.07); border-radius: 12px; padding: 10px 12px;
  background: rgba(250, 250, 250, 0.86);
}
.style-row.heading {
  border-color: rgba(251, 191, 36, 0.2); background: rgba(251, 191, 36, 0.06);
}
.style-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
.style-name { font-size: 12px; font-weight: 600; color: #202123; }
.style-type { font-size: 10px; color: rgba(17, 17, 17, 0.58); background: rgba(255, 255, 255, 0.88); padding: 1px 6px; border-radius: 4px; }
.style-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  font-size: 10px; color: rgba(17, 17, 17, 0.58); background: rgba(255, 255, 255, 0.88);
  padding: 2px 6px; border-radius: 4px;
}
.tag-accent { color: #0f9f7a; background: rgba(15, 159, 122, 0.12); font-weight: 600; }
.color-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle; }
</style>
