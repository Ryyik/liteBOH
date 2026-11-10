<template>
  <div
    key="profile-settings"
    class="profile-subpage-shell"
    :style="{ '--userspace-nav-h': navTopOffset + 'px', paddingTop: navTopOffset + 'px' }"
  >
    <!-- 页头（2026-11-10 层级定稿：一级组 → 二级组页 → 三级表单）：
         一级首页才有「设置」标题 + 大返回 + 搜索；往下每一层只有一个返回条。 -->
    <!-- 页头只在一级首页出现（2026-11-10 用户口径）：二级 / 三级页不显示「设置」标题、
         大返回与搜索 —— 子页的返回交给它们自己的返回条（.gs-inline-bar）。 -->
    <!-- 页头用过渡收起（2026-11-10：「点进二级页整页会顿一下再上移」——
         原来 v-if 一刀切掉 76px 高的页头，内容瞬间上跳。现在高度/透明度一起过渡）。 -->
    <Transition name="gs-header-collapse">
      <UserCenterPageHeader
        v-if="isHome"
        title="设置"
        max-width="1200px"
        :show-back="showBack"
        @back="handleBack"
      />
    </Transition>

    <div class="profile-subpage-body">
      <HomeCatMascot
        v-if="isHomeCatActive"
        class="settings-page-cat"
        pool="background"
        seed="settings-page"
        size="lg"
        decorative
      />

      <div ref="panelRootRef" class="glass-settings" :class="{ 'is-two-pane': twoPane }">
        <!-- 左栏：桌面 = 一级组目录（与手机首页同源，都是 GROUPS）；
             手机 = 只在首页出现搜索框（二级 / 三级页不带搜索，见下方 isHome）。 -->
        <div v-if="twoPane || isHome" class="gs-aside">
          <div v-if="isHome" class="gs-search" role="search">
            <span class="gs-search-icon"
              ><Search :size="16" :stroke-width="2" aria-hidden="true"
            /></span>
            <input
              v-model="searchQuery"
              class="gs-search-input"
              type="text"
              inputmode="search"
              enterkeyhint="search"
              autocomplete="off"
              placeholder="搜索设置"
              aria-label="搜索设置"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="gs-search-clear"
              aria-label="清除搜索"
              @click="searchQuery = ''"
            >
              <X :size="15" :stroke-width="2.4" aria-hidden="true" />
            </button>
          </div>

          <nav v-if="twoPane" class="gs-nav" aria-label="设置目录">
            <!-- 账户行：头像 + 昵称 + 邮箱，点它右栏回到「概览」（身份卡） -->
            <button
              type="button"
              class="gs-nav-account"
              :class="{ active: !railActiveId }"
              :aria-current="!railActiveId ? 'page' : undefined"
              @click="showOverview"
            >
              <FramedAvatar
                class="gs-nav-avatar"
                :src="avatarUrl"
                :initial="avatarInitial"
                :size="34"
                :frame-url="frameUrl"
                :frame-scale="frameScale"
              />
              <span class="gs-nav-text">
                <span class="gs-nav-name">{{ username || '未设置昵称' }}</span>
                <span class="gs-nav-sub">{{ userEmail || '未绑定邮箱' }}</span>
              </span>
            </button>

            <button
              v-for="entry in groupEntries"
              :key="entry.id"
              type="button"
              class="gs-nav-item"
              :class="{ active: railActiveId === entry.id }"
              :aria-current="railActiveId === entry.id ? 'page' : undefined"
              @click="onRowClick(entry)"
            >
              <component :is="entry.icon" :size="17" :stroke-width="1.9" aria-hidden="true" />
              <span class="gs-nav-label">{{ entry.label }}</span>
            </button>

            <div class="gs-nav-sep" aria-hidden="true"></div>
            <button type="button" class="gs-nav-item is-danger" @click="onRowClick(logoutEntry)">
              <LogOut :size="16" :stroke-width="1.9" aria-hidden="true" />
              <span class="gs-nav-label">退出登录</span>
            </button>
          </nav>
        </div>

        <div class="gs-main" :class="'is-direction-' + paneDirection">
          <!-- ①「个人信息」就地展开（宿主经 #inline-edit 插槽塞进来，左栏不动） -->
          <template v-if="editOpen && !isSearching">
            <slot name="inline-edit"></slot>
          </template>

          <!-- ② 右栏子页：导出 / 数据与隐私 / 账户安全表单（宿主经 #inline-panel 塞进来） -->
          <template v-else-if="inlinePanel">
            <div class="gs-inline-bar">
              <button type="button" class="gs-inline-back" @click="$emit('close-panel')">
                <ChevronLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
                <span>设置</span>
              </button>
              <h2 class="gs-inline-title">{{ inlinePanelTitle }}</h2>
            </div>
            <slot name="inline-panel"></slot>
          </template>

          <!-- ③ 列表 / 详情。左侧内容全部由 catalog 驱动，行样式只有这一处。 -->
          <template v-else>
            <!-- 二级页（如「密码与通行密钥」）与开关详情共用同一条返回条 -->
            <div v-if="activeEntry" class="gs-inline-bar">
              <button type="button" class="gs-inline-back" @click="showOverview">
                <ChevronLeft :size="17" :stroke-width="2.2" aria-hidden="true" />
                <span>设置</span>
              </button>
              <h2 class="gs-inline-title">{{ activeEntry.label }}</h2>
            </div>

            <!-- 身份卡：手机首页顶部（桌面「概览」也是它） -->
            <section v-if="!activeEntry" class="gs-identity" aria-label="个人账户">
              <div class="gs-id-hero">
                <button
                  type="button"
                  class="gs-id-avatar"
                  :aria-label="`更换头像（当前头像框：${frameDisplayName}）`"
                  @click="$emit('change-avatar')"
                >
                  <FramedAvatar
                    :src="avatarUrl"
                    :initial="avatarInitial"
                    :size="96"
                    :frame-url="frameUrl"
                    :frame-scale="frameScale"
                  />
                  <span class="gs-id-camera" aria-hidden="true">
                    <Camera :size="13" :stroke-width="2.6" />
                  </span>
                </button>
                <h2 class="gs-id-name">{{ username || '未设置昵称' }}</h2>
                <p v-if="bio" class="gs-id-bio">{{ bio }}</p>
                <button
                  v-if="userEmail"
                  type="button"
                  class="gs-id-sub gs-id-email"
                  :aria-label="`复制邮箱 ${userEmail}`"
                  :title="emailCopied ? '已复制' : '点击复制邮箱'"
                  @click="copyEmail"
                >
                  <span class="gs-id-email-text">{{ emailCopied ? '已复制' : userEmail }}</span>
                  <Check v-if="emailCopied" :size="12" :stroke-width="2.6" aria-hidden="true" />
                  <Copy v-else :size="12" :stroke-width="2" aria-hidden="true" />
                </button>
                <p v-else class="gs-id-sub">未绑定邮箱</p>
              </div>
            </section>

            <!-- 分组列表（首页 / 二级页 / 搜索结果共用同一段行渲染） -->
            <section
              v-for="group in renderedGroups"
              :key="group.id"
              class="gs-group"
              :class="{ 'gs-danger': group.danger }"
            >
              <div v-if="group.label" class="gs-group-title">{{ group.label }}</div>
              <div class="gs-rows">
                <template v-for="item in group.rows" :key="item.uid">
                  <p v-if="item.note" class="gs-mail-example">{{ item.note }}</p>
                  <button
                    v-else
                    type="button"
                    class="gs-row"
                    :class="{ 'is-static': item.static, 'gs-mail-freq-option': item.option }"
                    @click="onRowClick(item)"
                  >
                    <span class="gs-icon" :class="item.iconClass">
                      <component :is="item.icon" :size="16" :stroke-width="2" aria-hidden="true" />
                    </span>
                    <span class="gs-text">
                      <span class="gs-label" :class="{ 'gs-label-danger': item.danger }">{{
                        item.label
                      }}</span>
                      <span v-if="item.desc" class="gs-desc">{{ item.desc }}</span>
                    </span>
                    <span class="gs-side">
                      <SettingToggle
                        v-if="item.kind === 'toggle'"
                        :model-value="!!item.on"
                        :label="item.label"
                        @update:model-value="onRowClick(item)"
                      />
                      <template v-else-if="!item.static && !item.option">
                        <span v-if="item.value" class="gs-value">{{ item.value }}</span>
                        <ChevronRight
                          class="gs-chevron"
                          :class="{
                            'is-expanded': item.expanded,
                            'gs-chevron-danger': item.danger,
                          }"
                          :size="16"
                          :stroke-width="2"
                          aria-hidden="true"
                        />
                      </template>
                      <span v-else-if="item.badge" class="gs-badge-max">{{ item.badge }}</span>
                    </span>
                  </button>
                </template>
              </div>
            </section>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  Archive,
  Bell,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Database,
  EyeOff,
  Fingerprint,
  Images,
  Inbox,
  Info,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  MessagesSquare,
  Moon,
  RotateCcw,
  Search,
  SearchX,
  Settings,
  Shield,
  Sparkles,
  Sun,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-vue-next';
