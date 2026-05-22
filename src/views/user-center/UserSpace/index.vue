<template>
  <div class="user-space-page" :class="{ 'immersive-browsing-enabled': immersiveBrowsingEnabled }"
    :data-theme="currentTheme">
    <UnifiedNavbar />

    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">
    <input type="file" ref="profileBackgroundInputRef" class="hidden-file-input" accept="image/*"
      @change="handleProfileBackgroundFileChange">

    <div v-if="mountedTabs.posts" v-show="currentTab === 'posts'" class="tab-page posts-tab">
      <AsyncForum :key="forumRenderKey" :show-navbar="false" :show-header="false" :embedded="true"
        @immersive-scroll="handleForumImmersiveScroll" />
    </div>

    <div v-if="currentTab === 'community'" class="tab-page">
      <div class="page-content">
        <div v-if="isLoadingCommunity" class="community-skeleton" aria-hidden="true">
          <div v-for="group in 3" :key="`community-group-loading-${group}`" class="community-group skeleton">
            <div class="group-header">
              <div class="group-info">
                <div class="skeleton-line community-skeleton-title"></div>
                <div class="skeleton-line community-skeleton-subtitle"></div>
              </div>
              <div class="skeleton-block community-skeleton-arrow"></div>
            </div>
          </div>
          <div class="community-users-list skeleton-users">
            <div v-for="user in 4" :key="`community-user-loading-${user}`" class="user-item">
              <div class="skeleton-block community-user-avatar-skeleton"></div>
              <div class="user-info">
                <div class="skeleton-line community-user-name"></div>
                <div class="skeleton-line community-user-bio"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else>
          <button type="button" class="community-group" @click="toggleCommunityExpand"
            :aria-expanded="isCommunityExpanded">
            <div class="group-header">
              <div class="group-info">
                <h3 class="group-title">方块社区</h3>
                <p class="group-count">{{ totalCommunityUsers }} 位伙伴</p>
              </div>
              <div class="expand-icon" :class="{ expanded: isCommunityExpanded }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </button>

          <transition name="expand">
            <div v-if="isCommunityExpanded" class="community-users-list">
              <div class="community-toolbar">
                <input v-model="communitySearchQuery" type="text" placeholder="搜索社区伙伴..."
                  class="community-search-input" />
                <span class="community-toolbar-meta">第 {{ currentCommunityPage }} / {{ totalCommunityPages }} 页</span>
              </div>

              <div v-if="communityUsers.length === 0" class="empty-state">
                <Users class="empty-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
                <p>{{ communitySearchQuery.trim() ? '没有找到匹配的社区伙伴' : '暂无社区伙伴，快去添加吧！' }}</p>
              </div>

              <div v-for="user in communityUsers" :key="user.id" class="user-item" @click="goToProfile(user.username)">
                <div class="user-avatar">
                  <img v-if="user.avatar_url" :src="user.avatar_url" alt="用户头像" class="avatar-image" loading="lazy"
                    decoding="async" />
                  <span v-else>{{ user.username ? user.username.charAt(0).toUpperCase() : 'U' }}</span>
                </div>
                <div class="user-info">
                  <span class="user-name">@{{ user.username }}</span>
                  <p class="user-bio">{{ user.bio || '这个人很懒，还没有个性签名' }}</p>
                  <div class="user-meta">
                    <span v-if="user.birth_month && user.birth_day" class="meta-item">
                      <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      {{ String(user.birth_month).padStart(2, '0') }}/{{ String(user.birth_day).padStart(2, '0') }}
                    </span>
                    <span v-if="user.join_date" class="meta-item">
                      <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      {{ formatJoinDate(user.join_date) }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="totalCommunityPages > 1" class="community-pagination">
                <button class="community-page-btn" :disabled="isLoadingCommunity || currentCommunityPage === 1"
                  @click.stop="currentCommunityPage--">
                  上一页
                </button>
                <span class="community-page-info">{{ currentCommunityPage }} / {{ totalCommunityPages }}</span>
                <button class="community-page-btn"
                  :disabled="isLoadingCommunity || currentCommunityPage === totalCommunityPages"
                  @click.stop="currentCommunityPage++">
                  下一页
                </button>
              </div>
            </div>
          </transition>

          <button type="button" class="community-group" @click="toggleShowsExpand" :aria-expanded="isShowsExpanded">
            <div class="group-header">
              <div class="group-info">
                <h3 class="group-title">社区节目</h3>
                <p class="group-count">点击展开节目入口</p>
              </div>
              <div class="expand-icon" :class="{ expanded: isShowsExpanded }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </button>

          <transition name="expand">
            <div v-if="isShowsExpanded" class="community-users-list">
              <div class="user-item shows-entry-item" @click="switchTab('shows')">
                <div class="user-avatar shows-entry-avatar">▶</div>
                <div class="user-info">
                  <span class="user-name">方块节目中心</span>
                  <p class="user-bio">进入节目页，查看社区节目与精选内容</p>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <div v-if="mountedTabs.shows" v-show="currentTab === 'shows'" class="tab-page shows-tab">
      <AsyncShows :embedded="true" />
    </div>

    <div v-if="mountedTabs.ai" v-show="currentTab === 'ai'" class="tab-page ai-tab">
      <AsyncBOHAI :embedded="true" />
    </div>

    <div v-if="mountedTabs.messages" v-show="currentTab === 'messages'" class="tab-page messages-tab">
      <AsyncMessages :minimal="true" />
    </div>

    <div v-if="currentTab === 'profile'" class="tab-page profile-tab">
      <div class="profile-page-content">
        <div v-if="!isLoggedIn" class="login-prompt">
          <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
          <h3 class="login-prompt-title">登录以查看我的</h3>
          <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
          <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
        </div>

        <template v-else>
          <transition name="profile-panel-fade" mode="out-in">
            <div v-if="profileSection === 'home'" key="profile-home" class="profile-home-shell">
              <section class="profile-hero-panel">
                <button type="button" class="profile-cover-band"
                  :class="{ 'has-background-image': Boolean(profileBackgroundUrl), 'is-uploading': isUploadingProfileBackground }"
                  :style="profileCoverStyle" :disabled="isUploadingProfileBackground"
                  :aria-label="isUploadingProfileBackground ? '正在上传个人卡片背景' : '更换个人卡片背景'" title="更换背景"
                  @click="handleProfileBackgroundClick">
                  <span class="profile-cover-glass" aria-hidden="true"></span>
                  <span class="profile-cover-action" aria-hidden="true">
                    {{ isUploadingProfileBackground ? '上传中' : '更换背景' }}
                  </span>
                </button>
                <button type="button" class="profile-settings-btn" @click="openProfileSettings" aria-label="设置" title="设置">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path
                      d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06A2 2 0 1 1 20.53 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.4.6.7 1 .6h.6a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z">
                    </path>
                  </svg>
                </button>

                <div class="profile-hero-body">
                  <div class="apple-avatar-wrapper profile-hero-avatar clickable" @click="handleAvatarClick">
                    <div v-if="avatarUrl" class="apple-avatar has-avatar">
                      <img :src="avatarUrl" alt="头像" class="avatar-img">
                    </div>
                    <div v-else class="apple-avatar">{{ (username || 'U').charAt(0).toUpperCase() }}</div>
                    <div class="avatar-edit-overlay">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  </div>

                  <div class="profile-hero-copy">
                    <div class="name-row profile-hero-name-row">
                      <h1 class="profile-name">{{ username || '未登录' }}</h1>
                      <span v-if="isAdmin" class="admin-badge">ADMIN</span>
                    </div>
                    <p class="profile-handle">@{{ username || 'user' }}</p>
                    <p class="profile-bio">{{ userProfileBio }}</p>
                    <div class="profile-chip-row">
                      <span class="profile-chip">
                        {{ joinDate ? profileJoinDateText : '设置入群时间' }}
                      </span>
                      <span class="profile-chip">
                        {{ userBirthday ? profileBirthdayText : '设置生日' }}
                      </span>
                    </div>
                    <button type="button" class="profile-edit-btn" @click="openEditProfileModal">
                      编辑资料
                    </button>
                  </div>
                </div>

                <div class="profile-stats profile-hero-stats" :class="{ 'is-loading': isUserStatsLoading }">
                  <div class="stat-item">
                    <template v-if="isUserStatsLoading">
                      <span class="stat-skeleton stat-skeleton-value"></span>
                      <span class="stat-skeleton stat-skeleton-label"></span>
                    </template>
                    <template v-else>
                      <span class="stat-value">{{ userStats.posts || 0 }}</span>
                      <span class="stat-label">发帖</span>
                    </template>
                  </div>
                  <div class="stat-divider"></div>
                  <div class="stat-item">
                    <template v-if="isUserStatsLoading">
                      <span class="stat-skeleton stat-skeleton-value"></span>
                      <span class="stat-skeleton stat-skeleton-label"></span>
                    </template>
                    <template v-else>
                      <span class="stat-value">{{ formatPoints(userStats.points) || '0' }}</span>
                      <span class="stat-label">积分</span>
                    </template>
                  </div>
                  <div class="stat-divider"></div>
                  <div class="stat-item">
                    <template v-if="isUserStatsLoading">
                      <span class="stat-skeleton stat-skeleton-value"></span>
                      <span class="stat-skeleton stat-skeleton-label"></span>
                    </template>
                    <template v-else>
                      <span class="stat-value">#{{ userStats.rank || '-' }}</span>
                      <span class="stat-label">排名</span>
                    </template>
                  </div>
                </div>
              </section>

              <section class="profile-action-panel" aria-label="我的功能">
                <button type="button" class="profile-action-row" @click="openCloudPlusArea('content')">
                  <span class="profile-action-icon bg-teal">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                      <path d="M8 9h8"></path>
                    </svg>
                  </span>
                  <span class="profile-action-copy">
                    <strong>Cloud+</strong>
                    <small>{{ cloudPlusUsageText }}</small>
                  </span>
                  <span class="profile-action-chevron">›</span>
                </button>
                <button type="button" class="profile-action-row" @click="router.push('/user-space/subscriptions?from=userspace')">
                  <span class="profile-action-icon bg-yellow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
                    </svg>
                  </span>
                  <span class="profile-action-copy">
                    <strong>订阅权益</strong>
                    <small>积分 / Cloud额度</small>
                  </span>
                  <span class="profile-action-chevron">›</span>
                </button>
                <button type="button" class="profile-action-row" @click="router.push('/user-space/gifts?from=userspace')">
                  <span class="profile-action-icon bg-green">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </span>
                  <span class="profile-action-copy">
                    <strong>礼物进度</strong>
                    <small>{{ giftProgressText || '查看领取与地址' }}</small>
                  </span>
                  <span class="profile-action-chevron">›</span>
                </button>
                <button type="button" class="profile-action-row" @click="openSponsorPage">
                  <span class="profile-action-icon bg-gold">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 2v20"></path>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                  </span>
                  <span class="profile-action-copy">
                    <strong>赞助本站</strong>
                    <small>支持本站</small>
                  </span>
                  <span class="profile-action-chevron">›</span>
                </button>
              </section>

              <section class="profile-content-panel">
                <div class="profile-content-tabs" role="tablist" aria-label="我的内容">
                  <button v-for="tab in profileContentTabs" :key="tab.id" type="button" class="profile-content-tab"
                    :class="{ active: activeProfileContentTab === tab.id }" role="tab"
                    :aria-selected="activeProfileContentTab === tab.id" @click="switchProfileContentTab(tab.id)">
                    {{ tab.label }}
                  </button>
                </div>

                <div v-if="activeProfileContentTab === 'posts'" class="profile-posts-area">
                  <div v-if="isProfileContentLoading" class="profile-forum-skeleton-feed" aria-hidden="true">
                    <div v-for="item in 3" :key="`my-post-skeleton-${item}`" class="profile-forum-skeleton-card">
                      <div class="profile-forum-skeleton-header">
                        <div class="profile-forum-skeleton-avatar profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-headlines">
                          <div class="profile-forum-skeleton-name profile-forum-skeleton-item"></div>
                          <div class="profile-forum-skeleton-time profile-forum-skeleton-item"></div>
                        </div>
                      </div>
                      <div class="profile-forum-skeleton-body">
                        <div class="profile-forum-skeleton-title profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-line long profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-line medium profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-line short profile-forum-skeleton-item"></div>
                      </div>
                      <div class="profile-forum-skeleton-actions">
                        <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
                        <div class="profile-forum-skeleton-action profile-forum-skeleton-item"></div>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="profilePosts.length" class="profile-post-grid">
                    <article v-for="post in profilePosts" :key="post.id" class="profile-post-card"
                      :class="{ 'text-only': !getProfilePostCover(post) }"
                      @click="openProfilePost(post.id)">
                      <div v-if="getProfilePostCover(post)" class="profile-post-cover">
                        <img v-if="getProfilePostCover(post)" :src="getProfilePostCover(post)" :alt="getProfilePostTitle(post)"
                          loading="lazy" decoding="async">
                      </div>
                      <div class="profile-post-copy">
                        <h3>{{ getProfilePostTitle(post) }}</h3>
                        <p>{{ getProfilePostSummary(post) }}</p>
                        <div class="profile-post-meta">
                          <span>{{ formatProfilePostDate(post) }}</span>
                          <span>{{ post.like_count || 0 }}赞</span>
                          <span>{{ post.comment_count || 0 }}评</span>
                        </div>
                      </div>
                    </article>
                  </div>
                  <div v-else class="profile-content-empty">
                    <h3>还没有发帖</h3>
                    <p>发布后的内容会直接出现在这里。</p>
                    <button type="button" @click="switchTab('posts')">去发帖</button>
                  </div>
                </div>

                <div v-else-if="activeProfileContentTab === 'cloud'" class="profile-cloud-embed">
                  <AsyncCloudPlus embedded />
                </div>

                <div v-else class="profile-impressions-panel">
                  <div class="profile-impressions-head">
                    <h3>我的印象</h3>
                    <span>{{ profileImpressions.length }}</span>
                  </div>
                  <div v-if="isProfileImpressionsLoading" class="profile-content-empty">
                    <p>正在同步印象...</p>
                  </div>
                  <div v-else-if="profileImpressions.length" class="profile-impressions-grid">
                    <article v-for="imp in profileImpressions" :key="imp.id" class="profile-impression-card">
                      <p>{{ imp.content }}</p>
                      <div>
                        <span>@{{ imp.author?.username || '匿名伙伴' }}</span>
                        <button type="button" @click="handleDeleteProfileImpression(imp.id)">移除</button>
                      </div>
                    </article>
                  </div>
                  <div v-else class="profile-content-empty">
                    <h3>暂无他人印象</h3>
                    <p>社区伙伴写给你的印象会显示在这里。</p>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="profileSection === 'edit-profile'" key="profile-edit" class="profile-edit-page-shell">
              <UserCenterPageHeader title="编辑资料" back-label="返回我的" max-width="650px" @back="closeEditProfileModal" />

              <section class="profile-edit-page-card">
                <div class="profile-edit-page-hero">
                  <div class="apple-avatar-wrapper profile-edit-page-avatar clickable" @click="handleAvatarClick">
                    <div v-if="avatarUrl" class="apple-avatar has-avatar">
                      <img :src="avatarUrl" alt="头像" class="avatar-img">
                    </div>
                    <div v-else class="apple-avatar">{{ (username || 'U').charAt(0).toUpperCase() }}</div>
                    <span class="profile-edit-avatar-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </span>
                    <div class="avatar-edit-overlay">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </div>
                  </div>
                  <div class="profile-edit-page-copy">
                    <h3>{{ username || '我的资料' }}</h3>
                    <p>更新会显示在“我的”页面顶部。</p>
                    <button type="button" class="profile-edit-avatar-action" @click="handleAvatarClick">
                      更换头像
                    </button>
                  </div>
                </div>

                <div class="edit-profile-form profile-edit-page-form">
                  <label class="edit-profile-field">
                    <span>个人简介</span>
                    <textarea v-model="editProfileForm.bio" class="edit-profile-textarea" maxlength="160"
                      placeholder="写一句介绍自己或当前状态的话"></textarea>
                  </label>

                  <label class="edit-profile-field">
                    <span>入群时间</span>
                    <div class="profile-date-selector">
                      <select v-model="editProfileForm.joinYear" class="profile-date-select">
                        <option value="">年</option>
                        <option v-for="year in joinDateYears" :key="`page-join-year-${year}`" :value="year">{{ year }}年</option>
                      </select>
                      <select v-model="editProfileForm.joinMonth" class="profile-date-select">
                        <option value="">月</option>
                        <option v-for="month in months" :key="`page-join-month-${month}`" :value="month">{{ month }}月</option>
                      </select>
                      <select v-model="editProfileForm.joinDay" class="profile-date-select">
                        <option value="">日</option>
                        <option v-for="day in daysForEditJoinDate" :key="`page-join-day-${day}`" :value="day">{{ day }}日</option>
                      </select>
                    </div>
                  </label>

                  <div class="edit-profile-field">
                    <span>生日</span>
                    <div class="profile-date-selector birthday-selector compact">
                      <select v-model="editProfileForm.birthMonth" class="profile-date-select">
                        <option value="">月</option>
                        <option v-for="m in months" :key="`page-edit-month-${m}`" :value="m">{{ m }}月</option>
                      </select>
                      <select v-model="editProfileForm.birthDay" class="profile-date-select">
                        <option value="">日</option>
                        <option v-for="d in daysForEditProfile" :key="`page-edit-day-${d}`" :value="d">{{ d }}日</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <div class="profile-edit-page-actions">
                <button type="button" class="profile-edit-cancel-btn" @click="closeEditProfileModal">取消</button>
                <button type="button" class="profile-edit-save-btn" @click="submitEditProfile"
                  :disabled="isSubmittingProfileEdit">
                  {{ isSubmittingProfileEdit ? '保存中...' : '保存资料' }}
                </button>
              </div>
            </div>

            <div v-else-if="profileSection === 'sponsor'" key="profile-sponsor" class="profile-subpage-shell">
              <UserCenterPageHeader title="赞助支持" back-label="返回我的" max-width="650px" @back="backToProfileHome" />

              <div class="profile-subpage-body">
                <section class="sponsor-hero apple-card">
                  <div class="sponsor-hero-copy">
                    <p class="sponsor-kicker">Sponsor</p>
                    <h3>助力我喝杯咖啡</h3>
                    <p>你的支持会让方块之家继续维护、更新和变得更好。</p>
                  </div>
                  <button type="button" class="sponsor-primary-btn" @click="startSponsorFlow">
                    赞助
                  </button>
                </section>

                <section class="apple-card sponsor-panel">
                  <div class="sponsor-section-head">
                    <div>
                      <p class="sponsor-kicker">Payment</p>
                      <h3>选择赞助方式</h3>
                    </div>
                    <span class="sponsor-status-pill">{{ sponsorStatusText }}</span>
                  </div>

                  <div class="sponsor-method-grid">
                    <button
                      v-for="method in sponsorMethods"
                      :key="method.id"
                      type="button"
                      class="sponsor-method"
                      :class="{ active: sponsorMethod === method.id, disabled: method.disabled }"
                      :aria-disabled="method.disabled ? 'true' : 'false'"
                      @click="selectSponsorMethod(method.id)"
                    >
                      <span class="sponsor-method-icon">{{ method.icon }}</span>
                      <span>
                        <strong>{{ method.label }}</strong>
                        <small>{{ method.desc }}</small>
                      </span>
                    </button>
                  </div>

                  <div class="sponsor-action-row">
                    <button type="button" class="sponsor-primary-btn" :disabled="sponsorMethod !== 'wechat'"
                      @click="showSponsorQr">
                      {{ sponsorQrVisible ? '刷新二维码' : '显示二维码' }}
                    </button>
                  </div>

                  <transition name="profile-panel-fade">
                    <div v-if="sponsorQrVisible" class="sponsor-qr-stage">
                      <div v-if="sponsorQrLoadFailed" class="sponsor-qr-placeholder">
                        <div class="sponsor-placeholder-icon">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                            <path d="M14 14h2v2h-2z"></path>
                            <path d="M18 14h3v3"></path>
                            <path d="M14 18h7v3h-7z"></path>
                          </svg>
                        </div>
                        <h4>二维码暂未配置</h4>
                        <p>未能加载 src/assets/images/qrcode.webp，请检查图片资源。</p>
                      </div>

                      <figure v-else class="sponsor-qr-card" :class="{ loading: sponsorQrLoading }">
                        <div v-if="sponsorQrLoading" class="sponsor-qr-loading">
                          <div class="loading-spinner"></div>
                          <span>正在加载赞赏码...</span>
                        </div>
                        <img :src="sponsorQrImageUrl" alt="微信赞赏二维码" @load="handleSponsorQrLoad"
                          @error="handleSponsorQrError">
                        <figcaption>使用微信扫码赞助</figcaption>
                      </figure>
                    </div>
                  </transition>
                </section>
              </div>
            </div>

            <div v-else-if="profileSection === 'settings'" key="profile-settings" class="profile-subpage-shell">
              <UserCenterPageHeader title="设置" back-label="返回我的" max-width="650px" @back="backToProfileHome" />

              <div class="profile-subpage-body">
                <div class="apple-card settings-section-card">
                  <div class="group-header-title">外观与浏览</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="openThemeModal">
                      <div class="item-left">
                        <div class="icon-wrapper" :class="currentTheme === 'dark' ? 'bg-purple' : 'bg-yellow'">
                          <svg v-if="currentTheme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                          </svg>
                          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="5"></circle>
                            <line x1="12" y1="1" x2="12" y2="3"></line>
                            <line x1="12" y1="21" x2="12" y2="23"></line>
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                            <line x1="1" y1="12" x2="3" y2="12"></line>
                            <line x1="21" y1="12" x2="23" y2="12"></line>
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">主题设置</span>
                          <span class="item-desc">选择浅色、深色或跟随系统</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">{{ themeDisplayText }}</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                    <div class="apple-item clickable setting-toggle-item" role="button" tabindex="0"
                      :aria-pressed="immersiveBrowsingEnabled.toString()" @click="toggleImmersiveBrowsing"
                      @keydown.enter.prevent="toggleImmersiveBrowsing" @keydown.space.prevent="toggleImmersiveBrowsing">
                      <div class="item-left">
                        <div class="icon-wrapper bg-blue">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                            <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                            <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                            <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                          </svg>
                        </div>
                        <span class="item-label-wrap">
                          <span class="setting-label-stack">
                            <span class="item-label-row">
                              <span class="item-label">沉浸浏览</span>
                              <span class="beta-badge">Beta</span>
                            </span>
                            <span class="item-desc">浏览帖子时自动收起底部导航</span>
                          </span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">{{ immersiveBrowsingEnabled ? '已开启' : '已关闭' }}</span>
                        <span class="setting-switch" :class="{ enabled: immersiveBrowsingEnabled }" aria-hidden="true">
                          <span class="setting-switch-thumb"></span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card">
                  <div class="group-header-title">Cloud+</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="openCloudPlusArea('settings')">
                      <div class="item-left">
                        <div class="icon-wrapper bg-teal">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
                            <path d="M8 9h8"></path>
                            <path d="M8 13h5"></path>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">Cloud+ 页面</span>
                          <span class="item-desc">进入完整 Cloud+ 设置与管理页面</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">{{ cloudPlusUsageText }}</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card">
                  <div class="group-header-title">账户与安全</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="router.push('/user-space/account-security?from=userspace-settings')">
                      <div class="item-left">
                        <div class="icon-wrapper bg-blue">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">账户安全</span>
                          <span class="item-desc">修改密码、管理登录安全</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">密码与账号</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card">
                  <div class="group-header-title">通知</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="router.push('/user-space/pushplus-settings?from=userspace-settings')">
                      <div class="item-left">
                        <div class="icon-wrapper bg-blue">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">Pushplus 推送</span>
                          <span class="item-desc">离线时通过微信接收消息</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">{{ pushplusStatusText }}</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card">
                  <div class="group-header-title">数据与隐私</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="openProfileDataManagement">
                      <div class="item-left">
                        <div class="icon-wrapper bg-indigo">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">数据与隐私</span>
                          <span class="item-desc">公共记忆与管理工具</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">{{ dataPrivacyStatusText }}</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card">
                  <div class="group-header-title">高级功能</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="openCreatorStudio">
                      <div class="item-left">
                        <div class="icon-wrapper bg-indigo">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                            <path d="M17.5 14v7"></path>
                            <path d="M14 17.5h7"></path>
                            <path d="M10 6.5h4"></path>
                            <path d="M6.5 10v4"></path>
                          </svg>
                        </div>
                        <span class="setting-label-stack">
                          <span class="item-label">Creator Studio</span>
                          <span class="item-desc">创作工具与团队空间</span>
                        </span>
                      </div>
                      <div class="item-right">
                        <span class="text-secondary">即将上线</span>
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="apple-card settings-section-card danger-section-card">
                  <div class="group-header-title">危险操作</div>
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="handleLogout">
                      <div class="item-left">
                        <div class="icon-wrapper bg-red">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                          </svg>
                        </div>
                        <span class="item-label text-danger">退出登录</span>
                      </div>
                      <div class="item-right">
                        <span class="chevron text-danger">›</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else key="profile-data-management" class="profile-subpage-shell">
              <UserCenterPageHeader title="数据与隐私" back-label="返回设置" max-width="650px" @back="backToProfileSettings" />

              <div class="profile-subpage-body">
                <div class="apple-card">
                  <div class="apple-list-group">
                    <div class="apple-item clickable" @click="router.push('/user-space/shared-memories?from=userspace-data')">
                      <div class="item-left">
                        <div class="icon-wrapper bg-indigo">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
                          </svg>
                        </div>
                        <span class="item-label">公共记忆管理</span>
                      </div>
                      <div class="item-right">
                        <span class="chevron">›</span>
                      </div>
                    </div>
                    <div v-if="isAdmin" class="apple-item clickable" @click="router.push('/admin/data-management')">
                      <div class="item-left">
                        <div class="icon-wrapper bg-gray">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path
                              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z">
                            </path>
                          </svg>
                        </div>
                        <span class="item-label">后台数据管理</span>
                      </div>
                      <div class="item-right">
                        <span class="chevron">›</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </template>
      </div>
    </div>

    <div v-if="!(currentTab === 'profile' && profileSection === 'edit-profile')" class="bottom-nav-glass"
      :class="{ 'is-hidden': shouldHideBottomNav }">
      <div class="nav-items">
        <button v-for="item in navItems" :key="item.id" class="nav-item" :class="{ active: currentTab === item.id }"
          @click="switchTab(item.id)">
          <span class="nav-label">{{ item.label }}</span>
          <div v-if="item.id === 'messages' && hasUnreadMessages" class="unread-badge">
            {{ unreadCount > 99 ? '99+' : unreadCount }}
          </div>
        </button>
      </div>
    </div>

    <transition name="fade">
      <div v-if="showBirthdayModal" class="modal-overlay" @click.self="closeBirthdayModal">
        <div class="modal-card birthday-modal-card glass-card">
          <div class="modal-visual-header">
            <div class="modal-icon-circle">
              <Cake class="emoji-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
            </div>
          </div>
          <div class="modal-body-clean">
            <h3 class="clean-title">告诉我们您的生日</h3>
            <p class="clean-desc">
              在您生日当天，方块之家会为您准备一份<span class="highlight-1200">特别的惊喜</span>。
            </p>

            <div class="feature-pills">
              <div class="feature-pill">
                <Gift :size="14" :stroke-width="1.8" aria-hidden="true" />
                专属祝福
              </div>
              <div class="feature-pill">
                <Sparkles :size="14" :stroke-width="1.8" aria-hidden="true" />
                节日特效
              </div>
            </div>

            <div class="birthday-selector modal-selector">
              <select v-model="submissionBirthday.month" class="date-select">
                <option value="" disabled>月</option>
                <option v-for="m in months" :key="m" :value="m">{{ m }}月</option>
              </select>
              <span class="date-sep">/</span>
              <select v-model="submissionBirthday.day" class="date-select">
                <option value="" disabled>日</option>
                <option v-for="d in daysForSubmission" :key="d" :value="d">{{ d }}日</option>
              </select>
            </div>

            <div class="clean-actions">
              <button class="primary-btn-clean" @click="submitBirthdayRequest" :disabled="isSubmitting">
                {{ isSubmitting ? '提交中...' : '确认提交' }}
              </button>
              <button class="ghost-btn-clean" @click="closeBirthdayModal">暂时跳过</button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showJoinDateModal" class="modal-overlay" @click.self="closeJoinDateModal">
        <div class="modal-card join-date-modal-card">
          <div class="modal-visual-header join-date-header">
            <div class="modal-icon-circle">
              <CalendarDays class="emoji-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
            </div>
            <button class="close-icon-btn" @click="closeJoinDateModal" aria-label="关闭">
              <X :size="18" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </div>
          <div class="modal-body-clean">
            <h3 class="clean-title">设置加群时间</h3>
            <p class="clean-desc">
              请选择您加入方块之家的日期，这将用于计算您的方块年龄。
            </p>

            <div class="date-input-container">
              <div class="date-input-wrapper">
                <input type="date" v-model="submissionJoinDate" class="date-input" :max="getTodayDate()" required>
                <div class="date-input-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
                <label class="date-input-label">选择加群日期</label>
              </div>
              <p class="date-input-hint">请选择您加入方块之家的日期</p>
            </div>

            <div class="clean-actions">
              <button class="primary-btn-clean" @click="submitJoinDateRequest" :disabled="isSubmittingJoinDate">
                {{ isSubmittingJoinDate ? '提交中...' : '确认设置' }}
              </button>
              <button class="ghost-btn-clean" @click="closeJoinDateModal">取消</button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 主题设置模态框 -->
    <transition name="fade">
      <div v-if="showThemeModal" class="modal-overlay" @click.self="closeThemeModal">
        <div class="modal-card theme-modal-card">
          <div class="modal-visual-header theme-header">
            <div class="modal-icon-circle">
              <Palette class="emoji-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
            </div>
            <button class="close-icon-btn" @click="closeThemeModal" aria-label="关闭">
              <X :size="18" :stroke-width="1.9" aria-hidden="true" />
            </button>
          </div>
          <div class="modal-body-clean">
            <h3 class="clean-title">主题设置</h3>
            <p class="clean-desc">
              选择适合您的界面主题，深色模式更适合夜间使用。
            </p>

            <div class="theme-options">
              <div class="theme-option" :class="{ active: currentThemePreference === 'light' }"
                @click="setThemePreference('light')">
                <div class="theme-preview light-preview">
                  <div class="preview-header"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                    <div class="preview-line short"></div>
                  </div>
                </div>
                <span class="theme-name">浅色模式</span>
                <Check v-if="currentThemePreference === 'light'" class="theme-check" :size="16"
                  :stroke-width="2.2" aria-hidden="true" />
              </div>

              <div class="theme-option" :class="{ active: currentThemePreference === 'dark' }"
                @click="setThemePreference('dark')">
                <div class="theme-preview dark-preview">
                  <div class="preview-header"></div>
                  <div class="preview-content">
                    <div class="preview-line"></div>
                    <div class="preview-line short"></div>
                  </div>
                </div>
                <span class="theme-name">深色模式</span>
                <Check v-if="currentThemePreference === 'dark'" class="theme-check" :size="16"
                  :stroke-width="2.2" aria-hidden="true" />
              </div>

              <div class="theme-option" :class="{ active: currentThemePreference === 'system' }"
                @click="setThemePreference('system')">
                <div class="theme-preview system-preview">
                  <div class="system-preview-light">
                    <div class="preview-header"></div>
                    <div class="preview-content">
                      <div class="preview-line"></div>
                      <div class="preview-line short"></div>
                    </div>
                  </div>
                  <div class="system-preview-dark">
                    <div class="preview-header"></div>
                    <div class="preview-content">
                      <div class="preview-line"></div>
                      <div class="preview-line short"></div>
                    </div>
                  </div>
                </div>
                <span class="theme-name">跟随系统</span>
                <Check v-if="currentThemePreference === 'system'" class="theme-check" :size="16"
                  :stroke-width="2.2" aria-hidden="true" />
              </div>
            </div>

            <div class="clean-actions">
              <button class="ghost-btn-clean" @click="setThemePreference('system')">
                跟随系统
              </button>
              <button class="primary-btn-clean" @click="closeThemeModal">
                完成
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />

    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
      :title="cropModalTitle" :hint="cropModalHint" :sub-hint="cropModalSubHint"
      :aspect-ratio="cropModalAspectRatio" :shape="cropModalShape"
      @confirm="handleCropConfirm" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, reactive, watch, defineAsyncComponent } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Cake, CalendarDays, Check, Gift, Palette, Sparkles, User, Users, X } from 'lucide-vue-next';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { supabase } from '@/utils/supabase-client.js';
