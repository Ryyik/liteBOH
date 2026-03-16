<template>
  <div class="address-page" :class="{ 'admin-layout': isAdmin, 'sidebar-collapsed': !isAdminSidebarOpen }">
    <!-- Admin Sidebar (Users List) -->
    <aside v-if="isAdmin" class="admin-sidebar glass-container-light">
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <h3 v-if="isAdminSidebarOpen">社区成员</h3>
          <div v-else class="collapsed-logo">👥</div>
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
        <div v-if="isLoadingUsers" class="sidebar-loading">
          <div class="mini-spinner"></div>
        </div>
        <template v-else>
          <div v-for="p in allPartners" :key="p.id" class="user-item" :class="{ active: targetProfile?.id === p.id }"
            @click="selectUserByAdmin(p)">
            <div class="user-avatar">{{ p.username.charAt(0).toUpperCase() }}</div>
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
      <!-- Sticky Header -->
      <header class="x-addr-header">
        <div class="x-header-content">
          <div class="x-header-left">
            <button class="x-back-btn" @click="goBack">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 class="x-header-title">礼物</h2>
          </div>
          <div class="header-right" v-if="isLoggedIn">
            <button class="history-toggle-btn" @click="showHistory = !showHistory">
              {{ showHistory ? '查看当前' : '历史礼物' }}
            </button>
          </div>
        </div>
      </header>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>正在加载礼物详情...</p>
      </div>

      <template v-else>
        <!-- History View -->
        <div v-if="showHistory" class="history-container fade-in">
          <div class="section-title">历史礼物记录</div>
          <div v-if="historyGifts.length === 0" class="empty-history">
            <p>暂无历史礼物记录</p>
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
            <div class="no-gift-icon">🎁</div>
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
                    <img v-if="currentGift?.gift_image" :src="currentGift.gift_image" alt="Gift" />
                    <div v-else class="gift-placeholder-icon">🎁</div>
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
                <div class="no-gift-icon">🎁</div>
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
            <button v-if="isOwnProfile || isAdmin" class="edit-link" @click="startEdit">编辑信息</button>
          </div>

          <div v-if="!isEditing" class="address-summary">
            <div v-if="!targetProfile?.shipping_address" class="empty-hint">
              <span class="empty-icon">📍</span>
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
import { ref, onMounted, computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";
import { supabase, getUserInfo, createNotification } from "@/utils/auth.js";
import { availableModels } from "@/views/BOHAI/composables/useChatEngine.js";

const router = useRouter();
const authStore = useAuthStore();
const { userInfo, isLoggedIn } = storeToRefs(authStore);

// --- State ---
const loading = ref(true);
const saving = ref(false);
const isEditing = ref(false);
const targetProfile = ref(null);
const adminSearchUser = ref("");
const allPartners = ref([]);
const isOwnProfile = ref(true);
const showHistory = ref(false);
const historyGifts = ref([]);
const currentGift = ref(null);
const showNewGiftModal = ref(false);
const showEditGiftModal = ref(false);

const isAdminSidebarOpen = ref(true);
const userPageSize = 10;
const userCurrentPage = ref(1);
const userTotalCount = ref(0);
const isLoadingUsers = ref(false);

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
const isAdmin = computed(() => userInfo.value.role === 'admin' || userInfo.value.username === 'Ryyik');

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
  const date = formatDateShort(currentGift.value.updated_at || currentGift.value.created_at);

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

const giftStatusClass = computed(() => {
  return currentGift.value?.gift_status || 'preparing';
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
    const { data, error, count } = await query.range(start, start + userPageSize - 1);

    if (!error) {
      allPartners.value = data || [];
      userTotalCount.value = count || 0;
    }
  } catch (err) {
    console.error(err);
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

const goBack = () => {
  const targetUsername = userInfo.value.username || localStorage.getItem('username');
  if (targetUsername) {
    router.push(`/profile/${targetUsername}`);
  } else {
    router.push('/');
  }
};

const fetchData = async (uid = userInfo.value.id) => {
  loading.value = true;
  try {
    // 1. Get Profile
    const { data: pData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();

    if (pData) {
      targetProfile.value = pData;
      isOwnProfile.value = uid === userInfo.id;
    }

    // 2. Get Gifts (New table user_gifts)
    const { data: gData, error: gError } = await supabase
      .from('user_gifts')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!gError && gData && gData.length > 0) {
      historyGifts.value = gData;
      currentGift.value = gData.find(g => g.is_active) || gData[0];
    } else {
      // Fallback to profile fields if user_gifts is empty or doesn't exist
      historyGifts.value = [];
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
  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    loading.value = false;
  }
};

const startEdit = () => {
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
  if (!form.recipient || !form.phone || !form.address) {
    alert("请填写完整的信息");
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
      alert("信息保存成功");
    } else {
      alert("保存失败: " + error.message);
    }
  } catch (err) {
    alert("系统错误，请稍后再试");
  } finally {
    saving.value = false;
  }
};

// --- AI Extraction ---
const handleAIExtract = async () => {
  if (!pastedText.value.trim()) return;
  isProcessingAI.value = true;
  const model = availableModels.find(m => m.id === 'Qwen/Qwen3-8B') || availableModels[0];
  const systemPrompt = `你是一个地址信息提取助手。请 from 用户粘贴的文本中提取：收件人姓名、联系电话、详细地址。严格返回 JSON: {"recipient": "...", "phone": "...", "address": "..."}`;

  try {
    const response = await fetch(model.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${model.apiKey}` },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: pastedText.value }],
        temperature: 0.1
      })
    });
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content.match(/\{.*\}/s)[0]);
    aiResult.recipient = result.recipient || "";
    aiResult.phone = result.phone || "";
    aiResult.address = result.address || "";
    showAiConfirm.value = true;
  } catch (err) {
    alert('AI 识别失败，请手动填写。');
  } finally { isProcessingAI.value = false; }
};

const applyAiResult = () => {
  form.recipient = aiResult.recipient; form.phone = aiResult.phone; form.address = aiResult.address;
  showAiConfirm.value = false; pastedText.value = "";
};

// --- Admin Actions ---
const updateGiftStatus = async (status) => {
  if (!currentGift.value || !isAdmin.value) return;
  try {
    const { error } = await supabase
      .from('user_gifts')
      .update({ gift_status: status, updated_at: new Date().toISOString() })
      .eq('id', currentGift.value.id);
    if (!error) {
      currentGift.value.gift_status = status;
      // 同时更新历史记录中的对应项
      const historyItem = historyGifts.value.find(g => g.id === currentGift.value.id);
      if (historyItem) {
        historyItem.gift_status = status;
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
        userInfo.id,
        'gift',
        {
          gift_id: currentGift.value.id,
          content: `您的礼物 [${currentGift.value.gift_content}] 状态已更新为: ${statusLabels[status]}`
        }
      );
    }
  } catch (err) {
    console.error(err);
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
  if (!editGiftData.gift_content) return alert("请输入礼物内容");
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
      alert("更新成功");
    } else {
      alert("更新失败: " + error.message);
    }
  } catch (err) {
    console.error(err);
  }
};

const createNewGift = async () => {
  if (!newGift.gift_content) return alert("请输入礼物内容");
  try {
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
      historyGifts.value.unshift(data);
      showNewGiftModal.value = false;

      // 发送通知给用户
      await createNotification(
        targetProfile.value.id,
        userInfo.id,
        'gift',
        {
          gift_id: data.id,
          content: `为您发布了一份新的礼物: [${data.gift_content}]，快去查看进度吧！`
        }
      );
    }
  } catch (err) {
    console.error(err);
  }
};

const viewGiftDetail = (gift) => {
  currentGift.value = gift;
  showHistory.value = false;
};

onMounted(() => {
  if (isLoggedIn.value) {
    fetchData();
    fetchAllPartners();
  } else {
    router.push('/login');
  }
});
</script>

<style scoped>
.address-page {
  width: 100%;
  max-width: 100% !important;
  /* Full screen layout */
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 48px;
  padding: 0 40px 100px;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif;
  color: #1d1d1f;
  background-color: #ffffff;
  box-sizing: border-box;
}

/* Header - More Elegant */
.x-addr-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  margin: 0 -40px;
  padding: 0 40px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.x-header-content {
  height: 96px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.x-header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.x-back-btn {
  background: #ffffff;
  border: 1px solid #f2f2f7;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  color: #1d1d1f;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.x-back-btn:hover {
  background: #fcfcfd;
  border-color: #e5e5e7;
  transform: translateX(-6px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
}

.x-header-title {
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.04em;
  margin: 0;
}

.history-toggle-btn {
  padding: 12px 28px;
  border-radius: 20px;
  border: 1px solid #f2f2f7;
  background: #ffffff;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
}

.history-toggle-btn:hover {
  background: #1d1d1f;
  color: #ffffff;
  border-color: #1d1d1f;
  transform: translateY(-3px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}

/* Admin Sidebar - Figma Professional Style */
.admin-layout {
  flex-direction: row;
  max-width: 1500px;
  gap: 0;
  padding: 0;
}

.admin-sidebar {
  width: 340px;
  height: 100vh;
  position: sticky;
  top: 0;
  border-right: 1px solid #f2f2f7;
  display: flex;
  flex-direction: column;
  background: #f9f9fb;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.address-page.sidebar-collapsed .admin-sidebar {
  width: 80px;
}

.sidebar-header {
  padding: 40px 24px 24px;
}

.sidebar-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.sidebar-title-row h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.collapsed-logo {
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-toggle {
  background: #ffffff;
  border: 1px solid #eeeeef;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #1d1d1f;
  flex-shrink: 0;
}

.collapse-toggle:hover {
  background: #f2f2f7;
  transform: scale(1.05);
}

.sidebar-search {
  width: 100%;
  padding: 14px 20px;
  border-radius: 16px;
  border: 1px solid #eeeeef;
  background: #ffffff;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.01);
}

.sidebar-search:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.1);
  outline: none;
}

.user-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.sidebar-loading {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.mini-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #f2f2f7;
  border-top: 3px solid #1d1d1f;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.sidebar-pagination {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border-top: 1px solid #f2f2f7;
  background: #fcfcfd;
}

.pag-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid #eeeeef;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: #1d1d1f;
}

.pag-btn:hover:not(:disabled) {
  background: #f2f2f7;
  transform: translateY(-2px);
}

.pag-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pag-info {
  font-size: 14px;
  font-weight: 700;
  color: #86868b;
  min-width: 60px;
  text-align: center;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  margin-bottom: 8px;
}

.user-item:hover {
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
}

.user-item.active {
  background: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #f2f2f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  color: #1d1d1f;
  font-size: 18px;
  transition: all 0.3s ease;
}

.user-item.active .user-avatar {
  background: rgba(255, 255, 255, 0.1);
  border-color: transparent;
  color: #ffffff;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 800;
  font-size: 16px;
}

.user-role {
  font-size: 13px;
  opacity: 0.6;
  font-weight: 600;
}

.main-content-wrap {
  flex: 1;
  padding: 0 80px 100px;
  overflow-y: auto;
  height: 100vh;
}

/* History - Dribbble Card Grid */
.history-container {
  margin-top: 24px;
}

.section-title {
  font-size: 28px;
  font-weight: 900;
  margin-bottom: 40px;
  letter-spacing: -0.03em;
}

.history-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 32px;
}

.history-card {
  padding: 32px;
  border-radius: 32px;
  background: #ffffff;
  border: 1px solid #f2f2f7;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
}

.history-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.08);
  border-color: #e5e5e7;
}

.h-gift-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.h-gift-no {
  font-size: 11px;
  font-weight: 900;
  color: #1d1d1f;
  background: #f9f9fb;
  padding: 6px 12px;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.h-gift-name {
  font-size: 20px;
  font-weight: 900;
  color: #1d1d1f;
  letter-spacing: -0.01em;
}

.h-gift-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.h-gift-date {
  font-size: 15px;
  color: #86868b;
  font-weight: 600;
}

.h-gift-status {
  font-size: 13px;
  font-weight: 800;
  padding: 8px 18px;
  border-radius: 14px;
}

.h-gift-status.preparing {
  background: #fff8e6;
  color: #997000;
}

.h-gift-status.processing {
  background: #eef7ff;
  color: #0066cc;
}

.h-gift-status.shipped {
  background: #f0fdf4;
  color: #166534;
}

.h-gift-status.completed {
  background: #f5f5f7;
  color: #1d1d1f;
}

/* Current Gift - High-End Premium Style */
.current-gift-container {
  margin-top: 24px;
}

.no-gift-state {
  padding: 120px 40px;
  text-align: center;
  background: #f9f9fb;
  border-radius: 48px;
  border: 2px dashed #eeeeef;
}

.no-gift-icon {
  font-size: 80px;
  margin-bottom: 32px;
  display: block;
}

.no-gift-state h3 {
  font-size: 36px;
  font-weight: 900;
  margin: 0 0 20px;
  letter-spacing: -0.04em;
}

.no-gift-state p {
  font-size: 20px;
  color: #86868b;
  max-width: 480px;
  margin: 0 auto;
  line-height: 1.5;
  font-weight: 500;
}

.no-gift-admin-hint {
  padding: 40px 0;
  text-align: center;
}

.no-gift-admin-hint .no-gift-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.no-gift-admin-hint h3 {
  font-size: 28px;
  font-weight: 900;
  margin-bottom: 12px;
}

.no-gift-admin-hint p {
  font-size: 16px;
  color: #86868b;
  font-weight: 600;
}

.apple-order-status {
  padding: 80px;
  border-radius: 56px;
  background: #ffffff;
  border: 1px solid #f2f2f7;
  box-shadow: 0 60px 120px rgba(0, 0, 0, 0.05);
  margin-bottom: 48px;
}

.order-main-row {
  display: flex;
  gap: 80px;
  align-items: center;
}

.gift-visual {
  width: 260px;
  height: 260px;
  flex-shrink: 0;
}

.gift-image-box {
  width: 100%;
  height: 100%;
  background: #fcfcfd;
  border-radius: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.03);
}

.gift-image-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gift-placeholder-icon {
  font-size: 100px;
}

.order-status-info {
  flex: 1;
}

.product-name {
  font-size: 18px;
  color: #86868b;
  font-weight: 800;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.status-title {
  font-size: 56px;
  font-weight: 900;
  color: #1d1d1f;
  margin: 0 0 40px;
  letter-spacing: -0.05em;
  line-height: 1.05;
}

/* Enhanced Progress Bar */
.apple-progress-wrap {
  margin-bottom: 48px;
}

.apple-progress-bar {
  height: 16px;
  background: #f2f2f7;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 24px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
}

.apple-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00ba7c 0%, #34d399 100%);
  border-radius: 8px;
  transition: width 1.5s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 15px rgba(0, 186, 124, 0.4);
}

.apple-progress-steps {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.apple-progress-steps span {
  flex: 1;
  font-size: 14px;
  font-weight: 800;
  color: #a1a1a6;
  transition: all 0.4s ease;
  text-align: center;
  line-height: 1.2;
}

.apple-progress-steps span.active {
  color: #1d1d1f;
  transform: scale(1.05);
}

.status-desc {
  font-size: 20px;
  color: #536471;
  line-height: 1.6;
  font-weight: 600;
}

/* Detailed Grid - Professional Figma Look */
.apple-details-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px;
  margin-bottom: 80px;
}

.detail-column {
  background: #ffffff;
  padding: 40px;
  border-radius: 40px;
  border: 1px solid #f2f2f7;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.01);
}

.detail-column:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.06);
  border-color: #e5e5e7;
}

.detail-label {
  font-size: 13px;
  color: #86868b;
  font-weight: 900;
  margin: 0 0 24px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.detail-value-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-primary {
  font-size: 22px;
  font-weight: 900;
  color: #1d1d1f;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: -0.02em;
}

.detail-secondary {
  font-size: 16px;
  color: #536471;
  font-weight: 600;
  line-height: 1.6;
}

.detail-price {
  font-size: 32px;
  font-weight: 900;
  color: #1d1d1f;
  margin-top: 16px;
  letter-spacing: -0.04em;
}

.address-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Glass effect base */
.glass-container-light {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.04);
}

/* Admin Controls Overlay */
.admin-quick-actions {
  margin-top: 60px;
  padding-top: 40px;
  border-top: 1px solid #f2f2f7;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.admin-action-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-action-group label {
  font-size: 12px;
  font-weight: 900;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.status-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.status-chips button {
  padding: 12px 24px;
  border-radius: 16px;
  border: 1px solid #eeeeef;
  background: #ffffff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
}

.status-chips button.active {
  background: #1d1d1f;
  color: #ffffff;
  border-color: #1d1d1f;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.edit-gift-btn-small {
  padding: 16px 24px;
  border-radius: 20px;
  border: 1px solid #eeeeef;
  background: #ffffff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  color: #1d1d1f;
}

.edit-gift-btn-small:hover {
  background: #f2f2f7;
  transform: translateY(-2px);
}

.add-gift-btn {
  background: #007aff;
  color: #ffffff;
  border: none;
  padding: 16px 36px;
  border-radius: 20px;
  font-weight: 900;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 12px 30px rgba(0, 122, 255, 0.25);
}

.add-gift-btn:hover {
  background: #0066cc;
  transform: translateY(-5px) scale(1.03);
  box-shadow: 0 20px 45px rgba(0, 122, 255, 0.35);
}

/* Address Management Section - Figma High-End Style */
.address-section-bottom {
  padding: 60px;
  border-radius: 56px;
  background: #fcfcfd;
  border: 1px solid #f2f2f7;
  margin-top: 60px;
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.03);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 48px;
}

.section-title-group {
  display: flex;
  align-items: center;
  gap: 24px;
}

.target-user-badge {
  padding: 8px 16px;
  background: #f2f2f7;
  border-radius: 12px;
  border: 1px solid #eeeeef;
}

.user-name-tag {
  font-size: 14px;
  font-weight: 800;
  color: #007aff;
}

.section-header h3 {
  margin: 0;
  font-size: 32px;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: #1d1d1f;
}

.edit-link {
  color: #007aff;
  background: rgba(0, 122, 255, 0.06);
  border: none;
  padding: 12px 28px;
  border-radius: 16px;
  font-weight: 900;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.edit-link:hover {
  background: rgba(0, 122, 255, 0.12);
  transform: translateY(-2px);
}

.address-summary {
  padding: 0;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 60px 0;
  color: #86868b;
  text-align: center;
}

.empty-icon {
  font-size: 56px;
  filter: grayscale(1) opacity(0.5);
}

.empty-hint p {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  max-width: 300px;
  line-height: 1.5;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
}

.summary-item {
  padding: 32px;
  background: #ffffff;
  border-radius: 32px;
  border: 1px solid #f2f2f7;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
}

.summary-item:hover {
  border-color: #e5e5e7;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04);
  transform: translateY(-4px);
}

.summary-item.full {
  grid-column: span 2;
}

.summary-item span {
  display: block;
  font-size: 12px;
  font-weight: 900;
  color: #86868b;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.summary-item p {
  font-size: 20px;
  color: #1d1d1f;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.01em;
}

.address-text-full {
  line-height: 1.6 !important;
}

/* Address Editor - High Fidelity */
.address-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 48px;
}

.ai-paste-zone {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 32px;
  background: #f0f7ff;
  border-radius: 32px;
  border: 1px solid #d0e7ff;
}

.ai-badge {
  display: inline-block;
  align-self: flex-start;
  padding: 6px 14px;
  background: #007aff;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  border-radius: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.2);
}

.ai-paste-zone textarea {
  width: 100%;
  height: 140px;
  padding: 24px;
  border-radius: 20px;
  border: 1px solid #e1eefc;
  background: #ffffff;
  font-size: 16px;
  font-weight: 500;
  resize: none;
  transition: all 0.3s ease;
}

.ai-paste-zone textarea:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 6px rgba(0, 122, 255, 0.08);
  outline: none;
}

.ai-paste-zone button {
  align-self: flex-end;
  background: #007aff;
  color: #ffffff;
  border: none;
  padding: 16px 40px;
  border-radius: 20px;
  font-weight: 900;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 10px 25px rgba(0, 122, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-paste-zone button:hover:not(:disabled) {
  transform: translateY(-3px) scale(1.03);
  box-shadow: 0 15px 35px rgba(0, 122, 255, 0.3);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group label {
  font-size: 13px;
  font-weight: 900;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-left: 4px;
}

.form-grid input,
.form-grid textarea {
  padding: 20px 24px;
  border-radius: 20px;
  border: 1px solid #eeeeef;
  font-size: 18px;
  font-weight: 700;
  background: #ffffff;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  color: #1d1d1f;
}

.form-grid input:focus,
.form-grid textarea:focus {
  border-color: #1d1d1f;
  outline: none;
  box-shadow: 0 0 0 6px rgba(0, 0, 0, 0.03);
  transform: translateY(-2px);
}

.full-row {
  grid-column: span 2;
}

.address-textarea {
  min-height: 160px;
  resize: none;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  margin-top: 12px;
}

.cancel-btn,
.save-btn {
  padding: 18px 48px;
  border-radius: 24px;
  font-weight: 900;
  font-size: 18px;
  cursor: pointer;
  border: none;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.cancel-btn {
  background: #f5f5f7;
  color: #1d1d1f;
}

.cancel-btn:hover {
  background: #eeeeef;
  transform: translateY(-2px);
}

.save-btn {
  background: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
}

.save-btn:hover:not(:disabled) {
  transform: translateY(-4px);
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mini-spinner.white {
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
}

/* Utilities */
.fade-in {
  animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 10px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.12);
}

/* Modals - Ultra High End Figma Style */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.glass-card {
  background: #ffffff;
  border-radius: 48px;
  box-shadow: 0 60px 150px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 600px;
  padding: 60px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  animation: modalIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin: 40px 0;
}

.m-field.full {
  grid-column: span 2;
}

.m-field label {
  display: block;
  font-size: 13px;
  font-weight: 900;
  color: #86868b;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.m-field input {
  width: 100%;
  padding: 18px 24px;
  border-radius: 20px;
  border: 1px solid #eeeeef;
  background: #fcfcfd;
  font-size: 17px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.m-field input:focus {
  border-color: #1d1d1f;
  background: #ffffff;
  outline: none;
  box-shadow: 0 0 0 6px rgba(0, 0, 0, 0.03);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  margin-top: 40px;
}

.modal-actions button {
  padding: 16px 36px;
  border-radius: 20px;
  font-weight: 900;
  font-size: 17px;
  cursor: pointer;
  border: none;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-actions button:not(.primary) {
  background: #f5f5f7;
  color: #1d1d1f;
}

.modal-actions button.primary {
  background: #1d1d1f;
  color: #ffffff;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
}

.modal-actions button.primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
}

/* AI Confirm Modal Specifics */
.ai-confirm-modal h3 {
  font-size: 32px;
  font-weight: 900;
  margin: 0 0 32px;
  letter-spacing: -0.04em;
}

.confirm-content {
  background: #f9f9fb;
  padding: 32px;
  border-radius: 32px;
  border: 1px solid #eeeeef;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.confirm-content p {
  margin: 0;
  font-size: 18px;
  color: #1d1d1f;
  font-weight: 600;
  line-height: 1.5;
}

.confirm-content strong {
  display: block;
  font-size: 12px;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}

/* Loading - Refined Spinner */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 140px 0;
}

.spinner {
  width: 56px;
  height: 56px;
  border: 6px solid #f2f2f7;
  border-top: 6px solid #1d1d1f;
  border-radius: 50%;
  animation: spin 0.85s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  margin-bottom: 32px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* Responsive - Comprehensive */
@media (max-width: 1200px) {
  .admin-sidebar {
    width: 300px;
  }

  .main-content-wrap {
    padding: 0 60px 80px;
  }

  .apple-details-grid {
    gap: 32px;
  }
}

@media (max-width: 1024px) {
  .main-content-wrap {
    padding: 0 40px 60px;
  }

  .apple-details-grid {
    grid-template-columns: 1fr 1fr;
  }

  .detail-column:last-child {
    grid-column: span 2;
  }
}

@media (max-width: 768px) {
  .address-page {
    padding: 0 16px 60px;
    gap: 32px;
  }

  .x-addr-header {
    margin: 0 -16px;
    padding: 0 16px;
  }

  .x-header-content {
    height: 72px;
  }

  .x-header-title {
    font-size: 24px;
  }

  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    height: auto;
    position: relative;
    border-right: none;
    border-bottom: 1px solid #f2f2f7;
    max-height: 60vh;
  }

  .address-page.sidebar-collapsed .admin-sidebar {
    width: 100%;
    height: auto;
  }

  .sidebar-header {
    padding: 20px 16px;
  }

  .sidebar-title-row {
    margin-bottom: 16px;
  }

  .user-list {
    padding: 8px 16px;
  }

  .main-content-wrap {
    padding: 0 0 40px;
    height: auto;
    overflow: visible;
  }

  .order-main-row {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 32px;
  }

  .gift-visual {
    width: 180px;
    height: 180px;
  }

  .status-title {
    font-size: 36px;
    margin-bottom: 32px;
  }

  .apple-order-status {
    padding: 32px 20px;
    border-radius: 32px;
    margin-bottom: 32px;
  }

  .apple-progress-steps span {
    font-size: 12px;
  }

  .admin-quick-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 32px;
    margin-top: 40px;
    padding-top: 32px;
  }

  .status-chips {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .status-chips button {
    padding: 10px;
    font-size: 14px;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .edit-gift-btn-small,
  .add-gift-btn {
    width: 100%;
    padding: 14px;
    font-size: 15px;
  }

  .apple-details-grid {
    grid-template-columns: 1fr;
    gap: 20px;
    margin-bottom: 40px;
  }

  .detail-column {
    padding: 24px;
    border-radius: 24px;
  }

  .detail-column:last-child {
    grid-column: span 1;
  }

  .detail-primary {
    font-size: 18px;
  }

  .detail-price {
    font-size: 24px;
  }

  .address-section-bottom {
    padding: 32px 20px;
    border-radius: 32px;
    margin-top: 40px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 32px;
  }

  .section-title-group {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .section-header h3 {
    font-size: 26px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .summary-item {
    padding: 20px;
    border-radius: 20px;
  }

  .summary-item p {
    font-size: 17px;
  }

  .address-editor-wrap {
    gap: 32px;
  }

  .ai-paste-zone {
    padding: 24px;
    border-radius: 24px;
  }

  .ai-paste-zone textarea {
    height: 120px;
    padding: 16px;
  }

  .ai-paste-zone button {
    width: 100%;
    justify-content: center;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .form-grid input,
  .form-grid textarea {
    padding: 16px;
    font-size: 16px;
  }

  .full-row {
    grid-column: span 1;
  }

  .form-actions {
    flex-direction: column;
    gap: 12px;
  }

  .cancel-btn,
  .save-btn {
    width: 100%;
    padding: 16px;
    font-size: 17px;
    border-radius: 16px;
  }

  .glass-card {
    padding: 32px 24px;
    border-radius: 32px;
  }

  .modal-form {
    grid-template-columns: 1fr;
    gap: 20px;
    margin: 32px 0;
  }

  .m-field.full {
    grid-column: span 1;
  }

  .modal-actions {
    flex-direction: column;
    margin-top: 32px;
  }

  .modal-actions button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .status-title {
    font-size: 32px;
  }

  .apple-progress-steps span {
    font-size: 11px;
  }

  .sidebar-pagination {
    padding: 16px;
    gap: 12px;
  }

  .history-list {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .history-card {
    padding: 24px;
    border-radius: 24px;
  }

  .h-gift-name {
    font-size: 18px;
  }
}
</style>
