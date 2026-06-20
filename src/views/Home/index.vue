<template>
  <div class="home">
    <!-- 统一导航栏 -->

    <!-- BOH 小猫主题英雄区域 -->
    <section class="cat-theme-hero">
      <div class="cat-theme-copy">
        <h1 class="cat-theme-title">BOH X 小猫主题</h1>
        <p class="cat-theme-subtitle">快来体验萌萌小猫～</p>
        <router-link
          to="/user-space?tab=profile&view=settings&setting=theme"
          class="cat-theme-action"
        >
          去设置
        </router-link>
      </div>
      <div class="cat-theme-stage" aria-hidden="true">
        <HomeCatMascot class="cat-theme-main-cat" type="theme" size="lg" decorative />
        <HomeCatMascot class="cat-theme-side-cat cat-theme-side-cat-left" type="decorAlt" size="md" decorative />
        <HomeCatMascot class="cat-theme-side-cat cat-theme-side-cat-right" type="like" size="md" decorative />
      </div>
    </section>

    <!-- BOH 设定集英雄区域 - Apple Style -->
    <section class="boh-school-hero">
      <div class="boh-school-container">
        <div class="boh-school-content">
          <h1 class="boh-school-title">方块之家，<br>校园设定集。</h1>
        </div>
        <div class="boh-school-visual">
          <div class="boh-school-image">
            <img :src="getImageUrl('@/assets/images/blockschool.webp')" alt="BOH 方块设定集" fetchpriority="high"
              decoding="async" />
          </div>
        </div>
      </div>
    </section>

    <!-- BOH Cloud+ 英雄区域 - Apple Style -->
    <section class="cloud-plus-hero">
      <div class="cloud-plus-container">
        <div class="cloud-plus-content">
          <h1 class="cloud-plus-title">
            BOH Cloud+，<br>现已推出。
          </h1>
          <div class="cloud-plus-actions">
            <router-link to="/user-space/note" class="apple-btn-primary">
              <span>立即体验</span>
              <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </router-link>
            <button class="apple-btn-secondary" @click="openCloudPlusModal">
              了解更多
            </button>
          </div>
        </div>
        <div class="cloud-plus-visual">
          <div class="cloud-product-image">
            <img :src="getImageUrl('@/assets/images/BOHcloud.webp')" alt="BOH Cloud+" loading="lazy" decoding="async" />
          </div>
        </div>
      </div>
    </section>

    <!-- 八周年英雄区域 - 来自Ryyik的一封信 -->
    <section class="anniversary-hero">
      <div class="anniversary-container">
        <div class="anniversary-logo">
          <img :src="getImageUrl('@/assets/images/8yearstext.webp')" alt="八周年" class="anniversary-logo-img"
            loading="lazy" decoding="async" />
        </div>
        <h2 class="anniversary-title">来自 Ryyik 的一封信</h2>
        <button class="anniversary-btn" disabled>
          即将公布
        </button>
      </div>
    </section>

    <!-- 品牌介绍英雄区域 - Apple Style -->
    <section class="brand-hero-apple">
      <div class="brand-apple-container">
        <div class="brand-apple-content">
          <h1 class="brand-apple-title">
            了解，<br>什么是BOH
          </h1>
          <div class="brand-apple-actions">
            <router-link to="/about" class="apple-btn-primary">
              <span>了解更多</span>
              <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </router-link>
            <router-link to="/join" class="apple-btn-secondary">
              加入我们
            </router-link>
          </div>
        </div>
        <div class="brand-apple-visual">
          <div class="brand-logo-wrapper">
            <img :src="getImageUrl('@/assets/images/favicon.webp')" alt="方块之家" class="brand-logo-img" />
          </div>
        </div>
      </div>
    </section>

    <!-- Halo 英雄区域 - Apple Style -->
    <section class="halo-hero-apple">
      <div class="halo-apple-container">
        <div class="halo-apple-content">
          <h1 class="halo-apple-title">
            Halo，<br>与BOH好礼见个面。
          </h1>
          <div class="halo-apple-actions">
            <router-link to="/shop?product=300" class="apple-btn-primary">
              <span>探索好礼</span>
              <svg class="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </router-link>
            <router-link to="/shop" class="apple-btn-secondary">
              了解更多
            </router-link>
          </div>
        </div>
        <div class="halo-apple-visual">
          <div class="halo-product-image">
            <img :src="getImageUrl('@/assets/images/toybreadproduct.webp')" alt="BOH好礼" />
          </div>
        </div>
      </div>
    </section>

    <!-- 社区动态最新帖子英雄区 -->
    <section class="latest-posts-hero" v-if="latestThreeForumPosts.length > 0 || isPostsLoading">
      <div class="container">
        <div class="section-header">
          <span class="section-tag">COMMUNITY LATEST</span>
          <h2 class="section-title">社区最新动态</h2>
        </div>

        <div v-if="isPostsLoading" class="posts-grid-wrapper" aria-hidden="true">
          <div class="posts-grid mobile-stack latest-posts-skeleton-grid">
            <div v-for="item in 3" :key="`home-post-loading-${item}`" class="post-card-hero post-card-skeleton">
              <div class="post-card-content">
                <div class="post-meta">
                  <div class="post-author-group">
                    <div class="home-skeleton-block post-skeleton-avatar"></div>
                    <div class="home-skeleton-block post-skeleton-author"></div>
                  </div>
                  <div class="home-skeleton-block post-skeleton-date"></div>
                </div>
                <div class="home-skeleton-block post-skeleton-title"></div>
                <div class="home-skeleton-block post-skeleton-line wide"></div>
                <div class="home-skeleton-block post-skeleton-line"></div>
                <div class="post-footer">
                  <div class="home-skeleton-block post-skeleton-link"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="posts-grid-wrapper">
          <div class="posts-grid mobile-stack">
            <div v-for="(post, index) in latestThreeForumPosts" :key="post.id" class="post-card-hero" :class="{
              'active': currentPostIndex === index,
              'prev': latestThreeForumPosts.length > 1 && (currentPostIndex - 1 + latestThreeForumPosts.length) % latestThreeForumPosts.length === index && currentPostIndex !== index,
              'next': latestThreeForumPosts.length > 1 && (currentPostIndex + 1) % latestThreeForumPosts.length === index && currentPostIndex !== index
            }" @click="goToPostDetail(post.id)">
              <div class="post-card-content">
                <div class="post-meta">
                  <div class="post-author-group">
                    <div class="post-author-avatar">
                      <img v-if="post.author_avatar_url" :src="post.author_avatar_url" class="post-avatar-img" />
                      <div v-else class="post-avatar-placeholder">{{ post.username?.charAt(0)?.toUpperCase?.() || 'U' }}
                      </div>
                    </div>
                    <span class="post-author">{{ post.username }}</span>
                  </div>
                  <span class="post-date">{{ post.date }}</span>
                </div>
                <h3 class="post-title">{{ post.title }}</h3>
                <p class="post-excerpt">{{ getPostExcerpt(post) }}</p>
                <div class="post-footer">
                  <span class="view-more">阅读全文 →</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 移动端切换指示器 -->
          <div class="mobile-pagination" v-if="latestThreeForumPosts.length > 1">
            <button class="pag-arrow prev" @click="prevPost">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <div class="pag-dots">
              <span v-for="(_, index) in latestThreeForumPosts" :key="index" class="pag-dot"
                :class="{ 'active': currentPostIndex === index }" @click="currentPostIndex = index"></span>
            </div>
            <button class="pag-arrow next" @click="nextPost">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <div class="hero-actions" v-if="!isPostsLoading">
          <button class="go-forum-btn-large" @click="goToForum">
            进入方块社区
          </button>
        </div>
      </div>
    </section>

    <section class="habitrain">
      <div class="winter-hero-overlay"></div>
      <div class="winter-hero-content">
        <div class="winter-tag">MC狼人杀Game</div>
        <h1 class="winter-title">哈比快车<br>谋杀案</h1>
        <div class="winter-divider"></div>
        <p class="winter-subtitle">方块之家游戏进行中</p>
        <div class="winter-buttons">
          <router-link to="/download" class="winter-btn primary">
            获取下载
          </router-link>
          <button @click="showJoinGameModal = true" class="winter-btn secondary">
            加入游戏
          </button>
        </div>
      </div>
    </section>

    <!-- 拼图展示区 -->
    <section class="interleaved-images-section fade-section">
      <div class="interleaved-hero-copy">
        <h1 class="hero-title">BlockOfHome2026，欢迎你。</h1>
        <div class="hero-buttons">
          <router-link to="/activities" class="hero-button">查看全部活动</router-link>
        </div>
      </div>
      <div class="interleaved-container">
        <div class="image-wrapper i-top-left">
          <img
            :src="getImageUrl('@/assets/images/main1-1280.webp')"
            :srcset="mainHeroSrcset"
            sizes="(max-width: 768px) 92vw, (max-width: 1200px) 52vw, 640px"
            alt="Image 1"
            fetchpriority="high"
            decoding="async"
            width="1280"
            height="854"
          />
        </div>
        <div class="image-wrapper i-top-right">
          <img :src="getImageUrl('@/assets/images/main2.webp')" alt="Image 2" decoding="async" loading="lazy" />
        </div>
        <div class="image-wrapper i-bottom-left">
          <img :src="getImageUrl('@/assets/images/2025-7years.webp')" alt="Image 3" decoding="async" loading="lazy" />
        </div>
        <div class="image-wrapper i-bottom-right">
          <img :src="getImageUrl('@/assets/images/2023-8-nfls.webp')" alt="Image 4" decoding="async" loading="lazy" />
        </div>
        <div class="yellow-bookmark">
          <span class="bookmark-text">方块之家</span>
        </div>
      </div>
    </section>
    <!-- BOH开发团队区域 -->
    <section class="team-section fade-section">
      <div class="container">
        <h2 class="team-title">BOH Developers 鸣谢</h2>
        <div class="team-avatars-container">
          <div v-for="member in teamMembers" :key="member.name" class="member-item" @click="openMemberDetail(member)">
            <div class="member-avatar">
              <img v-if="member.avatar" :src="getImageUrl('developer/' + member.avatar)" :alt="member.name"
                class="avatar-img" loading="lazy" @error="(e) => e.target.style.display = 'none'">
              <div class="avatar-placeholder">
                {{ member.name?.charAt(0) || '?' }}
              </div>
            </div>
            <div class="member-id">{{ member.name }}</div>
          </div>
        </div>
      </div>

      <!-- 开发者详情弹窗 -->
      <MemberDetailModal :show="showMemberDetail" :member="selectedMember" @close="closeMemberDetail" />
    </section>

    <!-- 加入游戏提示弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showJoinGameModal" class="join-game-modal-overlay" @click.self="showJoinGameModal = false">
          <div class="join-game-modal-card">
            <button class="modal-close-btn" @click="showJoinGameModal = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="join-game-content">
              <div class="join-game-icon">🎮</div>
              <h2 class="join-game-title">加入游戏</h2>
              <p class="join-game-desc">该游戏由 BOH 社群驱动，<br>请前往社群加入。</p>
              <div class="join-game-actions">
                <router-link to="/join" class="join-game-btn" @click="showJoinGameModal = false">
                  前往社群
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- BOH Cloud+ 联动功能弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showCloudPlusModal" class="cloud-plus-modal-overlay" @click.self="closeCloudPlusModal">
          <div class="cloud-plus-modal-card">
            <button class="modal-close-btn" @click="closeCloudPlusModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="cloud-plus-modal-content">
              <div class="cloud-plus-modal-header">
                <div class="cloud-plus-modal-icon">☁️</div>
                <h2 class="cloud-plus-modal-title">BOH Cloud+</h2>
                <p class="cloud-plus-modal-subtitle">云端内容，随时可达</p>
              </div>
              <div class="cloud-plus-modal-body">
                <div class="cloud-plus-feature">
                  <div class="feature-icon">☁️</div>
                  <div class="feature-content">
                    <h3 class="feature-title">云端笔记</h3>
                    <p class="feature-desc">记录社群灵感、活动想法和日常内容，跨设备保持同步</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">🗂️</div>
                  <div class="feature-content">
                    <h3 class="feature-title">内容整理</h3>
                    <p class="feature-desc">把笔记、素材和个人内容集中管理，减少分散查找的麻烦</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">🔗</div>
                  <div class="feature-content">
                    <h3 class="feature-title">跨平台同步</h3>
                    <p class="feature-desc">在不同设备间访问你的内容，保持 BOH 相关资料持续在线</p>
                  </div>
                </div>
                <div class="cloud-plus-feature">
                  <div class="feature-icon">📚</div>
                  <div class="feature-content">
                    <h3 class="feature-title">社群资料库</h3>
                    <p class="feature-desc">沉淀值得保存的 BOH 资料，让重要内容不再散落各处</p>
                  </div>
                </div>
              </div>
              <div class="cloud-plus-modal-actions">
                <router-link to="/user-space/note" class="cloud-plus-modal-primary-btn" @click="closeCloudPlusModal">
                  立即体验
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineAsyncComponent } from "vue";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
// 异步组件
const MemberDetailModal = defineAsyncComponent(() => import('../../components/MemberDetailModal.vue'));
import { useRouter } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { getPosts } from "../../utils/api/forum-api.js";
import { getForumPostExcerpt } from "../../utils/forum-post-format.js";

