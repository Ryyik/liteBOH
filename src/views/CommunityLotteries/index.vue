<template>
  <div ref="pageRef" class="community-lottery-page">

    <Transition name="lottery-toast">
      <div v-if="toast.show" class="lottery-toast" :class="`toast-${toast.type}`" role="status">
        <strong>{{ toast.title }}</strong>
        <span>{{ toast.message }}</span>
      </div>
    </Transition>

    <main class="community-lottery-main">
      <header class="community-lottery-header">
        <div class="community-lottery-heading">
          <span class="community-lottery-kicker"><Ticket :size="14" :stroke-width="2.2" aria-hidden="true" /> COMMUNITY LOTTERY</span>
          <h1>社区抽奖</h1>
          <p>报名正在进行的抽奖，查看历史开奖和中奖名单。</p>
        </div>
      </header>

      <!-- 保底进度与积分已由全局导航栏保底灵动岛（PityIslandCard）承载，页面不再重复展示 -->

      <div class="community-lottery-toolbar">
        <div class="community-lottery-tabs" role="tablist" aria-label="抽奖筛选">
          <button :class="{ active: activeTab === 'active' }" :aria-selected="activeTab === 'active'" @click="activeTab = 'active'">进行中</button>
          <button :class="{ active: activeTab === 'history' }" :aria-selected="activeTab === 'history'" @click="activeTab = 'history'">历史抽奖</button>
        </div>

        <div v-if="activeTab === 'history'" class="lottery-filter-row" aria-label="历史抽奖筛选">
          <div class="lottery-custom-select" :class="{ open: showStatusFilterMenu }" @click.stop>
            <button type="button" class="lottery-select-trigger" :aria-expanded="showStatusFilterMenu" aria-haspopup="listbox" aria-label="历史状态筛选" @click="toggleStatusFilterMenu">
              <span class="lottery-select-value">{{ statusFilterLabel }}</span>
              <ChevronDown :size="14" :stroke-width="2.2" class="lottery-select-chevron" :class="{ rotated: showStatusFilterMenu }" aria-hidden="true" />
            </button>
            <Transition name="lottery-select">
              <ul v-if="showStatusFilterMenu" class="lottery-select-menu" role="listbox" aria-label="历史状态筛选">
                <li v-for="opt in statusFilterOptions" :key="opt.value" role="option" :aria-selected="historyStatusFilter === opt.value" :class="{ active: historyStatusFilter === opt.value }" @click="selectStatusFilter(opt.value)">{{ opt.label }}</li>
              </ul>
            </Transition>
          </div>
          <div class="lottery-custom-select" :class="{ open: showSortMenu }" @click.stop>
            <button type="button" class="lottery-select-trigger" :aria-expanded="showSortMenu" aria-haspopup="listbox" aria-label="历史排序" @click="toggleSortMenu">
              <span class="lottery-select-value">{{ sortLabel }}</span>
              <ChevronDown :size="14" :stroke-width="2.2" class="lottery-select-chevron" :class="{ rotated: showSortMenu }" aria-hidden="true" />
            </button>
            <Transition name="lottery-select">
              <ul v-if="showSortMenu" class="lottery-select-menu" role="listbox" aria-label="历史排序">
                <li v-for="opt in sortOptions" :key="opt.value" role="option" :aria-selected="historySort === opt.value" :class="{ active: historySort === opt.value }" @click="selectSort(opt.value)">{{ opt.label }}</li>
              </ul>
            </Transition>
          </div>
        </div>

        <div class="community-lottery-overview" aria-label="抽奖概览">
          <span><Trophy :size="14" aria-hidden="true" /><strong>{{ activeLotteries.length }}</strong> 进行中</span>
          <span><History :size="14" aria-hidden="true" /><strong>{{ historyLotteries.length }}</strong> 历史</span>
        </div>
      </div>

      <section v-if="isLoading" class="community-lottery-grid" aria-hidden="true">
        <article v-for="item in 3" :key="item" class="community-lottery-card skeleton-card">
          <div class="lottery-skeleton cover"></div>
          <div class="lottery-skeleton title"></div>
          <div class="lottery-skeleton line"></div>
          <div class="lottery-skeleton line short"></div>
        </article>
      </section>

      <section v-else-if="loadError" class="community-lottery-empty lottery-error-state">
        <h2>抽奖加载失败</h2>
        <p>{{ loadError }}</p>
        <button type="button" class="lottery-secondary-action" @click="loadLotteries">重试</button>
      </section>

      <template v-else-if="activeTab === 'active'">
        <section v-if="primaryActiveLottery" class="lottery-featured-section">
          <article class="lottery-featured-card" :class="{ 'no-cover': !primaryActiveLottery.cover_image_url }">
            <div v-if="primaryActiveLottery.cover_image_url" class="lottery-featured-cover">
              <img :src="getImageUrl(primaryActiveLottery.cover_image_url)" :alt="primaryActiveLottery.prize_title" width="1600" height="960" fetchpriority="high" loading="eager" decoding="async" />
            </div>

            <div class="lottery-featured-content">
              <div class="community-lottery-card-top">
                <span class="lottery-status" :class="getLotteryStatusClass(primaryActiveLottery)">{{ getLotteryStatusText(primaryActiveLottery) }}</span>
                <span>{{ getEntryProgressText(primaryActiveLottery) }}</span>
              </div>

              <h2>{{ primaryActiveLottery.title }}</h2>
              <p v-if="getPityGhost(primaryActiveLottery)" class="lottery-pity-ghost" :class="`ghost-${getPityGhost(primaryActiveLottery).dot}`">
                <span class="pity-ghost-dot" :class="{ 'is-due': getPityGhost(primaryActiveLottery).isDue }"></span>
                <span>{{ getPityGhost(primaryActiveLottery).text }}</span>
                <span v-if="getPityGhost(primaryActiveLottery).extra" class="pity-ghost-extra">{{ getPityGhost(primaryActiveLottery).extra }}</span>
              </p>
              <p v-if="primaryActiveLottery.description" class="lottery-description">{{ primaryActiveLottery.description }}</p>

              <div class="lottery-countdown-panel" v-if="lotteryCountdownText(primaryActiveLottery)">
                <span>{{ lotteryCountdownLabel(primaryActiveLottery) }}</span>
                <strong>{{ lotteryCountdownText(primaryActiveLottery) }}</strong>
              </div>

              <div class="lottery-prize">
                <span>本期奖品</span>
                <strong>{{ primaryActiveLottery.prize_title }}</strong>
                <small v-if="primaryActiveLottery.prize_description">{{ primaryActiveLottery.prize_description }}</small>
              </div>

              <div class="lottery-facts">
                <div>
                  <span>开奖方式</span>
                  <strong>系统随机抽取</strong>
                </div>
                <div>
                  <span>预计开奖</span>
                  <strong>{{ getDrawTimeText(primaryActiveLottery) }}</strong>
                </div>
                <div>
                  <span>中奖人数</span>
                  <strong>{{ getWinnerCountText(primaryActiveLottery) }}</strong>
                </div>
              </div>

              <div class="lottery-progress" :aria-label="getEntryProgressText(primaryActiveLottery)">
                <div :style="{ width: getEntryProgressPercent(primaryActiveLottery) }"></div>
              </div>

              <div v-if="primaryActiveLottery.current_user_entry_id" class="lottery-entry-state">
                <span>已获得抽奖资格</span>
                <strong>{{ getCurrentEntryText(primaryActiveLottery) }}</strong>
                <small v-if="primaryActiveLottery.current_user_entry_created_at">报名时间：{{ formatLotteryDate(primaryActiveLottery.current_user_entry_created_at) }}</small>
              </div>

              <div class="lottery-action-row">
                <button
                  class="lottery-join-action primary"
                  :disabled="isLotteryJoinDisabled(primaryActiveLottery)"
                  @click="handleJoinLottery(primaryActiveLottery)"
                >
                  {{ getJoinButtonText(primaryActiveLottery) }}
                </button>
                <button type="button" class="lottery-boost-action" disabled title="积分加注 +1 注需 5 积分（即将开放）" aria-label="积分加注">
                  <Coins :size="14" :stroke-width="2" aria-hidden="true" /> 加注
                </button>
                <button type="button" class="lottery-icon-action" title="查看抽奖详情" aria-label="查看抽奖详情" @click="openLotteryDetail(primaryActiveLottery)"><Info :size="18" aria-hidden="true" /></button>
                <button type="button" class="lottery-icon-action" title="分享抽奖" aria-label="分享抽奖" @click="copyLotteryLink(primaryActiveLottery)"><Share2 :size="18" aria-hidden="true" /></button>
              </div>

              <p class="lottery-eligibility">
                每个账号每期仅可报名一次。<template v-if="primaryActiveLottery.enforce_account_age_check">账号创建满 24 小时后可参与。</template> · 参与计入保底，未来参与奖可获积分回馈。
              </p>
            </div>
          </article>

          <section v-if="secondaryActiveLotteries.length" class="community-lottery-grid compact-grid">
            <article
              v-for="lottery in secondaryActiveLotteries"
              :key="lottery.id"
              class="community-lottery-card"
              :class="{ 'no-cover': !lottery.cover_image_url }"
            >
              <div v-if="lottery.cover_image_url" class="community-lottery-cover">
                <img :src="getImageUrl(lottery.cover_image_url)" :alt="lottery.prize_title" width="720" height="480" loading="lazy" decoding="async" />
              </div>
              <div v-else class="community-lottery-cover lottery-cover-fallback">
                <span>PRIZE</span>
                <strong>{{ lottery.prize_title || '社区抽奖' }}</strong>
              </div>

              <div class="community-lottery-card-body">
                <div class="community-lottery-card-top">
                  <span class="lottery-status" :class="getLotteryStatusClass(lottery)">{{ getLotteryStatusText(lottery) }}</span>
                  <span>{{ lottery.entry_count }} 人报名</span>
                </div>

                <h2>{{ lottery.title }}</h2>
                <p v-if="getPityGhost(lottery)" class="lottery-pity-ghost compact" :class="`ghost-${getPityGhost(lottery).dot}`">
                  <span class="pity-ghost-dot" :class="{ 'is-due': getPityGhost(lottery).isDue }"></span>
                  <span>{{ getPityGhost(lottery).text }}</span>
                  <span v-if="getPityGhost(lottery).extra" class="pity-ghost-extra">{{ getPityGhost(lottery).extra }}</span>
                </p>
                <p v-if="lottery.description" class="lottery-description">{{ lottery.description }}</p>

                <div class="lottery-prize">
                  <span>奖品</span>
                  <strong>{{ lottery.prize_title }}</strong>
                  <small v-if="lottery.prize_description">{{ lottery.prize_description }}</small>
                </div>

                <div class="lottery-facts">
                  <div>
                    <span>开奖方式</span>
                    <strong>系统随机抽取</strong>
                  </div>
                  <div>
                    <span>预计开奖</span>
                    <strong>{{ getDrawTimeText(lottery) }}</strong>
                  </div>
                  <div>
                    <span>中奖人数</span>
                    <strong>{{ getWinnerCountText(lottery) }}</strong>
                  </div>
                </div>

                <div class="lottery-progress" :aria-label="getEntryProgressText(lottery)">
                  <div :style="{ width: getEntryProgressPercent(lottery) }"></div>
                </div>

                <div v-if="lottery.current_user_entry_id" class="lottery-entry-state compact">
                  <span>已获得抽奖资格</span>
                  <strong>{{ getCurrentEntryText(lottery) }}</strong>
                </div>

                <div class="lottery-card-footer">
                  <div class="lottery-submeta">
                    <span>{{ getEntryProgressText(lottery) }}</span>
                    <span v-if="lottery.entry_deadline_at">报名截止：{{ formatLotteryDate(lottery.entry_deadline_at) }}</span>
                    <span v-if="lotteryCountdownText(lottery)">{{ lotteryCountdownText(lottery) }}</span>
                  </div>
                  <div class="lottery-card-actions">
                    <button
                      class="lottery-join-action"
                      :disabled="isLotteryJoinDisabled(lottery)"
                      @click="handleJoinLottery(lottery)"
                    >
                      {{ getJoinButtonText(lottery) }}
                    </button>
                    <button type="button" class="lottery-boost-action compact" disabled title="积分加注即将开放"><Coins :size="12" :stroke-width="2" aria-hidden="true" /></button>
                    <button type="button" class="lottery-icon-action" title="查看抽奖详情" aria-label="查看抽奖详情" @click="openLotteryDetail(lottery)"><ChevronRight :size="18" aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </section>

        <section v-else class="community-lottery-empty">
          <h2>暂无进行中的抽奖</h2>
          <p>新的社区抽奖开放后会出现在这里。你也可以切换到历史抽奖查看过往结果。</p>
        </section>
      </template>

      <template v-else>
        <section v-if="visibleHistoryLotteries.length" class="community-lottery-grid">
          <article
            v-for="lottery in visibleHistoryLotteries"
            :key="lottery.id"
            class="community-lottery-card history-card"
            :class="{ 'no-cover': !lottery.cover_image_url }"
          >
            <div v-if="lottery.cover_image_url" class="community-lottery-cover">
              <img :src="getImageUrl(lottery.cover_image_url)" :alt="lottery.prize_title" width="720" height="480" loading="lazy" decoding="async" />
            </div>
            <div v-else class="community-lottery-cover lottery-cover-fallback">
              <span>PRIZE</span>
              <strong>{{ lottery.prize_title || '社区抽奖' }}</strong>
            </div>

            <div class="community-lottery-card-body">
              <div class="community-lottery-card-top">
                <span class="lottery-status" :class="getLotteryStatusClass(lottery)">{{ getLotteryStatusText(lottery) }}</span>
                <span>{{ lottery.entry_count }} 人报名</span>
              </div>

              <h2>{{ lottery.title }}</h2>
              <p v-if="lottery.description" class="lottery-description">{{ lottery.description }}</p>

              <div class="lottery-prize">
                <span>奖品</span>
                <strong>{{ lottery.prize_title }}</strong>
                <small v-if="lottery.prize_description">{{ lottery.prize_description }}</small>
              </div>

              <div class="lottery-facts">
                <div>
                  <span>开奖方式</span>
                  <strong>系统随机抽取</strong>
                </div>
                <div>
                  <span>开奖时间</span>
                  <strong>{{ getDrawTimeText(lottery) }}</strong>
                </div>
                <div>
                  <span>中奖人数</span>
                  <strong>{{ getWinnerCountText(lottery) }}</strong>
                </div>
              </div>

              <div class="lottery-progress" :aria-label="getEntryProgressText(lottery)">
                <div :style="{ width: getEntryProgressPercent(lottery) }"></div>
              </div>

              <div class="lottery-card-footer">
                <div class="lottery-submeta">
                  <span>{{ getEntryProgressText(lottery) }}</span>
                  <span>开奖：{{ getDrawTimeText(lottery) }}</span>
                </div>
                <div class="lottery-winners">
                  <span>中奖者</span>
                  <strong>{{ getWinnerNamesText(lottery) }}</strong>
                  <button type="button" class="lottery-inline-link" @click="openLotteryDetail(lottery)">查看完整结果</button>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section v-else class="community-lottery-empty">
          <h2>{{ historyStatusFilter === 'all' ? '暂无历史抽奖' : '暂无匹配的历史抽奖' }}</h2>
          <p>{{ historyStatusFilter === 'all' ? '开奖完成后会沉淀到这里，方便之后查看结果。' : '可以切换筛选条件查看更多历史记录。' }}</p>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <Transition name="lottery-modal">
        <div v-if="selectedLottery" class="lottery-detail-overlay" @click.self="closeLotteryDetail">
          <section class="lottery-detail-modal" role="dialog" aria-modal="true" aria-label="抽奖详情">
            <button class="lottery-detail-close" type="button" @click="closeLotteryDetail" aria-label="关闭"><X :size="19" aria-hidden="true" /></button>
            <div class="lottery-detail-header">
              <span class="lottery-status" :class="getLotteryStatusClass(selectedLottery)">{{ getLotteryStatusText(selectedLottery) }}</span>
              <h2>{{ selectedLottery.title }}</h2>
              <p v-if="selectedLottery.description">{{ selectedLottery.description }}</p>
            </div>

            <div class="lottery-detail-prize">
              <span>奖品</span>
              <strong>{{ selectedLottery.prize_title }}</strong>
              <p v-if="selectedLottery.prize_description">{{ selectedLottery.prize_description }}</p>
            </div>

            <div v-if="selectedLottery.pity_mode && selectedLottery.pity_mode !== 'none'" class="lottery-detail-pity" :class="`pity-${selectedLottery.pity_mode}`">
              <span class="pity-ghost-dot" :class="{ 'is-due': pityStatus?.isDue && selectedLottery.pity_mode === 'eligible' }"></span>
              <span v-if="selectedLottery.pity_mode === 'eligible'">此活动计入并兑现保底<span v-if="selectedLottery.pity_reward_title"> · 保底礼《{{ selectedLottery.pity_reward_title }}》</span></span>
              <span v-else>此活动仅计入保底，不兑现</span>
            </div>

            <div class="lottery-detail-grid">
              <div>
                <span>报名人数</span>
                <strong>{{ getEntryProgressText(selectedLottery) }}</strong>
              </div>
              <div>
                <span>开奖时间</span>
                <strong>{{ getDrawTimeText(selectedLottery) }}</strong>
              </div>
              <div>
                <span>中奖人数</span>
                <strong>{{ getWinnerCountText(selectedLottery) }}</strong>
              </div>
              <div>
                <span>开奖方式</span>
                <strong>系统随机抽取</strong>
              </div>
            </div>

            <div v-if="selectedLottery.status === 'open'" class="lottery-detail-rules">
              <h3>参与说明</h3>
              <p>每个账号每期抽奖只能报名一次。<template v-if="selectedLottery.enforce_account_age_check">账号创建满 24 小时后可参与；</template>报名截止或人数满额后不能继续报名。</p>
            </div>

            <div v-else class="lottery-detail-winners">
              <h3>中奖名单</h3>
              <ol v-if="getWinnerItems(selectedLottery).length">
                <li v-for="winner in getWinnerItems(selectedLottery)" :key="`${winner.position}-${winner.user_id || winner.username}`">
                  <span>#{{ winner.position }}</span>
                  <strong>{{ winner.username || '未记录用户名' }}</strong>
                </li>
              </ol>
              <p v-else>暂无中奖者记录。</p>
            </div>

            <div class="lottery-detail-actions">
              <button
                v-if="selectedLottery.status === 'open'"
                type="button"
                class="lottery-join-action primary"
                :disabled="isLotteryJoinDisabled(selectedLottery)"
                @click="handleJoinLottery(selectedLottery)"
              >
                {{ getJoinButtonText(selectedLottery) }}
              </button>
              <button type="button" class="lottery-secondary-action" @click="copyLotteryLink(selectedLottery)">复制链接</button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ChevronDown, ChevronRight, Coins, History, Info, Share2, Ticket, Trophy, Users, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { getImageUrl } from '../../utils/asset-helper.js';
