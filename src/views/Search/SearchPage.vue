<script setup>
/**
 * 全屏搜索页（plans/052 · 用户构思图落地）
 *
 * ── 结构 ─────────────────────────────────────────────
 * 顶部毛玻璃粘性栏（‹ 返回 + 搜索框，自动聚焦）→ 分类 chips（帖子/博莱克/资讯/周边/活动）
 * → 内容流。搜索从论坛工具栏的「内联输入框」升级为独立全屏页 —— 首屏只剩一枚入口图标。
 *
 * ── 数据源（五类 chip 各自的通道）─────────────────────
 *  · 帖子   getPosts({ searchQuery, kindFilter: 'post' })      （post + repost）
 *  · 资讯   getPosts({ searchQuery, kindFilter: 'news' })
 *  · 活动   getPosts({ searchQuery, kindFilter: 'activity' })
 *  · 博莱克 BohForumAnswerCard 内联流式作答（证据 = 全库 hottest 5 条，不消耗额度检索）
 *  · 周边   productsStore（全量商品已入 store，客户端按 title/description 过滤）
 *
 * ── 搜索历史 ─────────────────────────────────────────
 * 与论坛首页共用 useSearchHistory（同一个 localStorage key）—— 显式提交才记录。
 *
 * ── 详情跳转 ─────────────────────────────────────────
 * 横屏走 openForumPost 弹窗（与 ForumMain 同源分流）；竖屏直接路由进 /forum/post/:id
 * —— 详情页返回（history.back）天然落回本页，结果还在（组件被 keep-alive？没有 ——
 * 结果态随组件卸载丢失，但查询词在 URL 上，返回重新拉一次，可接受）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronLeft, Loader2, Package, SearchX, Search } from 'lucide-vue-next';
import { getPosts } from '@/utils/api/forum-api.js';
import { searchProfiles } from '@/utils/api/site-search-api';
import { useProductsStore } from '@/stores/products';
import { useSearchHistory } from '@/composables/useSearchHistory.js';
import { isForumLandscape } from '@/utils/forum-viewport.js';
import { openForumPost } from '@/composables/usePostDetailModal.js';
import { getAvatarUrl } from '@/utils/avatar.js';
import ReplyIdentityRow from '@/components/forum/ReplyIdentityRow.vue';
import BohForumAnswerCard from '@/views/Forum/components/BohForumAnswerCard.vue';

/* 成员完整页（社区概览 + 分组 + 生日）—— 首次切到「成员」chip 才下载。
   ⚠️ 直接用 user-space 的 AsyncCommunity，**不要**在这里另写 defineAsyncComponent：
   那个单例已带退避重试 + 失败兜底（check:async-component-fallback 会拦），
   而且与首页「成员」分区是同一个实例来源，天然单源。 */
import { AsyncCommunity } from '@/views/user-center/UserSpace/async-loaders.js';
import { formatSmartTime as formatDate } from '@/utils/time.js';

const route = useRoute();
const router = useRouter();
const productsStore = useProductsStore();

/* ── 查询状态 ─────────────────────────────────────────── */
const SEARCH_DEBOUNCE_MS = 420;
const SINGLE_CHAR_SEARCH_DELAY_MS = 900;

const inputQuery = ref('');
const activeChip = ref('post'); // post | bolek | news | product | activity
const isSearching = ref(false);
const searchError = ref('');
const postResults = ref([]);
const productResults = ref([]);
const memberResults = ref([]);
const bolekEvidence = ref([]);
const bolekQuestion = ref('');
const bolekNonce = ref(0);
const hasSearched = ref(false);

const CHIPS = [
  { key: 'post', label: '帖子' },
  { key: 'bolek', label: '博莱克' },
  { key: 'news', label: '资讯' },
  { key: 'member', label: '成员' },
  { key: 'product', label: '周边' },
  { key: 'activity', label: '活动' },
];

/* ── 搜索历史（与论坛首页共用同一份 localStorage）──────── */
const { searchHistory, rememberSearchKeyword, clearSearchHistory, loadSearchHistory } =
  useSearchHistory();
const isInputFocused = ref(false);
const showHistory = computed(
  () => isInputFocused.value && !inputQuery.value.trim() && searchHistory.value.length > 0,
);

