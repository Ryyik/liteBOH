<template>
  <div class="home">
    <!-- 统一导航栏 -->
    <UnifiedNavbar />

    <BirthdayHeroBanner
      v-if="shouldShowBirthdayHero"
      :username="birthdayHeroName"
    />

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
        <button class="anniversary-btn" disabled @click="showAnniversaryLetter = true">
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
            进入社区论坛
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

    <!-- 新年好礼英雄区 -->
    <section class="new-year-hero-section fade-section" v-if="showNewYearHero">
      <div class="new-year-content-container">
        <div class="gift-box-wrapper">
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            class="gift-box-logo">
            <!-- 盒子主体 -->
            <rect x="3" y="8" width="18" height="14" rx="2" stroke="#111" stroke-width="1.5" stroke-linecap="round"
              stroke-linejoin="round" />
            <!-- 盖子 -->
            <path d="M12 8V22" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M2 8H22" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <!-- 蝴蝶结 -->
            <path d="M12 8C12 8 12 3 8 3C5.5 3 4 5 4 6.5C4 7.5 5 8 6 8H12Z" stroke="#FF5252" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round" fill="rgba(255, 82, 82, 0.1)" />
            <path d="M12 8C12 8 12 3 16 3C18.5 3 20 5 20 6.5C20 7.5 19 8 18 8H12Z" stroke="#FF5252" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round" fill="rgba(255, 82, 82, 0.1)" />
            <!-- 装饰 -->
            <path d="M19 14L21 12" stroke="#FFD700" stroke-width="1.5" stroke-linecap="round" />
            <path d="M5 14L3 12" stroke="#FFD700" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="12" cy="15" r="1" fill="#111" />
          </svg>
        </div>
        <h1 class="new-year-title">新年，方块好礼相赠</h1>
        <div class="new-year-divider"></div>
        <div class="countdown-wrapper">
          <p class="new-year-subtitle">抽奖倒计时（2/16）公布</p>
          <div class="countdown-timer">
            <div class="timer-block">
              <span class="timer-value">{{ countdown.days }}</span>
              <span class="timer-label">DAYS</span>
            </div>
            <div class="timer-separator">:</div>
            <div class="timer-block">
              <span class="timer-value">{{ countdown.hours }}</span>
              <span class="timer-label">HOURS</span>
            </div>
            <div class="timer-separator">:</div>
            <div class="timer-block">
              <span class="timer-value">{{ countdown.minutes }}</span>
              <span class="timer-label">MINS</span>
            </div>
            <div class="timer-separator">:</div>
            <div class="timer-block">
              <span class="timer-value">{{ countdown.seconds }}</span>
              <span class="timer-label">SECS</span>
            </div>
          </div>
          <div class="hero-action-buttons">
            <button class="join-btn disabled-btn" disabled>
              抽奖结果已公布
            </button>
            <button class="result-btn" @click="goToGift">
              查看结果
            </button>
          </div>
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
          <img :src="getImageUrl('@/assets/images/main1.webp')" alt="Image 1" fetchpriority="high" decoding="async" />
        </div>
        <div class="image-wrapper i-top-right">
          <img :src="getImageUrl('@/assets/images/main2.webp')" alt="Image 2" fetchpriority="high" decoding="async" />
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
    <!-- 底部双卡片区域 -->
    <section class="bottom-cards-section fade-section" v-if="showBottomCardsSection">
      <div class="bottom-cards-container">
        <!-- 最新内容卡片 -->
        <div class="bottom-card news-card">
          <div class="card-content">
            <h2 class="card-title">当前最新内容</h2>

            <!-- 简化后的新闻展示 -->
            <div class="news-carousel-mini">
              <div v-for="(news, index) in topThreeNews" :key="news.id" class="news-item-mini"
                v-show="currentNewsIndex === index" @click="goToNewsroom">
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
                  <span v-for="(_, index) in topThreeNews" :key="index" class="mini-dot"
                    :class="{ 'active': currentNewsIndex === index }" @click="currentNewsIndex = index"></span>
                </div>
                <button class="pag-btn next" @click.stop="nextNews">→</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 社区里的伙伴区域 (暂时隐藏) -->
    <section v-if="showCommunityPartnersSection" class="community-partners-section fade-section">
      <div class="container">
        <h2 class="section-title">社区里的伙伴们</h2>
        <div class="partners-hero-card glass-card">
          <div class="partners-layout">
            <!-- 左侧：玩家列表 -->
            <div class="partners-list-side">
              <div class="partners-scroll-area">
                <div v-for="partner in communityPartners" :key="partner.username" class="partner-list-item"
                  :class="{ 'active': selectedPartner?.username === partner.username }" @click="selectPartner(partner)">
                  <div class="partner-mini-avatar">
                    <div class="mini-avatar-placeholder">{{ partner.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
                  </div>
                  <span class="partner-list-name">{{ partner.username }}</span>
                </div>
              </div>
            </div>

            <!-- 右侧：玩家详情 -->
            <div class="partner-detail-side">
              <Transition name="fade-slide" mode="out-in">
                <div v-if="selectedPartner" :key="selectedPartner.username" class="partner-detail-content">
                  <div class="partner-detail-header">
                    <div class="partner-big-avatar">
                      <div class="big-avatar-placeholder">{{ selectedPartner.username?.charAt(0)?.toUpperCase?.() || 'U'
                        }}</div>
                    </div>
                    <div class="partner-main-info">
                      <h3 class="partner-name">{{ selectedPartner.username }}</h3>
                      <div class="partner-join-date">加入于 {{ selectedPartner.joinDate }}</div>
                    </div>
                  </div>

                  <div class="partner-detail-body">
                    <div class="detail-section">
                      <h4 class="detail-label">个性标签</h4>
                      <div class="partner-tags">
                        <span v-for="tag in selectedPartner.tags" :key="tag" class="partner-tag">{{ tag }}</span>
                      </div>
                    </div>

                    <div class="detail-section">
                      <h4 class="detail-label">个性签名</h4>
                      <p class="partner-signature">{{ selectedPartner.signature }}</p>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
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

    <!-- 八周年信件弹窗 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="showAnniversaryLetter" class="anniversary-modal-overlay" @click.self="closeAnniversaryLetter">
          <div class="anniversary-modal-card">
            <button class="modal-close-btn" @click="closeAnniversaryLetter">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="anniversary-letter-content">
              <div class="letter-header">
                <img :src="getImageUrl('@/assets/images/8yearstext.webp')" alt="八周年" class="letter-logo-img"
                  loading="lazy" decoding="async" />
                <h2 class="letter-title">来自 Ryyik 的一封信</h2>
              </div>
              <div class="letter-body">
                <p class="letter-paragraph">亲爱的方块之家成员们：</p>
                <p class="letter-paragraph">时光飞逝，转眼间方块之家已经陪伴大家走过了八个年头。</p>
                <p class="letter-paragraph">八年前，我们怀着对 Minecraft
                  的热爱，创建了这个小小的社区。从最初的几个人的服务器，发展到今天拥有数千名成员的大家庭，这一切都离不开每一位成员的支持与陪伴。</p>
                <p class="letter-paragraph">在这里，有人找到了志同道合的朋友，有人收获了珍贵的回忆，有人从新手成长为建筑大师。每一个方块都承载着我们的故事，每一次冒险都记录着我们的成长。</p>
                <p class="letter-paragraph">感谢每一位曾经和现在为方块之家付出的人。感谢管理团队的辛勤工作，感谢创作者们的精彩作品，感谢每一位普通成员的陪伴与支持。</p>
                <p class="letter-paragraph">八周年不是终点，而是新的起点。我们将继续努力，为大家带来更好的游戏体验，创造更多美好的回忆。</p>
                <p class="letter-paragraph">让我们一起期待下一个八年！</p>
                <div class="letter-signature">
                  <p>Ryyik</p>
                  <p class="letter-date">2026年4月</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, defineAsyncComponent } from "vue";
import UnifiedNavbar from "../../components/UnifiedNavbar/index.vue";
import BirthdayHeroBanner from "@/components/BirthdayHeroBanner.vue";
import HomeCatMascot from "@/components/HomeCatMascot.vue";
// 异步组件
const MemberDetailModal = defineAsyncComponent(() => import('../../components/MemberDetailModal.vue'));
import { useRouter } from "vue-router";
import { getImageUrl } from "../../utils/asset-helper.js";
import { getPosts } from "../../utils/api/forum-api.js";
import { getForumPostExcerpt } from "../../utils/forum-post-format.js";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

import {
  teamMembers as teamMembersData
} from "@/data/home.js";

// 路由相关
const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);
const showNewYearHero = false;
const showBottomCardsSection = false;
const showCommunityPartnersSection = false;
const showBirthdayHeroPreview = false;

