<template>
  <div class="shop-console">
    <header class="console-toolbar">
      <div class="toolbar-heading">
        <button type="button" class="icon-button" title="返回数据管理" @click="goBackToAdmin">
          <ChevronLeft :size="20" aria-hidden="true" />
        </button>
        <div>
          <h1>商城管理</h1>
          <p>{{ products.length }} 件商品<span v-if="dirtyCount"> · {{ dirtyCount }} 项未保存</span></p>
        </div>
      </div>

      <div class="toolbar-actions">
        <button type="button" class="icon-button" title="刷新商品" :disabled="isLoading" @click="loadProducts()">
          <RefreshCw :size="18" :class="{ spinning: isLoading }" aria-hidden="true" />
        </button>
        <button type="button" class="secondary-button" @click="startNewProduct">
          <Plus :size="17" aria-hidden="true" /> 新建商品
        </button>
        <button type="button" class="primary-button" :disabled="isSaving || !dirtyCount" @click="saveAll">
          <Save :size="17" aria-hidden="true" /> {{ isSaving ? '保存中' : '保存全部' }}
        </button>
      </div>
    </header>

    <main class="console-layout">
      <aside class="product-sidebar glass-panel">
        <div class="sidebar-filters">
          <label class="search-field">
            <Search :size="17" aria-hidden="true" />
            <input v-model.trim="searchQuery" type="search" placeholder="搜索商品" aria-label="搜索商品" />
          </label>
          <div class="filter-row">
            <select v-model="categoryFilter" aria-label="按分类筛选">
              <option value="all">全部分类</option>
              <option v-for="option in categoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <select v-model="statusFilter" aria-label="按状态筛选">
              <option value="all">全部状态</option>
              <option value="active">商城展示</option>
              <option value="hidden">已隐藏</option>
              <option value="unavailable">不可购买</option>
            </select>
          </div>
        </div>

        <div class="product-list">
          <button
            v-for="product in filteredProducts"
            :key="product.id"
            type="button"
            class="product-row"
            :class="{ selected: selectedId === product.id }"
            @click="selectProduct(product)"
          >
            <span class="row-image">
              <img v-if="product.image" :src="resolveImage(product.image)" :alt="product.title" />
              <ImageIcon v-else :size="20" aria-hidden="true" />
            </span>
            <span class="row-copy">
              <strong>{{ product.title || '未命名商品' }}</strong>
              <small>{{ product.category || '未分类' }} · {{ displayPoints(product) }}</small>
            </span>
            <span class="row-status" :class="productStatus(product).tone">{{ productStatus(product).label }}</span>
            <span v-if="isDirty(product.id)" class="dirty-dot" title="未保存"></span>
          </button>

          <div v-if="!filteredProducts.length" class="empty-list">
            <PackageSearch :size="26" aria-hidden="true" />
            <span>没有匹配的商品</span>
          </div>
        </div>
      </aside>

      <template v-if="selectedProduct">
        <section class="image-workspace glass-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">主图</span>
              <h2>裁切与预览</h2>
            </div>
            <span class="ratio-badge">4:3</span>
          </div>

          <div class="image-preview" :class="{ empty: !selectedProduct.image }">
            <img v-if="selectedProduct.image" :src="resolveImage(selectedProduct.image)" :alt="selectedProduct.title || '商品图片预览'" />
            <div v-else class="preview-placeholder">
              <ImageIcon :size="34" aria-hidden="true" />
              <span>上传图片后在这里预览</span>
            </div>
            <div v-if="isUploading" class="upload-overlay">
              <LoaderCircle :size="24" class="spinning" aria-hidden="true" />
              <span>正在上传裁切图</span>
            </div>
          </div>

          <div class="image-actions">
            <label class="primary-button upload-button" :class="{ disabled: isUploading }">
              <Crop :size="17" aria-hidden="true" /> 选择并裁切
              <input type="file" accept="image/png,image/jpeg,image/webp" :disabled="isUploading" @change="handleImageSelection" />
            </label>
            <button v-if="selectedProduct.image" type="button" class="secondary-button" :disabled="isUploading" @click="clearImage">
              <Trash2 :size="16" aria-hidden="true" /> 移除图片
            </button>
          </div>

          <label class="url-field">
            <span>图片链接</span>
            <input v-model.trim="selectedProduct.image" type="url" placeholder="https://" @input="markDirty(selectedProduct.id)" />
          </label>

          <div class="store-card-preview">
            <span class="eyebrow">商城卡片预览</span>
            <div class="preview-card">
              <div class="preview-card-media">
                <img v-if="selectedProduct.image" :src="resolveImage(selectedProduct.image)" :alt="selectedProduct.title" />
                <ImageIcon v-else :size="24" aria-hidden="true" />
              </div>
              <strong>{{ selectedProduct.title || '商品名称' }}</strong>
              <span>{{ displayPoints(selectedProduct) }}</span>
            </div>
          </div>
        </section>

        <section class="editor-panel glass-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">商品信息</span>
              <h2>{{ selectedProduct.title || '新商品' }}</h2>
            </div>
            <button type="button" class="danger-icon-button" title="删除商品" :disabled="isSaving" @click="deleteProduct(selectedProduct.id)">
              <Trash2 :size="18" aria-hidden="true" />
            </button>
          </div>

          <div class="status-settings">
            <label class="toggle-row">
              <span><strong>商城展示</strong><small>关闭后商品不会出现在商城</small></span>
              <input v-model="selectedProduct.is_active" type="checkbox" @change="markDirty(selectedProduct.id)" />
              <i aria-hidden="true"></i>
            </label>
            <label class="toggle-row">
              <span><strong>允许购买</strong><small>关闭后保留价格，但用户无法加入购物袋</small></span>
              <input v-model="selectedProduct.is_purchasable" type="checkbox" @change="markDirty(selectedProduct.id)" />
              <i aria-hidden="true"></i>
            </label>
          </div>

          <div class="form-grid">
            <label class="field field-wide">
              <span>商品名称</span>
              <input v-model="selectedProduct.title" maxlength="60" placeholder="输入商品名称" @input="markDirty(selectedProduct.id)" />
            </label>
            <label class="field field-wide">
              <span>分类</span>
              <select v-model="selectedProduct.category" @change="markDirty(selectedProduct.id)">
                <option v-for="option in categoryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>积分价格</span>
              <input v-model.number="selectedProduct.points_cost" type="number" min="0" inputmode="numeric" @input="markDirty(selectedProduct.id)" />
            </label>
            <label class="field">
              <span>库存</span>
              <input v-model.number="selectedProduct.stock" type="number" min="0" inputmode="numeric" @input="markDirty(selectedProduct.id)" />
            </label>
            <label class="field field-wide">
              <span>商品描述</span>
              <textarea v-model="selectedProduct.description" rows="4" placeholder="输入商品介绍" @input="markDirty(selectedProduct.id)"></textarea>
            </label>
          </div>

          <div class="spec-section">
            <div class="spec-heading">
              <span>规格选项</span>
              <button type="button" class="text-button" @click="addSpec"><Plus :size="15" aria-hidden="true" /> 添加规格</button>
            </div>
            <div v-if="selectedProduct.specifications.length" class="spec-list">
              <div v-for="(spec, index) in selectedProduct.specifications" :key="index" class="spec-row">
                <input v-model="spec.label" placeholder="显示名称" aria-label="规格显示名称" @input="markDirty(selectedProduct.id)" />
                <input v-model="spec.value" placeholder="内部值" aria-label="规格内部值" @input="markDirty(selectedProduct.id)" />
                <button type="button" class="spec-remove" title="移除规格" @click="removeSpec(index)"><X :size="16" aria-hidden="true" /></button>
              </div>
            </div>
            <p v-else class="spec-empty">没有规格时，购买会使用默认规格。</p>
          </div>

          <footer class="editor-footer">
            <span>{{ isDirty(selectedProduct.id) ? '有未保存的修改' : '所有修改已保存' }}</span>
            <button type="button" class="primary-button" :disabled="isSaving || !isDirty(selectedProduct.id)" @click="saveProduct(selectedProduct.id)">
              <Save :size="17" aria-hidden="true" /> 保存商品
            </button>
          </footer>
        </section>
      </template>

      <section v-else class="selection-empty glass-panel">
        <PackageSearch :size="36" aria-hidden="true" />
        <h2>选择一个商品开始编辑</h2>
        <button type="button" class="primary-button" @click="startNewProduct"><Plus :size="17" aria-hidden="true" /> 新建商品</button>
      </section>
    </main>

    <AvatarCropModal
      v-model:visible="cropVisible"
      :image-src="cropSource"
      :loading="isUploading"
      title="裁切商品主图"
      hint="拖动和缩放图片，保留商品主体"
      sub-hint="裁切结果会按商城 4:3 比例显示"
      :aspect-ratio="4 / 3"
      shape="rectangle"
      output-type="image/webp"
      :output-quality="0.92"
      @confirm="handleCropConfirm"
      @cancel="releaseCropSource"
    />

    <div v-if="toast.show" class="console-toast" role="status">{{ toast.message }}</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft, Crop, Image as ImageIcon, LoaderCircle, PackageSearch, Plus,
  RefreshCw, Save, Search, Trash2, X
} from 'lucide-vue-next';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { useAuthStore } from '@/stores/auth';
import { getImageUrl } from '@/utils/asset-helper.js';
import { uploadImageToCloudinary, isCloudinaryNoteUploadConfigured } from '@/utils/cloudinary-client.js';
import { logger } from '@/utils/logger.js';
import { supabase } from '@/utils/supabase-client';
import { invalidateProductsCache, PRODUCT_CATEGORY_OPTIONS } from '@/views/DataManagement/config.js';

