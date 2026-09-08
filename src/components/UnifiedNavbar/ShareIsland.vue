<template>
  <div class="share-island-card" role="dialog" aria-label="分享">
    <!-- ===== 选择器态 ===== -->
    <template v-if="mode === 'selector'">
      <div class="share-island-head">
        <span class="share-island-title">分享</span>
        <span v-if="targetTitle" class="share-island-subject">{{ targetTitle }}</span>
        <button type="button" class="share-island-close" aria-label="关闭" @click="requestClose">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>

      <div class="share-island-options">
        <button type="button" class="share-option" @click="copyLink">
          <span class="share-option-icon tone-link" aria-hidden="true">
            <Link2 :size="17" :stroke-width="2" />
          </span>
          <span class="share-option-copy">
            <strong>复制链接</strong>
            <small>{{ target ? '复制这条内容的站内链接' : '复制当前页面的链接' }}</small>
          </span>
          <ChevronRight :size="15" class="share-option-arrow" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="share-option"
          :class="{ 'is-disabled': !canForward }"
          :aria-disabled="!canForward"
          @click="enterForward"
        >
          <span class="share-option-icon tone-forward" aria-hidden="true">
            <Repeat2 :size="17" :stroke-width="2" />
          </span>
          <span class="share-option-copy">
            <strong>站内转发</strong>
            <small>{{ forwardHint }}</small>
          </span>
          <ChevronRight :size="15" class="share-option-arrow" aria-hidden="true" />
        </button>
      </div>
    </template>

    <!-- ===== 转发撰写态 ===== -->
    <template v-else-if="mode === 'forward'">
      <div class="share-island-head">
        <button type="button" class="share-island-back" aria-label="返回" @click="backToSelector">
          <ChevronLeft :size="16" aria-hidden="true" />
        </button>
        <span class="share-island-title">转发到论坛</span>
        <button type="button" class="share-island-close" aria-label="关闭" @click="requestClose">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>

      <div class="share-source-preview">
        <img v-if="targetImage" :src="targetImage" alt="" class="share-source-image" loading="lazy" decoding="async" @error="onPreviewImageError" />
        <div class="share-source-copy">
          <strong class="share-source-title">{{ targetTitle }}</strong>
          <p v-if="targetSummary" class="share-source-summary">{{ targetSummary }}</p>
        </div>
      </div>

      <div class="share-compose">
        <textarea
          ref="commentaryRef"
          v-model="commentary"
          class="share-compose-input"
          maxlength="2000"
          rows="3"
          placeholder="说点什么，一起聊聊…"
          @keydown.enter.exact.prevent="submitForward"
        ></textarea>
        <div class="share-compose-foot">
          <span class="share-compose-count" :class="{ 'is-limit': commentary.length >= 2000 }">{{ commentary.length }}/2000</span>
          <button
            type="button"
            class="share-compose-submit"
            :disabled="!canSubmit"
            @click="submitForward"
          >
            <Loader2 v-if="isSubmitting" :size="14" class="share-submit-spinner" aria-hidden="true" />
            <span>{{ isSubmitting ? '转发中' : '转发' }}</span>
          </button>
        </div>
        <p v-if="forwardError" class="share-compose-error">{{ forwardError }}</p>
      </div>
    </template>

    <!-- ===== 成功态 ===== -->
    <template v-else-if="mode === 'success'">
      <div class="share-success">
        <span class="share-success-icon" aria-hidden="true">
          <Check :size="20" :stroke-width="2.4" />
        </span>
        <div class="share-success-copy">
          <strong>{{ successTitle }}</strong>
          <small>{{ successMessage }}</small>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, ChevronLeft, ChevronRight, Link2, Loader2, Repeat2, X } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { createQuoteRepost, findQuoteRepostSourceId } from '@/utils/api/forum-api.js';
import { buildShareUrl } from '@/composables/useShareTarget.js';

