<script setup>
import { computed, ref } from 'vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock.js';
import { createDialogFocusTrapDirective } from '@/views/DataManagement/composables/useDialogFocusTrap.js';
import './motion.css';

/**
 * BohModal — 全站唯一弹窗壳（plans/045 组件 3/4）
 *
 * 内置（页面零样板）：
 *   · Teleport 到 body + 遮罩（玻璃 scrim，材质读 --liquid-*）；
 *   · 滚动锁：useBodyScrollLock 引用计数，叠层/卸载安全；
 *   · 键盘可达性：createDialogFocusTrapDirective（开时移焦入弹层、Tab 圈住、
 *     Esc 关闭且 stopPropagation、关闭归还焦点）；
 *   · v-model 开关 + 出入场动画（motion.css 的 boh-fade / boh-pop）；
 *   · 窄屏（≤560px）自动变底部 Sheet：对齐到底、grab 条出现——同一组件两种形态。
 *
 * 定制口子（只开这五个，别再往里加）：
 *   · maxWidth —— 弹层最大宽度（默认 420px；窄屏仍占满）；
 *   · #head —— 整块自定义头部（kicker + 标题 + 图标关闭钮这类形态）；
 *     用了它就不渲染默认 title/关闭钮，关闭按钮要自己给；
 *   · flush —— 去掉 body 内衬（内容自带 padding 的通栏布局：搜索栏 + 列表）；
 *   · portraitPage —— 竖屏**整页**形态（不贴底）。断点走 `orientation`，与 Shop
 *     9 份弹层既有口径一致（plans/037 定它「全站最成熟的形态」）：竖屏铺满视口、
 *     零圆角零边框、无 grab 条；横屏仍回到居中弹窗（maxWidth 生效）。
 *     与默认窄屏贴底 Sheet 的区别是**心智**而非像素：贴底是「浮一层」，
 *     整页是「翻到下一页」，用户能看到导航语义差异，所以由宿主显式选择。
 *   · morph —— 宿主自己跑**形变**进场/退场（从被点的那张卡片推开、收回）。
 *     见 composables/useBohMorphSurface.js。默认 false。
 *     ⚠️ 为真时 dialog **不挂 `boh-pop`**，只留遮罩的 `boh-fade` —— 这不是省事，
 *     是必须：`boh-pop` 是 CSS transition，而形变是 WAAPI，CSS Cascade 里
 *     transitions 在最后一档、**会压过 animations**（论坛详情 2026-10-31 实测：
 *     面板宽度全程不动、只剩淡入，且没有任何报错）。transition 与 WAAPI 不能在
 *     同一个元素上抢 transform / opacity，所以由壳让出这条通道。
 *
 * 层级：overlay 的 z-index 读 `--boh-z-modal`（tokens.css，2147482600）——
 * 全站 z-index 是一张乱账（导航 9999、灵动岛 10001、商城弹层/详情 2147482400、
 * 主编辑工具栏 2147482501、图片查看器 2147483000、登录 2147483500），
 * 弹窗必须落在「详情层之上、查看器之下」这一格，不要在组件里写死数字。
 *
 * ⚠️ v-dialog-focus 指令必须挂在 overlay 上（keydown 从后代冒泡到它才接得住），
 *    且指令生命周期跟 v-if 走 —— 所以 overlay 的显隐用 v-if 而不是 css 隐藏。
 *
 * @example
 * <BohModal v-model="showEdit" title="编辑资料">
 *   …表单内容…
 *   <template #footer>
 *     <BohButton variant="ghost" @click="showEdit = false">取消</BohButton>
 *     <BohButton variant="primary" :loading="saving" @click="save">保存</BohButton>
 *   </template>
 * </BohModal>
 */
const props = defineProps({
  /** v-model：是否打开 */
  modelValue: { type: Boolean, default: false },
  /** 标题（同时作为 aria-label） */
  title: { type: String, default: '' },
  /** 点遮罩是否关闭（危险流程建议 false，强制走按钮） */
  closeOnBackdrop: { type: Boolean, default: true },
  /** 是否渲染右上角关闭按钮 */
  showClose: { type: Boolean, default: true },
  /** 弹层最大宽度（CSS 长度）；空串用默认 420px。窄屏仍占满 */
  maxWidth: { type: String, default: '' },
  /**
   * 弹层最大高度（CSS 长度）；空串用默认 `min(78vh, 720px)`。
   * 与 maxWidth 配对 —— 需要「比默认 78vh 更高」的宿主才传（结算横屏要
   * `min(620px, 100vh - 40px)`：844×390 下 350px，而默认 78vh 只有 304px，
   * 会把底部结算条裁掉 46px）。竖屏整页形态由 portraitPage 接管，本项不生效。
   */
  maxHeight: { type: String, default: '' },
  /** 去掉 body 内衬——内容自带 padding 的通栏布局用 */
  flush: { type: Boolean, default: false },
  /** 竖屏整页形态（不贴底）；断点走 orientation，横屏仍居中弹窗 */
  portraitPage: { type: Boolean, default: false },
  /**
   * 宿主自己跑形变进出场：为真时 dialog 不挂 `boh-pop`（见文件头说明）。
   * 宿主需自己引用 useBohMorphSurface 并对 dialog 元素跑形变。
   */
  morph: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'close']);

