<template>
  <div class="home">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <!-- 拼图展示区 -->
    <section class="interleaved-images-section fade-section">
      <div class="interleaved-container">
        <div class="image-wrapper i-top-left">
          <img :src="getImageUrl('@/assets/images/main1.webp')" alt="Image 1" loading="lazy" decoding="async" />
        </div>
        <div class="image-wrapper i-top-right">
          <img :src="getImageUrl('@/assets/images/main2.png')" alt="Image 2" loading="lazy" decoding="async" />
        </div>
        <div class="image-wrapper i-bottom-left">
          <img :src="getImageUrl('@/assets/images/2025-7years.webp')" alt="Image 3" loading="lazy" decoding="async" />
        </div>
        <div class="image-wrapper i-bottom-right">
          <img :src="getImageUrl('@/assets/images/2023-8-nfls.webp')" alt="Image 4" loading="lazy" decoding="async" />
        </div>
        <div class="yellow-bookmark">
          <span class="bookmark-text">方块之家</span>
        </div>
      </div>
    </section>

    <!-- 活动照片墙英雄区 -->
    <section class="hero-section fade-section" ref="photoWallHero">
      <div class="hero-content">
        <h1 class="hero-title">BlockOfHome2026，欢迎你。</h1>
        <div class="hero-buttons">
          <router-link to="/activities" class="hero-button">查看全部活动</router-link>
        </div>
      </div>
      
      <!-- 活动照片墙 -->
      <div class="photo-wall-hero">
        <div 
          v-for="(activity, index) in heroActivities" 
          :key="index"
          class="photo-card-hero"
          :style="photoStyles[index]"
        >
          <div class="photo-frame-hero">
            <div class="photo-hero">
              <img
                :src="getImageUrl(activity.image)"
                :alt="activity.title"
                class="img-responsive"
                :loading="index < 8 ? 'eager' : 'lazy'"
                :fetchpriority="index < 8 ? 'high' : 'auto'"
                decoding="async"
                sizes="(max-width: 480px) 80px, (max-width: 768px) 110px, 240px"
              />
            </div>
            <div class="photo-info-hero">
              <h4>{{ activity.date }}</h4>
              <p>{{ activity.title }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 底部双卡片区域 -->
    <section class="bottom-cards-section fade-section">
      <div class="bottom-cards-container">
        <!-- 2025年度报告卡片 -->
        <div class="bottom-card report-card">
          <div class="card-content">
            <h2 class="card-title">2025年度报告</h2>
            <p class="card-desc">查看2025方块之家年度报告，回顾我们的共同旅程。</p>
            <div class="card-actions">
              <button v-if="!isLoggedIn" @click="showLoginModal = true" class="hero-button card-button">
                请登录以查收
              </button>
              <router-link v-else to="/annual-report-2025" class="hero-button card-button">
                点击查收
              </router-link>
            </div>
          </div>
        </div>

        <!-- 最新内容卡片 -->
        <div class="bottom-card news-card">
          <div class="card-content">
            <h2 class="card-title">当前最新内容</h2>
            
            <!-- 简化后的新闻展示 -->
            <div class="news-carousel-mini">
              <div 
                v-for="(news, index) in topThreeNews" 
                :key="news.id"
                class="news-item-mini"
                v-show="currentNewsIndex === index"
                @click="goToNewsroom"
              >
                <div class="news-image-mini">
                  <img :src="getImageUrl(news.image)" :alt="news.title" loading="lazy" decoding="async" />
                </div>
                <div class="news-info-mini">
                  <h3 class="news-title-mini">{{ news.title }}</h3>
                  <p class="news-excerpt-mini">{{ news.excerpt }}</p>
                </div>
              </div>
              
              <!-- 翻页按钮 -->
              <div class="mini-pagination">
                <button class="pag-btn prev" @click.stop="prevNews">←</button>
                <div class="mini-indicators">
                  <span 
                    v-for="(_, index) in topThreeNews" 
                    :key="index"
                    class="mini-dot"
                    :class="{ 'active': currentNewsIndex === index }"
                    @click="currentNewsIndex = index"
                  ></span>
                </div>
                <button class="pag-btn next" @click.stop="nextNews">→</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 猜你喜欢区域 (改为全站功能推荐) -->
    <section class="interested-section fade-section">
      <div class="container">
        <h2 class="interested-title">你可能感兴趣</h2>
        <div class="interested-container">
          <div v-for="(item, index) in recommendedFunctions" :key="index" class="interested-card">
            <div class="interested-image">
              <img :src="getImageUrl(item.image)" :alt="item.title" loading="lazy" decoding="async">
            </div>
            <div class="interested-content">
              <h3 class="product-title">{{ item.title }}</h3>
              <p class="product-desc">{{ item.desc }}</p>
              <router-link :to="item.path" class="product-link">立即前往</router-link>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 全站搜索栏 -->
    <section class="site-search-section fade-section">
      <div class="container">
        <div class="search-box-wrapper">
          <h2 class="search-title">找不到想要的功能？试试全站搜索</h2>
          <div class="search-input-group">
            <i class="icon-search"></i>
            <input 
              type="text" 
              v-model="siteSearchQuery" 
              placeholder="输入关键词，如 '商店'、'教程'、'健康'、'游戏'..." 
              class="site-search-input"
              @input="handleSiteSearch"
              @focus="showSiteSuggestions = true"
              @blur="handleSiteBlur"
              autocomplete="off"
            />
            <button v-if="siteSearchQuery" @click="clearSiteSearch" class="clear-site-search">&times;</button>
            
            <!-- 搜索建议 -->
            <transition name="fade">
              <div v-if="showSiteSuggestions && siteSearchQuery && filteredSiteSuggestions.length > 0" class="site-search-suggestions">
                <div 
                  v-for="item in filteredSiteSuggestions" 
                  :key="item.path" 
                  class="site-suggestion-item"
                  @mousedown="navigateToPage(item.path)"
                >
                  <div class="suggestion-info">
                    <span class="suggestion-name">{{ item.name }}</span>
                    <span class="suggestion-desc">{{ item.desc }}</span>
                  </div>
                  <i class="icon-arrow-right"></i>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </section>

    <!-- 极简专业版教程宣传英雄区 -->
    <section class="tutorial-hero-section">
      <!-- 背景环绕文字层 -->
      <div class="tutorial-bg-text-layer">
        <span class="bg-text-item item-1">如何进入服务器？</span>
        <span class="bg-text-item item-2">版本要求是什么？</span>
        <span class="bg-text-item item-3">怎么安装模组？</span>
        <span class="bg-text-item item-4">联机卡顿怎么办？</span>
        <span class="bg-text-item item-5">如何获取客户端？</span>
        <span class="bg-text-item item-6">JAVA EDITION</span>
        <span class="bg-text-item item-7">游戏指令大全</span>
        <span class="bg-text-item item-8">材质包安装</span>
        <span class="bg-text-item item-9">MINECRAFT</span>
        <span class="bg-text-item item-10">MULTIPLAYER</span>
        <span class="bg-text-item item-11">内存溢出解决</span>
        <span class="bg-text-item item-12">皮肤站配置</span>
      </div>

      <div class="tutorial-hero-container">
        <div class="tutorial-hero-content">
          <div class="tutorial-tag">TECHNICAL DOCUMENTATION</div>
          <h2 class="tutorial-hero-title">MC常见问题指南</h2>
          <p class="tutorial-hero-subtitle">
            方块之家专门设计的MC教程指南，涵盖了基础问题，新手必备。
          </p>
          <div class="tutorial-hero-buttons">
            <router-link to="/tutorial" class="hero-button tutorial-main-btn">浏览文档</router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <Footer />

    <!-- 登录模态框 -->
    <div
      class="boh-login-modal-overlay"
      v-if="showLoginModal"
      @click="showLoginModal = false"
    >
      <div class="boh-login-modal-container" @click.stop>
        <button class="boh-login-modal-close" @click="showLoginModal = false">
          &times;
        </button>
        <div class="boh-login-modal-header">
          <h2>方块之家</h2>
          <p>这里不只有方块。</p>
        </div>
        <form class="boh-login-form" @submit.prevent="handleLogin">
          <div class="boh-form-group">
            <label>方块ID</label>
            <input
              type="text"
              v-model="loginForm.username"
              placeholder="请输入你的用户名"
              required
            />
          </div>
          <div class="boh-form-group">
            <label>密码</label>
            <div class="boh-password-wrap">
              <input
                :type="showPassword ? 'text' : 'password'"
                v-model="loginForm.password"
                placeholder="请输入你的密码"
                required
              />
              <button
                type="button"
                class="boh-toggle-password"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? "隐藏" : "显示" }}
              </button>
            </div>
          </div>
          <div class="boh-auth-error" v-if="authError">
            用户名或密码错误，请重试
          </div>
          <div class="boh-form-links">
            <a href="#" @click.prevent="handleForgotPassword">忘记密码？</a>
            <a
              href="https://docs.qq.com/form/page/DRVZ2TmtwZWRYaU5o"
              target="_blank"
              >还没有账号？立即注册</a
            >
          </div>
          <button type="submit" class="boh-login-btn" :disabled="isLoggingIn">
            {{ isLoggingIn ? "登录中..." : "登录方块之家" }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted, computed } from "vue";
