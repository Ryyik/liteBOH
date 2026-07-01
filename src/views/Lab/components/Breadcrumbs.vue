<template>
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol class="crumb-list">
      <li v-for="(crumb, i) in items" :key="i" class="crumb-item">
        <button
          v-if="i < items.length - 1"
          class="crumb-link"
          @click="$emit('navigate', crumb)"
        >
          <AppIcon v-if="crumb.icon" :name="crumb.icon" size="small" weight="medium" />
          <span>{{ crumb.label }}</span>
        </button>
        <span v-else class="crumb-current" :aria-current="'page'">
          <AppIcon v-if="crumb.icon" :name="crumb.icon" size="small" weight="medium" />
          <span>{{ crumb.label }}</span>
        </span>
      </li>
    </ol>
  </nav>
</template>

<script setup>
import AppIcon from './AppIcon.vue'
defineProps({ items: { type: Array, default: () => [] } })
defineEmits(['navigate'])
</script>

<style scoped>
.breadcrumbs { padding: 0; margin: 0; }
.crumb-list {
  display: flex;
  align-items: center;
  gap: 0;
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
}
.crumb-item { display: flex; align-items: center; }
.crumb-item + .crumb-item::before {
  content: '';
  display: inline-block;
  width: 14px; height: 14px;
  margin: 0 4px;
  background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M9 6l6 6-6 6' stroke='%2386868b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}
.crumb-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: #C96442;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: all 0.2s;
  font-family: inherit;
}
.crumb-link:hover { background: rgba(201, 100, 66, 0.08); }
.crumb-current {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #6e6d68;
  font-size: 13px;
  font-weight: 500;
  padding: 2px 6px;
}
</style>
