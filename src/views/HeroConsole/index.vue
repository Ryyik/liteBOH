<template>
  <div class="hero-console">
    <header class="console-toolbar">
      <div class="toolbar-heading">
        <button type="button" class="icon-button" title="返回数据管理" @click="goBackToAdmin">
          <ChevronLeft :size="20" aria-hidden="true" />
        </button>
        <div>
          <h1>首页英雄区装修</h1>
          <p>{{ heroes.length }} 个英雄区<span v-if="dirtyCount"> · {{ dirtyCount }} 项未保存</span></p>
        </div>
      </div>

      <div class="toolbar-actions">
        <button type="button" class="icon-button" title="刷新" :disabled="isLoading" @click="loadHeroes()">
          <RefreshCw :size="18" :class="{ spinning: isLoading }" aria-hidden="true" />
        </button>
        <button type="button" class="secondary-button" @click="startNewHero">
          <Plus :size="17" aria-hidden="true" /> 新建英雄区
        </button>
        <button type="button" class="secondary-button" :disabled="isSaving || !selectedHero" @click="saveCurrent">
          <Save :size="17" aria-hidden="true" /> 保存草稿
        </button>
        <button type="button" class="primary-button" :disabled="isSaving || !selectedHero" @click="publishCurrent">
          <Upload :size="17" aria-hidden="true" /> {{ isSaving ? '处理中' : '发布' }}
        </button>
      </div>
    </header>

    <main class="console-layout">
      <!-- 左侧：英雄区列表 -->
      <aside class="hero-sidebar glass-panel">
        <div class="sidebar-filters">
          <label class="search-field">
            <Search :size="17" aria-hidden="true" />
            <input v-model.trim="searchQuery" type="search" placeholder="搜索英雄区" aria-label="搜索英雄区" />
          </label>
          <div class="filter-row">
            <select v-model="statusFilter" aria-label="按状态筛选">
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
            <select v-model="archiveFilter" aria-label="按归档筛选">
              <option value="all">全部</option>
              <option value="active">首屏显示</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>

        <div class="hero-list">
          <button
            v-for="hero in filteredHeroes"
            :key="hero.id"
            type="button"
            class="hero-row"
            :class="{ selected: selectedId === hero.id }"
            @click="selectHero(hero)"
          >
            <span class="row-thumb" :class="`thumb-${hero.template}`">
              <img v-if="getThumbUrl(hero)" :src="getThumbUrl(hero)" :alt="hero.title" />
              <LayoutIcon v-else :size="18" aria-hidden="true" />
            </span>
            <span class="row-copy">
              <strong>{{ hero.label || hero.title || '未命名' }}</strong>
              <small>{{ templateLabel(hero.template) }} · {{ hero.variant }}</small>
            </span>
            <span class="row-status" :class="heroStatus(hero).tone">{{ heroStatus(hero).label }}</span>
            <span v-if="isDirty(hero.id)" class="dirty-dot" title="未保存"></span>
          </button>

          <div v-if="!filteredHeroes.length" class="empty-list">
            <LayoutIcon :size="26" aria-hidden="true" />
            <span>没有匹配的英雄区</span>
          </div>
        </div>
      </aside>

      <!-- 中间：预览区 -->
      <section v-if="selectedHero" class="preview-workspace glass-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">实时预览</span>
            <h2>{{ selectedHero.label || selectedHero.title || '新英雄区' }}</h2>
          </div>
          <div class="preview-toolbar">
            <button type="button" class="text-button" @click="moveHero(-1)" :disabled="!canMove(-1)">
              <ArrowUp :size="14" /> 上移
            </button>
            <button type="button" class="text-button" @click="moveHero(1)" :disabled="!canMove(1)">
              <ArrowDown :size="14" /> 下移
            </button>
          </div>
        </div>

        <div class="preview-frame" :class="`frame-${previewDevice}`">
          <div class="preview-frame-inner">
            <DynamicHomeHero :hero="draftHero" @link-click="() => {}" />
          </div>
        </div>

        <div class="preview-device-switch">
          <button type="button" :class="['device-btn', { active: previewDevice === 'desktop' }]" @click="previewDevice = 'desktop'">桌面</button>
          <button type="button" :class="['device-btn', { active: previewDevice === 'mobile' }]" @click="previewDevice = 'mobile'">竖屏</button>
        </div>
      </section>

      <!-- 右侧：编辑面板 -->
      <section v-if="selectedHero" class="editor-panel glass-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">英雄区配置</span>
            <h2>{{ selectedHero.title || '新英雄区' }}</h2>
          </div>
          <button type="button" class="danger-icon-button" title="删除英雄区" :disabled="isSaving" @click="deleteCurrent">
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </div>

        <div class="status-settings">
          <label class="toggle-row">
            <span><strong>归档到历史区</strong><small>归档后从首屏移入 Footer 历史回顾</small></span>
            <input v-model="draftHero.is_archived" type="checkbox" @change="markDirty(selectedHero.id)" />
            <i aria-hidden="true"></i>
          </label>
        </div>

        <div class="form-grid">
          <label class="field">
            <span>模板类型</span>
            <select v-model="draftHero.template" @change="markDirty(selectedHero.id)">
              <option value="standard">标准卡片型</option>
              <option value="overlay">全幅图片叠加型</option>
              <option value="split">分栏并排型</option>
              <option value="responsive">横竖屏适配型</option>
            </select>
          </label>
          <label class="field">
            <span>配色方案</span>
            <select v-model="draftHero.variant" @change="markDirty(selectedHero.id)">
              <option value="light">浅色（白底）</option>
              <option value="dark">深色（黑底）</option>
            </select>
          </label>

          <label class="field field-wide">
            <span>内部标签（管理面板显示用）</span>
            <input v-model="draftHero.label" type="text" placeholder="如：2026秋款吉祥物" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide">
            <span>无障碍标签（aria-label）</span>
            <input v-model="draftHero.aria_label" type="text" placeholder="如：全新吉祥物上线" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide" v-if="draftHero.template === 'overlay'">
            <span>眉题（Eyebrow）</span>
            <input v-model="draftHero.eyebrow" type="text" placeholder="如：遇见系列" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide">
            <span>主标题（支持 &lt;br&gt;）</span>
            <textarea v-model="draftHero.title" rows="2" placeholder="如：Halo,&lt;br&gt;新朋友来啦" @input="markDirty(selectedHero.id)"></textarea>
          </label>

          <label class="field field-wide">
            <span>副标题</span>
            <textarea v-model="draftHero.subtitle" rows="2" placeholder="如：2026秋款全新上线" @input="markDirty(selectedHero.id)"></textarea>
          </label>
        </div>

        <!-- 图片配置区：根据模板显示不同字段 -->
        <div class="image-section" v-if="draftHero.template !== 'split'">
          <div class="spec-heading">
            <span>图片配置</span>
            <div class="spec-heading-actions">
              <button type="button" class="text-button" @click="openDirectUpload('main')" :disabled="isUploading">
                <Upload :size="14" /> 上传图片
              </button>
              <button type="button" class="text-button" @click="openCropper('main')">
                <Crop :size="14" /> 裁切图片
              </button>
            </div>
          </div>

          <!-- standard / overlay：单图 -->
          <template v-if="draftHero.template === 'standard' || draftHero.template === 'overlay'">
            <label class="url-field">
              <span>图片链接</span>
              <input v-model="draftHero.image_config.src" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field" v-if="draftHero.template === 'overlay'">
              <span>图片定位（object-position）</span>
              <input v-model="draftHero.image_config.position" type="text" placeholder="如：center 54%" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>图片 Alt 文本</span>
              <input v-model="draftHero.image_config.alt" type="text" placeholder="如：吉祥物玩偶" @input="markDirty(selectedHero.id)" />
            </label>
          </template>

          <!-- responsive：横竖屏双图 -->
          <template v-if="draftHero.template === 'responsive'">
            <label class="url-field">
              <span>横屏图片链接（landscape）</span>
              <input v-model="draftHero.image_config.landscapeSrc" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="url-field">
              <span>竖屏图片链接（portrait）</span>
              <input v-model="draftHero.image_config.portraitSrc" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>图片 Alt 文本</span>
              <input v-model="draftHero.image_config.alt" type="text" placeholder="如：吉祥物玩偶" @input="markDirty(selectedHero.id)" />
            </label>
          </template>
        </div>

        <!-- split 模板：两张子卡片 -->
        <div class="image-section" v-if="draftHero.template === 'split'">
          <div class="spec-heading">
            <span>分栏子卡片（左右两张）</span>
          </div>
          <div class="split-card-editor" v-for="(card, idx) in splitCardsDraft" :key="`split-${idx}`">
            <h4 class="split-card-title">卡片 {{ idx + 1 }}</h4>
            <label class="field">
              <span>标题</span>
              <input v-model="card.title" type="text" placeholder="如：BOH X 小猫主题" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>副标题</span>
              <input v-model="card.subtitle" type="text" placeholder="如：快来体验萌萌小猫" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>配色</span>
              <select v-model="card.variant" @change="markDirty(selectedHero.id)">
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label class="url-field">
              <span>图片链接</span>
              <input v-model="card.image_config.src" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
              <button type="button" class="text-button" @click="openDirectUpload('split', idx)" :disabled="isUploading">
                <Upload :size="14" /> 上传卡片 {{ idx + 1 }}
              </button>
              <button type="button" class="text-button" @click="openCropper('split', idx)">
                <Crop :size="14" /> 裁切卡片 {{ idx + 1 }} 图片
              </button>
            </div>
          </div>
        </div>

        <!-- 按钮配置 -->
        <div class="spec-section">
          <div class="spec-heading">
            <span>按钮配置</span>
            <button type="button" class="text-button" @click="addLink">
              <Plus :size="14" /> 添加按钮
            </button>
          </div>
          <div class="link-list">
            <div class="link-row" v-for="(link, idx) in draftLinks" :key="`link-${idx}`">
              <input v-model="link.text" type="text" placeholder="按钮文字" @input="markDirty(selectedHero.id)" />
              <select v-model="link.type" @change="markDirty(selectedHero.id)">
                <option value="primary">主按钮</option>
                <option value="secondary">次按钮</option>
              </select>
              <input v-model="link.to" type="text" placeholder="内部路由 /shop" @input="markDirty(selectedHero.id)" />
              <input v-model="link.href" type="text" placeholder="外部链接 https://" @input="markDirty(selectedHero.id)" />
              <select v-model="link.onClick" @change="markDirty(selectedHero.id)">
                <option value="">无弹窗</option>
                <option value="modal:fuzhou">福州弹窗</option>
                <option value="modal:cloud-plus">Cloud+弹窗</option>
                <option value="modal:anniversary-letter">周年信件弹窗</option>
              </select>
              <button type="button" class="spec-remove" @click="removeLink(idx)">
                <X :size="14" />
              </button>
            </div>
            <p v-if="!draftLinks.length" class="spec-empty">还没有按钮，点击「添加按钮」开始配置</p>
          </div>
        </div>

        <div class="editor-footer">
          <span v-if="selectedHero.status === 'published'">已于 {{ formatDate(selectedHero.published_at) }} 发布</span>
          <span v-else>当前为草稿状态，发布后在首页显示</span>
          <div class="footer-actions">
            <button type="button" class="text-button" @click="showRevisions = !showRevisions">
              <History :size="14" /> 历史版本
            </button>
          </div>
        </div>

        <!-- 历史版本面板 -->
        <div v-if="showRevisions" class="revisions-panel">
          <h4>发布历史</h4>
          <div v-if="revisionsLoading" class="revisions-loading">加载中...</div>
          <div v-else-if="!revisions.length" class="revisions-empty">暂无发布历史</div>
          <div v-else class="revisions-list">
            <div v-for="rev in revisions" :key="rev.id" class="revision-item">
              <span class="revision-time">{{ formatDate(rev.published_at) }}</span>
              <button type="button" class="text-button" @click="rollbackTo(rev.id)">回滚</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 未选中时的空状态 -->
      <section v-else class="editor-panel glass-panel selection-empty">
        <LayoutIcon :size="36" aria-hidden="true" />
        <h2>选择一个英雄区开始编辑</h2>
        <button type="button" class="primary-button" @click="startNewHero">
          <Plus :size="17" aria-hidden="true" /> 新建英雄区
        </button>
      </section>
    </main>

    <!-- 图片裁切弹窗 -->
    <AvatarCropModal
      v-model:visible="cropVisible"
      :image-src="cropSource"
      :loading="isUploading"
      title="裁切英雄区图片"
      hint="拖动和缩放图片，保留主体"
      sub-hint="裁切结果会按选定比例显示"
      :aspect-ratio="cropAspectRatio"
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft, Crop, Layout as LayoutIcon, Plus,
  RefreshCw, Save, Search, Trash2, Upload, X, ArrowUp, ArrowDown, History
} from 'lucide-vue-next';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import DynamicHomeHero from '@/views/Home/components/DynamicHomeHero.vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { useAuthStore } from '@/stores/auth';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import { uploadImageToCloudinary, isCloudinaryNoteUploadConfigured } from '@/utils/cloudinary-client.js';
import { logger } from '@/utils/logger.js';