import UnifiedNavbar from "../components/UnifiedNavbar.vue";
import Footer from "../components/Footer.vue";
import { useRoute } from "vue-router";
// 导入统一认证管理器
import "../utils/auth-manager.js";
import { useRouter } from "vue-router";
import { getImageUrl } from "../utils/asset-helper.js";

// 路由相关
const route = useRoute();
const router = useRouter();

// 推荐功能数据 (更新为 Shop 商品)
const recommendedFunctions = ref([
  {
    title: "方块之家7周年纪念册",
    desc: "硬壳精装版，记录方块之家7年来的点点滴滴。售价：¥34.99",
    image: "@/assets/images/Commemorative-album.PNG",
    path: "/shop"
  },
  {
    title: "BOH BAG-Air（胸包）",
    desc: "白色背景图+黑色文字，黑色文字为BOH BAG系列。售价：¥39.99",
    image: "xnbag-1.PNG",
    path: "/shop"
  },
  {
    title: "小牛定制流麻",
    desc: "动态流沙麻将，blingbling效果。售价：待定",
    image: "@/assets/images/main2.webp",
    path: "/shop"
  }
]);

// 全站搜索索引
const siteSearchIndex = [
  { name: "首页", desc: "返回方块之家主页", path: "/", keywords: ["home", "首页", "主页", "开头", "main", "start"] },
  { name: "商店 / Shop", desc: "购买周边与商品", path: "/shop", keywords: ["商店", "周边", "买东西", "衣服", "卫衣", "水杯", "帆布袋", "shop", "商品", "购物", "周边", "定制", "流麻", "钥匙扣", "乐高"] },
  { name: "新闻中心", desc: "查看最新活动与通知", path: "/newsroom", keywords: ["新闻", "动态", "通知", "公告", "news", "更新", "活动", "社区", "官方"] },
  { name: "照片墙", desc: "活动精彩瞬间回顾", path: "/activities/photo-wall", keywords: ["照片", "活动", "回顾", "瞬间", "photo", "墙", "相册", "回忆", "打卡"] },
  { name: "活动列表", desc: "所有往期活动汇总", path: "/activities/list", keywords: ["活动", "列表", "往期", "汇总", "activities", "任务", "参与"] },
  { name: "教程中心", desc: "Minecraft 安装与联机指南", path: "/tutorial", keywords: ["教程", "帮助", "启动器", "安装", "Mod", "模组", "光影", "材质", "联机", "服务器", "PCL", "BakaXL", "HMCL", "Minecraft", "Java", "崩溃", "存档", "地图", "整合包", "樱花Frp", "SakuraFrp", "内网穿透"] },
  { name: "服务中心 / Service", desc: "探索游戏与社群服务", path: "/service", keywords: ["服务", "中心", "service", "社群", "加入", "入口"] },
  { name: "游戏服务器 / Game", desc: "方块之家官方服务器", path: "/game", keywords: ["游戏", "服务器", "game", "server", "联机", "生存", "创造", "冒险"] },
  { name: "个人信息", desc: "管理您的账户资料", path: "/user-center/info", keywords: ["个人", "中心", "信息", "资料", "账户", "user", "me", "设置", "修改"] },
  { name: "我的积分", desc: "查看积分与获取记录", path: "/user-center/points", keywords: ["积分", "钱", "奖励", "兑换", "points", "余额", "获取"] },
  { name: "地址管理", desc: "管理收货地址", path: "/user-center/address", keywords: ["地址", "收货", "寄送", "发货", "address", "快递", "联系人"] },
  { name: "年度报告", desc: "2025年度数据回顾", path: "/annual-report-2025", keywords: ["报告", "年度", "2025", "数据", "回顾", "report", "总结"] },
  { name: "关于我们", desc: "了解方块之家的故事", path: "/about", keywords: ["关于", "我们", "介绍", "背景", "about", "故事", "团队"] },
  { name: "联系我们 / 消息", desc: "查看系统消息与反馈", path: "/user-center/messages", keywords: ["联系", "消息", "反馈", "建议", "letter", "mail", "沟通", "反馈", "写信"] },
  { name: "MBTI测试", desc: "探索您的性格类型", path: "/mbti", keywords: ["mbti", "性格", "测试", "心理", "人格", "十六种", "分析"] },
  { name: "健康中心", desc: "关注您的生活状态", path: "/health", keywords: ["健康", "生活", "状态", "health", "BMI", "运动", "饮食", "热量", "减肥", "体重", "身高", "健身", "卡路里"] },
];

// 全站搜索逻辑
const siteSearchQuery = ref("");
const showSiteSuggestions = ref(false);

const filteredSiteSuggestions = computed(() => {
  const query = siteSearchQuery.value.toLowerCase().trim();
  if (!query) return [];
  return siteSearchIndex.filter(item => 
    item.name.toLowerCase().includes(query) || 
    item.desc.toLowerCase().includes(query) ||
    item.keywords.some(k => k.toLowerCase().includes(query))
  ).slice(0, 6);
});

