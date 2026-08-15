<template>
  <div class="home">
    <!-- 统一英雄区渲染：数据库驱动排序/显隐/归档，按 template 分流渲染 -->
    <HomeHeroRow
      v-for="hero in visibleHeroes"
      :key="hero.id"
      :layout="heroLayout(hero)"
      :aria-label="hero.aria_label || hero.label || hero.title"
      :id="hero.builtin_key === 'split-brand-letter' ? 'ryyik-letter' : undefined"
    >
      <DynamicHomeHero
        v-if="hero.template !== 'builtin'"
        :hero="hero"
        @link-click="handleDynamicLinkClick"
      />
      <BuiltinHeroRenderer
        v-else
        :hero="hero"
        :birthday-people="birthdayPeople"
        @poster="openPosterModal"
        @birthday-more="onBirthdayMore"
        @open-fuzhou="openFuzhouModal"
        @open-cloud-plus="openCloudPlusModal"
        @open-anniversary-letter="openAnniversaryLetter"
      />
    </HomeHeroRow>

    <!-- 遇见福州 弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showFuzhouModal" class="fuzhou-modal-overlay" @click.self="showFuzhouModal = false">
          <div class="fuzhou-modal-card">
            <button class="modal-close-btn" @click="closeFuzhouModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="fuzhou-modal-content">
              <div class="fuzhou-modal-header">
                <div class="fuzhou-modal-icon">🏮</div>
                <h2 class="fuzhou-modal-title">遇见福州</h2>
              </div>
              <div class="fuzhou-modal-body">
                <p class="fuzhou-modal-paragraph">方块之家遇见系列从7周年开始，现将来到福州。</p>
                <p class="fuzhou-modal-paragraph">福州是一座被茉莉花香浸润的城市。三坊七巷的黛瓦白墙里藏着千年闽都的呼吸，闽江水穿城而过奔赴大海。古榕垂荫下的鱼丸汤冒着热气，石板路上回响着岁月的脚步——有福之州，正用它独有的温度，等待与方块之家的你相遇。</p>
              </div>
              <div class="fuzhou-modal-actions">
                <button class="fuzhou-modal-close-btn" @click="closeFuzhouModal">
                  了解了
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 八周年信件弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAnniversaryLetter" class="anniversary-modal-overlay" @click.self="closeAnniversaryLetter">
          <article class="anniversary-modal-card" role="dialog" aria-modal="true" aria-labelledby="anniversary-letter-title">
            <button class="modal-close-btn" aria-label="关闭信件" @click="closeAnniversaryLetter">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="anniversary-letter-content">
              <header class="letter-header">
                <img :src="anniversaryTextImg" alt="方块之家八周年" class="letter-logo-img" width="768" height="512">
                <h2 id="anniversary-letter-title" class="letter-title">来自 Ryyik 的一封信</h2>
              </header>
              <div class="letter-body">
                <p class="letter-paragraph">TO：方块之家的各位</p>
                <p class="letter-paragraph">祝方块之家八周年快乐！</p>
                <p class="letter-paragraph">回望这一路，我总觉得不可思议：我们竟然真的从 2018 年，一起走到了 2026 年。</p>
                <p class="letter-paragraph">这八年里，与你们共度的每一天，都构成了我青春中无比珍贵的一部分。因为有你们，才有了方块之家；也正因为有你们，我们才能一直走到今天。</p>
                <p class="letter-paragraph">八年前，当我第一次遇见小天光时，我从未想过，后来会认识这么多人，会与大家共同写下这么多故事。因为你们，我们愿意笨拙地拍摄一部又一部纪念短片，搭建一张又一张周年庆地图，一遍遍设计和完善属于我们的角色。我们一起构建了一个很特别的社群——一个会认真庆祝周年、举办生日会，也会一起策划各种活动的社群。</p>
                <p class="letter-paragraph">到了 2026 年，我又执着地想要建设一个能够承载我们共同回忆的网站。那些曾经觉得遥不可及的功能，竟然在短短几个月里一点点变成了现实。支撑我不断做下去的动力，是想到屏幕另一边还有你们，愿意成为这些故事的观众，也愿意继续参与其中。</p>
                <p class="letter-paragraph">而事实证明，这一切都值得。</p>
                <p class="letter-paragraph">因为有你们在，一切才有意义。</p>
                <p class="letter-paragraph">这么多年，我们共同创造了许多地图。但最打动我的，始终是你们愿意一次又一次回到方块街。正是这种反复的归来，让我每一次登录，都像是回到了家。</p>
                <p class="letter-paragraph">从最初那个尚且懵懂的“未开智”时期，到如今陆续步入大学，我们彼此包容，共同经历，也一起长大。我愿意把这段情谊称为我人生二十年来最美好的经历之一。</p>
                <p class="letter-paragraph">最初遇见的小天光、小仙、3759、小牛、Zombater、AWGIU、厕所君、LF、好奇、橙子、百城、Daji、End、物理外挂……后来加入的汉堡、Eleven、丁老师、YUFUQU、黑白……以及许许多多陪伴过方块之家的群友们——每一个名字，都构成了这段漫长故事的一部分。</p>
                <p class="letter-paragraph">后来，我第一次在现实中见到了百城、LF 和物理外挂。经过这么多年密切的交流，真正见到你们的那一刻，我由衷地感到开心。我没有想到，一段诞生于互联网的友谊，最终可以变得如此真实而具体。</p>
                <p class="letter-paragraph">我也迫不及待地想要见到更多的各位。只是受限于眼下的条件，这个愿望还不能立刻实现。但我相信，未来还很长。愿我们有足够的时间，也有足够的缘分，在现实中的某一天真正相见。</p>
                <p class="letter-paragraph">八年不是终点，而是我们共同故事中的又一个坐标。</p>
                <p class="letter-paragraph">谢谢你们曾经来到这里，也谢谢你们愿意一直留在这里。因为有你们，方块之家才不只是一张地图、一个群聊或一个网站，而是一段真实发生过，并且仍在继续的共同经历。</p>
                <p class="letter-paragraph">未来，我们或许会走向不同的地方，拥有各自新的生活，但我相信，这八年间共同创造的一切，都会成为我们记忆中无法替代的一部分。</p>
                <p class="letter-paragraph">愿我们继续创造新的故事，也愿多年以后，当我们再次谈起方块之家时，依然会为曾经拥有这样一段时光而感到庆幸。</p>
                <p class="letter-paragraph">祝方块之家八周年快乐！</p>
                <p class="letter-paragraph">也祝方块之家的每一位，在各自的人生中平安顺遂，始终保有热爱，并继续成为自己想成为的人。</p>
                <footer class="letter-signature">
                  <p>Ryyik</p>
                  <p class="letter-date">2026 年 7 月</p>
                </footer>
                <section class="anniversary-gift" aria-labelledby="anniversary-gift-title">
                  <div class="anniversary-gift-copy">
                    <h3 id="anniversary-gift-title">八周年订阅礼物</h3>
                    <p>每个账号可免费领取一次 Max 订阅权益，有效期一个月。</p>
                  </div>
                  <label v-if="anniversaryHigherPlan" class="anniversary-upgrade-option">
                    <input v-model="preferCurrentAnniversaryTier" type="checkbox">
                    <span>升级为 {{ anniversaryHigherPlanName }}，为当前订阅续期一个月</span>
                  </label>
                  <button type="button" class="anniversary-claim-btn"
                    :disabled="isAnniversaryGiftLoading || anniversaryGiftClaimed"
                    :aria-busy="isAnniversaryGiftLoading" @click="claimAnniversaryGift">
                    <Gift :size="17" :stroke-width="2" aria-hidden="true" />
                    <span>免费领取订阅</span>
                  </button>
                  <p v-if="anniversaryGiftMessage" class="anniversary-gift-status"
                    :class="{ success: anniversaryGiftClaimed, error: anniversaryGiftError }" role="status">
                    {{ anniversaryGiftMessage }}
                  </p>
                </section>
              </div>
            </div>
          </article>
        </div>
      </Transition>
    </Teleport>

    <!-- BOH Cloud+ 联动功能弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showCloudPlusModal" class="cloud-plus-modal-overlay" @click.self="closeCloudPlusModal">
          <div class="cloud-plus-modal-card">
            <button class="modal-close-btn" @click="closeCloudPlusModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="cloud-plus-modal-content">
              <div class="cloud-plus-modal-header">
                <div class="cloud-plus-modal-icon">☁️</div>
                <h2 class="cloud-plus-modal-title">BOH Cloud+</h2>
                <p class="cloud-plus-modal-subtitle">云端内容，随时可达</p>
              </div>
              <div class="cloud-plus-modal-body">
                <div class="cloud-plus-feature">
                  <div class="feature-icon">☁️</div>
                  <div class="feature-content">
                    <h3 class="feature-title">云端笔记</h3>
                    <p class="feature-desc">记录社群灵感、活动想法和日常内容，跨设备保持同步</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">🗂️</div>
                  <div class="feature-content">
                    <h3 class="feature-title">内容整理</h3>
                    <p class="feature-desc">把笔记、素材和个人内容集中管理，减少分散查找的麻烦</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">🔗</div>
                  <div class="feature-content">
                    <h3 class="feature-title">跨平台同步</h3>
                    <p class="feature-desc">在不同设备间访问你的内容，保持 BOH 相关资料持续在线</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">📚</div>
                  <div class="feature-content">
                    <h3 class="feature-title">社群资料库</h3>
                    <p class="feature-desc">沉淀值得保存的 BOH 资料，让重要内容不再散落各处</p>
                  </div>
                </div>
              </div>
              <div class="cloud-plus-modal-actions">
                <router-link to="/user-space/note" class="cloud-plus-modal-primary-btn" @click="closeCloudPlusModal">
                  立即体验
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 八周年纪念海报申请弹窗 -->
    <Teleport to="body">
      <Transition name="poster-fade">
        <div v-if="showPosterModal" class="poster-modal-overlay" @click.self="closePosterModal">
          <div class="poster-modal-card" role="dialog" aria-modal="true" aria-labelledby="poster-modal-title">
            <span class="poster-modal-orb poster-orb-a" aria-hidden="true"></span>
            <span class="poster-modal-orb poster-orb-b" aria-hidden="true"></span>
            <button class="poster-close-btn" aria-label="关闭海报申请" @click="closePosterModal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="poster-modal-content">
              <div class="poster-modal-header">
                <div class="poster-modal-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="3"></rect>
                    <circle cx="8.5" cy="9" r="1.6"></circle>
                    <path d="M4 17l4.5-4.5c.8-.8 2.1-.8 2.9 0l3.2 3.2"></path>
                    <path d="M17.5 15.5l-1.4-1.4c-.8-.8-2.1-.8-2.9 0L11 16"></path>
                  </svg>
                </div>
                <h2 id="poster-modal-title" class="poster-modal-title">八周年纪念海报</h2>
                <p class="poster-modal-subtitle">方块之家八周年 · 校园设定集纪念海报</p>
              </div>
              <div class="poster-modal-notice">
                <p>海报采用实体印刷，提交申请后 <strong>5 天内送达</strong>。</p>
                <p>每份海报需支付 <strong>5 RMB 物料费</strong>，运费由方块之家承担。</p>
              </div>
              <form class="poster-form" @submit.prevent="submitPosterApplication">
                <div class="poster-form-grid">
                  <div class="poster-input-group">
                    <label for="poster-recipient">收件人姓名</label>
                    <input id="poster-recipient" v-model="posterForm.recipient" type="text" maxlength="40"
                      placeholder="请输入收件人姓名" autocomplete="name" :disabled="posterSubmitted">
                  </div>
                  <div class="poster-input-group">
                    <label for="poster-phone">联系电话</label>
                    <input id="poster-phone" v-model="posterForm.phone" type="tel" maxlength="20"
                      placeholder="请输入联系电话" autocomplete="tel" :disabled="posterSubmitted">
                  </div>
                  <div class="poster-input-group poster-full-row">
                    <label for="poster-address">详细收货地址</label>
                    <textarea id="poster-address" v-model="posterForm.address" maxlength="200" rows="3"
                      class="poster-textarea" placeholder="请输入省市区及详细地址" autocomplete="street-address"
                      :disabled="posterSubmitted"></textarea>
                  </div>
                </div>
                <p v-if="posterMessage" class="poster-status" :class="{ success: posterSuccess, error: posterError }"
                  role="status">
                  {{ posterMessage }}
                </p>
                <div class="poster-modal-actions">
                  <button v-if="!posterSubmitted" type="submit" class="poster-primary-btn"
                    :disabled="isPosterSubmitting" :aria-busy="isPosterSubmitting">
                    {{ isPosterSubmitting ? '正在提交...' : '提交申请' }}
                  </button>
                  <button v-else type="button" class="poster-primary-btn" @click="closePosterModal">
                    完成
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 首屏页脚 — 仅 Home 显示 -->
    <HomeFooter />

  </div>
