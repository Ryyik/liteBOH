<template>
  <div class="apple-panel" :class="{ 'is-page': mode === 'page' }">
    <!-- 页头 -->
    <header class="ap-header">
      <button v-if="mode === 'page'" type="button" class="ap-nav-btn" @click="goBack" aria-label="返回商城">
        <ChevronLeft :size="21" :stroke-width="1.5" aria-hidden="true" />
      </button>
      <div class="ap-header-text">
        <span class="ap-eyebrow">BOH Store</span>
        <h1>账户</h1>
        <p class="ap-username">{{ username }}</p>
      </div>
      <button v-if="mode === 'overlay'" type="button" class="ap-nav-btn" @click="$emit('close')" aria-label="关闭">
        <X :size="20" :stroke-width="1.5" aria-hidden="true" />
      </button>
    </header>

    <!-- 积分卡片 -->
    <div class="ap-points">
      <h2 class="ap-label">积分余额</h2>
      <p class="ap-points-number">{{ pointsDisplay }}</p>
    </div>

    <!-- 分割线 -->
    <hr class="ap-divider" />

    <!-- 收货地址 -->
    <section>
      <div class="ap-section-head">
        <div>
          <h2 class="ap-label">收货地址</h2>
          <p v-if="!loading && sortedAddresses.length" class="ap-count">{{ sortedAddresses.length }} 个地址</p>
        </div>
        <button v-if="!isEditing" type="button" class="ap-btn-primary" @click="openCreateAddress">
          <Plus :size="15" :stroke-width="2" aria-hidden="true" />
          添加
        </button>
      </div>

      <!-- Toast -->
      <transition name="toast-fade">
        <div v-if="toast.show" class="ap-toast" :class="toast.type">{{ toast.message }}</div>
      </transition>

      <!-- Loading -->
      <div v-if="loading" class="ap-loading">
        <div v-for="n in 2" :key="n" class="ap-skeleton"></div>
      </div>

      <!-- 编辑表单 -->
      <div v-else-if="isEditing" class="ap-form">
        <div class="ap-form-head">
          <h3>{{ editingId ? '编辑地址' : '新地址' }}</h3>
          <button type="button" class="ap-form-close" @click="closeAddressForm" aria-label="关闭">
            <X :size="15" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>

        <div class="ap-form-grid">
          <label class="ap-field">
            <span>收件人</span>
            <input v-model="form.recipient" type="text" placeholder="姓名" />
          </label>
          <label class="ap-field">
            <span>电话</span>
            <input v-model="form.phone" type="text" placeholder="手机号码" />
          </label>
          <label class="ap-field">
            <span>省市区</span>
            <input v-model="form.region" type="text" placeholder="省 / 市 / 区（选填）" />
          </label>
          <label class="ap-field">
            <span>标签</span>
            <select v-model="form.tag">
              <option value="">无</option>
              <option value="家">家</option>
              <option value="公司">公司</option>
              <option value="学校">学校</option>
            </select>
          </label>
          <label class="ap-field ap-field-full">
            <span>详细地址</span>
            <textarea v-model="form.detail" rows="2" placeholder="街道、门牌号、楼层"></textarea>
          </label>
        </div>

        <label class="ap-toggle">
          <input type="checkbox" v-model="form.is_default" />
          <span class="ap-toggle-track"></span>
          <span class="ap-toggle-label">设为默认地址</span>
        </label>

        <div class="ap-form-actions">
          <button type="button" class="ap-btn-ghost" :disabled="saving" @click="closeAddressForm">取消</button>
          <button type="button" class="ap-btn-filled" :disabled="saving" @click="saveAddress">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <!-- 地址列表 -->
      <div v-else class="ap-addr-list">
        <div
          v-for="addr in sortedAddresses"
          :key="addr.id"
          class="ap-addr-row"
          :class="{ 'is-default': addr.is_default }"
        >
          <div class="ap-addr-main">
            <div class="ap-addr-top">
              <span class="ap-addr-name">{{ addr.recipient || '未填写' }}</span>
              <span class="ap-addr-phone">{{ addr.phone || '—' }}</span>
              <span v-if="addr.is_default" class="ap-addr-default-mark">默认</span>
              <span v-if="addr.tag && !addr.is_default" class="ap-addr-tag">{{ addr.tag }}</span>
            </div>
            <p class="ap-addr-text">
              <span v-if="addr.region">{{ addr.region }} </span>{{ addr.detail || '未填写详细地址' }}
            </p>
          </div>
          <div class="ap-addr-actions">
            <button v-if="!addr.is_default" type="button" class="ap-action-link" :disabled="saving" @click="setDefaultAddress(addr)">
              设为默认
            </button>
            <button type="button" class="ap-action-icon" title="编辑" :disabled="saving" @click="openEditAddress(addr)">
              <Pencil :size="14" aria-hidden="true" />
            </button>
            <button type="button" class="ap-action-icon ap-action-danger" title="删除" :disabled="saving" @click="deleteAddress(addr)">
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button v-if="!isEditing" type="button" class="ap-addr-add" @click="openCreateAddress">
          <Plus :size="17" :stroke-width="1.8" aria-hidden="true" />
          添加新地址
        </button>

        <div v-if="!addresses.length && !isEditing && !loading" class="ap-empty">
          暂无收货地址
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ChevronLeft, Pencil, Plus, Trash2, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

