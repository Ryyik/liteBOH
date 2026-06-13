<template>
  <Transition
    name="bottom-nav-island"
    @before-leave="$emit('before-leave')"
    @after-leave="$emit('after-leave')"
  >
    <div
      v-if="item?.visible"
      class="bottom-nav-island"
      :class="{ 'is-long': item.isLong, 'has-featured-cat': item.catStickerMode === 'hero' }"
      role="status"
      aria-live="polite"
      @click="$emit('action')"
    >
      <div class="bottom-nav-island-content">
        <img
          v-if="showCatSticker && catStickerSrc"
          class="bottom-nav-island-cat-sticker"
          :class="`mode-${item.catStickerMode || 'peek'}`"
          :src="catStickerSrc"
          alt=""
          aria-hidden="true"
        />
        <div class="bottom-nav-island-accent" aria-hidden="true"></div>
        <div class="bottom-nav-island-icon">
          <component :is="activeIcon" :size="18" :stroke-width="2.1" aria-hidden="true" />
        </div>
        <div class="bottom-nav-island-copy">
          <strong>{{ item.title }}</strong>
          <span v-if="item.message">{{ item.message }}</span>
        </div>
        <button type="button" class="bottom-nav-island-close" @click.stop="$emit('action')">
          {{ item.actionLabel }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue';
import { Bell, Bot, Check, MessageCircle, Newspaper, Search } from 'lucide-vue-next';
import catCardExtra from '@/assets/images/theme-cats/cat-card-extra.webp';
import catDecor from '@/assets/images/theme-cats/cat-decor-1.webp';
import catLike from '@/assets/images/theme-cats/cat-like.webp';
import catSuccess from '@/assets/images/theme-cats/cat-success.webp';
import catTheme from '@/assets/images/theme-cats/cat-theme.webp';
import catUploading from '@/assets/images/theme-cats/cat-uploading.webp';

const props = defineProps({
  item: {
    type: Object,
    default: null
  },
  showCatSticker: {
    type: Boolean,
    default: false
  }
});

defineEmits(['action', 'before-leave', 'after-leave']);

const iconMap = {
  notification: Bell,
  message: MessageCircle,
  post: Newspaper,
  comment: MessageCircle,
  ai: Bot,
  search: Search,
  success: Check,
  warning: Bell,
  progress: Bell
};

const activeIcon = computed(() => iconMap[props.item?.icon] || Check);

const catStickerMap = {
  card: catCardExtra,
  decor: catDecor,
  like: catLike,
  success: catSuccess,
  theme: catTheme,
  uploading: catUploading
};

const catStickerSrc = computed(() => catStickerMap[props.item?.catSticker] || '');
</script>
