<template>
  <Teleport to="body">
    <aside
      v-if="visible"
      class="boh-sidebar"
      :class="{ 'is-open': open, 'is-standalone': standalone }"
      aria-label="会话列表"
    >
      <div class="boh-sb-head">
        <button
          type="button"
          class="boh-surface-switch"
          aria-haspopup="menu"
          :aria-expanded="surfaceMenuOpen"
          @click.stop="surfaceMenuOpen = !surfaceMenuOpen"
        >
          <BohLogo />
          <span>{{ surfaceLabel }}</span>
          <ChevronDown :size="14" aria-hidden="true" />
        </button>
        <span class="boh-sb-head-spacer"></span>
        <button
          type="button"
          class="boh-icon-btn"
          title="搜索会话"
          aria-label="搜索会话"
          @click="toggleSearch"
        >
          <Search :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="boh-icon-btn boh-sb-close"
          title="收起侧栏"
          aria-label="收起侧栏"
          @click="close"
        >
          <X :size="16" aria-hidden="true" />
        </button>

        <nav v-if="surfaceMenuOpen" class="boh-surface-menu" aria-label="大模式">
          <button
            v-for="option in SURFACE_OPTIONS"
            :key="option.id"
            type="button"
            class="boh-sm-item"
            :class="{ 'is-on': surface === option.id }"
            @click.stop="setSurface(option.id)"
          >
            <span>
              <b>{{ option.label }}</b>
              <small>{{ option.tagline }}</small>
            </span>
            <Check class="boh-sm-check" :size="15" aria-hidden="true" />
          </button>
        </nav>
      </div>

      <button type="button" class="boh-new-chat" @click="emit('new-chat')">
        <Plus :size="16" aria-hidden="true" />新对话
      </button>

      <label v-if="searchOpen" class="boh-sb-search">
        <Search :size="15" aria-hidden="true" />
        <input v-model="query" type="text" placeholder="搜索会话" @keydown.escape="closeSearch" />
      </label>

      <nav class="boh-sb-groups">
        <template v-for="group in filteredGroups" :key="group.id">
          <div class="boh-sb-glabel">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            :key="item.session.timestamp || item.index"
            class="boh-sb-item"
            :class="{ 'is-active': item.index === currentIndex }"
            :data-session-index="item.index"
            @click="selectSession(item.index)"
          >
            <Pin v-if="item.session.pinned" class="boh-sb-pin" :size="12" aria-hidden="true" />
            <input
              v-if="renamingIndex === item.index"
              ref="renameInput"
              v-model="renameValue"
              class="boh-sb-rename"
              maxlength="48"
              @click.stop
              @keydown.enter.stop="commitRename(item.index)"
              @keydown.escape.stop="cancelRename"
              @blur="commitRename(item.index)"
            />
            <span v-else class="boh-sb-title-wrap">
              <span class="boh-sb-title">{{ item.session.title || '新对话' }}</span>
              <small v-if="query && matchPreview(item.session)">{{
                matchPreview(item.session)
              }}</small>
            </span>
            <span v-if="item.session.temporary" class="boh-sb-badge">临时</span>
            <button
              v-if="renamingIndex !== item.index"
              type="button"
              class="boh-sb-more"
              title="更多操作"
              aria-label="更多操作"
              @click.stop="toggleMenu(item.index)"
            >
              <MoreHorizontal :size="15" aria-hidden="true" />
            </button>
            <div v-if="menuIndex === item.index" class="boh-sb-menu" @click.stop>
              <button type="button" @click="beginRename(item)">
                <Pencil :size="14" aria-hidden="true" />重命名
              </button>
              <button type="button" @click="togglePin(item.index)">
                <Pin :size="14" aria-hidden="true" />{{ item.session.pinned ? '取消置顶' : '置顶' }}
              </button>
              <button
                v-if="sessions.length > 1"
                type="button"
                class="is-danger"
                @click="requestDelete(item.index)"
              >
                <Trash2 :size="14" aria-hidden="true" />删除
              </button>
            </div>
          </div>
        </template>
        <div v-if="filteredGroups.length === 0" class="boh-sb-empty">没有匹配的对话</div>
      </nav>

      <!-- 左下角账号入口（2026-10-08 用户口径）：显示头像 + 名称，hover 或点击都弹出
           额度 / 订阅计划浮层（形态参考 WorkBuddy 的账号菜单）。
           原「设置」行与「今日额度」行一起收进浮层 —— 底部只留这一个入口，避免三行堆叠。 -->
      <div class="boh-sb-foot" @mouseenter="openAccountPop" @mouseleave="scheduleCloseAccountPop">
        <button
          type="button"
          class="boh-sb-foot-row boh-account-btn"
          :aria-expanded="accountPopOpen"
          aria-haspopup="dialog"
          aria-label="账号、额度与订阅"
          @click.stop="handleAccountClick"
        >
          <img
            v-if="account.avatarUrl"
            class="boh-account-avatar"
            :src="account.avatarUrl"
            alt=""
            aria-hidden="true"
          />
          <span v-else class="boh-account-avatar is-fallback" aria-hidden="true">
            {{ account.initial }}
          </span>
          <span class="boh-account-name">{{ account.name }}</span>
          <ChevronUp :size="15" aria-hidden="true" />
        </button>

        <div
          v-show="accountPopOpen"
          class="boh-account-pop"
          role="dialog"
          aria-label="账号、额度与订阅"
          @click.stop
        >
          <div class="boh-account-pop-head">
            <img
              v-if="account.avatarUrl"
              class="boh-account-avatar is-lg"
              :src="account.avatarUrl"
              alt=""
              aria-hidden="true"
            />
            <span v-else class="boh-account-avatar is-lg is-fallback" aria-hidden="true">
              {{ account.initial }}
            </span>
            <span class="boh-account-pop-id">
              <strong>{{ account.name }}</strong>
              <small>{{ plan.label || '未登录用户' }}</small>
            </span>
          </div>

          <!-- 额度：今日**剩余**（数据源与输入区用量圆钮、设置页用量卡同源，都由壳传入） -->
          <!-- 2026-10-08 用户口径第二版：主指标是剩余、尺子是「Plus = 100%」
               ⇒ Max 没消耗就显示 剩余 625%（不再显示那个恒为 100% 的「相对自己」口径）。
               进度条宽度走 meterPercent（已用 ÷ 总额）—— 直接把 625% 当 width 会撑破 track。 -->
          <div class="boh-account-quota">
            <div class="boh-account-quota-head" :title="quota ? quota.title : ''">
              <span>今日剩余</span>
              <b>{{ quota ? quota.remainingLabel : '—' }}</b>
            </div>
            <div class="boh-account-quota-track" aria-hidden="true">
              <i :style="{ width: `${quota ? quota.meterPercent : 0}%` }"></i>
            </div>
            <p class="boh-account-quota-foot">{{ quota ? quota.detail : '暂无用量数据' }}</p>
          </div>

          <div class="boh-account-plan-row">
            <span class="boh-account-plan-label">订阅计划</span>
            <strong>{{ plan.label || '未登录用户' }}</strong>
          </div>

          <div class="boh-account-actions">
            <button type="button" class="is-primary" @click.stop="emit('upgrade')">升级套餐</button>
            <button type="button" @click.stop="emit('open-settings')">
              <Settings :size="14" aria-hidden="true" />设置
            </button>
          </div>
        </div>
      </div>
    </aside>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  Check,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-vue-next';
