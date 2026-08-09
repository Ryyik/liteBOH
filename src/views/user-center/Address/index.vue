<template>
  <div class="gift-center">
    <!-- 全局提示 -->
    <transition name="toast-fade">
      <div v-if="notice.visible" class="gc-toast" :class="notice.type" @click="notice.visible = false">
        {{ notice.text }}
      </div>
    </transition>

    <!-- 页头 -->
    <UserCenterPageHeader title="礼物" @back="goBack" />

    <div class="gc-body">
      <!-- 分段导航 -->
      <div class="gc-seg" role="tablist" aria-label="礼物中心">
        <button type="button" role="tab" :aria-selected="activeTab === 'gifts'" :class="{ active: activeTab === 'gifts' }" @click="switchTab('gifts')">
          <Gift :size="16" aria-hidden="true" />
          礼物进度
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'address'" :class="{ active: activeTab === 'address' }" @click="switchTab('address')">
          <MapPin :size="16" aria-hidden="true" />
          收货地址
          <span v-if="addresses.length" class="seg-count">{{ addresses.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'history'" :class="{ active: activeTab === 'history' }" @click="switchTab('history')">
          <History :size="16" aria-hidden="true" />
          历史礼物
        </button>
      </div>

      <!-- 骨架 -->
      <div v-if="loading" class="gc-loading" aria-hidden="true">
        <div class="gc-skeleton gc-skeleton-hero"></div>
        <div class="gc-skeleton-grid">
          <div v-for="n in 3" :key="`sk-${n}`" class="gc-skeleton gc-skeleton-card"></div>
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="mainLoadError" class="gc-state">
        <p>{{ mainLoadError }}</p>
        <button class="gc-btn gc-btn-ghost" type="button" @click="fetchData()">重试加载</button>
      </div>

      <template v-else>
        <!-- ========== 礼物进度 ========== -->
        <section v-if="activeTab === 'gifts'" class="gc-section">
          <div class="gc-section-head">
            <div>
              <p class="gc-eyebrow">Progress</p>
              <h2>当前礼物</h2>
            </div>
            <button
              v-if="historyGifts.length"
              type="button"
              class="gc-link"
              @click="switchTab('history')"
            >
              历史记录 ({{ historyGifts.length }})
              <ChevronRight :size="15" aria-hidden="true" />
            </button>
          </div>

          <div v-if="!currentGift" class="gc-empty">
            <div class="gc-empty-icon"><Gift :size="46" :stroke-width="1.5" aria-hidden="true" /></div>
            <h3>还没有待收到的礼物</h3>
            <p>积极参与社区活动来赢取吧，收到礼物后这里会实时更新进度。</p>
          </div>

          <article v-else class="gc-gift-card">
            <div class="gc-gift-top">
              <div class="gc-gift-visual">
                <img v-if="currentGift.gift_image" :src="currentGift.gift_image" :alt="currentGift.gift_content" loading="lazy" />
                <Gift v-else :size="46" :stroke-width="1.5" aria-hidden="true" />
              </div>
              <div class="gc-gift-info">
                <span class="gc-gift-no">编号 {{ currentGift.gift_no || 'BOH-NEW' }}</span>
                <h3>{{ currentGift.gift_content || '待命中的礼物' }}</h3>
                <p class="gc-gift-price">RMB {{ currentGift.gift_price || '0' }}</p>
                <span class="gc-status-chip" :class="currentGift.gift_status">
                  <span class="gc-status-dot"></span>
                  {{ getAppleStatusTitle }}
                </span>
              </div>
            </div>

            <div class="gc-gift-track">
              <div class="gc-track-line">
                <div class="gc-track-fill" :style="{ width: appleProgressWidth + '%' }"></div>
              </div>
              <div class="gc-track-steps">
                <div
                  v-for="(step, i) in trackSteps"
                  :key="step.key"
                  class="gc-track-step"
                  :class="{ done: currentStatusIndex > i, current: currentStatusIndex === i }"
                >
                  <span class="gc-track-dot">{{ currentStatusIndex > i ? '✓' : '' }}</span>
                  <span class="gc-track-label">{{ step.label }}</span>
                </div>
              </div>
              <p class="gc-track-desc">{{ getAppleStatusDesc }}</p>
            </div>
          </article>
        </section>

        <section v-else-if="activeTab === 'address'" class="gc-section">
          <div class="gc-section-head">
            <div>
              <p class="gc-eyebrow">Shipping</p>
              <h2>收货地址</h2>
            </div>
            <button v-if="!isEditing" type="button" class="gc-btn gc-btn-primary" @click="openCreateAddress">
              <Plus :size="15" aria-hidden="true" />
              添加地址
            </button>
          </div>

          <!-- 编辑表单 -->
          <div v-if="isEditing" class="gc-card addr-form">
            <div class="addr-form-head">
              <h3>{{ editingId ? '编辑地址' : '添加地址' }}</h3>
              <button type="button" class="gc-icon-btn" title="关闭" @click="closeAddressForm">
                <X :size="17" aria-hidden="true" />
              </button>
            </div>

            <div class="ai-paste">
              <button
                type="button"
                class="ai-paste-toggle"
                :class="{ open: showAiPaste }"
                @click="showAiPaste = !showAiPaste"
              >
                <Sparkles :size="14" aria-hidden="true" />
                AI 智能填充
                <ChevronRight :size="14" :class="{ 'rotate-90': showAiPaste }" aria-hidden="true" />
              </button>
              <div v-if="showAiPaste" class="ai-paste-body">
                <textarea v-model="pastedText" placeholder="粘贴一段完整的收货信息，AI 自动识别并填入表单…"></textarea>
                <button class="gc-btn gc-btn-soft" type="button" :disabled="isProcessingAI" @click="handleAIExtract">
                  <span v-if="isProcessingAI" class="mini-spinner"></span>
                  <span v-else>开始智能识别</span>
                </button>
              </div>
            </div>

            <div class="addr-form-grid">
              <label class="addr-field">
                <span>收件人</span>
                <input v-model="form.recipient" type="text" placeholder="请输入收件人姓名" />
              </label>
              <label class="addr-field">
                <span>联系电话</span>
                <input v-model="form.phone" type="text" placeholder="用于快递联系" />
              </label>
              <label class="addr-field">
                <span>省市区</span>
                <input v-model="form.region" type="text" placeholder="省 / 市 / 区县（可选）" />
              </label>
              <label class="addr-field">
                <span>标签</span>
                <select v-model="form.tag">
                  <option value="">无标签</option>
                  <option value="家">家</option>
                  <option value="公司">公司</option>
                  <option value="学校">学校</option>
                </select>
              </label>
              <label class="addr-field addr-field-full">
                <span>详细地址</span>
                <textarea v-model="form.detail" rows="2" placeholder="街道、门牌号、楼层等"></textarea>
              </label>
            </div>

            <label class="addr-default-toggle">
              <input type="checkbox" v-model="form.is_default" />
              <span class="toggle-ui"></span>
              <span>设为默认收货地址</span>
            </label>

            <div class="addr-form-actions">
              <button class="gc-btn gc-btn-ghost" type="button" :disabled="saving" @click="closeAddressForm">取消</button>
              <button class="gc-btn gc-btn-primary" type="button" :disabled="saving" @click="saveAddress">
                {{ saving ? '保存中…' : '保存地址' }}
              </button>
            </div>
          </div>

          <!-- 地址列表 -->
          <div v-else class="addr-grid">
            <article
              v-for="addr in sortedAddresses"
              :key="addr.id"
              class="addr-card"
              :class="{ 'is-default': addr.is_default }"
            >
              <div class="addr-card-head">
                <div class="addr-person">
                  <strong>{{ addr.recipient || '未填写' }}</strong>
                  <span class="addr-phone">{{ addr.phone || '—' }}</span>
                </div>
                <div class="addr-tags">
                  <span v-if="addr.is_default" class="addr-badge is-default">默认</span>
                  <span v-if="addr.tag" class="addr-badge">{{ addr.tag }}</span>
                </div>
              </div>
              <p class="addr-detail">
                <span v-if="addr.region" class="addr-region">{{ addr.region }}</span>
                {{ addr.detail || '未填写详细地址' }}
              </p>
              <div class="addr-card-foot">
                <button
                  v-if="!addr.is_default"
                  type="button"
                  class="gc-link"
                  :disabled="saving"
                  @click="setDefaultAddress(addr)"
                >
                  设为默认
                </button>
                <span v-else class="addr-default-hint">寄送默认使用该地址</span>
                <div class="addr-card-ops">
                  <button type="button" class="addr-op" title="编辑" :disabled="saving" @click="openEditAddress(addr)">
                    <Pencil :size="14" aria-hidden="true" />
                  </button>
                  <button type="button" class="addr-op is-danger" title="删除" :disabled="saving" @click="deleteAddress(addr)">
                    <Trash2 :size="14" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>

            <button v-if="!isEditing" type="button" class="addr-add-tile" @click="openCreateAddress">
              <Plus :size="22" aria-hidden="true" />
              <span>添加新地址</span>
            </button>

            <div v-if="!addresses.length && !isEditing" class="addr-empty-note">
              还没有收货地址，添加一个默认地址，礼物就能顺利送到你手中。旧资料已帮你迁移 👇
            </div>
          </div>
        </section>

        <section v-else class="gc-section">
          <div class="gc-section-head">
            <div>
              <p class="gc-eyebrow">History</p>
              <h2>历史礼物</h2>
            </div>
            <span v-if="historyGifts.length" class="gc-count">{{ historyGifts.length }} 份</span>
          </div>

          <div v-if="!historyGifts.length" class="gc-empty">
            <div class="gc-empty-icon"><History :size="42" :stroke-width="1.5" aria-hidden="true" /></div>
            <h3>还没有历史礼物</h3>
            <p>已送达或过期的礼物会记录在这里。</p>
          </div>

          <div v-else class="gc-list">
            <div v-for="gift in historyGifts" :key="gift.id" class="gc-list-row">
              <div class="gc-list-main">
                <span class="gc-list-no">#{{ gift.gift_no }}</span>
                <strong>{{ gift.gift_content }}</strong>
              </div>
              <div class="gc-list-meta">
                <span>{{ formatDateShort(gift.created_at) }}</span>
                <span class="gc-status-chip is-flat" :class="gift.gift_status">{{ getStatusLabel(gift.gift_status) }}</span>
              </div>
            </div>
          </div>

          <!-- 海报申请 -->
          <section v-if="posterRequests.length" class="poster-block">
            <div class="gc-section-head">
              <div>
                <p class="gc-eyebrow">Poster</p>
                <h3>八周年海报申请</h3>
              </div>
            </div>
            <div class="gc-list">
              <div v-for="request in posterRequests" :key="request.id" class="gc-list-row">
                <div class="gc-list-main">
                  <span class="gc-list-no">#{{ formatPosterNo(request) }}</span>
                  <strong>{{ request.recipient }}</strong>
                </div>
                <div class="gc-list-meta">
                  <span>物料费 RMB {{ Number(request.material_fee) || 5 }}</span>
                  <span class="gc-status-chip is-flat" :class="request.status">{{ getPosterStatusLabel(request.status) }}</span>
                </div>
              </div>
            </div>
          </section>
        </section>
      </template>
    </div>

    <!-- AI 识别确认弹窗 -->
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Gift, MapPin, History, Plus, Pencil, Trash2, ChevronRight, Sparkles, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { callVaultSiliconChat } from '@/utils/api/api-key-runtime-api.js';
import { listActiveBohaiModelConfigs, buildBohaiRuntimeModels } from '@/utils/api/bohai-model-config-api.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory, isGiftExpiredCompleted } from '@/utils/gift-archive.js';
import { resolveSettingsBackLocation } from '@/utils/user-space-navigation.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

const dialog = useConfirmDialog();

// --- 提示 ---
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

// --- 状态 ---
const activeTab = ref('gifts'); // 'gifts' | 'address' | 'history'
const loading = ref(true);
const mainLoadError = ref('');
const currentGift = ref(null);
const historyGifts = ref([]);
const posterRequests = ref([]);
const addresses = ref([]);

// 地址表单
const isEditing = ref(false);
const editingId = ref(null);
const saving = ref(false);
const showAiPaste = ref(false);
const pastedText = ref('');
const isProcessingAI = ref(false);
const showAiConfirm = ref(false);
const aiResult = reactive({ recipient: '', phone: '', address: '' });
const form = reactive({ recipient: '', phone: '', region: '', detail: '', tag: '', is_default: false });

const TASK_TIMEOUT_MS = 12000;

const withTaskTimeout = (promise, timeoutMs = TASK_TIMEOUT_MS, message = '请求超时，请稍后重试') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((error) => { clearTimeout(timer); reject(error); });
  });

