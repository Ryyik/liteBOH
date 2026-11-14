<template>
  <!-- 单页渲染器：书本阅读页（封面/章节/尾页/笔记内容页/多图网格页） -->
  <div class="sheet">
    <!-- 封面页 -->
    <div v-if="page?.pageType === 'cover'" class="sheet-cover">
      <div class="cover-frame">
        <img v-if="album?.coverUrl" :src="album.coverUrl" :alt="album.title" @error="onImgError" />
        <div v-else class="cover-empty">
          <Camera :size="30" :stroke-width="1.5" aria-hidden="true" />
        </div>
      </div>
      <div class="cover-text">
        <h2 class="cover-title">{{ album?.title || '未命名影集' }}</h2>
        <p v-if="album?.subtitle" class="cover-subtitle">{{ album.subtitle }}</p>
        <p v-if="album?.authorName" class="cover-author">摄于方块之家 · {{ album.authorName }}</p>
      </div>
    </div>

    <!-- 章节页 -->
    <div v-else-if="page?.pageType === 'chapter'" class="sheet-chapter">
      <h2>{{ page.chapterTitle || '未命名章节' }}</h2>
      <p v-if="page.note">{{ page.note }}</p>
    </div>

    <!-- 尾页 -->
    <div v-else-if="page?.pageType === 'end'" class="sheet-end">
      <p class="end-note">{{ page.note || '感谢翻阅' }}</p>
    </div>

    <!-- 笔记内容页：大图 + 左标题右正文（竖图在宽容器下自动左图右文） -->
    <div
      v-else-if="page && isNoteSheet"
      class="note-sheet"
      :class="{ 'is-portrait': note.isPortrait }"
    >
      <figure class="note-photo" :class="{ 'is-pair': note.photos.length > 1 }">
        <img
          v-for="(photo, index) in note.photos"
          :key="photo.id || `photo-${index}`"
          :src="photoUrl(photo)"
          :alt="photo.caption || note.headline || album?.title || '照片'"
          loading="lazy"
          decoding="async"
          @error="onImgError"
        />
        <div v-if="!note.photos.length" class="note-photo-empty">
          <Camera :size="26" :stroke-width="1.5" aria-hidden="true" />
        </div>
      </figure>

      <header class="note-head">
        <h1 class="note-title">{{ note.headline || '未命名' }}</h1>
        <p v-if="metaLine" class="note-meta">{{ metaLine }}</p>
      </header>

      <div class="note-body">
        <p v-for="(paragraph, index) in note.paragraphs" :key="`p-${index}`">{{ paragraph }}</p>
        <p v-for="(caption, index) in note.captions" :key="`c-${index}`" class="note-caption">
          {{ caption }}
        </p>
        <p v-if="!note.hasBody" class="note-body-empty">在编辑器里为这一页写点文字</p>
      </div>
    </div>

    <!-- 多图内容页（双图 / 三图 / 四宫格 / 胶片条） -->
    <div v-else-if="page" class="sheet-content">
      <div class="sheet-grid" :style="gridStyle">
        <figure
          v-for="(photoId, slotIndex) in page.photoRefs"
          :key="`${page.id}-${slotIndex}`"
          class="sheet-slot"
          :style="{ gridArea: `p${slotIndex}` }"
        >
          <img
            v-if="photoById.get(String(photoId))"
            :src="photoUrl(photoById.get(String(photoId)))"
            :alt="photoById.get(String(photoId)).caption || album?.title || '照片'"
            loading="lazy"
            decoding="async"
            @error="onImgError"
          />
          <figcaption
            v-if="!layoutHasTextArea && photoById.get(String(photoId))?.caption"
            class="slot-caption"
          >
            {{ photoById.get(String(photoId)).caption }}
          </figcaption>
        </figure>

        <aside
          v-if="layoutHasTextArea"
          class="sheet-text"
          :style="{ gridArea: 't' }"
          :class="{ 'is-hero': layoutHeroText }"
        >
          <p v-if="page.note" class="text-note">{{ page.note }}</p>
          <template v-for="(photoId, slotIndex) in page.photoRefs" :key="`cap-${slotIndex}`">
            <p v-if="photoById.get(String(photoId))?.caption" class="text-caption">
              {{ photoById.get(String(photoId)).caption }}
            </p>
          </template>
        </aside>
      </div>
    </div>

    <!-- 空页 -->
    <div v-else class="sheet-blank-page"></div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Camera } from 'lucide-vue-next';