/* ── 检索执行 ─────────────────────────────────────────── */
let debounceTimer = null;
let searchSeq = 0; // 竞态防护：慢网下旧响应不许覆盖新词的结果

const keyword = computed(() => String(inputQuery.value || '').trim());

const fetchPostsForChip = async (kw, kindFilter) => {
  const seq = ++searchSeq;
  isSearching.value = true;
  searchError.value = '';
  try {
    const { data, error } = await getPosts(null, {
      page: 1,
      pageSize: 20,
      searchQuery: kw,
      kindFilter,
      sortMode: 'latest',
    });
    if (error) throw error;
    if (seq !== searchSeq) return; // 已有更新的检索在途/完成，丢弃
    postResults.value = Array.isArray(data) ? data : [];
  } catch {
    if (seq !== searchSeq) return;
    postResults.value = [];
    searchError.value = '搜索请求失败，请稍后重试';
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
};

/* 成员检索：复用全站搜索的 profiles 通道（site-search-api 的 searchProfiles，
   username 上有 pg_trgm 索引，中文/英文局部匹配都吃索引）。
   RLS 公开读，匿名也能搜到 —— 与 /profile/:username 的可见性一致。 */
const fetchMembersForChip = async (kw) => {
  const seq = ++searchSeq;
  isSearching.value = true;
  searchError.value = '';
  try {
    const rows = await searchProfiles(kw, { limit: 20 });
    if (seq !== searchSeq) return;
    memberResults.value = Array.isArray(rows) ? rows : [];
  } catch {
    if (seq !== searchSeq) return;
    memberResults.value = [];
    searchError.value = '成员搜索失败，请稍后重试';
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
};

const fetchProductsForChip = async (kw) => {
  const seq = ++searchSeq;
  isSearching.value = true;
  searchError.value = '';
  try {
    await productsStore.fetchProducts();
    if (seq !== searchSeq) return;
    const lower = kw.toLowerCase();
    productResults.value = (productsStore.productsData || []).filter((p) => {
      if (p.is_active === false) return false;
      const hay = `${p.title || ''} ${p.description || ''}`.toLowerCase();
      return hay.includes(lower);
    });
  } catch {
    if (seq !== searchSeq) return;
    productResults.value = [];
    searchError.value = '周边数据加载失败，请稍后重试';
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
};

/* 博莱克：先检索论坛相关内容做证据，再交给 BohForumAnswerCard 流式作答 */
const askBolek = async (kw) => {
  const seq = ++searchSeq;
  isSearching.value = true;
  searchError.value = '';
  try {
    const { data: related } = await getPosts(null, {
      page: 1,
      pageSize: 5,
      searchQuery: kw,
      sortMode: 'hottest',
    });
    if (seq !== searchSeq) return;
    bolekEvidence.value = (Array.isArray(related) ? related : []).slice(0, 5);
    bolekQuestion.value = kw;
    bolekNonce.value += 1; // 换词重问：卡片整体重建（引擎 inputMessage 在 onMounted 注入）
  } catch {
    if (seq !== searchSeq) return;
    bolekEvidence.value = [];
    bolekQuestion.value = kw;
    bolekNonce.value += 1;
  } finally {
    if (seq === searchSeq) isSearching.value = false;
  }
};

const runSearch = ({ remember = false } = {}) => {
  const kw = keyword.value;
  if (!kw) return;
  if (remember) rememberSearchKeyword(kw);
  hasSearched.value = true;
  if (activeChip.value === 'product') fetchProductsForChip(kw);
  else if (activeChip.value === 'bolek') askBolek(kw);
  else if (activeChip.value === 'member') fetchMembersForChip(kw);
  else fetchPostsForChip(kw, activeChip.value);
};

const onInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  const kw = keyword.value;
  if (!kw) {
    // 清空输入：结果态退回「待输入」，不保留上一个词的结果
    searchSeq += 1;
    isSearching.value = false;
    postResults.value = [];
    productResults.value = [];
    memberResults.value = [];
    hasSearched.value = false;
    return;
  }
  // 单字符滞回（沿旧口径）：中文输入「树洞」会先经过「树」，多等一拍再查
  const delay = kw.length === 1 ? SINGLE_CHAR_SEARCH_DELAY_MS : SEARCH_DEBOUNCE_MS;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runSearch();
  }, delay);
};

