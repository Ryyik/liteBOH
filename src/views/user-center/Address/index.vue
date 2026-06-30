<template>
  <div class="address-page" :class="{ 'admin-layout': isAdmin, 'sidebar-collapsed': !isAdminSidebarOpen }">

    <!-- Global Notice -->
    <Transition name="glass-fade">
      <div v-if="notice.visible" class="address-notice" :class="notice.type" @click="notice.visible = false">
        {{ notice.text }}
      </div>
    </Transition>

    <!-- Admin Sidebar (Users List) -->
    <aside v-if="isAdmin" class="admin-sidebar glass-container-light">
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <h3 v-if="isAdminSidebarOpen">社区成员</h3>
          <Users v-else class="collapsed-logo" :size="24" :stroke-width="1.8" aria-hidden="true" />
          <button class="collapse-toggle" @click="toggleAdminSidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path v-if="isAdminSidebarOpen" d="M15 18l-6-6 6-6" />
              <path v-else d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        <div v-if="isAdminSidebarOpen" class="search-box fade-in">
          <input v-model="adminSearchUser" @input="handleSearchUsers" placeholder="搜索用户..." class="sidebar-search" />
        </div>
      </div>

      <div v-if="isAdminSidebarOpen" class="user-list custom-scrollbar fade-in">
        <div v-if="isLoadingUsers" class="admin-user-skeleton-list" aria-hidden="true">
          <div v-for="item in 7" :key="`admin-user-loading-${item}`" class="user-item skeleton">
            <div class="address-skeleton-block user-avatar-skeleton"></div>
            <div class="user-info">
              <div class="address-skeleton-block user-name-skeleton"></div>
              <div class="address-skeleton-block user-role-skeleton"></div>
            </div>
          </div>
        </div>
        <div v-else-if="partnersLoadError" class="sidebar-loading">
          <span>{{ partnersLoadError }}</span>
        </div>
        <template v-else>
          <div v-for="p in allPartners" :key="p.id" class="user-item" :class="{ active: targetProfile?.id === p.id }"
            @click="selectUserByAdmin(p)">
            <div class="user-avatar">{{ p.username?.charAt(0)?.toUpperCase?.() || 'U' }}</div>
            <div class="user-info">
              <span class="user-name">{{ p.username }}</span>
              <span class="user-role">{{ getRoleLabel(p.role) }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Sidebar Pagination -->
      <div v-if="isAdminSidebarOpen && userTotalPages > 1" class="sidebar-pagination fade-in">
        <button class="pag-btn" :disabled="userCurrentPage === 1" @click="handleUserPageChange(userCurrentPage - 1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span class="pag-info">{{ userCurrentPage }} / {{ userTotalPages }}</span>
        <button class="pag-btn" :disabled="userCurrentPage === userTotalPages"
          @click="handleUserPageChange(userCurrentPage + 1)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="main-content-wrap">
      <UserCenterPageHeader title="礼物" @back="goBack">
        <template #actions>
          <button v-if="isLoggedIn" class="history-toggle-btn" @click="toggleHistoryView">
            {{ showHistory ? '查看当前' : '历史礼物' }}
          </button>
        </template>
      </UserCenterPageHeader>

      <div v-if="loading" class="gift-page-skeleton" aria-hidden="true">
        <section class="apple-order-status">
          <div class="order-main-row">
            <div class="gift-visual">
              <div class="address-skeleton-block gift-image-box"></div>
            </div>
            <div class="order-status-info">
              <div class="address-skeleton-block gift-skeleton-product"></div>
              <div class="address-skeleton-block gift-skeleton-title"></div>
              <div class="address-skeleton-block gift-skeleton-progress"></div>
              <div class="gift-skeleton-steps">
                <div v-for="item in 4" :key="`gift-step-loading-${item}`"
                  class="address-skeleton-block gift-skeleton-step"></div>
              </div>
              <div class="address-skeleton-block gift-skeleton-desc"></div>
            </div>
          </div>
        </section>
        <section class="apple-details-grid">
          <div v-for="item in 3" :key="`gift-detail-loading-${item}`" class="detail-column">
            <div class="address-skeleton-block detail-label-skeleton"></div>
            <div class="address-skeleton-block detail-primary-skeleton"></div>
            <div class="address-skeleton-block detail-secondary-skeleton"></div>
          </div>
        </section>
        <section class="address-section-bottom glass-container-light">
          <div class="address-skeleton-block address-section-title-skeleton"></div>
          <div class="address-summary">
            <div class="summary-grid">
              <div v-for="item in 3" :key="`address-summary-loading-${item}`" class="summary-item"
                :class="{ full: item === 3 }">
                <div class="address-skeleton-block summary-label-skeleton"></div>
                <div class="address-skeleton-block summary-value-skeleton"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-else-if="mainLoadError" class="loading-state">
        <p>{{ mainLoadError }}</p>
        <button class="history-toggle-btn" @click="fetchData()">重试加载</button>
      </div>

      <template v-else>
        <!-- History View -->
        <div v-if="showHistory" class="history-container fade-in">
          <div class="section-title">历史礼物记录</div>
          <div v-if="historyLoading" class="history-list history-skeleton-list" aria-hidden="true">
            <div v-for="item in 4" :key="`history-gift-loading-${item}`" class="history-card skeleton">
              <div class="h-gift-info">
                <div class="address-skeleton-block history-no-skeleton"></div>
                <div class="address-skeleton-block history-name-skeleton"></div>
              </div>
              <div class="h-gift-meta">
                <div class="address-skeleton-block history-date-skeleton"></div>
                <div class="address-skeleton-block history-status-skeleton"></div>
              </div>
            </div>
          </div>
          <div v-else-if="historyLoadError" class="history-empty-card is-error">
            <TriangleAlert class="history-empty-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
            <h4>历史记录加载失败</h4>
            <p>{{ historyLoadError }}</p>
            <button class="history-toggle-btn" @click="loadHistoryGifts()">重试加载</button>
          </div>
          <div v-else-if="historyGifts.length === 0" class="history-empty-card">
            <Gift class="history-empty-icon" :size="34" :stroke-width="1.7" aria-hidden="true" />
            <h4>暂无历史礼物</h4>
            <p>当礼物完成后，会自动归档到这里。</p>
            <button class="history-empty-action" @click="showHistory = false">查看当前礼物</button>
          </div>
          <div v-else class="history-list">
            <div v-for="gift in historyGifts" :key="gift.id" class="history-card glass-container-light"
              @click="viewGiftDetail(gift)">
              <div class="h-gift-info">
                <span class="h-gift-no">#{{ gift.gift_no }}</span>
                <span class="h-gift-name">{{ gift.gift_content }}</span>
              </div>
              <div class="h-gift-meta">
                <span class="h-gift-date">{{ formatDateShort(gift.created_at) }}</span>
                <span class="h-gift-status" :class="gift.gift_status">{{ getStatusLabel(gift.gift_status) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Current Gift View (Apple Style) -->
        <div v-else class="current-gift-container fade-in">
          <div v-if="!currentGift && !isAdmin" class="no-gift-state">
            <Gift class="no-gift-icon" :size="72" :stroke-width="1.6" aria-hidden="true" />
            <h3>开启你的礼物之旅</h3>
            <p>目前还没有待收到的礼物，积极参与社区活动来赢取吧！</p>
          </div>

          <template v-else>
            <!-- 1. Apple Style Order Status Section -->
            <section class="apple-order-status glass-container-light"
              :class="{ 'no-gift-admin': !currentGift && isAdmin }">
              <div v-if="currentGift" class="order-main-row">
                <!-- Left: Gift Image Placeholder -->
                <div class="gift-visual">
                  <div class="gift-image-box">
                    <img v-if="currentGift?.gift_image" :src="currentGift.gift_image" alt="Gift"  loading="lazy" />
                    <Gift v-else class="gift-placeholder-icon" :size="88" :stroke-width="1.5" aria-hidden="true" />
                  </div>
                </div>

                <!-- Right: Status Info -->
                <div class="order-status-info">
                  <div class="product-name">{{ currentGift?.gift_content || '待命中的礼物' }}</div>
                  <h1 class="status-title">{{ getAppleStatusTitle }}</h1>

                  <!-- Apple Style Thick Progress Bar -->
                  <div class="apple-progress-wrap">
                    <div class="apple-progress-bar">
                      <div class="apple-progress-fill" :style="{ width: appleProgressWidth + '%' }"></div>
                    </div>
                    <div class="apple-progress-steps">
                      <span :class="{ active: currentStatusIndex >= 0 }">已收到请求</span>
                      <span :class="{ active: currentStatusIndex >= 1 }">正在处理</span>
                      <span :class="{ active: currentStatusIndex >= 2 }">已寄出/可取</span>
                      <span :class="{ active: currentStatusIndex >= 3 }">已送达</span>
                    </div>
                  </div>

                  <p class="status-desc">{{ getAppleStatusDesc }}</p>
                </div>
              </div>

              <div v-else-if="isAdmin" class="no-gift-admin-hint">
                <Gift class="no-gift-icon" :size="64" :stroke-width="1.6" aria-hidden="true" />
                <h3>该用户目前没有礼物</h3>
                <p>您可以为该用户发布一个新的礼物计划。</p>
              </div>

              <!-- Admin Controls (Overlay style) -->
              <div v-if="isAdmin && targetProfile" class="admin-quick-actions">
                <div v-if="currentGift" class="admin-action-group">
                  <label>状态变更</label>
                  <div class="status-chips">
                    <button v-for="s in ['preparing', 'processing', 'shipped', 'completed']" :key="s"
                      :class="{ active: currentGift?.gift_status === s }" @click="updateGiftStatus(s)">
                      {{ getStatusLabel(s) }}
                    </button>
                  </div>
                </div>
                <div class="admin-action-group">
                  <label>礼物操作</label>
                  <div class="action-buttons">
                    <button v-if="currentGift" class="edit-gift-btn-small" @click="openEditGiftModal">编辑详情</button>
                    <button class="add-gift-btn" @click="openNewGiftModal">新建礼物</button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. Apple Style Detailed Info Grid -->
            <section class="apple-details-grid">
              <!-- Item 1: Gift Details -->
              <div class="detail-column">
                <h4 class="detail-label">礼物详情</h4>
                <div class="detail-value-group">
                  <p class="detail-primary">{{ currentGift?.gift_content }}</p>
                  <p class="detail-secondary">编号: {{ currentGift?.gift_no || 'BOH-NEW' }}</p>
                  <p class="detail-price">RMB {{ currentGift?.gift_price || '0' }}</p>
                </div>
              </div>

              <!-- Item 2: Delivery Info -->
              <div class="detail-column">
                <h4 class="detail-label">送达方式</h4>
                <div class="detail-value-group">
                  <p class="detail-primary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    快递寄送
                  </p>
                  <p class="detail-secondary address-text">{{ targetProfile?.shipping_address || '未填写收货地址' }}</p>
                </div>
              </div>

              <!-- Item 3: Recipient Info -->
              <div class="detail-column">
                <h4 class="detail-label">收货联系人</h4>
                <div class="detail-value-group">
                  <p class="detail-primary">{{ targetProfile?.shipping_recipient || '匿名伙伴' }}</p>
                  <p class="detail-secondary">{{ targetProfile?.shipping_phone || '电话未留' }}</p>
                </div>
              </div>
            </section>
          </template>
        </div>

        <!-- Address Management (Separate Section) -->
        <section class="address-section-bottom glass-container-light">
          <div class="section-header">
            <div class="section-title-group">
              <h3>收货地址管理</h3>
              <div v-if="isAdmin && targetProfile" class="target-user-badge">
                <span class="user-name-tag">当前操作用户: {{ targetProfile.username }}</span>
              </div>
            </div>
            <div v-if="isAddressEditable && !isEditing" class="section-actions">
              <button class="edit-link" @click="startEdit" :disabled="saving || deletingAddress">
                {{ hasAddressData ? '编辑信息' : '上传地址' }}
              </button>
              <button v-if="hasAddressData" class="delete-link" @click="deleteAddress"
                :disabled="saving || deletingAddress">
                {{ deletingAddress ? '删除中...' : '删除地址' }}
              </button>
            </div>
          </div>

          <div v-if="!isEditing" class="address-summary">
            <div v-if="!targetProfile?.shipping_address" class="empty-hint">
              <MapPin class="empty-icon" :size="42" :stroke-width="1.6" aria-hidden="true" />
              <p>尚未设置收货地址，这可能会影响礼物的送达。</p>
            </div>
            <div v-else class="summary-grid">
              <div class="summary-item">
                <span>收件人</span>
                <p>{{ targetProfile.shipping_recipient || '未填写' }}</p>
              </div>
              <div class="summary-item">
                <span>联系电话</span>
                <p>{{ targetProfile.shipping_phone || '未填写' }}</p>
              </div>
              <div class="summary-item full">
                <span>收货地址</span>
                <p class="address-text-full">{{ targetProfile.shipping_address }}</p>
              </div>
            </div>
          </div>

          <div v-else class="address-editor-wrap fade-in">
            <!-- AI Area remains similar -->
            <div class="ai-paste-zone">
              <div class="ai-badge">AI 智能辅助</div>
              <textarea v-model="pastedText" placeholder="在此粘贴整段地址信息，AI 将为您自动识别并填充表单..."></textarea>
              <p class="ai-engine-tip">识别引擎：GLM-AI</p>
              <button @click="handleAIExtract" :disabled="isProcessingAI">
                <span v-if="isProcessingAI" class="mini-spinner white"></span>
                <span v-else>开始智能识别</span>
              </button>
            </div>
            <div class="form-grid">
              <div class="input-group">
                <label>收件人姓名</label>
                <input v-model="form.recipient" placeholder="请输入收件人" />
              </div>
              <div class="input-group">
                <label>联系电话</label>
                <input v-model="form.phone" placeholder="请输入电话" />
              </div>
              <div class="input-group full-row">
                <label>详细收货地址</label>
                <textarea v-model="form.address" placeholder="请输入详细地址" class="address-textarea"></textarea>
              </div>
            </div>
            <div class="form-actions">
              <button class="cancel-btn" @click="cancelEdit">取消</button>
              <button class="save-btn" @click="saveAddress" :disabled="saving">
                {{ saving ? '正在保存...' : '保存更改' }}
              </button>
            </div>
          </div>
        </section>
      </template>
    </div>

    <!-- New Gift Modal (Admin Only) -->
    <Teleport to="body">
      <div v-if="showNewGiftModal" class="modal-overlay" @click.self="showNewGiftModal = false">
        <div class="gift-edit-modal glass-card">
          <h3>发布新礼物</h3>
          <div class="modal-form">
            <div class="m-field">
              <label>礼物编号</label>
              <input v-model="newGift.gift_no" placeholder="如: BOH-2026-001" />
            </div>
            <div class="m-field">
              <label>价格 (RMB)</label>
              <input type="number" v-model="newGift.gift_price" placeholder="0" />
            </div>
            <div class="m-field full">
              <label>礼物内容</label>
              <input v-model="newGift.gift_content" placeholder="输入礼物名称..." />
            </div>
            <div class="m-field full">
              <label>图片链接 (可选)</label>
              <input v-model="newGift.gift_image" placeholder="https://..." />
            </div>
          </div>
          <div class="modal-actions">
            <button @click="showNewGiftModal = false">取消</button>
            <button class="primary" @click="createNewGift">确认发布</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit Gift Modal (Admin Only) -->
    <Teleport to="body">
      <div v-if="showEditGiftModal" class="modal-overlay" @click.self="showEditGiftModal = false">
        <div class="gift-edit-modal glass-card">
          <h3>编辑礼物详情</h3>
          <div class="modal-form">
            <div class="m-field">
              <label>礼物编号</label>
              <input v-model="editGiftData.gift_no" placeholder="如: BOH-2026-001" />
            </div>
            <div class="m-field">
              <label>价格 (RMB)</label>
              <input type="number" v-model="editGiftData.gift_price" placeholder="0" />
            </div>
            <div class="m-field full">
              <label>礼物内容</label>
              <input v-model="editGiftData.gift_content" placeholder="输入礼物名称..." />
            </div>
            <div class="m-field full">
              <label>图片链接 (可选)</label>
              <input v-model="editGiftData.gift_image" placeholder="https://..." />
            </div>
          </div>
          <div class="modal-actions">
            <button @click="showEditGiftModal = false">取消</button>
            <button class="primary" @click="updateGiftInfo">确认更新</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI Confirm Modal -->
    <Teleport to="body">
      <div v-if="showAiConfirm" class="modal-overlay">
        <div class="ai-confirm-modal glass-card">
          <h3>确认识别结果</h3>
          <div class="confirm-content">
            <p><strong>收件人:</strong> {{ aiResult.recipient }}</p>
            <p><strong>电话:</strong> {{ aiResult.phone }}</p>
            <p><strong>地址:</strong> {{ aiResult.address }}</p>
          </div>
          <div class="modal-actions">
            <button @click="showAiConfirm = false">重试</button>
            <button class="primary" @click="applyAiResult">确认填充</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, reactive } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Gift, MapPin, TriangleAlert, Users } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { supabase } from "@/utils/supabase-client.js";
import { logger } from '@/utils/logger.js';
import { createNotification } from "@/utils/api/notifications-api.js";
import { availableModels } from "@/views/BOHAI/composables/useChatEngine.js";
import { callVaultSiliconChat } from "@/utils/api/api-key-runtime-api.js";
import { getExpiredActiveGiftIds, markGiftsAsHistory, isGiftExpiredCompleted } from "@/utils/gift-archive.js";
import { resolveSettingsBackLocation } from "@/utils/user-space-navigation.js";
import UserCenterPageHeader from "@/components/UserCenterPageHeader.vue";
import { useConfirmDialog } from "@/composables/useConfirmDialog.js";

const dialog = useConfirmDialog();

let noticeTimer = null;
const notice = reactive({ visible: false, text: '', type: 'info' });
const showNotice = (text, type = 'info') => {
  notice.text = String(text || '').trim();
  notice.type = type;
  notice.visible = Boolean(notice.text);
  if (noticeTimer) clearTimeout(noticeTimer);
  if (notice.visible) {
    noticeTimer = setTimeout(() => { notice.visible = false; }, 3500);
  }
};

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { userInfo, isLoggedIn, isAdmin } = storeToRefs(authStore);

// --- State ---
const loading = ref(true);
const mainLoadError = ref("");
const saving = ref(false);
const deletingAddress = ref(false);
const isEditing = ref(false);
const targetProfile = ref(null);
const adminSearchUser = ref("");
const allPartners = ref([]);
const isOwnProfile = ref(true);
const showHistory = ref(false);
const historyGifts = ref([]);
const historyLoading = ref(false);
const historyLoadError = ref("");
const historyLoadedUserId = ref("");
const currentGift = ref(null);
const showNewGiftModal = ref(false);
const showEditGiftModal = ref(false);

const isAdminSidebarOpen = ref(true);
const userPageSize = 10;
const userCurrentPage = ref(1);
const userTotalCount = ref(0);
const isLoadingUsers = ref(false);
const partnersLoadError = ref("");
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

const newGift = reactive({
  gift_no: "",
  gift_content: "",
  gift_price: 0,
  gift_image: ""
});

const editGiftData = reactive({
  id: "",
  gift_no: "",
  gift_content: "",
  gift_price: 0,
  gift_image: ""
});

// Form state
const form = reactive({
  recipient: "",
  phone: "",
  address: ""
});

// AI state
const pastedText = ref("");
const isProcessingAI = ref(false);
const showAiConfirm = ref(false);
const aiResult = reactive({
  recipient: "",
  phone: "",
  address: ""
});

// --- Computed ---
const isAddressEditable = computed(() => Boolean(isOwnProfile.value || isAdmin.value));
const GLM_ADDRESS_MODEL_ID = 'THUDM/GLM-4-9B-0414';
const hasAddressData = computed(() => Boolean(
  String(targetProfile.value?.shipping_address || "").trim()
  || String(targetProfile.value?.shipping_recipient || "").trim()
  || String(targetProfile.value?.shipping_phone || "").trim()
));

const currentStatusIndex = computed(() => {
  const status = currentGift.value?.gift_status || 'preparing';
  const map = { 'preparing': 0, 'processing': 1, 'shipped': 2, 'completed': 3 };
  return map[status] ?? 0;
});

const appleProgressWidth = computed(() => {
  return (currentStatusIndex.value / 3) * 100;
});

const getAppleStatusTitle = computed(() => {
  if (!currentGift.value) return "待命中的礼物";
  const status = currentGift.value.gift_status;
  const dateSource = status === 'completed'
    ? (currentGift.value.completed_at || currentGift.value.updated_at || currentGift.value.created_at)
    : (currentGift.value.updated_at || currentGift.value.created_at);
  const date = formatDateShort(dateSource);

  if (status === 'preparing') return `备货中 ${date}`;
  if (status === 'processing') return `正在处理 ${date}`;
  if (status === 'shipped') return `已发货 ${date}`;
  if (status === 'completed') return `已送达 ${date}`;
  return "订单状态";
});

const getAppleStatusDesc = computed(() => {
  if (!currentGift.value) return "方块之家正在为你构思一份特别的礼物。";
  const status = currentGift.value.gift_status;
  if (status === 'preparing') return "我们已收到你的礼物请求，正在准备精美礼品。";
  if (status === 'processing') return "礼物正在快马加鞭包装中，即将离开方块之家。";
  if (status === 'shipped') return "你的礼物已在路上，请留意快递信息或取货通知。";
  if (status === 'completed') return "礼物已成功送达，希望它能为你带来快乐。";
  return "";
});

// --- Methods ---

const getRoleLabel = (role) => {
  const map = { 'admin': '管理员', 'user': '成员', 'vip': 'VIP' };
  return map[role] || '成员';
};

const getStatusLabel = (s) => {
  const map = {
    'preparing': '备货中',
    'processing': '正在处理',
    'shipped': '已发货',
    'completed': '已完成'
  };
  return map[s] || s;
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月 ${date.getDate()}日`;
};

const selectUserByAdmin = (user) => {
  isEditing.value = false;
  pastedText.value = "";
  fetchData(user.id);
};

const userTotalPages = computed(() => Math.ceil(userTotalCount.value / userPageSize));

const fetchAllPartners = async () => {
  if (!isAdmin.value) return;
  isLoadingUsers.value = true;
  partnersLoadError.value = "";
  try {
    const search = adminSearchUser.value.trim();
    let query = supabase
      .from('profiles')
      .select('id, username, role', { count: 'exact' })
      .order('username');

    if (search) {
      query = query.ilike('username', `%${search}%`);
    }

    const start = (userCurrentPage.value - 1) * userPageSize;
    const { data, error, count } = await withTaskTimeout(
      query.range(start, start + userPageSize - 1)
    );

    if (!error) {
      allPartners.value = data || [];
      userTotalCount.value = count || 0;
    } else {
      partnersLoadError.value = error.message || "加载成员失败";
    }
  } catch (err) {
    logger.error('address', err);
    partnersLoadError.value = err?.message || "加载成员失败";
  } finally {
    isLoadingUsers.value = false;
  }
};

const handleUserPageChange = (page) => {
  if (page < 1 || page > userTotalPages.value) return;
  userCurrentPage.value = page;
  fetchAllPartners();
};

let searchTimeout = null;
const handleSearchUsers = () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    userCurrentPage.value = 1;
    fetchAllPartners();
  }, 500);
};

const toggleAdminSidebar = () => {
  isAdminSidebarOpen.value = !isAdminSidebarOpen.value;
};

const resetHistoryState = () => {
  historyGifts.value = [];
  historyLoading.value = false;
  historyLoadError.value = "";
  historyLoadedUserId.value = "";
};

const goBack = () => {
  const from = route.query.from;
  if (['userspace', 'userspace-settings', 'userspace-data', 'cloud-settings'].includes(String(from || ''))) {
    router.push(resolveSettingsBackLocation(route));
    return;
  }
  const safeUsername = String(userInfo.value.username || localStorage.getItem('username') || '').trim();
  if (safeUsername) {
    router.push(`/profile/${encodeURIComponent(safeUsername)}?from=community`);
  } else {
    router.push('/');
  }
};

const loadHistoryGifts = async (uid = targetProfile.value?.id || userInfo.value?.id) => {
  if (!uid) return;
  if (historyLoading.value) return;
  if (historyLoadedUserId.value === uid) return;

  historyLoading.value = true;
  historyLoadError.value = "";

  try {
    const { data, error } = await withTaskTimeout(
      supabase
        .from('user_gifts')
        .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    );

    if (error) {
      throw error;
    }

    let normalizedGifts = Array.isArray(data) ? [...data] : [];
    const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);

    if (expiredGiftIds.length > 0) {
      normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);

      // 仅管理员尝试持久化归档，普通用户按前端规则展示为历史礼物。
      if (isAdmin.value) {
        const { error: archiveError } = await supabase
          .from('user_gifts')
          .update({ is_active: false })
          .in('id', expiredGiftIds);
        if (archiveError) {
          logger.warn('address', '自动归档过期礼物失败:', archiveError);
        }
      }
    }

    const currentGiftId = currentGift.value?.id;
    historyGifts.value = normalizedGifts.filter((gift) => gift.id !== currentGiftId);
    historyLoadedUserId.value = uid;
  } catch (err) {
    logger.error('address', '加载历史礼物失败:', err);
    historyGifts.value = [];
    historyLoadError.value = err?.message || "历史礼物加载失败，请稍后重试";
  } finally {
    historyLoading.value = false;
  }
};

const toggleHistoryView = async () => {
  showHistory.value = !showHistory.value;
  if (showHistory.value) {
    await loadHistoryGifts();
  }
};

const fetchData = async (uid = userInfo.value.id) => {
  loading.value = true;
  mainLoadError.value = "";
  resetHistoryState();
  try {
    const [profileRes, activeGiftRes] = await Promise.allSettled([
      withTaskTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .single()
      ),
      withTaskTimeout(
        supabase
          .from('user_gifts')
          .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
          .eq('user_id', uid)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
      )
    ]);

    if (profileRes.status === 'rejected') {
      throw profileRes.reason;
    }
    const { data: pData } = profileRes.value || {};

    if (pData) {
      targetProfile.value = pData;
      isOwnProfile.value = uid === userInfo.value?.id;
    }

    // 当前礼物失败时不阻塞页面，其它区域仍可展示
    const activeGiftData = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.data : null;
    const activeGiftError = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.error : activeGiftRes.reason;

    if (!activeGiftError && activeGiftData && activeGiftData.length > 0) {
      const [activeGift] = activeGiftData;
      let normalizedCurrentGift = activeGift || null;

      // 与旧逻辑保持一致：过期且已完成的当前礼物自动视为历史礼物。
      if (normalizedCurrentGift && isGiftExpiredCompleted(normalizedCurrentGift)) {
        if (isAdmin.value) {
          const { error: archiveError } = await supabase
            .from('user_gifts')
            .update({ is_active: false })
            .eq('id', normalizedCurrentGift.id);
          if (archiveError) {
            logger.warn('address', '自动归档过期礼物失败:', archiveError);
          }
        }
        normalizedCurrentGift = { ...normalizedCurrentGift, is_active: false };
      }

      currentGift.value = normalizedCurrentGift?.is_active ? normalizedCurrentGift : null;
    } else {
      // Fallback to profile fields if user_gifts is empty or doesn't exist
      if (pData && pData.gift_content) {
        currentGift.value = {
          gift_no: pData.gift_no,
          gift_content: pData.gift_content,
          gift_price: pData.gift_price,
          gift_status: pData.gift_status || 'preparing',
          created_at: pData.updated_at || pData.created_at,
          is_active: true
        };
      } else {
        currentGift.value = null;
      }
    }

    if (showHistory.value) {
      void loadHistoryGifts(uid);
    }
  } catch (err) {
    logger.error('address', 'Fetch error:', err);
    mainLoadError.value = err?.message || "加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
};

const startEdit = () => {
  if (!isAddressEditable.value) {
    showNotice("仅可编辑自己的收货地址");
    return;
  }
  form.recipient = targetProfile.value?.shipping_recipient || "";
  form.phone = targetProfile.value?.shipping_phone || "";
  form.address = targetProfile.value?.shipping_address || "";
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
  pastedText.value = "";
};

const saveAddress = async () => {
  if (!isAddressEditable.value) {
    showNotice("无权限保存该用户地址");
    return;
  }

  if (!form.recipient || !form.phone || !form.address) {
    showNotice("请填写完整的信息");
    return;
  }

  saving.value = true;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        shipping_recipient: form.recipient,
        shipping_phone: form.phone,
        shipping_address: form.address
      })
      .eq('id', targetProfile.value.id);

    if (!error) {
      // 更新本地响应式数据
      targetProfile.value = {
        ...targetProfile.value,
        shipping_recipient: form.recipient,
        shipping_phone: form.phone,
        shipping_address: form.address
      };
      isEditing.value = false;
      showNotice("信息保存成功");
    } else {
      showNotice("保存失败: " + error.message);
    }
  } catch (_err) {
    showNotice("系统错误，请稍后再试");
  } finally {
    saving.value = false;
  }
};

const deleteAddress = async () => {
  if (!isAddressEditable.value) {
    showNotice("无权限删除该用户地址");
    return;
  }

  if (!targetProfile.value?.id) {
    showNotice("未找到可操作的用户信息");
    return;
  }

  if (!hasAddressData.value) {
    showNotice("当前暂无可删除的地址信息");
    return;
  }

  const confirmed = await dialog.confirm({
    title: '删除收货地址',
    message: '确认删除当前收货地址吗？删除后将无法用于礼物寄送。',
    tone: 'danger',
    confirmText: '删除'
  });
  if (!confirmed) return;

  deletingAddress.value = true;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        shipping_recipient: null,
        shipping_phone: null,
        shipping_address: null
      })
      .eq('id', targetProfile.value.id);

    if (error) {
      showNotice("删除失败: " + error.message);
      return;
    }

    targetProfile.value = {
      ...targetProfile.value,
      shipping_recipient: "",
      shipping_phone: "",
      shipping_address: ""
    };
    form.recipient = "";
    form.phone = "";
    form.address = "";
    pastedText.value = "";
    isEditing.value = false;
    showNotice("地址已删除");
  } catch (err) {
    logger.error('address', "删除地址失败:", err);
    showNotice("系统错误，请稍后再试");
  } finally {
    deletingAddress.value = false;
  }
};

// --- AI Extraction ---
const getAddressAIModel = () => availableModels.find((m) => m.id === GLM_ADDRESS_MODEL_ID) || null;

const extractJsonPayload = (rawText = "") => {
  const normalizedText = String(rawText || "").trim();
  if (!normalizedText) return null;

  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const directSource = fencedMatch?.[1] || normalizedText;
  const jsonBlockMatch = directSource.match(/\{[\s\S]*\}/);
  const source = (jsonBlockMatch?.[0] || directSource).trim();

  try {
    return JSON.parse(source);
  } catch (_error) {
    return null;
  }
};

const normalizePhone = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const hasLeadingPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return hasLeadingPlus ? `+${digits}` : digits;
};

const handleAIExtract = async () => {
  if (!pastedText.value.trim()) {
    showNotice('请先粘贴地址原文，再进行识别。');
    return;
  }

  const model = getAddressAIModel();
  if (!model?.url) {
    showNotice('GLM 地址识别未配置完成，请联系管理员检查 AI 密钥。');
    return;
  }

  isProcessingAI.value = true;
  const systemPrompt = [
    "你是一个地址信息提取助手。",
    "请从用户粘贴的文本中提取：收件人姓名、联系电话、详细地址。",
    "只允许返回 JSON，不要输出任何额外文本。",
    '返回格式: {"recipient":"...","phone":"...","address":"..."}'
  ].join("");

  try {
    const payload = {
      model: model.id,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: pastedText.value }],
      temperature: 0.1,
      stream: false
    };

    const vaultResult = await callVaultSiliconChat({
      purpose: 'chat',
      apiUrl: model.url,
      payload,
      timeoutMs: 12000
    });
    if (!vaultResult.ok) {
      throw new Error(vaultResult.error?.message || 'AI 识别代理请求失败');
    }
    const data = vaultResult.data || {};

    const rawContent = data?.choices?.[0]?.message?.content;
    const result = extractJsonPayload(rawContent);

    if (!result || typeof result !== 'object') {
      throw new Error('AI 返回内容不可解析');
    }

    aiResult.recipient = String(result.recipient || "").trim();
    aiResult.phone = normalizePhone(result.phone || "");
    aiResult.address = String(result.address || "").trim();

    if (!aiResult.recipient && !aiResult.phone && !aiResult.address) {
      showNotice('AI 未识别到有效地址信息，请补充完整文本后重试。');
      return;
    }

    showAiConfirm.value = true;
  } catch (err) {
    logger.error('address', 'AI 地址识别失败:', err);
    showNotice('AI 识别失败，请手动填写。');
  } finally {
    isProcessingAI.value = false;
  }
};

const applyAiResult = () => {
  if (aiResult.recipient) form.recipient = aiResult.recipient;
  if (aiResult.phone) form.phone = aiResult.phone;
  if (aiResult.address) form.address = aiResult.address;
  showAiConfirm.value = false;
  pastedText.value = "";
};

// --- Admin Actions ---
const updateGiftStatus = async (status) => {
  if (!currentGift.value || !isAdmin.value) return;
  try {
    const nowIso = new Date().toISOString();
    const completedAt = status === 'completed'
      ? (currentGift.value.completed_at || nowIso)
      : null;

    const { error } = await supabase
      .from('user_gifts')
      .update({
        gift_status: status,
        completed_at: completedAt,
        updated_at: nowIso
      })
      .eq('id', currentGift.value.id);
    if (!error) {
      currentGift.value.gift_status = status;
      currentGift.value.completed_at = completedAt;
      currentGift.value.updated_at = nowIso;
      // 同时更新历史记录中的对应项
      const historyItem = historyGifts.value.find(g => g.id === currentGift.value.id);
      if (historyItem) {
        historyItem.gift_status = status;
        historyItem.completed_at = completedAt;
        historyItem.updated_at = nowIso;
      }

      // 发送通知给用户
      const statusLabels = {
        'preparing': '备货中',
        'processing': '正在处理',
        'shipped': '已发货',
        'completed': '已送达'
      };
      await createNotification(
        targetProfile.value.id,
        userInfo.value?.id || null,
        'gift',
        {
          gift_id: currentGift.value.id,
          content: `您的礼物 [${currentGift.value.gift_content}] 状态已更新为: ${statusLabels[status]}`
        }
      );
    }
  } catch (err) {
    logger.error('address', err);
  }
};

const openNewGiftModal = () => {
  newGift.gift_no = `BOH-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  newGift.gift_content = ""; newGift.gift_price = 0; newGift.gift_image = "";
  showNewGiftModal.value = true;
};

const openEditGiftModal = () => {
  if (!currentGift.value) return;
  editGiftData.id = currentGift.value.id;
  editGiftData.gift_no = currentGift.value.gift_no;
  editGiftData.gift_content = currentGift.value.gift_content;
  editGiftData.gift_price = currentGift.value.gift_price;
  editGiftData.gift_image = currentGift.value.gift_image || "";
  showEditGiftModal.value = true;
};

const updateGiftInfo = async () => {
  if (!editGiftData.gift_content) return showNotice("请输入礼物内容");
  try {
    const { data, error } = await supabase
      .from('user_gifts')
      .update({
        gift_no: editGiftData.gift_no,
        gift_content: editGiftData.gift_content,
        gift_price: editGiftData.gift_price,
        gift_image: editGiftData.gift_image,
        updated_at: new Date().toISOString()
      })
      .eq('id', editGiftData.id)
      .select()
      .single();

    if (!error) {
      currentGift.value = data;
      // 同时更新历史记录中的对应项
      const historyItem = historyGifts.value.find(g => g.id === data.id);
      if (historyItem) {
        Object.assign(historyItem, data);
      }
      showEditGiftModal.value = false;
      showNotice("更新成功");
    } else {
      showNotice("更新失败: " + error.message);
    }
  } catch (err) {
    logger.error('address', err);
    showNotice('更新失败，请稍后重试');
  }
};

const createNewGift = async () => {
  if (!newGift.gift_content) return showNotice("请输入礼物内容");
  try {
    const previousCurrentGift = currentGift.value
      ? { ...currentGift.value, is_active: false, updated_at: new Date().toISOString() }
      : null;

    // 1. Deactivate old gifts
    await supabase.from('user_gifts').update({ is_active: false }).eq('user_id', targetProfile.value.id);

    // 2. Insert new
    const { data, error } = await supabase.from('user_gifts').insert({
      user_id: targetProfile.value.id,
      ...newGift,
      is_active: true
    }).select().single();

    if (!error) {
      currentGift.value = data;
      if (historyLoadedUserId.value === targetProfile.value.id) {
        const dedupedHistory = historyGifts.value.filter((gift) =>
          gift.id !== data.id && gift.id !== previousCurrentGift?.id
        );
        historyGifts.value = previousCurrentGift
          ? [previousCurrentGift, ...dedupedHistory]
          : dedupedHistory;
      }
      showNewGiftModal.value = false;

      // 发送通知给用户
      await createNotification(
        targetProfile.value.id,
        userInfo.value?.id || null,
        'gift',
        {
          gift_id: data.id,
          content: `为您发布了一份新的礼物: [${data.gift_content}]，快去查看进度吧！`
        }
      );
    }
  } catch (err) {
    logger.error('address', err);
    showNotice('创建礼物失败，请稍后重试');
  }
};

const viewGiftDetail = (gift) => {
  currentGift.value = gift;
  showHistory.value = false;
};

onMounted(() => {
  if (isLoggedIn.value) {
    void Promise.allSettled([fetchData(), fetchAllPartners()]);
  } else {
    router.push('/login');
  }
});

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<style scoped src="./style.scoped.css"></style>
