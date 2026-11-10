<template>
  <!-- 根标签在编辑态从 button 换成 div：卡片内部现在有可点的「改字/换图」元素，
       button 里不能再嵌 button（首屏读屏也会把整张卡读成一个按钮）。
       角色/键盘入口在替换后显式补回，交互语义不变。 -->
  <component
    :is="isInlineEditing ? 'div' : 'button'"
    :type="isInlineEditing ? undefined : 'button'"
    :role="isInlineEditing ? 'button' : undefined"
    :tabindex="isInlineEditing ? 0 : undefined"
    class="lt-card"
    :class="{ 'is-history': !isOpen }"
    :style="{ '--i': index }"
    @click="onOpen"
    @keydown="onKeydown"
  >
    <!-- 封面上的状态/日期标签仍留在 slot 里：它们属于封面，不是独立的文本字段 -->
    <EditableImage
      :model-value="lottery.cover_image_url || ''"
      class="lt-cover"
      :class="{ plain: !coverVisible }"
      :row="lottery"
      table="lotteries"
      field="cover_image_url"
      @update:model-value="setField('cover_image_url', $event)"
    >
      <img
        v-if="coverVisible"
        :src="coverOf"
        :alt="lottery.title"
        loading="lazy"
        decoding="async"
        :class="{ 'is-loading': !isImageLoaded(imageKey) }"
        @load="markImageLoaded(imageKey)"
        @error="markCoverFailed(imageKey)"
      />
      <span v-else class="cover-mark">{{ initialOf(lottery.title) }}</span>
      <span class="lt-status" :class="{ 'is-open': isOpen }">{{ statusText }}</span>
      <span class="lt-date">{{ dateText }}</span>
    </EditableImage>

    <span class="lt-body">
      <EditableText
        :model-value="lottery.title || ''"
        class="lt-title"
        :row="lottery"
        table="lotteries"
        field="title"
        label="抽奖标题"
        @update:model-value="setField('title', $event)"
      />
      <EditableText
        v-if="lottery.prize_title || isInlineEditing"
        :model-value="lottery.prize_title || ''"
        class="lt-prize"
        :row="lottery"
        table="lotteries"
        field="prize_title"
        label="奖品"
        placeholder="填写奖品"
        @update:model-value="setField('prize_title', $event)"
      />
      <span class="lt-meta">
        <span>{{ countText }}</span>
        <span v-if="isOpen && lottery.current_user_entry_id" class="lt-flag">已报名</span>
        <span v-else-if="!isOpen" class="lt-result">{{ resultText }}</span>
      </span>
      <!-- 删除只出现在编辑态：前台结构里没有这个节点。做成文字按钮而不是角标 X，
           是因为它和「换图」同在封面上，两颗圆角小图标挤在一起容易点错。 -->
      <button
        v-if="isInlineEditing"
        type="button"
        class="lt-remove"
        @click.stop="inlineEditor.remove(props.lottery, 'lotteries')"
      >
        删除这张卡
      </button>
    </span>
  </component>
</template>

<script setup>
import { computed } from 'vue';
import { useInlineEditor } from '@/composables/useInlineEditor.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { useImageLoaded } from '@/composables/useImageLoaded.js';
import EditableText from '@/components/inline-editor/EditableText.vue';
import EditableImage from '@/components/inline-editor/EditableImage.vue';

/**
 * 抽奖卡（plans/042 §10.4 A 档）。
 *
 * 抽成组件有两个理由，缺一个都不值得动：
 *   1. 原来「进行中」与「历史」两份 `.lt-card` 是**逐行重复**的模板，只在状态文案与
 *      meta 行上不同 —— 改封面兜底逻辑时要改两处，漏一处就是两种卡片长得不一样。
 *   2. 就地编辑要求「字段与行对象的绑定」只写一次；重复模板接原语必然漂移。
 *
 * 边界（写死在契约里，别扩）：
 *   · **不在卡上改状态/报名数/开奖时间**：状态是枚举、报名数是服务端投影、
 *     时间是 datetime —— 就地输入表达不了，走「完整编辑」表单。
 *   · 不复制前台任何样式：卡片样式原本就在 LotteryPanel 的 scoped 块里，
 *     随模板一起搬过来，选择器与取值一字未改。
 */
const props = defineProps({
  lottery: { type: Object, required: true },
  /** 列表序号：给入场动画的 --i 用 */
  index: { type: Number, default: 0 },
});

const emit = defineEmits(['open', 'update:field']);

const inlineEditor = useInlineEditor();
// 前台没有注入 ⇒ 恒 false，卡片仍是 <button>，与改造前完全一致
const isInlineEditing = computed(() => Boolean(inlineEditor?.active));

const isOpen = computed(() => props.lottery?.status === 'open');