import { getProfilesPage } from '@/utils/api/auth-api.js';
import { deleteUserImpression, getPostsByUsername, getUserImpressions, updateProfileAvatar } from '@/utils/api/profile-api.js';
import { getPushplusSettings } from '@/utils/api/pushplus-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { listMyCloudEntries } from '@/utils/api/boh-cloud-api.js';
import {
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
  uploadImageToCloudinary
} from '@/utils/cloudinary-client.js';
import sponsorQrImage from '@/assets/images/qrcode.webp';
import { useAuthStore } from '@/stores/auth';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader.js';
import { themeManager } from '@/utils/theme-manager.js';
import { DEFAULT_CLOUD_IMAGE_LIMIT, resolveCloudBenefitFromSubscriptions } from '@/utils/subscription-benefits.js';

const forumComponentLoader = () => import('@/views/Forum/index.vue');
let forumPreloadPromise = null;
let forumPreloadIdleId = null;
let forumPreloadTimeoutId = null;
let isUserSpaceMounted = false;
const preloadForumComponent = () => {
  if (!forumPreloadPromise) {
    forumPreloadPromise = forumComponentLoader().catch(() => {
      forumPreloadPromise = null;
      return null;
    });
  }
  return forumPreloadPromise;
};
const canUseNetworkForForumPreload = () => {
  if (typeof navigator === 'undefined') return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  return effectiveType !== 'slow-2g' && effectiveType !== '2g';
};
const clearScheduledForumPreload = () => {
  if (typeof window === 'undefined') return;
  if (forumPreloadTimeoutId !== null) {
    window.clearTimeout(forumPreloadTimeoutId);
    forumPreloadTimeoutId = null;
  }
  if (forumPreloadIdleId !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(forumPreloadIdleId);
    forumPreloadIdleId = null;
  }
};
const scheduleForumPreload = () => {
  if (currentTab.value !== 'posts') return;
  if (!canUseNetworkForForumPreload()) return;
  if (forumPreloadPromise || forumPreloadIdleId !== null || forumPreloadTimeoutId !== null) return;
  const run = () => {
    forumPreloadIdleId = null;
    forumPreloadTimeoutId = null;
    if (!isUserSpaceMounted) return;
    void preloadForumComponent();
  };
  if (typeof window === 'undefined') {
    run();
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    forumPreloadIdleId = window.requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  forumPreloadTimeoutId = window.setTimeout(run, 1200);
};

let imageCompressionLoader = null;
const loadImageCompression = async () => {
  if (!imageCompressionLoader) {
    imageCompressionLoader = import('browser-image-compression')
      .then((mod) => mod.default)
      .catch((error) => {
        imageCompressionLoader = null;
        throw error;
      });
  }
  return imageCompressionLoader;
};

const AsyncForum = defineAsyncComponent({
  loader: forumComponentLoader,
  delay: 120,
  timeout: 20 * 1000,
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      setTimeout(() => retry(), attempts * 300);
      return;
    }
    fail(error);
  }
});
const AsyncMessages = defineAsyncComponent(() => import('@/views/user-center/Messages/index.vue'));
const AsyncShows = defineAsyncComponent(() => import('@/views/Shows/index.vue'));
const AsyncBOHAI = defineAsyncComponent(() => import('@/views/BOHAI/BOHAI/index.vue'));
const AsyncCloudPlus = defineAsyncComponent(() => import('@/views/user-center/Cloud+/index.vue'));

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, isInitialized, userInfo, showLoginModal } = storeToRefs(authStore);
const notificationStoreRef = ref(getNotificationStoreSync());
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const refreshUnreadCount = async () => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount();
};