</template>

<script setup>
import { computed, nextTick, ref, onMounted, onUnmounted, watch } from "vue";
import { Gift } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import HomeHeroRow from "./components/HomeHeroRow.vue";
import HomeFooter from "./components/HomeFooter.vue";
import DynamicHomeHero from "./components/DynamicHomeHero.vue";
import BuiltinHeroRenderer from "./components/BuiltinHeroRenderer.vue";
import { builtinHeroLayout } from "./components/homeArchiveData.js";
import { useHomeHeroesStore } from "@/stores/homeHeroes";
import { isBirthdayToday } from "@/utils/birthday.js";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import {
  claimAnniversarySubscription,
  getAnniversarySubscriptionClaim,
  getMySubscriptions
} from "@/utils/api/subscription-api.js";
import {
  PLAN_DISPLAY_NAMES,
  resolveHighestTierCode
} from "@/utils/subscription-benefits.js";
import { submitPosterRequest } from "@/utils/api/poster-api.js";

// 八周年信件弹窗用到的图片（仍在 Home 内使用）
import anniversaryTextImg from "@/assets/images/8yearstext.webp?url";

// 路由相关
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, userInfo, showLoginModal } = storeToRefs(authStore);

const showAnniversaryLetter = ref(false);
const showCloudPlusModal = ref(false);