const onChipChange = (key) => {
  if (activeChip.value === key) return;
  activeChip.value = key;
  searchSeq += 1; // 掐掉在途请求
  if (!keyword.value) return;
  runSearch();
};

const onSubmit = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!keyword.value) return;
  runSearch({ remember: true });
  router.replace({ query: { ...route.query, q: keyword.value } });
};

const applyHistoryKeyword = (kw) => {
  inputQuery.value = kw;
  onSubmit();
};

/* ── 详情跳转：横屏弹窗 / 竖屏路由（与 ForumMain 同一分流口径）────────── */
const openDetail = (postId) => {
  const id = String(postId || '').trim();
  if (!id) return;
  if (isForumLandscape()) {
    openForumPost({ router, postId: id });
    return;
  }
  router.push(`/forum/post/${id}`);
};

const openProfile = (username) => {
  const name = String(username || '').trim();
  if (name) router.push(`/profile/${name}`);
};

const goBack = () => {
  if (window.history.length > 1) router.back();
  else router.push('/forum');
};

/* 深链支持：/search?q=xxx（⌘K / 外部直达）—— 挂载时若有 q 直接检索 */
/* 全局导航高度实测（沿用 Shop / Newsroom / ActivitiesList 的既定做法）：
   顶栏 sticky 的 top 值与页面 padding-top 都吃这个变量。导航是懒渲染的，
   所以用 ResizeObserver 跟一次，切主题 / 转屏导致高度变化也能跟上。 */
let navObserver = null;
let navSyncRaf = null;
const syncNavHeight = () => {
  if (typeof document === 'undefined') return;
  const nav = document.getElementById('unified-nav-container');
  const page = document.querySelector('.page-search');
  if (!nav || !page) return;
  const height = nav.getBoundingClientRect().height;
  if (height > 0) page.style.setProperty('--nav-h', `${Math.ceil(height)}px`);
};

const observeNavHeight = () => {
  syncNavHeight();
  const nav = document.getElementById('unified-nav-container');
  if (!nav || typeof ResizeObserver === 'undefined') return;
  navObserver = new ResizeObserver(() => {
    if (navSyncRaf) return;
    navSyncRaf = requestAnimationFrame(() => {
      navSyncRaf = null;
      syncNavHeight();
    });
  });
  navObserver.observe(nav);
};

onMounted(() => {
  observeNavHeight();
  loadSearchHistory();
  const initial = String(route.query.q || '').trim();
  if (initial) {
    inputQuery.value = initial;
    runSearch({ remember: true });
  }
});

onBeforeUnmount(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  searchSeq += 1;
  navObserver?.disconnect();
  navObserver = null;
  if (navSyncRaf) {
    cancelAnimationFrame(navSyncRaf);
    navSyncRaf = null;
  }
});

watch(
  () => route.query.q,
  (next) => {
    const kw = String(next || '').trim();
    if (kw && kw !== inputQuery.value) {
      inputQuery.value = kw;
      runSearch({ remember: true });
    }
  },
);

const KIND_BADGE = { news: '资讯', activity: '活动' };
</script>

