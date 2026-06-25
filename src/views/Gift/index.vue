<template>
  <div class="gift-page">
    <!-- 统一导航栏 -->

    <!-- 时间校验弹窗 -->
    <div v-if="showTimeAlert" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-icon">🕐</div>
        <h3 class="modal-title">开奖时间未到</h3>
        <p class="modal-message">请于 <strong>2026年2月16日</strong> 再来开启幸运时刻！</p>
        <button class="modal-btn" @click="goBackHome">返回首页</button>
      </div>
    </div>

    <!-- 抽奖主舞台 -->
    <main class="lottery-stage" v-if="!showTimeAlert">
      <!-- 背景漂浮元素 -->
      <div class="floating-shapes">
        <div v-for="shape in backgroundShapes" :key="shape.id" class="shape" :style="shape.style"></div>
      </div>

      <!-- 背景光效 -->
      <div class="ambient-light"></div>

      <!-- 中奖弹窗 -->
      <transition name="fade">
        <div v-if="showWinnerPopup" class="winner-popup-overlay">
          <div class="winner-popup-card" :class="{ 'is-revealed': isRevealed }">
            <div class="card-corner-curl"></div>

            <div class="card-content-wrapper">
              <!-- 未揭晓状态：Logo 和 文字 -->
              <div class="unrevealed-content" v-if="!isRevealed">
                <div class="logo-container">
                  <img :src="logoUrl" alt="BOH Logo" class="boh-logo-popup"  loading="lazy" />
                  <div class="logo-glow"></div>
                </div>

                <div class="text-content">
                  <h2 class="gift-title">有份给你的礼物</h2>
                  <h2 class="gift-subtitle">正在路上。</h2>
                  <p class="from-text">来自 BOH</p>
                </div>

                <button class="reveal-btn" @click="handleRevealGift">
                  揭晓礼物
                </button>
              </div>

              <!-- 已揭晓状态：礼物内容 -->
              <div class="revealed-content" v-else>
                <div class="prize-icon-large">🎁</div>
                <h3 class="prize-congrats">恭喜获得</h3>
                <div class="prize-name-display">{{ userPrize }}</div>
                <p class="prize-hint">奖励已发放至您的账户</p>
                <button class="close-popup-btn" @click="closeWinnerPopup">
                  收下好礼
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 未中奖弹窗 -->
      <transition name="fade">
        <div v-if="showLossPopup" class="winner-popup-overlay">
          <div class="winner-popup-card loss-card">
            <div class="card-content-wrapper">
              <div class="revealed-content">
                <div class="prize-icon-large">☕</div>
                <h3 class="prize-congrats">下次一定</h3>
                <div class="prize-name-display">遗憾未中奖</div>
                <p class="prize-hint">感谢参与，祝您新的一年好运连连！</p>
                <button class="close-popup-btn" @click="closeLossPopup">
                  返回抽奖
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- 阶段 1: 等待开启 -->
      <transition name="fade-scale" mode="out-in">
        <div v-if="stage === 'intro'" class="stage-container intro" key="intro">
          <div class="header-content">
            <h1 class="main-title">2026</h1>
            <h2 class="sub-title">新年方块好礼 · 最终开奖</h2>
          </div>

          <div class="grand-gift-container floating" @click="startLottery">
            <div class="gift-box">
              <div class="lid">
                <div class="bow">
                  <div class="bow-left"></div>
                  <div class="bow-right"></div>
                  <div class="bow-center"></div>
                </div>
              </div>
              <div class="box-body">
                <div class="ribbon-vertical"></div>
                <div class="ribbon-horizontal"></div>
              </div>
            </div>
            <div class="gift-shadow"></div>
            <div class="click-hint">点击开启幸运时刻</div>
          </div>
        </div>

        <!-- 阶段 2: 抽奖动画中 -->
        <div v-else-if="stage === 'animating'" class="stage-container animating" key="animating">
          <div class="grand-gift-container opening-sequence">
            <div class="gift-box">
              <div class="lid flying-lid">
                <div class="bow">
                  <div class="bow-left"></div>
                  <div class="bow-right"></div>
                  <div class="bow-center"></div>
                </div>
              </div>
              <div class="box-body">
                <div class="ribbon-vertical"></div>
                <div class="ribbon-horizontal"></div>
              </div>
            </div>
            <!-- 爆射光芒 -->
            <div class="light-rays"></div>
          </div>
          <p class="loading-text">正在读取幸运数据...</p>
        </div>

        <!-- 阶段 3: 结果公布 -->
        <div v-else-if="stage === 'result'" class="stage-container result" key="result">
          <div class="confetti-wrapper"></div>
          <div class="result-header">
            <div class="confetti-container"></div>
            <h2 class="congrats-text">🎉 恭喜以下幸运方块人 🎉</h2>
          </div>

          <div class="winners-grid" :class="`focus-${currentTier}`">
            <!-- 特等奖 -->
            <div class="prize-column grand-prize-col"
              :class="{ 'dimmed': currentTier !== 'grand' && currentTier !== 'finished' && currentTier !== 'waiting' }">
              <div class="prize-header">
                <span class="prize-icon">👑</span>
                <span class="prize-name">年度锦鲤大奖</span>
              </div>

              <div class="winner-card-container" :class="{ 'flipped': revealedWinners.grand }">
                <div class="winner-card-inner">
                  <!-- 卡背（未揭晓） -->
                  <div class="card-face card-back-face">
                    <div class="mystery-content">
                      <span class="mystery-icon">?</span>
                      <p>Who is the Lucky One?</p>
                    </div>
                  </div>
                  <!-- 卡面（揭晓后） -->
                  <div class="card-face card-front-face">
                    <div class="winner-card grand revealed">
                      <div class="avatar-wrapper">
                        <span class="avatar-text">{{ winners.grand.name[0] }}</span>
                      </div>
                      <div class="winner-info">
                        <h3 class="winner-name">{{ winners.grand.name }}</h3>
                        <p class="prize-desc">{{ winners.grand.prize }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            <!-- 参与奖 -->
            <div class="prize-column"
              :class="{ 'dimmed': currentTier !== 'third' && currentTier !== 'finished' && currentTier !== 'waiting' }">
              <div class="prize-header">
                <span class="prize-icon">🎁</span>
                <span class="prize-name">新春参与奖</span>
              </div>
              <div class="winners-list">
                <div v-for="(winner, idx) in winners.third" :key="idx" class="winner-card-container list-item"
                  :class="{ 'flipped': revealedWinners.third[idx] }">
                  <div class="winner-card-inner">
                    <!-- 卡背 -->
                    <div class="card-face card-back-face bronze-back">
                      <span class="mystery-icon-small">?</span>
                    </div>
                    <!-- 卡面 -->
                    <div class="card-face card-front-face">
                      <div class="winner-card normal revealed">
                        <div class="avatar-wrapper small">
                          <span class="avatar-text">{{ winner.name[0] }}</span>
                        </div>
                        <div class="winner-info">
                          <h3 class="winner-name">{{ winner.name }}</h3>
                          <p class="prize-desc">{{ winner.prize }}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button class="reset-btn" @click="resetLottery">重播开奖动画</button>
        </div>
      </transition>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import logoUrl from '../../assets/images/favicon.webp';

// 定时器清理数组（顶层作用域，供 onUnmounted 和其他函数访问）
const giftTimers = [];

const router = useRouter();
const authStore = useAuthStore();
const { isLoggedIn, userInfo, showLoginModal } = storeToRefs(authStore);

// 状态管理
const stage = ref('intro'); // intro, animating, result
const _confettiContainer = ref(null);
const currentTier = ref('waiting'); // waiting, third, second, grand, finished
const showTimeAlert = ref(false);
const showWinnerPopup = ref(false);
const showLossPopup = ref(false);
const isRevealed = ref(false);
const userPrize = ref(null);

// 模拟中奖数据 (可以替换为真实数据)
const winners = {
  grand: { name: "chengzi", prize: "方块之家2026新年礼物" },
  third: [
    { name: "洛邱", prize: "BOH参与奖" },
    { name: "Eleven", prize: "BOH参与奖" },
    { name: "雨芙蕖酱", prize: "BOH参与奖" },
    // 用于测试中奖弹窗
  ]
};

// 检查当前用户是否中奖
const checkUserWinStatus = () => {
  if (!isLoggedIn.value) return null;

  // 检查特等奖
  if (userInfo.username === winners.grand.name) {
    return winners.grand.prize;
  }

  // 检查三等奖
  const thirdWin = winners.third.find(w => w.name === userInfo.username);
  if (thirdWin) {
    return thirdWin.prize;
  }

  return null;
};

// 控制结果逐步显示的开关
const revealedWinners = reactive({
  grand: false,
  third: []
});

// 背景漂浮元素
const backgroundShapes = Array.from({ length: 30 }, (_, i) => {
  const size = 10 + Math.random() * 20;
  return {
    id: i,
    style: {
      left: `${Math.random() * 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDelay: `-${Math.random() * 20}s`,
      animationDuration: `${15 + Math.random() * 15}s`,
      opacity: 0.1 + Math.random() * 0.3,
      background: Math.random() > 0.5 ? '#ffd700' : '#ff3b30', // Random gold or red
      borderRadius: Math.random() > 0.5 ? '50%' : '4px' // Random circle or square
    }
  };
});

onMounted(() => {
  // 校验登录状态
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
  }

  // 恢复时间验证
  // 时间校验：2026年2月16日之前不可访问
  const now = new Date();
  const targetDate = new Date('2026-02-16T00:00:00');

  // 如果当前时间早于目标时间
  if (now < targetDate) {
    showTimeAlert.value = true;
    return;
  }

  // Initialize revealed arrays based on data
  revealedWinners.third = new Array(winners.third.length).fill(false);
});

onUnmounted(() => {
  // 清理所有定时器
  giftTimers.forEach((t) => clearTimeout(t));
  giftTimers.length = 0;
});

const goBackHome = () => {
  router.push('/');
};

// 开始抽奖流程
const startLottery = () => {
  if (stage.value !== 'intro') return;

  stage.value = 'animating';

  // 模拟动画过程 延长至 5秒后出结果，增加悬念
  const timer1 = setTimeout(() => {
    stage.value = 'result';
    // Ensure render cycle completes before starting reveal
    nextTick(() => {
      revealWinnersSequence();
    });
  }, 5000);
  giftTimers.push(timer1);
};

// 逐步揭晓获奖者
const revealWinnersSequence = () => {
  // 重置状态
  revealedWinners.grand = false;
  revealedWinners.third.fill(false);
  currentTier.value = 'waiting';

  // 延迟显示逻辑
  const timer2 = setTimeout(() => {
    // 阶段1：三等奖 (现在是参与奖)
    currentTier.value = 'third';
    winners.third.forEach((_, i) => {
      const t = setTimeout(() => {
        revealedWinners.third[i] = true;
      }, i * 1200);
      giftTimers.push(t);
    });

    const tier1Duration = winners.third.length * 1200 + 2500;

    // 阶段2：大奖
    const timer3 = setTimeout(() => {
      currentTier.value = 'grand';
      // 增加翻牌前的等待，营造极致的悬念
      const timer4 = setTimeout(() => {
        revealedWinners.grand = true;
        nextTick(() => {
          triggerConfetti();
          const timer5 = setTimeout(() => {
            currentTier.value = 'finished';

            const prize = checkUserWinStatus();
            if (prize) {
              userPrize.value = prize;
              const timer6 = setTimeout(() => {
                showWinnerPopup.value = true;
              }, 2500);
              giftTimers.push(timer6);
            } else {
              const timer7 = setTimeout(() => {
                showLossPopup.value = true;
              }, 2500);
              giftTimers.push(timer7);
            }
          }, 2000);
          giftTimers.push(timer5);
        });
      }, 2000);
      giftTimers.push(timer4);
    }, tier1Duration);
    giftTimers.push(timer3);
  }, 1000);
  giftTimers.push(timer2);
};

const handleRevealGift = () => {
  isRevealed.value = true;
};

const closeWinnerPopup = () => {
  showWinnerPopup.value = false;
  // 关闭后重置状态，以便下次（如果有）可以重新开始
  setTimeout(() => {
    isRevealed.value = false;
  }, 500);
};

const closeLossPopup = () => {
  showLossPopup.value = false;
};

const resetLottery = () => {
  // 清理所有未完成的定时器，防止旧动画与新动画冲突
  giftTimers.forEach((t) => clearTimeout(t));
  giftTimers.length = 0;
  stage.value = 'intro';
  currentTier.value = 'waiting';
};

const triggerConfetti = () => {
  const colors = ['#ff3b30', '#ffd700', '#007aff', '#34c759', '#af52de'];
  const container = document.querySelector('.confetti-wrapper');

  if (!container) return;

  // 清除旧的
  container.innerHTML = '';

  for (let i = 0; i < 150; i++) {
    const el = document.createElement('div');
    el.classList.add('confetti-piece');

    // 随机属性
    const bg = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100 + '%';
    const animDelay = Math.random() * 3 + 's';
    const animDuration = 3 + Math.random() * 2 + 's';

    el.style.backgroundColor = bg;
    el.style.left = left;
    el.style.animationDelay = animDelay;
    el.style.animationDuration = animDuration;

    container.appendChild(el);
  }
};
</script>

<style scoped>
@import './style.scoped.css';
</style>
