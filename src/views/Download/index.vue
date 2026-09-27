<template>
  <div class="resources-page">
    <!-- Hero -->
    <section class="hero-section">
      <div class="liquid-glass hero-glass">
        <span class="hero-label">RESOURCES</span>
        <h1 class="hero-title">资源中心</h1>
        <p class="hero-subtitle">客户端、服务端与地图资源下载，以及全方位的游戏教程支持</p>

        <!-- 分段控件：下载 / 教程（滑动式选择指示器） -->
        <div class="segmented liquid-glass--pill" role="tablist" ref="segmentedRef">
          <span class="segment-thumb" :style="thumbStyle" aria-hidden="true"></span>
          <button
            v-for="(seg, i) in segments"
            :key="seg.id"
            :ref="(el) => setSegmentBtn(el, i)"
            class="segment-btn"
            :class="{ active: activeSegment === seg.id }"
            role="tab"
            :aria-selected="activeSegment === seg.id"
            @click="switchSegment(seg.id)"
          >
            {{ seg.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- ======================== 下载资源 ======================== -->
    <Transition name="seg" mode="out-in" @after-enter="onPanelEntered">
      <main v-if="activeSegment === 'download'" class="download-container">
        <!-- 类型筛选胶囊 -->
        <div class="filter-row">
          <div class="filter-glass liquid-glass--pill">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="filter-tab"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div class="download-grid">
          <div
            v-for="(item, index) in filteredDownloads"
            :key="item.id"
            class="download-card"
            :style="{ '--delay': index * 80 + 'ms' }"
          >
            <div class="liquid-glass liquid-glass--interactive card-glass">
              <div class="card-top">
                <span class="card-badge" :class="item.type">{{ getTypeName(item.type) }}</span>
                <span class="card-size" v-if="item.size">{{ item.size }}</span>
              </div>

              <div class="card-content">
                <h3 class="item-name">{{ item.name }}</h3>
                <div class="version-glass liquid-glass--strong">
                  <span class="version-label">Version</span>
                  <span class="version-value">{{ item.version }}</span>
                </div>
                <p class="item-description" v-if="item.description">{{ item.description }}</p>
              </div>

              <div class="card-footer">
                <button class="download-btn" @click="handleDownload(item.url)">
                  <span class="btn-text">立即下载</span>
                  <span class="btn-icon">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
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

      <!-- ======================== 教程中心 ======================== -->
      <main v-else class="tutorial-container">
        <!-- 工具行：搜索 + 类型筛选 -->
        <div class="tutorial-toolbar">
          <div class="search-box liquid-glass--strong">
            <svg
              class="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              v-model="searchQuery"
              placeholder="搜索教程内容..."
              @input="handleSearch"
              @focus="isSearchFocused = true"
              @blur="handleSearchBlur"
            />
            <transition name="fade">
              <div
                class="liquid-glass search-results-dropdown"
                v-if="searchQuery && isSearchFocused && flattenedResults.length > 0"
              >
                <div
                  v-for="item in flattenedResults"
                  :key="item.id"
                  class="search-result-item"
                  @mousedown="selectSearchResult(item.id)"
                >
                  <span class="result-question">{{ item.question }}</span>
                  <span class="result-section">{{ item.sectionTitle }}</span>
                </div>
              </div>
            </transition>
          </div>

          <div class="filter-glass tutorial-type-pills liquid-glass--pill">
            <button
              v-for="t in tutorialTypes"
              :key="t.id"
              class="filter-tab"
              :class="{ active: tutorialType === t.id }"
              @click="tutorialType = t.id"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <div class="tutorial-layout" ref="tocLayoutRef">
          <!-- 移动端侧拉遮罩 -->
          <transition name="fade">
            <div
              class="sidebar-overlay"
              v-if="isMobileTocOpen"
              @click="isMobileTocOpen = false"
            ></div>
          </transition>

          <!-- 左侧目录（滚动驱动停靠，见 tocTop/updateTocTop） -->
          <aside
            class="tutorial-sidebar liquid-glass--subtle"
            :class="{ 'mobile-open': isMobileTocOpen }"
            :style="{ '--toc-top': tocTop }"
          >
            <nav class="toc-nav">
              <div v-for="(section, sIndex) in filteredContent" :key="sIndex" class="toc-section">
                <h3 class="toc-section-title">{{ section.title }}</h3>
                <ul class="toc-list">
                  <li
                    v-for="(item, iIndex) in section.items"
                    :key="iIndex"
                    :class="{ active: activeId === item.id }"
                    @click="handleTocClick(item.id)"
                  >
                    {{ item.question }}
                  </li>
                </ul>
              </div>
            </nav>
          </aside>

          <!-- 右侧内容 -->
          <div class="tutorial-content" ref="contentRef">
            <div v-if="filteredContent.length === 0" class="no-results">未找到相关内容</div>
            <div
              v-else
              v-for="(section, sIndex) in filteredContent"
              :key="sIndex"
              class="content-section"
            >
              <h2 class="section-title">{{ section.title }}</h2>
              <div
                v-for="(item, iIndex) in section.items"
                :key="iIndex"
                :id="item.id"
                class="qa-item"
                :style="{ '--rd': Math.min(iIndex * 50, 300) + sIndex * 80 + 'ms' }"
              >
                <h4 class="qa-question">{{ item.question }}</h4>
                <div class="qa-answer">
                  <div v-if="item.coreSteps" class="answer-block liquid-glass">
                    <span class="block-label">核心步骤</span>
                    <p>{{ item.coreSteps }}</p>
                  </div>
                  <div v-if="item.extraInfo" class="answer-block supplementary liquid-glass">
                    <span class="block-label">补充说明</span>
                    <p>{{ item.extraInfo }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- AI 提问卡片 -->
            <div class="ai-suggestion-section">
              <div class="ai-suggestion-card liquid-glass--subtle">
                <div class="ai-icon-wrapper">AI</div>
                <div class="ai-text-content">
                  <p class="ai-prompt-text">未找到你想找的内容？来问问BOH AI</p>
                </div>
                <button class="ai-action-btn" @click="goToAiChat">
                  立即提问
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- 移动端目录按钮 -->
          <button
            class="mobile-toc-trigger"
            @click="isMobileTocOpen = !isMobileTocOpen"
            :class="{ active: isMobileTocOpen }"
            aria-label="打开目录"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      </main>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { downloadsData } from '@/data/downloads.js';
import { TUTORIAL_SECTIONS } from '@/data/tutorials';

const router = useRouter();
const route = useRoute();

/* ---------- 导航高度同步（不写死 64/80px，灵动岛展开会变高） ---------- */
let navResizeObserver = null;
const syncNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.resources-page');
  if (!nav || !page) return;
  page.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
};

/* ---------- 目录侧栏停靠：全局 body overflow-x:hidden(!important) 破坏了
   position:sticky，改用 fixed + 动态 top：
   top = max(导航下方, 目录自然位置)。页面在顶部时贴住自然位置不遮 Hero，
   向下滚动自动吸附到导航下方。 ---------- */
const tocLayoutRef = ref(null);
const tocTop = ref('160px');
const updateTocTop = () => {
  if (activeSegment.value !== 'tutorial' || !tocLayoutRef.value) return;
  const nav = document.getElementById('unified-nav-container');
  const dockTop = (nav ? nav.offsetHeight : 64) + 24;
  const rect = tocLayoutRef.value.getBoundingClientRect();
  tocTop.value = `${Math.max(dockTop, rect.top)}px`;
};

/* ---------- 顶层分段（带滑动指示器） ---------- */
const activeSegment = ref('download');
const segments = [
  { id: 'download', label: '下载资源' },
  { id: 'tutorial', label: '教程中心' },
];
const segmentedRef = ref(null);
const segmentBtnRefs = ref([]);
const setSegmentBtn = (el, i) => {
  if (el) segmentBtnRefs.value[i] = el;
};
const thumbStyle = ref({ width: '90px', transform: 'translateX(0px)' });
const updateThumb = () => {
  const i = segments.findIndex((s) => s.id === activeSegment.value);
  const el = segmentBtnRefs.value[i];
  if (el) {
    thumbStyle.value = {
      width: `${el.offsetWidth}px`,
      transform: `translateX(${el.offsetLeft}px)`,
    };
  }
};
const switchSegment = (id) => {
  activeSegment.value = id;
  nextTick(() => {
    updateThumb();
    updateTocTop();
  });
};

/* ---------- 下载资源 ---------- */
const activeTab = ref('all');
const tabs = [
  { id: 'all', label: '全部资源' },
  { id: 'client', label: '客户端' },
  { id: 'server', label: '服务端' },
  { id: 'map', label: '地图' },
];
const downloads = ref(downloadsData);
const filteredDownloads = computed(() => {
  if (activeTab.value === 'all') return downloads.value;
  return downloads.value.filter((item) => item.type === activeTab.value);
});
const getTypeName = (type) => {
  const types = { client: '客户端', server: '服务端', map: '游戏/地图' };
  return types[type] || '其他';
};
const handleDownload = (_url) => {
  alert('该内容过大，请前往社群下载。');
};

/* ---------- 教程中心 ---------- */
const searchQuery = ref('');
const activeId = ref('');
const contentRef = ref(null);
const isMobileTocOpen = ref(false);
const isSearchFocused = ref(false);
const tutorialType = ref('all');
const tutorialTypes = [
  { id: 'all', label: '全部' },
  { id: 'client', label: '客户端' },
  { id: 'server', label: '服务端' },
];

const goToAiChat = () => {
  router.push('/ai-chat');
};

// 教程数据单源见 @/data/tutorials.js —— 资源中心页与全局搜索（plans/020）共用一份
const rawTutorialData = TUTORIAL_SECTIONS;

const filteredContent = computed(() => {
  let data =
    tutorialType.value === 'all'
      ? rawTutorialData
      : rawTutorialData.filter((section) => {
          if (tutorialType.value === 'client') return section.title.includes('客户端');
          if (tutorialType.value === 'server') return section.title.includes('服务端');
          return true;
        });

  if (!searchQuery.value) return data;

  const query = searchQuery.value.toLowerCase();
  return data
    .map((section) => {
      const matchedItems = section.items.filter(
        (item) =>
          item.question.toLowerCase().includes(query) ||
          item.coreSteps.toLowerCase().includes(query) ||
          (item.extraInfo && item.extraInfo.toLowerCase().includes(query)),
      );
      return { ...section, items: matchedItems };
    })
    .filter((section) => section.items.length > 0);
});

const flattenedResults = computed(() => {
  if (!searchQuery.value) return [];
  const results = [];
  filteredContent.value.forEach((section) => {
    section.items.forEach((item) => {
      results.push({
        id: item.id,
        question: item.question,
        sectionTitle: section.title.split('、')[1] || section.title,
      });
    });
  });
  return results;
});

const scrollToItem = (id) => {
  activeId.value = id;
  const element = document.getElementById(id);
  // 内容区跟随整页滚动，用 scrollIntoView + .qa-item 的 scroll-margin-top 避让导航
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const handleTocClick = (id) => {
  scrollToItem(id);
  isMobileTocOpen.value = false;
};

const handleSearchBlur = () => {
  setTimeout(() => {
    isSearchFocused.value = false;
  }, 200);
};

const selectSearchResult = (id) => {
  scrollToItem(id);
  isSearchFocused.value = false;
};

const handleSearch = () => {
  if (filteredContent.value.length > 0 && filteredContent.value[0].items.length > 0) {
    activeId.value = filteredContent.value[0].items[0].id;
  }
};

const handleScroll = () => {
  updateTocTop();
  if (activeSegment.value !== 'tutorial' || !contentRef.value) return;

  // 整页滚动：按视口内谁越过阈值线来高亮目录
  const items = contentRef.value.querySelectorAll('.qa-item');
  const threshold = 180;
  let current = items.length ? items[0].id : '';

  for (const item of items) {
    if (item.getBoundingClientRect().top <= threshold) {
      current = item.id;
    } else {
      break;
    }
  }
  if (current) activeId.value = current;
};

onMounted(() => {
  // 支持 /download?tab=tutorial 直达教程分段
  if (route.query.tab === 'tutorial') {
    activeSegment.value = 'tutorial';
  }
  if (rawTutorialData.length > 0 && rawTutorialData[0].items.length > 0) {
    activeId.value = rawTutorialData[0].items[0].id;
  }
  nextTick(() => {
    updateThumb();
    updateTocTop();
  });
  syncNavHeight();
  const nav = document.getElementById('unified-nav-container');
  if (nav && typeof ResizeObserver !== 'undefined') {
    navResizeObserver = new ResizeObserver(() => {
      syncNavHeight();
      updateTocTop();
    });
    navResizeObserver.observe(nav);
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', onResize);
});

const onResize = () => {
  updateThumb();
  updateTocTop();
};

/* 面板过渡入场后重新测量（out-in 模式下新面板延迟进 DOM，nextTick 测不到） */
const onPanelEntered = () => {
  updateThumb();
  updateTocTop();
};

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('resize', onResize);
  if (navResizeObserver) {
    navResizeObserver.disconnect();
    navResizeObserver = null;
  }
});
</script>

<style scoped>
/* ============================================================
   资源中心（下载 + 教程融合）— 统一液态玻璃
   玻璃一律走 tokens.css 的 --liquid-* / .liquid-glass 类库，
   页面内不写散装 backdrop-filter。
   ============================================================ */

.resources-page {
  --nav-h: 64px;
  --text-1: #1d1d1f;
  --text-2: #6e6e73;
  --text-3: #98a2b3;
  --spring: cubic-bezier(0.32, 0.72, 0, 1);

  min-height: 100vh;
  padding-top: calc(var(--nav-h) + 24px);
  color: var(--text-1);
  position: relative;
  /* 注意：不要加 overflow-x: hidden，会让侧栏 position:sticky 失效 */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* ============================================================
   HERO
   ============================================================ */
.hero-section {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 40px 32px;
}

.hero-glass {
  padding: 44px 48px 40px;
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
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent);
}

.hero-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--text-3);
  margin-bottom: 18px;
  text-transform: uppercase;
  padding: 7px 15px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin-bottom: 12px;
  color: var(--text-1);
}

