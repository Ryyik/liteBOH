<template>
  <article
    class="overview-card"
    :class="[`overview-card-${item.type}`, { 'has-thumb': hasThumb }]"
    :style="{ '--enter-delay': `${enterDelay}ms` }"
    :data-type="item.type"
    role="link"
    tabindex="0"
    :aria-label="`打开${typeLabel}：${item.title}`"
    @click="$emit('open', item)"
    @keydown.enter.prevent="$emit('open', item)"
  >
    <div class="card-body">
      <div class="card-type-row">
        <span class="card-type-chip">
          <component :is="typeIcon" :size="12" :stroke-width="2.1" aria-hidden="true" />
          {{ typeLabel }}
        </span>
        <span v-if="categoryLabel" class="card-category">{{ categoryLabel }}</span>
        <span class="card-time">{{ formattedTime }}</span>
      </div>

      <h3 class="card-title">{{ item.title }}</h3>
      <p v-if="item.excerpt" class="card-excerpt">{{ item.excerpt }}</p>

      <div class="card-meta">
        <span v-if="hasAvatar" class="card-author-avatar">
          <img :src="avatarSrc" alt="" loading="lazy" decoding="async" @error="onAvatarError" />
        </span>
        <span v-else class="card-author-avatar card-author-letter" aria-hidden="true">{{ authorLetter }}</span>
        <span class="card-author">{{ item.author }}</span>
        <ChevronRight class="card-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
      </div>
    </div>

    <div v-if="hasThumb" class="card-thumb">
      <img
        v-if="!thumbFailed"
        :src="cardImage"
        alt=""
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        @error="thumbFailed = true"
      />
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue';
import { MessageSquare, Newspaper, ChevronRight } from 'lucide-vue-next';
import { formatSmartTime } from '@/utils/time.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import { FORUM_TAG_MAP } from '@/views/Forum/forum-config.js';
import { getOverviewCardImage } from '../utils/image.js';

const props = defineProps({
  item: { type: Object, required: true },
  enterDelay: { type: Number, default: 0 }
});

defineEmits(['open']);

const thumbFailed = ref(false);
const avatarFailed = ref(false);

const typeIcon = computed(() => (props.item.type === 'news' ? Newspaper : MessageSquare));
const typeLabel = computed(() => (props.item.type === 'news' ? '新闻' : '帖子'));

const categoryLabel = computed(() => {
  const { type, category } = props.item;
  if (!category) return '';
  if (type === 'post') {
    const mapped = FORUM_TAG_MAP[category];
    return mapped ? mapped.label : '';
  }
  const names = { event: '活动公告', update: '更新日志', community: '社区动态', announce: '官方通知' };
  return names[category] || '';
});

const formattedTime = computed(() => formatSmartTime(props.item.publishedAt));

const authorLetter = computed(() => (props.item.author || 'B').charAt(0).toUpperCase());

const hasThumb = computed(() => Boolean(props.item.image) && !thumbFailed.value);
const cardImage = computed(() => getOverviewCardImage(props.item.image));
const hasAvatar = computed(() => Boolean(props.item.authorAvatar) && !avatarFailed.value);
// 与论坛 PostCard 同源：Cloudinary 头像走人脸聚焦方形裁剪，其余原样返回
const avatarSrc = computed(() => getAvatarUrl(props.item.authorAvatar, 'sm'));

const onAvatarError = () => {
  avatarFailed.value = true;
};
</script>
