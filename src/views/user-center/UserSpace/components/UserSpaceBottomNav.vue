<template>
  <div
    v-if="visible"
    class="bottom-nav-glass"
    :class="{
      'is-hidden': hidden,
      'is-ai-collapsed': aiCollapsed && !islandVisible && !islandCollapsing,
      'island-open': islandVisible,
      'island-collapsing': islandCollapsing,
      'island-long': islandVisible && island?.isLong
    }"
  >
    <button
      v-if="aiCollapsed && !islandVisible && !islandCollapsing"
      class="ai-float-ball"
      type="button"
      aria-label="展开导航栏"
      @click="$emit('toggle-ai')"
    >
      <Bot :size="26" :stroke-width="1.8" />
    </button>
    <template v-else>
      <BottomNavIsland
        :item="island"
        :show-cat-sticker="showCatSticker"
        @action="$emit('island-action')"
        @before-leave="$emit('island-before-leave')"
        @after-leave="$emit('island-after-leave')"
      />

      <div class="nav-items" :style="navIndicatorStyle">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: currentTab === item.id }"
          type="button"
          @pointerenter="$emit('preload-tab', item.id)"
          @focus="$emit('preload-tab', item.id)"
          @click="$emit('nav-click', item.id)"
        >
          <component :is="item.icon" class="nav-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { Bot } from 'lucide-vue-next';
import BottomNavIsland from './BottomNavIsland.vue';

defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  hidden: {
    type: Boolean,
    default: false
  },
  aiCollapsed: {
    type: Boolean,
    default: false
  },
  islandVisible: {
    type: Boolean,
    default: false
  },
  islandCollapsing: {
    type: Boolean,
    default: false
  },
  island: {
    type: Object,
    default: null
  },
  showCatSticker: {
    type: Boolean,
    default: false
  },
  navItems: {
    type: Array,
    required: true
  },
  currentTab: {
    type: String,
    required: true
  },
  navIndicatorStyle: {
    type: Object,
    default: () => ({})
  }
});

defineEmits([
  'toggle-ai',
  'island-action',
  'island-before-leave',
  'island-after-leave',
  'preload-tab',
  'nav-click'
]);
</script>

<style src="./bottom-nav.css"></style>