const props = defineProps({
  // 分享目标（来自调用方构造；null = 当前页面）
  target: { type: Object, default: null },
  isLoggedIn: { type: Boolean, default: false },
  // navbar 注入：未登录点转发时拉起登录框；onClose 关闭本岛；
  // onCopied 复制成功后通知宿主（如点亮帖子卡「已复制」状态）
  requireLogin: { type: Function, default: null },
  onCopied: { type: Function, default: null },
  onClose: { type: Function, default: null }
});

const router = useRouter();
const mode = ref('selector');
const commentary = ref('');
const isSubmitting = ref(false);
const forwardError = ref('');
const successTitle = ref('');
const successMessage = ref('');
const commentaryRef = ref(null);
let successTimer = null;

const target = computed(() => props.target || null);
const targetTitle = computed(() => {
  const t = target.value?.title || '';
  return t.length > 26 ? `${t.slice(0, 26)}…` : t;
});
const targetSummary = computed(() => target.value?.summary || '');
const targetImage = computed(() => target.value?.image || '');
const forwardAction = computed(() => target.value?.forward || null);
const canForward = computed(() => Boolean(forwardAction.value));

const forwardHint = computed(() => {
  if (!props.isLoggedIn) return '登录后可转发到论坛';
  if (!canForward.value) return '打开帖子或新闻详情后可转发';
  return '带上你的想法，转发给论坛的伙伴';
});

const canSubmit = computed(() => !isSubmitting.value && commentary.value.trim().length > 0);

const requestClose = () => props.onClose?.();
const backToSelector = () => {
  forwardError.value = '';
  mode.value = 'selector';
};

// 站内深链：hash 路由
const shareUrl = computed(() => buildShareUrl(target.value));

const finishWithSuccess = (title, message, autoCloseMs = 1800) => {
  successTitle.value = title;
  successMessage.value = message;
  mode.value = 'success';
  if (successTimer) clearTimeout(successTimer);
  successTimer = setTimeout(() => requestClose(), autoCloseMs);
};

// ---------- 复制链接 ----------
const copyLink = async () => {
  const url = shareUrl.value;
  if (!url) return;
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch { /* 走降级 */ }
  if (!copied) {
    // 非安全上下文 / 权限拒绝：execCommand 降级
    try {
      const helper = document.createElement('textarea');
      helper.value = url;
      helper.setAttribute('readonly', '');
      helper.style.cssText = 'position:fixed;top:-999px;opacity:0;';
      document.body.appendChild(helper);
      helper.select();
      copied = document.execCommand('copy');
      document.body.removeChild(helper);
    } catch { copied = false; }
  }
  if (copied) {
    props.onCopied?.();
    finishWithSuccess('链接已复制', '去粘贴给伙伴们吧', 1400);
  } else {
    finishWithSuccess('复制失败', '请手动复制地址栏链接', 2200);
  }
};

// ---------- 站内转发 ----------
const enterForward = () => {
  if (!canForward.value) return;
  if (!props.isLoggedIn) {
    props.requireLogin?.();
    requestClose();
    return;
  }
  forwardError.value = '';
  mode.value = 'forward';
  nextTick(() => commentaryRef.value?.focus());
};

const submitForward = async () => {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  forwardError.value = '';
  try {
    let postId = forwardAction.value?.postId || null;
    // 官方卡来源：先解析镜像卡 id
    if (!postId && forwardAction.value?.sourceType) {
      const resolved = await findQuoteRepostSourceId(
        forwardAction.value.sourceType,
        forwardAction.value.sourceId
      );
      if (resolved.error) {
        forwardError.value = resolved.error.message || '转发失败，请稍后再试';
        return;
      }
      postId = resolved.id;
    }
    if (!postId) {
      forwardError.value = '这条内容暂不支持转发';
      return;
    }
    const result = await createQuoteRepost(postId, commentary.value.trim());
    if (!result.ok) {
      forwardError.value = result.error?.message || '转发失败，请稍后再试';
      return;
    }
    finishWithSuccess('已转发到论坛', '你的转发已发布，去看看吧', 2000);
  } catch (error) {
    forwardError.value = error?.message || '转发失败，请稍后再试';
  } finally {
    isSubmitting.value = false;
  }
};