.hero-subtitle {
  font-size: 16px;
  color: var(--text-2);
  max-width: 480px;
  line-height: 1.6;
  font-weight: 400;
  margin-bottom: 28px;
}

/* ---------- 分段控件（iOS 风格 + 滑动指示器） ---------- */
.segmented {
  position: relative;
  display: inline-flex;
  gap: 4px;
  padding: 5px;
  background: rgba(255, 255, 255, 0.55);
}

.segment-thumb {
  position: absolute;
  top: 5px;
  left: 0;
  height: calc(100% - 10px);
  border-radius: 999px;
  background: #ffffff;
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  transition:
    transform 0.45s var(--spring),
    width 0.45s var(--spring);
  will-change: transform;
}

.segment-btn {
  position: relative;
  z-index: 1;
  padding: 11px 28px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: color 0.3s var(--spring);
}

.segment-btn:hover {
  color: var(--text-1);
}

.segment-btn.active {
  color: var(--text-1);
  font-weight: 700;
}

/* ============================================================
   下载资源
   ============================================================ */
.download-container {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 40px 100px;
}

.filter-row {
  display: flex;
  justify-content: center;
  margin-bottom: 36px;
}

.filter-glass {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 5px;
  background: rgba(255, 255, 255, 0.55);
  width: fit-content;
}