const handleSiteSearch = () => {
  showSiteSuggestions.value = true;
};

const handleSiteBlur = () => {
  setTimeout(() => {
    showSiteSuggestions.value = false;
  }, 200);
};

const clearSiteSearch = () => {
  siteSearchQuery.value = "";
};

const scrollToSearch = () => {
  const searchSection = document.querySelector(".site-search-section");
  if (searchSection) {
    searchSection.scrollIntoView({ behavior: "smooth", block: "center" });
    // 自动聚焦输入框
    setTimeout(() => {
      const input = searchSection.querySelector("input");
      if (input) input.focus();
    }, 600);
  }
};

const navigateToPage = (path) => {
  router.push(path);
  siteSearchQuery.value = "";
  showSiteSuggestions.value = false;
};

// 登录模态框
const showLoginModal = ref(false);
const showPassword = ref(false);
const isLoggingIn = ref(false);
const authError = ref(false);
const loginForm = ref({
  username: "",
  password: "",
});

// 最新新闻
const latestNewsCard = ref(null);
const topThreeNews = ref([]);
const currentNewsIndex = ref(0);

// 自动切换新闻
let newsInterval = null;
const startNewsCarousel = () => {
  newsInterval = setInterval(() => {
    currentNewsIndex.value = (currentNewsIndex.value + 1) % topThreeNews.value.length;
  }, 5000);
};

const stopNewsCarousel = () => {
  if (newsInterval) {
    clearInterval(newsInterval);
    newsInterval = null;
  }
};

const goToNewsroom = () => {
  router.push('/newsroom');
};

const nextNews = () => {
  currentNewsIndex.value = (currentNewsIndex.value + 1) % topThreeNews.value.length;
};

const prevNews = () => {
  currentNewsIndex.value = (currentNewsIndex.value - 1 + topThreeNews.value.length) % topThreeNews.value.length;
};

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${String(date.getDate()).padStart(2, "0")}`;
};

// 抽奖结果弹窗
const showResultModal = ref(false);

// 活动照片墙英雄区引用
const photoWallHero = ref(null);

// 导入新闻 composable
import { getLatestNews, getCategoryName, getAllNews } from "./../composables/useNews";

// 活动照片数据
const heroActivities = ref([
  {
    id: 1,
    title: "方块之家4周年庆典",
    date: "2022/7/21",
    image: "@/assets/images/2022-7-4years.webp",
    description: "方块之家4周年庆典，感谢大家的陪伴与支持！",
  },
  {
    id: 2,
    title: "国庆特别活动[2022]",
    date: "2022/10",
    image: "@/assets/images/2022-10m-gq.webp",
    description: "2022年国庆特别活动，祝祖国生日快乐！",
  },
  {
    id: 3,
    title: "圣诞活动[2022]",
    date: "2022/12/26",
    image: "@/assets/images/2022-12-sd.webp",
    description: "2022年圣诞活动，一起度过温馨的节日！",
  },
  {
    id: 4,
    title: "农夫乐事",
    date: "2023/8",
    image: "@/assets/images/2023-8-nfls.webp",
    description: "农夫乐事活动，体验乡村生活！",
  },
  {
    id: 5,
    title: "方块之家5周年庆典",
    date: "2023/7/21",
    image: "@/assets/images/2023-7-5years.webp",
    description: "方块之家5周年庆典，感谢大家的一路陪伴！",
  },
  {
    id: 6,
    title: "国庆特别活动[2023]",
    date: "2023/10",
    image: "@/assets/images/2023-10m-shengri.webp",
    description: "2023年国庆特别活动，庆祝祖国繁荣昌盛！",
  },
  {
    id: 7,
    title: "冬眠生存",
    date: "2023/12/1",
    image: "@/assets/images/2023-12m-dongmian.webp",
    description: "冬眠生存活动，挑战极限生存！",
  },
  {
    id: 8,
    title: "农夫乐事方块街",
    date: "2024/2",
    image: "@/assets/images/2024-1-fangkuai.webp",
    description: "农夫乐事方块街活动，体验方块世界的乡村生活！",
  },
  {
    id: 9,
    title: "MC卡车",
    date: "2024/7",
    image: "@/assets/images/2024-07-15_13.26.19.webp",
    description: "MC卡车活动，驾驶卡车穿越方块世界！",
  },
  {
    id: 10,
    title: "2024新年活动",
    date: "2024/12/31",
    image: "@/assets/images/2024-newyears.webp",
    description: "2024新年活动，迎接新年的到来！",
  },
  {
    id: 11,
    title: "新年跑酷",
    date: "2024/12/31",
    image: "@/assets/images/2024-newyearspaoku.webp",
    description: "新年跑酷活动，挑战极限跳跃！",
  },
  {
    id: 12,
    title: "方块之家7周年庆典",
    date: "2025/7/21",
    image: "@/assets/images/2025-7years.webp",
    description: "方块之家7周年庆典，感谢大家的一路陪伴！",
  },
  {
    id: 13,
    title: "国庆特别活动[2025]",
    date: "2025/10",
    image: "@/assets/images/2025-10-shengri.webp",
    description: "2025年国庆特别活动，庆祝祖国生日！",
  },
  {
    id: 14,
    title: "方块博物馆来袭",
    date: "2025/12/12",
    image: "@/assets/images/2025wintermuseam.webp",
    description: "方块博物馆来袭，12月方块街圣诞&生日会特别活动！",
  },
]);

// 为照片生成静态样式，避免随机变化，提升性能与视觉稳定性
const photoStyles = computed(() => {
  return heroActivities.value.map((_, index) => {
    // 使用基于索引的确定性伪随机效果，确保位置固定
    const rotate = (index * 13) % 30 - 15; // 固定旋转：-15到15度
    const translateX = (index * 7) % 40 - 20; // 固定偏移：-20到20px
    const translateY = (index * 11) % 40 - 20;
    const zIndex = (index * 3) % heroActivities.value.length;

    return {
      transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg)`,
      zIndex: zIndex,
      position: "relative",
    };
  });
});

// 最新新闻弹窗
const showNewsModal = ref(false);
const latestNews = ref(null);

// 显示最新新闻 - 从 composable 获取
const showLatestNews = () => {
  latestNews.value = getLatestNews();
  showNewsModal.value = true;
};

// 关闭新闻弹窗
const closeNewsModal = () => {
  showNewsModal.value = false;
};

// 登录状态 - 使用ref管理，确保响应式更新
const isLoggedIn = ref(false);
const username = ref("");

// 初始化登录状态
const initLoginState = () => {
  isLoggedIn.value = window.AuthManager.isLoggedIn();
  const user = window.AuthManager.getCurrentUser();
  username.value = user ? user.username : "";
};

// 监听localStorage变化
const handleStorageChange = () => {
  initLoginState();
};

// 定期检查登录状态变化的定时器
let loginStatusCheckInterval = null;

