<template>
  <!-- 抽奖详情：**只有「独立详情页」一种身份**（`/lottery/:id`，2026-11-20 用户口径
       「我想要独立页」）。2026-11-24 清掉残留的弹层形态 —— 列表早改 `router.push`
       跳本页，弹层那套（Teleport / 遮罩 / 滚锁 / 来源卡片形变）已无任何宿主，
       留着只会让「这段代码到底跑不跑」变成需要读三个文件才能回答的问题。

       形态：竖屏全屏（封面在滚动流内、报名按钮贴底）、横屏左右分栏。
       它是**路由页**，不叠在别的页面上，所以没有遮罩、不锁 body 滚动。 -->
  <div class="detail-root shop-sheet-tokens" :class="isLandscape ? 'is-landscape' : 'is-portrait'">
    <article ref="surfaceRef" class="detail-surface" tabindex="-1" :aria-label="lottery.title">
      <div class="surface-media" :class="{ plain: !coverUrl || coverBroken }" style="--i: 0">
        <img
          v-if="coverUrl && !coverBroken"
          :src="coverUrl"
          :alt="lottery.title"
          @error="markFailed(`lottery-detail-${lottery.id}`)"
        />
        <span v-else class="media-mark">{{ initialOf(lottery.title) }}</span>
        <span class="media-status" :class="{ open: isOpen }">{{ statusText }}</span>
      </div>

      <button type="button" class="surface-close" aria-label="返回抽奖列表" @click="requestClose">
        <ChevronLeft v-if="!isLandscape" :size="22" :stroke-width="1.8" aria-hidden="true" />
        <X v-else :size="20" :stroke-width="1.8" aria-hidden="true" />
      </button>

      <div class="surface-body">
        <div ref="scrollRef" class="surface-scroll">
          <p class="surface-kicker" style="--i: 1">抽奖活动</p>
          <h2 class="surface-title" style="--i: 1">{{ lottery.title }}</h2>

          <div v-if="lottery.prize_title" class="prize-block" style="--i: 2">
            <p class="block-label">奖品</p>
            <p class="prize-title">{{ lottery.prize_title }}</p>
            <p v-if="lottery.prize_description" class="prize-desc">
              {{ lottery.prize_description }}
            </p>
          </div>

          <div class="info-list">
            <p
              v-for="(row, index) in infoRows"
              :key="row.label"
              class="info-row"
              :style="{ '--i': index + 3 }"
            >
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </p>
          </div>

          <p v-if="lottery.description" class="surface-desc" style="--i: 4">
            {{ lottery.description }}
          </p>

          <div v-if="winners.length" class="winner-block" style="--i: 5">
            <p class="block-label">中奖名单</p>
            <p v-for="winner in winners" :key="winner.key" class="winner-row">
              <span>#{{ winner.position }}</span>
              <strong>{{ winner.name }}</strong>
            </p>
          </div>

          <p class="surface-note" style="--i: 6">
            报名即视为参与本次活动；开奖后由管理员通过站内通知联系中奖者确认发放方式。
          </p>
        </div>

        <div class="surface-footer">
          <!-- 分享（2026-11-09）：与报名按钮同一行，次要操作在左。
               抽奖页面迁到周边「抽奖」分区后丢了老版的分享入口，这里补回来。 -->
          <button
            type="button"
            class="share-btn"
            :class="{ 'is-copied': shareState === 'copied' }"
            :aria-label="shareState === 'copied' ? '链接已复制' : '分享这个抽奖'"
            @click="shareLottery"
          >
            <template v-if="shareState === 'copied'">
              <Check :size="18" :stroke-width="2.2" aria-hidden="true" />
              <span>已复制</span>
            </template>
            <template v-else>
              <Share2 :size="18" :stroke-width="1.9" aria-hidden="true" />
              <span>分享</span>
            </template>
          </button>
          <button type="button" class="join-btn" :disabled="joinDisabled" @click="requestJoin">
            {{ joinLabel }}
          </button>
        </div>
      </div>
    </article>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Check, ChevronLeft, Share2, X } from 'lucide-vue-next';
import { resolveDbDetailImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { buildSharePayload } from '@/composables/useShareTarget.js';

/* 抽奖详情：**独立详情页**（`/lottery/:id`，2026-11-20 用户口径「我想要独立页」）。
     · 横屏 = 左右分栏（左封面 / 右信息），radius 28，整个视口居中
     · 竖屏 = 全屏详情页，**封面在滚动流内**（2026-11-02 用户口径「滚动的时候
       封面也可以滚上去」），报名按钮 sticky 贴底；内容块按 --motion-stagger 逐个入场
   ⚠️ 竖屏滚动策略与商品详情（封面固定）**有意分歧**：要同步过去时把 ProductDetailSheet
   的竖屏 CSS 与这里的对齐，别只改一份。

   ── 2026-11-24：清掉残留的弹层形态 ─────────────────────────────
   本组件曾经同时是「周边页里的弹层」和「独立详情页」两种身份，靠 `standalone` 分流。
   但列表 2026-11-20 就改成 `router.push` 跳独立页了，弹层形态**再没有任何宿主**：
   `Teleport`、遮罩（`.detail-scrim`）、`acquireBodyScrollLock`、来源卡片形变
   （`morphWindow` / `playOpen` / `requestClose` 里的 clip-path）在 `standalone` 下
   全部走降级分支 —— 也就是说那几百行是**任何路径都跑不到**的死代码。
   更糟的是它没有守卫：形变失效不会有任何测试变红（弹窗照常打开、内容全对，
   只是没有动画），所以「读代码才知道它死了」这件事本身就是缺陷。
   现在只保留独立页需要的部分：路由页不叠在别的页面上 ⇒ 无遮罩、不锁滚动。

   ── 关于 `shop-sheet-tokens`（2026-11-24 实测纠正）──────────────
   类还留着（列表/购物袋那条链上它是必需的），但**在本页它目前是空转**，
   原因是这条路由不加载那份 CSS：`store-tokens.css` 只由 `Shop/index.vue` 与
   `BagPage.vue` 引入，`/lottery/:id` 走的是 `LotteryDetailPage.vue`，压根没有它。
   实测：根元素带这个类时 `--boh-bg-primary` 读到的仍是全局 `#0a0a0f`，
   而不是商城域的 `#1c1c1e` —— 说明 `.shop-sheet-tokens` 那条规则从未命中。
   所以本页的暗色其实是**全局 `dark-mode.css`**（`:root[data-theme='dark']`）
   在兜底，它自带 `--boh-page-bg: #16120e`、`--boh-bg-primary: #0a0a0f`，
   暗色下不会刷成白纸。历史那条「没有它整片回落到浅色」的记录在**弹层时代**成立
   （那时 Teleport 到 body、离开了 .store-page，且路由链带着那份 CSS）。
   ⚠️ 别据此删掉这个类：将来若给本页补上商城域 token（比如让详情与列表卡片
   配色严格一致），它就是挂载点。`probe-lottery-detail-page.mjs` 的 D 组只锁
   「暗色下是深底 + 浅字」，不锁类名 —— 判实现不如判契约。 */

const props = defineProps({
  lottery: { type: Object, required: true },
  joining: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'join', 'notify']);

const router = useRouter();

const surfaceRef = ref(null);
const scrollRef = ref(null);
const isLandscape = ref(false);
let mql = null;
let onOrientationChange = null;

/* 详情大图：Cloudinary 原址 → 自建 CDN，本地文件名 → 打包产物。
   `c_limit,w_1600` 只压不拉，小图不会被放大糊掉。 */
const { isFailed, markFailed } = useImageFailure();
const coverUrl = computed(() => resolveDbDetailImage(props.lottery?.cover_image_url) || '');
const coverBroken = computed(() => isFailed(`lottery-detail-${props.lottery?.id}`));
const isOpen = computed(() => String(props.lottery?.status || '') === 'open');
const initialOf = (title) =>
  String(title || '抽')
    .trim()
    .charAt(0);

const statusText = computed(() => {
  const status = String(props.lottery?.status || '');
  if (status === 'drawn') return '已开奖';
  if (status === 'open') return '进行中';
  return '已截止';
});

const pad = (number) => String(number).padStart(2, '0');
const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const infoRows = computed(() => {
  const item = props.lottery || {};
  const rows = [];
  if (item.entry_deadline_at)
    rows.push({ label: '报名截止', value: formatDateTime(item.entry_deadline_at) });
  if (item.draw_at) rows.push({ label: '开奖时间', value: formatDateTime(item.draw_at) });
  if (item.drawn_at) rows.push({ label: '已开奖于', value: formatDateTime(item.drawn_at) });
  rows.push({
    label: '已报名',
    value: item.max_entries
      ? `${item.entry_count} / ${item.max_entries} 人`
      : `${item.entry_count} 人`,
  });
  if (Number(item.winner_count) > 0) {
    rows.push({ label: '中奖名额', value: `${Number(item.winner_count)} 位` });
  }
  return rows;
});

const winners = computed(() => {
  const item = props.lottery || {};
  if (Array.isArray(item.winners) && item.winners.length) {
    return item.winners.map((winner, index) => ({
      key: `${winner.entry_id || winner.user_id || index}`,
      position: Number(winner.position ?? index + 1),
      name: String(winner.username || '已中奖'),
    }));
  }
  if (item.winner_username) {
    return [{ key: 'main', position: 1, name: String(item.winner_username) }];
  }
  return [];
});

const alreadyJoined = computed(() => Boolean(props.lottery?.current_user_entry_id));

const joinLabel = computed(() => {
  if (!isOpen.value) return statusText.value === '已开奖' ? '已开奖' : '已结束';
  if (alreadyJoined.value) return '已报名';
  return props.joining ? '提交中…' : '参与抽奖';
});

const joinDisabled = computed(() => !isOpen.value || alreadyJoined.value || props.joining);

const requestJoin = () => {
  if (joinDisabled.value) return;
  emit('join');
};

/* ── 分享 ──
   落点统一改成**独立详情页** `/lottery/<id>`（2026-11-20 用户口径「我想要独立页」）：
   以前发的是 `#/shop?tab=lottery&lottery=<id>` —— 依赖列表加载完再展开弹层，同页内
   再点第二次时 KeepAlive 根本不会重新挂载（深链静默失效），而且地址栏里拿不到链接。
   独立页天然可分享 / 可刷新 / 可前进后退，也不再受列表缓存影响。
   路径经 `router.resolve` 取，不手拼字符串：将来路由改名不会让已发出去的链接全废。

   ⚠️ 手机上「复制出来只有文字没有链接」的真因（2026-11-20 报障）：系统分享面板里
   部分目标（微信「发送给朋友」、部分安卓机型的「复制」）只取 `text` 字段，`url`
   被丢掉。所以 `text` 里必须自带链接 —— 任何一个通道拿到的文本都包含 URL。 */
const shareState = ref('idle');
let shareResetTimer = null;

const resolveShareUrl = () => {
  if (typeof window === 'undefined') return '';
  const id = String(props.lottery?.id ?? '').trim();
  if (!id) return '';
  let href = '';
  try {
    href = router.resolve({ name: 'LotteryDetail', params: { id } }).href;
  } catch {
    href = `/lottery/${encodeURIComponent(id)}`;
  }
  /* resolve 对 hash 路由返回 `#/lottery/<id>`；补齐 origin 才能发出去 */
  if (href.startsWith('#')) {
    return `${window.location.origin}${window.location.pathname}${href}`;
  }
  return new URL(href, window.location.href).toString();
};

const showCopiedHint = () => {
  shareState.value = 'copied';
  if (shareResetTimer) clearTimeout(shareResetTimer);
  shareResetTimer = setTimeout(() => {
    shareState.value = 'idle';
    shareResetTimer = null;
  }, 2200);
};

const copyShareUrl = async (url) => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    /* 权限拒绝 / 非安全上下文 → 走 execCommand 降级 */
  }
  try {
    const helper = document.createElement('textarea');
    helper.value = url;
    helper.setAttribute('readonly', '');
    helper.style.cssText = 'position:fixed;top:-999px;opacity:0;';
    document.body.appendChild(helper);
    helper.select();
    const done = document.execCommand('copy');
    document.body.removeChild(helper);
    return done;
  } catch {
    return false;
  }
};

