<script setup>
import { computed } from 'vue';
import { Calendar, Check, Flame, X } from 'lucide-vue-next';
import { WEEKLY_CHECKIN_REWARD_POINTS } from '../forum-config.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: Object, default: () => ({}) },
  calendarDays: { type: Array, default: () => [] },
  cycleWeeks: { type: Array, default: () => [] },
  progressPercent: { type: Number, default: 0 },
  panelTitle: { type: String, default: '' },
  rangeText: { type: String, default: '' },
  hintText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'checkin']);

function getWeeklyCheckinCycleProgress(status) {
  const cycleSize = Math.max(1, Number(status?.cycleSize || 4));
  const explicitProgress = Number(status?.cycleProgress);
  if (Number.isFinite(explicitProgress)) {
    return Math.min(Math.max(0, explicitProgress), cycleSize - 1);
  }
  const normalizedStreak = Math.max(0, Number(status?.currentStreak || status?.streakTotal || 0));
  return normalizedStreak % cycleSize;
}

const weeklyCheckinCycleProgress = computed(() =>
  getWeeklyCheckinCycleProgress(props.status)
);

const weeklyCheckinCycleSize = computed(() =>
  Math.max(1, Number(props.status.cycleSize || 4))
);

const weeklyCheckinDisplayWeek = computed(() => {
  const progress = weeklyCheckinCycleProgress.value;
  if (props.status.hasSignedThisWeek) {
    return Math.max(1, Math.min(weeklyCheckinCycleSize.value, progress || weeklyCheckinCycleSize.value));
  }
  return Math.max(1, Math.min(weeklyCheckinCycleSize.value, progress + 1));
});

const weeklyCheckinProgressText = computed(() =>
  `连续 ${weeklyCheckinCycleProgress.value} / ${props.status.cycleSize || 4} 周`
);

const nextWeeks = computed(() => {
  const cycleSize = Math.max(1, Number(props.status.cycleSize || 4));
  const cycleProgress = getWeeklyCheckinCycleProgress(props.status);
  const nextReward = Math.max(1, Number(props.status.nextRewardIn || cycleSize));
  return Math.max(0, nextReward - 1);
});

function close() {
  emit('close');
  emit('update:open', false);
}

function handleCheckin() {
  emit('checkin');
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="open" class="checkin-overlay" @click="close">
        <section class="checkin-modal" aria-label="周签到面板" @click.stop>
          <div class="checkin-header">
            <div class="checkin-header-left">
              <span class="checkin-kicker">签到</span>
              <h3 class="checkin-title">每周签到</h3>
            </div>
            <button type="button" class="checkin-close" aria-label="关闭" @click="close">
              <X :size="20" :stroke-width="2" />
            </button>
          </div>

          <div class="checkin-body">
            <div class="checkin-progress-section">
              <div class="checkin-progress-top">
                <span class="checkin-week-label">第 {{ weeklyCheckinDisplayWeek }} / {{ weeklyCheckinCycleSize }} 周</span>
                <span class="checkin-percent">{{ progressPercent }}%</span>
              </div>
              <div class="checkin-progress-track" :class="{ signed: status.hasSignedThisWeek }">
                <div class="checkin-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
              </div>
            </div>

            <div class="checkin-week-section">
              <div class="checkin-week-row">
                <span v-for="day in calendarDays" :key="day.key" class="checkin-week-day-label"
                  :class="{ today: day.isToday }">{{ day.label }}</span>
              </div>
              <div class="checkin-week-row">
                <span v-for="day in calendarDays" :key="`date-${day.key}`" class="checkin-week-date"
                  :class="{ today: day.isToday, signed: day.isSigned }">
                  {{ day.day }}
                  <Check v-if="day.isSigned" :size="12" :stroke-width="3" class="checkin-week-check" />
                </span>
              </div>
            </div>

            <div class="checkin-streak-section">
              <div class="checkin-streak-main">
                <Flame :size="22" :stroke-width="1.8" class="checkin-streak-icon" />
                <span class="checkin-streak-count">{{ weeklyCheckinCycleProgress }}</span>
                <span class="checkin-streak-label">周连续签到</span>
              </div>
              <p class="checkin-streak-hint">
                <template v-if="nextWeeks === 0 && !status.hasSignedThisWeek">本周完成签到可获得 {{ WEEKLY_CHECKIN_REWARD_POINTS }} 积分奖励</template>
                <template v-else-if="nextWeeks === 0">已达成 {{ weeklyCheckinCycleSize }} 周连签奖励</template>
                <template v-else>再坚持 {{ nextWeeks }} 周可获得 {{ WEEKLY_CHECKIN_REWARD_POINTS }} 积分</template>
              </p>
            </div>

            <button class="checkin-submit-btn"
              :class="{ 'is-done': status.hasSignedThisWeek }"
              @click="handleCheckin"
              :disabled="loading || submitting || status.hasSignedThisWeek">
              <span v-if="loading" class="checkin-skeleton-label"></span>
              <template v-else-if="submitting">
                <span>签到中...</span>
              </template>
              <template v-else-if="status.hasSignedThisWeek">
                <Check :size="18" :stroke-width="2.5" />
                <span>本周已签到</span>
              </template>
              <template v-else>
                <Calendar :size="18" :stroke-width="1.8" />
                <span>签到领积分</span>
              </template>
            </button>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
@import '../styles/base.css';
@import '../styles/composer.css';
</style>
