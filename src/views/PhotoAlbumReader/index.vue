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
        <!-- 书本舞台 -->
        <section
          class="ar-book-stage"
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

          <!-- 桌面：摊开的双页书（全出血贴边） -->
          <div v-if="!isMobile" class="ar-book">
            <Transition name="ar-turn" mode="out-in">
              <div :key="spreadIndex" class="ar-spread">
                <!-- 左页 -->
                <div class="ar-page ar-page-left">
                  <AlbumPageSheet
                    v-if="leftPage"
                    :page="leftPage"
                    :album="bundle.album"
                    :photos="bundle.photos"
                  />
                  <!-- 封面 spread 的书壳内衬 -->
                  <div v-else-if="spreadIndex === 0" class="ar-lining">
                    <span class="ar-lining-mark">方块之家 · 摄影集</span>
                  </div>
                  <div v-else class="ar-blank-page"></div>
                </div>
                <!-- 书脊 -->
                <div class="ar-spine" aria-hidden="true"></div>
                <!-- 右页 -->
                <div class="ar-page ar-page-right">
                  <AlbumPageSheet
                    v-if="rightPage"
                    :page="rightPage"
                    :album="bundle.album"
                    :photos="bundle.photos"
                  />
                  <div v-else class="ar-blank-page"></div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 移动：单页 -->
          <div v-else class="ar-book is-mobile">
            <Transition name="ar-turn" mode="out-in">
              <div :key="currentIndex" class="ar-spread is-single">
                <div class="ar-page ar-page-full">
                  <AlbumPageSheet
                    :page="currentPage"
                    :album="bundle.album"
                    :photos="bundle.photos"
                  />
                </div>
              </div>
            </Transition>
          </div>

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
          <span class="ar-footer-page">{{ navPosition }} / {{ totalNavUnits }}</span>
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
import AlbumPageSheet from './components/AlbumPageSheet.vue';

/** 极窄窗才强制单页；横屏手机（如 844 宽）保持双页书 */
const MOBILE_QUERY = '(max-width: 600px)';
const PORTRAIT_QUERY = '(orientation: portrait)';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const bundle = ref(null);
const isLoading = ref(true);
const loadError = ref('');

/** 页指针：桌面模式下始终指向当前 spread 的左页（封面 spread 为 0） */
const currentIndex = ref(0);
const showToc = ref(false);
const isMobile = ref(false);

let mobileMql = null;
let portraitMql = null;
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

/**
 * 书页摊开模型：spread 0 = 封面（右页封面，左页书壳内衬）；
 * spread s≥1 → 左页 pages[2s-1]、右页 pages[2s]。
 */
const spreadIndex = computed(() => Math.ceil(currentIndex.value / 2));
const totalSpreads = computed(() =>
  totalPages.value <= 1 ? 1 : 1 + Math.ceil((totalPages.value - 1) / 2),
);

const leftPage = computed(() => {
  if (spreadIndex.value === 0) return null;
  return pages.value[spreadIndex.value * 2 - 1] || null;
});

const rightPage = computed(() => pages.value[spreadIndex.value * 2] || null);

const canGoPrev = computed(() => (isMobile.value ? currentIndex.value > 0 : spreadIndex.value > 0));
const canGoNext = computed(() =>
  isMobile.value
    ? currentIndex.value < totalPages.value - 1
    : spreadIndex.value < totalSpreads.value - 1,
);

const navPosition = computed(() =>
  isMobile.value ? currentIndex.value + 1 : spreadIndex.value + 1,
);
const totalNavUnits = computed(() => (isMobile.value ? totalPages.value : totalSpreads.value));

const progressPercent = computed(() =>
  totalNavUnits.value <= 1
    ? '100%'
    : `${Math.round(((navPosition.value - 1) / (totalNavUnits.value - 1)) * 100)}%`,
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
  if (isMobile.value) {
    if (currentIndex.value > 0) currentIndex.value -= 1;
    return;
  }
  const prev = spreadIndex.value - 1;
  if (prev < 0) return;
  currentIndex.value = prev === 0 ? 0 : prev * 2 - 1;
}

function nextPage() {
  if (isMobile.value) {
    if (currentIndex.value < totalPages.value - 1) currentIndex.value += 1;
    return;
  }
  const next = spreadIndex.value + 1;
  if (next > totalSpreads.value - 1) return;
  currentIndex.value = next * 2 - 1;
}

