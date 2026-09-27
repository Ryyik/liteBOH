<template>
  <div class="album-reader">
    <main class="ar-main">
      <!-- 顶栏 -->
      <header v-if="bundle" class="ar-topbar">
        <div class="ar-topbar-left">
          <RouterLink v-if="isOwner" to="/user-space/albums" class="ar-back">
            <ArrowLeft :size="16" :stroke-width="2.2" aria-hidden="true" />
            <span>我的影集</span>
          </RouterLink>
          <RouterLink v-else to="/albums" class="ar-back">
            <ArrowLeft :size="16" :stroke-width="2.2" aria-hidden="true" />
            <span>社区影集</span>
          </RouterLink>
        </div>
        <div class="ar-topbar-title">
          <h1>{{ bundle.album.title }}</h1>
          <span v-if="!isOwner && bundle.album.authorName">by {{ bundle.album.authorName }}</span>
        </div>
        <div class="ar-topbar-actions">
          <button v-if="isOwner" type="button" class="ar-top-btn" @click="goEditor">
            <Pencil :size="14" :stroke-width="2.2" aria-hidden="true" />
            编辑
          </button>
          <button type="button" class="ar-top-btn" :aria-expanded="showToc" @click="showToc = !showToc">
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
        <span class="ar-state-icon"><CameraOff :size="28" :stroke-width="1.6" aria-hidden="true" /></span>
        <h2>{{ loadError || '影集不存在' }}</h2>
        <p>它可能已被作者删除，或尚未公开分享。</p>
        <div class="ar-state-actions">
          <button type="button" class="ar-btn ghost" @click="loadAlbum">重试</button>
          <RouterLink class="ar-btn primary" to="/albums">去社区影集区逛逛</RouterLink>
        </div>
      </section>

      <!-- 阅读舞台 -->
      <template v-else>
        <section ref="stageRef" class="ar-stage"
          @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <button v-if="currentIndex > 0" type="button" class="ar-page-nav prev" aria-label="上一页" @click="prevPage">
            <ChevronLeft :size="22" :stroke-width="2.2" aria-hidden="true" />
          </button>

          <!-- 封面页 -->
          <div v-if="currentPage?.pageType === 'cover'" class="ar-sheet is-cover">
            <div class="ar-cover-frame">
              <img v-if="bundle.album.coverUrl" :src="bundle.album.coverUrl" :alt="bundle.album.title" />
              <div v-else class="ar-cover-empty"><Camera :size="30" :stroke-width="1.5" aria-hidden="true" /></div>
            </div>
            <h2 class="ar-cover-title">{{ bundle.album.title }}</h2>
            <p v-if="bundle.album.subtitle" class="ar-cover-subtitle">{{ bundle.album.subtitle }}</p>
            <p v-if="!isOwner && bundle.album.authorName" class="ar-cover-author">摄于方块之家 · {{ bundle.album.authorName }}</p>
          </div>

          <!-- 章节页 -->
          <div v-else-if="currentPage?.pageType === 'chapter'" class="ar-sheet is-chapter">
            <span class="ar-kicker">CHAPTER</span>
            <h2>{{ currentPage.chapterTitle || '未命名章节' }}</h2>
            <p v-if="currentPage.note">{{ currentPage.note }}</p>
          </div>

          <!-- 尾页 -->
          <div v-else-if="currentPage?.pageType === 'end'" class="ar-sheet is-end">
            <span class="ar-kicker">FIN</span>
            <p class="ar-end-note">{{ currentPage.note || '感谢翻阅' }}</p>
          </div>

          <!-- 内容页（版式渲染） -->
          <div v-else-if="currentPage" class="ar-sheet is-content">
            <div class="ar-grid" :style="gridStyle">
              <figure v-for="(photoId, slotIndex) in currentPage.photoRefs" :key="`${currentPage.id}-${slotIndex}`"
                class="ar-slot" :style="{ gridArea: `p${slotIndex}` }">
                <img v-if="photoById.get(String(photoId))" :src="photoUrl(photoById.get(String(photoId)))"
                  :alt="photoById.get(String(photoId)).caption || bundle.album.title" loading="lazy" decoding="async" />
                <figcaption v-if="!layoutHasTextArea && photoById.get(String(photoId))?.caption" class="ar-slot-caption">
                  {{ photoById.get(String(photoId)).caption }}
                </figcaption>
              </figure>

              <aside v-if="layoutHasTextArea" class="ar-text" :style="{ gridArea: 't' }"
                :class="{ 'is-hero': layoutHeroText }">
                <p v-if="currentPage.note" class="ar-text-note">{{ currentPage.note }}</p>
                <template v-for="(photoId, slotIndex) in currentPage.photoRefs" :key="`cap-${slotIndex}`">
                  <p v-if="photoById.get(String(photoId))?.caption" class="ar-text-caption">
                    {{ photoById.get(String(photoId)).caption }}
                  </p>
                </template>
              </aside>
            </div>
          </div>

          <button v-if="currentIndex < totalPages - 1" type="button" class="ar-page-nav next" aria-label="下一页"
            @click="nextPage">
            <ChevronRight :size="22" :stroke-width="2.2" aria-hidden="true" />
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
                <button type="button" class="ar-toc-close" aria-label="关闭目录" @click="showToc = false">
                  <X :size="16" :stroke-width="2.2" aria-hidden="true" />
                </button>
              </header>
              <ul class="ar-toc-list">
                <li v-for="(entry, index) in tocEntries" :key="`${entry.pageIndex}-${index}`">
                  <button type="button" :class="{ active: entry.pageIndex === currentIndex }" @click="jumpTo(entry.pageIndex)">
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
import {
  ArrowLeft,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  List,
  Pencil,
  X
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { getPublicAlbum } from '@/utils/api/photo-albums-api.js';
import { getLayout } from '@/utils/photo-albums/layouts.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const bundle = ref(null);
const isLoading = ref(true);
const loadError = ref('');

const currentIndex = ref(0);
const showToc = ref(false);
const stageRef = ref(null);

let touchStartX = 0;
let touchStartY = 0;

const isOwner = computed(() =>
  Boolean(authStore?.isLoggedIn && authStore?.userInfo?.id && bundle.value?.album?.userId === authStore.userInfo.id)
);

const pages = computed(() => bundle.value?.pages || []);
const totalPages = computed(() => pages.value.length);
const currentPage = computed(() => pages.value[currentIndex.value] || null);

const currentLayout = computed(() => getLayout(currentPage.value?.layoutId));
const layoutHasTextArea = computed(() =>
  Boolean(currentLayout.value.textArea || currentLayout.value.heroText)
);
const layoutHeroText = computed(() => Boolean(currentLayout.value.heroText));

const gridStyle = computed(() => ({
  gridTemplateAreas: currentLayout.value.gridAreas,
  gridTemplate: currentLayout.value.gridTemplate,
  gap: currentLayout.value.gap === 'sm' ? '8px' : '14px'
}));

const photoById = computed(() => new Map((bundle.value?.photos || []).map((p) => [String(p.id), p])));

/** Cloudinary 裁剪参数：阅读场景按 1600 宽输出 */
function photoUrl(photo) {
  const url = String(photo?.url || '');
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto:good,w_1600/');
}

const progressPercent = computed(() =>
  totalPages.value <= 1 ? '100%' : `${Math.round((currentIndex.value / (totalPages.value - 1)) * 100)}%`
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
      entries.push({ pageIndex: index, typeLabel: '封面', title: bundle.value?.album?.title || '封面' });
    } else if (page.pageType === 'chapter') {
      entries.push({ pageIndex: index, typeLabel: `第 ${entries.length} 章`, title: page.chapterTitle || '未命名章节' });
    } else if (page.pageType === 'end') {
      entries.push({ pageIndex: index, typeLabel: '尾声', title: page.note || '感谢翻阅' });
    }
  });
  return entries;
});