/* 封面地址两种形态：`cover_image_url` 存的多是 Cloudinary 原图（大陆不可达且动辄 1MB+），
   裸文件名的是本地资源。resolveDbCardImage 一并做 CDN 改写 + 卡面尺寸变换。 */
const coverOf = computed(() => resolveDbCardImage(props.lottery?.cover_image_url) || '');
const { isFailed: isCoverFailed, markFailed: markCoverFailed } = useImageFailure();
const { isImageLoaded, markImageLoaded } = useImageLoaded();
const imageKey = computed(() => `lottery-cover-${props.lottery?.id}`);
const coverVisible = computed(() => Boolean(coverOf.value) && !isCoverFailed(imageKey.value));

const initialOf = (title) =>
  String(title || '抽')
    .trim()
    .charAt(0);

const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}.${pad(date.getDate())}`;
};

const dateText = computed(() => {
  const item = props.lottery || {};
  const raw =
    item.status === 'open' ? item.entry_deadline_at || item.draw_at : item.drawn_at || item.draw_at;
  return formatDay(raw);
});

const statusText = computed(() =>
  isOpen.value ? '进行中' : props.lottery?.status === 'drawn' ? '已开奖' : '已截止',
);

const countText = computed(() => {
  const item = props.lottery || {};
  if (!item.max_entries) return `${item.entry_count} 人已报名`;
  return `${item.entry_count} / ${item.max_entries} 人`;
});

const resultText = computed(() => {
  const item = props.lottery || {};
  if (item.status === 'drawn') {
    return item.winner_username ? `中奖：${item.winner_username}` : '已开奖';
  }
  return '已截止';
});

/* 字段写回交给宿主（LotteryPanel 持有数组）：卡片不直接改 prop 对象，
   否则 vue/no-mutating-props 与人读代码都会认为「谁都能改这行数据」。 */
const setField = (field, value) => emit('update:field', { field, value });

/* 事件要一起抛上去：详情弹层用 clip-path 从被点的那张卡推开，需要
   `event.currentTarget` 的矩形 —— 在派发过程中读它才是这张卡。 */
const onOpen = (event) => emit('open', props.lottery, event);

/* 编辑态根节点是 div，得自己补键盘入口（button 原生就有） */
const onKeydown = (event) => {
  if (!isInlineEditing.value) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('open', props.lottery, null);
  }
};
</script>

<style scoped>
/* 卡片本体就是「点开详情」的按钮（2026-11-01 用户口径：抽奖卡片支持点进去看详情）。
   整张卡是一个 <button>，报名动作搬进详情弹层 —— 卡片里再放一颗按钮会变成嵌套按钮，
   而且和商品卡（整张点开、动作在详情里）的交互也不一致。 */
.lt-card {
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--boh-bg-primary, #fff);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease;
}

.lt-card:active {
  transform: scale(0.985);
}

/* 历史卡不再整体降透明：白底黑字下 0.92 的 opacity 会把标题灰掉，
   读起来像「禁用」；状态由封面上「已开奖 / 已截止」那枚标签表达。 */
.lt-card.is-history .lt-cover img {
  filter: saturate(0.86);
}

.lt-cover {
  display: block;
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.lt-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lt-cover.plain {
  display: grid;
  place-items: center;
}

.cover-mark {
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 34px;
  font-weight: 500;
}

/* 封面之上的两枚小标签（状态左上 / 日期右上）：保留在封面上 ——
   它们是「这条抽奖现在什么状态」，脱离封面就和标题区混淆了。
   深色胶囊 + 模糊底是为了在任意封面上都可读，不是「阴影文字」。 */
.lt-status,
.lt-date {
  position: absolute;
  top: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(6px);
}

.lt-status {
  left: 10px;
}

.lt-status.is-open {
  background: rgba(10, 132, 255, 0.92);
}

.lt-date {
  right: 10px;
}

/* ── 卡片文字区：白底黑字，压在封面下方（2026-11-01 用户口径
   「抽奖卡片不要阴影文字，采用极简的白底黑字 + 上面封面」）── */
.lt-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px 12px;
}

.lt-title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  /* 两行封顶：三列下标题一行放不下，截断比撑高卡片更整齐 */
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.lt-prize {
  display: block;
  margin: 0;
  overflow: hidden;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lt-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

/* 「已报名」小标：只在本人已参与时出现，替代原来卡片上的报名按钮 */
.lt-flag {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.08));
  color: var(--boh-brand-blue, #0071e3);
  font-size: 11px;
  line-height: 1.6;
}

.lt-result {
  flex: none;
  color: var(--boh-text-secondary, #86868b);
}

/* 编辑态专属：只在这一态渲染，前台 DOM 里没有它 */
.lt-remove {
  align-self: flex-start;
  margin-top: 8px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, #c4261f 32%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #c4261f 6%, transparent);
  color: #c4261f;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.lt-remove:hover {
  background: color-mix(in srgb, #c4261f 14%, transparent);
}
</style>