import { isPasskeySupported } from '@/utils/api/auth-api.js';

/* 重播首屏开场画（2026-09-24）：清除「已看过」标记并整页回首页。
   ⚠️ 标记 key 带构建指纹（boh-home-gate-passed:<build-id>，生产构建注入），必须前缀匹配清除；
   2026-09-24 晚：标记迁到 localStorage（24h 时间窗），同时兜底清一遍 sessionStorage 旧值；
   必须用 location.reload 而不是路由跳转 —— Home 组件要重新挂载才会重播开场画。 */
const replayHomeGate = () => {
  const collectPrefixKeys = (storage) => {
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith('boh-home-gate-passed')) keys.push(key);
      }
    } catch {
      /* ignore */
    }
    return keys;
  };
  try {
    collectPrefixKeys(localStorage).forEach((key) => localStorage.removeItem(key));
    collectPrefixKeys(sessionStorage).forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* storage 不可用时忽略 —— reload 后开场画由既有降级链决定 */
  }
  window.location.hash = '#/';
  window.location.reload();
};
import SettingToggle from './SettingToggle.vue';
import FramedAvatar from './FramedAvatar.vue';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';

const props = defineProps({
  showBack: {
    type: Boolean,
    default: true,
  },
  userEmail: {
    type: String,
    default: '',
  },
  cloudPlusUsageText: {
    type: String,
    default: '',
  },
  subscriptionSummaryText: {
    type: String,
    default: '',
  },
  dataPrivacyStatusText: {
    type: String,
    default: '',
  },
  themeDisplayText: {
    type: String,
    default: '',
  },
  isHomeCatActive: {
    type: Boolean,
    default: false,
  },
  currentTheme: {
    type: String,
    default: '',
  },
  hideOnlineStatus: {
    type: Boolean,
    default: false,
  },
  hideFollowData: {
    type: Boolean,
    default: false,
  },
  /**
   * 「关注的人邮件通知」开关状态（2026-10-29）。
   * 真源是 profiles.follow_mail_enabled，读写都在宿主（UserSpaceMain）——
   * 本组件是纯展示 + 转发 emit，不自己发请求，与 hideOnlineStatus 同一模式。
   * 默认 false：数据库默认也是 false，未登录 / 读失败时显示「关」是安全的一侧。
   */
  followMailEnabled: {
    type: Boolean,
    default: false,
  },
  /**
   * 去重窗口（分钟）：15 = 实时（Max+ Only），60 = 标准。真源 profiles.follow_mail_window_minutes，
   * 写入只经 boh_set_follow_mail_window RPC（服务端做 Max+ 校验），本组件只展示与转发。
   */
  followMailWindow: {
    type: Number,
    default: 60,
  },
  /** 当前用户是否有实时档权益（max/ultra 订阅且未过期）。判定在服务端 RPC，前端只消费。 */
  followMailCanRealtime: {
    type: Boolean,
    default: false,
  },
  /** 投递方式：false = 及时与摘要（首条即时 + 窗口末汇总一封），true = 减少干扰（只有摘要）。 */
  followMailDigest: {
    type: Boolean,
    default: false,
  },
  /**
   * 横屏两栏（2026-10-26）：宿主判定「横屏且够宽」才置 true。
   * 断点判断只放在 UserSpaceMain 一处（它同时负责把左栏切到缩小态），
   * 本组件只认结果 —— 组件内不再写第二份 matchMedia。
   */
  twoPane: {
    type: Boolean,
    default: false,
  },
  /* ── 身份卡（2026-10-26）── */
  avatarUrl: {
    type: String,
    default: '',
  },
  username: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    default: '',
  },
  /**
   * 个人信息是否在右栏就地展开（2026-10-26）。
   * 宿主把 EditProfilePanel 通过 #inline-edit 插槽塞进来 —— 表单状态（editProfileForm）
   * 留在宿主，面板只负责「右栏换内容、左目录不动」这件事，
   * 不为转发十几个字段再造一层 props 通道。
   */
  editOpen: {
    type: Boolean,
    default: false,
  },
  /**
   * 右栏子页（2026-10-26）：非空时右栏从「分组列表」换成 `#inline-panel` 插槽内容。
   * 值只用于判断「有没有子页」，具体画什么由宿主决定 —— 本组件不认识数据导出/账户安全。
   * 传进来的取值：'' | 'data-export' | 'data-management' | 'account-security'
   */
  inlinePanel: {
    type: String,
    default: '',
  },
  /** 子页标题（右栏返回条右侧） */
  inlinePanelTitle: {
    type: String,
    default: '',
  },
});

const emit = defineEmits([
  'back',
  'open-theme',
  'open-cloud',
  /** 2026-10-26：资产 / 摄影集从主页收进设置后，这里多了两个出口 */
  'open-assets',
  /** 2026-11-02：收货地址从资产页搬进设置（礼物与实物订单都用这份） */
  'open-address',
  'open-photo-albums',
  /** 2026-10-26 身份卡：换头像（文件选择 + 裁剪）、头像框试戴、更多资料（入群时间/生日） */
  'change-avatar',
  'open-avatar-frames',
  'open-edit-profile',
  /** 右栏编辑态收起（切分类 / 开搜索 / 点返回时各触发一次） */
  'close-edit',
  /** 右栏子页收起（同一批触发点，回到分组列表） */
  'close-panel',
  'open-notification-settings',
  /** 2026-10-26：带面板 id（email / password / passkey / delete），宿主拼成 ?panel= 直落表单 */
  'open-security',
  'open-version-settings',
  'open-data',
  'open-data-management',
  'open-data-export',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data',
  /** 2026-10-29：关注的人邮件通知开关（真源 profiles.follow_mail_enabled，读写留在宿主） */
  'toggle-follow-mail',
  /** 2026-10-29：选择去重窗口（15 = 实时 Max+，60 = 标准）。权益校验在服务端 RPC。 */
  'choose-mail-window',
  /** 2026-10-29 引入、2026-11-01 改名：选择投递方式（false = 及时与摘要，true = 减少干扰）。无权益门槛。 */
  'choose-mail-digest',
]);