const username = computed(() => userInfo.value.username);
const hasUnreadMessages = computed(() => unreadCount.value > 0);
const giftProgressText = ref('');
const GIFT_PROGRESS_CACHE_TTL_MS = 60 * 1000;
const GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS = 5 * 1000;
let lastGiftProgressRefreshAt = 0;
let giftProgressInflight = null;

const currentTab = ref('posts');
const profileSection = ref('home');
const isLoadingCommunity = ref(true);
const isCommunityExpanded = ref(false);
const isShowsExpanded = ref(false);
const communityUsers = ref([]);
const communitySearchQuery = ref('');
const debouncedCommunitySearchQuery = ref('');
const currentCommunityPage = ref(1);
const totalCommunityUsers = ref(0);
const COMMUNITY_PAGE_SIZE = 10;
const hasLoadedCommunity = ref(false);
const mountedTabs = reactive({
  posts: true,
  messages: false,
  shows: false,
  ai: false
});
const forumRenderKey = ref(0);
const shouldRefreshForumAfterThemeChange = ref(false);
let communitySearchDebounceTimer = null;
let latestCommunityFetchId = 0;

const navItems = [
  { id: 'posts', label: '帖子' },
  { id: 'community', label: '社区' },
  { id: 'ai', label: 'AI' },
  { id: 'messages', label: '消息' },
  { id: 'profile', label: '我的' }
];
const validTabs = ['posts', 'community', 'messages', 'profile', 'shows', 'ai'];
const validProfileSections = ['home', 'edit-profile', 'sponsor', 'settings', 'data-management'];

