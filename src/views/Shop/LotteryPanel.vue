<template>
  <div class="lottery-panel">
    <section v-if="activeLotteries.length || loading" class="lottery-group">
      <h3 class="group-title">进行中</h3>
      <p v-if="loading" class="lottery-hint">正在加载抽奖…</p>
      <TransitionGroup v-else name="shop-card" tag="div" class="lt-grid">
        <button
          v-for="(item, index) in activeLotteries"
          :key="item.id"
          type="button"
          class="lt-card"
          :style="{ '--i': index }"
          @click="openDetail(item, $event)"
        >
          <span class="lt-cover" :class="{ plain: !coverVisible(item) }">
            <img
              v-if="coverVisible(item)"
              :src="coverOf(item)"
              :alt="item.title"
              loading="lazy"
              decoding="async"
              :class="{ 'is-loading': !isImageLoaded(coverKey(item)) }"
              @load="markImageLoaded(coverKey(item))"
              @error="markCoverFailed(coverKey(item))"
            />
            <span v-else class="cover-mark">{{ initialOf(item.title) }}</span>
            <span class="lt-status is-open">进行中</span>
            <span class="lt-date">{{ dateText(item) }}</span>
          </span>
          <span class="lt-body">
            <span class="lt-title">{{ item.title }}</span>
            <span v-if="item.prize_title" class="lt-prize">{{ item.prize_title }}</span>
            <span class="lt-meta">
              <span>{{ countText(item) }}</span>
              <span v-if="item.current_user_entry_id" class="lt-flag">已报名</span>
            </span>
          </span>
        </button>
      </TransitionGroup>
    </section>

    <section v-if="historyLotteries.length" class="lottery-group">
      <h3 class="group-title">历史</h3>
      <TransitionGroup name="shop-card" tag="div" class="lt-grid">
        <button
          v-for="(item, index) in historyLotteries"
          :key="item.id"
          type="button"
          class="lt-card is-history"
          :style="{ '--i': index }"
          @click="openDetail(item, $event)"
        >
          <span class="lt-cover" :class="{ plain: !coverVisible(item) }">
            <img
              v-if="coverVisible(item)"
              :src="coverOf(item)"
              :alt="item.title"
              loading="lazy"
              decoding="async"
              :class="{ 'is-loading': !isImageLoaded(coverKey(item)) }"
              @load="markImageLoaded(coverKey(item))"
              @error="markCoverFailed(coverKey(item))"
            />
            <span v-else class="cover-mark">{{ initialOf(item.title) }}</span>
            <span class="lt-status">{{ item.status === 'drawn' ? '已开奖' : '已截止' }}</span>
            <span class="lt-date">{{ dateText(item) }}</span>
          </span>
          <span class="lt-body">
            <span class="lt-title">{{ item.title }}</span>
            <span v-if="item.prize_title" class="lt-prize">{{ item.prize_title }}</span>
            <span class="lt-meta">
              <span>{{ countText(item) }}</span>
              <span class="lt-result">{{ resultText(item) }}</span>
            </span>
          </span>
        </button>
      </TransitionGroup>
    </section>

    <Transition name="shop-fade">
      <div
        v-if="!loading && !activeLotteries.length && !historyLotteries.length"
        class="lottery-empty"
      >
        <p>还没有抽奖活动</p>
      </div>
    </Transition>

    <LotteryDetailSheet
      v-if="selectedLottery"
      :lottery="selectedLottery"
      :origin-key="selectedOriginKey"
      :joining="joiningId === selectedLottery.id"
      @close="closeDetail"
      @join="join(selectedLottery)"
      @notify="showMessage"
    />

    <transition name="lottery-toast">
      <p v-if="message" class="lottery-toast">{{ message }}</p>
    </transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { getCommunityLotteries, joinCommunityLottery } from '@/utils/api/lottery-api.js';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { useImageLoaded } from '@/composables/useImageLoaded.js';
import { captureOrigin } from '@/utils/motion-origin.js';
import { logger } from '@/utils/logger.js';
import LotteryDetailSheet from './LotteryDetailSheet.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);

/* 封面地址两种形态：`cover_image_url` 存的多是 Cloudinary 原图（大陆不可达且动辄 1MB+），
   裸文件名的是本地资源。resolveDbCardImage 一并做 CDN 改写 + 卡面尺寸变换，
   中秋/七夕那两张 1.2MB 的封面因此降到几十 KB —— 之前是「灰着一块，等半天也不出图」。 */