/* ---------- 身份卡（2026-10-26 Apple 账户页形态） ----------
   头像走 FramedAvatar（与编辑资料页、论坛作者头像同一渲染件，框的缩放口径单一）；
   佩戴态读 useAvatarFrame 的模块级单例 —— 弹层里换完框这里即时变，不需要宿主再传。 */
const { effectiveFrame } = useAvatarFrame();
const frameUrl = computed(() => effectiveFrame.value?.url || '');
const frameScale = computed(() => effectiveFrame.value?.scale || 0);
const frameDisplayName = computed(() => effectiveFrame.value?.name || '无框');
const avatarInitial = computed(() =>
  String(props.username || 'U')
    .charAt(0)
    .toUpperCase(),
);

/* ---------- 通行密钥（Passkey）能力检测 ----------
   与 AccountSecurity 菜单同一判定：不支持 WebAuthn 的浏览器不出现「通行密钥」这一行，
   否则点进去只剩一个注定失败的「添加」按钮。异步检测，抛错一律按不支持处理。 */
const passkeySupported = ref(false);
onMounted(async () => {
  try {
    passkeySupported.value = (await isPasskeySupported()) === true;
  } catch {
    passkeySupported.value = false;
  }
});

/* ---------- 设置目录（2026-11-10 平铺改版） ----------
   用户口径：「不要再做选项分组了，直接拼起来」「功能是一个组的可以聚合起来点进去是三级页面」
   「桌面左栏直接装总体的大目录」。

   于是本页只剩一层列表：组头是**视觉分段**（不可点、不承载任何设置），条目就是设置本身。
   唯一保留聚合的是「密码与通行密钥」—— 改密码 / 通行密钥各自是独立表单页，合一行点进去再选，
   正好是用户说的「三级页面」（首页 → 聚合页 → 表单）。

   ⚠️ GROUPS 的顺序就是首页与桌面左栏的来源顺序，改这里两处同时变（单一真源）。 */
const GROUPS = [
  {
    id: 'profile',
    label: '个人信息',
    desc: '昵称、简介、头像与头像框',
    icon: UserRound,
    iconClass: 'is-blue',
  },
  {
    id: 'security',
    label: '账户与安全',
    desc: '登录邮箱、密码、通行密钥与可见性',
    icon: Shield,
    iconClass: 'is-indigo',
  },
  {
    id: 'data',
    label: '数据',
    desc: '公共记忆、管理工具与数据导出',
    icon: Database,
    iconClass: 'is-teal',
  },
  {
    id: 'notify',
    label: '通知',
    desc: '应用内推送、邮件通知与提醒频率',
    icon: Bell,
    iconClass: 'is-green',
  },
  {
    id: 'storage',
    label: '内容与存储',
    desc: '资产、收货地址、摄影集与 Cloud+',
    icon: Wallet,
    iconClass: 'is-yellow',
  },
  {
    id: 'general',
    label: '通用',
    desc: '主题、首屏开场画与版本信息',
    icon: Settings,
    iconClass: 'is-blue',
  },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((group) => [group.id, group.label]));

/** 当前打开的二级页 / 详情（'' = 首页；桌面下 = 右栏「概览」） */
const activeEntryId = ref('');
/** 进入 = forward（新内容从右滑入），返回 = back（从左滑回）—— iOS push/pop 的方向记忆 */
const paneDirection = ref('forward');
const panelRootRef = ref(null);

/* 切页 / 返回时把滚动位置归零。
   不重置的话，从列表中部点进二级页会停在半空 —— 这是「点进去很突兀」的一半原因
   （另一半是没有过渡动效，见 style 段的 gsPaneIn）。 */
const resetPaneScroll = () => {
  requestAnimationFrame(() => {
    const root = panelRootRef.value;
    if (!root) return;
    // 滚动容器是宿主的 .tab-page（不是 window），所以优先找它
    const scroller = root.closest('.tab-page');
    if (scroller && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    root.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  });
};

/* ---------- 邮件通知提醒频率（2026-10-29） ----------
   15 = 实时（同一人 15 分钟内合并成一封，Max+ Only 订阅权益），60 = 标准（1 小时）。
   选项点击只 emit，权益校验在服务端 RPC（boh_set_follow_mail_window），
   无权益时宿主会弹订阅引导 —— 面板不自己判权益（user_subscriptions 不归它管）。
   文案用词（2026-11-01 定稿）：面向用户说「周期 / 合并」，**不写「窗口」** ——
   窗口是库内 dedupe_key 的分桶实现，用户看不到也不需要知道；「周期」足够正式且不晦涩。 */
const MAIL_WINDOW_OPTIONS = [
  { value: 15, label: '实时提醒', desc: '15 分钟一个周期，合并为一封', maxOnly: true },
  { value: 60, label: '标准提醒', desc: '1 小时一个周期，合并为一封', maxOnly: false },
];
const mailWindowLabel = computed(() => (props.followMailWindow === 15 ? '15 分钟' : '1 小时'));

/* 投递方式（2026-11-01 改名 + 语义修正）：
   「及时与摘要」（默认）= 首条立刻发，同一周期其余动作在周期结束时合并成一封（一条都不丢）；
   「减少干扰」= 周期内全部动作只发一封，周期结束才发。
   ⚠️ 旧文案「及时通知 / 首条动作立刻发送，其余动作不重复提醒」是**说少了一半** ——
   旧实现里「其余」既不合并也不延迟，而是直接丢弃。别把文案改回去。无权益门槛。
   ⚠️ 展开区末尾的「示例」行是这组文案的锚点：去掉它，「周期 / 合并 / 即时」又变回抽象词。 */
const MAIL_DIGEST_OPTIONS = [
  { value: false, label: '及时与摘要', desc: '首条即时送达，其余在周期结束时合并为一封' },
  { value: true, label: '减少干扰', desc: '周期内不即时发送，仅在周期结束时送达一封' },
];
const mailDigestLabel = computed(() => (props.followMailDigest ? '减少干扰' : '及时与摘要'));
const mailExpandedGroup = ref('');
const toggleMailExpanded = (group) => {
  mailExpandedGroup.value = mailExpandedGroup.value === group ? '' : group;
};

/* 顶部留白必须跟着「导航岛在不在」走（2026-11-10 用户报障「顶部空隙过大」）。
   实测：`?tab=settings` 有 #unified-nav-container（78px），
   而 `?tab=settings&view=account-security` 这类子页里导航岛整个不渲染 ⇒ 固定写死 78px
   就白留一道 78px 空档，内容被压到屏幕中段。
   所以这里实测一次、并在子页开关时重测；同时把 --userspace-nav-h 覆写成实测值，
   让 sticky 返回条 / 左栏吸附也停到正确位置。 */
const navTopOffset = ref(78);
const syncNavTopOffset = () => {
  /* 设置子页（?view=…）一律隐藏导航岛 ⇒ 留白必须是 0，别再拿 DOM 去"校准"：
     实测时序是「点击瞬间岛还在」→ 校准会把乐观归零又写回 78px，正是那一下上跳。 */
  if (props.inlinePanel || props.editOpen) {
    navTopOffset.value = 0;
    return;
  }
  const el = document.getElementById('unified-nav-container');
  if (!el) {
    navTopOffset.value = 0;
    return;
  }
  const h = Math.round(el.getBoundingClientRect().height);
  const minH = Math.round(Number.parseFloat(getComputedStyle(el).minHeight) || 0);
  navTopOffset.value = minH > 0 ? Math.min(h, minH) : h;
};
/* ⚠️ 只靠 prop 变化时测一次不够：导航岛是**路由切换后**才被卸载的（实测 L3 点击瞬间
   还有岛，下一帧才没），rAF 抢在它前面就测到旧高度。所以两条腿：
   ① 监听 body 下的增删（岛的挂载/卸载都会触发），② 再用 rAF 补一次同步。 */
let navIslandObserver = null;
const resyncNavTopOffset = () => {
  requestAnimationFrame(() => {
    syncNavTopOffset();
    requestAnimationFrame(syncNavTopOffset);
  });
};
watch(
  [() => props.inlinePanel, () => props.editOpen],
  ([panel, edit]) => {
    /* 乐观归零（2026-11-10 报障「点进二级/三级页会顿一下再上移」）：
       设置子页（?view=…）一定隐藏导航岛，所以**先**把留白设成 0，再实测校准。
       原来只靠实测 ⇒ 先按 78px 画一帧、岛卸载后再跳成 0，视觉上就是内容整体上跳一下。 */
    if (panel || edit) navTopOffset.value = 0;
    resyncNavTopOffset();
  },
  { immediate: true },
);
onMounted(() => {
  syncNavTopOffset();
  window.addEventListener('resize', syncNavTopOffset, { passive: true });
  if (typeof MutationObserver !== 'undefined') {
    navIslandObserver = new MutationObserver(syncNavTopOffset);
    /* subtree 必须为 true：岛不在 body 的直接子层，挂在中间容器里 */
    navIslandObserver.observe(document.body, { childList: true, subtree: true });
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncNavTopOffset);
  navIslandObserver?.disconnect();
  navIslandObserver = null;
});

/* 横竖切换时清掉选中态：竖屏没有「右栏详情」，留着会在转回横屏时莫名其妙地打开一项 */
watch(
  () => props.twoPane,
  () => {
    activeEntryId.value = '';
  },
);

/* ---------- 绑定邮箱（点击复制） ---------- */
const emailCopied = ref(false);
let emailCopyTimer = null;

const emailDisplayText = computed(() => {
  if (emailCopied.value) return '已复制';
  return props.userEmail || '未绑定';
});

const copyEmail = async () => {
  const email = String(props.userEmail || '').trim();
  if (!email) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(email);
    } else {
      const ta = document.createElement('textarea');
      ta.value = email;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    emailCopied.value = true;
    clearTimeout(emailCopyTimer);
    emailCopyTimer = setTimeout(() => {
      emailCopied.value = false;
    }, 1600);
  } catch (_error) {
    /* 复制失败静默：邮箱仍完整展示在值区 */
  }
};

