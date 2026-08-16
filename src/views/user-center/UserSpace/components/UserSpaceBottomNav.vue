<template>
  <div
    v-if="visible"
    class="bottom-nav-glass"
    :class="{
      'is-hidden': hidden,
      'ai-overlay-open': aiOverlayOpen
    }"
  >
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
        <div v-if="item.id === 'messages' && hasUnreadMessages" class="unread-badge">
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
const emit = defineEmits(['preload-tab', 'nav-click']);

defineProps({
  visible: {
    type: Boolean,
    default: true
  },
  hidden: {
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
  },
  hasUnreadMessages: {
    type: Boolean,
    default: false
  },
  unreadCount: {
    type: Number,
    default: 0
  }
});

const handleNavClick = (itemId) => {
  emit('nav-click', itemId);
};
</script>

<style src="./bottom-nav.css"></style>
