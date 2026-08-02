<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="modal-overlay" @click.self="closeEditModal">
        <div class="edit-profile-modal glass-card">
          <header class="modal-header">
            <div class="modal-header-left">
              <button class="close-btn" @click="closeEditModal">×</button>
              <h3>编辑资料</h3>
            </div>
            <button class="save-btn" @click="handleSaveProfile" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </header>
          <div class="modal-body custom-scrollbar">
            <div class="edit-banner-preview"></div>
            <div class="edit-avatar-preview">
              <div class="avatar-circle clickable" @click="$emit('avatar-click')">
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="avatar" class="edit-avatar-img" loading="lazy" />
                <span v-else>{{ profile.username?.charAt(0)?.toUpperCase?.() || 'U' }}</span>
                <div class="avatar-edit-icon-modal">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M23 19C23 21.2091 21.2091 23 19 23H5C2.79086 23 1 21.2091 1 19V8C1 5.79086 2.79086 4 5 4H9L11 1H13L15 4H19C21.2091 4 23 5.79086 23 8V19Z"
                      stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="12" cy="13" r="4" stroke="white" stroke-width="2" stroke-linecap="round"
                      stroke-linejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            <div class="edit-form-grid">
              <div class="form-group span-2">
                <label>用户名</label>
                <input type="text" v-model="editUsername" placeholder="您的用户名" maxlength="20" class="date-input-v2">
                <div class="char-count">{{ editUsername.length }}/20</div>
              </div>

              <div class="form-group span-2">
                <label>个人简介</label>
                <textarea v-model="editBio" placeholder="填写您的个人简介..." rows="4" maxlength="160"></textarea>
                <div class="char-count">{{ editBio.length }}/160</div>
              </div>

              <div class="form-group">
                <label>入群时间</label>
                <input type="date" v-model="editJoinDate" class="date-input-v2">
              </div>

              <div class="form-group">
                <label>生日 (月/日)</label>
                <div class="birthday-inputs">
                  <select v-model="editBirthMonth" class="date-select-v2">
                    <option value="" disabled>月</option>
                    <option v-for="m in 12" :key="m" :value="String(m)">{{ m }}月</option>
                  </select>
                  <select v-model="editBirthDay" class="date-select-v2">
                    <option value="" disabled>日</option>
                    <option v-for="d in 31" :key="d" :value="String(d)">{{ d }}日</option>
                  </select>
                </div>
              </div>

              <div class="form-group span-2 creator-verification-group">
                <div class="creator-verification-header">
                  <label>社交平台展示</label>
                  <button type="button" class="creator-verification-toggle"
                    :class="{ active: editCreatorEnabled }" @click="toggleCreatorVerification">
                    {{ editCreatorEnabled ? '关闭展示' : '开启展示' }}
                  </button>
                </div>
                <p class="creator-verification-tip">开启后可绑定你的社交平台 ID，并在个人主页展示平台 Tag；关闭后会清空已填写的平台 ID。</p>

                <div v-if="editCreatorEnabled" class="creator-platform-selector">
                  <label v-for="platform in creatorPlatformsMeta" :key="platform.key" class="creator-platform-chip">
                    <input v-model="editCreatorPlatforms[platform.key]" type="checkbox">
                    <span>{{ platform.label }}</span>
                  </label>
                </div>

                <div v-if="editCreatorEnabled && selectedCreatorPlatforms.length > 0" class="creator-platform-fields">
                  <div v-for="platform in selectedCreatorPlatforms" :key="platform.key" class="creator-id-input-row">
                    <div class="creator-id-input-row-header">
                      <label>{{ platform.label }}账号 ID</label>
                      <button type="button" class="creator-platform-jump-btn"
                        @click="openCreatorPlatformPage(platform.key, editCreatorIds[platform.key])">
                        {{ String(editCreatorIds[platform.key] || '').trim() ? '查看账号页' : '打开平台' }}
                      </button>
                    </div>
                    <div class="creator-visibility-row">
                      <span>可见性</span>
                      <select v-model="editCreatorVisibility[platform.key]" class="creator-visibility-select">
                        <option value="public">公开</option>
                        <option value="private">仅自己可见</option>
                      </select>
                    </div>
                    <input v-model="editCreatorIds[platform.key]" type="text" maxlength="64"
                      :placeholder="platform.placeholder" class="date-input-v2 creator-id-input">
                  </div>
                </div>
                <div v-if="editCreatorEnabled && selectedCreatorPlatforms.length > 1" class="creator-order-wrap">
                  <div class="creator-order-title">展示顺序（拖拽调整）</div>
                  <div class="creator-order-list">
                    <div v-for="platform in selectedCreatorPlatforms" :key="`order-${platform.key}`"
                      class="creator-order-item" draggable="true" @dragstart="handlePlatformOrderDragStart(platform.key)"
                      @dragover.prevent @drop.prevent="handlePlatformOrderDrop(platform.key)">
                      <span class="creator-order-handle">⋮⋮</span>
                      <span>{{ platform.label }}</span>
                    </div>
                  </div>
                </div>
                <div v-else-if="editCreatorEnabled && selectedCreatorPlatforms.length === 0" class="creator-platform-empty">
                  请至少选择一个平台并填写账号 ID。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import {
  CREATOR_PLATFORM_KEYS,
  creatorPlatformsMeta,
  creatorPlatformLabelMap,
  buildCreatorPlatformJumpUrl,
  normalizeCreatorPlatformIds
} from '../creatorPlatforms.js';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  profile: {
    type: Object,
    default: () => ({})
  },
  saving: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'save', 'avatar-click', 'show-alert']);

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const CREATOR_VISIBILITY_VALUES = new Set(['public', 'private']);
const PROFILE_EDIT_DRAFT_KEY_PREFIX = 'boh_profile_edit_draft_v1_';

