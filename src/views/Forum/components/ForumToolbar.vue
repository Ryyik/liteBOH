<script setup>
import { ref, computed } from 'vue';
import { Search, Sparkles, Trash2, X } from 'lucide-vue-next';
import { FORUM_TAG_OPTIONS } from '../forum-config.js';
import GlassPillButton from '@/components/ui/GlassPillButton.vue';

const props = defineProps({
  searchQuery: { type: String, default: '' },
  isLoggedIn: { type: Boolean, default: false },
  hasSignedThisWeek: { type: Boolean, default: false },
  sortMode: { type: String, default: 'latest' },
  selectedTagFilter: { type: String, default: '' },
  isAiSearchLoading: { type: Boolean, default: false },
  aiSearchHint: { type: String, default: '' },
  /* 最近搜索：数据由父级持有（存储读写也归它管），本组件只负责展示与透传点击 ——
     面板必须**贴着搜索框**，所以它渲染在这里而不是信息流顶部：
     隔着一个发帖框的话，手机上它会被底部导航栏压住（实测 y=773 / 视口 844，命中 nav-item），
     用户既看不到也点不到。 */
  searchHistory: { type: Array, default: () => [] },
  // 展开与否也由父级单点判断（它才知道聚焦态 + 输入是否为空）
  showSearchHistory: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:searchQuery',
  'searchSubmit',
  'askBolek',
  'clearTagFilter',
  // 清除搜索词（输入框右侧 × / 无结果引导）。与「清除标签筛选」分开：
  // 用户清关键词时不该顺手把 #标签 筛选也丢掉，反之亦然。
  'clearSearch',
  // 聚焦态：父级用它决定「最近搜索」条是否展开（空输入 + 聚焦时才展示）
  'searchFocus',
  'searchBlur',
  // 最近搜索的点击：回填某个词 / 清空历史（数据与存储都在父级）
  'applyHistoryKeyword',
  'clearSearchHistory',
  'openWeeklyCheckin',
]);

const searchInputRef = ref(null);

const activeTagLabel = computed(() => {
  const option = FORUM_TAG_OPTIONS.find((t) => t.value === props.selectedTagFilter);
  return option ? option.label : `#${props.selectedTagFilter}`;
});

const onSearchInput = (e) => {
  emit('update:searchQuery', e.target.value);
};

const onSearchSubmit = () => {
  emit('searchSubmit');
};

const onAskBolek = () => {
  if (props.isAiSearchLoading) return;
  emit('askBolek');
};

const onClearTagFilter = () => {
  emit('clearTagFilter');
};

const onApplyHistory = (keyword) => {
  emit('applyHistoryKeyword', keyword);
};

const onClearHistory = () => {
  emit('clearSearchHistory');
};

/* 清除搜索词：清空后把焦点交还输入框 —— 用户点 × 十有八九是想重新输入，
   焦点丢掉的话还得再点一次。 */
const onClearSearch = () => {
  emit('clearSearch');
  searchInputRef.value?.focus();
};

const onSearchFocus = () => {
  emit('searchFocus');
};

const onSearchBlur = () => {
  emit('searchBlur');
};

const onOpenWeeklyCheckin = () => {
  emit('openWeeklyCheckin');
};
</script>