<template>
  <div class="search-page page-search">
    <!-- 顶部毛玻璃粘性栏：‹ 返回 + 搜索框（构思图「搜索区」第一段） -->
    <header class="search-nav">
      <button type="button" class="search-nav-back" aria-label="返回" @click="goBack">
        <ChevronLeft :size="22" :stroke-width="2.2" />
      </button>
      <div class="search-input-shell">
        <Search :size="16" :stroke-width="2.1" class="search-input-icon" aria-hidden="true" />
        <input
          type="text"
          class="search-input"
          placeholder="搜索帖子、资讯、周边…"
          aria-label="全站搜索"
          autocomplete="off"
          enterkeyhint="search"
          autofocus
          v-model="inputQuery"
          @input="onInput"
          @keyup.enter="onSubmit"
          @focus="isInputFocused = true"
          @blur="isInputFocused = false"
        />
      </div>
    </header>

    <!-- 分类 chips（构思图「为搜索结果分类」） -->
    <nav class="search-chips" aria-label="搜索结果分类">
      <button
        v-for="chip in CHIPS"
        :key="chip.key"
        type="button"
        class="search-chip"
        :class="{ 'is-active': activeChip === chip.key }"
        @click="onChipChange(chip.key)"
      >
        {{ chip.label }}
      </button>
    </nav>

    <!-- 最近搜索：空输入 + 聚焦时展开（与论坛首页同一份数据） -->
    <Transition name="history-drop">
      <div v-if="showHistory" class="search-history-panel">
        <span class="search-history-label">最近搜索</span>
        <button
          v-for="kw in searchHistory"
          :key="kw"
          type="button"
          class="search-history-chip"
          @mousedown.prevent
          @click="applyHistoryKeyword(kw)"
        >
          {{ kw }}
        </button>
        <button
          type="button"
          class="search-history-clear"
          @mousedown.prevent
          @click="clearSearchHistory"
        >
          清除
        </button>
      </div>
    </Transition>

    <!-- 内容流（构思图第三段） -->
    <section class="search-body">
      <!-- 空输入：引导态 -->
      <div v-if="!keyword && !hasSearched" class="search-placeholder">
        <Search :size="30" :stroke-width="1.5" aria-hidden="true" />
        <p>搜帖子、找资讯、逛周边，或让博莱克帮你找</p>
      </div>

      <!-- 加载态 -->
      <div v-else-if="isSearching" class="search-loading" aria-live="polite">
        <Loader2 :size="22" :stroke-width="2.2" class="search-loading-icon" />
        <p>正在搜索…</p>
      </div>

      <!-- 失败态 -->
      <div v-else-if="searchError" class="search-empty">
        <SearchX :size="26" :stroke-width="1.6" aria-hidden="true" />
        <p class="search-empty-title">{{ searchError }}</p>
      </div>

      <!-- 博莱克流式作答卡 -->
      <template v-else-if="activeChip === 'bolek'">
        <BohForumAnswerCard :key="bolekNonce" :question="bolekQuestion" :posts="bolekEvidence" />
        <p class="search-bolek-hint">博莱克的回答基于论坛已有内容，点卡片可进入完整对话</p>
      </template>

      <!-- 成员：**完整成员页**直接接入（用户口径 16:43）。
           关键词非空时，先给「精确匹配」小节（searchProfiles 通道），
           下面接完整 CommunityTab（社区概览 + 分组 + 生日），两者不互相替代。 -->
      <template v-else-if="activeChip === 'member'">
        <section v-if="keyword" class="search-member-match">
          <h2 class="search-section-title">
            匹配「{{ keyword }}」的成员
            <span class="search-section-count">{{ memberResults.length }}</span>
          </h2>
          <div v-if="!memberResults.length" class="search-member-none">
            没有用户名包含「{{ keyword }}」的成员，下面可以浏览全部成员
          </div>
          <div v-else class="search-member-list">
            <button
              v-for="member in memberResults"
              :key="member.id"
              type="button"
              class="search-member-card"
              @click="router.push(`/profile/${member.username}`)"
            >
              <span class="search-member-avatar">
                <img
                  v-if="member.avatar_url"
                  :src="getAvatarUrl(member.avatar_url, 'sm')"
                  :alt="member.username"
                  loading="lazy"
                />
                <span v-else>{{
                  String(member.username || 'U')
                    .charAt(0)
                    .toUpperCase()
                }}</span>
              </span>
              <span class="search-member-text">
                <span class="search-member-name">@{{ member.username }}</span>
                <span v-if="member.bio" class="search-member-bio">{{ member.bio }}</span>
              </span>
            </button>
          </div>
        </section>

        <h2 v-if="keyword" class="search-section-title is-spaced">全部成员</h2>
        <Suspense>
          <AsyncCommunity
            @switch-tab="router.push(`/user-space?tab=${$event}`)"
            @open-follow-modal="() => {}"
          />
          <template #fallback>
            <div class="search-loading">
              <Loader2 :size="22" class="search-loading-icon" />
              <p>正在加载成员…</p>
            </div>
          </template>
        </Suspense>
      </template>

      <!-- 周边商品结果 -->
      <template v-else-if="activeChip === 'product'">
        <div v-if="!productResults.length" class="search-empty">
          <Package :size="26" :stroke-width="1.6" aria-hidden="true" />
          <p class="search-empty-title">没有找到「{{ keyword }}」相关周边</p>
          <p class="search-empty-desc">换个关键词，或去商城逛逛全部商品</p>
          <button type="button" class="search-empty-action" @click="router.push('/shop')">
            去商城看看
          </button>
        </div>
        <div v-else class="search-product-grid">
          <button
            v-for="product in productResults"
            :key="product.id"
            type="button"
            class="search-product-card"
            @click="router.push('/shop')"
          >
            <img
              v-if="product.image"
              :src="product.image"
              :alt="product.title"
              class="search-product-img"
              loading="lazy"
            />
            <div v-else class="search-product-img is-fallback" aria-hidden="true">
              <Package :size="22" :stroke-width="1.6" />
            </div>
            <span class="search-product-title">{{ product.title }}</span>
            <span class="search-product-price">
              {{ product.rmb_price ? `¥${product.rmb_price}` : `${product.points_cost} 积分` }}
            </span>
          </button>
        </div>
      </template>

      <!-- 帖子 / 资讯 / 活动结果 -->
      <template v-else>
        <div v-if="!postResults.length" class="search-empty">
          <SearchX :size="26" :stroke-width="1.6" aria-hidden="true" />
          <p class="search-empty-title">没有找到「{{ keyword }}」相关内容</p>
          <p class="search-empty-desc">试试更短的关键词，或切到「博莱克」让 AI 帮你找</p>
          <button
            type="button"
            class="search-empty-action"
            @click="
              onChipChange('bolek');
              $nextTick(() => runSearch());
            "
          >
            问问博莱克
          </button>
        </div>
        <div v-else class="search-result-list">
          <button
            v-for="post in postResults"
            :key="post.id"
            type="button"
            class="search-result-card"
            @click="openDetail(post.id)"
          >
            <div class="search-result-head">
              <ReplyIdentityRow
                size="md"
                :username="post.author_username"
                :avatar-url="
                  post.author_avatar_url ? getAvatarUrl(post.author_avatar_url, 'xs') : ''
                "
                :avatar-frame-url="post.author_avatar_frame_url || ''"
                @go-to-profile="openProfile"
                :author-id="post.author_id"
                :banned="!!post.author_is_banned"
                :time="formatDate(post.created_at)"
              />
              <span v-if="KIND_BADGE[post.post_kind]" class="search-result-kind">{{
                KIND_BADGE[post.post_kind]
              }}</span>
            </div>
            <span v-if="post.title" class="search-result-title">{{ post.title }}</span>
            <p class="search-result-snippet">{{ post.content }}</p>
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* 语言全部走 --appl-* token（plans/051 第五族，明暗成对）——本页零裸色字面量 */
.search-page {
  min-height: 100vh;
  /* 纯白 + 毛玻璃（用户口径 16:38）：底子是纯白，不再用 #F5F5F7 的灰画布；
     玻璃感由顶栏 / 输入壳 / 卡片三处的 backdrop-filter 承担。 */
  background: var(--appl-card);
}

