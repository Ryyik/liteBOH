<script setup>
/**
 * AlbumReader.vue — 影集帖的「翻开」阅读层
 *
 * 与信息流卡片共用同一份数据（A 投影：帖子就是影集），不请求任何新接口。
 * 这里翻开的是**一篇**（= 一次发布）：篇内照片按顺序一张接一张竖排连读，
 * 有终点（不做无限流）——这是「册」与信息流的差别。
 *
 * 复用的是论坛既有的点赞/评论通道：
 * · 点赞 → emit('like', post)，由 ForumMain 的 handleToggleLike 落库；
 * · 评论 → emit('comment', post)，跳既有详情页（评论区、楼中楼、删除都在那边，
 *   这里不另做一套，避免两处评论逻辑漂移）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import { Bookmark, Heart, MessageCircle, X } from 'lucide-vue-next';
import { getAlbumEntry, getAlbumPhotoCount } from '@/utils/forum-album.js';
import { formatSmartTime } from '@/utils/time.js';

const props = defineProps({
  post: { type: Object, required: true },
  isLoggedIn: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'like', 'comment']);

const isOpen = ref(true);
useBodyScrollLock(isOpen, 'album-reader');

/** 篇内的逐张文字（一张照片一条，与图片同下标）。 */
const photoEntries = computed(() => {
  const total = getAlbumPhotoCount(props.post);
  return Array.from({ length: total }, (_, i) => getAlbumEntry(props.post, i));
});
const photoCount = computed(() => photoEntries.value.length);
const images = computed(() => {
  const list = props.post?.images || props.post?.forum_post_images || [];
  return Array.isArray(list) ? list : [];
});
const likeCount = computed(() => Number(props.post?.likes_count ?? props.post?.likesCount ?? 0));
const commentCount = computed(() =>
  Number(props.post?.comment_count ?? props.post?.commentsCount ?? 0),
);
const liked = computed(() => Boolean(props.post?.liked_by_me || props.post?.is_liked));
const timeText = computed(() => formatSmartTime(props.post?.created_at || props.post?.createdAt));

function imageFor(index) {
  const img = images.value[index] || images.value[0];
  return img?.detailUrl || img?.originalUrl || img?.url || '';
}
function ratioFor(index) {
  const img = images.value[index];
  const w = Number(img?.width) || 0;
  const h = Number(img?.height) || 0;
  return w > 0 && h > 0 ? `${w} / ${h}` : '3 / 4';
}

function close() {
  isOpen.value = false;
  emit('close');
}
function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    close();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  isOpen.value = false;
});
</script>

<template>
  <Teleport to="body">
    <div class="album-reader" role="dialog" aria-modal="true" :aria-label="`影集《${post.title}》`">
      <header class="album-reader-bar">
        <button type="button" class="album-reader-back" aria-label="返回" @click="close">
          <X :size="18" />
          <span>返回</span>
        </button>
        <div class="album-reader-title">{{ post.title }}</div>
        <div class="album-reader-count">{{ photoCount }} 张照片</div>
      </header>

      <div class="album-reader-scroll">
        <article class="album-sheet">
          <p class="album-sheet-kicker">
            <span>{{ post.title }}</span>
            <span>·</span>
            <span>{{ photoCount }} 张照片</span>
            <span>·</span>
            <span>{{ timeText }}</span>
          </p>

          <p v-if="post.body" class="album-preface">
            <span class="album-preface-label">卷首</span>{{ post.body }}
          </p>

          <section v-for="(entry, index) in photoEntries" :key="index" class="album-entry">
            <figure v-if="imageFor(index)" class="album-entry-photo">
              <img
                :src="imageFor(index)"
                :alt="entry.title || `第 ${index + 1} 张`"
                :style="{ aspectRatio: ratioFor(index) }"
                :loading="index === 0 ? 'eager' : 'lazy'"
                decoding="async"
              />
            </figure>
            <div class="album-entry-text">
              <div class="album-entry-head">
                <h2 class="album-entry-title">{{ entry.title }}</h2>
                <p v-if="entry.date || entry.place" class="album-entry-when">
                  <span v-if="entry.date">{{ entry.date }}</span>
                  <span v-if="entry.place">{{ entry.place }}</span>
                </p>
              </div>
              <p v-if="entry.body" class="album-entry-prose">{{ entry.body }}</p>
            </div>
          </section>

          <p class="album-end">— {{ post.title }} · {{ photoCount }} 张照片 —</p>
        </article>
      </div>

      <footer class="album-reader-dock">
        <button
          type="button"
          class="album-dock-act"
          :class="{ 'is-liked': liked }"
          :aria-pressed="liked"
          @click="emit('like', post)"
        >
          <Heart :size="17" />
          <span>{{ likeCount || '赞' }}</span>
        </button>
        <button type="button" class="album-dock-act" @click="emit('comment', post)">
          <MessageCircle :size="17" />
          <span>{{ commentCount || '评论' }}</span>
        </button>
        <span class="album-dock-act is-static" aria-hidden="true">
          <Bookmark :size="17" />
        </span>
        <button type="button" class="album-dock-write" @click="emit('comment', post)">
          说点什么…
        </button>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.album-reader {
  --ap-paper: #f7f5f0;
  --ap-sheet: #fffdf9;
  --ap-ink: #1c1b18;
  --ap-ink-2: #45433d;
  --ap-ink-3: #8c887f;
  --ap-line: rgba(28, 27, 24, 0.1);
  --ap-serif: 'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', STSong, SimSun, serif;

  position: fixed;
  inset: 0;
  z-index: 100010;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--ap-paper);
  color: var(--ap-ink);
  animation: album-reader-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) both;
}
@keyframes album-reader-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
[data-theme='dark'] .album-reader {
  --ap-paper: #0d0d0c;
  --ap-sheet: #171614;
  --ap-ink: #f1ece2;
  --ap-ink-2: #c3bcad;
  --ap-ink-3: #857f73;
  --ap-line: rgba(241, 236, 226, 0.14);
}

