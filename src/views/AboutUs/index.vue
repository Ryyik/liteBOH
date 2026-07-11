<template>
  <div class="about-us-page">

    <!-- Section 1: Hero -->
    <section class="hero-section" ref="heroSection">
      <div class="hero-island" aria-hidden="true"
        :style="{ transform: `translateY(${heroParallax}px) scale(${1 - heroProgress * 0.3})`, opacity: 1 - heroProgress * 1.5 }">
        <svg viewBox="0 0 200 160" class="island-svg">
          <rect class="island-block" style="--delay: 0.00s; --dx: 0; --dy: 0" x="80" y="80" width="40" height="40" rx="6" />
          <rect class="island-block" style="--delay: 0.05s; --dx: -30; --dy: 10" x="50" y="90" width="30" height="30" rx="5" />
          <rect class="island-block" style="--delay: 0.10s; --dx: 40; --dy: 5" x="120" y="85" width="35" height="35" rx="5" />
          <rect class="island-block" style="--delay: 0.15s; --dx: -10; --dy: -25" x="70" y="55" width="25" height="25" rx="4" />
          <rect class="island-block" style="--delay: 0.20s; --dx: 25; --dy: -30" x="105" y="50" width="30" height="30" rx="5" />
          <rect class="island-block" style="--delay: 0.25s; --dx: 60; --dy: -10" x="140" y="70" width="20" height="20" rx="3" />
          <rect class="island-block" style="--delay: 0.30s; --dx: -45; --dy: -5" x="35" y="75" width="22" height="22" rx="3" />
          <rect class="island-block" style="--delay: 0.35s; --dx: 10; --dy: -55" x="90" y="25" width="28" height="28" rx="4" />
          <rect class="island-block" style="--delay: 0.40s; --dx: -20; --dy: -45" x="60" y="35" width="18" height="18" rx="3" />
          <rect class="island-block" style="--delay: 0.45s; --dx: 35; --dy: -45" x="125" y="35" width="20" height="20" rx="3" />
          <rect class="island-block" style="--delay: 0.50s; --dx: 80; --dy: 15" x="160" y="95" width="18" height="18" rx="3" />
          <rect class="island-block" style="--delay: 0.55s; --dx: -60; --dy: 20" x="20" y="100" width="20" height="20" rx="3" />
        </svg>
      </div>
      <div class="hero-content"
        :style="{ transform: `translateY(${heroProgress * -60}px)`, opacity: 1 - heroProgress * 0.8 }">
        <p class="hero-eyebrow">BOH 社群</p>
        <h1 class="hero-title">不止于方块。</h1>
        <p class="hero-subtitle">由每一个热爱方块的人共同搭建。</p>
      </div>
      <div class="hero-scroll-hint" :style="{ opacity: 1 - heroProgress * 3 }">
        <span>向下滚动</span>
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
          <path d="M8 2v18M3 15l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </section>

    <!-- Section 2: Manifesto (Scroll-driven word reveal) -->
    <section class="manifesto-section" ref="manifestoSection">
      <div class="manifesto-sticky">
        <p v-for="(line, lineIndex) in manifestoLines" :key="lineIndex" class="manifesto-line">
          <span v-for="(word, wordIndex) in line" :key="wordIndex"
            class="manifesto-word"
            :class="getWordClass(lineIndex, wordIndex)">
            {{ word }}&nbsp;
          </span>
        </p>
      </div>
    </section>

    <!-- Section 3: Bento Box -->
    <section class="bento-section">
      <div class="bento-wrapper">
        <p class="section-eyebrow" v-motion-slide-visible-once-bottom>我们是谁</p>
        <div class="bento-grid">

          <!-- Card 1: Values (Large Square) -->
          <div class="bento-card card-values" v-motion-slide-visible-once-bottom>
            <div>
              <p class="card-eyebrow">方块价值观</p>
              <h2 class="card-title">包容与尊重。</h2>
            </div>
          </div>

          <!-- Card 2: Members (Small) -->
          <div class="bento-card card-members" v-motion-slide-visible-once-bottom :delay="100">
            <span class="card-big-number">150+</span>
            <span class="card-members-label">来自不同城市的 Blocker</span>
          </div>

          <!-- Card 3: Creation (Wide) -->
          <div class="bento-card card-creation" v-motion-slide-visible-once-bottom :delay="200">
            <div>
              <p class="card-eyebrow">BOH 创作</p>
              <h2 class="card-title">创意永不打烊。</h2>
            </div>
          </div>

          <!-- Card 4: Culture (Wide) -->
          <div class="bento-card card-culture" v-motion-slide-visible-once-bottom :delay="300">
            <h2 class="card-title">特别的社群文化。</h2>
          </div>

        </div>
      </div>
    </section>

    <!-- Section: Activities -->
    <section class="activities-section">
      <div class="activities-header" v-motion-slide-visible-once-bottom>
        <p class="section-eyebrow">我们做什么</p>
        <h2 class="section-title">不止于造物，<br>更在于相聚。</h2>
        <p class="activities-subtitle">365 天，总有新灵感在方块之家发生。</p>
      </div>

      <div class="tags-cloud" v-motion-slide-visible-once-bottom>
        <span v-for="(tag, index) in activityTags" :key="index" class="activity-tag"
          :style="{ '--tag-delay': `${index * 0.06}s` }">
          {{ tag }}
        </span>
      </div>

      <div class="activities-grid-wrapper">
        <div class="activities-grid">
          <div v-for="(item, index) in activities" :key="index" class="activity-text-card"
            v-motion-slide-visible-once-bottom :delay="index * 50">
            <h3 class="activity-card-title">{{ item.title }}</h3>
            <p class="activity-card-desc">{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 4: The People -->
    <section class="people-section">
      <div class="people-wrapper">
        <div class="people-header" v-motion-slide-visible-once-bottom>
          <p class="section-eyebrow">遇见</p>
          <h2 class="section-title">背后的推手</h2>
        </div>

        <div class="people-grid">
          <div v-for="(person, index) in people" :key="person.name" class="person-card"
            v-motion-slide-visible-once-bottom :delay="index * 100">
            <div class="person-avatar">
              <img :src="person.image" :alt="person.name" class="person-img" loading="lazy">
            </div>
            <h3 class="person-name">{{ person.name }}</h3>
            <p class="person-role">{{ person.role }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 5: Timeline -->
    <section class="timeline-section" ref="timelineSection">
      <div class="timeline-wrapper">
        <div class="timeline-header" v-motion-slide-visible-once-bottom>
          <p class="section-eyebrow">我们的旅程</p>
          <h2 class="section-title">八年，一块一块搭起来。</h2>
        </div>

        <!-- Progress Line -->
        <div class="timeline-line-track">
          <div class="timeline-line-fill" :style="{ height: `${timelineProgress * 100}%` }"></div>
        </div>

        <div class="timeline-list">
          <div v-for="(item, index) in timeline" :key="item.year" class="timeline-item"
            :class="{ 'even': index % 2 === 0, 'odd': index % 2 !== 0 }"
            :ref="el => { if (el) timelineRefs[index] = el }">

            <!-- Dot -->
            <div class="timeline-dot" :class="isTimelineActive(index) ? 'dot-active' : ''"></div>

            <!-- Content -->
            <div class="timeline-content" :class="isTimelineActive(index) ? 'content-active' : ''">
              <span class="timeline-year" :class="isTimelineActive(index) ? 'active' : 'inactive'">
                {{ item.year }}
              </span>
              <p class="timeline-desc">{{ item.desc }}</p>
            </div>

            <!-- Spacer for the other side -->
            <div class="timeline-spacer"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 6: CTA -->
    <section class="cta-section">
      <!-- Floating blocks decoration -->
      <div class="cta-blocks" aria-hidden="true">
        <span class="cta-float-block" style="--x: 8%; --y: 15%; --s: 24px; --d: 0s;"></span>
        <span class="cta-float-block" style="--x: 85%; --y: 20%; --s: 18px; --d: 0.5s;"></span>
        <span class="cta-float-block" style="--x: 15%; --y: 70%; --s: 20px; --d: 1s;"></span>
        <span class="cta-float-block" style="--x: 78%; --y: 75%; --s: 28px; --d: 1.5s;"></span>
        <span class="cta-float-block" style="--x: 50%; --y: 10%; --s: 16px; --d: 2s;"></span>
        <span class="cta-float-block" style="--x: 92%; --y: 50%; --s: 22px; --d: 2.5s;"></span>
        <span class="cta-float-block" style="--x: 5%; --y: 45%; --s: 18px; --d: 3s;"></span>
      </div>
      <div v-motion-slide-visible-once-bottom class="cta-wrapper">
        <p class="cta-eyebrow">开始你的旅程</p>
        <h2 class="cta-title">
          准备好加入<br>方块之家了吗？
        </h2>
        <router-link to="/join" class="cta-button">
          立即加入我们
        </router-link>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useScroll, useWindowSize, useElementBounding } from '@vueuse/core';

// Images
import imgRyyik from '../../assets/images/developer/ryyik.webp';
import imgXiaoniu from '../../assets/images/developer/xiaoniu.webp';
import imgLF from '../../assets/images/developer/LF.webp';

// --- Data ---
const manifestoTexts = [
  "方块之家，这里不只有方块。",
  "无论线上或现实，",
  "每一个热爱方块、有想法的人，",
  "共同缔造我们的社群。"
];

// Split manifesto into words per line for word-by-word reveal
const manifestoLines = computed(() =>
  manifestoTexts.map(text => text.split(' '))
);

const activityTags = [
  "冬眠生存传统", "建筑服", "周年庆", "新年抽奖",
  "生日会", "遇见系列", "剧本杀", "狼人杀", "周边共创"
];

const activities = [
  { title: "四季冬眠生存", desc: "每年冬天的传统生存项目，方块之家从 2021 圣诞开始到至今都会在冬天开启 MC 生存服务器系列。" },
  { title: "周年庆", desc: "方块之家周年庆是每年必整的大活，每年都会有专属的周年庆特殊关键词，发布相关的礼物、视频、地图等。" },
  { title: "新年活动", desc: "方块之家 2020 年开始的传统新年抽奖活动，包含地图游戏抽奖等。" },
  { title: "BOH 开学季", desc: "用于统计年份等信息，方块之家每次开学季都会发出公告，或许直到我们毕业为止……" },
  { title: "BOH 遇见系列", desc: "2025 七周年开发的特别活动，在线下遇到 Blocker，一起拍摄 Vlog 旅行。" },
  { title: "BOH 生日会", desc: "方块之家注册成员报名登记生日会之后会有特别的生日会活动地图和礼物！" },
  { title: "方块之家周边", desc: "每年推出一个全新的品类，已知的内容 BOH BAG、BOH 纪念册、BOH 新人玩偶。" },
  { title: "BOH 节日活动", desc: "包含圣诞节、国庆节等节日活动，推出相关地图。" },
];

const people = [
  { name: "Ryyik", role: "御三家", image: imgRyyik },
  { name: "小牛", role: "御三家", image: imgXiaoniu },
  { name: "LF", role: "御三家", image: imgLF },
];

const timeline = [
  { year: "2018", desc: "方块之家创立第一张游戏地图" },
  { year: "2019", desc: "方块之家联机侠服务器开启" },
  { year: "2020", desc: "方块之家各式游戏" },
  { year: "2021", desc: "方块之家 3 周年活动，冬眠生存传统开始" },
  { year: "2022", desc: "方块之家四周年庆典，方块礼盒" },
  { year: "2023", desc: "方块之家五周年纪录片" },
  { year: "2024", desc: "方块之家六周年纪录片" },
  { year: "2025", desc: "方块之家七周年遇见系列" },
  { year: "2026", desc: "方块之家八周年（准备中）" },
];

// --- Hero Scroll Parallax ---
const heroSection = ref(null);
const { y: scrollY } = useScroll(window);
const { height: windowHeight } = useWindowSize();
const { top: heroTop, height: heroHeight } = useElementBounding(heroSection);

const heroProgress = computed(() => {
  const max = heroHeight.value || 1;
  const p = -heroTop.value / max;
  return Math.max(0, Math.min(1, p));
});

const heroParallax = computed(() => heroProgress.value * 80);

// --- Manifesto Word-by-Word Scroll Reveal ---
const manifestoSection = ref(null);
const { top: manifestoTop, height: manifestoHeight } = useElementBounding(manifestoSection);

const manifestoProgress = computed(() => {
  const scrollDistance = -manifestoTop.value;
  const maxScroll = manifestoHeight.value - windowHeight.value;
  if (maxScroll <= 0) return 0;
  return Math.max(0, Math.min(1, scrollDistance / maxScroll));
});

const getWordClass = (lineIndex, wordIndex) => {
  const progress = manifestoProgress.value;
  // Total words across all lines up to this point
  const wordsBefore = manifestoLines.value
    .slice(0, lineIndex)
    .reduce((sum, line) => sum + line.length, 0);
  const wordGlobalIndex = wordsBefore + wordIndex;
  const totalWords = manifestoLines.value.reduce((sum, line) => sum + line.length, 0);

  const threshold = (wordGlobalIndex / totalWords) * 0.85 + 0.05;
  return progress > threshold ? 'word-active' : 'word-inactive';
};

// --- Timeline Scroll Progress ---
const timelineSection = ref(null);
const { top: timelineTop, height: timelineHeight } = useElementBounding(timelineSection);

const timelineProgress = computed(() => {
  const sectionCenter = timelineTop.value + timelineHeight.value / 2;
  const viewportCenter = windowHeight.value / 2;
  const totalDistance = timelineHeight.value - windowHeight.value * 0.4;
  if (totalDistance <= 0) return 0;
  const progress = (viewportCenter - timelineTop.value) / totalDistance;
  return Math.max(0, Math.min(1, progress));
});

// --- Timeline Active Item ---
const timelineRefs = ref([]);
const activeTimelineIndex = ref(0);

const updateTimelineActive = () => {
  const center = windowHeight.value / 2;
  let minDist = Infinity;
  let activeIdx = 0;

  timelineRefs.value.forEach((el, index) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - center);
    if (dist < minDist) {
      minDist = dist;
      activeIdx = index;
    }
  });
  activeTimelineIndex.value = activeIdx;
};

const isTimelineActive = (index) => {
  return index === activeTimelineIndex.value;
};

watch(scrollY, () => {
  updateTimelineActive();
});

onMounted(() => {
  updateTimelineActive();
});

</script>

<style src="./style.global.css"></style>