const normalizeCreatorPlatformVisibility = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = {};
  const keySet = new Set(availableKeys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key)) continue;
    const value = String(raw[key] || '').trim().toLowerCase();
    normalized[key] = CREATOR_VISIBILITY_VALUES.has(value) ? value : 'public';
  }
  return normalized;
};

const normalizeCreatorPlatformOrder = (raw, availableKeys = CREATOR_PLATFORM_KEYS) => {
  const list = Array.isArray(raw) ? raw : [];
  const keySet = new Set(availableKeys);
  const seen = new Set();
  const normalized = [];

  for (const item of list) {
    const key = String(item || '').trim();
    if (!CREATOR_PLATFORM_KEYS.includes(key)) continue;
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  for (const key of CREATOR_PLATFORM_KEYS) {
    if (!keySet.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
};

const editUsername = ref('');
const editBio = ref('');
const editJoinDate = ref('');
const editBirthMonth = ref('');
const editBirthDay = ref('');
const editCreatorEnabled = ref(false);
const editCreatorPlatforms = reactive({
  bilibili: false,
  xiaohongshu: false,
  douyin: false
});
const editCreatorIds = reactive({
  bilibili: '',
  xiaohongshu: '',
  douyin: ''
});
const editCreatorVisibility = reactive({
  bilibili: 'public',
  xiaohongshu: 'public',
  douyin: 'public'
});
const editCreatorOrder = ref([]);
const platformOrderDraggingKey = ref('');

const selectedCreatorPlatforms = computed(() => {
  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  const orderedKeys = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
  return orderedKeys
    .map((key) => creatorPlatformsMeta.find((platform) => platform.key === key))
    .filter(Boolean);
});

const profileEditDraftKey = computed(() => {
  const userId = String(userInfo.value?.id || '').trim();
  return userId ? `${PROFILE_EDIT_DRAFT_KEY_PREFIX}${userId}` : '';
});

const openCreatorPlatformPage = (platformKey, rawAccountId) => {
  const url = buildCreatorPlatformJumpUrl(platformKey, rawAccountId);
  if (!url) {
    emit('show-alert', 'error', '跳转失败', '暂不支持该平台的快捷跳转');
    return;
  }
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!newWindow) {
    emit('show-alert', 'warning', '跳转受限', '浏览器阻止了新窗口，请允许弹窗后重试');
  }
};

const syncCreatorEditForm = (rawIds, creatorEnabled, rawVisibility = {}, rawOrder = []) => {
  const normalized = normalizeCreatorPlatformIds(rawIds);
  const keys = Object.keys(normalized);
  const normalizedVisibility = normalizeCreatorPlatformVisibility(rawVisibility, keys);
  const normalizedOrder = normalizeCreatorPlatformOrder(rawOrder, keys);
  for (const key of CREATOR_PLATFORM_KEYS) {
    const value = normalized[key] || '';
    editCreatorPlatforms[key] = Boolean(value);
    editCreatorIds[key] = value;
    editCreatorVisibility[key] = normalizedVisibility[key] || 'public';
  }
  editCreatorOrder.value = normalizedOrder;
  editCreatorEnabled.value = Boolean(creatorEnabled) || Object.keys(normalized).length > 0;
};

const toggleCreatorVerification = () => {
  editCreatorEnabled.value = !editCreatorEnabled.value;
  if (!editCreatorEnabled.value) {
    for (const key of CREATOR_PLATFORM_KEYS) {
      editCreatorPlatforms[key] = false;
      editCreatorIds[key] = '';
      editCreatorVisibility[key] = 'public';
    }
    editCreatorOrder.value = [];
  }
};

const collectCreatorPayloadForSave = () => {
  if (!editCreatorEnabled.value) {
    return {
      ok: true,
      creatorEnabled: false,
      creatorIds: {},
      creatorVisibility: {},
      creatorOrder: []
    };
  }

  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  if (selectedKeys.length === 0) {
    return { ok: false, message: '请至少选择一个创作平台' };
  }

  const creatorIds = {};
  const creatorVisibility = {};
  for (const key of selectedKeys) {
    const value = String(editCreatorIds[key] || '').trim();
    if (!value) {
      return { ok: false, message: `请填写${creatorPlatformLabelMap[key]}账号 ID` };
    }
    if (value.length > 64) {
      return { ok: false, message: `${creatorPlatformLabelMap[key]}账号 ID 不能超过 64 个字符` };
    }
    creatorIds[key] = value;
    const visibility = String(editCreatorVisibility[key] || '').trim().toLowerCase();
    creatorVisibility[key] = CREATOR_VISIBILITY_VALUES.has(visibility) ? visibility : 'public';
  }

  const creatorOrder = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);

  return {
    ok: true,
    creatorEnabled: Object.keys(creatorIds).length > 0,
    creatorIds,
    creatorVisibility,
    creatorOrder
  };
};

const handlePlatformOrderDragStart = (platformKey) => {
  platformOrderDraggingKey.value = String(platformKey || '').trim();
};

const handlePlatformOrderDrop = (targetKey) => {
  const sourceKey = String(platformOrderDraggingKey.value || '').trim();
  const safeTargetKey = String(targetKey || '').trim();
  if (!sourceKey || !safeTargetKey || sourceKey === safeTargetKey) {
    platformOrderDraggingKey.value = '';
    return;
  }

  const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
  const currentOrder = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
  const sourceIndex = currentOrder.indexOf(sourceKey);
  const targetIndex = currentOrder.indexOf(safeTargetKey);
  if (sourceIndex === -1 || targetIndex === -1) {
    platformOrderDraggingKey.value = '';
    return;
  }

  const nextOrder = [...currentOrder];
  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, sourceKey);
  editCreatorOrder.value = nextOrder;
  platformOrderDraggingKey.value = '';
};