const isAdmin = computed(() => userInfo.value.role === 'admin');

const sponsorMethod = ref('wechat');
const sponsorQrVisible = ref(false);
const sponsorQrLoading = ref(false);
const sponsorQrLoadFailed = ref(false);
const sponsorQrImageUrl = sponsorQrImage;
const sponsorMethods = [
  {
    id: 'wechat',
    label: 'VX',
    desc: '微信赞赏码扫码',
    icon: 'VX',
    disabled: false
  },
  {
    id: 'alipay',
    label: '支付宝',
    desc: '暂不支持',
    icon: 'AL',
    disabled: true
  }
];
const sponsorStatusText = computed(() => (sponsorMethod.value === 'wechat' ? '可用' : '暂不支持'));

const resolveProfileSectionFromRoute = () => {
  if (currentTab.value !== 'profile') return;
  const requestedView = String(route.query.view || '').trim();
  const nextSection = validProfileSections.includes(requestedView) ? requestedView : 'home';
  profileSection.value = nextSection;
  if (nextSection === 'settings') {
    void fetchPushplusStatus();
    void fetchCloudPlusUsage();
  }
  if (nextSection === 'edit-profile') {
    prepareEditProfileForm();
  }
};

const setProfileSectionRoute = (section) => {
  const nextQuery = { ...route.query, tab: 'profile' };
  if (section === 'home') {
    delete nextQuery.view;
  } else {
    nextQuery.view = section;
  }
  router.replace({ query: nextQuery });
};

const userBirthday = computed(() => {
  if (userInfo.value.birthMonth && userInfo.value.birthDay) {
    return {
      month: userInfo.value.birthMonth,
      day: userInfo.value.birthDay
    };
  }
  return null;
});

const avatarUrl = computed(() => userInfo.value.avatarUrl || '');
const profileBackgroundUrl = computed(() => userInfo.value.profileBackgroundUrl || '');
const profileBackgroundPublicId = computed(() => userInfo.value.profileBackgroundPublicId || '');
const userProfileBio = computed(() => {
  const bio = String(userInfo.value.bio || '').trim();
  return bio || '这个人很认真地搭着自己的方块。';
});

const joinDate = computed(() => userInfo.value.joinDate || '');
const isProfileBasicsComplete = computed(() => Boolean(joinDate.value && userBirthday.value));
const profileBasicsCompletionText = computed(() => {
  const completed = Number(Boolean(joinDate.value)) + Number(Boolean(userBirthday.value));
  return `${completed}/2`;
});
const profileBirthdayText = computed(() => userBirthday.value ? formatBirthdayLabel(userBirthday.value) : '未设置');
const profileJoinDateText = computed(() => joinDate.value ? formatJoinDateLabel(joinDate.value) : '未设置');
const avatarInputRef = ref(null);
const profileBackgroundInputRef = ref(null);
const showCropModal = ref(false);
const cropImageSrc = ref('');
const cropPurpose = ref('avatar');
const isProcessingCrop = ref(false);
const isUploadingProfileBackground = ref(false);
const BACKGROUND_CROP_ASPECT_RATIO = 3;
const cropModalAspectRatio = computed(() => cropPurpose.value === 'profile-background' ? BACKGROUND_CROP_ASPECT_RATIO : 1);
const cropModalShape = computed(() => cropPurpose.value === 'profile-background' ? 'rectangle' : 'circle');
const cropModalTitle = computed(() => cropPurpose.value === 'profile-background' ? '裁切背景' : '裁切头像');
const cropModalHint = computed(() => cropPurpose.value === 'profile-background'
  ? '拖动图片来选择个人卡片背景的显示范围'
  : '拖动以调整位置，缩放以改变大小');
const cropModalSubHint = computed(() => cropPurpose.value === 'profile-background'
  ? '裁切后的横幅会作为个人卡片背景'
  : '裁切后的效果将作为您的新头像');

const escapeCssUrl = (url = '') => String(url || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const profileCoverStyle = computed(() => {
  const displayUrl = getCloudinaryDisplayUrl(profileBackgroundUrl.value);
  if (!displayUrl) return {};

  return {
    backgroundImage: [
      'linear-gradient(180deg, rgba(15, 23, 42, 0.24), rgba(15, 23, 42, 0.02))',
      `url("${escapeCssUrl(displayUrl)}")`
    ].join(', ')
  };
});

// 用户统计数据
const userStats = reactive({
  posts: 0,
  points: 0,
  rank: 0
});
const isUserStatsLoading = ref(false);
let latestUserStatsFetchToken = 0;

const profileContentTabs = [
  { id: 'posts', label: '发帖' },
  { id: 'cloud', label: 'Cloud+' },
  { id: 'impressions', label: '印象' }
];
const activeProfileContentTab = ref('posts');
const profilePosts = ref([]);
const profileImpressions = ref([]);
const isProfileContentLoading = ref(false);
const isProfileImpressionsLoading = ref(false);
let latestProfileContentFetchToken = 0;
let latestProfileImpressionsFetchToken = 0;

const normalizeStatInt = (value, fallback = 0) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(0, Math.trunc(normalized));
};

const resetUserStats = () => {
  userStats.posts = 0;
  userStats.points = 0;
  userStats.rank = 0;
};

const normalizeProfileText = (value, fallback = '') => {
  const safeValue = String(value || '').trim();
  return safeValue || fallback;
};

const getProfilePostTitle = (post = {}) => normalizeProfileText(post.title, '无标题');
const getProfilePostSummary = (post = {}) => {
  const body = normalizeProfileText(post.body || post.content, '');
  return body.length > 46 ? `${body.slice(0, 46)}...` : (body || '暂无正文');
};

