<template>
  <div class="afc">
    <header class="afc-head">
      <div>
        <h1>头像框控制台</h1>
        <p>上传 PNG → 在固定头像上摆位 → 系统自动算 scale 并烘焙成品 → 配归属与价格 → 发布。渲染层零改动。</p>
      </div>
      <div class="afc-actions">
        <label class="btn">
          上传 PNG 新建
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onPickFile">
        </label>
        <button type="button" class="btn" :disabled="!draft.id || busy" @click="save('draft')">存草稿</button>
        <button type="button" class="btn primary" :disabled="!canPublish" @click="save('published')">发布</button>
      </div>
    </header>

    <p v-if="notice" class="afc-notice" :class="notice.cls">{{ notice.text }}</p>

    <div class="afc-body">
      <!-- ═════ 左：框库 ═════ -->
      <aside class="afc-lib">
        <div class="afc-lib-head">
          <span>框库</span>
          <span class="muted">{{ frames.length }} 个</span>
        </div>
        <div class="afc-lib-list">
          <button
            v-for="f in frames" :key="f.id" type="button" class="afc-lib-item"
            :class="{ on: f.id === draft.id }" @click="selectFrame(f)">
            <span class="thumb" :style="f.url ? { backgroundImage: `url(${f.url})` } : { background: f.ring || '#ddd' }" />
            <span class="meta">
              <b>{{ f.name || f.id }}<span v-if="f.status !== 'published'" class="tag">{{ f.status === 'draft' ? '草稿' : '已下架' }}</span></b>
              <span class="sub">{{ tierText(f) }}<template v-if="f.pointsPrice"> · {{ f.pointsPrice }} 积分</template></span>
            </span>
          </button>
          <p v-if="!frames.length" class="empty">还没有框。点右上角「上传 PNG 新建」开始。</p>
        </div>
      </aside>

      <!-- ═════ 中：编辑器 ═════ -->
      <main class="afc-main">
        <div v-if="!source" class="afc-placeholder">
          <p>上传一张 PNG（带或不带透明层都可以），或用左侧框库里已有的框改摆位。</p>
          <p class="muted">头像圆永远居中不动 —— 拖动缩放的是素材，让素材的内孔刚好套住它。</p>
        </div>

        <template v-else>
          <div class="afc-stage-row">
            <div
              class="afc-stage"
              :class="{ grabbing: dragging }"
              :style="{ width: STAGE + 'px', height: STAGE + 'px' }"
              @pointerdown="onPointerDown" @pointermove="onPointerMove"
              @pointerup="endDrag" @pointercancel="endDrag" @wheel.prevent="onWheel">
              <img class="afc-layer" :src="source.url" alt="" draggable="false" :style="layerStyle">
              <div class="afc-avatar" :style="avatarStyle"><span>头像</span></div>
              <div class="afc-cross" aria-hidden="true" />
              <div class="afc-badge">缩放 {{ view.zoom.toFixed(2) }}×</div>
            </div>

            <div class="afc-readout">
              <div v-for="row in readoutRows" :key="row.label" class="kv" :class="row.cls">
                <span>{{ row.label }}</span><b>{{ row.value }}</b>
              </div>
              <div class="afc-tools">
                <button type="button" class="btn sm" @click="center">居中</button>
                <button type="button" class="btn sm" @click="autoFit">按最紧档适配</button>
                <button type="button" class="btn sm" :disabled="!alphaFixable" @click="stripBackground">
                  {{ alphaStripped ? '已抠底' : '自动抠白底' }}
                </button>
              </div>
              <label class="slider">
                <span>缩放</span>
                <input type="range" min="60" max="260" step="1" :value="Math.round(view.zoom * 100)" @input="onZoomInput">
              </label>
            </div>
          </div>

          <div class="afc-sizes">
            <div v-for="s in sizeStates.all" :key="s.px" class="sizebox" :class="s.cls">
              <div class="box" :style="{ width: BOX + 'px', height: BOX + 'px' }">
                <div class="ring" :style="miniRingStyle(s)" />
                <div class="av" :style="miniAvatarStyle(s)" />
              </div>
              <div class="cap">{{ s.px }}px {{ s.scene }}<br>框层 {{ Math.round(s.frameLayerPx) }}</div>
            </div>
            <div class="afc-sizes-note muted">
              最紧档 = {{ sizeStates.worst.px }}px（容器 {{ sizeStates.worst.container }}px）
              <template v-if="sizeStates.worst.over > 0">，溢出 {{ Math.round(sizeStates.worst.over) }}px</template>
            </div>
          </div>

          <div v-if="review.blockers.length || review.warnings.length" class="afc-alerts">
            <p v-for="(b, i) in review.blockers" :key="'b' + i" class="alert bad">{{ b }}</p>
            <p v-for="(w, i) in review.warnings" :key="'w' + i" class="alert warn">{{ w }}</p>
          </div>
          <p v-else class="alert ok">各项检查通过，可以发布。</p>
        </template>
      </main>

      <!-- ═════ 右：属性 ═════ -->
      <aside class="afc-meta">
        <h2>基本信息</h2>
        <label class="field">
          <span>标识 slug</span>
          <input v-model.trim="draft.id" :disabled="idLocked" placeholder="elf-flower">
        </label>
        <p v-if="idLocked" class="hint">已发布的框 slug 与素材 URL 锁定 —— 改了两处存量佩戴会立即失效。</p>
        <label class="field">
          <span>名称</span>
          <input v-model.trim="draft.name" maxlength="12" placeholder="菊花梨">
        </label>
        <label class="field">
          <span>描述</span>
          <input v-model.trim="draft.desc" maxlength="24" placeholder="暖橙花瓣环绕 · 果子坐镇花芯">
        </label>
        <label class="field">
          <span>排序</span>
          <input v-model.number="draft.sortOrder" type="number" min="0" max="9999">
        </label>

        <h2>归属</h2>
        <label class="field">
          <span>订阅档位</span>
          <select v-model="draft.tier">
            <option value="free">全员可戴</option>
            <option value="plus">Plus 起</option>
            <option value="pro">Pro 起</option>
            <option value="max">Max 起</option>
            <option value="ultra">Ultra 专属</option>
          </select>
        </label>
        <label class="field">
          <span>限时免费至</span>
          <input v-model="draft.freeUntil" type="date">
        </label>
        <p class="hint">含当日全天免费，次日 00:00 自动回落到上面的档位。</p>
        <label class="field">
          <span>积分解锁价</span>
          <input v-model.number="draft.pointsPrice" type="number" min="0" max="99999" placeholder="留空 = 不售卖">
        </label>
        <p class="hint">
          与档位可叠加：档位内直接可用；档位不够的人也能花积分永久买断（限免到期也不回收）。
          留空或 0 = 不售卖。
        </p>

        <h2>状态</h2>
        <label class="field">
          <span>上架状态</span>
          <select v-model="draft.status">
            <option value="draft">草稿（用户端不可见）</option>
            <option value="published">已发布</option>
            <option value="archived">已下架</option>
          </select>
        </label>
        <p v-if="draft.status === 'archived'" class="hint">
          下架不会删除素材：存量佩戴者的记录还指着这个 URL，删了会反查不到 scale。
        </p>
      </aside>
    </div>
  </div>