const shareLottery = async () => {
  const url = resolveShareUrl();
  if (!url) return;
  const title = String(props.lottery?.title || '方块之家抽奖');
  const prize = String(props.lottery?.prize_title || '').trim();
  /* ⚠️ 正文必须自带 URL（手机端「复制只有文字没链接」的真因）：系统分享面板/部分机型的
     「复制」只取 text、丢 url。文案组装统一走 buildSharePayload（见 useShareTarget.js），
     站内不要再各写一份。 */
  const payload = buildSharePayload({
    title,
    text: prize ? `${title} · 奖品：${prize}` : title,
    url,
  });
  /* ⚠️ share() 必须在用户手势里**同步**发起，前面不能先 await 复制之类的东西 */
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload);
      return; // 系统面板自带反馈
    } catch (error) {
      if (error?.name === 'AbortError') return; // 用户划走面板，不算失败
      /* 其余失败（非用户激活 / 系统不支持该组合）→ 落到复制 */
    }
  }
  const copied = await copyShareUrl(url);
  if (copied) showCopiedHint();
  else emit('notify', '复制失败，请手动复制地址栏链接');
};

/* 关闭 = 返回抽奖列表（独立页语义）。父级 `LotteryDetailPage` 监听 close 后 router.push，
   本组件只负责 emit —— 路由归属留在页面层，子组件不猜用户从哪来。 */
