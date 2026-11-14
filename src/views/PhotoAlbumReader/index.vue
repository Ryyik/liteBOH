<template>
  <div class="album-reader">
    <main class="ar-main">
      <!-- 顶栏 -->
      <header v-if="bundle" class="ar-topbar">
        <div class="ar-topbar-left">
          <RouterLink v-if="isOwner || isDemo" to="/user-space/albums" class="ar-back">
            <ArrowLeft :size="16" :stroke-width="2.2" aria-hidden="true" />
            <span>我的影集</span>
          </RouterLink>
          <RouterLink v-else to="/albums" class="ar-back">
            <ArrowLeft :size="16" :stroke-width="2.2" aria-hidden="true" />
            <span>社区影集</span>
          </RouterLink>
        </div>
        <div class="ar-topbar-title">
          <h1>{{ bundle.album.title }}<span v-if="isDemo" class="ar-demo-badge">DEMO</span></h1>
          <span v-if="!isOwner && bundle.album.authorName">by {{ bundle.album.authorName }}</span>
        </div>
        <div class="ar-topbar-actions">
          <button v-if="isOwner" type="button" class="ar-top-btn" @click="goEditor">
            <Pencil :size="14" :stroke-width="2.2" aria-hidden="true" />
            编辑
          </button>
          <button
            type="button"
            class="ar-top-btn"
            :aria-expanded="showToc"
            @click="showToc = !showToc"
          >
            <List :size="14" :stroke-width="2.2" aria-hidden="true" />
            目录
          </button>
        </div>
      </header>

      <!-- 草稿提示（仅作者可见） -->
      <div v-if="bundle && isOwner && bundle.album.status !== 'published'" class="ar-draft-banner">
        草稿预览：仅自己可见，分享到社区后其他人才能翻开这本影集。
      </div>

      <!-- 加载中 -->
      <section v-if="isLoading" class="ar-state" aria-hidden="true">
        <div class="ar-skeleton-page skeleton-block"></div>
      </section>

      <!-- 加载失败 / 不存在 -->
      <section v-else-if="loadError || !bundle" class="ar-state">
        <span class="ar-state-icon"
          ><CameraOff :size="28" :stroke-width="1.6" aria-hidden="true"
        /></span>
        <h2>{{ loadError || '影集不存在' }}</h2>
        <p>它可能已被作者删除，或尚未公开分享。</p>
        <div class="ar-state-actions">
          <button type="button" class="ar-btn ghost" @click="loadAlbum">重试</button>
          <RouterLink class="ar-btn primary" to="/albums">去社区影集区逛逛</RouterLink>
        </div>
      </section>

      <template v-else>
        <!-- 单页笔记舞台：一屏一页，页面自身内部滚动 -->
        <section
          class="ar-stage content-swap-in-fade"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <button
            v-if="canGoPrev"
            type="button"
            class="ar-page-nav prev"
            aria-label="上一页"
            @click="prevPage"
          >
            <ChevronLeft :size="20" :stroke-width="2.2" aria-hidden="true" />
          </button>

          <Transition name="ar-turn" mode="out-in">
            <article :key="currentIndex" class="ar-page-scroll">
              <AlbumPageSheet :page="currentPage" :album="bundle.album" :photos="bundle.photos" />
            </article>
          </Transition>

          <button
            v-if="canGoNext"
            type="button"
            class="ar-page-nav next"
            aria-label="下一页"
            @click="nextPage"
          >
            <ChevronRight :size="20" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </section>

        <!-- 底栏：进度 + 页码 -->
        <footer v-if="totalPages > 0" class="ar-footer">
          <span class="ar-footer-chapter">{{ currentChapterLabel }}</span>
          <div class="ar-progress" aria-hidden="true">
            <div class="ar-progress-fill" :style="{ width: progressPercent }"></div>
          </div>
          <span class="ar-footer-page">{{ currentIndex + 1 }} / {{ totalPages }}</span>
        </footer>

        <!-- 章节目录抽屉 -->
        <Transition name="ar-toc">
          <div v-if="showToc" class="ar-toc-overlay" @click.self="showToc = false">
            <aside class="ar-toc" role="dialog" aria-label="影集目录">
              <header class="ar-toc-head">
                <h3>目录</h3>
                <button
                  type="button"
                  class="ar-toc-close"
                  aria-label="关闭目录"
                  @click="showToc = false"
                >
                  <X :size="16" :stroke-width="2.2" aria-hidden="true" />
                </button>
              </header>
              <ul class="ar-toc-list">
                <li v-for="(entry, index) in tocEntries" :key="`${entry.pageIndex}-${index}`">
                  <button
                    type="button"
                    :class="{ active: entry.pageIndex === currentIndex }"
                    @click="jumpTo(entry.pageIndex)"
                  >
                    <span class="ar-toc-label">
                      <em>{{ entry.typeLabel }}</em>
                      {{ entry.title }}
                    </span>
                    <span class="ar-toc-page">{{ entry.pageIndex + 1 }}</span>
                  </button>
                </li>
              </ul>
            </aside>
          </div>
        </Transition>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, CameraOff, ChevronLeft, ChevronRight, List, Pencil, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { getPublicAlbum } from '@/utils/api/photo-albums-api.js';
