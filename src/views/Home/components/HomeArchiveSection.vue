<template>
  <section class="home-archive" aria-label="历史回顾">
    <router-link to="/history" class="home-archive-toggle">
      <span class="home-archive-toggle-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8h16" />
          <path d="M5 8l1 11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-11" />
          <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M10 12h4" />
        </svg>
      </span>
      <span class="home-archive-toggle-copy">
        <span class="home-archive-toggle-title">历史回顾</span>
        <span class="home-archive-toggle-subtitle">旧英雄区都收藏在这里</span>
      </span>
      <span v-if="archivedCount" class="home-archive-count" aria-hidden="true">{{ archivedCount }}</span>
      <span class="home-archive-chevron" aria-hidden="true">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </router-link>
  </section>
</template>

<script setup>
defineProps({
  archivedCount: { type: Number, default: 0 },
});
</script>

<style scoped>
.home-archive {
  border-bottom: 1px solid color-mix(in srgb, var(--background-900, #1d1d1f) 10%, transparent);
}

.home-archive-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 2px;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: var(--text-500, #6e6e73);
  text-align: left;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.home-archive-toggle:hover .home-archive-toggle-title {
  color: var(--foreground, #1d1d1f);
  text-decoration: underline;
}

.home-archive-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--background-900, #1d1d1f) 5%, transparent);
}

.home-archive-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.home-archive-toggle-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground, #1d1d1f);
  transition: color 0.2s var(--ease-out, ease);
}

.home-archive-toggle-subtitle {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-500, #6e6e73);
}

.home-archive-count {
  margin-left: auto;
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--background-50, #f5f5f7);
  background: var(--background-900, #1d1d1f);
}

.home-archive-chevron {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--text-500, #6e6e73);
  transition: transform 0.3s var(--ease-out, ease);
}

.home-archive-toggle:hover .home-archive-chevron {
  transform: translateX(2px);
  color: var(--foreground, #1d1d1f);
}

/* ============ 深色模式 ============ */
:global([data-theme="dark"]) .home-archive {
  border-bottom-color: color-mix(in srgb, var(--background-50, #f5f5f7) 10%, transparent);
}

:global([data-theme="dark"]) .home-archive-toggle-title {
  color: var(--background-50, #f5f5f7);
}

:global([data-theme="dark"]) .home-archive-toggle:hover .home-archive-toggle-title,
:global([data-theme="dark"]) .home-archive-toggle:hover .home-archive-chevron {
  color: var(--background-50, #f5f5f7);
}

:global([data-theme="dark"]) .home-archive-toggle-icon {
  background: color-mix(in srgb, var(--background-50, #f5f5f7) 8%, transparent);
}

:global([data-theme="dark"]) .home-archive-count {
  color: var(--background-900, #1d1d1f);
  background: var(--background-50, #f5f5f7);
}

/* ============ 响应式 ============ */
@media (max-width: 600px) {
  .home-archive-toggle {
    padding: 12px 0;
  }
  .home-archive-toggle-subtitle {
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-archive-chevron {
    transition: none;
  }
}
</style>