const requestClose = () => {
  emit('close');
};

const onKeydown = (event) => {
  if (event.key !== 'Escape') return;
  requestClose();
};

/* 打开时的滚动聚焦（与商品详情同一套口径）：
   ① 竖屏的滚动容器是整个 surface（封面要一起滚上去），横屏是内容区 —— 两者都要归零；
   ② 焦点进面板：键盘 / 读屏的滚动指令落在详情里，而不是停在背后列表的原位置。
   ⚠️ 独立页是路由页，**不锁 body 滚动**：它自己就是一屏，锁住反而让 iOS 回弹/滚动异常。 */
const onOpen = async () => {
  await nextTick();
  const scroller = isLandscape.value ? scrollRef.value : surfaceRef.value;
  scroller?.scrollTo?.({ top: 0, behavior: 'auto' });
  surfaceRef.value?.focus?.({ preventScroll: true });
};

onMounted(() => {
  mql = window.matchMedia('(orientation: landscape)');
  isLandscape.value = mql.matches;
  onOrientationChange = (event) => {
    isLandscape.value = event.matches;
  };
  mql.addEventListener('change', onOrientationChange);
  document.addEventListener('keydown', onKeydown);
  void onOpen();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (shareResetTimer) {
    clearTimeout(shareResetTimer);
    shareResetTimer = null;
  }
  if (mql && onOrientationChange) {
    mql.removeEventListener('change', onOrientationChange);
    mql = null;
    onOrientationChange = null;
  }
});
</script>

<style scoped>
/* 路由页，不是叠在别人上面的浮层：`fixed` 铺满视口即可，不需要遮罩那一层
   （2026-11-24 清弹层形态时一并删掉 —— 没有「背后的列表」要被压暗）。
   ⚠️ 底色必须自己铺：横屏面板有 1120×880 上限，四周要露出页面色。
   原来这活是遮罩层干的，删掉遮罩后漏掉它会让背后的东西透出来
   （独立页上恰好是 `.lottery-detail-page` 的同色底，看起来没事 —— 但那是巧合）。 */
