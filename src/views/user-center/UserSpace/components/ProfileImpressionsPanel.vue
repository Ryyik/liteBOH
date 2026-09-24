<template>
  <div key="profile-impressions" class="profile-subpage-shell">
    <UserCenterPageHeader title="我的印象" back-label="返回我的" max-width="1200px" :show-back="showBack" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <!-- 加载骨架：与卡片同构的玻璃占位 -->
      <div v-if="isImpressionsLoading" class="profile-impressions-grid" aria-label="印象加载中">
        <div v-for="n in 4" :key="n" class="profile-impression-card is-skeleton">
          <div class="impression-skeleton-line impression-skeleton-quote"></div>
          <div class="impression-skeleton-line long"></div>
          <div class="impression-skeleton-line mid"></div>
          <div class="impression-skeleton-foot">
            <div class="impression-skeleton-avatar"></div>
            <div class="impression-skeleton-line short"></div>
          </div>
        </div>
      </div>

      <template v-else-if="impressions.length">
        <p class="profile-impressions-subtitle">
          <Sparkles :size="14" :stroke-width="2" aria-hidden="true" />
          <span><strong>{{ impressions.length }}</strong> 位伙伴写下了对你的印象</span>
        </p>

        <div class="profile-impressions-grid">
          <article v-for="(imp, index) in impressions" :key="imp.id" class="profile-impression-card"
            :style="{ '--stagger-delay': `${Math.min(index, 8) * 55}ms` }">
            <span class="impression-quote-mark" aria-hidden="true">"</span>
            <p class="impression-content">{{ imp.content }}</p>
            <div class="impression-foot">
              <div class="impression-author">
                <span class="impression-avatar" aria-hidden="true">
                  <img v-if="getAvatarUrl(imp.author?.avatar_url, 'sm')" :src="getAvatarUrl(imp.author?.avatar_url, 'sm')"
                    :alt="`${imp.author?.username || '匿名伙伴'} 的头像`" loading="lazy" />
                  <i v-else>{{ (imp.author?.username || '匿').charAt(0).toUpperCase() }}</i>
                </span>
                <span class="impression-author-meta">
                  <span class="impression-author-name">@{{ imp.author?.username || '匿名伙伴' }}</span>
                  <span v-if="formatImpressionDate(imp.created_at)" class="impression-date">{{ formatImpressionDate(imp.created_at) }}</span>
                </span>
              </div>
              <button type="button" class="impression-remove-btn"
                :class="{ armed: armedDeleteId === imp.id }"
                :aria-label="armedDeleteId === imp.id ? `确认移除「${truncateImpression(imp.content)}」` : `移除「${truncateImpression(imp.content)}」`"
                @click="onRemoveClick(imp)">
                <template v-if="armedDeleteId === imp.id">
                  <Check :size="13" :stroke-width="2.6" aria-hidden="true" />
                  <span>确认移除</span>
                </template>
                <template v-else>
                  <Trash2 :size="14" :stroke-width="2" aria-hidden="true" />
                </template>
              </button>
            </div>
          </article>
        </div>

        <!-- 分页加载更多（P0-4：印象改服务端分页后提供增量入口） -->
        <div v-if="hasMore" class="impressions-load-more">
          <button type="button" class="impression-load-more-btn" :disabled="isLoadingMore"
            :aria-busy="isLoadingMore" @click="$emit('load-more-impressions')">
            <template v-if="isLoadingMore">
              <Loader2 :size="15" :stroke-width="2.2" class="load-more-spinner" aria-hidden="true" />
              <span>加载中…</span>
            </template>
            <template v-else>
              <span>加载更多印象</span>
            </template>
          </button>
        </div>
      </template>

      <EmptyState v-else variant="inbox" title="暂无他人印象" description="社区伙伴写给你的印象会显示在这里。" />
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { Check, Loader2, Sparkles, Trash2 } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { getAvatarUrl } from '@/utils/avatar.js';