const getProfilePostCover = (post = {}) => {
  const cover = String(post.cover_image_url || '').trim();
  if (cover) return cover;
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  return String(firstImage?.url || firstImage?.originalUrl || '').trim();
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

const openProfilePost = (postId) => {
  const safePostId = String(postId || '').trim();
  if (!safePostId) return;
  router.push({ name: 'PostDetail', params: { id: safePostId }, query: { from: 'user-space', tab: 'profile' } });
};

const fetchProfileContent = async () => {
  if (!isLoggedIn.value || !userInfo.value.id) {
    profilePosts.value = [];
    return;
  }

  const fetchToken = ++latestProfileContentFetchToken;
  isProfileContentLoading.value = true;
  const safeUsername = String(userInfo.value.username || '').trim();
  const userId = String(userInfo.value.id || '').trim();

  try {
    if (activeProfileContentTab.value === 'posts') {
      const result = await getPostsByUsername(safeUsername, userId, {
        page: 1,
        pageSize: 12,
        includeUnapprovedForAuthor: true
      });
      if (fetchToken !== latestProfileContentFetchToken) return;
      if (result.error) {
        console.warn('读取我的发帖失败:', result.error);
        profilePosts.value = [];
        return;
      }
      profilePosts.value = result.data || [];
      return;
    }

  } catch (error) {
    console.warn('读取我的内容失败:', error);
    if (activeProfileContentTab.value === 'posts') {
      profilePosts.value = [];
    }
  } finally {
    if (fetchToken === latestProfileContentFetchToken) {
      isProfileContentLoading.value = false;
    }
  }
};

const switchProfileContentTab = (tabId) => {
  if (!profileContentTabs.some(tab => tab.id === tabId)) return;
  if (activeProfileContentTab.value === tabId) return;
  activeProfileContentTab.value = tabId;
  if (tabId === 'posts') {
    void fetchProfileContent();
  } else if (tabId === 'cloud') {
    void fetchCloudPlusUsage();
  } else if (tabId === 'impressions') {
    void fetchProfileImpressions();
  }
};

const fetchProfileImpressions = async () => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    profileImpressions.value = [];
    return;
  }
  const fetchToken = ++latestProfileImpressionsFetchToken;
  isProfileImpressionsLoading.value = true;
  try {
    const { data, error } = await getUserImpressions(userId);
    if (fetchToken !== latestProfileImpressionsFetchToken) return;
    if (error) {
      console.warn('读取我的印象失败:', error);
      profileImpressions.value = [];
      return;
    }
    profileImpressions.value = data || [];
  } catch (error) {
    console.warn('读取我的印象异常:', error);
    profileImpressions.value = [];
  } finally {
    if (fetchToken === latestProfileImpressionsFetchToken) {
      isProfileImpressionsLoading.value = false;
    }
  }
};

const handleDeleteProfileImpression = async (impressionId) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId) {
    showAlert('error', '删除失败', '当前登录状态异常，请刷新后重试');
    return;
  }
  try {
    const { error } = await deleteUserImpression(impressionId, userId);
    if (error) {
      showAlert('error', '删除失败', error.message || '请稍后重试');
      return;
    }
    profileImpressions.value = profileImpressions.value.filter(imp => imp.id !== impressionId);
    showAlert('success', '删除成功', '该印象已被移除');
  } catch (error) {
    console.warn('删除我的印象异常:', error);
    showAlert('error', '删除失败', '网络错误');
  }
};

// 格式化积分显示
const formatPoints = (points) => {
  if (!points || points === 0) return '0';
  if (points >= 10000) {
    return (points / 10000).toFixed(1) + 'w';
  }
  if (points >= 1000) {
    return (points / 1000).toFixed(1) + 'k';
  }
  return points.toString();
};

// 获取用户统计数据
const fetchUserStats = async ({ retryCount = 0 } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  const fetchToken = ++latestUserStatsFetchToken;
  isUserStatsLoading.value = true;
  const safeUsername = String(userInfo.value.username || '').trim();
  const fallbackPoints = normalizeStatInt(userInfo.value.points, userStats.points);
  userStats.points = fallbackPoints;

  try {
    const [postsByIdResult, pointsResult] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', userId),
      supabase
        .from('profiles')
        .select('points')
        .eq('id', userId)
        .maybeSingle()
    ]);

    if (fetchToken !== latestUserStatsFetchToken) return;

    let hasQueryError = Boolean(postsByIdResult.error || pointsResult.error);
    let resolvedPostsCount = null;

    if (!postsByIdResult.error) {
      resolvedPostsCount = normalizeStatInt(postsByIdResult.count, 0);
    } else {
      console.warn('获取用户帖子数失败(author_id):', postsByIdResult.error);
    }

    // 老数据可能缺失 author_id，回退按 username 统计。
    if ((resolvedPostsCount === null || resolvedPostsCount === 0) && safeUsername) {
      const { count: postsByUsernameCount, error: postsByUsernameError } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_username', safeUsername);

      if (fetchToken !== latestUserStatsFetchToken) return;

      if (!postsByUsernameError) {
        const fallbackPosts = normalizeStatInt(postsByUsernameCount, 0);
        resolvedPostsCount = resolvedPostsCount === null ? fallbackPosts : Math.max(resolvedPostsCount, fallbackPosts);
      } else {
        hasQueryError = true;
        console.warn('获取用户帖子数失败(author_username):', postsByUsernameError);
      }
    }

    if (resolvedPostsCount !== null) {
      userStats.posts = resolvedPostsCount;
    }

    if (!pointsResult.error && pointsResult.data) {
      userStats.points = normalizeStatInt(pointsResult.data.points, fallbackPoints);
    } else if (pointsResult.error) {
      console.warn('获取用户积分失败:', pointsResult.error);
    }

    // 获取排名（基于积分）
    const { count: higherRankCount, error: rankError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('points', userStats.points);

    if (fetchToken !== latestUserStatsFetchToken) return;

    if (!rankError) {
      userStats.rank = normalizeStatInt(higherRankCount, 0) + 1;
    } else {
      hasQueryError = true;
      console.warn('获取用户排名失败:', rankError);
    }

    if (hasQueryError && retryCount < 1) {
      setTimeout(() => {
        if (!isLoggedIn.value || !String(userInfo.value.id || '').trim()) return;
        void fetchUserStats({ retryCount: retryCount + 1 });
      }, 900);
    }
  } catch (error) {
    console.warn('获取用户统计数据失败:', error);
  } finally {
    if (fetchToken === latestUserStatsFetchToken) {
      isUserStatsLoading.value = false;
    }
  }
};

const showBirthdayModal = ref(false);
const showJoinDateModal = ref(false);
const showEditProfileModal = ref(false);
const isSubmitting = ref(false);
const isSubmittingJoinDate = ref(false);
const isSubmittingProfileEdit = ref(false);
const submissionJoinDate = ref('');
const editProfileForm = reactive({
  bio: '',
  joinDate: '',
  joinYear: '',
  joinMonth: '',
  joinDay: '',
  birthMonth: '',
  birthDay: ''
});
const AVATAR_MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const PROFILE_BACKGROUND_MAX_FILE_SIZE_BYTES = CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES;

// 主题设置
const showThemeModal = ref(false);
const currentTheme = ref(themeManager.getTheme());
const currentThemePreference = ref(themeManager.getPreference?.() || currentTheme.value);
const IMMERSIVE_BROWSING_STORAGE_KEY = 'boh-userspace-immersive-browsing-beta';
const NAV_HIDE_SCROLL_THRESHOLD = 44;
const NAV_SHOW_SCROLL_THRESHOLD = 12;
const NAV_TOP_VISIBLE_OFFSET = 96;
const readImmersiveBrowsingPreference = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(IMMERSIVE_BROWSING_STORAGE_KEY) === '1';
};
const immersiveBrowsingEnabled = ref(readImmersiveBrowsingPreference());
const isBottomNavHidden = ref(false);
const shouldHideBottomNav = computed(() => {
  return immersiveBrowsingEnabled.value
    && currentTab.value === 'posts'
    && isBottomNavHidden.value
    && !showBirthdayModal.value
    && !showJoinDateModal.value
    && !showThemeModal.value
    && !showCropModal.value;
});
const themeDisplayText = computed(() => {
  if (currentThemePreference.value === 'system') {
    return currentTheme.value === 'dark' ? '跟随系统：深色' : '跟随系统：浅色';
  }
  return currentTheme.value === 'dark' ? '深色模式' : '浅色模式';
});
const dataPrivacyStatusText = computed(() => isProfileBasicsComplete.value ? '资料已完善' : '待补充资料');
const pushplusStatus = reactive({
  loaded: false,
  loading: false,
  hasToken: false,
  enabled: false
});
const pushplusStatusText = computed(() => {
  if (pushplusStatus.loading) return '检查中';
  if (!pushplusStatus.loaded) return '未检查';
  if (!pushplusStatus.hasToken) return '未绑定';
  return pushplusStatus.enabled ? '已启用' : '已暂停';
});
const cloudPlusUsage = reactive({
  loaded: false,
  loading: false,
  used: 0,
  limit: DEFAULT_CLOUD_IMAGE_LIMIT
});
const cloudPlusUsageText = computed(() => {
  if (cloudPlusUsage.loading) return '读取中';
  if (!cloudPlusUsage.loaded) return '未检查';
  return `已使用 ${cloudPlusUsage.used}/${cloudPlusUsage.limit}`;
});
const cloudPlusUsageCaption = computed(() => {
  if (cloudPlusUsage.loading) return 'Cloud+ 图片额度';
  if (!cloudPlusUsage.loaded) return 'Cloud+ 图片额度';
  const remaining = Math.max(0, cloudPlusUsage.limit - cloudPlusUsage.used);
  return remaining > 0 ? `剩余 ${remaining} 张` : '额度已满';
});
let lastImmersiveScrollY = 0;
let immersiveDownDistance = 0;
let immersiveUpDistance = 0;
let immersiveScrollRafId = null;

const getPageScrollY = () => {
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
};

const getMaxPageScrollY = () => {
  if (typeof window === 'undefined') return 0;
  const scrollHeight = Math.max(
    document.documentElement.scrollHeight || 0,
    document.body.scrollHeight || 0
  );
  return Math.max(0, scrollHeight - window.innerHeight);
};

const resetImmersiveNavState = () => {
  isBottomNavHidden.value = false;
  immersiveDownDistance = 0;
  immersiveUpDistance = 0;
  lastImmersiveScrollY = getPageScrollY();
};

const isImmersiveNavEligible = () => {
  return immersiveBrowsingEnabled.value
    && currentTab.value === 'posts'
    && !showBirthdayModal.value
    && !showJoinDateModal.value
    && !showThemeModal.value
    && !showCropModal.value;
};