.detail-root {
  position: fixed;
  inset: 0;
  z-index: 2147482400; /* 与论坛详情弹窗同一档：盖过导航 / 底栏 / 右栏，让位图片查看器 */
  color: var(--boh-text-primary, #1d1d1f);
  background: var(--boh-page-bg, var(--boh-bg-primary, #fff));
}

.detail-surface {
  position: absolute;
  overflow: hidden;
  background: var(--boh-bg-primary, #fff);
}

/* 面板靠 onOpen 里的 focus() 接住键盘/读屏的滚动指令，不需要可见焦点环 */
.detail-surface:focus {
  outline: none;
}

/* ── 竖屏：全屏详情页 ──
   滚动容器是**整个 surface**（不是内容区）：封面是滚动流的一部分，往上滑就跟着
   滚出屏幕；报名按钮 sticky 贴底，内容多长都不离开视口。 */
.is-portrait .detail-surface {
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.is-portrait .surface-media {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 52vh;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-tertiary, #a1a1a6);
}

.is-portrait .surface-body {
  flex: 1 0 auto; /* 内容不足一屏时也把 footer 顶到视口底 */
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 竖屏下滚动发生在 surface 上，内容区只负责排版 */
.is-portrait .surface-scroll {
  flex: 1 0 auto;
  overflow: visible;
}

/* ── 横屏：与论坛详情（PostDetailModal）同一套弹窗语言 ——
   面板在**整个视口**居中、圆角 + 大阴影，尺寸取论坛同款上限。
   横竖两份详情（商品 / 抽奖）刻意保持完全一致。
   四周露出的底色由上面 `.detail-root` 那条给（原来是遮罩层干的活）。 */
.is-landscape .detail-surface {
  top: 50%;
  left: 50%;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  width: min(1120px, calc(100vw - 48px));
  height: min(880px, calc(100vh - 48px));
  transform: translate(-50%, -50%);
  border-radius: var(--liquid-radius-lg, 28px);
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
}

.is-landscape .surface-media {
  position: relative;
  display: grid;
  place-items: center;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-tertiary, #a1a1a6);
}

.is-landscape .surface-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
}

.surface-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-mark {
  font-size: 56px;
  font-weight: 500;
}

/* 封面左上角的状态标签：与卡片上那两枚同款（深色胶囊 + 模糊底），
   保证在任何封面上都可读 */
.media-status {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  backdrop-filter: blur(6px);
}

.media-status.open {
  background: rgba(10, 132, 255, 0.92);
}

/* 竖屏的关闭键在左上（与商品详情一致），状态标签必须让到右上 ——
   否则深色圆形关闭键正好压在这枚标签上，只剩半个「奖」字露在外面。
   封面会随滚动离开屏幕，所以关闭键 fixed 在视口上，不跟着滚走。 */
.is-portrait .media-status {
  left: auto;
  right: 12px;
}

.is-portrait .surface-close {
  position: fixed; /* 封面滚走后仍在：fixed 相对视口（surface 全屏，等价原位） */
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: 12px;
  right: auto;
}

.surface-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.36);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition:
    transform 180ms var(--ease-out, ease),
    background-color 180ms var(--ease-out, ease);
}

.surface-close:hover {
  background: rgba(0, 0, 0, 0.52);
  transform: scale(1.06);
}

.surface-close:active {
  transform: scale(0.9);
}

.surface-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 22px 12px;
}

.surface-kicker {
  margin: 0 0 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.surface-title {
  margin: 0 0 14px;
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.block-label {
  margin: 0 0 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.prize-block {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.prize-title {
  margin: 0;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
}

.prize-desc {
  margin: 4px 0 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
  line-height: 1.6;
}

.info-list {
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.info-row:first-child {
  border-top: 0;
}

.info-row strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
  text-align: right;
}

.surface-desc {
  margin: 0 0 18px;
  color: var(--boh-text-secondary, #55555a);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.winner-block {
  margin-bottom: 14px;
}

.winner-row {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 6px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.winner-row strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 500;
}

.surface-note {
  margin: 12px 0 0;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 12px;
  line-height: 1.6;
}

/* ── 入场：内容块逐个上浮（封面缩放入场，footer 从底部滑入）──
   时长/步长/封顶只读 tokens.css 的 --motion-*，这里不写第二份毫秒数；
   序号 --i 写在模板里，info-row 按行递增，封顶由 min(--i, --motion-stagger-max) 兜住。
   fill 用 backwards：终态即自然状态，不残留 transform 干扰 sticky footer。 */
@keyframes sheet-rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@keyframes sheet-cover-in {
  from {
    opacity: 0;
    transform: scale(1.045);
  }
}

@keyframes sheet-footer-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

.surface-media {
  animation: sheet-cover-in var(--motion-enter, 320ms) var(--ease-out, ease) backwards;
}

.surface-kicker,
.surface-title,
.prize-block,
.info-row,
.surface-desc,
.winner-block,
.surface-note {
  animation: sheet-rise var(--motion-enter, 320ms) var(--ease-out, ease) backwards;
  animation-delay: calc(
    min(var(--i, 0), var(--motion-stagger-max, 6)) * var(--motion-stagger, 55ms)
  );
}

/* reduce-motion：退化为快速淡入，无位移无 stagger（与 animations.css 同一口径） */
@media (prefers-reduced-motion: reduce) {
  .surface-media,
  .surface-kicker,
  .surface-title,
  .prize-block,
  .info-row,
  .surface-desc,
  .winner-block,
  .surface-note,
  .surface-footer {
    animation-duration: 0.1s;
    animation-delay: 0ms;
  }

  .surface-close,
  .join-btn {
    transition-duration: 0.1s;
  }
}

/* 低端设备档（html.boh-perf-lite，判据由 utils/performance-profile.js 挂载）：
   @media 里写不了类选择器，只能用选择器再写一遍 —— 两份清单改一处别忘了另一处 */
html.boh-perf-lite .surface-media,
html.boh-perf-lite .surface-kicker,
html.boh-perf-lite .surface-title,
html.boh-perf-lite .prize-block,
html.boh-perf-lite .info-row,
html.boh-perf-lite .surface-desc,
html.boh-perf-lite .winner-block,
html.boh-perf-lite .surface-note,
html.boh-perf-lite .surface-footer {
  animation-duration: 0.1s;
  animation-delay: 0ms;
}

html.boh-perf-lite .surface-close,
html.boh-perf-lite .join-btn {
  transition-duration: 0.1s;
}

.surface-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px calc(18px + env(safe-area-inset-bottom, 0px));
  background: var(--boh-bg-primary, #fff);
  /* 竖屏：内容从按钮下方穿过，顶部 hairline 把操作区和正文分开 */
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  /* 报名按钮始终贴底：随 surface 滚动吸附（配合 .is-portrait .detail-surface 的滚动容器） */
  position: sticky;
  bottom: 0;
  z-index: 3;
  animation: sheet-footer-in var(--motion-enter, 320ms) var(--ease-out, ease) backwards;
  animation-delay: calc(2 * var(--motion-stagger, 55ms));
}

/* 分享：次要操作 —— 描边胶囊，视觉权重压在报名按钮之下，但高度与它齐平。
   竖屏 390 宽下留给报名按钮 300+，分享只占「图标 + 两字」的固定宽。 */
.share-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 46px;
  padding: 0 16px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  border-radius: 999px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    transform 180ms var(--ease-out, ease),
    background-color 180ms var(--ease-out, ease),
    border-color 180ms var(--ease-out, ease),
    color 180ms var(--ease-out, ease);
}

.share-btn:hover {
  border-color: var(--boh-brand-blue, #0071e3);
  color: var(--boh-brand-blue, #0071e3);
}

.share-btn:active {
  transform: scale(0.97);
}

/* 复制成功：图标 + 文案一起换（模板里两套 <template> 切换），颜色改走品牌绿语义
   —— 这里没有绿 token，用蓝色主色即可，避免额外定义一套颜色 */
.share-btn.is-copied {
  border-color: var(--boh-brand-blue, #0071e3);
  color: var(--boh-brand-blue, #0071e3);
}

.is-landscape .surface-footer {
  padding-bottom: 18px;
  position: static; /* 横屏是分栏弹窗，footer 本来就在右栏末尾，不需要吸附 */
}

.join-btn {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: auto;
  min-width: 0;
  height: 46px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  transition:
    transform 180ms var(--ease-out, ease),
    box-shadow 180ms var(--ease-out, ease),
    background-color 180ms var(--ease-out, ease),
    color 180ms var(--ease-out, ease);
}

.join-btn:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0, 113, 227, 0.32);
}

.join-btn:not(:disabled):active {
  transform: scale(0.97);
  box-shadow: none;
}

.join-btn:disabled {
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
  cursor: not-allowed;
}
</style>