import { getCommunityLotteries, joinCommunityLottery } from '../../utils/api/lottery-api.js';
import { getMyLotteryPityStatus } from '../../utils/api/subscription-api.js';
import { showIsland } from '@/composables/useIsland.js';
import PityIslandCard from './PityIslandCard.vue';

const authStore = useAuthStore();
const { isLoggedIn, showLoginModal, userInfo } = storeToRefs(authStore);
const route = useRoute();
const router = useRouter();

const userPoints = computed(() => Number(userInfo.value?.points || 0));
const userPointsDisplay = computed(() => userPoints.value.toLocaleString());
const goToPoints = () => {
  router.push('/user-space?tab=assets').catch(() => router.push('/user-space').catch(()=>{}));
};

const lotteries = ref([]);
const isLoading = ref(true);
const loadError = ref('');
const joiningLotteryId = ref('');
const activeTab = ref('active');
const historyStatusFilter = ref('all');
const historySort = ref('latest');
const showStatusFilterMenu = ref(false);
const showSortMenu = ref(false);
const now = ref(Date.now());

const statusFilterOptions = [
  { value: 'all', label: '全部历史' },
  { value: 'drawn', label: '已开奖' },
  { value: 'closed', label: '已关闭' }
];
const sortOptions = [
  { value: 'latest', label: '最新开奖' },
  { value: 'created', label: '最新创建' },
  { value: 'entries', label: '参与人数' }
];
const statusFilterLabel = computed(() => statusFilterOptions.find((o) => o.value === historyStatusFilter.value)?.label || '全部历史');
const sortLabel = computed(() => sortOptions.find((o) => o.value === historySort.value)?.label || '最新开奖');