defineProps({
  mode: { type: String, default: 'overlay' }
});

defineEmits(['close']);

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { userInfo, isLoggedIn } = storeToRefs(authStore);

const loading = ref(true);
const addresses = ref([]);
const isEditing = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = reactive({ recipient: '', phone: '', region: '', detail: '', tag: '', is_default: false });

const toast = reactive({ show: false, message: '', type: 'info' });
let toastTimer = null;
const showToast = (message, type = 'info') => {
  if (toastTimer) clearTimeout(toastTimer);
  toast.message = message;
  toast.type = type;
  toast.show = true;
  toastTimer = setTimeout(() => { toast.show = false; }, 3000);
};

const pointsDisplay = computed(() => {
  const pts = Number(userInfo.value?.points);
  return Number.isFinite(pts) ? Math.round(pts).toLocaleString() : '—';
});

const username = computed(() => {
  return userInfo.value?.username || '未登录';
});

const sortedAddresses = computed(() => {
  return [...addresses.value].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
});

const loadAddresses = async () => {
  const uid = userInfo.value?.id;
  if (!uid) { loading.value = false; return; }
  const { data, error } = await supabase
    .from('user_addresses')
    .select('*')
    .eq('user_id', uid)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    logger.warn('shop-account', '加载地址失败:', error);
  }
  addresses.value = Array.isArray(data) ? data : [];
  loading.value = false;
};

const openCreateAddress = () => {
  resetForm();
  editingId.value = null;
  isEditing.value = true;
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
};

const closeAddressForm = () => {
  isEditing.value = false;
  editingId.value = null;
};

const resetForm = () => {
  form.recipient = '';
  form.phone = '';
  form.region = '';
  form.detail = '';
  form.tag = '';
  form.is_default = false;
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
  if (!uid) return showToast('请先登录后再操作');

  if (!form.recipient.trim()) return showToast('请填写收件人');
  const phoneRaw = String(form.phone || '').trim();
  if (!phoneRaw) return showToast('请填写联系电话');
  if (phoneRaw.length < 5 || phoneRaw.length > 20) return showToast('电话长度需在 5-20 位之间');
  if (!form.detail.trim() && !form.region.trim()) return showToast('请填写收货地址');

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
      logger.warn('shop-account', '保存地址失败:', error);
      return showToast('保存失败', 'error');
    }

    await loadAddresses();
    closeAddressForm();
    showToast('已保存');
  } catch (err) {
    logger.error('shop-account', '保存地址异常:', err);
    showToast('系统错误', 'error');
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
    if (error) {
      logger.warn('shop-account', '设置默认地址失败:', error);
      return showToast('设置失败', 'error');
    }
    await loadAddresses();
    showToast('已设为默认');
  } catch (err) {
    logger.error('shop-account', '设置默认地址异常:', err);
    showToast('系统错误', 'error');
  } finally {
    saving.value = false;
  }
};

