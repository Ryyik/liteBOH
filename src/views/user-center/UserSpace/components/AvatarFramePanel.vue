<template>
  <!-- 头像框（2026-11-10 由弹层改为内联页）
       原来的 AvatarFramePickerModal 是 9300 层的居中弹窗：点「头像框」整页被遮罩压暗，
       在横屏两栏里尤其突兀 —— 左侧目录被糊掉、右侧内容被盖住。
       现在它就是设置的一个三级页：横屏出在右栏、竖屏整页，返回条与其它子页同一条。 -->
  <div class="avatar-frame-panel">
    <!-- 返回条由设置壳（inline-panel 分支）统一提供，这里只画内容 -->

    <section class="gs-group">
      <div class="gs-rows">
        <div class="gs-row is-static">
          <span class="gs-icon is-blue">
            <CircleDot :size="16" :stroke-width="2" aria-hidden="true" />
          </span>
          <span class="gs-text">
            <span class="gs-label">即点即换</span>
            <span class="gs-desc">论坛、评论、个人主页同步展示；会员专属框需要对应档位</span>
          </span>
        </div>
      </div>
    </section>

    <section class="gs-group">
      <div class="afp-grid-card gs-card">
        <AvatarFrameGrid :avatar-url="avatarUrl" @unlock="$emit('close')" />
      </div>
    </section>

    <section class="gs-group">
      <div class="gs-card afp-actions">
        <button type="button" class="gs-btn ghost" @click="handleClear">不佩戴</button>
        <button type="button" class="gs-btn primary" @click="$emit('close')">完成</button>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * 头像框内联面板：内容复用 AvatarFrameGrid（佩戴状态即时生效，useAvatarFrame 单例），
 * 本组件只负责「页壳 + 两个动作」，不持有任何佩戴逻辑。
 */
import { CircleDot } from 'lucide-vue-next';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import AvatarFrameGrid from './AvatarFrameGrid.vue';

defineProps({
  avatarUrl: { type: String, default: '' },
});

defineEmits(['close']);

const { equip } = useAvatarFrame();
const handleClear = () => equip('none');
</script>

<style scoped>
@import '../styles/settings-glass.css';

.avatar-frame-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: afp-in 240ms var(--ease-out, ease-out) both;
}

@keyframes afp-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 网格卡片：与 .gs-rows 同一张卡，内边距由网格自己带 */
.afp-grid-card {
  padding: 16px 18px 18px;
}

.afp-actions {
  flex-direction: row;
  gap: 10px;
  padding: 14px 16px;
}

.afp-actions .gs-btn {
  flex: 1;
}

@media (prefers-reduced-motion: reduce) {
  .avatar-frame-panel {
    animation: none;
  }
}
</style>
