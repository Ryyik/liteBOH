<template>
  <div class="profile-subpage-shell">
    <UserCenterPageHeader title="导出我的数据" back-label="返回设置" max-width="1200px" @back="$emit('back')" />

    <div class="profile-subpage-body">
      <!-- 液态玻璃连续面板（与设置主页同一设计体系） -->
      <div class="glass-settings">
        <!-- 说明 -->
        <section class="gs-group">
          <div class="gs-rows">
            <div class="gs-row is-static">
              <span class="gs-icon is-indigo">
                <Archive :size="16" :stroke-width="2" aria-hidden="true" />
              </span>
              <span class="gs-text">
                <span class="gs-label">导出我的数据</span>
                <span class="gs-desc">
                  打包你的个人资料、论坛帖子与评论、Cloud+ 云空间、树洞、互动记录等全部个人数据（含图片文件）为
                  ZIP 压缩包，内附一个双击即可离线浏览的网页，下载到本地留存。
                </span>
              </span>
            </div>
          </div>
        </section>

        <!-- 状态与操作 -->
        <section class="gs-group">
          <div class="export-body">
            <div v-if="statusLoading" class="gs-note export-loading">正在获取导出状态…</div>

            <!-- 空闲：未申请过 -->
            <template v-else-if="!job">
              <div class="gs-note">
                导出需要一些时间处理，完成后此处会显示下载入口。你可以离开页面，进度不会丢失。每 7 天可申请一次。
              </div>
              <div class="gs-actions">
                <button class="gs-btn primary" :disabled="actionLoading" @click="handleRequest">
                  {{ actionLoading ? '正在提交申请…' : '申请导出' }}
                </button>
              </div>
            </template>

            <!-- 进行中 -->
            <template v-else-if="job.status === 'processing'">
              <div class="export-progress-meta">
                <span class="export-stage">{{ job.stage || '准备中' }}</span>
                <span class="export-percent">{{ job.progress ?? 0 }}%</span>
              </div>
              <div class="gs-progress-track" role="progressbar" :aria-valuenow="job.progress ?? 0" aria-valuemin="0"
                aria-valuemax="100">
                <div class="gs-progress-fill" :style="{ width: (job.progress ?? 0) + '%' }" />
              </div>
              <div class="gs-note">正在打包你的数据，你可以离开此页面，稍后回来查看进度。</div>
              <div class="gs-actions">
                <button class="gs-btn ghost-danger" :disabled="actionLoading" @click="handleCancel">取消导出</button>
              </div>
            </template>

            <!-- 已就绪 -->
            <template v-else-if="job.status === 'ready'">
              <div class="gs-banner success">
                <CheckCircle2 :size="16" :stroke-width="2" aria-hidden="true" />
                <span>导出完成，文件已就绪{{ fileSizeText }}</span>
              </div>
              <div class="gs-actions">
                <button class="gs-btn primary" :disabled="downloadLoading" @click="handleDownload">
                  {{ downloadLoading ? '正在生成下载链接…' : `下载 ZIP${fileSizeText}` }}
                </button>
              </div>
              <div class="gs-note">下载链接 10 分钟内有效，可重复获取。文件将于{{ expireText }}过期，过期后需重新申请。</div>
              <div class="gs-actions">
                <button class="gs-btn ghost" :disabled="actionLoading" @click="handleRequest">
                  {{ actionLoading ? '正在提交申请…' : '重新申请导出' }}
                </button>
              </div>
            </template>

            <!-- 失败 -->
            <template v-else-if="job.status === 'failed'">
              <div class="gs-banner error">
                <AlertCircle :size="16" :stroke-width="2" aria-hidden="true" />
                <span>导出失败：{{ job.error || '发生未知错误' }}</span>
              </div>
              <div class="gs-actions">
                <button class="gs-btn primary" :disabled="actionLoading" @click="handleRequest">
                  {{ actionLoading ? '正在提交申请…' : '重试导出' }}
                </button>
              </div>
            </template>

            <!-- 已过期 / 已取消：允许重新申请 -->
            <template v-else>
              <div class="gs-note">
                {{ job.status === 'expired' ? '上一次导出的文件已过期，请重新申请导出。' : '导出已取消，你可以重新申请。' }}
              </div>
              <div class="gs-actions">
                <button class="gs-btn primary" :disabled="actionLoading" @click="handleRequest">
                  {{ actionLoading ? '正在提交申请…' : '申请导出' }}
                </button>
              </div>
            </template>

            <div v-if="errorText" class="gs-banner error">
              <AlertCircle :size="16" :stroke-width="2" aria-hidden="true" />
              <span>{{ errorText }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import { AlertCircle, Archive, CheckCircle2 } from 'lucide-vue-next';
import { useConfirmDialog } from '@/composables/useConfirmDialog';
import {
  cancelExport,
  createExportRequest,
  getExportDownloadUrl,
  getExportStatus
} from '@/utils/api/user-data-export-api';

defineEmits(['back']);

const { confirm } = useConfirmDialog();

const job = ref(null);
const statusLoading = ref(true);
const actionLoading = ref(false);
const downloadLoading = ref(false);
const errorText = ref('');
let pollTimer = null;
let pollGeneration = 0;

const formatBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return ` ${n} B`;
  if (n < 1024 * 1024) return ` ${(n / 1024).toFixed(1)} KB`;
  return ` ${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fileSizeText = computed(() => (job.value?.file_size ? `（${formatBytes(job.value.file_size).trim()}）` : ''));

const expireText = computed(() => {
  if (!job.value?.expires_at) return ' 7 天后';
  const diff = new Date(job.value.expires_at).getTime() - Date.now();
  if (diff <= 0) return '即刻';
  const days = Math.max(1, Math.ceil(diff / 86_400_000));
  return ` ${days} 天后`;
});

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollGeneration++;
};

const startPolling = () => {
  stopPolling();
  const gen = ++pollGeneration;
  pollTimer = setInterval(async () => {
    const res = await getExportStatus();
    if (gen !== pollGeneration) return;
    if (res.ok) {
      job.value = res.data.job;
      if (res.data.job?.status !== 'processing') stopPolling();
    }
  }, 3000);
};

onMounted(async () => {
  const res = await getExportStatus();
  if (res.ok) {
    job.value = res.data.job;
    if (job.value?.status === 'processing') startPolling();
  } else {
    errorText.value = res.error.message;
  }
  statusLoading.value = false;
});

onUnmounted(stopPolling);

const handleRequest = async () => {
  errorText.value = '';
  const ok = await confirm({
    title: '申请导出个人数据',
    message: '导出内容包含你的个人资料、论坛帖子与评论、Cloud+ 云空间、树洞、互动记录等全部个人数据，并打包相关图片文件，同时生成一个可离线浏览的网页。导出需要一些时间处理，完成后将显示下载入口，期间你可以离开页面，进度不会丢失。',
    confirmText: '申请导出',
    tone: 'default'
  }).catch(() => false);
  if (!ok) return;

  actionLoading.value = true;
  const res = await createExportRequest();
  actionLoading.value = false;

  if (res.ok) {
    job.value = res.data.job;
    startPolling();
    return;
  }
  if (res.error.nextAvailableAt) {
    const date = new Date(res.error.nextAvailableAt);
    errorText.value = `${res.error.message}（${date.toLocaleDateString()} 后可再次申请）`;
  } else {
    errorText.value = res.error.message;
  }
};

const handleCancel = async () => {
  errorText.value = '';
  const ok = await confirm({
    title: '取消导出',
    message: '确定取消当前导出任务吗？取消后可以重新申请。',
    confirmText: '取消任务',
    tone: 'danger'
  }).catch(() => false);
  if (!ok) return;

  actionLoading.value = true;
  const res = await cancelExport();
  actionLoading.value = false;

  if (res.ok) {
    stopPolling();
    const status = await getExportStatus();
    if (status.ok) job.value = status.data.job;
  } else {
    errorText.value = res.error.message;
  }
};

const handleDownload = async () => {
  errorText.value = '';
  downloadLoading.value = true;
  const res = await getExportDownloadUrl();
  downloadLoading.value = false;

  if (!res.ok) {
    errorText.value = res.error.message;
    // 文件可能已过期，刷新一下状态
    const status = await getExportStatus();
    if (status.ok) job.value = status.data.job;
    return;
  }

  const link = document.createElement('a');
  link.href = res.data.url;
  link.download = res.data.fileName || 'BOH_export.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
};
</script>

<style scoped>
@import '../styles/settings-glass.css';

.profile-subpage-shell {
  padding-top: 0;
}

.export-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px 16px;
}

.export-loading {
  color: var(--liquid-text-secondary, #6e6e73);
}

.export-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
}

.export-stage {
  color: var(--liquid-text-primary, #1d1d1f);
  font-weight: 600;
}

.export-percent {
  color: var(--liquid-text-secondary, #6e6e73);
  font-variant-numeric: tabular-nums;
}

/* 手机横屏：压缩内边距 */
@media (orientation: landscape) and (max-height: 520px) {
  .export-body {
    padding: 10px 16px 12px;
    gap: 9px;
  }
}

/* 暗色（tokens.css dark 未派生 --liquid-text-*） */
[data-theme="dark"] .export-loading {
  color: #a7afba;
}

[data-theme="dark"] .export-stage {
  color: #f4f6f8;
}

[data-theme="dark"] .export-percent {
  color: #a1a1aa;
}
</style>
