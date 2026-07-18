<template>
  <main class="about-us-page">
    <section ref="heroSection" class="about-hero" aria-labelledby="about-title">
      <div class="about-hero-copy" :style="heroCopyStyle">
        <p class="about-kicker">Block of Home · Since 2018</p>
        <h1 id="about-title">方块之家</h1>
        <p class="about-hero-lead">我们从 Minecraft 出发，<br>把共同喜欢的世界，慢慢搭成了家。</p>
      </div>

      <figure class="about-hero-media" :style="heroMediaStyle">
        <img :src="schoolImage" alt="方块之家八周年校园设定集" width="1672" height="941" decoding="async">
        <figcaption>
          <span>BOH 8th Anniversary</span>
          <span>2018—2026</span>
        </figcaption>
      </figure>
    </section>

    <section ref="manifestoSection" class="manifesto-section" aria-label="方块之家宣言">
      <div class="manifesto-sticky">
        <p class="section-label">我们相信</p>
        <h2 class="manifesto-copy">
          <span
            v-for="(character, index) in manifestoCharacters"
            :key="`${character}-${index}`"
            :class="{ active: isManifestoCharacterActive(index) }"
          >{{ character }}</span>
        </h2>
        <p class="manifesto-note">游戏会结束，但一起创造的故事不会。</p>
      </div>
    </section>

    <section ref="chaptersSection" class="chapters-section" aria-label="方块之家的故事">
      <div class="chapters-sticky">
        <header class="chapters-header">
          <p class="section-label">一块一块，成为我们</p>
          <div class="chapter-progress" aria-hidden="true">
            <i v-for="(_, index) in chapters" :key="index" :class="{ active: index <= activeChapterIndex }"></i>
          </div>
        </header>

        <div class="chapters-stage">
          <article
            v-for="(chapter, index) in chapters"
            :key="chapter.number"
            class="chapter"
            :style="getChapterStyle(index)"
            :aria-hidden="Math.abs(index - chapterPosition) > 0.75"
          >
            <div class="chapter-copy">
              <span class="chapter-number">{{ chapter.number }}</span>
              <h2>{{ chapter.title }}</h2>
              <p>{{ chapter.description }}</p>
            </div>
            <figure class="chapter-media">
              <img :src="chapter.image" :alt="chapter.alt" loading="lazy" decoding="async">
            </figure>
          </article>
        </div>
      </div>
    </section>

    <section class="activities-section">
      <div class="section-shell">
        <header class="editorial-header" v-motion-slide-visible-once-bottom>
          <p class="section-label">我们一直在做的事</p>
          <h2>不止于造物，<br>更在于相聚。</h2>
          <p>365 天，总有新的灵感和重逢在方块之家发生。</p>
        </header>

        <div class="activity-index">
          <article
            v-for="(activity, index) in activities"
            :key="activity.title"
            class="activity-row"
            v-motion-slide-visible-once-bottom
            :delay="(index % 4) * 70"
          >
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <h3>{{ activity.title }}</h3>
              <p>{{ activity.description }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="people-section">
      <div class="section-shell">
        <header class="editorial-header people-heading" v-motion-slide-visible-once-bottom>
          <p class="section-label">背后的推手</p>
          <h2>最初的三块基石。</h2>
        </header>

        <div class="people-list">
          <article
            v-for="(person, index) in people"
            :key="person.name"
            class="person-profile"
            v-motion-slide-visible-once-bottom
            :delay="index * 90"
          >
            <img :src="person.image" :alt="person.name" loading="lazy" decoding="async">
            <h3>{{ person.name }}</h3>
            <p>{{ person.role }}</p>
          </article>
        </div>
      </div>
    </section>

    <section ref="timelineSection" class="timeline-section">
      <div class="section-shell">
        <header class="editorial-header" v-motion-slide-visible-once-bottom>
          <p class="section-label">我们的旅程</p>
          <h2>八年，不是一条直线。</h2>
          <p>它由每一次开服、活动、创作与见面共同连接。</p>
        </header>

        <div class="timeline-rail" aria-hidden="true">
          <i :style="{ transform: `scaleX(${timelineProgress})` }"></i>
        </div>
        <div class="timeline-grid">
          <article
            v-for="(item, index) in timeline"
            :key="item.year"
            class="timeline-entry"
            :class="{ reached: index / (timeline.length - 1) <= timelineProgress }"
          >
            <time>{{ item.year }}</time>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="about-cta">
      <div class="about-cta-image" aria-hidden="true">
        <img :src="winterImage" alt="" loading="lazy" decoding="async">
      </div>
      <div class="about-cta-copy" v-motion-slide-visible-once-bottom>
        <p>下一个方块，等你来放。</p>
        <h2>欢迎回家。</h2>
        <router-link to="/join">加入方块之家</router-link>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useElementBounding, usePreferredReducedMotion, useWindowSize } from '@vueuse/core';

import schoolImage from '@/assets/images/blockschool.webp';
import winterImage from '@/assets/images/2025wintermap.webp';
import anniversaryImage from '@/assets/images/2023-7-5years.webp';
import fuzhouImage from '@/assets/images/fuzhou.webp';
import imgRyyik from '@/assets/images/developer/ryyik.webp';
import imgXiaoniu from '@/assets/images/developer/xiaoniu.webp';
import imgLF from '@/assets/images/developer/LF.webp';

const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const preferredMotion = usePreferredReducedMotion();
const { height: viewportHeight } = useWindowSize();