.filter-tab {
  position: relative;
  padding: 10px 22px;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: all 0.3s var(--spring);
  white-space: nowrap;
}

.filter-tab:hover {
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.6);
}

.filter-tab.active {
  color: var(--text-1);
  background: #ffffff;
  font-weight: 600;
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.download-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 24px;
}

.download-card {
  position: relative;
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
  padding: 32px;
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.card-badge {
  display: inline-flex;
  align-items: center;
  padding: 7px 15px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: rgba(255, 255, 255, 0.6);
  color: var(--text-2);
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.card-badge.client {
  color: var(--text-1);
}

.card-size {
  font-size: 13px;
  color: var(--text-3);
  font-weight: 500;
}

.card-content {
  flex-grow: 1;
}

.item-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 20px;
  line-height: 1.4;
  color: var(--text-1);
}

.version-glass {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
  padding: 18px 24px;
  border-radius: 16px;
}

.version-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.version-value {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: -0.02em;
  font-feature-settings: 'tnum';
}

.item-description {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.7;
  margin: 0;
}

.card-footer {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}

.download-btn {
  width: 100%;
  padding: 15px 28px;
  background: #1d1d1f;
  color: #ffffff;
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
  transition: all 0.3s var(--spring);
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
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  transition: left 0.5s ease;
}

.download-btn:hover {
  background: #000000;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
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

/* ============================================================
   教程中心
   ============================================================ */
.tutorial-container {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 40px 100px;
}

.tutorial-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 560px;
  display: flex;
  align-items: center;
  border-radius: 999px;
  transition:
    box-shadow 0.3s var(--spring),
    transform 0.3s var(--spring);
}

.search-box:focus-within {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.1);
}