const coverOf = (item) => resolveDbCardImage(item?.cover_image_url) || '';
const { isFailed: isCoverFailed, markFailed: markCoverFailed } = useImageFailure();
/* 封面解码完成后淡入，避免「灰底突然变图」的硬跳 */
const { isImageLoaded, markImageLoaded } = useImageLoaded();
const coverKey = (item) => `lottery-cover-${item?.id}`;
const coverVisible = (item) => Boolean(coverOf(item)) && !isCoverFailed(coverKey(item));

const lotteries = ref([]);
const loading = ref(true);
const joiningId = ref('');
const message = ref('');
let messageTimer = null;

/* 详情：只存 id，对象从 lotteries 里现取 —— 报名成功后 load() 会换掉整份列表，
   存快照的话弹层里的「已报名」会停留在旧值（按钮看着还能再点一次）。 */
const selectedId = ref('');
const selectedOriginKey = ref('');
const selectedLottery = computed(
  () => lotteries.value.find((item) => String(item.id) === selectedId.value) || null,
);

const activeLotteries = computed(() => lotteries.value.filter((item) => item.status === 'open'));
const historyLotteries = computed(() => lotteries.value.filter((item) => item.status !== 'open'));

const initialOf = (title) =>
  String(title || '抽')
    .trim()
    .charAt(0);

const formatDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}.${pad(date.getDate())}`;
};

const dateText = (item) => {
  const raw =
    item.status === 'open' ? item.entry_deadline_at || item.draw_at : item.drawn_at || item.draw_at;
  return formatDay(raw);
};

const countText = (item) => {
  if (!item.max_entries) return `${item.entry_count} 人已报名`;
  return `${item.entry_count} / ${item.max_entries} 人`;
};

const resultText = (item) => {
  if (item.status === 'drawn') {
    return item.winner_username ? `中奖：${item.winner_username}` : '已开奖';
  }
  return '已截止';
};

const showMessage = (text) => {
  message.value = text;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.value = '';
  }, 2600);
};

const load = async () => {
  loading.value = true;
  try {
    const { data } = await getCommunityLotteries();
    lotteries.value = Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn('shop-lottery', '加载抽奖失败', error);
    lotteries.value = [];
  } finally {
    loading.value = false;
  }
};

const join = async (item) => {
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (joiningId.value) return;
  joiningId.value = item.id;
  try {
    const { data, error } = await joinCommunityLottery(item.id);
    if (error) {
      showMessage(String(error.message || '报名失败，请稍后重试'));
      return;
    }
    if (data && data.success === false) {
      showMessage(String(data.message || '报名失败，请稍后重试'));
      return;
    }
    showMessage('报名成功');
    await load();
  } catch (error) {
    logger.warn('shop-lottery', '报名失败', error);
    showMessage('报名失败，请稍后重试');
  } finally {
    joiningId.value = '';
  }
};

/* 卡片 → 详情：与商品卡同一套（点击时采集卡片矩形，详情用 clip-path 从这一格推开） */
const openDetail = (item, event) => {
  selectedId.value = String(item.id);
  selectedOriginKey.value = `shop-lottery:${item.id}`;
  const card = event?.currentTarget;
  if (card) captureOrigin(selectedOriginKey.value, card, { radius: 16 });
  document.body.style.overflow = 'hidden';
};

/* ── 分享深链（2026-11-09）──
   详情里的「分享」发出去的是 `#/shop?tab=lottery&lottery=<id>`：
   · `lottery` 存在 ⇒ 列表加载完后直接展开这一条（对方点开就看到，不用自己在列表里找）；
   · 找不到（活动已删 / 已归档）⇒ 静默清参数，不留一条指不到实体的深链；
   · 关闭详情时也一并清掉，否则刷新一次又弹出来。 */
const clearDeepLinkQuery = () => {
  if (!route.query.lottery) return;
  const query = { ...route.query };
  delete query.lottery;
  router.replace({ path: '/shop', query });
};

const consumeDeepLink = () => {
  const id = String(route.query.lottery || '').trim();
  if (!id) return;
  const target = lotteries.value.find((item) => String(item.id) === id);
  /* 无 originKey：不是从卡片点起来的，morphWindow 返回 null，详情按自身入场播，
     不要为了深链伪造一次卡片矩形 */
  if (target) openDetail(target, null);
  else clearDeepLinkQuery();
};

const closeDetail = () => {
  selectedId.value = '';
  clearDeepLinkQuery();
  document.body.style.overflow = '';
};

