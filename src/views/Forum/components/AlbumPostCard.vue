<script setup>
/**
 * AlbumPostCard.vue — 影集帖的信息流卡片（换肤形态）
 *
 * 与 PostCard.vue **并列**而不是改造它：PostCard 承载了虚拟列表、展开评论、
 * 回复框、胶片条懒加载等一整套状态，往里塞第二种版式会把这些路径全部置于风险中。
 * 分派发生在 ForumMain 的列表里（`isAlbumPost(post)` 单一判据）。
 *
 * 版式要点（2026-11-16 二次定稿，视觉稿见 docs/demos/album-cloud4.html）：
 * · **黑框白底**：纯白卡 + 1.5px 墨色边框，像一张冲印出来的照片卡 ——
 *   信息流里的玻璃圆角卡全是浅灰浮层，只有它是一张「有边的白纸」，
 *   一眼就能分出「这是一篇图文」；
 * · **一张卡 = 一篇 = 一次发布**；篇内可以有 1..10 张照片，卡片只露第一张，
 *   底部写「共 N 张照片 · 查看」（2026-11-15 用户纠正：篇不指单张照片）；
 * · **照片不裁切**（`height:auto`）。用户真实素材多为 3:4 竖构图，
 *   沿用信息流的 3:2 + cover 会切掉近一半——这是素材事实，不是样式偏好。
 * · 横屏（≥1024×600）改成图/文左右分栏，避免一张竖图把整屏撑满。
 */
import { computed } from 'vue';
import { Heart, MessageCircle, Bookmark } from 'lucide-vue-next';
import {
  ALBUM_FONT_STACK,
  getAlbumEntry,
  getAlbumPhotoCount,
  isAlbumPost,
} from '@/utils/forum-album.js';
import { formatSmartTime } from '@/utils/time.js';
import { getAvatarUrl } from '@/utils/avatar.js';

const props = defineProps({
  post: { type: Object, required: true },
  isLoggedIn: { type: Boolean, default: false },
});

const emit = defineEmits(['open', 'like']);

const photoCount = computed(() => getAlbumPhotoCount(props.post));
const first = computed(() => getAlbumEntry(props.post, 0));
const images = computed(() => {
  const list = props.post?.images || props.post?.forum_post_images || [];
  return Array.isArray(list) ? list : [];
});
const coverUrl = computed(() => {
  const img = images.value[0];
  return img?.detailUrl || img?.originalUrl || img?.url || props.post?.cover_image_url || '';
});
const coverRatio = computed(() => {
  const img = images.value[0];
  const w = Number(img?.width) || 0;
  const h = Number(img?.height) || 0;
  return w > 0 && h > 0 ? `${w} / ${h}` : '3 / 4';
});
const authorName = computed(() =>
  String(props.post?.author_username || props.post?.author?.username || '').trim(),
);
const avatarSrc = computed(() => getAvatarUrl(props.post?.author?.avatar_url || ''));
const likeCount = computed(() => Number(props.post?.likes_count ?? props.post?.likesCount ?? 0));
const commentCount = computed(() =>
  Number(props.post?.comment_count ?? props.post?.commentsCount ?? 0),
);
const timeText = computed(() => formatSmartTime(props.post?.created_at || props.post?.createdAt));
const liked = computed(() => Boolean(props.post?.liked_by_me || props.post?.is_liked));

function onOpen() {
  emit('open', props.post);
}
function onKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onOpen();
  }
}
function onLike(event) {
  event.stopPropagation();
  emit('like', props.post);
}
</script>

<template>
  <article
    v-if="isAlbumPost(post)"
    class="album-card"
    role="button"
    tabindex="0"
    :style="{ '--ap-font': ALBUM_FONT_STACK }"
    :aria-label="`查看《${post.title}》，共 ${photoCount} 张照片`"
    @click="onOpen"
    @keydown="onKeydown"
  >
    <header class="album-head">
      <h2 class="album-name">{{ post.title }}</h2>
      <span class="album-meta">{{ photoCount }} 张照片</span>
    </header>

    <div class="album-body">
      <figure class="album-figure">
        <img
          v-if="coverUrl"
          :src="coverUrl"
          :alt="first.title || post.title"
          :style="{ aspectRatio: coverRatio }"
          loading="lazy"
          decoding="async"
        />
      </figure>

      <div class="album-text">
        <div class="album-text-head">
          <h3 class="album-entry-title">{{ first.title || post.title }}</h3>
          <p v-if="first.date || first.place" class="album-when">
            <span v-if="first.date">{{ first.date }}</span>
            <span v-if="first.place">{{ first.place }}</span>
          </p>
        </div>
        <p v-if="first.body" class="album-prose">{{ first.body }}</p>
        <p v-else-if="post.body" class="album-prose">{{ post.body }}</p>
      </div>
    </div>

    <footer class="album-foot">
      <div class="album-by">
        <img v-if="avatarSrc" class="album-avatar" :src="avatarSrc" alt="" loading="lazy" />
        <span class="album-author">{{ authorName }}</span>
        <span class="album-time">{{ timeText }}</span>
      </div>
      <div class="album-acts">
        <button
          type="button"
          class="album-act"
          :class="{ 'is-liked': liked }"
          :aria-pressed="liked"
          aria-label="点赞"
          @click="onLike"
        >
          <Heart :size="15" />
          <span>{{ likeCount || '' }}</span>
        </button>
        <span class="album-act is-static">
          <MessageCircle :size="15" />
          <span>{{ commentCount || '' }}</span>
        </span>
        <span class="album-act is-static" aria-hidden="true">
          <Bookmark :size="15" />
        </span>
        <span class="album-more">共 {{ photoCount }} 张照片 · 查看</span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
