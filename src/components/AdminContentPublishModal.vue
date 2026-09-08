<script setup>
/**
 * AdminContentPublishModal — 管理员「投稿」弹窗：发布新新闻 / 新活动
 * 写 news / activities 表（论坛官方帖由触发器自动同步）。
 * 封面支持两种方式：本地直传 Cloudinary（>10MB 自动压缩为 WebP）或粘贴外链。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ImageUp, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { supabase } from '@/utils/supabase-client.js';
import { showIsland } from '@/composables/useIsland.js';
import { uploadImageToCloudinary, isCloudinaryNoteUploadConfigured } from '@/utils/cloudinary-client.js';
import { compressImageFileToUploadLimit } from '@/utils/image-compression.js';
import { NEWS_CATEGORY_OPTIONS } from '@/views/DataManagement/config/fields.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  // 'news' | 'activity'
  type: { type: String, required: true }
});

const emit = defineEmits(['close', 'published']);

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

const typeLabel = computed(() => (props.type === 'news' ? '新闻' : '活动'));
const table = computed(() => (props.type === 'news' ? 'news' : 'activities'));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blankForm = () => ({
  title: '',
  category: 'update',
  date: today(),
  author: String(userInfo.value?.username || '').trim(),
  excerpt: '',
  content: '',
  image: ''
});

const form = reactive(blankForm());
const submitting = ref(false);
const imageUploading = ref(false);
const errorMsg = ref('');

const canSubmit = computed(() => (
  !submitting.value
  && !imageUploading.value
  && String(form.title || '').trim().length > 0
  && String(form.date || '').trim().length > 0
  && (props.type === 'activity' || (
    String(form.author || '').trim().length > 0
    && String(form.excerpt || '').trim().length > 0
  ))
  && String(form.content || '').trim().length > 0
));

const requestClose = () => {
  if (submitting.value || imageUploading.value) return;
  emit('close');
};

// id 为数字自增式：取当前最大 id + 1（管理端单操作，竞态窗口可接受）
const nextId = async () => {
  const { data, error } = await supabase
    .from(table.value)
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw error;
  const next = Number(data?.[0]?.id || 0) + 1;
  if (!Number.isFinite(next) || next <= 0) return Date.now();
  return next;
};

const resetForm = () => {
  Object.assign(form, blankForm());
  errorMsg.value = '';
};

watch(() => props.visible, (visible) => {
  if (visible) {
    resetForm();
    if (!form.author && props.type === 'news') form.author = String(userInfo.value?.username || '').trim();
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
});

// ---------- 封面图：本地直传（>10MB 自动压缩）/ 粘贴外链 ----------
const UPLOAD_COMPRESS_THRESHOLD_MB = 10;

const onImagePick = async (event) => {
  const input = event?.target;
  const file = input?.files?.[0] || null;
  if (input) input.value = '';
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    errorMsg.value = '仅支持上传图片文件';
    return;
  }
  if (!isCloudinaryNoteUploadConfigured()) {
    errorMsg.value = '请先配置 Cloudinary 后再上传图片，或直接粘贴图片链接';
    return;
  }
  imageUploading.value = true;
  errorMsg.value = '';
  try {
    let toUpload = file;
    const sizeMB = Number(file.size || 0) / (1024 * 1024);
    // 大于 10MB 自动压缩（统一转 WebP，封面展示走 Cloudinary f_auto 无损观感）
    if (sizeMB > UPLOAD_COMPRESS_THRESHOLD_MB) {
      toUpload = await compressImageFileToUploadLimit(file, {}, { targetSizeMB: 9 });
    }
    const uploaded = await uploadImageToCloudinary(toUpload, {
      folder: props.type === 'news' ? 'boh-cloud-plus/admin-news' : 'boh-cloud-plus/admin-activities'
    });
    if (!uploaded?.url) throw new Error('上传成功但没有返回图片地址');
    form.image = uploaded.url;
  } catch (error) {
    errorMsg.value = String(error?.message || '图片上传失败，请重试或直接粘贴链接');
  } finally {
    imageUploading.value = false;
  }
};

const onPreviewImageError = (event) => {
  if (event?.target) event.target.style.display = 'none';
};

const submit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    const payload = { title: String(form.title).trim(), date: form.date };
    if (props.type === 'news') {
      payload.category = form.category;
      payload.author = String(form.author).trim();
      payload.excerpt = String(form.excerpt).trim();
      payload.content = String(form.content).trim();
    } else {
      // activities 表无 content 列，正文写 description
      payload.description = String(form.content).trim();
    }
    if (String(form.image || '').trim()) payload.image = String(form.image).trim();
    payload.id = await nextId();

    const { error } = await supabase.from(table.value).insert(payload);
    if (error) throw error;

    showIsland.notify({
      title: `${typeLabel.value}已发布`,
      message: '论坛官方帖已自动同步',
      icon: 'success'
    });
    emit('published');
    emit('close');
  } catch (error) {
    errorMsg.value = String(error?.message || '发布失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="admin-publish-fade">
      <div v-if="visible" class="admin-publish-overlay" @click.self="requestClose">
        <div class="admin-publish-modal" role="dialog" aria-modal="true" :aria-label="`投稿${typeLabel}`">
          <div class="ap-head">
            <span class="ap-title">投稿{{ typeLabel }}</span>
            <button type="button" class="ap-close" aria-label="关闭" @click="requestClose">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="ap-body">
            <label class="ap-field">
              <span class="ap-label">标题 *</span>
              <input v-model="form.title" type="text" class="ap-input" :placeholder="type === 'news' ? '例如：春季活动正式开启' : '例如：夏夜建筑赛'" maxlength="80" />
            </label>

            <div class="ap-row">
              <label v-if="type === 'news'" class="ap-field">
                <span class="ap-label">分类 *</span>
                <select v-model="form.category" class="ap-input">
                  <option v-for="opt in NEWS_CATEGORY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label class="ap-field">
                <span class="ap-label">日期 *</span>
                <input v-model="form.date" type="date" class="ap-input" />
              </label>
              <label v-if="type === 'news'" class="ap-field">
                <span class="ap-label">作者 *</span>
                <input v-model="form.author" type="text" class="ap-input" placeholder="例如：Ryyik" maxlength="24" />
              </label>
            </div>

            <label v-if="type === 'news'" class="ap-field">
              <span class="ap-label">摘要 *</span>
              <textarea v-model="form.excerpt" class="ap-input ap-textarea" rows="2" placeholder="用 1-2 句话写列表预览，建议 30-80 字"></textarea>
            </label>

            <label class="ap-field">
              <span class="ap-label">{{ type === 'news' ? '正文内容 *' : '活动介绍 *' }}</span>
              <textarea v-model="form.content" class="ap-input ap-textarea" :rows="type === 'news' ? 8 : 5" placeholder="直接写正文即可，空行会分段"></textarea>
            </label>

            <div class="ap-field">
              <span class="ap-label">封面图（可选，大于 10MB 自动压缩）</span>
              <div class="ap-image-row">
                <label class="ap-upload" :class="{ 'is-busy': imageUploading }">
                  <input type="file" accept="image/*" :disabled="imageUploading" @change="onImagePick" />
                  <Loader2 v-if="imageUploading" :size="15" class="ap-upload-spinner" aria-hidden="true" />
                  <ImageUp v-else :size="15" :stroke-width="2.1" aria-hidden="true" />
                  <span>{{ imageUploading ? '上传中…' : '上传图片' }}</span>
                </label>
                <input v-model="form.image" type="url" class="ap-input" placeholder="或粘贴 https:// 图片链接" />
              </div>
              <img
                v-if="form.image"
                :src="form.image"
                alt="封面预览"
                class="ap-image-preview"
                @error="onPreviewImageError"
              />
            </div>

            <p v-if="errorMsg" class="ap-error">{{ errorMsg }}</p>
          </div>

          <div class="ap-foot">
            <span class="ap-hint">发布后论坛会自动同步官方帖</span>
            <button type="button" class="ap-submit" :disabled="!canSubmit" @click="submit">
              <span v-if="submitting">发布中…</span>
              <span v-else>发布{{ typeLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 覆盖顶部导航栏（z-index 9999）必须 ≥ 10002（项目先例） */