@media (orientation: portrait) {
  .search-page {
    animation: searchPagePortraitIn var(--duration-page, 500ms) var(--ease-in-out) both;
    transform-origin: top center;
  }

  .search-nav {
    animation: searchNavPortraitIn var(--duration-page, 500ms) var(--ease-in-out) 40ms both;
  }
}

@keyframes searchPagePortraitIn {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.994);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes searchNavPortraitIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes searchPageReducedIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* ── 顶部毛玻璃粘性栏 ───────────────────────────────
   ⚠️ 本页是全屏页，全局导航（#unified-nav-container）仍然挂在顶部 ——
   搜索栏必须**避让它**，否则两者叠在一起。--nav-h 由页面挂载时实测写入
   （沿用 Shop/Newsroom/ActivitiesList 一套既定做法，见 syncNavHeight）。 */
.page-search {
  padding-top: var(--nav-h, 0px);
}

.search-nav {
  position: sticky;
  top: var(--nav-h, 0px);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  /* 用户口径 16:43：**不要矩形背景**，让玻璃直接浮在页面上。
     所以整条栏本身透明无边框 —— 玻璃感只由内部的输入胶囊承担
     （一颗飘在白底上的半透明胶囊），滚动时内容从胶囊后面虚化穿过。 */
  background: transparent;
  border: none;
}

.search-nav-back {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-left: -6px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--appl-blue);
  cursor: pointer;
}

.search-nav-back:active {
  transform: scale(0.94);
}