// 启动定期检查登录状态
const startLoginStatusCheck = () => {
  // 清除已存在的定时器
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval);
  }
  // 每200ms检查一次localStorage变化
  loginStatusCheckInterval = setInterval(() => {
    const currentIsLoggedIn = window.AuthManager.isLoggedIn();
    const user = window.AuthManager.getCurrentUser();
    const currentUsername = user ? user.username : "";

    // 只有当状态发生变化时才更新
    if (
      currentIsLoggedIn !== isLoggedIn.value ||
      currentUsername !== username.value
    ) {
      initLoginState();
    }
  }, 200);
};

// 停止定期检查登录状态
const stopLoginStatusCheck = () => {
  if (loginStatusCheckInterval) {
    clearInterval(loginStatusCheckInterval);
    loginStatusCheckInterval = null;
  }
};

// 处理登录
const handleLogin = () => {
  const { username: inputUsername, password: inputPassword } = loginForm.value;
  authError.value = false;

  // 基础验证
  if (
    !inputUsername.trim() ||
    !inputPassword.trim() ||
    inputPassword.length < 6
  ) {
    return;
  }

  isLoggingIn.value = true;

  // 使用统一认证管理器
  setTimeout(() => {
    const result = window.AuthManager.login(inputUsername, inputPassword);

    if (result.success) {
      // 登录成功
      isLoggedIn.value = true;
      username.value = inputUsername;
      showLoginModal.value = false;
      loginForm.value = { username: "", password: "" };
    } else {
      // 登录失败
      authError.value = true;
    }

    isLoggingIn.value = false;
  }, 500);
};

// 处理退出登录
const handleLogout = () => {
  window.AuthManager.logout();
  isLoggedIn.value = false;
  username.value = "";
};

// 处理忘记密码
const handleForgotPassword = () => {
  alert("由于技术限制，请联系网站开发者解决该问题。");
};

// 滚动触发的观察器逻辑
let observer = null;

const initIntersectionObserver = () => {
  if (typeof window === "undefined" || !window.IntersectionObserver) return;
  
  const options = {
    root: null,
    rootMargin: "0px 0px 200px 0px", // 增加预加载边距，减少滑动时的突发渲染
    threshold: 0.05,
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // 针对淡入部分的逻辑
        if (entry.target.classList.contains("fade-section")) {
          entry.target.classList.add("visible");
        }
        // 处理后停止观察
        observer.unobserve(entry.target);
      }
    });
  }, options);

  // 观察所有淡入区域和英雄区
  const elementsToObserve = document.querySelectorAll(".fade-section, .hero-section");
  elementsToObserve.forEach((el) => observer.observe(el));
};

// 清理观察器
const cleanupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

onMounted(() => {
  // 获取最新新闻用于卡片展示
  latestNewsCard.value = getLatestNews();
  topThreeNews.value = getAllNews().slice(0, 3);

  // 初始化登录状态
  initLoginState();

  // 初始化AOS动画
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 3000,
    });
  }

  // 添加页面加载完成类
  document.body.classList.add("is-loaded");

  // 添加localStorage变化监听
  window.addEventListener("storage", handleStorageChange);

  // 启动定期检查登录状态
  startLoginStatusCheck();

  // 初始化滚动观察器
  initIntersectionObserver();
  
  // 首页开屏拼图动画 - 优化性能版本
  const playIntroAnimation = () => {
    const wrappers = document.querySelectorAll('.interleaved-container .image-wrapper');
    if (!wrappers.length) return;
    
    // 使用交错的 setTimeout 代替 requestAnimationFrame 轮询，降低 CPU 占用
    wrappers.forEach((wrapper, index) => {
      setTimeout(() => {
        wrapper.classList.add('intro-active');
        setTimeout(() => {
          wrapper.classList.remove('intro-active');
        }, 800);
      }, index * 400); // 每 400ms 触发下一个，更平滑
    });
  };
  
  // 延迟启动开屏动画，确保页面元素已就绪
  setTimeout(playIntroAnimation, 500);
});

onUnmounted(() => {
  // 移除localStorage变化监听
  window.removeEventListener("storage", handleStorageChange);

  // 停止定期检查登录状态
  stopLoginStatusCheck();

  // 清理观察器
  cleanupObserver();
});
</script>

<style scoped>
/* 教程宣传英雄区样式 - 极简专业版 */
.tutorial-hero-section {
  padding: 120px 20px;
  background: #ffffff;
  display: flex;
  justify-content: center;
  align-items: center;
  border-top: 1px solid #f0f0f0;
  border-bottom: 1px solid #f0f0f0;
  position: relative;
  overflow: visible; /* 允许文字在小屏幕下溢出显示，确保环绕效果 */
}

/* 背景环绕文字层样式 */
.tutorial-bg-text-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  overflow: visible;
}

.bg-text-item {
  position: absolute;
  font-size: 64px;
  font-weight: 900;
  color: rgba(0, 0, 0, 0.08); /* 不透明度提升至 0.08 */
  white-space: nowrap;
  user-select: none;
  line-height: 1;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  /* 性能优化：强制开启硬件加速 */
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
  /* 减少渲染范围 */
  contain: layout style;
}

.item-1 { top: 5%; left: -2%; transform: translateZ(0) rotate(-12deg); font-size: 72px; }
.item-2 { top: 15%; right: -5%; transform: translateZ(0) rotate(8deg); font-size: 60px; }
.item-3 { bottom: 12%; left: -4%; transform: translateZ(0) rotate(5deg); font-size: 84px; }
.item-4 { bottom: 8%; right: -2%; transform: translateZ(0) rotate(-6deg); font-size: 68px; }
.item-5 { top: 45%; left: -8%; transform: translateZ(0) rotate(-90deg); font-size: 96px; opacity: 0.05; }
.item-6 { top: 55%; right: -8%; transform: translateZ(0) rotate(90deg); font-size: 96px; opacity: 0.05; }
.item-7 { top: -8%; left: 35%; transform: translateZ(0) rotate(2deg); font-size: 52px; }
.item-8 { bottom: -6%; left: 30%; transform: translateZ(0) rotate(-4deg); font-size: 56px; }
.item-9 { top: 25%; left: -10%; transform: translateZ(0) rotate(-15deg); font-size: 110px; opacity: 0.05; }
.item-10 { bottom: 25%; right: -10%; transform: translateZ(0) rotate(15deg); font-size: 110px; opacity: 0.05; }
.item-11 { top: 12%; left: 55%; transform: translateZ(0) rotate(4deg); font-size: 46px; }
.item-12 { bottom: 18%; right: 45%; transform: translateZ(0) rotate(-10deg); font-size: 50px; }

.tutorial-hero-container {
  max-width: 900px;
  width: 100%;
  text-align: center;
  padding: 40px;
  background: #f9f9fb; /* 浅灰色背景卡片化，增强对比 */
  border-radius: 24px;
  border: 1px solid #eeeeee;
  position: relative;
  z-index: 1;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.02);
}

.tutorial-hero-content {
  width: 100%;
}

.tutorial-tag {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: #0071e3;
  margin-bottom: 24px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
}

.tutorial-hero-title {
  font-size: 46px;
  font-weight: 700;
  color: #1d1d1f;
  margin-bottom: 24px;
  line-height: 1.1;
  letter-spacing: -0.015em;
}