const router = useRouter();
const authStore = useAuthStore();
const dialog = useConfirmDialog();
const homeHeroesStore = useHomeHeroesStore();

const heroes = computed(() => homeHeroesStore.allHeroes);
const isLoading = computed(() => homeHeroesStore.isFetching);
const isSaving = computed(() => homeHeroesStore.isSaving);

const drafts = reactive({}); // id -> draft hero
const dirtyIds = reactive(new Set());
const selectedId = ref(null);
const searchQuery = ref('');
const statusFilter = ref('all');
const archiveFilter = ref('all');
const previewDevice = ref('desktop');
const showRevisions = ref(false);
const revisions = ref([]);
const revisionsLoading = ref(false);

// 图片裁切
const cropVisible = ref(false);
const cropSource = ref('');
const cropTarget = ref({ type: 'main', splitIndex: -1 }); // main / split
const isUploading = ref(false);
let tempCounter = 0;

const toast = ref({ show: false, message: '' });
let toastTimer = null;

// 模板标签
const templateLabel = (t) => ({
  standard: '标准卡片',
  overlay: '全幅叠加',
  split: '分栏并排',
  responsive: '横竖屏'
})[t] || t;

// 状态
const dirtyCount = computed(() => dirtyIds.size);
const selectedHero = computed(() => selectedId.value === null ? null : heroes.value.find(h => h.id === selectedId.value) || drafts[selectedId.value] || null);
const draftHero = computed(() => selectedId.value === null ? null : drafts[selectedId.value] || null);
const draftLinks = computed(() => draftHero.value?.links || []);
const splitCardsDraft = computed(() => draftHero.value?.split_cards || []);