const buildCurrentProfileDraft = () => ({
  username: editUsername.value,
  bio: editBio.value,
  join_date: editJoinDate.value,
  birth_month: editBirthMonth.value,
  birth_day: editBirthDay.value,
  creator_enabled: Boolean(editCreatorEnabled.value),
  creator_platforms: { ...editCreatorPlatforms },
  creator_ids: { ...editCreatorIds },
  creator_visibility: { ...editCreatorVisibility },
  creator_order: [...editCreatorOrder.value],
  updated_at: Date.now()
});

const persistProfileDraft = () => {
  if (!props.show) return;
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(buildCurrentProfileDraft()));
  } catch (_err) {
    // ignore
  }
};

const clearProfileDraft = () => {
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_err) {
    // ignore
  }
};

const restoreProfileDraftIfAny = () => {
  const key = profileEditDraftKey.value;
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    editUsername.value = String(parsed.username || editUsername.value || '');
    editBio.value = String(parsed.bio || '');
    editJoinDate.value = String(parsed.join_date || '');
    editBirthMonth.value = String(parsed.birth_month || '');
    editBirthDay.value = String(parsed.birth_day || '');
    editCreatorEnabled.value = Boolean(parsed.creator_enabled);

    const draftIds = normalizeCreatorPlatformIds(parsed.creator_ids);
    const draftPlatforms = parsed.creator_platforms && typeof parsed.creator_platforms === 'object'
      ? parsed.creator_platforms
      : {};
    const selectedKeys = [];
    for (const keyName of CREATOR_PLATFORM_KEYS) {
      const selected = Boolean(draftPlatforms[keyName]) || Boolean(draftIds[keyName]);
      editCreatorPlatforms[keyName] = selected;
      editCreatorIds[keyName] = draftIds[keyName] || '';
      if (selected) selectedKeys.push(keyName);
    }

    const normalizedVisibility = normalizeCreatorPlatformVisibility(parsed.creator_visibility, selectedKeys);
    for (const keyName of CREATOR_PLATFORM_KEYS) {
      editCreatorVisibility[keyName] = normalizedVisibility[keyName] || 'public';
    }

    editCreatorOrder.value = normalizeCreatorPlatformOrder(parsed.creator_order, selectedKeys);
  } catch (_err) {
    // ignore invalid draft
  }
};