import {
  teamMembers as teamMembersData
} from "@/data/home.js";

// 路由相关
const router = useRouter();
const mainHeroSrcset = [
  `${getImageUrl('@/assets/images/main1-768.webp')} 768w`,
  `${getImageUrl('@/assets/images/main1-1280.webp')} 1280w`,
  `${getImageUrl('@/assets/images/main1-1920.webp')} 1920w`
].join(', ');

const showJoinGameModal = ref(false);
const showCloudPlusModal = ref(false);

const openCloudPlusModal = () => {
  showCloudPlusModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeCloudPlusModal = () => {
  showCloudPlusModal.value = false;
  document.body.style.overflow = '';
};

// 团队成员数据
const teamMembers = ref(teamMembersData);

const selectedMember = ref(null);
const showMemberDetail = ref(false);

const openMemberDetail = (member) => {
  selectedMember.value = member;
  showMemberDetail.value = true;
  document.body.style.overflow = 'hidden';
};

const closeMemberDetail = () => {
  showMemberDetail.value = false;
  document.body.style.overflow = '';
};

// 社区动态最新帖子英雄区
const latestThreeForumPosts = ref([]);
const isPostsLoading = ref(true);
const currentPostIndex = ref(0);

const nextPost = () => {
  currentPostIndex.value = (currentPostIndex.value + 1) % latestThreeForumPosts.value.length;
};

const prevPost = () => {
  currentPostIndex.value = (currentPostIndex.value - 1 + latestThreeForumPosts.value.length) % latestThreeForumPosts.value.length;
};

const fetchLatestPosts = async () => {
  isPostsLoading.value = true;
  try {
    const { data, error } = await getPosts(null, { page: 1, pageSize: 3, limit: 3 });
    if (error) throw error;

    // 适配 Supabase 数据结构到前端模板，并增强空值容错
    const safePosts = Array.isArray(data) ? data : [];
    latestThreeForumPosts.value = safePosts.map((post, index) => ({
      ...post,
      username: post?.author_username || '匿名',
      date: post?.created_at ? String(post.created_at).split('T')[0] : '未知日期',
      id: String(post?.id ?? `fallback-${index}`),
      author_avatar_url: post?.author_avatar_url || ''
    }));

    if (currentPostIndex.value >= latestThreeForumPosts.value.length) {
      currentPostIndex.value = 0;
    }
  } catch (err) {
    console.error('获取最新帖子失败:', err);
    latestThreeForumPosts.value = [];
    currentPostIndex.value = 0;
  } finally {
    isPostsLoading.value = false;
  }
};

// 提取帖子摘要
const getPostExcerpt = (post) => {
  return getForumPostExcerpt(post, 80);
};

// 跳转到帖子详情
const goToPostDetail = (postId) => {
  router.push({
    name: 'PostDetail',
    params: { id: postId }
  });
};

const goToForum = () => {
  router.push('/user-space?tab=posts');
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



onMounted(async () => {
  // 获取最新论坛帖子 (从 Supabase)
  fetchLatestPosts();

  // 初始化AOS动画
  if (typeof AOS !== "undefined") {
    AOS.init({
      duration: 3000,
    });
  }

  // 添加页面加载完成类
  document.body.classList.add("is-loaded");

  // 初始化滚动观察器
  initIntersectionObserver();
});

onUnmounted(() => {
  // 清理观察器
  cleanupObserver();
  // 避免弹窗打开时路由切换导致页面滚动被锁定
  document.body.style.overflow = '';
});
</script>

<style scoped src="./style.scoped.css"></style>
<style src="./style.global.css"></style>