const filteredHeroes = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return heroes.value.filter((h) => {
    const matchesQuery = !q || `${h.label || ''} ${h.title}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter.value === 'all' || h.status === statusFilter.value;
    const matchesArchive = archiveFilter.value === 'all'
      || (archiveFilter.value === 'archived' && h.is_archived)
      || (archiveFilter.value === 'active' && !h.is_archived);
    return matchesQuery && matchesStatus && matchesArchive;
  });
});

const heroStatus = (hero) => {
  if (hero.is_archived) return { label: '已归档', tone: 'muted' };
  if (hero.status === 'published') return { label: '已发布', tone: 'success' };
  return { label: '草稿', tone: 'warning' };
};

const getThumbUrl = (hero) => {
  if (hero.template === 'responsive') return hero.image_config.landscapeSrc || hero.image_config.portraitSrc || '';
  if (hero.template === 'split') return hero.split_cards?.[0]?.image_config?.src || '';
  return hero.image_config.src || '';
};

const isDirty = (id) => dirtyIds.has(id);
const markDirty = (id) => dirtyIds.add(id);

const cropAspectRatio = computed(() => {
  if (!draftHero.value) return 4 / 3;
  // overlay 通常 16:9，standard 和 split 4:3，responsive 自适应
  if (draftHero.value.template === 'overlay') return 16 / 9;
  if (draftHero.value.template === 'responsive') return 1;
  return 4 / 3;
});

function showToast(message) {
  toast.value = { show: true, message };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value.show = false; }, 3000);
}

const cloneHero = (hero) => ({
  ...hero,
  image_config: { ...hero.image_config },
  links: (hero.links || []).map(l => ({ ...l })),
  split_cards: (hero.split_cards || []).map(c => ({
    ...c,
    image_config: { ...c.image_config },
    links: (c.links || []).map(l => ({ ...l }))
  }))
});

function selectHero(hero) {
  if (!drafts[hero.id]) drafts[hero.id] = cloneHero(hero);
  selectedId.value = hero.id;
  showRevisions.value = false;
}

function startNewHero() {
  tempCounter -= 1;
  const tempId = `temp-${tempCounter}`;
  const newHero = {
    id: tempId,
    sort_order: heroes.value.length,
    is_archived: false,
    template: 'standard',
    variant: 'light',
    eyebrow: null,
    title: '新英雄区',
    subtitle: null,
    image_config: { src: '', alt: '' },
    links: [],
    split_cards: [
      { title: '卡片一', subtitle: '', variant: 'light', image_config: { src: '', alt: '' }, links: [] },
      { title: '卡片二', subtitle: '', variant: 'light', image_config: { src: '', alt: '' }, links: [] }
    ],
    label: '',
    aria_label: '',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  drafts[tempId] = newHero;
  selectedId.value = tempId;
  // 临时英雄区不入 store，保存时才入库
}

function addLink() {
  if (!draftHero.value) return;
  draftHero.value.links.push({ text: '新按钮', type: 'primary', to: '', href: '', onClick: '' });
  markDirty(selectedId.value);
}

function removeLink(idx) {
  if (!draftHero.value) return;
  draftHero.value.links.splice(idx, 1);
  markDirty(selectedId.value);
}

function canMove(direction) {
  if (!selectedHero.value) return false;
  const list = filteredHeroes.value;
  const idx = list.findIndex(h => h.id === selectedId.value);
  if (idx < 0) return false;
  return direction < 0 ? idx > 0 : idx < list.length - 1;
}

async function moveHero(direction) {
  if (!canMove(direction)) return;
  const list = filteredHeroes.value;
  const idx = list.findIndex(h => h.id === selectedId.value);
  const targetIdx = idx + direction;
  const current = list[idx];
  const target = list[targetIdx];
  // 交换 sort_order
  const currentOrder = current.sort_order;
  const targetOrder = target.sort_order;
  await homeHeroesStore.saveHero(current.id, { sort_order: targetOrder });
  await homeHeroesStore.saveHero(target.id, { sort_order: currentOrder });
  await loadHeroes();
  showToast('已调整顺序');
}

async function saveCurrent() {
  if (!draftHero.value || !selectedHero.value) return;
  const draft = draftHero.value;
  // 验证
  if (!String(draft.title || '').trim()) {
    showToast('主标题不能为空');
    return;
  }
  const payload = {
    sort_order: draft.sort_order,
    is_archived: draft.is_archived,
    template: draft.template,
    variant: draft.variant,
    eyebrow: draft.eyebrow || null,
    title: draft.title,
    subtitle: draft.subtitle || null,
    image_config: draft.image_config,
    links: draft.links,
    split_cards: draft.template === 'split' ? draft.split_cards : null,
    label: draft.label || null,
    aria_label: draft.aria_label || null
  };
  const isTemp = String(selectedId.value).startsWith('temp-');
  let ok = false;
  if (isTemp) {
    // 新建
    const created = await homeHeroesStore.createHero(payload);
    if (created) {
      delete drafts[selectedId.value];
      selectedId.value = created.id;
      ok = true;
    }
  } else {
    ok = await homeHeroesStore.saveHero(selectedId.value, payload);
    if (ok) dirtyIds.delete(selectedId.value);
  }
  showToast(ok ? '草稿已保存' : '保存失败');
}

async function publishCurrent() {
  if (!draftHero.value || !selectedHero.value) return;
  // 先保存草稿
  const isTemp = String(selectedId.value).startsWith('temp-');
  if (isTemp || isDirty(selectedId.value)) {
    await saveCurrent();
  }
  if (String(selectedId.value).startsWith('temp-')) return; // 保存失败
  const ok = await homeHeroesStore.publishHero(selectedId.value, authStore.userInfo?.id);
  showToast(ok ? '已发布，首页即将生效' : '发布失败');
}

async function deleteCurrent() {
  if (!selectedHero.value) return;
  const confirmed = await dialog.confirm({
    title: '删除英雄区',
    message: `确定删除「${selectedHero.value.label || selectedHero.value.title}」吗？此操作不可恢复。`,
    confirmText: '删除',
    tone: 'danger'
  });
  if (!confirmed) return;
  const isTemp = String(selectedId.value).startsWith('temp-');
  if (isTemp) {
    delete drafts[selectedId.value];
    selectedId.value = null;
    showToast('已删除');
    return;
  }
  const ok = await homeHeroesStore.deleteHero(selectedId.value);
  if (ok) {
    delete drafts[selectedId.value];
    selectedId.value = null;
    showToast('已删除');
  } else {
    showToast('删除失败');
  }
}

// 图片裁切
function releaseCropSource() {
  if (cropSource.value.startsWith('blob:')) URL.revokeObjectURL(cropSource.value);
  cropSource.value = '';
}

function openCropper(type, splitIndex = -1) {
  // 触发文件选择
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!String(file.type).startsWith('image/')) {
      showToast('请选择图片文件');
      return;
    }
    releaseCropSource();
    cropSource.value = URL.createObjectURL(file);
    cropTarget.value = { type, splitIndex };
    cropVisible.value = true;
  };
  input.click();
}

async function openDirectUpload(type, splitIndex = -1) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!String(file.type).startsWith('image/')) {
      showToast('请选择图片文件');
      return;
    }
    if (!isCloudinaryNoteUploadConfigured()) {
      showToast('请先配置 Cloudinary 上传');
      return;
    }
    isUploading.value = true;
    try {
      const uploaded = await uploadImageToCloudinary(file, {
        folder: 'boh-cloud-plus/admin-hero-console',
        pendingSource: 'hero-console'
      });
      if (!uploaded.url) throw new Error('上传成功但未返回图片地址');
      if (type === 'split') {
        if (draftHero.value.split_cards[splitIndex]) {
          draftHero.value.split_cards[splitIndex].image_config.src = uploaded.url;
        }
      } else {
        draftHero.value.image_config.src = uploaded.url;
      }
      markDirty(selectedId.value);
      showToast('图片已上传');
    } catch (error) {
      logger.error('hero-console', '英雄区图片上传失败', error);
      showToast(`图片上传失败：${error?.message || '未知错误'}`);
    } finally {
      isUploading.value = false;
    }
  };
  input.click();
}

async function handleCropConfirm(blob) {
  if (!draftHero.value || isUploading.value) return;
  let localPreview = '';
  try {
    if (!isCloudinaryNoteUploadConfigured()) throw new Error('请先配置 Cloudinary 上传');
    isUploading.value = true;
    localPreview = URL.createObjectURL(blob);
    const file = new File([blob], `hero-${Date.now()}.webp`, { type: 'image/webp' });
    const uploaded = await uploadImageToCloudinary(file, {
      folder: 'boh-cloud-plus/admin-hero-console',
      pendingSource: 'hero-console'
    });
    if (!uploaded.url) throw new Error('上传成功但未返回图片地址');
    const url = uploaded.url;
    if (cropTarget.value.type === 'split') {
      if (draftHero.value.split_cards[cropTarget.value.splitIndex]) {
        draftHero.value.split_cards[cropTarget.value.splitIndex].image_config.src = url;
      }
    } else {
      draftHero.value.image_config.src = url;
    }
    markDirty(selectedId.value);
    URL.revokeObjectURL(localPreview);
    localPreview = '';
    cropVisible.value = false;
    releaseCropSource();
    showToast('图片已上传，保存后生效');
  } catch (error) {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      localPreview = '';
    }
    logger.error('hero-console', '英雄区图片上传失败', error);
    showToast(`图片上传失败：${error?.message || '未知错误'}`);
  } finally {
    isUploading.value = false;
  }
}

// 历史版本
watch([selectedId, showRevisions], async ([id, show]) => {
  if (!show || !id || String(id).startsWith('temp-')) {
    revisions.value = [];
    return;
  }
  revisionsLoading.value = true;
  revisions.value = await homeHeroesStore.fetchRevisions(id);
  revisionsLoading.value = false;
});

async function rollbackTo(revisionId) {
  if (!selectedId.value) return;
  const confirmed = await dialog.confirm({
    title: '回滚到历史版本',
    message: '回滚后会覆盖当前草稿配置，但不影响已发布版本。需要重新发布才能生效。',
    confirmText: '回滚'
  });
  if (!confirmed) return;
  const ok = await homeHeroesStore.rollbackHero(selectedId.value, revisionId);
  if (ok) {
    delete drafts[selectedId.value];
    showToast('已回滚，请检查后发布');
  } else {
    showToast('回滚失败');
  }
}

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
};

const goBackToAdmin = () => {
  router.push('/admin/data-management');
};

async function loadHeroes() {
  await homeHeroesStore.fetchAllForAdmin({ force: true });
}

onMounted(async () => {
  await loadHeroes();
});

onBeforeUnmount(() => {
  releaseCropSource();
});
</script>

<style scoped src="../ShopConsole/style.css"></style>
<style scoped>
/* HeroConsole 特有样式：补充 ShopConsole 未覆盖的部分 */
.hero-console {
  /* 复用 shop-console 的所有变量和基础样式 */
  --blue: #007aff;
  --text: #1d1d1f;
  --secondary: #6e6e73;
  --line: rgba(60, 60, 67, 0.12);
  --fill: rgba(118, 118, 128, 0.1);
  min-height: 100vh;
  padding: 84px 18px 24px;
  color: var(--text);
  background: #f2f2f7;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
}

.hero-console button, .hero-console input, .hero-console select, .hero-console textarea {
  font: inherit;
}
.hero-console button { letter-spacing: 0; }

/* 英雄区列表行（与 product-row 一致，但缩略图比例不同） */
.hero-row {
  position: relative;
  width: 100%;
  min-height: 62px;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 11px;
  color: var(--text);
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.hero-row:hover { background: rgba(118, 118, 128, 0.07); }
.hero-row.selected { background: rgba(0, 122, 255, 0.11); }

.row-thumb {
  width: 48px;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  color: #a1a1a6;
  background: rgba(118, 118, 128, 0.09);
}
.row-thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-overlay { aspect-ratio: 16 / 9; }
.thumb-responsive { aspect-ratio: 1; }

/* 预览区 */
.preview-workspace {
  padding: 18px;
}
.preview-toolbar {
  display: flex;
  gap: 4px;
}
.preview-frame {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
  transition: max-width 0.3s ease;
}
.preview-frame.frame-desktop {
  max-width: 100%;
}
.preview-frame.frame-mobile {
  max-width: 390px;
  margin: 0 auto;
}
.preview-frame-inner {
  pointer-events: none; /* 预览不响应点击 */
}
.preview-device-switch {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  justify-content: center;
}
.device-btn {
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--secondary);
  font-size: 12px;
  cursor: pointer;
}
.device-btn.active {
  background: var(--fill);
  color: var(--text);
  font-weight: 600;
}

/* 编辑面板：图片配置区 */
.image-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

/* 按钮配置列表 */
.link-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.link-row {
  display: grid;
  grid-template-columns: 1fr 90px 1.2fr 1.2fr 120px 34px;
  gap: 7px;
}
.link-row input, .link-row select {
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.68);
  font-size: 12px;
}
.link-row input:focus, .link-row select:focus {
  border-color: rgba(0, 122, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  outline: 0;
}

/* 分栏子卡片编辑 */
.split-card-editor {
  padding: 14px;
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.split-card-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

/* 历史版本面板 */
.revisions-panel {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
}
.revisions-panel h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
}
.revisions-loading, .revisions-empty {
  color: var(--secondary);
  font-size: 12px;
}
.revisions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.revision-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.06);
}
.revision-time {
  font-size: 12px;
  color: var(--text);
}

/* 编辑器底部 */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.editor-footer > span {
  color: var(--secondary);
  font-size: 11px;
}

/* 响应式 */
@media (max-width: 1120px) {
  .hero-console .console-layout {
    grid-template-columns: minmax(230px, 0.72fr) minmax(0, 1.35fr);
  }
  .preview-workspace { grid-column: 2; }
  .editor-panel { grid-column: 2; }
  .hero-sidebar { grid-row: 1 / span 2; }
}

@media (max-width: 740px) {
  .hero-console { padding: 74px 10px 18px; }
  .link-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
