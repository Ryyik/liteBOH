<template>
  <Transition name="fade">
    <div v-if="show" class="member-detail-overlay" @click="$emit('close')">
      <div class="member-detail-card glass-card" @click.stop>
        <button class="detail-close-btn" @click="$emit('close')">&times;</button>
        <div class="detail-content">
          <div class="detail-avatar">
            <img v-if="member?.avatar" :src="getImageUrl('developer/' + member.avatar)"
              :alt="member.name" class="avatar-img" loading="lazy"
              @error="(e) => e.target.style.display = 'none'">
            <div class="avatar-placeholder">
              {{ member?.name?.charAt(0) }}
            </div>
          </div>
          <div class="detail-info">
            <h3 class="detail-name">{{ member?.name }}</h3>
            <div class="member-tag">{{ member?.tag || 'Developer' }}</div>
            <p class="detail-bio">{{ member?.bio || '个人简介即将更新' }}</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { getImageUrl } from "../utils/asset-helper.js";

defineProps({
  show: Boolean,
  member: Object
});

defineEmits(['close']);
</script>

<style scoped>
/* 玻璃样式 - Figma现代风格 */
.glass-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.06);
}

/* 详情弹窗样式 */
.member-detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.member-detail-card {
  width: 90%;
  max-width: 500px;
  padding: 40px;
  position: relative;
  animation: modalScale 0.3s ease-out;
}

@keyframes modalScale {
  from {
    transform: scale(0.9);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.detail-close-btn {
  position: absolute;
  top: 15px;
  right: 20px;
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #636e72;
  transition: color 0.3s ease;
}

.detail-close-btn:hover {
  color: #000;
}

.detail-content {
  display: flex;
  align-items: center;
  gap: 30px;
}

.detail-avatar {
  flex-shrink: 0;
  position: relative;
  width: 100px;
  height: 100px;
}

.detail-info {
  flex: 1;
}

.detail-name {
  font-size: 32px;
  font-weight: 700;
  color: #000;
  margin-bottom: 8px;
}

.member-tag {
  display: inline-block;
  padding: 4px 12px;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 15px;
}

.detail-bio {
  font-size: 16px;
  color: #636e72;
  line-height: 1.6;
}

.avatar-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  z-index: 2;
  box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
}

.avatar-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: white;
  font-weight: 700;
  z-index: 1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .detail-content {
    flex-direction: column;
    text-align: center;
    gap: 20px;
  }

  .detail-name {
    font-size: 26px;
  }
}

@media (max-width: 480px) {
  .detail-avatar {
    width: 70px;
    height: 70px;
    font-size: 28px;
  }
  
  .avatar-placeholder {
     font-size: 28px;
  }
}
</style>