/* ---------- 顶栏 ---------- */
.album-reader-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ap-line);
  background: color-mix(in srgb, var(--ap-paper) 92%, transparent);
  /* 材质走 tokens 的 --liquid-filter-reader 单源（值与本处原写的 14px/140% 一致）。
     裸写 blur() 会被 check:liquid-glass 判成「第二份材质定义」—— 全站模糊级玻璃
     只允许在 tokens 里定义一次，否则「改一处全站生效」这个前提就不成立了。 */
  backdrop-filter: var(--liquid-filter-reader);
  -webkit-backdrop-filter: var(--liquid-filter-reader);
}
.album-reader-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-self: start;
  background: none;
  border: 0;
  padding: 6px 4px;
  color: var(--ap-ink-2);
  font-size: 12px;
  cursor: pointer;
}
.album-reader-title {
  font-family: var(--ap-serif);
  font-size: 13.5px;
  letter-spacing: 0.14em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 52vw;
}
.album-reader-count {
  justify-self: end;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ap-ink-3);
}

/* ---------- 正文 ---------- */
.album-reader-scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 90px;
}
.album-sheet {
  max-width: 620px;
  margin: 0 auto;
  padding: 22px 18px 8px;
  background: var(--ap-sheet);
  border-left: 1px solid var(--ap-line);
  border-right: 1px solid var(--ap-line);
  min-height: 100%;
}
.album-sheet-kicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ap-ink-3);
}
.album-preface {
  margin: 0 0 28px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--ap-line);
  font-family: var(--ap-serif);
  font-size: 13.5px;
  line-height: 2;
  color: var(--ap-ink-2);
  white-space: pre-line;
}
.album-preface-label {
  display: block;
  margin-bottom: 8px;
  font-size: 9.5px;
  letter-spacing: 0.24em;
  color: var(--ap-ink-3);
}

.album-entry + .album-entry {
  margin-top: 60px;
}
.album-entry-photo {
  margin: 0;
  background: rgba(28, 27, 24, 0.05);
}
/* 不裁切：由 inline aspect-ratio 决定高度 */
.album-entry-photo img {
  display: block;
  width: 100%;
  height: auto;
}
.album-entry-text {
  display: grid;
  grid-template-columns: 30% 1fr;
  column-gap: 14px;
  align-items: start;
  margin-top: 16px;
  min-width: 0;
}
.album-entry-head {
  min-width: 0;
}
.album-entry-title {
  margin: 0;
  font-family: var(--ap-serif);
  font-weight: 400;
  font-size: 19px;
  line-height: 1.45;
  letter-spacing: 0.04em;
  word-break: break-word;
}
.album-entry-when {
  margin: 9px 0 0;
  font-size: 10.5px;
  line-height: 1.9;
  color: var(--ap-ink-3);
  letter-spacing: 0.02em;
}
.album-entry-when span {
  display: block;
}
.album-entry-prose {
  margin: 0;
  min-width: 0;
  font-family: var(--ap-serif);
  font-size: 14px;
  line-height: 2;
  color: var(--ap-ink-2);
  white-space: pre-line;
}
.album-end {
  margin: 56px 0 18px;
  text-align: center;
  font-family: var(--ap-serif);
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--ap-ink-3);
}

/* ---------- 底栏 ---------- */
.album-reader-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px calc(9px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--ap-paper) 94%, transparent);
  backdrop-filter: var(--liquid-filter-reader);
  -webkit-backdrop-filter: var(--liquid-filter-reader);
  border-top: 1px solid var(--ap-line);
}
.album-dock-act {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: 0;
  padding: 0;
  font-size: 11.5px;
  color: var(--ap-ink-3);
  cursor: pointer;
}
.album-dock-act.is-static {
  cursor: default;
}
.album-dock-act.is-liked {
  color: #c0402f;
}
.album-dock-act.is-liked :deep(svg) {
  fill: currentColor;
}
.album-dock-write {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--ap-line);
  padding: 6px 0;
  font-size: 12.5px;
  color: var(--ap-ink-3);
  cursor: pointer;
}

/* ---------- 横屏：图片限高、正文两栏 ---------- */
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .album-sheet {
    max-width: 760px;
    padding: 28px 26px 8px;
  }
  .album-reader-scroll {
    padding-bottom: 76px;
  }
  .album-entry-photo {
    display: flex;
    justify-content: center;
  }
  .album-entry-photo img {
    width: auto;
    max-width: 100%;
    max-height: 66vh;
  }
  .album-entry-title {
    font-size: 24px;
  }
  .album-entry-prose {
    font-size: 15px;
  }
  .album-entry + .album-entry {
    margin-top: 80px;
  }
}

@media (max-width: 380px) {
  .album-sheet {
    padding: 18px 14px 8px;
  }
  .album-entry-text {
    grid-template-columns: 34% 1fr;
    column-gap: 10px;
  }
  .album-entry-title {
    font-size: 17px;
  }
  .album-entry-prose {
    font-size: 13.2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .album-reader {
    animation: none;
  }
}
</style>
