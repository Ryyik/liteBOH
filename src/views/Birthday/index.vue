<template>
  <div class="birthday-page">

    <div class="birthday-confetti" aria-hidden="true">
      <span
        v-for="piece in confettiPieces"
        :key="piece.index"
        class="confetti-strip"
        :style="{
          '--i': piece.index,
          '--x': piece.left,
          '--w': piece.width,
          '--h': piece.height,
          '--speed': piece.speed,
          '--drift': piece.drift
        }"
      ></span>
    </div>

    <main>
      <section class="birthday-hero" aria-labelledby="birthday-title">
        <div class="birthday-hero-media" aria-hidden="true">
          <img :src="getImageUrl('cake202512.webp')" alt="" fetchpriority="high" decoding="async"  loading="lazy" />
        </div>

        <div class="birthday-hero-copy">
          <div class="birthday-kicker">
            <PartyPopper :size="18" stroke-width="2.2" />
            <span>Block of Home Birthday</span>
          </div>
          <h1 id="birthday-title">{{ birthdayTitle }}</h1>
          <p>{{ heroSubtitle }}</p>

          <div class="hero-actions">
            <button class="primary-action" type="button" @click="scrollToCeremony">
              <Cake :size="19" stroke-width="2.3" />
              <span>开启今日祝福</span>
              <ArrowRight :size="18" stroke-width="2.3" />
            </button>
            <button class="ghost-action" type="button" @click="burstConfetti">
              <Sparkles :size="18" stroke-width="2.2" />
              <span>点亮彩带</span>
            </button>
          </div>

          <div class="birthday-ticket" :class="{ muted: !isTodayBirthday }">
            <CalendarHeart :size="19" stroke-width="2.2" />
            <span>{{ birthdayStatusText }}</span>
          </div>
        </div>
      </section>

      <section ref="ceremonyRef" class="ceremony-section">
        <div class="section-heading">
          <span class="section-label">Make A Wish</span>
          <h2>今日的第一束光</h2>
          <p>愿望不用说出口，方块之家已经替你留了一盏灯。</p>
        </div>

        <div class="ceremony-layout">
          <div class="candle-scene" :class="{ wished: hasMadeWish }">
            <div class="candle-glow"></div>
            <div class="flame" :class="{ hidden: hasMadeWish }"></div>
            <div class="smoke" :class="{ visible: showSmoke }"></div>
            <div class="candle">
              <span></span>
            </div>
            <button class="candle-button" type="button" @click="makeWish" :disabled="hasMadeWish">
              <WandSparkles :size="18" stroke-width="2.2" />
              <span>{{ hasMadeWish ? '愿望已点亮' : '许愿' }}</span>
            </button>
          </div>

          <div class="ceremony-card">
            <span class="card-eyebrow">Birthday Note</span>
            <h3>{{ username }}，生日快乐。</h3>
            <p>
              这一页只在属于你的日子里变得热闹。愿你新的一岁继续有朋友、有地图、有夜晚冒险，也有许多刚刚好的好运。
            </p>
            <div class="mini-metrics">
              <div>
                <strong>{{ birthdayMonthDay }}</strong>
                <span>生日日期</span>
              </div>
              <div>
                <strong>{{ wishes.length }}</strong>
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

      <section class="memories-section">
        <div class="section-heading compact">
          <span class="section-label">Memory Gallery</span>
          <h2>把好日子翻出来</h2>
        </div>

        <div class="memory-grid">
          <article v-for="memory in memories" :key="memory.title" class="memory-card">
            <img :src="getImageUrl(memory.image)" :alt="memory.title" loading="lazy" decoding="async" />
            <div>
              <span>{{ memory.date }}</span>
              <h3>{{ memory.title }}</h3>
              <p>{{ memory.text }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="blessing-section">
        <div class="section-heading">
          <span class="section-label">Blessing Wall</span>
          <h2>朋友们留下的光</h2>
          <p>每一条祝福都可以成为你的生日海报文案。</p>
        </div>

        <div class="blessing-layout">
          <div class="balloon-field" aria-label="生日祝福">
            <button
              v-for="wish in wishes"
              :key="wish.id"
              class="blessing-balloon"
              type="button"
              :class="{ active: selectedBlessing?.id === wish.id }"
              :style="{ '--accent': wish.color, '--delay': wish.delay }"
              @click="selectBlessing(wish)"
            >
              <span>{{ wish.author }}</span>
            </button>
          </div>

          <article class="selected-blessing">
            <div class="selected-avatar">{{ selectedBlessing.author.slice(0, 1) }}</div>
            <div>
              <span>来自 {{ selectedBlessing.author }}</span>
              <p>{{ selectedBlessing.text }}</p>
            </div>
          </article>
        </div>
      </section>

      <section class="gift-section">
        <div class="gift-card-panel">
          <div class="section-heading gift-heading">
            <span class="section-label">Birthday Gift</span>
            <h2>专属生日礼品卡</h2>
            <p>为今天保留一张可以分享的纪念卡。</p>
          </div>

          <div class="premium-card">
            <div class="card-shine"></div>
            <div class="premium-card-top">
              <span>BOH CARD</span>
              <Gift :size="24" stroke-width="2.2" />
            </div>
            <div class="premium-card-code">
              <strong>BOH-2026-BIRTHDAY</strong>
              <canvas
                ref="scratchCanvas"
                class="scratch-canvas"
                @pointerdown="startScratch"
                @pointermove="scratch"
                @pointerup="stopScratch"
                @pointerleave="stopScratch"
              ></canvas>
            </div>
            <div class="premium-card-bottom">
              <div>
                <span>MEMBER</span>
                <strong>{{ username }}</strong>
              </div>
              <div>
                <span>DATE</span>
                <strong>{{ currentDate }}</strong>
              </div>
            </div>
          </div>

          <div class="gift-actions">
            <button class="primary-action dark" type="button" @click="generatePoster" :disabled="isGeneratingPoster">
              <Camera :size="19" stroke-width="2.3" />
              <span>{{ isGeneratingPoster ? '生成中' : '生成生日海报' }}</span>
            </button>
            <button class="ghost-action dark" type="button" @click="restartCeremony">
              <RotateCcw :size="18" stroke-width="2.2" />
              <span>重置许愿</span>
            </button>
          </div>
        </div>
      </section>
    </main>

    <transition name="toast">
      <div v-if="showBlessingToast" class="blessing-toast">
        <strong>{{ toastBlessing.author }}</strong>
        <span>{{ toastBlessing.text }}</span>
      </div>
    </transition>

    <div class="poster-render-root" aria-hidden="true">
      <div ref="posterRef" class="share-poster">
        <img :src="getImageUrl('2025-10-shengri.webp')" alt=""  loading="lazy" />
        <div class="poster-overlay"></div>
        <div class="poster-content">
          <div class="poster-top">
            <span>BOH LITE</span>
            <span>{{ currentDate }}</span>
          </div>
          <div class="poster-main">
            <span>HAPPY BIRTHDAY</span>
            <h2>{{ username }}</h2>
            <p>{{ selectedBlessing.text }}</p>
          </div>
          <div class="poster-bottom">
            <span>{{ selectedBlessing.author }}</span>
            <strong>{{ birthdayMonthDay }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPosterModal" class="poster-modal" @click="closePosterModal">
      <div class="poster-preview" @click.stop>
        <button class="close-modal-btn" type="button" aria-label="关闭" @click="closePosterModal">×</button>
        <img :src="posterImage" alt="生日分享海报"  loading="lazy" />
        <p>长按或右键保存这张生日海报</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import {
  ArrowRight,
  Cake,
  CalendarHeart,
  Camera,
  Gift,
  PartyPopper,
  RotateCcw,
  Sparkles,
  WandSparkles
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { getImageUrl } from "@/utils/asset-helper.js";
import { getNextBirthdayDistance, isBirthdayToday } from "@/utils/birthday.js";

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const ceremonyRef = ref(null);
const scratchCanvas = ref(null);
const posterRef = ref(null);
const posterImage = ref("");
const showPosterModal = ref(false);
const isGeneratingPoster = ref(false);
const hasMadeWish = ref(false);
const showSmoke = ref(false);
const showBlessingToast = ref(false);
const selectedBlessingId = ref(1);
const toastBlessing = ref({ author: "", text: "" });

let scratchContext = null;
let isScratching = false;
let toastTimer = null;

const confettiPieces = Array.from({ length: 42 }, (_, index) => ({
  index: index + 1,
  left: (index * 37) % 100,
  width: 7 + (index % 4) * 3,
  height: 15 + (index % 5) * 4,
  speed: index % 5,
  drift: (index % 7 - 3) * 18
}));

const memories = [
  {
    title: "初次相遇",
    date: "2025.08",
    image: "26wanxia.webp",
    text: "一些后来会被反复想起的晚上，常常就是从普通的一次上线开始。"
  },
  {
    title: "秋千和地图",
    date: "2025.09",
    image: "qiuqian.webp",
    text: "坐标、截图、聊天记录，都在替我们保存那段很轻松的时间。"
  },
  {
    title: "生日会现场",
    date: "2025.10",
    image: "2025-10-shengri.webp",
    text: "有人准备惊喜，有人负责热闹，有人负责把快乐记下来。"
  },
  {
    title: "冬眠生存",
    date: "2026.01",
    image: "26hezhao1.webp",
    text: "新的一岁，也会继续有新的服务器、新的朋友和新的故事。"
  }
];

const wishes = [
  {
    id: 1,
    author: "Ryyik",
    text: "牛儿生日快乐！新的一岁继续在方块之家留下更闪亮的故事。",
    color: "#ff4d5f",
    delay: "0s"
  },
  {
    id: 2,
    author: "Eleven",
    text: "生日快乐，愿你每天都有刚刚好的好运和不会掉线的快乐。",
    color: "#ffb02e",
    delay: ".12s"
  },
  {
    id: 3,
    author: "End",
    text: "李小姐生日快乐，愿这一年顺利、自由、开心。",
    color: "#4f8cff",
    delay: ".24s"
  },
  {
    id: 4,
    author: "小牛",
    text: "牟，生日快乐。愿新的一岁继续高高兴兴地向前跑。",
    color: "#39b980",
    delay: ".36s"
  },
  {
    id: 5,
    author: "橙子",
    text: "祝你大学生活美满，也祝你天天开心，生日快乐啦。",
    color: "#f97316",
    delay: ".48s"
  },
  {
    id: 6,
    author: "LF",
    text: "继续开开心心地活下去吧，超搞笑级的生日快乐。",
    color: "#8b5cf6",
    delay: ".6s"
  }
];

const username = computed(() => String(userInfo.value.username || "").trim() || "朋友");
const hasBirthday = computed(() => Boolean(getNextBirthdayDistance(userInfo.value.birthMonth, userInfo.value.birthDay)));
const isTodayBirthday = computed(() => isBirthdayToday(userInfo.value.birthMonth, userInfo.value.birthDay));
const birthdayDistance = computed(() => getNextBirthdayDistance(userInfo.value.birthMonth, userInfo.value.birthDay));
const birthdayTitle = computed(() => `${username.value} 生日会`);
const currentDate = new Date().toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });

const birthdayMonthDay = computed(() => {
  const birthday = birthdayDistance.value;
  if (!birthday) return "未设置";
  return `${String(birthday.month).padStart(2, "0")}/${String(birthday.day).padStart(2, "0")}`;
});

const heroSubtitle = computed(() => {
  if (isTodayBirthday.value) return "今天，网页首页和这座小会场都为你亮起来。";
  if (birthdayDistance.value) return "这里是生日当天会正式点亮的方块之家专属会场。";
  return "完善生日资料后，生日当天首页会为你自动点亮专属入口。";
});

const birthdayStatusText = computed(() => {
  if (isTodayBirthday.value) return "今日限定生日会已开启";
  if (!hasBirthday.value) return "前往个人中心设置生日后启用";
  return `距离下一次生日还有 ${birthdayDistance.value.daysUntil} 天`;
});

const selectedBlessing = computed(() => wishes.find(wish => wish.id === selectedBlessingId.value) || wishes[0]);

const prefersReducedMotion = () => (
  typeof window !== "undefined"
  && window.matchMedia
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches
);

const burstConfetti = (origin = { y: 0.58 }) => {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 90,
    spread: 72,
    startVelocity: 38,
    origin,
    colors: ["#ffffff", "#ff4d5f", "#ffce47", "#4f8cff", "#39b980"]
  });
};

