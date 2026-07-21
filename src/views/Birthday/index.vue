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

      <section v-else class="hero-section">
        <div class="hero-gradient"></div>
        <div class="hero-content">
          <div class="hero-badge">
            <PartyPopper :size="14" stroke-width="2.5" />
            <span v-if="isEventActive && isToday">今日限定 · 生日会已开启</span>
            <span v-else-if="isEventActive">生日活动进行中</span>
            <span v-else>生日倒计时</span>
          </div>

          <h1 class="hero-title">
            <span class="title-line">{{ targetUsername }}，</span>
            <span class="title-line gradient-text">{{ event.title || '生日快乐' }}</span>
          </h1>

          <p class="hero-subtitle">{{ event.subtitle || heroSubtitle }}</p>
          <p v-if="event.hero_quote" class="hero-quote">「{{ event.hero_quote }}」</p>

          <div class="hero-meta">
            <div v-if="isEventActive && isToday" class="meta-pill">
              <Cake :size="16" stroke-width="2" />
              <span>{{ displayDate }} · 今日限定会场</span>
            </div>
            <div v-else class="meta-pill countdown">
              <CalendarHeart :size="16" stroke-width="2" />
              <span>距离 {{ displayDate }} 还有 <strong>{{ daysUntil }}</strong> 天</span>
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

      <section ref="candleSection" class="candle-section">
        <div class="section-label-row">
          <span class="section-badge">{{ event.page_copy?.candleTitle || 'Make A Wish' }}</span>
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
            <h3>{{ targetUsername }}，生日快乐 🎂</h3>
            <p>{{ event.hero_quote || '这一页只在属于你的日子里变得热闹。愿你新的一岁继续有朋友、有地图、有夜晚冒险，也有许多刚刚好的好运。' }}</p>
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

      <section ref="flipSection" class="flip-section">
        <div class="section-label-row">
          <span class="section-badge">{{ event.page_copy?.messagesTitle || '祝福留言' }}</span>
          <h2>翻看祝福</h2>
          <p class="section-desc">{{ event.page_copy?.messagesDesc || '每一张卡片都是一份心意。' }}</p>
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
                :class="{ active: idx === currentIndex, prev: idx < currentIndex, next: idx > currentIndex }"
                :style="{ '--stack-offset': Math.min(idx - currentIndex, 3) * 6 }"
              >
                <div class="flip-card-inner">
                  <div class="flip-card-front">
                    <div class="flip-card-bg"></div>
                    <div class="flip-card-content">
                      <div class="flip-card-avatar" :style="{ background: wishColors[idx % wishColors.length] }">
                        {{ wish.author_name.slice(0, 1).toUpperCase() }}
                      </div>
                      <div class="flip-card-text">
                        <p>{{ wish.content }}</p>
                      </div>
                      <div class="flip-card-meta">
                        <span class="flip-author">{{ wish.author_name }}</span>
                        <button class="flip-like" :class="{ liked: likedWishes.has(wish.id) }" @click.stop="toggleLike(wish)">
                          <Heart :size="14" stroke-width="2" :fill="likedWishes.has(wish.id) ? '#ff453a' : 'none'" />
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
            <button class="flip-btn" @click="nextCard" :disabled="currentIndex === flipCards.length - 1">
              <ChevronRight :size="20" stroke-width="2.5" />
            </button>
          </div>
        </div>
      </section>

      <section ref="writeSection" class="write-section">
        <div class="section-label-row">
          <span class="section-badge">Write A Wish</span>
          <h2>写下祝福</h2>
          <p class="section-desc">你的祝福会经过审核后展示在页面上。</p>
        </div>

        <div class="write-card">
          <div class="write-avatar" v-if="visitorName">{{ visitorName.slice(0, 1).toUpperCase() }}</div>
          <div class="write-fields">
            <input v-model="visitorName" class="write-input name-input" placeholder="你的名字" maxlength="20" />
            <textarea v-model="visitorMessage" class="write-input message-input" placeholder="写下你的生日祝福..." maxlength="300" rows="3"></textarea>
          </div>
          <button class="write-submit" :disabled="!canSubmit || isSubmitting" @click="submitWish">
            <Send :size="18" stroke-width="2.2" />
            <span>{{ isSubmitting ? '发送中...' : '发送祝福' }}</span>
          </button>
          <div v-if="submitSuccess" class="write-success">祝福已发送，审核通过后将展示在页面上 ✨</div>
        </div>
      </section>

      <section class="memories-section">
        <div class="section-label-row">
          <span class="section-badge">{{ event.page_copy?.memoriesTitle || 'Memory Gallery' }}</span>
          <h2>回忆相册</h2>
        </div>
        <div class="memory-grid">
          <article v-for="memory in memories" :key="memory.title" class="memory-card">
            <figure class="memory-figure">
              <img :src="getImageUrl(memory.image)" :alt="memory.title" loading="lazy" decoding="async" />
            </figure>
            <div class="memory-info">
              <time>{{ memory.date }}</time>
              <h3>{{ memory.title }}</h3>
              <p>{{ memory.text }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="gift-section">
        <div class="section-label-row">
          <span class="section-badge">Birthday Gift</span>
          <h2>{{ event.page_copy?.giftTitle || '生日礼品卡' }}</h2>
          <p class="section-desc">为今天保留一张可以分享的纪念卡。</p>
        </div>
        <div class="gift-card">
          <div class="gift-card-shine"></div>
          <div class="gift-card-top">
            <span>BOH CARD</span>
            <Gift :size="22" stroke-width="2" />
          </div>
          <div class="gift-card-code">
            <strong>{{ event.page_copy?.giftCode || 'BOH-2026-BIRTHDAY' }}</strong>
            <canvas ref="scratchCanvas" class="scratch-canvas" @pointerdown="startScratch" @pointermove="scratch" @pointerup="stopScratch" @pointerleave="stopScratch"></canvas>
          </div>
          <div class="gift-card-bottom">
            <div>
              <span>MEMBER</span>
              <strong>{{ targetUsername }}</strong>
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

    <div class="poster-render-root" aria-hidden="true">
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
            <h2>{{ targetUsername }}</h2>
            <p>{{ posterBlessing }}</p>
          </div>
          <div class="poster-bottom">
            <span>{{ targetUsername }}</span>
            <strong>{{ displayDate }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPosterModal" class="poster-modal" @click="closePosterModal">
      <div class="poster-preview" @click.stop>
        <button class="close-modal-btn" aria-label="关闭" @click="closePosterModal">
          <X :size="20" stroke-width="2.5" />
        </button>
        <img :src="posterImage" alt="生日分享海报" loading="lazy" />
        <p>长按或右键保存这张生日海报</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
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
  Sparkles,
  WandSparkles,
  X
} from "lucide-vue-next";
import { supabase } from "@/utils/supabase-client.js";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { getImageUrl } from "@/utils/asset-helper.js";
import { isBirthdayToday } from "@/utils/birthday.js";

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const candleSection = ref(null);
const flipSection = ref(null);
const writeSection = ref(null);
const scratchCanvas = ref(null);
const posterRef = ref(null);
const posterImage = ref("");
const showPosterModal = ref(false);
const isGeneratingPoster = ref(false);
const hasMadeWish = ref(false);
const showSmoke = ref(false);
const showToast = ref(false);
const toastText = ref("");
const visitorName = ref("");
const visitorMessage = ref("");
const isSubmitting = ref(false);
const submitSuccess = ref(false);
const currentIndex = ref(0);
const likedWishes = ref(new Set());

const event = reactive({
  title: "生日快乐",
  subtitle: "",
  hero_quote: "",
  page_copy: {}
});

const wishes = ref([]);
const targetUsername = ref("朋友");
const isEventActive = ref(false);
const celebrationDate = ref("");
const isLoading = ref(true);

let scratchContext = null;
let isScratching = false;
let toastTimer = null;
let pointerStartX = 0;
let pointerDeltaX = 0;

const wishColors = ["#ff453a", "#ff9f0a", "#30d158", "#409cff", "#bf5af2", "#ff6482", "#66d4cf", "#ffd60a"];

const memories = [
  { title: "初次相遇", date: "2025.08", image: "26wanxia.webp", text: "一些后来会被反复想起的晚上，常常就是从普通的一次上线开始。" },
  { title: "秋千和地图", date: "2025.09", image: "qiuqian.webp", text: "坐标、截图、聊天记录，都在替我们保存那段很轻松的时间。" },
  { title: "生日会现场", date: "2025.10", image: "2025-10-shengri.webp", text: "有人准备惊喜，有人负责热闹，有人负责把快乐记下来。" },
  { title: "冬眠生存", date: "2026.01", image: "26hezhao1.webp", text: "新的一岁，也会继续有新的服务器、新的朋友和新的故事。" }
];

const mockWishes = [
  { id: "m1", author_name: "Ryyik", content: "牛儿生日快乐！新的一岁继续在方块之家留下更闪亮的故事。", status: "approved", is_featured: true, created_at: "2026-07-01T08:00:00Z", likes: 12 },
  { id: "m2", author_name: "Eleven", content: "生日快乐，愿你每天都有刚刚好的好运和不会掉线的快乐。", status: "approved", is_featured: true, created_at: "2026-07-01T09:00:00Z", likes: 8 },
  { id: "m3", author_name: "End", content: "李小姐生日快乐，愿这一年顺利、自由、开心。", status: "approved", is_featured: false, created_at: "2026-07-01T10:00:00Z", likes: 6 },
  { id: "m4", author_name: "小牛", content: "牟，生日快乐。愿新的一岁继续高高兴兴地向前跑。", status: "approved", is_featured: false, created_at: "2026-07-01T11:00:00Z", likes: 4 },
  { id: "m5", author_name: "橙子", content: "祝你天天开心，生日快乐啦 🎉", status: "approved", is_featured: false, created_at: "2026-07-01T12:00:00Z", likes: 3 },
  { id: "m6", author_name: "LF", content: "继续开开心心地活下去吧，超搞笑级的生日快乐！", status: "approved", is_featured: true, created_at: "2026-07-01T13:00:00Z", likes: 7 }
];

const approvedWishes = computed(() =>
  wishes.value.filter((w) => w.status === "approved")
);

const flipCards = computed(() =>
  [...approvedWishes.value].sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  })
);