const applyImmersiveNavScroll = (scrollY, maxScrollY = getMaxPageScrollY()) => {
  const delta = scrollY - lastImmersiveScrollY;
  lastImmersiveScrollY = scrollY;

  if (!isImmersiveNavEligible()) {
    resetImmersiveNavState();
    return;
  }

  if (maxScrollY < 160 || scrollY <= NAV_TOP_VISIBLE_OFFSET || scrollY >= maxScrollY - 24) {
    resetImmersiveNavState();
    return;
  }

  if (Math.abs(delta) < 1) return;

  if (delta > 0) {
    immersiveDownDistance += delta;
    immersiveUpDistance = 0;
    if (immersiveDownDistance >= NAV_HIDE_SCROLL_THRESHOLD) {
      isBottomNavHidden.value = true;
      immersiveDownDistance = 0;
    }
    return;
  }

  immersiveUpDistance += Math.abs(delta);
  immersiveDownDistance = 0;
  if (immersiveUpDistance >= NAV_SHOW_SCROLL_THRESHOLD) {
    isBottomNavHidden.value = false;
    immersiveUpDistance = 0;
  }
};

const updateImmersiveNavFromScroll = () => {
  immersiveScrollRafId = null;
  applyImmersiveNavScroll(getPageScrollY());
};

const handleForumImmersiveScroll = (payload = {}) => {
  if (payload.feedMode && payload.feedMode !== 'posts') {
    resetImmersiveNavState();
    return;
  }
  const scrollY = Math.max(0, Number(payload.scrollTop || 0));
  const scrollHeight = Math.max(0, Number(payload.scrollHeight || 0));
  const clientHeight = Math.max(0, Number(payload.clientHeight || 0));
  const maxScrollY = Math.max(0, scrollHeight - clientHeight);
  applyImmersiveNavScroll(scrollY, maxScrollY);
};

const requestImmersiveNavScrollCheck = () => {
  if (typeof window === 'undefined') return;
  if (immersiveScrollRafId !== null) return;
  immersiveScrollRafId = window.requestAnimationFrame(updateImmersiveNavFromScroll);
};

const toggleImmersiveBrowsing = () => {
  immersiveBrowsingEnabled.value = !immersiveBrowsingEnabled.value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      IMMERSIVE_BROWSING_STORAGE_KEY,
      immersiveBrowsingEnabled.value ? '1' : '0'
    );
  }
  resetImmersiveNavState();
};

const fetchPushplusStatus = async () => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || pushplusStatus.loading) return;

  pushplusStatus.loading = true;
  try {
    const { data, error } = await getPushplusSettings(userId);
    if (error) {
      pushplusStatus.loaded = true;
      pushplusStatus.hasToken = false;
      pushplusStatus.enabled = false;
      return;
    }
    pushplusStatus.loaded = true;
    pushplusStatus.hasToken = Boolean(data?.token);
    pushplusStatus.enabled = Boolean(data?.enabled);
  } catch (error) {
    console.warn('获取 Pushplus 状态失败:', error);
    pushplusStatus.loaded = true;
    pushplusStatus.hasToken = false;
    pushplusStatus.enabled = false;
  } finally {
    pushplusStatus.loading = false;
  }
};

const fetchCloudPlusUsage = async () => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || cloudPlusUsage.loading) return;

  cloudPlusUsage.loading = true;
  try {
    const [subscriptionsResult, cloudEntriesResult] = await Promise.all([
      getMySubscriptions(userId, { includeExpired: true }),
      listMyCloudEntries({ userId, limit: 500 })
    ]);

    const subscriptions = subscriptionsResult.ok && Array.isArray(subscriptionsResult.data)
      ? subscriptionsResult.data
      : [];
    const benefit = resolveCloudBenefitFromSubscriptions(subscriptions);
    cloudPlusUsage.limit = Number(benefit.cloudImageLimit || DEFAULT_CLOUD_IMAGE_LIMIT);

    if (cloudEntriesResult.ok && Array.isArray(cloudEntriesResult.data)) {
      cloudPlusUsage.used = cloudEntriesResult.data.reduce((sum, entry) => (
        sum + (Array.isArray(entry?.contentBlocks)
          ? entry.contentBlocks.filter((block) => block?.type === 'image').length
          : 0)
      ), 0);
    } else {
      cloudPlusUsage.used = 0;
    }

    cloudPlusUsage.loaded = true;
  } catch (error) {
    console.warn('获取 Cloud+ 使用情况失败:', error);
    cloudPlusUsage.loaded = true;
    cloudPlusUsage.used = 0;
    cloudPlusUsage.limit = DEFAULT_CLOUD_IMAGE_LIMIT;
  } finally {
    cloudPlusUsage.loading = false;
  }
};

// 主题变化监听函数
const handleThemeChange = (theme, preference = themeManager.getPreference?.() || theme) => {
  currentTheme.value = theme;
  currentThemePreference.value = preference;
  shouldRefreshForumAfterThemeChange.value = true;
  // 同步更新页面的 data-theme 属性
  const userSpacePage = document.querySelector('.user-space-page');
  if (userSpacePage) {
    userSpacePage.setAttribute('data-theme', theme);
  }
  void refreshForumAfterThemeChange();
};

const openThemeModal = () => {
  showThemeModal.value = true;
};

const closeThemeModal = () => {
  showThemeModal.value = false;
};

const refreshForumAfterThemeChange = async () => {
  if (!shouldRefreshForumAfterThemeChange.value || currentTab.value !== 'posts') return;
  shouldRefreshForumAfterThemeChange.value = false;
  await nextTick();
  forumRenderKey.value += 1;
  resetImmersiveNavState();
};

const setThemePreference = (preference) => {
  if (preference === 'system') {
    themeManager.resetToSystem();
  } else {
    themeManager.setTheme(preference);
  }
  currentTheme.value = themeManager.getTheme();
  currentThemePreference.value = themeManager.getPreference?.() || preference;
  // 更新当前页面的 data-theme 属性
  const userSpacePage = document.querySelector('.user-space-page');
  if (userSpacePage) {
    userSpacePage.setAttribute('data-theme', currentTheme.value);
  }
};

const openProfileSettings = () => {
  profileSection.value = 'settings';
  setProfileSectionRoute('settings');
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
};

const openSponsorPage = () => {
  profileSection.value = 'sponsor';
  setProfileSectionRoute('sponsor');
  sponsorMethod.value = 'wechat';
  sponsorQrVisible.value = false;
  sponsorQrLoadFailed.value = false;
  sponsorQrLoading.value = false;
};

const backToProfileHome = () => {
  profileSection.value = 'home';
  setProfileSectionRoute('home');
};

const openProfileDataManagement = () => {
  profileSection.value = 'data-management';
  setProfileSectionRoute('data-management');
};

const backToProfileSettings = () => {
  profileSection.value = 'settings';
  setProfileSectionRoute('settings');
  void fetchPushplusStatus();
  void fetchCloudPlusUsage();
};

const selectSponsorMethod = (methodId) => {
  sponsorMethod.value = methodId;
  if (methodId === 'alipay') {
    showAlert('info', '暂不支持', '支付宝赞助暂未开放，当前仅支持微信方式。');
  }
};

const startSponsorFlow = () => {
  if (sponsorMethod.value !== 'wechat') {
    showAlert('info', '暂不支持', '请选择微信方式查看赞赏码。');
    return;
  }
  showSponsorQr();
};

const showSponsorQr = () => {
  if (sponsorMethod.value !== 'wechat') return;
  if (sponsorQrVisible.value && !sponsorQrLoadFailed.value) {
    sponsorQrLoading.value = false;
    return;
  }
  sponsorQrVisible.value = true;
  sponsorQrLoadFailed.value = false;
  sponsorQrLoading.value = true;
};

const handleSponsorQrLoad = () => {
  sponsorQrLoading.value = false;
  sponsorQrLoadFailed.value = false;
};

const handleSponsorQrError = () => {
  sponsorQrLoading.value = false;
  sponsorQrLoadFailed.value = true;
};

const submissionBirthday = reactive({
  year: '',
  month: '',
  day: ''
});

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const months = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const joinDateYears = Array.from({ length: Math.max(1, currentYear - 2014 + 1) }, (_, i) => currentYear - i);

const daysForSubmission = computed(() => {
  if (!submissionBirthday.month) return Array.from({ length: 31 }, (_, i) => i + 1);
  const year = submissionBirthday.year || 2024;
  const d = new Date(year, submissionBirthday.month, 0).getDate();
  return Array.from({ length: d }, (_, i) => i + 1);
});

const daysForEditProfile = computed(() => {
  const month = Number(editProfileForm.birthMonth || 0);
  if (!month) return Array.from({ length: 31 }, (_, i) => i + 1);
  const days = new Date(2024, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1);
});

const daysForEditJoinDate = computed(() => {
  const year = Number(editProfileForm.joinYear || currentYear);
  const month = Number(editProfileForm.joinMonth || 0);
  if (!month) return Array.from({ length: 31 }, (_, i) => i + 1);
  const days = new Date(year, month, 0).getDate();
  return Array.from({ length: days }, (_, i) => i + 1);
});