const scrollToCeremony = () => {
  ceremonyRef.value?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
};

const makeWish = () => {
  if (hasMadeWish.value) return;
  hasMadeWish.value = true;
  showSmoke.value = true;
  burstConfetti({ y: 0.38 });
};

const restartCeremony = async () => {
  hasMadeWish.value = false;
  showSmoke.value = false;
  await nextTick();
  initScratchCard();
};

const selectBlessing = (wish) => {
  selectedBlessingId.value = wish.id;
  toastBlessing.value = { author: wish.author, text: wish.text };
  showBlessingToast.value = false;
  nextTick(() => {
    showBlessingToast.value = true;
  });

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    showBlessingToast.value = false;
  }, 3200);

  burstConfetti({ y: 0.68 });
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
  gradient.addColorStop(0, "#d7dbe4");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#cfd5df");
  scratchContext.fillStyle = gradient;
  scratchContext.fillRect(0, 0, rect.width, rect.height);
  scratchContext.fillStyle = "rgba(20, 22, 26, 0.46)";
  scratchContext.font = "700 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  scratchContext.textAlign = "center";
  scratchContext.textBaseline = "middle";
  scratchContext.fillText("BOH 生日涂层", rect.width / 2, rect.height / 2);
  scratchContext.globalCompositeOperation = "destination-out";
};