const isToday = computed(() => isBirthdayToday(userInfo.value.birthMonth, userInfo.value.birthDay));
const displayDate = computed(() => {
  if (!celebrationDate.value) return "--";
  const d = new Date(celebrationDate.value);
  return `${d.getMonth() + 1}/${d.getDate()}`;
});

const daysUntil = computed(() => {
  if (!celebrationDate.value) return "--";
  const now = new Date();
  const target = new Date(celebrationDate.value);
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
});

const heroSubtitle = computed(() => {
  if (isEventActive.value && isToday.value) return "今天，整个会场都为你亮起来。";
  return "写下你的祝福，点亮这个特别的日子。";
});

const posterBlessing = computed(() => {
  if (flipCards.value.length > 0) return flipCards.value[0].content;
  return "愿你新的一岁，快乐且自由。";
});

const canSubmit = computed(() =>
  visitorName.value.trim().length > 0 && visitorMessage.value.trim().length > 0
);

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollTo = (section) => {
  const map = { candle: candleSection, flip: flipSection, write: writeSection };
  map[section]?.value?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
};

const showToastMessage = (text) => {
  toastText.value = text;
  showToast.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { showToast.value = false; }, 2800);
};

const burstConfetti = (origin = { y: 0.5 }) => {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 35,
    origin,
    colors: ["#ff453a", "#ff9f0a", "#ffd60a", "#30d158", "#409cff", "#bf5af2"]
  });
};