</template>

<script setup>
/**
 * 头像框控制台（数据管理面板）
 *
 * 设计取舍（详见 plans/010-avatar-frame-console.md）：
 *  - 摆位结果**烘焙进像素**而不是运行时记 offset：成品图的孔心落在画布中心，
 *    于是渲染层继续只认 url + scale，8 个渲染点零改动。
 *  - 缩放决定 scale（内孔套住头像），平移只影响孔心是否居中 —— 两者解耦，读数分开显示。
 *  - 不持有就不能戴：服务端触发器（enforce_avatar_frame_owned）兜底，这里只做 UX 层提示。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { logger } from '@/utils/logger.js';
import { uploadImageToCloudinary } from '@/utils/cloudinary-client.js';
import { listAllAvatarFrames, upsertAvatarFrame } from '@/utils/api/avatar-frames-api.js';
import {
  CANVAS_SIZE, DETECT_SAMPLE,
  computeMetrics, sizeStates as computeSizeStates, suggestScale, reviewFrame,
  loadImageForEdit, hasRealAlpha, detectInnerHole, resolveWhiteBackground, bakeFrame
} from './frame-geometry.js';

const STAGE = 380;
const BOX = 54;

const frames = ref([]);
const source = ref(null);          // { url, bitmap, imageData, width, height, hole, alphaStripped }
const busy = ref(false);
const notice = ref(null);
const dragging = ref(false);
let dragState = null;

const draft = reactive({
  id: '', name: '', desc: '', tier: 'free', freeUntil: '',
  pointsPrice: null, sortOrder: 100, status: 'draft', ring: '', url: '', sourceUrl: ''
});
const view = reactive({ zoom: 1, offsetX: 0, offsetY: 0 });

const idLocked = computed(() => {
  const existed = frames.value.find((f) => f.id === draft.id);
  return Boolean(existed && existed.status === 'published');
});
const alphaFixable = computed(() => Boolean(source.value && !source.value.alphaStripped));
const alphaStripped = computed(() => Boolean(source.value?.alphaStripped));

/* ───────── 几何 ───────── */
const metrics = computed(() => {
  if (!source.value || !source.value.hole?.r) return { scale: NaN, holeShare: 0, offset: 0 };
  const m = computeMetrics({
    hole: source.value.hole, imgW: source.value.width, imgH: source.value.height,
    zoom: view.zoom, offsetX: view.offsetX, offsetY: view.offsetY
  });
  return m;
});
const sizeStates = computed(() => computeSizeStates(metrics.value.scale || 0));
const review = computed(() => reviewFrame({
  scale: metrics.value.scale,
  offset: metrics.value.offset,
  holeShare: metrics.value.holeShare,
  hasAlpha: Boolean(source.value && hasRealAlphaCached.value)
}));
const hasRealAlphaCached = ref(true);