const router = useRouter();
const authStore = useAuthStore();
const dialog = useConfirmDialog();
const products = ref([]);
const drafts = reactive({});
const dirtyIds = reactive(new Set());
const selectedId = ref(null);
const searchQuery = ref('');
const categoryFilter = ref('all');
const statusFilter = ref('all');
const isLoading = ref(false);
const isSaving = ref(false);
const isUploading = ref(false);
const cropVisible = ref(false);
const cropSource = ref('');
const toast = ref({ show: false, message: '' });
let toastTimer = null;
let tempCounter = 0;

const categoryOptions = PRODUCT_CATEGORY_OPTIONS;
const parseId = (value) => {
  const id = Number(typeof value === 'object' && value !== null ? value.id : value);
  return Number.isFinite(id) ? id : 0;
};
const normalizeSpecs = (value) => {
  if (Array.isArray(value)) return value.map((item) => ({ label: String(item?.label || ''), value: String(item?.value || '') }));
  if (typeof value === 'string') {
    try { return normalizeSpecs(JSON.parse(value)); } catch { return []; }
  }
  return [];
};
const cloneProduct = (product) => ({
  ...product,
  id: parseId(product),
  title: String(product.title || ''),
  category: String(product.category || categoryOptions[0]?.value || ''),
  description: String(product.description || ''),
  points_cost: Math.max(0, Math.round(Number(product.points_cost) || 0)),
  stock: Math.max(0, Math.round(Number(product.stock) || 0)),
  image: String(product.image || ''),
  specifications: normalizeSpecs(product.specifications),
  is_active: product.is_active !== false,
  is_purchasable: product.is_purchasable !== false && Number(product.points_cost) > 0
});