const onPreviewImageError = (event) => {
  if (event?.target) event.target.style.display = 'none';
};

// Esc 关闭（与导航层交互习惯一致）
const onKeydown = (event) => {
  if (event.key === 'Escape') requestClose();
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (successTimer) clearTimeout(successTimer);
});
</script>

<style scoped>
.share-island-card {
  padding: 14px 15px 15px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 24px;
  color: #1e2938;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.3));
  box-shadow: 0 14px 32px rgba(29, 41, 56, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(255, 255, 255, 0.18);
  backdrop-filter: var(--liquid-filter);
  -webkit-backdrop-filter: var(--liquid-filter);
  animation: share-island-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes share-island-in {
  from { opacity: 0; transform: translateY(-6px); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}

.share-island-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.share-island-title {
  flex: 0 0 auto;
  color: #1d2938;
  font-size: 13.5px;
  font-weight: 760;
  line-height: 1;
}

.share-island-subject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #617084;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-island-head .share-island-subject + .share-island-close { flex: 0 0 auto; }

.share-island-back,
.share-island-close {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #64748b;
  background: rgba(15, 23, 42, 0.05);
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.share-island-back { margin-right: auto; }
.share-island-title + .share-island-close,
.share-island-subject + .share-island-close { margin-left: auto; }

.share-island-back:hover,
.share-island-close:hover {
  color: #1d2938;
  background: rgba(15, 23, 42, 0.1);
}

.share-island-back:active,
.share-island-close:active { transform: scale(0.94); }

/* ---------- 选择器选项 ---------- */
.share-island-options {
  display: grid;
  gap: 7px;
}

.share-option {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(100, 116, 139, 0.1);
  border-radius: 16px;
  color: inherit;
  background: rgba(255, 255, 255, 0.5);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.share-option:hover {
  border-color: rgba(0, 113, 227, 0.22);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 6px 16px rgba(29, 41, 56, 0.08);
  transform: translateY(-1px);
}

.share-option:active { transform: translateY(0) scale(0.99); }

.share-option.is-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.share-option.is-disabled:hover {
  border-color: rgba(100, 116, 139, 0.1);
  background: rgba(255, 255, 255, 0.5);
  box-shadow: none;
  transform: none;
}

.share-option-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
}

.share-option-icon.tone-link { color: #1d62d4; background: #dbeafe; }
.share-option-icon.tone-forward { color: #057857; background: #d8f4e9; }

.share-option-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.share-option-copy strong {
  color: #1d2938;
  font-size: 13.5px;
  font-weight: 720;
  line-height: 1.25;
}

.share-option-copy small {
  overflow: hidden;
  color: #617084;
  font-size: 11.5px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-option-arrow {
  flex: 0 0 auto;
  color: #98a2b3;
}

/* ---------- 转发撰写 ---------- */
.share-source-preview {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  margin-bottom: 9px;
  border: 1px solid rgba(100, 116, 139, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.5);
}

.share-source-image {
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(15, 23, 42, 0.05);
}

.share-source-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 3px;
}

.share-source-title {
  overflow: hidden;
  color: #1d2938;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-source-summary {
  display: -webkit-box;
  overflow: hidden;
  color: #617084;
  font-size: 11.5px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.share-compose {
  display: grid;
  gap: 8px;
}

.share-compose-input {
  width: 100%;
  min-height: 64px;
  max-height: 120px;
  padding: 10px 12px;
  border: 1px solid rgba(100, 116, 139, 0.14);
  border-radius: 14px;
  color: #1d2938;
  background: rgba(255, 255, 255, 0.62);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.share-compose-input::placeholder { color: #98a2b3; }

.share-compose-input:focus {
  border-color: rgba(0, 113, 227, 0.35);
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
}

.share-compose-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.share-compose-count {
  color: #98a2b3;
  font-size: 11px;
  font-weight: 650;
}

.share-compose-count.is-limit { color: #b84212; }

.share-compose-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 76px;
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  color: #ffffff;
  background: #0071e3;
  font: inherit;
  font-size: 12.5px;
  font-weight: 720;
  cursor: pointer;
  transition: background-color 0.18s ease, transform 0.15s ease, opacity 0.18s ease;
}

.share-compose-submit:hover:not(:disabled) { background: #0077ed; }
.share-compose-submit:active:not(:disabled) { transform: scale(0.97); }

.share-compose-submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.share-submit-spinner { animation: share-spin 0.8s linear infinite; }

@keyframes share-spin {
  to { transform: rotate(360deg); }
}

.share-compose-error {
  margin: 0;
  color: #b84212;
  font-size: 11.5px;
  line-height: 1.4;
}

/* ---------- 成功态 ---------- */
.share-success {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 4px 2px;
}

.share-success-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #057857;
  background: #d8f4e9;
}

.share-success-copy {
  display: grid;
  gap: 1px;
}

.share-success-copy strong {
  color: #1d2938;
  font-size: 13.5px;
  font-weight: 740;
}

.share-success-copy small {
  color: #617084;
  font-size: 11.5px;
}

/* ---------- 暗色（与导航岛卡片同款前缀） ---------- */
:global(#unified-nav-container[data-theme="dark"] .share-island-card ){
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, rgba(35, 39, 49, 0.78), rgba(22, 25, 33, 0.58));
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

:global(#unified-nav-container[data-theme="dark"] .share-island-title) { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"] .share-option-copy strong) { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"] .share-source-title) { color: #f8fafc; }
:global(#unified-nav-container[data-theme="dark"] .share-success-copy strong ) { color: #f8fafc; }

:global(#unified-nav-container[data-theme="dark"] .share-island-subject) { color: rgba(226, 232, 240, 0.72); }
:global(#unified-nav-container[data-theme="dark"] .share-option-copy small) { color: rgba(226, 232, 240, 0.72); }
:global(#unified-nav-container[data-theme="dark"] .share-source-summary) { color: rgba(226, 232, 240, 0.72); }
:global(#unified-nav-container[data-theme="dark"] .share-success-copy small ) { color: rgba(226, 232, 240, 0.72); }

:global(#unified-nav-container[data-theme="dark"] .share-option ) {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
}

:global(#unified-nav-container[data-theme="dark"] .share-source-preview ){
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
}

:global(#unified-nav-container[data-theme="dark"] .share-option:hover ){
  border-color: rgba(10, 132, 255, 0.4);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
}

:global(#unified-nav-container[data-theme="dark"] .share-option-icon.tone-link ){ color: #93c5fd; background: rgba(59, 130, 246, 0.18); }
:global(#unified-nav-container[data-theme="dark"] .share-option-icon.tone-forward ){ color: #6ee7b7; background: rgba(16, 185, 129, 0.16); }
:global(#unified-nav-container[data-theme="dark"] .share-success-icon ){ color: #6ee7b7; background: rgba(16, 185, 129, 0.16); }

:global(#unified-nav-container[data-theme="dark"] .share-island-close ){
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
}

:global(#unified-nav-container[data-theme="dark"] .share-island-close:hover ){
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.16);
}

:global(#unified-nav-container[data-theme="dark"] .share-compose-input ){
  color: #f5f5f7;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.07);
}

:global(#unified-nav-container[data-theme="dark"] .share-compose-input:focus ){
  border-color: rgba(10, 132, 255, 0.55);
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.18);
}

:global(#unified-nav-container[data-theme="dark"] .share-compose-input::placeholder ){ color: rgba(148, 163, 184, 0.7); }
:global(#unified-nav-container[data-theme="dark"] .share-compose-count ){ color: rgba(148, 163, 184, 0.8); }
:global(#unified-nav-container[data-theme="dark"] .share-compose-submit ){ background: #0a84ff; }
:global(#unified-nav-container[data-theme="dark"] .share-compose-submit:hover:not(:disabled) ){ background: #2b95ff; }
:global(#unified-nav-container[data-theme="dark"] .share-option-arrow ){ color: rgba(148, 163, 184, 0.7); }

@media (prefers-reduced-motion: reduce) {
  .share-island-card { animation: none; }
}
</style>
