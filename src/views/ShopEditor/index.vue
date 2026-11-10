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
import { reorderList } from '@/utils/shop-order.js';

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
  try {
    await patchAdminRow(metaOfTable(table).table, row.id, { [field]: value });
  } catch (error) {
    /* 迁移没执行时，`card_layout` 这类「新列」的写入会回 42703/PGRST204。
       PostgREST 原文是英文列名，运营不可能看懂；换成一句可执行的话再抛。 */
    const message = String(error?.message || '');
    if (field === 'card_layout' && /card_layout|column|PGRST204|42703/i.test(message)) {
      notify('数据库还没有 products.card_layout 列，请先执行迁移 2026111003', 'error');
      throw error;
    }
    throw error;
  }
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
    await deleteAdminRow(target, row.id);
    /* 快照必须在删除成功之后写：删除失败却留下一条「可恢复」，点恢复会主键冲突。
       取原始行则必须在删除之前 —— 删完就查不到了（2026-11-10 修正顺序）。 */
    recordDeletedSnapshot(original || row, target);
    if (!isLottery) await refreshList();
    notify('已删除，可在「最近删除」中恢复', 'ok');
  } catch (error) {
    logger.error('shop-inline-editor', '删除失败', error);
    notify(`删除失败：${error?.message || '未知错误'}`, 'error');
  }
};

const create = async () => {
  const categoryField = PRODUCT_FIELDS.find((field) => field.key === 'category');
  /* 载荷必须把「非空 / 受约束」的列写全，不能指望 DB 兜底。2026-11-10 用户报障
     「就地编辑新增商品失败」的两个真因，都是漏传列（`ShopConsole.buildPayload`
     早就把这三项写全了，两条新增链路口径不一致才漏出这一处）：
       ① `chk_products_points_required`（见 2026081102 迁移）：
          `payment_mode = 'points_only'` 且 `points_cost = 0` 时，必须
          `is_purchasable = false`；该列 DB 默认 `true` ⇒ 漏传必然违反约束（23514）。
       ② `products.specifications` 是 NOT NULL（2025-04 结构快照确认）且默认值不可依赖
          ⇒ 漏传会撞 23502。
     两者在 PostgREST 里都只是一句英文「新增失败」，运营看不出是缺列还是价格问题。 */
  const list = Array.isArray(productsStore.productsData) ? productsStore.productsData : [];
  const maxOrder = list.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0);
  const payload = {
    title: '新商品',
    category: categoryField?.options?.[0]?.value ?? '',
    description: '',
    payment_mode: 'points_only',
    points_cost: 0,
    rmb_price: null,
    stock: 0,
    image: '',
    specifications: [],
    /* 刻意上架：下架后会被 store 过滤掉，用户会以为「没创建成功」。
       0 价 = 不可购买（`is_purchasable: false`），所以上架也不会误卖。 */
    is_active: true,
    is_purchasable: false,
    /* 排到现有商品之后：整十递增，留出手工插位的空隙（sort_order 升序 → id 升序） */
    sort_order: maxOrder + 10,
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

/**
 * 把「新的展示顺序」落库（上移 / 下移 / 拖拽共用的唯一出口）。
 *
 * 口径真源是前台看到的那份列表（`productsStore.productsData`，已按
 * `sort_order 升序 → id 升序` 排好），不是 v-for 的 index —— 搜索过滤后的下标
 * 与全量顺序不是一回事，拿它算排序会把商品挪到搜索命中的邻居旁边。
 *
 * 为什么整表重编号成 10/20/30…，而不是只交换相邻两行的值：库里绝大多数商品
 * 是列默认值 1000（并列），两行都等于 1000 时「交换」等于什么都没做，
 * 点十次也不动。落成互不相同的序号后顺序才是可复现的。
 * 只 PATCH 值真的变了的行，没排位的商品不会被无谓地刷一遍。
 */
const persistOrderNow = async (next) => {
  if (!Array.isArray(next) || next.length === 0) return;
  const changed = [];
  next.forEach((item, index) => {
    const value = (index + 1) * 10;
    if (Number(item.sort_order) !== value) changed.push({ id: item.id, sort_order: value });
  });
  if (!changed.length) return;

  // 乐观更新：先换 store 里的顺序，TransitionGroup 的 move 过渡才有得可动
  next.forEach((item, index) => {
    item.sort_order = (index + 1) * 10;
  });
  productsStore.productsData = next;

  try {
    for (const item of changed) {
      await patchAdminRow(TABLE, item.id, { sort_order: item.sort_order });
    }
    productsStore.bumpCacheVersion();
    productsStore.clearProductCache();
    notify('顺序已更新', 'ok');
  } catch (error) {
    logger.error('shop-inline-editor', '调整商品顺序失败', error);
    notify(`排序失败：${error?.message || '未知错误'}`, 'error');
    // 乐观值可能与库分叉：回拉一次，别让界面停在一个并不存在的顺序上
    await refreshList();
  }
};

/**
 * 排序写入必须串行：拖完立刻再拖一次（或连点 ↑↓）时，两次 persistOrder 会并发
 * 发 PATCH，网络乱序返回就可能让「后一次的顺序」被「前一次的旧值」覆盖，
 * 表现为「拖了没反应，刷新才变」。队列化的成本只有一次 Promise 链。
 */
let orderQueue = Promise.resolve();
const persistOrder = (next) => {
  orderQueue = orderQueue.then(() => persistOrderNow(next)).catch(() => {});
  return orderQueue;
};

/** 上移 / 下移一格（编辑态卡片右下角的 ↑↓） */
const move = async (row, delta) => {
  const list = Array.isArray(productsStore.productsData) ? productsStore.productsData : [];
  const from = list.findIndex((item) => Number(item.id) === Number(row?.id));
  const to = from + (Number(delta) || 0);
  if (from < 0 || to < 0 || to >= list.length) return;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  await persistOrder(next);
};

/**
 * 拖拽落点（长按抖动排序）。
 *
 * `to` 是**去掉被拖那张之后**的插入下标 —— 与 `splice(from,1)` 之后再
 * `splice(to,0,item)` 的语义完全一致，调用方（Shop 页）算出来的值可以直接用。
 * 越界一律夹到合法区间，避免一次异常手势把整张表写成乱序。
 */
const moveTo = async (row, to) => {
  const list = Array.isArray(productsStore.productsData) ? productsStore.productsData : [];
  const from = list.findIndex((item) => Number(item.id) === Number(row?.id));
  if (from < 0) return;
  await persistOrder(reorderList(list, from, to));
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
  move,
  moveTo,
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