const toggleStatusFilterMenu = () => {
  showStatusFilterMenu.value = !showStatusFilterMenu.value;
  if (showStatusFilterMenu.value) showSortMenu.value = false;
};
const toggleSortMenu = () => {
  showSortMenu.value = !showSortMenu.value;
  if (showSortMenu.value) showStatusFilterMenu.value = false;
};
const selectStatusFilter = (value) => {
  historyStatusFilter.value = value;
  showStatusFilterMenu.value = false;
};
const selectSort = (value) => {
  historySort.value = value;
  showSortMenu.value = false;
};
const closeFilterMenus = () => {
  showStatusFilterMenu.value = false;
  showSortMenu.value = false;
};
const selectedLottery = ref(null);
const pityStatus = ref(null);
const pityLoading = ref(false);
const pityError = ref('');
const toast = ref({
  show: false,
  type: 'info',
  title: '',
  message: ''
});
let nowTimer = null;
let toastTimer = null;
let dueRefreshLotteryIds = new Set();
const COMMUNITY_LOTTERY_CACHE_TTL = 30 * 1000;
const COMMUNITY_LOTTERY_CACHE_PREFIX = 'boh:community-lotteries:';

const getLotteryTimeValue = (lottery) => {
  const timestamp = Date.parse(lottery?.drawn_at || lottery?.draw_at || lottery?.created_at || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const activeLotteries = computed(() => lotteries.value.filter((lottery) => lottery.status === 'open'));
const historyLotteries = computed(() => lotteries.value.filter((lottery) => lottery.status !== 'open'));
const primaryActiveLottery = computed(() => activeLotteries.value[0] || null);
const secondaryActiveLotteries = computed(() => activeLotteries.value.slice(1));
const totalEntryCount = computed(() => lotteries.value.reduce((total, lottery) => total + Number(lottery.entry_count || 0), 0));

const visibleHistoryLotteries = computed(() => {
  const filtered = historyLotteries.value.filter((lottery) => (
    historyStatusFilter.value === 'all' || lottery.status === historyStatusFilter.value
  ));

  return [...filtered].sort((a, b) => {
    if (historySort.value === 'entries') {
      return Number(b.entry_count || 0) - Number(a.entry_count || 0);
    }
    if (historySort.value === 'created') {
      return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
    }
    return getLotteryTimeValue(b) - getLotteryTimeValue(a);
  });
});

const _originShowPageToast = (title, message, type = 'info') => {
  if (toastTimer) window.clearTimeout(toastTimer);
  toast.value = { show: true, type, title, message };
  toastTimer = window.setTimeout(() => {
    toast.value.show = false;
    toastTimer = null;
  }, 3200);
};
const showPageToast = (title, message, type = 'info') => {
  const iconMap = { success: 'success', error: 'warning', warning: 'warning', info: 'notification' };
  const icon = iconMap[type] || 'success';
  const durationMs = type === 'error' ? 3800 : 3200;
  let ok = false;
  try { ok = showIsland.notify({ title, message, icon, durationMs }); } catch { ok = false; }
  if (ok) return;
  return _originShowPageToast(title, message, type);
};

const syncSelectedLottery = () => {
  if (!selectedLottery.value?.id) return;
  const latestLottery = lotteries.value.find((item) => item.id === selectedLottery.value.id);
  if (latestLottery) {
    selectedLottery.value = latestLottery;
  }
};

const openRouteLottery = () => {
  const lotteryId = String(route.query?.lottery || '').trim();
  if (!lotteryId) return;
  const matchedLottery = lotteries.value.find((item) => item.id === lotteryId);
  if (!matchedLottery) return;
  activeTab.value = matchedLottery.status === 'open' ? 'active' : 'history';
  selectedLottery.value = matchedLottery;
};

const getLotteryCacheKey = () => `${COMMUNITY_LOTTERY_CACHE_PREFIX}${authStore.userInfo?.id || 'guest'}`;

const readLotteryCache = () => {
  try {
    const raw = window.sessionStorage.getItem(getLotteryCacheKey());
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!Array.isArray(cached?.data) || Date.now() - Number(cached.timestamp || 0) > COMMUNITY_LOTTERY_CACHE_TTL) return null;
    return cached.data;
  } catch {
    return null;
  }
};

const writeLotteryCache = (data) => {
  try {
    window.sessionStorage.setItem(getLotteryCacheKey(), JSON.stringify({ timestamp: Date.now(), data }));
  } catch {
    // Storage is an optional perceived-performance enhancement.
  }
};

const applyLotteries = (data) => {
  lotteries.value = Array.isArray(data) ? data : [];
  syncSelectedLottery();
  openRouteLottery();
  now.value = Date.now();
  dueRefreshLotteryIds = new Set(
    lotteries.value
      .filter((lottery) => lottery.status === 'open' && isDrawDue(lottery))
      .map((lottery) => lottery.id)
  );
  syncNowTimer();
};

const loadPityStatus = async () => {
  if (!isLoggedIn.value) {
    pityStatus.value = null;
    pityError.value = '';
    pityLoading.value = false;
    return;
  }
  pityLoading.value = true;
  pityError.value = '';
  try {
    const { ok, data, error } = await getMyLotteryPityStatus();
    if (!ok) throw error || new Error('保底不可用');
    pityStatus.value = data;
  } catch (error) {
    pityError.value = error?.message || '保底暂不可用';
    pityStatus.value = null;
  } finally {
    pityLoading.value = false;
  }
};

const goToSubscription = () => {
  router.push('/user-space?tab=assets').catch(() => {
    router.push('/user-space/subscriptions').catch(() => {});
  });
};

const getPityGhost = (lottery) => {
  if (!lottery || lottery.status !== 'open') return null;
  const mode = String(lottery.pity_mode || '').trim().toLowerCase();
  if (mode === 'none') return null;
  if (mode === 'eligible') {
    const title = String(lottery.pity_reward_title || '').trim();
    const extra = title ? `· ${title}` : '';
    return {
      text: '计入并兑现保底',
      extra,
      dot: 'eligible',
      isDue: Boolean(pityStatus.value?.isDue)
    };
  }
  if (mode === 'count_only') {
    return { text: '仅计入保底', extra: '', dot: 'count', isDue: false };
  }
  return null;
};

const handlePityOutsideClick = (event) => {
  const target = event.target;
  if (showStatusFilterMenu.value || showSortMenu.value) {
    const selects = document.querySelectorAll('.lottery-custom-select');
    let inside = false;
    selects.forEach((el) => { if (el.contains(target)) inside = true; });
    if (!inside) closeFilterMenus();
  }
};

const handleGlobalKeydown = (event) => {
  if (event.key === 'Escape') {
    closeFilterMenus();
  }
};

const loadLotteries = async ({ force = false } = {}) => {
  const cachedLotteries = force ? null : readLotteryCache();
  isLoading.value = !cachedLotteries;
  loadError.value = '';
  if (cachedLotteries) applyLotteries(cachedLotteries);

  try {
    const { data, error } = await getCommunityLotteries();
    if (error) throw error;
    applyLotteries(data);
    writeLotteryCache(lotteries.value);
  } catch (error) {
    console.warn('加载社区抽奖失败:', error);
    if (!cachedLotteries) {
      lotteries.value = [];
      loadError.value = error?.message || '网络异常，请稍后再试。';
    }
  } finally {
    isLoading.value = false;
  }
};

const formatLotteryDate = (value) => {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未设置';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getDrawTimeText = (lottery) => {
  if (lottery.status === 'drawn' && lottery.drawn_at) return formatLotteryDate(lottery.drawn_at);
  return lottery.draw_at ? formatLotteryDate(lottery.draw_at) : '未设置';
};

const getWinnerCountText = (lottery) => {
  const count = Number(lottery.winner_count || 1);
  return `${Number.isFinite(count) && count > 0 ? Math.round(count) : 1} 人`;
};

const getEntryProgressText = (lottery) => {
  const count = Number(lottery.entry_count || 0);
  if (!lottery.max_entries) return `${count} 人已报名`;
  return `${count} / ${lottery.max_entries} 人已报名`;
};

const getEntryProgressPercent = (lottery) => {
  if (!lottery.max_entries) return lottery.entry_count > 0 ? '100%' : '0%';
  const percent = Math.min(100, Math.max(0, Number(lottery.entry_count || 0) / Number(lottery.max_entries) * 100));
  return `${percent}%`;
};

const isLotteryFull = (lottery) => {
  if (!lottery.max_entries) return false;
  return Number(lottery.entry_count || 0) >= Number(lottery.max_entries);
};

const isEntryClosed = (lottery) => {
  if (!lottery.entry_deadline_at) return false;
  const timestamp = Date.parse(lottery.entry_deadline_at);
  return Number.isFinite(timestamp) && timestamp <= now.value;
};

const isDrawDue = (lottery) => {
  if (lottery?.status !== 'open' || !lottery.draw_at) return false;
  const timestamp = Date.parse(lottery.draw_at);
  return Number.isFinite(timestamp) && timestamp <= now.value;
};

const getCountdownTarget = (lottery) => {
  if (lottery.status !== 'open') return null;
  const deadline = lottery.entry_deadline_at ? Date.parse(lottery.entry_deadline_at) : NaN;
  const drawAt = lottery.draw_at ? Date.parse(lottery.draw_at) : NaN;
  if (Number.isFinite(deadline) && deadline > now.value) return { label: '报名截止倒计时', value: deadline };
  if (Number.isFinite(drawAt) && drawAt > now.value) return { label: '开奖倒计时', value: drawAt };
  return null;
};

const lotteryCountdownLabel = (lottery) => getCountdownTarget(lottery)?.label || '';

const lotteryCountdownText = (lottery) => {
  const target = getCountdownTarget(lottery);
  if (!target) return '';
  const totalSeconds = Math.max(0, Math.floor((target.value - now.value) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  if (days > 0) return `${days}天 ${pad(hours)}:${pad(minutes)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const getLotteryStatusText = (lottery) => {
  if (lottery.status === 'open') {
    if (isDrawDue(lottery)) return '开奖中';
    if (isEntryClosed(lottery)) return '报名截止';
    if (isLotteryFull(lottery)) return '已满员';
    return '进行中';
  }
  if (lottery.status === 'drawn') return '已开奖';
  return '已关闭';
};

const getLotteryStatusClass = (lottery) => ({
  'status-open': lottery.status === 'open',
  'status-drawn': lottery.status === 'drawn',
  'status-closed': lottery.status === 'closed'
});

const getWinnerItems = (lottery) => {
  const winners = Array.isArray(lottery.winners) ? lottery.winners : [];
  const normalizedWinners = winners
    .map((winner, index) => ({
      position: Number(winner?.position || index + 1),
      username: String(winner?.username || '').trim(),
      user_id: winner?.user_id || null
    }))
    .filter((winner) => winner.username || winner.user_id);

  if (normalizedWinners.length > 0) return normalizedWinners;
  if (lottery.winner_username) {
    return [{ position: 1, username: lottery.winner_username, user_id: lottery.winner_user_id || null }];
  }
  return [];
};

const getWinnerNamesText = (lottery) => {
  const winners = getWinnerItems(lottery);
  if (winners.length > 0) return winners.map((winner) => `#${winner.position} ${winner.username || '未记录用户名'}`).join('、');
  return '暂无中奖者';
};

const getCurrentEntryText = (lottery) => {
  if (!lottery.current_user_entry_id) return '';
  return lottery.current_user_entry_number ? `报名序号 #${lottery.current_user_entry_number}` : '报名成功';
};

const isLotteryJoinDisabled = (lottery) => (
  joiningLotteryId.value === lottery.id
  || Boolean(lottery.current_user_entry_id)
  || isDrawDue(lottery)
  || isLotteryFull(lottery)
  || isEntryClosed(lottery)
);

const getJoinButtonText = (lottery) => {
  if (joiningLotteryId.value === lottery.id) return '报名中...';
  if (!isLoggedIn.value) return '登录后报名';
  if (lottery.current_user_entry_id) return getCurrentEntryText(lottery);
  if (isDrawDue(lottery)) return '开奖中';
  if (isEntryClosed(lottery)) return '报名已截止';
  if (isLotteryFull(lottery)) return '报名已满';
  return '立即报名';
};

const handleJoinLottery = async (lottery) => {
  if (!lottery?.id || joiningLotteryId.value) return;
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (isLotteryJoinDisabled(lottery)) return;

  joiningLotteryId.value = lottery.id;
  try {
    const { data, error } = await joinCommunityLottery(lottery.id);
    if (error) throw error;
    if (!data?.ok) throw new Error(String(data?.message || '报名失败'));
    await Promise.all([loadLotteries({ force: true }), loadPityStatus()]);
    const latestLottery = lotteries.value.find((item) => item.id === lottery.id);
    if (selectedLottery.value?.id === lottery.id && latestLottery) {
      selectedLottery.value = latestLottery;
    }
    showPageToast('报名成功', latestLottery?.current_user_entry_number ? `你已获得本期抽奖资格，报名序号 #${latestLottery.current_user_entry_number}。` : (data?.message || '你已获得本期抽奖资格。'), 'success');
  } catch (error) {
    console.warn('社区抽奖报名失败:', error);
    showPageToast('报名失败', error?.message || '请稍后再试。', 'error');
    await Promise.all([loadLotteries({ force: true }), loadPityStatus()]);
  } finally {
    joiningLotteryId.value = '';
  }
};

const openLotteryDetail = (lottery) => {
  selectedLottery.value = lottery;
};

const closeLotteryDetail = () => {
  selectedLottery.value = null;
};

const copyLotteryLink = async (lottery) => {
  const routeHref = router.resolve({
    name: 'CommunityLotteries',
    query: { lottery: lottery.id }
  }).href;
  const url = routeHref.startsWith('#')
    ? `${window.location.origin}${window.location.pathname}${routeHref}`
    : new URL(routeHref, window.location.href).toString();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showPageToast('链接已复制', '可以分享给社区成员一起参与。', 'success');
  } catch (error) {
    console.warn('复制抽奖链接失败:', error);
    showPageToast('复制失败', '请检查浏览器剪贴板权限。', 'error');
  }
};

const hasLiveLotteryClock = () => lotteries.value.some((lottery) => (
  lottery.status === 'open'
  && (lottery.entry_deadline_at || lottery.draw_at)
));

const stopNowTimer = () => {
  if (!nowTimer) return;
  window.clearInterval(nowTimer);
  nowTimer = null;
};

const tickNow = () => {
  if (document.hidden) return;
  now.value = Date.now();
  const dueLottery = lotteries.value.find((lottery) => (
    lottery.status === 'open'
    && lottery.draw_at
    && !dueRefreshLotteryIds.has(lottery.id)
    && isDrawDue(lottery)
  ));
  if (dueLottery) {
    dueRefreshLotteryIds.add(dueLottery.id);
    void loadLotteries({ force: true });
  }
};

const syncNowTimer = () => {
  if (document.hidden || !hasLiveLotteryClock()) {
    stopNowTimer();
    return;
  }
  if (!nowTimer) nowTimer = window.setInterval(tickNow, 1000);
};

const handleVisibilityChange = () => {
  if (!document.hidden) tickNow();
  syncNowTimer();
};

// ============================================
// 保底进度自定义岛（showIsland.custom 管线，同 WallIslandCard 先例）
// 页面 pityStatus 是单一真相源，岛卡纯展示；动作回调复用页面已有方法
// ============================================
const pageRef = ref(null);
let pityIslandHandle = null;
let lotteryNavResizeObserver = null;

const mountPityIsland = () => {
  if (pityIslandHandle) return;
  pityIslandHandle = showIsland.custom(PityIslandCard, {
    status: pityStatus.value,
    loading: pityLoading.value,
    error: pityError.value,
    isLoggedIn: isLoggedIn.value,
    pointsDisplay: userPointsDisplay.value,
    goPoints: goToPoints,
    goSubscription: goToSubscription,
    openLogin: () => { showLoginModal.value = true; },
    retry: () => { void loadPityStatus(); }
  });
};

const syncPityIsland = () => {
  if (!pityIslandHandle) return;
  pityIslandHandle.update({
    status: pityStatus.value,
    loading: pityLoading.value,
    error: pityError.value,
    isLoggedIn: isLoggedIn.value,
    pointsDisplay: userPointsDisplay.value
  });
};

watch([pityStatus, pityLoading, pityError, isLoggedIn, userPointsDisplay], syncPityIsland);

// 预留槽位握手：将来页面内若挂 ContentDetailIsland 等临时卡占用自定义岛槽位，
// 关闭后由其 onClose 调用 inject('remountPityIsland') 重挂常驻保底岛。
const remountPityIsland = () => {
  pityIslandHandle = null;
  mountPityIsland();
};
provide('remountPityIsland', remountPityIsland);

// ---- 导航栏实际高度同步：保底岛展开/收起、滚动收拢全程自适应避让（Newsroom/活动墙同款） ----
const syncLotteryNavHeight = () => {
  const nav = document.getElementById('unified-nav-container');
  const page = pageRef.value;
  if (!nav || !page) return;
  const height = Math.ceil(nav.getBoundingClientRect().height);
  if (height > 0) page.style.setProperty('--lottery-nav-h', `${height}px`);
};

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('click', handlePityOutsideClick);
  document.addEventListener('keydown', handleGlobalKeydown);
  void loadLotteries();
  void loadPityStatus();
  mountPityIsland();
  syncLotteryNavHeight();
  const nav = document.getElementById('unified-nav-container');
  if (nav && typeof ResizeObserver !== 'undefined') {
    lotteryNavResizeObserver = new ResizeObserver(syncLotteryNavHeight);
    lotteryNavResizeObserver.observe(nav);
  }
});

watch(
  () => route.query?.lottery,
  () => {
    openRouteLottery();
  }
);

watch(isLoggedIn, () => {
  void loadPityStatus();
});

watch(activeTab, () => {
  closeFilterMenus();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener('click', handlePityOutsideClick);
  document.removeEventListener('keydown', handleGlobalKeydown);
  stopNowTimer();
  if (toastTimer) window.clearTimeout(toastTimer);
  lotteryNavResizeObserver?.disconnect();
  lotteryNavResizeObserver = null;
  // 先关岛再置空句柄（showIsland.custom 关闭按组件身份守卫，防跨页误关）
  pityIslandHandle?.close();
  pityIslandHandle = null;
});
</script>

<style scoped>
@import './style.scoped.css';
</style>