.admin-publish-overlay {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}

/* 液态玻璃面板（与导航岛卡片同材质语言） */
.admin-publish-modal {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(86dvh, 780px);
  padding: 18px 20px 16px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.4));
  box-shadow: 0 28px 80px rgba(29, 41, 56, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
}

.ap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ap-title {
  color: #1d2938;
  font-size: 16px;
  font-weight: 780;
}

.ap-close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #64748b;
  background: rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.ap-close:hover { color: #1d2938; background: rgba(15, 23, 42, 0.1); }

.ap-body {
  display: grid;
  gap: 12px;
  overflow-y: auto;
  padding: 2px;
  scrollbar-width: thin;
}

.ap-field { display: grid; gap: 5px; }

.ap-label {
  color: #617084;
  font-size: 11.5px;
  font-weight: 750;
}

.ap-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.ap-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid rgba(100, 116, 139, 0.22);
  border-radius: 12px;
  color: #1d2938;
  background: rgba(255, 255, 255, 0.55);
  font: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

select.ap-input { cursor: pointer; }

.ap-input:focus {
  border-color: rgba(0, 113, 227, 0.4);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
}

.ap-textarea { resize: vertical; min-height: 56px; line-height: 1.55; }

/* ---- 封面图：上传按钮 + 外链输入 + 预览 ---- */
.ap-image-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.ap-upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 0 14px;
  border: 1px solid rgba(0, 113, 227, 0.35);
  border-radius: 12px;
  color: #0071e3;
  background: rgba(0, 113, 227, 0.08);
  font-size: 12.5px;
  font-weight: 720;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.ap-upload:hover { color: #ffffff; background: #0071e3; }
.ap-upload:active { transform: scale(0.97); }
.ap-upload.is-busy { cursor: wait; opacity: 0.7; }

.ap-upload input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.ap-upload-spinner { animation: ap-spin 0.8s linear infinite; }
@keyframes ap-spin { to { transform: rotate(360deg); } }

.ap-image-preview {
  width: 100%;
  max-height: 150px;
  border: 1px solid rgba(100, 116, 139, 0.16);
  border-radius: 12px;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.04);
}

.ap-error {
  margin: 0;
  color: #b84212;
  font-size: 12px;
  line-height: 1.4;
}

.ap-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(100, 116, 139, 0.14);
}