.tutorial-hero-subtitle {
  font-size: 20px;
  color: #48484a;
  line-height: 1.6;
  margin-bottom: 48px;
  max-width: 640px;
  margin-left: auto;
  margin-right: auto;
  font-weight: 400;
}

.tutorial-hero-buttons {
  display: flex;
  gap: 20px;
  justify-content: center;
  flex-wrap: wrap;
}

.tutorial-hero-buttons .hero-button.tutorial-main-btn {
  background: #1d1d1f !important;
  color: #ffffff !important;
  border: none !important;
  padding: 18px 60px; /* 增加宽度让单个按钮更好看 */
  border-radius: 14px;
  font-size: 18px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tutorial-hero-buttons .hero-button.tutorial-main-btn:hover {
  background: #424245 !important;
  transform: translateY(-3px);
}

@media (max-width: 768px) {
  .tutorial-hero-section {
    padding: 120px 10px; /* 增加上下间距 */
    text-align: center;
    overflow: visible; /* 强制允许溢出 */
  }
  
  .tutorial-hero-container {
    display: flex;
    justify-content: center;
    width: 86%; /* 进一步收窄卡片，露出更多背景 */
    margin: 0 auto;
    padding: 40px 15px;
    z-index: 5; /* 提升卡片层级，确保在文字上方但保持装饰感 */
  }

  /* 移动端装饰文字 - 极高可见度版本 */
  .bg-text-item {
    font-size: 42px !important; /* 显著增大字号 */
    opacity: 0.28 !important; /* 极高不透明度，确保可见 */
    font-weight: 900;
    color: #000000 !important;
    display: block !important; /* 强制显示 */
  }
  
  /* 定位策略：将文字推向屏幕极边缘 */
  .item-1 { top: 2%; left: 2%; transform: rotate(-10deg) !important; font-size: 46px !important; }
  .item-2 { top: 15%; right: 2%; transform: rotate(8deg) !important; font-size: 36px !important; }
  .item-3 { bottom: 8%; left: 3%; transform: rotate(5deg) !important; font-size: 48px !important; }
  .item-4 { bottom: 2%; right: 2%; transform: rotate(-6deg) !important; font-size: 40px !important; }
  
  /* 移动端隐藏多余文字，保持清爽 */
  .item-5, .item-6, .item-7, .item-8, .item-9, .item-10, .item-11, .item-12 { 
    display: none !important; 
  }
}

/* 性能优化：为长页面 section 启用内容可见性优化 */
.interleaved-images-section,
.hero-section,
.fade-section,
.bottom-cards-section,
.interested-section,
.site-search-section,
.tutorial-hero-section {
  content-visibility: auto;
  contain-intrinsic-size: 1px 600px;
}

/* 优化活动照片墙卡片性能 */
.photo-card-hero {
  will-change: transform;
  transform: translateZ(0);
}

/* 优化 fade-section 动画性能 */
.fade-section {
  opacity: 0;
  transform: translateY(30px); /* 略微增加偏移量，使动画更明显 */
  transition: opacity 0.8s cubic-bezier(0.33, 1, 0.68, 1), transform 0.8s cubic-bezier(0.33, 1, 0.68, 1);
  will-change: opacity, transform;
}

.fade-section.visible {
  opacity: 1;
  transform: translateY(0);
}

.home {
  width: 100%;
  overflow-x: hidden;
  background-color: #ffffff;
  color: #000000;
  font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", Arial, sans-serif;
  /* 优化滚动行为 */
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* 确保导航栏不会影响内容显示 */
#unified-nav-container {
  z-index: 9999;
}



/* 登录模态框样式 - 与导航栏保持一致 */
.boh-login-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: 10000;
  opacity: 1;
  visibility: visible;
  transition: all 0.3s ease;
  box-sizing: border-box;
  /* 使用flexbox居中模态框 */
  display: flex;
  align-items: center;
  justify-content: center;
  /* 确保模态框在视口内 */
  padding: 20px;
  /* 确保覆盖整个视口，不受父容器影响 */
  margin: 0;
  overflow: visible;
}

.boh-login-modal-container {
  width: 90%;
  max-width: 420px;
  padding: 40px 30px;
  /* 增加毛玻璃效果 */
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  -moz-backdrop-filter: blur(20px);
  -ms-backdrop-filter: blur(20px);
  /* 增强边框透明度，配合毛玻璃效果 */
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  /* 增强阴影效果，提升层次感 */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  color: white;
  box-sizing: border-box;
  /* 确保模态框不会被导航栏遮挡 */
  z-index: 10001;
  /* 确保模态框有合适的高度和滚动 */
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  /* 确保模态框居中显示 */
  position: relative;
  margin: 0;
  transform: none;
}

/* 确保关闭按钮位置正确 */
.boh-login-modal-close {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 32px;
  height: 32px;
  border: none;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.8);
  transition: all 0.2s ease;
  /* 确保关闭按钮在最上层 */
  z-index: 10002;
}

.boh-login-modal-close:hover {
  background-color: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.boh-login-modal-header {
  text-align: center;
  margin-bottom: 30px;
}

.boh-login-modal-header h2 {
  color: rgba(255, 255, 255, 0.9);
  font-size: 24px;
  margin: 10px 0;
  letter-spacing: 2px;
}

.boh-login-modal-header p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

.boh-login-form .boh-form-group {
  margin-bottom: 25px;
}

.boh-login-form label {
  display: block;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
}

.boh-login-form input {
  width: 100%;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.95);
  transition: all 0.3s;
  box-sizing: border-box;
}

.boh-login-form input:focus {
  outline: none;
  border-color: #42b983;
  box-shadow: 0 0 0 3px rgba(66, 185, 131, 0.2);
  background: rgba(255, 255, 255, 0.2);
}

.boh-login-form input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.boh-password-wrap {
  position: relative;
}

.boh-toggle-password {
  position: absolute;
  right: 15px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: all 0.3s;
}

.boh-toggle-password:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

.boh-error-message {
  color: rgba(255, 85, 85, 0.9);
  font-size: 13px;
  margin-top: 5px;
  display: none;
}

.boh-auth-error {
  color: rgba(255, 85, 85, 0.9);
  font-size: 13px;
  margin-top: 10px;
  text-align: center;
  display: block;
}

