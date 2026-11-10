<template>
  <!-- 主题设置（2026-11-10 由弹层改为内联三级页）
       原来是 ThemeModal：9300 层遮罩 + 居中卡片，在横屏两栏里会把左侧目录一起压暗。
       现在它就是设置的一个三级页：横屏出在右栏、竖屏整页，返回条由设置壳统一提供。
       选项皮肤复用全局 .theme-options / .theme-option（responsive-integrations.css），
       不在这里另造一套 —— 弹窗里那套视觉本来就是全局的。 -->
  <div class="theme-panel">
    <section class="gs-group">
      <div class="gs-rows">
        <div class="gs-row is-static">
          <span class="gs-icon is-blue">
            <Palette :size="16" :stroke-width="2" aria-hidden="true" />
          </span>
          <span class="gs-text">
            <span class="gs-label">当前主题</span>
            <span class="gs-desc">{{ currentLabel }} · 选中即生效，无需额外保存</span>
          </span>
        </div>
      </div>
    </section>

    <section class="gs-group">
      <div class="tp-options-card gs-card">
        <div class="theme-options" role="radiogroup" aria-label="界面主题">
          <button
            v-for="option in THEME_OPTIONS"
            :key="option.value"
            type="button"
            class="theme-option"
            :class="[option.tileClass, { active: preference === option.value }]"
            role="radio"
            :aria-checked="preference === option.value"
            @click="$emit('select', option.value)"
          >
            <div class="theme-preview" :class="option.previewClass">
              <template v-if="option.value === 'home-cat'">
                <HomeCatMascot type="theme" size="sm" decorative />
                <div class="home-cat-preview-lines" aria-hidden="true">
                  <span></span>
                  <span></span>
                </div>
              </template>
              <template v-else-if="option.value === 'anniversary-mc'">
                <span class="mc-preview-sky"></span>
                <span class="mc-preview-grass"></span>
                <span class="mc-preview-dirt"></span>
                <span class="mc-preview-eight">8</span>
                <span class="mc-preview-torch"></span>
              </template>
              <template v-else-if="option.value === 'system'">
                <div class="system-preview-light">
                  <div class="preview-header"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                    <div class="preview-line short"></div>
                  </div>
                </div>
                <div class="system-preview-dark">
                  <div class="preview-header"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                    <div class="preview-line short"></div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="preview-header"></div>
                <div class="preview-content">
                  <div class="preview-line"></div>
                  <div class="preview-line short"></div>
                </div>
              </template>
            </div>
            <span class="theme-name">{{ option.label }}</span>
            <Transition name="check-pop">
              <Check
                v-if="preference === option.value"
                :key="option.value"
                class="theme-check"
                :size="16"
                :stroke-width="2.2"
                aria-hidden="true"
              />
            </Transition>
          </button>
        </div>
      </div>
    </section>

    <section class="gs-group">
      <div class="gs-card tp-actions">
        <button type="button" class="gs-btn ghost" @click="$emit('select', 'system')">
          跟随系统
        </button>
        <button type="button" class="gs-btn primary" @click="$emit('close')">完成</button>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * 主题内联面板：只负责「列选项 + 把选择抛给宿主」。
 * 主题的唯一真源仍在 themeManager（宿主监听后写 data-theme），本组件不持有主题态。
 */
import { computed } from 'vue';
import { Check, Palette } from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

const props = defineProps({
  /** 当前偏好（light / dark / system / home-cat / anniversary-mc） */
  currentThemePreference: { type: String, default: '' },
});

defineEmits(['select', 'close']);

const THEME_OPTIONS = [
  {
    value: 'light',
    label: '浅色模式',
    previewClass: 'light-preview',
    tileClass: '',
  },
  {
    value: 'dark',
    label: '深色模式',
    previewClass: 'dark-preview',
    tileClass: '',
  },
  {
    value: 'system',
    label: '跟随系统',
    previewClass: 'system-preview',
    tileClass: '',
  },
  {
    value: 'home-cat',
    label: '方块小窝',
    previewClass: 'home-cat-preview',
    tileClass: 'home-cat-theme-option',
  },
  {
    value: 'anniversary-mc',
    label: '八周年 MC 限定',
    previewClass: 'anniversary-mc-preview',
    tileClass: 'anniversary-mc-theme-option',
  },
];

const preference = computed(() => props.currentThemePreference || 'light');

const currentLabel = computed(
  () => THEME_OPTIONS.find((option) => option.value === preference.value)?.label || '浅色模式',
);
</script>

<style scoped>
@import '../styles/settings-glass.css';

.theme-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: tp-in 240ms var(--ease-out, ease-out) both;
}

@keyframes tp-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 卡片本体沿用 .gs-card，只把主题网格自己的外边距收掉（本来给弹窗留的白） */
.tp-options-card {
  padding: 8px 16px 16px;
}

.tp-options-card :deep(.theme-options) {
  margin: 8px 0 0;
}

/* 重置按钮的默认外观：.theme-option 本来是 div，这里换成 button 以便键盘可点 */
.tp-options-card :deep(.theme-option) {
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: inherit;
  box-sizing: border-box;
}

.tp-actions {
  flex-direction: row;
  gap: 10px;
  padding: 14px 16px;
}

.tp-actions .gs-btn {
  flex: 1;
}

/* 窄屏（手机竖屏）：三列在 390px 下会把「八周年 MC 限定」挤成两行、预览图压扁。
   改成单列横向行 —— 与设置里其它行同一套阅读顺序（预览左、名字右）。
   ⚠️ 必须带 .tp-options-card 前缀：全局 .theme-options 的 3 列规则写在媒体查询**之后**，
   单靠 `.theme-options { grid-template-columns: 1fr }` 覆盖不掉（同特异性、后者胜）。 */
@media (max-width: 767px) {
  .tp-options-card {
    padding: 4px 10px 12px;
  }

  .tp-options-card :deep(.theme-options) {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .tp-options-card :deep(.theme-option) {
    flex-direction: row;
    justify-content: flex-start;
    gap: 14px;
    padding: 10px 14px 10px 10px;
    text-align: left;
  }

  .tp-options-card :deep(.theme-preview) {
    width: 76px;
    height: 54px;
    flex: none;
  }

  .tp-options-card :deep(.theme-name) {
    font-size: 14px;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-panel {
    animation: none;
  }
}
</style>