// --- 页面/导航 ---
const switchTab = (tab) => {
  activeTab.value = tab;
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

// --- 礼物状态映射 ---
const STEPS = [
  { key: 'requested', label: '已收到请求' },
  { key: 'processing', label: '正在处理' },
  { key: 'shipped', label: '已寄出' },
  { key: 'completed', label: '已送达' }
];
const trackSteps = STEPS;

const currentStatus = computed(() => {
  const status = currentGift.value?.gift_status || 'preparing';
  const map = { 'preparing': 0, 'processing': 1, 'shipped': 2, 'completed': 3 };
  return map[status] ?? 0;
});

const appleProgressWidth = computed(() => (currentStatus.value / 3) * 100);

const getStatusLabel = (s) => {
  const map = {
    'preparing': '备货中',
    'processing': '正在处理',
    'shipped': '已发货',
    'completed': '已完成'
  };
  return map[s] || s;
};

const getAppleStatusTitle = computed(() => {
  if (!currentGift.value) return '待命中的礼物';
  const status = currentGift.value.gift_status;
  const dateSource = status === 'completed'
    ? (currentGift.value.completed_at || currentGift.value.updated_at || currentGift.value.created_at)
    : (currentGift.value.updated_at || currentGift.value.created_at);
  const date = formatDateShort(dateSource);
  if (status === 'preparing') return `备货中 ${date}`;
  if (status === 'processing') return `正在处理 ${date}`;
  if (status === 'shipped') return `已发货 ${date}`;
  if (status === 'completed') return `已送达 ${date}`;
  return '订单状态';
});

const getAppleStatusDesc = computed(() => {
  if (!currentGift.value) return '方块之家正在为你构思一份特别的礼物。';
  const status = currentGift.value.gift_status;
  if (status === 'preparing') return '我们已收到你的礼物请求，正在准备精美礼品。';
  if (status === 'processing') return '礼物正在快马加鞭包装中，即将离开方块之家。';
  if (status === 'shipped') return '你的礼物已在路上，请留意快递信息或取货通知。';
  if (status === 'completed') return '礼物已成功送达，希望它能为你带来快乐。';
  return '';
});

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

const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}月 ${date.getDate()}日`;
};

// --- 地址计算 ---
const sortedAddresses = computed(() => {
  return [...addresses.value].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
});

// --- 地址 CRUD ---
const loadAddresses = async () => {
  const uid = userInfo.value?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('user_addresses')
    .select('*')
    .eq('user_id', uid)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    logger.warn('gift-center', '加载地址失败:', error);
    return [];
  }
  addresses.value = Array.isArray(data) ? data : [];
  return addresses.value;
};

const openCreateAddress = () => {
  resetForm();
  editingId.value = null;
  isEditing.value = true;
  showAiPaste.value = false;
};

const openEditAddress = (addr) => {
  form.recipient = addr.recipient || '';
  form.phone = addr.phone || '';
  form.region = addr.region || '';
  form.detail = addr.detail || '';
  form.tag = addr.tag || '';
  form.is_default = Boolean(addr.is_default);
  editingId.value = addr.id;
  isEditing.value = true;
  showAiPaste.value = false;
};

const closeAddressForm = () => {
  isEditing.value = false;
  editingId.value = null;
  pastedText.value = '';
};

const resetForm = () => {
  form.recipient = '';
  form.phone = '';
  form.region = '';
  form.detail = '';
  form.tag = '';
  form.is_default = false;
  pastedText.value = '';
};

const clearDefaultOthers = async () => {
  const uid = userInfo.value?.id;
  if (!uid) return;
  await supabase
    .from('user_addresses')
    .update({ is_default: false })
    .eq('user_id', uid)
    .eq('is_default', true);
};

const saveAddress = async () => {
  const uid = userInfo.value?.id;
  if (!uid) return showNotice('请先登录后再操作');

  if (!form.recipient.trim()) return showNotice('请填写收件人');
  const phoneRaw = String(form.phone || '').trim();
  if (!phoneRaw) return showNotice('请填写联系电话');
  if (phoneRaw.length < 5 || phoneRaw.length > 20) return showNotice('电话长度需在 5-20 位之间');
  if (!form.detail.trim() && !form.region.trim()) return showNotice('请填写收货地址');

  saving.value = true;
  try {
    const isDefault = Boolean(form.is_default) || addresses.value.length === 0;
    if (isDefault) await clearDefaultOthers();

    const payload = {
      user_id: uid,
      recipient: form.recipient.trim(),
      phone: phoneRaw,
      region: form.region.trim(),
      detail: form.detail.trim(),
      tag: form.tag,
      is_default: isDefault
    };

    let error = null;
    if (editingId.value) {
      const res = await supabase.from('user_addresses').update(payload).eq('id', editingId.value);
      error = res.error;
    } else {
      const res = await supabase.from('user_addresses').insert(payload);
      error = res.error;
    }

    if (error) {
      logger.warn('gift-center', '保存地址失败:', error);
      return showNotice('保存失败: ' + (error.message || '未知错误'), 'error');
    }

    await loadAddresses();
    closeAddressForm();
    showNotice(isDefault ? '地址已保存为默认' : '地址已保存');
  } catch (err) {
    logger.error('gift-center', '保存地址异常:', err);
    showNotice('系统错误，请稍后再试', 'error');
  } finally {
    saving.value = false;
  }
};

const setDefaultAddress = async (addr) => {
  if (saving.value) return;
  saving.value = true;
  try {
    await clearDefaultOthers();
    const { error } = await supabase.from('user_addresses').update({ is_default: true }).eq('id', addr.id);
    if (error) throw error;
    await loadAddresses();
    showNotice('已将地址设为默认');
  } catch (err) {
    logger.error('gift-center', '设置默认地址失败:', err);
    showNotice('操作失败，请稍后再试', 'error');
  } finally {
    saving.value = false;
  }
};

const deleteAddress = async (addr) => {
  const confirmed = await dialog.confirm({
    title: '删除收货地址',
    message: `确认删除收件人「${addr.recipient || '未填写'}」的地址吗？删除后无法用于礼物寄送。`,
    tone: 'danger',
    confirmText: '删除'
  }).catch(() => false);
  if (!confirmed) return;

  saving.value = true;
  try {
    const { error } = await supabase.from('user_addresses').delete().eq('id', addr.id);
    if (error) throw error;
    await loadAddresses();

    // 删除默认地址后自动提升最新一条为默认
    if (addr.is_default && addresses.value.length) {
      const fallback = addresses.value[0];
      await supabase.from('user_addresses').update({ is_default: true }).eq('id', fallback.id);
      await loadAddresses();
    }
    showNotice('地址已删除');
  } catch (err) {
    logger.error('gift-center', '删除地址失败:', err);
    showNotice('删除失败，请稍后再试', 'error');
  } finally {
    saving.value = false;
  }
};

// --- AI 识别（GLM 未配置时优雅降级） ---
// Fast 模式配置好的 AI 模型（服务端按 mode 解析 bohai_model_configs，这里仅确认可用并携带 mode）
const aiFastModel = ref(null);

const loadAIFastModel = async () => {
  try {
    const result = await listActiveBohaiModelConfigs();
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      logger.warn('gift-center', 'BOHAI 模型配置读取失败:', result.error?.message || 'no config');
      return null;
    }
    const { chatModes, availableModels } = buildBohaiRuntimeModels(result.data);
    const mode = chatModes.find((m) => m.id === 'fast') || chatModes[0];
    const resolved = availableModels.find((m) => m.id === mode?.model) || availableModels[0];
    aiFastModel.value = {
      modeId: mode?.id || 'fast',
      provider: resolved?.providerKey || 'boh',
      url: resolved?.url || '',
      modelTag: resolved?.id || 'boh:fast'
    };
    return aiFastModel.value;
  } catch (err) {
    logger.warn('gift-center', '加载 BOHAI Fast 模型配置失败:', err);
    return null;
  }
};

const extractJsonPayload = (rawText = '') => {
  const normalizedText = String(rawText || '').trim();
  if (!normalizedText) return null;
  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const directSource = fencedMatch?.[1] || normalizedText;
  const jsonBlockMatch = directSource.match(/\{[\s\S]*\}/);
  const source = (jsonBlockMatch?.[0] || directSource).trim();
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
};

const normalizePhone = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return hasLeadingPlus ? `+${digits}` : digits;
};

const handleAIExtract = async () => {
  if (!pastedText.value.trim()) return showNotice('请先粘贴地址原文');
  const model = aiFastModel.value || (await loadAIFastModel());
  if (!model?.modeId) return showNotice('AI 地址识别模型未配置，请手动填写');
  isProcessingAI.value = true;
  const systemPrompt = [
    '你是一个地址信息提取助手。',
    '从用户粘贴的文本中提取收件人姓名、联系电话、省市区、详细地址。',
    '只返回 JSON。',
    '返回格式: {"recipient":"...","phone":"...","region":"...","detail":"..."}'
  ].join('');
  try {
    const payload = {
      model: model.modelTag,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: pastedText.value }],
      temperature: 0.1,
      stream: false
    };
    const vaultResult = await callVaultSiliconChat({
      provider: model.provider,
      purpose: 'chat',
      mode: model.modeId,
      apiUrl: model.url,
      payload,
      timeoutMs: 12000
    });
    if (!vaultResult.ok) throw new Error(vaultResult.error?.message || 'AI 识别代理请求失败');
    const rawContent = vaultResult.data?.choices?.[0]?.message?.content;
    const result = extractJsonPayload(rawContent);
    if (!result || typeof result !== 'object') throw new Error('AI 返回内容不可解析');
    aiResult.recipient = String(result.recipient || '').trim();
    aiResult.phone = normalizePhone(result.phone || '');
    aiResult.region = String(result.region || '').trim();
    aiResult.detail = String(result.detail || '').trim();
    if (!aiResult.recipient && !aiResult.phone && !aiResult.region && !aiResult.detail) {
      return showNotice('AI 未识别到有效信息，请补充文本');
    }
    showAiConfirm.value = true;
  } catch (err) {
    logger.error('gift-center', 'AI 地址识别失败:', err);
    showNotice('AI 识别失败，请手动填写');
  } finally {
    isProcessingAI.value = false;
  }
};

const applyAiResult = () => {
  if (aiResult.recipient) form.recipient = aiResult.recipient;
  if (aiResult.phone) form.phone = aiResult.phone;
  if (aiResult.region) form.region = aiResult.region;
  if (aiResult.detail) form.detail = aiResult.detail;
  showAiConfirm.value = false;
  pastedText.value = '';
};

// --- 数据加载 ---
const loadHistoryGifts = async (uid = userInfo.value?.id) => {
  if (!uid || historyGifts.value.length) return;
  try {
    const { data, error } = await withTaskTimeout(
      supabase
        .from('user_gifts')
        .select('id, user_id, gift_no, gift_content, gift_price, gift_image, gift_status, is_active, completed_at, created_at, updated_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    );
    if (error) throw error;
    let normalizedGifts = Array.isArray(data) ? [...data] : [];
    const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);
    if (expiredGiftIds.length > 0) {
      normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);
    }
    const currentGiftId = currentGift.value?.id;
    historyGifts.value = normalizedGifts.filter((gift) => gift.id !== currentGiftId);
  } catch (err) {
    logger.warn('gift-center', '加载历史礼物失败:', err);
    historyGifts.value = [];
  }
};

const loadData = async () => {
  loading.value = true;
  mainLoadError.value = '';
  try {
    const uid = userInfo.value?.id;
    if (!uid) throw new Error('NOT_LOGGED_IN');

    const [profileRes, activeGiftRes] = await Promise.allSettled([
      withTaskTimeout(
        Promise.all([
          supabase.from('profiles').select('id, shipping_recipient, shipping_phone, shipping_address').eq('id', uid).single(),
          supabase.rpc('get_my_sensitive_profile')
        ]).then(([pub, sec]) => ({
          data: { ...(pub.data || {}), ...(sec.data || {}) },
          error: pub.error || sec.error
        }))
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

    if (profileRes.status === 'rejected') throw profileRes.reason;
    const pData = profileRes.value?.data || {};

    const activeGiftData = activeGiftRes.status === 'fulfilled' ? activeGiftRes.value?.data : null;
    if (!activeGiftRes.value?.error && Array.isArray(activeGiftData) && activeGiftData.length) {
      let normalizedCurrentGift = activeGiftData[0];
      if (isGiftExpiredCompleted(normalizedCurrentGift)) {
        normalizedCurrentGift = { ...normalizedCurrentGift, is_active: false };
      }
      currentGift.value = normalizedCurrentGift?.is_active ? normalizedCurrentGift : null;
    } else if (pData.gift_content) {
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

    // 地址 + 历史 + 海报并行
    await Promise.all([
      loadAddresses(),
      loadHistoryGifts(uid),
      loadPosters(uid)
    ]);

    // 旧数据迁移（仅当新表为空且 profiles 有旧字段时执行）
    await migrateLegacyAddress(profileRes.value?.data || {});
  } catch (err) {
    logger.error('gift-center', '加载失败:', err);
    mainLoadError.value = err?.message || '加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
};

const loadPosters = async (uid) => {
  if (!uid) return;
  try {
    const { data, error } = await supabase
      .from('poster_requests')
      .select('id, recipient, material_fee, status, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    posterRequests.value = (!error && Array.isArray(data)) ? data : [];
  } catch {
    posterRequests.value = [];
  }
};

const migrateLegacyAddress = async (profile) => {
  if (!profile || addresses.value.length > 0) return;
  const recipient = String(profile.shipping_recipient || '').trim();
  const phone = String(profile.shipping_phone || '').trim();
  const detail = String(profile.shipping_address || '').trim();
  if (!recipient && !phone && !detail) return;

  const { error } = await supabase.from('user_addresses').insert({
    user_id: userInfo.value?.id,
    recipient: recipient || '本人',
    phone,
    region: '',
    detail,
    tag: '',
    is_default: true
  });
  if (error) {
    logger.warn('gift-center', '迁移旧收货地址失败:', error);
    return;
  }
  await loadAddresses();
  showNotice('原有的收货信息已迁移为默认地址');
};

onMounted(() => {
  if (isLoggedIn.value) {
    void loadAIFastModel();
    void loadData();
  } else {
    router.push('/login');
  }
});

onBeforeUnmount(() => {
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<style scoped src="./style.scoped.css"></style>