const deleteAddress = async (addr) => {
  if (saving.value) return;
  saving.value = true;
  try {
    const { error } = await supabase.from('user_addresses').delete().eq('id', addr.id);
    if (error) {
      logger.warn('shop-account', '删除地址失败:', error);
      return showToast('删除失败', 'error');
    }
    await loadAddresses();
    showToast('已删除');
  } catch (err) {
    logger.error('shop-account', '删除地址异常:', err);
    showToast('系统错误', 'error');
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  router.push('/shop');
};

onMounted(() => {
  if (isLoggedIn.value) {
    loadAddresses();
  } else {
    loading.value = false;
  }
});
</script>

<style scoped>
.apple-panel {
  --ap-bg: #ffffff;
  --ap-text: #1d1d1f;
  --ap-text-secondary: #86868b;
  --ap-text-tertiary: #aeaeaf;
  --ap-border: #d2d2d7;
  --ap-border-subtle: #e5e5ea;
  --ap-fill: #f5f5f7;
  --ap-fill-secondary: #fafafa;
  --ap-blue: #007aff;
  --ap-red: #ff3b30;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  color: var(--ap-text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ===== Header ===== */
.ap-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 0 28px;
}
.ap-header-text { flex: 1; min-width: 0; }
.ap-eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--ap-text-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ap-header h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.ap-username {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--ap-text-secondary);
  font-weight: 500;
}

.ap-nav-btn {
  width: 36px; height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--ap-text);
  background: var(--ap-fill);
  cursor: pointer;
  transition: background-color 160ms ease, transform 120ms ease;
}
.ap-nav-btn:hover { background: var(--ap-border-subtle); }
.ap-nav-btn:active { transform: scale(0.94); }

/* ===== Points ===== */
.ap-points {
  padding: 12px 0 8px;
}
.ap-label {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ap-text-secondary);
  letter-spacing: 0;
}
.ap-points-number {
  margin: 4px 0 0;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--ap-text);
}
.ap-points-number::after {
  content: ' 积分';
  font-size: 17px;
  font-weight: 500;
  color: var(--ap-text-secondary);
  letter-spacing: 0;
}

/* ===== Divider ===== */
.ap-divider {
  margin: 28px 0;
  border: 0;
  height: 1px;
  background: var(--ap-border-subtle);
}

/* ===== Section head ===== */
.ap-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.ap-section-head .ap-label { margin-bottom: 4px; }
.ap-count {
  margin: 0;
  font-size: 13px;
  color: var(--ap-text-tertiary);
}

/* ===== Buttons ===== */
.ap-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ap-text);
  background: var(--ap-fill);
  cursor: pointer;
  transition: background-color 160ms ease, transform 120ms ease;
}
.ap-btn-primary:hover { background: var(--ap-border-subtle); }
.ap-btn-primary:active { transform: scale(0.97); }