.search-input-shell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  /* 玻璃浮层：半透明白 + 细描边 + 轻投影。栏本身透明 ⇒ 全靠这一层读出「玻璃悬浮」。 */
  background: color-mix(in srgb, var(--appl-card) 62%, transparent);
  border: 1px solid color-mix(in srgb, var(--appl-text-1) 7%, transparent);
  box-shadow:
    0 1px 3px color-mix(in srgb, var(--appl-text-1) 5%, transparent),
    0 8px 24px color-mix(in srgb, var(--appl-text-1) 4%, transparent);
  /* 材质走全站液态玻璃 token（check:liquid-glass 要求单一真源，不许硬编码模糊值） */
  -webkit-backdrop-filter: var(--liquid-filter);
  backdrop-filter: var(--liquid-filter);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.search-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--appl-blue) 45%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--appl-blue) 12%, transparent);
}

.search-input-icon {
  flex-shrink: 0;
  color: var(--appl-text-4);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 16px; /* ≥16px 防 iOS 聚焦自动放大 */
  color: var(--appl-text-1);
}

.search-input::placeholder {
  color: var(--appl-text-4);
}

/* ── 分类 chips ──────────────────────────────────── */
.search-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 4px;
  overflow-x: auto;
  scrollbar-width: none;
  background: transparent;
}

.search-chips::-webkit-scrollbar {
  display: none;
}

.search-chip {
  flex-shrink: 0;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--appl-hairline);
  border-radius: 999px;
  /* 未选中：玻璃底（白 66%）+ 发丝描边；选中：实色反白 */
  background: color-mix(in srgb, var(--appl-card) 66%, transparent);
  color: var(--appl-text-2);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  backdrop-filter: var(--liquid-filter-sm);
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease;
}

.search-chip.is-active {
  background: var(--appl-text-1);
  border-color: var(--appl-text-1);
  color: var(--appl-card);
}

/* ── 最近搜索浮层 ───────────────────────────────── */
.search-history-panel {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 16px 0;
  padding: 10px 14px;
  border-radius: var(--appl-radius-inner);
  background: var(--appl-card);
  box-shadow: var(--appl-shadow-card);
}

.search-history-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--appl-text-4);
}

.search-history-chip {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  background: var(--appl-subtle);
  color: var(--appl-text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.search-history-clear {
  margin-left: auto;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--appl-text-4);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.history-drop-enter-active,
.history-drop-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.history-drop-enter-from,
.history-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ── 内容流 ─────────────────────────────────────── */
.search-body {
  padding: 14px 16px 40px;
}

.search-placeholder,
.search-empty,
.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 72px 20px;
  text-align: center;
  color: var(--appl-text-4);
}

.search-placeholder p,
.search-empty-desc {
  font-size: 14px;
  color: var(--appl-text-3);
}

.search-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--appl-text-1);
}

.search-loading {
  color: var(--appl-text-3);
}

.search-loading-icon {
  animation: searchSpin 0.9s linear infinite;
}

@keyframes searchSpin {
  to {
    transform: rotate(360deg);
  }
}

.search-empty-action {
  margin-top: 4px;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: var(--appl-blue);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

/* 帖子类结果卡（051 卡片语言：纯白 / 无边框 / 极轻接触阴影） */
.search-result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-result-card {
  display: block;
  width: 100%;
  padding: 16px 18px;
  /* 纯白卡 + 发丝描边 + 极轻接触阴影（毛玻璃感由半透明白底承担） */
  border: 1px solid var(--appl-hairline);
  border-radius: var(--appl-radius-card);
  background: color-mix(in srgb, var(--appl-card) 92%, transparent);
  box-shadow: var(--appl-shadow-card);
  cursor: pointer;
  text-align: left;
  font: inherit;
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  backdrop-filter: var(--liquid-filter-sm);
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.search-result-card:active {
  box-shadow: var(--appl-shadow-card-hover);
}

.search-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.search-result-kind {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--appl-text-3);
}

.search-result-title {
  display: block;
  margin-top: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--appl-text-1);
  line-height: 1.35;
}

.search-result-snippet {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--appl-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

/* 成员 chip：精确匹配小节 + 完整成员页 */
.search-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 650;
  color: var(--appl-text-1);
}

.search-section-title.is-spaced {
  margin-top: 26px;
}