const canPublish = computed(() => Boolean(
  !busy.value && source.value && draft.id && draft.name && review.value.ok
));

const layerStyle = computed(() => {
  if (!source.value) return {};
  const k = metrics.value.k || 0;
  const toStage = STAGE / CANVAS_SIZE;
  const dispW = source.value.width * k * toStage;
  const dispH = source.value.height * k * toStage;
  const left = (CANVAS_SIZE / 2 - (source.value.hole.hx * k + view.offsetX)) * toStage;
  const top = (CANVAS_SIZE / 2 - (source.value.hole.hy * k + view.offsetY)) * toStage;
  return { left: `${left}px`, top: `${top}px`, width: `${dispW}px`, height: `${dispH}px` };
});

/** 头像圆直径 = 内孔直径：这既是「头像要占的位置」，也是 scale 的定义式 */
const avatarStyle = computed(() => {
  const px = Math.max(6, (metrics.value.holeDiaCanvas || 0) / CANVAS_SIZE * STAGE);
  return { width: `${px}px`, height: `${px}px`, fontSize: `${Math.max(8, px * 0.2)}px` };
});

const readoutRows = computed(() => {
  const m = metrics.value;
  const scaleCls = !Number.isFinite(m.scale) ? 'bad'
    : (m.scale > 2.2 || m.scale < 1.2 ? (m.scale > 2.2 ? 'bad' : 'warn') : 'good');
  const worstCls = sizeStates.value.worst.cls === 'bad' ? 'bad' : (sizeStates.value.worst.cls === 'warn' ? 'warn' : 'good');
  const offCls = m.offset > 24 ? 'bad' : (m.offset > 8 ? 'warn' : 'good');
  return [
    { label: 'scale（框层 / 头像）', value: Number.isFinite(m.scale) ? m.scale.toFixed(2) : '测不出', cls: scaleCls },
    { label: '内孔占比', value: `${(m.holeShare * 100).toFixed(1)}%`, cls: 'good' },
    { label: `最紧档余量（${sizeStates.value.worst.px}px/${sizeStates.value.worst.container}px）`,
      value: `${sizeStates.value.worst.over > 0 ? '−' : '+'}${Math.abs(Math.round(sizeStates.value.worst.over))}px`, cls: worstCls },
    { label: '孔心偏移', value: `${Math.round(m.offset)}px`, cls: offCls }
  ];
});

const miniScale = (s) => BOX / Math.max(s.frameLayerPx, s.px, 1);
const miniRingStyle = (s) => {
  const px = s.frameLayerPx * miniScale(s);
  return { width: `${px}px`, height: `${px}px`, borderColor: draft.ring || '#c9a06a' };
};
const miniAvatarStyle = (s) => {
  const px = s.px * miniScale(s);
  return { width: `${px}px`, height: `${px}px` };
};

const tierText = (f) => ({ free: '全员可戴', plus: 'Plus 起', pro: 'Pro 起', max: 'Max 起', ultra: 'Ultra 专属' }[f.tier] || f.tier);

