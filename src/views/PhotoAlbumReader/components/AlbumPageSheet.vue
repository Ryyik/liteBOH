<template>
  <!-- 单页渲染器：书本阅读页的左右页共用（封面/章节/尾页/内容版式） -->
  <div class="sheet">
    <!-- 封面页 -->
    <div v-if="page?.pageType === 'cover'" class="sheet-cover">
      <div class="cover-frame">
        <img v-if="album?.coverUrl" :src="album.coverUrl" :alt="album.title" @error="onImgError" />
        <div v-else class="cover-empty">
          <Camera :size="30" :stroke-width="1.5" aria-hidden="true" />
        </div>
      </div>
      <h2 class="cover-title">{{ album?.title || '未命名影集' }}</h2>
      <p v-if="album?.subtitle" class="cover-subtitle">{{ album.subtitle }}</p>
      <p v-if="album?.authorName" class="cover-author">摄于方块之家 · {{ album.authorName }}</p>
    </div>

    <!-- 章节页 -->
    <div v-else-if="page?.pageType === 'chapter'" class="sheet-chapter">
      <span class="sheet-kicker">CHAPTER</span>
      <h2>{{ page.chapterTitle || '未命名章节' }}</h2>
      <p v-if="page.note">{{ page.note }}</p>
    </div>

    <!-- 尾页 -->
    <div v-else-if="page?.pageType === 'end'" class="sheet-end">
      <span class="sheet-kicker">FIN</span>
      <p class="end-note">{{ page.note || '感谢翻阅' }}</p>
    </div>

    <!-- 内容页（版式渲染） -->
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

const props = defineProps({
  page: { type: Object, default: null },
  album: { type: Object, default: null },
  photos: { type: Array, default: () => [] },
});

const photoById = computed(() => new Map(props.photos.map((p) => [String(p.id), p])));

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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---------- 封面 ---------- */
.sheet-cover {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 26px;
  min-height: 0;
}

.cover-frame {
  /* 弹性高度：随视口剩余空间伸缩，任何横竖屏都不塌陷；图 cover 裁切填框 */
  flex: 1 1 auto;
  width: min(92%, 460px);
  min-height: 96px;
  max-height: 420px;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 18px;
  background: var(--surface-secondary, #f2f2f7);
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
  color: var(--text-quaternary, #c7c7cc);
}

.cover-title {
  margin: 0 0 8px;
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 700;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.cover-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary, #515154);
  flex-shrink: 0;
}

.cover-author {
  margin: 12px 0 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--text-tertiary, #86868b);
  flex-shrink: 0;
}

/* ---------- 章节页 / 尾页 ---------- */
.sheet-chapter,
.sheet-end {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 26px;
  min-height: 0;
}

.sheet-kicker {
  font-size: 11px;
  letter-spacing: 0.5em;
  color: var(--brand, #0a84ff);
  margin-bottom: 14px;
}

.sheet-chapter h2 {
  margin: 0 0 10px;
  font-size: clamp(20px, 2.4vw, 26px);
  letter-spacing: 0.14em;
}

.sheet-chapter p,
.end-note {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-secondary, #515154);
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 480px;
}

/* ---------- 内容页 ---------- */
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
  /* 与书页同底：照片以原比例完整呈现，不被槽位裁切（相册贴纸感）；
     图 + 配文作为整体在槽内居中，配文紧跟照片下方 */
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
  /* contain：4:3 / 16:9 / 竖图均完整展示，常见比例零裁切 */
  flex: 0 1 auto;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
}

.slot-caption {
  position: static;
  flex-shrink: 0;
  margin: 0;
  padding: 6px 4px 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, #515154);
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
}

.sheet-text.is-hero {
  padding-top: 14px;
}

.text-note {
  margin: 0;
  font-size: 15px;
  line-height: 1.9;
  color: var(--text-primary, #1d1d1f);
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-text.is-hero .text-note {
  font-size: clamp(16px, 1.8vw, 20px);
  font-weight: 650;
  line-height: 1.7;
  letter-spacing: 0.02em;
}

.text-caption {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-secondary, #515154);
  border-left: 3px solid var(--brand, #0a84ff);
  padding-left: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sheet-blank-page {
  flex: 1;
}

/* 横屏矮视口（横屏手机）：封面与章节页内容紧凑化，避免溢出 */
@media (orientation: landscape) and (max-height: 560px) {
  .sheet-cover,
  .sheet-chapter,
  .sheet-end {
    padding: 14px 18px;
  }

  .cover-frame {
    min-height: 56px;
    margin-bottom: 10px;
    max-height: none;
  }

  .cover-title {
    font-size: 17px;
    margin-bottom: 4px;
  }

  .cover-subtitle {
    font-size: 12px;
  }

  .cover-author {
    margin-top: 6px;
  }

  .sheet-kicker {
    margin-bottom: 8px;
  }

  .sheet-chapter h2 {
    font-size: 20px;
    margin-bottom: 6px;
  }

  .sheet-chapter p,
  .end-note {
    font-size: 12.5px;
    line-height: 1.7;
  }
}
</style>
