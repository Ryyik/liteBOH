<template>
  <div class="block-wall-page">
    <!-- 嵌入「活动&方块墙」组合页时隐藏横条：刷新/贴一张由父页面的灵动岛接管 -->
    <header v-if="!embedded" class="wall-header" :class="{ embedded }">
      <button v-if="!embedded" class="icon-button" type="button" aria-label="返回社区" title="返回社区" @click="goBack">
        <ArrowLeft :size="21" />
      </button>
      <div class="wall-title">
        <span>方块之家</span>
        <h1>方块墙</h1>
      </div>
      <div class="wall-actions">
        <button class="icon-button" type="button" aria-label="刷新方块墙" title="刷新" :disabled="isLoading" @click="loadItems(1)">
          <RefreshCw :size="19" :class="{ spinning: isLoading }" />
        </button>
        <button class="add-button" type="button" @click="openComposer">
          <Plus :size="19" />
          <span>贴一张</span>
        </button>
      </div>
    </header>

    <main class="wall-shell">
      <div class="wall-intro">
        <p>{{ items.length ? `${items.length} 份故事留在这里` : '第一张纸条，等你贴上来' }}</p>
        <span>拖动纸条，找到你喜欢的位置</span>
      </div>

      <div ref="wallRef" class="story-wall" :class="{ 'is-arranging': isArranging }" :style="wallSizeStyle">
        <div class="sunlight" aria-hidden="true"></div>
        <div class="wall-sign" aria-hidden="true">BLOCK OF HOME · STORIES</div>
        <div class="wall-decorations" aria-hidden="true">
          <HomeCatMascot class="wall-cat cat-tl" type="decor" size="lg" decorative />
          <HomeCatMascot class="wall-cat cat-tr" type="decorAlt" size="lg" decorative />
          <HomeCatMascot class="wall-cat cat-bl" type="theme" size="md" decorative />
          <HomeCatMascot class="wall-cat cat-br" type="cardExtra" size="lg" decorative />
          <HomeCatMascot class="wall-cat cat-lm" type="mobileGap" size="md" decorative />
          <HomeCatMascot class="wall-cat cat-rm" type="decor" size="md" decorative />
          <HomeCatMascot class="wall-cat cat-bll" type="decorAlt" size="sm" decorative />
          <HomeCatMascot class="wall-cat cat-brr" type="theme" size="sm" decorative />
        </div>

        <div v-if="isLoading && !items.length" class="wall-state">
          <span class="loading-pin"></span>
          <p>正在展开大家的故事...</p>
        </div>
        <div v-else-if="loadError && !items.length" class="wall-state error-state">
          <CloudOff :size="28" />
          <p>{{ loadError }}</p>
          <button type="button" @click="loadItems(1)">重新看看</button>
        </div>

        <article
          v-for="(item, index) in items"
          :key="item.id"
          class="wall-item"
          :class="[
            item.item_type === 'photo' ? 'polaroid' : `paper-note paper-${item.color}`,
            { 'is-mine': isMine(item), 'is-moving': movingId === item.id, 'is-landing': !landedIds.has(item.id) }
          ]"
          :style="[itemPositionStyle(item), { '--stagger': index }]"
          :tabindex="isArranging ? -1 : 0"
          @click="openItem(item)"
          @keydown.enter="openItem(item)"
          @pointerdown="movingId === item.id ? startDrag($event) : null"
          @animationend="onItemAnimationEnd(item.id)"
        >
          <template v-if="item.item_type === 'photo'">
            <div class="photo-tape" aria-hidden="true"></div>
            <img
              :src="item.image_thumb_url || item.image_url"
              :alt="item.content || `${item.author_username} 的照片`"
              :width="item.image_width || undefined"
              :height="item.image_height || undefined"
              :style="item.image_lqip_url ? { backgroundImage: `url(${item.image_lqip_url})`, backgroundSize: 'cover' } : null"
              loading="lazy"
              decoding="async"
              @load="onPhotoLoad"
            />
            <p>{{ item.content || '留住这一天' }}</p>
          </template>
          <template v-else>
            <div class="note-pin" aria-hidden="true"></div>
            <p>{{ item.content }}</p>
          </template>
          <footer><span>@{{ item.author_username }}</span><time>{{ formatDate(item.created_at) }}</time></footer>
        </article>

        <article
          v-if="placingNew"
          class="wall-item placement-preview"
          :class="draft.type === 'photo' ? 'polaroid' : `paper-note paper-${draft.color}`"
          :style="placementStyle"
          @pointerdown="startDrag"
        >
          <template v-if="draft.type === 'photo'">
            <div class="photo-tape" aria-hidden="true"></div>
            <img :src="draft.previewUrl" alt="待发布照片预览" loading="lazy" decoding="async" />
            <p>{{ draft.content || '留住这一天' }}</p>
          </template>
          <template v-else>
            <div class="note-pin" aria-hidden="true"></div>
            <p>{{ draft.content }}</p>
          </template>
          <footer><span>@{{ userInfo.username }}</span><time>现在</time></footer>
        </article>

        <div v-if="isArranging" class="placement-bar">
          <div><Move :size="18" /><span>{{ placingNew ? '拖动到喜欢的位置' : '重新摆放这张作品' }}</span></div>
          <button type="button" class="cancel-placement" :disabled="isSaving" @click="cancelPlacement">取消</button>
          <button type="button" class="confirm-placement" :disabled="isSaving" @click="confirmPlacement">
            <LoaderCircle v-if="isSaving" class="spinning" :size="18" />
            <Pin v-else :size="18" />
            {{ isSaving ? '正在贴上...' : '贴在这里' }}
          </button>
        </div>
      </div>

      <div v-if="hasMore || isLoading" class="load-more">
        <button type="button" :disabled="isLoading" @click="loadMore">
          <LoaderCircle v-if="isLoading" class="spinning" :size="16" />
          <span v-else>加载更多故事</span>
        </button>
        <small v-if="total">已展示 {{ items.length }} / {{ total }} 份</small>
      </div>
    </main>

    <Transition name="fade">
      <div v-if="composerOpen" class="modal-backdrop" @click.self="closeComposer">
        <section class="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
          <header>
            <div><span>NEW STORY</span><h2 id="composer-title">贴一张新故事</h2></div>
            <button class="icon-button" type="button" aria-label="关闭" @click="closeComposer"><X :size="20" /></button>
          </header>
          <div class="type-switch" role="tablist" aria-label="内容类型">
            <button type="button" :class="{ active: draft.type === 'note' }" @click="setDraftType('note')"><StickyNote :size="18" />文字纸条</button>
            <button type="button" :class="{ active: draft.type === 'photo' }" @click="setDraftType('photo')"><Image :size="18" />拍立得</button>
          </div>

          <label v-if="draft.type === 'note'" class="text-field">
            <span>想留在墙上的话</span>
            <textarea v-model="draft.content" maxlength="420" rows="7" placeholder="写下今天的小事、祝福，或者想珍藏的一句话..." autofocus></textarea>
            <small>{{ draft.content.length }} / 420</small>
          </label>

          <template v-else>
            <button class="photo-picker" type="button" @click="fileInput?.click()">
              <img v-if="draft.previewUrl" :src="draft.previewUrl" alt="照片预览" loading="lazy" decoding="async" />
              <span v-else><ImagePlus :size="30" /><strong>选择一张照片</strong><small>支持 JPG、PNG、WebP</small></span>
            </button>
            <input ref="fileInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="handleFile" />
            <label class="caption-field"><span>相纸上的一句话</span><input v-model="draft.content" maxlength="80" placeholder="这一刻，想写点什么？" /></label>
          </template>

          <fieldset v-if="draft.type === 'note'" class="color-picker">
            <legend>纸条颜色</legend>
            <button v-for="color in colors" :key="color.id" type="button" :class="[{ selected: draft.color === color.id }, `swatch-${color.id}`]" :aria-label="color.label" :title="color.label" @click="draft.color = color.id"><Check v-if="draft.color === color.id" :size="15" /></button>
          </fieldset>
          <p v-if="formError" class="form-error"><CircleAlert :size="16" />{{ formError }}</p>
          <button class="next-button" type="button" :disabled="!canStartPlacement" @click="beginPlacement">选择摆放位置 <ArrowRight :size="18" /></button>
        </section>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="selectedItem" class="modal-backdrop" @click.self="selectedItem = null">
        <section class="detail-sheet" role="dialog" aria-modal="true">
          <button class="detail-close icon-button" type="button" aria-label="关闭" @click="selectedItem = null"><X :size="20" /></button>
          <img
            v-if="selectedItem.item_type === 'photo'"
            :src="selectedItem.image_detail_url || selectedItem.image_url"
            :alt="selectedItem.content"
            :width="selectedItem.image_width || undefined"
            :height="selectedItem.image_height || undefined"
            loading="lazy"
            decoding="async"
            @load="onPhotoLoad"
          />
          <p class="detail-content">{{ selectedItem.content || '留住这一天' }}</p>
          <div class="detail-author">
            <span class="mini-avatar">
              <img v-if="selectedAuthor.avatarUrl && !avatarLoadFailed" :src="selectedAuthor.avatarUrl" :alt="`${selectedAuthor.username} 的头像`" @error="avatarLoadFailed = true" />
              <span v-else>{{ selectedAuthor.username?.charAt(0)?.toUpperCase() || '?' }}</span>
            </span>
            <div>
              <strong>{{ selectedAuthor.username }}</strong>
              <small>{{ formatFullDate(selectedItem.created_at) }}</small>
            </div>
          </div>
          <div v-if="isMine(selectedItem) || isAdmin" class="owner-actions">
            <button type="button" @click="startMovingSelected"><Move :size="17" />重新摆放</button>
            <button type="button" class="danger" @click="deleteSelected"><Trash2 :size="17" />取下</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="toast"><div v-if="toastMessage" class="wall-toast" role="status">{{ toastMessage }}</div></Transition>

  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ArrowLeft, ArrowRight, Check, CircleAlert, CloudOff, Image, ImagePlus, LoaderCircle, Move, Pin, Plus, RefreshCw, StickyNote, Trash2, X } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { createBlockWallItem, listBlockWallItems, moveBlockWallItem, removeBlockWallItem, uploadBlockWallImage } from '@/utils/api/block-wall-api.js';