<template>
  <div class="forum-toolbar" :class="{ 'has-open-panel': showSearchHistory }">
    <div class="toolbar-search-wrapper">
      <!-- 签到：2026-10-22 从原来的「第二行筛选栏」搬进搜索框左侧（参考稿里「+」的位置）。
           筛选下拉（最新 · 全部标签）同时撤掉：它占掉整整一行，而排序默认就是最新、
           标签可以直接在输入框里打 #标签 —— 那一行的成本远高于收益。 -->
      <button
        v-if="isLoggedIn"
        type="button"
        class="toolbar-checkin-inline"
        :class="{ 'is-done': hasSignedThisWeek }"
        :title="hasSignedThisWeek ? '本周已签到' : '每周签到'"
        @click="onOpenWeeklyCheckin"
      >
        {{ hasSignedThisWeek ? '已签' : '签到' }}
      </button>
      <span v-if="isLoggedIn" class="toolbar-inline-sep" aria-hidden="true"></span>
      <input
        ref="searchInputRef"
        type="text"
        class="toolbar-search-input"
        :class="{ 'with-tag-chip': selectedTagFilter }"
        placeholder="搜索帖子、作者或 #标签…"
        aria-label="搜索帖子"
        autocomplete="off"
        enterkeyhint="search"
        :value="searchQuery"
        @input="onSearchInput"
        @keyup.enter="onSearchSubmit"
        @focus="onSearchFocus"
        @blur="onSearchBlur"
      />
      <!-- 横屏：已激活的标签筛选 chip（点 × 清除；移动端隐藏，走 #标签 语法） -->
      <Transition name="toolbar-pop">
        <button
          v-if="selectedTagFilter"
          type="button"
          class="toolbar-tag-chip"
          :title="`清除标签筛选 ${activeTagLabel}`"
          @click="onClearTagFilter"
        >
          <span class="tag-chip-label">{{ activeTagLabel }}</span>
          <X :size="12" :stroke-width="2.4" class="tag-chip-clear" aria-hidden="true" />
        </button>
      </Transition>

      <!-- 清除搜索词：横屏独立定位（该档位 .toolbar-search-actions 整体隐藏） -->
      <Transition name="toolbar-pop">
        <button
          v-if="searchQuery"
          type="button"
          class="toolbar-clear-btn is-hero"
          aria-label="清除搜索"
          title="清除搜索"
          @click="onClearSearch"
        >
          <X :size="15" :stroke-width="2.6" />
        </button>
      </Transition>

      <!-- 移动端 / 平板：输入框内右侧只留「清除 + 问博莱克」。
           搜索不再单独放放大镜钮 —— 回车即搜索（enterkeyhint=search）。 -->
      <div class="toolbar-search-actions">
        <!-- 清除按钮：只在有内容时出现（空着的时候多一个 × 只是噪音） -->
        <Transition name="toolbar-pop">
          <button
            v-if="searchQuery"
            type="button"
            class="toolbar-clear-btn"
            aria-label="清除搜索"
            title="清除搜索"
            @click="onClearSearch"
          >
            <X :size="14" :stroke-width="2.6" />
          </button>
        </Transition>
        <button
          type="button"
          class="toolbar-ai-btn"
          :disabled="isAiSearchLoading"
          title="博莱克检索论坛内容，在搜索结果下方回答（消耗 AI 额度，点卡片进完整对话）"
          @click="onAskBolek"
        >
          <span class="ai-label">问博莱克</span>
        </button>
      </div>
    </div>

    <!-- AI 状态 / 提示：挂在工具栏层（横屏时显示在整个工具栏下方） -->
    <Transition name="toolbar-ai-status">
      <div v-if="isAiSearchLoading" class="toolbar-ai-status" aria-live="polite">
        <span class="toolbar-ai-spinner" aria-hidden="true"></span>
        <span class="toolbar-ai-loading-text">博莱克检索中</span>
      </div>
    </Transition>
    <Transition name="toolbar-ai-hint">
      <div v-if="aiSearchHint && !isAiSearchLoading" class="toolbar-ai-hint">
        {{ aiSearchHint }}
      </div>
    </Transition>

    <!-- 横屏细条右侧动作组：问博莱克 + 圆形搜索（移动端隐藏）。
         2026-11-26 19:04：不再是「底栏独占一行」—— 横屏工具栏收成单行细胶囊后，
         这一组就地并进条内（CSS 里 .toolbar-hero-bar 横屏档已改成 static 内联）。 -->
    <div class="toolbar-hero-bar">
      <div class="toolbar-hero-left">
        <!-- 签到入口只有**一处**（2026-11-26 19:04 用户口径「横屏有俩签到删掉一个」）：
             唯一入口在 ForumSectionShell 的页签行左侧（.section-checkin），
             这里不再重复渲染 —— 同屏出现两个「签到」是明确的视觉噪音。 -->
        <GlassPillButton
          class="toolbar-hero-pill"
          tone="soft"
          :disabled="isAiSearchLoading"
          title="博莱克检索论坛内容，在搜索结果下方回答（消耗 AI 额度，点卡片进完整对话）"
          @click="onAskBolek"
        >
          <Sparkles :size="16" :stroke-width="2" aria-hidden="true" />
          <span>问博莱克</span>
        </GlassPillButton>
      </div>
      <button
        type="button"
        class="toolbar-hero-search-btn boh-press-sm"
        aria-label="搜索"
        @click="onSearchSubmit"
      >
        <Search :size="19" :stroke-width="2.3" />
      </button>
    </div>

    <!-- 历史记录：与搜索框**融为一体**（小红书形态，用户口径 19:22）。
         它不是一块「隔几像素独立悬浮的卡片」，而是搜索框向下延续的同一个曲面：
         上沿无边框、上圆角为 0、与搜索框同宽同左，接缝处完全连续。
         条目用 @mousedown.prevent 保住点击 —— 否则 pointerdown 先让输入框 blur、
         面板收起，click 就落空了。 -->
    <Transition name="toolbar-history-drop">
      <div v-if="showSearchHistory" class="forum-search-history">
        <div class="search-history-head">
          <span class="search-history-label">历史记录</span>
          <button
            type="button"
            class="search-history-clear"
            aria-label="清空历史记录"
            title="清空历史记录"
            @mousedown.prevent
            @click="onClearHistory"
          >
            <Trash2 :size="14" :stroke-width="2" />
          </button>
        </div>
        <div class="search-history-chips">
          <button
            v-for="keyword in searchHistory"
            :key="keyword"
            type="button"
            class="search-history-chip"
            @mousedown.prevent
            @click="onApplyHistory(keyword)"
          >
            {{ keyword }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 竖屏 / 平板：一整条普通横框（参考稿形态）。整条容器不再是「卡里套框」——
   去掉玻璃、投影与嵌套白底，只留 1px 描边 + 全圆角，输入区裸坐其上。
   ≥1024 的横屏 hero 会在自己的媒体查询里把容器重新变回液态玻璃大卡。 */
.forum-toolbar {
  --forum-toolbar-radius: 22px;
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 0;
  min-height: 48px;
  margin-bottom: 18px;
  padding: 0 6px;
  /* 底色/描边走全局液态 token（:root 与 [data-theme='dark'] 各有一套）——
     这样不需要再写一份 [data-theme='dark'] 覆盖，也不会给暗色裸色棘轮添数。 */
  background: var(--liquid-bg-subtle);
  border: 1px solid var(--liquid-border-hairline);
  border-radius: var(--forum-toolbar-radius);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.forum-toolbar:focus-within {
  border-color: rgba(0, 113, 227, 0.32);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.08);
}

.toolbar-search-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
}