const openEditModal = () => {
  const safeProfile = props.profile || {};
  editUsername.value = safeProfile.username || '';
  editBio.value = safeProfile.bio || '';
  editJoinDate.value = safeProfile.join_date || '';
  editBirthMonth.value = safeProfile.birth_month || '';
  editBirthDay.value = safeProfile.birth_day || '';
  syncCreatorEditForm(
    safeProfile.creator_platform_ids,
    safeProfile.is_boh_creator,
    safeProfile.creator_platform_visibility,
    safeProfile.creator_platform_order
  );
  restoreProfileDraftIfAny();
};

const closeEditModal = () => {
  emit('close');
};

const handleSaveProfile = async () => {
  if (!editUsername.value.trim()) {
    emit('show-alert', 'error', '保存失败', '用户名不能为空');
    return;
  }

  const creatorPayload = collectCreatorPayloadForSave();
  if (!creatorPayload.ok) {
    emit('show-alert', 'error', '保存失败', creatorPayload.message || '社交平台信息不完整');
    return;
  }

  const updates = {
    username: editUsername.value.trim(),
    bio: editBio.value,
    join_date: editJoinDate.value,
    birth_month: editBirthMonth.value,
    birth_day: editBirthDay.value,
    is_boh_creator: creatorPayload.creatorEnabled,
    creator_platform_ids: creatorPayload.creatorIds,
    creator_platform_visibility: creatorPayload.creatorVisibility,
    creator_platform_order: creatorPayload.creatorOrder
  };

  clearProfileDraft();
  emit('save', updates);
};

// 当 show 变为 true 时初始化编辑表单
watch(() => props.show, (newVal) => {
  if (newVal) {
    openEditModal();
  }
});

// 监听编辑表单变化以持久化草稿
watch(
  () => [
    editUsername.value,
    editBio.value,
    editJoinDate.value,
    editBirthMonth.value,
    editBirthDay.value,
    Boolean(editCreatorEnabled.value),
    JSON.stringify(editCreatorPlatforms),
    JSON.stringify(editCreatorIds),
    JSON.stringify(editCreatorVisibility),
    JSON.stringify(editCreatorOrder.value || [])
  ],
  () => {
    persistProfileDraft();
  }
);

// 监听 creator platform 选择变化以自动更新 order 和 visibility
watch(
  () => JSON.stringify(editCreatorPlatforms),
  () => {
    const selectedKeys = CREATOR_PLATFORM_KEYS.filter((key) => Boolean(editCreatorPlatforms[key]));
    editCreatorOrder.value = normalizeCreatorPlatformOrder(editCreatorOrder.value, selectedKeys);
    const normalizedVisibility = normalizeCreatorPlatformVisibility(editCreatorVisibility, selectedKeys);
    for (const key of CREATOR_PLATFORM_KEYS) {
      editCreatorVisibility[key] = normalizedVisibility[key] || 'public';
    }
  }
);
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 10001;
  display: flex;
  justify-content: center;
  align-items: center;
}

.edit-profile-modal {
  width: 680px;
  max-width: 92vw;
  max-height: 88vh;
  max-height: 88dvh;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.edit-profile-modal .modal-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eff3f4;
}

.edit-profile-modal .modal-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.edit-profile-modal .modal-header h3 {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
}

.close-btn {
  font-size: 24px;
  background: none;
  border: none;
  cursor: pointer;
}

.save-btn {
  background: #0f1419;
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 9999px;
  font-weight: 700;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.5;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 40px;
}

.edit-profile-modal .modal-body {
  padding-bottom: 24px;
}