import { buildDemoAlbumBundle } from '@/utils/photo-albums/demo-album.js';
import AlbumPageSheet from '@/components/PhotoAlbums/AlbumPageSheet.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const bundle = ref(null);
const isLoading = ref(true);
const loadError = ref('');

/** 页指针：单页阅读，一页一屏 */
const currentIndex = ref(0);
const showToc = ref(false);

let touchStartX = 0;
let touchStartY = 0;

const isDemo = computed(() => String(route.params.id) === 'demo');
const isOwner = computed(() =>
  Boolean(
    authStore?.isLoggedIn &&
    authStore?.userInfo?.id &&
    bundle.value?.album?.userId === authStore.userInfo.id,
  ),
);

const pages = computed(() => bundle.value?.pages || []);
const totalPages = computed(() => pages.value.length);
const currentPage = computed(() => pages.value[currentIndex.value] || null);

const canGoPrev = computed(() => currentIndex.value > 0);
const canGoNext = computed(() => currentIndex.value < totalPages.value - 1);

const progressPercent = computed(() =>
  totalPages.value <= 1
    ? '100%'
    : `${Math.round((currentIndex.value / (totalPages.value - 1)) * 100)}%`,
);

const currentChapterLabel = computed(() => {
  if (!currentPage.value) return '';
  if (currentPage.value.pageType === 'cover') return '封面';
  if (currentPage.value.pageType === 'end') return '尾声';
  if (currentPage.value.pageType === 'chapter') return currentPage.value.chapterTitle || '章节';
  for (let i = currentIndex.value; i >= 0; i -= 1) {
    const page = pages.value[i];
    if (page?.pageType === 'chapter' && page.chapterTitle) return page.chapterTitle;
  }
  return '正文';
});

/** 目录条目：封面 / 章节页 / 尾页 */
const tocEntries = computed(() => {
  const entries = [];
  pages.value.forEach((page, index) => {
    if (page.pageType === 'cover') {
      entries.push({
        pageIndex: index,
        typeLabel: '封面',
        title: bundle.value?.album?.title || '封面',
      });
    } else if (page.pageType === 'chapter') {
      entries.push({
        pageIndex: index,
        typeLabel: `第 ${entries.length} 章`,
        title: page.chapterTitle || '未命名章节',
      });
    } else if (page.pageType === 'end') {
      entries.push({ pageIndex: index, typeLabel: '尾声', title: page.note || '感谢翻阅' });
    }
  });
  return entries;
});