/* ───────── 加载 ───────── */
async function refreshList() {
  const res = await listAllAvatarFrames();
  if (res.ok) frames.value = res.data;
  else notice.value = { cls: 'bad', text: `清单加载失败：${res.error?.message || '未知错误'}` };
}

async function loadBitmapFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`素材下载失败（${res.status}）`);
  return loadImageForEdit(await res.blob());
}

/** 释放上一个本地 objectURL（线上 url 不能 revoke，只回收 blob:） */
function revokePrevObjectUrl() {
  const prev = source.value?.url;
  if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
}

/** 素材就绪后的统一收尾：测内孔 → 若给了目标 scale 则反推 zoom */
function applySource(loaded, { targetScale = null, url = '' } = {}) {
  revokePrevObjectUrl();
  const hole = detectInnerHole(loaded.imageData, { sampleSize: DETECT_SAMPLE });
  source.value = { ...loaded, hole, url, alphaStripped: false };
  hasRealAlphaCached.value = hasRealAlpha(loaded.imageData);
  view.offsetX = 0;
  view.offsetY = 0;
  if (targetScale && hole.r > 0) {
    // scale = 长边 / (2r × zoom) → zoom = 长边 / (2r × scale)
    const longSide = Math.max(loaded.width, loaded.height);
    view.zoom = longSide / (2 * hole.r * targetScale);
  } else {
    view.zoom = 1;
  }
  if (!hole.r) {
    notice.value = { cls: 'bad', text: '没能测出内孔：素材中心不是孔洞（框的中心必须是透明的）。' };
  }
}

async function onPickFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  busy.value = true;
  try {
    const loaded = await loadImageForEdit(file);
    const withAlpha = hasRealAlpha(loaded.imageData);
    applySource(loaded, { url: URL.createObjectURL(file) });
    draft.id = draft.id || `frame-${Date.now().toString(36)}`;
    draft.status = 'draft';
    draft.url = '';
    draft.sourceUrl = '';
    if (!withAlpha) {
      notice.value = { cls: 'warn', text: '这张图没有透明层（按像素判定，不看扩展名）。点「自动抠白底」处理，否则深色主题下会显示成白色方块。' };
    } else {
      notice.value = { cls: 'ok', text: '素材已就绪。拖动 / 滚轮调整摆位，让头像圆正好被内孔套住。' };
    }
  } catch (err) {
    logger.error('avatar-console', '读取图片失败', err);
    notice.value = { cls: 'bad', text: `读取图片失败：${err.message}` };
  } finally {
    busy.value = false;
  }
}

async function selectFrame(frame) {
  Object.assign(draft, {
    id: frame.id, name: frame.name, desc: frame.desc, tier: frame.tier,
    freeUntil: frame.freeUntil || '', pointsPrice: frame.pointsPrice,
    sortOrder: frame.sortOrder, status: frame.status, ring: frame.ring,
    url: frame.url, sourceUrl: frame.sourceUrl
  });
  if (!frame.url) { source.value = null; return; }
  busy.value = true;
  try {
    const loaded = await loadBitmapFromUrl(frame.url);
    // 反推 zoom，让编辑器里的摆位与线上一致
    applySource(loaded, { targetScale: frame.scale, url: frame.url });
    hasRealAlphaCached.value = true;   // 线上素材必然已处理过
    notice.value = null;
  } catch (err) {
    logger.warn('avatar-console', '素材载入失败', err);
    notice.value = { cls: 'warn', text: `素材载入失败（${err.message}），仍可编辑元数据；重新上传素材即可。` };
    source.value = null;
  } finally {
    busy.value = false;
  }
}

/* ───────── 交互 ───────── */
function onPointerDown(e) {
  if (!source.value) return;
  dragging.value = true;
  dragState = { sx: e.clientX, sy: e.clientY, ox: view.offsetX, oy: view.offsetY };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}
