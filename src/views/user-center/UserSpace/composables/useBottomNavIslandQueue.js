import { computed, nextTick, reactive, ref } from 'vue';

const DEFAULT_PRIORITY = {
  message: 3,
  notification: 2,
  warning: 2,
  progress: 1,
  success: 0
};

const DEFAULT_CAT_STICKERS = {
  ai: 'theme',
  comment: 'like',
  delete: 'delete',
  failed: 'failed',
  message: 'mobileGap',
  notification: 'cardExtra',
  post: 'decorAlt',
  progress: 'uploading',
  search: 'decor',
  success: 'success',
  theme: 'theme',
  uploading: 'uploading',
  warning: 'decor'
};

const DEFAULT_CAT_STICKER_MODES = {
  ai: 'hero',
  comment: 'hero',
  delete: 'hero',
  failed: 'hero',
  message: 'hero',
  notification: 'hero',
  post: 'hero',
  progress: 'hero',
  search: 'hero',
  success: 'hero',
  theme: 'hero',
  uploading: 'hero',
  warning: 'hero'
};

const resolveCatStickerType = ({ catSticker, icon, type }) => {
  if (catSticker) return catSticker;
  return DEFAULT_CAT_STICKERS[type] || DEFAULT_CAT_STICKERS[icon] || '';
};

const resolveCatStickerMode = ({ catStickerMode, icon, type }) => {
  if (catStickerMode) return catStickerMode;
  return DEFAULT_CAT_STICKER_MODES[type] || DEFAULT_CAT_STICKER_MODES[icon] || 'peek';
};

export const useBottomNavIslandQueue = ({
  onShow,
  onAction
} = {}) => {
  const island = reactive({
    visible: false,
    title: '',
    message: '',
    icon: 'success',
    actionLabel: '确定',
    actionTab: null,
    isLong: false,
    catSticker: '',
    catStickerMode: 'hero',
    forceCatSticker: false
  });
  const isCollapsing = ref(false);
  const isExpanded = computed(() => island.visible);
  const queue = [];
  let dismissTimer = null;

  const clearDismissTimer = () => {
    if (!dismissTimer) return;
    clearTimeout(dismissTimer);
    dismissTimer = null;
  };

  const normalizePayload = (payload = {}) => {
    const title = String(payload.title || '').trim() || '已保存';
    const message = String(payload.message || '').trim();
    const icon = String(payload.icon || '').trim() || 'success';
    const actionLabel = String(payload.actionLabel || '').trim() || '确定';
    const actionTab = String(payload.actionTab || '').trim() || null;
    const durationMs = Math.min(Math.max(Number(payload.durationMs) || 4800, 1800), 9000);
    const type = String(payload.type || icon || 'success').trim();
    const textLength = `${title}${message}`.length;
    const payloadCatSticker = String(payload.catSticker || '').trim();
    const payloadCatStickerMode = String(payload.catStickerMode || '').trim();
    const catSticker = resolveCatStickerType({ catSticker: payloadCatSticker, icon, type });
    const catStickerMode = resolveCatStickerMode({ catStickerMode: payloadCatStickerMode, icon, type });

    return {
      type,
      priority: Number.isFinite(Number(payload.priority))
        ? Number(payload.priority)
        : (DEFAULT_PRIORITY[type] ?? 0),
      title,
      message,
      icon,
      actionLabel,
      actionTab,
      durationMs,
      isLong: Boolean(payload.isLong) || textLength > 24,
      catSticker,
      catStickerMode,
      forceCatSticker: Boolean(payload.forceCatSticker),
      count: Math.max(1, Number(payload.count || 1))
    };
  };

  const dismiss = () => {
    clearDismissTimer();
    island.visible = false;
  };

  const applyItem = (item) => {
    const safeItem = normalizePayload(item);

    clearDismissTimer();
    onShow?.(safeItem);
    isCollapsing.value = false;
    island.title = safeItem.title;
    island.message = safeItem.message;
    island.icon = safeItem.icon;
    island.actionLabel = safeItem.actionLabel;
    island.actionTab = safeItem.actionTab;
    island.isLong = safeItem.isLong;
    island.catSticker = safeItem.catSticker;
    island.catStickerMode = safeItem.catStickerMode;
    island.forceCatSticker = safeItem.forceCatSticker;
    island.visible = false;

    void nextTick(() => {
      island.visible = true;
      dismissTimer = setTimeout(() => {
        dismiss();
      }, safeItem.durationMs);
    });
  };

  const flush = () => {
    if (island.visible || isCollapsing.value) return;
    const nextItem = queue.shift();
    if (!nextItem) return;
    applyItem(nextItem);
  };

  const show = (payload = {}) => {
    const item = normalizePayload(payload);
    const mergeIndex = queue.findIndex((queued) =>
      queued.type === item.type &&
      queued.actionTab === item.actionTab
    );

    if (mergeIndex >= 0) {
      const queued = queue[mergeIndex];
      queued.count += item.count;
      queued.priority = Math.max(queued.priority, item.priority);
      queued.title = item.title;
      queued.message = item.message;
      queued.durationMs = Math.max(queued.durationMs, item.durationMs);
    } else {
      queue.push(item);
    }

    queue.sort((a, b) => b.priority - a.priority);
    flush();
  };

  const clearQueue = () => {
    queue.length = 0;
  };

  const handleAction = () => {
    const actionTab = island.actionTab;
    clearQueue();
    dismiss();
    onAction?.(actionTab);
  };

  const handleBeforeLeave = () => {
    isCollapsing.value = true;
  };

  const handleAfterLeave = () => {
    isCollapsing.value = false;
    flush();
  };

  const dispose = () => {
    clearDismissTimer();
    clearQueue();
  };

  return {
    island,
    isCollapsing,
    isExpanded,
    show,
    dismiss,
    flush,
    handleAction,
    handleBeforeLeave,
    handleAfterLeave,
    dispose
  };
};