const heroSection = ref(null);
const manifestoSection = ref(null);
const chaptersSection = ref(null);
const timelineSection = ref(null);

const { top: heroTop, height: heroHeight } = useElementBounding(heroSection);
const { top: manifestoTop, height: manifestoHeight } = useElementBounding(manifestoSection);
const { top: chaptersTop, height: chaptersHeight } = useElementBounding(chaptersSection);
const { top: timelineTop, height: timelineHeight } = useElementBounding(timelineSection);

const heroProgress = computed(() => clamp(-heroTop.value / Math.max(heroHeight.value * 0.72, 1)));
const heroCopyStyle = computed(() => {
  if (preferredMotion.value === 'reduce') return undefined;
  return {
    opacity: 1 - heroProgress.value * 0.72,
    transform: `translate3d(0, ${heroProgress.value * -52}px, 0)`,
  };
});
const heroMediaStyle = computed(() => {
  if (preferredMotion.value === 'reduce') return undefined;
  return { transform: `translate3d(0, ${heroProgress.value * -34}px, 0) scale(${1 - heroProgress.value * 0.025})` };
});

const manifestoText = '方块之家，不只存在于方块里。它存在于每一次共同创造，和每一次真诚相遇。';
const manifestoCharacters = Array.from(manifestoText);
const manifestoProgress = computed(() => {
  const travel = Math.max(manifestoHeight.value - viewportHeight.value, 1);
  return clamp((viewportHeight.value * 0.18 - manifestoTop.value) / travel);
});
const isManifestoCharacterActive = (index) => (
  preferredMotion.value === 'reduce' || index / Math.max(manifestoCharacters.length - 1, 1) <= manifestoProgress.value
);

const chapters = [
  {
    number: '01',
    title: '从一个方块开始。',
    description: '地图、服务器和一次次天马行空的创作，让最初的几个人拥有了同一个世界。',
    image: anniversaryImage,
    alt: '方块之家成员在 Minecraft 世界中的合影',
  },
  {
    number: '02',
    title: '把重逢变成传统。',
    description: '冬眠生存、周年庆、新年活动和生日会，让每一年都有值得共同等待的时刻。',
    image: winterImage,
    alt: '方块之家冬眠生存 Minecraft 世界',
  },
  {
    number: '03',
    title: '从线上，走到彼此身边。',
    description: '遇见系列把共同世界带到现实。我们去往不同城市，让屏幕里的名字成为真实的同行者。',
    image: fuzhouImage,
    alt: '方块之家遇见福州活动视觉',
  },
];

const chaptersProgress = computed(() => {
  const travel = Math.max(chaptersHeight.value - viewportHeight.value, 1);
  return clamp(-chaptersTop.value / travel);
});
const chapterPosition = computed(() => chaptersProgress.value * (chapters.length - 1));
const activeChapterIndex = computed(() => Math.min(chapters.length - 1, Math.round(chapterPosition.value)));
const getChapterStyle = (index) => {
  if (preferredMotion.value === 'reduce') {
    return { opacity: index === activeChapterIndex.value ? 1 : 0 };
  }
  const distance = index - chapterPosition.value;
  const visibility = clamp(1 - Math.abs(distance) * 1.35);
  return {
    opacity: visibility,
    transform: `translate3d(0, ${distance * 46}px, 0) scale(${1 - Math.min(Math.abs(distance), 1) * 0.025})`,
    pointerEvents: visibility > 0.5 ? 'auto' : 'none',
  };
};

const activities = [
  { title: '四季冬眠生存', description: '从 2021 年延续至今的冬季生存传统。' },
  { title: '周年庆', description: '专属地图、礼物、影像与属于当年的关键词。' },
  { title: '新年活动', description: '从 2020 年开始，用地图游戏和抽奖迎接新一年。' },
  { title: 'BOH 开学季', description: '记录时间，也陪着每一位 Blocker 继续成长。' },
  { title: '遇见系列', description: '从线上走到线下，在不同城市真正见面。' },
  { title: '成员生日会', description: '为成员准备专属活动地图与生日礼物。' },
  { title: '方块之家周边', description: '背包、纪念册与玩偶，把共同记忆带进生活。' },
  { title: '节日企划', description: '在圣诞、国庆等时刻推出特别主题内容。' },
];

const people = [
  { name: 'Ryyik', role: '创始成员 · 御三家', image: imgRyyik },
  { name: '小牛', role: '创始成员 · 御三家', image: imgXiaoniu },
  { name: 'LF', role: '创始成员 · 御三家', image: imgLF },
];

const timeline = [
  { year: '2018', description: '第一张游戏地图，方块之家创立。' },
  { year: '2019', description: '联机侠服务器开启。' },
  { year: '2020', description: '传统新年活动开始。' },
  { year: '2021', description: '三周年，冬眠生存成为传统。' },
  { year: '2022', description: '四周年庆典与方块礼盒。' },
  { year: '2023', description: '五周年纪录片。' },
  { year: '2024', description: '六周年纪录片。' },
  { year: '2025', description: '七周年遇见系列。' },
  { year: '2026', description: '八周年，故事继续。' },
];

const timelineProgress = computed(() => {
  if (preferredMotion.value === 'reduce') return 1;
  const start = viewportHeight.value * 0.72;
  const travel = Math.max(timelineHeight.value - viewportHeight.value * 0.45, 1);
  return clamp((start - timelineTop.value) / travel);
});
</script>

<style src="./style.global.css"></style>