import HomeCatMascot from '@/components/HomeCatMascot.vue';

// embedded：作为「活动&方块墙」组合页的子面板嵌入时使用——
// 隐藏返回按钮，吸顶位置由父页面通过 --aw-nav-offset 下发
defineProps({
  embedded: { type: Boolean, default: false }
});

const router = useRouter();
const authStore = useAuthStore();
const { isLoggedIn, userInfo, showLoginModal } = storeToRefs(authStore);
const wallRef = ref(null);
const fileInput = ref(null);
const items = ref([]);
const isLoading = ref(false);
const loadError = ref('');
const composerOpen = ref(false);
const placingNew = ref(false);
const movingId = ref('');
const selectedItem = ref(null);
const isSaving = ref(false);
const formError = ref('');
const toastMessage = ref('');
const avatarLoadFailed = ref(false);
const landedIds = ref(new Set());
const position = reactive({ x: 50, y: 48, rotation: -2 });
const wallSize = reactive({ width: 0, height: 0 });
const viewportSize = reactive({ width: 1280, height: 800 });
const page = ref(1);
const pageSize = ref(40);
const hasMore = ref(false);
const total = ref(0);
const draft = reactive({ type: 'note', content: '', color: 'butter', file: null, previewUrl: '' });
const colors = [
  { id: 'butter', label: '奶油黄' }, { id: 'blush', label: '樱花粉' }, { id: 'mint', label: '薄荷绿' },
  { id: 'sky', label: '天空蓝' }, { id: 'lilac', label: '淡紫色' }, { id: 'cream', label: '暖白色' }
];
let dragOffset = { x: 0, y: 0 };
let toastTimer = null;
let wallResizeObserver = null;
let resizeFrame = 0;