/* 签到：搜索框最左侧的纯文字入口（原「+」位）。刻意不做成胶囊按钮 ——
   它是前缀动作，不该和右侧「问博莱克」抢视觉权重。 */
.toolbar-checkin-inline {
  flex-shrink: 0;
  height: 34px;
  padding: 0 10px 0 12px;
  border: none;
  background: transparent;
  color: var(--liquid-text-secondary);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease;
}

.toolbar-checkin-inline:hover {
  background: color-mix(in srgb, var(--liquid-text-primary) 6%, transparent);
}

.toolbar-checkin-inline:active {
  transform: scale(0.96);
}

.toolbar-checkin-inline.is-done {
  color: var(--liquid-text-tertiary);
  font-weight: 600;
}

.toolbar-inline-sep {
  flex-shrink: 0;
  width: 1px;
  height: 16px;
  margin-right: 4px;
  background: var(--liquid-border-hairline);
}

.toolbar-search-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 46px;
  padding: 0 4px;
  border: none;
  border-radius: 999px;
  font-size: 15px;
  background: transparent;
  color: var(--liquid-text-primary);
  outline: none;
  transition:
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

.toolbar-search-input::placeholder {
  color: var(--liquid-text-tertiary);
}

/* 输入区自身不再有底色/描边：整条 toolbar 就是那颗「框」，聚焦反馈统一落在容器上 */
.toolbar-search-input:focus {
  background: transparent;
  box-shadow: none;
}

/* 标签筛选 chip：默认隐藏（移动端靠输入框里的 #标签 语法），横屏内显示 */
.toolbar-tag-chip {
  display: none;
}

.toolbar-search-actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-right: 2px;
}

/* 清除搜索词：只在输入框有内容时渲染（v-if），所以没有「禁用态」要处理。
   移动端作为 .toolbar-search-actions 的第一个子项内联；横屏用 .is-hero 版单独定位
   （那个档位 .toolbar-search-actions 整体 display:none，无法复用同一份 DOM）。 */
.toolbar-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.06);
  color: #667085;
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s,
    transform 0.15s;
}

.toolbar-clear-btn:hover {
  background: rgba(15, 23, 42, 0.12);
  color: #1d1d1f;
}

.toolbar-clear-btn:active {
  transform: scale(0.92);
}

.toolbar-clear-btn.is-hero {
  display: none;
}

/* 搜索框内的零碎控件（清除 × / 标签 chip）：出现时不该「啪」地把输入框挤一下。
   160ms 缩放淡入，退场快 40ms（消失不耐等）。 */
