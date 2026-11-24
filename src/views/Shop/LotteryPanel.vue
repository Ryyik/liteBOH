<template>
  <div class="lottery-panel">
    <section v-if="activeLotteries.length || loading || loadError" class="lottery-group">
      <h3 class="group-title">进行中</h3>
      <p v-if="loading" class="lottery-hint">正在加载抽奖…</p>
      <div v-else-if="loadError" class="lottery-error">
        <p>抽奖加载失败</p>
        <button type="button" class="lottery-retry" @click="load()">重试</button>
      </div>
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
        v-if="!loading && !loadError && !activeLotteries.length && !historyLotteries.length"
        class="lottery-empty"
      >
        <p>还没有抽奖活动</p>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { getCommunityLotteries } from '@/utils/api/lottery-api.js';
import { logger } from '@/utils/logger.js';
import LotteryCard from './LotteryCard.vue';
import { useInlineEditor } from '@/composables/useInlineEditor.js';

const authStore = useAuthStore();
const { userInfo } = authStore;
const route = useRoute();
const router = useRouter();

/** 后台「就地编辑」上下文；前台没有注入 ⇒ null（见下方 dataRevision watch） */
const inlineEditor = useInlineEditor();

const lotteries = ref([]);
const loading = ref(true);
const loadError = ref('');

const cacheKey = () => String(userInfo?.id || 'guest');

const activeLotteries = computed(() => lotteries.value.filter((item) => item.status === 'open'));
const historyLotteries = computed(() => lotteries.value.filter((item) => item.status !== 'open'));

/** 卡片里的就地编辑只管「值」，写回行对象的动作留在持有数组的这一层 */
const applyField = (item, { field, value }) => {
  if (!item || !field) return;
  item[field] = value;
};

const load = async ({ silent = false, force = false } = {}) => {
  // silent：后台刷新 / 就地编辑删除后重取用；不亮骨架，避免整块列表闪一下
  if (!silent) loading.value = true;
  try {
    const { data, error, fromCache } = await getCommunityLotteries({
      cacheKey: cacheKey(),
      force,
    });
    if (error) throw error;
    lotteries.value = Array.isArray(data) ? data : [];
    /* ⚠️ 失败态只在**成功**时清空：静默重取（登录切换 / KeepAlive 回来）期间若提前清掉，
       模板会从「加载失败」掉到「还没有抽奖活动」，等于在重试途中谎报空列表。 */
    loadError.value = '';
    /* 缓存命中先立刻渲染，再静默拉一次最新的：既不空等，也不让运营刚建的抽奖消失。 */
    if (fromCache) void load({ silent: true, force: true });
  } catch (error) {
    logger.warn('shop-lottery', '加载抽奖失败', error);
    /* 后台刷新失败时保留已有列表；只有首屏真的没有数据才切失败态。 */
    if (!lotteries.value.length) {
      loadError.value = String(error?.message || '抽奖加载失败，请稍后重试');
    }
  } finally {
    if (!silent) loading.value = false;
  }
};

/* 卡片 → 独立详情页（2026-11-20 用户口径「我想要独立页」）：
   以前点卡片是在本页叠一个弹层，地址栏拿不到链接、刷新即丢。现在改成真实路由
   `/lottery/:id` —— 可分享 / 可刷新 / 可前进后退。
   ⚠️ 2026-11-24 起**不再采集 origin 矩形**：详情页是独立路由，没有「从这一格推开」
   的跨路由形变（App.vue 没有路由级过渡），采了也没人消费 —— 而
   `utils/motion-origin.js` 的 Map 会持有触发元素引用直到 30 分钟 TTL 或 40 条上限淘汰，
   属于纯泄漏。将来真做跨路由 shared-element 时再采。 */
const openDetail = (item) => {
  if (!item?.id) return;
  router.push({ name: 'LotteryDetail', params: { id: String(item.id) } });
};

