<template>
  <!-- 玻璃材质走站点统一真源（styles/common/liquid-glass.css），这里绝不自己写
       backdrop-filter：check:liquid-glass 会判为第二材质源。 -->
  <div
    class="ieb liquid-glass liquid-glass--subtle liquid-glass--pill"
    role="toolbar"
    aria-label="就地编辑工具栏"
  >
    <button
      type="button"
      class="ieb-btn"
      :class="{ 'is-on': editor.active }"
      :aria-pressed="editor.active"
      @click="editor.toggle()"
    >
      <Pencil v-if="!editor.active" :size="14" :stroke-width="2" aria-hidden="true" />
      <Check v-else :size="14" :stroke-width="2.4" aria-hidden="true" />
      <span>{{ editor.active ? '编辑中' : '浏览模式' }}</span>
    </button>

    <button
      v-if="editor.active"
      type="button"
      class="ieb-btn"
      :disabled="!editor.canUndo"
      @click="editor.undo()"
    >
      <Undo2 :size="14" :stroke-width="2" aria-hidden="true" />
      <span>撤销{{ editor.undoCount ? ` ${editor.undoCount}` : '' }}</span>
    </button>

    <button type="button" class="ieb-btn" @click="emit('exit')">退出</button>
  </div>

  <div v-if="toast?.show" class="ieb-toast" :class="`is-${toast.tone}`" role="status">
    <span>{{ toast.message }}</span>
    <!-- 撤销放在提示条里而不是只靠顶部工具栏：详情弹层 / 阅读层的 z-index 接近
         int32 上限（2147482400），工具栏盖不上去；在弹层里改完一个字，
         撤销入口必须在手边。 -->
    <button v-if="editor.canUndo" type="button" class="ieb-toast-action" @click="editor.undo()">
      撤销
    </button>
  </div>
</template>

<script setup>
import { Check, Pencil, Undo2 } from 'lucide-vue-next';
import { useInlineEditor } from '@/composables/useInlineEditor.js';

/**
 * 就地编辑工具栏 + 提示条（商城 / 资讯 / 首页装修共用一份）。
 *
 * 抽出来的理由很直接：这是**第二个**宿主就要用到的东西，而它包含 200 行定位与
 * 材质样式、两个 z-index 决策（工具栏 9000、提示条压过 2147482400 的弹层）、
 * 以及「撤销必须出现在提示条里」这条踩过坑的结论。复制一份必然漂移。
 *
 * 它只读上下文（`useInlineEditor()`），不持有业务状态：toast 由宿主传进来
 * （宿主才知道「已保存 / 删除失败」的文案），退出动作也交回宿主决定去哪。
 */
defineProps({
  /** { show, tone: 'ok'|'error', message } —— 宿主自己的提示状态 */
  toast: { type: Object, default: null },
});

const emit = defineEmits(['exit']);

const editor = useInlineEditor();
</script>

<style scoped>
/* 材质（背景/描边/投影/blur）全部来自 .liquid-glass*，这里只管定位与排布。
   ⚠️ 文字色必须用 --liquid-text-primary 而不是 --foreground：后者来自 dark-mode.css，
   那个文件按路由懒加载，后台宿主这条链上拿不到 ⇒ 暗色下会是深字压深底。 */
.ieb {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--liquid-text-primary, #1d1d1f);
  transform: translateX(-50%);
}

.ieb-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.ieb-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

/* 反色胶囊不能用 --foreground/--background 做配对（两者都受懒加载影响）：
   直接钉品牌蓝 + 白字，两种主题下对比都够，且与「编辑态」的语义一致。 */
.ieb-btn.is-on {
  background: #0071e3;
  color: #fff;
}

.ieb-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ieb-toast {
  position: fixed;
  /* 抬到移动端底部导航之上：底栏约 88px + 安全区，78px 会被压住半截 */
  bottom: calc(104px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  /* 必须压过商品详情弹层 / 新闻阅读层（2147482400），否则改完看不到「已保存」 */
  z-index: 2147482501;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 86vw;
  padding: 9px 12px 9px 16px;
  border-radius: 999px;
  /* 固定深底白字：两套主题下都是系统 toast 的标准观感，
     也不依赖 dark-mode.css（那条链在后台宿主路由是懒加载的） */
  background: rgba(28, 28, 30, 0.94);
  color: #fff;
  font-size: 13px;
  line-height: 1.35;
  transform: translateX(-50%);
  animation: ieb-toast-in 0.2s ease;
}

.ieb-toast.is-error {
  background: #c4261f;
}

.ieb-toast-action {
  flex: none;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.ieb-toast-action:hover {
  background: rgba(255, 255, 255, 0.32);
}

@keyframes ieb-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ieb-toast {
    animation: none;
  }
}
</style>
