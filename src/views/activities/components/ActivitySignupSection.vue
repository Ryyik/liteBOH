<script setup>
/**
 * ActivitySignupSection — 页面顶部的活动报名区
 *
 * 数据源：public.activity_campaigns（stage ∈ signup/submission/judging）
 * 与下方历史活动区（activities 表）是两个独立数据源，不合并：
 * activities 全是「已举办」，campaigns 是「进行中」，时间语义相反。
 *
 * 空态是常态而非边界：截止 2026-09-17 真库 activity_campaigns 为 0 行
 * （seed 数据被 2026090902_probe_cleanup 清理），所以 EmptyState 一定会命中。
 *
 * 首张卡为主卡（放大突出），其余进次卡横滑轨道。
 */
import { computed } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { CAMPAIGN_STAGE_LABELS } from "@/composables/useCampaigns.js";

const props = defineProps({
  campaigns: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false }
});

defineEmits(["signup"]);

const primary = computed(() => props.campaigns[0] || null);
const secondary = computed(() => props.campaigns.slice(1));

const stageLabel = (stage) => CAMPAIGN_STAGE_LABELS[stage] || stage || "";

const formatWindow = (camp) => {
  const fmt = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getMonth() + 1}.${date.getDate()}`;
  };
  const start = fmt(camp?.startAt || camp?.signupStartAt);
  const end = fmt(camp?.endAt || camp?.signupEndAt);
  if (!start && !end) return "";
  return `${start || "…"} - ${end || "…"}`;
};

const buttonLabel = (camp) => {
  if (camp?.signedUp) return "已报名";
  if (camp?.signingUp) return "报名中…";
  return "立即报名";
};
</script>

<template>
  <section class="signup-section" aria-label="活动报名">
    <header class="signup-section__head">
      <h2 class="signup-section__title">活动报名</h2>
      <span class="signup-section__hint">来自活动平台 · 可直接报名</span>
    </header>

    <div v-if="loading" class="signup-hero signup-hero--skeleton liquid-glass" aria-hidden="true">
      <div class="signup-skeleton-bar signup-skeleton-bar--chip"></div>
      <div class="signup-skeleton-bar signup-skeleton-bar--title"></div>
      <div class="signup-skeleton-bar signup-skeleton-bar--line"></div>
    </div>

    <template v-else-if="primary">
      <article class="signup-hero liquid-glass" :data-stage="primary.stage">
        <div class="signup-hero__main">
          <div class="signup-hero__top">
            <span class="signup-stage-chip" :data-stage="primary.stage">{{ stageLabel(primary.stage) }}</span>
            <span v-if="formatWindow(primary)" class="signup-window">{{ formatWindow(primary) }}</span>
          </div>
          <h3 class="signup-hero__title">{{ primary.title }}</h3>
          <p v-if="primary.description" class="signup-hero__desc">{{ primary.description }}</p>
        </div>
        <div class="signup-hero__action">
          <button
            type="button"
            class="signup-btn"
            :disabled="primary.signingUp || primary.signedUp"
            @click="$emit('signup', primary)"
          >
            {{ buttonLabel(primary) }}
          </button>
          <span v-if="!isLoggedIn" class="signup-hero__note">登录后可报名</span>
        </div>
      </article>

      <div v-if="secondary.length" class="signup-more">
        <article v-for="camp in secondary" :key="camp.id" class="signup-card liquid-glass">
          <div class="signup-card__top">
            <span class="signup-stage-chip" :data-stage="camp.stage">{{ stageLabel(camp.stage) }}</span>
            <span v-if="formatWindow(camp)" class="signup-window">{{ formatWindow(camp) }}</span>
          </div>
          <h3 class="signup-card__title">{{ camp.title }}</h3>
          <p v-if="camp.description" class="signup-card__desc">{{ camp.description }}</p>
          <button
            type="button"
            class="signup-btn signup-btn--sm"
            :disabled="camp.signingUp || camp.signedUp"
            @click="$emit('signup', camp)"
          >
            {{ buttonLabel(camp) }}
          </button>
        </article>
      </div>
    </template>

    <EmptyState
      v-else
      variant="spark"
      compact
      title="暂无进行中的活动"
      description="新的活动开放报名后会出现在这里，往期活动可在下方按月份回看。"
    />
  </section>
</template>

<style scoped>
.signup-section {
  max-width: 1320px;
  margin: 0 auto 42px;
  padding: 0 40px;
}

.signup-section__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.signup-section__title {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: #1d1d1f;
}

.signup-section__hint {
  font-size: 12.5px;
  color: #a1a1a6;
}

/* ---- 主卡 ---- */
.signup-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 26px;
  padding: 26px 28px;
  border-radius: 24px;
  border: 1px solid rgba(0, 113, 227, 0.16);
  box-shadow: 0 10px 34px rgba(0, 113, 227, 0.08);
}

.signup-hero__main { min-width: 0; }

.signup-hero__top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.signup-hero__title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.25;
  color: #1d1d1f;
}

.signup-hero__desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.6;
  color: #515154;
}

.signup-hero__action {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.signup-hero__note {
  font-size: 12px;
  color: #a1a1a6;
}

/* ---- 次卡 ---- */
.signup-more {
  display: flex;
  gap: 14px;
  margin-top: 14px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  padding-bottom: 4px;
  margin-inline: -8px;
  padding-inline: 8px;
}

.signup-more::-webkit-scrollbar { display: none; }

.signup-card {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8px;
  width: clamp(230px, 30%, 300px);
  padding: 18px;
  border-radius: 20px;
  scroll-snap-align: start;
}

.signup-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.signup-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1d1d1f;
}

.signup-card__desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: #515154;
}

/* ---- 徽章 / 按钮 ---- */
.signup-stage-chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #0071e3;
  background: rgba(0, 113, 227, 0.1);
  white-space: nowrap;
}

.signup-stage-chip[data-stage="judging"] { color: #854f0b; background: rgba(250, 238, 218, 0.9); }
.signup-stage-chip[data-stage="result"] { color: #3b6d11; background: rgba(234, 243, 222, 0.9); }

.signup-window {
  font-size: 12px;
  color: #86868b;
  font-variant-numeric: tabular-nums;
}

.signup-btn {
  min-width: 116px;
  height: 38px;
  padding: 0 22px;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  color: #ffffff;
  background: #0071e3;
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease, opacity 0.16s ease;
}

.signup-btn--sm {
  margin-top: auto;
  min-width: 0;
  height: 34px;
  padding: 0 16px;
  font-size: 13px;
}

.signup-btn:hover:not(:disabled) { background: #0077ed; transform: translateY(-1px); }
.signup-btn:active:not(:disabled) { transform: scale(0.97); }
.signup-btn:disabled { opacity: 0.55; cursor: default; }
.signup-btn:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }

/* ---- 骨架 ---- */
.signup-hero--skeleton {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.signup-skeleton-bar {
  border-radius: 10px;
  background: #edf0f4;
}

.signup-skeleton-bar--chip { width: 76px; height: 24px; border-radius: 999px; }
.signup-skeleton-bar--title { width: 42%; height: 26px; }
.signup-skeleton-bar--line { width: 68%; height: 14px; border-radius: 999px; }

@media (max-width: 768px) {
  .signup-section { padding: 0 20px; margin-bottom: 30px; }

  .signup-hero {
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
    padding: 20px;
  }

  .signup-hero__title { font-size: 20px; }
  .signup-hero__action { align-items: stretch; }
  .signup-btn { width: 100%; min-width: 0; }
  .signup-card { width: clamp(200px, 74%, 280px); }
}

@media (prefers-reduced-motion: reduce) {
  .signup-btn { transition: none; }
  .signup-btn:hover:not(:disabled) { transform: none; }
}

html[data-theme="dark"] .signup-section__title { color: #f5f5f7; }
html[data-theme="dark"] .signup-section__hint { color: #6e6e73; }

html[data-theme="dark"] .signup-hero {
  background: rgba(28, 28, 30, 0.62);
  border-color: rgba(10, 132, 255, 0.22);
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.35);
}

html[data-theme="dark"] .signup-hero__title { color: #f5f5f7; }
html[data-theme="dark"] .signup-hero__desc { color: #a1a1a6; }
html[data-theme="dark"] .signup-hero__note { color: #6e6e73; }
html[data-theme="dark"] .signup-card { background: rgba(44, 44, 46, 0.72); }
html[data-theme="dark"] .signup-card__title { color: #f5f5f7; }
html[data-theme="dark"] .signup-card__desc { color: #a1a1a6; }
html[data-theme="dark"] .signup-window { color: #98989d; }
html[data-theme="dark"] .signup-stage-chip { color: #6cb2ff; background: rgba(10, 132, 255, 0.16); }
html[data-theme="dark"] .signup-stage-chip[data-stage="judging"] { color: #ffd60a; background: rgba(255, 214, 10, 0.12); }
html[data-theme="dark"] .signup-stage-chip[data-stage="result"] { color: #32d74b; background: rgba(50, 215, 75, 0.12); }
html[data-theme="dark"] .signup-btn { background: #0a84ff; }
html[data-theme="dark"] .signup-skeleton-bar { background: #1a1e26; }
</style>