/* ---------- 设置搜索（2026-09-30） ----------
   索引 = 本页所有行 + 各子页入口，命中后直接执行该行动作（等于跳转/切换），
   与 iOS 设置搜索同思路：搜到就能去，不必先找分组。
   ⚠️ 新增设置项时必须同步补一条，否则它搜不到 —— 这里是搜索的唯一真源。 */
const MAIL_DIGEST_NOTE =
  '示例：对方连续发送 3 条——「及时与摘要」收到 2 封（1 封即时送达，1 封周期末合并）；「减少干扰」收到 1 封（周期末送达）。';

/* ---------- 设置目录条目（单一真源） ----------
   首页列表、桌面左栏、设置搜索**都读这一份**。以前搜索索引（SETTINGS_ENTRIES）与模板里手写的行
   是两处，新增一项必须两边都改，漏一处就是「搜不到」。现在只有这里。

   kind 语义：
     · 'toggle' 开关行 —— 手机点整行即切换；桌面右栏出一张带大开关的详情
     · 'choice' 选项行 —— 手机就地展开选项；桌面右栏出选项详情
     · 'group'  聚合行 —— 点进去是这一组条目（三级页面：列表 → 聚合页 → 表单）
     · 其它     普通行，run() 直接执行（跳页 / 弹层 / 打开右栏表单）

   parent   = 挂在某个聚合行下面（不在首页与左栏出现，但参与搜索）
   searchOnly = 只进搜索结果（如「复制邮箱」，它是身份卡上的动作，不是一条设置） */
