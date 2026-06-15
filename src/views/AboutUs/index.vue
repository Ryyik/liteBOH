<template>
  <div class="about-us-page">
    <UnifiedNavbar />

    <!-- Section 1: Hero -->
    <section class="hero-section">
      <div v-motion :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 1000, type: 'spring', damping: 20 } }" class="hero-content">
        <h1 class="hero-title">
          不止于方块。
        </h1>
        <p class="hero-subtitle">
          BOH社群
        </p>
      </div>
    </section>

    <!-- Section 2: Manifesto (Scroll Reveal) -->
    <section class="manifesto-section" ref="manifestoSection">
      <div class="manifesto-sticky">
        <p v-for="(text, index) in manifestoTexts" :key="index" class="manifesto-text"
          :class="getManifestoClass(index)">
          {{ text }}
        </p>
      </div>
    </section>

    <!-- Section 3: Bento Box -->
    <section class="bento-section">
      <div class="bento-wrapper">
        <div class="bento-grid">

          <!-- Card 1: Values (Large Square) -->
          <div class="bento-card card-values" v-motion-slide-visible-once-bottom>
            <div>
              <h3 class="card-subtitle">方块价值观</h3>
              <p class="card-title">包容与尊重。</p>
            </div>
            <div class="card-gradient-box"></div>
          </div>

          <!-- Card 2: Creation (Wide) -->
          <div class="bento-card card-creation" v-motion-slide-visible-once-bottom :delay="100">
            <h3 class="card-subtitle">BOH创作</h3>
            <p class="card-title">创意永不打烊。</p>
          </div>

          <!-- Card 3: Members (Small) -->
          <div class="bento-card card-members" v-motion-slide-visible-once-bottom :delay="200">
            <span class="card-big-number">150+</span>
            <span class="card-members-label">社群成员</span>
          </div>

          <!-- Card 4: Culture (Small) -->
          <div class="bento-card card-culture" v-motion-slide-visible-once-bottom :delay="300">
            <p class="card-culture-text">特别的<br>社群文化。</p>
          </div>

        </div>
      </div>
    </section>
    <!-- Section: Activities -->
    <section class="activities-section">
      <div class="activities-header" v-motion-slide-visible-once-bottom>
        <h2 class="section-title">不止于造物，<br>更在于相聚。</h2>
        <p class="activities-subtitle">365天，总有新灵感在方块之家发生。</p>

        <!-- 药丸标签云 -->
        <div class="tags-cloud">
          <span v-for="(tag, index) in activityTags" :key="index" class="activity-tag">
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- 静态网格展示 (文字卡片) -->
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
        <h2 class="section-title" v-motion-slide-visible-once-bottom>
          遇见背后的推手
        </h2>

        <div class="people-grid">
          <div v-for="(person, index) in people" :key="person.name" class="person-card group"
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
    <section class="timeline-section">
      <div class="timeline-wrapper">
        <!-- Vertical Line -->
        <div class="timeline-line"></div>

        <div class="timeline-list">
          <div v-for="(item, index) in timeline" :key="item.year" class="timeline-item"
            :class="{ 'even': index % 2 === 0, 'odd': index % 2 !== 0 }"
            :ref="el => { if (el) timelineRefs[index] = el }">

            <!-- Dot -->
            <div class="timeline-dot"></div>

            <!-- Content -->
            <div class="timeline-content">
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
      <div v-motion-slide-visible-once-bottom class="cta-wrapper">
        <h2 class="cta-title">
          准备好开启<br>新旅程了吗？
        </h2>
        <router-link to="/join" class="cta-button">
          立即加入我们
        </router-link>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useScroll, useWindowSize, useElementBounding } from '@vueuse/core';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';

// Images
// Using relative paths to be safe
import imgRyyik from '../../assets/images/developer/ryyik.webp';
import imgXiaoniu from '../../assets/images/developer/xiaoniu.webp';
import imgLF from '../../assets/images/developer/LF.webp';




// --- Data ---
const manifestoTexts = [
  "方块之家，这里不只有方块。",
  "无论线上或现实，",
  "每一个热爱方块，有想法的人，",
  "共同缔造我们的社群。"
];
// --- 活动数据 ---
const activityTags = [
  "冬眠生存传统", "建筑服", "周年庆", "新年抽奖",
  "生日会", "遇见系列", "剧本杀", "狼人杀", "周边共创"
];

// 活动列表
const activities = [
  { title: "四季冬眠生存", desc: "每年冬天的传统生存项目，方块之家从2021圣诞开始到至今都会在冬天开启MC生存服务器系列" },
  { title: "周年庆", desc: "方块之家周年庆是每年必整的大活，每年都会有专属的周年庆特殊关键词，发布相关的礼物，视频，地图等" },
  { title: "新年活动", desc: "方块之家2020年开始的传统新年抽奖活动，包含地图游戏抽奖等。" },
  { title: "BOH开学季", desc: "用于统计年份等信息，方块之家每次开学季都会发出公告，或许直到我们毕业为止……" },
  { title: "BOH遇见系列", desc: "2025七周年开发的特别活动，在线下遇到Blocker，一起拍摄Vlog旅行。" },
  { title: "BOH生日会", desc: "方块之家注册成员报名登记生日会之后会有特别的生日会活动地图和礼物！" },
  { title: "方块之家周边", desc: "每年推出一个全新的品类，已知的内容BOH BAG，BOH纪念册，BOH新人玩偶" },
  { title: "BOH节日活动", desc: "包含圣诞节，国庆节等节日活动，推出相关地图。" },
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
  { year: "2021", desc: "方块之家3周年活动，冬眠生存传统开始" },
  { year: "2022", desc: "方块之家四周年庆典，方块礼盒" },
  { year: "2023", desc: "方块之家五周年纪录片" },
  { year: "2024", desc: "方块之家六周年纪录片" },
  { year: "2025", desc: "方块之家七周年遇见系列" },
  { year: "2026", desc: "方块之家八周年（准备中）" },
];

// --- Logic for Manifesto Scroll ---
const manifestoSection = ref(null);
const { height: windowHeight } = useWindowSize();
const { y: scrollY } = useScroll(window);
const { top: manifestoTop, height: manifestoHeight } = useElementBounding(manifestoSection);

const getManifestoClass = (index) => {
  if (!manifestoSection.value) return 'inactive';

  const sectionTop = manifestoTop.value;
  const sectionHeight = manifestoHeight.value;
  const viewportHeight = windowHeight.value;

  let scrollDistance = -sectionTop;
  let maxScroll = sectionHeight - viewportHeight;

  if (maxScroll <= 0) maxScroll = 1;

  let progress = scrollDistance / maxScroll;

  // Clamp
  if (progress < 0) progress = 0;
  if (progress > 1) progress = 1;

  // Thresholds: reveal lines progressively
  const threshold = index * 0.2 + 0.1;

  return progress > threshold ? 'active' : 'inactive';
};


// --- Logic for Timeline Highlight ---
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

// Hook into scroll
watch(scrollY, () => {
  updateTimelineActive();
});

const isTimelineActive = (index) => {
  return index === activeTimelineIndex.value;
};

onMounted(() => {
  updateTimelineActive();
});

</script>

<style src="./style.global.css"></style>