const isAdmin = computed(() => userInfo.value?.role === 'admin');
const isArranging = computed(() => placingNew.value || Boolean(movingId.value));
const canStartPlacement = computed(() => draft.type === 'note' ? Boolean(draft.content.trim()) : Boolean(draft.file));
const selectedAuthor = computed(() => ({
  username: selectedItem.value?.author?.username || selectedItem.value?.author_username || '未知用户',
  avatarUrl: selectedItem.value?.author?.avatar_url || selectedItem.value?.author_avatar_url || ''
}));
const placementStyle = computed(() => ({ left: `${position.x}%`, top: `${position.y}%`, '--r': `${position.rotation}deg`, zIndex: 300 }));

const isNarrowLayout = () => viewportSize.width <= 768;
const wallHeight = computed(() => {
  const count = Math.max(items.value.length + (placingNew.value ? 1 : 0), 1);
  if (isNarrowLayout()) {
    const columns = viewportSize.width >= 560 ? 3 : 2;
    const rows = Math.ceil(count / columns);
    const viewportFloor = Math.max(560, viewportSize.height - 105);
    return Math.max(viewportFloor, 180 + rows * 118);
  }

  const availableWidth = wallSize.width || Math.min(1320, Math.max(760, viewportSize.width - 28));
  const columns = Math.max(3, Math.floor((availableWidth - 80) / 174));
  const rows = Math.ceil(count / columns);
  const viewportFloor = Math.min(980, Math.max(720, viewportSize.height - 145));
  return Math.max(viewportFloor, 210 + rows * 158);
});
const wallSizeStyle = computed(() => ({ '--wall-height': `${wallHeight.value}px` }));