const catalog = computed(() => {
  const entries = [
    /* ── 个人信息 ── */
    {
      id: 'profile-edit',
      group: 'profile',
      label: '个人信息',
      desc: '昵称、简介与生日',
      keywords: '个人信息 资料 昵称 名字 简介 签名 生日 编辑 profile name bio',
      icon: UserRound,
      iconClass: 'is-blue',
      value: '昵称 · 简介 · 生日',
      run: () => emit('open-edit-profile'),
    },
    {
      id: 'avatar',
      group: 'profile',
      label: '头像',
      desc: '换一张照片，或从影集里挑',
      keywords: '头像 照片 图片 上传 更换 裁剪 avatar photo',
      icon: Camera,
      iconClass: 'is-teal',
      value: '更换照片',
      run: () => emit('change-avatar'),
    },
    {
      id: 'avatar-frame',
      group: 'profile',
      label: '头像框',
      desc: '挑一枚挂在头像上',
      keywords: '头像框 装饰 框 frame 挂件 装扮',
      icon: Sparkles,
      iconClass: 'is-purple',
      value: frameDisplayName.value,
      run: () => emit('open-avatar-frames'),
    },

    /* ── 账户与安全 ── */
    {
      id: 'login-email',
      group: 'security',
      label: '登录邮箱',
      desc: '登录与找回密码，点击更换',
      keywords: '更换 邮箱 邮件 email 换绑 改邮箱 登录 找回密码 账号 账户安全',
      icon: Mail,
      iconClass: 'is-blue',
      run: () => emit('open-security', 'email'),
    },
    {
      id: 'password',
      group: 'security',
      label: '修改密码',
      desc: '输入当前密码并设置新密码，更新登录凭证',
      keywords: '修改密码 改密 重设密码 密码 password 登录 安全 账户安全',
      icon: KeyRound,
      iconClass: 'is-blue',
      run: () => emit('open-security', 'password'),
    },
    {
      id: 'passkey',
      group: 'security',
      label: '通行密钥',
      desc: '用指纹 / 面容在本设备上快速登录，免输密码',
      keywords: '通行密钥 passkey 指纹 面容 webauthn 免密 登录 设备 账户安全',
      icon: Fingerprint,
      iconClass: 'is-blue',
      /* 浏览器不支持 WebAuthn 时整条不出现 —— 点进去只剩一个注定失败的「添加」按钮 */
      visible: passkeySupported.value,
      run: () => emit('open-security', 'passkey'),
    },
    {
      id: 'hide-online',
      group: 'security',
      kind: 'toggle',
      label: '隐藏在线状态',
      desc: '开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态',
      keywords: '隐藏 在线 状态 隐身 隐私',
      icon: EyeOff,
      iconClass: 'is-indigo',
      on: props.hideOnlineStatus,
      onLabel: '他人看不到你的在线状态，你也看不到他人的',
      offLabel: '他人能看到你的在线状态，你也可以看到他人的',
      run: () => emit('toggle-hide-online'),
    },
    {
      id: 'hide-follow',
      group: 'security',
      kind: 'toggle',
      label: '隐藏关注数据',
      desc: '开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量',
      keywords: '隐藏 关注 粉丝 列表 隐私',
      icon: Users,
      iconClass: 'is-indigo',
      on: props.hideFollowData,
      onLabel: '主页只显示关注与粉丝数量，不显示列表',
      offLabel: '主页可以看到完整的关注与粉丝列表',
      run: () => emit('toggle-hide-follow-data'),
    },
    {
      id: 'delete-account',
      group: 'security',
      label: '注销账号',
      desc: '高风险操作，三步确认后永久注销账号',
      keywords: '注销 删除账号 关闭账号 永久 危险 delete',
      icon: TriangleAlert,
      iconClass: 'is-red',
      danger: true,
      run: () => emit('open-security', 'delete'),
    },

    /* ── 数据 ── */
    {
      id: 'data-privacy',
      group: 'data',
      label: '数据与隐私',
      desc: '公共记忆与管理工具',
      keywords: '数据 隐私 记忆 管理 清除 工具',
      icon: Database,
      iconClass: 'is-indigo',
      value: props.dataPrivacyStatusText,
      run: () => emit('open-data-management'),
    },
    {
      id: 'data-export',
      group: 'data',
      label: '导出我的数据',
      desc: '打包个人资料、帖子、云空间等为 ZIP 下载',
      keywords: '导出 下载 备份 zip 打包 数据',
      icon: Archive,
      iconClass: 'is-indigo',
      value: 'ZIP 打包',
      run: () => emit('open-data-export'),
    },

    /* ── 通知 ── */
    {
      id: 'notify-settings',
      group: 'notify',
      label: '通知设置',
      desc: '应用内推送、邮件通知与生日邮件，按渠道开关',
      keywords: '通知 推送 提醒 消息 应用内 浏览器 邮件 生日 设置 notify push mail',
      icon: Bell,
      iconClass: 'is-blue',
      value: '应用内 · 邮件',
      run: () => emit('open-notification-settings'),
    },
    {
      id: 'follow-mail',
      group: 'notify',
      kind: 'toggle',
      label: '关注的人邮件通知',
      desc: '关注的人发布新帖或评论、回复你的帖子时，发送至你绑定的邮箱',
      keywords:
        '邮件 邮箱 通知 提醒 关注 特别关注 发帖 回复 周期 频率 摘要 投递 合并 mail email notify follow',
      icon: Mail,
      iconClass: 'is-green',
      on: props.followMailEnabled,
      onLabel: '有新动态会发到你的绑定邮箱',
      offLabel: '不发送邮件，只在站内通知',
      run: () => emit('toggle-follow-mail'),
    },
    {
      id: 'mail-window',
      group: 'notify',
      kind: 'choice',
      label: '提醒频率',
      desc: '同一个人的多条消息按周期合并发送',
      keywords: '提醒 频率 周期 实时 合并 15分钟 1小时 邮件',
      icon: Clock,
      iconClass: 'is-blue',
      value: mailWindowLabel.value,
      options: MAIL_WINDOW_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        desc: option.desc,
        badge: option.maxOnly ? 'Max+ Only' : '',
      })),
      optionValue: props.followMailWindow,
      optionIcon: Clock,
      choose: (value) => emit('choose-mail-window', value),
      /* 手机：点行就地展开选项；桌面走 openEntry 出右栏详情，不执行 run */
      run: () => toggleMailExpanded('mail-window'),
    },
    {
      id: 'mail-digest',
      group: 'notify',
      kind: 'choice',
      label: '投递方式',
      desc: '对方连续发送多条时的送达方式',
      keywords: '投递 方式 摘要 即时 减少干扰 合并 邮件',
      icon: Inbox,
      iconClass: 'is-indigo',
      value: mailDigestLabel.value,
      options: MAIL_DIGEST_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        desc: option.desc,
        badge: '',
      })),
      optionValue: props.followMailDigest,
      optionIcon: Inbox,
      note: MAIL_DIGEST_NOTE,
      choose: (value) => emit('choose-mail-digest', value),
      run: () => toggleMailExpanded('mail-digest'),
    },

    /* ── 内容与存储 ── */
    {
      id: 'assets',
      group: 'storage',
      label: '资产',
      desc: '积分明细、订阅、订单、抽奖与赞助',
      keywords: '资产 积分 余额 订阅 订单 抽奖 赞助 钱包 wallet',
      icon: Wallet,
      iconClass: 'is-teal',
      run: () => emit('open-assets'),
    },
    {
      id: 'shipping-address',
      group: 'storage',
      label: '收货地址',
      desc: '礼物与实物订单寄送时使用',
      keywords: '收货地址 地址 物流 快递 邮寄 收件人 电话 寄送 address shipping',
      icon: MapPin,
      iconClass: 'is-teal',
      run: () => emit('open-address'),
    },
    {
      id: 'photo-albums',
      group: 'storage',
      label: '摄影集',
      desc: '照片自动排版，装帧一本可带走的影集',
      keywords: '摄影集 相册 照片 影集 排版 打印 album photo',
      icon: Images,
      iconClass: 'is-blue',
      run: () => emit('open-photo-albums'),
    },
    {
      id: 'cloud-plus',
      group: 'storage',
      label: 'Cloud+ 页面',
      desc: '进入完整 Cloud+ 设置与管理页面',
      keywords: 'cloud 云 空间 存储 配额 网盘 容量',
      icon: MessagesSquare,
      iconClass: 'is-teal',
      value: props.cloudPlusUsageText,
      run: () => emit('open-cloud', 'settings'),
    },

    /* ── 通用 ── */
    {
      id: 'theme',
      group: 'general',
      label: '主题设置',
      desc: '选择浅色、深色或跟随系统',
      keywords: '主题 深色 浅色 暗色 暗黑 夜间 跟随系统 外观 dark light theme',
      icon: props.currentTheme === 'dark' ? Moon : Sun,
      iconClass: props.currentTheme === 'dark' ? 'is-purple' : 'is-yellow',
      value: props.themeDisplayText,
      run: () => emit('open-theme'),
    },
    {
      id: 'home-gate',
      group: 'general',
      label: '重播首屏开场画',
      desc: '清除「已看过」标记，回到首屏再看一次',
      keywords: '重播 首屏 开场 动画 引导 重置 首页',
      icon: RotateCcw,
      iconClass: 'is-blue',
      run: () => replayHomeGate(),
    },
    {
      id: 'version',
      group: 'general',
      label: '版本',
      desc: '查看当前版本与 Beta 7.0.1 介绍',
      keywords: '版本 beta 更新 升级 关于 version',
      icon: Info,
      iconClass: 'is-blue',
      value: 'Beta 7.0.1',
      run: () => emit('open-version-settings'),
    },

    /* ── 危险 ── */
    {
      id: 'logout',
      group: 'danger',
      label: '退出登录',
      desc: '',
      keywords: '退出 登出 注销 换号 账号 logout',
      icon: LogOut,
      iconClass: 'is-red',
      danger: true,
      run: () => emit('logout'),
    },

    /* ── 只进搜索：身份卡上的邮箱动作 ── */
    {
      id: 'copy-email',
      group: 'profile',
      searchOnly: true,
      label: '复制邮箱',
      desc: '把当前登录邮箱复制到剪贴板（身份卡上的邮箱字同款动作）',
      keywords: 'email 邮箱 邮件 登录 找回密码 复制 绑定 账号',
      icon: Mail,
      iconClass: 'is-blue',
      value: emailDisplayText.value,
      run: () => copyEmail(),
    },
  ];

  const visible = entries.filter((entry) => entry.visible !== false);
  /* 一级组行：首页与桌面左栏列的**就是它们**（组不是标题，是入口）。
     条数由本组条目实时算出来，新增条目不用再手改「N 项」。 */
  const groupRows = GROUPS.map((group) => ({
    id: `g-${group.id}`,
    groupId: group.id,
    isGroupRow: true,
    kind: 'group',
    label: group.label,
    desc: group.desc,
    keywords: `${group.label} ${group.desc}`,
    icon: group.icon,
    iconClass: group.iconClass,
    value: `${visible.filter((entry) => entry.group === group.id && !entry.searchOnly).length} 项`,
    run: () => {},
  }));
  return groupRows.concat(visible);
});

