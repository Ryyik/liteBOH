<template>
  <div class="shop-editor">
    <!-- 前台商城页面原样挂载：不复制、不裁剪、不套第二层布局。
         用户要的就是「整个页面跟前端一样」，所以这里必须是同一个组件实例化。 -->
    <Shop />

    <!-- 工具栏与提示条是**多个宿主共用**的组件（材质、z-index、撤销入口都在里面），
         不要在宿主里再写一份定位样式。 -->
    <InlineEditorBar :toast="toast" @exit="exit" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, reactive } from 'vue';
import { useRouter } from 'vue-router';
import Shop from '@/views/Shop/index.vue';
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
  insertAdminRow,
  patchAdminRow,
} from '@/utils/api/data-admin-table-api.js';
import { useProductsStore } from '@/stores/products';
import {
  isCloudinaryNoteUploadConfigured,
  uploadImageToCloudinary,
} from '@/utils/cloudinary-client.js';
import { isDialogBusy, useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { validateInlineField } from '@/utils/inline-editor-validate.js';
import { logger } from '@/utils/logger.js';

/**
 * 商城「就地编辑」宿主（/admin/shop-editor）。
 *
 * 这个文件只做四件事，**不实现任何编辑器 UI**：
 *   1. 挂载真实前台页面（`<Shop />`）
 *   2. provide 编辑上下文，让页面里的 EditableText / EditableImage 从纯文本
 *      变成可点可改（前台没有任何注入，所以完全不受影响）
 *   3. 提供写库通道：单字段 patch / 删除（带快照）/ 新增 / 上传
 *   4. 叠一条浮动工具栏
 *
 * 为什么校验规则来自 `dataConfig.products.fields` 而不是在这里重写：
 * 就地编辑最容易出的事故就是**绕过校验**（表单里的 required 在页面上并不存在）。
 * 复用同一份字段配置，才能保证「页面上能存进去的东西」和「表单能存进去的东西」一致。
 *
 * 2026-11-10 起这里同时承载**两张表**：商品（`/shop?tab=products`）与抽奖
 * （`/shop?tab=lottery`）。原语用 `table` prop 声明目标表，宿主按表取字段配置与
 * 表名；不声明的一律按商品处理，商城原有调用点不用改。
 */
const router = useRouter();
const productsStore = useProductsStore();
const { confirm } = useConfirmDialog();

const TABLE = dataConfig.products.table;
const LOTTERY_TABLE = dataConfig.lotteries.table;
const PRODUCT_FIELDS = dataConfig.products.fields;
const LOTTERY_FIELDS = dataConfig.lotteries.fields;
const DELETED_SNAPSHOT_LIMIT = 30;

/**
 * 一张前台页面里现在有两张表的内容：商品卡（`products`）与抽奖卡（`lotteries`）。
 * 原语通过 `table` prop 声明目标表，宿主据此取**对应的**字段配置 —— 否则
 * 抽奖卡的 `title` 会按商品的 `title` 校验/取长度上限，看着都能过，实际两套规则。
 * 传空 = 默认商品（商城原有的所有调用点都不用改）。
 */
const TABLE_TABS = {
  [LOTTERY_TABLE]: {
    table: LOTTERY_TABLE,
    tab: 'lotteries',
    label: '抽奖管理',
    fields: LOTTERY_FIELDS,
  },
  [TABLE]: { table: TABLE, tab: 'products', label: '商品管理', fields: PRODUCT_FIELDS },
};
const metaOfTable = (table) => TABLE_TABS[table] || TABLE_TABS[TABLE];

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

const refreshList = async () => {
  // 就地编辑改的是本页内存里的对象，DB 才是真源：写完必须回拉一次，
  // 顺便把其它标签页/设备上的缓存标记失效，避免「改完没生效」的错觉。
  productsStore.bumpCacheVersion();
  productsStore.clearProductCache();
  await productsStore.fetchProducts({ force: true });
};

const save = async (row, field, value, table = '') => {
  await patchAdminRow(metaOfTable(table).table, row.id, { [field]: value });
  // 只有商品进 store 缓存；抽奖列表由 LotteryPanel 自己持有，乐观更新已经生效
  if (metaOfTable(table).table === TABLE) productsStore.bumpCacheVersion();
  notify('已保存', 'ok');
};

/** 删除前先把库里那一行原样存进本机快照，数据管理的「最近删除」可以直接恢复 */
const recordDeletedSnapshot = (row, table = '') => {
  if (!row?.id) return;
  const target = table || TABLE;
  const meta = metaOfTable(target);
  const list = readLocalJson(ADMIN_STORAGE_KEYS.deletedSnapshots, []);
  const deletedAt = new Date().toISOString();
  const entry = {
    key: `${target}:${row.id}:${deletedAt}:${Math.random().toString(36).slice(2, 8)}`,
    table: target,
    tab: meta.tab,
    tabLabel: meta.label,
    snapshot: JSON.parse(JSON.stringify(row)),
    deletedAt,
  };
  writeLocalJson(
    ADMIN_STORAGE_KEYS.deletedSnapshots,
    [entry, ...(Array.isArray(list) ? list : [])].slice(0, DELETED_SNAPSHOT_LIMIT),
  );
};

const remove = async (row, table = '') => {
  if (!row?.id) return;
  const target = table || TABLE;
  const isLottery = target === LOTTERY_TABLE;
  const name = row.title || row.id;
  let confirmed = false;
  try {
    confirmed = await confirm({
      title: isLottery ? '删除这个抽奖？' : '删除这个商品？',
      message: isLottery
        ? `「${name}」会从商城抽奖区消失，已报名的记录也会一起删除。本机会留一份快照，可以在数据管理 → 命令面板 →「最近删除」里恢复。`
        : `「${name}」会从商城消失。本机会留一份快照，可以在数据管理 → 命令面板 →「最近删除」里恢复。`,
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
    // 先取库里的原始行再删：页面上的 row 已被 normalizeProduct 补过默认值，
    // 直接拿它当快照会在恢复时写进一批并不存在的列差异。
    const original = await fetchRecordById({
      table: target,
      selectColumns: '*',
      id: row.id,
    });
    recordDeletedSnapshot(original || row, target);
    await deleteAdminRow(target, row.id);
    if (!isLottery) await refreshList();
    notify('已删除，可在「最近删除」中恢复', 'ok');
  } catch (error) {
    logger.error('shop-inline-editor', '删除失败', error);
    notify(`删除失败：${error?.message || '未知错误'}`, 'error');
  }
};

const create = async () => {
  const categoryField = PRODUCT_FIELDS.find((field) => field.key === 'category');
  const payload = {
    title: '新商品',
    category: categoryField?.options?.[0]?.value ?? '',
    payment_mode: 'points_only',
    points_cost: 0,
    stock: 0,
    /* 刻意上架：下架后会被 store 过滤掉，用户会以为「没创建成功」。
       0 价 + 0 库存会让它自动判定为不可购买，所以不会误卖。 */
    is_active: true,
    sort_order: 1000,
  };
  try {
    await insertAdminRow(TABLE, payload);
    await refreshList();
    notify('已新增，请补全名称、价格与库存', 'ok');
  } catch (error) {
    logger.error('shop-inline-editor', '新增商品失败', error);
    notify(`新增失败：${error?.message || '未知错误'}`, 'error');
  }
};

const uploadImage = async (row, field, file, table = '') => {
  if (!isCloudinaryNoteUploadConfigured()) {
    throw new Error('未配置 Cloudinary 上传');
  }
  const uploaded = await uploadImageToCloudinary(file, {
    // 抽奖封面与商品图分开放，出问题时能按目录定位是哪条链路传的
    folder:
      metaOfTable(table).table === LOTTERY_TABLE
        ? 'boh-cloud-plus/admin-lottery-inline'
        : 'boh-cloud-plus/admin-shop-inline',
    pendingSource: 'shop-inline-editor',
    claimPendingUpload: true,
  });
  if (!uploaded?.url) throw new Error('上传成功但未返回图片地址');
  // 只负责上传并返回地址；写库由 EditableImage → onImageUploaded → commit 完成
  return uploaded.url;
};

/** 字段声明：长度上限等约束从 tables.js 读，宿主不再各写一份数字 */
const metaOf = (field, table = '') =>
  metaOfTable(table).fields.find((item) => item.key === field) || null;

/** 字段级校验：规则与数据管理表单同源（按目标表取对应的 fields） */
const validate = (field, value, row, table = '') =>
  validateInlineField(metaOf(field, table), value);

/** 字段中文名：撤销/提示文案里用它，避免把 `title` 这类列名抛给运营看 */
const labelOf = (field, table = '') => metaOf(field, table)?.label || field;

provideInlineEditor({
  startActive: true,
  save,
  remove,
  create,
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
/* 工具栏 / 提示条的定位、材质与 z-index 都在 InlineEditorBar.vue 里；
   这里只留宿主自身的最小布局，避免同一套浮动 UI 出现第二份样式。 */
.shop-editor {
  min-height: 100vh;
}
</style>