async function loadAlbum() {
  // 示例影集：纯前端静态数据，不查库、不占配额（列表页「查看 Demo」入口）
  if (isDemo.value) {
    bundle.value = buildDemoAlbumBundle();
    currentIndex.value = 0;
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  loadError.value = '';
  const result = await getPublicAlbum(route.params.id);
  if (result.ok && result.data?.album) {
    bundle.value = result.data;
    currentIndex.value = 0;
  } else {
    bundle.value = null;
    loadError.value = result.error || '影集不存在或尚未公开';
  }
  isLoading.value = false;
}

function prevPage() {
  if (currentIndex.value > 0) currentIndex.value -= 1;
}

function nextPage() {
  if (currentIndex.value < totalPages.value - 1) currentIndex.value += 1;
}

function jumpTo(pageIndex) {
  currentIndex.value = Math.max(0, Math.min(totalPages.value - 1, pageIndex));
  showToc.value = false;
}

function goEditor() {
  router.push(`/studio/albums/${bundle.value?.album?.id}`);
}

function onTouchStart(event) {
  const touch = event.touches?.[0];
  if (!touch) return;
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function onTouchEnd(event) {
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
  if (deltaX < 0) nextPage();
  else prevPage();
}

function onKeydown(event) {
  if (event.key === 'ArrowLeft') prevPage();
  else if (event.key === 'ArrowRight') nextPage();
  else if (event.key === 'Escape') showToc.value = false;
}

onMounted(() => {
  loadAlbum();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.album-reader {
  /* 全屏阅读：纸面就是视口，页面自身不滚动（每页内部滚动） */
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #1a1a1a;
  /* 导航已收成左上角迷你球（52px，fixed 14,14）：顶栏只需少量避让 + 左端让位 */
  --ar-nav-safe: 20px;
  --ar-orb: 52px;
}

.ar-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* ---------- 顶栏（悬浮） ---------- */
.ar-topbar {
  position: absolute;
  top: var(--ar-nav-safe);
  left: 0;
  right: 0;
  z-index: 5;
  padding: 0 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  pointer-events: none;
}

.ar-topbar a,
.ar-topbar button {
  pointer-events: auto;
}

.ar-topbar-left {
  flex: 1;
  min-width: 0;
  /* 左上角让位给导航迷你球（fixed 14,14 / 52px），返回按钮顺延其后 */
  padding-left: calc(var(--ar-orb, 52px) + 6px);
}

.ar-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.045);
  color: #4a4a4a;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.ar-back:hover {
  color: #1a1a1a;
  background: rgba(0, 0, 0, 0.075);
}

.ar-topbar-title {
  flex: 2;
  min-width: 0;
  text-align: center;
}

.ar-topbar-title h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1a1a1a;
}

.ar-topbar-title > span {
  font-size: 12px;
  color: #8a8a8a;
}

.ar-demo-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  vertical-align: 2px;
  color: #1a1a1a;
  background: rgba(0, 0, 0, 0.06);
}

.ar-topbar-actions {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ar-top-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.045);
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}

.ar-top-btn:hover {
  background: rgba(0, 0, 0, 0.075);
}

.ar-draft-banner {
  position: absolute;
  top: calc(var(--ar-nav-safe) + 54px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  margin: 0;
  padding: 8px 16px;
  border-radius: 12px;
  background: rgba(255, 159, 10, 0.14);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #b25000;
  font-size: 13px;
  text-align: center;
  white-space: nowrap;
}

/* ---------- 状态页（悬浮全屏） ---------- */
.ar-state {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 20px;
  text-align: center;
}

.ar-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 22px;
  background: #f5f5f6;
  color: #86868b;
}

.ar-state h2 {
  margin: 6px 0 0;
  font-size: 20px;
}

.ar-state p {
  margin: 0;
  font-size: 14px;
  color: #515154;
}

.ar-state-actions {
  margin-top: 10px;
  display: flex;
  gap: 10px;
}

.ar-btn {
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.ar-btn:hover {
  opacity: 0.85;
}

.ar-btn.primary {
  border: 0;
  background: #1a1a1a;
  color: #fff;
}

.ar-btn.ghost {
  border: 1px solid #d1d1d6;
  background: #fff;
  color: #1a1a1a;
}

.ar-skeleton-page {
  width: min(760px, 100%);
  aspect-ratio: 3 / 4;
  border-radius: 14px;
}

/* ---------- 单页笔记舞台 ---------- */
.ar-stage {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
}

/* 纸面：居中单栏，超长页在纸内纵向滚动 */
.ar-page-scroll {
  width: min(760px, 100%);
  height: 100%;
  /* height:100% + padding-top 在 content-box 下会恒溢出 54px ⇒ 永远挂一条空滚动条 */
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #fff;
  /* 顶栏避让已在 padding-top 里，滚动条本身不需要露出来 */
  scrollbar-width: none;
  -ms-overflow-style: none;
  /* 顶部避让悬浮顶栏（返回/目录按钮） */
  padding-top: 54px;
}

.ar-page-scroll::-webkit-scrollbar {
  display: none;
}

/* ---------- 翻页按钮 ---------- */
.ar-page-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: rgba(26, 26, 26, 0.42);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.15s ease;
}

