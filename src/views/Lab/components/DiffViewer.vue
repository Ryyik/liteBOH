<template>
  <div class="diff-viewer">
    <div class="diff-toolbar">
      <span class="diff-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        变更对比
      </span>
      <span class="diff-stat">
        +{{ stats.additions }} / -{{ stats.deletions }}
      </span>
    </div>
    <div class="diff-body">
      <div v-for="(change, ci) in changes" :key="ci" class="diff-change">
        <div class="diff-change-header">
          <span class="diff-change-type" :class="`type-${change.type}`">
            {{ typeLabel(change.type) }}
          </span>
          <span class="diff-change-desc">{{ change.description }}</span>
        </div>
        <div class="diff-lines">
          <div
            v-for="(line, li) in change.lines"
            :key="li"
            class="diff-line"
            :class="{
              'line-added': line.type === 'add',
              'line-removed': line.type === 'remove',
              'line-context': line.type === 'context',
            }"
          >
            <span class="diff-line-marker">{{ line.marker }}</span>
            <span class="diff-line-content">{{ line.content }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="changes.length === 0" class="diff-empty">
      暂无变更
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  before: { type: String, default: '' },
  after: { type: String, default: '' },
  type: { type: String, default: 'style' },
})

const stats = computed(() => {
  let additions = 0
  let deletions = 0
  for (const change of diff.value) {
    for (const line of change.lines) {
      if (line.type === 'add') additions++
      if (line.type === 'remove') deletions++
    }
  }
  return { additions, deletions }
})

function computeLineDiff(beforeLines, afterLines) {
  const result = []
  const maxLen = Math.max(beforeLines.length, afterLines.length)
  for (let i = 0; i < maxLen; i++) {
    const beforeLine = beforeLines[i]
    const afterLine = afterLines[i]
    if (beforeLine === undefined && afterLine !== undefined) {
      result.push({ type: 'add', marker: '+', content: afterLine })
    } else if (beforeLine !== undefined && afterLine === undefined) {
      result.push({ type: 'remove', marker: '-', content: beforeLine })
    } else if (beforeLine !== afterLine) {
      result.push({ type: 'remove', marker: '-', content: beforeLine })
      result.push({ type: 'add', marker: '+', content: afterLine })
    } else {
      result.push({ type: 'context', marker: ' ', content: beforeLine })
    }
  }
  return result
}

const changes = computed(() => {
  if (!props.before && !props.after) return []
  if (!props.before) return [{ type: 'add', description: '新增内容', lines: [{ type: 'add', marker: '+', content: props.after }] }]
  if (!props.after) return [{ type: 'remove', description: '删除内容', lines: [{ type: 'remove', marker: '-', content: props.before }] }]

  const beforeLines = props.before.split('\n')
  const afterLines = props.after.split('\n')
  const lines = computeLineDiff(beforeLines, afterLines)

  const groups = []
  let currentGroup = null
  for (const line of lines) {
    if (line.type === 'context') {
      if (currentGroup) {
        groups.push(currentGroup)
        currentGroup = null
      }
      // 显示上下文行（最多前后2行）
      const ctxGroup = { type: 'context', description: '', lines: [line] }
      groups.push(ctxGroup)
    } else {
      if (!currentGroup) {
        currentGroup = {
          type: line.type === 'add' ? 'add' : 'remove',
          description: '',
          lines: [],
        }
      }
      currentGroup.lines.push(line)
    }
  }
  if (currentGroup) groups.push(currentGroup)

  // 为每个组生成描述
  return groups.map(g => {
    if (g.type === 'add') g.description = `新增 ${g.lines.length} 行`
    else if (g.type === 'remove') g.description = `删除 ${g.lines.length} 行`
    else g.description = ''
    // 合并相邻的 context 组以节省空间
    return g
  }).filter(g => g.lines.length > 0)
})

function typeLabel(type) {
  if (type === 'add') return '新增'
  if (type === 'remove') return '删除'
  return '上下文'
}
</script>

<style scoped>
.diff-viewer {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--popover);
}
.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}
.diff-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 13px;
}
.diff-stat {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
}
.diff-body {
  max-height: 400px;
  overflow-y: auto;
}
.diff-change {
  border-bottom: 1px solid var(--border);
}
.diff-change:last-child {
  border-bottom: none;
}
.diff-change-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.diff-change-type {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-sans);
}
.type-add { background: #e6ffe6; color: #1a7d1a; }
.type-remove { background: #ffe6e6; color: #c41a1a; }
.diff-change-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  font-family: var(--font-sans);
}
.diff-lines {
  padding: 4px 0;
}
.diff-line {
  display: flex;
  align-items: center;
  padding: 1px 12px;
  line-height: 1.6;
  font-size: 12px;
}
.diff-line-marker {
  width: 20px;
  flex-shrink: 0;
  color: var(--muted-foreground);
  font-weight: 600;
  text-align: center;
}
.diff-line-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--foreground);
}
.line-added { background: #f0fff0; }
.line-removed { background: #fff0f0; }
.line-context { background: transparent; }
.line-context .diff-line-content { color: var(--muted-foreground); }
.diff-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 13px;
}
</style>
