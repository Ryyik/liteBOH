<template>
  <div class="shop-editor">
    <!-- 前台商城页面原样挂载：不复制、不裁剪、不套第二层布局。
         用户要的就是「整个页面跟前端一样」，所以这里必须是同一个组件实例化。 -->
    <Shop />

    <!-- 玻璃材质走站点统一真源（styles/common/liquid-glass.css），
         这里绝不自己写 backdrop-filter：check:liquid-glass 会判为第二材质源，
         而且暗色/折射级的取值也会跟不上下一次全局调整。 -->
    <div
      class="se-bar liquid-glass liquid-glass--subtle liquid-glass--pill"
      role="toolbar"
      aria-label="就地编辑工具栏"
    >
      <button
        type="button"
        class="se-btn"
        :class="{ 'is-on': editor.active }"
        :aria-pressed="editor.active"
        @click="editor.toggle()"
      >
        <Pencil v-if="!editor.active" :size="14" :stroke-width="2" aria-hidden="true" />
        <Check v-else :size="14" :stroke-width="2.4" aria-hidden="true" />
        <span>{{ editor.active ? '编辑中' : '浏览模式' }}</span>
      </button>

      <button
        v-if="editor.active"
        type="button"
        class="se-btn"
        :disabled="!editor.canUndo"
        @click="editor.undo()"
      >
        <Undo2 :size="14" :stroke-width="2" aria-hidden="true" />
        <span>撤销{{ editor.undoCount ? ` ${editor.undoCount}` : '' }}</span>
      </button>

      <button type="button" class="se-btn" @click="exit">退出</button>
    </div>

    <div v-if="toast.show" class="se-toast" :class="`is-${toast.tone}`" role="status">
      <span>{{ toast.message }}</span>
      <!-- 撤销放在提示条里而不是只靠顶部工具栏：商品详情弹层的 z-index 接近 int32
           上限（2147482400），工具栏盖不上去；弹层里改完一个字，撤销入口必须在
           手边，否则得先关掉详情才能退回去。 -->
      <button v-if="editor.canUndo" type="button" class="se-toast-action" @click="editor.undo()">
        撤销
      </button>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { Check, Pencil, Undo2 } from 'lucide-vue-next';
import Shop from '@/views/Shop/index.vue';
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
 */
const router = useRouter();
const productsStore = useProductsStore();
const { confirm } = useConfirmDialog();

const TABLE = dataConfig.products.table;
const PRODUCT_FIELDS = dataConfig.products.fields;
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

const refreshList = async () => {
  // 就地编辑改的是本页内存里的对象，DB 才是真源：写完必须回拉一次，
  // 顺便把其它标签页/设备上的缓存标记失效，避免「改完没生效」的错觉。
  productsStore.bumpCacheVersion();
  productsStore.clearProductCache();
  await productsStore.fetchProducts({ force: true });
};

const save = async (row, field, value) => {
  await patchAdminRow(TABLE, row.id, { [field]: value });
  productsStore.bumpCacheVersion();
  notify('已保存', 'ok');
};

/** 删除前先把库里那一行原样存进本机快照，数据管理的「最近删除」可以直接恢复 */
const recordDeletedSnapshot = (row) => {
  if (!row?.id) return;
  const list = readLocalJson(ADMIN_STORAGE_KEYS.deletedSnapshots, []);
  const deletedAt = new Date().toISOString();
  const entry = {
    key: `${TABLE}:${row.id}:${deletedAt}:${Math.random().toString(36).slice(2, 8)}`,
    table: TABLE,
    tab: 'products',
    tabLabel: '商品管理',
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
      title: '删除这个商品？',
      message: `「${row.title || row.id}」会从商城消失。本机会留一份快照，可以在数据管理 → 命令面板 →「最近删除」里恢复。`,
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
      table: TABLE,
      selectColumns: '*',
      id: row.id,
    });
    recordDeletedSnapshot(original || row);
    await deleteAdminRow(TABLE, row.id);
    await refreshList();
    notify('已删除，可在「最近删除」中恢复', 'ok');
  } catch (error) {
    logger.error('shop-inline-editor', '删除商品失败', error);
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

const uploadImage = async (row, field, file) => {
  if (!isCloudinaryNoteUploadConfigured()) {
    throw new Error('未配置 Cloudinary 上传');
  }
  const uploaded = await uploadImageToCloudinary(file, {
    folder: 'boh-cloud-plus/admin-shop-inline',
    pendingSource: 'shop-inline-editor',
    claimPendingUpload: true,
  });
  if (!uploaded?.url) throw new Error('上传成功但未返回图片地址');
  // 只负责上传并返回地址；写库由 EditableImage → onImageUploaded → commit 完成
  return uploaded.url;
};

/** 字段级校验：规则与数据管理表单同源（dataConfig.products.fields） */
const validate = (field, value) =>
  validateInlineField(
    PRODUCT_FIELDS.find((item) => item.key === field),
    value,
  );

/** 字段声明：长度上限等约束从 tables.js 读，宿主不再各写一份数字 */
const metaOf = (field) => PRODUCT_FIELDS.find((item) => item.key === field) || null;

/** 字段中文名：撤销/提示文案里用它，避免把 `title` 这类列名抛给运营看 */
const labelOf = (field) => metaOf(field)?.label || field;

const editor = provideInlineEditor({
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
.shop-editor {
  min-height: 100vh;
}

/* 材质（背景/描边/投影/blur）全部来自 .liquid-glass*，这里只管定位与排布。
   ⚠️ 文字色必须用 --liquid-text-primary 而不是 --foreground：后者来自 dark-mode.css，
   那个文件按路由懒加载，/admin/shop-editor 这条链上拿不到 ⇒ 暗色下会是深字压深底。 */
.se-bar {
  position: fixed;
  top: max(10px, env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--liquid-text-primary, #1d1d1f);
  transform: translateX(-50%);
}

.se-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.se-btn:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 10%, transparent);
}

/* 反色胶囊不能用 --foreground/--background 做配对（两者都受懒加载影响）：
   直接钉品牌蓝 + 白字，两种主题下对比都够，且与「编辑态」的语义一致。 */
.se-btn.is-on {
  background: #0071e3;
  color: #fff;
}

.se-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.se-toast {
  position: fixed;
  /* 抬到移动端底部导航之上：底栏约 88px + 安全区，78px 会被压住半截 */
  bottom: calc(104px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  /* 必须压过商品详情弹层（2147482400），否则在详情页里改完看不到「已保存」 */
  z-index: 2147482501;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 86vw;
  padding: 9px 12px 9px 16px;
  border-radius: 999px;
  /* 固定深底白字：两套主题下都是系统 toast 的标准观感，
     也不依赖 dark-mode.css（那条链在本路由是懒加载的） */
  background: rgba(28, 28, 30, 0.94);
  color: #fff;
  font-size: 13px;
  line-height: 1.35;
  transform: translateX(-50%);
  animation: se-toast-in 0.2s ease;
}

.se-toast.is-error {
  background: #c4261f;
}

.se-toast-action {
  flex: none;
  padding: 4px 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.se-toast-action:hover {
  background: rgba(255, 255, 255, 0.32);
}

@keyframes se-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .se-toast {
    animation: none;
  }
}
</style>
