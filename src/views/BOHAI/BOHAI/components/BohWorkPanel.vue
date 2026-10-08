<template>
  <aside class="boh-work" :class="{ 'is-open': open }" aria-label="工作台">
    <div class="boh-wp-head">
      工作台
      <button type="button" class="boh-icon-btn" aria-label="收起工作台" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </div>

    <section class="boh-wp-sec">
      <h3>产物</h3>
      <template v-if="artifacts.length">
        <div v-for="artifact in artifacts" :key="artifact.id" class="boh-artifact">
          <span class="boh-af-icon">
            <FileText :size="17" aria-hidden="true" />
          </span>
          <span class="boh-af-info">
            <b>{{ artifact.name }}</b>
            <span>{{ artifact.meta }}</span>
          </span>
          <button type="button" class="boh-af-dl" @click="emit('download', artifact)">
            <Download :size="13" aria-hidden="true" />下载
          </button>
        </div>
      </template>
      <p v-else class="boh-wp-empty">
        还没有产物。切到 <b>Work</b> 形态后，让 BOH AI 生成 Word / PPT / 表格。
      </p>
    </section>

    <section class="boh-wp-sec">
      <h3>检索来源</h3>
      <template v-if="sources.length">
        <div v-for="source in sources" :key="source.key" class="boh-src-row">
          <span class="boh-chip"
            ><i>{{ source.prefix }}</i></span
          >
          <b>{{ source.label }}</b>
          <span>{{ source.total }} 条</span>
        </div>
      </template>
      <p v-else class="boh-wp-empty">本轮还没有检索到站内资料。</p>
    </section>

    <section class="boh-wp-sec">
      <h3>集群进度</h3>
      <template v-if="steps.length">
        <div v-for="step in steps" :key="step.id" class="boh-step-row">
          <span class="boh-step-dot" :class="`is-${step.state}`">
            <Check v-if="step.state === 'done'" :size="14" aria-hidden="true" />
          </span>
          {{ step.label }}
        </div>
      </template>
      <p v-else class="boh-wp-empty">当前模式不启用 Agent 集群。</p>
    </section>
  </aside>
</template>

<script setup>
import { Check, Download, FileText, X } from 'lucide-vue-next';

/**
 * BohWorkPanel.vue — Work 面板（plans/025 v2 · Step 6-5）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `§5 Work 面板`（`.boh-work` / `.wp-head` /
 * `.wp-sec` / `.artifact` / `.src-row` / `.step-row` / `.step-dot`）。
 *
 * ⚠️ 只有 **≥1024×600 桌面档** 才挂载（`≤1023` 入口与面板一起隐藏，DESIGN §4）。
 * 断点与基座同文件（`components/styles/boh-work.css`）—— 见 `styles/layout.css` 头。
 *
 * ⚠️ **产物（artifacts）目前恒为空数组**：BOH AI 还没有 generator（docx/pptx/xlsx），
 * 那是 companion 文档 §4 的 P0-3/P1-4，属**另一条独立工作流**。本面板先把「产物区」的
 * 位置与形状落下来，接入 generator 时只填 `artifacts` 即可，不改结构。
 */
defineProps({
  open: { type: Boolean, default: false },
  /** `[{ id, name, meta, mime, blobUrl }]` */
  artifacts: { type: Array, default: () => [] },
  /** `[{ key, prefix, label, total }]` */
  sources: { type: Array, default: () => [] },
  /** `[{ id, label, state }]`，state ∈ done | run | pending | failed */
  steps: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'download']);
</script>

<style scoped src="./styles/boh-work.css"></style>
