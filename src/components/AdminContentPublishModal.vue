<script setup>
/**
 * AdminContentPublishModal — 管理员「投稿」弹窗
 *
 * 写三张表，由「内容类型 + 活动类型」决定：
 *   news              → news 表（论坛官方帖由触发器自动同步）
 *   activity/campaign → activity_campaigns 表（进行中、可报名；**无论坛同步触发器**）
 *   activity/archive  → activities 表（往期回顾，按月份归档；有论坛同步触发器）
 *
 * 两类活动的字段差异是表结构决定的，不是设计选择：
 *   - activity_campaigns 没有 image 列 → 报名活动不提供封面图
 *   - activity_campaigns 的 id 是 uuid（DB 生成）→ 不走自增 nextId
 *   - activity_campaigns 多出 slug / stage / 报名与活动时间窗
 *
 * slug 与时间窗的归一逻辑与数据管理后台共用 utils/activity-campaign.js，
 * 避免出现「前台存不进、后台能存进」的双份规则。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ImageUp, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { supabase } from '@/utils/supabase-client.js';
import { showIsland } from '@/composables/useIsland.js';
import { uploadImageToCloudinary, isCloudinaryNoteUploadConfigured } from '@/utils/cloudinary-client.js';
import { compressImageFileToUploadLimit } from '@/utils/image-compression.js';
import { NEWS_CATEGORY_OPTIONS, CAMPAIGN_STAGE_OPTIONS } from '@/views/DataManagement/config/fields.js';
import { buildSlugFromTitle, normalizeCampaignSlug, toIsoOrNull, validateCampaignWindow } from '@/utils/activity-campaign.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  // 'news' | 'activity'
  type: { type: String, required: true }
});

const emit = defineEmits(['close', 'published']);

const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

// 「新建报名活动」放在前面：它是活动页顶部报名区的唯一供数通道
const ACTIVITY_KINDS = [
  { value: 'campaign', label: '新建报名活动', hint: '进行中 · 用户可在活动页报名' },
  { value: 'archive', label: '新建活动', hint: '往期活动 · 按月份归档展示' }
];

const activityKind = ref('campaign');
const isCampaign = computed(() => props.type === 'activity' && activityKind.value === 'campaign');

const typeLabel = computed(() => {
  if (props.type === 'news') return '新闻';
  return isCampaign.value ? '报名活动' : '活动';
});

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
  image: '',
  // 报名活动专属
  slug: '',
  stage: 'signup',
  signup_start_at: '',
  signup_end_at: '',
  start_at: '',
  end_at: ''
});

const form = reactive(blankForm());
const submitting = ref(false);
const imageUploading = ref(false);
const errorMsg = ref('');
// 打开弹窗时生成一次，用于提示「留空将自动生成」的具体值
const slugFallback = ref('');

const canSubmit = computed(() => {
  if (submitting.value || imageUploading.value) return false;
  if (!String(form.title || '').trim()) return false;
  if (!String(form.content || '').trim()) return false;

  if (props.type === 'news') {
    return Boolean(
      String(form.date || '').trim()
      && String(form.author || '').trim()
      && String(form.excerpt || '').trim()
    );
  }
  // 报名活动的 slug 可留空（自动生成），只要求阶段非空
  if (isCampaign.value) return Boolean(String(form.stage || '').trim());
  return Boolean(String(form.date || '').trim());
});

const requestClose = () => {
  if (submitting.value || imageUploading.value) return;
  emit('close');
};

// id 为数字自增式：取当前最大 id + 1（管理端单操作，竞态窗口可接受）。
// 仅 news / activities 用；activity_campaigns 的 id 是 uuid，由 DB 生成。
const nextId = async (target) => {
  const { data, error } = await supabase
    .from(target)
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
    activityKind.value = 'campaign';
    slugFallback.value = buildSlugFromTitle('');
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
    let payload;
    let target;
    let message;

    if (props.type === 'news') {
      target = 'news';
      message = '论坛官方帖已自动同步';
      payload = {
        id: await nextId('news'),
        title: String(form.title).trim(),
        date: form.date,
        category: form.category,
        author: String(form.author).trim(),
        excerpt: String(form.excerpt).trim(),
        content: String(form.content).trim()
      };
      if (String(form.image || '').trim()) payload.image = String(form.image).trim();
    } else if (isCampaign.value) {
      target = 'activity_campaigns';
      message = '已进入报名中，活动页顶部即可看到';
      const rawSlug = String(form.slug || '').trim();
      const normalized = normalizeCampaignSlug(rawSlug);
      if (rawSlug && !normalized) {
        throw new Error('Slug 只能用英文字母、数字和连字符（中文标题请留空自动生成）');
      }
      const signupStart = toIsoOrNull(form.signup_start_at);
      const signupEnd = toIsoOrNull(form.signup_end_at);
      const startAt = toIsoOrNull(form.start_at);
      const endAt = toIsoOrNull(form.end_at);
      const windowError = validateCampaignWindow({ signupStart, signupEnd, startAt, endAt });
      if (windowError) throw new Error(windowError);

      payload = {
        // 用打开弹窗时生成的那个 fallback，保证与表单里「留空将自动生成为 xxx」的提示一致
        slug: normalized || slugFallback.value || buildSlugFromTitle(form.title),
        title: String(form.title).trim(),
        description: String(form.content).trim(),
        stage: form.stage,
        signup_start_at: signupStart,
        signup_end_at: signupEnd,
        start_at: startAt,
        end_at: endAt,
        config: {}
      };
    } else {
      target = 'activities';
      // 论坛官方帖由 trg_sync_activity_forum_card 触发器同步
      message = '论坛官方帖已自动同步';
      payload = {
        id: await nextId('activities'),
        title: String(form.title).trim(),
        date: form.date,
        // activities 表无 content 列，正文写 description
        description: String(form.content).trim()
      };
      if (String(form.image || '').trim()) payload.image = String(form.image).trim();
    }

    const { error } = await supabase.from(target).insert(payload);
    if (error) throw error;

    showIsland.notify({
      title: `${typeLabel.value}已发布`,
      message,
      icon: 'success'
    });
    emit('published', { kind: props.type === 'news' ? 'news' : activityKind.value });
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
            <!-- 活动类型选择（仅活动入口） -->
            <div v-if="type === 'activity'" class="ap-kind" role="tablist" aria-label="选择活动类型">
              <button
                v-for="kind in ACTIVITY_KINDS"
                :key="kind.value"
                type="button"
                role="tab"
                class="ap-kind__option"
                :class="{ 'is-active': activityKind === kind.value }"
                :aria-selected="activityKind === kind.value"
                @click="activityKind = kind.value"
              >
                <span class="ap-kind__label">{{ kind.label }}</span>
                <span class="ap-kind__hint">{{ kind.hint }}</span>
              </button>
            </div>

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
              <label v-if="!isCampaign" class="ap-field">
                <span class="ap-label">日期 *</span>
                <input v-model="form.date" type="date" class="ap-input" />
              </label>
              <label v-if="type === 'news'" class="ap-field">
                <span class="ap-label">作者 *</span>
                <input v-model="form.author" type="text" class="ap-input" placeholder="例如：Ryyik" maxlength="24" />
              </label>
            </div>

            <!-- 报名活动专属：slug / 阶段 / 时间窗 -->
            <template v-if="isCampaign">
              <div class="ap-row">
                <label class="ap-field">
                  <span class="ap-label">Slug（URL 标识）</span>
                  <input v-model="form.slug" type="text" class="ap-input" placeholder="留空自动生成" maxlength="64" />
                </label>
                <label class="ap-field">
                  <span class="ap-label">阶段</span>
                  <select v-model="form.stage" class="ap-input">
                    <option v-for="opt in CAMPAIGN_STAGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </label>
              </div>
              <p class="ap-help">Slug 留空将自动生成为 {{ slugFallback }}。只有「报名中 / 投稿中 / 评审中」会出现在活动页顶部。</p>

              <div class="ap-row">
                <label class="ap-field">
                  <span class="ap-label">报名开始</span>
                  <input v-model="form.signup_start_at" type="datetime-local" class="ap-input" />
                </label>
                <label class="ap-field">
                  <span class="ap-label">报名截止</span>
                  <input v-model="form.signup_end_at" type="datetime-local" class="ap-input" />
                </label>
              </div>
              <div class="ap-row">
                <label class="ap-field">
                  <span class="ap-label">活动开始</span>
                  <input v-model="form.start_at" type="datetime-local" class="ap-input" />
                </label>
                <label class="ap-field">
                  <span class="ap-label">活动结束</span>
                  <input v-model="form.end_at" type="datetime-local" class="ap-input" />
                </label>
              </div>
            </template>

            <label v-if="type === 'news'" class="ap-field">
              <span class="ap-label">摘要 *</span>
              <textarea v-model="form.excerpt" class="ap-input ap-textarea" rows="2" placeholder="用 1-2 句话写列表预览，建议 30-80 字"></textarea>
            </label>

            <label class="ap-field">
              <span class="ap-label">{{ type === 'news' ? '正文内容 *' : '活动介绍 *' }}</span>
              <textarea v-model="form.content" class="ap-input ap-textarea" :rows="type === 'news' ? 8 : 5" placeholder="直接写正文即可，空行会分段"></textarea>
            </label>

            <div v-if="!isCampaign" class="ap-field">
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
            <p v-else class="ap-help">报名活动不设封面图：活动平台的表没有图片列，顶部报名卡只呈现标题、阶段与介绍。</p>

            <p v-if="errorMsg" class="ap-error">{{ errorMsg }}</p>
          </div>

          <div class="ap-foot">
            <span class="ap-hint">
              {{ isCampaign ? '发布后立即出现在活动页顶部报名区' : '发布后论坛会自动同步官方帖' }}
            </span>
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

/* ---- 活动类型分段选择 ---- */
.ap-kind {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.045);
}