import BohLogo from './BohLogo.vue';

/**
 * BohSidebar.vue — 会话侧栏（plans/025 v2 · Step 6-2）
 *
 * 口径真源：`output/boh-ui-demo/index.html` 的 `.boh-sidebar` 区块 + `docs/DESIGN-BOHAI.md`
 * §4（布局矩阵）/ §5（`Boh*` 命名契约）/ §7.1（形态切换器）/ §9 #2（Teleport + 杠杆）。
 *
 * 能力全部沿用旧 `BohaiSidebar.vue`（搜索 / 新对话 / 临时对话 / 分组 / 置顶 / 重命名 /
 * 删除 / 设置入口），**只重绘视觉**，并新增两件 Demo 要求的东西：
 *   · 左上角 **大模式切换器**（Chat / Work，Codex 式）；
 *   · 底部 **今日额度**（与设置面板「用量」卡同源，由壳传入）。
 *
 * ⚠️ 两条契约（不许改）：
 *   1. **Teleport 到 body** —— 它的 `left` 由 `var(--bohai-sidebar-left)` 驱动
 *      （只有 `body.page-aichat` 在横屏 ≥1024×600 置位为 88px，见 `landscape-rail.css`）。
 *      **改既有值，不新增第二处**（DESIGN §9 #2）。
 *   2. **旧类名不做迁移** —— 旧 `.sidebar` / `.session-item` 一族随旧 DOM 一起死。
 *
 * ⚠️ 断点与基座同文件（`components/styles/boh-sidebar.css`）—— 理由见 `styles/layout.css` 头。
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  sessions: { type: Array, default: () => [] },
  currentIndex: { type: Number, default: 0 },
  standalone: { type: Boolean, default: false },
  /**
   * 宿主是否可见。侧栏 **Teleport 到 body** ⇒ 父容器 `display:none` 管不到它，
   * 必须由壳把「页面根元素有高度」的结果传进来，否则切走的 tab 上会浮着一条侧栏。
   */
  visible: { type: Boolean, default: true },
  /** 大模式（Chat / Work） */
  surface: { type: String, default: 'chat' },
  /** 今日额度展示：`{ used, limit, percent, title }`；不传则浮层里显示「暂无用量数据」 */
  quota: { type: Object, default: null },
  /** 左下角账号：`{ name, avatarUrl, initial }` —— 由壳从 auth store 取，本组件不发网络请求 */
  account: { type: Object, default: () => ({ name: '', avatarUrl: '', initial: '' }) },
  /** 订阅计划文案：`{ tier, label, isFree }` —— 由壳解析（含未登录的 guest 档） */
  plan: { type: Object, default: () => ({ tier: '', label: '', isFree: true }) },
});