onMounted(async () => {
  await load();
  consumeDeepLink();
});
onBeforeUnmount(() => {
  if (messageTimer) clearTimeout(messageTimer);
  document.body.style.overflow = '';
});
</script>

<style scoped>
.lottery-panel {
  position: relative;
  color: var(--boh-text-primary, #1d1d1f);
}

.lottery-group + .lottery-group {
  margin-top: 26px;
}

.group-title {
  margin: 0 0 10px;
  padding: 0 2px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.08em;
}

.lt-grid {
  position: relative; /* leave 的绝对定位基准（shop-card-leave-active） */
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

@media (orientation: landscape) {
  .lt-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 电脑 / 平板横屏（≥1024）与商品网格同口径升到三列（2026-11-01 用户口径
   「横屏全宽屏布局，能放三张就三张」）：两列在全宽下每张接近 500 宽，
   16:9 封面被拉成巨幅横幅，腰封标题一行铺满反而不好扫读。
   手机横屏（≤1023）保持两列 —— 右侧要让出竖排底栏胶囊，三列会把封面压扁。 */
@media (orientation: landscape) and (min-width: 1024px) {
  .lt-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* 卡片本体就是「点开详情」的按钮（2026-11-01 用户口径：抽奖卡片支持点进去看详情）。
   整张卡是一个 <button>，报名动作搬进详情弹层 —— 卡片里再放一颗按钮会变成嵌套按钮，
   而且和商品卡（整张点开、动作在详情里）的交互也不一致。 */
.lt-card {
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background: var(--boh-bg-primary, #fff);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease;
}

.lt-card:active {
  transform: scale(0.985);
}

/* 历史卡不再整体降透明：白底黑字下 0.92 的 opacity 会把标题灰掉，
   读起来像「禁用」；状态由封面上「已开奖 / 已截止」那枚标签表达。 */
.lt-card.is-history .lt-cover img {
  filter: saturate(0.86);
}

.lt-cover {
  display: block;
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.lt-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lt-cover.plain {
  display: grid;
  place-items: center;
}

.cover-mark {
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 34px;
  font-weight: 500;
}

/* 封面之上的两枚小标签（状态左上 / 日期右上）：保留在封面上 ——
   它们是「这条抽奖现在什么状态」，脱离封面就和标题区混淆了。
   深色胶囊 + 模糊底是为了在任意封面上都可读，不是「阴影文字」。 */
.lt-status,
.lt-date {
  position: absolute;
  top: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(6px);
}

.lt-status {
  left: 10px;
}

.lt-status.is-open {
  background: rgba(10, 132, 255, 0.92);
}

.lt-date {
  right: 10px;
}

/* ── 卡片文字区：白底黑字，压在封面下方（2026-11-01 用户口径
   「抽奖卡片不要阴影文字，采用极简的白底黑字 + 上面封面」）──
   原来这里是一条 absolute 叠在封面底部的渐变腰封（黑底白字 + 阴影），
   在浅色卡片上读起来像「标题被照片吃掉」；改成独立面板后，
   标题/奖品/报名数都在实底上，任何封面（亮图、暗图、无图）都一样可读。 */
.lt-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px 12px;
}

.lt-title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  /* 两行封顶：三列下标题一行放不下，截断比撑高卡片更整齐 */
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.lt-prize {
  display: block;
  margin: 0;
  overflow: hidden;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lt-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

/* 「已报名」小标：只在本人已参与时出现，替代原来卡片上的报名按钮 */
.lt-flag {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.08));
  color: var(--boh-brand-blue, #0071e3);
  font-size: 11px;
  line-height: 1.6;
}

.lt-result {
  flex: none;
  color: var(--boh-text-secondary, #86868b);
}

.lottery-hint,
.lottery-empty {
  margin: 0;
  padding: 40px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  text-align: center;
}

.lottery-empty {
  padding: 64px 0;
}

.lottery-toast {
  position: fixed;
  bottom: 120px;
  left: 50%;
  /* 要高过详情弹层（2147482400）：报名是在弹层里点的，提示必须浮在它之上，
     否则「报名成功 / 报名失败」被遮罩吃掉，用户以为没反应 */
  z-index: 2147482500;
  margin: 0;
  padding: 9px 16px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(29, 29, 31, 0.9);
  color: #fff;
  font-size: 13px;
}

.lottery-toast-enter-active,
.lottery-toast-leave-active {
  transition: opacity 0.2s ease;
}

.lottery-toast-enter-from,
.lottery-toast-leave-to {
  opacity: 0;
}
</style>
