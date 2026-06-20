<template>
  <div class="download-page">

    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-glass">
        <div class="hero-container">
          <span class="hero-label">RESOURCES</span>
          <h1 class="hero-title">资源下载</h1>
          <p class="hero-subtitle">获取最新的游戏客户端、服务端及精选地图资源</p>
        </div>
      </div>
    </section>

    <!-- Filters -->
    <section class="filter-section">
      <div class="filter-glass">
        <button v-for="tab in tabs" :key="tab.id" class="filter-tab" :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id">
          {{ tab.label }}
        </button>
      </div>
    </section>

    <!-- Download Grid -->
    <main class="download-container">
      <div class="download-grid">
        <div v-for="(item, index) in filteredDownloads" :key="item.id" class="download-card"
          :style="{ '--delay': index * 80 + 'ms' }">
          <div class="card-glass">
            <!-- Card Top: Badge & Size -->
            <div class="card-top">
              <span class="card-badge" :class="item.type">
                {{ getTypeName(item.type) }}
              </span>
              <span class="card-size" v-if="item.size">{{ item.size }}</span>
            </div>

            <!-- Card Main Content -->
            <div class="card-content">
              <h3 class="item-name">{{ item.name }}</h3>

              <!-- Version Display with Bold Styling -->
              <div class="version-glass">
                <span class="version-label">Version</span>
                <span class="version-value">{{ item.version }}</span>
              </div>

              <p class="item-description" v-if="item.description">
                {{ item.description }}
              </p>
            </div>

            <!-- Card Footer: Download Button -->
            <div class="card-footer">
              <button class="download-btn" @click="handleDownload(item.url)">
                <span class="btn-text">立即下载</span>
                <span class="btn-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Background Elements -->
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { downloadsData } from '@/data/downloads.js';

const activeTab = ref('all');

const tabs = [
  { id: 'all', label: '全部资源' },
  { id: 'client', label: '客户端' },
  { id: 'server', label: '服务端' },
  { id: 'map', label: '地图' }
];

const downloads = ref(downloadsData);

const filteredDownloads = computed(() => {
  if (activeTab.value === 'all') return downloads.value;
  return downloads.value.filter(item => item.type === activeTab.value);
});

const getTypeName = (type) => {
  const types = {
    client: '客户端',
    server: '服务端',
    map: '游戏/地图'
  };
  return types[type] || '其他';
};

const handleDownload = (_url) => {
  alert('该内容过大，请前往社群下载。');
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

/* ============================================
   GLASS MORPHISM DESIGN SYSTEM
   Black, White & Gray Color Palette
   ============================================ */

.download-page {
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%);  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #ffffff;
  padding-top: 80px;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}

/* Subtle grid pattern overlay */
.download-page::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}

/* ============================================
   GLASS MORPHISM BASE CLASS
   ============================================ */
.glass-base {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
}

/* ============================================
   HERO SECTION
   ============================================ */
.hero-section {
  position: relative;
  padding: 60px 40px 40px;
  max-width: 1200px;
  margin: 0 auto;
  z-index: 1;
}

.hero-glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 32px;
  padding: 48px;
  position: relative;
  overflow: hidden;
}

.hero-glass::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
}

.hero-container {
  position: relative;
  z-index: 2;
}

.hero-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 20px;
  text-transform: uppercase;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.hero-title {
  font-size: 52px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 16px;
  color: #ffffff;
}

.hero-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
  max-width: 420px;
  line-height: 1.6;
  font-weight: 400;
}

/* ============================================
   FILTER SECTION
   ============================================ */
.filter-section {
  padding: 0 40px 40px;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

.filter-glass {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  width: fit-content;
}

.filter-tab {
  position: relative;
  padding: 12px 24px;
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.filter-tab:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.05);
}

.filter-tab.active {
  color: #000000;
  background: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  box-shadow: 0 4px 20px rgba(255, 255, 255, 0.1);
}

/* ============================================
   DOWNLOAD GRID
   ============================================ */
.download-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 40px 100px;
  position: relative;
  z-index: 1;
}

.download-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 24px;
}

/* ============================================
   DOWNLOAD CARD - GLASS MORPHISM
   ============================================ */
.download-card {
  position: relative;
  border-radius: 28px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  animation: cardFadeIn 0.6s ease forwards;
  animation-delay: var(--delay);
  opacity: 0;
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card-glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.card-glass::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
}

.download-card:hover {
  transform: translateY(-4px);
}

.download-card:hover .card-glass {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 20px 60px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

/* ============================================
   CARD TOP SECTION
   ============================================ */
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.card-badge {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-badge.client {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.card-badge.server {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.card-badge.map {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.card-size {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

/* ============================================
   CARD CONTENT
   ============================================ */
.card-content {
  flex-grow: 1;
}

.item-name {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: 20px;
  line-height: 1.4;
  color: #ffffff;
}

/* ============================================
   VERSION DISPLAY - GLASS STYLE
   ============================================ */
.version-glass {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
  padding: 20px 24px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.version-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.version-value {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
  font-feature-settings: 'tnum';
  text-shadow: 0 2px 10px rgba(255, 255, 255, 0.1);
}

.item-description {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.7;
  margin: 0;
}

/* ============================================
   CARD FOOTER
   ============================================ */
.card-footer {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.download-btn {
  width: 100%;
  padding: 16px 28px;
  background: rgba(255, 255, 255, 0.9);
  color: #000000;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.download-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
  transition: left 0.5s ease;
}

.download-btn:hover {
  background: #ffffff;
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(255, 255, 255, 0.2);
}

.download-btn:hover::before {
  left: 100%;
}

.download-btn:active {
  transform: translateY(0);
}

.btn-icon {
  display: flex;
  align-items: center;
  transition: transform 0.3s ease;
}

.download-btn:hover .btn-icon {
  transform: translateY(2px);
}

/* ============================================
   RESPONSIVE
   ============================================ */
@media (max-width: 768px) {
  .hero-section {
    padding: 40px 24px 32px;
  }

  .hero-glass {
    padding: 32px;
    border-radius: 24px;
  }

  .hero-title {
    font-size: 36px;
  }

  .hero-subtitle {
    font-size: 15px;
  }

  .filter-section {
    padding: 0 24px 32px;
    overflow-x: auto;
  }

  .filter-glass {
    width: 100%;
    flex-wrap: nowrap;
    padding: 6px;
    border-radius: 16px;
  }

  .filter-tab {
    padding: 10px 18px;
    font-size: 13px;
    white-space: nowrap;
  }

  .download-container {
    padding: 0 24px 60px;
  }

  .download-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .card-glass {
    padding: 24px;
    border-radius: 24px;
  }

  .item-name {
    font-size: 18px;
  }

  .version-glass {
    padding: 16px 20px;
  }

  .version-value {
    font-size: 24px;
  }
}

@media (max-width: 480px) {
  .hero-glass {
    padding: 24px;
  }

  .hero-title {
    font-size: 28px;
  }

  .hero-label {
    font-size: 10px;
    padding: 6px 12px;
  }

  .filter-tab {
    padding: 8px 14px;
    font-size: 12px;
  }

  .version-glass {
    padding: 14px 16px;
  }

  .version-value {
    font-size: 22px;
  }

  .download-btn {
    padding: 14px 20px;
  }
}
</style>