.search-icon {
  position: absolute;
  left: 20px;
  width: 18px;
  height: 18px;
  color: var(--text-3);
  pointer-events: none;
}

.search-box input {
  width: 100%;
  padding: 14px 22px 14px 50px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  background: transparent;
  outline: none;
  color: var(--text-1);
}

.search-box input::placeholder {
  color: var(--text-3);
  font-weight: 400;
}

.search-results-dropdown {
  position: absolute;
  top: calc(100% + 12px);
  left: 0;
  right: 0;
  border-radius: 24px;
  max-height: 420px;
  overflow-y: auto;
  z-index: 100;
  padding: 12px;
  scrollbar-width: none;
}

.search-results-dropdown::-webkit-scrollbar {
  display: none;
}

.search-result-item {
  padding: 13px 18px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 4px;
}

.search-result-item:hover {
  background: rgba(15, 23, 42, 0.05);
}

.result-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.4;
}

.result-section {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tutorial-type-pills {
  flex-shrink: 0;
}

.tutorial-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.sidebar-overlay {
  display: none;
}

.tutorial-sidebar {
  width: 300px;
  flex-shrink: 0;
  border-radius: 24px;
  overflow-y: auto;
  padding: 20px 12px;
  max-height: calc(100vh - var(--nav-h) - 48px);
  /* 全局 html/body overflow-x:hidden(!important) 使 sticky 失效，
     改为 fixed + JS 动态 --toc-top 停靠（见 updateTocTop） */
  position: fixed;
  top: var(--toc-top, 160px);
  /* 对齐 .tutorial-container（max-width 1200 + 40px 内边距）的内容起点 */
  left: max(64px, calc((100vw - 1120px) / 2));
  z-index: 5;
  scrollbar-width: none;
}

.tutorial-sidebar::-webkit-scrollbar {
  display: none;
}

.tutorial-content {
  flex: 1;
  min-width: 0;
  /* 给 fixed 侧栏让位 */
  margin-left: 320px;
  padding: 8px 0 40px;
  scroll-behavior: smooth;
}

.toc-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toc-section {
  margin-bottom: 20px;
}

.toc-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 10px;
  padding-left: 18px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-list li {
  padding: 11px 18px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-2);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.4;
  margin-bottom: 4px;
}

