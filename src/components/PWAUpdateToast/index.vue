<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { forceCleanAndReload } from '@/utils/version-checker.js';
import { logger } from '@/utils/logger.js';

// 纯逻辑组件：监听 boh:update-available 事件，通过统一对话框提示用户刷新。
// 弹窗 UI 由 App.vue 的 AdminConfirmModal 统一渲染（符合项目硬约束：不使用原生 window.confirm）。

const { confirm, state } = useConfirmDialog();

// 本次会话已提示过的版本，避免重复弹窗打扰
const promptedVersions = new Set();
// 弹窗被占用（互斥保护）时暂存，待弹窗关闭后重试
const pendingDetail = ref(null);
let isPrompting = false;

const promptUpdate = async (detail) => {
  const version = detail?.remoteVersion || 'unknown';
  if (promptedVersions.has(version)) {
    logger.debug('pwa-update', '该版本已提示过，跳过', version);
    return;
  }
  promptedVersions.add(version);

  isPrompting = true;
  try {
    const shouldUpdate = await confirm({
      title: '发现新版本',
      message: detail?.message || '网站已更新到新版本，建议立即刷新以获取最新内容。',
      confirmText: '立即更新',
      cancelText: '稍后',
      tone: 'success',
    });
    if (shouldUpdate) {
      logger.info('pwa-update', '用户确认更新，开始清除缓存并刷新');
      await forceCleanAndReload();
    } else {
      logger.info('pwa-update', '用户选择稍后更新');
    }
  } catch (err) {
    // 弹窗被占用（useConfirmDialog 互斥保护 reject），暂存待重试
    logger.warn('pwa-update', '更新弹窗被占用，稍后重试', err?.message || err);
    promptedVersions.delete(version); // 允许重试
    pendingDetail.value = detail;
  } finally {
    isPrompting = false;
  }
};

const handleUpdateAvailable = (event) => {
  if (isPrompting) {
    // 正在弹窗中，暂存
    pendingDetail.value = event.detail;
    return;
  }
  promptUpdate(event.detail);
};

// 弹窗关闭后，如果有 pending 的更新提示，重新弹出
watch(() => state.visible, (visible) => {
  if (!visible && pendingDetail.value && !isPrompting) {
    const detail = pendingDetail.value;
    pendingDetail.value = null;
    // 延迟一帧，避免与当前弹窗关闭逻辑冲突
    setTimeout(() => promptUpdate(detail), 50);
  }
});

onMounted(() => {
  window.addEventListener('boh:update-available', handleUpdateAvailable);
});

onUnmounted(() => {
  window.removeEventListener('boh:update-available', handleUpdateAvailable);
});
</script>

<template>
  <span aria-hidden="true" style="display:none" />
</template>
