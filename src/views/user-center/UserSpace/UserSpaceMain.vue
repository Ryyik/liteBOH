<template>
  <div class="user-space-page" :class="{
    'tab-transition-forward': tabTransitionDirection === 'forward',
    'tab-transition-back': tabTransitionDirection === 'back'
  }"
    :data-theme="currentTheme">
    <UnifiedNavbar />

    <input type="file" ref="avatarInputRef" class="hidden-file-input" accept="image/*" @change="handleAvatarFileChange">
    <input type="file" ref="profileBackgroundInputRef" class="hidden-file-input" accept="image/*"
      @change="handleProfileBackgroundFileChange">

    <div v-if="mountedTabs.posts" v-show="currentTab === 'posts' || leavingTab === 'posts'" class="tab-page posts-tab" :class="{ 'is-leaving': leavingTab === 'posts' }">
      <AsyncForum :key="forumRenderKey" :show-navbar="false" :show-header="false" :embedded="true"
        @island-message="showBottomNavIsland" />
    </div>

    <div v-if="mountedTabs.community" v-show="currentTab === 'community' || leavingTab === 'community'" class="tab-page" :class="{ 'is-leaving': leavingTab === 'community' }">
      <div class="page-content">
        <div v-if="isLoadingCommunity && !hasLoadedCommunity" class="community-skeleton" aria-hidden="true">
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
            <HomeCatMascot v-if="isHomeCatActive" class="community-group-cat" pool="ambient" seed="community-recent"
              size="sm" decorative />
            <div class="group-header">
              <div class="group-info">
                <h3 class="group-title">最近加入的伙伴</h3>
                <p class="group-count">{{ totalCommunityUsers }} 位伙伴 · 按加入时间排序</p>
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
                <span class="community-toolbar-meta">最近加入 · 第 {{ currentCommunityPage }} / {{ totalCommunityPages }} 页</span>
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

          <button type="button" class="community-group birthday-group" @click="toggleBirthdaysExpand"
            :aria-expanded="isBirthdaysExpanded">
            <HomeCatMascot v-if="isHomeCatActive" class="community-group-cat birthday-cat" pool="reaction"
              seed="community-birthday" size="sm" decorative />
            <div class="group-header">
              <div class="group-info">
                <h3 class="group-title">最近生日</h3>
                <p class="group-count">{{ birthdayGroupSummary }}</p>
              </div>
              <div class="expand-icon" :class="{ expanded: isBirthdaysExpanded }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </button>

          <transition name="expand">
            <div v-if="isBirthdaysExpanded" class="community-users-list birthday-users-list">
              <div v-if="isLoadingBirthdays && recentBirthdayUsers.length === 0" class="loading-state compact">
                <div class="loading-spinner"></div>
                <p class="loading-text">正在加载最近生日...</p>
              </div>

              <div v-else-if="recentBirthdayUsers.length === 0" class="empty-state">
                <Cake class="empty-icon" :size="30" :stroke-width="1.7" aria-hidden="true" />
                <p>暂时没有伙伴设置生日。</p>
              </div>

              <div v-for="user in recentBirthdayUsers" :key="`birthday-${user.id}`" class="user-item birthday-user-item"
                @click="goToProfile(user.username)">
                <div class="user-avatar birthday-avatar">
                  <img v-if="user.avatar_url" :src="user.avatar_url" alt="用户头像" class="avatar-image" loading="lazy"
                    decoding="async" />
                  <span v-else>{{ user.username ? user.username.charAt(0).toUpperCase() : 'U' }}</span>
                </div>
                <div class="user-info">
                  <span class="user-name">@{{ user.username }}</span>
                  <p class="user-bio">{{ formatBirthdayDistance(user) }}</p>
                  <div class="user-meta">
                    <span class="meta-item">
                      <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                      {{ String(user.birth_month).padStart(2, '0') }}/{{ String(user.birth_day).padStart(2, '0') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </transition>

          <button type="button" class="community-group" @click="toggleShowsExpand" :aria-expanded="isShowsExpanded">
            <HomeCatMascot v-if="isHomeCatActive" class="community-group-cat alt" pool="background"
              seed="community-shows" size="sm" decorative />
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

    <div v-if="mountedTabs.shows" v-show="currentTab === 'shows' || leavingTab === 'shows'" class="tab-page shows-tab" :class="{ 'is-leaving': leavingTab === 'shows' }">
      <AsyncShows :embedded="true" />
    </div>

    <div v-if="mountedTabs.ai" v-show="currentTab === 'ai' || leavingTab === 'ai'" class="tab-page ai-tab" :class="{ 'is-leaving': leavingTab === 'ai' }">
      <section class="ai-workspace" aria-label="BOH AI 聊天">
        <AsyncBOHAI :embedded="true" @island-message="showBottomNavIsland" />
      </section>
    </div>

    <div v-if="mountedTabs.messages" v-show="currentTab === 'messages' || leavingTab === 'messages'" class="tab-page messages-tab" :class="{ 'is-leaving': leavingTab === 'messages' }">
      <HomeCatMascot v-if="isHomeCatActive" class="messages-tab-cat" pool="background" seed="messages-tab"
        size="lg" decorative />
      <AsyncMessages :minimal="true" />
    </div>

    <div v-if="mountedTabs.profile" v-show="currentTab === 'profile'" class="tab-page profile-tab">
      <div class="profile-page-content">
        <div v-if="!isLoggedIn" class="login-prompt">
          <User class="login-prompt-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
          <h3 class="login-prompt-title">登录以查看我的</h3>
          <p class="login-prompt-desc">登录后可以访问我的空间和更多功能</p>
          <button class="login-prompt-btn" @click="showLoginModal = true">立即登录</button>
        </div>

        <template v-else>
          <transition name="profile-panel-fade" mode="out-in">
            <ProfileHomePanel
              v-if="profileSection === 'home'"
              key="profile-home"
              :profile="userInfo"
              :avatar-url="avatarUrl"
              :profile-background-url="profileBackgroundUrl"
              :profile-cover-style="profileCoverStyle"
              :is-uploading-profile-background="isUploadingProfileBackground"
              :stats="userStats"
              :is-stats-loading="isUserStatsLoading"
              :cloud-plus-usage-text="cloudPlusUsageText"
              :cloud-plus-usage-meter-style="cloudPlusUsageMeterStyle"
              :subscription-summary-text="subscriptionSummaryText"
              :gift-progress-text="giftProgressText"
              :data-privacy-status-text="dataPrivacyStatusText"
              :theme-display-text="themeDisplayText"
              :pushplus-status-text="pushplusStatusText"
              :content-tabs="profileContentTabs"
              :active-content-tab="activeProfileContentTab"
              :is-content-loading="isProfileContentLoading"
              :posts="profilePosts"
              :has-more-posts="hasMoreProfilePosts"
              :is-loading-more="isLoadingMoreProfilePosts"
              :is-impressions-loading="isProfileImpressionsLoading"
              :impressions="profileImpressions"
              @edit-profile="openEditProfileModal"
              @settings="openProfileSettings"
              @avatar-click="handleAvatarClick"
              @background-click="handleProfileBackgroundClick"
              @tab-change="switchProfileContentTab"
              @sponsor="openSponsorPage"
              @data-management="openProfileDataManagement"
              @cloud-plus="openCloudPlusArea"
              @subscription="router.push('/user-space/subscriptions?from=userspace')"
              @gift="router.push('/user-space/gifts?from=userspace')"
              @post-click="openProfilePost"
              @switch-tab="switchTab"
              @delete-impression="handleDeleteProfileImpression"
              @load-more="loadMoreProfilePosts"
            />

            <div v-else-if="profileSection === 'edit-profile'" key="profile-edit" class="profile-edit-page-shell">
              <UserCenterPageHeader title="编辑资料" back-label="返回我的" max-width="650px" @back="closeEditProfileModal" />

              <section class="profile-edit-page-card">
                <div class="profile-edit-page-hero">
                  <div class="apple-avatar-wrapper profile-edit-page-avatar clickable" @click="handleAvatarClick">
                    <div v-if="avatarUrl" class="apple-avatar has-avatar">
                      <img :src="avatarUrl" alt="头像" class="avatar-img" loading="lazy">
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
                        <option v-for="year in joinDateYears" :key="`page-join-year-${year}`" :value="year">{{ year }}年
                        </option>
                      </select>
                      <select v-model="editProfileForm.joinMonth" class="profile-date-select">
                        <option value="">月</option>
                        <option v-for="month in months" :key="`page-join-month-${month}`" :value="month">{{ month }}月
                        </option>
                      </select>
                      <select v-model="editProfileForm.joinDay" class="profile-date-select">
                        <option value="">日</option>
                        <option v-for="day in daysForEditJoinDate" :key="`page-join-day-${day}`" :value="day">{{ day }}日
                        </option>
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
                  <HomeCatMascot v-if="isHomeCatActive" class="sponsor-hero-cat" pool="background"
                    seed="sponsor-hero" size="lg" decorative />
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
                  <HomeCatMascot v-if="isHomeCatActive" class="sponsor-panel-cat" pool="ambient"
                    seed="sponsor-panel" size="md" decorative />
                  <div class="sponsor-section-head">
                    <div>
                      <p class="sponsor-kicker">Payment</p>
                      <h3>选择赞助方式</h3>
                    </div>
                    <span class="sponsor-status-pill">{{ sponsorStatusText }}</span>
                  </div>

                  <div class="sponsor-method-grid">
                    <button v-for="method in sponsorMethods" :key="method.id" type="button" class="sponsor-method"
                      :class="{ active: sponsorMethod === method.id, disabled: method.disabled }"
                      :aria-disabled="method.disabled ? 'true' : 'false'" @click="selectSponsorMethod(method.id)">
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
                      <div v-if="isHomeCatActive" :key="sponsorCatBurstKey" class="sponsor-cat-party" aria-hidden="true">
                        <HomeCatMascot class="sponsor-party-cat cat-one" pool="reaction"
                          :seed="`sponsor-party-${sponsorCatBurstKey}-one`" size="sm" decorative />
                        <HomeCatMascot class="sponsor-party-cat cat-two" pool="ambient"
                          :seed="`sponsor-party-${sponsorCatBurstKey}-two`" size="sm" decorative />
                        <HomeCatMascot class="sponsor-party-cat cat-three" type="like" size="sm" decorative />
                        <HomeCatMascot class="sponsor-party-cat cat-four" type="success" size="sm" decorative />
                      </div>
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
                          @error="handleSponsorQrError" loading="lazy">
                        <figcaption>使用微信扫码赞助</figcaption>
                      </figure>
                    </div>
                  </transition>
                </section>
              </div>
            </div>

            <ProfileSettingsPanel
              v-else-if="profileSection === 'settings'"
              key="profile-settings"
              :pushplus-status-text="pushplusStatusText"
              :cloud-plus-usage-text="cloudPlusUsageText"
              :subscription-summary-text="subscriptionSummaryText"
              :data-privacy-status-text="dataPrivacyStatusText"
              :theme-display-text="themeDisplayText"
              :is-home-cat-active="isHomeCatActive"
              :current-theme="currentTheme"
              @back="backToProfileHome"
              @open-theme="openThemeModal"
              @open-cloud="openCloudPlusArea"
              @open-pushplus="router.push('/user-space/pushplus-settings?from=userspace-settings')"
              @open-security="router.push('/user-space/account-security?from=userspace-settings')"
              @open-data="openProfileDataManagement"
              @open-data-management="openProfileDataManagement"
              @logout="handleLogout"
            />

            <div v-else key="profile-data-management" class="profile-subpage-shell">
              <UserCenterPageHeader title="数据与隐私" back-label="返回设置" max-width="650px" @back="backToProfileSettings" />

              <div class="profile-subpage-body">
                <div class="apple-card">
                  <div class="apple-list-group">
                    <div class="apple-item clickable"
                      @click="router.push('/user-space/shared-memories?from=userspace-data')">
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

    <UserSpaceBottomNav
      :visible="!(currentTab === 'profile' && profileSection === 'edit-profile')"
      :hidden="shouldHideBottomNav"
      :ai-overlay-open="isAiOverlayOpen"
      :island-visible="isBottomNavIslandExpanded"
      :island-collapsing="isBottomNavIslandCollapsing"
      :island="bottomNavIsland"
      :show-cat-sticker="isHomeCatActive"
      :nav-items="navItems"
      :current-tab="currentTab"
      :nav-indicator-style="bottomNavIndicatorStyle"
      @island-action="handleBottomNavIslandAction"
      @island-before-leave="handleBottomNavIslandBeforeLeave"
      @island-after-leave="handleBottomNavIslandAfterLeave"
      @preload-tab="preloadUserSpaceTab"
      @nav-click="handleBottomNavClick"
    />

    <BohAiGlassOverlay
      v-if="isAiOverlayOpen"
      :theme="currentTheme"
      @close="closeAiOverlay"
      @island-message="showBottomNavIsland"
    />

    <ThemeModal :open="showThemeModal" :current-theme-preference="currentThemePreference"
      @close="closeThemeModal" @select="setThemePreference" />

    <CommonAlertModal v-model:visible="alertState.visible" :type="alertState.type" :title="alertState.title"
      :message="alertState.message" />

    <AvatarCropModal v-model:visible="showCropModal" :image-src="cropImageSrc" :loading="isProcessingCrop"
      :title="cropModalTitle" :hint="cropModalHint" :sub-hint="cropModalSubHint" :aspect-ratio="cropModalAspectRatio"
      :shape="cropModalShape" @confirm="handleCropConfirm" />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, reactive, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Bot, Cake, MessageCircle, Newspaper, User, Users } from 'lucide-vue-next';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import HomeCatMascot from '@/components/HomeCatMascot.vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import BohAiGlassOverlay from './components/BohAiGlassOverlay.vue';
import UserSpaceBottomNav from './components/UserSpaceBottomNav.vue';
import ProfileHomePanel from './components/ProfileHomePanel.vue';
import ProfileSettingsPanel from './components/ProfileSettingsPanel.vue';
import ThemeModal from './components/ThemeModal.vue';
import { useBottomNavIslandQueue } from './composables/useBottomNavIslandQueue.js';
import { createMemoryTtlCache } from './composables/useMemoryTtlCache.js';
import { USER_SPACE_VALID_TABS, useUserSpaceTabs } from './composables/useUserSpaceTabs.js';
import { useImageCompressionLoader } from './composables/useImageCompressionLoader.js';
import {
  AsyncBOHAI,
  AsyncCloudPlus,
  AsyncForum,
  AsyncMessages,
  AsyncShows,
  clearIdlePreloadTasks,
  clearScheduledForumPreload,
  preloadBOHAIComponent,
  preloadForumComponent,
  preloadMessagesComponent,
  preloadShowsComponent,
  scheduleForumPreload,
  scheduleIdleTask,
  setUserSpaceMountedForPreload
} from './async-loaders.js';
import { supabase } from '@/utils/supabase-client.js';
import { getProfilesPage, getRecentBirthdayProfiles } from '@/utils/api/auth-api.js';
import { deleteUserImpression, getPostsByUsername, getUserImpressions, updateProfileAvatar } from '@/utils/api/profile-api.js';
import { getPushplusSettings } from '@/utils/api/pushplus-api.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import { logger } from '@/utils/logger.js';
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
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader';
import { themeManager } from '@/utils/theme-manager.js';
import { isHomeCatTheme } from '@/utils/home-cat-theme.js';
import { DEFAULT_CLOUD_IMAGE_LIMIT, resolveCloudBenefitFromSubscriptions } from '@/utils/subscription-benefits.js';

const { loadImageCompression } = useImageCompressionLoader();

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
const giftProgressText = ref('');
const GIFT_PROGRESS_CACHE_TTL_MS = 60 * 1000;
const GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS = 5 * 1000;
let lastGiftProgressRefreshAt = 0;
let giftProgressInflight = null;
let userSpaceWarmupTimeoutId = null;
const USERSPACE_CACHE_TTL = {
  stats: 60 * 1000,
  cloudUsage: 60 * 1000,
  pushplus: 60 * 1000,
  community: 2 * 60 * 1000,
  birthdays: 10 * 60 * 1000,
  profilePosts: 60 * 1000,
  impressions: 60 * 1000
};
const userSpaceMemoryCache = createMemoryTtlCache();
const getUserSpaceCache = (key, ttlMs) => userSpaceMemoryCache.get(key, ttlMs);
const setUserSpaceCache = (key, value) => userSpaceMemoryCache.set(key, value);

const isLoadingCommunity = ref(false);
const isLoadingBirthdays = ref(false);
const isCommunityExpanded = ref(false);
const isBirthdaysExpanded = ref(false);
const isShowsExpanded = ref(false);
const communityUsers = ref([]);
const recentBirthdayUsers = ref([]);
const communitySearchQuery = ref('');
const debouncedCommunitySearchQuery = ref('');
const currentCommunityPage = ref(1);
const totalCommunityUsers = ref(0);
const COMMUNITY_PAGE_SIZE = 10;
const COMMUNITY_BIRTHDAY_LIMIT = 8;
const hasLoadedCommunity = ref(false);
const hasLoadedBirthdays = ref(false);
const forumRenderKey = ref(0);
const shouldRefreshForumAfterThemeChange = ref(false);
let communitySearchDebounceTimer = null;
let latestCommunityFetchId = 0;
let latestBirthdayFetchId = 0;

const navItems = [
  { id: 'posts', label: '帖子', icon: Newspaper },
  { id: 'community', label: '社区', icon: Users },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'messages', label: '消息', icon: MessageCircle },
  { id: 'profile', label: '我的', icon: User }
];
const isAiOverlayOpen = ref(false);
const aiNavIndex = navItems.findIndex((item) => item.id === 'ai');
const bottomNavIndicatorStyle = computed(() => {
  if (!isAiOverlayOpen.value || aiNavIndex < 0) return navIndicatorStyle.value;
  return {
    '--active-nav-index': aiNavIndex,
    '--active-nav-center': `${((aiNavIndex + 0.5) / navItems.length) * 100}%`,
    '--nav-count': navItems.length
  };
});
const validTabs = USER_SPACE_VALID_TABS;
const loginRequiredTabs = new Set();
const validProfileSections = ['home', 'edit-profile', 'sponsor', 'settings', 'data-management'];
const tabTransitionDirection = ref('forward');
const leavingTab = ref(null);
const {
  currentTab,
  profileSection,
  mountedTabs,
  navIndicatorStyle,
  ensureTabMounted
} = useUserSpaceTabs(navItems);

