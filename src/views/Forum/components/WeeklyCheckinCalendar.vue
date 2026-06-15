<script setup>
import { computed } from 'vue';
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

function formatCheckinDate(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function close() {
  emit('close');
}

function handleCheckin() {
  emit('checkin');
}
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="open" class="checkin-calendar-overlay" @click="close">
        <section class="checkin-calendar-modal glass-panel" aria-label="周签到面板" @click.stop>
          <div class="checkin-calendar-header">
            <div>
              <span class="checkin-calendar-kicker">WEEKLY CHECK-IN</span>
              <h3>{{ panelTitle }}</h3>
            </div>
            <button type="button" class="checkin-calendar-close" aria-label="关闭签到日历"
              @click="close">×</button>
          </div>

          <div class="checkin-week-card">
            <div class="checkin-week-copy">
              <span>本周</span>
              <strong>{{ rangeText }}</strong>
            </div>
            <div class="checkin-week-status" :class="{ signed: status.hasSignedThisWeek }">
              {{ status.hasSignedThisWeek ? '已签到' : '待签到' }}
            </div>
          </div>

          <div class="checkin-week-days" aria-label="本周日期">
            <div v-for="day in calendarDays" :key="day.key" class="checkin-week-day"
              :class="{ today: day.isToday, signed: day.isSigned }">
              <span>{{ day.label }}</span>
              <strong>{{ day.day }}</strong>
            </div>
          </div>

          <div class="checkin-cycle-panel">
            <div class="checkin-cycle-header">
              <div>
                <span>连续周期</span>
                <strong>第 {{ weeklyCheckinDisplayWeek }} / {{ weeklyCheckinCycleSize }} 周</strong>
              </div>
              <small>奖励 {{ WEEKLY_CHECKIN_REWARD_POINTS }} 积分</small>
            </div>
            <div class="checkin-cycle-weeks">
              <div v-for="item in cycleWeeks" :key="item.week" class="checkin-cycle-week"
                :class="{ completed: item.isCompleted, current: item.isCurrent }">
                <span>{{ item.week }}</span>
              </div>
            </div>
            <div class="checkin-progress-track" :class="{ signed: status.hasSignedThisWeek }"
              aria-hidden="true">
              <div class="checkin-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
            </div>
          </div>

          <div class="checkin-calendar-progress">
            <div class="checkin-calendar-progress-copy">
              <strong>{{ status.hasSignedThisWeek ? weeklyCheckinProgressText : '本周还未签到' }}</strong>
              <span>{{ hintText }}</span>
            </div>
          </div>

          <button class="weekly-checkin-btn calendar-submit-btn"
            :class="{ 'is-done': status.hasSignedThisWeek }"
            @click="handleCheckin"
            :disabled="loading || submitting || status.hasSignedThisWeek">
            <span v-if="loading" class="checkin-skeleton-button-label skeleton-item"></span>
            <span v-else-if="submitting">签到中...</span>
            <span v-else>{{ status.hasSignedThisWeek ? '本周已签到' : '完成本周签到' }}</span>
          </button>
        </section>
      </div>
    </transition>
  </Teleport>
</template>