.ap-kind__option {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.ap-kind__option.is-active {
  border-color: rgba(0, 113, 227, 0.24);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.ap-kind__label {
  color: #334155;
  font-size: 12.5px;
  font-weight: 760;
}

.ap-kind__option.is-active .ap-kind__label { color: #0071e3; }

.ap-kind__hint {
  color: #8695a8;
  font-size: 11px;
  line-height: 1.35;
}

.ap-field { display: grid; gap: 5px; }

.ap-label {
  color: #617084;
  font-size: 11.5px;
  font-weight: 750;
}

.ap-help {
  margin: 0;
  color: #5b6879;
  font-size: 11px;
  line-height: 1.5;
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

.ap-hint { color: #5b6879; font-size: 11px; }

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
html[data-theme="dark"] .ap-help { color: rgba(148, 163, 184, 0.8); }
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
html[data-theme="dark"] .ap-kind { background: rgba(255, 255, 255, 0.06); }
html[data-theme="dark"] .ap-kind__label { color: #cbd5e1; }
html[data-theme="dark"] .ap-kind__option.is-active {
  border-color: rgba(10, 132, 255, 0.45);
  background: rgba(10, 132, 255, 0.16);
}
html[data-theme="dark"] .ap-kind__option.is-active .ap-kind__label { color: #6cb2ff; }
html[data-theme="dark"] .ap-kind__hint { color: rgba(148, 163, 184, 0.75); }
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
  .ap-kind { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-publish-fade-enter-active,
  .admin-publish-fade-leave-active,
  .admin-publish-fade-enter-active .admin-publish-modal,
  .admin-publish-fade-leave-active .admin-publish-modal { transition-duration: 1ms; }
  .ap-kind__option { transition: none; }
}
</style>