const getTabOrderIndex = (tabId) => {
  const index = navItems.findIndex((item) => item.id === tabId);
  if (index >= 0) return index;
  return validTabs.indexOf(tabId);
};

const updateTabTransitionDirection = (nextTab, previousTab = currentTab.value) => {
  const nextIndex = getTabOrderIndex(nextTab);
  const previousIndex = getTabOrderIndex(previousTab);
  if (nextIndex < 0 || previousIndex < 0 || nextIndex === previousIndex) return;
  tabTransitionDirection.value = nextIndex > previousIndex ? 'forward' : 'back';
};

const isAdmin = computed(() => userInfo.value.role === 'admin');

const sponsorMethod = ref('wechat');
const sponsorQrVisible = ref(false);
const sponsorQrLoading = ref(false);
const sponsorQrLoadFailed = ref(false);
const sponsorCatBurstKey = ref(0);
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

const openSettingsPanelFromRoute = async () => {
  if (currentTab.value !== 'profile' || profileSection.value !== 'settings') return;
  if (String(route.query.setting || '').trim() !== 'theme') return;

  await nextTick();
  openThemeModal();
};

const setProfileSectionRoute = (section) => {
  const nextQuery = { ...route.query, tab: 'profile' };
  if (section === 'home') {
    delete nextQuery.view;
    delete nextQuery.setting;
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
const PROFILE_POSTS_PAGE_SIZE = 15;
const profilePosts = ref([]);
const profileImpressions = ref([]);
const isProfileContentLoading = ref(false);
const isProfileImpressionsLoading = ref(false);
const hasMoreProfilePosts = ref(true);
const profilePostsPage = ref(1);
const isLoadingMoreProfilePosts = ref(false);
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
  const images = Array.isArray(post.images) ? post.images : [];
  const firstImage = images[0] || null;
  const imageCover = String(firstImage?.url || firstImage?.thumbUrl || firstImage?.originalUrl || '').trim();
  if (imageCover) return imageCover;
  return String(post.cover_image_url || '').trim();
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

const fetchProfileContent = async ({ force = false, reset = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id) {
    profilePosts.value = [];
    return;
  }

  const safeUsername = String(userInfo.value.username || '').trim();
  const userId = String(userInfo.value.id || '').trim();
  const cacheKey = `profile-posts:${userId}:${safeUsername}`;

  if (reset) {
    hasMoreProfilePosts.value = true;
    profilePostsPage.value = 1;
  }

  if (activeProfileContentTab.value === 'posts' && !force && !reset) {
    const cachedPosts = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.profilePosts);
    if (cachedPosts) {
      profilePosts.value = cachedPosts;
      isProfileContentLoading.value = false;
      return;
    }
  }

  const fetchToken = ++latestProfileContentFetchToken;
  if (reset) {
    isProfileContentLoading.value = true;
  }

  try {
    if (activeProfileContentTab.value === 'posts') {
      const pageToLoad = reset ? 1 : profilePostsPage.value;
      const result = await getPostsByUsername(safeUsername, userId, {
        page: pageToLoad,
        pageSize: PROFILE_POSTS_PAGE_SIZE,
        includeUnapprovedForAuthor: true
      });
      if (fetchToken !== latestProfileContentFetchToken) return;
      if (result.error) {
        logger.warn('user-space', '读取我的发帖失败:', result.error);
        if (reset) profilePosts.value = [];
        return;
      }
      const incoming = result.data || [];
      if (reset) {
        profilePosts.value = incoming;
      } else {
        const seen = new Set(profilePosts.value.map(p => p.id));
        const newPosts = incoming.filter(p => !seen.has(p.id));
        profilePosts.value = [...profilePosts.value, ...newPosts];
      }
      hasMoreProfilePosts.value = incoming.length === PROFILE_POSTS_PAGE_SIZE;
      profilePostsPage.value = pageToLoad + 1;
      setUserSpaceCache(cacheKey, profilePosts.value);
      return;
    }

  } catch (error) {
    logger.warn('user-space', '读取我的内容失败:', error);
    if (activeProfileContentTab.value === 'posts' && reset) {
      profilePosts.value = [];
    }
  } finally {
    if (fetchToken === latestProfileContentFetchToken) {
      isProfileContentLoading.value = false;
    }
  }
};

const loadMoreProfilePosts = async () => {
  if (isLoadingMoreProfilePosts.value || !hasMoreProfilePosts.value) return;
  isLoadingMoreProfilePosts.value = true;
  try {
    await fetchProfileContent({ reset: false });
  } finally {
    isLoadingMoreProfilePosts.value = false;
  }
};

const switchProfileContentTab = (tabId) => {
  if (!profileContentTabs.some(tab => tab.id === tabId)) return;
  if (activeProfileContentTab.value === tabId) return;
  activeProfileContentTab.value = tabId;
  if (tabId === 'posts') {
    void fetchProfileContent({ reset: true });
  } else if (tabId === 'cloud') {
    void fetchCloudPlusUsage();
  } else if (tabId === 'impressions') {
    void fetchProfileImpressions();
  }
};

const fetchProfileImpressions = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    profileImpressions.value = [];
    return;
  }

  const cacheKey = `profile-impressions:${userId}`;
  if (!force) {
    const cachedImpressions = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.impressions);
    if (cachedImpressions) {
      profileImpressions.value = cachedImpressions;
      isProfileImpressionsLoading.value = false;
      return;
    }
  }

  const fetchToken = ++latestProfileImpressionsFetchToken;
  isProfileImpressionsLoading.value = true;
  try {
    const { data, error } = await getUserImpressions(userId);
    if (fetchToken !== latestProfileImpressionsFetchToken) return;
    if (error) {
      logger.warn('user-space', '读取我的印象失败:', error);
      profileImpressions.value = [];
      return;
    }
    profileImpressions.value = data || [];
    setUserSpaceCache(cacheKey, profileImpressions.value);
  } catch (error) {
    logger.warn('user-space', '读取我的印象异常:', error);
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
    setUserSpaceCache(`profile-impressions:${userId}`, profileImpressions.value);
    showAlert('success', '删除成功', '该印象已被移除');
  } catch (error) {
    logger.warn('user-space', '删除我的印象异常:', error);
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
const fetchUserStats = async ({ retryCount = 0, force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!isLoggedIn.value || !userId) return;

  const safeUsername = String(userInfo.value.username || '').trim();
  const cacheKey = `stats:${userId}:${safeUsername}`;
  if (!force && retryCount === 0) {
    const cachedStats = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.stats);
    if (cachedStats) {
      userStats.posts = normalizeStatInt(cachedStats.posts, 0);
      userStats.points = normalizeStatInt(cachedStats.points, 0);
      userStats.rank = normalizeStatInt(cachedStats.rank, 0);
      isUserStatsLoading.value = false;
      return;
    }
  }

  const fetchToken = ++latestUserStatsFetchToken;
  isUserStatsLoading.value = true;
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
      logger.warn('user-space', '获取用户帖子数失败(author_id):', postsByIdResult.error);
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
        logger.warn('user-space', '获取用户帖子数失败(author_username):', postsByUsernameError);
      }
    }

    if (resolvedPostsCount !== null) {
      userStats.posts = resolvedPostsCount;
    }

    if (!pointsResult.error && pointsResult.data) {
      userStats.points = normalizeStatInt(pointsResult.data.points, fallbackPoints);
    } else if (pointsResult.error) {
      logger.warn('user-space', '获取用户积分失败:', pointsResult.error);
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
      logger.warn('user-space', '获取用户排名失败:', rankError);
    }

    setUserSpaceCache(cacheKey, {
      posts: userStats.posts,
      points: userStats.points,
      rank: userStats.rank
    });

    if (hasQueryError && retryCount < 1) {
      setTimeout(() => {
        if (!isLoggedIn.value || !String(userInfo.value.id || '').trim()) return;
        void fetchUserStats({ retryCount: retryCount + 1 });
      }, 900);
    }
  } catch (error) {
    logger.warn('user-space', '获取用户统计数据失败:', error);
  } finally {
    if (fetchToken === latestUserStatsFetchToken) {
      isUserStatsLoading.value = false;
    }
  }
};