/** 指令实例：变量名 vDialogFocus 会自动注册成 v-dialog-focus */
const vDialogFocus = createDialogFocusTrapDirective();

const isOpen = computed(() => props.modelValue);

useBodyScrollLock(isOpen, 'boh-modal');

/** 面板元素：`morph` 宿主要靠它跑形变（useBohMorphSurface 的 surfaceRef）。 */
const dialogRef = ref(null);
defineExpose({ dialogRef });

/** 两个几何口子都走 CSS 变量（不写内联 width/height，免得分叉默认值）。 */
const dialogStyle = computed(() => {
  const style = {};
  if (props.maxWidth) style['--boh-modal-max-w'] = props.maxWidth;
  if (props.maxHeight) style['--boh-modal-max-h'] = props.maxHeight;
  return Object.keys(style).length ? style : null;
});

function requestClose() {
  emit('update:modelValue', false);
  emit('close');
}

function onBackdropClick(event) {
  if (!props.closeOnBackdrop) return;
  if (event.target === event.currentTarget) requestClose();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="boh-fade">
      <div
        v-if="isOpen"
        v-dialog-focus="requestClose"
        class="boh-modal__overlay"
        :class="{ 'boh-modal__overlay--page': portraitPage }"
        @click="onBackdropClick"
      >
        <Transition :name="morph ? 'boh-morph' : 'boh-pop'" appear>
          <div
            ref="dialogRef"
            class="boh-modal__dialog"
            :class="{
              'boh-modal__dialog--page': portraitPage,
              'boh-modal__dialog--morph': morph,
            }"
            role="dialog"
            aria-modal="true"
            :aria-label="title || '对话框'"
            :style="dialogStyle"
          >
            <div class="boh-modal__grab" aria-hidden="true"></div>
            <header v-if="$slots.head" class="boh-modal__head boh-modal__head--slot">
              <slot name="head" />
            </header>
            <!-- morph 宿主自带头部（形变体就是它自己，壳不能再插一条 52px 的标题栏：
                 那会让可见体多出一截、形变窗口与卡片对不上）。 -->
            <header v-else-if="!morph && (title || showClose)" class="boh-modal__head">
              <h4 class="boh-modal__title">{{ title }}</h4>
              <button
                v-if="showClose"
                type="button"
                class="boh-modal__close"
                aria-label="关闭"
                @click="requestClose"
              >
                ×
              </button>
            </header>
            <div class="boh-modal__body" :class="{ 'boh-modal__body--flush': flush }">
              <slot />
            </div>
            <footer v-if="$slots.footer" class="boh-modal__foot">
              <slot name="footer" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.boh-modal__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--boh-z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.boh-modal__dialog {
  width: min(var(--boh-modal-max-w, 420px), calc(100vw - 48px));
  /* 默认 min(78vh, 720px)；宿主可通过 maxHeight 口子抬高（见 prop 注释）。 */
  max-height: var(--boh-modal-max-h, min(78vh, 720px));
  display: flex;
  flex-direction: column;
  background: var(--liquid-bg-strong);
  border: 1px solid var(--liquid-border-strong);
  backdrop-filter: var(--liquid-filter-lg);
  -webkit-backdrop-filter: var(--liquid-filter-lg);
  box-shadow: var(--liquid-highlight), var(--liquid-shadow-overlay);
  border-radius: var(--liquid-radius-lg);
  overflow: hidden;
}

/* grab 条只在窄屏 Sheet 形态显示 */
.boh-modal__grab {
  display: none;
}

.boh-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 0;
}

/* #head 槽自带内衬：宿主头部的 kicker/标题/关闭钮有自己的 padding 节奏 */
.boh-modal__head--slot {
  padding: 0;
}

.boh-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--liquid-text-primary);
}

.boh-modal__close {
  appearance: none;
  border: none;
  cursor: pointer;
  font: inherit;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  color: var(--liquid-text-secondary);
  background: var(--liquid-bg-nested);
  transition: background-color var(--duration-fast) var(--ease-out);
}
.boh-modal__close:hover {
  background: var(--liquid-bg);
}

.boh-modal__body {
  padding: 12px 24px 6px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.7;
  color: var(--liquid-text-secondary);
}

