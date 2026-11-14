<template>
  <div class="birthday-page">
    <main>
      <section v-if="isLoading" class="birthday-skeleton" aria-hidden="true">
        <div class="bd-skel-hero glass-panel">
          <div class="bd-skel-badge animate-skeleton-wave"></div>
          <div class="bd-skel-title animate-skeleton-wave"></div>
          <div class="bd-skel-subtitle animate-skeleton-wave"></div>
          <div class="bd-skel-quote animate-skeleton-wave"></div>
          <div class="bd-skel-pill animate-skeleton-wave"></div>
          <div class="bd-skel-actions">
            <div class="bd-skel-btn primary animate-skeleton-wave"></div>
            <div class="bd-skel-btn animate-skeleton-wave"></div>
            <div class="bd-skel-btn animate-skeleton-wave"></div>
          </div>
        </div>

        <div class="bd-skel-section-label">
          <div class="bd-skel-badge small animate-skeleton-wave"></div>
          <div class="bd-skel-h2 animate-skeleton-wave"></div>
        </div>

        <div class="bd-skel-candle-row">
          <div class="bd-skel-candle-card glass-panel animate-skeleton-wave"></div>
          <div class="bd-skel-wish-card glass-panel">
            <div class="bd-skel-eyebrow animate-skeleton-wave"></div>
            <div class="bd-skel-h3 animate-skeleton-wave"></div>
            <div class="bd-skel-line w-90 animate-skeleton-wave"></div>
            <div class="bd-skel-line w-70 animate-skeleton-wave"></div>
            <div class="bd-skel-metrics">
              <div v-for="i in 3" :key="`bd-skel-metric-${i}`" class="bd-skel-metric">
                <div class="bd-skel-metric-strong animate-skeleton-wave"></div>
                <div class="bd-skel-metric-label animate-skeleton-wave"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="bd-skel-section-label">
          <div class="bd-skel-badge small animate-skeleton-wave"></div>
          <div class="bd-skel-h2 animate-skeleton-wave"></div>
        </div>

        <div class="bd-skel-flip-grid">
          <article v-for="i in 4" :key="`bd-skel-flip-${i}`" class="bd-skel-flip-card glass-panel">
            <div class="bd-skel-flip-avatar animate-skeleton-wave"></div>
            <div class="bd-skel-flip-body">
              <div class="bd-skel-line w-80 animate-skeleton-wave"></div>
              <div class="bd-skel-line w-60 animate-skeleton-wave"></div>
            </div>
            <div class="bd-skel-flip-footer">
              <div class="bd-skel-line w-40 animate-skeleton-wave"></div>
              <div class="bd-skel-line w-30 short animate-skeleton-wave"></div>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="hasCelebration" class="hero-section">
        <div class="hero-gradient"></div>
        <div class="hero-content">
          <div class="hero-badge">
            <PartyPopper :size="14" stroke-width="2.5" />
            <span v-if="isToday">今日限定 · 生日会已开启</span>
            <span v-else>生日倒计时</span>
          </div>

          <h1 class="hero-title">
            <span class="title-line">{{ nameLine }}，</span>
            <span class="title-line gradient-text">生日快乐</span>
          </h1>

          <p class="hero-subtitle">{{ heroSubtitle }}</p>

          <div class="hero-meta">
            <div v-if="isToday" class="meta-pill">
              <Cake :size="16" stroke-width="2" />
              <span>{{ displayDate }} · 今日限定会场</span>
            </div>
            <div v-else class="meta-pill countdown">
              <CalendarHeart :size="16" stroke-width="2" />
              <span
                >距离 {{ displayDate }} 还有 <strong>{{ daysUntil }}</strong> 天</span
              >
            </div>
          </div>

          <div class="hero-actions">
            <button class="primary-btn" @click="scrollTo('candle')">
              <WandSparkles :size="17" stroke-width="2.2" />
              <span>许个愿</span>
            </button>
            <button class="ghost-btn" @click="scrollTo('flip')">
              <BookHeart :size="17" stroke-width="2.2" />
              <span>看祝福</span>
            </button>
            <button class="ghost-btn" @click="scrollTo('write')">
              <PenLine :size="17" stroke-width="2.2" />
              <span>写祝福</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 页面内容由 profiles 的生日合成。一个生日都没填时如实显示空态，
           不灌假内容（原先这里会硬编码「生日快乐 / Make A Wish」给所有人看）。 -->
      <section v-else class="birthday-empty">
        <Cake :size="34" stroke-width="1.5" />
        <h2>还没有人填写生日</h2>
        <p>在「我的空间」补上生日，这里就会自动出现属于寿星的生日页。</p>
        <router-link class="birthday-empty-link" to="/user-space">去填写生日</router-link>
      </section>

      <section v-if="hasCelebration" ref="candleSection" class="candle-section">
        <div class="section-label-row">
          <span class="section-badge">Make A Wish</span>
          <h2>点亮蜡烛</h2>
        </div>
        <div class="candle-layout">
          <div class="candle-card" :class="{ wished: hasMadeWish }">
            <div class="candle-glow" :class="{ active: !hasMadeWish }"></div>
            <div class="candle-visual">
              <div class="flame" :class="{ hidden: hasMadeWish }"></div>
              <div class="smoke" :class="{ visible: showSmoke }"></div>
              <div class="candle-body">
                <span class="wick"></span>
              </div>
            </div>
            <button class="candle-btn" :disabled="hasMadeWish" @click="makeWish">
              <WandSparkles :size="16" stroke-width="2.2" />
              <span>{{ hasMadeWish ? '愿望已送达 ✨' : '点击许愿' }}</span>
            </button>
          </div>
          <div class="wish-card">
            <span class="wish-eyebrow">Birthday Note</span>
            <h3>{{ nameLine }}，生日快乐 🎂</h3>
            <p>
              这一页只在属于你的日子里变得热闹。愿你新的一岁继续有朋友、有地图、有夜晚冒险，也有许多刚刚好的好运。
            </p>
            <div class="wish-metrics">
              <div>
                <strong>{{ displayDate }}</strong>
                <span>生日日期</span>
              </div>
              <div>
                <strong>{{ approvedWishes.length }}</strong>
                <span>祝福收录</span>
              </div>
              <div>
                <strong>BOH</strong>
                <span>专属会场</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="hasCelebration" ref="flipSection" class="flip-section">
        <div class="section-label-row">
          <span class="section-badge">祝福留言</span>
          <h2>翻看祝福</h2>
          <p class="section-desc">每一张卡片都是一份心意。</p>
        </div>

        <div v-if="approvedWishes.length === 0" class="flip-empty">
          <BookHeart :size="48" stroke-width="1.5" />
          <h3>还没有祝福</h3>
          <p>快来写下第一条祝福吧 ✨</p>
        </div>

        <div v-else class="flip-container">
          <div
            class="flip-stage"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
          >
            <div v-for="(wish, idx) in flipCards" :key="wish.id" class="flip-card-stack">
              <div
                class="flip-card"
                :class="{
                  active: idx === currentIndex,
                  prev: idx < currentIndex,
                  next: idx > currentIndex,
                }"
                :style="{ '--stack-offset': Math.min(idx - currentIndex, 3) * 6 }"
              >
                <div class="flip-card-inner">
                  <div class="flip-card-front">
                    <div class="flip-card-bg"></div>
                    <div class="flip-card-content">
                      <div
                        class="flip-card-avatar"
                        :style="{ background: wishColors[idx % wishColors.length] }"
                      >
                        {{ wish.author_name.slice(0, 1).toUpperCase() }}
                      </div>
                      <div class="flip-card-text">
                        <p>{{ wish.content }}</p>
                      </div>
                      <div class="flip-card-meta">
                        <span class="flip-author">{{ wish.author_name }}</span>
                        <button
                          class="flip-like"
                          :class="{
                            liked: likedWishes.has(wish.id),
                            'is-pulsing': pulsingLikeId === wish.id,
                          }"
                          @click.stop="toggleLike(wish)"
                        >
                          <Heart
                            class="flip-like-heart"
                            :size="14"
                            stroke-width="2"
                            :fill="likedWishes.has(wish.id) ? '#ff453a' : 'none'"
                          />
                          <span>{{ (wish.likes || 0) + (likedWishes.has(wish.id) ? 1 : 0) }}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flip-controls">
            <button class="flip-btn" @click="prevCard" :disabled="currentIndex === 0">
              <ChevronLeft :size="20" stroke-width="2.5" />
            </button>
            <span class="flip-counter">{{ currentIndex + 1 }} / {{ flipCards.length }}</span>
            <button
              class="flip-btn"
              @click="nextCard"
              :disabled="currentIndex === flipCards.length - 1"
            >
              <ChevronRight :size="20" stroke-width="2.5" />
            </button>
          </div>
        </div>
      </section>

      <section v-if="hasCelebration" ref="writeSection" class="write-section">
        <div class="section-label-row">
          <span class="section-badge">Write A Wish</span>
          <h2>写下祝福</h2>
          <p class="section-desc">登录后即可送上祝福，提交后会立刻展示在页面上。</p>
        </div>

        <div v-if="!isLoggedIn" class="write-login">
          <PenLine :size="26" stroke-width="1.6" />
          <p>祝福需要留在名字下面，所以要先登录。</p>
          <router-link class="write-submit" :to="{ path: '/login' }">去登录</router-link>
        </div>

        <div v-else class="write-card">
          <div class="write-avatar" v-if="visitorName">
            {{ visitorName.slice(0, 1).toUpperCase() }}
          </div>
          <div class="write-fields">
            <input
              v-model="visitorName"
              class="write-input name-input"
              placeholder="你的名字"
              maxlength="20"
            />
            <textarea
              v-model="visitorMessage"
              class="write-input message-input"
              placeholder="写下你的生日祝福..."
              maxlength="300"
              rows="3"
            ></textarea>
          </div>
          <button class="write-submit" :disabled="!canSubmit || isSubmitting" @click="submitWish">
            <Send :size="18" stroke-width="2.2" />
            <span>{{ isSubmitting ? '发送中...' : '发送祝福' }}</span>
          </button>
          <div v-if="submitSuccess" class="write-success">祝福已发送，已经出现在上面了 ✨</div>
        </div>
      </section>

      <section v-if="hasCelebration" class="memories-section">
        <div class="section-label-row">
          <span class="section-badge">Memory Gallery</span>
          <h2>回忆相册</h2>
        </div>
        <div class="memory-grid">
          <article v-for="memory in memories" :key="memory.title" class="memory-card">
            <figure class="memory-figure">
              <img
                :src="getImageUrl(memory.image)"
                :alt="memory.title"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div class="memory-info">
              <time>{{ memory.date }}</time>
              <h3>{{ memory.title }}</h3>
              <p>{{ memory.text }}</p>
            </div>
          </article>
        </div>
      </section>

      <section v-if="hasCelebration" class="gift-section">
        <div class="section-label-row">
          <span class="section-badge">Birthday Gift</span>
          <h2>生日礼品卡</h2>
          <p class="section-desc">为今天保留一张可以分享的纪念卡。</p>
        </div>
        <div class="gift-card">
          <div class="gift-card-shine"></div>
          <div class="gift-card-top">
            <span>BOH CARD</span>
            <Gift :size="22" stroke-width="2" />
          </div>
          <div class="gift-card-code">
            <strong>{{ giftCode }}</strong>
            <canvas
              ref="scratchCanvas"
              class="scratch-canvas"
              @pointerdown="startScratch"
              @pointermove="scratch"
              @pointerup="stopScratch"
              @pointerleave="stopScratch"
            ></canvas>
          </div>
          <div class="gift-card-bottom">
            <div>
              <span>MEMBER</span>
              <strong>{{ nameLine }}</strong>
            </div>
            <div>
              <span>DATE</span>
              <strong>{{ displayDate }}</strong>
            </div>
          </div>
        </div>

        <div class="gift-actions">
          <button class="primary-btn dark" @click="generatePoster" :disabled="isGeneratingPoster">
            <Camera :size="17" stroke-width="2.2" />
            <span>{{ isGeneratingPoster ? '生成中…' : '生成生日海报' }}</span>
          </button>
          <button class="ghost-btn dark" @click="restartCeremony">
            <RotateCcw :size="17" stroke-width="2.2" />
            <span>重置许愿</span>
          </button>
        </div>
      </section>
    </main>

    <transition name="fade">
      <div v-if="showToast" class="toast">
        <Heart :size="16" stroke-width="2.5" fill="#ff453a" />
        <span>{{ toastText }}</span>
      </div>
    </transition>

    <!-- 分享海报是离屏渲染源（html2canvas 抓取），没有寿星时不应存在：
         否则 DOM 里仍躺着一份「愿你新的一岁」的假文案。 -->
    <div v-if="hasCelebration" class="poster-render-root" aria-hidden="true">
      <div ref="posterRef" class="share-poster">
        <img :src="getImageUrl('2025-10-shengri.webp')" alt="" loading="lazy" />
        <div class="poster-overlay"></div>
        <div class="poster-content">
          <div class="poster-top">
            <span>BOH LITE</span>
            <span>{{ displayDate }}</span>
          </div>
          <div class="poster-main">
            <span>HAPPY BIRTHDAY</span>
            <h2>{{ nameLine }}</h2>
            <p>{{ posterBlessing }}</p>
          </div>
          <div class="poster-bottom">
            <span>{{ nameLine }}</span>
            <strong>{{ displayDate }}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- 2026-11-04 硬切审计：海报弹窗原先进出场全裸切，补同页 toast 同款 fade -->
    <transition name="fade">
      <div v-if="showPosterModal" class="poster-modal" @click="closePosterModal">
        <div class="poster-preview" @click.stop>
          <button class="close-modal-btn" aria-label="关闭" @click="closePosterModal">
            <X :size="20" stroke-width="2.5" />
          </button>
          <img :src="posterImage" alt="生日分享海报" loading="lazy" />
          <p>长按或右键保存这张生日海报</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import {
  BookHeart,
  Cake,
  CalendarHeart,
  Camera,
  ChevronLeft,
  ChevronRight,
  Gift,
  Heart,
  PartyPopper,
  PenLine,
  RotateCcw,
  Send,
  WandSparkles,
  X,
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { getImageUrl } from '@/utils/asset-helper.js';
import { getNextCelebration } from '@/utils/birthday.js';
import {
  fetchBirthdayProfiles,
  fetchBirthdayWishes,
  submitBirthdayWish,
} from '@/utils/api/birthday-api.js';

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const candleSection = ref(null);
const flipSection = ref(null);
const writeSection = ref(null);
const scratchCanvas = ref(null);
const posterRef = ref(null);
const posterImage = ref('');
const showPosterModal = ref(false);
const isGeneratingPoster = ref(false);
const hasMadeWish = ref(false);
const showSmoke = ref(false);
const showToast = ref(false);
const toastText = ref('');
const visitorName = ref('');
const visitorMessage = ref('');
const isSubmitting = ref(false);
const submitSuccess = ref(false);
const currentIndex = ref(0);
const likedWishes = ref(new Set());

const wishes = ref([]);
/** 所有填了生日的用户（含 birth_month / birth_day 原始 text 值） */
const profiles = ref([]);
/** 是否取到了至少一场生日；false 时页面不进业务区，也不伪造内容 */
const isLoading = ref(true);

let scratchContext = null;
let isScratching = false;
let toastTimer = null;
let pointerStartX = 0;
let pointerDeltaX = 0;

const wishColors = [
  '#ff453a',
  '#ff9f0a',
  '#30d158',
  '#409cff',
  '#bf5af2',
  '#ff6482',
  '#66d4cf',
  '#ffd60a',
];

const memories = [
  {
    title: '初次相遇',
    date: '2025.08',
    image: '26wanxia.webp',
    text: '一些后来会被反复想起的晚上，常常就是从普通的一次上线开始。',
  },
  {
    title: '秋千和地图',
    date: '2025.09',
    image: 'qiuqian.webp',
    text: '坐标、截图、聊天记录，都在替我们保存那段很轻松的时间。',
  },
  {
    title: '生日会现场',
    date: '2025.10',
    image: '2025-10-shengri.webp',
    text: '有人准备惊喜，有人负责热闹，有人负责把快乐记下来。',
  },
  {
    title: '冬眠生存',
    date: '2026.01',
    image: '26hezhao1.webp',
    text: '新的一岁，也会继续有新的服务器、新的朋友和新的故事。',
  },
];

const approvedWishes = computed(() => wishes.value.filter((w) => w.status === 'approved'));

const flipCards = computed(() =>
  [...approvedWishes.value].sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  }),
);