const showToast = (message) => {
  toastMessage.value = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastMessage.value = ''; }, 2600);
};
const onItemAnimationEnd = (id) => { landedIds.value.add(id); };
const onPhotoLoad = (event) => {
  const target = event?.target;
  if (target && !target.classList.contains('loaded')) target.classList.add('loaded');
};
const errorText = (error, fallback) => String(error?.message || error?.details || fallback);
const isMine = (item) => Boolean(isLoggedIn.value && item?.author_id === userInfo.value?.id);
const formatDate = (value) => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
const formatFullDate = (value) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
const goBack = () => router.push({ path: '/user-space', query: { tab: 'community' } });

const loadItems = async (nextPage = 1) => {
  isLoading.value = true; loadError.value = '';
  const result = await listBlockWallItems(nextPage, pageSize.value);
  if (result.ok) {
    if (nextPage === 1) items.value = result.data;
    else items.value.push(...result.data);
    page.value = nextPage;
    hasMore.value = result.hasMore;
    total.value = result.total;
  } else {
    loadError.value = errorText(result.error, '暂时打不开方块墙');
  }
  isLoading.value = false;
};
const loadMore = async () => {
  if (!hasMore.value || isLoading.value) return;
  await loadItems(page.value + 1);
};

const resetDraft = () => {
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  Object.assign(draft, { type: 'note', content: '', color: 'butter', file: null, previewUrl: '' });
  formError.value = '';
};
const openComposer = () => {
  if (!isLoggedIn.value) { showLoginModal.value = true; return; }
  resetDraft(); composerOpen.value = true;
};
const closeComposer = () => { composerOpen.value = false; resetDraft(); };
const setDraftType = (type) => {
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  draft.type = type; draft.content = ''; draft.file = null; draft.previewUrl = ''; formError.value = '';
};
const handleFile = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { formError.value = '请选择 JPG、PNG 或 WebP 图片'; return; }
  if (file.size > 10 * 1024 * 1024) { formError.value = '图片不能超过 10MB'; return; }
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  draft.file = file; draft.previewUrl = URL.createObjectURL(file); formError.value = '';
};
const beginPlacement = () => {
  if (!canStartPlacement.value) return;
  Object.assign(position, { x: 50, y: 48, rotation: Math.round((Math.random() * 6) - 3) });
  composerOpen.value = false; placingNew.value = true;
  requestAnimationFrame(() => resolveSafePosition(draft.type));
};
const cancelPlacement = () => {
  placingNew.value = false; movingId.value = ''; resetDraft();
};

const itemPositionStyle = (item) => {
  const moving = movingId.value === item.id;
  const rotation = moving ? position.rotation : item.rotation;
  const rawX = moving ? position.x : item.position_x;
  const rawY = moving ? position.y : item.position_y;
  const size = getItemSize(item.item_type, wallSize.width, wallSize.height, rotation);
  const projected = clampSafe(rawX, rawY, size.w, size.h, wallSize.width, wallSize.height);
  return { left: `${projected.x}%`, top: `${projected.y}%`, '--r': `${rotation}deg`, zIndex: moving ? 300 : undefined };
};

// 不同朝向下的纸条尺寸（与 CSS 保持一致）
const NOTE_W = 206;
const NOTE_H = 184;
const POLAROID_H = 232;
const NOTE_W_MOBILE = 148;
const NOTE_H_MOBILE = 142;
const POLAROID_H_MOBILE = 172;
// 边距使用像素换算，保证窄屏两侧和超长墙面上下的安全距离一致。
const SAFE_PAD_PX = 14;