.ap-hint { color: #7a8aa0; font-size: 11px; }

.ap-submit {
  min-width: 108px;
  height: 36px;
  padding: 0 20px;
  border: none;
  border-radius: 999px;
  color: #ffffff;
  background: #0071e3;
  font: inherit;
  font-size: 13px;
  font-weight: 760;
  cursor: pointer;
  transition: background-color 0.16s ease, transform 0.15s ease, opacity 0.16s ease;
}

.ap-submit:hover:not(:disabled) { background: #0077ed; }
.ap-submit:active:not(:disabled) { transform: scale(0.97); }
.ap-submit:disabled { opacity: 0.45; cursor: not-allowed; }

.admin-publish-fade-enter-active,
.admin-publish-fade-leave-active { transition: opacity 0.2s ease; }
.admin-publish-fade-enter-active .admin-publish-modal,
.admin-publish-fade-leave-active .admin-publish-modal { transition: transform 0.24s cubic-bezier(0.22, 0.95, 0.36, 1), opacity 0.2s ease; }
.admin-publish-fade-enter-from,
.admin-publish-fade-leave-to { opacity: 0; }
.admin-publish-fade-enter-from .admin-publish-modal,
.admin-publish-fade-leave-to .admin-publish-modal { transform: scale(0.95) translateY(10px); opacity: 0; }

/* ---------- 暗色（Teleport 到 body：用 html[data-theme] 前缀自己写） ---------- */
html[data-theme="dark"] .admin-publish-modal {
  color: #e2e8f0;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.8), rgba(22, 25, 33, 0.6));
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
html[data-theme="dark"] .ap-title { color: #f5f5f7; }
html[data-theme="dark"] .ap-label { color: rgba(203, 213, 225, 0.85); }
html[data-theme="dark"] .ap-input {
  color: #f5f5f7;
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
}
html[data-theme="dark"] .ap-input:focus {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(10, 132, 255, 0.55);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.18);
}
html[data-theme="dark"] .ap-close { color: #cbd5e1; background: rgba(255, 255, 255, 0.08); }
html[data-theme="dark"] .ap-foot { border-top-color: rgba(255, 255, 255, 0.12); }
html[data-theme="dark"] .ap-hint { color: rgba(148, 163, 184, 0.8); }
html[data-theme="dark"] .ap-upload {
  color: #6cb2ff;
  border-color: rgba(10, 132, 255, 0.45);
  background: rgba(10, 132, 255, 0.14);
}
html[data-theme="dark"] .ap-upload:hover { color: #ffffff; background: #0a84ff; }
html[data-theme="dark"] .ap-image-preview { border-color: rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); }
html[data-theme="dark"] .ap-submit { background: #0a84ff; }
html[data-theme="dark"] .ap-submit:hover:not(:disabled) { background: #2b95ff; }

@media (max-width: 480px) {
  .admin-publish-overlay { padding: 12px; }
  .admin-publish-modal { padding: 14px 14px 12px; border-radius: 20px; }
  .ap-image-row { flex-direction: column; }
  .ap-upload { justify-content: center; height: 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-publish-fade-enter-active,
  .admin-publish-fade-leave-active,
  .admin-publish-fade-enter-active .admin-publish-modal,
  .admin-publish-fade-leave-active .admin-publish-modal { transition-duration: 1ms; }
}
</style>