const isLoggedIn = computed(() => Boolean(userInfo.value?.id));

/**
 * 所有填了生日的用户 + 他们各自的下一场生日，按「离今天最近」排序。
 * 封禁账号不上页（与首页生日墙 get_recent_birthday_profiles 同口径）。
 */
const celebrating = computed(() =>
  profiles.value
    .filter((profile) => !profile.is_banned)
    .map((profile) => {
      const next = getNextCelebration(profile.birth_month, profile.birth_day);
      if (!next) return null;
      return {
        id: profile.id,
        username: profile.username || '朋友',
        avatarUrl: profile.avatar_url || '',
        next,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.next.daysUntil - b.next.daysUntil || a.username.localeCompare(b.username, 'zh-Hans-CN'),
    ),
);

/** 最近一场生日的主角（同一天有多位寿星时取排序第一位做代表） */
const primaryCelebrant = computed(() => celebrating.value[0] || null);

/** 同一场生日的全部寿星 */
const sameDayCelebrants = computed(() => {
  const primary = primaryCelebrant.value;
  if (!primary) return [];
  return celebrating.value.filter((item) => item.next.date === primary.next.date);
});

const hasCelebration = computed(() => sameDayCelebrants.value.length > 0);
const targetIds = computed(() => sameDayCelebrants.value.map((item) => item.id));
const celebration = computed(() => primaryCelebrant.value?.next || null);
const celebrationDate = computed(() => celebration.value?.date || '');
const daysUntil = computed(() => celebration.value?.daysUntil ?? 0);
const isToday = computed(() => celebration.value?.isToday === true);

/** 'YYYY-MM-DD' 直接切片，别过 Date —— 时区会把 1/1 变成 12/31 */
const displayDate = computed(() => {
  const date = celebrationDate.value;
  if (!date) return '--';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
});

const nameLine = computed(() => {
  const names = sameDayCelebrants.value.map((item) => item.username).filter(Boolean);
  if (names.length === 0) return '朋友';
  if (names.length <= 2) return names.join('、');
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 位`;
});

const giftCode = computed(() => {
  const year = celebrationDate.value.slice(0, 4) || String(new Date().getFullYear());
  return `BOH-${year}-BIRTHDAY`;
});

const heroSubtitle = computed(() => {
  if (isToday.value) return '今天，整个会场都为你亮起来。';
  return '写下你的祝福，点亮这个特别的日子。';
});

const posterBlessing = computed(() => {
  if (flipCards.value.length > 0) return flipCards.value[0].content;
  return '愿你新的一岁，快乐且自由。';
});

const canSubmit = computed(
  () => visitorName.value.trim().length > 0 && visitorMessage.value.trim().length > 0,
);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollTo = (section) => {
  const map = { candle: candleSection, flip: flipSection, write: writeSection };
  map[section]?.value?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
};

const showToastMessage = (text) => {
  toastText.value = text;
  showToast.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    showToast.value = false;
  }, 2800);
};

const burstConfetti = (origin = { y: 0.5 }) => {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 35,
    origin,
    colors: ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#409cff', '#bf5af2'],
  });
};

const makeWish = () => {
  if (hasMadeWish.value) return;
  hasMadeWish.value = true;
  showSmoke.value = true;
  burstConfetti({ y: 0.45 });
  showToastMessage('愿望已送达 ✨');
};

const restartCeremony = async () => {
  hasMadeWish.value = false;
  showSmoke.value = false;
  await nextTick();
  initScratchCard();
};

const nextCard = () => {
  if (currentIndex.value < flipCards.value.length - 1) currentIndex.value++;
};

const prevCard = () => {
  if (currentIndex.value > 0) currentIndex.value--;
};

const onPointerDown = (e) => {
  pointerStartX = e.clientX;
  pointerDeltaX = 0;
};

const onPointerMove = (e) => {
  pointerDeltaX = e.clientX - pointerStartX;
};

const onPointerUp = () => {
  if (Math.abs(pointerDeltaX) > 60) {
    if (pointerDeltaX < 0) nextCard();
    else prevCard();
  }
};

/* 点赞 pop（2026-11-04 硬切审计 P2-5）：心形填充变化已有颜色渐变，
   这里补一次 400ms 的 scale 脉冲（对齐 Forum/PostDetail 的 like 动效口径） */
const pulsingLikeId = ref(null);
let pulsingLikeTimer = null;
const toggleLike = (wish) => {
  if (likedWishes.value.has(wish.id)) {
    likedWishes.value.delete(wish.id);
  } else {
    likedWishes.value.add(wish.id);
    pulsingLikeId.value = wish.id;
    clearTimeout(pulsingLikeTimer);
    pulsingLikeTimer = setTimeout(() => {
      pulsingLikeId.value = null;
    }, 420);
  }
  likedWishes.value = new Set(likedWishes.value);
};

const submitWish = async () => {
  if (!canSubmit.value || isSubmitting.value) return;
  if (!isLoggedIn.value) {
    showToastMessage('登录后才能提交祝福');
    return;
  }
  isSubmitting.value = true;
  submitSuccess.value = false;

  try {
    await submitBirthdayWish({
      targetUserId: primaryCelebrant.value?.id,
      celebrationDate: celebrationDate.value,
      authorId: userInfo.value?.id,
      authorName: visitorName.value,
      content: visitorMessage.value,
    });
    submitSuccess.value = true;
    visitorMessage.value = '';
    await loadWishes();
    currentIndex.value = 0;
    showToastMessage('祝福已送达 ✨');
  } catch {
    showToastMessage('发送失败，请稍后重试');
  } finally {
    isSubmitting.value = false;
  }
};

/** 取当前这一场（同一天可能多位寿星）已展示的祝福 */
const loadWishes = async () => {
  if (!hasCelebration.value) {
    wishes.value = [];
    return;
  }
  try {
    wishes.value = await fetchBirthdayWishes({
      targetUserIds: targetIds.value,
      celebrationDate: celebrationDate.value,
    });
  } catch {
    wishes.value = [];
  }
};

/** 页面内容 = profiles 里填了生日的用户，不再依赖任何手工配置 */
const loadCelebration = async () => {
  profiles.value = await fetchBirthdayProfiles();
  await loadWishes();
};

const initScratchCard = () => {
  const canvas = scratchCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  scratchContext = canvas.getContext('2d');
  scratchContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gradient = scratchContext.createLinearGradient(0, 0, rect.width, 0);
  gradient.addColorStop(0, '#e8e8ed');
  gradient.addColorStop(0.5, '#ffffff');
  gradient.addColorStop(1, '#e8e8ed');
  scratchContext.fillStyle = gradient;
  scratchContext.fillRect(0, 0, rect.width, rect.height);
  scratchContext.fillStyle = 'rgba(29, 29, 31, 0.35)';
  scratchContext.font = '700 14px system-ui, -apple-system, sans-serif';
  scratchContext.textAlign = 'center';
  scratchContext.textBaseline = 'middle';
  scratchContext.fillText('刮开查看', rect.width / 2, rect.height / 2);
  scratchContext.globalCompositeOperation = 'destination-out';
};

const getScratchPosition = (event) => {
  const rect = scratchCanvas.value.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

const scratch = (event) => {
  if (!isScratching || !scratchContext) return;
  event.preventDefault();
  const pos = getScratchPosition(event);
  scratchContext.beginPath();
  scratchContext.arc(pos.x, pos.y, 20, 0, Math.PI * 2);
  scratchContext.fill();
};

const startScratch = (event) => {
  isScratching = true;
  scratch(event);
};
const stopScratch = () => {
  isScratching = false;
};

const generatePoster = async () => {
  if (isGeneratingPoster.value || !posterRef.value) return;
  isGeneratingPoster.value = true;
  try {
    await nextTick();
    await waitForPosterAssets();
    const canvas = await html2canvas(posterRef.value, {
      backgroundColor: '#1d1d1f',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    posterImage.value = canvas.toDataURL('image/png');
    showPosterModal.value = true;
  } catch {
    showToastMessage('海报生成失败，请稍后再试。');
  } finally {
    isGeneratingPoster.value = false;
  }
};

const waitForPosterAssets = async () => {
  const img = posterRef.value?.querySelector('img');
  if (!img) return;
  if (img.decode) {
    await img.decode().catch(() => {});
    return;
  }
  if (img.complete) return;
  await new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  });
};

const closePosterModal = () => {
  showPosterModal.value = false;
};

onMounted(async () => {
  try {
    await loadCelebration();
    visitorName.value = userInfo.value?.username || '';
    nextTick(initScratchCard);
    if (isToday.value) setTimeout(() => burstConfetti({ y: 0.4 }), 500);
  } catch {
    // 生日表读不到（离线 / 权限变更）时退回空态，不伪造寿星
    profiles.value = [];
    wishes.value = [];
  } finally {
    isLoading.value = false;
  }
});
</script>

<style scoped>
@import './style.scoped.css';
</style>

<style scoped>
/* 加载骨架屏 — 仅覆盖 fetchEvent / fetchWishes 阶段，不依赖主样式表 */
/* 没有生日活动时的空态。不写死颜色，跟随正文继承，浅色/暗色都不会突兀 */
.birthday-empty {
  max-width: 520px;
  margin: 16vh auto 0;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.birthday-empty h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.birthday-empty p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  opacity: 0.62;
}

.birthday-skeleton {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.bd-skel-hero {
  padding: 40px 28px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
}

.bd-skel-badge {
  width: 180px;
  height: 24px;
  border-radius: 12px;
}

.bd-skel-badge.small {
  width: 120px;
  height: 18px;
  border-radius: 9px;
}

.bd-skel-title {
  width: 70%;
  height: 36px;
  border-radius: 8px;
  margin-top: 4px;
}

.bd-skel-subtitle {
  width: 55%;
  height: 16px;
  border-radius: 6px;
}

.bd-skel-quote {
  width: 40%;
  height: 14px;
  border-radius: 6px;
}

.bd-skel-pill {
  width: 220px;
  height: 32px;
  border-radius: 16px;
  margin-top: 4px;
}

.bd-skel-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.bd-skel-btn {
  width: 120px;
  height: 40px;
  border-radius: 12px;
}

.bd-skel-btn.primary {
  width: 140px;
}

.bd-skel-section-label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bd-skel-h2 {
  width: 160px;
  height: 24px;
  border-radius: 6px;
}

.bd-skel-h3 {
  width: 200px;
  height: 20px;
  border-radius: 6px;
}

.bd-skel-eyebrow {
  width: 110px;
  height: 12px;
  border-radius: 6px;
}

.bd-skel-candle-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 16px;
}

@media (max-width: 760px) {
  .bd-skel-candle-row {
    grid-template-columns: 1fr;
  }
}

.bd-skel-candle-card {
  min-height: 220px;
  border-radius: 16px;
}

.bd-skel-wish-card {
  padding: 22px 24px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bd-skel-line {
  height: 14px;
  border-radius: 6px;
}

.bd-skel-line.w-90 {
  width: 90%;
}
.bd-skel-line.w-80 {
  width: 80%;
}
.bd-skel-line.w-70 {
  width: 70%;
}
.bd-skel-line.w-60 {
  width: 60%;
}
.bd-skel-line.w-40 {
  width: 40%;
}
.bd-skel-line.w-30 {
  width: 30%;
}
.bd-skel-line.w-30.short {
  width: 26%;
  height: 12px;
}

.bd-skel-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 8px;
}

.bd-skel-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bd-skel-metric-strong {
  width: 70%;
  height: 22px;
  border-radius: 6px;
}

.bd-skel-metric-label {
  width: 50%;
  height: 10px;
  border-radius: 4px;
}

.bd-skel-flip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (max-width: 600px) {
  .bd-skel-flip-grid {
    grid-template-columns: 1fr;
  }
}

.bd-skel-flip-card {
  padding: 18px 20px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bd-skel-flip-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.bd-skel-flip-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bd-skel-flip-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
</style>