.ar-page-nav:hover {
  background: rgba(26, 26, 26, 0.68);
}

.ar-page-nav.prev {
  left: 6px;
}

.ar-page-nav.next {
  right: 6px;
}

/* ---------- 翻页动画（离场纯 opacity，避免 3D 合成层残留） ---------- */
.ar-turn-enter-active {
  transition:
    transform 0.26s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.22s ease;
}
.ar-turn-leave-active {
  transition: opacity 0.16s ease;
}
.ar-turn-enter-from {
  transform: translateY(8px);
  opacity: 0;
}
.ar-turn-leave-to {
  opacity: 0;
}

/* ---------- 底栏（悬浮） ---------- */
.ar-footer {
  position: absolute;
  bottom: 10px;
  left: 0;
  right: 0;
  z-index: 5;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: #8a8a8a;
  pointer-events: none;
}

.ar-footer > * {
  pointer-events: auto;
}

.ar-footer-chapter {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ar-progress {
  width: min(260px, 40%);
  height: 2px;
  border-radius: 999px;
  background: #ededed;
  overflow: hidden;
}

.ar-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: #1a1a1a;
  transition: width 0.25s ease;
}

.ar-footer-page {
  flex: 1;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ---------- 目录抽屉 ---------- */
.ar-toc-overlay {
  position: fixed;
  inset: 0;
  z-index: 210;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}

.ar-toc {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(320px, 86vw);
  background: #fff;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

.ar-toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 10px;
}

.ar-toc-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.ar-toc-close {
  display: inline-flex;
  padding: 6px;
  border: 0;
  border-radius: 999px;
  background: #f2f2f7;
  color: #515154;
  cursor: pointer;
}

.ar-toc-list {
  list-style: none;
  margin: 0;
  padding: 6px 12px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ar-toc-list button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #1a1a1a;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ar-toc-list button:hover {
  background: #f5f5f6;
}
.ar-toc-list button.active {
  background: rgba(0, 0, 0, 0.06);
  color: #1a1a1a;
}

.ar-toc-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ar-toc-label em {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  color: #8a8a8a;
  margin-right: 8px;
}

.ar-toc-page {
  flex-shrink: 0;
  font-size: 12px;
  color: #8a8a8a;
  font-variant-numeric: tabular-nums;
}

.ar-toc-enter-active,
.ar-toc-leave-active {
  transition: opacity 0.2s ease;
}
.ar-toc-enter-active .ar-toc,
.ar-toc-leave-active .ar-toc {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}
.ar-toc-enter-from,
.ar-toc-leave-to {
  opacity: 0;
}
.ar-toc-enter-from .ar-toc,
.ar-toc-leave-to .ar-toc {
  transform: translateX(30px);
}

/* ---------- 响应式 ---------- */
@media (orientation: portrait), (max-width: 600px) {
  .album-reader {
    --ar-nav-safe: 14px;
  }

  .ar-topbar {
    padding: 0 12px;
  }

  /* 窄屏：返回按钮只留箭头，避免与居中书名挤在一起 */
  .ar-back {
    padding: 8px 10px;
  }

  .ar-back span {
    display: none;
  }

  .ar-topbar-title h1 {
    font-size: 13px;
  }

  .ar-topbar-title span:not(.ar-demo-badge) {
    display: none;
  }

  .ar-page-scroll {
    padding-top: 60px;
  }

  .ar-page-nav {
    display: none;
  }

  .ar-footer {
    gap: 10px;
    padding: 0 12px;
  }
}

/* 横屏矮视口（如横屏手机）：压缩避让，让纸面尽量占满高度 */
@media (orientation: landscape) and (max-height: 560px) {
  .album-reader {
    --ar-nav-safe: 10px;
  }

  .ar-page-scroll {
    padding-top: 44px;
  }

  .ar-topbar .ar-top-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
}

@media (max-width: 720px) {
  .ar-draft-banner {
    font-size: 12px;
    padding: 8px 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ar-turn-enter-active,
  .ar-turn-leave-active {
    transition: opacity 0.15s ease;
  }
  .ar-turn-enter-from,
  .ar-turn-leave-to {
    transform: none;
  }
}
</style>
