<template>
  <div class="x-notifications-container" :class="{ 'minimal-mode': minimal, 'detail-open': selectedMessage }">
    <div class="x-master-panel">
      <template v-if="!minimal">
        <UserCenterPageHeader title="消息中心" @back="goBack" />
      </template>
      <!-- Sticky Header -->
      <header v-if="!minimal" class="x-header">
        <div class="x-filter-bar">
        <template v-if="isSelectMode">
          <button type="button" class="x-filter-chip select-all" @click="selectAllFiltered">
            <span class="x-checkbox" :class="{ checked: isAllFilteredSelected }">
              <svg v-if="isAllFilteredSelected" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            全选
          </button>
          <div class="x-select-status-filter" role="tablist" aria-label="选择范围">
            <button type="button" :class="{ active: selectStatusFilter === 'all' }" @click="selectStatusFilter = 'all'">全部</button>
            <button type="button" :class="{ active: selectStatusFilter === 'unread' }" @click="selectStatusFilter = 'unread'">未读</button>
          </div>
          <div class="x-filter-actions">
            <div class="x-filter-actions-desktop">
              <button class="x-select-btn active" @click="toggleSelectMode">完成</button>
              <button v-if="currentTab !== 'archived'" class="x-mark-all-btn" :disabled="selectedMessageCount === 0" @click="archiveSelectedMessages">
                归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
              <button v-else class="x-mark-all-btn" :disabled="selectedMessageCount === 0" @click="unarchiveSelectedMessages">
                取消归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
              <button class="x-mark-all-btn" :disabled="selectedMessageCount === 0" @click="markSelectedMessagesAsRead">
                已读{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
            </div>
            <div class="x-select-actions-dropdown">
              <button type="button" class="x-select-btn x-select-actions-trigger" :class="{ active: actionsDropdownOpen }" @click="toggleActionsDropdown">
                操作
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ open: actionsDropdownOpen }">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div v-if="actionsDropdownOpen" class="x-select-actions-menu" @click.stop>
                <button type="button" class="x-select-action-item" @click="toggleSelectMode(); toggleActionsDropdown()">
                  完成
                </button>
                <button v-if="currentTab !== 'archived'" type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="archiveSelectedMessages(); toggleActionsDropdown()">
                  归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
                </button>
                <button v-else type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="unarchiveSelectedMessages(); toggleActionsDropdown()">
                  取消归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
                </button>
                <button type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="markSelectedMessagesAsRead(); toggleActionsDropdown()">
                  已读{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
                </button>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="x-filter-dropdown-wrap">
            <button type="button" class="x-filter-chip filter-trigger" @click="filterDropdownOpen = !filterDropdownOpen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="6" x2="20" y2="6"></line>
                <line x1="8" y1="12" x2="16" y2="12"></line>
                <line x1="11" y1="18" x2="13" y2="18"></line>
              </svg>
              {{ filterSummaryText }}
            </button>
            <div v-if="filterDropdownOpen" class="x-filter-dropdown" @click.stop>
              <div class="x-filter-section">
                <button v-for="tab in typeFilterTabs" :key="tab.id" type="button" class="x-filter-option"
                  :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id); filterDropdownOpen = false">
                  {{ tab.label }}
                </button>
              </div>
              <div class="x-filter-divider"></div>
              <div class="x-filter-section">
                <button type="button" class="x-filter-option" :class="{ active: showUnreadOnly }" @click="showUnreadOnly = !showUnreadOnly; filterDropdownOpen = false">
                  只看未读
                </button>
              </div>
            </div>
          </div>
          <button v-if="currentTab !== 'archived'" class="x-select-btn" @click="toggleSelectMode">选择</button>
        </template>
      </div>
    </header>

    <!-- Minimal Mode Header -->
    <header v-if="minimal" class="x-header-minimal">
      <div class="x-minimal-main">
        <div class="x-filter-bar minimal-filter-bar">
          <template v-if="isSelectMode">
            <button type="button" class="x-filter-chip select-all" @click="selectAllFiltered">
              <span class="x-checkbox" :class="{ checked: isAllFilteredSelected }">
                <svg v-if="isAllFilteredSelected" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
              全选
            </button>
            <div class="x-select-status-filter compact" role="tablist" aria-label="选择范围">
              <button type="button" :class="{ active: selectStatusFilter === 'all' }" @click="selectStatusFilter = 'all'">全部</button>
              <button type="button" :class="{ active: selectStatusFilter === 'unread' }" @click="selectStatusFilter = 'unread'">未读</button>
            </div>
          </template>
          <template v-else>
            <div class="x-filter-dropdown-wrap">
              <button type="button" class="x-filter-chip filter-trigger" @click="filterDropdownOpen = !filterDropdownOpen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="4" y1="6" x2="20" y2="6"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                  <line x1="11" y1="18" x2="13" y2="18"></line>
                </svg>
                {{ filterSummaryText }}
              </button>
              <div v-if="filterDropdownOpen" class="x-filter-dropdown" @click.stop>
                <div class="x-filter-section">
                  <button v-for="tab in typeFilterTabs" :key="tab.id" type="button" class="x-filter-option"
                    :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id); filterDropdownOpen = false">
                    {{ tab.label }}
                  </button>
                </div>
                <div class="x-filter-divider"></div>
                <div class="x-filter-section">
                  <button type="button" class="x-filter-option" :class="{ active: showUnreadOnly }" @click="showUnreadOnly = !showUnreadOnly; filterDropdownOpen = false">
                    只看未读
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div class="x-header-actions-minimal">
        <template v-if="!isSelectMode">
          <button class="x-mark-all-btn-minimal" @click="toggleSelectMode">选择</button>
        </template>
        <template v-else>
          <div class="x-filter-actions-desktop-minimal">
            <button class="x-mark-all-btn-minimal active" @click="toggleSelectMode">完成</button>
            <button v-if="currentTab !== 'archived'" class="x-mark-all-btn-minimal" :disabled="selectedMessageCount === 0" @click="archiveSelectedMessages">
              归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
            </button>
            <button v-else class="x-mark-all-btn-minimal" :disabled="selectedMessageCount === 0" @click="unarchiveSelectedMessages">
              取消归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
            </button>
            <button class="x-mark-all-btn-minimal" :disabled="selectedMessageCount === 0" @click="markSelectedMessagesAsRead">
              已读{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
            </button>
          </div>
          <div class="x-select-actions-dropdown-minimal">
            <button type="button" class="x-mark-all-btn-minimal x-select-actions-trigger" :class="{ active: actionsDropdownOpen }" @click="toggleActionsDropdown">
              操作
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ open: actionsDropdownOpen }">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <div v-if="actionsDropdownOpen" class="x-select-actions-menu" @click.stop>
              <button type="button" class="x-select-action-item" @click="toggleSelectMode(); toggleActionsDropdown()">
                完成
              </button>
              <button v-if="currentTab !== 'archived'" type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="archiveSelectedMessages(); toggleActionsDropdown()">
                归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
              <button v-else type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="unarchiveSelectedMessages(); toggleActionsDropdown()">
                取消归档{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
              <button type="button" class="x-select-action-item" :disabled="selectedMessageCount === 0" @click="markSelectedMessagesAsRead(); toggleActionsDropdown()">
                已读{{ selectedMessageCount ? ` ${selectedMessageCount}` : '' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </header>

    <!-- Notifications List -->
    <div class="x-list">
      <!-- Error State (优先显示错误状态) -->
      <div v-if="notificationsLoadError" class="x-empty">
        <div class="x-empty-visual">
          <TriangleAlert class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>通知加载失败</h3>
        <p>{{ notificationsLoadError }}</p>
        <button class="refresh-btn" @click="loadNotifications">点击重试</button>
      </div>
      <!-- Skeleton Loading -->
      <div v-else-if="loading && currentTab !== 'archived'" class="x-skeleton-list">
        <div v-for="i in 5" :key="i" class="x-skeleton-item">
          <div class="x-skeleton-avatar"></div>
          <div class="x-skeleton-content">
            <div class="x-skeleton-line x-skeleton-title"></div>
            <div class="x-skeleton-line x-skeleton-text"></div>
            <div class="x-skeleton-line x-skeleton-text short"></div>
          </div>
          <div class="x-skeleton-right">
            <div class="x-skeleton-line x-skeleton-badge"></div>
          </div>
        </div>
      </div>
      <div v-else-if="currentTab === 'archived' && archivedLoading" class="x-skeleton-list">
        <div v-for="i in 3" :key="i" class="x-skeleton-item">
          <div class="x-skeleton-avatar"></div>
          <div class="x-skeleton-content">
            <div class="x-skeleton-line x-skeleton-title"></div>
            <div class="x-skeleton-line x-skeleton-text"></div>
            <div class="x-skeleton-line x-skeleton-text short"></div>
          </div>
          <div class="x-skeleton-right">
            <div class="x-skeleton-line x-skeleton-badge"></div>
          </div>
        </div>
      </div>
      <div v-else-if="filteredMessages.length > 0" class="x-inbox-list" role="listbox" aria-label="消息列表">
        <!-- 虚拟滚动列表（当消息超过阈值时启用） -->
        <div v-if="shouldUseVirtualScroll" class="x-virtual-list-container" v-bind="containerProps" @scroll="handleVirtualScroll">
          <div v-bind="wrapperProps">
            <div v-for="{ data: msg } in virtualMessages" :key="msg.id"
              class="x-item" role="option" tabindex="0" :data-message-id="msg.id"
              :class="{ unread: msg.status === 'unread', 'is-selecting': isSelectMode, selected: selectedMessageIds.has(msg.id), 'active-detail': selectedMessage?.id === msg.id && !isSelectMode }"
              @click="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)"
              @keydown.enter="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)"
              @keydown.space.prevent="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)">
              <span v-if="msg.status === 'unread' && !isSelectMode" class="x-unread-dot" aria-hidden="true"></span>
              <!-- 左侧：头像或选择框 -->
              <div v-if="isSelectMode" class="x-select-check" @click.stop="toggleMessageSelection(msg.id)">
                <span class="x-checkbox" :class="{ checked: selectedMessageIds.has(msg.id) }">
                  <svg v-if="selectedMessageIds.has(msg.id)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
              </div>
              <div class="x-item-left">
                <div class="x-avatar-wrapper">
                  <img v-if="msg.sender?.avatar_url" :src="msg.sender.avatar_url" class="x-avatar-img" alt="avatar" loading="lazy" />
                  <div v-else class="x-avatar">
                    {{ msg.sender?.username?.charAt(0)?.toUpperCase?.() || 'S' }}
                  </div>
                </div>
              </div>
              <!-- 中间：主要内容 -->
              <div class="x-item-main">
                <div class="x-item-meta">
                  <div class="x-item-identity">
                    <span class="x-sender-name">{{ msg.sender?.username || '系统' }}</span>
                    <span class="x-action-type">{{ msg._typeLabel }}</span>
                  </div>
                  <span class="x-date inline-date">{{ msg._formattedDate }}</span>
                </div>
                <div class="x-item-content">
                  <span class="x-text">{{ msg._title }}</span>
                </div>
                <div v-if="msg._preview" class="x-preview-box">
                  {{ msg._preview }}
                </div>
              </div>
              <!-- 右侧：时间和状态 -->
              <div class="x-item-right">
                <span class="x-date">{{ msg._formattedDate }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 普通列表（消息少于阈值时使用） -->
        <template v-else>
          <div v-for="msg in filteredMessages" :key="msg.id" v-memo="[msg.id, msg.status, msg.archived_at, isSelectMode, selectedMessageIds.has(msg.id), selectedMessage?.id === msg.id]" class="x-item" role="option" tabindex="0" :data-message-id="msg.id"
            :class="{ unread: msg.status === 'unread', 'is-selecting': isSelectMode, selected: selectedMessageIds.has(msg.id), 'active-detail': selectedMessage?.id === msg.id && !isSelectMode }"
            @click="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)"
            @keydown.enter="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)"
            @keydown.space.prevent="isSelectMode ? toggleMessageSelection(msg.id) : showDetail(msg)">
            <span v-if="msg.status === 'unread' && !isSelectMode" class="x-unread-dot" aria-hidden="true"></span>
            <!-- 左侧：头像或选择框 -->
            <div v-if="isSelectMode" class="x-select-check" @click.stop="toggleMessageSelection(msg.id)">
              <span class="x-checkbox" :class="{ checked: selectedMessageIds.has(msg.id) }">
                <svg v-if="selectedMessageIds.has(msg.id)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
            </div>
            <div class="x-item-left">
              <div class="x-avatar-wrapper">
                <img v-if="msg.sender?.avatar_url" :src="msg.sender.avatar_url" class="x-avatar-img" alt="avatar" loading="lazy" />
                <div v-else class="x-avatar">
                  {{ msg.sender?.username?.charAt(0)?.toUpperCase?.() || 'S' }}
                </div>
              </div>
            </div>
            <!-- 中间：主要内容 -->
            <div class="x-item-main">
              <div class="x-item-meta">
                <div class="x-item-identity">
                  <span class="x-sender-name">{{ msg.sender?.username || '系统' }}</span>
                  <span class="x-action-type">{{ msg._typeLabel }}</span>
                </div>
                <span class="x-date inline-date">{{ msg._formattedDate }}</span>
              </div>
              <div class="x-item-content">
                <span class="x-text">{{ msg._title }}</span>
              </div>
              <div v-if="msg._preview" class="x-preview-box">
                {{ msg._preview }}
              </div>
            </div>
            <!-- 右侧：时间和状态 -->
            <div class="x-item-right">
              <span class="x-date">{{ msg._formattedDate }}</span>
              <!-- 悬停快捷操作 -->
              <div class="x-quick-actions" @click.stop>
                <button v-if="currentTab !== 'archived'" class="x-quick-btn archive" @click="archiveMessage(msg)" title="归档" aria-label="归档">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 8v13H3V8"></path>
                    <path d="M1 3h22v5H1z"></path>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                  </svg>
                </button>
                <button v-if="currentTab === 'archived'" class="x-quick-btn unarchive" @click="unarchiveMessage(msg)" title="取消归档" aria-label="取消归档">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 8v13H3V8"></path>
                    <path d="M1 3h22v5H1z"></path>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                  </svg>
                </button>
                <button v-if="msg.status === 'unread' && currentTab !== 'archived'" class="x-quick-btn mark-read" @click="markAsRead(msg)" title="标记已读" aria-label="标记已读">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>
        <div v-if="currentTab !== 'archived' && hasMoreNotifications" ref="loadMoreSentinelRef" class="x-load-more-row">
          <span v-if="loadingMoreNotifications" class="x-load-more-spinner" />
          <button v-show="!loadingMoreNotifications" class="x-load-more-btn" :disabled="loadingMoreNotifications" @click="loadMoreNotifications">
            {{ loadMoreNotificationLabel }}
          </button>
        </div>
        <div v-if="currentTab === 'archived' && archivedHasMore" ref="archivedLoadMoreSentinelRef" class="x-load-more-row">
          <span v-if="archivedLoadingMore" class="x-load-more-spinner" />
          <button v-show="!archivedLoadingMore" class="x-load-more-btn" :disabled="archivedLoadingMore" @click="loadMoreArchivedNotifications">
            {{ archivedLoadingMore ? '加载中...' : '加载更多已归档通知' }}
          </button>
        </div>
      </div>
      <div v-else-if="currentTab === 'archived'" class="x-empty">
        <div class="x-empty-visual">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="empty-icon-circle" aria-hidden="true">
            <path d="M21 8v13H3V8"></path>
            <path d="M1 3h22v5H1z"></path>
            <line x1="10" y1="12" x2="14" y2="12"></line>
          </svg>
          <div class="empty-glow"></div>
        </div>
        <h3>{{ emptyStateTitle }}</h3>
        <p>{{ emptyStateDescription }}</p>
      </div>
      <div v-else-if="dataLoadedOnce" class="x-empty">
        <div class="x-empty-visual">
          <Bell class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>{{ emptyStateTitle }}</h3>
        <p>{{ emptyStateDescription }}</p>
        <button class="refresh-btn" @click="loadNotifications">刷新试试</button>
      </div>
    </div>
    </div>

    <!-- Detail Panel (desktop: inline split, mobile: overlay drawer) -->
    <!-- Teleport to body on mobile to escape .tab-page transform containment that breaks position:fixed -->
    <Teleport to="body" :disabled="teleportDisabled">
      <div v-if="showOverlay" class="x-detail-container" role="dialog" aria-modal="true" aria-label="通知详情" @click.self="closeDetail">
        <Transition name="slide-right" @before-enter="onTransitionStart" @after-leave="onTransitionEnd">
          <div v-if="selectedMessage" class="x-detail-panel" @click.stop>
            <div class="drawer-header">
              <UserCenterBackButton class="x-detail-back" label="返回消息列表" @click="closeDetail" />
              <h3>通知详情</h3>
            </div>
            <div class="drawer-content">
                <div class="detail-user-card">
                  <div class="large-avatar-wrapper">
                    <img v-if="selectedMessage.sender?.avatar_url" :src="selectedMessage.sender.avatar_url"
                      class="large-avatar-img" alt="avatar"  loading="lazy" />
                    <div v-else class="large-avatar">
                      {{ selectedMessage.sender?.username?.charAt(0)?.toUpperCase?.() || 'S' }}
                    </div>
                  </div>
                  <div class="user-info">
                    <span class="name">{{ selectedMessage.sender?.username || '系统' }}</span>
                    <span class="type">{{ getNotificationTypeLabel(selectedMessage.type) }}</span>
                  </div>
                </div>
                <div class="detail-body">
                  <h2 class="detail-title">{{ getNotificationTitle(selectedMessage) }}</h2>
                  <p class="main-text">{{ getNotificationContent(selectedMessage) }}</p>
                  <div v-if="selectedMessage.type === 'comment' || selectedMessage.type === 'like'"
                    class="source-content">
                    <span class="source-label">{{ getNotificationSourceLabel(selectedMessage) }}</span>
                    <p class="source-text">{{ getNotificationSourceText(selectedMessage) }}</p>
                  </div>
                  <span class="full-date">{{ new Date(selectedMessage.created_at).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) }}</span>
                </div>
                <!-- Reply Input Section -->
                <Transition name="fade-slide">
                  <div v-if="showReplyInput" class="reply-input-section">
                    <textarea v-model="replyContent" :placeholder="`回复 @${selectedMessage.sender?.username || '用户'}...`"
                      rows="3" class="reply-textarea" :disabled="isReplySubmitting"></textarea>
                    <div class="reply-controls">
                      <button class="cancel-reply-btn" @click="cancelReply" :disabled="isReplySubmitting">取消</button>
                      <button class="submit-reply-btn" @click="submitReply"
                        :disabled="!replyContent.trim() || isReplySubmitting">
                        {{ isReplySubmitting ? '发送中...' : '发送' }}
                      </button>
                    </div>
                  </div>
                </Transition>
                <!-- Action Buttons -->
                <div class="notification-actions">
                  <button v-if="selectedMessage.type === 'comment'" class="notif-action-btn reply"
                    @click="openReplyInput">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 17 4 12 9 7"></polyline>
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                    </svg>
                    回复
                  </button>
                  <button
                    v-if="(selectedMessage.type === 'comment' || selectedMessage.type === 'like') && (selectedMessage.post?.id || selectedMessage.post_id)"
                    class="notif-action-btn view-post" @click="viewOriginalPost">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    查看原文
                  </button>
                  <button v-if="canRetryModerationNotification(selectedMessage)" class="notif-action-btn retry"
                    @click="retryRejectedPostFromNotification" :disabled="isRetryingSelectedNotification">
                    {{ isRetryingSelectedNotification ? '重试中...' : '重试一次' }}
                  </button>
                  <button v-if="selectedMessage.status === 'unread'" class="notif-action-btn mark-read"
                    @click="markAsRead(selectedMessage)">
                    标记已读
                  </button>
                  <button v-if="!selectedMessage.archived_at" class="notif-action-btn archive"
                    @click="archiveMessageFromDetail">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 8v13H3V8"></path>
                      <path d="M1 3h22v5H1z"></path>
                      <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                    归档
                  </button>
                  <button v-else class="notif-action-btn unarchive"
                    @click="unarchiveMessageFromDetail">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 8v13H3V8"></path>
                      <path d="M1 3h22v5H1z"></path>
                      <line x1="10" y1="12" x2="14" y2="12"></line>
                    </svg>
                    取消归档
                  </button>
                </div>
            </div>
          </div>
        </Transition>
      </div>
    </Teleport>

    <Transition name="fade">
      <div v-if="feedbackToast.visible" class="message-feedback-toast" :class="feedbackToast.type">
        <span>{{ feedbackToast.message }}</span>
        <button v-if="feedbackToast.actionLabel" type="button" class="message-feedback-action" @click="runFeedbackAction">
          {{ feedbackToast.actionLabel }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, reactive, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell, TriangleAlert } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader';
import {
  getUserNotifications,
  getArchivedNotifications,
  archiveNotification,
  unarchiveNotification,
  archiveAllNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  filterSelfActionNotifications
} from '@/utils/api/notifications-api.js';
import { getCurrentUser } from '@/utils/api/auth-api.js';
import { createComment, retryPostModeration } from '@/utils/api/forum-api.js';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { invalidateByTags } from '@/utils/request-core.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterBackButton from '@/components/UserCenterBackButton.vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import {
  getForumPostBody,
  getForumPostExcerpt,
  getForumPostTitle
} from '@/utils/forum-post-format.js';
import {
  POST_REJECTED_NOTICE_TEXT,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTICE_TEXT,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTICE_TEXT,
  COMMENT_REJECTED_NOTIFICATION_TYPE,
  canRetryModerationNotificationBySet,
  loadRetriedNotificationIdSet,
  markRetriedNotificationId,
  persistRetriedNotificationIdSet
} from '@/utils/moderation-retry-cache.js';
import { useDebounce, useThrottle } from '@/composables/useDebounceThrottle';
import { useVirtualList } from '@vueuse/core';

// Props
defineProps({
  minimal: {
    type: Boolean,
    default: false
  }
});

const route = useRoute();
const notificationStoreRef = ref(getNotificationStoreSync());

const ensureNotificationStore = async () => {
  if (notificationStoreRef.value) {
    return notificationStoreRef.value;
  }
  notificationStoreRef.value = await loadNotificationStore();
  return notificationStoreRef.value;
};

const refreshUnreadCount = async (options = {}) => {
  const notificationStore = await ensureNotificationStore();
  await notificationStore.refreshUnreadCount(options);
};

const router = useRouter();
const authStore = useAuthStore();
const { userInfo, isLoggedIn, isInitialized } = storeToRefs(authStore);
const messages = ref([]);
const selectedMessage = ref(null);
const lastFocusedMessageId = ref(null);
const showOverlay = ref(false);
const windowWidth = ref(window.innerWidth);
const isMobile = computed(() => windowWidth.value < 1024);
// 防止 Transition 动画期间 Teleport 切换导致 insertBefore 错误
const isTransitioning = ref(false);
const teleportDisabled = ref(!isMobile.value);
const loading = ref(true);
const dataLoadedOnce = ref(false);
const loadingMoreNotifications = ref(false);
const loadMoreSentinelRef = ref(null);
let loadMoreObserver = null;
const notificationsLoadError = ref('');
const notificationsCursor = ref(null);
const hasMoreNotifications = ref(false);
const currentUserId = ref(null);
const currentTab = ref('all'); // 'all' | 'like' | 'comment' | 'impression' | 'system'
const LOTTERY_WIN_NOTIFICATION_TYPE = 'lottery_win';
const MESSAGE_PAGE_SIZE = 24;
const MAX_CACHE_SIZE = 200; // LRU 缓存上限
const VIRTUAL_SCROLL_THRESHOLD = 100; // 虚拟滚动阈值
const NOTIFICATION_TABS = [
  { id: 'all', label: '全部' },
  { id: 'comment', label: '回复' },
  { id: 'like', label: '点赞' },
  { id: 'follow', label: '关注' },
  { id: 'impression', label: '印象' },
  { id: 'system', label: '系统' },
  { id: 'archived', label: '已归档' }
];

// ─── AbortController 管理 ───────────────────────────────────────────────
const abortControllers = reactive({
  notifications: null,
  archived: null,
  moreNotifications: null,
  moreArchived: null
});

const createAbortController = (key) => {
  if (abortControllers[key]) {
    abortControllers[key].abort();
  }
  abortControllers[key] = new AbortController();
  return abortControllers[key];
};

const abortAllRequests = () => {
  Object.keys(abortControllers).forEach((key) => {
    if (abortControllers[key]) {
      abortControllers[key].abort();
      abortControllers[key] = null;
    }
  });
};

// ─── 合并状态管理 ───────────────────────────────────────────────────────
const messageState = reactive({
  inbox: {
    loading: false,
    error: null,
    loadingMore: false,
    hasMore: false,
    cursor: null
  },
  archived: {
    loading: false,
    error: null,
    loadingMore: false,
    hasMore: false,
    cursor: null,
    loadedOnce: false
  },
  realtime: {
    connected: false,
    reconnectAttempts: 0,
    lastError: null
  }
});

// ─── LRU 缓存管理 ─────────────────────────────────────────────────────────
const applyLRUCache = (messages) => {
  if (messages.length <= MAX_CACHE_SIZE) {
    return messages;
  }
  // 保留最新的 MAX_CACHE_SIZE 条消息（已按时间排序）
  return messages.slice(0, MAX_CACHE_SIZE);
};

const trimCacheIfNeeded = () => {
  if (messages.value.length > MAX_CACHE_SIZE) {
    messages.value = applyLRUCache(messages.value);
    logger.debug('messages', `LRU 缓存清理：保留最新 ${MAX_CACHE_SIZE} 条消息`);
  }
  if (archivedMessages.value.length > MAX_CACHE_SIZE) {
    archivedMessages.value = applyLRUCache(archivedMessages.value);
    logger.debug('messages', `LRU 缓存清理：保留最新 ${MAX_CACHE_SIZE} 条归档消息`);
  }
};

// ─── 防抖和节流 ───────────────────────────────────────────────────────────
const { debouncedFn: debouncedLoadMoreNotifications, cancel: cancelDebouncedLoadMore } = useDebounce(
  loadMoreNotifications,
  300
);

const { throttledFn: throttledLoadMoreNotifications, cancel: cancelThrottledLoadMore } = useThrottle(
  loadMoreNotifications,
  200
);

const { throttledFn: throttledLoadMoreArchived, cancel: cancelThrottledArchived } = useThrottle(
  loadMoreArchivedNotifications,
  200
);

// ─── 虚拟滚动 ───────────────────────────────────────────────────────────────
const shouldUseVirtualScroll = computed(() => {
  return filteredMessages.value.length > VIRTUAL_SCROLL_THRESHOLD;
});

const virtualListRef = ref(null);
const virtualListMessages = ref([]);

const { list: virtualMessages, containerProps, wrapperProps } = useVirtualList(
  virtualListMessages,
  {
    itemHeight: 88, // 大约的消息项高度
    overscan: 10
  }
);

const handleVirtualScroll = () => {
  // 虚拟滚动时的加载更多逻辑（已通过 IntersectionObserver 处理）
  // 这里不需要额外处理，保留函数以备将来扩展
};
let unreadRefreshInflight = null;
let lastUnreadRefreshAt = 0;
const UNREAD_REFRESH_MIN_INTERVAL_MS = 1200;
let messageCenterRealtimeChannels = [];
let realtimeRefreshTimer = null;
let pendingRealtimeRefresh = {
  notifications: false,
  forceCache: false
};
const retryingNotificationIds = reactive({});
const retriedNotificationIdSet = ref(new Set());
const showUnreadOnly = ref(false);
const filterDropdownOpen = ref(false);
const actionsDropdownOpen = ref(false);
const isSelectMode = ref(false);
const selectedMessageIds = ref(new Set());
const selectFilterOpen = ref(false); // 预留：筛选下拉面板状态
const selectStatusFilter = ref('all');
const archivedMessages = ref([]);
const archivedHasMore = ref(false);
const archivedCursor = ref(null);
const archivedLoading = ref(false);
const archivedLoadingMore = ref(false);
const archivedLoadedOnce = ref(false);
const archivedLoadMoreSentinelRef = ref(null);
let archivedLoadMoreObserver = null;
let loadNotificationsInflight = null;
const feedbackToast = reactive({
  visible: false,
  type: 'info',
  message: '',
  actionLabel: '',
  action: null
});
let feedbackToastTimer = null;

const loadRetriedNotificationIds = () => {
  retriedNotificationIdSet.value = loadRetriedNotificationIdSet();
};

const markNotificationRetried = (notificationId) => {
  const marked = markRetriedNotificationId(retriedNotificationIdSet.value, notificationId);
  if (!marked) return;
  persistRetriedNotificationIdSet(retriedNotificationIdSet.value);
};

const canRetryModerationNotification = (notification) => {
  return canRetryModerationNotificationBySet(
    notification,
    retriedNotificationIdSet.value,
    POST_REJECTED_NOTIFICATION_TYPE
  );
};

const isRetryingSelectedNotification = computed(() => {
  const key = String(selectedMessage.value?.id || '');
  return Boolean(key && retryingNotificationIds[key]);
});

// Reply to comment state
const showReplyInput = ref(false);
const replyContent = ref('');
const isReplySubmitting = ref(false);
const TASK_TIMEOUT_MS = 12000;

const withTaskTimeout = (promise, timeoutMs = TASK_TIMEOUT_MS, message = '请求超时，请稍后重试') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const hideFeedback = () => {
  feedbackToast.visible = false;
  feedbackToast.actionLabel = '';
  feedbackToast.action = null;
};

const showFeedback = (message, type = 'info', options = {}) => {
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  feedbackToast.message = message;
  feedbackToast.type = type;
  feedbackToast.actionLabel = options.actionLabel || '';
  feedbackToast.action = typeof options.action === 'function' ? options.action : null;
  feedbackToast.visible = true;
  feedbackToastTimer = window.setTimeout(() => {
    hideFeedback();
    feedbackToastTimer = null;
  }, feedbackToast.action ? 5200 : 2400);
};

const runFeedbackAction = async () => {
  const action = feedbackToast.action;
  hideFeedback();
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  if (!action) return;
  await action();
};

const mergeById = (currentRows = [], incomingRows = []) => {
  const map = new Map();
  [...currentRows, ...incomingRows].forEach((row) => {
    if (row?.id) map.set(row.id, { ...(map.get(row.id) || {}), ...row });
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
};

const insertSorted = (rows, newRow) => {
  const ts = newRow.created_at || '';
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((rows[mid].created_at || '') > ts) lo = mid + 1;
    else hi = mid;
  }
  const result = [...rows];
  result.splice(lo, 0, newRow);
  return result;
};

const waitForAuthReady = async (timeoutMs = 4000) => {
  if (isInitialized.value) return;

  await Promise.race([
    new Promise((resolve) => {
      const stop = watch(isInitialized, (ready) => {
        if (ready) {
          stop();
          resolve();
        }
      }, { immediate: true });
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
};

const invalidateMessageCenterCaches = (userId = currentUserId.value) => {
  const safeUserId = String(userId || '').trim();
  invalidateByTags([
    'notifications',
    safeUserId ? `notifications:user:${safeUserId}` : ''
  ]);
};

const visibleNotificationMessages = computed(() => filterSelfActionNotifications(messages.value));
const isSystemNotificationType = (type) => [
  'system',
  'gift',
  LOTTERY_WIN_NOTIFICATION_TYPE,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTIFICATION_TYPE
].includes(type);

const filteredMessages = computed(() => {
  if (currentTab.value === 'archived') {
    let result = archivedMessages.value;
    if (isSelectMode.value && selectStatusFilter.value !== 'all') {
      result = result.filter(m => m.status === selectStatusFilter.value);
    }
    return result;
  }

  const tab = currentTab.value;
  const unreadOnly = showUnreadOnly.value;
  const selectFilter = isSelectMode.value ? selectStatusFilter.value : null;
  const isSystemType = tab === 'system';
  const isSpecificType = tab !== 'all' && !isSystemType;

  return visibleNotificationMessages.value.filter(m => {
    if (m.archived_at) return false;
    if (isSystemType && !isSystemNotificationType(m.type)) return false;
    if (isSpecificType && m.type !== tab) return false;
    if (unreadOnly && m.status !== 'unread') return false;
    if (selectFilter && selectFilter !== 'all' && m.status !== selectFilter) return false;
    return true;
  });
});

// 虚拟滚动列表：监听 filteredMessages 变化
watch(filteredMessages, (newMessages) => {
  if (shouldUseVirtualScroll.value) {
    virtualListMessages.value = newMessages;
  }
}, { immediate: true });

const typeFilterTabs = computed(() => NOTIFICATION_TABS);
const selectedMessageCount = computed(() => selectedMessageIds.value.size);
const currentTabLabel = computed(() => NOTIFICATION_TABS.find((tab) => tab.id === currentTab.value)?.label || '全部');
const filterSummaryText = computed(() => {
  const parts = [currentTabLabel.value];
  if (showUnreadOnly.value && currentTab.value !== 'archived') {
    parts.push('未读');
  }
  return parts.join(' · ');
});
const emptyStateTitle = computed(() => {
  if (currentTab.value === 'archived') return '暂无已归档通知';
  if (showUnreadOnly.value || selectStatusFilter.value === 'unread') {
    return currentTab.value === 'all'
      ? '暂无未读通知'
      : `暂无未读${currentTabLabel.value}类通知`;
  }
  if (currentTab.value !== 'all') return `暂无${currentTabLabel.value}类通知`;
  return '暂无通知';
});
const emptyStateDescription = computed(() => {
  if (currentTab.value === 'archived') return '当你归档通知后，可以在这里找到它们。';
  if (showUnreadOnly.value || selectStatusFilter.value === 'unread') return '当前筛选下没有需要处理的未读消息。';
  if (currentTab.value !== 'all') return `当有新的${currentTabLabel.value}类互动时，会显示在这里。`;
  return '当有伙伴与你互动或系统有新消息时，你会在这里看到它们。';
});

const refreshMessageCenter = async ({
  includeNotifications = true,
  forceCache = false
} = {}) => {
  if (!currentUserId.value) return;

  const now = Date.now();
  if (!forceCache && now - lastUnreadRefreshAt < UNREAD_REFRESH_MIN_INTERVAL_MS) return;
  if (unreadRefreshInflight) {
    await unreadRefreshInflight;
    return;
  }

  unreadRefreshInflight = (async () => {
    try {
      if (forceCache) {
        invalidateMessageCenterCaches();
      }

      await Promise.allSettled([
        includeNotifications
          ? (async () => {
            const { data, hasMore, nextCursor } = await getUserNotifications(currentUserId.value, {
              limit: MESSAGE_PAGE_SIZE
            });
            messages.value = (data || []).map(enrichMessage);
            hasMoreNotifications.value = Boolean(hasMore);
            notificationsCursor.value = nextCursor || null;
          })()
          : Promise.resolve()
      ]);

      await refreshUnreadCount({ force: forceCache });
      lastUnreadRefreshAt = Date.now();
    } catch (err) {
      logger.error('messages', '实时刷新消息中心失败', err);
    }
  })();

  try {
    await unreadRefreshInflight;
  } finally {
    unreadRefreshInflight = null;
  }
};

const scheduleRealtimeRefresh = ({ notifications = true, forceCache = false } = {}) => {
  pendingRealtimeRefresh.notifications = pendingRealtimeRefresh.notifications || notifications;
  pendingRealtimeRefresh.forceCache = pendingRealtimeRefresh.forceCache || forceCache;

  if (realtimeRefreshTimer) return;

  realtimeRefreshTimer = window.setTimeout(async () => {
    const refreshOptions = {
      includeNotifications: pendingRealtimeRefresh.notifications,
      forceCache: pendingRealtimeRefresh.forceCache
    };
    pendingRealtimeRefresh = {
      notifications: false,
      forceCache: false
    };
    realtimeRefreshTimer = null;
    await refreshMessageCenter(refreshOptions);
  }, 120);
};

const removeRealtimeChannels = async () => {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  pendingRealtimeRefresh = {
    notifications: false,
    forceCache: false
  };

  if (!messageCenterRealtimeChannels.length) return;

  const channels = messageCenterRealtimeChannels;
  messageCenterRealtimeChannels = [];
  await Promise.allSettled(channels.map((channel) => supabase.removeChannel(channel)));
};

const applyRealtimeRow = (rowsRef, payload) => {
  const eventType = String(payload?.eventType || '').toUpperCase();
  const newRow = payload?.new;
  const oldRow = payload?.old;
  const rowId = newRow?.id || oldRow?.id;
  if (!rowId) return false;

  if (eventType === 'DELETE') {
    rowsRef.value = rowsRef.value.filter((row) => row.id !== rowId);
    return true;
  }

  if (eventType === 'INSERT') {
    // 如果新插入的消息已经归档，不添加到主列表
    if (newRow?.archived_at) {
      return false;
    }
    const existingRow = rowsRef.value.find((r) => r.id === newRow.id);
    rowsRef.value = insertSorted(rowsRef.value, enrichMessage(existingRow ? { ...existingRow, ...newRow } : newRow));
    return true;
  }

  // UPDATE 事件：如果消息被归档，从主列表中删除
  if (newRow?.archived_at && !oldRow?.archived_at) {
    rowsRef.value = rowsRef.value.filter((row) => row.id !== rowId);
    return true;
  }

  // UPDATE 事件：如果消息取消归档，添加到主列表
  if (!newRow?.archived_at && oldRow?.archived_at) {
    const existingRow = rowsRef.value.find((r) => r.id === newRow.id);
    rowsRef.value = mergeById([enrichMessage(existingRow ? { ...existingRow, ...newRow } : newRow)], rowsRef.value);
    return true;
  }

  // UPDATE 事件：普通更新
  rowsRef.value = rowsRef.value.map((row) =>
    row.id === rowId ? enrichMessage({ ...row, ...newRow }) : row
  );
  return true;
};

const refreshUnreadCountAfterRealtime = async () => {
  invalidateMessageCenterCaches();
  await refreshUnreadCount({ force: true });
};

const startRealtimeChannels = async (userId) => {
  const rawUserId = String(userId || '').trim();
  if (!rawUserId) return;
  const safeUserId = rawUserId.replace(/[^\w\-]/g, '');
  if (!safeUserId) return;

  await removeRealtimeChannels();

  const notificationsChannel = supabase
    .channel(`messages-center-notifications:${safeUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${safeUserId}`
      },
      (payload) => {
        const eventType = String(payload?.eventType || '').toUpperCase();
        const newRow = payload?.new;
        const oldRow = payload?.old;

        // applyRealtimeRow 会从 messages.value 中移除归档的消息
        // 需要在它执行之前保存完整数据（含 sender/post/comment JOIN）
        const archivedFullRow = (eventType === 'UPDATE' && newRow?.archived_at && !oldRow?.archived_at)
          ? { ...(messages.value.find((m) => m.id === newRow.id) || {}), ...newRow }
          : null;

        const patched = applyRealtimeRow(messages, payload);

        // 处理归档列表
        if (archivedFullRow) {
          archivedMessages.value = mergeById([archivedFullRow], archivedMessages.value);
        } else if (eventType === 'INSERT' && newRow?.archived_at) {
          archivedMessages.value = mergeById([newRow], archivedMessages.value);
        } else if (eventType === 'UPDATE') {
          if (!newRow?.archived_at && oldRow?.archived_at) {
            // 消息取消归档，从归档列表中删除
            archivedMessages.value = archivedMessages.value.filter((row) => row.id !== newRow?.id);
          }
        } else if (eventType === 'DELETE') {
          const rowId = newRow?.id || oldRow?.id;
          if (rowId) {
            archivedMessages.value = archivedMessages.value.filter((row) => row.id !== rowId);
          }
        }

        // LRU 缓存清理
        trimCacheIfNeeded();

        void refreshUnreadCountAfterRealtime();
        if (!patched || eventType === 'INSERT') {
          scheduleRealtimeRefresh({
            notifications: true,
            forceCache: true
          });
        }
      }
    )
    .subscribe((status, err) => {
      // ─── 实时订阅状态监控 ─────────────────────────────────────────────
      if (status === 'SUBSCRIBED') {
        messageState.realtime.connected = true;
        messageState.realtime.reconnectAttempts = 0;
        messageState.realtime.lastError = null;
        logger.debug('messages', '实时订阅已连接');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        messageState.realtime.connected = false;
        messageState.realtime.lastError = err?.message || status;
        logger.error('messages', '实时订阅出错', err || status);

        // ─── 异常恢复机制 ───────────────────────────────────────────────
        if (messageState.realtime.reconnectAttempts < 5) {
          messageState.realtime.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, messageState.realtime.reconnectAttempts), 30000);
          logger.debug('messages', `将在 ${delay}ms 后尝试重连（第 ${messageState.realtime.reconnectAttempts} 次）`);
          setTimeout(() => {
            if (currentUserId.value && messageState.realtime.reconnectAttempts <= 5) {
              startRealtimeChannels(currentUserId.value);
            }
          }, delay);
        } else {
          logger.error('messages', '实时订阅重连失败次数过多，停止重连');
        }
      } else if (status === 'CLOSED') {
        messageState.realtime.connected = false;
        logger.debug('messages', '实时订阅已关闭');
      }
    });
  messageCenterRealtimeChannels = [notificationsChannel];
};

const archiveMessageFromDetail = async () => {
  if (!selectedMessage.value) return;
  await archiveMessage(selectedMessage.value);
  closeDetail();
};

const unarchiveMessageFromDetail = async () => {
  if (!selectedMessage.value) return;
  await unarchiveMessage(selectedMessage.value);
  closeDetail();
};

// 监听弹窗状态，控制 body 滚动（iOS 安全锁定）+ 管理 Teleport overlay 显隐
let bodyScrollPosition = 0;
watch(selectedMessage, (newVal) => {
  if (newVal?.archived_at) {
    closeDetail();
    return;
  }
  if (newVal) {
    showOverlay.value = true;
  }
  if (isMobile.value) {
    if (newVal) {
      bodyScrollPosition = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${bodyScrollPosition}px`;
      document.body.style.width = '100%';
      const tabPage = document.querySelector('.tab-page.messages-tab');
      if (tabPage) {
        tabPage.dataset._overflowX = tabPage.style.overflowX || '';
        tabPage.dataset._overflowY = tabPage.style.overflowY || '';
        tabPage.style.overflow = 'hidden';
      }
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      const tabPage = document.querySelector('.tab-page.messages-tab');
      if (tabPage) {
        tabPage.style.overflowX = tabPage.dataset._overflowX || '';
        tabPage.style.overflowY = tabPage.dataset._overflowY || '';
        delete tabPage.dataset._overflowX;
        delete tabPage.dataset._overflowY;
      }
      window.scrollTo(0, bodyScrollPosition);
    }
  } else {
    document.body.style.overflow = '';
  }
});

// 监听路由参数，自动切换到消息中心内部分区
watch(() => route.query.section, (newSection) => {
  if (newSection === 'mail') {
    switchInboxSection('notifications');
    return;
  }
}, { immediate: true });

watch(() => route.query.to, () => {
  if (route.query.to) switchInboxSection('notifications');
});

const setNotificationTab = (tabId) => {
  currentTab.value = NOTIFICATION_TABS.some((tab) => tab.id === tabId) ? tabId : 'all';
  if (currentTab.value === 'archived' && !archivedLoadedOnce.value) {
    loadArchivedNotifications();
  }
  const nextQuery = {
    ...route.query,
    tab: 'messages',
    section: 'notifications'
  };
  delete nextQuery.to;
  router.replace({
    query: nextQuery
  });
};

const switchInboxSection = (section) => {
  if (section === 'mail') {
    showFeedback('私信功能已下架，消息中心仅保留站内通知。', 'info');
    setNotificationTab('all');
    return;
  }
  currentTab.value = NOTIFICATION_TABS.some((tab) => tab.id === currentTab.value) ? currentTab.value : 'all';
  const nextQuery = {
    ...route.query,
    tab: 'messages',
    section: 'notifications'
  };
  delete nextQuery.to;
  router.replace({
    query: nextQuery
  });
};

watch(() => userInfo.value?.id, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await loadNotifications();
  await startRealtimeChannels(newId);
});

// hasMoreNotifications 变化时重连 IntersectionObserver（数据刷新/全部已读后 sentinel 重新出现）
watch(hasMoreNotifications, async (val) => {
  if (val) {
    await nextTick();
    setupLoadMoreObserver();
  } else if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
});

watch(archivedHasMore, async (val) => {
  if (val) {
    await nextTick();
    setupArchivedLoadMoreObserver();
  } else if (archivedLoadMoreObserver) {
    archivedLoadMoreObserver.disconnect();
    archivedLoadMoreObserver = null;
  }
});

watch(isSelectMode, () => {
  selectFilterOpen.value = false;
  selectStatusFilter.value = 'all';
});

watch(selectStatusFilter, () => {
  if (!isSelectMode.value || selectedMessageIds.value.size === 0) return;
  const visibleIds = new Set(filteredMessages.value.map((message) => message.id));
  selectedMessageIds.value = new Set(
    Array.from(selectedMessageIds.value).filter((id) => visibleIds.has(id))
  );
});

// 组件卸载时恢复 body 滚动并取消订阅
onUnmounted(() => {
  // ─── AbortController 清理 ─────────────────────────────────────────────
  abortAllRequests();

  // ─── 防抖和节流清理 ───────────────────────────────────────────────────
  cancelDebouncedLoadMore();
  cancelThrottledLoadMore();
  cancelThrottledArchived();

  // 完整恢复iOS滚动锁定样式（防止样式残留）
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  const tabPage = document.querySelector('.tab-page.messages-tab');
  if (tabPage) {
    tabPage.style.overflowX = '';
    tabPage.style.overflowY = '';
  }
  bodyScrollPosition = 0;

  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }
  window.removeEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  window.removeEventListener('resize', handleWindowResize);
  void removeRealtimeChannels();
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
  if (archivedLoadMoreObserver) {
    archivedLoadMoreObserver.disconnect();
    archivedLoadMoreObserver = null;
  }
  document.removeEventListener('click', closeSelectFilterDropdown);
});

const handleUnreadRefreshEvent = async (event) => {
  logger.debug('messages', '收到未读刷新事件，刷新消息列表');
  if (!currentUserId.value) return;

  invalidateMessageCenterCaches();
  if (currentTab.value === 'archived') {
    loadArchivedNotifications();
  }
  scheduleRealtimeRefresh({
    notifications: true,
    forceCache: event?.detail?.source === 'realtime'
  });
};

// 窗口resize处理（响应式更新isMobile，但在过渡期间延迟更新 teleportDisabled）
const handleWindowResize = () => {
  windowWidth.value = window.innerWidth;
  // 如果正在过渡，不更新 teleportDisabled，避免 insertBefore 错误
  if (!isTransitioning.value) {
    teleportDisabled.value = !isMobile.value;
  }
};

// Transition 生命周期钩子
const onTransitionStart = () => {
  isTransitioning.value = true;
};

const onTransitionEnd = () => {
  isTransitioning.value = false;
  // 过渡结束后同步 teleport 状态
  teleportDisabled.value = !isMobile.value;
  afterPanelLeave();
};

// 初始化消息数据
onMounted(async () => {
  loadRetriedNotificationIds();
  await waitForAuthReady();

  await Promise.allSettled([
    loadNotifications()
  ]);

  // 横屏自动打开第一条消息
  await nextTick();
  if (window.innerWidth >= 1024 && filteredMessages.value.length > 0 && !selectedMessage.value) {
    selectedMessage.value = filteredMessages.value[0];
  }

  // 监听 boh_unread_refresh 事件来刷新消息列表
  window.addEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  // 监听窗口resize事件（响应式更新isMobile）
  window.addEventListener('resize', handleWindowResize);
  // 监听全局点击事件来关闭筛选下拉框
  document.addEventListener('click', closeSelectFilterDropdown);
  await startRealtimeChannels(currentUserId.value || userInfo.value?.id);
});

// 加载通知
const loadNotifications = async () => {
  // 防重复调用：如果已有请求在进行中，等待其完成
  if (loadNotificationsInflight) {
    return loadNotificationsInflight;
  }

  loading.value = true;
  notificationsLoadError.value = '';

  loadNotificationsInflight = (async () => {
    try {
      const user = await withTaskTimeout(getCurrentUser());
      if (user) {
        currentUserId.value = user.id;
        const { data, hasMore, nextCursor } = await withTaskTimeout(
          getUserNotifications(user.id, { limit: MESSAGE_PAGE_SIZE })
        );
        messages.value = (data || []).map(enrichMessage);
        dataLoadedOnce.value = true;
        hasMoreNotifications.value = Boolean(hasMore);
        notificationsCursor.value = nextCursor || null;
      } else if (isLoggedIn.value) {
        // auth 竞态兜底：首次未拿到 user 时稍后补拉一次
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryUser = await withTaskTimeout(getCurrentUser(), 8000, '获取用户信息超时');
        if (retryUser) {
          currentUserId.value = retryUser.id;
          const { data, hasMore, nextCursor } = await withTaskTimeout(
            getUserNotifications(retryUser.id, { limit: MESSAGE_PAGE_SIZE })
          );
          messages.value = (data || []).map(enrichMessage);
          dataLoadedOnce.value = true;
          hasMoreNotifications.value = Boolean(hasMore);
          notificationsCursor.value = nextCursor || null;
        }
      }
    } catch (error) {
      logger.error('messages', '加载通知失败', error);
      const friendlyError = error?.message?.includes('JWT') ? '登录已过期，请重新登录'
        : error?.message?.includes('fetch') ? '网络连接失败，请检查网络后重试'
        : '加载失败，请稍后重试';
      notificationsLoadError.value = friendlyError;
      dataLoadedOnce.value = true;
    } finally {
      loading.value = false;
      await nextTick();
      setupLoadMoreObserver();
    }
  })();

  try {
    await loadNotificationsInflight;
  } finally {
    loadNotificationsInflight = null;
  }
};

async function loadMoreNotifications() {
  if (!currentUserId.value || loadingMoreNotifications.value || !hasMoreNotifications.value) return;
  loadingMoreNotifications.value = true;
  try {
    const { data, hasMore, nextCursor } = await withTaskTimeout(
      getUserNotifications(currentUserId.value, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: notificationsCursor.value
      })
    );
    messages.value = mergeById(messages.value, (data || []).map(enrichMessage));
    hasMoreNotifications.value = Boolean(hasMore);
    notificationsCursor.value = nextCursor || null;
  } catch (error) {
    logger.error('messages', '加载更多通知失败', error);
    showFeedback(error?.message || '加载更多失败，请稍后重试', 'error');
  } finally {
    loadingMoreNotifications.value = false;
    await nextTick();
    setupLoadMoreObserver();
  }
};

function setupLoadMoreObserver() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }
  if (!loadMoreSentinelRef.value) return;
  loadMoreObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMoreNotifications.value && !loadingMoreNotifications.value) {
      loadMoreNotifications();
    }
  }, { rootMargin: '200px' });
  loadMoreObserver.observe(loadMoreSentinelRef.value);
};

// ─── 归档 ──────────────────────────────────────────────────────────────────

const restoreArchivedMessages = async (rows = []) => {
  const restorableRows = rows.filter((row) => row?.id);
  if (restorableRows.length === 0) return;

  // 先保存原始状态以便回滚
  const previousMessages = [...messages.value];
  const previousArchivedMessages = [...archivedMessages.value];

  try {
    // 使用 Promise.allSettled 处理部分失败
    const results = await Promise.allSettled(
      restorableRows.map((row) => unarchiveNotification(row.id, currentUserId.value))
    );

    const succeededRows = [];
    const failedRows = [];

    results.forEach((result, index) => {
      const row = restorableRows[index];
      if (result.status === 'fulfilled' && !result.value?.error) {
        succeededRows.push(row);
      } else {
        failedRows.push(row);
        const errorMsg = result.status === 'rejected'
          ? result.reason?.message
          : result.value?.error?.message;
        logger.error('messages', `撤销归档失败 [id=${row.id}]`, errorMsg);
      }
    });

    // 只更新成功恢复的消息状态
    const restoredRows = succeededRows.map((row) => ({ ...row, archived_at: null }));
    messages.value = mergeById(messages.value, restoredRows);
    archivedMessages.value = archivedMessages.value.filter(
      (message) => !succeededRows.some((row) => row.id === message.id)
    );

    await triggerUnreadRefresh();

    if (failedRows.length === 0) {
      showFeedback(`已恢复 ${succeededRows.length} 条通知`, 'success');
    } else if (succeededRows.length > 0) {
      showFeedback(`已恢复 ${succeededRows.length} 条通知，${failedRows.length} 条失败`, 'info');
    } else {
      // 全部失败，回滚本地状态
      messages.value = previousMessages;
      archivedMessages.value = previousArchivedMessages;
      showFeedback('撤销归档失败，请稍后重试', 'error');
    }
  } catch (error) {
    // 异常情况回滚
    messages.value = previousMessages;
    archivedMessages.value = previousArchivedMessages;
    logger.error('messages', '撤销归档失败', error);
    showFeedback(error?.message || '撤销归档失败，请稍后重试', 'error');
  }
};

const archiveMessage = async (msg) => {
  if (!msg?.id) return;
  const previousArchivedAt = msg.archived_at;
  msg.archived_at = new Date().toISOString();
  const archivedSnapshot = { ...msg };
  try {
    const result = await archiveNotification(msg.id, currentUserId.value);
    if (result?.error) throw result.error;
    const idx = messages.value.findIndex((m) => m.id === msg.id);
    if (idx !== -1) {
      messages.value.splice(idx, 1);
    }
    archivedMessages.value = mergeById(archivedMessages.value, [archivedSnapshot]);
    await triggerUnreadRefresh();
    showFeedback('已归档', 'success', {
      actionLabel: '撤销',
      action: () => restoreArchivedMessages([archivedSnapshot])
    });
  } catch (error) {
    msg.archived_at = previousArchivedAt;
    logger.error('messages', '归档失败', error);
    showFeedback(error?.message || '归档失败，请稍后重试', 'error');
  }
};

const unarchiveMessage = async (msg) => {
  if (!msg?.id) return;
  const previousArchivedAt = msg.archived_at;
  msg.archived_at = null;
  try {
    const result = await unarchiveNotification(msg.id, currentUserId.value);
    if (result?.error) throw result.error;
    const idx = archivedMessages.value.findIndex((m) => m.id === msg.id);
    if (idx !== -1) {
      archivedMessages.value.splice(idx, 1);
    }
    await triggerUnreadRefresh();
    if (!loading.value) {
      await loadNotifications();
    }
    showFeedback('已取消归档', 'success');
  } catch (error) {
    msg.archived_at = previousArchivedAt;
    logger.error('messages', '取消归档失败', error);
    showFeedback(error?.message || '取消归档失败，请稍后重试', 'error');
  }
};

const loadArchivedNotifications = async () => {
  archivedLoading.value = true;
  try {
    let userId = currentUserId.value;
    if (!userId) {
      const user = await withTaskTimeout(getCurrentUser());
      if (!user) return;
      userId = user.id;
      currentUserId.value = userId;
    }
    const { data, hasMore, nextCursor } = await withTaskTimeout(getArchivedNotifications(userId, {
      limit: MESSAGE_PAGE_SIZE
    }));
    archivedMessages.value = (data || []).map(enrichMessage);
    archivedHasMore.value = Boolean(hasMore);
    archivedCursor.value = nextCursor || null;
    archivedLoadedOnce.value = true;
  } catch (error) {
    logger.error('messages', '加载已归档通知失败', error);
    showFeedback(error?.message || '加载已归档通知失败', 'error');
  } finally {
    archivedLoading.value = false;
    await nextTick();
    setupArchivedLoadMoreObserver();
  }
};

async function loadMoreArchivedNotifications() {
  if (!currentUserId.value || archivedLoadingMore.value || !archivedHasMore.value) return;
  archivedLoadingMore.value = true;
  try {
    const { data, hasMore, nextCursor } = await withTaskTimeout(getArchivedNotifications(currentUserId.value, {
      limit: MESSAGE_PAGE_SIZE,
      cursor: archivedCursor.value
    }));
    archivedMessages.value = mergeById(archivedMessages.value, (data || []).map(enrichMessage));
    archivedHasMore.value = Boolean(hasMore);
    archivedCursor.value = nextCursor || null;
  } catch (error) {
    logger.error('messages', '加载更多已归档通知失败', error);
    showFeedback(error?.message || '加载更多已归档通知失败', 'error');
  } finally {
    archivedLoadingMore.value = false;
    await nextTick();
    setupArchivedLoadMoreObserver();
  }
};

const setupArchivedLoadMoreObserver = () => {
  if (archivedLoadMoreObserver) {
    archivedLoadMoreObserver.disconnect();
    archivedLoadMoreObserver = null;
  }
  if (!archivedLoadMoreSentinelRef.value) return;
  archivedLoadMoreObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && archivedHasMore.value && !archivedLoadingMore.value) {
      loadMoreArchivedNotifications();
    }
  }, { rootMargin: '200px' });
  archivedLoadMoreObserver.observe(archivedLoadMoreSentinelRef.value);
};

const archiveCurrentTabMessages = async () => {
  if (!currentUserId.value) return;
  let targetType = null;
  if (currentTab.value === 'all') {
    targetType = null;
  } else if (currentTab.value === 'system') {
    targetType = ['system', 'gift', LOTTERY_WIN_NOTIFICATION_TYPE, POST_REJECTED_NOTIFICATION_TYPE, POST_REPORT_LIMITED_NOTIFICATION_TYPE, COMMENT_REJECTED_NOTIFICATION_TYPE];
  } else {
    targetType = [currentTab.value];
  }
  try {
    const result = await archiveAllNotifications(currentUserId.value, targetType);
    if (result?.error) throw result.error;
    messages.value = messages.value.filter((m) => {
      if (targetType) {
        return !targetType.includes(m.type);
      }
      return false;
    });
    await triggerUnreadRefresh();
    showFeedback('当前分类已全部归档', 'success');
  } catch (error) {
    logger.error('messages', '批量归档失败', error);
    showFeedback(error?.message || '批量归档失败，请稍后重试', 'error');
  }
};

const archiveSelectedMessages = async () => {
  const ids = Array.from(selectedMessageIds.value);
  if (ids.length === 0) {
    showFeedback('请先选择要归档的通知', 'info');
    return;
  }

  const previousMessages = [...messages.value];
  const previousArchivedMessages = [...archivedMessages.value];
  const archivedSnapshots = messages.value
    .filter((message) => selectedMessageIds.value.has(message.id))
    .map((message) => ({ ...message, archived_at: new Date().toISOString() }));

  try {
    // 使用 Promise.allSettled 处理部分失败
    const results = await Promise.allSettled(
      ids.map((id) => archiveNotification(id, currentUserId.value))
    );

    const succeededIds = [];
    const failedIds = [];

    results.forEach((result, index) => {
      const id = ids[index];
      if (result.status === 'fulfilled' && !result.value?.error) {
        succeededIds.push(id);
      } else {
        failedIds.push(id);
        const errorMsg = result.status === 'rejected'
          ? result.reason?.message
          : result.value?.error?.message;
        logger.error('messages', `归档失败 [id=${id}]`, errorMsg);
      }
    });

    // 只更新成功归档的消息状态
    messages.value = messages.value.filter((message) => !succeededIds.includes(message.id));
    const succeededSnapshots = archivedSnapshots.filter((snapshot) => succeededIds.includes(snapshot.id));
    archivedMessages.value = mergeById(archivedMessages.value, succeededSnapshots);

    if (selectedMessage.value && succeededIds.includes(selectedMessage.value.id)) {
      closeDetail();
    }

    // 清空选择状态
    selectedMessageIds.value = new Set();
    isSelectMode.value = false;

    await triggerUnreadRefresh();

    if (failedIds.length === 0) {
      showFeedback(`已归档 ${succeededIds.length} 条通知`, 'success', {
        actionLabel: '撤销',
        action: () => restoreArchivedMessages(succeededSnapshots)
      });
    } else if (succeededIds.length > 0) {
      showFeedback(`已归档 ${succeededIds.length} 条通知，${failedIds.length} 条失败`, 'info', {
        actionLabel: '撤销',
        action: () => restoreArchivedMessages(succeededSnapshots)
      });
    } else {
      // 全部失败，回滚本地状态
      messages.value = previousMessages;
      archivedMessages.value = previousArchivedMessages;
      showFeedback('批量归档失败，请稍后重试', 'error');
    }
  } catch (error) {
    // 异常情况回滚
    messages.value = previousMessages;
    archivedMessages.value = previousArchivedMessages;
    logger.error('messages', '批量归档所选通知失败', error);
    showFeedback(error?.message || '批量归档失败，请稍后重试', 'error');
  }
};

const unarchiveSelectedMessages = async () => {
  const ids = Array.from(selectedMessageIds.value);
  if (ids.length === 0) {
    showFeedback('请先选择要取消归档的通知', 'info');
    return;
  }

  const previousMessages = [...messages.value];
  const previousArchivedMessages = [...archivedMessages.value];
  const unarchivedSnapshots = archivedMessages.value
    .filter((message) => selectedMessageIds.value.has(message.id))
    .map((message) => ({ ...message, archived_at: null }));

  try {
    const results = await Promise.allSettled(
      ids.map((id) => unarchiveNotification(id, currentUserId.value))
    );

    const succeededIds = [];
    const failedIds = [];

    results.forEach((result, index) => {
      const id = ids[index];
      if (result.status === 'fulfilled' && !result.value?.error) {
        succeededIds.push(id);
      } else {
        failedIds.push(id);
        const errorMsg = result.status === 'rejected'
          ? result.reason?.message
          : result.value?.error?.message;
        logger.error('messages', `取消归档失败 [id=${id}]`, errorMsg);
      }
    });

    const succeededSnapshots = unarchivedSnapshots.filter((snapshot) => succeededIds.includes(snapshot.id));
    archivedMessages.value = archivedMessages.value.filter((message) => !succeededIds.includes(message.id));
    messages.value = mergeById(messages.value, succeededSnapshots);

    if (selectedMessage.value && succeededIds.includes(selectedMessage.value.id)) {
      closeDetail();
    }

    selectedMessageIds.value = new Set();
    isSelectMode.value = false;

    await triggerUnreadRefresh();

    if (failedIds.length === 0) {
      showFeedback(`已取消归档 ${succeededIds.length} 条通知`, 'success', {
        actionLabel: '撤销',
        action: () => restoreUnarchivedMessages(succeededSnapshots)
      });
    } else if (succeededIds.length > 0) {
      showFeedback(`已取消归档 ${succeededIds.length} 条通知，${failedIds.length} 条失败`, 'info', {
        actionLabel: '撤销',
        action: () => restoreUnarchivedMessages(succeededSnapshots)
      });
    } else {
      messages.value = previousMessages;
      archivedMessages.value = previousArchivedMessages;
      showFeedback('批量取消归档失败，请稍后重试', 'error');
    }
  } catch (error) {
    messages.value = previousMessages;
    archivedMessages.value = previousArchivedMessages;
    logger.error('messages', '批量取消归档所选通知失败', error);
    showFeedback(error?.message || '批量取消归档失败，请稍后重试', 'error');
  }
};

const restoreUnarchivedMessages = async (snapshots) => {
  if (!snapshots || snapshots.length === 0) return;

  const previousMessages = [...messages.value];
  const previousArchivedMessages = [...archivedMessages.value];

  // 乐观更新：从 messages 移回 archivedMessages
  messages.value = messages.value.filter((message) => !snapshots.some((row) => row.id === message.id));
  archivedMessages.value = mergeById(archivedMessages.value, snapshots.map((row) => ({ ...row, archived_at: new Date().toISOString() })));

  const results = await Promise.allSettled(
    snapshots.map((row) => archiveNotification(row.id, currentUserId.value))
  );

  const succeededRows = [];
  const failedRows = [];

  results.forEach((result, index) => {
    const row = snapshots[index];
    if (result.status === 'fulfilled' && !result.value?.error) {
      succeededRows.push(row);
    } else {
      failedRows.push(row);
      const errorMsg = result.status === 'rejected'
        ? result.reason?.message
        : result.value?.error?.message;
      logger.error('messages', `撤销取消归档失败 [id=${row.id}]`, errorMsg);
    }
  });

  if (failedRows.length === 0) {
    showFeedback(`已撤销 ${succeededRows.length} 条通知`, 'success');
  } else if (succeededRows.length > 0) {
    showFeedback(`已撤销 ${succeededRows.length} 条通知，${failedRows.length} 条失败`, 'info');
  } else {
    messages.value = previousMessages;
    archivedMessages.value = previousArchivedMessages;
    showFeedback('撤销取消归档失败，请稍后重试', 'error');
  }

  await triggerUnreadRefresh();
};

const markSelectedMessagesAsRead = async () => {
  const ids = Array.from(selectedMessageIds.value);
  if (ids.length === 0) {
    showFeedback('请先选择要标记的通知', 'info');
    return;
  }

  const selectedRows = messages.value.filter((message) => selectedMessageIds.value.has(message.id));
  const unreadRows = selectedRows.filter((message) => message.status === 'unread');
  if (unreadRows.length === 0) {
    selectedMessageIds.value = new Set();
    isSelectMode.value = false;
    showFeedback('所选通知已经是已读', 'info');
    return;
  }

  // 保存原始状态以便回滚
  const previousStatuses = new Map(unreadRows.map((message) => [message.id, message.status]));

  try {
    // 使用 Promise.allSettled 处理部分失败
    const results = await Promise.allSettled(
      unreadRows.map((message) => markNotificationAsRead(message.id, currentUserId.value))
    );

    const succeededRows = [];
    const failedRows = [];

    results.forEach((result, index) => {
      const message = unreadRows[index];
      if (result.status === 'fulfilled' && !result.value?.error) {
        succeededRows.push(message);
        // 成功的标记为已读
        message.status = 'read';
      } else {
        failedRows.push(message);
        // 失败的恢复原始状态
        message.status = previousStatuses.get(message.id) || message.status;
        const errorMsg = result.status === 'rejected'
          ? result.reason?.message
          : result.value?.error?.message;
        logger.error('messages', `标记已读失败 [id=${message.id}]`, errorMsg);
      }
    });

    selectedMessageIds.value = new Set();
    isSelectMode.value = false;
    await triggerUnreadRefresh();

    if (failedRows.length === 0) {
      showFeedback(`已标记 ${succeededRows.length} 条通知为已读`, 'success');
    } else if (succeededRows.length > 0) {
      showFeedback(`已标记 ${succeededRows.length} 条通知为已读，${failedRows.length} 条失败`, 'info');
    } else {
      showFeedback('标记已读失败，请稍后重试', 'error');
    }
  } catch (error) {
    // 异常情况回滚所有状态
    unreadRows.forEach((message) => {
      message.status = previousStatuses.get(message.id) || message.status;
    });
    logger.error('messages', '批量标记所选通知已读失败', error);
    showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
  }
};

// ─── 多选模式 ─────────────────────────────────────────────────────────────

const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value;
  if (!isSelectMode.value) {
    selectedMessageIds.value = new Set();
  }
};

const toggleActionsDropdown = () => {
  actionsDropdownOpen.value = !actionsDropdownOpen.value;
};

const toggleMessageSelection = (msgId) => {
  const next = new Set(selectedMessageIds.value);
  if (next.has(msgId)) {
    next.delete(msgId);
  } else {
    next.add(msgId);
  }
  selectedMessageIds.value = next;
};

const isAllFilteredSelected = computed(() => {
  const current = filteredMessages.value;
  return current.length > 0 && current.every((m) => selectedMessageIds.value.has(m.id));
});

const closeSelectFilterDropdown = (e) => {
  const wrap = e.target.closest('.x-filter-dropdown-wrap, .x-select-actions-dropdown, .x-select-actions-dropdown-minimal');
  if (!wrap) {
    selectFilterOpen.value = false;
    filterDropdownOpen.value = false;
    actionsDropdownOpen.value = false;
  }
};

const selectAllFiltered = () => {
  const current = filteredMessages.value;
  if (isAllFilteredSelected.value) {
    selectedMessageIds.value = new Set();
  } else {
    selectedMessageIds.value = new Set(current.map((m) => m.id));
  }
};




const triggerUnreadRefresh = async () => {
  // 从数据库刷新未读计数
  invalidateMessageCenterCaches();
  await refreshUnreadCount({ force: true });
  // 使用自定义事件来通知同标签页内的其他组件刷新
  const event = new CustomEvent('boh_unread_refresh', {
    detail: { source: 'local-action' }
  });
  window.dispatchEvent(event);
  // 使用 localStorage 事件来通知其他标签页刷新
  localStorage.setItem('boh_unread_refresh', Date.now().toString());
  setTimeout(() => {
    localStorage.removeItem('boh_unread_refresh');
  }, 100);
};

const goBack = () => {
  router.push(resolveSettingsBackLocation(route));
};

// 标记单条已读（快捷操作）
const markAsRead = async (msg) => {
  if (!msg || msg.status !== 'unread') return;

  const previousStatus = msg.status;
  msg.status = 'read';
  try {
    const result = await markNotificationAsRead(msg.id, currentUserId.value);
    if (result?.error) throw result.error;
    await triggerUnreadRefresh();
    showFeedback('已标记为已读', 'success');
  } catch (error) {
    msg.status = previousStatus;
    logger.error('messages', '标记已读失败', error);
    showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
  }
};

// 标记全部已读
const markAllAsRead = async () => {
  if (!currentUserId.value) {
    logger.debug('messages', '标记全部已读跳过：currentUserId 为空');
    return;
  }

  try {
    await markAllNotificationsAsRead(currentUserId.value);
    messages.value.forEach(m => m.status = 'read');
    // 触发未读消息数量更新
    await triggerUnreadRefresh();
    showFeedback('通知已全部标记为已读', 'success');
  } catch (error) {
    logger.error('messages', '标记全部已读失败', error);
    showFeedback(error?.message || '操作失败，请稍后重试', 'error');
  }
};

// 显示详情并标记已读
const showDetail = async (msg) => {
  lastFocusedMessageId.value = msg.id;
  selectedMessage.value = msg;

  if (msg.status === 'unread') {
    try {
      const result = await markNotificationAsRead(msg.id, currentUserId.value);
      if (result?.error) throw result.error;
      msg.status = 'read';
      // 触发未读消息数量更新
      await triggerUnreadRefresh();
    } catch (error) {
      logger.error('messages', '标记已读失败', error);
      showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
    }
  }

  await nextTick();
  const panel = document.querySelector('.x-detail-panel');
  const firstFocusable = panel?.querySelector('button, [tabindex], input, textarea, select');
  if (firstFocusable) firstFocusable.focus();
  else panel?.focus();
};

const afterPanelLeave = () => {
  if (!selectedMessage.value) {
    showOverlay.value = false;
  }
};

const closeDetail = () => {
  selectedMessage.value = null;
  showReplyInput.value = false;
  replyContent.value = '';
  if (!isMobile.value) {
    showOverlay.value = false;
  }
  if (lastFocusedMessageId.value) {
    nextTick(() => {
      const item = document.querySelector(`.x-item[data-message-id="${lastFocusedMessageId.value}"]`);
      if (item instanceof HTMLElement) item.focus();
      lastFocusedMessageId.value = null;
    });
  }
};

const openReplyInput = () => {
  if (!isLoggedIn.value) {
    authStore.showLoginModal = true;
    return;
  }
  showReplyInput.value = true;
};

const cancelReply = () => {
  showReplyInput.value = false;
  replyContent.value = '';
};

const getNotificationReplyParentId = (msg) => {
  const comment = msg?.comment || {};
  const parent = comment.parent || {};
  return parent.parent_id || comment.parent_id || msg?.comment_id || null;
};

const submitReply = async () => {
  if (!isLoggedIn.value || !replyContent.value.trim() || isReplySubmitting.value) return;

  isReplySubmitting.value = true;

  try {
    const commentStatus = 'approved';
    const msg = selectedMessage.value;
    const rawReplyContent = replyContent.value.trim();

    const { error } = await createComment(
      msg.post_id,
      rawReplyContent,
      userInfo.value.id,
      userInfo.value.username,
      commentStatus,
      getNotificationReplyParentId(msg),
      msg.sender?.username || null
    );

    if (error) throw error;
    showFeedback('回复已发送', 'success');
    showReplyInput.value = false;
    replyContent.value = '';
  } catch (error) {
    logger.error('messages', '回复失败', error);
    showFeedback(error?.message || '回复发送失败，请稍后重试', 'error');
  } finally {
    isReplySubmitting.value = false;
  }
};

const viewOriginalPost = () => {
  const postId = selectedMessage.value?.post?.id || selectedMessage.value?.post_id;
  if (postId) {
    const commentId = selectedMessage.value?.comment?.id || selectedMessage.value?.comment_id;
    closeDetail();
    router.push({
      path: `/forum/post/${postId}`,
      query: commentId ? { comment: commentId } : {}
    });
  } else {
    logger.warn('messages', '无法跳转：帖子ID不存在', selectedMessage.value);
    showFeedback('无法跳转到原文，该帖子可能已被删除', 'error');
  }
};

const retryRejectedPostFromNotification = async () => {
  if (!selectedMessage.value || !canRetryModerationNotification(selectedMessage.value)) {
    return;
  }

  const notificationId = String(selectedMessage.value.id || '');
  const postId = selectedMessage.value.post?.id || selectedMessage.value.post_id;
  if (!notificationId || !postId) return;

  retryingNotificationIds[notificationId] = true;
  try {
    const { ok, resultStatus, error } = await retryPostModeration(postId, userInfo.value.id);
    if (!ok) {
      showFeedback(`重试失败：${error?.message || '请稍后重试'}`, 'error');
      return;
    }

    markNotificationRetried(notificationId);
    if (resultStatus === 'approved') {
      showFeedback('重试通过：帖子已恢复展示', 'success');
    } else {
      showFeedback('本次重试后仍未通过审查，如有疑问请联系客服', 'info');
    }
  } catch (error) {
    logger.error('messages', '帖子复审重试失败', error);
    showFeedback('重试失败，请稍后再试', 'error');
  } finally {
    retryingNotificationIds[notificationId] = false;
  }
};

// 获取通知类型简短标签
const getTypeLabel = (type) => {
  const labels = {
    'like': '赞了你',
    'comment': '回复了你',
    'follow': '关注了你',
    'impression': '给你印象',
    [POST_REJECTED_NOTIFICATION_TYPE]: '审查通知',
    [COMMENT_REJECTED_NOTIFICATION_TYPE]: '审查通知',
    [LOTTERY_WIN_NOTIFICATION_TYPE]: '中奖通知',
    'system': '系统消息',
    'gift': '礼物通知'
  };
  return labels[type] || '消息';
};

// 获取通知类型标签
const getNotificationTypeLabel = (type) => {
  const labels = {
    'like': '点赞通知',
    'comment': '评论通知',
    'follow': '关注通知',
    'impression': '印象通知',
    [POST_REJECTED_NOTIFICATION_TYPE]: '发帖审查',
    [POST_REPORT_LIMITED_NOTIFICATION_TYPE]: '举报处理',
    [COMMENT_REJECTED_NOTIFICATION_TYPE]: '评论审查',
    [LOTTERY_WIN_NOTIFICATION_TYPE]: '中奖通知',
    'system': '系统通知',
    'gift': '礼物通知'
  };
  return labels[type] || '消息';
};

// 获取通知标题
const getNotificationTitle = (notification) => {
  switch (notification.type) {
    case 'like':
      return `${notification.sender?.username || '有人'} 点赞了你的内容`;
    case 'comment':
      return `${notification.sender?.username || '有人'} 评论了你的内容`;
    case 'follow':
      return `${notification.sender?.username || '有人'} 关注了你`;
    case 'impression':
      return `${notification.sender?.username || '有人'} 对你发表了印象`;
    case POST_REJECTED_NOTIFICATION_TYPE:
      return '发帖审查未通过';
    case POST_REPORT_LIMITED_NOTIFICATION_TYPE:
      return '帖子已设为仅自己可见';
    case COMMENT_REJECTED_NOTIFICATION_TYPE:
      return '评论审查未通过';
    case LOTTERY_WIN_NOTIFICATION_TYPE:
      return '你中奖啦';
    case 'system':
      return '系统通知';
    case 'gift':
      return '礼物进度更新';
    default:
      return '新消息';
  }
};

// 获取通知预览
const getNotificationPreview = (notification) => {
  if (notification.type === 'impression') {
    return '查看新的印象评价';
  }
  if (notification.type === 'gift') {
    return notification.content || '查看礼物最新进度';
  }
  if (notification.type === 'system') {
    return notification.content || '系统消息';
  }
  if (notification.type === POST_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || POST_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === POST_REPORT_LIMITED_NOTIFICATION_TYPE) {
    return notification.content || POST_REPORT_LIMITED_NOTICE_TEXT;
  }
  if (notification.type === COMMENT_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || COMMENT_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === LOTTERY_WIN_NOTIFICATION_TYPE) {
    return notification.content || '你在 BOH 抽奖中中奖啦，请等待管理员联系。';
  }
  if (notification.comment?.content) {
    return notification.comment.content.substring(0, 50) + (notification.comment.content.length > 50 ? '...' : '');
  }
  if (notification.post) {
    return getForumPostExcerpt(notification.post, 50);
  }
  return '查看详情';
};

// 获取通知完整内容
const getNotificationContent = (notification) => {
  if (notification.type === 'impression') {
    return '有伙伴为您撰写了新的社区印象，快去个人中心查看吧！';
  }
  if (notification.type === 'gift') {
    return notification.content || '您的礼物进度有更新，请前往礼物中心查看。';
  }
  if (notification.type === 'system') {
    return notification.content || '系统消息';
  }
  if (notification.type === POST_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || POST_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === POST_REPORT_LIMITED_NOTIFICATION_TYPE) {
    return notification.content || POST_REPORT_LIMITED_NOTICE_TEXT;
  }
  if (notification.type === COMMENT_REJECTED_NOTIFICATION_TYPE) {
    return notification.content || COMMENT_REJECTED_NOTICE_TEXT;
  }
  if (notification.type === LOTTERY_WIN_NOTIFICATION_TYPE) {
    return notification.content || '你在 BOH 抽奖中中奖啦，请等待管理员联系。';
  }
  if (notification.comment?.content) {
    return notification.comment.content;
  }
  if (notification.type === 'like' && notification.post) {
    const title = getForumPostTitle(notification.post);
    return title && title !== '无标题' ? `点赞了你的帖子《${title}》` : '点赞了你的帖子';
  }
  return '您收到了一条新通知';
};

const getNotificationSourceLabel = (notification) => {
  if (notification?.type === 'comment') return '原帖内容：';
  return '原文内容：';
};

const getNotificationSourceText = (notification) => {
  if (notification?.post) {
    return getForumPostBody(notification.post) || getForumPostTitle(notification.post);
  }
  return String(notification?.comment?.content || '').trim();
};

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const enrichMessage = (m) => ({
  ...m,
  _title: getNotificationTitle(m),
  _preview: getNotificationPreview(m),
  _typeLabel: getTypeLabel(m.type),
  _formattedDate: formatDate(m.created_at),
});

const loadMoreNotificationLabel = computed(() => {
  if (loadingMoreNotifications.value) return '加载中...';
  return hasMoreNotifications.value ? '加载更多通知' : '没有更多通知';
});
</script>

<style scoped>
@import './style.scoped.css';
</style>
