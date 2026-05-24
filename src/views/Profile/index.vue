<template>
  <div class="profile-page">
    <UnifiedNavbar />
    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">

    <div class="profile-container">
      <!-- 1. Header Navigation -->
      <header class="profile-nav-header">
        <div class="header-left-group">
          <button class="back-to-space-btn" @click="router.push('/user-space/profile')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="nav-user-info">
            <h2 class="nav-username">{{ profile?.username || '用户资料' }}</h2>
            <span class="nav-post-count">{{ posts.length }} 帖子</span>
          </div>
        </div>

        <!-- 功能区触发按钮 -->
        <div v-if="isOwnProfile" class="header-right-actions">
          <button class="post-trigger-btn" @click="showPostModal = true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>发帖</span>
          </button>
        </div>
      </header>

      <!-- 2. Profile Content -->
      <main class="profile-main-content custom-scrollbar">
        <div v-if="loading" class="profile-skeleton-wrap" aria-hidden="true">
          <section class="public-profile-skeleton-card">
            <div class="public-profile-skeleton-cover skeleton-item"></div>
            <div class="public-profile-skeleton-body">
              <div class="public-profile-skeleton-avatar skeleton-item"></div>
              <div class="public-profile-skeleton-lines">
                <div class="skeleton-title skeleton-item"></div>
                <div class="skeleton-line medium skeleton-item"></div>
                <div class="skeleton-line long skeleton-item"></div>
                <div class="public-profile-skeleton-chips">
                  <div class="skeleton-action skeleton-item"></div>
                  <div class="skeleton-action skeleton-item"></div>
                  <div class="skeleton-action skeleton-item"></div>
                </div>
              </div>
            </div>
          </section>
          <div class="public-profile-skeleton-feed">
            <div v-for="item in 4" :key="`profile-page-loading-${item}`" class="skeleton-post-card">
              <div class="skeleton-header">
                <div class="skeleton-avatar skeleton-item"></div>
                <div class="skeleton-header-info">
                  <div class="skeleton-username skeleton-item"></div>
                  <div class="skeleton-time skeleton-item"></div>
                </div>
              </div>
              <div class="skeleton-content">
                <div class="skeleton-title skeleton-item"></div>
                <div class="skeleton-line long skeleton-item"></div>
                <div class="skeleton-line medium skeleton-item"></div>
                <div class="skeleton-line short skeleton-item"></div>
              </div>
              <div class="skeleton-actions">
                <div class="skeleton-action skeleton-item"></div>
                <div class="skeleton-action skeleton-item"></div>
                <div class="skeleton-action skeleton-item"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!profile" class="profile-not-found">
          <div class="not-found-content">
            <h2>此账号不存在</h2>
            <p>请尝试搜索其他内容。</p>
          </div>
        </div>

        <div v-else class="profile-detail-wrap">
          <!-- Banner -->
          <div class="profile-banner"></div>

          <!-- Profile Info Area -->
          <div class="profile-info-section">
            <div class="profile-header-actions">
              <div v-if="isOwnProfile" class="profile-avatar-large clickable" @click="handleAvatarClick">
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" loading="lazy" decoding="async" />
                <div v-else class="avatar-placeholder">{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
                <div class="avatar-edit-icon-profile">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M23 19C23 21.2091 21.2091 23 19 23H5C2.79086 23 1 21.2091 1 19V8C1 5.79086 2.79086 4 5 4H9L11 1H13L15 4H19C21.2091 4 23 5.79086 23 8V19Z"
                      stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="12" cy="13" r="4" stroke="white" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </div>
              </div>
              <div v-else class="profile-avatar-large">
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" loading="lazy" decoding="async" />
                <div v-else class="avatar-placeholder">{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
              </div>

              <button v-if="isOwnProfile" class="edit-profile-btn" @click="openEditModal">
                编辑资料
              </button>
              <div v-else class="others-profile-actions">
                <button class="message-profile-btn" @click="openMailbox(profile.username)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </button>
                <button class="add-impression-btn-top" @click="openImpressionModal">
                  添加印象
                </button>
              </div>
            </div>

            <div class="user-meta-block">
              <h1 class="display-name">
                <span>{{ profile.username }}</span>
                <span class="level-badge" :title="`等级 ${levelInfo.level}`">Lv.{{ levelInfo.level }}</span>
              </h1>
              <span class="handle-name">@{{ profile.username }}</span>
            </div>

            <!-- XP Progress Bar -->
            <div class="xp-container">
              <div class="xp-header">
                <span class="xp-label">社区经验</span>
                <span class="xp-value">{{ levelInfo.currentLevelXP }} / {{ levelInfo.nextLevelXP }}</span>
              </div>
              <div class="xp-progress-bar">
                <div class="xp-progress-fill" :style="{ width: levelInfo.progress + '%' }"></div>
              </div>
            </div>

            <div class="user-bio" v-if="profile.bio">
              {{ profile.bio }}
            </div>
            <div class="user-bio empty-bio" v-else-if="isOwnProfile">
              点击编辑资料，向大家介绍一下自己吧。
            </div>

            <div class="user-extra-info">
              <span class="info-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {{ formatDate(profile.join_date) }} 加入
              </span>
              <span class="info-item" v-if="profile.join_date">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path
                    d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z">
                  </path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                方块年龄 {{ calculateBlockAge(profile.join_date) }} 天
              </span>
              <span class="info-item" v-if="profile.birth_month && profile.birth_day">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"></path>
                  <path d="M4 16h16"></path>
                  <path d="M12 11V7"></path>
                  <path d="M12 7c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"></path>
                </svg>
                {{ profile.birth_month }}月{{ profile.birth_day }}日 生日
              </span>
              <button
                v-for="binding in creatorBindings"
                :key="`extra-platform-tag-${binding.key}`"
                type="button"
                class="info-item creator-platform-info-tag"
                @click="openCreatorBindingHomepage(binding)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 3h7v7"></path>
                  <path d="M10 14L21 3"></path>
                  <path d="M21 14v7h-7"></path>
                  <path d="M3 10L14 21"></path>
                </svg>
                {{ binding.label }}{{ isOwnProfile && binding.visibility === 'private' ? '（私密）' : '' }}主页
              </button>
            </div>

            <div class="user-stats">
              <span class="stat-item"><b>{{ posts.length }}</b> 帖子</span>
              <span class="stat-item"><b>{{ profile.points || 0 }}</b> 积分</span>
            </div>
          </div>

          <!-- Tabs -->
          <div class="profile-tabs">
            <button class="tab-item" :class="{ active: activeTab === 'posts' }" @click="setActiveTab('posts')">
              帖子
              <div class="tab-indicator"></div>
            </button>
            <button class="tab-item" :class="{ active: activeTab === 'replies' }" @click="setActiveTab('replies')">
              回复
              <div class="tab-indicator"></div>
            </button>
            <button class="tab-item" :class="{ active: activeTab === 'impressions' }"
              @click="setActiveTab('impressions')">
              印象
              <div class="tab-indicator"></div>
            </button>
          </div>

          <!-- Tab Content -->
          <div class="tab-content-list">
            <!-- Posts List -->
            <div v-if="activeTab === 'posts'" class="posts-list">
              <section v-if="showcasePosts.length > 0 || (isOwnProfile && posts.length > 0)" class="profile-showcase-section">
                <div class="showcase-header">
                  <h3>代表作置顶</h3>
                  <span>{{ showcasePosts.length }}/3</span>
                </div>
                <p v-if="showcasePosts.length === 0" class="showcase-empty-tip">
                  你还没有设置置顶帖子，点击帖子右上角的“置顶”即可展示代表作。
                </p>
                <div v-else class="showcase-list">
                  <article v-for="post in showcasePosts" :key="`showcase-${post.id}`" class="showcase-item"
                    @click="navigateToPost(post.id)">
                    <div class="showcase-item-header">
                      <h4>{{ post.title || '无标题' }}</h4>
                      <button v-if="isOwnProfile" class="showcase-unpin-btn" @click.stop="toggleShowcasePost(post)">
                        取消置顶
                      </button>
                    </div>
                    <p>{{ post.content }}</p>
                  </article>
                </div>
              </section>

              <div v-if="isTabLoading.posts && posts.length === 0" class="profile-feed-skeleton" aria-hidden="true">
                <div v-for="item in 3" :key="`posts-loading-${item}`" class="profile-feed-skeleton-item">
                  <div class="profile-skeleton-block profile-feed-avatar"></div>
                  <div class="profile-feed-skeleton-body">
                    <div class="profile-skeleton-block profile-feed-line name"></div>
                    <div class="profile-skeleton-block profile-feed-line title"></div>
                    <div class="profile-skeleton-block profile-feed-line text"></div>
                    <div class="profile-skeleton-block profile-feed-line short"></div>
                  </div>
                </div>
              </div>
              <div v-else-if="posts.length === 0" class="empty-list-state">
                <h3>暂无发布过的帖子</h3>
                <p>发布的帖子会出现在这里。</p>
                <button v-if="isOwnProfile" class="empty-action-btn" @click="showPostModal = true">立即发帖</button>
                <button v-else class="empty-action-btn" @click="router.push('/forum')">去社区看看</button>
              </div>
              <article v-for="post in posts" :key="post.id" class="feed-item public-profile-post-card"
                :class="{ 'text-only': !getProfilePostCover(post) }" @click="navigateToPost(post.id)">
                <div v-if="getProfilePostCover(post)" class="public-profile-post-cover">
                  <img :src="getProfilePostCover(post)" :alt="post.title || '帖子图片'" loading="lazy" decoding="async">
                </div>
                <div class="item-avatar">
                  <div class="avatar-mini">
                    <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" class="avatar-mini-img"
                      loading="lazy" decoding="async" />
                    <span v-else>{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                  </div>
                </div>
                <div class="item-main">
                  <div v-if="isOwnProfile" class="item-header-actions">
                    <button class="pin-post-btn" @click.stop="toggleShowcasePost(post)"
                      :disabled="!isShowcasedPost(post.id) && showcasePosts.length >= 3">
                      {{ isShowcasedPost(post.id) ? '已置顶' : '置顶' }}
                    </button>
                  </div>
                  <div class="item-header">
                    <span class="item-author">{{ profile.username }}</span>
                    <span class="item-handle">@{{ profile.username }} · {{ formatProfilePostDate(post) }}</span>
                  </div>
                  <div class="item-title" v-if="post.title">{{ post.title }}</div>
                  <div class="item-text">{{ getProfilePostSummary(post) }}</div>
                  <div class="item-footer-actions">
                    <span class="action-stat"><span class="icon">💬</span> {{ post.comment_count }}</span>
                    <span class="action-stat"><span class="icon">❤️</span> {{ post.like_count }}</span>
                  </div>
                </div>
              </article>
              <div v-if="posts.length > 0 && hasMorePosts" class="list-load-more-wrap">
                <button class="load-more-btn" :disabled="isTabLoading.posts" @click="loadMorePosts">
                  {{ isTabLoading.posts ? '加载中...' : '加载更多帖子' }}
                </button>
              </div>
            </div>

            <!-- Replies List -->
            <div v-if="activeTab === 'replies'" class="replies-list">
              <div v-if="isTabLoading.replies && comments.length === 0" class="profile-feed-skeleton" aria-hidden="true">
                <div v-for="item in 3" :key="`replies-loading-${item}`" class="profile-feed-skeleton-item">
                  <div class="profile-skeleton-block profile-feed-avatar"></div>
                  <div class="profile-feed-skeleton-body">
                    <div class="profile-skeleton-block profile-feed-line name"></div>
                    <div class="profile-skeleton-block profile-feed-line title"></div>
                    <div class="profile-skeleton-block profile-feed-line text"></div>
                    <div class="profile-skeleton-block profile-feed-line short"></div>
                  </div>
                </div>
              </div>
              <div v-else-if="comments.length === 0" class="empty-list-state">
                <h3>暂无回复</h3>
                <p>对他人的回复会出现在这里。</p>
                <button class="empty-action-btn" @click="router.push('/forum')">去社区互动</button>
              </div>
              <article v-for="comment in comments" :key="comment.id" class="feed-item reply-item">
                <div class="item-avatar">
                  <div class="avatar-mini">
                    <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" class="avatar-mini-img"
                      loading="lazy" decoding="async" />
                    <span v-else>{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                  </div>
                </div>
                <div class="item-main">
                  <div class="item-header">
                    <span class="item-author">{{ profile.username }}</span>
                    <span class="item-handle">@{{ profile.username }} · {{ formatTime(comment.created_at) }}</span>
                  </div>
                  <div class="replying-to">
                    回复 <span class="mention">@{{ comment.post?.author_username || '未知用户' }}</span>
                  </div>
                  <div class="item-text">{{ comment.content }}</div>
                  <div class="quoted-post" v-if="comment.post" @click="navigateToPost(comment.post_id)">
                    <p class="quoted-text">{{ comment.post.content?.substring(0, 100) }}...</p>
                  </div>
                </div>
              </article>
              <div v-if="comments.length > 0 && hasMoreComments" class="list-load-more-wrap">
                <button class="load-more-btn" :disabled="isTabLoading.replies" @click="loadMoreComments">
                  {{ isTabLoading.replies ? '加载中...' : '加载更多回复' }}
                </button>
              </div>
            </div>

            <!-- Impressions List -->
            <div v-if="activeTab === 'impressions'" class="impressions-list-tab">
              <div v-if="isTabLoading.impressions && impressions.length === 0" class="impression-skeleton-grid"
                aria-hidden="true">
                <div v-for="item in 6" :key="`impression-loading-${item}`" class="impression-skeleton-card">
                  <div class="profile-skeleton-block impression-skeleton-line text"></div>
                  <div class="profile-skeleton-block impression-skeleton-line short"></div>
                  <div class="profile-skeleton-block impression-skeleton-footer"></div>
                </div>
              </div>
              <!-- 词云展示区 -->
              <div v-if="impressions.length > 0" class="word-cloud-section">
                <div class="word-cloud-header">
                  <h3 class="word-cloud-title">印象词云</h3>
                  <span class="word-cloud-subtitle">基于 {{ impressions.length }} 条印象生成</span>
                </div>
                <WordCloud :words="wordCloudData" :height="200" />
              </div>

              <!-- 添加印象 (非本人且已登录) -->
              <div v-if="!isOwnProfile && isLoggedIn" class="add-impression-section">
                <textarea v-model="newImpressionContent" placeholder="写下你对 TA 的印象..." rows="3"
                  maxlength="100"></textarea>
                <div class="add-imp-actions">
                  <span class="char-hint">{{ newImpressionContent.length }}/100</span>
                  <button class="submit-imp-btn" :disabled="!newImpressionContent.trim() || submittingImpression"
                    @click="handleSubmitImpression">
                    {{ submittingImpression ? '发布中...' : '发布印象' }}
                  </button>
                </div>
              </div>

              <div v-if="!isTabLoading.impressions && impressions.length === 0" class="empty-list-state">
                <h3>暂无他人印象</h3>
                <p>关于 {{ profile.username }} 的评价会出现在这里。</p>
              </div>
              <div v-if="impressions.length > 0" class="impressions-wall-profile">
                <div v-for="imp in impressions" :key="imp.id" class="impression-card-profile">
                  <p class="imp-text">{{ imp.content }}</p>
                  <div class="imp-footer">
                    <span class="imp-author" @click="goToProfileRoute(imp.author?.username)">
                      @{{ imp.author?.username || '匿名' }}
                    </span>
                    <div class="imp-footer-right">
                      <span class="imp-date">{{ formatTime(imp.created_at) }}</span>
                      <button v-if="canDeleteImpression(imp)" class="delete-imp-btn"
                        @click="handleDeleteImpression(imp)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2">
                          <polyline points="3,6 5,6 21,6"></polyline>
                          <path d="M19,6v14a2,2 0,0,1,-2,2H7a2,2 0,0,1,-2,-2V6m3,0V4a2,2 0,0,1,2,-2h4a2,2 0,0,1,2,2v2">
                          </path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div v-if="impressions.length > 0 && hasMoreImpressions" class="list-load-more-wrap">
                  <button class="load-more-btn" :disabled="isTabLoading.impressions" @click="loadMoreImpressions">
                    {{ isTabLoading.impressions ? '加载中...' : '加载更多印象' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Edit Profile Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
          <div class="edit-profile-modal glass-card">
            <header class="modal-header">
              <div class="modal-header-left">
                <button class="close-btn" @click="closeEditModal">×</button>
                <h3>编辑资料</h3>
              </div>
              <button class="save-btn" @click="handleSaveProfile" :disabled="saving">
                {{ saving ? '保存中...' : '保存' }}
              </button>
            </header>
            <div class="modal-body custom-scrollbar">
              <div class="edit-banner-preview"></div>
              <div class="edit-avatar-preview">
                <div v-if="isOwnProfile" class="avatar-circle clickable" @click="handleAvatarClick">
                  <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" class="edit-avatar-img" />
                  <span v-else>{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                  <div class="avatar-edit-icon-modal">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M23 19C23 21.2091 21.2091 23 19 23H5C2.79086 23 1 21.2091 1 19V8C1 5.79086 2.79086 4 5 4H9L11 1H13L15 4H19C21.2091 4 23 5.79086 23 8V19Z"
                        stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                      <circle cx="12" cy="13" r="4" stroke="white" stroke-width="2" stroke-linecap="round"
                        stroke-linejoin="round" />
                    </svg>
                  </div>
                </div>
                <div v-else class="avatar-circle">
                  <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" class="edit-avatar-img" />
                  <span v-else>{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                </div>
              </div>

              <div class="edit-form-grid">
                <div class="form-group span-2">
                  <label>用户名</label>
                  <input type="text" v-model="editUsername" placeholder="您的用户名" maxlength="20" class="date-input-v2">
                  <div class="char-count">{{ editUsername.length }}/20</div>
                </div>

                <div class="form-group span-2">
                  <label>个人简介</label>
                  <textarea v-model="editBio" placeholder="填写您的个人简介..." rows="4" maxlength="160"></textarea>
                  <div class="char-count">{{ editBio.length }}/160</div>
                </div>

                <div class="form-group">
                  <label>入群时间</label>
                  <input type="date" v-model="editJoinDate" class="date-input-v2">
                </div>

                <div class="form-group">
                  <label>生日 (月/日)</label>
                  <div class="birthday-inputs">
                    <select v-model="editBirthMonth" class="date-select-v2">
                      <option value="" disabled>月</option>
                      <option v-for="m in 12" :key="m" :value="String(m)">{{ m }}月</option>
                    </select>
                    <select v-model="editBirthDay" class="date-select-v2">
                      <option value="" disabled>日</option>
                      <option v-for="d in 31" :key="d" :value="String(d)">{{ d }}日</option>
                    </select>
                  </div>
                </div>

                <div class="form-group span-2 creator-verification-group">
                  <div class="creator-verification-header">
                    <label>社交平台展示</label>
                    <button type="button" class="creator-verification-toggle"
                      :class="{ active: editCreatorEnabled }" @click="toggleCreatorVerification">
                      {{ editCreatorEnabled ? '关闭展示' : '开启展示' }}
                    </button>
                  </div>
                  <p class="creator-verification-tip">开启后可绑定你的社交平台 ID，并在个人主页展示平台 Tag；关闭后会清空已填写的平台 ID。</p>

                  <div v-if="editCreatorEnabled" class="creator-platform-selector">
                    <label v-for="platform in creatorPlatformsMeta" :key="platform.key" class="creator-platform-chip">
                      <input v-model="editCreatorPlatforms[platform.key]" type="checkbox">
                      <span>{{ platform.label }}</span>
                    </label>
                  </div>

                  <div v-if="editCreatorEnabled && selectedCreatorPlatforms.length > 0" class="creator-platform-fields">
                    <div v-for="platform in selectedCreatorPlatforms" :key="platform.key" class="creator-id-input-row">
                      <div class="creator-id-input-row-header">
                        <label>{{ platform.label }}账号 ID</label>
                        <button type="button" class="creator-platform-jump-btn"
                          @click="openCreatorPlatformPage(platform.key, editCreatorIds[platform.key])">
                          {{ String(editCreatorIds[platform.key] || '').trim() ? '查看账号页' : '打开平台' }}
                        </button>
                      </div>
                      <div class="creator-visibility-row">
                        <span>可见性</span>
                        <select v-model="editCreatorVisibility[platform.key]" class="creator-visibility-select">
                          <option value="public">公开</option>
                          <option value="private">仅自己可见</option>
                        </select>
                      </div>
                      <input v-model="editCreatorIds[platform.key]" type="text" maxlength="64"
                        :placeholder="platform.placeholder" class="date-input-v2 creator-id-input">
                    </div>
                  </div>
                  <div v-if="editCreatorEnabled && selectedCreatorPlatforms.length > 1" class="creator-order-wrap">
                    <div class="creator-order-title">展示顺序（拖拽调整）</div>
                    <div class="creator-order-list">
                      <div v-for="platform in selectedCreatorPlatforms" :key="`order-${platform.key}`"
                        class="creator-order-item" draggable="true" @dragstart="handlePlatformOrderDragStart(platform.key)"
                        @dragover.prevent @drop.prevent="handlePlatformOrderDrop(platform.key)">
                        <span class="creator-order-handle">⋮⋮</span>
                        <span>{{ platform.label }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="editCreatorEnabled && selectedCreatorPlatforms.length === 0" class="creator-platform-empty">
                    请至少选择一个平台并填写账号 ID。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Unified Alert Modal -->
    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />

    <!-- Avatar Crop Modal -->
    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
      @confirm="handleCropConfirm" />

    <!-- 发帖弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPostModal" class="modal-overlay" @click.self="showPostModal = false">
          <div class="post-create-modal glass-card">
            <header class="modal-header">
              <div class="modal-header-left">
                <button class="close-btn" @click="showPostModal = false">×</button>
                <h3>发布新动态</h3>
              </div>
              <button class="save-btn" @click="handleCreatePost" :disabled="!postContent.trim() || isSubmittingPost">
                {{ isSubmittingPost ? '发布中...' : '发布' }}
              </button>
            </header>
            <div class="modal-body">
              <input v-model="postTitle" placeholder="输入标题 (可选)" class="post-title-input" maxlength="100">
              <textarea v-model="postContent" placeholder="有什么新鲜事想分享？" rows="6" maxlength="1000"
                class="post-textarea-large"></textarea>
              <div class="post-modal-footer">
                <span class="char-count">{{ postContent.length }}/1000</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';

const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const { updateUserProfile } = authStore;
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import WordCloud from '@/components/WordCloud.vue';
import { supabase } from '@/utils/supabase-client.js';
import {
  getProfileByUsername,
  getPostsByUsername,
  getPostsByIds,
  getCommentsByUsername,
  getUserImpressions,
  addUserImpression,
  deleteUserImpression,
  updateProfileAvatar
} from '@/utils/api/profile-api.js';
import { createPost } from '@/utils/api/forum-api.js';
import { formatSmartTime } from '@/utils/time.js';
import { getLevelInfo } from '@/utils/xp.js';
import imageCompression from 'browser-image-compression';
import {
  buildCreatorPlatformJumpUrl,
  CREATOR_PLATFORM_KEYS,
  creatorPlatformLabelMap,
  creatorPlatformsMeta,
  normalizeCreatorPlatformIds
} from './creatorPlatforms.js';

const router = useRouter();
const route = useRoute();
const CREATOR_VISIBILITY_VALUES = new Set(['public', 'private']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_EDIT_DRAFT_KEY_PREFIX = 'boh_profile_edit_draft_v1_';

const normalizeCreatorPlatformVisibility = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = {};
  const keySet = new Set(availableKeys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key)) continue;
    const value = String(raw[key] || '').trim().toLowerCase();
    normalized[key] = CREATOR_VISIBILITY_VALUES.has(value) ? value : 'public';
  }
  return normalized;
};

const normalizeCreatorPlatformOrder = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  const list = Array.isArray(raw) ? raw : [];
  const keySet = new Set(availableKeys);
  const seen = new Set();
  const normalized = [];

  for (const item of list) {
    const key = String(item || '').trim();
    if (!CREATOR_PLATFORM_KEYS.includes(key)) continue;
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
};

const normalizeShowcasePostIds = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const ids = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || seen.has(id) || !UUID_REGEX.test(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 3) break;
  }
  return ids;
};

const openCreatorPlatformPage = (platformKey, rawAccountId) => {
  const url = buildCreatorPlatformJumpUrl(platformKey, rawAccountId);
  if (!url) {
    showAlert('error', '跳转失败', '暂不支持该平台的快捷跳转');
    return;
  }

  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    showAlert('warning', '跳转受限', '浏览器阻止了新窗口，请允许弹窗后重试');
  }
};

const fetchedProfile = ref(null);
const ownProfileSnapshot = ref({
  username: '',
  bio: '',
  avatar_url: '',
  join_date: '',
  points: 0,
  birth_month: '',
  birth_day: '',
  experience: 0,
  tags: [],
  is_boh_creator: false,
  creator_platform_ids: {},
  creator_platform_visibility: {},
  creator_platform_order: [],
  showcase_post_ids: [],
  id: ''
});
const profileFetchVersion = ref(0);
const PROFILE_PAGE_SIZE = 15;
const PROFILE_SYNC_MIN_INTERVAL_MS = 1200;
let lastProfileSyncAt = 0;
let profileFetchInflight = null;
let profileFetchInflightUsername = '';

const profile = computed(() => {
  return isOwnProfile.value ? ownProfileSnapshot.value : fetchedProfile.value;
});

const selectedCreatorPlatforms = computed(() => {
  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  const orderedKeys = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
  return orderedKeys
    .map((key) => creatorPlatformsMeta.find((platform) => platform.key === key))
    .filter(Boolean);
});

const creatorBindings = computed(() => {
  const normalized = normalizeCreatorPlatformIds(profile.value?.creator_platform_ids);
  const normalizedVisibility = normalizeCreatorPlatformVisibility(
    profile.value?.creator_platform_visibility,
    Object.keys(normalized)
  );
  const normalizedOrder = normalizeCreatorPlatformOrder(
    profile.value?.creator_platform_order,
    Object.keys(normalized)
  );

  const ordered = normalizedOrder.map((key) => creatorPlatformsMeta.find((platform) => platform.key === key)).filter(Boolean);
  return creatorPlatformsMeta
    .filter((platform) => normalized[platform.key])
    .map((platform) => ({
      key: platform.key,
      label: platform.label,
      id: normalized[platform.key],
      visibility: normalizedVisibility[platform.key] || 'public'
    }))
    .sort((a, b) => {
      const indexA = ordered.findIndex((item) => item.key === a.key);
      const indexB = ordered.findIndex((item) => item.key === b.key);
      return indexA - indexB;
    })
    .filter((binding) => isOwnProfile.value || binding.visibility === 'public');
});

const formatTime = formatSmartTime;

const stopWords = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '那', '他', '她', '它', '们', '这个', '那个', '什么', '怎么',
  '为什么', '哪', '哪里', '哪个', '如何', '但', '但是', '而', '而且', '或', '或者',
  '因为', '所以', '如果', '虽然', '可以', '可能', '应该', '能', '能够', '还',
  '还是', '只', '只是', '只有', '就是', '不是', '没', '真的', '非常', '太',
  '更', '最', '比较', '相当', '特别', '十分', '有点', '一些', '一点', '很多',
  '许多', '这样', '那样', '怎样', '多么', '多少', '几', '第', '让', '把', '被',
  '给', '向', '从', '对', '与', '及', '等', '等等', '之', '其', '此', '彼',
  '啊', '呢', '吧', '吗', '呀', '哦', '嗯', '哈', '呵', '嘿', '哎', '唉',
  '哇', '噢', '咦', '嘘', '哼', '嘛', '罢', '啦', '嘞', '喽', '咯', '咧'
]);

const segmentText = (text) => {
  const words = [];
  const segments = text.split(/[\s,，。！？!?.;；：:""''「」【】()（）\[\]{}、\n\r\t]+/);

  for (const segment of segments) {
    if (segment.length === 0) continue;

    if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
      let i = 0;
      while (i < segment.length) {
        let matched = false;
        for (let len = 4; len >= 2; len--) {
          if (i + len <= segment.length) {
            const word = segment.substring(i, i + len);
            if (!stopWords.has(word)) {
              words.push(word);
              i += len;
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          const char = segment[i];
          if (!stopWords.has(char) && /[\u4e00-\u9fa5]/.test(char)) {
            words.push(char);
          }
          i++;
        }
      }
    } else if (/^[a-zA-Z]+$/.test(segment)) {
      const lowerWord = segment.toLowerCase();
      if (lowerWord.length >= 2 && !stopWords.has(lowerWord)) {
        words.push(lowerWord);
      }
    }
  }

  return words;
};

const wordCloudData = computed(() => {
  if (impressions.value.length === 0) return [];

  const wordCount = new Map();

  for (const imp of impressions.value) {
    if (!imp.content) continue;
    const words = segmentText(imp.content);
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  }

  const sortedWords = Array.from(wordCount.entries())
    .map(([text, count]) => ({ text, count }))
    .filter(item => item.count >= 1 && item.text.length >= 2)
    .sort((a, b) => b.count - a.count);

  const filtered = [];
  const seen = new Set();

  for (const word of sortedWords) {
    let shouldAdd = true;
    for (const existing of filtered) {
      if (existing.text.includes(word.text) || word.text.includes(existing.text)) {
        if (existing.count >= word.count) {
          shouldAdd = false;
          break;
        } else {
          const idx = filtered.indexOf(existing);
          filtered.splice(idx, 1);
          seen.delete(existing.text);
        }
      }
    }
    if (shouldAdd && !seen.has(word.text)) {
      filtered.push(word);
      seen.add(word.text);
    }
    if (filtered.length >= 30) break;
  }

  return filtered;
});

const normalizeProfileText = (value, fallback = '') => {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
};

const getProfilePostCover = (post = {}) => {
  const cover = String(post.cover_image_url || '').trim();
  if (cover) return cover;
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  return String(firstImage?.url || firstImage?.originalUrl || '').trim();
};

const getProfilePostSummary = (post = {}) => {
  const body = normalizeProfileText(post.content || post.body, '');
  return body.length > 88 ? `${body.slice(0, 88)}...` : (body || '暂无正文');
};

const formatProfilePostDate = (post = {}) => {
  const rawDate = post.created_at || post.createdAt || post.published_at || post.updated_at || '';
  if (!rawDate) return '刚刚';
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return String(rawDate).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

// 等级信息计算
const levelInfo = computed(() => getLevelInfo(profile.value.experience || 0));

const posts = ref([]);
const comments = ref([]);
const impressions = ref([]);
const normalizedShowcaseIds = computed(() => normalizeShowcasePostIds(profile.value?.showcase_post_ids));
const showcasePostsById = computed(() => {
  const map = new Map();
  for (const post of showcasePostsFetched.value) {
    if (!post?.id) continue;
    map.set(post.id, post);
  }
  for (const post of posts.value) {
    if (!post?.id) continue;
    map.set(post.id, post);
  }
  return map;
});
const showcasePostsOrdered = computed(() => normalizedShowcaseIds.value
  .map((id) => showcasePostsById.value.get(id))
  .filter(Boolean)
);
const showcasePosts = computed(() => showcasePostsOrdered.value);
const loading = ref(true);
const activeTab = ref('posts');
const isTabLoading = reactive({
  posts: false,
  replies: false,
  impressions: false
});
const tabLoaded = reactive({
  posts: false,
  replies: false,
  impressions: false
});
const postsPage = ref(1);
const commentsPage = ref(1);
const impressionsPage = ref(1);
const hasMorePosts = ref(true);
const hasMoreComments = ref(true);
const hasMoreImpressions = ref(true);

// 印象墙相关
const newImpressionContent = ref('');
const submittingImpression = ref(false);

// 发帖相关
const showPostModal = ref(false);
const postTitle = ref('');
const postContent = ref('');
const isSubmittingPost = ref(false);

const showEditModal = ref(false);
const editUsername = ref('');
const editBio = ref('');
const editJoinDate = ref('');
const editBirthMonth = ref('');
const editBirthDay = ref('');
const editCreatorEnabled = ref(false);
const editCreatorPlatforms = reactive({
  bilibili: false,
  xiaohongshu: false,
  douyin: false
});
const editCreatorIds = reactive({
  bilibili: '',
  xiaohongshu: '',
  douyin: ''
});
const editCreatorVisibility = reactive({
  bilibili: 'public',
  xiaohongshu: 'public',
  douyin: 'public'
});
const editCreatorOrder = ref([]);
const platformOrderDraggingKey = ref('');
const showcasePostsFetched = ref([]);
const saving = ref(false);
const avatarInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const isProcessingCrop = ref(false);

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const isOwnProfile = computed(() => {
  return isLoggedIn.value && userInfo.value.username === route.params.username;
});

const syncOwnProfileSnapshot = () => {
  ownProfileSnapshot.value = {
    username: userInfo.value.username,
    bio: userInfo.value.bio || '',
    avatar_url: userInfo.value.avatarUrl || '',
    join_date: userInfo.value.joinDate || '',
    points: userInfo.value.points || 0,
    birth_month: userInfo.value.birthMonth || '',
    birth_day: userInfo.value.birthDay || '',
    experience: userInfo.value.experience || 0,
    tags: userInfo.value.tags || [],
    is_boh_creator: Boolean(userInfo.value.isBohCreator),
    creator_platform_ids: normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds),
    creator_platform_visibility: normalizeCreatorPlatformVisibility(
      userInfo.value.creatorPlatformVisibility,
      Object.keys(normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds))
    ),
    creator_platform_order: normalizeCreatorPlatformOrder(
      userInfo.value.creatorPlatformOrder,
      Object.keys(normalizeCreatorPlatformIds(userInfo.value.creatorPlatformIds))
    ),
    showcase_post_ids: normalizeShowcasePostIds(userInfo.value.showcasePostIds),
    id: userInfo.value.id
  };
};

watch(
  () => [
    userInfo.value.id,
    userInfo.value.username,
    userInfo.value.bio,
    userInfo.value.avatarUrl,
    userInfo.value.joinDate,
    userInfo.value.points,
    userInfo.value.birthMonth,
    userInfo.value.birthDay,
    userInfo.value.experience,
    JSON.stringify(userInfo.value.tags || []),
    Boolean(userInfo.value.isBohCreator),
    JSON.stringify(userInfo.value.creatorPlatformIds || {}),
    JSON.stringify(userInfo.value.creatorPlatformVisibility || {}),
    JSON.stringify(userInfo.value.creatorPlatformOrder || []),
    JSON.stringify(userInfo.value.showcasePostIds || [])
  ],
  syncOwnProfileSnapshot,
  { immediate: true }
);

const mergeUniqueById = (baseList, appendList) => {
  const seen = new Set();
  const merged = [];
  for (const item of [...baseList, ...appendList]) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
};

const resetPagingState = () => {
  postsPage.value = 1;
  commentsPage.value = 1;
  impressionsPage.value = 1;
  hasMorePosts.value = true;
  hasMoreComments.value = true;
  hasMoreImpressions.value = true;
  tabLoaded.posts = false;
  tabLoaded.replies = false;
  tabLoaded.impressions = false;
  isTabLoading.posts = false;
  isTabLoading.replies = false;
  isTabLoading.impressions = false;
};

const resetProfileCollections = () => {
  fetchedProfile.value = null;
  posts.value = [];
  comments.value = [];
  impressions.value = [];
  showcasePostsFetched.value = [];
  resetPagingState();
};

const resolveProfileQueryContext = () => {
  const safeUsername = String(route.params.username || '').trim();
  const resolvedUserId = String(profile.value?.id || fetchedProfile.value?.id || '').trim();
  return {
    username: safeUsername,
    userId: resolvedUserId || null
  };
};

const refreshProfileSummary = async (username, fetchVersion = profileFetchVersion.value) => {
  const pRes = await getProfileByUsername(username);
  if (fetchVersion !== profileFetchVersion.value) return null;
  if (!pRes.error && pRes.data) {
    fetchedProfile.value = pRes.data;
    return pRes.data;
  }
  fetchedProfile.value = null;
  return null;
};

const loadShowcasePostsForProfile = async (profileData, fetchVersion = profileFetchVersion.value) => {
  const showcaseIds = normalizeShowcasePostIds(profileData?.showcase_post_ids);
  if (!showcaseIds.length) {
    showcasePostsFetched.value = [];
    return;
  }

  try {
    const postsRes = await getPostsByIds(showcaseIds, {
      includeUnapprovedForAuthor: isOwnProfile.value
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    if (!postsRes?.error && Array.isArray(postsRes.data)) {
      showcasePostsFetched.value = postsRes.data;
      return;
    }
    showcasePostsFetched.value = [];
  } catch (_err) {
    if (fetchVersion !== profileFetchVersion.value) return;
    showcasePostsFetched.value = [];
  }
};

const loadPostsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (isTabLoading.posts) return;
  if (!reset && !hasMorePosts.value) return;

  const { username, userId } = resolveProfileQueryContext();
  if (!username && !userId) return;

  isTabLoading.posts = true;
  const pageToLoad = reset ? 1 : postsPage.value;
  try {
    const postsRes = await getPostsByUsername(username, userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE,
      includeUnapprovedForAuthor: isOwnProfile.value
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = postsRes.error ? [] : (postsRes.data || []);
    posts.value = reset ? incoming : mergeUniqueById(posts.value, incoming);
    hasMorePosts.value = incoming.length >= PROFILE_PAGE_SIZE;
    postsPage.value = pageToLoad + 1;
    tabLoaded.posts = true;
  } catch (error) {
    if (reset) posts.value = [];
    console.error('加载帖子失败:', error);
  } finally {
    isTabLoading.posts = false;
  }
};

const loadCommentsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (isTabLoading.replies) return;
  if (!reset && !hasMoreComments.value) return;

  const { username, userId } = resolveProfileQueryContext();
  if (!username && !userId) return;

  isTabLoading.replies = true;
  const pageToLoad = reset ? 1 : commentsPage.value;
  try {
    const cRes = await getCommentsByUsername(username, userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = cRes.error ? [] : (cRes.data || []);
    comments.value = reset ? incoming : mergeUniqueById(comments.value, incoming);
    hasMoreComments.value = incoming.length >= PROFILE_PAGE_SIZE;
    commentsPage.value = pageToLoad + 1;
    tabLoaded.replies = true;
  } catch (error) {
    if (reset) comments.value = [];
    console.error('加载回复失败:', error);
  } finally {
    isTabLoading.replies = false;
  }
};

const loadImpressionsPage = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  const { userId } = resolveProfileQueryContext();
  if (!userId) return;
  if (isTabLoading.impressions) return;
  if (!reset && !hasMoreImpressions.value) return;

  isTabLoading.impressions = true;
  const pageToLoad = reset ? 1 : impressionsPage.value;
  try {
    const impRes = await getUserImpressions(userId, {
      page: pageToLoad,
      pageSize: PROFILE_PAGE_SIZE
    });
    if (fetchVersion !== profileFetchVersion.value) return;
    const incoming = impRes.error ? [] : (impRes.data || []);
    impressions.value = reset ? incoming : mergeUniqueById(impressions.value, incoming);
    hasMoreImpressions.value = incoming.length >= PROFILE_PAGE_SIZE;
    impressionsPage.value = pageToLoad + 1;
    tabLoaded.impressions = true;
  } catch (error) {
    if (reset) impressions.value = [];
    console.error('加载印象失败:', error);
  } finally {
    isTabLoading.impressions = false;
  }
};

const ensureActiveTabData = async ({ reset = false, fetchVersion = profileFetchVersion.value } = {}) => {
  if (activeTab.value === 'posts') {
    if (reset || !tabLoaded.posts) await loadPostsPage({ reset: true, fetchVersion });
    return;
  }
  if (activeTab.value === 'replies') {
    if (reset || !tabLoaded.replies) await loadCommentsPage({ reset: true, fetchVersion });
    return;
  }
  if (activeTab.value === 'impressions') {
    if (reset || !tabLoaded.impressions) await loadImpressionsPage({ reset: true, fetchVersion });
  }
};

const fetchProfileData = async (username) => {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) return;

  if (profileFetchInflight && profileFetchInflightUsername === safeUsername) {
    await profileFetchInflight;
    return;
  }

  const runner = (async () => {
    const fetchVersion = ++profileFetchVersion.value;
    loading.value = true;
    resetProfileCollections();

    try {
      const profileData = await refreshProfileSummary(safeUsername, fetchVersion);
      if (fetchVersion !== profileFetchVersion.value) return;

      if (!profileData) {
        resetProfileCollections();
        return;
      }

      await Promise.all([
        loadShowcasePostsForProfile(profileData, fetchVersion),
        ensureActiveTabData({ reset: true, fetchVersion })
      ]);
    } catch (err) {
      if (fetchVersion !== profileFetchVersion.value) return;
      resetProfileCollections();
      console.error('加载空间数据失败:', err);
    } finally {
      if (fetchVersion === profileFetchVersion.value) {
        loading.value = false;
      }
    }
  })();

  profileFetchInflight = runner;
  profileFetchInflightUsername = safeUsername;

  try {
    await runner;
  } finally {
    if (profileFetchInflight === runner) {
      profileFetchInflight = null;
      profileFetchInflightUsername = '';
    }
  }
};

const setActiveTab = (tab) => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  void ensureActiveTabData();
};

const loadMorePosts = async () => {
  await loadPostsPage();
};

const loadMoreComments = async () => {
  await loadCommentsPage();
};

const loadMoreImpressions = async () => {
  await loadImpressionsPage();
};

const isShowcasedPost = (postId) => {
  const id = String(postId || '').trim();
  if (!id) return false;
  return normalizedShowcaseIds.value.includes(id);
};

const toggleShowcasePost = async (post) => {
  if (!isOwnProfile.value || !post?.id) return;

  const postId = String(post.id || '').trim();
  if (!postId) return;

  const current = normalizeShowcasePostIds(profile.value?.showcase_post_ids);
  const exists = current.includes(postId);
  if (!exists && current.length >= 3) {
    showAlert('warning', '置顶已满', '最多只能置顶 3 条帖子');
    return;
  }

  const next = exists ? current.filter((id) => id !== postId) : [postId, ...current].slice(0, 3);
  const result = await updateUserProfile({ showcase_post_ids: next });
  if (!result.success) {
    showAlert('error', '操作失败', result.message || '置顶更新失败');
    return;
  }

  await loadShowcasePostsForProfile({ showcase_post_ids: next }, profileFetchVersion.value);
  showAlert('success', exists ? '已取消置顶' : '已置顶', exists ? '帖子已从代表作移除' : '帖子已加入代表作');
};

const handleProfileSync = (event) => {
  const detail = event?.detail || {};
  const currentUsername = String(route.params.username || '');
  if (!currentUsername) return;

  const detailUsername = String(detail.username || '');
  const detailUserId = String(detail.userId || '');
  const isCurrentProfile =
    (detailUsername && detailUsername === currentUsername) ||
    (profile.value?.id && detailUserId && detailUserId === profile.value.id);

  if (!isCurrentProfile) return;

  const now = Date.now();
  if (now - lastProfileSyncAt < PROFILE_SYNC_MIN_INTERVAL_MS) return;
  lastProfileSyncAt = now;

  const reason = String(detail.reason || '');
  if (reason.startsWith('post_') || reason.startsWith('weekly_checkin')) {
    void (async () => {
      const refreshed = await refreshProfileSummary(currentUsername);
      await Promise.all([
        loadShowcasePostsForProfile(refreshed || profile.value),
        loadPostsPage({ reset: true })
      ]);
    })();
    return;
  }

  if (reason.startsWith('comment_')) {
    void Promise.all([
      refreshProfileSummary(currentUsername),
      loadCommentsPage({ reset: true })
    ]);
    return;
  }

  void fetchProfileData(currentUsername);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const calculateBlockAge = (dateStr) => {
  if (!dateStr) return 0;
  const joinDate = new Date(dateStr);
  const now = new Date();
  if (joinDate > now) return 0;
  return Math.ceil(Math.abs(now - joinDate) / (1000 * 60 * 60 * 24));
};

// formatTime 逻辑已由 formatSmartTime 提供

const navigateToPost = (postId) => {
  const safePostId = String(postId || '').trim();
  if (!safePostId) return;
  const sourceUsername = String(profile.value?.username || route.params.username || '').trim();
  const query = sourceUsername
    ? { from: 'profile', username: sourceUsername }
    : undefined;

  router.push({
    name: 'PostDetail',
    params: { id: safePostId },
    query
  });
};

const goToProfileRoute = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}`);
};

const openMailbox = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push({ path: '/user-space/messages', query: { tab: 'mail', to: safeUsername } });
};

const openImpressionModal = () => {
  setActiveTab('impressions');
  if (!isLoggedIn.value) {
    showAlert('info', '请先登录', '登录后才能添加印象');
    return;
  }

  requestAnimationFrame(() => {
    const inputEl = document.querySelector('.add-impression-section textarea');
    inputEl?.focus();
  });
};

const syncCreatorEditForm = (rawIds, creatorEnabled, rawVisibility = {}, rawOrder = []) => {
  const normalized = normalizeCreatorPlatformIds(rawIds);
  const keys = Object.keys(normalized);
  const normalizedVisibility = normalizeCreatorPlatformVisibility(rawVisibility, keys);
  const normalizedOrder = normalizeCreatorPlatformOrder(rawOrder, keys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    const value = normalized[key] || '';
    editCreatorPlatforms[key] = Boolean(value);
    editCreatorIds[key] = value;
    editCreatorVisibility[key] = normalizedVisibility[key] || 'public';
  }
  editCreatorOrder.value = normalizedOrder;
  editCreatorEnabled.value = Boolean(creatorEnabled) || Object.keys(normalized).length > 0;
};

const toggleCreatorVerification = () => {
  editCreatorEnabled.value = !editCreatorEnabled.value;
  if (!editCreatorEnabled.value) {
    for (const key of CREATOR_PLATFORM_KEYS) {
      editCreatorPlatforms[key] = false;
      editCreatorIds[key] = '';
      editCreatorVisibility[key] = 'public';
    }
    editCreatorOrder.value = [];
  }
};

const collectCreatorPayloadForSave = () => {
  if (!editCreatorEnabled.value) {
    return {
      ok: true,
      creatorEnabled: false,
      creatorIds: {},
      creatorVisibility: {},
      creatorOrder: []
    };
  }

  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  if (selectedKeys.length === 0) {
    return { ok: false, message: '请至少选择一个创作平台' };
  }

  const creatorIds = {};
  const creatorVisibility = {};
  for (const key of selectedKeys) {
    const value = String(editCreatorIds[key] || '').trim();
    if (!value) {
      return { ok: false, message: `请填写${creatorPlatformLabelMap[key]}账号 ID` };
    }
    if (value.length > 64) {
      return { ok: false, message: `${creatorPlatformLabelMap[key]}账号 ID 不能超过 64 个字符` };
    }
    creatorIds[key] = value;
    const visibility = String(editCreatorVisibility[key] || '').trim().toLowerCase();
    creatorVisibility[key] = CREATOR_VISIBILITY_VALUES.has(visibility) ? visibility : 'public';
  }

  const creatorOrder = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);

  return {
    ok: true,
    creatorEnabled: Object.keys(creatorIds).length > 0,
    creatorIds,
    creatorVisibility,
    creatorOrder
  };
};

const handlePlatformOrderDragStart = (platformKey) => {
  platformOrderDraggingKey.value = String(platformKey || '').trim();
};

const handlePlatformOrderDrop = (targetKey) => {
  const sourceKey = String(platformOrderDraggingKey.value || '').trim();
  const safeTargetKey = String(targetKey || '').trim();
  if (!sourceKey || !safeTargetKey || sourceKey === safeTargetKey) {
    platformOrderDraggingKey.value = '';
    return;
  }

  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  const currentOrder = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
  const sourceIndex = currentOrder.indexOf(sourceKey);
  const targetIndex = currentOrder.indexOf(safeTargetKey);
  if (sourceIndex === -1 || targetIndex === -1) {
    platformOrderDraggingKey.value = '';
    return;
  }

  const nextOrder = [...currentOrder];
  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, sourceKey);
  editCreatorOrder.value = nextOrder;
  platformOrderDraggingKey.value = '';
};

const openCreatorBindingHomepage = (binding) => {
  if (!binding?.key) return;
  const url = buildCreatorPlatformJumpUrl(binding.key, binding.id);
  if (!url) {
    showAlert('error', '跳转失败', '暂不支持该平台的快捷跳转');
    return;
  }

  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    showAlert('warning', '跳转受限', '浏览器阻止了新窗口，请允许弹窗后重试');
  }
};

const profileEditDraftKey = computed(() => {
  const userId = String(userInfo.value?.id || '').trim();
  return userId ? `${PROFILE_EDIT_DRAFT_KEY_PREFIX}${userId}` : '';
});

const buildCurrentProfileDraft = () => ({
  username: editUsername.value,
  bio: editBio.value,
  join_date: editJoinDate.value,
  birth_month: editBirthMonth.value,
  birth_day: editBirthDay.value,
  creator_enabled: Boolean(editCreatorEnabled.value),
  creator_platforms: { ...editCreatorPlatforms },
  creator_ids: { ...editCreatorIds },
  creator_visibility: { ...editCreatorVisibility },
  creator_order: [...editCreatorOrder.value],
  updated_at: Date.now()
});

const persistProfileDraft = () => {
  if (!showEditModal.value || !isOwnProfile.value) return;
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(buildCurrentProfileDraft()));
  } catch (_err) {
    // ignore
  }
};

const clearProfileDraft = () => {
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_err) {
    // ignore
  }
};

const restoreProfileDraftIfAny = () => {
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    editUsername.value = String(parsed.username || editUsername.value || '');
    editBio.value = String(parsed.bio || '');
    editJoinDate.value = String(parsed.join_date || '');
    editBirthMonth.value = String(parsed.birth_month || '');
    editBirthDay.value = String(parsed.birth_day || '');
    editCreatorEnabled.value = Boolean(parsed.creator_enabled);

    const draftIds = normalizeCreatorPlatformIds(parsed.creator_ids);
    const draftPlatforms = parsed.creator_platforms && typeof parsed.creator_platforms === 'object'
      ? parsed.creator_platforms
      : {};
    const selectedKeys = [];
    for (const keyName of CREATOR_PLATFORM_KEYS) {
      const selected = Boolean(draftPlatforms[keyName]) || Boolean(draftIds[keyName]);
      editCreatorPlatforms[keyName] = selected;
      editCreatorIds[keyName] = draftIds[keyName] || '';
      if (selected) selectedKeys.push(keyName);
    }

    const normalizedVisibility = normalizeCreatorPlatformVisibility(parsed.creator_visibility, selectedKeys);
    for (const keyName of CREATOR_PLATFORM_KEYS) {
      editCreatorVisibility[keyName] = normalizedVisibility[keyName] || 'public';
    }

    editCreatorOrder.value = normalizeCreatorPlatformOrder(parsed.creator_order, selectedKeys);
  } catch (_err) {
    // ignore invalid draft
  }
};

const openEditModal = () => {
  const safeProfile = profile.value || {};
  editUsername.value = safeProfile.username || '';
  editBio.value = safeProfile.bio || '';
  editJoinDate.value = safeProfile.join_date || '';
  editBirthMonth.value = safeProfile.birth_month || '';
  editBirthDay.value = safeProfile.birth_day || '';
  syncCreatorEditForm(
    safeProfile.creator_platform_ids,
    safeProfile.is_boh_creator,
    safeProfile.creator_platform_visibility,
    safeProfile.creator_platform_order
  );
  restoreProfileDraftIfAny();
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const handleSaveProfile = async () => {
  if (!editUsername.value.trim()) {
    showAlert('error', '保存失败', '用户名不能为空');
    return;
  }

  const creatorPayload = collectCreatorPayloadForSave();
  if (!creatorPayload.ok) {
    showAlert('error', '保存失败', creatorPayload.message || '社交平台信息不完整');
    return;
  }

  saving.value = true;
  try {
    const updates = {
      username: editUsername.value.trim(),
      bio: editBio.value,
      join_date: editJoinDate.value,
      birth_month: editBirthMonth.value,
      birth_day: editBirthDay.value,
      is_boh_creator: creatorPayload.creatorEnabled,
      creator_platform_ids: creatorPayload.creatorIds,
      creator_platform_visibility: creatorPayload.creatorVisibility,
      creator_platform_order: creatorPayload.creatorOrder
    };

    const oldUsername = profile.value.username;
    const result = await updateUserProfile(updates);

    if (result.success) {
      showAlert('success', '保存成功', '个人资料已更新');
      clearProfileDraft();
      closeEditModal();

      if (oldUsername !== updates.username) {
        router.replace(`/profile/${encodeURIComponent(updates.username)}`);
      }
    } else {
      if (result.code === '23505') {
        showAlert('error', '保存失败', '该用户名已被占用，请尝试其他名称');
      } else {
        showAlert('error', '保存失败', result.message);
      }
    }
  } catch (_err) {
    showAlert('error', '异常', '网络错误');
  } finally {
    saving.value = false;
  }
};

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const handleAvatarClick = () => {
  avatarInputRef.value?.click();
};

const handleAvatarFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // 转换为预览 URL
  const reader = new FileReader();
  reader.onload = (e) => {
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.readAsDataURL(file);

  // 清空 input 方便下次选择同一张图
  event.target.value = '';
};

const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  try {
    // 将 blob 转为 file
    const file = new File([blob], 'avatar.png', { type: 'image/png' });

    // 依然进行轻度压缩以确保大小
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);

    await uploadToSupabase(compressedFile);
    showCropModal.value = false;
  } catch (error) {
    console.error('裁切处理失败:', error);
    showAlert('error', '处理失败', '头像裁切出错，请重试');
  } finally {
    isProcessingCrop.value = false;
  }
};

const uploadToSupabase = async (file) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showAlert('error', '上传失败', '请先登录');
      return;
    }

    // 1. 获取当前头像文件名以便删除
    const oldAvatarUrl = profile.value.avatar_url;

    const timestamp = Date.now();
    const filePath = `${user.id}/avatar_${timestamp}.png`;

    // 2. 上传新头像
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    // 3. 获取新头像 URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // 添加时间戳查询参数以彻底解决浏览器缓存问题
    const finalUrl = `${publicUrl}?t=${timestamp}`;
    await updateProfileAvatar(user.id, finalUrl);

    // 4. 清理旧头像文件 (如果有)
    if (oldAvatarUrl) {
      try {
        // 从 URL 中提取路径。URL 格式通常为 .../storage/v1/object/public/avatars/USER_ID/avatar_TS.png?t=...
        // 我们需要 avatars 之后的路径：USER_ID/avatar_TS.png
        const urlObj = new URL(oldAvatarUrl);
        const pathParts = urlObj.pathname.split('/');
        const avatarsIndex = pathParts.indexOf('avatars');
        if (avatarsIndex !== -1) {
          const oldFilePath = pathParts.slice(avatarsIndex + 1).join('/');
          // 只有当旧文件路径与新文件路径不同时才删除
          if (oldFilePath && oldFilePath !== filePath) {
            console.log('清理旧头像:', oldFilePath);
            await supabase.storage.from('avatars').remove([oldFilePath]);
          }
        }
      } catch (e) {
        console.warn('清理旧头像失败 (非致命错误):', e);
      }
    }

    await updateUserProfile({ avatar_url: finalUrl });

    showAlert('success', '上传成功', '头像已更新！');
  } catch (error) {
    console.error('上传到 Supabase 失败:', error);
    showAlert('error', '上传失败', error.message || '上传过程出错');
  }
};

const handleSubmitImpression = async () => {
  if (!newImpressionContent.value.trim() || !profile.value) return;

  submittingImpression.value = true;
  try {
    const content = newImpressionContent.value.trim();
    const { data, error } = await addUserImpression(
      userInfo.value.id,
      profile.value.id,
      content
    );

    if (!error) {
      const created = Array.isArray(data) ? data[0] : data;
      const optimisticImpression = {
        id: created?.id || `tmp-${Date.now()}`,
        content,
        created_at: created?.created_at || new Date().toISOString(),
        author_id: userInfo.value.id,
        target_id: profile.value.id,
        author: {
          username: userInfo.value.username,
          avatar_url: userInfo.value.avatarUrl || ''
        }
      };
      impressions.value = mergeUniqueById([optimisticImpression], impressions.value).slice(0, PROFILE_PAGE_SIZE);
      tabLoaded.impressions = true;
      newImpressionContent.value = '';
      showAlert('success', '发布成功', '您的印象已墙上');
    } else {
      showAlert('error', '发布失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '发布印象时出错');
  } finally {
    submittingImpression.value = false;
  }
};

const canDeleteImpression = (impression) => {
  if (!isLoggedIn.value || !userInfo.value?.id) return false;
  return impression.author_id === userInfo.value.id || impression.target_id === userInfo.value.id;
};

const handleDeleteImpression = async (impression) => {
  if (!confirm('确定要删除这条印象吗？')) return;

  try {
    const { error } = await deleteUserImpression(impression.id, userInfo.value.id);

    if (!error) {
      showAlert('success', '删除成功', '印象已删除');
      impressions.value = impressions.value.filter((item) => item.id !== impression.id);
    } else {
      showAlert('error', '删除失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '删除印象时出错');
  }
};

const handleCreatePost = async () => {
  if (!postContent.value.trim()) return;

  isSubmittingPost.value = true;
  try {
    const safeTitle = postTitle.value.trim();
    const safeContent = postContent.value.trim();
    const { data, error } = await createPost(
      safeContent,
      userInfo.value.id,
      userInfo.value.username,
      'approved',
      safeTitle
    );

    if (!error) {
      const created = Array.isArray(data) ? data[0] : data;
      const optimisticPost = {
        id: created?.id || `tmp-post-${Date.now()}`,
        title: safeTitle,
        content: safeContent,
        created_at: created?.created_at || new Date().toISOString(),
        author_id: userInfo.value.id,
        author_username: userInfo.value.username,
        comment_count: 0,
        like_count: 0
      };
      posts.value = mergeUniqueById([optimisticPost], posts.value).slice(0, PROFILE_PAGE_SIZE);
      tabLoaded.posts = true;
      postTitle.value = '';
      postContent.value = '';
      showPostModal.value = false;
      showAlert('success', '发布成功', '您的新动态已同步至社区，系统将异步完成内容审查');
    } else {
      showAlert('error', '发布失败', error.message);
    }
  } catch (_err) {
    showAlert('error', '异常', '发布动态时出错');
  } finally {
    isSubmittingPost.value = false;
  }
};

watch(activeTab, () => {
  void ensureActiveTabData();
});

watch(
  () => JSON.stringify(editCreatorPlatforms),
  () => {
    const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
    editCreatorOrder.value = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
    const normalizedVisibility = normalizeCreatorPlatformVisibility(editCreatorVisibility, selectedKeys);
    for (const key of CREATOR_PLATFORM_KEYS) {
      editCreatorVisibility[key] = normalizedVisibility[key] || 'public';
    }
  }
);

watch(
  () => [
    showEditModal.value,
    editUsername.value,
    editBio.value,
    editJoinDate.value,
    editBirthMonth.value,
    editBirthDay.value,
    Boolean(editCreatorEnabled.value),
    JSON.stringify(editCreatorPlatforms),
    JSON.stringify(editCreatorIds),
    JSON.stringify(editCreatorVisibility),
    JSON.stringify(editCreatorOrder.value || [])
  ],
  () => {
    persistProfileDraft();
  }
);

// 监听路由参数变化，处理不同用户的空间切换
watch(() => route.params.username, (newUsername) => {
  if (newUsername) {
    activeTab.value = 'posts';
    fetchProfileData(newUsername);
  }
});

// 监听登录状态变化，动态刷新页面内容
watch(() => isLoggedIn.value, () => {
  if (route.params.username) {
    fetchProfileData(route.params.username);
  }
});

onMounted(() => {
  window.addEventListener('boh_profile_sync', handleProfileSync);
  if (route.params.username) {
    fetchProfileData(route.params.username);
  }
});

onUnmounted(() => {
  window.removeEventListener('boh_profile_sync', handleProfileSync);
});
</script>

<style scoped src="./style.scoped.css"></style>