/* 通栏内容自带 padding（搜索栏 + 列表这类）时用 flush，滚动仍由本层接管 */
.boh-modal__body--flush {
  padding: 0;
  /* flush 的语义是「内衬和滚动都由宿主的那个唯一子元素自己管」——
     那就必须把**高度**也交给它，否则它是拿不到确定高度的：
       体没有 `flex`/`min-height:0` ⇒ 高度 = 内容高度（min-height:auto 压不下去）
       ⇒ 子元素 `height:100%` 的包含块退化成 auto ⇒ 子元素照样按内容长高，
          overflow:hidden 的 dialog 把多出来的部分裁掉。
     实测（2026-11-24 结算迁壳）：844×390 横屏下 .ck-sheet 量到 455px，
      而 dialog 只有 350px ⇒ 底部结算条整条被裁到视口外。
     ⚠️ 这三行只作用于 flush；默认形态（标题 + 正文 + footer）完全不变。 */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.boh-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px 22px;
}

/* 窄屏：自动变底部 Sheet（同一组件两种形态） */
@media (max-width: 560px) {
  .boh-modal__overlay {
    align-items: flex-end;
  }
  .boh-modal__dialog {
    width: 100%;
    border-radius: var(--liquid-radius-lg) var(--liquid-radius-lg) 0 0;
    /* 窄屏贴底形态默认 86vh；但宿主显式给了 maxHeight 时以宿主为准 ——
       否则 560px 宽的**横屏**（如 560×400）会走进这条媒体查询，
       把 maxHeight 口子静默盖掉。 */
    max-height: var(--boh-modal-max-h, 86vh);
  }
  .boh-modal__grab {
    display: block;
    width: 40px;
    height: 5px;
    flex: 0 0 auto;
    margin: 10px auto 0;
    border-radius: 3px;
    background: var(--liquid-border-strong);
  }
  .boh-modal__head {
    padding-top: 10px;
  }
}

/* 竖屏整页形态（portraitPage）：铺满视口、零圆角零边框、无 grab 条。
   断点走 orientation 而非宽度 —— 与 Shop 9 份弹层的既有口径一致（plans/037
   把「竖屏全屏 / 横屏居中」定为全站最成熟形态）。横屏走不进来，仍回到居中弹窗。
   必须写在上面那条 max-width 媒体查询**之后**：同特异性下靠源序覆盖。 */
@media (orientation: portrait) {
  .boh-modal__overlay--page {
    align-items: stretch;
    /* 整页形态背后**没有可压暗的页面**（它自己就是一屏），保留半透明遮罩只会
       把整页糊成一层灰 —— 与原 CheckoutSheet / OrderDetailSheet 的
       `@media (orientation: portrait) { .scrim { display: none } }` 同一语义。
       用 transparent 而不是 display:none：overlay 还要接点击（closeOnBackdrop）
       与焦点陷阱，不能整个消失。 */
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .boh-modal__dialog--page {
    width: 100%;
    height: 100%;
    max-height: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    /* 整页背后就是站点自己的页面 ⇒ 半透明玻璃只会把下面那层糊成一片脏底。
       改不透明页面色（与 OrderDetail / Checkout / ProductDetail 同一档），
       顺手省掉一趟全屏 backdrop-filter 的合成开销。 */
    background: var(--boh-page-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  /* 整页不是「浮一层」而是「翻到下一页」，grab 条（拖拽暗示）必须消失 */
  .boh-modal__dialog--page .boh-modal__grab {
    display: none;
  }
  /* 整页下内容区自己要吃掉剩余高度并独立滚动（默认形态靠 max-height 收口）——
     少了这两条，flush 宿主的内层滚动容器拿不到确定高度，长列表会顶穿视口。 */
  .boh-modal__dialog--page .boh-modal__body {
    flex: 1;
    min-height: 0;
  }
}

/* 形变宿主（`morph`）：dialog 退化成**纯定位容器**，视觉体完全交给宿主。
   为什么必须这样：形变是宿主自己的 `.detail-surface` 从被点卡片推开，
   如果 dialog 还画着自己的玻璃底 + 边框 + 阴影，会看到**两层外壳**同时展开
   （外层是 1120 宽的完整面板，内层才是那个从卡片长出来的窗口）。
   所以这里把它剥干净：无底色、无边框、无阴影、无圆角、不裁切、不限制尺寸。
   宿主的元素将成为唯一可见体，clip-path 与圆角都在它身上，视觉才是一条。
   ⚠️ `overflow: visible` 也不能省 —— dialog 默认 hidden 会把形变窗口以外的
      宿主角落裁掉，退场时窗口缩到卡片的一瞬间会「啪」地切一刀。 */
.boh-modal__dialog--morph {
  width: auto;
  height: auto;
  max-height: none;
  background: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: visible;
}
/* morph 与 portraitPage 同时开时，morph 赢：整页那套 `width/height: 100%` 是给
   「壳自己当可见体」准备的，而 morph 下可见体是宿主元素，壳必须让位。
   用属性选择器提一级特异性，不靠源序 —— 这两块都是单类选择器，谁写在后面谁赢，
   太容易被后面的编辑破坏。 */
.boh-modal__dialog--morph.boh-modal__dialog--page {
  width: auto;
  height: auto;
}
</style>