const dirtyCount = computed(() => dirtyIds.size);
const selectedProduct = computed(() => selectedId.value === null ? null : drafts[selectedId.value] || null);
const visibleProducts = computed(() => {
  const saved = products.value.map((item) => drafts[item.id] || item);
  const unsaved = Object.values(drafts).filter((item) => item.id < 0);
  return [...unsaved, ...saved];
});
const filteredProducts = computed(() => {
  const query = searchQuery.value.toLocaleLowerCase();
  return visibleProducts.value.filter((product) => {
    const matchesQuery = !query || `${product.title} ${product.category} ${product.description}`.toLocaleLowerCase().includes(query);
    const matchesCategory = categoryFilter.value === 'all' || product.category === categoryFilter.value;
    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'active' && product.is_active)
      || (statusFilter.value === 'hidden' && !product.is_active)
      || (statusFilter.value === 'unavailable' && !product.is_purchasable);
    return matchesQuery && matchesCategory && matchesStatus;
  });
});

const resolveImage = (path) => path?.startsWith('blob:') ? path : getImageUrl(path, { silent: true });
const isDirty = (id) => dirtyIds.has(parseId(id));
const markDirty = (id) => dirtyIds.add(parseId(id));
const displayPoints = (product) => product?.is_purchasable === false || Number(product?.points_cost) <= 0
  ? '不可购买'
  : `${Math.round(Number(product.points_cost))} 积分`;