const isSubmittingProfileEdit = ref(false);
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
const isHomeCatActive = computed(() => isHomeCatTheme(currentTheme.value) || isHomeCatTheme(currentThemePreference.value));
const shouldHideBottomNav = computed(() => false);
const themeDisplayText = computed(() => {
  if (currentThemePreference.value === 'home-cat') {
    return '方块小窝';
  }
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
const cloudPlusUsageMeterStyle = computed(() => {
  const limit = Math.max(1, Number(cloudPlusUsage.limit || DEFAULT_CLOUD_IMAGE_LIMIT));
  const used = Math.max(0, Number(cloudPlusUsage.used || 0));
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { width: `${percent}%` };
});
const subscriptionSummaryText = computed(() => {
  if (cloudPlusUsage.loading) return '正在同步权益';
  if (!cloudPlusUsage.loaded) return '查看积分与额度';
  if (Number(cloudPlusUsage.limit || 0) > DEFAULT_CLOUD_IMAGE_LIMIT) {
    return `Cloud 额度 ${cloudPlusUsage.limit}`;
  }
  return '基础权益';
});
let latestUnreadIslandEventAt = 0;
let hasScheduledBottomNavOnboardingNotice = false;
const BOTTOM_NAV_ONBOARDING_NOTICE_VERSION = 'v1';

const {
  island: bottomNavIsland,
  isCollapsing: isBottomNavIslandCollapsing,
  isExpanded: isBottomNavIslandExpanded,
  show: showBottomNavIsland,
  handleAction: handleBottomNavIslandAction,
  handleBeforeLeave: handleBottomNavIslandBeforeLeave,
  handleAfterLeave: handleBottomNavIslandAfterLeave,
  dispose: disposeBottomNavIsland
} = useBottomNavIslandQueue({
  onAction: (actionTab) => {
    if (actionTab && validTabs.includes(actionTab)) {
      switchTab(actionTab);
    }
  }
});

const handleBottomNavIslandEvent = (event) => {
  showBottomNavIsland(event?.detail || {});
};

const getBottomNavOnboardingNoticeKey = () => {
  const userId = String(userInfo.value?.id || 'guest').trim() || 'guest';
  return `boh-userspace-bottom-nav-onboarding-${BOTTOM_NAV_ONBOARDING_NOTICE_VERSION}-${userId}`;
};

const hasSeenBottomNavOnboardingNotice = () => {
  try {
    return localStorage.getItem(getBottomNavOnboardingNoticeKey()) === '1';
  } catch (error) {
    logger.warn('user-space', '读取灵动导航栏引导状态失败:', error);
    return false;
  }
};

const markBottomNavOnboardingNoticeSeen = () => {
  try {
    localStorage.setItem(getBottomNavOnboardingNoticeKey(), '1');
  } catch (error) {
    logger.warn('user-space', '写入灵动导航栏引导状态失败:', error);
  }
};

const maybeShowBottomNavOnboardingNotice = async () => {
  if (hasScheduledBottomNavOnboardingNotice) return;
  if (!isInitialized.value) return;
  if (hasSeenBottomNavOnboardingNotice()) return;

  hasScheduledBottomNavOnboardingNotice = true;
  await nextTick();

  showBottomNavIsland({
    title: '灵动导航栏上线',
    message: '以后弹窗提示都在这哦',
    icon: 'notification',
    type: 'notification',
    actionLabel: '知道了',
    durationMs: 5600,
    catSticker: 'cardExtra',
    catStickerMode: 'hero',
    forceCatSticker: true
  });
  markBottomNavOnboardingNoticeSeen();
};

const buildUnreadIslandMessage = (detail = {}) => {
  const totalUnread = Number(unreadCount.value) || 0;
  return {
    title: '有新通知',
    message: totalUnread > 0 ? `当前共有 ${totalUnread} 条未读` : '你有新的站内通知',
    icon: 'notification',
    durationMs: 6200
  };
};

const showUnreadBottomNavIsland = async (detail = {}) => {
  if (!isLoggedIn.value) return;
  if (String(detail.source || '') !== 'realtime') return;
  const now = Date.now();
  if (now - latestUnreadIslandEventAt < 900) return;
  latestUnreadIslandEventAt = now;

  showBottomNavIsland(buildUnreadIslandMessage(detail));
};

const fetchPushplusStatus = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || pushplusStatus.loading) return;

  const cacheKey = `pushplus:${userId}`;
  if (!force) {
    const cachedStatus = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.pushplus);
    if (cachedStatus) {
      pushplusStatus.loaded = true;
      pushplusStatus.hasToken = Boolean(cachedStatus.hasToken);
      pushplusStatus.enabled = Boolean(cachedStatus.enabled);
      return;
    }
  }

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
    setUserSpaceCache(cacheKey, {
      hasToken: pushplusStatus.hasToken,
      enabled: pushplusStatus.enabled
    });
  } catch (error) {
    logger.warn('user-space', '获取 Pushplus 状态失败:', error);
    pushplusStatus.loaded = true;
    pushplusStatus.hasToken = false;
    pushplusStatus.enabled = false;
  } finally {
    pushplusStatus.loading = false;
  }
};

