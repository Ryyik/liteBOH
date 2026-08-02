<template>
  <div class="address-page">

    <!-- Global Notice -->
    <Transition name="glass-fade">
      <div v-if="notice.visible" class="address-notice" :class="notice.type" @click="notice.visible = false">
        {{ notice.text }}
      </div>
    </Transition>

    <!-- Main Content Area -->
    <div class="main-content-wrap">
      <UserCenterPageHeader title="礼物" @back="goBack" />

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
        <!-- 第一行: 当前礼物 -->
        <section class="gift-section">
          <header class="gift-section-header">
            <h2 class="gift-section-title">当前礼物</h2>
            <button
              v-if="historyGifts.length"
              type="button"
              class="gift-history-link"
              @click="scrollToHistory"
            >
              查看历史礼物 ({{ historyGifts.length }})
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
          </header>

          <div v-if="!currentGift" class="no-gift-state glass-container-light">
            <Gift class="no-gift-icon" :size="56" :stroke-width="1.6" aria-hidden="true" />
            <p>目前还没有待收到的礼物，积极参与社区活动来赢取吧！</p>
          </div>

          <article v-else class="gift-card glass-container-light">
            <div class="gift-card-head">
              <div class="gift-card-visual">
                <img v-if="currentGift.gift_image" :src="currentGift.gift_image" alt="礼物图片" loading="lazy" />
                <Gift v-else :size="44" :stroke-width="1.5" aria-hidden="true" />
              </div>
              <div class="gift-card-intro">
                <span class="gift-card-eyebrow">编号 {{ currentGift.gift_no || 'BOH-NEW' }}</span>
                <h3 class="gift-card-title">{{ currentGift.gift_content || '待命中的礼物' }}</h3>
                <p class="gift-card-price">RMB {{ currentGift.gift_price || '0' }}</p>
              </div>
            </div>

            <div class="gift-card-progress">
              <div class="apple-progress-bar">
                <div class="apple-progress-fill" :style="{ width: appleProgressWidth + '%' }"></div>
              </div>
              <div class="apple-progress-steps">
                <span :class="{ active: currentStatusIndex >= 0 }">已收到请求</span>
                <span :class="{ active: currentStatusIndex >= 1 }">正在处理</span>
                <span :class="{ active: currentStatusIndex >= 2 }">已寄出</span>
                <span :class="{ active: currentStatusIndex >= 3 }">已送达</span>
              </div>
            </div>

            <footer class="gift-card-foot">
              <span class="gift-card-status" :class="currentGift.gift_status">
                <span class="gift-card-status-dot"></span>
                {{ getAppleStatusTitle }}
              </span>
              <span class="gift-card-desc">{{ getAppleStatusDesc }}</span>
            </footer>
          </article>
        </section>

        <!-- 第二行: 收货地址管理 -->
        <section class="address-section-bottom glass-container-light">
          <div class="section-header">
            <div class="section-title-group">
              <h3>收货地址管理</h3>
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

        <!-- 历史礼物 (折鲁在下方) -->
        <section v-if="historyGifts.length" id="history-gifts" class="history-section glass-container-light fade-in">
          <div class="section-header">
            <h3>历史礼物</h3>
            <span class="section-count">{{ historyGifts.length }} 份</span>
          </div>
          <div class="history-list">
            <div v-for="gift in historyGifts" :key="gift.id" class="history-card">
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
        </section>

        <!-- 八周年海报申请 -->
        <section v-if="posterRequests.length" class="poster-section-bottom glass-container-light">
          <div class="section-header">
            <div class="section-title-group">
              <h3>八周年海报申请</h3>
            </div>
          </div>
          <div class="poster-request-list">
            <div v-for="request in posterRequests" :key="request.id" class="poster-request-card">
              <div class="poster-request-head">
                <span class="poster-request-no">#{{ formatPosterNo(request) }}</span>
                <span class="poster-request-status" :class="request.status">
                  {{ getPosterStatusLabel(request.status) }}
                </span>
              </div>
              <div class="poster-request-meta">
                <span class="poster-request-item">收件人：{{ request.recipient }}</span>
                <span class="poster-request-item">物料费：RMB {{ Number(request.material_fee) || 5 }}</span>
                <span class="poster-request-item">申请时间：{{ formatPosterDate(request.created_at) }}</span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

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
import { Gift, MapPin, TriangleAlert } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { supabase } from "@/utils/supabase-client.js";
import { logger } from '@/utils/logger.js';
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
const { userInfo, isLoggedIn } = storeToRefs(authStore);