.ap-btn-filled, .ap-btn-ghost {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, opacity 160ms ease, transform 120ms ease;
}
.ap-btn-filled {
  color: #ffffff;
  background: var(--ap-text);
}
.ap-btn-filled:hover { background: #3a3a3c; }
.ap-btn-filled:active { transform: scale(0.97); }
.ap-btn-filled:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

.ap-btn-ghost {
  color: var(--ap-text-secondary);
  background: transparent;
}
.ap-btn-ghost:hover { color: var(--ap-text); background: var(--ap-fill); }
.ap-btn-ghost:disabled { opacity: 0.35; cursor: not-allowed; }

/* ===== Loading ===== */
.ap-loading { display: flex; flex-direction: column; gap: 8px; }
.ap-skeleton {
  height: 72px;
  border-radius: 14px;
  background: var(--ap-fill);
  animation: ap-skel 1.4s ease-in-out infinite alternate;
}
@keyframes ap-skel { to { opacity: 0.4; } }

/* ===== Form ===== */
.ap-form {
  padding: 24px;
  border-radius: 20px;
  background: var(--ap-fill-secondary);
  border: 1px solid var(--ap-border-subtle);
}
.ap-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.ap-form-head h3 { margin: 0; font-size: 17px; font-weight: 600; }
.ap-form-close {
  width: 28px; height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--ap-text-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.ap-form-close:hover { background: var(--ap-border-subtle); color: var(--ap-text); }

.ap-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.ap-field { display: flex; flex-direction: column; gap: 6px; }
.ap-field span {
  font-size: 12px;
  font-weight: 600;
  color: var(--ap-text-secondary);
}
.ap-field input, .ap-field select, .ap-field textarea {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--ap-border-subtle);
  border-radius: 10px;
  outline: 0;
  background: var(--ap-bg);
  font-size: 14px;
  color: var(--ap-text);
  font-family: inherit;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.ap-field textarea { height: auto; padding: 10px 12px; resize: vertical; min-height: 72px; }
.ap-field input:focus, .ap-field select:focus, .ap-field textarea:focus {
  border-color: var(--ap-blue);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.ap-field input::placeholder, .ap-field textarea::placeholder {
  color: var(--ap-text-tertiary);
}
.ap-field-full { grid-column: 1 / -1; }

.ap-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
  cursor: pointer;
}
.ap-toggle input { display: none; }
.ap-toggle-track {
  width: 44px; height: 26px;
  border-radius: 13px;
  background: #d1d1d6;
  position: relative;
  flex-shrink: 0;
  transition: background-color 200ms ease;
}
.ap-toggle-track::after {
  content: '';
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  position: absolute;
  top: 2px; left: 2px;
  transition: transform 200ms ease;
}
.ap-toggle input:checked + .ap-toggle-track { background: #34c759; }
.ap-toggle input:checked + .ap-toggle-track::after { transform: translateX(18px); }
.ap-toggle-label { font-size: 14px; color: var(--ap-text); }

.ap-form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
}

/* ===== Address list ===== */
.ap-addr-list { display: flex; flex-direction: column; }

.ap-addr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--ap-border-subtle);
}
.ap-addr-row:last-of-type { border-bottom: none; }
.ap-addr-main { flex: 1; min-width: 0; }

.ap-addr-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.ap-addr-name { font-size: 15px; font-weight: 600; }
.ap-addr-phone {
  font-size: 14px;
  color: var(--ap-text-secondary);
}
.ap-addr-default-mark {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ap-text);
  background: var(--ap-fill);
}
.ap-addr-tag {
  padding: 1px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ap-text-secondary);
  background: var(--ap-fill);
}

.ap-addr-text {
  margin: 0;
  font-size: 14px;
  color: var(--ap-text-secondary);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ap-addr-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.ap-action-link {
  border: 0;
  background: transparent;
  color: var(--ap-blue);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  transition: background-color 150ms ease;
  white-space: nowrap;
}
.ap-action-link:hover { background: rgba(0, 122, 255, 0.06); }
.ap-action-link:disabled { opacity: 0.35; cursor: not-allowed; }

.ap-action-icon {
  width: 32px; height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--ap-text-secondary);
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}
.ap-action-icon:hover { background: var(--ap-fill); color: var(--ap-text); }
.ap-action-icon.ap-action-danger:hover { background: rgba(255, 59, 48, 0.08); color: var(--ap-red); }
.ap-action-icon:disabled { opacity: 0.35; cursor: not-allowed; }

.ap-addr-add {
  width: 100%;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 0;
  border: 1px dashed var(--ap-border);
  border-radius: 12px;
  background: transparent;
  color: var(--ap-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease;
}
.ap-addr-add:hover { border-color: var(--ap-text); color: var(--ap-text); }

.ap-empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--ap-text-tertiary);
  font-size: 14px;
}

/* ===== Toast ===== */
.ap-toast {
  position: fixed;
  z-index: 200;
  left: 50%;
  bottom: 100px;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 20px;
  background: rgba(29, 29, 31, 0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: -0.01em;
}
.ap-toast.error { background: rgba(255, 59, 48, 0.92); }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 180ms ease, transform 200ms ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translate(-50%, 8px); }

/* ===== Page mode overrides ===== */
.is-page {
  padding: 0 24px 64px;
}
.is-page .ap-points-number { font-size: 48px; }

@media (max-width: 480px) {
  .is-page { padding: 0 16px 48px; }
  .is-page .ap-points-number { font-size: 40px; }
  .ap-header h1 { font-size: 28px; }
  .ap-form { padding: 18px; }
  .ap-form-grid { grid-template-columns: 1fr; }
}
</style>