// ============================================
// 八周年纪念海报申请
// ============================================
const showPosterModal = ref(false);
const posterForm = ref({ recipient: '', phone: '', address: '' });
const isPosterSubmitting = ref(false);
const posterSubmitted = ref(false);
const posterSuccess = ref(false);
const posterError = ref(false);
const posterMessage = ref('');

const openPosterModal = () => {
  showPosterModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closePosterModal = () => {
  showPosterModal.value = false;
  document.body.style.overflow = '';
  posterForm.value = { recipient: '', phone: '', address: '' };
  isPosterSubmitting.value = false;
  posterSubmitted.value = false;
  posterSuccess.value = false;
  posterError.value = false;
  posterMessage.value = '';
};

const submitPosterApplication = async () => {
  posterError.value = false;
  if (!isLoggedIn.value || !userInfo.value?.id) {
    posterMessage.value = '请先登录，再提交海报申请。';
    posterError.value = true;
    showLoginModal.value = true;
    return;
  }
  if (isPosterSubmitting.value || posterSubmitted.value) return;

  const { recipient, phone, address } = posterForm.value;
  if (!recipient.trim() || !phone.trim() || !address.trim()) {
    posterMessage.value = '请填写完整的收件信息。';
    posterError.value = true;
    return;
  }

  isPosterSubmitting.value = true;
  posterMessage.value = '';
  const result = await submitPosterRequest({ recipient, phone, address });

  if (result.ok) {
    posterSubmitted.value = true;
    posterSuccess.value = true;
    posterMessage.value = '申请已提交，海报将在 5 天内送达（物料费 5 RMB）。详细内容请于“礼物”页面查看。';
  } else {
    posterError.value = true;
    posterMessage.value = result.error?.message || '申请提交失败，请稍后重试。';
  }
  isPosterSubmitting.value = false;
};

// ============================================
// 生日英雄区：仅在登录用户生日当天显示
// ============================================
const birthdayPeople = computed(() => {
  if (!isLoggedIn.value) return [];
  const { birthMonth, birthDay, username, avatarUrl } = userInfo.value || {};
  if (!isBirthdayToday(birthMonth, birthDay)) return [];
  return [{ name: username || '你', avatarUrl: avatarUrl || '' }];
});
const showBirthdayHero = computed(() => birthdayPeople.value.length > 0);
const onBirthdayMore = () => {
  router.push('/birthday');
};

const isAnniversaryGiftLoading = ref(false);
const anniversaryGiftClaimed = ref(false);
const anniversaryGiftError = ref(false);
const anniversaryGiftMessage = ref('');
const anniversaryHigherPlan = ref('');
const preferCurrentAnniversaryTier = ref(true);
const anniversaryHigherPlanName = computed(() => (
  PLAN_DISPLAY_NAMES[anniversaryHigherPlan.value] || anniversaryHigherPlan.value
));

// ============================================
// 统一英雄区：数据库驱动排序/显隐/归档
// builtin 类型按 builtin_key 分发到对应硬编码组件，其余走 DynamicHomeHero
// ============================================
const homeHeroesStore = useHomeHeroesStore();

// 可见英雄区列表：已发布未归档，birthday 需额外检测今日是否有用户生日
const visibleHeroes = computed(() =>
  homeHeroesStore.publishedHeroes.filter((hero) => {
    if (hero.template === 'builtin' && hero.builtin_key === 'birthday') {
      return showBirthdayHero.value;
    }
    return true;
  })
);

// 英雄区布局：builtin 类型查映射表，其余按 template 判断
const heroLayout = (hero) => {
  if (hero.template === 'builtin') {
    return builtinHeroLayout[hero.builtin_key] || 'full';
  }
  return hero.template === 'split' ? 'split' : 'full';
};

const formatAnniversaryExpiry = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const loadAnniversaryGiftState = async () => {
  anniversaryGiftError.value = false;
  anniversaryHigherPlan.value = '';
  preferCurrentAnniversaryTier.value = true;
  if (!isLoggedIn.value || !userInfo.value?.id) {
    anniversaryGiftClaimed.value = false;
    anniversaryGiftMessage.value = '';
    return;
  }

  isAnniversaryGiftLoading.value = true;
  const [claimResult, subscriptionsResult] = await Promise.all([
    getAnniversarySubscriptionClaim(userInfo.value.id),
    getMySubscriptions(userInfo.value.id, { includeExpired: false })
  ]);

  if (claimResult.data) {
    anniversaryGiftClaimed.value = true;
    const expiry = formatAnniversaryExpiry(claimResult.data.expiresAt);
    anniversaryGiftMessage.value = `已领取 ${claimResult.data.planName || 'Max'}${expiry ? `，有效期至 ${expiry}` : ''}`;
  } else {
    anniversaryGiftClaimed.value = false;
    anniversaryGiftMessage.value = '';
  }

  const highestTier = subscriptionsResult.error
    ? ''
    : resolveHighestTierCode(subscriptionsResult.data || []);
  if (['ultra'].includes(highestTier)) anniversaryHigherPlan.value = highestTier;
  isAnniversaryGiftLoading.value = false;
};

const claimAnniversaryGift = async () => {
  anniversaryGiftError.value = false;
  if (!isLoggedIn.value || !userInfo.value?.id) {
    anniversaryGiftMessage.value = '请先登录，再领取八周年订阅礼物。';
    showLoginModal.value = true;
    return;
  }
  if (isAnniversaryGiftLoading.value || anniversaryGiftClaimed.value) return;

  isAnniversaryGiftLoading.value = true;
  anniversaryGiftMessage.value = '';
  const result = await claimAnniversarySubscription({
    preferCurrentTier: Boolean(anniversaryHigherPlan.value && preferCurrentAnniversaryTier.value)
  });
  const claim = result.data;

  if (result.ok || claim?.alreadyClaimed) {
    anniversaryGiftClaimed.value = true;
    const expiry = formatAnniversaryExpiry(claim?.expiresAt);
    anniversaryGiftMessage.value = `${claim?.alreadyClaimed ? '你已经领取过' : '领取成功：'} ${claim?.planName || 'Max'}${expiry ? `，有效期至 ${expiry}` : ''}`;
  } else {
    anniversaryGiftError.value = true;
    anniversaryGiftMessage.value = result.error?.message || '领取失败，请稍后重试。';
  }
  isAnniversaryGiftLoading.value = false;
};

const openAnniversaryLetter = () => {
  showAnniversaryLetter.value = true;
  document.body.style.overflow = 'hidden';
  void loadAnniversaryGiftState();
};

const closeAnniversaryLetter = () => {
  showAnniversaryLetter.value = false;
  document.body.style.overflow = '';
};

watch(
  () => route.hash,
  async (hash) => {
    if (hash !== '#ryyik-letter') return;
    await nextTick();
    openAnniversaryLetter();
  },
  { immediate: true },
);

watch(isLoggedIn, () => {
  if (showAnniversaryLetter.value) void loadAnniversaryGiftState();
});

const openCloudPlusModal = () => {
  showCloudPlusModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeCloudPlusModal = () => {
  showCloudPlusModal.value = false;
  document.body.style.overflow = '';
};

// 遇见福州 弹窗
const showFuzhouModal = ref(false);

const openFuzhouModal = () => {
  showFuzhouModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeFuzhouModal = () => {
  showFuzhouModal.value = false;
  document.body.style.overflow = '';
};

// 处理动态英雄区按钮点击（onClick 字符串约定：'modal:<key>'）
const handleDynamicLinkClick = (onClickStr) => {
  if (!onClickStr) return;
  const [type, key] = onClickStr.split(':');
  if (type === 'modal') {
    if (key === 'fuzhou') openFuzhouModal();
    else if (key === 'cloud-plus') openCloudPlusModal();
    else if (key === 'anniversary-letter') openAnniversaryLetter();
  }
};

// 滚动触发的观察器逻辑
let observer = null;

const initIntersectionObserver = () => {
  if (typeof window === "undefined" || !window.IntersectionObserver) return;

  const options = {
    root: null,
    rootMargin: "0px 0px 200px 0px",
    threshold: 0.05,
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains("fade-section")) {
          entry.target.classList.add("visible");
        }
        observer.unobserve(entry.target);
      }
    });
  }, options);

  const elementsToObserve = document.querySelectorAll(".fade-section");
  elementsToObserve.forEach((el) => observer.observe(el));
};

const cleanupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

onMounted(async () => {
  document.body.classList.add("is-loaded");

  initIntersectionObserver();

  // 加载已发布动态英雄区（失败不影响首屏，硬编码英雄区照常显示）
  try {
    await homeHeroesStore.fetchPublished();
  } catch {
    // 静默失败：动态英雄区是增量，表不存在时仅返回空数组
  }
});

onUnmounted(() => {
  cleanupObserver();
  document.body.style.overflow = '';
});
</script>

<style scoped src="./style.scoped.css"></style>
<style src="./style.global.css"></style>