.toc-list li:hover {
  background-color: rgba(255, 255, 255, 0.7);
  color: var(--text-1);
}

.toc-list li.active {
  background-color: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.content-section {
  max-width: 840px;
  margin: 0 auto 64px;
}

.section-title {
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 36px;
  color: var(--text-1);
  letter-spacing: -0.02em;
}

.qa-item {
  margin-bottom: 56px;
  /* 目录 scrollIntoView 跳转时避让固定导航栏 */
  scroll-margin-top: calc(var(--nav-h) + 36px);
  animation: riseIn 0.55s cubic-bezier(0.32, 0.72, 0, 1) both;
  animation-delay: var(--rd, 0ms);
}

@keyframes riseIn {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.qa-question {
  font-size: 21px;
  font-weight: 700;
  color: var(--text-1);
  margin-bottom: 22px;
  line-height: 1.3;
  display: flex;
  align-items: flex-start;
  letter-spacing: -0.01em;
}

.qa-question::before {
  content: 'Q';
  color: #ffffff;
  background: linear-gradient(135deg, #1d1d1f 0%, #434345 100%);
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  margin-right: 16px;
  margin-top: 1px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.qa-answer {
  padding-left: 48px;
}

.answer-block {
  border-radius: 20px;
  padding: 26px 28px;
  margin-bottom: 20px;
  transition:
    transform 0.35s var(--spring),
    box-shadow 0.35s var(--spring);
}

.answer-block:hover {
  transform: translateY(-2px);
  box-shadow:
    var(--liquid-highlight, inset 0 1px 0 rgba(255, 255, 255, 0.86)),
    inset 0 -1px 0 rgba(255, 255, 255, 0.22),
    0 16px 40px rgba(15, 23, 42, 0.1);
}

.supplementary {
  border-left: 3px solid #1d1d1f;
}

.block-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-1);
  background: rgba(15, 23, 42, 0.06);
  padding: 4px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.supplementary .block-label {
  background: #1d1d1f;
  color: #f5f5f7;
}

.answer-block p {
  font-size: 15px;
  line-height: 1.8;
  color: #424245;
  margin: 0;
  font-weight: 400;
  white-space: pre-wrap;
}

.answer-block p b,
.answer-block p strong {
  color: var(--text-1);
  font-weight: 700;
}

.no-results {
  text-align: center;
  padding: 100px 0;
  color: var(--text-3);
  font-size: 17px;
  font-weight: 500;
}

/* ---------- AI 提问卡片 ---------- */
.ai-suggestion-section {
  max-width: 840px;
  margin: 0 auto;
  padding-bottom: 10px;
}

.ai-suggestion-card {
  border-radius: 24px;
  padding: 26px 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  transition: transform 0.3s var(--spring);
}

.ai-suggestion-card:hover {
  transform: translateY(-2px);
}

.ai-icon-wrapper {
  width: 48px;
  height: 48px;
  background: #1d1d1f;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 16px;
  flex-shrink: 0;
}

.ai-text-content {
  flex: 1;
}

.ai-prompt-text {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0;
  letter-spacing: -0.01em;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1d1d1f;
  color: #ffffff;
  border: none;
  padding: 13px 26px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s var(--spring);
  white-space: nowrap;
}

.ai-action-btn:hover {
  background: #000000;
  transform: scale(1.03);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
}

/* ---------- 移动端目录触发按钮 ---------- */
.mobile-toc-trigger {
  display: none;
  position: fixed;
  bottom: 32px;
  right: 24px;
  width: 54px;
  height: 54px;
  border-radius: 27px;
  background: rgba(29, 29, 31, 0.9);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  color: #ffffff;
  border: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  z-index: 60;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: transform 0.35s var(--spring);
}

.mobile-toc-trigger:active {
  transform: scale(0.9);
}

.mobile-toc-trigger svg {
  width: 24px;
  height: 24px;
}

/* ============================================================
   响应式
   ============================================================ */
@media (max-width: 992px) {
  .hero-section {
    padding: 16px 20px 24px;
  }

  .hero-glass {
    padding: 32px 28px;
  }

  .hero-title {
    font-size: 36px;
  }

  .download-container,
  .tutorial-container {
    padding: 0 20px 80px;
  }

  .tutorial-toolbar {
    flex-wrap: wrap;
  }

  .search-box {
    max-width: none;
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 58;
  }

  .tutorial-sidebar {
    position: fixed;
    top: 0 !important;
    left: 0;
    bottom: 0;
    width: 300px;
    max-height: none;
    border-radius: 0 24px 24px 0;
    z-index: 59;
    transform: translateX(-100%);
    box-shadow: 20px 0 50px rgba(0, 0, 0, 0.12);
    padding-top: calc(var(--nav-h) + 16px);
    transition: transform 0.4s var(--spring);
  }

  .tutorial-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-toc-trigger {
    display: flex;
  }

  .tutorial-content {
    margin-left: 0;
    padding: 28px 22px;
  }
}

@media (max-width: 640px) {
  .hero-title {
    font-size: 30px;
  }

  .hero-subtitle {
    font-size: 14px;
  }

  .segment-btn {
    padding: 10px 20px;
    font-size: 13px;
  }

  .download-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .card-glass {
    padding: 24px;
  }

  .item-name {
    font-size: 18px;
  }

  .version-glass {
    padding: 14px 20px;
  }

  .version-value {
    font-size: 22px;
  }

  .download-btn {
    padding: 14px 20px;
  }

  .filter-tab {
    padding: 9px 16px;
    font-size: 13px;
  }

  .qa-answer {
    padding-left: 0;
  }

  .qa-question {
    font-size: 18px;
  }

  .qa-question::before {
    margin-right: 12px;
  }

  .answer-block {
    padding: 20px;
    border-radius: 16px;
  }

  .ai-suggestion-card {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }

  .ai-text-content {
    margin: 14px 0 20px;
  }

  .ai-action-btn {
    width: 100%;
    justify-content: center;
  }
}

/* ---------- 过渡动画 ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 分段面板切换：旧的轻轻上浮淡出，新的自下而上淡入 */
.seg-enter-active {
  transition:
    opacity 0.4s var(--spring),
    transform 0.4s var(--spring);
}

.seg-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.seg-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.995);
}

.seg-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* 教程侧栏 / AI 卡入场（侧栏动画仅桌面端：移动端抽屉依赖 translateX 隐藏，
   动画的 transform 会把它覆盖成常开） */
@media (min-width: 993px) {
  .tutorial-sidebar {
    animation: riseIn 0.5s var(--spring) 0.05s both;
  }
}

.ai-suggestion-card {
  animation: riseIn 0.55s var(--spring) 0.12s both;
}

/* 弱动效偏好：全部动画退化为瞬时 */
@media (prefers-reduced-motion: reduce) {
  .resources-page *,
  .resources-page *::before,
  .resources-page *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* ============================================================
   暗色主题（dark audit 2026-09-08）：
   变量重定义 + 半透明白底/白色激活底逐一换暗色等价物。
   整条 :global(html[data-theme="dark"] .class)，遵守 scoped 暗色铁律。
   ============================================================ */
:global(html[data-theme='dark'] .resources-page) {
  --text-1: #f5f5f7;
  --text-2: #a1a1a6;
  --text-3: #8d8d93;
  color: var(--text-1);
}

:global(html[data-theme='dark'] .resources-page .hero-label) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
  color: #a1a1a6;
}

:global(html[data-theme='dark'] .resources-page .segmented),
:global(html[data-theme='dark'] .resources-page .filter-glass) {
  background: rgba(255, 255, 255, 0.08);
}

:global(html[data-theme='dark'] .resources-page .segment-thumb) {
  background: #4a4a52;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

:global(html[data-theme='dark'] .resources-page .segment-btn.active) {
  color: #f5f5f7;
}

:global(html[data-theme='dark'] .resources-page .filter-tab:hover) {
  background: rgba(255, 255, 255, 0.1);
}

:global(html[data-theme='dark'] .resources-page .filter-tab.active) {
  background: #4a4a52;
  color: #f5f5f7;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

:global(html[data-theme='dark'] .resources-page .card-badge) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
}

:global(html[data-theme='dark'] .resources-page .card-top),
:global(html[data-theme='dark'] .resources-page .card-footer) {
  border-color: rgba(255, 255, 255, 0.1);
}

:global(html[data-theme='dark'] .resources-page .search-result-item:hover) {
  background: rgba(255, 255, 255, 0.07);
}

:global(html[data-theme='dark'] .resources-page .block-label) {
  background: rgba(255, 255, 255, 0.1);
}

:global(html[data-theme='dark'] .resources-page .supplementary) {
  border-left-color: #f5f5f7;
}
</style>