const getScratchPosition = (event) => {
  const rect = scratchCanvas.value.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
};

const scratch = (event) => {
  if (!isScratching || !scratchContext) return;
  event.preventDefault();
  const position = getScratchPosition(event);
  scratchContext.beginPath();
  scratchContext.arc(position.x, position.y, 22, 0, Math.PI * 2);
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
      backgroundColor: "#101114",
      scale: 2,
      useCORS: true,
      logging: false
    });
    posterImage.value = canvas.toDataURL("image/png");
    showPosterModal.value = true;
  } catch (error) {
    console.error("生成生日海报失败:", error);
    toastBlessing.value = { author: "BOH", text: "海报生成失败，请稍后再试。" };
    showBlessingToast.value = true;
  } finally {
    isGeneratingPoster.value = false;
  }
};

const waitForPosterAssets = async () => {
  const posterImageElement = posterRef.value?.querySelector("img");
  if (!posterImageElement) return;

  if (posterImageElement.decode) {
    await posterImageElement.decode().catch(() => {});
    return;
  }

  if (posterImageElement.complete) return;
  await new Promise((resolve) => {
    posterImageElement.onload = resolve;
    posterImageElement.onerror = resolve;
  });
};

const closePosterModal = () => {
  showPosterModal.value = false;
};

onMounted(() => {
  nextTick(initScratchCard);
  if (isTodayBirthday.value) {
    setTimeout(() => burstConfetti({ y: 0.5 }), 450);
  }
});
</script>

<style scoped>
@import './style.scoped.css';
</style>