defineProps({
  showBack: {
    type: Boolean,
    default: true
  },
  isImpressionsLoading: {
    type: Boolean,
    default: false
  },
  impressions: {
    type: Array,
    default: () => []
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  isLoadingMore: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits([
  'back',
  'delete-impression',
  'load-more-impressions'
]);

// 两步移除：先点出确认态，再点才真的删（误触保护），2.6s 未确认自动收回
const ARMED_RESET_MS = 2600;
const armedDeleteId = ref(null);
let armedResetTimer = null;

const disarmDelete = () => {
  armedDeleteId.value = null;
  if (armedResetTimer) {
    clearTimeout(armedResetTimer);
    armedResetTimer = null;
  }
};

const onRemoveClick = (imp) => {
  if (armedDeleteId.value === imp.id) {
    disarmDelete();
    emit('delete-impression', imp.id);
    return;
  }
  disarmDelete();
  armedDeleteId.value = imp.id;
  armedResetTimer = setTimeout(disarmDelete, ARMED_RESET_MS);
};

onBeforeUnmount(disarmDelete);

const truncateImpression = (content = '') => {
  const text = String(content || '').trim();
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
};

const formatImpressionDate = (createdAt) => {
  const ts = Date.parse(createdAt || '');
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
</script>

<style scoped>
.profile-subpage-shell {
  padding-top: 0;
}

/* 副标题计数行 */
.profile-impressions-subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 14px;
  padding: 6px 12px;
  border: 1px solid var(--liquid-border);
  border-radius: 999px;
  background: var(--liquid-bg-subtle);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 650;
}

.profile-impressions-subtitle svg {
  color: #0071e3;
}

.profile-impressions-subtitle strong {
  color: var(--text-primary);
  font-weight: 800;
}

/* 液态玻璃印象墙 */
.profile-impressions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.profile-impression-card {
  position: relative;
  padding: 18px 18px 14px;
  border: 1px solid var(--liquid-border);
  border-radius: 20px;
  background: var(--liquid-bg);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: var(--liquid-shadow), var(--liquid-inner-highlight);
  overflow: hidden;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
  animation: impression-card-in 280ms cubic-bezier(0.23, 1, 0.32, 1) both;
  animation-delay: var(--stagger-delay, 0ms);
}

@media (hover: hover) and (pointer: fine) {
  .profile-impression-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--liquid-shadow), 0 12px 28px rgba(15, 23, 42, 0.07), var(--liquid-inner-highlight);
  }
}

@keyframes impression-card-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 角标引用符号：品牌蓝低饱和，只做氛围不做信息 */
.impression-quote-mark {
  position: absolute;
  top: -14px;
  right: 8px;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 84px;
  line-height: 1;
  font-weight: 700;
  color: color-mix(in srgb, #0071e3 12%, transparent);
  pointer-events: none;
  user-select: none;
}

.impression-content {
  position: relative;
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.7;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.impression-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.impression-author {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.impression-avatar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  overflow: hidden;
  background: color-mix(in srgb, #0071e3 10%, var(--liquid-bg-subtle));
  box-shadow: inset 0 0 0 1px var(--liquid-border);
}

.impression-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.impression-avatar i {
  font-style: normal;
  font-size: 13px;
  font-weight: 800;
  color: #0071e3;
}

.impression-author-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.impression-author-name {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.impression-date {
  color: color-mix(in srgb, var(--text-secondary) 72%, transparent);
  font-size: 11px;
  font-weight: 600;
}

/* 移除按钮：默认安静的幽灵图标，armed 后升级为红色确认胶囊（两步防误触） */
.impression-remove-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.impression-remove-btn:hover {
  background: rgba(255, 59, 48, 0.09);
  color: #ff3b30;
}

.impression-remove-btn.armed {
  background: #ff3b30;
  color: #ffffff;
  box-shadow: 0 6px 16px rgba(255, 59, 48, 0.28);
  animation: impression-arm-pop 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.impression-remove-btn.armed span {
  white-space: nowrap;
}

@keyframes impression-arm-pop {
  from {
    transform: scale(0.86);
  }

  to {
    transform: scale(1);
  }
}

/* 骨架占位 */
.profile-impression-card.is-skeleton {
  pointer-events: none;
  animation: none;
}

.impression-skeleton-line {
  height: 13px;
  border-radius: 7px;
  background: linear-gradient(100deg,
      color-mix(in srgb, var(--text-secondary) 10%, transparent) 32%,
      color-mix(in srgb, var(--text-secondary) 18%, transparent) 50%,
      color-mix(in srgb, var(--text-secondary) 10%, transparent) 68%);
  background-size: 240% 100%;
  animation: impression-shimmer 1.5s linear infinite;
}

.impression-skeleton-line.long {
  width: 92%;
}

.impression-skeleton-line.mid {
  width: 64%;
  margin-top: 10px;
}

.impression-skeleton-quote {
  width: 34px;
  height: 20px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.impression-skeleton-foot {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}

.impression-skeleton-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(100deg,
      color-mix(in srgb, var(--text-secondary) 10%, transparent) 32%,
      color-mix(in srgb, var(--text-secondary) 18%, transparent) 50%,
      color-mix(in srgb, var(--text-secondary) 10%, transparent) 68%);
  background-size: 240% 100%;
  animation: impression-shimmer 1.5s linear infinite;
}

.impression-skeleton-foot .impression-skeleton-line {
  width: 88px;
  margin-top: 0;
}

@keyframes impression-shimmer {
  from {
    background-position: 120% 0;
  }

  to {
    background-position: -120% 0;
  }
}

/* 分页加载更多（P0-4） */
.impressions-load-more {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}

.impression-load-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 22px;
  border: 1px solid var(--liquid-border);
  border-radius: 999px;
  background: var(--liquid-bg);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  box-shadow: var(--liquid-inner-highlight);
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

@media (hover: hover) and (pointer: fine) {
  .impression-load-more-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--liquid-shadow), var(--liquid-inner-highlight);
  }
}

.impression-load-more-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.impression-load-more-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.load-more-spinner {
  color: #0071e3;
  animation: load-more-spin 0.9s linear infinite;
}

@keyframes load-more-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .profile-impressions-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-impression-card {
    animation: none;
  }

  .profile-impression-card:hover,
  .impression-load-more-btn:hover:not(:disabled) {
    transform: none;
  }

  .impression-remove-btn.armed {
    animation: none;
  }

  .impression-skeleton-line,
  .impression-skeleton-avatar {
    animation-duration: 3s;
  }
}
</style>