import { getLayout } from '@/utils/photo-albums/layouts.js';
import { isNoteSheetPage, resolveNoteContent } from '@/utils/photo-albums/note-sheet.js';

const props = defineProps({
  page: { type: Object, default: null },
  album: { type: Object, default: null },
  photos: { type: Array, default: () => [] },
});

const photoById = computed(() => new Map(props.photos.map((p) => [String(p.id), p])));

const isNoteSheet = computed(() => isNoteSheetPage(props.page));
const note = computed(() =>
  resolveNoteContent({ page: props.page, photos: props.photos, album: props.album }),
);
const metaLine = computed(() =>
  [note.value.dateText, note.value.placeText].filter(Boolean).join(' '),
);

const layout = computed(() => getLayout(props.page?.layoutId));
const layoutHasTextArea = computed(() => Boolean(layout.value.textArea || layout.value.heroText));
const layoutHeroText = computed(() => Boolean(layout.value.heroText));

const gridStyle = computed(() => ({
  gridTemplateAreas: layout.value.gridAreas,
  gridTemplateRows: layout.value.gridRows,
  gridTemplateColumns: layout.value.gridColumns,
  gap: layout.value.gap === 'sm' ? '8px' : '14px',
}));

/** Cloudinary 裁剪参数：阅读场景按 1600 宽输出 */
function photoUrl(photo) {
  const url = String(photo?.url || '');
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto:good,w_1600/');
}

/** 破图兜底：隐藏裂图露出槽位底色 */
function onImgError(event) {
  if (event?.target) event.target.style.visibility = 'hidden';
}
</script>

<style scoped>
.sheet {
  width: 100%;
  height: 100%;
  /* 书页纸白固定：不随主题 token 变化（暗色主题下也是白纸书页） */
  background: #fff;
  display: flex;
  flex-direction: column;
  /* 尺寸容器：笔记版式按「纸面可用宽度」切换横排/竖排，编辑器画布与阅读页共用同一套规则 */
  container-type: inline-size;
  /* 笔记版式色板（纸面固定白，暗色主题同样保持纸感） */
  --note-ink: #1a1a1a;
  --note-ink-soft: #6f6f6f;
}

/* ---------- 笔记版式 ---------- */
.note-sheet {
  display: grid;
  grid-template-areas:
    'photo photo'
    'head body';
  grid-template-columns: minmax(84px, 30%) minmax(0, 1fr);
  column-gap: 24px;
  row-gap: 18px;
  align-items: start;
  padding: clamp(20px, 5cqi, 56px) clamp(18px, 5cqi, 44px) clamp(64px, 8cqi, 88px);
  font-family: var(--font-serif, 'Songti SC', serif);
  color: var(--note-ink);
}

.note-photo {
  grid-area: photo;
  margin: 0;
  width: 100%;
  overflow: hidden;
  background: #fff;
}

/* 两图页：上下堆叠，仍走同一套笔记文字区 */
.note-photo.is-pair {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

/* 横图 / 方图：统一 4:3 满幅裁切（参考图的图文笔记观感） */
.note-photo img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

/* 竖图：完整呈现不裁切，窄容器下置顶并限制高度 */
.note-sheet.is-portrait .note-photo img {
  /* 撑满图片列；高度按原比例，超过上限时 contain 留白而不是拉伸 */
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 62vh;
  /* 必须复位横图的 4:3 —— 否则 width:auto 仍被定比例撑成 4:3 矮框 */
  aspect-ratio: auto;
  margin: 0 auto;
  object-fit: contain;
}

/* 空槽没有固有比例，仍用 4:3 占位 */
.note-sheet.is-portrait .note-photo-empty {
  max-height: 62vh;
}

.note-photo-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  color: #c7c7cc;
  background: #f7f7f8;
}

.note-head {
  grid-area: head;
  min-width: 0;
}

.note-title {
  margin: 0;
  font-family: inherit;
  font-size: clamp(22px, 6.2cqi, 32px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.01em;
  color: var(--note-ink);
  word-break: break-word;
}

.note-meta {
  margin: 10px 0 0;
  font-size: clamp(11px, 3cqi, 13px);
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--note-ink-soft);
}

.note-body {
  grid-area: body;
  min-width: 0;
  font-size: clamp(14px, 3.8cqi, 16.5px);
  line-height: 1.95;
  letter-spacing: 0.01em;
  color: var(--note-ink);
}

.note-body p {
  margin: 0 0 1em;
  word-break: break-word;
}

.note-body p:last-child {
  margin-bottom: 0;
}

