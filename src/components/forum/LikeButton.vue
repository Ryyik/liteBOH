<script setup>
/**
 * LikeButton — 点赞按钮唯一真源（plans/051 §2.1-3）。
 *
 * 收敛前 3 份实现：PostCard 主楼、PostDetailMain 主楼（弹窗/页面各一份）、
 * CommentThread 评论行。规格（plans/051 §0）：
 *   · 计数为 0 时隐藏数字（不是显示 0）；
 *   · 计数 tabular-nums；
 *   · liked 实心 + 脉冲动画沿用父级 isLikedPulsing 状态（动画真源在调用方）；
 *   · home-cat 点赞猫弹层图由父级传 catSrc，本组件只负责渲染层。
 */
import { computed } from 'vue';
import { Heart } from 'lucide-vue-next';

const props = defineProps({
  count: { type: Number, default: 0 },
  liked: { type: Boolean, default: false },
  pulsing: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  /** home-cat 主题下的点赞猫弹层图 URL（可空） */
  catSrc: { type: String, default: '' },
  /** 计数即使为 0 也显示（详情页主楼口径）；默认 0 隐藏 */
  alwaysShowCount: { type: Boolean, default: false },
  variant: { type: String, default: 'plain', validator: (v) => ['plain', 'pill'].includes(v) },
  ariaLabel: { type: String, default: '点赞' },
});

const emit = defineEmits(['toggle']);

const showCount = computed(() => props.alwaysShowCount || props.count > 0);
</script>

<template>
  <button
    type="button"
    class="like-btn"
    :class="[`is-${variant}`, { 'is-liked': liked, 'is-pulsing': pulsing }]"
    :disabled="submitting"
    :aria-label="ariaLabel"
    :aria-pressed="liked"
    @click.stop="emit('toggle')"
  >
    <img
      v-if="catSrc && pulsing"
      class="like-btn-cat-pop"
      :src="catSrc"
      alt=""
      draggable="false"
      loading="lazy"
    />
    <Heart
      class="like-btn-icon"
      :size="17"
      :stroke-width="1.8"
      :fill="liked ? 'currentColor' : 'none'"
      aria-hidden="true"
    />
    <span v-if="showCount" class="like-btn-count">{{ count }}</span>
  </button>
</template>

<style scoped>
.like-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: none;
  color: var(--appl-text-3);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 9px;
  font: inherit;
  transition: color 0.18s var(--ease-standard, ease);
}

.like-btn:hover {
  color: var(--appl-text-2);
}

.like-btn.is-liked {
  color: var(--appl-red);
}

.like-btn.is-pill {
  background: var(--appl-subtle);
  padding: 5px 10px;
  border-radius: 14px;
}

.like-btn-count {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.like-btn-cat-pop {
  position: absolute;
  left: 50%;
  top: -42px;
  width: 44px;
  height: 44px;
  transform: translateX(-50%);
  filter: drop-shadow(0 8px 14px rgba(255, 143, 179, 0.22));
  pointer-events: none;
  animation: likeCatPop 1.9s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes likeCatPop {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(8px) scale(0.76);
  }
  24% {
    opacity: 1;
    transform: translateX(-50%) translateY(-2px) scale(1);
  }
  66% {
    opacity: 1;
    transform: translateX(-50%) translateY(-6px) scale(0.98);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-22px) scale(0.88);
  }
}

@media (prefers-reduced-motion: reduce) {
  .like-btn-cat-pop {
    animation-duration: 0.01s;
  }
}

.like-btn {
  position: relative;
}

.like-btn.is-pulsing .like-btn-icon {
  animation: likePulse 0.45s var(--ease-emphasized, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes likePulse {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.35);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .like-btn.is-pulsing .like-btn-icon {
    animation: none;
  }
}
</style>
