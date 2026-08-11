<template>
  <div class="address-manager" :class="[`variant-${variant}`]">
    <!-- 内部提示 -->
    <transition name="am-toast-fade">
      <div v-if="notice.visible" class="am-toast" :class="notice.type" @click="notice.visible = false">
        {{ notice.text }}
      </div>
    </transition>

    <!-- 区块头 -->
    <div v-if="showHeader" class="am-section-head">
      <div>
        <p class="am-eyebrow">Shipping</p>
        <h2>收货地址</h2>
      </div>
      <button v-if="!isEditing" type="button" class="am-btn am-btn-primary" @click="openCreateAddress">
        <Plus :size="15" aria-hidden="true" />
        添加地址
      </button>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="am-loading">
      <div v-for="n in 2" :key="`sk-${n}`" class="am-skeleton-card" />
    </div>

    <template v-else>
      <!-- 编辑表单 -->
      <div v-if="isEditing" class="am-card am-form">
        <div class="am-form-head">
          <h3>{{ editingId ? '编辑地址' : '添加地址' }}</h3>
          <button type="button" class="am-icon-btn" title="关闭" @click="closeAddressForm">
            <X :size="17" aria-hidden="true" />
          </button>
        </div>

        <!-- AI 智能填充 -->
        <div class="am-ai-paste">
          <button
            type="button"
            class="am-ai-paste-toggle"
            :class="{ open: showAiPaste }"
            @click="showAiPaste = !showAiPaste"
          >
            <Sparkles :size="14" aria-hidden="true" />
            AI 智能填充
            <ChevronRight :size="14" :class="{ 'rotate-90': showAiPaste }" aria-hidden="true" />
          </button>
          <div v-if="showAiPaste" class="am-ai-paste-body">
            <textarea v-model="pastedText" placeholder="粘贴一段完整的收货信息，AI 自动识别并填入表单…"></textarea>
            <button class="am-btn am-btn-soft" type="button" :disabled="isProcessingAI" @click="handleAIExtract">
              <span v-if="isProcessingAI" class="am-mini-spinner"></span>
              <span v-else>开始智能识别</span>
            </button>
          </div>
        </div>

        <!-- 表单字段 -->
        <div class="am-form-grid">
          <label class="am-field">
            <span>收件人</span>
            <input v-model="form.recipient" type="text" placeholder="请输入收件人姓名" />
          </label>
          <label class="am-field">
            <span>联系电话</span>
            <input v-model="form.phone" type="text" placeholder="用于快递联系" />
          </label>
          <label class="am-field">
            <span>省市区</span>
            <input v-model="form.region" type="text" placeholder="省 / 市 / 区县（可选）" />
          </label>
          <label class="am-field">
            <span>标签</span>
            <select v-model="form.tag">
              <option value="">无标签</option>
              <option value="家">家</option>
              <option value="公司">公司</option>
              <option value="学校">学校</option>
            </select>
          </label>
          <label class="am-field am-field-full">
            <span>详细地址</span>
            <textarea v-model="form.detail" rows="2" placeholder="街道、门牌号、楼层等"></textarea>
          </label>
        </div>

        <label class="am-default-toggle">
          <input type="checkbox" v-model="form.is_default" />
          <span class="am-toggle-ui"></span>
          <span>设为默认收货地址</span>
        </label>

        <div class="am-form-actions">
          <button class="am-btn am-btn-ghost" type="button" :disabled="saving" @click="closeAddressForm">取消</button>
          <button class="am-btn am-btn-primary" type="button" :disabled="saving" @click="saveAddress">
            {{ saving ? '保存中…' : '保存地址' }}
          </button>
        </div>
      </div>

      <!-- 地址列表 -->
      <div v-else class="am-grid">
        <article
          v-for="addr in sortedAddresses"
          :key="addr.id"
          class="am-card am-addr-card"
          :class="{ 'is-default': addr.is_default }"
        >
          <div class="am-addr-card-head">
            <div class="am-addr-person">
              <strong>{{ addr.recipient || '未填写' }}</strong>
              <span class="am-addr-phone">{{ addr.phone || '—' }}</span>
            </div>
            <div class="am-addr-tags">
              <span v-if="addr.is_default" class="am-addr-badge is-default">默认</span>
              <span v-if="addr.tag" class="am-addr-badge">{{ addr.tag }}</span>
            </div>
          </div>
          <p class="am-addr-detail">
            <span v-if="addr.region" class="am-addr-region">{{ addr.region }}</span>
            {{ addr.detail || '未填写详细地址' }}
          </p>
          <div class="am-addr-card-foot">
            <button
              v-if="!addr.is_default"
              type="button"
              class="am-link"
              :disabled="saving"
              @click="setDefaultAddress(addr)"
            >
              设为默认
            </button>
            <span v-else class="am-addr-default-hint">寄送默认使用该地址</span>
            <div class="am-addr-card-ops">
              <button type="button" class="am-addr-op" title="编辑" :disabled="saving" @click="openEditAddress(addr)">
                <Pencil :size="14" aria-hidden="true" />
              </button>
              <button type="button" class="am-addr-op is-danger" title="删除" :disabled="saving" @click="deleteAddress(addr)">
                <Trash2 :size="14" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        <button v-if="!isEditing" type="button" class="am-add-tile" @click="openCreateAddress">
          <Plus :size="22" aria-hidden="true" />
          <span>添加新地址</span>
        </button>

        <div v-if="!addresses.length && !isEditing" class="am-empty-note">
          还没有收货地址，添加一个默认地址，礼物和商品就能顺利送到你手中。
        </div>
      </div>
    </template>

    <!-- AI 识别确认弹窗 -->
    <div v-if="showAiConfirm" class="am-modal-overlay" @click.self="showAiConfirm = false">
      <div class="am-confirm-modal">
        <h3>确认识别结果</h3>
        <div class="am-confirm-content">
          <p><strong>收件人:</strong> {{ aiResult.recipient || '—' }}</p>
          <p><strong>电话:</strong> {{ aiResult.phone || '—' }}</p>
          <p><strong>地址:</strong> {{ aiResult.region }} {{ aiResult.detail }}</p>
        </div>
        <div class="am-modal-actions">
          <button @click="showAiConfirm = false">重试</button>
          <button class="primary" @click="applyAiResult">确认填充</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { Plus, Pencil, Trash2, ChevronRight, Sparkles, X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';
import { callVaultSiliconChat } from '@/utils/api/api-key-runtime-api.js';
import { listActiveBohaiModelConfigs, buildBohaiRuntimeModels } from '@/utils/api/bohai-model-config-api.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';

const props = defineProps({
  variant: {
    type: String,
    default: 'solid',
    validator: (v) => ['solid', 'glass'].includes(v)
  },
  showHeader: {
    type: Boolean,
    default: true
  },
  autoLoad: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['loaded']);

const dialog = useConfirmDialog();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

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

// --- 状态 ---
const loading = ref(true);
const addresses = ref([]);

// 地址表单
const isEditing = ref(false);
const editingId = ref(null);
const saving = ref(false);
const showAiPaste = ref(false);
const pastedText = ref('');
const isProcessingAI = ref(false);
const showAiConfirm = ref(false);
const aiResult = reactive({ recipient: '', phone: '', region: '', detail: '' });
const form = reactive({ recipient: '', phone: '', region: '', detail: '', tag: '', is_default: false });

// --- 计算 ---
const sortedAddresses = computed(() => {
  return [...addresses.value].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
});

// --- 地址 CRUD ---
const loadAddresses = async () => {
  const uid = userInfo.value?.id;
  if (!uid) { loading.value = false; return []; }
  const { data, error } = await supabase
    .from('user_addresses')
    .select('*')
    .eq('user_id', uid)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  loading.value = false;
  if (error) {
    logger.warn('address-manager', '加载地址失败:', error);
    return [];
  }
  addresses.value = Array.isArray(data) ? data : [];
  emit('loaded', addresses.value);
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
      logger.warn('address-manager', '保存地址失败:', error);
      return showNotice('保存失败: ' + (error.message || '未知错误'), 'error');
    }

    await loadAddresses();
    closeAddressForm();
    showNotice(isDefault ? '地址已保存为默认' : '地址已保存');
  } catch (err) {
    logger.error('address-manager', '保存地址异常:', err);
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
    logger.error('address-manager', '设置默认地址失败:', err);
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
    logger.error('address-manager', '删除地址失败:', err);
    showNotice('删除失败，请稍后再试', 'error');
  } finally {
    saving.value = false;
  }
};