.toolbar-pop-enter-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 160ms var(--ease-out);
}

.toolbar-pop-leave-active {
  transition:
    opacity 120ms var(--ease-out),
    transform 120ms var(--ease-out);
  /* 退场这 120ms 里元素还挂在 DOM 上。`is-hero` 版的清除钮是绝对定位、
     恰好压着输入框右端 —— 留它吃点击会让「清空后立刻点输入框」落空
     （探针 D3 正是这么点空的）。离场的节点一律不参与命中。 */
  pointer-events: none;
}

.toolbar-pop-enter-from,
.toolbar-pop-leave-to {
  opacity: 0;
  transform: scale(0.62);
}

/* chip 从左侧推入：原点在左边才读作「贴到输入框后面」，居中缩放会像凭空冒出来 */
.toolbar-tag-chip {
  transform-origin: left center;
}

/* AI 提示句：紧跟在有过渡的 AI 状态条下面，一硬一软最扎眼 */
.toolbar-ai-hint-enter-active {
  transition:
    opacity 320ms var(--ease-out),
    transform 320ms var(--ease-out);
}

.toolbar-ai-hint-leave-active {
  transition: opacity 200ms var(--ease-out);
}

.toolbar-ai-hint-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.toolbar-ai-hint-leave-to {
  opacity: 0;
}

/* ---------- 历史面板：与搜索条融成**一张连续的卡**（用户口径 21:00 参考图）----------
   之前的写法是「一颗 999px 胶囊 + 一条下垂面板」，问题不在几何接缝（那已经对齐了），
   而在**两段的填充色不是同一个**：
     · 胶囊   = var(--liquid-bg-subtle)（58% 半透明玻璃）
     · 面板   = color-mix(--appl-card 96%)（近乎实白）
   两者亮度差一眼可见 ⇒ 无论圆角怎么调，读起来都是「两块拼在一起」。
   参考图之所以连贯，是因为它本来就是**一张卡**：上面一行是输入行（底部一条分隔线），
   下面直接接历史 / 猜你想搜，整张卡一个底色、一套外轮廓。

   现在的做法：
   1. 展开时**整张卡一起换成实底**（.forum-toolbar.has-open-panel 承担，
      见下一条规则）—— 面板不再自带底色，只负责布局与分隔线；
   2. 面板不再画外边框（上/左/右全不画）：外轮廓由搜索条那一圈描边统一负责，
      两块各自画边才会在接缝处出现「双线」；
   3. 下沿曲率跟容器走 22px（44px 高的胶囊被浏览器按 22px 解析，见下注释）；
   4. 顶部一条 1px 分隔线 —— 参考图里就是这条线在承担「输入区 / 结果区」的层次，
      而不是靠底色变化。

   仍然绝对定位而非占位：它是浮层，不该把下面的内容顶下去 ——
   工具栏高度随断点变化，占位会让 composer 与列表跳动。 */