const makeWish = () => {
  if (hasMadeWish.value) return;
  hasMadeWish.value = true;
  showSmoke.value = true;
  burstConfetti({ y: 0.45 });
  showToastMessage("愿望已送达 ✨");
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

const toggleLike = (wish) => {
  if (likedWishes.value.has(wish.id)) {
    likedWishes.value.delete(wish.id);
  } else {
    likedWishes.value.add(wish.id);
  }
  likedWishes.value = new Set(likedWishes.value);
};

const submitWish = async () => {
  if (!canSubmit.value || isSubmitting.value) return;
  isSubmitting.value = true;
  submitSuccess.value = false;

  try {
    const { error } = await supabase.from("birthday_wishes").insert({
      event_id: event.id,
      author_name: visitorName.value.trim(),
      author_id: userInfo.value?.id || null,
      content: visitorMessage.value.trim(),
      status: "pending",
      likes: 0
    });
    if (error) throw error;
    submitSuccess.value = true;
    visitorMessage.value = "";
    showToastMessage("祝福已发送，等待审核 ✨");
  } catch {
    showToastMessage("发送失败，请稍后重试");
  } finally {
    isSubmitting.value = false;
  }
};

const fetchEvent = async () => {
  try {
    const { data, error } = await supabase
      .from("birthday_events")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    if (data) {
      Object.assign(event, data);
      event.id = data.id;
      celebrationDate.value = data.celebration_date || "";
      isEventActive.value = data.is_active || false;
      if (data.target_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.target_user_id)
          .single();
        if (profile?.username) targetUsername.value = profile.username;
      }
    }
  } catch (err) {
    loadMockData();
  }
};