const fetchCloudPlusUsage = async ({ force = false } = {}) => {
  const userId = String(userInfo.value.id || '').trim();
  if (!userId || cloudPlusUsage.loading) return;

  const cacheKey = `cloud-usage:${userId}`;
  if (!force) {
    const cachedUsage = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.cloudUsage);
    if (cachedUsage) {
      cloudPlusUsage.loaded = true;
      cloudPlusUsage.used = Number(cachedUsage.used || 0);
      cloudPlusUsage.limit = Number(cachedUsage.limit || DEFAULT_CLOUD_IMAGE_LIMIT);
      return;
    }
  }

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
    setUserSpaceCache(cacheKey, {
      used: cloudPlusUsage.used,
      limit: cloudPlusUsage.limit
    });
  } catch (error) {
    logger.warn('user-space', '获取 Cloud+ 使用情况失败:', error);
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
  sponsorCatBurstKey.value += 1;
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
  sponsorCatBurstKey.value += 1;
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

const alertState = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const months = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const joinDateYears = Array.from({ length: Math.max(1, currentYear - 2014 + 1) }, (_, i) => currentYear - i);

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
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const hasAnyDatePart = (...parts) => parts.some((part) => String(part || '').trim());
const hasCompleteDateParts = (...parts) => parts.every((part) => String(part || '').trim());

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
  profileSection.value = 'edit-profile';
  setProfileSectionRoute('edit-profile');
};

