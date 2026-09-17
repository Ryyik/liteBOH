<script setup>
/**
 * ActivityCard — 历史活动卡片（月份轨道内的单张卡）
 *
 * 日期角标按「精度」自适应：
 *   - 有「日」的（2026/2/3、2026-08-10）→ 年份 + 2月3日
 *   - 只有年月的（2025/10）            → 年份 + 10月
 * 缺「日」不做补位，是数据本身的语义，不是渲染的省略。
 *
 * 纯展示组件：不请求数据、不自己开详情岛（岛槽位由宿主统一管理）。
 */
import { computed } from "vue";
import { getImageUrl } from "@/utils/asset-helper.js";
import { parseActivityDate } from "@/utils/activity-date.js";

const props = defineProps({
  activity: { type: Object, required: true }
});

defineEmits(["open"]);

const imageUrl = computed(() => getImageUrl(props.activity?.image));
const dateInfo = computed(() => parseActivityDate(props.activity?.date));
const rawDate = computed(() => String(props.activity?.date ?? "").trim());
</script>

<template>
  <article class="activity-card liquid-glass" @click="$emit('open', activity)">
    <div class="activity-card__image">
      <img
        :src="imageUrl"
        :alt="activity.title"
        class="activity-card__img"
        width="400"
        height="280"
        loading="lazy"
      />
      <div class="activity-card__date" :data-precision="dateInfo.valid ? dateInfo.precision : 'unknown'">
        <span v-if="dateInfo.valid" class="activity-card__date-year">{{ dateInfo.year }}</span>
        <span v-if="dateInfo.valid" class="activity-card__date-short">{{ dateInfo.shortLabel }}</span>
        <span v-else class="activity-card__date-short">{{ rawDate || "未排期" }}</span>
      </div>
    </div>

    <div class="activity-card__body">
      <h3 class="activity-card__title">{{ activity.title }}</h3>
      <p v-if="activity.description" class="activity-card__desc">{{ activity.description }}</p>
    </div>
  </article>
</template>

<style scoped>
.activity-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 24px;
  cursor: pointer;
  box-shadow: 0 2px 18px rgba(0, 0, 0, 0.04);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.activity-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12);
}

.activity-card__image {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 11;
  overflow: hidden;
  background-color: #f5f5f7;
}

.activity-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

.activity-card:hover .activity-card__img {
  transform: scale(1.06);
}

.activity-card__date {
  position: absolute;
  top: 14px;
  left: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
  padding: 7px 11px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
  color: #1d1d1f;
  line-height: 1.15;
}

.activity-card__date-year {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #86868b;
}

.activity-card__date-short {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.activity-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 22px;
}

.activity-card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: -0.01em;
  line-height: 1.35;
  color: #1d1d1f;
}

.activity-card__desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: #86868b;
}

@media (prefers-reduced-motion: reduce) {
  .activity-card,
  .activity-card__img {
    transition: none;
  }
  .activity-card:hover {
    transform: none;
  }
  .activity-card:hover .activity-card__img {
    transform: none;
  }
}

html[data-theme="dark"] .activity-card {
  background: #161a22;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
}

html[data-theme="dark"] .activity-card__image {
  background-color: #1a1e26;
}

html[data-theme="dark"] .activity-card__date {
  background: rgba(28, 28, 30, 0.92);
  color: #f5f5f7;
}

html[data-theme="dark"] .activity-card__date-year {
  color: #98989d;
}

html[data-theme="dark"] .activity-card__title {
  color: #f5f5f7;
}

html[data-theme="dark"] .activity-card__desc {
  color: #a1a1a6;
}
</style>