const emit = defineEmits([
  'update:open',
  'new-chat',
  'switch-session',
  'delete-session',
  'rename-session',
  'toggle-pin',
  'open-settings',
  'upgrade',
  'update:surface',
]);

const SURFACE_OPTIONS = [
  { id: 'chat', label: 'Chat', tagline: '创作、学习与探索' },
  { id: 'work', label: 'Work', tagline: '构建、交付与执行' },
];

const surfaceLabel = computed(
  () => SURFACE_OPTIONS.find((option) => option.id === props.surface)?.label || 'Chat',
);

const surfaceMenuOpen = ref(false);
const searchOpen = ref(false);
const query = ref('');
const menuIndex = ref(null);
const renamingIndex = ref(null);
const renameValue = ref('');
const renameInput = ref(null);

const close = () => emit('update:open', false);

const setSurface = (id) => {
  surfaceMenuOpen.value = false;
  if (id !== props.surface) emit('update:surface', id);
};

const toggleSearch = () => {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) query.value = '';
};

const closeSearch = () => {
  searchOpen.value = false;
  query.value = '';
};

const selectSession = (index) => {
  emit('switch-session', index);
  if (props.standalone && typeof window !== 'undefined' && window.innerWidth < 1024) {
    close();
  }
};

const toggleMenu = (index) => {
  menuIndex.value = menuIndex.value === index ? null : index;
};

const togglePin = (index) => {
  menuIndex.value = null;
  emit('toggle-pin', index);
};

const requestDelete = (index) => {
  menuIndex.value = null;
  emit('delete-session', index);
};

const beginRename = (item) => {
  menuIndex.value = null;
  renamingIndex.value = item.index;
  renameValue.value = String(item.session?.title || '新对话');
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
    el?.focus?.();
    el?.select?.();
  });
};

const cancelRename = () => {
  renamingIndex.value = null;
  renameValue.value = '';
};

const commitRename = (index) => {
  if (renamingIndex.value !== index) return;
  const title = renameValue.value.trim();
  if (title) emit('rename-session', { index, title });
  cancelRename();
};

// ── 会话分组（口径沿用旧实现：置顶 / 今天 / 昨天 / 本周 / 本月 / 更早） ──
const getSessionGroupId = (timestamp) => {
  const value = Number(timestamp || Date.now());
  const date = Number.isFinite(value) ? new Date(value) : new Date();
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.floor((startOfToday - startOfTarget) / 86400000);

  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return 'thisWeek';
  if (dayDiff < 30) return 'thisMonth';
  return 'earlier';
};