const fetchWishes = async () => {
  if (!event.id) return;
  try {
    const { data, error } = await supabase
      .from("birthday_wishes")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) wishes.value = data;
  } catch {
    loadMockWishes();
  }
};

const loadMockData = () => {
  event.title = "生日快乐";
  event.subtitle = "今天是最特别的一天";
  event.hero_quote = "愿你新的一岁，快乐且自由。";
  event.page_copy = {
    candleTitle: "Make A Wish",
    candleDesc: "点击蜡烛，许个愿吧",
    messagesTitle: "祝福留言",
    messagesDesc: "写下你的生日祝福",
    memoriesTitle: "回忆相册",
    giftTitle: "生日礼品卡",
    giftCode: "BOH-2026-BIRTHDAY"
  };
  event.id = "mock-event-1";
  celebrationDate.value = new Date().toISOString().split("T")[0];
  isEventActive.value = true;
  targetUsername.value = userInfo.value?.username?.trim() || "朋友";
  loadMockWishes();
};

const loadMockWishes = () => {
  wishes.value = mockWishes;
};

const initScratchCard = () => {
  const canvas = scratchCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  scratchContext = canvas.getContext("2d");
  scratchContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gradient = scratchContext.createLinearGradient(0, 0, rect.width, 0);
  gradient.addColorStop(0, "#e8e8ed");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#e8e8ed");
  scratchContext.fillStyle = gradient;
  scratchContext.fillRect(0, 0, rect.width, rect.height);
  scratchContext.fillStyle = "rgba(29, 29, 31, 0.35)";
  scratchContext.font = "700 14px system-ui, -apple-system, sans-serif";
  scratchContext.textAlign = "center";
  scratchContext.textBaseline = "middle";
  scratchContext.fillText("刮开查看", rect.width / 2, rect.height / 2);
  scratchContext.globalCompositeOperation = "destination-out";
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

const startScratch = (event) => { isScratching = true; scratch(event); };
const stopScratch = () => { isScratching = false; };

const generatePoster = async () => {
  if (isGeneratingPoster.value || !posterRef.value) return;
  isGeneratingPoster.value = true;
  try {
    await nextTick();
    await waitForPosterAssets();
    const canvas = await html2canvas(posterRef.value, {
      backgroundColor: "#1d1d1f",
      scale: 2,
      useCORS: true,
      logging: false
    });
    posterImage.value = canvas.toDataURL("image/png");
    showPosterModal.value = true;
  } catch {
    showToastMessage("海报生成失败，请稍后再试。");
  } finally {
    isGeneratingPoster.value = false;
  }
};

const waitForPosterAssets = async () => {
  const img = posterRef.value?.querySelector("img");
  if (!img) return;
  if (img.decode) { await img.decode().catch(() => {}); return; }
  if (img.complete) return;
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
};

const closePosterModal = () => { showPosterModal.value = false; };

onMounted(async () => {
  try {
    await fetchEvent();
    await fetchWishes();
    visitorName.value = userInfo.value?.username || "";
    nextTick(initScratchCard);
    if (isToday.value) setTimeout(() => burstConfetti({ y: 0.4 }), 500);
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

.bd-skel-line.w-90 { width: 90%; }
.bd-skel-line.w-80 { width: 80%; }
.bd-skel-line.w-70 { width: 70%; }
.bd-skel-line.w-60 { width: 60%; }
.bd-skel-line.w-40 { width: 40%; }
.bd-skel-line.w-30 { width: 30%; }
.bd-skel-line.w-30.short { width: 26%; height: 12px; }

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