/** 一级组行（首页与桌面左栏列的条目） */
const groupEntries = computed(() => catalog.value.filter((entry) => entry.isGroupRow));

/** 二级页里的条目：属于该组的叶子条目（searchOnly 只进搜索，不进列表） */
const groupLeaves = (groupId) =>
  catalog.value.filter(
    (entry) => entry.group === groupId && !entry.isGroupRow && !entry.searchOnly,
  );

const activeEntry = computed(
  () => catalog.value.find((entry) => entry.id === activeEntryId.value) || null,
);

const logoutEntry = computed(() => catalog.value.find((entry) => entry.id === 'logout'));

/** 一级首页：只有它带「设置」页头、大返回与搜索；二级组页 / 三级表单都只有返回条 */
const isHome = computed(() => !activeEntry.value && !props.inlinePanel && !props.editOpen);

/* 左栏高亮：左栏是一级组，所以三级表单打开时高亮它**所属的组**（而不是某一条）。
   editOpen / inlinePanel 是宿主状态，本组件按 props 反推 —— 组 id 固定是 g-<groupId>。
   2026-11-10：新增的右栏子页（主题 / 版本 / 收货地址 / 摄影集）也在这里登记，
   否则从「我」页或左栏直接跳进来时，左栏会一条都不亮。 */
const INLINE_PANEL_RAIL_GROUP = {
  'data-export': 'g-data',
  'data-management': 'g-data',
  'account-security': 'g-security',
  'avatar-frame': 'g-profile',
  'notification-settings': 'g-notify',
  assets: 'g-storage',
  'shipping-address': 'g-storage',
  'photo-albums': 'g-storage',
  theme: 'g-general',
  version: 'g-general',
};
const railActiveId = computed(() => {
  if (props.editOpen) return 'g-profile';
  if (props.inlinePanel) return INLINE_PANEL_RAIL_GROUP[props.inlinePanel] || activeEntryId.value;
  return activeEntryId.value;
});

/* 选项行就地展开（手机）：把「提醒频率 / 投递方式」的选择项插在父行后面，
   与二级页的行同一套样式（.gs-row + .gs-mail-freq-option），不新造控件。 */
const expandRows = (entries) =>
  entries.flatMap((entry) => {
    const rows = [{ ...entry, uid: entry.id, expanded: mailExpandedGroup.value === entry.id }];
    if (entry.kind !== 'choice' || mailExpandedGroup.value !== entry.id) return rows;
    const options = entry.options.map((option) => ({
      uid: `${entry.id}-${option.value}`,
      option: true,
      label: option.label,
      desc: option.desc,
      icon: entry.optionValue === option.value ? Check : entry.optionIcon,
      iconClass: entry.optionValue === option.value ? 'is-green' : 'is-gray',
      badge: option.badge,
      run: () => entry.choose(option.value),
    }));
    if (entry.note) options.push({ uid: `${entry.id}-note`, note: entry.note });
    return rows.concat(options);
  });

/** 搜索无结果时的占位行（走同一条行渲染，不再单独写一套空态样式） */
const NO_RESULT_ROW = {
  uid: 'no-result',
  static: true,
  icon: SearchX,
  iconClass: 'is-gray',
  label: '没有找到设置项',
  desc: '换个词试试，例如「主题」「密码」「推送」「导出」',
};

/**
 * 当前要渲染的分组。三个视图共用同一段行渲染：
 *   · 搜索中 → 单组「搜索结果」
 *   · 二级页（kind='group'）→ 单个无标题组，内容是这一组的条目
 *   · 首页 → 全部分组（桌面右栏不重复左栏目录，所以桌面「概览」返回空）
 */
const renderedGroups = computed(() => {
  if (isSearching.value) {
    const rows = searchResults.value.length
      ? searchResults.value.map((entry) => ({ ...entry, uid: `hit-${entry.id}` }))
      : [NO_RESULT_ROW];
    return [{ id: 'search', label: '搜索结果', rows }];
  }
  // 二级页：该组的条目（组名已由返回条承担，卡里不再重复一个组头）
  if (activeEntry.value) {
    if (activeEntry.value.kind !== 'group') return [];
    return [
      {
        id: activeEntry.value.groupId,
        label: '',
        rows: expandRows(groupLeaves(activeEntry.value.groupId)),
      },
    ];
  }
  // 桌面「概览」：身份卡下方补上「个人信息」的行 ——
  //   2026-11-10 用户报障「这个页面是空白的」：原实现在两栏下概览只画身份卡，
  //   右栏其余面积全空，看起来像没加载出来。概览 = 我是谁 + 个人信息的快捷入口。
  if (props.twoPane) {
    return [
      {
        id: 'profile',
        label: '',
        rows: expandRows(groupLeaves('profile')),
      },
    ];
  }
  // 一级首页：组行（一张卡）+ 退出登录（另一张卡）
  return [
    {
      id: 'groups',
      label: '',
      rows: groupEntries.value.map((entry) => ({ ...entry, uid: entry.id })),
    },
    { id: 'danger', label: '', danger: true, rows: [{ ...logoutEntry.value, uid: 'logout' }] },
  ];
});

/* ---------- 设置搜索 ----------
   索引 = catalog 本身（见上），命中后直接执行该行动作：搜到就能去，不必先找分组。
   iOS 设置同思路。 */
const searchQuery = ref('');
const isSearching = computed(() => searchQuery.value.trim().length > 0);

/* 编辑态 / 子页下一开搜就收起右栏：搜索结果是「另一份内容」，让它们和表单抢同一个位置
   只会出现「搜了但什么都没变」的死点（插槽先被 isSearching 藏掉了）。 */
watch(isSearching, (on) => {
  if (!on) return;
  if (props.editOpen) emit('close-edit');
  if (props.inlinePanel) emit('close-panel');
});

/* 归一化：小写 + 去掉所有空白。中文没有词边界，用子串匹配即可；
   多关键词按空格拆分、每条都必须命中（如「深色 主题」）。 */
const normalizeQueryText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');

