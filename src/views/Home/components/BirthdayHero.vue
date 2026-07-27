<template>
  <section class="birthday-hero" aria-label="今日生日">
    <div class="bh-card">
      <!-- 左侧：文案 -->
      <div class="bh-content">
        <p class="bh-eyebrow">
          <span class="bh-eyebrow-dot"></span>
          今天 · 生日特辑
        </p>

        <div v-if="primary" class="bh-hero-group">
          <div class="bh-avatar">
            <img v-if="primary.avatarUrl" :src="primary.avatarUrl" :alt="primary.name" class="bh-avatar-img" loading="lazy" decoding="async">
            <span v-else class="bh-avatar-fallback">{{ initial }}</span>
          </div>

          <h1 class="bh-title">
            祝 <span class="bh-title-name">{{ primary.name }}</span> 生日快乐
          </h1>

          <p class="bh-subtitle">{{ greeting }}</p>

          <div v-if="othersCount > 0" class="bh-others">
            今天还有 <strong>{{ othersCount }}</strong> 位伙伴一起过生日
          </div>

          <div class="bh-actions">
            <router-link to="/birthday" class="bh-button is-primary">
              去送上祝福
              <svg class="bh-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 右侧：蛋糕图片 -->
      <div class="bh-visual">
        <img
          :src="cakeImg"
          alt="生日蛋糕"
          class="bh-cake-img"
          loading="lazy"
          decoding="async"
        >
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import cakeImg from '@/assets/images/cake202512.webp?url'

const props = defineProps({
  // 生日人员列表：[{ name, avatarUrl }]
  people: {
    type: Array,
    default: () => []
  },
  // 自定义问候语
  greeting: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['more'])

// 预览模式：未传入 people 时使用示例数据，方便单独查看效果
const resolvedPeople = computed(() => {
  if (props.people && props.people.length > 0) return props.people
  return [{ name: '小天光', avatarUrl: '' }]
})

const primary = computed(() => resolvedPeople.value[0] || null)

const initial = computed(() => {
  const name = primary.value?.name || ''
  return name ? name.charAt(0).toUpperCase() : 'B'
})

const othersCount = computed(() => Math.max(0, resolvedPeople.value.length - 1))

const defaultGreetings = [
  '新的一岁，愿你所盼皆所愿，所行皆坦途。',
  '愿你今天被世界温柔以待，岁岁年年，皆有归处。',
  '愿这盏烛光，照亮你接下来整整一年。',
  '又一岁，愿你的故事里，依然有方块之家。'
]
const greeting = computed(() => {
  if (props.greeting) return props.greeting
  const name = primary.value?.name || ''
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return defaultGreetings[hash % defaultGreetings.length]
})
</script>

<style scoped>
.birthday-hero {
  position: relative;
  isolation: isolate;
  width: 100%;
  padding: 0 var(--home-hero-gap, 12px);
  background: transparent;
}

.bh-card {
  position: relative;
  width: 100%;
  max-width: var(--apple-container-max, 1200px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  min-height: clamp(520px, 70svh, 760px);
  background: linear-gradient(145deg, #fff7fb 0%, #fef3ea 100%);
  border-radius: 28px;
  box-shadow: 0 24px 70px rgba(255, 175, 200, 0.14);
  overflow: hidden;
  opacity: 0;
  animation: bhCardReveal 1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* ============ 左侧文案 ============ */
.bh-content {
  position: relative;
  z-index: 2;
  padding: clamp(48px, 6vw, 96px) clamp(32px, 5vw, 72px);
  text-align: left;
}

.bh-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 24px;
  font-size: clamp(12px, 1.3vw, 14px);
  font-weight: 650;
  line-height: 1.3;
  color: #d6708d;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bh-eyebrow-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff7a9c, #ffb47a);
  box-shadow: 0 0 0 4px rgba(255, 122, 156, 0.18);
}

.bh-hero-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
}

.bh-avatar {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ffd4e0, #ffe9c4);
  padding: 3px;
  box-shadow: 0 14px 30px rgba(255, 122, 156, 0.22);
  animation: bhAvatarReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}

.bh-avatar-img,
.bh-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #d6708d;
  font-size: 34px;
  font-weight: 700;
}

.bh-title {
  margin: 0;
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 750;
  line-height: 1.08;
  letter-spacing: -0.025em;
  color: #2a1f2d;
  animation: bhTextReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both;
}

.bh-title-name {
  background: linear-gradient(120deg, #ff7a9c 0%, #ff9a62 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.bh-subtitle {
  max-width: 460px;
  margin: 0;
  color: #6b5a64;
  font-size: clamp(16px, 1.7vw, 21px);
  font-weight: 450;
  line-height: 1.5;
  animation: bhTextReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
}

.bh-others {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 980px;
  font-size: 14px;
  color: #6b5a64;
  box-shadow: 0 6px 16px rgba(255, 122, 156, 0.1);
  animation: bhTextReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.55s both;
}

.bh-others strong {
  color: #d6708d;
  font-weight: 700;
}

.bh-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  animation: bhTextReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.7s both;
}

.bh-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 50px;
  padding: 0 28px;
  border-radius: 980px;
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), background-color 260ms ease, box-shadow 260ms ease;
}