.note-caption {
  font-size: 0.84em;
  line-height: 1.8;
  color: var(--note-ink-soft);
}

.note-body-empty {
  color: #b3b3b8;
}

/* 宽容器 + 竖图：左图右文（图跨两行） */
@container (min-width: 720px) {
  .note-sheet.is-portrait {
    grid-template-areas:
      'photo head'
      'photo body';
    grid-template-columns: 52% minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    column-gap: 36px;
    row-gap: 10px;
  }

  .note-sheet.is-portrait .note-photo {
    align-self: start;
  }

  .note-sheet.is-portrait .note-photo img {
    max-height: 72vh;
  }
}

/* ---------- 封面 ---------- */
.sheet-cover {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: clamp(20px, 5cqi, 56px) clamp(18px, 5cqi, 44px) clamp(48px, 7cqi, 80px);
  min-height: 0;
  font-family: var(--font-serif, 'Songti SC', serif);
}

.cover-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #f7f7f8;
  flex-shrink: 0;
}

.cover-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c7c7cc;
}

.cover-text {
  padding-top: clamp(18px, 4cqi, 32px);
}

.cover-title {
  margin: 0 0 10px;
  font-size: clamp(28px, 7cqi, 42px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.01em;
  word-break: break-word;
}

.cover-subtitle {
  margin: 0;
  font-size: clamp(14px, 3.4cqi, 17px);
  line-height: 1.8;
  color: #4a4a4a;
}

.cover-author {
  margin: 18px 0 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--note-ink-soft);
}

/* ---------- 章节页 / 尾页 ---------- */
.sheet-chapter {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(32px, 8cqi, 92px) clamp(18px, 5cqi, 44px);
  min-height: 0;
  font-family: var(--font-serif, 'Songti SC', serif);
}

.sheet-chapter h2 {
  margin: 0 0 22px;
  font-size: clamp(28px, 7.2cqi, 46px);
  font-weight: 700;
  line-height: 1.24;
  letter-spacing: 0.01em;
  word-break: break-word;
}

.sheet-chapter p {
  margin: 0;
  max-width: 32em;
  font-size: clamp(14px, 3.6cqi, 16.5px);
  line-height: 2;
  color: #4a4a4a;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-end {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  min-height: 0;
  font-family: var(--font-serif, 'Songti SC', serif);
}

.end-note {
  margin: 0;
  max-width: 28em;
  font-size: clamp(15px, 3.8cqi, 18px);
  line-height: 2;
  letter-spacing: 0.04em;
  text-align: center;
  color: #4a4a4a;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---------- 多图内容页 ---------- */
.sheet-content {
  flex: 1;
  display: flex;
  padding: 16px;
  min-height: 0;
}

.sheet-grid {
  flex: 1;
  display: grid;
  min-height: 0;
}

.sheet-slot {
  position: relative;
  margin: 0;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 0;
  min-width: 0;
}

.sheet-slot img {
  flex: 0 1 auto;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}

.slot-caption {
  position: static;
  flex-shrink: 0;
  margin: 0;
  padding: 6px 4px 0;
  font-family: var(--font-serif, 'Songti SC', serif);
  font-size: 12px;
  line-height: 1.5;
  color: #6f6f6f;
  text-align: center;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 8px;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  font-family: var(--font-serif, 'Songti SC', serif);
}

.sheet-text.is-hero {
  padding-top: 14px;
}

.text-note {
  margin: 0;
  font-size: 15px;
  line-height: 1.95;
  color: #1a1a1a;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-text.is-hero .text-note {
  font-size: clamp(16px, 1.8vw, 20px);
  font-weight: 650;
  line-height: 1.75;
  letter-spacing: 0.02em;
}

.text-caption {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.85;
  color: #6f6f6f;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-blank-page {
  flex: 1;
}

/* 横屏矮视口（横屏手机）：笔记页与封面紧凑化，避免一屏塞不下 */
@media (orientation: landscape) and (max-height: 560px) {
  .note-sheet {
    padding: 14px 18px 28px;
    row-gap: 12px;
  }

  .note-photo img {
    aspect-ratio: 16 / 9;
  }

  .sheet-cover,
  .sheet-chapter,
  .sheet-end {
    padding: 14px 18px;
  }

  .cover-title {
    font-size: 22px;
    margin-bottom: 4px;
  }

  .cover-subtitle {
    font-size: 13px;
  }

  .cover-author {
    margin-top: 8px;
  }

  .sheet-chapter h2 {
    font-size: 26px;
    margin-bottom: 12px;
  }
}
</style>
