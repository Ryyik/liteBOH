<script setup>
/**
 * 图文格式的**一张**：照片 + 这一张的字。
 *
 * ## 为什么是独立组件
 * 版式与阅读层（`AlbumReader` 的 `.album-entry`）同构：图在上，文字走
 * `30% / 1fr` 两栏。这块结构每一张都重复一次，放进 `PostComposer` 会让那个
 * 已经 2400 行的文件再涨一截；更要紧的是**每个字段都要「多字扩展」**，
 * 而 `useAutoGrowTextarea` 一次只绑一个元素 —— 只有拆成组件才能给每一张
 * 各开一条它自己的实例（严禁在 `v-for` 里手撸第 5 份增高实现）。
 *
 * ## 与阅读层的一致性（改动前先读）
 * - 左栏自上而下：标题 / 日期 / 地点；右栏：正文。阅读层同序同结构。
 * - 字体一律继承宿主的 `--composer-album-font`（= `ALBUM_FONT_STACK`，固定宋体），
 *   本组件**不写第二份字体名**。
 * - 字段上限一律从 `utils/forum-album.js` 取，不在模板里另写 16 / 12 / 16。
 *
 * ## 为什么控件只剩一个「⋯」
 * 上一版把序号、×、拖拽把手、画笔四个控件塞进 108px 的缩略图里（桌面端还
 * 换成「把手 + 左箭头 + 右箭头 + 画笔」），触屏上分不清、误触率高（用户反馈）。
 * 现在整块常态只有一个「⋯」，删除 / 前移 / 后移 / 编辑照片全在菜单里。
 *
 * ## ⚠️ 菜单必须在照片内部
 * 宿主 `.composer-content-scroll` 是 `overflow-y: auto` —— 任何越出它的浮层都会被裁
 * （AGENTS.md 记过同类事故：88px 窄栏下浮层只剩 68px 可见）。所以菜单锚在照片
 * 右上角**里面**，高度上限 `calc(100% - 16px)`，永不越界。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-vue-next';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';
import {
  ALBUM_ENTRY_BODY_MAX,
  ALBUM_ENTRY_DATE_MAX,
  ALBUM_ENTRY_PLACE_MAX,
  ALBUM_ENTRY_TITLE_MAX,
} from '@/utils/forum-album.js';

const props = defineProps({
  /** `postImages` 里的一项（`{ url, localPreviewUrl, file, name, uploadStatus, uploadId }`） */
  image: { type: Object, required: true },
  /** 这一张的文字 `{ title, date, place, body }`，与 `image` 按下标对齐 */
  entry: { type: Object, default: () => ({}) },
  index: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  /** 上传 / 提交进行中：所有会改动图序与内容的动作都锁住 */
  busy: { type: Boolean, default: false },
  /** 有本地文件才能再编辑（`edit` 菜单项） */
  editable: { type: Boolean, default: false },
});

const emit = defineEmits(['update', 'remove', 'retry', 'edit', 'preview', 'move']);

const isFailed = computed(
  () => !props.image?.url && String(props.image?.uploadStatus || '') === 'failed',
);
const photoNo = computed(() => String(props.index + 1).padStart(2, '0'));
/* 四个字段各一条增高实例。上限：正文住 CSS（`.album-block-body { max-height }`），
   JS 不写第二份像素值；标题 / 日期 / 地点不设上限（它们是短字段，`max-height`
   为 `none` ⇒ 本实现归一成 Infinity）。 */
const { textareaRef: titleRef } = useAutoGrowTextarea({ value: () => props.entry?.title });
const { textareaRef: dateRef } = useAutoGrowTextarea({ value: () => props.entry?.date });
const { textareaRef: placeRef } = useAutoGrowTextarea({ value: () => props.entry?.place });
const { textareaRef: bodyRef } = useAutoGrowTextarea({ value: () => props.entry?.body });

const onInput = (field, event) => {
  emit('update', field, String(event?.target?.value ?? ''));
};

/* ── 「⋯」菜单 ───────────────────────────────────────────────────────── */
const menuOpen = ref(false);

const closeMenu = () => {
  menuOpen.value = false;
};