.bh-button.is-primary {
  background: linear-gradient(135deg, #ff7a9c, #ff9a62);
  color: #fff;
  border: none;
  box-shadow: 0 12px 30px rgba(255, 122, 156, 0.32);
}

.bh-arrow {
  width: 14px;
  height: 14px;
  transition: transform 260ms ease;
}

.bh-button:hover .bh-arrow {
  transform: translateX(3px);
}

@media (hover: hover) {
  .bh-button.is-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 38px rgba(255, 122, 156, 0.4);
  }
}

.bh-button:active {
  transform: scale(0.97);
}

.bh-button:focus-visible {
  outline: 3px solid rgba(214, 112, 141, 0.4);
  outline-offset: 3px;
}

/* ============ 右侧蛋糕图片 ============ */
.bh-visual {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: clamp(32px, 5vw, 64px);
  animation: bhVisualReveal 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both;
}

.bh-cake-img {
  width: 100%;
  max-width: 480px;
  height: auto;
  object-fit: contain;
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(214, 112, 141, 0.18);
}

/* ============ 动画 ============ */
@keyframes bhCardReveal {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes bhTextReveal {
  from { opacity: 0; transform: translateY(18px); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@keyframes bhAvatarReveal {
  from { opacity: 0; transform: scale(0.7); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes bhVisualReveal {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============ 响应式 ============ */
@media (max-width: 900px) {
  .bh-card {
    grid-template-columns: minmax(0, 1fr);
    min-height: auto;
  }
  .bh-content {
    text-align: center;
    padding: 56px 32px 0;
  }
  .bh-hero-group {
    align-items: center;
  }
  .bh-subtitle {
    margin-left: auto;
    margin-right: auto;
  }
  .bh-actions {
    justify-content: center;
  }
  .bh-visual {
    padding: 32px 32px 56px;
  }
  .bh-cake-img {
    max-width: 380px;
  }
}

@media (max-width: 768px) {
  .birthday-hero {
    padding: 0 16px;
  }
  .bh-card {
    border-radius: 22px;
  }
  .bh-content {
    padding: 48px 24px 0;
  }
  .bh-title {
    font-size: clamp(30px, 8vw, 44px);
  }
  .bh-subtitle {
    font-size: 16px;
  }
  .bh-visual {
    padding: 32px 24px 48px;
  }
  .bh-cake-img {
    max-width: 320px;
  }
}

@media (max-width: 480px) {
  .birthday-hero {
    padding: 0 12px;
  }
  .bh-card {
    border-radius: 20px;
  }
  .bh-content {
    padding: 40px 20px 0;
  }
  .bh-title {
    font-size: 28px;
  }
  .bh-subtitle {
    font-size: 15px;
  }
  .bh-avatar {
    width: 80px;
    height: 80px;
  }
  .bh-visual {
    padding: 28px 20px 40px;
  }
  .bh-cake-img {
    max-width: 280px;
    border-radius: 20px;
  }
}

@media (orientation: landscape) and (max-height: 560px) {
  .bh-card {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: auto;
  }
  .bh-content {
    padding: 40px 32px;
  }
  .bh-visual {
    padding: 32px;
  }
  .bh-cake-img {
    max-width: 320px;
  }
}

@media (orientation: landscape) and (min-width: 768px) {
  .birthday-hero {
    padding: 0;
  }
  .bh-card {
    border-radius: 0;
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bh-card,
  .bh-avatar,
  .bh-title,
  .bh-subtitle,
  .bh-others,
  .bh-actions,
  .bh-visual {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .bh-button {
    transition: none;
  }
}

/* 暗色模式 */
:global([data-theme="dark"]) .bh-card {
  background: linear-gradient(145deg, #2a1f2d 0%, #2d2418 100%);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
}

:global([data-theme="dark"]) .bh-title,
:global([data-theme="dark"]) .bh-visual-eyebrow {
  color: #f4e8ee;
}

:global([data-theme="dark"]) .bh-subtitle,
:global([data-theme="dark"]) .bh-others {
  color: #c4b3bd;
}

:global([data-theme="dark"]) .bh-others {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

:global([data-theme="dark"]) .bh-avatar-fallback {
  background: #2a1f2d;
  color: #ff9bb3;
}
</style>