const closeEditProfileModal = () => {
  profileSection.value = 'home';
  setProfileSectionRoute('home');
};

const submitEditProfile = async () => {
  normalizeEditJoinDay();
  normalizeEditProfileBirthdayDay();
  const hasAnyJoinDatePart = hasAnyDatePart(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay
  );
  const hasCompleteJoinDate = hasCompleteDateParts(
    editProfileForm.joinYear,
    editProfileForm.joinMonth,
    editProfileForm.joinDay
  );
  if (hasAnyJoinDatePart && !hasCompleteJoinDate) {
    showAlert('warning', '提示', '请完整选择入群时间');
    return;
  }
  const nextJoinDate = hasCompleteJoinDate
    ? composeDateValue(editProfileForm.joinYear, editProfileForm.joinMonth, editProfileForm.joinDay)
    : null;
  if (nextJoinDate && nextJoinDate > getTodayDate()) {
    showAlert('warning', '提示', '入群时间不能晚于今天');
    return;
  }
  const hasAnyBirthdayPart = hasAnyDatePart(editProfileForm.birthMonth, editProfileForm.birthDay);
  const hasCompleteBirthday = hasCompleteDateParts(editProfileForm.birthMonth, editProfileForm.birthDay);
  if (hasAnyBirthdayPart && !hasCompleteBirthday) {
    showAlert('warning', '提示', '请完整选择生日月份和日期');
    return;
  }

  isSubmittingProfileEdit.value = true;
  try {
    const updates = {
      bio: String(editProfileForm.bio || '').trim().slice(0, 160),
      join_date: nextJoinDate,
      birth_month: hasCompleteBirthday ? String(editProfileForm.birthMonth) : null,
      birth_day: hasCompleteBirthday ? String(editProfileForm.birthDay) : null
    };
    const result = await authStore.updateUserProfile(updates);
    if (!result.success) {
      throw new Error(result.message || '更新失败');
    }
    showBottomNavIsland({
      title: '个人资料已保存',
      message: '你的资料更新已同步',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
    closeEditProfileModal();
  } catch (error) {
    logger.error('user-space', '编辑资料失败:', error);
    showAlert('error', '保存失败', `错误: ${error.message || '未知错误'}`);
  } finally {
    isSubmittingProfileEdit.value = false;
  }
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

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toggleCommunityExpand = () => {
  isCommunityExpanded.value = !isCommunityExpanded.value;
};

const toggleBirthdaysExpand = () => {
  isBirthdaysExpanded.value = !isBirthdaysExpanded.value;
  if (isBirthdaysExpanded.value && !hasLoadedBirthdays.value && !isLoadingBirthdays.value) {
    fetchRecentBirthdays();
  }
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

const fetchCommunityUsers = async ({ force = false } = {}) => {
  const searchKey = String(debouncedCommunitySearchQuery.value || '').trim().toLowerCase();
  const cacheKey = `community:${currentCommunityPage.value}:${COMMUNITY_PAGE_SIZE}:${searchKey}`;
  if (!force) {
    const cachedCommunity = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.community);
    if (cachedCommunity) {
      communityUsers.value = cachedCommunity.items || [];
      totalCommunityUsers.value = cachedCommunity.total || 0;
      hasLoadedCommunity.value = true;
      isLoadingCommunity.value = false;
      return;
    }
  }

  const fetchId = ++latestCommunityFetchId;
  isLoadingCommunity.value = true;

  try {
    const { data, error } = await getProfilesPage({
      page: currentCommunityPage.value,
      pageSize: COMMUNITY_PAGE_SIZE,
      search: debouncedCommunitySearchQuery.value,
      countMode: 'planned'
    });

    if (fetchId !== latestCommunityFetchId) {
      return;
    }

    if (!error && data) {
      communityUsers.value = data.items || [];
      totalCommunityUsers.value = data.total || 0;
      hasLoadedCommunity.value = true;
      setUserSpaceCache(cacheKey, {
        items: communityUsers.value,
        total: totalCommunityUsers.value
      });
    } else {
      communityUsers.value = [];
      totalCommunityUsers.value = 0;
      logger.error('user-space', '获取社区用户失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestCommunityFetchId) {
      return;
    }

    communityUsers.value = [];
    totalCommunityUsers.value = 0;
    logger.error('user-space', '加载社区用户异常:', err);
  } finally {
    if (fetchId === latestCommunityFetchId) {
      isLoadingCommunity.value = false;
    }
  }
};

const totalCommunityPages = computed(() => Math.max(1, Math.ceil(totalCommunityUsers.value / COMMUNITY_PAGE_SIZE)));

const birthdayGroupSummary = computed(() => {
  if (isLoadingBirthdays.value && recentBirthdayUsers.value.length === 0) {
    return '正在加载最近生日';
  }
  if (!recentBirthdayUsers.value.length) {
    return '查看即将过生日的伙伴';
  }
  const firstBirthday = recentBirthdayUsers.value[0];
  return `${recentBirthdayUsers.value.length} 位伙伴 · ${formatBirthdayDistance(firstBirthday)}`;
});

const formatBirthdayDistance = (user = {}) => {
  const daysUntil = Number(user.birthday_days_until);
  if (!Number.isFinite(daysUntil)) {
    return '生日即将到来';
  }
  if (daysUntil === 0) {
    return '今天生日';
  }
  if (daysUntil === 1) {
    return '明天生日';
  }
  return `${daysUntil} 天后生日`;
};

const fetchRecentBirthdays = async ({ force = false } = {}) => {
  const cacheKey = `birthdays:${COMMUNITY_BIRTHDAY_LIMIT}`;
  if (!force) {
    const cachedBirthdays = getUserSpaceCache(cacheKey, USERSPACE_CACHE_TTL.birthdays);
    if (cachedBirthdays) {
      recentBirthdayUsers.value = cachedBirthdays;
      hasLoadedBirthdays.value = true;
      isLoadingBirthdays.value = false;
      return;
    }
  }

  const fetchId = ++latestBirthdayFetchId;
  isLoadingBirthdays.value = true;

  try {
    const { data, error } = await getRecentBirthdayProfiles({
      limit: COMMUNITY_BIRTHDAY_LIMIT
    });

    if (fetchId !== latestBirthdayFetchId) {
      return;
    }

    if (!error) {
      recentBirthdayUsers.value = data || [];
      hasLoadedBirthdays.value = true;
      setUserSpaceCache(cacheKey, recentBirthdayUsers.value);
    } else {
      recentBirthdayUsers.value = [];
      logger.error('user-space', '获取最近生日失败:', error);
    }
  } catch (err) {
    if (fetchId !== latestBirthdayFetchId) {
      return;
    }

    recentBirthdayUsers.value = [];
    logger.error('user-space', '加载最近生日异常:', err);
  } finally {
    if (fetchId === latestBirthdayFetchId) {
      isLoadingBirthdays.value = false;
    }
  }
};

const fetchCommunityOverview = async () => {
  await Promise.all([
    fetchCommunityUsers(),
    hasLoadedBirthdays.value ? Promise.resolve() : fetchRecentBirthdays()
  ]);
};

const preloadUserSpaceTab = (tabId) => {
  const safeTab = String(tabId || '');
  if (!validTabs.includes(safeTab)) return;
  if (safeTab === 'posts') {
    scheduleIdleTask('tab:posts', () => void preloadForumComponent());
  } else if (safeTab === 'messages' && canOpenUserSpaceTab('messages')) {
    scheduleIdleTask('tab:messages', () => void preloadMessagesComponent());
  } else if (safeTab === 'shows') {
    scheduleIdleTask('tab:shows', () => void preloadShowsComponent());
  } else if (safeTab === 'ai') {
    scheduleIdleTask('tab:ai', () => void preloadBOHAIComponent());
  } else if (safeTab === 'community' && !hasLoadedCommunity.value) {
    scheduleIdleTask('tab:community', () => void fetchCommunityOverview(), { timeout: 2400, fallbackDelay: 420 });
  } else if (safeTab === 'profile' && isLoggedIn.value) {
    scheduleIdleTask('tab:profile', () => scheduleUserSpaceWarmup(), { timeout: 2400, fallbackDelay: 420 });
  }
};

const canOpenUserSpaceTab = (tabId) => !loginRequiredTabs.has(tabId) || isLoggedIn.value;

const resolveAccessibleTab = (tabId, { promptLogin = false } = {}) => {
  const safeTab = validTabs.includes(tabId) ? tabId : 'posts';
  if (canOpenUserSpaceTab(safeTab)) return safeTab;
  if (promptLogin) {
    showLoginModal.value = true;
  }
  return currentTab.value && canOpenUserSpaceTab(currentTab.value) ? currentTab.value : 'profile';
};

const syncUserSpaceTabRoute = (tabId) => {
  const nextQuery = { ...route.query, tab: tabId };
  if (tabId !== 'profile') {
    delete nextQuery.view;
    delete nextQuery.setting;
  }
  if (tabId !== 'messages') {
    delete nextQuery.section;
    delete nextQuery.to;
  } else {
    delete nextQuery.to;
    nextQuery.section = 'notifications';
  }

  const currentRouteTab = String(route.query.tab || '');
  const currentSection = String(route.query.section || '');
  const nextSection = String(nextQuery.section || '');
  if (currentRouteTab === tabId && currentSection === nextSection) return;

  router.replace({ path: '/user-space', query: nextQuery });
};

const handleBottomNavClick = (tabId) => {
  if (tabId === 'ai') {
    isAiOverlayOpen.value = !isAiOverlayOpen.value;
    return;
  }
  isAiOverlayOpen.value = false;
  switchTab(tabId);
};

const switchTab = (tabId) => {
  const nextTab = resolveAccessibleTab(tabId, { promptLogin: true });
  if (nextTab !== tabId) return;
  if (currentTab.value === tabId) return;
  updateTabTransitionDirection(tabId);
  ensureTabMounted(tabId);
  if (tabId === 'profile' && currentTab.value !== 'profile') {
    profileSection.value = 'home';
  }
  leavingTab.value = currentTab.value;
  setTimeout(() => {
    currentTab.value = tabId;
    leavingTab.value = null;
    syncUserSpaceTabRoute(tabId);
    if (tabId === 'posts') {
      void preloadForumComponent();
      void refreshForumAfterThemeChange();
    }
    if (tabId === 'community' && !hasLoadedCommunity.value) {
      fetchCommunityOverview();
    }
    if (tabId === 'ai') {
      void preloadBOHAIComponent();
    }
  }, 180);
};

const closeAiOverlay = () => {
  isAiOverlayOpen.value = false;
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
        logger.warn('user-space', '清理旧个人卡片背景失败:', cleanupResult.error);
        showAlert('warning', '背景已更新', cleanupResult.error?.message || '旧背景图云端清理失败，请稍后重试');
        return true;
      }
    }

    showBottomNavIsland({
      title: '背景已更新',
      message: '个人卡片背景已更换',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
    return true;
  } catch (error) {
    logger.error('user-space', '个人卡片背景上传失败:', error);
    if (uploaded?.publicId) {
      const cleanupResult = await cleanupCloudinaryProfileBackground(uploaded.publicId, uploaded.url);
      if (!cleanupResult.ok) {
        logger.warn('user-space', '清理未保存的新背景失败:', cleanupResult.error);
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
    logger.error('user-space', '裁切处理失败:', error);
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
        logger.warn('user-space', '清理旧头像失败 (非致命错误):', e);
      }
    }

    await authStore.updateUserProfile({ avatar_url: finalUrl });

    showBottomNavIsland({
      title: '头像已更新',
      message: '新的头像已经同步',
      icon: 'success',
      type: 'success',
      actionLabel: '查看',
      actionTab: 'profile',
      durationMs: 4200
    });
  } catch (error) {
    logger.error('user-space', '上传到 Supabase 失败:', error);
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
    logger.warn('user-space', '写入礼物进度缓存失败:', error);
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
    logger.warn('user-space', '读取礼物进度缓存失败:', error);
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
    logger.warn('user-space', '读取 user_gifts 礼物进度失败，尝试回退 profiles 字段:', error);
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
    logger.warn('user-space', '读取 profiles 回退礼物进度失败:', error);
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

const clearUserSpaceWarmup = () => {
  if (userSpaceWarmupTimeoutId !== null && typeof window !== 'undefined') {
    window.clearTimeout(userSpaceWarmupTimeoutId);
    userSpaceWarmupTimeoutId = null;
  }
};

const runProfileCriticalFetches = ({ force = false } = {}) => {
  void refreshPendingGift({ force });
  void fetchUserStats({ force });
  void fetchCloudPlusUsage({ force });
  void fetchProfileContent({ force, reset: force });
};

const scheduleUserSpaceWarmup = ({ force = false } = {}) => {
  if (!isLoggedIn.value || !userInfo.value.id || typeof window === 'undefined') return;
  clearUserSpaceWarmup();
  userSpaceWarmupTimeoutId = window.setTimeout(() => {
    userSpaceWarmupTimeoutId = null;
    if (!isLoggedIn.value || !userInfo.value.id) return;
    void refreshPendingGift({ force });
    void fetchUserStats({ force });
    if (currentTab.value === 'profile') {
      void fetchCloudPlusUsage({ force });
    }
  }, currentTab.value === 'profile' ? 120 : 900);
};

watch(() => userInfo.value.id, async (newId) => {
  if (newId) {
    await initUserData();
    if (currentTab.value === 'profile') {
      runProfileCriticalFetches({ force: true });
    } else {
      scheduleUserSpaceWarmup({ force: true });
    }
    if (currentTab.value === 'profile' && profileSection.value === 'settings') {
      void fetchPushplusStatus({ force: true });
      void fetchCloudPlusUsage({ force: true });
    }
  } else {
    clearUserSpaceWarmup();
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
  if (!ready) return;
  void maybeShowBottomNavOnboardingNotice();
  if (!isLoggedIn.value || !userInfo.value.id) return;
  void fetchUserStats();
}, { immediate: true });

watch(() => userInfo.value.points, (newPoints) => {
  if (!isLoggedIn.value) return;
  userStats.points = normalizeStatInt(newPoints, userStats.points);
});

watch(() => editProfileForm.birthMonth, () => {
  normalizeEditProfileBirthdayDay();
});

watch(() => [editProfileForm.joinYear, editProfileForm.joinMonth], () => {
  normalizeEditJoinDay();
});

onMounted(() => {
  setUserSpaceMountedForPreload(true);
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
    currentTab.value = resolveAccessibleTab(route.query.tab, { promptLogin: true });
  }
  resolveProfileSectionFromRoute();
  void openSettingsPanelFromRoute();
  ensureTabMounted(currentTab.value);
  // 确保 URL 与当前 tab 同步，否则论坛嵌入式组件的 FAB 按钮检查 route.query.tab 会失败
  if (!route.query.tab || !validTabs.includes(route.query.tab)) {
    syncUserSpaceTabRoute(currentTab.value);
  }
  if (currentTab.value === 'posts') {
    scheduleForumPreload(currentTab.value);
  }
  if (currentTab.value === 'community') {
    fetchCommunityOverview();
    syncCommunityViewFromRoute();
  }
  if (isLoggedIn.value) {
    void initUserData();
    if (currentTab.value === 'profile') {
      runProfileCriticalFetches();
    } else {
      scheduleUserSpaceWarmup();
    }
    if (currentTab.value === 'profile' && profileSection.value === 'settings') {
      void fetchPushplusStatus();
      void fetchCloudPlusUsage();
    }
  }
  void maybeShowBottomNavOnboardingNotice();
  void refreshUnreadCount();
  window.addEventListener('boh_unread_refresh', handleUnreadRefresh);
  window.addEventListener('boh_userspace_nav_island', handleBottomNavIslandEvent);
  // 添加主题变化监听
  themeManager.addListener(handleThemeChange);
});

watch(() => route.query.tab, (newTab) => {
  if (!newTab || !validTabs.includes(newTab)) return;
  const nextTab = resolveAccessibleTab(newTab, { promptLogin: true });
  if (currentTab.value === nextTab) return;
  updateTabTransitionDirection(nextTab);
  ensureTabMounted(nextTab);
  leavingTab.value = currentTab.value;
  setTimeout(() => {
    currentTab.value = nextTab;
    leavingTab.value = null;
    resolveProfileSectionFromRoute();
    if (nextTab === 'posts') {
      scheduleForumPreload(currentTab.value);
      void refreshForumAfterThemeChange();
    }
    if (nextTab === 'community' && !hasLoadedCommunity.value) {
      fetchCommunityOverview();
    }
    if (nextTab === 'community') {
      syncCommunityViewFromRoute();
    }
    if (nextTab === 'profile') {
      runProfileCriticalFetches();
      void openSettingsPanelFromRoute();
    }
  }, 180);
});

watch(() => route.query.view, () => {
  syncCommunityViewFromRoute();
  resolveProfileSectionFromRoute();
  void openSettingsPanelFromRoute();
});

watch(() => route.query.setting, () => {
  void openSettingsPanelFromRoute();
});

watch(currentTab, (newTab, oldTab) => {
  if (newTab !== 'profile' || oldTab !== 'profile') {
    profileSection.value = 'home';
  }
  resolveProfileSectionFromRoute();
  if (newTab === 'profile') {
    runProfileCriticalFetches();
  } else if (oldTab === 'profile') {
    scheduleUserSpaceWarmup();
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

onUnmounted(() => {
  setUserSpaceMountedForPreload(false);
  latestUserStatsFetchToken += 1;
  clearScheduledForumPreload();
  clearIdlePreloadTasks();
  clearUserSpaceWarmup();
  disposeBottomNavIsland();
  window.removeEventListener('boh_unread_refresh', handleUnreadRefresh);
  window.removeEventListener('boh_userspace_nav_island', handleBottomNavIslandEvent);
  if (communitySearchDebounceTimer) {
    clearTimeout(communitySearchDebounceTimer);
  }
  // 移除主题变化监听
  themeManager.removeListener(handleThemeChange);
});

const handleUnreadRefresh = (event) => {
  const detail = event?.detail || {};
  void (async () => {
    await refreshUnreadCount();
    await showUnreadBottomNavIsland(detail);
  })();
  if (Date.now() - lastGiftProgressRefreshAt >= GIFT_PROGRESS_MIN_REFRESH_INTERVAL_MS) {
    refreshPendingGift({ force: true });
  }
};
</script>

<style src="./styles/shell-community.css"></style>
<style src="./styles/profile-base.css"></style>
<style src="./styles/profile-panels.css"></style>
<style src="./styles/responsive-integrations.css"></style>