/** 目录跳转：把目标页落到所在 spread 的左页（封面 spread 落 0） */
function jumpTo(pageIndex) {
  const target = Math.max(0, Math.min(totalPages.value - 1, pageIndex));
  currentIndex.value = isMobile.value || target === 0 ? target : Math.ceil(target / 2) * 2 - 1;
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

/** 单页模式：竖屏或窄窗（双页书需要横向空间） */
function syncMobile() {
  isMobile.value = Boolean(portraitMql?.matches || mobileMql?.matches);
}

function onKeydown(event) {
  if (event.key === 'ArrowLeft') prevPage();
  else if (event.key === 'ArrowRight') nextPage();
  else if (event.key === 'Escape') showToc.value = false;
}

onMounted(() => {
  loadAlbum();
  if (typeof window !== 'undefined' && 'matchMedia' in window) {
    mobileMql = window.matchMedia(MOBILE_QUERY);
    portraitMql = window.matchMedia(PORTRAIT_QUERY);
    syncMobile();
    mobileMql.addEventListener('change', syncMobile);
    portraitMql.addEventListener('change', syncMobile);
  }
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  mobileMql?.removeEventListener('change', syncMobile);
  portraitMql?.removeEventListener('change', syncMobile);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
.album-reader {
  /* 全屏阅读：页面自身不滚动，书本在剩余空间内自适应 */
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--boh-page-bg, #f4f4f6);
  color: var(--text-primary, #1d1d1f);
  /* 导航已收成左上角迷你球（52px，fixed 14,14）：顶栏只需少量避让 + 左端让位 */
  --ar-nav-safe: 20px;
  --ar-orb: 52px;
}

.ar-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  /* 全出血书：顶栏/底栏悬浮在书上，整个视口就是摊开的影集 */
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
  background: var(--surface-primary, #fff);
  color: var(--text-secondary, #515154);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition: color 0.15s ease;
}

.ar-back:hover {
  color: var(--text-primary, #1d1d1f);
}

.ar-topbar-title {
  flex: 2;
  min-width: 0;
  text-align: center;
}

.ar-topbar-title h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ar-topbar-title > span {
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
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
  color: var(--brand, #0a84ff);
  background: rgba(10, 132, 255, 0.12);
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
  background: var(--surface-primary, #fff);
  color: var(--text-primary, #1d1d1f);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease;
}

.ar-top-btn:hover {
  transform: translateY(-1px);
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
  background: rgba(255, 159, 10, 0.16);
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
  background: var(--surface-primary, #fff);
  color: var(--text-tertiary, #86868b);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.ar-state h2 {
  margin: 6px 0 0;
  font-size: 20px;
}
.ar-state p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
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
  background: var(--brand, #0a84ff);
  color: #fff;
}

.ar-btn.ghost {
  border: 1px solid var(--border-color, #d1d1d6);
  background: var(--surface-primary, #fff);
  color: var(--text-primary, #1d1d1f);
}

.ar-skeleton-page {
  width: min(880px, 100%);
  aspect-ratio: 3 / 2;
  border-radius: 14px;
}

/* ---------- 书本 ---------- */
.ar-book-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

/* 全出血：书 = 视口剩余区域，左右页即屏幕左右两缘 */
.ar-book {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.ar-spread {
  position: relative;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--surface-primary, #fff);
  overflow: hidden;
}

.ar-page {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* 中缝：左右页相向的内阴影 */
.ar-spine {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 64px;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0) 0%,
    rgba(0, 0, 0, 0.14) 50%,
    rgba(0, 0, 0, 0) 100%
  );
}

/* 页面外侧无圆角（全出血贴边），仅保留中缝相向内阴影 */
.ar-page-left {
  box-shadow: inset -14px 0 22px -18px rgba(0, 0, 0, 0.35);
}
.ar-page-right {
  box-shadow: inset 14px 0 22px -18px rgba(0, 0, 0, 0.35);
}

/* 封面 spread：左页书壳内衬 */
.ar-lining {
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 28px;
  background:
    radial-gradient(120% 90% at 30% 20%, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0) 60%),
    linear-gradient(135deg, #46403a, #332d27);
}

.ar-lining-mark {
  font-size: 11px;
  letter-spacing: 0.32em;
  color: rgba(255, 255, 255, 0.34);
}

.ar-blank-page {
  height: 100%;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0) 18%), #fbfaf8;
}

/* 移动/竖屏单页：书撑满 stage 高度 */
.ar-book.is-mobile {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.ar-spread.is-single {
  flex: 1;
  grid-template-columns: 1fr;
  aspect-ratio: auto;
  min-height: 0;
}

.ar-page-full {
  border-radius: 6px;
  min-height: 0;
  height: 100%;
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
  background: rgba(29, 29, 31, 0.55);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.15s ease;
}

.ar-page-nav:hover {
  background: rgba(29, 29, 31, 0.78);
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
  transform: perspective(1600px) rotateY(-6deg);
  transform-origin: left center;
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
  color: var(--text-tertiary, #86868b);
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
  height: 3px;
  border-radius: 999px;
  background: var(--border-color, #e5e5ea);
  overflow: hidden;
}

.ar-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--brand, #0a84ff);
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
  background: var(--surface-primary, #fff);
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
  background: var(--surface-secondary, #f2f2f7);
  color: var(--text-secondary, #515154);
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
  color: var(--text-primary, #1d1d1f);
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ar-toc-list button:hover {
  background: var(--surface-secondary, #f2f2f7);
}
.ar-toc-list button.active {
  background: rgba(10, 132, 255, 0.1);
  color: var(--brand, #0a84ff);
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
  color: var(--text-tertiary, #86868b);
  margin-right: 8px;
}

.ar-toc-list button.active .ar-toc-label em {
  color: var(--brand, #0a84ff);
}

.ar-toc-page {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
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

/* ---------- 响应式（横竖屏适配） ---------- */
/* 竖屏或极窄窗：单页模式（模板由 isMobile 切换），避让紧凑化 */
@media (orientation: portrait), (max-width: 600px) {
  .album-reader {
    --ar-nav-safe: 14px;
  }

  .ar-topbar {
    padding: 0 12px;
  }

  .ar-topbar-title span:not(.ar-demo-badge) {
    display: none;
  }

  .ar-page-nav {
    display: none;
  }

  .ar-footer {
    gap: 10px;
    padding: 0 12px;
  }
}

/* 横屏矮视口（如横屏手机）：压缩避让，让书尽量占满高度 */
@media (orientation: landscape) and (max-height: 560px) {
  .album-reader {
    --ar-nav-safe: 10px;
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
