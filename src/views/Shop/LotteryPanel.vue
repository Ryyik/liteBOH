<template>
  <div class="lottery-panel">
    <section v-if="activeLotteries.length || loading" class="lottery-group">
      <h3 class="group-title">进行中</h3>
      <p v-if="loading" class="lottery-hint">正在加载抽奖…</p>
      <TransitionGroup v-else name="shop-card" tag="div" class="lt-grid">
        <!-- 卡片本体在 LotteryCard.vue：原来「进行中 / 历史」两份模板逐行重复，
             改一处必漏一处；抽出去之后就地编辑的字段绑定也只有一份 -->
        <LotteryCard
          v-for="(item, index) in activeLotteries"
          :key="item.id"
          :lottery="item"
          :index="index"
          @open="openDetail"
          @update:field="(payload) => applyField(item, payload)"
        />
      </TransitionGroup>
    </section>

    <section v-if="historyLotteries.length" class="lottery-group">
      <h3 class="group-title">历史</h3>
      <TransitionGroup name="shop-card" tag="div" class="lt-grid">
        <LotteryCard
          v-for="(item, index) in historyLotteries"
          :key="item.id"
          :lottery="item"
          :index="index"
          @open="openDetail"
          @update:field="(payload) => applyField(item, payload)"
        />
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
import { captureOrigin } from '@/utils/motion-origin.js';
import { logger } from '@/utils/logger.js';
import LotteryCard from './LotteryCard.vue';
import LotteryDetailSheet from './LotteryDetailSheet.vue';

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);

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

/** 卡片里的就地编辑只管「值」，写回行对象的动作留在持有数组的这一层 */
const applyField = (item, { field, value }) => {
  if (!item || !field) return;
  item[field] = value;
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
  if (!item?.id) return;
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