const productStatus = (product) => {
  if (!product.is_active) return { label: '隐藏', tone: 'muted' };
  if (!product.is_purchasable) return { label: '不可购买', tone: 'warning' };
  if (Number(product.stock) <= 0) return { label: '缺货', tone: 'warning' };
  return { label: '销售中', tone: 'success' };
};

function showToast(message) {
  toast.value = { show: true, message };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value.show = false; }, 3000);
}
function selectProduct(product) {
  const id = parseId(product);
  if (!drafts[id]) drafts[id] = cloneProduct(product);
  selectedId.value = id;
}
function startNewProduct() {
  tempCounter -= 1;
  const product = cloneProduct({
    id: tempCounter,
    category: categoryOptions[0]?.value,
    title: '', description: '', points_cost: 0, stock: 0, image: '', specifications: [],
    is_active: true, is_purchasable: false
  });
  drafts[tempCounter] = product;
  dirtyIds.add(tempCounter);
  selectedId.value = tempCounter;
}
function addSpec() {
  selectedProduct.value.specifications.push({ label: '', value: '' });
  markDirty(selectedId.value);
}
function removeSpec(index) {
  selectedProduct.value.specifications.splice(index, 1);
  markDirty(selectedId.value);
}
function clearImage() {
  if (selectedProduct.value.image.startsWith('blob:')) URL.revokeObjectURL(selectedProduct.value.image);
  selectedProduct.value.image = '';
  markDirty(selectedId.value);
}
function releaseCropSource() {
  if (cropSource.value.startsWith('blob:')) URL.revokeObjectURL(cropSource.value);
  cropSource.value = '';
}
function handleImageSelection(event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!String(file.type).startsWith('image/')) return showToast('请选择图片文件');
  releaseCropSource();
  cropSource.value = URL.createObjectURL(file);
  cropVisible.value = true;
}
async function handleCropConfirm(blob) {
  if (!selectedProduct.value || isUploading.value) return;
  let localPreview = '';
  const previousImage = selectedProduct.value.image;
  try {
    if (!isCloudinaryNoteUploadConfigured()) throw new Error('请先配置 Cloudinary 上传');
    isUploading.value = true;
    localPreview = URL.createObjectURL(blob);
    selectedProduct.value.image = localPreview;
    markDirty(selectedId.value);
    const file = new File([blob], `shop-product-${Date.now()}.webp`, { type: 'image/webp' });
    const uploaded = await uploadImageToCloudinary(file, {
      folder: 'boh-cloud-plus/admin-shop-console',
      pendingSource: 'shop-console'
    });
    if (!uploaded.url) throw new Error('上传成功但未返回图片地址');
    selectedProduct.value.image = uploaded.url;
    URL.revokeObjectURL(localPreview);
    localPreview = '';
    cropVisible.value = false;
    releaseCropSource();
    showToast('裁切图已上传，保存商品后生效');
  } catch (error) {
    if (selectedProduct.value?.image === localPreview) selectedProduct.value.image = previousImage;
    if (localPreview) URL.revokeObjectURL(localPreview);
    localPreview = '';
    logger.error('shop-console', '商品图片上传失败', error);
    showToast(`图片上传失败：${error?.message || '未知错误'}`);
  } finally {
    if (localPreview && selectedProduct.value?.image !== localPreview) URL.revokeObjectURL(localPreview);
    isUploading.value = false;
  }
}

