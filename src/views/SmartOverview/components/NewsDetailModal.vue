<template>
  <Teleport to="body">
    <transition name="news-modal-fade">
      <div v-if="isOpen" class="overview-news-modal" @click="$emit('close')">
        <div class="news-modal-panel" role="dialog" aria-modal="true" :aria-label="title" @click.stop>
          <button class="news-modal-close" type="button" aria-label="关闭" @click="$emit('close')">&times;</button>

          <div class="news-modal-scroll">
            <header class="news-modal-header">
              <h2 class="news-modal-title">{{ title }}</h2>
              <div v-if="metaText" class="news-modal-meta">{{ metaText }}</div>
            </header>

            <div v-if="isLoading" class="news-modal-body" aria-hidden="true">
              <div class="news-modal-skeleton">
                <div class="skeleton-line skeleton-line-title"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line skeleton-line-short"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line skeleton-line-short"></div>
              </div>
            </div>

            <div v-else-if="error" class="news-modal-body news-modal-error">
              <p>{{ error }}</p>
              <button class="overview-btn" type="button" @click="$emit('retry')">重试</button>
            </div>

            <div v-else class="news-modal-body">
              <img
                v-if="modalImage"
                :src="modalImage"
                :alt="title"
                class="news-modal-image"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              />
              <div class="news-modal-content" v-html="sanitizedContent"></div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, watch, onBeforeUnmount } from 'vue';
import DOMPurify from '@/utils/dompurify.js';
import { getOverviewModalImage } from '../utils/image.js';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  base: { type: Object, default: null },
  detail: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['close', 'retry']);

const NEWS_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span', 'b', 'i', 'u'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
};

const title = computed(() => props.detail?.title || props.base?.title || '新闻详情');

const modalImage = computed(() => {
  const raw = props.detail?.image || props.base?.image || '';
  return raw ? getOverviewModalImage(raw) : '';
});

const sanitizedContent = computed(() => {
  const raw = props.detail?.content || '';
  if (!raw) return '';
  return DOMPurify.sanitize(raw, NEWS_SANITIZE_OPTIONS);
});

const metaText = computed(() => {
  const parts = [];
  const date = props.detail?.date;
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      parts.push(`${parsed.getFullYear()}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}`);
    }
  }
  const author = props.detail?.author || props.base?.author;
  if (author) parts.push(`作者：${author}`);
  const category = props.detail?.category || props.base?.category;
  if (category) {
    const names = { event: '活动公告', update: '更新日志', community: '社区动态', announce: '官方通知' };
    const label = names[category];
    if (label) parts.push(label);
  }
  return parts.join(' · ');
});

const handleKeydown = (event) => {
  if (event.key === 'Escape' && props.isOpen) {
    emit('close');
  }
};

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeydown);
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
    }
  }
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
@import '../styles/news-modal.css';
</style>