// --- 旧数据迁移（profiles.shipping_* → user_addresses） ---
const migrateLegacyAddress = async () => {
  if (addresses.value.length > 0) return;
  const uid = userInfo.value?.id;
  if (!uid) return;

  try {
    const [pubRes, secRes] = await Promise.all([
      supabase.from('profiles').select('shipping_recipient, shipping_phone, shipping_address').eq('id', uid).single(),
      supabase.rpc('get_my_sensitive_profile')
    ]);
    const profile = { ...(pubRes.data || {}), ...(secRes.data || {}) };
    const recipient = String(profile.shipping_recipient || '').trim();
    const phone = String(profile.shipping_phone || '').trim();
    const detail = String(profile.shipping_address || '').trim();
    if (!recipient && !phone && !detail) return;

    const { error } = await supabase.from('user_addresses').insert({
      user_id: uid,
      recipient: recipient || '本人',
      phone,
      region: '',
      detail,
      tag: '',
      is_default: true
    });
    if (error) {
      logger.warn('address-manager', '迁移旧收货地址失败:', error);
      return;
    }
    await loadAddresses();
    showNotice('原有的收货信息已迁移为默认地址');
  } catch (err) {
    logger.warn('address-manager', '迁移旧收货地址异常:', err);
  }
};

// --- AI 识别 ---
const aiFastModel = ref(null);

