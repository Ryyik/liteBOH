<template>
  <div class="x-notifications-container" :class="{ 'minimal-mode': minimal }">
    <template v-if="!minimal">
      <UnifiedNavbar />
      <UserCenterPageHeader title="消息中心" @back="goBack">
        <template #actions>
          <button v-if="isMailSection" class="compose-btn" @click="openComposeModal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>写信</span>
          </button>
          <button v-else-if="unreadCountsByType.all > 0" class="x-mark-all-btn" @click="markAllAsRead">
            全部已读
          </button>
        </template>
      </UserCenterPageHeader>
    </template>
    <!-- Sticky Header -->
    <header v-if="!minimal" class="x-header">
      <div class="x-header-controls">
        <div class="x-section-switch" role="tablist" aria-label="消息类型">
          <button type="button" :class="{ active: !isMailSection }" @click="switchInboxSection('notifications')">
            通知
            <span v-if="unreadCountsByType.all > 0" class="tab-badge">{{ unreadCountsByType.all }}</span>
          </button>
          <button type="button" :class="{ active: isMailSection }" @click="switchInboxSection('mail')">
            信件
            <span v-if="unreadMailCount > 0" class="tab-badge">{{ unreadMailCount }}</span>
          </button>
        </div>

        <div v-if="!isMailSection" class="x-tabs">
          <button v-for="tab in notificationTabs" :key="tab.id" type="button" class="x-tab"
            :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id)">
            <span>{{ tab.label }}</span>
            <span v-if="tab.unread > 0" class="tab-badge">{{ tab.unread }}</span>
          </button>
        </div>

        <div v-else class="x-mail-toolbar">
          <div class="x-mail-folder-tabs">
            <button type="button" :class="{ active: mailFolder === 'inbox' }" @click="mailFolder = 'inbox'">收件箱</button>
            <button type="button" :class="{ active: mailFolder === 'sent' }" @click="mailFolder = 'sent'">已发送</button>
          </div>
          <label class="x-mail-filter-select">
            <span>时间</span>
            <select v-model="mailTimeFilter">
              <option v-for="filter in mailTimeFilters" :key="filter.id" :value="filter.id">{{ filter.label }}</option>
            </select>
          </label>
        </div>
      </div>
      <div class="x-filter-bar">
        <button type="button" class="x-filter-chip" :class="{ active: showUnreadOnly }"
          @click="showUnreadOnly = !showUnreadOnly">
          只看未读
        </button>
        <button v-if="!isMailSection && currentTab !== 'all' && currentTabUnreadCount > 0" type="button"
          class="x-filter-chip action" @click="markCurrentNotificationTabAsRead">
          当前分类已读
        </button>
        <button v-if="isMailSection && mailFolder === 'inbox' && unreadMailCount > 0" type="button"
          class="x-filter-chip action" @click="markVisibleMailsAsRead">
          当前收件已读
        </button>
      </div>
    </header>

    <!-- Minimal Mode Header -->
    <header v-if="minimal" class="x-header-minimal">
      <div class="x-minimal-main">
        <div class="x-section-switch compact" role="tablist" aria-label="消息类型">
          <button type="button" :class="{ active: !isMailSection }" @click="switchInboxSection('notifications')">
            通知
            <span v-if="unreadCountsByType.all > 0" class="tab-badge-mini">{{ unreadCountsByType.all }}</span>
          </button>
          <button type="button" :class="{ active: isMailSection }" @click="switchInboxSection('mail')">
            信件
            <span v-if="unreadMailCount > 0" class="tab-badge-mini">{{ unreadMailCount }}</span>
          </button>
        </div>
        <div v-if="!isMailSection" class="x-tabs-minimal">
          <button v-for="tab in notificationTabs" :key="tab.id" type="button" class="x-tab"
            :class="{ active: currentTab === tab.id }" @click="setNotificationTab(tab.id)">
            <span>{{ tab.label }}</span>
            <span v-if="tab.unread > 0" class="tab-badge-mini">{{ tab.unread }}</span>
          </button>
        </div>
        <div v-else class="x-mail-toolbar minimal-mail-toolbar">
          <div class="x-mail-folder-tabs">
            <button type="button" :class="{ active: mailFolder === 'inbox' }" @click="mailFolder = 'inbox'">收件箱</button>
            <button type="button" :class="{ active: mailFolder === 'sent' }" @click="mailFolder = 'sent'">已发送</button>
          </div>
          <label class="x-mail-filter-select">
            <select v-model="mailTimeFilter" aria-label="信件时间筛选">
              <option v-for="filter in mailTimeFilters" :key="filter.id" :value="filter.id">{{ filter.label }}</option>
            </select>
          </label>
        </div>
        <div class="x-filter-bar minimal-filter-bar">
          <button type="button" class="x-filter-chip" :class="{ active: showUnreadOnly }"
            @click="showUnreadOnly = !showUnreadOnly">
            只看未读
          </button>
        </div>
      </div>
      <div class="x-header-actions-minimal">
        <button v-if="isMailSection" class="compose-btn-mini" @click="openComposeModal" aria-label="写信">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
        <button v-else-if="unreadCountsByType.all > 0" class="x-mark-all-btn-minimal" @click="markAllAsRead">
          全部已读
        </button>
      </div>
    </header>

    <!-- Notifications List -->
    <div v-if="!isMailSection" class="x-list">
      <!-- Skeleton Loading -->
      <div v-if="loading" class="x-skeleton-list">
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
      <div v-else-if="notificationsLoadError" class="x-empty">
        <div class="x-empty-visual">
          <TriangleAlert class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>通知加载失败</h3>
        <p>{{ notificationsLoadError }}</p>
        <button class="refresh-btn" @click="loadNotifications">点击重试</button>
      </div>
      <div v-else-if="filteredMessages.length > 0" class="x-inbox-list">
        <div v-for="msg in filteredMessages" :key="msg.id" class="x-item" :class="{ unread: msg.status === 'unread' }"
          @click="showDetail(msg)">
          <span v-if="msg.status === 'unread'" class="x-unread-dot" aria-hidden="true"></span>
          <!-- 左侧：头像 -->
          <div class="x-item-left">
            <div class="x-avatar-wrapper">
              <img v-if="msg.sender?.avatar_url" :src="msg.sender.avatar_url" class="x-avatar-img" alt="avatar" />
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
                <span class="x-action-type">{{ getTypeLabel(msg.type) }}</span>
              </div>
              <span class="x-date inline-date">{{ formatDate(msg.created_at) }}</span>
            </div>
            <div class="x-item-content">
              <span class="x-text">{{ getNotificationTitle(msg) }}</span>
            </div>
            <div v-if="getNotificationPreview(msg)" class="x-preview-box">
              {{ getNotificationPreview(msg) }}
            </div>
          </div>
          <!-- 右侧：时间和状态 -->
          <div class="x-item-right">
            <span class="x-date">{{ formatDate(msg.created_at) }}</span>
            <!-- 悬停快捷操作 -->
            <div v-if="msg.status === 'unread'" class="x-quick-actions" @click.stop>
              <button class="x-quick-btn mark-read" @click="markAsRead(msg)" title="标记已读" aria-label="标记已读">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div v-if="hasMoreNotifications" class="x-load-more-row">
          <button class="x-load-more-btn" :disabled="loadingMoreNotifications" @click="loadMoreNotifications">
            {{ loadMoreNotificationLabel }}
          </button>
        </div>
      </div>
      <div v-else class="x-empty">
        <div class="x-empty-visual">
          <Bell class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>保持专注，暂无新通知</h3>
        <p>当有伙伴与你互动或系统有新消息时，你会在这里看到它们。</p>
        <button class="refresh-btn" @click="loadNotifications">刷新试试</button>
      </div>
    </div>

    <!-- Mail List -->
    <div v-else class="x-mail-section">
      <!-- Skeleton Loading for Mails -->
      <div v-if="loadingMails" class="x-skeleton-list">
        <div v-for="i in 4" :key="i" class="x-skeleton-item x-skeleton-mail">
          <div class="x-skeleton-avatar"></div>
          <div class="x-skeleton-content">
            <div class="x-skeleton-line x-skeleton-title"></div>
            <div class="x-skeleton-line x-skeleton-text"></div>
            <div class="x-skeleton-line x-skeleton-text short"></div>
          </div>
          <div class="x-skeleton-right">
            <div class="x-skeleton-line x-skeleton-time"></div>
          </div>
        </div>
      </div>
      <div v-else-if="mailsLoadError" class="x-empty">
        <div class="x-empty-visual">
          <TriangleAlert class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>邮件加载失败</h3>
        <p>{{ mailsLoadError }}</p>
        <button class="refresh-btn" @click="fetchMails">点击重试</button>
      </div>
      <div v-else-if="filteredMails.length > 0" class="x-mail-list">
        <div v-for="mail in filteredMails" :key="mail.id" class="x-mail-item"
          :class="{ 'unread': mail.status === 'unread' && mailFolder === 'inbox' }" @click="selectMail(mail)">
          <span v-if="mail.status === 'unread' && mailFolder === 'inbox'" class="x-unread-dot mail-dot" aria-hidden="true"></span>
          <div class="x-mail-avatar">
            {{ (mailFolder === 'inbox' ? mail.sender_name : mail.receiver_name)?.charAt(0)?.toUpperCase?.() || 'U' }}
          </div>
          <div class="x-mail-content">
            <div class="x-mail-header">
              <div class="x-mail-sender-wrap">
                <span class="x-mail-sender">{{ mailFolder === 'inbox' ? mail.sender_name : mail.receiver_name }}</span>
                <span v-if="mailFolder === 'sent' && mail.moderation_status && mail.moderation_status !== 'approved'"
                  class="mail-moderation-badge">{{ mail.moderation_status }}</span>
              </div>
              <span class="x-mail-date">{{ formatDate(mail.created_at) }}</span>
            </div>
            <div class="x-mail-subject">{{ mail.subject || '(无主题)' }}</div>
            <div class="x-mail-excerpt">{{ mail.content }}</div>
          </div>
        </div>
        <div v-if="hasMoreMails" class="x-load-more-row">
          <button class="x-load-more-btn" :disabled="loadingMoreMails" @click="loadMoreMails">
            {{ loadMoreMailLabel }}
          </button>
        </div>
      </div>
      <div v-else class="x-empty">
        <div class="x-empty-visual">
          <MailX class="empty-icon-circle" :size="44" :stroke-width="1.7" aria-hidden="true" />
          <div class="empty-glow"></div>
        </div>
        <h3>这里空空如也</h3>
        <p>{{ getEmptyMailMessage }}</p>
      </div>
    </div>

    <!-- Details Overlay (Sidebar style) -->
    <Teleport to="body">
      <Transition name="slide-right">
        <div v-if="selectedMessage" class="x-detail-drawer-overlay" @click="closeDetail">
          <div class="x-detail-drawer" @click.stop>
            <div class="drawer-header">
              <UserCenterBackButton label="返回消息列表" @click="closeDetail" />
              <h3>通知详情</h3>
            </div>
            <div class="drawer-content">
              <div class="detail-user-card">
                <div class="large-avatar-wrapper">
                  <img v-if="selectedMessage.sender?.avatar_url" :src="selectedMessage.sender.avatar_url"
                    class="large-avatar-img" alt="avatar" />
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
              <div v-if="shouldShowActions" class="notification-actions">
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
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Mail Detail Drawer -->
      <Transition name="slide-right">
        <div v-if="selectedMail" class="x-detail-drawer-overlay" @click="closeMailDetail">
          <div class="x-detail-drawer" @click.stop>
            <div class="drawer-header">
              <UserCenterBackButton label="返回信件列表" @click="closeMailDetail" />
              <h3>信件详情</h3>
            </div>
            <div class="drawer-content">
              <div class="detail-user-card">
                <div class="large-avatar-wrapper">
                  <div class="large-avatar">
                    {{ selectedMail.sender_name?.charAt(0)?.toUpperCase?.() || 'U' }}
                  </div>
                </div>
                <div class="user-info">
                  <span class="name">{{ selectedMail.sender_name }}</span>
                  <span class="type">
                    发送至: {{ selectedMail.receiver_name }}
                  </span>
                </div>
              </div>
              <div class="detail-body">
                <h2 class="detail-title">{{ selectedMail.subject || '(无主题)' }}</h2>
                <p class="main-text mail-content-text">{{ selectedMail.content }}</p>
                <span class="full-date">{{ new Date(selectedMail.created_at).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) }}</span>
              </div>
              <div class="mail-actions" v-if="mailFolder === 'inbox'">
                <button class="mail-action-btn reply" @click="handleReplyMail(selectedMail)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 17 4 12 9 7"></polyline>
                    <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                  </svg>
                  回复
                </button>
                <button class="mail-action-btn delete" @click="handleDeleteMail(selectedMail)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Compose Mail Modal -->
      <Transition name="fade">
        <div v-if="showComposeModal" class="compose-modal-overlay" @click.self="closeComposeModal">
          <div class="compose-modal-container" @click="handleComposeModalClick">
            <div class="compose-header">
              <h3>新信件</h3>
              <button class="close-modal-btn" @click="closeComposeModal" aria-label="关闭写信窗口">
                <X :size="17" :stroke-width="1.9" aria-hidden="true" />
              </button>
            </div>
            <div class="compose-body">
              <div class="compose-field recipient-field">
                <label>收件人:</label>
                <div class="recipient-container">
                  <div class="selected-recipients" v-if="selectedRecipients.length > 0">
                    <span v-for="user in selectedRecipients" :key="user.id" class="recipient-tag">
                      {{ user.username }}
                      <button class="remove-tag" @click.stop="removeRecipient(user)"
                        v-if="!composeData.isReply">×</button>
                    </span>
                  </div>
                  <div class="recipient-input-wrapper">
                    <input type="text" v-model="composeData.receiver_search" placeholder="输入或从伙伴中选择"
                      :disabled="composeData.isReply" @focus="showRecipientDropdown = true" />
                    <Transition name="fade-fast">
                      <div
                        v-if="showRecipientDropdown && (loadingPartners || filteredPartners.length > 0) && !composeData.isReply"
                        class="recipient-dropdown" @click.stop>
                        <div v-if="loadingPartners" class="dropdown-loading">
                          <div class="spinner-mini"></div>
                          <span>正在加载伙伴...</span>
                        </div>
                        <template v-else>
                          <div v-for="partner in filteredPartners" :key="partner.id" class="dropdown-item"
                            @click.stop="toggleRecipient(partner)">
                            <div class="item-avatar-mini">{{ partner.username?.charAt(0)?.toUpperCase?.() || 'U' }}
                            </div>
                            <div class="item-info">
                              <div class="item-name">{{ partner.username }}</div>
                              <div class="item-role">{{ getRoleLabel(partner.role) }}</div>
                            </div>
                            <Check v-if="isRecipientSelected(partner)" class="item-check" :size="16"
                              :stroke-width="2.2" aria-hidden="true" />
                          </div>
                        </template>
                      </div>
                    </Transition>
                  </div>
                </div>
              </div>
              <div class="compose-field">
                <label>主题:</label>
                <input type="text" v-model="composeData.subject" placeholder="信件主题" />
              </div>
              <div class="compose-field content-field">
                <textarea v-model="composeData.content" placeholder="输入信件内容..." :maxlength="MAIL_CONTENT_MAX_LENGTH"></textarea>
                <div class="compose-count">{{ composeContentLength }} / {{ MAIL_CONTENT_MAX_LENGTH }}</div>
              </div>
            </div>
            <div class="compose-footer">
              <div class="moderation-info" :class="{ muted: !isModerating }">
                <template v-if="isModerating">
                <div class="spinner-mini"></div>
                AI 正在审查内容...
                </template>
                <template v-else>
                  {{ composeFooterHint }}
                </template>
              </div>
              <button class="send-mail-btn" :disabled="!isComposeValid || isModerating" @click="sendMail">
                <svg v-if="!isModerating" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>{{ isModerating ? '正在审查...' : '发送' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="fade">
        <div v-if="feedbackToast.visible" class="message-feedback-toast" :class="feedbackToast.type">
          {{ feedbackToast.message }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell, Check, MailX, TriangleAlert, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { loadNotificationStore, getNotificationStoreSync } from '@/stores/notification-loader.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  filterSelfActionNotifications
} from '@/utils/api/notifications-api.js';
import { getCurrentUser } from '@/utils/api/auth-api.js';
import { createComment, retryPostModeration } from '@/utils/api/forum-api.js';
import { supabase } from '@/utils/supabase-client.js';
import { isModerationApproved } from '@/utils/content-moderation';
import {
  deleteMessage,
  getUserMessages,
  markMessageAsRead,
  markMessagesAsRead,
  sendModeratedMessages
} from '@/utils/api/messages-api.js';
import { logger } from '@/utils/logger.js';
import { invalidateByTags } from '@/utils/request-core.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';
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
const loading = ref(true);
const loadingMoreNotifications = ref(false);
const notificationsLoadError = ref('');
const notificationsCursor = ref(null);
const hasMoreNotifications = ref(false);
const currentUserId = ref(null);
const currentTab = ref('all'); // 'all' | 'like' | 'comment' | 'impression' | 'system' | 'mail'
const LOTTERY_WIN_NOTIFICATION_TYPE = 'lottery_win';
const MAIL_CONTENT_MAX_LENGTH = 1200;
const MESSAGE_PAGE_SIZE = 24;
const NOTIFICATION_TABS = [
  { id: 'all', label: '全部' },
  { id: 'comment', label: '回复' },
  { id: 'like', label: '点赞' },
  { id: 'impression', label: '印象' },
  { id: 'system', label: '系统' }
];
const mailTimeFilters = [
  { id: 'all', label: '全部' },
  { id: '3days', label: '3 天内' },
  { id: '7days', label: '7 天内' },
  { id: '1month', label: '1 个月内' }
];

// Mail related state
const mailFolder = ref('inbox'); // 'inbox' | 'sent'
const mailTimeFilter = ref('all'); // 'all' | '3days' | '7days' | '1month'
const mails = ref([]);
const loadingMails = ref(false);
const loadingMoreMails = ref(false);
const mailsLoadError = ref('');
const mailsCursor = ref(null);
const hasMoreMails = ref(false);
const selectedMail = ref(null);
const showComposeModal = ref(false);
const isModerating = ref(false);
const allPartners = ref([]);
const showRecipientDropdown = ref(false);
const selectedRecipients = ref([]);
const loadingPartners = ref(false);
let unreadRefreshInflight = null;
let lastUnreadRefreshAt = 0;
const UNREAD_REFRESH_MIN_INTERVAL_MS = 1200;
let messageCenterRealtimeChannels = [];
let realtimeRefreshTimer = null;
let pendingRealtimeRefresh = {
  notifications: false,
  mails: false,
  forceCache: false
};
const retryingNotificationIds = ref({});
const retriedNotificationIdSet = ref(new Set());
const showUnreadOnly = ref(false);
const feedbackToast = reactive({
  visible: false,
  type: 'info',
  message: ''
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
  return Boolean(key && retryingNotificationIds.value[key]);
});

const composeData = reactive({
  receiver_search: '',
  subject: '',
  content: '',
  isReply: false
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

const showFeedback = (message, type = 'info') => {
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  feedbackToast.message = message;
  feedbackToast.type = type;
  feedbackToast.visible = true;
  feedbackToastTimer = window.setTimeout(() => {
    feedbackToast.visible = false;
    feedbackToastTimer = null;
  }, 2400);
};

const mergeById = (currentRows = [], incomingRows = []) => {
  const map = new Map();
  [...currentRows, ...incomingRows].forEach((row) => {
    if (row?.id) map.set(row.id, { ...(map.get(row.id) || {}), ...row });
  });
  return Array.from(map.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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
    'messages',
    safeUserId ? `notifications:user:${safeUserId}` : '',
    safeUserId ? `messages:user:${safeUserId}` : ''
  ]);
};

const visibleNotificationMessages = computed(() => filterSelfActionNotifications(messages.value));
const isMailSection = computed(() => currentTab.value === 'mail');
const isSystemNotificationType = (type) => [
  'system',
  'gift',
  LOTTERY_WIN_NOTIFICATION_TYPE,
  POST_REJECTED_NOTIFICATION_TYPE,
  POST_REPORT_LIMITED_NOTIFICATION_TYPE,
  COMMENT_REJECTED_NOTIFICATION_TYPE
].includes(type);

const filteredMessages = computed(() => {
  let result = visibleNotificationMessages.value;

  if (currentTab.value === 'system') {
    result = result.filter(m => isSystemNotificationType(m.type));
  } else if (currentTab.value !== 'all') {
    result = result.filter(m => m.type === currentTab.value);
  }

  if (showUnreadOnly.value) {
    result = result.filter(m => m.status === 'unread');
  }

  return result;
});

// 计算各类型未读数量
const unreadCountsByType = computed(() => {
  const counts = { all: 0, like: 0, comment: 0, impression: 0, system: 0 };

  visibleNotificationMessages.value.forEach(m => {
    if (m.status === 'unread') {
      counts.all++;
      if (isSystemNotificationType(m.type)) {
        counts.system++;
      } else if (m.type && Object.prototype.hasOwnProperty.call(counts, m.type)) {
        counts[m.type]++;
      }
    }
  });

  return counts;
});

const notificationTabs = computed(() => NOTIFICATION_TABS.map((tab) => ({
  ...tab,
  unread: unreadCountsByType.value[tab.id] || 0
})));
const currentTabUnreadCount = computed(() => unreadCountsByType.value[currentTab.value] || 0);

const isInboxVisibleMail = (mail) => isModerationApproved(mail?.moderation_status);

// Mail computed properties
const filteredMails = computed(() => {
  let result = mails.value;

  if (mailFolder.value === 'inbox') {
    result = result.filter(m => m.receiver_id === userInfo.value.id && isInboxVisibleMail(m));
  } else {
    result = result.filter(m => m.sender_id === userInfo.value.id);
  }

  if (mailTimeFilter.value !== 'all') {
    const now = new Date();
    let cutoffDate;

    switch (mailTimeFilter.value) {
      case '3days':
        cutoffDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7days':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '1month':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    result = result.filter(m => new Date(m.created_at) >= cutoffDate);
  }

  if (showUnreadOnly.value && mailFolder.value === 'inbox') {
    result = result.filter(m => m.status === 'unread');
  }

  return result;
});

const unreadMailCount = computed(() => {
  return mails.value
    .filter(m => m.receiver_id === userInfo.value.id && isInboxVisibleMail(m) && m.status === 'unread')
    .length;
});

const getEmptyMailMessage = computed(() => {
  const folderName = mailFolder.value === 'inbox' ? '收件箱' : '已发送';
  if (mailTimeFilter.value === 'all') {
    return `你的${folderName}没有任何信件。`;
  }
  const timeDesc = {
    '3days': '3天内',
    '7days': '7天内',
    '1month': '1个月内'
  };
  return `${timeDesc[mailTimeFilter.value]}没有信件。`;
});

const normalizePartnerName = (username) => String(username || '').trim();

const filteredPartners = computed(() => {
  const search = String(composeData.receiver_search || '').toLowerCase();
  const currentUsername = String(userInfo.value?.username || '').toLowerCase();

  return allPartners.value
    .filter((p) => {
      const username = normalizePartnerName(p?.username);
      if (!username) return false;
      const lowerName = username.toLowerCase();
      return lowerName.includes(search) && lowerName !== currentUsername;
    })
    .slice(0, 10);
});

const isComposeValid = computed(() => {
  return selectedRecipients.value.length > 0
    && composeData.content.trim()
    && composeData.content.length <= MAIL_CONTENT_MAX_LENGTH;
});
const composeContentLength = computed(() => composeData.content.length);
const composeFooterHint = computed(() => {
  if (selectedRecipients.value.length === 0) return '请选择至少一位收件人';
  if (!composeData.content.trim()) return '填写正文后即可发送';
  return '发送前会进行内容审查';
});

const refreshMessageCenter = async ({
  includeNotifications = true,
  includeMails = true,
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
            messages.value = data || [];
            hasMoreNotifications.value = Boolean(hasMore);
            notificationsCursor.value = nextCursor || null;
          })()
          : Promise.resolve(),
        includeMails ? fetchMails({ silent: true }) : Promise.resolve()
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

const scheduleRealtimeRefresh = ({ notifications = true, mails = true, forceCache = false } = {}) => {
  pendingRealtimeRefresh.notifications = pendingRealtimeRefresh.notifications || notifications;
  pendingRealtimeRefresh.mails = pendingRealtimeRefresh.mails || mails;
  pendingRealtimeRefresh.forceCache = pendingRealtimeRefresh.forceCache || forceCache;

  if (realtimeRefreshTimer) return;

  realtimeRefreshTimer = window.setTimeout(async () => {
    const refreshOptions = {
      includeNotifications: pendingRealtimeRefresh.notifications,
      includeMails: pendingRealtimeRefresh.mails,
      forceCache: pendingRealtimeRefresh.forceCache
    };
    pendingRealtimeRefresh = {
      notifications: false,
      mails: false,
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
    mails: false,
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
    rowsRef.value = mergeById([newRow], rowsRef.value);
    return true;
  }

  rowsRef.value = rowsRef.value.map((row) =>
    row.id === rowId ? { ...row, ...newRow } : row
  );
  return true;
};

const refreshUnreadCountAfterRealtime = async () => {
  invalidateMessageCenterCaches();
  await refreshUnreadCount({ force: true });
};

const startRealtimeChannels = async (userId) => {
  const safeUserId = String(userId || '').trim();
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
        const patched = applyRealtimeRow(messages, payload);
        void refreshUnreadCountAfterRealtime();
        if (!patched || String(payload?.eventType || '').toUpperCase() === 'INSERT') {
          scheduleRealtimeRefresh({
            notifications: true,
            mails: false,
            forceCache: true
          });
        }
      }
    )
    .subscribe();

  const inboxMessagesChannel = supabase
    .channel(`messages-center-inbox:${safeUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${safeUserId}`
      },
      (payload) => {
        applyRealtimeRow(mails, payload);
        void refreshUnreadCountAfterRealtime();
      }
    )
    .subscribe();

  const sentMessagesChannel = supabase
    .channel(`messages-center-sent:${safeUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${safeUserId}`
      },
      (payload) => {
        applyRealtimeRow(mails, payload);
        void refreshUnreadCountAfterRealtime();
      }
    )
    .subscribe();

  messageCenterRealtimeChannels = [notificationsChannel, inboxMessagesChannel, sentMessagesChannel];
};

const shouldShowActions = computed(() => {
  if (!selectedMessage.value) return false;
  const msg = selectedMessage.value;
  const hasPostId = msg.post?.id || msg.post_id;
  return ((msg.type === 'comment' || msg.type === 'like') && hasPostId)
    || canRetryModerationNotification(msg);
});

// 监听弹窗状态，控制 body 滚动
watch(selectedMessage, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

watch(selectedMail, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

watch(showComposeModal, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

const applyMailQueryRecipient = () => {
  const normalizeQueryPartnerName = (username) => String(username || '').trim();
  const targetUsername = normalizeQueryPartnerName(route.query.to);
  if (!targetUsername || route.query.tab !== 'mail') return;

  currentTab.value = 'mail';
  const targetPartner = allPartners.value.find((partner) =>
    normalizeQueryPartnerName(partner?.username).toLowerCase() === targetUsername.toLowerCase()
  );

  if (!targetPartner) {
    composeData.receiver_search = targetUsername;
    return;
  }

  selectedRecipients.value = [targetPartner];
  composeData.receiver_search = '';
  composeData.subject = '';
  composeData.content = '';
  composeData.isReply = false;
  showComposeModal.value = true;
};

// 监听路由参数，自动切换到邮件标签
watch(() => route.query.tab, (newTab) => {
  if (newTab === 'mail') {
    currentTab.value = 'mail';
    applyMailQueryRecipient();
  }
}, { immediate: true });

watch(() => route.query.to, () => {
  applyMailQueryRecipient();
});

const setNotificationTab = (tabId) => {
  currentTab.value = NOTIFICATION_TABS.some((tab) => tab.id === tabId) ? tabId : 'all';
};

const switchInboxSection = (section) => {
  if (section === 'mail') {
    currentTab.value = 'mail';
    return;
  }
  if (currentTab.value === 'mail') {
    currentTab.value = 'all';
  }
};

onMounted(() => {
  loadRetriedNotificationIds();
});

// 处理 auth 初始化竞态：用户ID晚到时自动补拉一次
watch(() => userInfo.value?.id, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await Promise.allSettled([loadNotifications(), fetchMails()]);
  await startRealtimeChannels(newId);
});

// 组件卸载时恢复 body 滚动并取消订阅
onUnmounted(() => {
  document.body.style.overflow = '';
  if (feedbackToastTimer) {
    clearTimeout(feedbackToastTimer);
    feedbackToastTimer = null;
  }
  window.removeEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  void removeRealtimeChannels();
});

const handleUnreadRefreshEvent = async (event) => {
  logger.debug('messages', '收到未读刷新事件，刷新消息列表');
  if (!currentUserId.value) return;

  invalidateMessageCenterCaches();
  scheduleRealtimeRefresh({
    notifications: true,
    mails: true,
    forceCache: event?.detail?.source === 'realtime'
  });
};

// 初始化消息数据
onMounted(async () => {
  await waitForAuthReady();

  await Promise.allSettled([
    loadNotifications(),
    fetchMails(),
    fetchPartners()
  ]);

  // 监听 boh_unread_refresh 事件来刷新消息列表
  window.addEventListener('boh_unread_refresh', handleUnreadRefreshEvent);
  await startRealtimeChannels(currentUserId.value || userInfo.value?.id);
});

// 加载通知
const loadNotifications = async () => {
  loading.value = true;
  notificationsLoadError.value = '';
  try {
    const user = await withTaskTimeout(getCurrentUser());
    if (user) {
      currentUserId.value = user.id;
      const { data, hasMore, nextCursor } = await withTaskTimeout(
        getUserNotifications(user.id, { limit: MESSAGE_PAGE_SIZE })
      );
      messages.value = data || [];
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
        messages.value = data || [];
        hasMoreNotifications.value = Boolean(hasMore);
        notificationsCursor.value = nextCursor || null;
      }
    }
  } catch (error) {
    logger.error('messages', '加载通知失败', error);
    notificationsLoadError.value = error?.message || '网络异常，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const loadMoreNotifications = async () => {
  if (!currentUserId.value || loadingMoreNotifications.value || !hasMoreNotifications.value) return;
  loadingMoreNotifications.value = true;
  try {
    const { data, hasMore, nextCursor } = await withTaskTimeout(
      getUserNotifications(currentUserId.value, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: notificationsCursor.value
      })
    );
    messages.value = mergeById(messages.value, data || []);
    hasMoreNotifications.value = Boolean(hasMore);
    notificationsCursor.value = nextCursor || null;
  } catch (error) {
    logger.error('messages', '加载更多通知失败', error);
    showFeedback(error?.message || '加载更多失败，请稍后重试', 'error');
  } finally {
    loadingMoreNotifications.value = false;
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
    const result = await markNotificationAsRead(msg.id);
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

const getCurrentTabUnreadMessages = () => {
  if (currentTab.value === 'all') {
    return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread');
  }
  if (currentTab.value === 'system') {
    return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread' && isSystemNotificationType(msg.type));
  }
  return visibleNotificationMessages.value.filter((msg) => msg.status === 'unread' && msg.type === currentTab.value);
};

const markCurrentNotificationTabAsRead = async () => {
  const targetMessages = getCurrentTabUnreadMessages();
  if (!targetMessages.length) return;

  const previousRows = targetMessages.map((msg) => ({ msg, status: msg.status }));
  targetMessages.forEach((msg) => {
    msg.status = 'read';
  });

  try {
    const settled = await Promise.allSettled(targetMessages.map((msg) => markNotificationAsRead(msg.id)));
    const failed = settled.some((item) => item.status === 'rejected' || item.value?.error);
    if (failed) throw new Error('部分通知标记失败');
    await triggerUnreadRefresh();
    showFeedback('当前分类已标记为已读', 'success');
  } catch (error) {
    previousRows.forEach(({ msg, status }) => {
      msg.status = status;
    });
    logger.error('messages', '标记当前分类已读失败', error);
    showFeedback(error?.message || '操作失败，请稍后重试', 'error');
  }
};

// 显示详情并标记已读
const showDetail = async (msg) => {
  selectedMessage.value = msg;

  if (msg.status === 'unread') {
    try {
      const result = await markNotificationAsRead(msg.id);
      if (result?.error) throw result.error;
      msg.status = 'read';
      // 触发未读消息数量更新
      await triggerUnreadRefresh();
    } catch (error) {
      logger.error('messages', '标记已读失败', error);
      showFeedback(error?.message || '标记已读失败，请稍后重试', 'error');
    }
  }
};

const closeDetail = () => {
  selectedMessage.value = null;
  showReplyInput.value = false;
  replyContent.value = '';
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

  retryingNotificationIds.value[notificationId] = true;
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
    retryingNotificationIds.value[notificationId] = false;
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

// Mail functions
const fetchMails = async ({ silent = false, append = false } = {}) => {
  if (!isLoggedIn.value) return;
  if (!silent) {
    loadingMails.value = true;
    mailsLoadError.value = '';
  }
  try {
    const { data, hasMore, nextCursor, error } = await withTaskTimeout(
      getUserMessages(userInfo.value.id, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: append ? mailsCursor.value : null
      })
    );
    if (error) throw error;
    if (append) {
      mails.value = mergeById(mails.value, data || []);
    } else {
      mails.value = data || [];
    }
    hasMoreMails.value = Boolean(hasMore);
    mailsCursor.value = nextCursor || null;
  } catch (err) {
    logger.error('messages', '加载信件失败', err);
    if (!silent) {
      mailsLoadError.value = err?.message || '网络异常，请稍后重试';
    }
  } finally {
    if (!silent) {
      loadingMails.value = false;
    }
  }
};

const loadMoreMails = async () => {
  if (!isLoggedIn.value || loadingMoreMails.value || !hasMoreMails.value) return;
  loadingMoreMails.value = true;
  try {
    await fetchMails({ silent: true, append: true });
  } catch (err) {
    logger.error('messages', '加载更多信件失败', err);
    showFeedback(err?.message || '加载更多失败，请稍后重试', 'error');
  } finally {
    loadingMoreMails.value = false;
  }
};

const fetchPartners = async () => {
  loadingPartners.value = true;
  try {
    const { data, error } = await withTaskTimeout(
      supabase
        .from('profiles')
        .select('id, username, role')
        .order('username')
    );
    if (!error) {
      allPartners.value = (data || []).filter((partner) => normalizePartnerName(partner?.username));
      applyMailQueryRecipient();
    }
  } catch (err) {
    logger.error('messages', '获取伙伴列表失败', err);
  } finally {
    loadingPartners.value = false;
  }
};

const selectMail = async (mail) => {
  selectedMail.value = mail;
  if (mailFolder.value === 'inbox' && mail.status === 'unread') {
    const previousStatus = mail.status;
    mail.status = 'read';
    try {
      const { error } = await markMessageAsRead(mail.id);
      if (error) throw error;
      await triggerUnreadRefresh();
    } catch (err) {
      mail.status = previousStatus;
      logger.error('messages', '更新已读状态失败', err);
      showFeedback(err?.message || '标记信件已读失败', 'error');
    }
  }
};

const markVisibleMailsAsRead = async () => {
  const targetMails = filteredMails.value.filter((mail) =>
    mailFolder.value === 'inbox' && mail.status === 'unread'
  );
  if (!targetMails.length) return;

  const previousRows = targetMails.map((mail) => ({ mail, status: mail.status }));
  targetMails.forEach((mail) => {
    mail.status = 'read';
  });

  try {
    const result = await markMessagesAsRead(targetMails.map((mail) => mail.id));
    if (result?.error) throw result.error;
    await triggerUnreadRefresh();
    showFeedback('当前收件已标记为已读', 'success');
  } catch (error) {
    previousRows.forEach(({ mail, status }) => {
      mail.status = status;
    });
    logger.error('messages', '批量标记信件已读失败', error);
    showFeedback(error?.message || '操作失败，请稍后重试', 'error');
  }
};

const closeMailDetail = () => {
  selectedMail.value = null;
};

const openComposeModal = () => {
  selectedRecipients.value = [];
  composeData.receiver_search = '';
  composeData.subject = '';
  composeData.content = '';
  composeData.isReply = false;
  showComposeModal.value = true;
};

const closeComposeModal = () => {
  showComposeModal.value = false;
  showRecipientDropdown.value = false;
};

const handleComposeModalClick = (event) => {
  if (event?.target?.closest?.('.recipient-field')) {
    return;
  }
  showRecipientDropdown.value = false;
};

const toggleRecipient = (partner) => {
  const index = selectedRecipients.value.findIndex(r => r.id === partner.id);
  if (index === -1) {
    selectedRecipients.value.push(partner);
  } else {
    selectedRecipients.value.splice(index, 1);
  }
  composeData.receiver_search = '';
};

const removeRecipient = (user) => {
  selectedRecipients.value = selectedRecipients.value.filter(r => r.id !== user.id);
};

const isRecipientSelected = (partner) => {
  return selectedRecipients.value.some(r => r.id === partner.id);
};

const getRoleLabel = (role) => {
  const labels = {
    'admin': '管理员',
    'user': '成员',
    'vip': 'VIP'
  };
  return labels[role] || '成员';
};

const sendMail = async () => {
  if (!isComposeValid.value) return;
  isModerating.value = true;

  try {
    const sendResult = await sendModeratedMessages({
      senderId: userInfo.value.id,
      senderName: userInfo.value.username,
      recipients: selectedRecipients.value,
      subject: composeData.subject,
      content: composeData.content,
      scene: 'mail',
      failClosed: true,
      pushplus: true
    });

    if (sendResult.blocked) {
      showFeedback(`信件发送失败：${sendResult.moderation?.message || '内容审查未通过'}`, 'error');
      return;
    }

    if (!sendResult.ok && sendResult.failedCount > 0) {
      logger.error('messages', '部分信件发送失败', sendResult.results);
      showFeedback(`发送完成，但有 ${sendResult.failedCount} 封信件发送失败`, 'error');
    } else {
      showFeedback(selectedRecipients.value.length > 1 ? `已成功向 ${selectedRecipients.value.length} 位伙伴发送信件` : '信件已发送', 'success');
    }

    showComposeModal.value = false;
    fetchMails();
  } catch (err) {
    logger.error('messages', '发送信件失败', err);
    showFeedback('发送失败，请稍后重试', 'error');
  } finally {
    isModerating.value = false;
  }
};

const handleReplyMail = (mail) => {
  selectedRecipients.value = [{ id: mail.sender_id, username: mail.sender_name }];
  composeData.receiver_search = '';
  composeData.subject = mail.subject?.startsWith('回复:') ? mail.subject : `回复: ${mail.subject}`;
  composeData.content = '';
  composeData.isReply = true;
  selectedMail.value = null;
  showComposeModal.value = true;
};

const handleDeleteMail = async (mail) => {
  if (!confirm('确定要删除这封信件吗？')) return;
  try {
    const { error } = await deleteMessage(mail.id);
    if (error) throw error;
    mails.value = mails.value.filter(m => m.id !== mail.id);
    selectedMail.value = null;
    await triggerUnreadRefresh();
    showFeedback('信件已删除', 'success');
  } catch (err) {
    logger.error('messages', '删除信件失败', err);
    showFeedback('删除失败，请稍后重试', 'error');
  }
};

const loadMoreNotificationLabel = computed(() => {
  if (loadingMoreNotifications.value) return '加载中...';
  return hasMoreNotifications.value ? '加载更多通知' : '没有更多通知';
});

const loadMoreMailLabel = computed(() => {
  if (loadingMoreMails.value) return '加载中...';
  return hasMoreMails.value ? '加载更多信件' : '没有更多信件';
});
</script>

<style scoped src="./style.scoped.css"></style>
