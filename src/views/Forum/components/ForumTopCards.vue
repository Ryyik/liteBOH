<template>
  <div v-if="cards.length" class="forum-top-cards">
    <section
      v-for="card in cards"
      :key="card.key"
      class="forum-top-card"
      :class="[`is-${card.type}`, { 'is-christmas': card.icon === 'gift' }]"
    >
      <template v-if="card.type === 'promo'">
        <header class="forum-promo-head">
          <span class="forum-promo-avatar" aria-hidden="true">
            <Gift :size="16" :stroke-width="2" />
          </span>
          <span class="forum-promo-author">方块之家</span>
          <span class="forum-promo-label">{{ card.eyebrow }}</span>
          <button
            v-if="card.dismissible"
            type="button"
            class="forum-top-card-close"
            :aria-label="`关闭${card.title}`"
            title="关闭"
            @click="emit('dismiss', card)"
          >
            <X :size="14" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </header>

        <div class="forum-promo-main">
          <div class="forum-promo-body">
            <h3 class="forum-promo-title">{{ card.title }}</h3>
            <p v-if="card.subtitle" class="forum-promo-subtitle">{{ card.subtitle }}</p>
          </div>
          <span v-if="card.icon === 'gift'" class="forum-promo-art" aria-hidden="true">
            <svg viewBox="0 0 18 20" shape-rendering="crispEdges">
              <rect class="tree-star" x="7" y="0" width="4" height="1" />
              <rect class="tree-star" x="8" y="1" width="2" height="2" />
              <rect class="tree-body" x="7" y="3" width="4" height="2" />
              <rect class="tree-body" x="6" y="5" width="6" height="2" />
              <rect class="tree-body" x="5" y="7" width="8" height="2" />
              <rect class="tree-body" x="4" y="9" width="10" height="2" />
              <rect class="tree-body" x="3" y="11" width="12" height="2" />
              <rect class="tree-body" x="2" y="13" width="14" height="2" />
              <rect class="tree-ornament" x="6" y="9" width="2" height="2" />
              <rect class="tree-ornament is-gold" x="10" y="11" width="2" height="2" />
              <rect class="tree-ornament" x="5" y="13" width="2" height="2" />
              <rect class="tree-trunk" x="8" y="15" width="2" height="4" />
            </svg>
          </span>
        </div>

        <footer class="forum-promo-foot">
          <router-link v-if="card.to" class="forum-promo-cta" :to="card.to">
            {{ card.ctaText }}
            <ArrowUpRight :size="14" :stroke-width="2.2" aria-hidden="true" />
          </router-link>
          <a
            v-else-if="card.href"
            class="forum-promo-cta"
            :href="card.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ card.ctaText }}
            <ArrowUpRight :size="14" :stroke-width="2.2" aria-hidden="true" />
          </a>
        </footer>
      </template>

      <template v-else>
        <span class="forum-top-card-icon" aria-hidden="true">
          <CalendarDays v-if="card.icon === 'calendar'" :size="16" :stroke-width="2" />
          <Sparkles v-else :size="16" :stroke-width="2" />
        </span>

        <div class="forum-top-card-copy">
          <span class="forum-top-card-eyebrow">{{ card.eyebrow }}</span>
          <span class="forum-top-card-title">{{ card.title }}</span>
          <span v-if="card.subtitle" class="forum-top-card-subtitle">{{ card.subtitle }}</span>
        </div>

        <button
          type="button"
          class="forum-top-card-cta"
          :disabled="checkinSubmitting"
          @click="emit('checkin')"
        >
          {{ checkinSubmitting ? '签到中' : card.ctaText }}
        </button>

        <button
          v-if="card.dismissible"
          type="button"
          class="forum-top-card-close"
          :aria-label="`关闭${card.title}`"
          title="关闭"
          @click="emit('dismiss', card)"
        >
          <X :size="14" :stroke-width="2.2" aria-hidden="true" />
        </button>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ArrowUpRight, CalendarDays, Gift, Sparkles, X } from 'lucide-vue-next';

defineProps({
  cards: { type: Array, default: () => [] },
  checkinSubmitting: { type: Boolean, default: false },
});

const emit = defineEmits(['checkin', 'dismiss']);
</script>