const onDocumentPointerDown = (event) => {
  if (event?.target?.closest?.('.album-block-menu-wrap')) return;
  closeMenu();
};

watch(menuOpen, (open) => {
  if (typeof document === 'undefined') return;
  if (open) document.addEventListener('pointerdown', onDocumentPointerDown, true);
  else document.removeEventListener('pointerdown', onDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
});

const run = (action, ...args) => {
  closeMenu();
  if (props.busy) return;
  if (action === 'remove') emit('remove');
  else if (action === 'edit') emit('edit');
  else if (action === 'move') emit('move', ...args);
};
</script>

<template>
  <article class="album-block" :class="{ 'is-failed': isFailed }">
    <div class="album-block-photo">
      <button
        v-if="image.url"
        type="button"
        class="album-block-photo-btn"
        :aria-label="`预览第 ${index + 1} 张照片大图`"
        @click="emit('preview')"
      >
        <img :src="image.url" :alt="`第 ${index + 1} 张照片`" decoding="async" loading="lazy" />
      </button>

      <div v-else class="album-block-photo-fail">
        <template v-if="isFailed">
          <ImageIcon :size="22" :stroke-width="1.7" aria-hidden="true" />
          <span class="album-block-fail-name">{{ image.name || '图片上传失败' }}</span>
          <button
            v-if="image.file"
            type="button"
            class="album-block-fail-retry"
            :disabled="busy"
            @click="emit('retry')"
          >
            重试
          </button>
        </template>
        <template v-else>
          <span class="album-block-spinner" aria-hidden="true"></span>
          <span class="album-block-fail-name">正在处理照片…</span>
        </template>
      </div>

      <!-- 序号：一篇里的阅读顺序，只在这里出现一次（副本已随缩略图条删除） -->
      <span class="album-block-no">{{ photoNo }}</span>

      <div v-if="!isFailed" class="album-block-menu-wrap">
        <button
          type="button"
          class="album-block-menu-btn"
          :aria-expanded="menuOpen"
          :aria-label="`第 ${index + 1} 张照片的操作`"
          @click="menuOpen = !menuOpen"
        >
          <MoreHorizontal :size="17" :stroke-width="2.2" aria-hidden="true" />
        </button>
        <div v-if="menuOpen" class="album-block-menu" role="menu">
          <button
            v-if="editable"
            type="button"
            class="album-block-menu-item"
            role="menuitem"
            @click="run('edit')"
          >
            <Pencil :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>编辑照片</span>
          </button>
          <button
            type="button"
            class="album-block-menu-item"
            role="menuitem"
            :disabled="busy || index === 0"
            @click="run('move', -1)"
          >
            <ArrowUp :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>前移</span>
          </button>
          <button
            type="button"
            class="album-block-menu-item"
            role="menuitem"
            :disabled="busy || index === total - 1"
            @click="run('move', 1)"
          >
            <ArrowDown :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>后移</span>
          </button>
          <button
            type="button"
            class="album-block-menu-item is-danger"
            role="menuitem"
            :disabled="busy"
            @click="run('remove')"
          >
            <Trash2 :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>删除这张</span>
          </button>
        </div>
      </div>
    </div>

    <div class="album-block-text">
      <div class="album-block-meta">
        <textarea
          ref="titleRef"
          class="album-block-input album-block-title"
          :value="entry.title"
          rows="1"
          :maxlength="ALBUM_ENTRY_TITLE_MAX"
          placeholder="这一张的标题"
          :aria-label="`第 ${index + 1} 张的标题`"
          @input="onInput('title', $event)"
        ></textarea>
        <div class="album-block-when">
          <textarea
            ref="dateRef"
            class="album-block-input album-block-date"
            :value="entry.date"
            rows="1"
            :maxlength="ALBUM_ENTRY_DATE_MAX"
            placeholder="日期"
            :aria-label="`第 ${index + 1} 张的日期`"
            @input="onInput('date', $event)"
          ></textarea>
          <textarea
            ref="placeRef"
            class="album-block-input album-block-place"
            :value="entry.place"
            rows="1"
            :maxlength="ALBUM_ENTRY_PLACE_MAX"
            placeholder="地点"
            :aria-label="`第 ${index + 1} 张的地点`"
            @input="onInput('place', $event)"
          ></textarea>
        </div>
      </div>

      <textarea
        ref="bodyRef"
        class="album-block-input album-block-body"
        :value="entry.body"
        rows="2"
        :maxlength="ALBUM_ENTRY_BODY_MAX"
        placeholder="写这一张字…（空一行分段）"
        :aria-label="`第 ${index + 1} 张的正文`"
        @input="onInput('body', $event)"
      ></textarea>
    </div>
  </article>
</template>

<style scoped>
/* ── 一块 = 一张照片 + 这一张的字 ────────────────────────────────────────
   版式照抄阅读层 `.album-entry`：图在上、文字 `30% / 1fr` 两栏。
   颜色一律从 `--liquid-text-primary` 现混（暗色它翻成浅色 ⇒ 本文件一条
   暗色覆盖都不用补），字体继承宿主的 `--composer-album-font`。 */
.album-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.album-block-photo {
  position: relative;
  border-radius: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 5%, transparent);
}

