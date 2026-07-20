<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Copy, Download, ExternalLink, RotateCcw, Search } from 'lucide-vue-next'

import { copyEditorGroups } from './copy-editor-catalog.js'
import {
  clearJourneyCopyDraft,
  loadJourneyCopyDraft,
  saveJourneyCopyDraft
} from './copy-editor-store.js'

const router = useRouter()
const draft = ref(loadJourneyCopyDraft())
const activeGroup = ref('all')
const query = ref('')
const onlyChanged = ref(false)
const notice = ref('')
let noticeTimer = 0

const fieldLabels = {
  date: '日期',
  kicker: '章节标记',
  code: '英文标记',
  name: '层级名称',
  title: '标题',
  copy: '正文'
}

const allEntries = computed(() => copyEditorGroups.flatMap((group) => group.entries))
const changedCount = computed(() => Object.keys(draft.value).length)
const visibleEntries = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return allEntries.value.filter((entry) => {
    if (activeGroup.value !== 'all' && entry.group !== copyEditorGroups.find((group) => group.id === activeGroup.value)?.title) return false
    if (onlyChanged.value && !draft.value[entry.id]) return false
    if (!keyword) return true
    return [entry.group, entry.label, ...Object.values(entry.defaults)]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})

function valueFor(entry, field) {
  return draft.value[entry.id]?.[field] ?? entry.defaults[field]
}

function updateField(entry, field, value) {
  const nextDraft = { ...draft.value }
  const nextEntry = { ...(nextDraft[entry.id] || {}) }
  if (value === entry.defaults[field]) delete nextEntry[field]
  else nextEntry[field] = value

  if (Object.keys(nextEntry).length) nextDraft[entry.id] = nextEntry
  else delete nextDraft[entry.id]
  draft.value = nextDraft
  saveJourneyCopyDraft(nextDraft)
}

function resetEntry(entry) {
  const nextDraft = { ...draft.value }
  delete nextDraft[entry.id]
  draft.value = nextDraft
  saveJourneyCopyDraft(nextDraft)
  showNotice('已恢复此项')
}

function resetAll() {
  if (!window.confirm('清除全部文案草稿并恢复默认内容？')) return
  clearJourneyCopyDraft()
  draft.value = {}
  showNotice('全部草稿已清除')
}

function serializedDraft() {
  return JSON.stringify({
    updatedAt: new Date().toISOString(),
    changes: draft.value
  }, null, 2)
}

async function copyChanges() {
  await navigator.clipboard.writeText(serializedDraft())
  showNotice('改动 JSON 已复制')
}

function downloadChanges() {
  const blob = new Blob([serializedDraft()], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'boh-8-years-copy-changes.json'
  link.click()
  URL.revokeObjectURL(url)
  showNotice('改动 JSON 已下载')
}

function showNotice(message) {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => { notice.value = '' }, 1800)
}

onMounted(() => {
  if (!import.meta.env.DEV) router.replace('/boh-8-years-journey')
})
</script>

<template>
  <main class="copy-editor-page">
    <header class="copy-editor-header">
      <div>
        <p>BOH 8 YEARS · LOCAL COPY DESK</p>
        <h1>图文校对台</h1>
      </div>
      <div class="header-actions">
        <button type="button" class="icon-command" title="复制改动 JSON" :disabled="!changedCount" @click="copyChanges">
          <Copy :size="17" />
        </button>
        <button type="button" class="icon-command" title="下载改动 JSON" :disabled="!changedCount" @click="downloadChanges">
          <Download :size="17" />
        </button>
        <button type="button" class="preview-command" @click="router.push('/boh-8-years-journey')">
          <ExternalLink :size="16" />
          <span>预览旅程</span>
        </button>
      </div>
    </header>

    <section class="copy-toolbar" aria-label="文案筛选工具">
      <nav class="group-tabs" aria-label="内容分组">
        <button type="button" :class="{ active: activeGroup === 'all' }" @click="activeGroup = 'all'">全部</button>
        <button
          v-for="group in copyEditorGroups"
          :key="group.id"
          type="button"
          :class="{ active: activeGroup === group.id }"
          @click="activeGroup = group.id"
        >{{ group.title }}</button>
      </nav>

      <label class="copy-search">
        <Search :size="16" />
        <input v-model="query" type="search" aria-label="搜索文案" placeholder="搜索年份、标题或正文">
      </label>

      <label class="changed-toggle">
        <input v-model="onlyChanged" type="checkbox">
        <span>只看已修改</span>
      </label>

      <div class="change-status" :class="{ active: changedCount }">
        <Check :size="15" />
        <span>{{ changedCount }} 项改动</span>
      </div>

      <button type="button" class="reset-all" :disabled="!changedCount" @click="resetAll">
        <RotateCcw :size="15" />
        <span>全部恢复</span>
      </button>
    </section>

    <section class="copy-list" aria-live="polite">
      <article
        v-for="entry in visibleEntries"
        :key="entry.id"
        class="copy-entry"
        :class="{ changed: draft[entry.id] }"
      >
        <figure>
          <img :src="entry.image" :alt="entry.label">
          <figcaption>
            <span>{{ entry.group }}</span>
            <strong>{{ valueFor(entry, 'title') || valueFor(entry, 'name') || entry.label }}</strong>
          </figcaption>
        </figure>

        <div class="entry-fields">
          <div class="entry-meta">
            <code>{{ entry.id }}</code>
            <button
              v-if="draft[entry.id]"
              type="button"
              title="恢复此项"
              @click="resetEntry(entry)"
            ><RotateCcw :size="15" /></button>
          </div>

          <label v-for="(_, field) in entry.defaults" :key="field" :class="{ wide: field === 'copy' }">
            <span>{{ fieldLabels[field] || field }}</span>
            <textarea
              v-if="field === 'copy'"
              :value="valueFor(entry, field)"
              rows="4"
              @input="updateField(entry, field, $event.target.value)"
            />
            <input
              v-else
              :value="valueFor(entry, field)"
              type="text"
              @input="updateField(entry, field, $event.target.value)"
            >
          </label>
        </div>
      </article>

      <div v-if="!visibleEntries.length" class="empty-copy-list">没有符合当前条件的图文。</div>
    </section>

    <div v-if="notice" class="copy-notice" role="status">{{ notice }}</div>
  </main>
</template>

<style scoped src="./copy-editor.scoped.css" />