const shouldShowBirthdayHero = computed(() => showBirthdayHeroPreview);

const birthdayHeroName = computed(() => String(userInfo.value.username || '').trim() || '朋友');

// 新年倒计时逻辑
const countdown = ref({ days: '00', hours: '00', minutes: '00', seconds: '00' });
let countdownInterval = null;

const updateCountdown = () => {
  const targetDate = new Date('2026-02-16T00:00:00').getTime();
  const now = new Date().getTime();
  const distance = targetDate - now;

  if (distance < 0) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdown.value = { days: '00', hours: '00', minutes: '00', seconds: '00' };
    return;
  }

  const days = Math.floor(distance / (1000 * 60 * 60 * 24));
  const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((distance % (1000 * 60)) / 1000);

  countdown.value = {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0')
  };
};

const showJoinGameModal = ref(false);
const showAnniversaryLetter = ref(false);
const showCloudPlusModal = ref(false);

const openCloudPlusModal = () => {
  showCloudPlusModal.value = true;
  document.body.style.overflow = 'hidden';
};

const closeCloudPlusModal = () => {
  showCloudPlusModal.value = false;
  document.body.style.overflow = '';
};

const closeAnniversaryLetter = () => {
  showAnniversaryLetter.value = false;
  document.body.style.overflow = '';
};

const goToGift = () => {
  router.push('/gift');
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



// Site search logic removed

// 最新新闻
const topThreeNews = ref([]);
const currentNewsIndex = ref(0);

const goToNewsroom = () => {
  router.push('/newsroom');
};

const nextNews = () => {
  currentNewsIndex.value = (currentNewsIndex.value + 1) % topThreeNews.value.length;
};

const prevNews = () => {
  currentNewsIndex.value = (currentNewsIndex.value - 1 + topThreeNews.value.length) % topThreeNews.value.length;
};

// 导入新闻 composable
import { initNews, getAllNews } from "../../composables/useNews";

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
  router.push('/forum');
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
  if (showNewYearHero) {
    // 仅在展示新年模块时启动倒计时
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
  }

  // 从 Supabase 初始化新闻数据
  await loadHomeNewsData();

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

// 加载首页新闻数据
const loadHomeNewsData = async () => {
  await initNews();
  if (showBottomCardsSection) {
    topThreeNews.value = getAllNews().slice(0, 3);
  }
};

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval);
  // 清理观察器
  cleanupObserver();
  // 避免弹窗打开时路由切换导致页面滚动被锁定
  document.body.style.overflow = '';
});
</script>

<style scoped src="./style.scoped.1.css"></style>

<style src="./style.global.2.css"></style>