function onPointerMove(e) {
  if (!dragState) return;
  const toCanvas = CANVAS_SIZE / STAGE;
  const lim = CANVAS_SIZE * 0.45;
  view.offsetX = Math.max(-lim, Math.min(lim, dragState.ox + (e.clientX - dragState.sx) * toCanvas));
  view.offsetY = Math.max(-lim, Math.min(lim, dragState.oy + (e.clientY - dragState.sy) * toCanvas));
}
function endDrag() { dragging.value = false; dragState = null; }
function onWheel(e) {
  if (!source.value) return;
  const step = e.shiftKey ? 0.01 : 0.04;
  view.zoom = Math.max(0.6, Math.min(2.6, view.zoom + (e.deltaY < 0 ? step : -step)));
}
function onZoomInput(e) { view.zoom = Number(e.target.value) / 100; }
function center() { view.offsetX = 0; view.offsetY = 0; }
function autoFit() {
  if (!source.value?.hole?.r) return;
  const target = suggestScale();
  const longSide = Math.max(source.value.width, source.value.height);
  view.zoom = longSide / (2 * source.value.hole.r * target);
  view.offsetX = 0;
  view.offsetY = 0;
}

async function stripBackground() {
  if (!source.value) return;
  try {
    const { cleared, total } = resolveWhiteBackground(source.value.imageData, 244);
    if (!cleared) {
      notice.value = { cls: 'warn', text: '没找到可清除的白底：这张图可能本来就带透明层，或背景不是接近纯白。' };
      return;
    }
    // 把处理后的像素写回一张新位图 —— 否则画布上仍显示原图，运营看不到抠底效果
    const canvas = document.createElement('canvas');
    canvas.width = source.value.width;
    canvas.height = source.value.height;
    canvas.getContext('2d').putImageData(source.value.imageData, 0, 0);
    const bitmap = await createImageBitmap(canvas);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    // 抠底后内孔可能变大（原来的白底被清掉），重测一次
    const hole = detectInnerHole(source.value.imageData, { sampleSize: DETECT_SAMPLE });
    revokePrevObjectUrl();
    source.value = {
      ...source.value, bitmap, hole, alphaStripped: true,
      url: blob ? URL.createObjectURL(blob) : source.value.url
    };
    hasRealAlphaCached.value = true;
    notice.value = { cls: 'ok', text: `已清除 ${(cleared / total * 100).toFixed(0)}% 的背景像素，并重测了内孔。` };
  } catch (err) {
    logger.error('avatar-console', '抠底失败', err);
    notice.value = { cls: 'bad', text: `抠底失败：${err.message}` };
  }
}

/* ───────── 保存 / 发布 ───────── */
async function save(status) {
  if (!draft.id) { notice.value = { cls: 'bad', text: '请先填标识 slug。' }; return; }
  if (!/^[a-z0-9-]{3,32}$/.test(draft.id)) {
    notice.value = { cls: 'bad', text: 'slug 只允许小写字母、数字和短横线，长度 3~32。' };
    return;
  }
  if (status === 'published') {
    if (!review.value.ok) { notice.value = { cls: 'bad', text: '还有阻塞项没解决，不能发布。' }; return; }
    if (!source.value) { notice.value = { cls: 'bad', text: '没有素材，不能发布。' }; return; }
  }
  busy.value = true;
  try {
    let url = draft.url;
    let sourceUrl = draft.sourceUrl;
    // 摆位有改动（或新上传）→ 重新烘焙并上传
    if (source.value) {
      const baked = await bakeFrame({
        bitmap: source.value.bitmap, hole: source.value.hole,
        zoom: view.zoom, offsetX: view.offsetX, offsetY: view.offsetY
      });
      if (!baked.blob) throw new Error('烘焙失败（画布导出为空）');
      const folder = 'boh-cloud-plus/admin-avatar-frames';
      // 原图留档：只在首次上传时存一次，后续重摆位都从它重新烘焙
      if (!sourceUrl) {
        const rawFile = new File([await blobFromBitmap(source.value.bitmap)], `${draft.id}-source.png`, { type: 'image/png' });
        const rawUp = await uploadImageToCloudinary(rawFile, { folder: `${folder}/source`, pendingSource: 'avatar-frames-source' });
        sourceUrl = rawUp.url || rawUp.secure_url || '';
      }
      const file = new File([baked.blob], `${draft.id}.png`, { type: 'image/png' });
      const up = await uploadImageToCloudinary(file, { folder, pendingSource: 'avatar-frames' });
      url = up.url || up.secure_url || '';
      if (!url) throw new Error('上传未返回 URL');
    }
    if (!url) { notice.value = { cls: 'bad', text: '没有素材 URL，无法保存。' }; return; }

    const res = await upsertAvatarFrame({
      id: draft.id, name: draft.name, desc: draft.desc, url, sourceUrl,
      scale: Number(metrics.value.scale.toFixed(2)),
      tier: draft.tier, freeUntil: draft.freeUntil || null,
      pointsPrice: draft.pointsPrice === '' || draft.pointsPrice === 0 ? null : draft.pointsPrice,
      sortOrder: draft.sortOrder, status, ring: draft.ring
    });
    if (!res.ok) throw new Error(res.error?.message || '写入失败');

    draft.url = url;
    draft.sourceUrl = sourceUrl;
    draft.status = status;
    await refreshList();
    notice.value = { cls: 'ok', text: status === 'published' ? '已发布，用户端即刻可见。' : '已存为草稿。' };
  } catch (err) {
    logger.error('avatar-console', '保存失败', err);
    notice.value = { cls: 'bad', text: `保存失败：${err.message}` };
  } finally {
    busy.value = false;
  }
}