.edit-banner-preview {
  height: 170px;
  background: linear-gradient(135deg, #d9e3ea 0%, #b9c9d6 100%);
}

.edit-avatar-preview {
  margin-top: -52px;
  padding: 0 24px;
  display: flex;
  justify-content: center;
  margin-bottom: 6px;
}

.avatar-circle {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  border: 4px solid #fff;
  background: #f7f9f9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 800;
  position: relative;
  overflow: hidden;
}

.avatar-circle.clickable {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.avatar-circle.clickable:hover {
  transform: scale(1.05);
}

.edit-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-edit-icon-modal {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 32px;
  height: 32px;
  background-color: #1d1d1f;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.edit-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 20px 24px 0;
}

.form-group {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid #e8edf2;
  border-radius: 14px;
  background: #fafbfd;
}

.form-group.span-2 {
  grid-column: 1 / -1;
}

.form-group label {
  font-size: 14px;
  color: #536471;
  font-weight: 500;
}

.creator-verification-group {
  gap: 12px;
}

.creator-verification-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.creator-verification-toggle {
  border: 1px solid #cfd9de;
  border-radius: 999px;
  background: #fff;
  color: #0f1419;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.creator-verification-toggle.active {
  border-color: rgba(0, 168, 112, 0.4);
  background: rgba(0, 168, 112, 0.1);
  color: #027a57;
}

.creator-verification-tip {
  margin: 0;
  color: #536471;
  font-size: 13px;
  line-height: 1.5;
}

.creator-platform-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.creator-platform-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #d7e1e8;
  border-radius: 999px;
  background: #fff;
  padding: 8px 12px;
  font-size: 14px;
  color: #0f1419;
  cursor: pointer;
}

.creator-platform-chip input {
  width: 14px;
  height: 14px;
}

.creator-platform-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.creator-id-input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.creator-visibility-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.creator-visibility-row span {
  color: #3e5566;
  font-size: 13px;
}

.creator-visibility-select {
  border: 1px solid #d7e1e8;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  background: #fff;
  color: #0f1419;
}

.creator-id-input-row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.creator-id-input-row label {
  color: #3e5566;
  font-size: 13px;
}

.creator-platform-jump-btn {
  border: 1px solid #d7e1e8;
  border-radius: 999px;
  background: #fff;
  color: #1d9bf0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.creator-platform-jump-btn:hover {
  border-color: #1d9bf0;
  background: rgba(29, 155, 240, 0.08);
}

.creator-id-input {
  font-size: 14px;
}

.creator-platform-empty {
  border: 1px dashed #cdd8e1;
  border-radius: 10px;
  background: #fff;
  color: #536471;
  padding: 12px;
  font-size: 13px;
}

.creator-order-wrap {
  border: 1px dashed #cdd8e1;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
}

.creator-order-title {
  font-size: 13px;
  color: #3e5566;
  margin-bottom: 8px;
  font-weight: 600;
}

.creator-order-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.creator-order-item {
  border: 1px solid #d7e1e8;
  border-radius: 10px;
  padding: 8px 10px;
  background: #f9fbfd;
  color: #0f1419;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: grab;
}

.creator-order-handle {
  color: #7a8a99;
  font-size: 14px;
}

.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #dce3ea;
  border-radius: 10px;
  font-size: 16px;
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 110px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-group textarea:focus {
  border-color: #1d9bf0;
  box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.12);
}

.date-input-v2,
.date-select-v2 {
  width: 100%;
  padding: 12px;
  border: 1px solid #dce3ea;
  border-radius: 8px;
  font-size: 15px;
  background: #fff;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.date-input-v2:focus,
.date-select-v2:focus {
  border-color: #1d9bf0;
  box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.12);
}

.birthday-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.date-select-v2 {
  flex: 1;
}

.char-count {
  text-align: right;
  font-size: 13px;
  color: #536471;
  margin-top: 2px;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #eff3f4;
  border-radius: 10px;
}

@media (max-width: 768px) {
  .edit-profile-modal {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
    max-height: 88vh;
    max-height: 88dvh;
    border-radius: 14px;
  }

  .edit-profile-modal .modal-header {
    padding: 12px 14px;
  }

  .edit-banner-preview {
    height: 130px;
  }

  .edit-avatar-preview {
    margin-top: -44px;
    padding: 0 16px;
  }

  .avatar-circle {
    width: 96px;
    height: 96px;
  }

  .edit-form-grid {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 16px;
  }

  .form-group,
  .form-group.span-2 {
    grid-column: auto;
  }

  .creator-platform-fields {
    grid-template-columns: 1fr;
  }
}

@media (orientation: landscape) and (max-width: 1024px) {
  .edit-profile-modal {
    max-height: 90vh;
    max-height: 90dvh;
  }

  .creator-platform-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>