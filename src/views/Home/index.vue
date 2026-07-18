<template>
  <div class="home">
    <!-- 固定模板 A：独占一行的横屏英雄区 -->
    <HomeHeroRow layout="full" aria-label="方块之家八周年">
      <AnniversaryHero />
    </HomeHeroRow>

    <HomeHeroRow layout="full" aria-label="遇见福州">
      <AppleHeroBanner
        class="fuzhou-hero"
        tag="遇见系列"
        title="Halo，福州。"
        :image-src="fuzhouImg"
        image-alt="福州"
        variant="light"
        card
        :full-bleed-image="true"
        :links="[{ text: '了解活动', type: 'primary', onClick: openFuzhouModal }]"
      />
    </HomeHeroRow>

    <!-- 固定模板 B：两个小英雄区拼成一行 -->
    <HomeHeroRow layout="split" aria-label="主题与游戏">
      <AppleGridCard
        title="BOH X 小猫主题"
        subtitle="快来体验萌萌小猫～"
        variant="light"
        :links="[{ text: '去设置', type: 'primary', to: '/user-space?tab=profile&view=settings&setting=theme' }]"
      >
        <HomeCatMascot class="cat-theme-main-cat" type="theme" size="lg" decorative />
      </AppleGridCard>

      <AppleGridCard
        class="habitrain-grid-card"
        title="哈比快车<br>谋杀案"
        subtitle="方块之家游戏进行中"
        variant="light"
        :image-src="habitrainImg"
        image-alt="哈比快车谋杀案"
        :links="[
          { text: '获取下载', type: 'primary', to: '/download' },
          { text: '加入游戏', type: 'secondary', onClick: () => { showJoinGameModal = true } }
        ]"
      />
    </HomeHeroRow>

    <HomeHeroRow layout="split" aria-label="云端与好礼">
      <AppleGridCard
        title="BOH Cloud+"
        subtitle="云端内容，随时可达"
        variant="light"
        :image-src="bohCloudImg"
        image-alt="BOH Cloud+"
        :links="[
          { text: '立即体验', type: 'primary', to: '/user-space/note' },
          { text: '了解更多', type: 'secondary', onClick: openCloudPlusModal }
        ]"
      />

      <!-- Halo 好礼 -->
      <AppleGridCard
        title="Halo，<br>与BOH好礼见个面。"
        subtitle="探索BOH的精选周边"
        variant="light"
        :image-src="toybreadProductImg"
        image-alt="BOH好礼"
        :links="[
          { text: '探索好礼', type: 'primary', to: '/shop?product=300' },
          { text: '了解更多', type: 'secondary', to: '/shop' }
        ]"
      />
    </HomeHeroRow>

    <HomeHeroRow id="ryyik-letter" layout="split" aria-label="品牌与八周年寄语">
      <AppleGridCard
        title="了解，<br>什么是BOH"
        subtitle="一个属于方块之家的生态平台"
        variant="light"
        :image-src="faviconImg"
        image-alt="方块之家"
        :links="[
          { text: '了解更多', type: 'primary', to: '/about' },
          { text: '加入我们', type: 'secondary', to: '/join' }
        ]"
      />

      <AppleGridCard
        title="来自 Ryyik 的一封信"
        subtitle="方块之家八周年"
        variant="light"
        :links="[{ text: '查看信件', type: 'secondary', onClick: openAnniversaryLetter }]"
      >
        <img
          :src="anniversaryTextImg"
          alt="方块之家八周年"
          class="agc-anniversary-logo"
          loading="lazy"
          decoding="async"
          width="768"
          height="512"
        >
      </AppleGridCard>
    </HomeHeroRow>

    <!-- 社区动态：信息区，标题仍使用大英雄模板 -->
    <section class="community-section">
      <HomeHeroRow layout="full">
        <AppleHeroBanner
          title="社区最新动态"
          subtitle="来自方块社区的最新帖子"
          variant="light"
          card
          :links="[{ text: '进入方块社区', type: 'primary', to: '/user-space?tab=posts' }]"
        />
      </HomeHeroRow>
      <div class="community-posts-wrapper" v-if="latestThreeForumPosts.length > 0 && !isPostsLoading">
        <div class="community-posts">
          <div
            v-for="post in latestThreeForumPosts"
            :key="post.id"
            class="community-post-item"
            @click="goToPostDetail(post.id)"
          >
            <div class="cp-author-group">
              <div class="cp-avatar">
                <img v-if="post.author_avatar_url" :src="post.author_avatar_url" class="cp-avatar-img" />
                <div v-else class="cp-avatar-placeholder">{{ post.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
              </div>
              <span class="cp-author">{{ post.username }}</span>
              <span class="cp-date">{{ post.date }}</span>
            </div>
            <h3 class="cp-title">{{ post.title }}</h3>
            <p class="cp-excerpt">{{ getPostExcerpt(post) }}</p>
          </div>
        </div>
      </div>
      <div class="community-posts-wrapper" v-else-if="isPostsLoading">
        <div class="community-posts community-skeleton">
          <div v-for="item in 3" :key="`cp-loading-${item}`" class="community-post-item cp-skeleton">
            <div class="home-skeleton-block cp-sk-avatar"></div>
            <div class="home-skeleton-block cp-sk-title"></div>
            <div class="home-skeleton-block cp-sk-line"></div>
          </div>
        </div>
      </div>
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

    <!-- 遇见福州 弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showFuzhouModal" class="fuzhou-modal-overlay" @click.self="showFuzhouModal = false">
          <div class="fuzhou-modal-card">
            <button class="modal-close-btn" @click="closeFuzhouModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="fuzhou-modal-content">
              <div class="fuzhou-modal-header">
                <div class="fuzhou-modal-icon">🏮</div>
                <h2 class="fuzhou-modal-title">遇见福州</h2>
              </div>
              <div class="fuzhou-modal-body">
                <p class="fuzhou-modal-paragraph">方块之家遇见系列从7周年开始，现将来到福州。</p>
                <p class="fuzhou-modal-paragraph">福州是一座被茉莉花香浸润的城市。三坊七巷的黛瓦白墙里藏着千年闽都的呼吸，闽江水穿城而过奔赴大海。古榕垂荫下的鱼丸汤冒着热气，石板路上回响着岁月的脚步——有福之州，正用它独有的温度，等待与方块之家的你相遇。</p>
              </div>
              <div class="fuzhou-modal-actions">
                <button class="fuzhou-modal-close-btn" @click="closeFuzhouModal">
                  了解了
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 八周年信件弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAnniversaryLetter" class="anniversary-modal-overlay" @click.self="closeAnniversaryLetter">
          <article class="anniversary-modal-card" role="dialog" aria-modal="true" aria-labelledby="anniversary-letter-title">
            <button class="modal-close-btn" aria-label="关闭信件" @click="closeAnniversaryLetter">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="anniversary-letter-content">
              <header class="letter-header">
                <img :src="anniversaryTextImg" alt="方块之家八周年" class="letter-logo-img" width="768" height="512">
                <h2 id="anniversary-letter-title" class="letter-title">来自 Ryyik 的一封信</h2>
              </header>
              <div class="letter-body">
                <p class="letter-paragraph">亲爱的方块之家成员们：</p>
                <p class="letter-paragraph">时光飞逝，转眼间方块之家已经陪伴大家走过了八个年头。</p>
                <p class="letter-paragraph">八年前，我们怀着对 Minecraft 的热爱，创建了这个小小的社区。从最初几个人的服务器，发展到今天的大家庭，这一切都离不开每一位成员的支持与陪伴。</p>
                <p class="letter-paragraph">在这里，有人找到了志同道合的朋友，有人收获了珍贵的回忆，也有人从新手成长为独当一面的创作者。每一个方块都承载着我们的故事，每一次冒险都记录着我们的成长。</p>
                <p class="letter-paragraph">感谢每一位曾经和现在为方块之家付出的人。感谢管理团队的辛勤工作，感谢创作者们留下的精彩作品，也感谢每一位普通成员始终如一的陪伴与支持。</p>
                <p class="letter-paragraph">八周年不是终点，而是新的起点。我们会继续创造更多值得共同记住的时刻。</p>
                <p class="letter-paragraph">让我们一起期待下一个八年。</p>
                <footer class="letter-signature">
                  <p>Ryyik</p>
                  <p class="letter-date">2026 年 4 月</p>
                </footer>
              </div>
            </div>
          </article>
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
import { nextTick, ref, onMounted, onUnmounted, watch } from "vue";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
import AppleHeroBanner from "@/components/AppleHeroBanner.vue";
import AppleGridCard from "@/components/AppleGridCard.vue";
import HomeHeroRow from "./components/HomeHeroRow.vue";
import AnniversaryHero from "./components/AnniversaryHero.vue";
import { useRoute, useRouter } from "vue-router";
import { getPosts } from "../../utils/api/forum-api.js";
import { getForumPostExcerpt } from "../../utils/forum-post-format.js";

// 静态引入首屏关键图片
import bohCloudImg from "@/assets/images/BOHcloud.webp?url";
import faviconImg from "@/assets/images/favicon.webp?url";
import toybreadProductImg from "@/assets/images/toybreadproduct.webp?url";
import habitrainImg from "@/assets/images/habitrain.webp?url";
import fuzhouImg from "@/assets/images/fuzhou.webp?url";
import anniversaryTextImg from "@/assets/images/8yearstext.webp?url";

// 路由相关
const router = useRouter();
const route = useRoute();

const showJoinGameModal = ref(false);
const showAnniversaryLetter = ref(false);
const showCloudPlusModal = ref(false);

const openAnniversaryLetter = () => {
  showAnniversaryLetter.value = true;
  document.body.style.overflow = 'hidden';
};

const closeAnniversaryLetter = () => {
  showAnniversaryLetter.value = false;
  document.body.style.overflow = '';
};

watch(
  () => route.hash,
  async (hash) => {
    if (hash !== '#ryyik-letter') return;
    await nextTick();
    openAnniversaryLetter();
  },
  { immediate: true },
);

const openCloudPlusModal = () => {
  showCloudPlusModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeCloudPlusModal = () => {
  showCloudPlusModal.value = false;
  document.body.style.overflow = '';
};

// 遇见福州 弹窗
const showFuzhouModal = ref(false);

const openFuzhouModal = () => {
  showFuzhouModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeFuzhouModal = () => {
  showFuzhouModal.value = false;
  document.body.style.overflow = '';
};

// 社区动态最新帖子
const latestThreeForumPosts = ref([]);
const isPostsLoading = ref(true);

const fetchLatestPosts = async () => {
  isPostsLoading.value = true;
  try {
    const { data, error } = await getPosts(null, { page: 1, pageSize: 3, limit: 3 });
    if (error) throw error;

    const safePosts = Array.isArray(data) ? data : [];
    latestThreeForumPosts.value = safePosts.map((post, index) => ({
      ...post,
      username: post?.author_username || '匿名',
      date: post?.created_at ? String(post.created_at).split('T')[0] : '未知日期',
      id: String(post?.id ?? `fallback-${index}`),
      author_avatar_url: post?.author_avatar_url || ''
    }));
  } catch (err) {
    console.error('获取最新帖子失败:', err);
    latestThreeForumPosts.value = [];
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

// 滚动触发的观察器逻辑
let observer = null;

const initIntersectionObserver = () => {
  if (typeof window === "undefined" || !window.IntersectionObserver) return;

  const options = {
    root: null,
    rootMargin: "0px 0px 200px 0px",
    threshold: 0.05,
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        if (entry.target.classList.contains("fade-section")) {
          entry.target.classList.add("visible");
        }
        observer.unobserve(entry.target);
      }
    });
  }, options);

  const elementsToObserve = document.querySelectorAll(".fade-section");
  elementsToObserve.forEach((el) => observer.observe(el));
};

const cleanupObserver = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

onMounted(async () => {
  fetchLatestPosts();

  document.body.classList.add("is-loaded");

  initIntersectionObserver();
});

onUnmounted(() => {
  cleanupObserver();
  document.body.style.overflow = '';
});
</script>

<style scoped src="./style.scoped.css"></style>
<style src="./style.global.css"></style>