.album-block-photo-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

/* 宽度铺满、高度按原图比例长：`height: auto` + 原比例 ⇒ 与阅读层同一个「不裁切」口径。
   `max-height` 只是**编辑器的视口上限**（一张 3:4 竖图在 620px 宽下会到 827px，
   比整张编辑卡片还高），触到上限时由 `object-fit: cover` 裁掉多余部分 ——
   想看整张点图进大图预览。 */
.album-block-photo-btn img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 46vh;
  object-fit: cover;
}

.album-block-photo-fail {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 132px;
  padding: 18px 14px;
  color: var(--liquid-text-secondary, #6b6b70);
}

.album-block-fail-name {
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  word-break: break-all;
}

.album-block-fail-retry {
  padding: 6px 14px;
  border: 1px solid color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 16%, transparent);
  border-radius: 999px;
  background: none;
  color: var(--liquid-text-primary, #1d1d1f);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.album-block-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 18%, transparent);
  border-top-color: var(--liquid-text-primary, #1d1d1f);
  animation: album-block-spin 720ms linear infinite;
}

@keyframes album-block-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 序号：白字 + 深色底片，压在左下角（与阅读层无序号，但编辑器需要它做定位锚） */
.album-block-no {
  position: absolute;
  left: 7px;
  bottom: 7px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10.5px;
  line-height: 1.5;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

/* 「⋯」按钮：照片上的唯一控件（上一版这里是四个） */
.album-block-menu-wrap {
  position: absolute;
  top: 7px;
  right: 7px;
}

.album-block-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  /* 深色底片 + 白图标：照片亮（天空 / 雪 / 白墙）时，白底按钮会整块糊进背景里
     （2026-11-16 桌面截图实测：第一张图的「⋯」直接看不见）。与 01 序号角标同一套。 */
  background: rgba(20, 20, 24, 0.5);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background-color 0.18s ease;
}

.album-block-menu-btn:hover {
  background: rgba(20, 20, 24, 0.72);
}

/* ⚠️ 菜单锚在照片内部、上限 `calc(100% - 16px)`：宿主滚动容器 `overflow-y: auto`
   会裁掉任何越界的浮层（AGENTS.md 有同类事故记录）。 */
.album-block-menu {
  position: absolute;
  top: 34px;
  right: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  min-width: 132px;
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 5px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
}

.album-block-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: #1c1b18;
  font-size: 12.5px;
  line-height: 1.2;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.album-block-menu-item:hover:not(:disabled) {
  background: rgba(15, 23, 42, 0.06);
}

.album-block-menu-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.album-block-menu-item.is-danger {
  color: #d93025;
}

/* 文字区：30% / 1fr，与阅读层 `.album-entry-text` 同一个网格 */
.album-block-text {
  display: grid;
  grid-template-columns: 30% 1fr;
  column-gap: 14px;
  align-items: start;
  margin-top: 12px;
  min-width: 0;
  font-family: var(--composer-album-font, inherit);
}

.album-block-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.album-block-when {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

/* 字段：没有描边、没有底色 —— 边界就是一次点击就该消失的东西。
   唯一的分隔是焦点态那条底线（见 `:focus-visible`）。 */
.album-block-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 3px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  line-height: 1.45;
  resize: none;
  overflow: hidden;
}

/* ⚠️ 必须显式压掉焦点环：暗色主题有一条全局
   `[data-theme='dark'] :focus-visible { outline: 2px solid … }`（dark-mode.css），
   它的特异性与「只写 outline: none」打平 ⇒ 暗色下这些框会出现生硬的蓝色矩形，
   和「底边发丝线加深」的设计意图直接打架（2026-11-16 实测截图）。
   `.album-block-input:focus-visible` + scoped 的 `[data-v]` 属性选择器足够压过它。 */
.album-block-input:focus-visible {
  outline: none;
}

.album-block-input::placeholder {
  color: var(--liquid-text-tertiary, #9a9a9f);
}

.album-block-title {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.04em;
  border-bottom: 1px solid transparent;
  transition: border-color 0.18s ease;
}

.album-block-date,
.album-block-place {
  font-size: 11px;
  line-height: 1.7;
  color: var(--liquid-text-tertiary, #8c887f);
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid transparent;
  transition: border-color 0.18s ease;
}

/* 短字段需要一条「正在编辑哪一个」的边界：光标行数太少，光靠光标看不见 */
.album-block-date:focus,
.album-block-place:focus {
  border-bottom-color: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 22%, transparent);
}

/* ── 压掉暗色主题给所有 textarea:focus 的蓝色矩形 ─────────────────────────────
   全局那条在 `themes/dark-mode.css`：
     `[data-theme="dark"] textarea:focus { border-color: 蓝 40%; box-shadow: 0 0 0 4px 蓝 10% }`
   它是给「有边框的输入框」设计的；落到这套无边框、只靠发丝线站位的字段上，
   就是一块生硬的蓝色矩形，和「底边线加深」的设计意图直接打架（2026-11-16 暗色实测）。
   特异性：全局那条是 (0,3,0)；下面每条都带 `.album-block-text` 祖先前缀、再叠 scoped
   的 `[data-v]`，(0,4,0) 稳压 —— 不靠样式表源序去赌（Vue scoped 的注入顺序不保证）。 */
.album-block-text .album-block-input:focus {
  box-shadow: none;
}

.album-block-text .album-block-title:focus {
  border-bottom-color: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 32%, transparent);
}

.album-block-text .album-block-date:focus,
.album-block-text .album-block-place:focus {
  border-bottom-color: color-mix(in srgb, var(--liquid-text-primary, #1d1d1f) 22%, transparent);
}
.album-block-body {
  font-size: 13px;
  line-height: 1.9;
  color: var(--liquid-text-secondary, #45433d);
  /* 上限住 CSS：超过部分框内滚，整块永远比一屏矮 */
  max-height: 260px;
}

/* 正文**不画聚焦底线**：它是这一栏里唯一的元素，光标本身就能说明焦点在哪。
   给它一条线，在 `30% / 1fr` 的版式里只盖住右栏 —— 看起来像一条多画的分隔线
   （2026-11-16 竖屏截图实测）。短字段（标题 / 日期 / 地点）才需要边界。 */

/* 失败态：整块降饱和，别在视觉上继续假装它有照片 */
.album-block.is-failed .album-block-photo {
  border: 1px solid color-mix(in srgb, var(--danger, #d93025) 26%, transparent);
}

/* 窄屏（<640）：仍是 30% / 1fr —— 与阅读层同口径，不在这里另开一套堆叠版式 */
@media (max-width: 420px) {
  .album-block-text {
    column-gap: 11px;
  }

  .album-block-title {
    font-size: 14.5px;
  }
}

/* ── 矮横屏（1024×640 这类）────────────────────────────────────────────────
   这一档可视高度只有 ~380px：一张 3:4 竖图按 46vh 吃到 294px，加上字就撑破一屏。
   压到 32vh ⇒「一屏一块」勉强成立，滚一下能到下一块，不至于永远只看到图。 */
@media (orientation: landscape) and (max-height: 700px) {
  .album-block-photo-btn img {
    max-height: 32vh;
  }

  .album-block-text {
    margin-top: 10px;
  }
}
</style>