const getItemSize = (itemType, wallW, wallH, rotation = 0) => {
  if (!wallW || !wallH) return { w: 0, h: 0 };
  const portrait = isNarrowLayout();
  const noteW = (portrait ? NOTE_W_MOBILE : NOTE_W) / wallW * 100;
  const noteH = (portrait ? NOTE_H_MOBILE : NOTE_H) / wallH * 100;
  const polaroidH = (portrait ? POLAROID_H_MOBILE : POLAROID_H) / wallH * 100;
  const baseH = itemType === 'photo' ? polaroidH : noteH;
  const radians = Math.abs(Number(rotation) || 0) * Math.PI / 180;
  return {
    w: Math.abs(noteW * Math.cos(radians)) + Math.abs(baseH * Math.sin(radians)) * wallH / wallW,
    h: Math.abs(baseH * Math.cos(radians)) + Math.abs(noteW * Math.sin(radians)) * wallW / wallH
  };
};

const getItemRect = (item, wallW, wallH) => {
  const { w, h } = getItemSize(item.item_type, wallW, wallH, item.rotation);
  const center = clampSafe(item.position_x, item.position_y, w, h, wallW, wallH);
  return {
    left: center.x - w / 2,
    top: center.y - h / 2,
    right: center.x + w / 2,
    bottom: center.y + h / 2,
    width: w,
    height: h
  };
};

const overlapRatio = (a, b) => {
  const iw = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const ih = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return inter / minArea;
};

const clampSafe = (px, py, w, h, wallW, wallH) => {
  if (!wallW || !wallH) return { x: px, y: py };
  const padX = SAFE_PAD_PX / wallW * 100;
  const padY = SAFE_PAD_PX / wallH * 100;
  const minX = padX + w / 2;
  const maxX = 100 - padX - w / 2;
  const minY = padY + h / 2;
  const maxY = 100 - padY - h / 2;
  return {
    x: Math.min(maxX, Math.max(minX, px)),
    y: Math.min(maxY, Math.max(minY, py))
  };
};

const updatePosition = (event) => {
  const rect = wallRef.value?.getBoundingClientRect();
  if (!rect) return;
  const itemType = movingId.value
    ? items.value.find((item) => item.id === movingId.value)?.item_type || 'note'
    : draft.type;
  const { w, h } = getItemSize(itemType, rect.width, rect.height, position.rotation);
  const c = clampSafe(
    ((event.clientX - rect.left - dragOffset.x) / rect.width) * 100,
    ((event.clientY - rect.top - dragOffset.y) / rect.height) * 100,
    w, h, rect.width, rect.height
  );
  position.x = c.x;
  position.y = c.y;
};
const startDrag = (event) => {
  if (!isArranging.value) return;
  event.preventDefault();
  const rect = wallRef.value?.getBoundingClientRect();
  if (!rect) return;
  dragOffset = { x: event.clientX - (rect.left + rect.width * position.x / 100), y: event.clientY - (rect.top + rect.height * position.y / 100) };
  window.addEventListener('pointermove', updatePosition);
  window.addEventListener('pointerup', stopDrag, { once: true });
};
const stopDrag = () => window.removeEventListener('pointermove', updatePosition);

const resolveSafePosition = (itemType, excludeId = '') => {
  const rect = wallRef.value?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return;
  const wallW = rect.width;
  const wallH = rect.height;
  const existing = items.value.filter((i) => i.id !== excludeId);
  const { w, h } = getItemSize(itemType, wallW, wallH, position.rotation);

  const fits = (px, py) => {
    const clamped = clampSafe(px, py, w, h, wallW, wallH);
    const candidate = {
      left: clamped.x - w / 2, top: clamped.y - h / 2,
      right: clamped.x + w / 2, bottom: clamped.y + h / 2,
      width: w, height: h
    };
    for (const item of existing) {
      if (overlapRatio(candidate, getItemRect(item, wallW, wallH)) > 0.35) return false;
    }
    return true;
  };

  const apply = (px, py) => {
    const c = clampSafe(px, py, w, h, wallW, wallH);
    Object.assign(position, { x: c.x, y: c.y });
  };

  // 先按当前朝向将位置夹到安全区内
  apply(position.x, position.y);

  if (fits(position.x, position.y)) return;

  // 螺旋向外搜索
  let angle = 0;
  let radius = 0;
  for (let i = 0; i < 90; i += 1) {
    radius += 1.4;
    angle += 2.399;
    const px = position.x + Math.cos(angle) * radius;
    const py = position.y + Math.sin(angle) * radius;
    if (fits(px, py)) { apply(px, py); return; }
  }

  // 随机寻找空位
  for (let i = 0; i < 40; i += 1) {
    const px = Math.random() * 100;
    const py = Math.random() * 100;
    if (fits(px, py)) { apply(px, py); return; }
  }

  // 全部失败，再次夹到安全区（保证不溢出）
  apply(position.x, position.y);
};