/* 黑框白底（2026-11-16 用户定稿）。颜色刻意锁在组件内（不新增全局 token），
   暗色由 [data-theme='dark'] 祖先改写同一组局部变量。 */
.album-card {
  --ap-paper: #ffffff;
  --ap-frame: #141414;
  --ap-ink: #1c1b18;
  --ap-ink-2: #45433d;
  --ap-ink-3: #8c887f;
  --ap-line: rgba(28, 27, 24, 0.1);
  /* `--ap-font` 由模板注入（= utils/forum-album.js 的 ALBUM_FONT_STACK，固定宋体）；
     这里不写第二份字体名 —— 两份就会漂。 */

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 16px 14px;
  background: var(--ap-paper);
  /* 1.5px 而不是 1px：竖屏 2x 屏上 1px 的发丝线在纯白底上几乎看不见，
     而这张卡的辨识度全靠这条边（信息流其余卡片都是无边的灰浮层）。 */
  border: 1.5px solid var(--ap-frame);
  border-radius: 4px;
  color: var(--ap-ink);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.25s ease,
    transform 0.25s ease;
}
/* 边框已经是墨色了，hover 再加深看不出变化 —— 改用「抬起 1px」，
   像把卡片从桌面上拿起来一点（也与纸张的物理感一致）。 */
.album-card:hover {
  transform: translateY(-1px);
}
.album-card:focus-visible {
  outline: 2px solid var(--ap-ink);
  outline-offset: 3px;
}

/* 暗色：白底会刺眼，翻成近黑纸；黑框在深色页面上等于没有，
   所以框线反过来取浅色 —— 「框与页面有色差」这条规律比「框是黑的」更本质。 */
[data-theme='dark'] .album-card {
  --ap-paper: #171614;
  --ap-frame: rgba(241, 236, 226, 0.68);
  --ap-ink: #f1ece2;
  --ap-ink-2: #c3bcad;
  --ap-ink-3: #857f73;
  --ap-line: rgba(241, 236, 226, 0.14);
}
[data-theme='dark'] .album-card:hover {
  box-shadow: 0 0 0 1px rgba(241, 236, 226, 0.5);
}

/* ---------- 头 ---------- */
.album-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.album-name {
  margin: 0;
  font-family: var(--ap-font, serif);
  font-weight: 400;
  font-size: 15px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-meta {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ap-ink-3);
}

/* ---------- 主体 ---------- */
.album-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.album-figure {
  margin: 0;
  width: 100%;
  overflow: hidden;
  background: rgba(28, 27, 24, 0.04);
}
/* 不裁切：width 100% + 由 inline aspect-ratio 撑高，照片完整可见 */
.album-figure img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}
.album-text {
  display: grid;
  grid-template-columns: 34% 1fr;
  column-gap: 12px;
  align-items: start;
  min-width: 0;
}
.album-text-head {
  min-width: 0;
}
.album-entry-title {
  margin: 0;
  font-family: var(--ap-font, serif);
  font-weight: 400;
  font-size: 17px;
  line-height: 1.5;
  letter-spacing: 0.04em;
  word-break: break-word;
}
.album-when {
  margin: 8px 0 0;
  font-size: 10.5px;
  line-height: 1.9;
  color: var(--ap-ink-3);
  letter-spacing: 0.02em;
}
.album-when span {
  display: block;
}
.album-prose {
  margin: 0;
  min-width: 0;
  font-family: var(--ap-font, serif);
  font-size: 13px;
  line-height: 1.95;
  color: var(--ap-ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 5;
  line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}

/* ---------- 底 ---------- */
.album-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 11px;
  border-top: 1px solid var(--ap-line);
  font-size: 11px;
  color: var(--ap-ink-3);
  min-width: 0;
}
.album-by {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}
.album-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  flex: none;
}
.album-author {
  color: var(--ap-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 7em;
}
.album-time {
  flex: none;
}
.album-acts {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.album-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--ap-ink-3);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: color 0.2s ease;
}
.album-act.is-static {
  cursor: default;
}
.album-act.is-liked {
  color: #c0402f;
}
.album-act.is-liked :deep(svg) {
  fill: currentColor;
}
.album-more {
  display: none;
  letter-spacing: 0.1em;
}

/* ---------- 横屏（≥1024×600）：图左文右 ---------- */
@media (orientation: landscape) and (min-width: 1024px) and (min-height: 600px) {
  .album-body {
    flex-direction: row;
    gap: 20px;
    align-items: flex-start;
  }
  .album-figure {
    flex: 0 0 54%;
    max-width: 54%;
  }
  .album-figure img {
    max-height: 56vh;
    object-position: center top;
  }
  .album-text {
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 10px;
    min-width: 0;
  }
  .album-entry-title {
    font-size: 20px;
  }
  .album-when span {
    display: inline;
    margin-right: 0.6em;
  }
  .album-prose {
    font-size: 13.5px;
    -webkit-line-clamp: 7;
    line-clamp: 7;
  }
  .album-more {
    display: inline;
  }
}

/* ---------- 小屏 ---------- */
@media (max-width: 360px) {
  .album-text {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 8px;
  }
  .album-entry-title {
    font-size: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .album-card {
    transition: none;
  }
}
</style>
