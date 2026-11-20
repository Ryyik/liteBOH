<script setup>
/**
 * LotteryDetailPage —— 抽奖独立详情页（2026-11-20）
 *
 * 为什么要有它：此前抽奖没有「真实存在的 URL」——详情只是 /shop 页里的一个弹层，
 * 地址栏拿不到链接、刷新即丢、分享出去只能靠 `#/shop?tab=lottery&lottery=<id>`
 * 这种依赖列表加载后自动展开的深链（同页内二次点击时 KeepAlive 不重挂 ⇒ 静默失效）。
 *
 * 本页给出真实路由 `/lottery/:id`：可直接分享 / 刷新 / 前进后退。
 * ⚠️ **视觉必须与弹层完全一致**（用户口径「独立页，但视觉效果不变」）：
 *   直接复用 `LotteryDetailSheet` 的 `standalone` 模式，样式零分叉 ——
 *   竖屏全屏、横屏分栏，按钮/字号/间距全部同源。
 *
 * 数据：复用 `getCommunityLotteries()` 取整份列表后按 id 命中（返回体字段与弹层一致：
 * entry_count / current_user_entry_id / winners / pity_* 都在）。不新增后端接口。
 * 找不到（已删 / 已归档 / 非社区可见）⇒ 空态，不假装存在。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { getCommunityLotteries, joinCommunityLottery } from '@/utils/api/lottery-api.js';
import { applySeoMeta } from '@/utils/seo-meta.js';
import { showIsland } from '@/composables/useIsland.js';
import { logger } from '@/utils/logger.js';
import EmptyState from '@/components/ui/EmptyState.vue';
import LotteryDetailSheet from './LotteryDetailSheet.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isLoggedIn, showLoginModal } = storeToRefs(authStore);

const lottery = ref(null);
const loading = ref(true);
const joining = ref(false);

const lotteryId = computed(() => String(route.params.id || '').trim());

const notify = (text) => {
  const ok = showIsland.notify({ title: String(text || ''), icon: 'info', durationMs: 3000 });
  if (!ok) logger.warn('lottery-detail-page', text);
};

const applyMeta = (item) => {
  if (!item) return;
  const prize = String(item.prize_title || '').trim();
  applySeoMeta({
    title: `${item.title || '抽奖活动'} · BOH 周边`,
    description: prize ? `奖品：${prize}` : String(item.description || '').slice(0, 160),
    image: item.cover_image_url || '',
    url: typeof window !== 'undefined' ? window.location.href : '',
  });
};

const load = async () => {
  const id = lotteryId.value;
  if (!id) {
    loading.value = false;
    lottery.value = null;
    return;
  }
  loading.value = true;
  try {
    const { data } = await getCommunityLotteries();
    const list = Array.isArray(data) ? data : [];
    lottery.value = list.find((item) => String(item.id) === id) || null;
    applyMeta(lottery.value);
  } catch (error) {
    logger.warn('lottery-detail-page', '加载抽奖失败', error);
    lottery.value = null;
  } finally {
    loading.value = false;
  }
};

const join = async () => {
  if (!lottery.value) return;
  if (!isLoggedIn.value) {
    showLoginModal.value = true;
    return;
  }
  if (joining.value) return;
  joining.value = true;
  try {
    const { data, error } = await joinCommunityLottery(lottery.value.id);
    if (error) {
      notify(String(error.message || '报名失败，请稍后重试'));
      return;
    }
    if (data && data.success === false) {
      notify(String(data.message || '报名失败，请稍后重试'));
      return;
    }
    notify('报名成功');
    await load();
  } catch (error) {
    logger.warn('lottery-detail-page', '报名失败', error);
    notify('报名失败，请稍后重试');
  } finally {
    joining.value = false;
  }
};

/* 独立页不是从列表点起来的，关闭语义 = 回到抽奖列表（不是弹层的「清深链」）。
   抽奖列表已并入周边页的抽奖分区，所以落 `/shop?tab=lottery`。 */
const goBack = () => {
  router.push({ path: '/shop', query: { tab: 'lottery' } });
};

onMounted(load);
watch(lotteryId, load);
</script>

<template>
  <div class="lottery-detail-page">
    <div v-if="loading" class="ldp-skeleton" aria-label="抽奖加载中">
      <span class="ldp-sk-cover"></span>
      <span class="ldp-sk-line"></span>
      <span class="ldp-sk-line short"></span>
    </div>

    <div v-else-if="!lottery" class="ldp-empty">
      <EmptyState
        variant="search"
        title="没有找到这个抽奖"
        description="链接可能已过期，或活动已被撤下。"
        action-text="回到抽奖列表"
        @action="goBack"
      />
    </div>

    <LotteryDetailSheet
      v-else
      standalone
      :lottery="lottery"
      :joining="joining"
      @close="goBack"
      @join="join"
      @notify="notify"
    />
  </div>
</template>

<style scoped>
/* 独立页只是一个承载层：真正的全屏/分栏视觉全在 LotteryDetailSheet 里，
   这里不复制任何详情样式，避免「独立页和弹层长得不一样」。 */
.lottery-detail-page {
  min-height: 100dvh;
  background: var(--boh-page-bg, var(--boh-bg-primary, #fff));
}

.ldp-empty {
  padding: 96px 24px 0;
}

/* 加载骨架：与周边页骨架同一气质（中性灰块），只为避免白屏闪一下 */
.ldp-skeleton {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 22px;
}

.ldp-sk-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ldp-sk-line {
  display: block;
  height: 18px;
  border-radius: 6px;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ldp-sk-line.short {
  width: 55%;
}
</style>