const searchResults = computed(() => {
  const terms = searchQuery.value.trim().split(/\s+/).map(normalizeQueryText).filter(Boolean);
  if (!terms.length) return [];
  return catalog.value.filter((entry) => {
    const haystack = normalizeQueryText(
      [entry.label, entry.desc, GROUP_LABEL[entry.group], entry.keywords].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
});

/* ---------- 行点击 ----------
   手机：一行的动作就是它的动作（切换 / 展开 / 跳页）。
   桌面：能出详情的就地出在右栏（开关 / 选项 / 聚合页），其余照旧执行 ——
        左栏是目录，右栏是这一项的详情。 */
const openEntry = (item) => {
  if (props.editOpen) emit('close-edit');
  if (props.inlinePanel) emit('close-panel');
  paneDirection.value = 'forward';
  activeEntryId.value = item.id;
  resetPaneScroll();
};

/** 右栏回到「概览」（桌面）/ 回到首页列表（手机） */
const showOverview = () => {
  if (props.editOpen) emit('close-edit');
  if (props.inlinePanel) emit('close-panel');
  paneDirection.value = 'back';
  activeEntryId.value = '';
  resetPaneScroll();
};

const onRowClick = (item) => {
  if (!item || item.static || item.note) return;
  if (item.option) {
    item.run?.();
    return;
  }
  // 从搜索结果点走之后回到普通列表，别把搜索态留在背后
  if (isSearching.value) searchQuery.value = '';
  // 一级组 → 二级组页；其余（开关 / 选项 / 跳页 / 打开表单）就地执行
  if (item.kind === 'group') {
    openEntry(item);
    return;
  }
  item.run?.();
};

/** 页头返回：二级页先回上一级，否则回「我」 */
const handleBack = () => {
  if (activeEntryId.value) {
    showOverview();
    return;
  }
  emit('back');
};
</script>

<style scoped>
@import '../styles/settings-glass.css';

/* iOS 式灰画布（2026-09-30）：卡片是白的，必须压一层灰底才看得出「分离」。
   ⚠️ 2026-10-26：画布改由宿主 `.settings-shell`（tab-page）自己的 background 承担，
   见 styles/profile-base.css。原实现在这里用 `.profile-subpage-shell::before` + `bottom:-100dvh`
   撑到视口底，代价是把 body 的 scrollHeight 顶高 100dvh —— 竖屏下 body 于是成了**第二个滚动容器**
   （style.css 的 `overflow-x:hidden` 会让 `overflow-y:visible` 计算成 auto），
   表现就是「设置页两根滚动条 + 内容结束后多出一屏空白」。 */
.profile-subpage-shell {
  position: relative;
  z-index: 0;
  /* 顶部留白：全局导航栏是 position:fixed（实测高 130px，含动态状态卡），
     而 .settings-shell 的 padding-top 是 0 ⇒ 页面内容从 y=0 起、整块压在导航栏下。
     原值 `padding-top: 0` 导致「设置」标题与首个分组都被盖住（实测 header y=0）。
     --userspace-nav-h 由 UserSpace 宿主提供（实测 78px，不含状态卡）；
     同时改写 --user-center-nav-offset，让 sticky 的页头也停在导航栏下方。 */
  --user-center-nav-offset: var(--userspace-nav-h, 78px);
  padding-top: var(--userspace-nav-h, 78px);
  /* 进出子页时留白 78 ↔ 0 会变：做成过渡，避免整页「硬跳一下」 */
  transition: padding-top 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .profile-subpage-shell {
    transition: none;
  }
}

/* 页头收起 / 展开：进出二级页时高度渐变，避免内容整体上跳 */
.gs-header-collapse-enter-active,
.gs-header-collapse-leave-active {
  overflow: hidden;
  transition:
    max-height 240ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 180ms ease;
}

.gs-header-collapse-enter-from,
.gs-header-collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.gs-header-collapse-enter-to,
.gs-header-collapse-leave-from {
  max-height: 130px;
  opacity: 1;
}

/* ---------- 设置搜索 ---------- */
.gs-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  box-sizing: border-box;
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-md);
}

/* 竖屏全宽（2026-10-22）：搜索框贴边，圆角与左右边框会让它在通栏时被切出弧形 */
@media (max-width: 767px) {
  .gs-search {
    border-radius: 0;
    border-left-width: 0;
    border-right-width: 0;
    box-shadow: none;
    padding: 0 16px;
  }
}

.gs-search-icon {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--liquid-text-tertiary, #8b9098);
}

.gs-search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 15px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.gs-search-input::placeholder {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* 清除按钮：底色走 --liquid-bg-nested（亮/暗各自派生），不写暗色裸值 */
.gs-search-clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-secondary, #6e6e73);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.gs-search-clear:hover {
  color: var(--liquid-text-primary, #1d1d1f);
}

/* 猫咪彩蛋（保留） */
.settings-page-cat {
  position: absolute;
  right: 18px;
  top: -8px;
  width: 106px;
  height: 88px;
  opacity: 0.18;
  transform: rotate(7deg);
  pointer-events: none;
  z-index: 0;
}
/* ══ 横屏左右栏（2026-10-26）════════════════════════════════════
   左目录 208px + 右详情。断点判定只在宿主（UserSpaceMain）做一次，
   这里只认 .is-two-pane —— 单栏时下面整块不生效，竖屏零影响。
   右栏同一时间只挂一个分组（其余 v-show 隐藏），所以两栏不会出现
   「右边一长条、左边目录才用到一半」的失衡。 */
.glass-settings.is-two-pane {
  display: grid;
  /* 2026-11-10 用户口径「侧边目录再大一些长一些」：
     208 → 244px，且左栏拉伸到与右栏同高（align-self: stretch + .gs-nav flex:1），
     不再是一块「内容一少就短一截」的小卡片。 */
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 30px;
  align-items: stretch;
}

.gs-aside {
  min-width: 0;
}

.glass-settings.is-two-pane .gs-aside {
  align-self: stretch;
}

/* 单栏（竖屏 / 窄屏）搜索框吸顶（2026-10-29）
   原状 sticky 只写在 .is-two-pane .gs-aside 上 —— 竖屏时搜索框在页面最顶上，
   滚过就再也找不到，15 个条目只能硬滚。这是「找不到」在竖屏下的那一半原因。
   ⚠️ 吸顶必须自带不透明底 + 模糊：否则下面的卡片会从搜索框底下透出来，看着像重影。
   ⚠️ top 用 --userspace-nav-h 而不是 0：滚动容器是宿主的 .tab-page，
      顶部还有导航岛，写 0 会被压在岛下面（与双栏那条同一口径）。 */
.glass-settings:not(.is-two-pane) .gs-aside {
  position: sticky;
  top: calc(var(--userspace-nav-h, 78px) + 8px);
  z-index: 4;
  padding: 8px 0 10px;
  background: var(--liquid-bg, rgba(255, 255, 255, 0.72));
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

/* 左栏吸顶：设置页整体在宿主的 .tab-page 里滚动（不是 window），
   目录跟着停在导航岛下方；矮窗下若目录比视口高，自身可滚。 */
.glass-settings.is-two-pane .gs-aside {
  position: sticky;
  top: calc(var(--userspace-nav-h, 78px) + 12px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100dvh - var(--userspace-nav-h, 78px) - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.gs-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 26px;
}

/* 单栏钻取动效（2026-10-29 第二版：方向化 + 错峰） ----------
   第一版是无方向淡入，用户读不出「我是在前进还是后退」，所以显得不够优雅。
   现在照 iOS push/pop 的方向记忆：
     · 进入（forward）= 从右滑入 32px —— 新内容「来自你点的那一侧」
     · 返回（back）   = 从左滑回 24px —— 幅度略小，返回比前进更轻
   缓动用 iOS 导航曲线 cubic-bezier(0.32, 0.72, 0, 1)：先快后长尾，比 ease-out 从容。
   多张卡片按 45ms/张错峰进场 —— 「依次浮现」比「一坨同时弹出来」优雅得多。
   为什么仍是 CSS animation 而不是 <Transition>：分支是 v-if / v-else-if，切换时元素
   本来就是新建的，animation 自动播放；Transition 必须包一层 div，会打断 .gs-main
   的 flex gap（组间 26px 全靠它）。
   ⚠️ 双栏切分类不会重播：那边是 v-show（isGroupVisible），元素没重建。 */
.gs-main.is-direction-forward > section,
.gs-main.is-direction-forward > .gs-identity {
  animation: gsPaneForward 280ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

.gs-main.is-direction-back > section,
.gs-main.is-direction-back > .gs-identity {
  animation: gsPaneBack 280ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

/* 错峰：首张立即，其后每张 +45ms（下标从第 2 个子元素起算） */
.gs-main.is-direction-forward > *:nth-child(2),
.gs-main.is-direction-back > *:nth-child(2) {
  animation-delay: 45ms;
}

.gs-main.is-direction-forward > *:nth-child(3),
.gs-main.is-direction-back > *:nth-child(3) {
  animation-delay: 90ms;
}

@keyframes gsPaneForward {
  from {
    opacity: 0;
    transform: translateX(32px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes gsPaneBack {
  from {
    opacity: 0;
    transform: translateX(-24px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gs-main.is-direction-forward > section,
  .gs-main.is-direction-forward > .gs-identity,
  .gs-main.is-direction-back > section,
  .gs-main.is-direction-back > .gs-identity {
    animation: none;
  }
}

/* ---------- 设置目录（2026-11-10 大目录） ----------
   左栏现在装的是整份设置（22 条 + 6 个组头），不再只是 5 个分类，
   所以行高压到 30px、组头 11px —— 目的一屏尽量看全；装不下时 .gs-aside 自己滚。 */
.gs-nav {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--liquid-border);
  border-radius: var(--liquid-radius-md, 12px);
  background: var(--liquid-bg-strong);
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
}

.gs-nav-sep {
  height: 1px;
  margin: 4px 10px;
  background: var(--liquid-border, rgba(15, 23, 42, 0.1));
}

.gs-nav-item {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  line-height: 20px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  /* 状态色全部走既有 token（--rail-pill-bg / --rail-item-bg-hover 由
     side-rail.css 挂在 .user-space-page，暗色已翻转过）——
     这里写裸 rgba 会变成第 N 处需要跟着调色板走的字面量 */
  color: var(--liquid-text-secondary, #6e6e73);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.gs-nav-item :deep(svg) {
  flex: 0 0 auto;
}

.gs-nav-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (hover: hover) and (pointer: fine) {
  .gs-nav-item:hover {
    background: var(--rail-item-bg-hover, rgba(15, 23, 42, 0.05));
  }
}

/* 选中：中性淡染 + 左缘蓝色短条 + 加粗字（三通道，单靠底色在玻璃底上不够读） */
.gs-nav-item.active {
  background: var(--rail-pill-bg, rgba(15, 23, 42, 0.075));
  color: var(--liquid-text-primary, #1d1d1f);
  font-weight: 600;
}

.gs-nav-item.active::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 50%;
  width: 3px;
  height: 16px;
  margin-top: -8px;
  border-radius: 2px;
  background: var(--apple-blue, #0071e3);
}

/* ══ 身份卡（2026-10-26 Apple 账户页形态）══════════════════════════════
   照参考图拆成两层：**上面的人像区不装卡片**（头像/昵称/邮箱直接坐在灰画布上），
   下面三行入口才是一张卡。原先把两段裹进同一张卡里，读起来像「列表顶上多了一块，
   里面又分两段」；Apple 的账户页正是「无容器的居中人像 + 下面一张行卡」。
   ⚠️ 它只在「账户」分类出现，见 showIdentityCard。 */
.gs-identity {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 居中段：Apple 账户页就是「头像→名字→邮箱」竖排居中，无底色无描边 */
.gs-id-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 10px 20px 0;
  text-align: center;
}

.gs-id-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 160ms ease;
}

.gs-id-avatar:active {
  transform: scale(0.97);
}

/* 相机角标：z-index 必须压过头像框层（全局 .boh-avatar-frame 是 z-index:3） */
.gs-id-camera {
  position: absolute;
  right: -2px;
  bottom: -2px;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--liquid-bg-strong, #fff);
  background: #0071e3;
  color: #fff;
  pointer-events: none;
}

.gs-id-name {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.012em;
  color: var(--liquid-text-primary, #1d1d1f);
  overflow-wrap: anywhere;
}

.gs-id-bio {
  margin: -4px 0 0;
  max-width: 34em;
  font-size: 13px;
  line-height: 1.5;
  color: var(--liquid-text-secondary, #6e6e73);
  /* 两行封顶：简介最长 160 字，全展示会把三行入口推出首屏 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gs-id-sub {
  margin: -4px 0 0;
  max-width: 100%;
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--liquid-text-tertiary, #8b9098);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 身份卡里的邮箱行同时是「复制」按钮（2026-10-26）
   —— 原来列表里那行「绑定邮箱（点击复制）」是这份数据的第三份拷贝，删行留能力。 */
.gs-id-email {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.gs-id-email-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-id-email svg {
  flex: 0 0 auto;
  opacity: 0.7;
}

@media (hover: hover) and (pointer: fine) {
  .gs-id-email:hover {
    background: var(--rail-item-bg-hover, rgba(15, 23, 42, 0.05));
    color: var(--liquid-text-secondary, #6e6e73);
  }
}

/* 双写伪类：全局 .bohai-page :focus-visible 与这里特异性打平且更靠后，单写会静默失效 */
.gs-id-email:focus-visible:focus-visible {
  outline: 2px solid var(--liquid-accent, #0071e3);
  outline-offset: 2px;
}

/* ---------- 侧栏账户行（对齐 macOS 系统设置：头像 + 昵称 + 邮箱两行） ----------
   2026-11-10：它不再是「目录里的一项」，而是「回到概览」的入口 ——
   所以单独成类，不复用 .gs-nav-item 的 34px 行高与 13px 字号。 */
.gs-nav-account {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 56px;
  padding: 9px 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .gs-nav-account:hover {
    background: var(--rail-item-bg-hover, rgba(15, 23, 42, 0.05));
  }
}

.gs-nav-account.active {
  background: var(--rail-pill-bg, rgba(15, 23, 42, 0.075));
}

.gs-nav-avatar {
  flex: 0 0 auto;
}

.gs-nav-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  line-height: 1.25;
}

.gs-nav-name,
.gs-nav-sub {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gs-nav-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--liquid-text-primary, #1d1d1f);
}

.gs-nav-sub {
  font-size: 11px;
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 关注邮件「示例」说明（2026-11-01） ----------
   放在「投递方式」展开区末尾：把「周期 / 合并 / 即时」这几个抽象词落到具体封数上。
   刻意不加底色和边框（不用 .gs-note）—— 它是选项列表的收尾说明，不该比选项本身更重。
   左内边距与展开选项的文字列对齐：行内边距 + 从属缩进(14) + 图标宽 + 图标与文字间距。 */
.gs-mail-example {
  margin: 0;
  padding: 0 var(--gs-row-pad-x, 18px) 12px
    calc(var(--gs-row-pad-x, 18px) + 14px + var(--gs-icon-size, 30px) + var(--gs-row-gap, 13px));
  font-size: 12px;
  line-height: 1.55;
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 暗色 ---------- */
[data-theme='dark'] .gs-nav-sub {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 竖屏：卡片退化为通栏（与 .gs-rows / .gs-search 同一处理） ---------- */
@media (max-width: 767px) {
  /* 身份卡把「账户」分组整体下推，竖屏节奏收紧到 16 —— 26 是两栏时的呼吸值 */
  .gs-main {
    gap: 16px;
  }

  .gs-identity {
    gap: 12px;
  }

  /* 竖屏一屏高度有限：头像与上下留白各收一档，名字与「我」页昵称同级 */
  .gs-id-hero {
    padding: 6px 20px 0;
    gap: 8px;
  }

  .gs-id-avatar {
    width: 84px;
    height: 84px;
  }

  .gs-id-name {
    font-size: 19px;
  }
}
</style>