const composeDateValue = (year, month, day) => {
  if (!year && !month && !day) return '';
  if (!year || !month || !day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const splitDateValue = (dateValue) => {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return { year: '', month: '', day: '' };
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
};

const normalizeBirthdayDay = () => {
  if (!submissionBirthday.day) return;
  const maxDay = daysForSubmission.value.length;
  const safeDay = Number(submissionBirthday.day);
  if (!Number.isFinite(safeDay) || safeDay < 1) {
    submissionBirthday.day = '';
    return;
  }
  if (safeDay > maxDay) {
    submissionBirthday.day = maxDay;
  }
};

const normalizeEditProfileBirthdayDay = () => {
  if (!editProfileForm.birthDay) return;
  const maxDay = daysForEditProfile.value.length;
  const safeDay = Number(editProfileForm.birthDay);
  if (!Number.isFinite(safeDay) || safeDay < 1) {
    editProfileForm.birthDay = '';
    return;
  }
  if (safeDay > maxDay) {
    editProfileForm.birthDay = maxDay;
  }
};

const normalizeEditJoinDay = () => {
  if (!editProfileForm.joinDay) return;
  const maxDay = daysForEditJoinDate.value.length;
  const safeDay = Number(editProfileForm.joinDay);
  if (!Number.isFinite(safeDay) || safeDay < 1) {
    editProfileForm.joinDay = '';
    return;
  }
  if (safeDay > maxDay) {
    editProfileForm.joinDay = maxDay;
  }
};

const showAlert = (type, title, message) => {
  alertState.type = type;
  alertState.title = title;
  alertState.message = message;
  alertState.visible = true;
};

const formatBirthday = (b) => {
  if (!b) return '';
  const m = String(b.month).padStart(2, '0');
  const d = String(b.day).padStart(2, '0');
  return `${m}/${d}`;
};

const formatBirthdayLabel = (b) => {
  if (!b) return '';
  const month = Number(b.month);
  const day = Number(b.day);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return formatBirthday(b);
  return `${month}月${day}日`;
};

const formatJoinDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatJoinDateLabel = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const checkBirthday = () => {
  if (!userBirthday.value) return;
  const today = new Date();
  const birthMonth = Number(userBirthday.value.month);
  const birthDay = Number(userBirthday.value.day);

  if (birthMonth === (today.getMonth() + 1) && birthDay === today.getDate()) {
    router.push('/birthday');
  } else {
    let nextBirthday = new Date(today.getFullYear(), birthMonth - 1, birthDay);
    if (nextBirthday < today) nextBirthday.setFullYear(today.getFullYear() + 1);
    const diffDays = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
    showAlert('info', '还没到时间哦', `距离您的生日还有 ${diffDays} 天，请耐心等待惊喜！`);
  }
};

const openBirthdayModal = () => {
  submissionBirthday.year = '';
  if (userBirthday.value) {
    submissionBirthday.month = userBirthday.value.month;
    submissionBirthday.day = userBirthday.value.day;
  } else {
    submissionBirthday.month = '';
    submissionBirthday.day = '';
  }
  showBirthdayModal.value = true;
};

const closeBirthdayModal = () => showBirthdayModal.value = false;

const prepareEditProfileForm = () => {
  const parsedJoinDate = splitDateValue(joinDate.value || '');
  editProfileForm.bio = String(userInfo.value.bio || '');
  editProfileForm.joinDate = joinDate.value || '';
  editProfileForm.joinYear = parsedJoinDate.year;
  editProfileForm.joinMonth = parsedJoinDate.month;
  editProfileForm.joinDay = parsedJoinDate.day;
  editProfileForm.birthMonth = userBirthday.value?.month || '';
  editProfileForm.birthDay = userBirthday.value?.day || '';
};

const openEditProfileModal = () => {
  prepareEditProfileForm();
  showEditProfileModal.value = false;
  profileSection.value = 'edit-profile';
  setProfileSectionRoute('edit-profile');
};

const closeEditProfileModal = () => {
  showEditProfileModal.value = false;
  profileSection.value = 'home';
  setProfileSectionRoute('home');
};

const submitEditProfile = async () => {
  normalizeEditJoinDay();
  normalizeEditProfileBirthdayDay();
  const nextJoinDate = composeDateValue(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay
  );
  if (nextJoinDate === null) {
    showAlert('warning', '提示', '请完整选择入群时间');
    return;
  }
  if (nextJoinDate && nextJoinDate > getTodayDate()) {
    showAlert('warning', '提示', '入群时间不能晚于今天');
    return;
  }
  const hasPartialBirthday = Boolean(editProfileForm.birthMonth) !== Boolean(editProfileForm.birthDay);
  if (hasPartialBirthday) {
    showAlert('warning', '提示', '请完整选择生日月份和日期');
    return;
  }

  isSubmittingProfileEdit.value = true;
  try {
    const updates = {
      bio: String(editProfileForm.bio || '').trim().slice(0, 160),
      join_date: nextJoinDate,
      birth_month: editProfileForm.birthMonth ? String(editProfileForm.birthMonth) : '',
      birth_day: editProfileForm.birthDay ? String(editProfileForm.birthDay) : ''
    };
    const result = await authStore.updateUserProfile(updates);
    if (!result.success) {
      throw new Error(result.message || '更新失败');
    }
    showAlert('success', '保存成功', '个人资料已更新！');
    closeEditProfileModal();
  } catch (error) {
    console.error('编辑资料失败:', error);
    showAlert('error', '保存失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmittingProfileEdit.value = false;
  }
};

const submitBirthdayRequest = async () => {
  if (!submissionBirthday.month || !submissionBirthday.day) {
    showAlert('warning', '提示', '请完整选择出生日期');
    return;
  }
  normalizeBirthdayDay();
  if (Number(submissionBirthday.day) > daysForSubmission.value.length) {
    showAlert('warning', '提示', '请选择有效的出生日期');
    return;
  }
  isSubmitting.value = true;
  try {
    const monthStr = String(submissionBirthday.month);
    const dayStr = String(submissionBirthday.day);

    const result = await authStore.updateUserProfile({
      birth_month: monthStr,
      birth_day: dayStr
    });

    if (!result.success) {
      throw new Error(result.message || '更新失败');
    }

    showAlert('success', '提交成功', '生日信息已更新！');
    closeBirthdayModal();
  } catch (error) {
    console.error('生日提交失败:', error);
    showAlert('error', '提交失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmitting.value = false;
  }
};

const openJoinDateModal = () => {
  submissionJoinDate.value = joinDate.value || '';
  showJoinDateModal.value = true;
};

const openCreatorStudio = () => {
  showAlert('info', '功能即将上线', 'Creator Studio 功能即将上线，敬请期待！');
  return;
};

const openCloudPlusArea = (view = 'content') => {
  const safeView = ['content', 'settings'].includes(String(view)) ? String(view) : 'content';
  const returnOrigin = profileSection.value === 'settings' ? 'userspace-settings' : 'userspace';
  router.push({
    path: '/user-space/note',
    query: {
      view: safeView,
      from: returnOrigin
    }
  });
};

const closeJoinDateModal = () => {
  showJoinDateModal.value = false;
  submissionJoinDate.value = '';
};

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const submitJoinDateRequest = async () => {
  if (!submissionJoinDate.value) {
    showAlert('warning', '提示', '请选择加群日期');
    return;
  }

  isSubmittingJoinDate.value = true;
  try {
    const result = await authStore.updateUserProfile({
      join_date: submissionJoinDate.value
    });

    if (!result.success) {
      throw new Error(result.message || '更新失败');
    }

    showAlert('success', '设置成功', '加群时间已更新！');
    closeJoinDateModal();
  } catch (error) {
    console.error('加群时间设置失败:', error);
    showAlert('error', '设置失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmittingJoinDate.value = false;
  }
};

const toggleCommunityExpand = () => {
  isCommunityExpanded.value = !isCommunityExpanded.value;
};

const toggleShowsExpand = () => {
  isShowsExpanded.value = !isShowsExpanded.value;
};

const syncCommunityViewFromRoute = () => {
  if (currentTab.value !== 'community') return;
  if (String(route.query.view || '') === 'cloudChannels') {
    router.replace({ query: { ...route.query, view: undefined } });
  }
};

const fetchCommunityUsers = async () => {
  const fetchId = ++latestCommunityFetchId;
  isLoadingCommunity.value = true;

  try {
    const { data, error } = await getProfilesPage({
      page: currentCommunityPage.value,
      pageSize: COMMUNITY_PAGE_SIZE,
      search: debouncedCommunitySearchQuery.value,
      countMode: 'exact'
    });

    if (fetchId !== latestCommunityFetchId) {
      return;
    }

    if (!error && data) {
      communityUsers.value = data.items || [];
      totalCommunityUsers.value = data.total || 0;
      hasLoadedCommunity.value = true;
    } else {
      communityUsers.value = [];
      totalCommunityUsers.value = 0;
      console.error('获取社区用户失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestCommunityFetchId) {
      return;
    }

    communityUsers.value = [];
    totalCommunityUsers.value = 0;
    console.error('加载社区用户异常:', err);
  } finally {
    if (fetchId === latestCommunityFetchId) {
      isLoadingCommunity.value = false;
    }
  }
};

const totalCommunityPages = computed(() => Math.max(1, Math.ceil(totalCommunityUsers.value / COMMUNITY_PAGE_SIZE)));

const ensureTabMounted = (tabId) => {
  if (Object.prototype.hasOwnProperty.call(mountedTabs, tabId)) {
    mountedTabs[tabId] = true;
  }
};

const switchTab = (tabId) => {
  ensureTabMounted(tabId);
  if (tabId === 'profile' && currentTab.value !== 'profile') {
    profileSection.value = 'home';
  }
  currentTab.value = tabId;
  if (tabId === 'posts') {
    void preloadForumComponent();
    void refreshForumAfterThemeChange();
  }
  if (tabId === 'community' && !hasLoadedCommunity.value) {
    fetchCommunityUsers();
  }
};

const goToProfile = (usernameVal) => {
  const safeUsername = String(usernameVal || '').trim();
  if (!safeUsername) return;
  router.push(`/profile/${encodeURIComponent(safeUsername)}`);
};

const handleLogout = () => {
  authStore.logout();
  router.push('/');
};

const handleProfileBackgroundClick = () => {
  if (isUploadingProfileBackground.value) return;
  profileBackgroundInputRef.value?.click();
};

const cleanupCloudinaryProfileBackground = async (publicId, fallbackUrl = '') => {
  const safePublicId = String(publicId || extractCloudinaryPublicIdFromUrl(fallbackUrl)).trim();
  if (!safePublicId) return { ok: true };

  return deleteCloudinaryAssetsByPublicIds([safePublicId]);
};

const handleProfileBackgroundFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
    showAlert('warning', '格式不支持', '请选择 JPG、PNG、WebP 或 GIF 图片');
    event.target.value = '';
    return;
  }

  if (file.size > PROFILE_BACKGROUND_MAX_FILE_SIZE_BYTES) {
    showAlert('warning', '图片过大', '请选择不超过 10MB 的图片');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    cropPurpose.value = 'profile-background';
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.onerror = () => {
    showAlert('error', '读取失败', '图片读取失败，请重新选择');
  };
  reader.readAsDataURL(file);

  event.target.value = '';
};

const uploadProfileBackgroundFile = async (file) => {
  const oldBackgroundUrl = profileBackgroundUrl.value;
  const oldBackgroundPublicId = profileBackgroundPublicId.value;
  let uploaded = null;
  isUploadingProfileBackground.value = true;

  try {
    uploaded = await uploadImageToCloudinary(file);
    const result = await authStore.updateUserProfile({
      profile_background_url: uploaded.url,
      profile_background_public_id: uploaded.publicId
    });

    if (!result.success) {
      throw new Error(result.message || '保存背景失败');
    }

    const oldPublicId = String(oldBackgroundPublicId || extractCloudinaryPublicIdFromUrl(oldBackgroundUrl)).trim();
    const newPublicId = String(uploaded.publicId || '').trim();
    if (oldPublicId && oldPublicId !== newPublicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(oldPublicId, oldBackgroundUrl);
      if (!cleanupResult.ok) {
        console.warn('清理旧个人卡片背景失败:', cleanupResult.error);
        showAlert('warning', '背景已更新', cleanupResult.error?.message || '旧背景图云端清理失败，请稍后重试');
        return true;
      }
    }

    showAlert('success', '背景已更新', '个人卡片背景已更换');
    return true;
  } catch (error) {
    console.error('个人卡片背景上传失败:', error);
    if (uploaded?.publicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(uploaded.publicId, uploaded.url);
      if (!cleanupResult.ok) {
        console.warn('清理未保存的新背景失败:', cleanupResult.error);
      }
    }
    showAlert('error', '上传失败', error.message || '背景上传过程出错');
    return false;
  } finally {
    isUploadingProfileBackground.value = false;
  }
};

const handleAvatarClick = () => {
  avatarInputRef.value?.click();
};

const handleAvatarFileChange = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!SUPPORTED_AVATAR_TYPES.has(file.type)) {
    showAlert('warning', '格式不支持', '请选择 JPG、PNG、WebP 或 GIF 图片');
    event.target.value = '';
    return;
  }

  if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
    showAlert('warning', '图片过大', '请选择不超过 12MB 的图片');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    cropPurpose.value = 'avatar';
    cropImageSrc.value = e.target.result;
    showCropModal.value = true;
  };
  reader.onerror = () => {
    showAlert('error', '读取失败', '图片读取失败，请重新选择');
  };
  reader.readAsDataURL(file);

  event.target.value = '';
};

const handleCropConfirm = async (blob) => {
  isProcessingCrop.value = true;
  try {
    if (cropPurpose.value === 'profile-background') {
      const file = new File([blob], 'profile-background.png', { type: 'image/png' });
      const imageCompression = await loadImageCompression();
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1.2,
        maxWidthOrHeight: 1800,
        useWebWorker: true,
        fileType: 'image/webp'
      });

      const ok = await uploadProfileBackgroundFile(compressedFile);
      if (ok) {
        showCropModal.value = false;
      }
      return;
    }

    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const imageCompression = await loadImageCompression();

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
    showAlert('error', '处理失败', cropPurpose.value === 'profile-background' ? '背景裁切出错，请重试' : '头像裁切出错，请重试');
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

    const oldAvatarUrl = avatarUrl.value;

    const timestamp = Date.now();
    const filePath = `${user.id}/avatar_${timestamp}.png`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        contentType: 'image/png',
        cacheControl: '3600'
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const finalUrl = `${publicUrl}?t=${timestamp}`;
    await updateProfileAvatar(user.id, finalUrl);

    if (oldAvatarUrl) {
      try {
        const urlObj = new URL(oldAvatarUrl);
        const pathParts = urlObj.pathname.split('/');
        const avatarsIndex = pathParts.indexOf('avatars');
        if (avatarsIndex !== -1) {
          const oldFilePath = pathParts.slice(avatarsIndex + 1).join('/');
          if (oldFilePath && oldFilePath !== filePath) {
            await supabase.storage.from('avatars').remove([oldFilePath]);
          }
        }
      } catch (e) {
        console.warn('清理旧头像失败 (非致命错误):', e);
      }
    }

    await authStore.updateUserProfile({ avatar_url: finalUrl });

    showAlert('success', '上传成功', '头像已更新！');
  } catch (error) {
    console.error('上传到 Supabase 失败:', error);
    showAlert('error', '上传失败', error.message || '上传过程出错');
  }
};

