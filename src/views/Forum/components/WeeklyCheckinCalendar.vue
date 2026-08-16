<script setup>
import { computed } from 'vue';
import { CalendarDays, Check, CircleCheck, Coins, X } from 'lucide-vue-next';
import { WEEKLY_CHECKIN_REWARD_POINTS } from '../forum-config.js';
import PointsCard from '@/views/user-center/UserSpace/components/PointsCard.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: Object, default: () => ({}) },
  calendarDays: { type: Array, default: () => [] },
  nextCheckin: { type: Object, default: () => ({ dateText: '', days: 0 }) },
  loading: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  cardPoints: { type: Number, default: 0 },
  cardUsername: { type: String, default: '未命名用户' },
  cardTierLabel: { type: String, default: 'BOH' },
  cardSkin: { type: String, default: 'blank' },
  cardImageUrl: { type: String, default: '' }
});

const emit = defineEmits(['close', 'checkin']);

const signed = computed(() => Boolean(props.status.hasSignedThisWeek));

const nextCheckinText = computed(() => {
  const { dateText, days } = props.nextCheckin;
  if (dateText) {
    return days > 0 ? `${dateText}（还有 ${days} 天）` : dateText;
  }
  return '下周一';
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
              <span class="checkin-kicker">论坛奖励</span>
              <h3 class="checkin-title">每周签到</h3>
            </div>
            <button type="button" class="checkin-close" aria-label="关闭" @click="close">
              <X :size="20" :stroke-width="2" />
            </button>
          </div>

          <div class="checkin-body">
            <div class="checkin-card-stage">
              <PointsCard
                class="checkin-points-card"
                :points="cardPoints"
                :username="cardUsername"
                :tier-label="cardTierLabel"
                :skin="cardSkin"
                :image-url="cardImageUrl"
                compact
              />
              <span class="checkin-card-caption">本次奖励将计入这张积分卡</span>
            </div>

            <div class="checkin-hero" :class="{ 'is-signed': signed }">
              <div class="checkin-hero-icon">
                <CircleCheck v-if="signed" :size="24" :stroke-width="2.2" aria-hidden="true" />
                <Coins v-else :size="24" :stroke-width="2" aria-hidden="true" />
              </div>
              <div class="checkin-hero-copy">
                <span class="checkin-hero-points">
                  {{ signed ? `+${WEEKLY_CHECKIN_REWARD_POINTS} 积分已到账` : `+${WEEKLY_CHECKIN_REWARD_POINTS} 积分` }}
                </span>
                <span class="checkin-hero-title">{{ signed ? '本周已签到' : '本周签到奖励' }}</span>
                <span class="checkin-hero-sub">
                  {{ signed ? '积分已到账，下周再来签到' : '每周一刷新 · 每周仅一次' }}
                </span>
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

            <div class="checkin-next-row">
              <span class="checkin-next-label">
                <CalendarDays :size="15" :stroke-width="2" aria-hidden="true" />
                <template v-if="signed">下次签到 {{ nextCheckinText }}</template>
                <template v-else>今天签到，立得 +{{ WEEKLY_CHECKIN_REWARD_POINTS }} 积分</template>
              </span>
              <span v-if="signed" class="checkin-next-count">每周一刷新</span>
            </div>

            <button class="checkin-submit-btn"
              :class="{ 'is-done': signed }"
              @click="handleCheckin"
              :disabled="loading || submitting || signed">
              <span v-if="loading" class="checkin-skeleton-label"></span>
              <template v-else-if="submitting">
                <span>签到中...</span>
              </template>
              <template v-else-if="signed">
                <Check :size="18" :stroke-width="2.5" />
                <span>本周已签到</span>
              </template>
              <template v-else>
                <Coins :size="18" :stroke-width="2" />
                <span>签到领 +{{ WEEKLY_CHECKIN_REWARD_POINTS }} 积分</span>
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