<style scoped>
.forum-top-cards {
  box-sizing: border-box;
  display: grid;
  gap: 8px;
  align-items: start;
  width: 100%;
}

.forum-top-card {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--liquid-border-hairline);
  border-radius: 16px;
  background: var(--appl-card, #ffffff);
}

.forum-top-card.is-promo {
  --promo-accent: var(--appl-text-4, #86868b);
  --promo-pine: var(--appl-text-3, #6e6e73);
  --promo-gold: var(--appl-text-4, #86868b);
  --promo-red: var(--appl-text-3, #6e6e73);
  --promo-trunk: var(--appl-text-4, #86868b);
  display: block;
  padding: 12px 14px 13px;
  border-radius: 20px;
}

.forum-top-card.is-promo.is-christmas {
  --promo-accent: #b34a43;
  --promo-pine: #365b47;
  --promo-gold: #c3923d;
  --promo-red: #b34a43;
  --promo-trunk: #7f5639;
}

.forum-promo-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
}

.forum-promo-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--appl-subtle, #f2f2f7);
  color: var(--appl-text-2, #3a3a3c);
}

.forum-top-card.is-christmas .forum-promo-avatar {
  background: color-mix(in srgb, var(--promo-red) 10%, var(--appl-subtle, #f2f2f7));
  color: var(--promo-red);
}

.forum-promo-author {
  color: var(--appl-text-1, #1d1d1f);
  font-size: 12.5px;
  font-weight: 600;
}

.forum-promo-label {
  color: var(--promo-accent);
  font-size: 11.5px;
  font-weight: 600;
}

.forum-promo-label::before {
  content: '·';
  margin-right: 4px;
}

.forum-promo-head .forum-top-card-close {
  width: 26px;
  height: 26px;
  margin-left: auto;
}

.forum-promo-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.forum-promo-body {
  flex: 1;
  min-width: 0;
}

.forum-promo-art {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 58px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--promo-pine) 8%, var(--appl-subtle, #f2f2f7));
}

.forum-promo-art svg {
  width: 34px;
  height: 38px;
}

.tree-star {
  fill: var(--promo-gold);
}

.tree-body {
  fill: var(--promo-pine);
}

.tree-ornament {
  fill: var(--promo-red);
}

.tree-ornament.is-gold {
  fill: var(--promo-gold);
}

.tree-trunk {
  fill: var(--promo-trunk);
}

.forum-promo-title {
  margin: 0;
  color: var(--appl-text-1, #1d1d1f);
  font-size: 16.5px;
  font-weight: 600;
  line-height: 1.35;
}

.forum-promo-subtitle {
  margin: 3px 0 0;
  color: var(--appl-text-3, #6e6e73);
  font-size: 13px;
  line-height: 1.45;
}

.forum-promo-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.forum-promo-cta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 0;
  color: var(--appl-text-1, #1d1d1f);
  font-size: 12.5px;
  font-weight: 650;
  text-decoration: none;
}

.forum-promo-cta:hover {
  opacity: 0.68;
}

.forum-top-card-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--appl-subtle, #f2f2f7);
  color: var(--appl-text-3, #6e6e73);
}

.forum-top-card-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.forum-top-card-eyebrow {
  color: var(--appl-text-4, #86868b);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.03em;
}

.forum-top-card-title,
.forum-top-card-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forum-top-card-title {
  color: var(--appl-text-1, #1d1d1f);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
}

.forum-top-card-subtitle {
  color: var(--appl-text-3, #6e6e73);
  font-size: 12px;
  line-height: 1.25;
}

.forum-top-card-cta {
  flex-shrink: 0;
  padding: 6px 4px;
  border: 0;
  background: transparent;
  color: var(--appl-text-1, #1d1d1f);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
}

.forum-top-card-cta:disabled {
  opacity: 0.55;
  cursor: wait;
}

.forum-top-card-close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--appl-text-4, #86868b);
  cursor: pointer;
}

.forum-top-card-close:hover {
  background: var(--appl-subtle, #f2f2f7);
  color: var(--appl-text-2, #3a3a3c);
}

@media (max-width: 480px) {
  .forum-top-card-eyebrow {
    display: none;
  }
}

@media (max-width: 360px) {
  .forum-top-card-subtitle,
  .forum-promo-label {
    display: none;
  }
}
</style>
