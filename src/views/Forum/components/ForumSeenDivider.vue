<script setup>
import { computed } from 'vue';
import { formatSeenAnchorLabel } from '@/composables/useForumSeenDivider.js';

/**
 * 论坛「上次看到这里」分隔线。
 *
 * 纯展示：判定（该不该画、画在第几条之后）全部在
 * `composables/useForumSeenDivider.js` 的 `resolveForumSeenDivider` 里，本组件不重复算一遍。
 *
 * 配色刻意只用 `currentColor` + 透明度：浅色/暗色各自继承页面文字色，因此**不需要**
 * 在 `themes/forum-dark.css` 里再写一份覆盖（也就不会给暗色裸色棘轮添数）。
 * 如果将来有人把它改成硬编码色值，记得同时补暗色规则 —— 否则暗色下会变成一条看不清的灰线。
 */
const props = defineProps({
  anchorIso: { type: String, default: '' },
  newCount: { type: Number, default: 0 },
});

const timeLabel = computed(() => formatSeenAnchorLabel(props.anchorIso));

const ariaLabel = computed(() => {
  const count = Number(props.newCount) > 0 ? `，上方有 ${props.newCount} 条新帖` : '';
  return `上次看到这里${count}`;
});
</script>

<template>
  <div class="forum-seen-divider" data-forum-seen-divider role="separator" :aria-label="ariaLabel">
    <span class="forum-seen-divider-rule" aria-hidden="true"></span>
    <span class="forum-seen-divider-label">
      上次看到这里<template v-if="timeLabel"> · {{ timeLabel }}</template>
    </span>
    <span class="forum-seen-divider-rule" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.forum-seen-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 4px;
  user-select: none;
}

.forum-seen-divider-rule {
  flex: 1 1 auto;
  height: 1px;
  min-width: 12px;
  background: currentColor;
  opacity: 0.16;
}

.forum-seen-divider-label {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 1.4;
  color: inherit;
  /* 0.68 是**实测**下限，不是感觉：0.55 时浅色下对比度只有 3.8（12px 文字 AA 要求 4.5），
     探针 A5 会当场红。改这个值必须重跑 probe-forum-seen-divider（浅色/暗色两条断言）。 */
  opacity: 0.68;
  white-space: nowrap;
}

@media (max-width: 480px) {
  .forum-seen-divider {
    padding: 14px 2px;
  }

  .forum-seen-divider-label {
    font-size: 11px;
  }
}
</style>