.forum-search-history {
  position: absolute;
  top: 100%;
  /* 绝对定位的包含块是父盒 padding box；外扩 1px 才能与父盒 border box 同宽。 */
  left: -1px;
  right: -1px;
  /* 高于 .forum-toolbar 自身的 z-index: 5，确保盖住其后的发帖框与列表 */
  z-index: 60;
  /* top:100% 已落在父盒下边框内沿，不再用负 margin 向上多咬 1px。 */
  margin-top: 0;
  padding: 6px 10px 12px;
  /* ⚠️ 左/右/下**必须**画边（2026-11-26 21:05 实测漏了这一步）：
     本元素绝对定位在 .forum-toolbar 盒子之外，父盒那圈描边覆盖不到这里 ——
     只画上沿分隔线的话，卡片下半部分的外轮廓是**敞开**的，截图里表现为
     「左右两条竖边走到一半凭空断了」。
     上沿画的是分隔线（不是外边框），所以不会与搜索条的下边框叠成双线
     （后者已在 .has-open-panel 里置为 transparent）。 */
  border: 1px solid var(--liquid-border-hairline);
  border-top: 1px solid var(--liquid-border-hairline);
  /* 与搜索条共用同一个圆角真源，避免不同断点下上下曲率分叉。 */
  border-radius: 0 0 var(--forum-toolbar-radius) var(--forum-toolbar-radius);
  /* ⚠️ 必须自己有不透明底：本元素绝对定位在 .forum-toolbar 盒子**之外**（top:100%），
     父盒的底色覆盖不到这块区域 —— 写 transparent 会让下面的帖子内容直接透上来。
     连贯的关键不是「面板透明」，而是**两段取同一个值**：
     这里与展开态的 .forum-toolbar.has-open-panel 都用 --appl-card（同一个 token），
     所以不存在第二处色值可以分叉。
     不用 color-mix 掺透明：96% 白叠在浅灰页底上实测比纯白暗约 4%，正是原来那点色差的来源。 */
  background: var(--appl-card, #ffffff);
  /* 卡片**底部**的投影挂在这里：本元素是整卡的最后一层，只有它能给出
     「整张卡浮在列表之上」的那条下沿阴影（父盒只有 44px 高，投影会被盖掉）。 */
  box-shadow: var(--liquid-shadow-sm);
}

/* 展开态：**整张卡换实底** —— 这是「连贯」的真正来源。
   未展开时是 58% 半透明玻璃（浮在内容上、能看到背景），展开后转成实底卡：
   一是历史面板里文字密，半透明底会让下面的帖子噪声透上来；
   二是只有把输入行也换成同一个实底，上下两段才可能真的同色。
   值必须与 .forum-search-history 的 background 完全一致（同一个 --appl-card），
   改一处就要两处一起改 —— 这正是原来分叉的地方。 */
.forum-toolbar.has-open-panel {
  background: var(--appl-card, #ffffff);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  /* 下边框撤掉：下面直接接面板，画一条就是「双线」 */
  border-bottom-color: transparent;
  /* ⚠️ 焦点环**在展开态改回 hairline**（2026-11-26 21:08 实测）：
     展开时 :focus-within 会把这条描边染成蓝（rgba(0,113,227,.3)），
     而下面的面板只能是灰 hairline ⇒ 外轮廓在分隔线处**中途换色**，
     看起来就是「蓝色边框走到一半断掉」。
     展开本身就是最强的焦点反馈（整卡展开 + 下层内容），不需要再用颜色说话；
     改成中性描边后整卡是一圈连续同色的边。
     收起态（未展开）仍保留蓝色 focus ring，键盘用户照样看得见。 */
  border-top-color: var(--liquid-border-hairline);
  border-left-color: var(--liquid-border-hairline);
  border-right-color: var(--liquid-border-hairline);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  /* 阴影移交给面板（本元素只有 44px 高，自己的投影会被面板整块盖住，
     等于「卡片底部没有投影」）。见 .forum-search-history 的 box-shadow。 */
  box-shadow: none;
}

/* 展开态的焦点反馈：**不再染蓝**（2026-11-26 21:08 改，原为「只描上左右三边」）。
   原写法是为了不切断「一体」的观感（避免整圈 3px ring 在下沿拉出蓝横线），但它
   只覆盖了搜索条那 44px 的一段 —— 面板是灰 hairline ⇒ 外轮廓在分隔线处**中途换色**，
   截图里就是「蓝色竖边走到一半凭空断掉」，比原来的问题更显眼。
   现在整卡统一走中性描边（见 .forum-toolbar.has-open-panel 的 border-*-color），
   焦点反馈由「整卡展开」这件事本身承担：键盘用户 Tab 进来时看到的是一个展开的
   结果面板，位置与状态都明确，不再依赖描边颜色。
   ⚠️ 这条规则**删掉了**，不要再加回来 —— 它的特异性 (0,3,0) 会压过中性描边，
     死灰复燃的表现就是「徽章边缘一半蓝一半灰」。 */

/* 小节头：「历史记录」+ 右侧垃圾桶（小红书形态） */
.search-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 6px;
}

/* 历史词：胶囊铺排、可换行。面板宽 = 搜索框宽，横屏一排能放下好几个 */
.search-history-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 10px 10px;
}

.search-history-label {
  flex-shrink: 0;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--liquid-text-tertiary, #86868b);
}

.search-history-chip {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 11px;
  border: 1px solid color-mix(in srgb, var(--liquid-text-primary) 8%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--liquid-text-primary) 4%, transparent);
  color: var(--liquid-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s,
    transform 0.15s;
}

.search-history-chip:hover {
  background: rgba(15, 23, 42, 0.1);
  color: #1d1d1f;
  transform: translateY(-1px);
}

.search-history-chip:active {
  transform: scale(0.97);
}

.search-history-clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--liquid-text-tertiary, #86868b);
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s;
}

