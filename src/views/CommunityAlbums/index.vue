<template>
  <div class="community-albums-page">
    <main class="ca-main">
      <header class="ca-header">
        <div class="ca-heading">
          <span class="ca-kicker"
            ><Camera :size="14" :stroke-width="2.2" aria-hidden="true" /> COMMUNITY ALBUMS</span
          >
          <h1>社区影集</h1>
          <p>居民们亲手装帧的影集，翻开就是一段一段被认真整理过的时光。</p>
        </div>
        <RouterLink v-if="isLoggedIn" to="/user-space/albums" class="ca-mine-btn">
          <BookOpen :size="15" :stroke-width="2.2" aria-hidden="true" />
          做我的影集
        </RouterLink>
      </header>

      <section v-if="selectedAuthor" class="ca-reader">
        <button type="button" class="ca-btn ghost ca-back" @click="closeAuthor">
          ← 返回全部影集
        </button>
        <MyAlbumBook :author-id="selectedAuthor" />
      </section>

      <section v-else-if="isLoading" class="ca-grid" aria-hidden="true">
        <article v-for="item in 6" :key="item" class="ca-card skeleton">
          <div class="ca-cover skeleton-block"></div>
          <div class="ca-card-body">
            <div class="skeleton-block line"></div>
            <div class="skeleton-block line short"></div>
          </div>
        </article>
      </section>

      <section v-else-if="loadError" class="ca-empty">
        <h2>影集加载失败</h2>
        <p>{{ loadError }}</p>
        <button type="button" class="ca-btn ghost" @click="loadAlbums">重试</button>
      </section>

      <section v-else-if="!albums.length" class="ca-empty">
        <span class="ca-empty-icon"
          ><Camera :size="30" :stroke-width="1.6" aria-hidden="true"
        /></span>
        <h2>还没有人分享影集</h2>
        <p>第一本被装帧好的影集，会出现在这里。</p>
        <RouterLink v-if="isLoggedIn" to="/user-space/albums" class="ca-btn primary"
          >去做一本影集</RouterLink
        >
      </section>

      <!-- 2026-11-04 硬切审计：骨架⇄社区影集网格补内容侧淡入 -->
      <template v-else>
        <section class="ca-grid content-swap-in">
          <article v-for="album in albums" :key="album.id" class="ca-card">
            <button
              type="button"
              class="ca-cover ca-cover-btn"
              :aria-label="`翻开 ${album.authorName} 的影集`"
              @click="openAuthor(album)"
            >
              <img
                v-if="album.coverUrl"
                :src="album.coverUrl"
                :alt="album.title"
                loading="lazy"
                decoding="async"
                :class="{ 'is-loading': !isImageLoaded(`ca-${album.id}`) }"
                @load="markImageLoaded(`ca-${album.id}`)"
                @error="onCoverError(album, $event)"
              />
              <span v-else class="ca-cover-placeholder"
                ><Camera :size="26" :stroke-width="1.6" aria-hidden="true"
              /></span>
              <span class="ca-photo-count"
                ><Images :size="12" :stroke-width="2.2" aria-hidden="true" />
                {{ album.photoCount }}</span
              >
            </button>
            <div class="ca-card-body">
              <h2>{{ album.title }}</h2>
              <p v-if="album.subtitle" class="ca-subtitle">{{ album.subtitle }}</p>
              <div class="ca-meta">
                <span class="ca-author">
                  <img
                    v-if="album.authorAvatar"
                    :src="album.authorAvatar"
                    :alt="album.authorName"
                    loading="lazy"
                    @error="onAvatarError(album, $event)"
                  />
                  <span v-else class="ca-avatar-fallback">{{
                    (album.authorName || '居').charAt(0).toUpperCase()
                  }}</span>
                  {{ album.authorName || '方块居民' }}
                </span>
                <span>{{ formatTime(album.updatedAt) }}</span>
              </div>
            </div>
          </article>
        </section>

        <div v-if="hasMore" class="ca-more">
          <button type="button" class="ca-btn ghost" :disabled="isLoadingMore" @click="loadMore">
            {{ isLoadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useImageLoaded } from '@/composables/useImageLoaded.js';
import { Camera, Images, BookOpen } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { getPosts } from '@/utils/api/forum-api.js';
import MyAlbumBook from '@/views/Forum/components/MyAlbumBook.vue';

/* 一次拉多少条影集帖用于聚合（一人一本 ⇒ 24 条可能只聚出几本，给到 60） */
const FEED_LIMIT = 60;

const authStore = useAuthStore();
const isLoggedIn = computed(() => Boolean(authStore?.isLoggedIn));

const albums = ref([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const loadError = ref('');
const hasMore = ref(false);

function formatTime(value) {
  const t = Date.parse(value || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/* 封面淡入记账（2026-11-04 硬切审计 P0-4，机制单源 useImageLoaded） */
const { isImageLoaded, markImageLoaded } = useImageLoaded();

function onCoverError(album, event) {
  if (event?.target) event.target.style.display = 'none';
  album.coverUrl = '';
}

function onAvatarError(album, event) {
  if (event?.target) event.target.style.display = 'none';
  album.authorAvatar = '';
}

/* 翻开某人的那本（就地切换，不跳路由 —— 影集是帖子，没有独立的书 id） */
const selectedAuthor = ref('');

/**
 * 「社区影集」= 按作者聚合的影集帖（**一人一本**）。
 * 不再是 photo_albums 里那些 published+shared 的册子：影集已并入帖子形态（A 投影），
 * 一本书 = 某个作者的全部 `is_album` 帖子。所以这里只做「按 author_id 分组」，
 * 封面/标题/时间取该作者最新的一帖。
 */
function aggregateByAuthor(rows) {
  const byAuthor = new Map();
  for (const post of rows) {
    const key = String(post?.author_id || '');
    if (!key) continue;
    const frames = Array.isArray(post?.album_entries) ? post.album_entries.length : 0;
    const imgs = Array.isArray(post?.images) ? post.images : [];
    const cover =
      imgs[0]?.detailUrl || imgs[0]?.originalUrl || imgs[0]?.url || post?.cover_image_url || '';
    const authorName = String(post?.author_username || post?.author?.username || '').trim();
    const existing = byAuthor.get(key);
    if (existing) {
      existing.photoCount += frames;
      existing.postCount += 1;
      if (cover && !existing.coverUrl) existing.coverUrl = cover;
      continue;
    }
    byAuthor.set(key, {
      id: key,
      title: String(post?.title || '').trim() || '未命名影集',
      subtitle: '',
      coverUrl: cover,
      photoCount: frames,
      postCount: 1,
      authorName: authorName || '方块居民',
      authorAvatar: post?.author?.avatar_url || '',
      updatedAt: post?.created_at,
    });
  }
  return [...byAuthor.values()];
}

async function loadAlbums() {
  isLoading.value = true;
  loadError.value = '';
  const result = await getPosts(null, { page: 1, pageSize: FEED_LIMIT, albumOnly: true });
  if (result?.error) {
    loadError.value = '读取社区影集失败';
    albums.value = [];
  } else {
    albums.value = aggregateByAuthor(Array.isArray(result?.data) ? result.data : []);
  }
  hasMore.value = false;
  isLoading.value = false;
}

function loadMore() {
  hasMore.value = false;
}

function openAuthor(album) {
  selectedAuthor.value = album?.id || '';
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeAuthor() {
  selectedAuthor.value = '';
}

onMounted(loadAlbums);
</script>

<style scoped>
.community-albums-page {
  min-height: 100vh;
  background: var(--boh-page-bg, #f4f4f6);
  color: var(--text-primary, #1d1d1f);
}

.ca-main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 32px 20px 80px;
}

.ca-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ca-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-tertiary, #86868b);
}

.ca-header h1 {
  margin: 6px 0 4px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.ca-header p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
}

.ca-mine-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--brand, #0a84ff);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.15s ease;
}

.ca-mine-btn:hover {
  transform: translateY(-1px);
}

.ca-grid {
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}

.ca-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-primary, #fff);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.ca-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.1);
}

.ca-cover {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  background: var(--surface-secondary, #f2f2f7);
  overflow: hidden;
}

/* 封面从 RouterLink 换成 button（一人一本后没有「书 id」，翻开是就地切视图，不是跳路由） */
.ca-cover-btn {
  width: 100%;
  border: 0;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ca-cover-btn:focus-visible {
  outline: 2px solid var(--liquid-accent, #0071e3);
  outline-offset: 3px;
}

.ca-reader {
  margin-top: 24px;
}

.ca-back {
  margin-bottom: 16px;
}

.ca-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition:
    transform 0.3s ease,
    opacity 260ms var(--ease-out, ease);
}

/* 封面淡入（2026-11-04 硬切审计 P0-4）：记账开关在 useImageLoaded */
.ca-cover img.is-loading {
  opacity: 0;
}

.ca-card:hover .ca-cover img {
  transform: scale(1.04);
}

.ca-cover-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary, #c7c7cc);
}

.ca-photo-count {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
}

.ca-card-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.ca-card-body h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ca-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary, #515154);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ca-meta {
  margin-top: auto;
  padding-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
}

.ca-author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ca-author img {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.ca-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--surface-secondary, #e5e5ea);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary, #515154);
  flex-shrink: 0;
}

.ca-more {
  margin-top: 28px;
  text-align: center;
}

.ca-empty {
  margin-top: 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.ca-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: var(--surface-primary, #fff);
  color: var(--text-tertiary, #86868b);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.ca-empty h2 {
  margin: 4px 0 0;
  font-size: 20px;
}
.ca-empty p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
}

.ca-btn {
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.ca-btn:hover {
  opacity: 0.85;
}
.ca-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.ca-btn.primary {
  border: 0;
  background: var(--brand, #0a84ff);
  color: #fff;
}

.ca-btn.ghost {
  border: 1px solid var(--border-color, #d1d1d6);
  background: var(--surface-primary, #fff);
  color: var(--text-primary, #1d1d1f);
}

/* 骨架 */
.skeleton-block {
  background: linear-gradient(90deg, #ececec 25%, #f6f6f6 50%, #ececec 75%);
  background-size: 200% 100%;
  animation: ca-shimmer 1.4s ease infinite;
  border-radius: 8px;
}

.ca-card.skeleton .ca-cover {
  border-radius: 0;
}
.ca-card.skeleton .line {
  height: 14px;
  margin: 4px 0;
}
.ca-card.skeleton .line.short {
  width: 55%;
}

@keyframes ca-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (max-width: 640px) {
  .ca-main {
    padding: 20px 14px 64px;
  }
  .ca-header h1 {
    font-size: 24px;
  }
  .ca-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .ca-subtitle {
    display: none;
  }
}
</style>