async function loadAlbum() {
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
  min-height: 100vh;
  background: var(--boh-page-bg, #f4f4f6);
  color: var(--text-primary, #1d1d1f);
}

.ar-main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 20px 48px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ---------- 顶栏 ---------- */
.ar-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ar-topbar-left {
  flex: 1;
  min-width: 0;
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
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition: color 0.15s ease;
}

.ar-back:hover { color: var(--text-primary, #1d1d1f); }

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

.ar-topbar-title span {
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
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
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease;
}

.ar-top-btn:hover { transform: translateY(-1px); }

.ar-draft-banner {
  margin-top: 14px;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(255, 159, 10, 0.12);
  color: #b25000;
  font-size: 13px;
  text-align: center;
}

/* ---------- 状态页 ---------- */
.ar-state {
  flex: 1;
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

.ar-state h2 { margin: 6px 0 0; font-size: 20px; }
.ar-state p { margin: 0; font-size: 14px; color: var(--text-secondary, #515154); }

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

.ar-btn:hover { opacity: 0.85; }

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
  aspect-ratio: 4 / 3;
  border-radius: 20px;
}

/* ---------- 舞台 ---------- */
.ar-stage {
  position: relative;
  flex: 1;
  margin-top: 18px;
  display: flex;
  align-items: stretch;
  gap: 12px;
  min-height: 0;
}

.ar-sheet {
  flex: 1;
  min-height: 0;
  background: var(--surface-primary, #fff);
  border-radius: 22px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

/* 封面 */
.ar-sheet.is-cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 36px 28px;
}

.ar-cover-frame {
  width: min(520px, 82%);
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 24px;
  background: var(--surface-secondary, #f2f2f7);
}

.ar-cover-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ar-cover-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-quaternary, #c7c7cc);
}

.ar-cover-title {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.ar-cover-subtitle {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary, #515154);
}

.ar-cover-author {
  margin: 14px 0 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-tertiary, #86868b);
}

/* 章节页 / 尾页 */
.ar-sheet.is-chapter,
.ar-sheet.is-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 36px 28px;
}

.ar-kicker {
  font-size: 11px;
  letter-spacing: 0.5em;
  color: var(--brand, #0a84ff);
  margin-bottom: 14px;
}

.ar-sheet.is-chapter h2 {
  margin: 0 0 10px;
  font-size: 26px;
  letter-spacing: 0.14em;
}

.ar-sheet.is-chapter p,
.ar-end-note {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-secondary, #515154);
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 560px;
}

/* 内容页 */
.ar-sheet.is-content {
  display: flex;
  padding: 18px;
}

.ar-grid {
  flex: 1;
  display: grid;
  min-height: 520px;
}

.ar-slot {
  position: relative;
  margin: 0;
  border-radius: 16px;
  overflow: hidden;
  background: var(--surface-secondary, #f2f2f7);
  min-height: 0;
}

.ar-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ar-slot-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 26px 14px 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #fff;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0));
  white-space: pre-wrap;
  word-break: break-word;
}

.ar-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 10px 8px;
  min-height: 0;
  overflow-y: auto;
}

.ar-text.is-hero { padding-top: 18px; }

.ar-text-note {
  margin: 0;
  font-size: 16px;
  line-height: 1.9;
  color: var(--text-primary, #1d1d1f);
  white-space: pre-wrap;
  word-break: break-word;
}

.ar-text.is-hero .ar-text-note {
  font-size: 21px;
  font-weight: 650;
  line-height: 1.7;
  letter-spacing: 0.02em;
}

.ar-text-caption {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary, #515154);
  border-left: 3px solid var(--brand, #0a84ff);
  padding-left: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 翻页按钮 */
.ar-page-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  background: rgba(29, 29, 31, 0.55);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.15s ease, transform 0.15s ease;
}

.ar-page-nav:hover { background: rgba(29, 29, 31, 0.75); }
.ar-page-nav.prev { left: -6px; }
.ar-page-nav.next { right: -6px; }

/* ---------- 底栏 ---------- */
.ar-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
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
  backdrop-filter: blur(3px);
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

.ar-toc-head h3 { margin: 0; font-size: 16px; font-weight: 700; }

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

.ar-toc-list button:hover { background: var(--surface-secondary, #f2f2f7); }
.ar-toc-list button.active { background: rgba(10, 132, 255, 0.1); color: var(--brand, #0a84ff); }

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

.ar-toc-list button.active .ar-toc-label em { color: var(--brand, #0a84ff); }

.ar-toc-page {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-tertiary, #86868b);
  font-variant-numeric: tabular-nums;
}

.ar-toc-enter-active,
.ar-toc-leave-active { transition: opacity 0.2s ease; }
.ar-toc-enter-active .ar-toc,
.ar-toc-leave-active .ar-toc { transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1); }
.ar-toc-enter-from,
.ar-toc-leave-to { opacity: 0; }
.ar-toc-enter-from .ar-toc,
.ar-toc-leave-to .ar-toc { transform: translateX(30px); }

/* ---------- 响应式 ---------- */
@media (max-width: 720px) {
  .ar-main { padding: 16px 14px 40px; }

  .ar-topbar-title span { display: none; }

  .ar-grid {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .ar-slot { aspect-ratio: 4 / 3; }
  .ar-slot[style*="grid-area:t"] { aspect-ratio: auto; }

  .ar-page-nav { display: none; }
}

@media (prefers-reduced-motion: no-preference) {
  .ar-sheet { transition: opacity 0.18s ease; }
}
</style>
