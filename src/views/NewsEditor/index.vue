<template>
  <div class="news-editor">
    <!-- 前台资讯页原样挂载：不复制卡片、不套第二层布局 -->
    <Newsroom />

    <InlineEditorBar :toast="toast" @exit="exit" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, reactive } from 'vue';
import { useRouter } from 'vue-router';
import Newsroom from '@/views/Newsroom/index.vue';
import InlineEditorBar from '@/components/inline-editor/InlineEditorBar.vue';
import { provideInlineEditor } from '@/composables/useInlineEditor.js';
import { dataConfig } from '@/views/DataManagement/config/tables.js';
import {
  ADMIN_STORAGE_KEYS,
  readLocalJson,
  writeLocalJson,
} from '@/views/DataManagement/composables/useDataAdminPersistence.js';
import {
  deleteAdminRow,
  fetchRecordById,
  patchAdminRow,
} from '@/utils/api/data-admin-table-api.js';
import { invalidateByTags } from '@/utils/request-core.js';
import {
  isCloudinaryNoteUploadConfigured,
  uploadImageToCloudinary,
} from '@/utils/cloudinary-client.js';
import { isDialogBusy, useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { validateInlineField } from '@/utils/inline-editor-validate.js';
import { logger } from '@/utils/logger.js';

/**
 * 资讯「就地编辑」宿主（/admin/news-editor）。
 *
 * 与商城宿主同构，只做四件事：挂前台页面、注入编辑上下文、提供写库通道、叠工具栏。
 * 这里**不实现任何编辑器 UI** —— 卡片上的可点字段来自 `Newsroom` 里的原语，
 * 前台没有注入时它们就是纯文本。
 *
 * 与商城的差别只有两处，都是数据结构决定的：
 *   1. 资讯列表来自 `useNews` 的模块级缓存（`executeRead` 带 `news` tag），写完后要
 *      `invalidateByTags(['news'])`，否则下一次进前台还会读到旧值；
 *   2. 列表里混着节目（`kind: 'show'`，来自静态 `data/shows.js`），它们**不可编辑**，
 *      原语拿到的 `row` 是 null，自然不渲染任何编辑控件。
 */
const router = useRouter();
const { confirm } = useConfirmDialog();

const TABLE = dataConfig.news.table;
const FIELDS = dataConfig.news.fields;
const TAB = 'news';
const TAB_LABEL = '资讯管理';
const DELETED_SNAPSHOT_LIMIT = 30;

const toast = reactive({ show: false, tone: 'ok', message: '' });
let toastTimer = null;

const notify = (message, tone = 'ok') => {
  toast.message = String(message ?? '');
  toast.tone = tone;
  toast.show = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.show = false;
  }, 2400);
};

const save = async (row, field, value) => {
  await patchAdminRow(TABLE, row.id, { [field]: value });
  /* 列表缓存按 tag 失效：不失效的话，改完标题、回前台刷新还是旧字
     （页面本身是乐观更新，看不出问题，下次进入才炸）。 */
  invalidateByTags(['news']);
  notify('已保存', 'ok');
};

/** 删除前先落本机快照，数据管理的「最近删除」可以直接恢复 */
const recordDeletedSnapshot = (row) => {
  if (!row?.id) return;
  const list = readLocalJson(ADMIN_STORAGE_KEYS.deletedSnapshots, []);
  const deletedAt = new Date().toISOString();
  const entry = {
    key: `${TABLE}:${row.id}:${deletedAt}:${Math.random().toString(36).slice(2, 8)}`,
    table: TABLE,
    tab: TAB,
    tabLabel: TAB_LABEL,
    snapshot: JSON.parse(JSON.stringify(row)),
    deletedAt,
  };
  writeLocalJson(
    ADMIN_STORAGE_KEYS.deletedSnapshots,
    [entry, ...(Array.isArray(list) ? list : [])].slice(0, DELETED_SNAPSHOT_LIMIT),
  );
};

const remove = async (row) => {
  if (!row?.id) return;
  let confirmed = false;
  try {
    confirmed = await confirm({
      title: '删除这条资讯？',
      message: `「${row.title || row.id}」会从资讯页消失。本机会留一份快照，可以在数据管理 → 命令面板 →「最近删除」里恢复。`,
      tone: 'danger',
      confirmText: '删除',
    });
  } catch (error) {
    // 连点两下会撞上弹窗互斥保护，这是预期内的拒绝，归化成「取消」
    if (isDialogBusy(error)) return;
    throw error;
  }
  if (!confirmed) return;

  try {
    // 先取库里的原始行：页面上的 row 是列表副本（带 kind），不能直接当快照
    const original = await fetchRecordById({ table: TABLE, selectColumns: '*', id: row.id });
    const snapshot = { ...(original || row) };
    delete snapshot.kind; // 展示用的字段，不是表列
    await deleteAdminRow(TABLE, row.id);
    // 删除成功后才落快照：失败时留下「可恢复」条目会让人点恢复撞主键冲突
    recordDeletedSnapshot(snapshot);
    invalidateByTags(['news']);
    notify('已删除，可在「最近删除」中恢复', 'ok');
  } catch (error) {
    logger.error('news-inline-editor', '删除资讯失败', error);
    notify(`删除失败：${error?.message || '未知错误'}`, 'error');
  }
};

const uploadImage = async (row, field, file) => {
  if (!isCloudinaryNoteUploadConfigured()) throw new Error('未配置 Cloudinary 上传');
  const uploaded = await uploadImageToCloudinary(file, {
    // 资讯封面单独一个目录，出问题时能按目录定位是哪条链路传的
    folder: 'boh-cloud-plus/admin-news-inline',
    pendingSource: 'news-inline-editor',
    claimPendingUpload: true,
  });
  if (!uploaded?.url) throw new Error('上传成功但未返回图片地址');
  // 只负责上传并返回地址；写库由 EditableImage → commit 完成
  return uploaded.url;
};

/** 字段声明：上限/必填等约束只有 tables.js 一份 */
const metaOf = (field) => FIELDS.find((item) => item.key === field) || null;
const validate = (field, value) => validateInlineField(metaOf(field), value);
const labelOf = (field) => metaOf(field)?.label || field;

provideInlineEditor({
  startActive: true,
  save,
  remove,
  validate,
  labelOf,
  metaOf,
  notify,
  uploadImage,
});

const exit = () => {
  router.push('/admin/data-management');
};

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<style scoped>
/* 工具栏 / 提示条在 InlineEditorBar.vue 里；宿主只管自身最小布局 */
.news-editor {
  min-height: 100vh;
}
</style>