const getGiftStatusLabel = (status) => {
  const statusMap = {
    preparing: '备货中',
    processing: '正在处理',
    shipped: '已发货',
    completed: '已完成'
  };
  return statusMap[status] || '进行中';
};

const getGiftProgressCacheKey = (userId) => `boh_gift_progress_cache_${userId}`;

const saveGiftProgressCache = (userId, value) => {
  if (!userId) return;
  try {
    const payload = {
      value: value || '',
      timestamp: Date.now()
    };
    localStorage.setItem(getGiftProgressCacheKey(userId), JSON.stringify(payload));
  } catch (error) {
    console.warn('写入礼物进度缓存失败:', error);
  }
};

const loadGiftProgressCache = (userId) => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(getGiftProgressCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > GIFT_PROGRESS_CACHE_TTL_MS) return null;
    return typeof parsed.value === 'string' ? parsed.value : '';
  } catch (error) {
    console.warn('读取礼物进度缓存失败:', error);
    return null;
  }
};

const fetchGiftProgressFromServer = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_gifts')
      .select('gift_status')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('gift_status', 'completed')
      .limit(1);

    if (error) throw error;

    const gift = Array.isArray(data) ? data[0] : null;
    return gift ? getGiftStatusLabel(gift.gift_status) : '';
  } catch (error) {
    console.warn('读取 user_gifts 礼物进度失败，尝试回退 profiles 字段:', error);
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('gift_content, gift_status')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return Boolean(data?.gift_content) && data?.gift_status !== 'completed'
      ? getGiftStatusLabel(data?.gift_status)
      : '';
  } catch (error) {
    console.warn('读取 profiles 回退礼物进度失败:', error);
    return '';
  }
};

const refreshPendingGift = async ({ force = false } = {}) => {
  const userId = userInfo.value?.id;
  if (!isLoggedIn.value || !userId) {
    giftProgressText.value = '';
    return;
  }

  if (!force) {
    const cached = loadGiftProgressCache(userId);
    if (cached !== null) {
      giftProgressText.value = cached;
      return;
    }
  }

  if (giftProgressInflight) {
    await giftProgressInflight;
    return;
  }

  giftProgressInflight = (async () => {
    const latest = await fetchGiftProgressFromServer(userId);
    giftProgressText.value = latest;
    saveGiftProgressCache(userId, latest);
    lastGiftProgressRefreshAt = Date.now();
  })();

  try {
    await giftProgressInflight;
  } finally {
    giftProgressInflight = null;
  }
};

const initUserData = async () => {
  if (isLoggedIn.value && userInfo.value.id) {
    await authStore.updateLocalState({
      id: userInfo.value.id,
      email: userInfo.value.email,
      user_metadata: { username: userInfo.value.username }
    });
  }
};

watch(() => userInfo.value.id, async (newId) => {
  if (newId) {
    await initUserData();
    refreshPendingGift({ force: true });
    void fetchUserStats();
    if (currentTab.value === 'profile') {
      void fetchCloudPlusUsage();
      void fetchProfileContent();
    }
    if (currentTab.value === 'profile' && profileSection.value === 'settings') {
      void fetchPushplusStatus();
      void fetchCloudPlusUsage();
    }
  } else {
    latestUserStatsFetchToken += 1;
    isUserStatsLoading.value = false;
    resetUserStats();
    giftProgressText.value = '';
    pushplusStatus.loaded = false;
    pushplusStatus.hasToken = false;
    pushplusStatus.enabled = false;
    cloudPlusUsage.loaded = false;
    cloudPlusUsage.loading = false;
    cloudPlusUsage.used = 0;
    cloudPlusUsage.limit = DEFAULT_CLOUD_IMAGE_LIMIT;
    latestProfileContentFetchToken += 1;
    isProfileContentLoading.value = false;
    profilePosts.value = [];
  }
});

watch(() => isInitialized.value, (ready) => {
  if (!ready || !isLoggedIn.value || !userInfo.value.id) return;
  void fetchUserStats();
}, { immediate: true });

watch(() => userInfo.value.points, (newPoints) => {
  if (!isLoggedIn.value) return;
  userStats.points = normalizeStatInt(newPoints, userStats.points);
});

watch(() => submissionBirthday.month, () => {
  normalizeBirthdayDay();
});

watch(() => editProfileForm.birthMonth, () => {
  normalizeEditProfileBirthdayDay();
});

watch(() => [editProfileForm.joinYear, editProfileForm.joinMonth], () => {
  normalizeEditJoinDay();
});

onMounted(() => {
  isUserSpaceMounted = true;
  document.body.classList.add("is-loaded");
  // 初始化主题
  const initialTheme = themeManager.getTheme();
  const userSpacePage = document.querySelector('.user-space-page');
  if (userSpacePage) {
    userSpacePage.setAttribute('data-theme', initialTheme);
  }
  currentTheme.value = initialTheme;
  currentThemePreference.value = themeManager.getPreference?.() || initialTheme;
  if (route.query.tab && validTabs.includes(route.query.tab)) {
    currentTab.value = route.query.tab;
  }
  resolveProfileSectionFromRoute();
  ensureTabMounted(currentTab.value);
  if (currentTab.value === 'posts') {
    scheduleForumPreload();
  }
  if (currentTab.value === 'community') {
    fetchCommunityUsers();
    syncCommunityViewFromRoute();
  }
  if (isLoggedIn.value) {
    void initUserData();
    refreshPendingGift();
    void fetchUserStats();
    if (currentTab.value === 'profile') {
      void fetchCloudPlusUsage();
      void fetchProfileContent();
    }
    if (currentTab.value === 'profile' && profileSection.value === 'settings') {
      void fetchPushplusStatus();
      void fetchCloudPlusUsage();
    }
  }
  void refreshUnreadCount();
  window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
  resetImmersiveNavState();
  window.addEventListener('scroll', requestImmersiveNavScrollCheck, { passive: true });
  // 添加主题变化监听
  themeManager.addListener(handleThemeChange);
});

watch(() => route.query.tab, (newTab) => {
  if (!newTab || !validTabs.includes(newTab)) return;
  if (currentTab.value === newTab) return;
  ensureTabMounted(newTab);
  currentTab.value = newTab;
  resolveProfileSectionFromRoute();
  if (newTab === 'posts') {
    scheduleForumPreload();
    void refreshForumAfterThemeChange();
  }
  if (newTab === 'community' && !hasLoadedCommunity.value) {
    fetchCommunityUsers();
  }
  if (newTab === 'community') {
    syncCommunityViewFromRoute();
  }
  if (newTab === 'profile') {
    void fetchCloudPlusUsage();
    void fetchProfileContent();
  }
});

watch(() => route.query.view, () => {
  syncCommunityViewFromRoute();
  resolveProfileSectionFromRoute();
});

watch(currentTab, (newTab, oldTab) => {
  if (newTab !== 'profile' || oldTab !== 'profile') {
    profileSection.value = 'home';
  }
  resolveProfileSectionFromRoute();
  if (newTab === 'profile') {
    void fetchCloudPlusUsage();
    void fetchProfileContent();
  }
});

watch(communitySearchQuery, (value) => {
  if (communitySearchDebounceTimer) {
    clearTimeout(communitySearchDebounceTimer);
  }

  communitySearchDebounceTimer = setTimeout(() => {
    debouncedCommunitySearchQuery.value = String(value || '').trim();
  }, 300);
});

watch(debouncedCommunitySearchQuery, () => {
  if (currentTab.value !== 'community') return;

  if (currentCommunityPage.value !== 1) {
    currentCommunityPage.value = 1;
    return;
  }

  fetchCommunityUsers();
});

watch(currentCommunityPage, () => {
  if (currentTab.value !== 'community') return;
  fetchCommunityUsers();
});

watch([currentTab, immersiveBrowsingEnabled], () => {
  resetImmersiveNavState();
});

onUnmounted(() => {
  isUserSpaceMounted = false;
  latestUserStatsFetchToken += 1;
  clearScheduledForumPreload();
  window.removeEventListener('boh_unread_refresh', handleUnreadRefresh);
  window.removeEventListener('scroll', requestImmersiveNavScrollCheck);
  if (immersiveScrollRafId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(immersiveScrollRafId);
    immersiveScrollRafId = null;
  }
  if (communitySearchDebounceTimer) {
    clearTimeout(communitySearchDebounceTimer);
  }
  // 移除主题变化监听
  themeManager.removeListener(handleThemeChange);
});

const handleUnreadRefresh = () => {
  void refreshUnreadCount();
  if (Date.now() - lastGiftProgressRefreshAt >= GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS) {
    refreshPendingGift({ force: true });
  }
};
</script>

<style scoped src="./style.scoped.css"></style>
