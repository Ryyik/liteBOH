<template>
  <transition name="fade">
    <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-card theme-modal-card">
        <div class="modal-visual-header theme-header">
          <div class="modal-icon-circle">
            <Palette class="emoji-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
          </div>
          <button class="close-icon-btn" @click="$emit('close')" aria-label="关闭">
            <X :size="18" :stroke-width="1.9" aria-hidden="true" />
          </button>
        </div>
        <div class="modal-body-clean">
          <h3 class="clean-title">主题设置</h3>
          <p class="clean-desc">
            选择适合您的界面主题，深色模式更适合夜间使用。
          </p>

          <div class="theme-options">
            <div class="theme-option" :class="{ active: currentThemePreference === 'light' }"
              @click="$emit('select', 'light')">
              <div class="theme-preview light-preview">
                <div class="preview-header"></div>
                <div class="preview-content">
                  <div class="preview-line"></div>
                  <div class="preview-line short"></div>
                </div>
              </div>
              <span class="theme-name">浅色模式</span>
              <Check v-if="currentThemePreference === 'light'" class="theme-check" :size="16" :stroke-width="2.2"
                aria-hidden="true" />
            </div>

            <div class="theme-option" :class="{ active: currentThemePreference === 'dark' }"
              @click="$emit('select', 'dark')">
              <div class="theme-preview dark-preview">
                <div class="preview-header"></div>
                <div class="preview-content">
                  <div class="preview-line"></div>
                  <div class="preview-line short"></div>
                </div>
              </div>
              <span class="theme-name">深色模式</span>
              <Check v-if="currentThemePreference === 'dark'" class="theme-check" :size="16" :stroke-width="2.2"
                aria-hidden="true" />
            </div>

            <div class="theme-option" :class="{ active: currentThemePreference === 'system' }"
              @click="$emit('select', 'system')">
              <div class="theme-preview system-preview">
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
              </div>
              <span class="theme-name">跟随系统</span>
              <Check v-if="currentThemePreference === 'system'" class="theme-check" :size="16" :stroke-width="2.2"
                aria-hidden="true" />
            </div>

            <div class="theme-option home-cat-theme-option" :class="{ active: currentThemePreference === 'home-cat' }"
              @click="$emit('select', 'home-cat')">
              <div class="theme-preview home-cat-preview">
                <HomeCatMascot type="theme" size="sm" decorative />
                <div class="home-cat-preview-lines" aria-hidden="true">
                  <span></span>
                  <span></span>
                </div>
              </div>
              <span class="theme-name">方块小窝</span>
              <Check v-if="currentThemePreference === 'home-cat'" class="theme-check" :size="16" :stroke-width="2.2"
                aria-hidden="true" />
            </div>
          </div>

          <div class="clean-actions">
            <button class="ghost-btn-clean" @click="$emit('select', 'system')">
              跟随系统
            </button>
            <button class="primary-btn-clean" @click="$emit('close')">
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { Palette, X, Check } from 'lucide-vue-next';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

defineProps({
  open: {
    type: Boolean,
    default: false
  },
  currentThemePreference: {
    type: String,
    default: ''
  }
});

defineEmits(['close', 'select']);
</script>

<style scoped>
/* Styles are provided globally via UserSpaceMain's style imports */
</style>