.boh-login-btn {
  width: 100%;
  padding: 14px;
  background: rgba(66, 185, 131, 0.9);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  letter-spacing: 1px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.boh-login-btn:hover {
  background: rgba(66, 185, 131, 1);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(66, 185, 131, 0.4);
  border-color: rgba(255, 255, 255, 0.3);
}

.boh-login-btn:disabled {
  background: rgba(255, 255, 255, 0.3);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.boh-form-links {
  display: flex;
  justify-content: space-between;
  margin: 15px 0 25px;
  font-size: 14px;
}

.boh-form-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: all 0.3s;
}

.boh-form-links a:hover {
  color: #42b983;
  text-decoration: underline;
}

/* 响应式适配 */
@media (max-width: 576px) {
  .boh-login-modal-container {
    margin: 20px;
    padding: 30px 20px;
  }

  .boh-form-links {
    flex-direction: column;
    gap: 10px;
  }
}

/* 拼图展示区样式 */
.interleaved-images-section {
  padding: 80px 0 0 0; /* 远离导航栏，完全贴合照片墙 */
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
  position: relative;
  overflow: hidden;
}

.interleaved-container {
  position: relative;
  width: 450px;
  height: 450px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.image-wrapper {
  position: absolute;
  width: 260px;
  height: 260px;
  overflow: hidden;
  border: 8px solid #fff;
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: #eee;
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.image-wrapper:hover {
  z-index: 10 !important;
  transform: scale(1.05) !important;
  box-shadow: 0 15px 45px rgba(0,0,0,0.25);
}

.image-wrapper:hover img {
  transform: scale(1.1);
}

.image-wrapper.intro-active {
  z-index: 10 !important;
  transform: scale(1.05) !important;
  box-shadow: 0 15px 45px rgba(0,0,0,0.25);
}

.image-wrapper.intro-active img {
  transform: scale(1.1);
}

.i-top-left {
  top: 40px;
  left: 40px;
  z-index: 1;
  transform: rotate(-5deg);
}

.i-top-right {
  top: 60px;
  right: 40px;
  z-index: 2;
  transform: rotate(3deg);
}

.i-bottom-left {
  bottom: 60px;
  left: 60px;
  z-index: 3;
  transform: rotate(4deg);
}

.i-bottom-right {
  bottom: 40px;
  right: 60px;
  z-index: 4;
  transform: rotate(-2deg);
}

.yellow-bookmark {
  position: absolute;
  top: 0;
  right: 80px;
  width: 70px;
  height: 180px;
  background-color: #f1c40f; /* 亮黄色 */
  z-index: 20;
  display: flex;
  justify-content: center;
  padding-top: 15px;
  box-shadow: 3px 3px 15px rgba(0,0,0,0.2);
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%);
  transition: transform 0.3s ease;
  will-change: transform;
}

.yellow-bookmark:hover {
  transform: translateY(5px);
}

.bookmark-text {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  color: #2c3e50;
  font-weight: 800;
  font-size: 1.4rem;
  letter-spacing: 4px;
  text-shadow: 1px 1px 0 rgba(255,255,255,0.3);
}

@media (max-width: 768px) {
  .interleaved-images-section {
    padding: 60px 0 10px 0; /* 离导航栏远一点，离下方照片墙近一点 */
  }
  
  .interleaved-container {
    width: 320px;
    height: 320px;
  }
  
  .image-wrapper {
    width: 180px;
    height: 180px;
    border-width: 4px;
  }
  
  .i-top-left { top: 20px; left: 20px; }
  .i-top-right { top: 30px; right: 20px; }
  .i-bottom-left { bottom: 30px; left: 30px; }
  .i-bottom-right { bottom: 20px; right: 30px; }
  
  .yellow-bookmark {
    width: 50px;
    height: 130px;
    right: 40px;
  }
  
  .bookmark-text {
    font-size: 1rem;
    letter-spacing: 2px;
  }
}

/* 英雄区标题 */
.hero-title {
  font-size: 48px;
  font-weight: 600;
  margin-bottom: 0.2rem; /* 极致紧凑 */
  line-height: 1.2;
  color: #000000 !important; /* 纯黑色 */
  text-align: center;
  width: 100%;
  max-width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: none;
  /* 移除渐入动画 */
  opacity: 1 !important;
  transform: none !important;
}

/* 英雄区按钮容器 */
.hero-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 0.2rem; /* 极致紧凑 */
  /* 移除渐入动画 */
  opacity: 1 !important;
  transform: none !important;
}

/* 英雄区按钮样式 */
.hero-button {
  color: white;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  padding: 10px 20px;
  text-decoration: none;
  transition: all 0.3s ease;
  display: inline-block;
  max-width: fit-content;
  width: auto;
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

/* 英雄区按钮悬停效果 */
.hero-button:hover {
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

/* 年度报告区块样式 - 已移除图片并合并至底部卡片 */
.report-title {
  display: none;
}

/* 底部双卡片区域样式 */
.bottom-cards-section {
  padding: 20px 20px;
  background-color: #ffffff;
  display: flex;
  justify-content: center;
}

.bottom-cards-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  width: 100%;
  max-width: 1200px;
}

.bottom-card {
  background: #fff;
  border: 2px solid #000;
  border-radius: 20px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 280px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.bottom-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0,0,0,0.05);
}

.card-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 15px;
  color: #000;
}

.card-desc {
  font-size: 16px;
  color: #666;
  margin-bottom: 25px;
  line-height: 1.6;
}

.card-button {
  background: #000 !important;
  color: #fff !important;
  border: none !important;
  padding: 12px 30px !important;
  border-radius: 12px !important;
  font-weight: 600 !important;
  cursor: pointer;
}

.card-button:hover {
  background: #333 !important;
}

/* 迷你新闻展示 */
.news-carousel-mini {
  position: relative;
  width: 100%;
}

.news-item-mini {
  display: flex;
  gap: 15px;
  cursor: pointer;
  animation: fadeIn 0.5s ease;
}

.news-image-mini {
  width: 100px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #eee;
}

.news-image-mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.news-info-mini {
  flex: 1;
}

.news-title-mini {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 5px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-excerpt-mini {
  font-size: 13px;
  color: #888;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.mini-pagination {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 20px;
}

.pag-btn {
  background: #f5f5f5;
  border: 1px solid #ddd;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  color: #333;
}

.pag-btn:hover {
  background: #000;
  color: #fff;
  border-color: #000;
}

.mini-indicators {
  display: flex;
  gap: 8px;
}

.mini-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #eee;
  cursor: pointer;
}

.mini-dot.active {
  background: #000;
  width: 15px;
  border-radius: 4px;
}

