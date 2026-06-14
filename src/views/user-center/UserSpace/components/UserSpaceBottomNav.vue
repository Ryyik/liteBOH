<template>
  <div
    v-if="visible"
    class="bottom-nav-glass"
    :class="{
      'is-hidden': hidden,
      'ai-overlay-open': aiOverlayOpen,
      'island-open': islandVisible,
      'island-collapsing': islandCollapsing,
      'island-long': islandVisible && island?.isLong
    }"
  >
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
        :class="{ active: currentTab === item.id || (item.id === 'ai' && aiOverlayOpen) }"
        type="button"
        @pointerenter="$emit('preload-tab', item.id)"
        @focus="$emit('preload-tab', item.id)"
        @click.stop="handleNavClick(item.id)"
      >
        <component :is="item.icon" class="nav-icon" :size="18" :stroke-width="1.9" aria-hidden="true" />
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import BottomNavIsland from './BottomNavIsland.vue';

const emit = defineEmits([
  'island-action',
  'island-before-leave',
  'island-after-leave',
  'preload-tab',
  'nav-click'
]);

defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  hidden: {
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
  aiOverlayOpen: {
    type: Boolean,
    default: false
  },
  navIndicatorStyle: {
    type: Object,
    default: () => ({})
  }
});

const handleNavClick = (itemId) => {
  emit('nav-click', itemId);
};
</script>

<style src="./bottom-nav.css"></style>