.search-history-clear:hover {
  background: color-mix(in srgb, var(--liquid-text-primary) 8%, transparent);
  color: var(--liquid-text-primary);
}

/* 只做 transform：面板底色必须从首帧就不透明，淡入会与下方深色内容合成出灰色色阶。 */
.toolbar-history-drop-enter-active,
.toolbar-history-drop-leave-active {
  transform-origin: top center;
  transition: transform 320ms var(--ease-out);
}

.toolbar-history-drop-leave-active {
  transition-duration: 200ms;
}

.toolbar-history-drop-enter-from,
.toolbar-history-drop-leave-to {
  transform: translateY(-4px) scaleY(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .toolbar-history-drop-enter-active,
  .toolbar-history-drop-leave-active {
    transition: none;
  }
}

/* 暗色：面板在 .forum-page[data-theme='dark'] 之内，用祖先选择器即可 ——
   scoped 只给最后一个选择器加 [data-v-*]，祖先部分不受限，所以这里能命中本组件元素。 */
/* 暗色：面板已全部改用 --liquid-* token（token 在暗色下有自己的一套值），
   所以这里不需要再写一遍硬编码覆盖 —— 留一份反而会盖掉 token 的暗色取值。 */

[data-theme='dark'] .search-history-label,
[data-theme='dark'] .search-history-clear {
  color: #9a9aa2;
}

[data-theme='dark'] .search-history-chip {
  background: rgba(255, 255, 255, 0.08);
  color: #d8d8de;
}

[data-theme='dark'] .search-history-chip:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
}

[data-theme='dark'] .search-history-clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #d8d8de;
}

/* 「问博莱克」：整条框里唯一的按钮（参考稿右端的胶囊）。浅灰底 + 全圆角，
   比原来 10px 圆角的方标签更轻，也不再和输入区抢边界。 */
.toolbar-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--liquid-text-primary) 7%, transparent);
  color: var(--liquid-text-secondary);
  font-size: 11.5px;
  font-weight: 750;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s,
    transform 0.15s;
  white-space: nowrap;
}

.toolbar-ai-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--liquid-text-primary) 11%, transparent);
  color: var(--liquid-text-primary);
}

.toolbar-ai-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.toolbar-ai-btn:disabled {
  opacity: 0.58;
  cursor: wait;
}

.toolbar-ai-btn .ai-label {
  line-height: 1;
}

.toolbar-ai-status {
  position: absolute;
  left: 32px;
  bottom: -32px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.78);
  color: #344054;
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  white-space: nowrap;
  z-index: 10;
}

.toolbar-ai-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(148, 163, 184, 0.26);
  border-top-color: rgba(17, 24, 39, 0.66);
  animation: toolbarAiSpin 0.86s linear infinite;
}

.toolbar-ai-loading-text {
  line-height: 1;
  white-space: nowrap;
}

@keyframes toolbarAiSpin {
  to {
    transform: rotate(360deg);
  }
}

.toolbar-ai-hint {
  position: absolute;
  left: 32px;
  bottom: -30px;
  color: #667085;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  z-index: 10;
}

.toolbar-ai-status-enter-active,
.toolbar-ai-status-leave-active {
  transition:
    opacity 0.26s ease,
    transform 0.26s ease,
    filter 0.26s ease;
}

.toolbar-ai-status-enter-from,
.toolbar-ai-status-leave-to {
  opacity: 0.34;
  transform: translateY(-8px) scale(0.985);
  filter: blur(2px);
}

/* 横屏 hero 底栏：默认（移动端）隐藏 */
.toolbar-hero-bar {
  display: none;
}

@media (max-width: 768px) {
  .forum-toolbar {
    min-height: 46px;
    padding: 0 5px;
  }

  /* ≥16px 防 iOS 聚焦自动放大 */
  .toolbar-search-input {
    font-size: 16px;
  }
}

/* 桌面两栏档（≥1024，与 base.css 两栏档同阈值；工具栏由 grid-areas 跨栏独占一行）：
   按草图重排为「大号液态玻璃搜索容器」——输入区在上，底部一行 [签到][问博莱克] 左 + 圆形搜索钮右。
   筛选下拉在横屏移除，标签筛选改由输入框内 #标签名 语法承担（chip 显示当前筛选）。
   样式必须写在本组件 scoped —— base.css 是以 scoped 方式引入的，跨组件选择器匹配不到本组件内部 */