const groupedSessions = computed(() => {
  const groups = [
    { id: 'pinned', label: '置顶', items: [] },
    { id: 'today', label: '今天', items: [] },
    { id: 'yesterday', label: '昨天', items: [] },
    { id: 'thisWeek', label: '本周', items: [] },
    { id: 'thisMonth', label: '本月', items: [] },
    { id: 'earlier', label: '更早', items: [] },
  ];
  const groupMap = Object.fromEntries(groups.map((group) => [group.id, group]));
  props.sessions.forEach((session, index) => {
    const group = session?.pinned
      ? groupMap.pinned
      : groupMap[getSessionGroupId(session?.timestamp)] || groupMap.earlier;
    group.items.push({ session, index });
  });
  groups.forEach((group) =>
    group.items.sort(
      (a, b) => Number(Boolean(b.session?.pinned)) - Number(Boolean(a.session?.pinned)),
    ),
  );
  return groups.filter((group) => group.items.length > 0);
});

const filteredGroups = computed(() => {
  const keyword = String(query.value || '')
    .trim()
    .toLowerCase();
  if (!keyword) return groupedSessions.value;
  return groupedSessions.value
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const title = String(item.session?.title || '').toLowerCase();
        if (title.includes(keyword)) return true;
        const messages = Array.isArray(item.session?.messages) ? item.session.messages : [];
        return messages.some((message) =>
          String(message?.content || message?.text || '')
            .toLowerCase()
            .includes(keyword),
        );
      }),
    }))
    .filter((group) => group.items.length > 0);
});

const matchPreview = (session) => {
  const keyword = String(query.value || '')
    .trim()
    .toLowerCase();
  if (!keyword) return '';
  const matched = (Array.isArray(session?.messages) ? session.messages : []).find((message) =>
    String(message?.content || '')
      .toLowerCase()
      .includes(keyword),
  );
  return String(matched?.content || '')
    .replace(/\s+/g, ' ')
    .slice(0, 62);
};

/* 会话切换 / 侧栏开合时，关掉临时的浮层状态 */
watch([() => props.currentIndex, () => props.open], () => {
  menuIndex.value = null;
  surfaceMenuOpen.value = false;
});

/* 侧栏收起（移动端）时，把重命名与搜索一起收掉，避免下次打开残留 */
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      cancelRename();
      closeSearch();
    }
  },
);

/* ── 左下角账号浮层（hover 打开 + 点击切换）──
   与输入区用量浮层同一套手感：鼠标离开延迟 180ms 再关，给「抖出边界又抖回来」留余量。
   ⚠️ 触发按钮与浮层本体的 click 都 stopPropagation（模板里已加）：否则同一次点击会先 toggle、
   再被下面的 document 监听关掉 —— 表现是「点了没反应」。 */
const accountPopOpen = ref(false);
let accountPopCloseTimer = null;

const openAccountPop = () => {
  if (accountPopCloseTimer) {
    clearTimeout(accountPopCloseTimer);
    accountPopCloseTimer = null;
  }
  accountPopOpen.value = true;
};

const scheduleCloseAccountPop = () => {
  if (accountPopCloseTimer) clearTimeout(accountPopCloseTimer);
  accountPopCloseTimer = setTimeout(() => {
    accountPopCloseTimer = null;
    accountPopOpen.value = false;
  }, 180);
};

/* ⚠️ 点击的语义是「打开并保持」，**不是 toggle**。
   2026-10-08 实测踩到：鼠标要点到按钮，必然先经过一次 hover，而那已经把浮层打开了；
   再翻转一次就变成「点一下反而关掉」，看起来像按钮坏了。
   所以关闭只走三条路：移开（延迟）、点外部、Esc。 */
const handleAccountClick = () => {
  if (accountPopCloseTimer) {
    clearTimeout(accountPopCloseTimer);
    accountPopCloseTimer = null;
  }
  accountPopOpen.value = true;
};

const onDocKeydown = (event) => {
  if (event.key === 'Escape' && accountPopOpen.value) accountPopOpen.value = false;
};

/* 外点关闭浮层：挂在 document 上（面板是 Teleport 到 body 的，组件根不是共同祖先） */
const onDocumentClick = () => {
  surfaceMenuOpen.value = false;
  menuIndex.value = null;
  accountPopOpen.value = false;
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocKeydown);
  if (accountPopCloseTimer) clearTimeout(accountPopCloseTimer);
});
</script>

<style scoped src="./styles/boh-sidebar.css"></style>
