<template>
  <div key="profile-settings" class="profile-subpage-shell">
    <UserCenterPageHeader
      title="设置"
      back-label="返回我的"
      max-width="1200px"
      :show-back="showBack"
      @back="$emit('back')"
    />

    <div class="profile-subpage-body">
      <HomeCatMascot
        v-if="isHomeCatActive"
        class="settings-page-cat"
        pool="background"
        seed="settings-page"
        size="lg"
        decorative
      />

      <!-- iOS 式分离卡片（2026-09-30 重构）：
           卡片本体是 .gs-rows，分组标题移到卡片外上方，组间靠留白分隔。
           骨架规则在 styles/settings-glass.css（5 个设置类页面共用）。 -->
      <div class="glass-settings">
        <!-- 设置搜索：索引覆盖本页所有行 + 各子页入口，命中后直接执行入口动作 -->
        <div class="gs-search" role="search">
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

        <!-- 搜索结果（替代分组列表） -->
        <section v-if="isSearching" class="gs-group">
          <div class="gs-group-title">搜索结果</div>
          <div class="gs-rows">
            <button
              v-for="item in searchResults"
              :key="item.id"
              type="button"
              class="gs-row"
              @click="runEntry(item)"
            >
              <span class="gs-icon" :class="entryIconClass(item)">
                <component :is="entryIcon(item)" :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label" :class="{ 'gs-label-danger': item.danger }">{{
                  item.label
                }}</span>
                <span class="gs-desc">{{ item.group }} · {{ item.desc }}</span>
              </span>
              <span class="gs-side">
                <SettingToggle
                  v-if="item.toggle"
                  :model-value="entryToggleValue(item)"
                  :label="item.label"
                  @update:model-value="runEntry(item)"
                />
                <template v-else>
                  <span v-if="item.value" class="gs-value">{{ item.value() }}</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </template>
              </span>
            </button>

            <div v-if="!searchResults.length" class="gs-row is-static">
              <span class="gs-icon is-gray"
                ><SearchX :size="16" :stroke-width="2" aria-hidden="true"
              /></span>
              <span class="gs-text">
                <span class="gs-label">没有找到设置项</span>
                <span class="gs-desc">换个词试试，例如「主题」「密码」「推送」「导出」</span>
              </span>
            </div>
          </div>
        </section>

        <template v-else>
          <!-- 账户 -->
          <section class="gs-group">
            <div class="gs-group-title">账户</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="copyEmail">
                <span class="gs-icon is-blue">
                  <Mail :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">绑定邮箱</span>
                  <span class="gs-desc">{{
                    userEmail ? '用于登录与找回密码，点击复制' : '当前账号未绑定邮箱'
                  }}</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ emailDisplayText }}</span>
                </span>
              </button>
            </div>
          </section>

          <!-- 外观与浏览 -->
          <section class="gs-group">
            <div class="gs-group-title">外观与浏览</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('open-theme')">
                <span class="gs-icon" :class="currentTheme === 'dark' ? 'is-purple' : 'is-yellow'">
                  <Moon
                    v-if="currentTheme === 'dark'"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Sun v-else :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">主题设置</span>
                  <span class="gs-desc">选择浅色、深色或跟随系统</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ themeDisplayText }}</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
              <button type="button" class="gs-row" @click="replayHomeGate">
                <span class="gs-icon is-blue">
                  <RotateCcw :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">重播首屏开场画</span>
                  <span class="gs-desc">清除「已看过」标记，回到首屏再看一次</span>
                </span>
                <span class="gs-side">
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- 通用 -->
          <section class="gs-group">
            <div class="gs-group-title">通用</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('open-version-settings')">
                <span class="gs-icon is-blue">
                  <Info :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">版本</span>
                  <span class="gs-desc">查看当前版本与 Beta 6 介绍</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">Beta 6</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- Cloud+ -->
          <section class="gs-group">
            <div class="gs-group-title">Cloud+</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('open-cloud', 'settings')">
                <span class="gs-icon is-teal">
                  <MessagesSquare :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">Cloud+ 页面</span>
                  <span class="gs-desc">进入完整 Cloud+ 设置与管理页面</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ cloudPlusUsageText }}</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- 账户与安全 -->
          <section class="gs-group">
            <div class="gs-group-title">账户与安全</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('open-security')">
                <span class="gs-icon is-blue">
                  <Shield :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">账户安全</span>
                  <span class="gs-desc">修改密码、管理登录安全</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">密码与账号</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- 通知 -->
          <section class="gs-group">
            <div class="gs-group-title">通知</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('open-pushplus')">
                <span class="gs-icon is-blue">
                  <Bell :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">Pushplus 推送</span>
                  <span class="gs-desc">离线时通过微信接收消息</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ pushplusStatusText }}</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- 数据与隐私 -->
          <section class="gs-group">
            <div class="gs-group-title">数据与隐私</div>
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('toggle-hide-online')">
                <span class="gs-icon is-indigo">
                  <EyeOff :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">隐藏在线状态</span>
                  <span class="gs-desc"
                    >开启后，他人将看不到你的在线状态，你也无法查看他人的在线状态</span
                  >
                </span>
                <span class="gs-side">
                  <SettingToggle
                    :model-value="hideOnlineStatus"
                    label="隐藏在线状态"
                    @update:model-value="$emit('toggle-hide-online')"
                  />
                </span>
              </button>
              <button type="button" class="gs-row" @click="$emit('toggle-hide-follow-data')">
                <span class="gs-icon is-indigo">
                  <Users :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">隐藏关注数据</span>
                  <span class="gs-desc"
                    >开启后，他人在你主页看不到你的详细关注列表和粉丝列表，但仍能看到数量</span
                  >
                </span>
                <span class="gs-side">
                  <SettingToggle
                    :model-value="hideFollowData"
                    label="隐藏关注数据"
                    @update:model-value="$emit('toggle-hide-follow-data')"
                  />
                </span>
              </button>
              <button type="button" class="gs-row" @click="$emit('open-data-management')">
                <span class="gs-icon is-indigo">
                  <Database :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">数据与隐私</span>
                  <span class="gs-desc">公共记忆与管理工具</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">{{ dataPrivacyStatusText }}</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
              <button type="button" class="gs-row" @click="$emit('open-data-export')">
                <span class="gs-icon is-indigo">
                  <Archive :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label">导出我的数据</span>
                  <span class="gs-desc">打包个人资料、帖子、云空间等为 ZIP 下载</span>
                </span>
                <span class="gs-side">
                  <span class="gs-value">ZIP 打包</span>
                  <ChevronRight
                    class="gs-chevron"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- 危险操作 -->
          <section class="gs-group gs-danger">
            <div class="gs-rows">
              <button type="button" class="gs-row" @click="$emit('logout')">
                <span class="gs-icon is-red">
                  <LogOut :size="16" :stroke-width="2" aria-hidden="true" />
                </span>
                <span class="gs-text">
                  <span class="gs-label gs-label-danger">退出登录</span>
                </span>
                <span class="gs-side">
                  <ChevronRight
                    class="gs-chevron gs-chevron-danger"
                    :size="16"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import {
  Archive,
  Bell,
  ChevronRight,
  Database,
  EyeOff,
  Info,
  LogOut,
  Mail,
  MessagesSquare,
  Moon,
  RotateCcw,
  Search,
  SearchX,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-vue-next';

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

const props = defineProps({
  showBack: {
    type: Boolean,
    default: true,
  },
  userEmail: {
    type: String,
    default: '',
  },
  pushplusStatusText: {
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
});

const emit = defineEmits([
  'back',
  'open-theme',
  'open-cloud',
  'open-pushplus',
  'open-security',
  'open-version-settings',
  'open-data',
  'open-data-management',
  'open-data-export',
  'logout',
  'toggle-hide-online',
  'toggle-hide-follow-data',
]);

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
const SETTINGS_ENTRIES = [
  {
    id: 'email',
    group: '账户',
    label: '绑定邮箱',
    desc: '用于登录与找回密码，点击复制',
    keywords: 'email 邮箱 邮件 登录 找回密码 复制 绑定 账号',
    icon: Mail,
    iconClass: 'is-blue',
    value: () => emailDisplayText.value,
    run: () => copyEmail(),
  },
  {
    id: 'theme',
    group: '外观与浏览',
    label: '主题设置',
    desc: '选择浅色、深色或跟随系统',
    keywords: '主题 深色 浅色 暗色 暗黑 夜间 跟随系统 外观 dark light theme',
    icon: Moon,
    iconClass: 'is-purple',
    value: () => props.themeDisplayText,
    run: () => emit('open-theme'),
  },
  {
    id: 'home-gate',
    group: '外观与浏览',
    label: '重播首屏开场画',
    desc: '清除「已看过」标记，回到首屏再看一次',
    keywords: '重播 首屏 开场 动画 引导 重置 首页',
    icon: RotateCcw,
    iconClass: 'is-blue',
    run: () => replayHomeGate(),
  },
  {
    id: 'version',
    group: '通用',
    label: '版本',
    desc: '查看当前版本与 Beta 6 介绍',
    keywords: '版本 beta 更新 升级 关于 version',
    icon: Info,
    iconClass: 'is-blue',
    value: () => 'Beta 6',
    run: () => emit('open-version-settings'),
  },
  {
    id: 'cloud-plus',
    group: 'Cloud+',
    label: 'Cloud+ 页面',
    desc: '进入完整 Cloud+ 设置与管理页面',
    keywords: 'cloud 云 空间 存储 配额 网盘 容量',
    icon: MessagesSquare,
    iconClass: 'is-teal',
    value: () => props.cloudPlusUsageText,
    run: () => emit('open-cloud', 'settings'),
  },
  {
    id: 'security',
    group: '账户与安全',
    label: '账户安全',
    desc: '修改密码、管理登录安全',
    keywords: '安全 密码 改密 登录 验证 通行密钥 passkey 账户',
    icon: Shield,
    iconClass: 'is-blue',
    value: () => '密码与账号',
    run: () => emit('open-security'),
  },
  {
    id: 'pushplus',
    group: '通知',
    label: 'Pushplus 推送',
    desc: '离线时通过微信接收消息',
    keywords: '推送 通知 微信 pushplus 提醒 离线',
    icon: Bell,
    iconClass: 'is-blue',
    value: () => props.pushplusStatusText,
    run: () => emit('open-pushplus'),
  },
  {
    id: 'hide-online',
    group: '数据与隐私',
    label: '隐藏在线状态',
    desc: '开启后他人看不到你的在线状态，你也无法查看他人的在线状态',
    keywords: '隐藏 在线 状态 隐身 隐私',
    icon: EyeOff,
    iconClass: 'is-indigo',
    toggle: true,
    run: () => emit('toggle-hide-online'),
  },
  {
    id: 'hide-follow',
    group: '数据与隐私',
    label: '隐藏关注数据',
    desc: '开启后他人在你主页看不到详细关注与粉丝列表，但仍能看到数量',
    keywords: '隐藏 关注 粉丝 列表 隐私',
    icon: Users,
    iconClass: 'is-indigo',
    toggle: true,
    run: () => emit('toggle-hide-follow-data'),
  },
  {
    id: 'data-privacy',
    group: '数据与隐私',
    label: '数据与隐私',
    desc: '公共记忆与管理工具',
    keywords: '数据 隐私 记忆 管理 清除 工具',
    icon: Database,
    iconClass: 'is-indigo',
    value: () => props.dataPrivacyStatusText,
    run: () => emit('open-data-management'),
  },
  {
    id: 'data-export',
    group: '数据与隐私',
    label: '导出我的数据',
    desc: '打包个人资料、帖子、云空间等为 ZIP 下载',
    keywords: '导出 下载 备份 zip 打包 数据',
    icon: Archive,
    iconClass: 'is-indigo',
    value: () => 'ZIP 打包',
    run: () => emit('open-data-export'),
  },
  {
    id: 'logout',
    group: '危险操作',
    label: '退出登录',
    desc: '退出当前账号',
    keywords: '退出 登出 注销 换号 账号 logout',
    icon: LogOut,
    iconClass: 'is-red',
    danger: true,
    run: () => emit('logout'),
  },
];

const searchQuery = ref('');
const isSearching = computed(() => searchQuery.value.trim().length > 0);

/* 归一化：小写 + 去掉所有空白。中文没有词边界，用子串匹配即可；
   多关键词按空格拆分、每条都必须命中（如「深色 主题」）。 */
const normalizeQueryText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');

const searchResults = computed(() => {
  const terms = searchQuery.value.trim().split(/\s+/).map(normalizeQueryText).filter(Boolean);
  if (!terms.length) return [];
  return SETTINGS_ENTRIES.filter((entry) => {
    const haystack = normalizeQueryText(
      [entry.label, entry.desc, entry.group, entry.keywords].join(' '),
    );
    return terms.every((term) => haystack.includes(term));
  });
});

const entryIcon = (entry) => {
  if (entry.id === 'theme') return props.currentTheme === 'dark' ? Moon : Sun;
  return entry.icon;
};

const entryIconClass = (entry) => {
  if (entry.id === 'theme') return props.currentTheme === 'dark' ? 'is-purple' : 'is-yellow';
  return entry.iconClass;
};

const entryToggleValue = (entry) =>
  entry.id === 'hide-online' ? props.hideOnlineStatus : props.hideFollowData;

/* 执行后清空搜索：复制邮箱这类动作留在本页，清空即可回到原列表；
   跳转类动作清空与否用户都看不到。 */
const runEntry = (entry) => {
  searchQuery.value = '';
  entry.run?.();
};
</script>

<style scoped>
@import '../styles/settings-glass.css';

/* iOS 式灰画布（2026-09-30）：卡片是白的，必须压一层灰底才看得出「分离」。
   用伪元素铺满视口宽（100vw 居中 + bottom 负值撑到滚动区底部），
   避免依赖外层 padding 的具体数值；溢出部分由 .tab-page 的 overflow 裁掉。
   底色走 --boh-bg-secondary（亮 #f5f5f7 / 暗 #12121a），
   不在这里写暗色裸色值 —— 否则会撞 check:dark-tokens:strict 棘轮。 */
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
}

.profile-subpage-shell::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: -100dvh;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
  background: var(--boh-bg-secondary, #f5f5f7);
  pointer-events: none;
  z-index: -1;
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
</style>