const confirmPlacement = async () => {
  if (isSaving.value) return;
  isSaving.value = true; formError.value = '';
  if (movingId.value) {
    const movingItem = items.value.find((item) => item.id === movingId.value);
    resolveSafePosition(movingItem?.item_type || 'note', movingId.value);
    const result = await moveBlockWallItem(movingId.value, position.x, position.y, position.rotation);
    if (result.ok) {
      const index = items.value.findIndex((item) => item.id === movingId.value);
      if (index >= 0) items.value[index] = result.data;
      movingId.value = ''; showToast('已经摆到新位置啦');
    } else showToast(errorText(result.error, '位置保存失败'));
    isSaving.value = false; return;
  }
  resolveSafePosition(draft.type);
  try {
    const image = draft.type === 'photo' ? await uploadBlockWallImage(draft.file) : null;
    const result = await createBlockWallItem({
      itemType: draft.type, content: draft.content, color: draft.color, image,
      authorId: userInfo.value.id, authorUsername: userInfo.value.username,
      authorAvatarUrl: userInfo.value.avatarUrl || userInfo.value.avatar_url,
      positionX: position.x, positionY: position.y, rotation: position.rotation
    });
    if (!result.ok) throw result.error;
    items.value.push(result.data); placingNew.value = false; resetDraft(); showToast('你的故事已经贴上墙啦');
  } catch (error) {
    showToast(errorText(error, '没有贴成功，请稍后重试'));
  } finally { isSaving.value = false; }
};

// 供组合页的灵动岛调用：刷新 / 贴一张 / 状态展示
defineExpose({
  openComposer,
  loadItems,
  isLoading,
  items,
  total
});

const openItem = (item) => {
  if (isArranging.value) return;
  avatarLoadFailed.value = false;
  selectedItem.value = item;
};
const startMovingSelected = () => {
  const item = selectedItem.value;
  if (!item) return;
  Object.assign(position, { x: item.position_x, y: item.position_y, rotation: item.rotation });
  movingId.value = item.id; selectedItem.value = null;
};
const deleteSelected = async () => {
  const item = selectedItem.value;
  if (!item || !window.confirm('确定把这张作品从墙上取下来吗？')) return;
  const result = await removeBlockWallItem(item);
  if (result.ok) { items.value = items.value.filter((entry) => entry.id !== item.id); selectedItem.value = null; showToast('已经从墙上取下'); }
  else showToast(errorText(result.error, '暂时取不下来'));
};

const syncWallSize = () => {
  const rect = wallRef.value?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return;
  wallSize.width = rect.width;
  wallSize.height = rect.height;
};

const clampActivePosition = () => {
  const rect = wallRef.value?.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height || !isArranging.value) return;
  const itemType = movingId.value
    ? items.value.find((item) => item.id === movingId.value)?.item_type || 'note'
    : draft.type;
  const { w, h } = getItemSize(itemType, rect.width, rect.height, position.rotation);
  const c = clampSafe(position.x, position.y, w, h, rect.width, rect.height);
  Object.assign(position, { x: c.x, y: c.y });
};

const onViewportResize = () => {
  viewportSize.width = window.innerWidth;
  viewportSize.height = window.innerHeight;
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    syncWallSize();
    clampActivePosition();
  });
};

const observeWall = async () => {
  await nextTick();
  syncWallSize();
  if (typeof ResizeObserver !== 'undefined' && wallRef.value) {
    wallResizeObserver = new ResizeObserver(() => {
      syncWallSize();
      clampActivePosition();
    });
    wallResizeObserver.observe(wallRef.value);
  }
};

onMounted(() => {
  viewportSize.width = window.innerWidth;
  viewportSize.height = window.innerHeight;
  loadItems();
  observeWall();
  window.addEventListener('resize', onViewportResize, { passive: true });
});
onBeforeUnmount(() => {
  stopDrag();
  wallResizeObserver?.disconnect();
  window.cancelAnimationFrame(resizeFrame);
  window.removeEventListener('resize', onViewportResize);
  if (toastTimer) window.clearTimeout(toastTimer);
  if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
});</script>

<style scoped src="./style.scoped.css"></style>
