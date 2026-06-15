<template>
  <div class="shows-page" :class="{ 'embedded-mode': embedded }">
    <UnifiedNavbar v-if="!embedded" />

    <!-- Hero Section -->
    <section class="shows-hero">
      <div class="shows-hero-container">
        <span class="shows-hero-label">BOH SHOWS</span>
        <h1 class="shows-hero-title">
          精彩节目
        </h1>
        <p class="shows-hero-subtitle">
          探索方块之家的精选内容，从冬眠生存到创意游戏，<br>
          每一期都是独特的方块世界体验。
        </p>
      </div>
    </section>

    <!-- Featured Show - Winter Survival -->
    <section class="featured-show">
      <div class="featured-show-container">
        <div class="featured-show-badge">Featured</div>
        <div class="featured-show-content">
          <div class="featured-show-text">
            <span class="featured-show-season">Season 4</span>
            <h2 class="featured-show-title">冬眠生存</h2>
            <p class="featured-show-description">
              方块之家最经典的生存系列节目，第四季已完播。<br>
              在寒冷的方块世界中，与伙伴们一起探索、建造、生存。
            </p>
            <div class="featured-show-meta">
              <div class="meta-item">
                <span class="meta-label">状态</span>
                <span class="meta-value">完播</span>
              </div>
              <div class="meta-divider"></div>
              <div class="meta-item">
                <span class="meta-label">集数</span>
                <span class="meta-value">第四季</span>
              </div>
              <div class="meta-divider"></div>
              <div class="meta-item">
                <span class="meta-label">类型</span>
                <span class="meta-value">生存娱乐</span>
              </div>
            </div>
            <div class="featured-show-actions">
              <a href="https://www.bilibili.com/video/BV1gdzTBiECq/?share_source=copy_web" target="_blank"
                class="shows-btn-primary">
                <span>观看原片</span>
                <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>
              <a href="https://www.bilibili.com/video/BV1CFziBiErz/?share_source=copy_web" target="_blank"
                class="shows-btn-secondary">
                观看精剪
              </a>
            </div>
          </div>
          <div class="featured-show-visual">
            <div class="featured-show-image-wrapper">
              <img :src="getImageUrl('@/assets/images/26coffee.webp')" alt="冬眠生存" class="featured-show-image"  loading="lazy" />
              <div class="featured-show-overlay"></div>
              <div class="featured-show-play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Show - Block Street -->
    <section class="featured-show featured-show-alt">
      <div class="featured-show-container">
        <div class="featured-show-badge">New</div>
        <div class="featured-show-content">
          <div class="featured-show-visual">
            <div class="featured-show-image-wrapper">
              <img :src="getImageUrl('@/assets/images/main1.webp')" alt="方块街" class="featured-show-image"  loading="lazy" />
              <div class="featured-show-overlay"></div>
              <div class="featured-show-play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
          <div class="featured-show-text">
            <span class="featured-show-season">New Series</span>
            <h2 class="featured-show-title">方块街</h2>
            <p class="featured-show-description">
              方块之家的商业街建设系列，打造繁华的商业街区。<br>
              体验城市建设的乐趣，创造属于你的方块都市。
            </p>
            <div class="featured-show-meta">
              <div class="meta-item">
                <span class="meta-label">状态</span>
                <span class="meta-value">更新中</span>
              </div>
              <div class="meta-divider"></div>
              <div class="meta-item">
                <span class="meta-label">类型</span>
                <span class="meta-value">城市建设</span>
              </div>
              <div class="meta-divider"></div>
              <div class="meta-item">
                <span class="meta-label">特色</span>
                <span class="meta-value">创意建造</span>
              </div>
            </div>
            <div class="featured-show-actions">
              <a href="https://www.bilibili.com/video/BV1nj421Q7hH/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0"
                target="_blank" class="shows-btn-primary">
                <span>立即观看</span>
                <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>
              <a href="https://www.bilibili.com/video/BV1nj421Q7hH/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0"
                target="_blank" class="shows-btn-secondary">
                了解更多
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <CreatorShowsPanel />

    <!-- Shows Grid -->
    <section class="shows-grid-section">
      <div class="shows-grid-container">
        <div class="shows-grid">
          <div v-for="(show, index) in shows" :key="show.id" class="show-card"
            :style="{ '--delay': index * 100 + 'ms' }">
            <div class="show-card-image-wrapper">
              <img :src="getImageUrl(show.image)" :alt="show.title" class="show-card-image"  loading="lazy" />
              <div class="show-card-overlay">
                <div class="show-card-play">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <div class="show-card-badge" v-if="show.badge">{{ show.badge }}</div>
            </div>
            <div class="show-card-content">
              <div class="show-card-meta">
                <span class="show-card-category">{{ show.category }}</span>
                <span class="show-card-divider"></span>
                <span class="show-card-episodes">{{ show.episodes }}</span>
              </div>
              <h3 class="show-card-title">{{ show.title }}</h3>
              <p class="show-card-description">{{ show.description }}</p>
              <div class="show-card-footer">
                <a :href="show.link" target="_blank" class="show-card-link">
                  观看节目
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Call to Action -->
    <section class="shows-cta">
      <div class="shows-cta-container">
        <div class="shows-cta-content">
          <h2 class="shows-cta-title">想要参与节目录制？</h2>
          <p class="shows-cta-subtitle">
            加入方块之家社群，与我们一起创造更多精彩内容
          </p>
          <router-link to="/join" class="shows-cta-btn">
            加入我们
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';
import CreatorShowsPanel from '../../components/CreatorShowsPanel/index.vue';
import { getImageUrl } from '../../utils/asset-helper.js';

const _props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
});

const shows = ref([
  {
    id: 1,
    title: '冬眠生存 第四季',
    description: '方块之家经典生存系列，在寒冷的方块世界中与伙伴们一起探索、建造、生存。',
    category: '生存挑战',
    episodes: '连载中',
    image: '@/assets/images/26coffee.webp',
    link: 'https://www.bilibili.com/video/BV1gdzTBiECq/?share_source=copy_web',
    badge: '热播',
    type: 'winter'
  },
  {
    id: 2,
    title: '方块街',
    description: '方块之家的方块街建设系列，打造繁华的方块世界街区，体验城市建设的乐趣。',
    category: '模拟建设',
    episodes: '更新中',
    image: '@/assets/images/main1.webp',
    link: 'https://www.bilibili.com/video/BV1nj421Q7hH/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0',
    badge: '新节目',
    type: 'street'
  },
  {
    id: 3,
    title: '新年活动 2025',
    description: '方块之家新年庆典活动，精彩游戏与丰厚奖品，与伙伴们一起欢度佳节。',
    category: '特别活动',
    episodes: '年度特辑',
    image: '@/assets/images/2025-newyear.webp',
    link: 'https://www.bilibili.com/video/BV1nW4y157LA/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0',
    badge: '精选',
    type: 'event'
  }
]);
</script>

<style scoped>
@import './style.scoped.css';
</style>