/* ── 旧分享深链兼容（2026-11-09 引入，2026-11-20 改落点）──
   旧版分享出去的是 `#/shop?tab=lottery&lottery=<id>`（历史链接还在别人手机上）。
   现在统一转到独立页 `/lottery/<id>`，旧链接不会失效。
   · 用 replace 不留中间态历史，点返回直接回到来处；
   · 只在列表分区渲染（activeTab==='lottery'）时生效，避免在「产品」分区抢跳。 */
const redirectLegacyDeepLink = () => {
  const id = String(route.query.lottery || '').trim();
  if (!id) return;
  router.replace({ name: 'LotteryDetail', params: { id } });
};

onMounted(() => {
  void load();
  redirectLegacyDeepLink();
});
/* KeepAlive 缓存住本组件后，「同页内再点一条旧深链」时路由 query 变了、组件却不重挂
   （这正是 2026-11-09 版深链在新版失效的根因）⇒ 必须 watch query 变化，不能只靠 onMounted。 */
watch(
  () => route.query.lottery,
  () => redirectLegacyDeepLink(),
);

/* 登录 / 登出会在同一页内换出不同的「我的报名」数据：作用域变了就不能沿用旧缓存。 */
watch(
  () => String(userInfo?.id || ''),
  (next, prev) => {
    if (next === prev) return;
    void load({ silent: true, force: true });
  },
);

/* KeepAlive 回来要重新取数（2026-11-16）：`/shop` 自 2026-11-14 进了路由缓存白名单
   （router/routes/public.ts 的 `keepAliveName: 'ShopPage'`），本组件只在挂载时取一次
   ⇒ 运营在后台新建 / 改了「抽奖页展示」再切回周边，看到的还是缓存里的旧列表 ——
   用户报障「新建的抽奖不显示，是不是没刷新」就是这一层。刷新能好，但不该逼人刷新。
   首次激活紧跟 onMounted（已经 load 过），用闩锁跳过，避免首屏发两次请求；
   silent 是为了不亮骨架，回来时列表闪一下比数据旧更难受。
   force 是因为 activate 场景必须越过 30s 短缓存，否则运营刚改的内容仍可能被挡住。 */
let hasActivatedOnce = false;
onActivated(() => {
  if (!hasActivatedOnce) {
    hasActivatedOnce = true;
    return;
  }
  void load({ silent: true, force: true });
});
/* 就地编辑宿主删除抽奖后广播 dataRevision：列表归本组件持有，必须重新取数，
   否则已删卡片会留在页面上（再点开就是对不存在的行发请求）。前台没有编辑
   上下文 ⇒ inlineEditor 为 null，watch 的 getter 恒为 undefined，永不触发。
   删除后必须 force，缓存命中会让已删卡片继续留在页面上。 */
watch(
  () => inlineEditor?.dataRevision,
  (next, prev) => {
    if (next === undefined || next === prev) return;
    void load({ silent: true, force: true });
  },
);
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

/* 横屏与商品网格（style.scoped.css）同一套 auto-fill 口径：手机横屏自然落两列
   （右侧要让出竖排底栏胶囊），平板/桌面随宽度 3→4→5 列。
   2026-11-22 前「16:9 封面被拉成巨幅横幅」的问题由「容器限宽 1480
   （--page-content-max）+ 列数自适应」一起收掉，不再需要固定三列档。 */
@media (orientation: landscape) {
  .lt-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
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

/* 失败态与空态分开：请求失败时不能伪装成「还没有抽奖活动」。 */
.lottery-error {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 40px 0;
  text-align: center;
}

.lottery-error p {
  margin: 0;
  color: var(--boh-text-secondary);
  font-size: 13px;
}

.lottery-retry {
  padding: 6px 14px;
  border: 1px solid var(--boh-border-primary);
  border-radius: 999px;
  background: transparent;
  color: var(--boh-text-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.lottery-retry:hover {
  background: var(--boh-bg-secondary);
}

.lottery-retry:focus-visible {
  outline: 2px solid var(--boh-brand-blue);
  outline-offset: 2px;
}
</style>