async function blobFromBitmap(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

onMounted(refreshList);
</script>

<style scoped>
.afc { padding: 18px 20px 40px; color: #1f2430; font-size: 13px; }
.afc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.afc-head h1 { margin: 0 0 4px; font-size: 18px; font-weight: 700; }
.afc-head p { margin: 0; color: #5a6377; font-size: 12.5px; max-width: 560px; }
.afc-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.btn {
  display: inline-flex; align-items: center; padding: 7px 14px; border-radius: 999px;
  border: 1px solid rgba(31,41,66,.12); background: #fff; color: #1f2430;
  font-size: 12.5px; cursor: pointer; transition: .16s; font-family: inherit;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px -8px rgba(31,41,66,.3); }
.btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.btn.primary { background: #1459d9; border-color: #1459d9; color: #fff; }
.btn.sm { padding: 5px 11px; font-size: 12px; }

.afc-notice { margin: 0 0 12px; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; border: 1px solid; }
.afc-notice.ok { background: rgba(15,138,106,.09); border-color: rgba(15,138,106,.2); color: #0b5f4a; }
.afc-notice.warn { background: rgba(180,83,9,.09); border-color: rgba(180,83,9,.22); color: #7c3d06; }
.afc-notice.bad { background: rgba(179,38,30,.08); border-color: rgba(179,38,30,.22); color: #8c1d17; }

.afc-body { display: grid; grid-template-columns: 232px minmax(0, 1fr) 316px; gap: 14px; align-items: start; }
@media (max-width: 1180px) { .afc-body { grid-template-columns: 1fr; } }

.afc-lib, .afc-main, .afc-meta {
  background: rgba(255,255,255,.72); border: 1px solid rgba(31,41,66,.08);
  border-radius: 14px; padding: 12px;
}
.afc-lib-head { display: flex; justify-content: space-between; font-size: 12px; color: #8a92a6; margin-bottom: 8px; }
.afc-lib-list { display: flex; flex-direction: column; gap: 5px; max-height: 620px; overflow: auto; }
.afc-lib-item {
  display: flex; gap: 9px; align-items: center; padding: 7px 8px; border-radius: 10px;
  border: 1px solid transparent; background: rgba(255,255,255,.6); cursor: pointer;
  text-align: left; font-family: inherit; font-size: 12.5px; color: inherit;
}
.afc-lib-item:hover { border-color: rgba(31,41,66,.14); }
.afc-lib-item.on { border-color: #1459d9; background: #eef4ff; }
.afc-lib-item .thumb { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 8px; background-size: cover; background-position: center; }
.afc-lib-item .meta { min-width: 0; }
.afc-lib-item b { display: block; font-weight: 650; }
.afc-lib-item .tag { margin-left: 5px; padding: 0 5px; border-radius: 999px; background: rgba(31,41,66,.08); font-size: 10px; font-weight: 500; color: #5a6377; }
.afc-lib-item .sub { color: #8a92a6; font-size: 11px; }
.empty { color: #8a92a6; font-size: 12px; padding: 8px 2px; }

.afc-placeholder { padding: 60px 20px; text-align: center; color: #5a6377; }
.afc-placeholder .muted { color: #8a92a6; font-size: 12px; }

.afc-stage-row { display: flex; gap: 16px; flex-wrap: wrap; }
.afc-stage {
  position: relative; flex: 0 0 auto; border-radius: 14px; overflow: hidden; touch-action: none;
  cursor: grab; border: 1px dashed rgba(31,41,66,.18);
  background:
    linear-gradient(45deg, #eef1f6 25%, transparent 25%, transparent 75%, #eef1f6 75%) 0 0/18px 18px,
    linear-gradient(45deg, #eef1f6 25%, transparent 25%, transparent 75%, #eef1f6 75%) 9px 9px/18px 18px,
    #fafbff;
}
.afc-stage.grabbing { cursor: grabbing; }
.afc-layer { position: absolute; pointer-events: none; user-select: none; }
.afc-avatar {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%;
  background: linear-gradient(135deg,#5b8ff0,#3f6fd8); color: #fff; font-weight: 700;
  display: flex; align-items: center; justify-content: center; z-index: 2; pointer-events: none;
  box-shadow: 0 6px 18px rgba(31,41,66,.18);
}
.afc-cross { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.afc-cross::before, .afc-cross::after { content: ''; position: absolute; background: rgba(20,89,217,.25); }
.afc-cross::before { left: 50%; top: 14px; bottom: 14px; width: 1px; }
.afc-cross::after { top: 50%; left: 14px; right: 14px; height: 1px; }
.afc-badge { position: absolute; right: 8px; bottom: 8px; padding: 2px 8px; border-radius: 999px; background: rgba(31,41,66,.72); color: #fff; font-size: 11px; z-index: 4; }

.afc-readout { flex: 1 1 220px; display: flex; flex-direction: column; gap: 7px; min-width: 220px; }
.kv { display: flex; justify-content: space-between; align-items: baseline; padding: 7px 10px; border-radius: 9px; background: #fff; border: 1px solid rgba(31,41,66,.08); }
.kv span { color: #8a92a6; font-size: 11.5px; }
.kv b { font-variant-numeric: tabular-nums; }
.kv.good b { color: #0f8a6a; } .kv.warn b { color: #b45309; } .kv.bad b { color: #b3261e; }
.afc-tools { display: flex; gap: 7px; flex-wrap: wrap; }
.slider { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #5a6377; }
.slider input { flex: 1; accent-color: #1459d9; }

.afc-sizes { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-top: 14px; }
.sizebox { text-align: center; }
.sizebox .box { position: relative; border-radius: 8px; border: 1px solid rgba(31,41,66,.1); background: #fff; overflow: hidden; }
.sizebox .ring { position: absolute; left: 50%; top: 50%; border-radius: 50%; border: 1.5px solid; transform: translate(-50%,-50%); }
.sizebox .av { position: absolute; left: 50%; top: 50%; border-radius: 50%; background: #3f6fd8; transform: translate(-50%,-50%); }
.sizebox .cap { font-size: 10.5px; color: #8a92a6; line-height: 1.35; margin-top: 3px; }
.sizebox.bad .box { border-color: #b3261e; background: rgba(179,38,30,.06); }
.sizebox.bad .cap { color: #b3261e; font-weight: 700; }
.sizebox.warn .box { border-color: #b45309; background: rgba(180,83,9,.07); }
.sizebox.warn .cap { color: #b45309; }
.afc-sizes-note { font-size: 11.5px; }

.afc-alerts { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.alert { margin: 0; padding: 8px 11px; border-radius: 10px; font-size: 12.5px; border: 1px solid; }
.alert.ok { background: rgba(15,138,106,.09); border-color: rgba(15,138,106,.2); color: #0b5f4a; }
.alert.warn { background: rgba(180,83,9,.09); border-color: rgba(180,83,9,.22); color: #7c3d06; }
.alert.bad { background: rgba(179,38,30,.08); border-color: rgba(179,38,30,.22); color: #8c1d17; }

.afc-meta h2 { font-size: 12px; font-weight: 700; color: #8a92a6; margin: 14px 0 7px; }
.afc-meta h2:first-child { margin-top: 0; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 9px; }
.field span { font-size: 11.5px; color: #5a6377; }
.field input, .field select {
  padding: 7px 9px; border-radius: 9px; border: 1px solid rgba(31,41,66,.14);
  background: #fff; font-size: 12.5px; font-family: inherit; color: inherit;
}
.field input:disabled { background: #f4f5f8; color: #8a92a6; }
.hint { margin: -3px 0 9px; font-size: 11.5px; color: #8a92a6; line-height: 1.5; }
</style>