const loadAIFastModel = async () => {
  try {
    const result = await listActiveBohaiModelConfigs();
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
      logger.warn('address-manager', 'BOHAI 模型配置读取失败:', result.error?.message || 'no config');
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
    logger.warn('address-manager', '加载 BOHAI Fast 模型配置失败:', err);
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
    logger.error('address-manager', 'AI 地址识别失败:', err);
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

// --- 暴露方法 ---
defineExpose({
  load: loadAddresses,
  addresses,
  showNotice
});

// --- 初始化 ---
onMounted(async () => {
  if (props.autoLoad) {
    void loadAIFastModel();
    await loadAddresses();
    await migrateLegacyAddress();
  }
});
</script>

<style scoped>
/* ============================================
   CSS 变量 · 主题变体
   ============================================ */
.address-manager {
  --am-blue: #007aff;
  --am-blue-press: #0066d6;
  --am-blue-soft: rgba(0, 122, 255, 0.12);
  --am-text: #1d1d1f;
  --am-text-secondary: #86868b;
  --am-fill: #f5f5f7;
  --am-radius-card: 20px;
  --am-radius-form: 24px;
  --am-ease: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* solid（默认 · 礼物中心同款） */
  --am-card-bg: #ffffff;
  --am-card-border: rgba(0, 0, 0, 0.05);
  --am-card-shadow: 0 8px 28px rgba(0, 0, 0, 0.05);
  --am-card-hover-shadow: 0 14px 38px rgba(0, 0, 0, 0.08);
  --am-input-bg: #ffffff;
  --am-input-border: rgba(0, 0, 0, 0.12);
  --am-input-focus-shadow: 0 0 0 3px var(--am-blue-soft);
  --am-divider: rgba(0, 0, 0, 0.06);
  --am-paste-bg: var(--am-fill);
  --am-confirm-bg: var(--am-fill);
  --am-overlay-bg: rgba(0, 0, 0, 0.45);
  --am-modal-bg: #ffffff;
}

.address-manager.variant-glass {
  --am-card-bg: rgba(255, 255, 255, 0.55);
  --am-card-border: rgba(255, 255, 255, 0.5);
  --am-card-shadow: 0 8px 24px rgba(15, 23, 42, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  --am-card-hover-shadow: 0 14px 32px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  --am-input-bg: rgba(255, 255, 255, 0.7);
  --am-input-border: rgba(255, 255, 255, 0.6);
  --am-divider: rgba(255, 255, 255, 0.4);
  --am-paste-bg: rgba(255, 255, 255, 0.4);
  --am-confirm-bg: rgba(255, 255, 255, 0.4);
}

/* 深色模式 · 仅 glass 变体跟随 user-space-page 主题 */
:global(.user-space-page[data-theme="dark"]) .address-manager.variant-glass {
  --am-text: #f5f7fa;
  --am-text-secondary: #8b8e96;
  --am-fill: rgba(255, 255, 255, 0.06);
  --am-card-bg: rgba(24, 26, 32, 0.55);
  --am-card-border: rgba(255, 255, 255, 0.1);
  --am-card-shadow: 0 12px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --am-card-hover-shadow: 0 16px 36px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --am-input-bg: rgba(255, 255, 255, 0.06);
  --am-input-border: rgba(255, 255, 255, 0.12);
  --am-divider: rgba(255, 255, 255, 0.1);
  --am-paste-bg: rgba(255, 255, 255, 0.04);
  --am-confirm-bg: rgba(255, 255, 255, 0.04);
}

.address-manager {
  width: 100%;
  color: var(--am-text);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "PingFang SC", sans-serif;
  box-sizing: border-box;
}

/* ============================================
   提示 Toast
   ============================================ */
.am-toast {
  position: fixed;
  top: 88px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  padding: 12px 26px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  max-width: 90vw;
  text-align: center;
  background: rgba(29, 29, 31, 0.92);
  color: #ffffff;
}
.am-toast.error { background: rgba(255, 59, 48, 0.94); }
.am-toast.success { background: rgba(52, 199, 89, 0.94); }
.am-toast-fade-enter-active, .am-toast-fade-leave-active { transition: opacity 0.3s var(--am-ease), transform 0.3s var(--am-ease); }
.am-toast-fade-enter-from, .am-toast-fade-leave-to { opacity: 0; transform: translate(-50%, -12px); }

/* ============================================
   区块头
   ============================================ */
.am-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.am-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--am-blue);
  margin-bottom: 3px;
}
.am-section-head h2 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }

/* ============================================
   按钮
   ============================================ */
.am-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 12px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 18px;
  transition: background-color 0.25s ease, transform 0.15s ease, opacity 0.2s ease;
}
.am-btn:active { transform: scale(0.97); }
.am-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.am-btn-primary { background: var(--am-blue); color: #ffffff; }
.am-btn-primary:not(:disabled):hover { background: var(--am-blue-press); }
.am-btn-ghost { background: var(--am-fill); color: var(--am-text); }
.am-btn-ghost:hover { background: rgba(0, 0, 0, 0.06); }
.am-btn-soft { background: var(--am-blue-soft); color: var(--am-blue); }
.am-btn-soft:not(:disabled):hover { background: rgba(0, 122, 255, 0.2); }

.am-icon-btn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  color: var(--am-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.15s ease;
}
.am-icon-btn:hover { background: rgba(0, 0, 0, 0.12); }
.am-icon-btn:active { transform: scale(0.9); }

.am-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: none;
  color: var(--am-blue);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 4px;
  border-radius: 999px;
  transition: background-color 0.2s ease;
}
.am-link:hover { background: var(--am-blue-soft); }
.am-link:disabled { opacity: 0.5; cursor: not-allowed; }

/* ============================================
   加载骨架
   ============================================ */
.am-loading { display: flex; flex-direction: column; gap: 16px; }
.am-skeleton-card {
  height: 150px;
  border-radius: var(--am-radius-card);
  background: var(--am-fill);
  position: relative;
  overflow: hidden;
  animation: am-skel 1.4s ease-in-out infinite alternate;
}
@keyframes am-skel { to { opacity: 0.5; } }

/* ============================================
   通用卡片
   ============================================ */
.am-card {
  background: var(--am-card-bg);
  border: 1px solid var(--am-card-border);
  border-radius: var(--am-radius-card);
  box-shadow: var(--am-card-shadow);
}
.variant-glass .am-card {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* ============================================
   地址网格
   ============================================ */
.am-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.am-addr-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: box-shadow 0.25s ease, transform 0.2s var(--am-ease), border-color 0.25s ease;
}
.am-addr-card:hover { box-shadow: var(--am-card-hover-shadow); transform: translateY(-2px); }
.am-addr-card.is-default { border-color: rgba(0, 122, 255, 0.45); }