@media (min-width: 1024px) {
  /* 用户口径 19:04：横屏搜索框**做窄、做细条、居中**，不再占满横向面积。
     原来是 1352×166 的大玻璃卡（整幅铺开 + 输入行 + 底部 hero 双钮行），
     现在收成一颗居中细胶囊：宽度上限 620px、高 48px、单行。
     那行 hero 底栏随之退场（签到已收归页签行，问博莱克并入条内）。 */
  .forum-toolbar {
    flex-direction: row;
    align-items: center;
    gap: 0;
    width: min(680px, 100%);
    min-height: 0;
    margin: 0 auto 26px;
    /* 右内边距 8 → 12（2026-11-26 21:10）：圆形搜索钮贴到最右后，8px 让它的外接圆
       几乎咬住 999px 的弧线（特写里像「溢出胶囊」）。12px 与左侧 6px 不对称是**有意**的
       —— 圆形控件在圆弧端需要的视觉余量比方形/文字端大，这是光学对齐不是几何对齐。 */
    padding: 0 12px 0 6px;
    border-radius: var(--forum-toolbar-radius);
    background: var(--liquid-bg-subtle);
    backdrop-filter: var(--liquid-filter);
    -webkit-backdrop-filter: var(--liquid-filter);
    border: 1px solid var(--liquid-border-hairline);
    box-shadow:
      0 6px 20px rgba(15, 23, 42, 0.06),
      var(--liquid-inner-highlight);
  }

  /* 容器即输入框：输入区裸坐在容器上（无内嵌白底），聚焦反馈落在容器描边 */
  .forum-toolbar:focus-within {
    border-color: rgba(0, 113, 227, 0.3);
    box-shadow:
      0 6px 20px rgba(15, 23, 42, 0.06),
      0 0 0 3px rgba(0, 113, 227, 0.07),
      var(--liquid-inner-highlight);
  }

  /* ⚠️ 必须 flex:1（原来是 flex:none，2026-11-26 21:10 用户报「按钮应该放最右侧」）：
     flex:none 让 wrapper 收缩到输入框的固有宽度（实测 680px 的条里只有 220px），
     右侧那颗「问博莱克 + 搜索」就停在 x≈792 —— 后面留下 312px 的空档，
     看起来像按钮悬在条中间。拉伸之后 hero 动作组被推到条的最右端。 */
  .toolbar-search-wrapper {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .toolbar-search-input {
    height: 42px;
    /* 右侧给「清除 ×」让位（细条里它是唯一绝对定位的控件） */
    padding: 0 40px 0 14px;
    font-size: 14.5px;
    text-align: left;
    background: transparent;
  }

  .toolbar-search-input:focus {
    background: transparent;
    box-shadow: none;
  }

  .toolbar-search-input::placeholder {
    text-align: left;
    color: #9a9aa0;
  }

  .toolbar-search-input.with-tag-chip {
    padding-left: 128px;
  }

  /* 横屏隐藏移动端专属块：输入框内的操作组 + 行内签到（hero 底栏已有同功能按钮） */
  .toolbar-search-actions,
  .toolbar-checkin-inline,
  .toolbar-inline-sep {
    display: none;
  }

  /* 清除键：贴输入行右内侧（该档位输入行右侧没有别的控件，不与搜索按钮冲突 ——
     横屏的搜索按钮在下方 hero 栏的右端） */
  .toolbar-clear-btn.is-hero {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    width: 24px;
    height: 24px;
  }

  .toolbar-clear-btn.is-hero:hover {
    transform: translateY(-50%) scale(1.06);
  }

  .toolbar-clear-btn.is-hero:active {
    transform: translateY(-50%) scale(0.94);
  }

  /* 标签筛选 chip：贴输入行左侧 */
  .toolbar-tag-chip {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 112px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 999px;
    background: #1d1d1f;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
    transition:
      transform 0.18s ease,
      opacity 0.18s ease;
  }

  .toolbar-tag-chip:hover {
    transform: translateY(-50%) scale(1.03);
    opacity: 0.92;
  }

  .tag-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  .tag-chip-clear {
    flex-shrink: 0;
    opacity: 0.72;
  }

  /* 细条右侧动作组：不再独占一行、不再 justify-content: space-between
     （那是「左右分置的底栏」布局），改成紧跟输入后的紧凑内联组。 */
  .toolbar-hero-bar {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin: 0;
    padding: 0;
  }

  .toolbar-hero-left {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  /* 按钮形态已封装为 ui/GlassPillButton.vue（样式单一源）；
     .toolbar-hero-pill 仅作布局锚点/探针标记 class 透传，这里只保留业务态配色。
     2026-11-26 19:04：细条内该 pill 要压到 34px 高、字号 12.5px，
     否则 42px 的默认高度会把 48px 细条撑成「胖条」，细条语义就没了。
     ⚠️ 2026-11-26 21:10 圆角：组件默认是 14px（卡片圆角），而这里坐在 **999px 的胶囊**
        容器里，并排还有一颗 50% 的圆形按钮 —— 14px 与它们同级相邻就是用户说的
        「圆角不统一，所以很丑」。细条内一律跟随容器曲率（999px = 全圆角）。 */
  .toolbar-hero-pill {
    height: 34px;
    font-size: 12.5px;
    padding: 0 13px;
    border-radius: 999px;
  }

  /* 横屏里已签态没有自己的底色（.is-done 走透明 pill），深灰字在浅玻璃上够读；
     维持原值，不进暗色棘轮。 */
  .toolbar-hero-pill.is-done {
    color: #3f4a5a;
  }

  /* ⚠️ 必须在这里再写一遍展开态底色（2026-11-26 21:00）：
     上面 .forum-toolbar 在 ≥1024 档把 background 钉成 var(--liquid-bg-subtle)（58% 玻璃），
     它同特异性、且写在本文件的**更后面** ⇒ 会把 base 层 .has-open-panel 的实底静默压掉。
     结果就是「横屏展开历史时，输入行还是玻璃、面板是实白」—— 正是用户截图里那条色差。
     特异性 :not() 抬一级不必要，这里靠「写在媒体查询里、层级更后」即可获胜。 */
  .forum-toolbar.has-open-panel {
    background: var(--appl-card, #ffffff);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom-color: transparent;
    box-shadow: none;
  }

  /* ⚠️ 展开态的焦点环也必须在**本档**压回中性色（2026-11-26 21:12 实测踩到）：
     上面 .forum-toolbar:focus-within 是 (0,3,0)（类 + 伪类 + 后代?不，是 类+伪类），
     而 base 层 .has-open-panel 只有 (0,2,0) ⇒ 压不过，展开时描边仍是蓝的，
     面板却是灰 hairline → 外轮廓「一半蓝一半灰」。
     这里用同档、更后的 .forum-toolbar.has-open-panel:focus-within (0,3,0) 打平并靠顺序取胜。
     三边（上左下）都写成与面板同一个 hairline（不含下边，下边已 transparent）。 */
  .forum-toolbar.has-open-panel:focus-within {
    border-top-color: var(--liquid-border-hairline);
    border-left-color: var(--liquid-border-hairline);
    border-right-color: var(--liquid-border-hairline);
    border-bottom-color: transparent;
    box-shadow: none;
  }

  .toolbar-hero-search-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: #1d1d1f;
    color: #ffffff;
    cursor: pointer;
    box-shadow:
      0 4px 12px rgba(17, 24, 39, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease;
  }

  .toolbar-hero-search-btn:hover {
    transform: scale(1.04);
    background: #2b2b30;
    box-shadow:
      0 6px 16px rgba(17, 24, 39, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }

  .toolbar-hero-search-btn:active {
    transform: scale(0.95);
  }

  /* AI 状态 / 提示：挂到整个工具栏之下，避免与 hero 按钮重叠
    （此档位 wrapper 只包住输入行，绝对定位的包含块回落到 .forum-toolbar） */
  .toolbar-ai-status {
    bottom: auto;
    top: calc(100% + 10px);
    left: 28px;
  }

  .toolbar-ai-hint {
    bottom: auto;
    top: calc(100% + 12px);
    left: 28px;
  }

  /* 周年皮肤：保持皮肤原有的行内工具栏形态（皮肤样式带感叹号 important，这里恢复结构与子件可见性） */
  .forum-page[data-anniversary-skin='active'] .forum-toolbar {
    flex-direction: row;
    align-items: center;
    min-height: 0;
    padding: 9px;
    gap: 8px;
    background: rgba(251, 247, 233, 0.97);
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-hero-bar {
    display: none;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-actions {
    display: inline-flex;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-mobile-row {
    display: flex;
    gap: 8px;
    flex: 1 1 100%;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-icon {
    display: block;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-input {
    height: auto;
    padding: 10px 150px 10px 36px;
    text-align: center;
  }

  .forum-page[data-anniversary-skin='active'] .toolbar-search-input.with-tag-chip {
    padding-left: 156px;
    text-align: left;
  }
}
</style>