function validateDraft(draft) {
  if (!String(draft.title || '').trim()) return '商品名称不能为空';
  if (!String(draft.category || '').trim()) return '请选择商品分类';
  if (!Number.isFinite(Number(draft.points_cost)) || Number(draft.points_cost) < 0) return '积分价格不能小于 0';
  if (!Number.isFinite(Number(draft.stock)) || Number(draft.stock) < 0) return '库存不能小于 0';
  return '';
}
const buildPayload = (draft) => ({
  title: String(draft.title || '').trim(),
  category: String(draft.category || '').trim(),
  description: String(draft.description || '').trim(),
  points_cost: Math.max(0, Math.round(Number(draft.points_cost) || 0)),
  stock: Math.max(0, Math.round(Number(draft.stock) || 0)),
  image: String(draft.image || '').trim(),
  specifications: normalizeSpecs(draft.specifications).filter((item) => item.label.trim() && item.value.trim()),
  is_active: draft.is_active !== false,
  is_purchasable: draft.is_purchasable !== false
});
async function persistDraft(id) {
  const draft = drafts[id];
  if (!draft) return { ok: false, message: '商品草稿不存在' };
  const validationError = validateDraft(draft);
  if (validationError) return { ok: false, message: validationError };
  if (!authStore.isAdmin) return { ok: false, message: '仅管理员可保存商品' };
  const payload = buildPayload(draft);
  if (id < 0) {
    const { data, error } = await supabase.from('products').insert(payload).select('*').single();
    if (error) throw error;
    const newId = parseId(data);
    if (!newId) throw new Error('新增商品后未返回 ID');
    dirtyIds.delete(id);
    return { ok: true, id: newId };
  }
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) throw error;
  dirtyIds.delete(id);
  return { ok: true, id };
}
async function saveProduct(id) {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    const result = await persistDraft(parseId(id));
    if (!result.ok) return showToast(result.message);
    invalidateProductsCache();
    await loadProducts(result.id);
    showToast('商品已保存，商城数据已刷新');
  } catch (error) {
    logger.error('shop-console', '保存商品失败', error);
    showToast(`保存失败：${error?.message || '未知错误'}`);
  } finally { isSaving.value = false; }
}
async function saveAll() {
  if (isSaving.value || !dirtyIds.size) return;
  isSaving.value = true;
  let lastId = selectedId.value;
  try {
    for (const id of [...dirtyIds]) {
      const result = await persistDraft(id);
      if (!result.ok) throw new Error(result.message);
      if (id === selectedId.value) lastId = result.id;
    }
    invalidateProductsCache();
    await loadProducts(lastId);
    showToast('全部修改已保存');
  } catch (error) {
    logger.error('shop-console', '批量保存商品失败', error);
    showToast(`保存失败：${error?.message || '未知错误'}`);
  } finally { isSaving.value = false; }
}
async function deleteProduct(id) {
  const product = drafts[parseId(id)];
  if (!product) return;
  const confirmed = await dialog.confirm({
    title: '删除商品',
    message: `确定删除「${product.title || '未命名商品'}」吗？此操作会立即从商城移除。`,
    tone: 'danger'
  }).catch(() => false);
  if (!confirmed) return;
  if (!authStore.isAdmin) return showToast('仅管理员可删除商品');
  try {
    isSaving.value = true;
    if (product.id > 0) {
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
    }
    delete drafts[product.id];
    dirtyIds.delete(product.id);
    selectedId.value = null;
    invalidateProductsCache();
    await loadProducts();
    showToast('商品已删除');
  } catch (error) {
    logger.error('shop-console', '删除商品失败', error);
    showToast(`删除失败：${error?.message || '未知错误'}`);
  } finally { isSaving.value = false; }
}
async function loadProducts(preferredId = selectedId.value) {
  isLoading.value = true;
  try {
    const { data, error } = await supabase.from('products').select('*').order('id', { ascending: true });
    if (error) throw error;
    Object.keys(drafts).forEach((key) => delete drafts[key]);
    dirtyIds.clear();
    products.value = (data || []).map(cloneProduct);
    products.value.forEach((product) => { drafts[product.id] = cloneProduct(product); });
    const preferred = products.value.find((product) => product.id === Number(preferredId));
    selectedId.value = (preferred || products.value[0])?.id ?? null;
  } catch (error) {
    logger.error('shop-console', '加载商品失败', error);
    showToast('加载商品失败，请检查数据库连接');
  } finally { isLoading.value = false; }
}
function goBackToAdmin() { router.push('/admin/data-management'); }

onMounted(() => loadProducts());
onBeforeUnmount(() => {
  releaseCropSource();
  if (selectedProduct.value?.image?.startsWith('blob:')) URL.revokeObjectURL(selectedProduct.value.image);
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<style scoped src="./style.css"></style>