// --- State ---
const loading = ref(true);
const mainLoadError = ref("");
const saving = ref(false);
const deletingAddress = ref(false);
const isEditing = ref(false);
const targetProfile = ref(null);
const isOwnProfile = ref(true);
const historyGifts = ref([]);
const historyLoading = ref(false);
const historyLoadError = ref("");
const historyLoadedUserId = ref("");
const currentGift = ref(null);
const posterRequests = ref([]);

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
const isAddressEditable = computed(() => Boolean(isOwnProfile.value));
const hasAddressData = computed(() => Boolean(
  String(targetProfile.value?.shipping_address || "").trim()
  || String(targetProfile.value?.shipping_recipient || "").trim()
  || String(targetProfile.value?.shipping_phone || "").trim()
));

const getPosterStatusLabel = (status) => {
  const map = {
    'pending': '已收到申请',
    'processing': '处理中',
    'shipped': '已寄出',
    'completed': '已送达'
  };
  return map[status] || '待处理';
};

const formatPosterNo = (request) => {
  const raw = String(request?.id || '');
  return raw.slice(0, 8).toUpperCase() || 'BOH-POSTER';
};

const formatPosterDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

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

const fetchData = async (uid = userInfo.value.id) => {
  loading.value = true;
  mainLoadError.value = "";
  resetHistoryState();
  try {
    const isOwn = uid === userInfo.value?.id;

    // H-1 修复：profiles 敏感字段已通过列级权限收窄，
    // 公开字段走 from('profiles')，本人敏感字段走 get_my_sensitive_profile RPC。
    const profilePromise = isOwn
      ? Promise.all([
          supabase.from('profiles').select('*').eq('id', uid).single(),
          supabase.rpc('get_my_sensitive_profile')
        ]).then(([pub, sec]) => ({
          data: { ...(pub.data || {}), ...(sec.data || {}) },
          error: pub.error || sec.error
        }))
      : supabase.from('profiles').select('*').eq('id', uid).single();

    const [profileRes, activeGiftRes] = await Promise.allSettled([
      withTaskTimeout(profilePromise),
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
      isOwnProfile.value = isOwn;
    }

    // 当前礼物失败时不阻塞页面，其它区域仍可展示
    const activeGiftData = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.data : null;
    const activeGiftError = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.error : activeGiftRes.reason;

    if (!activeGiftError && activeGiftData && activeGiftData.length > 0) {
      const [activeGift] = activeGiftData;
      let normalizedCurrentGift = activeGift || null;

      // 与旧逻辑保持一致：过期且已完成的当前礼物自动视为历史礼物。
      if (normalizedCurrentGift && isGiftExpiredCompleted(normalizedCurrentGift)) {
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

    // 八周年海报申请订单状态（RLS：仅本人可见）
    const { data: posterData, error: posterError } = await supabase
      .from('poster_requests')
      .select('id, recipient, material_fee, status, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (!posterError) {
      posterRequests.value = Array.isArray(posterData) ? posterData : [];
    } else {
      posterRequests.value = [];
      logger.warn('address', '加载海报申请失败:', posterError);
    }

    // 历史礼物与主数据并行加载, 无需手动切换
    void loadHistoryGifts(uid);
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
const getAddressAIModel = () => null;

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

const scrollToHistory = () => {
  const el = document.getElementById('history-gifts');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

onMounted(() => {
  if (isLoggedIn.value) {
    void fetchData();
  } else {
    router.push('/login');
  }
});

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<style scoped src="./style.scoped.css"></style>
