<template>
  <Teleport to="body">
    <Transition name="command-palette">
      <div v-if="visible" class="command-palette-overlay" @click.self="close">
        <div class="command-palette" ref="paletteRef" @keydown="handleKeydown">
          <div class="command-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              class="command-input"
              placeholder="搜索命令..."
              @input="filterCommands"
            />
            <button class="command-clear" v-if="query" @click="query = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="command-groups">
            <div v-for="(group, gi) in filteredGroups" :key="gi" class="command-group">
              <div class="command-group-title">{{ group.label }}</div>
              <div
                v-for="(cmd, ci) in group.items"
                :key="ci"
                class="command-item"
                :class="{ active: selectedIndex === getGlobalIndex(gi, ci) }"
                @click="executeCommand(cmd)"
                @mouseenter="selectedIndex = getGlobalIndex(gi, ci)"
              >
                <div class="command-item-icon">
                  <AppIcon :name="cmd.icon || 'command'" size="small" />
                </div>
                <div class="command-item-info">
                  <div class="command-item-label">{{ cmd.label }}</div>
                  <div v-if="cmd.description" class="command-item-desc">{{ cmd.description }}</div>
                </div>
                <div v-if="cmd.shortcut" class="command-item-shortcut">
                  <kbd>{{ cmd.shortcut }}</kbd>
                </div>
              </div>
            </div>
          </div>
          <div v-if="filteredGroups.every(g => g.items.length === 0)" class="command-empty">
            没有匹配的命令
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  commands: { type: Array, default: () => [] },
})

const emit = defineEmits(['execute', 'close'])

const visible = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref(null)
const paletteRef = ref(null)

const groups = computed(() => {
  return props.commands
})

const filteredGroups = computed(() => {
  if (!query.value) return groups.value
  const q = query.value.toLowerCase()
  return groups.value.map(group => ({
    ...group,
    items: group.items.filter(cmd =>
      cmd.label.toLowerCase().includes(q) ||
      (cmd.description || '').toLowerCase().includes(q) ||
      (cmd.keywords || []).some(k => k.toLowerCase().includes(q))
    ),
  }))
})

const flatItems = computed(() => {
  return filteredGroups.value.flatMap(g => g.items)
})

function getGlobalIndex(groupIdx, itemIdx) {
  let idx = 0
  for (let g = 0; g < groupIdx; g++) {
    idx += filteredGroups.value[g].items.length
  }
  return idx + itemIdx
}

function filterCommands() {
  selectedIndex.value = 0
}

function executeCommand(cmd) {
  if (cmd.disabled) return
  emit('execute', cmd)
  close()
}

function handleKeydown(e) {
  const total = flatItems.value.length
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % total
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + total) % total
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flatItems.value[selectedIndex.value]
    if (item) executeCommand(item)
  } else if (e.key === 'Escape') {
    close()
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    close()
  }
}

function scrollToSelected() {
  nextTick(() => {
    const items = paletteRef.value?.querySelectorAll('.command-item')
    if (items?.[selectedIndex.value]) {
      items[selectedIndex.value].scrollIntoView({ block: 'nearest' })
    }
  })
}

function open() {
  visible.value = true
  query.value = ''
  selectedIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  visible.value = false
  emit('close')
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (visible.value) close()
    else open()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ open, close })
</script>

<style scoped>
.command-palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.3);
  z-index: 10000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
}
.command-palette {
  width: 480px;
  max-width: 90vw;
  max-height: 60vh;
  background: var(--popover);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.command-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--muted-foreground);
}
.command-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  font-family: var(--font-sans);
  color: var(--foreground);
  outline: none;
}
.command-input::placeholder { color: var(--muted-foreground); }
.command-clear {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
}
.command-clear:hover { background: var(--accent); color: var(--foreground); }
.command-groups {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.command-group-title {
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted-foreground);
  font-family: var(--font-sans);
}
.command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.command-item:hover, .command-item.active {
  background: var(--accent);
}
.command-item-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
}
.command-item-info {
  flex: 1;
  min-width: 0;
}
.command-item-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  font-family: var(--font-sans);
}
.command-item-desc {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 1px;
}
.command-item-shortcut {
  flex-shrink: 0;
}
.command-item-shortcut kbd {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent);
  border: 1px solid var(--border);
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--muted-foreground);
}
.command-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted-foreground);
  font-size: 13px;
  font-family: var(--font-sans);
}
.command-palette-enter-from { opacity: 0; }
.command-palette-leave-to { opacity: 0; }
.command-palette-enter-from .command-palette { transform: scale(0.95) translateY(-10px); }
.command-palette-leave-to .command-palette { transform: scale(0.95) translateY(-10px); }
.command-palette-enter-active, .command-palette-leave-active { transition: opacity 0.2s ease; }
.command-palette-enter-active .command-palette,
.command-palette-leave-active .command-palette { transition: transform 0.2s ease; }
</style>