.am-addr-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.am-addr-person { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.am-addr-person strong { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
.am-addr-phone { font-size: 13px; color: var(--am-text-secondary); font-weight: 500; }

.am-addr-tags { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.am-addr-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--am-text-secondary);
  background: var(--am-fill);
  padding: 3px 9px;
  border-radius: 999px;
}
.am-addr-badge.is-default {
  color: #ffffff;
  background: var(--am-blue);
  box-shadow: 0 3px 10px rgba(0, 122, 255, 0.3);
}

.am-addr-detail {
  font-size: 14px;
  line-height: 1.6;
  color: var(--am-text);
  word-break: break-all;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
}
.am-addr-region { font-weight: 600; }

.am-addr-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--am-divider);
  padding-top: 12px;
}
.am-addr-default-hint { font-size: 12px; color: var(--am-text-secondary); }
.am-addr-card-ops { display: flex; gap: 8px; }
.am-addr-op {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  color: var(--am-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.15s ease;
}
.variant-glass .am-addr-op { background: rgba(255, 255, 255, 0.3); }
.am-addr-op:hover { background: var(--am-blue-soft); color: var(--am-blue); }
.am-addr-op.is-danger:hover { background: rgba(255, 59, 48, 0.12); color: #ff3b30; }
.am-addr-op:active { transform: scale(0.9); }
.am-addr-op:disabled { opacity: 0.5; cursor: not-allowed; }

.am-add-tile {
  min-height: 150px;
  border: 2px dashed rgba(0, 122, 255, 0.4);
  border-radius: var(--am-radius-card);
  background: rgba(0, 122, 255, 0.04);
  color: var(--am-blue);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.15s ease, border-color 0.2s ease;
}
.am-add-tile:hover { background: rgba(0, 122, 255, 0.1); border-color: var(--am-blue); }
.am-add-tile:active { transform: scale(0.98); }

.am-empty-note {
  grid-column: 1 / -1;
  font-size: 13px;
  color: var(--am-text-secondary);
  text-align: center;
  padding: 6px 0;
}

/* ============================================
   地址表单
   ============================================ */
.am-form {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: am-form-in 0.35s var(--am-ease);
}
@keyframes am-form-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.am-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.am-form-head h3 { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; margin: 0; }

/* AI 智能填充 */
.am-ai-paste { display: flex; flex-direction: column; gap: 10px; }
.am-ai-paste-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  border: none;
  background: none;
  color: var(--am-blue);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 4px;
  border-radius: 999px;
  transition: background-color 0.2s ease;
}
.am-ai-paste-toggle:hover { background: var(--am-blue-soft); }
.am-ai-paste-toggle .rotate-90 { transform: rotate(90deg); }
.am-ai-paste-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--am-paste-bg);
  border-radius: 16px;
}
.am-ai-paste-body textarea {
  width: 100%;
  border: 1.5px solid var(--am-input-border);
  border-radius: 12px;
  background: var(--am-input-bg);
  padding: 12px 14px;
  font: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 72px;
  outline: none;
  box-sizing: border-box;
  color: var(--am-text);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.am-ai-paste-body textarea:focus {
  border-color: var(--am-blue);
  box-shadow: var(--am-input-focus-shadow);
}
.am-ai-paste-body .am-btn { align-self: flex-start; }

/* 表单字段 */
.am-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.am-field { display: flex; flex-direction: column; gap: 7px; }
.am-field > span { font-size: 13px; font-weight: 600; }
.am-field-full { grid-column: 1 / -1; }
.am-field input,
.am-field select,
.am-field textarea {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--am-input-border);
  border-radius: 12px;
  background: var(--am-input-bg);
  color: var(--am-text);
  font: inherit;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.am-field input:focus,
.am-field select:focus,
.am-field textarea:focus {
  border-color: var(--am-blue);
  box-shadow: var(--am-input-focus-shadow);
}
.am-field textarea { resize: vertical; min-height: 64px; }

/* 默认地址开关 */
.am-default-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.am-default-toggle input { display: none; }
.am-toggle-ui {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #dcdce1;
  position: relative;
  flex-shrink: 0;
  transition: background-color 0.25s ease;
}
.am-toggle-ui::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: transform 0.25s var(--am-ease);
}
.am-default-toggle input:checked + .am-toggle-ui { background: var(--am-blue); }
.am-default-toggle input:checked + .am-toggle-ui::after { transform: translateX(18px); }

.am-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--am-divider);
  padding-top: 16px;
}

/* ============================================
   AI 确认弹窗
   ============================================ */
.am-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--am-overlay-bg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.am-confirm-modal {
  width: min(420px, 90vw);
  background: var(--am-modal-bg);
  border-radius: 24px;
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3);
  animation: am-form-in 0.3s var(--am-ease);
}
.am-confirm-modal h3 { font-size: 19px; font-weight: 800; margin: 0; }
.am-confirm-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--am-confirm-bg);
  border-radius: 14px;
  font-size: 14px;
}
.am-confirm-content p { line-height: 1.5; word-break: break-all; margin: 0; }
.am-confirm-content strong { font-weight: 700; margin-right: 4px; }
.am-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.am-modal-actions button {
  border: none;
  border-radius: 12px;
  padding: 10px 20px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--am-fill);
  color: var(--am-text);
  transition: background-color 0.2s ease;
}
.am-modal-actions button.primary { background: var(--am-blue); color: #ffffff; }
.am-modal-actions button.primary:hover { background: var(--am-blue-press); }

/* 小加载圈 */
.am-mini-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(0, 122, 255, 0.3);
  border-top-color: var(--am-blue);
  animation: am-spin 0.7s linear infinite;
  vertical-align: -2px;
}
@keyframes am-spin { to { transform: rotate(360deg); } }

/* ============================================
   响应式
   ============================================ */
@media (max-width: 767px) {
  .am-form-grid { grid-template-columns: 1fr; }
  .am-field-full { grid-column: auto; }
  .am-section-head h2 { font-size: 22px; }
  .am-addr-card { padding: 16px; }
}

@media (orientation: landscape) and (max-height: 560px) {
  .am-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .am-form { padding: 16px; }
  .am-confirm-modal { max-width: 420px; }
  .am-confirm-content { max-height: 40vh; overflow-y: auto; }
}
</style>