.search-section-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--appl-text-4);
  font-variant-numeric: tabular-nums;
}

.search-member-none {
  padding: 4px 0 8px;
  font-size: 13.5px;
  color: var(--appl-text-4);
}

/* 成员结果：一行一个，头像 + 名字 + 简介（名单类内容用列表而非网格） */
.search-member-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: var(--appl-radius-inner);
  background: var(--appl-card);
  box-shadow: var(--appl-shadow-card);
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.search-member-card:active {
  box-shadow: var(--appl-shadow-card-hover);
}

.search-member-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--appl-avatar-lg);
  height: var(--appl-avatar-lg);
  border-radius: 50%;
  overflow: hidden;
  background: var(--appl-subtle);
  color: var(--appl-text-3);
  font-size: 16px;
  font-weight: 700;
}

.search-member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.search-member-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.search-member-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--appl-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-member-bio {
  font-size: 13px;
  color: var(--appl-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 周边商品网格 */
.search-product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.search-product-card {
  display: flex;
  flex-direction: column;
  padding: 0;
  border: none;
  border-radius: var(--appl-radius-card);
  background: var(--appl-card);
  box-shadow: var(--appl-shadow-card);
  overflow: hidden;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.search-product-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.search-product-img.is-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--appl-subtle);
  color: var(--appl-text-4);
}

.search-product-title {
  padding: 10px 12px 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--appl-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-product-price {
  padding: 0 12px 12px;
  font-size: 14px;
  font-weight: 700;
  color: var(--appl-blue);
  font-variant-numeric: tabular-nums;
}

/* 博莱克 */
.search-bolek-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--appl-text-4);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .search-page {
    animation: searchPageReducedIn 320ms ease both;
  }

  .search-nav {
    animation: none;
  }

  .history-drop-enter-active,
  .history-drop-leave-active,
  .search-loading-icon {
    transition: none;
    animation: none;
  }
}

/* ══ 横屏（≥1024，用户构思图 16:36）═══════════════════════
   左侧全局导航竖条（unified-nav 自带）+ 顶部居中 tab 区 + 宽搜索框
   + 下方**三栏轻微错位**帖子流。
   错位用 CSS 多列（column-count: 3）实现 —— 卡片不等高时各列起点天然错开，
   既不是死板等高网格，也不需要 JS 测高。 */
@media (min-width: 1024px) {
  .search-nav {
    justify-content: center;
    padding: 12px 24px;
    background: transparent;
    border: none;
  }

  .search-nav-back {
    position: absolute;
    left: 20px;
  }

  /* 搜索框：居中限宽，不拉满整屏（拉满会显得散）。
     ⚠️ 基础样式是 flex:1 —— 只写 width 会被 flex 拉伸覆盖，
     必须同时把 flex 收成 `0 1 auto`，限宽才真的生效（2026-11-26 实测踩过）。 */
  .search-input-shell {
    flex: 0 1 auto;
    width: min(680px, 100%);
    height: 44px;
  }

  /* chips：居中排成 tab 区（对应构思图「tab 区」方框） */
  .search-chips {
    justify-content: center;
    padding: 14px 24px 2px;
  }

  .search-body {
    max-width: 1240px;
    margin: 0 auto;
    padding: 20px 24px 56px;
  }

  /* 三栏错位流：多列布局。
     ⚠️ column-count 只对**块级**容器生效 —— 基础样式里是 display:flex（竖屏单列竖排），
     这里必须显式改回 block，否则 flex 容器忽略 column-count，
     三栏算出来但卡片全挤在第一列（2026-11-26 实测踩过）。 */
  .search-result-list {
    display: block;
    column-count: 3;
    column-gap: 16px;
  }

  .search-result-card {
    break-inside: avoid;
    /* 多列下 margin-bottom 承担行距（column-gap 只管列间） */
    margin-bottom: 16px;
  }

  /* 成员列表横屏下也走多列（名单类同样吃错位布局） */
  .search-member-list {
    display: block;
    column-count: 2;
    column-gap: 16px;
  }

  .search-member-card {
    break-inside: avoid;
    margin-bottom: 12px;
  }

  /* 商品网格横屏四列 */
  .search-product-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* 超宽档：三栏可能过宽，收一点 */
@media (min-width: 1600px) {
  .search-body {
    max-width: 1400px;
  }
}
</style>