@media (max-width: 992px) {
  .bottom-cards-section {
    padding: 15px 10px;
  }
  
  .bottom-cards-container {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .bottom-card {
    min-height: auto;
    padding: 20px;
  }
}

/* 活动照片墙英雄区内容容器 */
.photo-wall-hero {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  justify-content: center;
  padding: 20px; /* 减小内边距 */
  width: 90%;
  max-width: 1400px;
  margin: 0 auto; /* 移除顶部间距，紧贴按钮 */
  position: relative;
  z-index: 10;
  /* 纯色牛皮纸背景 */
  background-color: #f5deb3;
  /* 橡木纹理边框 */
  border: 15px solid; /* 减小边框厚度 */
  border-image: linear-gradient(
      45deg,
      #654321,
      #8b4513,
      #a0522d,
      #654321,
      #8b4513
    )
    1;
  box-shadow: none;
  background-clip: padding-box;
}

/* 照片卡片样式 */
.photo-card-hero {
  position: relative;
  width: 200px; /* 稍微缩小宽度 */
  height: 240px; /* 稍微缩小高度 */
  margin: 8px; /* 显著减小间距 */
  cursor: default;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  perspective: 1000px;
  flex-shrink: 0;
  will-change: transform; /* 性能优化：提升为合成层 */
}

.photo-frame-hero {
  width: 100%;
  height: 100%;
  background: white; /* 白色相纸边框 */
  padding: 8px;
  padding-bottom: 30px; /* 减小底部边距 */
  border-radius: 2px;
  box-shadow: none; /* 移除照片阴影 */
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.photo-hero {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.photo-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-info-hero {
  position: absolute;
  bottom: 5px;
  left: 10px;
  right: 10px;
  text-align: center;
  background: transparent;
}

.photo-info-hero h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #333;
  font-family: "Microsoft YaHei", cursive;
}

.photo-info-hero p {
  display: none;
}

/* 英雄区描述 */
.hero-description {
  font-size: 1.2rem;
  color: #8b4513;
  margin-bottom: 2rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}



/* 活动照片墙英雄区容器 */
.hero-section {
  width: 100%;
  min-height: auto; /* 移除 100vh，让高度由内容决定 */
  position: relative;
  overflow: hidden;
  padding-top: 0; /* 完全消除顶部空白，紧贴上方拼图 */
  padding-bottom: 20px; /* 进一步减小底部间距 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background-color: #ffffff; /* 木框外背景改为白色 */
  color: #333;
  z-index: 10;
  box-sizing: border-box;
}

/* 淡入动画关键帧 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 初始状态：所有英雄区内容隐藏 */
.hero-title,
.hero-buttons {
  opacity: 0;
  transform: translateY(30px);
}

/* 滚动触发的淡入效果类 */
.hero-title.fade-in,
.hero-buttons.fade-in {
  animation: fadeInUp 1s ease-out forwards;
}

/* 标题淡入延迟 */
.hero-title.fade-in {
  animation-delay: 0.3s;
}

/* 按钮容器淡入延迟 */
.hero-buttons.fade-in {
  animation-delay: 0.6s;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .hero-section {
    padding-top: 10px !important; /* 进一步向拼图靠拢 */
    padding-bottom: 20px !important;
    min-height: auto !important;
  }

  /* 调整英雄区标题大小 */
  .hero-title {
    font-size: clamp(0.9rem, 5.5vw, 1.5rem) !important; /* 进一步缩小字号以确保单行不溢出 */
    margin-bottom: 0.5rem !important;
    color: #000000 !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    max-width: 100%;
    padding: 0 10px;
    text-align: center;
    box-sizing: border-box;
    display: block; /* 确保是块级元素 */
  }
  
  /* 解决其他标题可能的冲突 */
  .news-hero-title, .report-title {
    font-size: clamp(1.2rem, 6vw, 1.8rem) !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hero-buttons {
    margin-bottom: 0.5rem !important;
    gap: 0.5rem !important; /* 缩小按钮间距 */
  }

  .hero-button {
    padding: 6px 12px !important; /* 进一步缩小按钮 */
    font-size: 0.8rem !important;
    border-radius: 10px !important;
  }

  /* 照片墙缩小显示 */
  .photo-wall-hero {
    gap: 6px !important;
    padding: 10px !important;
    width: 95% !important;
    border-width: 10px !important;
    margin: 5px auto !important;
    box-sizing: border-box !important;
  }
  
  .photo-card-hero {
    width: 85px !important; /* 进一步缩小卡片 */
    height: 110px !important;
    margin: 3px !important;
  }
  
  .photo-hero {
    height: 75px !important; /* 缩小图片容器高度 */
  }
  
  .photo-frame-hero {
    padding: 4px !important;
    padding-bottom: 20px !important; /* 缩小底部间距 */
  }
  
  .photo-info-hero h4 {
    font-size: 9px !important;
    bottom: 2px !important;
  }
}

@media (max-width: 480px) {
  .hero-title {
    font-size: clamp(1rem, 6vw, 1.8rem) !important;
  }

  .photo-wall-hero {
    gap: 5px !important;
    padding: 10px !important;
    border-width: 10px !important;
  }
  
  .photo-card-hero {
    width: 75px !important;
    height: 90px !important;
    margin: 2px !important;
  }

  .photo-frame-hero {
    padding: 3px !important;
    padding-bottom: 15px !important;
  }

  .photo-info-hero h4 {
    font-size: 7px !important;
    bottom: 1px !important;
  }
}

/* 最新内容英雄区样式 - 已合并至底部双卡片 */
.news-hero {
  display: none;
}

.news-hero-title {
  font-size: 32px; /* 稍微减小 */
  color: #000;
  margin-bottom: 1rem; /* 进一步减小间距 */
  font-weight: 700;
  text-align: center;
}

/* 最新内容轮播图样式 */
.news-carousel-wrapper {
  display: flex;
  align-items: center;
  gap: 0; /* 去掉翻页按钮后不需要 gap */
  width: 100%;
  max-width: 1600px; /* 增加最大宽度 */
  margin: 0 auto;
  padding: 0 20px;
}

.news-carousel-inner {
  position: relative;
  flex: 1;
  height: auto; /* 改为 auto 让高度自适应内容+边框 */
  min-height: 400px;
  overflow: visible; /* 改为 visible 避免裁剪边框 */
  padding: 5px; /* 添加内边距确保边框显示完整 */
}

.news-card-slide {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  visibility: hidden;
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(50px);
  cursor: pointer;
  
  background: #fff;
  border-radius: 24px; /* 已经有圆角设置 */
  box-shadow: 0 10px 30px rgba(0,0,0,0.08);
  display: flex;
  overflow: hidden;
  border: 2px solid #000; /* 黑色圆角边框 */
}

.news-card-slide.active {
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  position: relative;
}

/* 轮播图指示器 */
.carousel-indicators {
  position: absolute;
  bottom: 20px; /* 确保在框线内 */
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  z-index: 50; /* 确保在卡片之上 */
}

.indicator-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #eee;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #ddd;
}

.indicator-dot.active {
  background: #000;
  width: 24px;
  border-radius: 10px;
  border-color: #000;
}

/* 桌面端更宽的展示 */
@media (min-width: 992px) {
  .news-card-slide {
    flex-direction: row;
    height: 450px; /* 稍微增加高度以配合宽度 */
    width: calc(100% - 10px); /* 留出边框显示空间 */
    margin: 0 auto;
  }
  
  .news-card-slide .news-image {
    width: 60%; /* 增加图片比例，显得更宽 */
    height: 100%;
  }
  
  .news-card-slide .news-content-card {
    width: 40%;
    padding: 60px; /* 增加内边距 */
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
}

/* 移动端全屏卡片样式 */
@media (max-width: 991px) {
  .news-carousel-container {
    padding: 0 !important; /* 占据整个页面宽度 */
  }

  .news-hero-title {
    padding: 0 20px;
  }

  .news-carousel-wrapper {
    gap: 0;
  }

  .carousel-control {
    display: none !important; /* 不需要切换按钮 */
  }

  .news-card-slide {
    flex-direction: column;
    width: 100%;
    border-radius: 24px; /* 移动端也恢复圆角矩形 */
    border: 2px solid #000; /* 恢复四周全边框 */
    box-shadow: none;
    transform: none; /* 简化移动端动画 */
    margin-bottom: 10px;
  }
  
  .news-carousel-inner {
    height: auto;
    min-height: 550px;
  }

  .news-card-slide.active {
    position: relative;
  }

  .news-card-slide .news-image {
    width: 100%;
    height: 280px;
  }
  
  .news-card-slide .news-content-card {
    padding: 30px 20px;
    flex: 1;
  }

  .carousel-indicators {
    bottom: 15px; /* 移动端位置微调 */
    padding-bottom: 0;
  }
}

.carousel-control {
  background: rgba(0, 0, 0, 0.05);
  border: none;
  width: 32px; /* 按钮变小 */
  height: 32px; /* 按钮变小 */
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px; /* 字体相应变小 */
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 10;
  color: #000;
  flex-shrink: 0;
}

.carousel-control:hover {
  background: #000;
  color: #fff;
}

/* 原有的 Newsroom 子元素样式微调 */
.news-image {
  position: relative;
  overflow: hidden;
}

.news-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.news-date {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 6px 16px;
  border-radius: 30px;
  font-size: 13px;
  font-weight: 600;
  backdrop-filter: blur(8px);
}

.news-category-card {
  display: inline-block;
  color: #888;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

.news-excerpt-card {
  color: #555;
  font-size: 16px;
  line-height: 1.7;
  margin-bottom: 30px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-meta-card {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 700;
  color: #333;
}

.news-author-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author-avatar-card {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #000;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

/* 抽奖结果弹窗样式 */
.result-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  animation: fadeIn 0.3s ease;
}

.result-modal-content {
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  text-align: center;
  color: white;
  animation: slideIn 0.3s ease;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
}

.result-modal-close {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  color: white;
  font-size: 28px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.3s ease;
}

.result-modal-close:hover {
  opacity: 1;
}

.result-modal-content h2 {
  font-size: 2rem;
  margin-bottom: 1.5rem;
  margin-top: 0;
  font-weight: 700;
}

.result-modal-content p {
  font-size: 1.2rem;
  margin: 0;
  opacity: 0.9;
}

/* 淡入动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 滑入动画 */
@keyframes slideIn {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 新闻弹窗样式 */
.news-modal {
  display: flex;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 10000;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.modal-content {
  background-color: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 12px;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  animation: modalFadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: translateY(-30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.modal-close {
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.7);
  transition: color 0.3s;
  z-index: 10;
}

.modal-close:hover {
  color: #fff;
}

.modal-body {
  padding: 30px;
}

.modal-image {
  width: 100%;
  height: 300px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 20px;
}

.modal-meta {
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.modal-content-text {
  font-size: 16px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.9);
}

.modal-content-text p {
  margin-bottom: 16px;
}

.modal-content-text strong {
  color: #fff;
  font-weight: 700;
}

.modal-content-text ul {
  padding-left: 20px;
  margin-bottom: 16px;
}

.modal-content-text li {
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
}

.modal-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: white;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .modal-content {
    margin: 0 10px;
    max-height: 95vh;
  }

  .modal-header {
    padding: 20px;
  }

  .modal-body {
    padding: 20px;
  }

  .modal-title {
    font-size: 20px;
    line-height: 1.4;
  }

  .modal-content-text {
    font-size: 15px;
    line-height: 1.9;
  }

  .modal-meta {
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13px;
  }

  .modal-image {
    height: 200px;
  }
}

/* 你可能感兴趣区域 */
.interested-section {
  padding: 40px 20px;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.interested-header {
  width: 100%;
  max-width: 1200px;
  margin-bottom: 20px;
  text-align: center;
}

.interested-title {
  font-size: 32px;
  font-weight: 700;
  color: #000;
}

.interested-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
  width: 100%;
  max-width: 1200px;
}

.interested-card {
  background: #fff;
  border: 2px solid #000;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column; /* 横屏默认竖版 */
  transition: transform 0.3s ease;
}

.interested-card:hover {
  transform: translateY(-10px);
}

.interested-image {
  width: 100%;
  height: 200px;
  background: #f5f5f5;
  overflow: hidden;
}

.interested-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.interested-content {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.interested-content .product-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #000;
}

.interested-content .product-desc {
  font-size: 14px;
  color: #666;
  margin-bottom: 20px;
  line-height: 1.5;
  flex: 1;
}

.product-link {
  display: inline-block;
  padding: 10px 20px;
  background: #000;
  color: #fff;
  text-decoration: none;
  border-radius: 10px;
  font-weight: 600;
  text-align: center;
  transition: background 0.3s ease;
}

.product-link:hover {
  background: #333;
}

/* 全站搜索栏样式 */
.site-search-section {
  padding: 80px 0;
  background: #fbfbfd;
  text-align: center;
}

.search-box-wrapper {
  max-width: 800px;
  margin: 0 auto;
}

.search-title {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 30px;
  color: #1d1d1f;
}

.search-input-group {
  position: relative;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.92); /* 提高不透明度，使其更白 */
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08); /* 稍微减淡边框 */
  border-radius: 20px;
  padding: 10px 25px;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

.search-input-group:focus-within {
  background: #fff;
  border-color: #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.site-search-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 15px;
  font-size: 18px;
  color: #1d1d1f;
  outline: none;
}

.site-search-input::placeholder {
  color: #86868b;
}

.clear-site-search {
  background: none;
  border: none;
  font-size: 24px;
  color: #86868b;
  cursor: pointer;
  padding: 0 10px;
}

.site-search-suggestions {
  position: absolute;
  top: calc(100% + 15px);
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.96); /* 调白背景 */
  backdrop-filter: blur(30px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
  z-index: 100;
  overflow: hidden;
  text-align: left;
}

.site-suggestion-item {
  padding: 20px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.site-suggestion-item:last-child {
  border-bottom: none;
}

.site-suggestion-item:hover {
  background: rgba(0, 0, 0, 0.03);
  padding-left: 35px;
}

.suggestion-info {
  display: flex;
  flex-direction: column;
}

.suggestion-name {
  font-size: 16px;
  font-weight: 600;
  color: #1d1d1f;
  margin-bottom: 4px;
}

.suggestion-desc {
  font-size: 13px;
  color: #86868b;
}

.icon-arrow-right {
  font-size: 18px;
  color: #c7c7cc;
  transition: transform 0.2s;
}

.site-suggestion-item:hover .icon-arrow-right {
  transform: translateX(5px);
  color: #000;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .interested-section {
    padding: 20px 15px;
  }
  
  .interested-title {
    font-size: 24px;
  }
  
  .interested-container {
    grid-template-columns: 1fr; /* 移动端一列 */
    gap: 15px;
  }
  
  .interested-card {
    flex-direction: row; /* 竖屏横版卡片 */
    height: 160px;
    align-items: center;
  }
  
  .interested-image {
    width: 140px;
    height: 100%;
    flex-shrink: 0;
  }
  
  .interested-content {
    padding: 15px;
    overflow: hidden;
  }
  
  .interested-content .product-title {
    font-size: 16px;
    margin-bottom: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .interested-content .product-desc {
    font-size: 12px;
    margin-bottom: 10px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>
