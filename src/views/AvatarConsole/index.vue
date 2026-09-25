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
        <button type="button" class="btn" :disabled="!canSaveDraft" :title="saveDraftTitle" @click="save('draft')">存草稿</button>
        <button type="button" class="btn primary" :disabled="!canPublish" @click="save('published')">发布</button>
      </div>
    </header>

    <p v-if="notice" class="afc-notice" :class="notice.cls">{{ notice.text }}</p>

    <div class="afc-body">
      <!-- ═════ 左：框库 ═════ -->
      <aside class="afc-lib">
        <div class="afc-lib-head">
          <span>框库</span>
          <span class="muted">{{ frames.length }} 个<template v-if="draftCount"> · 草稿 {{ draftCount }}</template></span>
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
              title="单指/鼠标拖动摆位 · 滚轮或双指捏合缩放素材"
              @pointerdown="onPointerDown" @pointermove="onPointerMove"
              @pointerup="endDrag" @pointercancel="endDrag" @wheel.prevent="onWheel">
              <img class="afc-layer" :src="source.url" alt="" draggable="false" :style="layerStyle">
              <div v-if="holeKnown" class="afc-avatar" :style="avatarStyle"><span>头像</span></div>
              <div v-else class="afc-no-hole">
                <b>内孔未测出</b>
                <span>头像圆画不出来（素材中心不是透明孔洞）—— 先点「自动抠白底」</span>
              </div>
              <div class="afc-cross" aria-hidden="true" />
              <!-- 两个口径一起显示：zoom 是素材缩放，scale 是成品框层/头像比（与读数和落库值一致） -->
              <div class="afc-badge">
                缩放 {{ view.zoom.toFixed(2) }}× · scale {{ Number.isFinite(metrics.scale) ? metrics.scale.toFixed(2) : '—' }}
              </div>
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
            <div v-for="s in sizeStates.all" :key="s.px" class="sizebox" :class="[s.cls, { unknown: !holeKnown }]">
              <div class="box" :style="{ width: BOX + 'px', height: BOX + 'px' }">
                <div class="ring" :style="miniRingStyle(s)" />
                <div class="av" :style="miniAvatarStyle(s)" />
              </div>
              <div class="cap">{{ s.px }}px {{ s.scene }}<br>{{ holeKnown ? `框层 ${Math.round(s.frameLayerPx)}` : '框层 —' }}</div>
            </div>
            <div class="afc-sizes-note muted">
              <template v-if="holeKnown">
                最紧档 = {{ sizeStates.worst.px }}px（容器 {{ sizeStates.worst.container }}px）
                <template v-if="sizeStates.worst.over > 0">，溢出 {{ Math.round(sizeStates.worst.over) }}px</template>
              </template>
              <template v-else>测出内孔后才有多尺寸溢出判定</template>
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
            <option value="limit">活动限定（只发给指定用户）</option>
          </select>
        </label>
        <p v-if="draft.tier === 'limit'" class="hint">
          活动限定框不会按档位放开：只有下面「按人发放」过、或处于限免期内的用户能戴。
        </p>
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

        <h2>按人发放</h2>
        <p class="hint">
          抽奖专属 / 活动限定走这里：档位设「活动限定」后，只有发放过的用户能戴（幂等，可重复点）。
          来源标签会记进台账，便于事后区分「积分买的」与「活动发的」。
        </p>
        <label class="field">
          <span>发放给（搜用户名，或直接粘 UUID）</span>
          <div class="afc-user-search">
            <input
              v-model.trim="grantTarget"
              type="text"
              placeholder="输入用户名搜索…"
              autocomplete="off"
              :disabled="busy"
              @input="onGrantSearchInput"
              @keydown.enter.prevent="pickFirstGrantUser"
              @keydown.esc="closeGrantResults"
            >
            <span v-if="grantSearching" class="afc-user-flag">搜索中…</span>
            <span v-else-if="grantPicked" class="afc-user-flag ok">已选中</span>
          </div>
        </label>
        <ul v-if="grantResults.length" class="afc-user-list">
          <li v-for="u in grantResults" :key="u.id">
            <button type="button" class="afc-user-item" @click="pickGrantUser(u)">
              <b>{{ u.username || '未命名用户' }}</b>
              <code>{{ String(u.id).slice(0, 8) }}</code>
              <span class="afc-user-points">{{ u.points ?? 0 }} 积分</span>
            </button>
          </li>
        </ul>
        <p v-if="grantSearchTip" class="hint">{{ grantSearchTip }}</p>
        <label class="field">
          <span>来源标签</span>
          <input v-model="grantSource" type="text" placeholder="lottery / activity" :disabled="busy">
        </label>
        <button
          type="button"
          class="btn"
          :disabled="busy || !grantTarget.trim() || !draft.id"
          @click="doGrant"
        >发放「{{ draft.name || draft.id || '未选择框' }}」</button>
        <p v-if="lastGrant" class="hint">最近发放：{{ lastGrant }}</p>
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
import { listAllAvatarFrames, upsertAvatarFrame, grantAvatarFrame, resolveGrantTarget } from '@/utils/api/avatar-frames-api.js';
// 与数据面板「积分发放台」共用同一套用户搜索（同一份 profiles 查询口径，勿再写第二份）
import { searchGrantTargetUsers } from '@/utils/api/points-admin-api.js';
import {
  CANVAS_SIZE, DETECT_SAMPLE,
  computeMetrics, layerTransform, sizeStates as computeSizeStates, suggestScale, reviewFrame,
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
/** 素材中心有没有测出孔洞 —— 测不出时读数只能是「测不出」，但素材本身**必须照常显示** */
const holeKnown = computed(() => Boolean(source.value?.hole?.r > 0));

const metrics = computed(() => {
  if (!source.value) return { k: 0, scale: NaN, holeShare: 0, offset: 0 };
  const m = computeMetrics({
    hole: source.value.hole, imgW: source.value.width, imgH: source.value.height,
    zoom: view.zoom, offsetX: view.offsetX, offsetY: view.offsetY
  });
  // 测不出内孔时 scale 是 Infinity（读数是「测不出」），但 k 等字段必须照常带出去：
  // 早期版本在这里提前 return 一个没有 k 的对象，图层随之塌成 0×0 —— 素材看不见了。
  return holeKnown.value ? m : { ...m, scale: NaN, holeShare: 0 };
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

/**
 * 保存用的 scale。
 *  - 编辑器里载着素材 → 用实时算出的（测不出内孔就是 NaN，不许写库）
 *  - 只改元数据（没载素材）→ **沿用该行已记的 scale**，重算只会得到 NaN
 * scale 在库里是 not null 真实读数：以前没兜底，于是「内孔未测出时点存草稿」会拿 NaN 去写，
 * 服务端 23502 直接拒（2026-09-25 实测：库里一条草稿都没有，就是这么丢的）。
 */
const draftRowScale = computed(() => frames.value.find((f) => f.id === draft.id)?.scale ?? null);
const resolvedScale = computed(() => (source.value ? metrics.value.scale : draftRowScale.value));
const canSaveDraft = computed(() => Boolean(!busy.value && draft.id && Number.isFinite(resolvedScale.value)));
const saveDraftTitle = computed(() => {
  if (canSaveDraft.value) return '存为草稿（用户端不可见）';
  if (!draft.id) return '请先填标识 slug';
  if (source.value && !holeKnown.value) return '还没测出内孔：先点「自动抠白底」—— scale 是必填的真实读数，测不出就存不了';
  return '这个框还没有可用的 scale（素材没载入过）';
});
const draftCount = computed(() => frames.value.filter((f) => f.status === 'draft').length);

const layerStyle = computed(() => {
  if (!source.value) return {};
  const t = layerTransform({
    hole: source.value.hole, imgW: source.value.width, imgH: source.value.height,
    zoom: view.zoom, offsetX: view.offsetX, offsetY: view.offsetY, stage: STAGE
  });
  return { left: `${t.left}px`, top: `${t.top}px`, width: `${t.width}px`, height: `${t.height}px` };
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

const tierText = (f) => ({ free: '全员可戴', plus: 'Plus 起', pro: 'Pro 起', max: 'Max 起', ultra: 'Ultra 专属', limit: '活动限定' }[f.tier] || f.tier);

/* ───────── 按人发放（抽奖专属 / 活动限定） ───────── */
const grantTarget = ref('');
const grantSource = ref('lottery');
const lastGrant = ref('');
const grantResults = ref([]);      // 用户搜索结果（profile 行）
const grantSearching = ref(false);
const grantPicked = ref(null);     // 从列表里点中的那个人（有它就不再靠用户名反查）
const grantSearchTip = ref('');

/** 300ms 防抖：每键入都打 profiles 没必要；另外只认最后一次结果，避免乱序覆盖 */
let grantSearchTimer = null;
const GRANT_PICK_LIMIT = 8;

function closeGrantResults() {
  clearTimeout(grantSearchTimer);
  grantResults.value = [];
  grantSearching.value = false;
}

function onGrantSearchInput() {
  grantPicked.value = null;        // 手改了输入 → 之前的选中作废，避免"看着是 A 实际发 B"
  grantSearchTip.value = '';
  clearTimeout(grantSearchTimer);
  const keyword = grantTarget.value.trim();
  if (!keyword) { closeGrantResults(); return; }
  grantSearchTimer = setTimeout(() => { void runGrantSearch(keyword); }, 300);
}

async function runGrantSearch(keyword) {
  grantSearching.value = true;
  try {
    const rows = await searchGrantTargetUsers(keyword, GRANT_PICK_LIMIT);
    if (grantTarget.value.trim() !== keyword) return;   // 输入又变了：丢弃这次
    grantResults.value = rows;
    if (!rows.length) grantSearchTip.value = '没搜到匹配的用户（用户名按片段匹配）。也可以直接粘用户 UUID。';
  } catch (err) {
    logger.error('avatar-console', '用户搜索失败', err);
    grantResults.value = [];
    notice.value = { cls: 'bad', text: `用户搜索失败：${err.message}` };
  } finally {
    grantSearching.value = false;
  }
}

function pickGrantUser(user) {
  grantPicked.value = user;
  grantTarget.value = user.username || user.id;
  grantResults.value = [];
  grantSearchTip.value = '';
}

function pickFirstGrantUser() {
  if (grantResults.value.length) pickGrantUser(grantResults.value[0]);
}

const GRANT_REASON_TEXT = {
  EMPTY: '请输入用户名或用户 UUID。',
  NOT_FOUND: '找不到这个用户名的用户，请确认昵称完全一致。',
  QUERY_FAILED: '用户查询失败，请重试。'
};
const GRANT_FAIL_TEXT = {
  NOT_ADMIN: '当前账号不是管理员，无权发放。',
  FRAME_NOT_FOUND: '这个框不存在，可能已被删除。',
  FRAME_NOT_PUBLISHED: '框还没发布：先「发布」再发放。',
  PROFILE_NOT_FOUND: '目标用户资料不存在。',
  MISSING_USER: '缺少目标用户。',
  MISSING_FRAME: '缺少目标框。',
  GRANT_FAILED: '发放失败，请稍后重试。'
};

async function doGrant() {
  const frameId = String(draft.id || '').trim();
  if (!frameId) { notice.value = { cls: 'bad', text: '请先在左侧选择一个框。' }; return; }

  busy.value = true;
  try {
    // 从候选里点中的人直接用 id（不再按用户名反查 → 同名也不会发错）；手填的仍走解析
    const target = grantPicked.value
      ? { ok: true, userId: grantPicked.value.id, username: grantPicked.value.username || '' }
      : await resolveGrantTarget(grantTarget.value);
    if (!target.ok) {
      notice.value = { cls: 'bad', text: GRANT_REASON_TEXT[target.reason] || '目标用户解析失败。' };
      return;
    }

    const res = await grantAvatarFrame({ userId: target.userId, frameId, source: grantSource.value });
    if (!res.ok) {
      notice.value = { cls: 'bad', text: GRANT_FAIL_TEXT[res.message] || `发放失败：${res.message}` };
      return;
    }

    lastGrant.value = `${target.username || target.userId} · ${res.source || 'activity'}`;
    closeGrantResults();
    notice.value = {
      cls: 'ok',
      text: `已发放给 ${target.username || target.userId}（来源 ${res.source || 'activity'}）。对方刷新即可佩戴。`
    };
  } catch (err) {
    logger.error('avatar-console', '按人发放失败', err);
    notice.value = { cls: 'bad', text: `发放失败：${err.message}` };
  } finally {
    busy.value = false;
  }
}

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

/** 素材就绪后的统一收尾：测内孔 → 若给了目标 scale 则反推 zoom。
 *  ownerId 记录「编辑器里这张图属于哪个 slug」——发布时用它拦住「素材与 slug 脱钩」：
 *  一旦把 A 框的素材发到 B 框的 slug 上，渲染就会串图（cow 显示成猫就是这么来的）。 */
function applySource(loaded, { targetScale = null, url = '', ownerId = '', ownerKind = 'upload' } = {}) {
  revokePrevObjectUrl();
  const hole = detectInnerHole(loaded.imageData, { sampleSize: DETECT_SAMPLE });
  source.value = { ...loaded, hole, url, ownerId, ownerKind, alphaStripped: false };
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
    draft.id = draft.id || `frame-${Date.now().toString(36)}`;
    // 归属先定：新上传的素材属于当前 slug（改 slug 后必须重新确认，见 save()）
    applySource(loaded, { url: URL.createObjectURL(file), ownerId: draft.id });
    draft.status = 'draft';
    draft.url = '';
    draft.sourceUrl = '';
    if (!withAlpha) {
      notice.value = {
        cls: 'warn',
        text: '这张图没有一个真透明像素 —— 带 alpha 通道 ≠ 有透明区，这里按像素事实判定（白底存成 RGBA 的图很常见）。点「自动抠白底」把外部白底和中心白孔一起清掉，否则深色主题下会显示成白色方块。'
      };
    } else {
      notice.value = { cls: 'ok', text: '素材已就绪。拖动 / 滚轮 / 双指捏合调整摆位，让头像圆正好被内孔套住。' };
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
    // 反推 zoom，让编辑器里的摆位与线上一致；素材归属该条目
    applySource(loaded, { targetScale: frame.scale, url: frame.url, ownerId: frame.id, ownerKind: 'library' });
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

/* ───────── 交互：单指平移 / 双指捏合缩放 ─────────
 * 触屏（竖屏）用户的「缩放手势」是捏合，不是滚轮。旧实现不区分指针：
 * 第二根手指落下的 pointerdown 会覆盖 dragState，于是捏合被当成单指拖动 ——
 * 往外撑时素材整体跑偏（实测孔心偏移 0px → 502px），zoom 却一动不动，
 * 手势方向与预期完全相反。这里按「活动指针数」分流，并保持缩放锚点仍是孔心
 * （不变式：头像圆永远居中不动，靠 offset 归零保证成品孔心居中）。
 */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.6;
const activePointers = new Map();   // pointerId -> { x, y }
let pinchState = null;              // { dist, zoom }：捏合起手的间距与当时的 zoom
const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
const pinchDistance = () => {
  const [a, b] = [...activePointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

/** 单指：以这根手指为基准续接平移（捏合结束剩一指时也重建基准，避免跳变） */
function beginPan(pointerId) {
  const point = activePointers.get(pointerId);
  if (!point) return;
  dragging.value = true;
  pinchState = null;
  dragState = { pointerId, sx: point.x, sy: point.y, ox: view.offsetX, oy: view.offsetY };
}

/** 双指：记下起始间距与 zoom，捏合期间不再平移 */
function beginPinch() {
  dragging.value = false;
  dragState = null;
  const dist = pinchDistance();
  pinchState = dist > 0 ? { dist, zoom: view.zoom } : null;
}

function onPointerDown(e) {
  if (!source.value) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // 指针可能已被浏览器释放（快速抬手 / 触控差异）→ 捕获失败不能冒泡成整页错误
  try {
    e.currentTarget.setPointerCapture?.(e.pointerId);
  } catch (err) {
    logger.warn('avatar-console', '指针捕获失败（忽略，不影响后续手势）:', err);
  }
  if (activePointers.size === 1) beginPan(e.pointerId);
  else beginPinch();
}

function onPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2) {
    // 捏合：间距比 → zoom（张开=素材放大 / scale 变小），从起手基准乘性推进，避免累积漂移
    if (!pinchState) beginPinch();
    if (pinchState) view.zoom = clampZoom(pinchState.zoom * (pinchDistance() / pinchState.dist));
    return;
  }

  if (!dragState || dragState.pointerId !== e.pointerId) beginPan(e.pointerId);
  if (!dragState) return;
  const toCanvas = CANVAS_SIZE / STAGE;
  const lim = CANVAS_SIZE * 0.45;
  view.offsetX = Math.max(-lim, Math.min(lim, dragState.ox + (e.clientX - dragState.sx) * toCanvas));
  view.offsetY = Math.max(-lim, Math.min(lim, dragState.oy + (e.clientY - dragState.sy) * toCanvas));
}

function endDrag(e) {
  const pointerId = e?.pointerId;
  if (pointerId !== undefined) activePointers.delete(pointerId);
  if (activePointers.size === 1) {
    beginPan([...activePointers.keys()][0]);
    return;
  }
  if (activePointers.size === 0) {
    dragging.value = false;
    dragState = null;
    pinchState = null;
    return;
  }
  beginPinch();
}
function onWheel(e) {
  if (!source.value) return;
  const step = e.shiftKey ? 0.01 : 0.04;
  view.zoom = clampZoom(view.zoom + (e.deltaY < 0 ? step : -step));
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
/** 素材 URL 去 query（?v=3 之类），比对同一份素材用 */
const stripQuery = (u) => String(u || '').split('?')[0];

/**
 * 发布前防「素材 ↔ slug 脱钩」：历史上 cow 的成品图被白绒猫那张顶掉过 ——
 * 两个 slug 的 url / source_url 字节完全相同，前端 DB 优先合并后「奶牛抱抱」直接渲染成猫。
 * 两道闸：①编辑器里的素材必须属于当前 slug；②同一份原图/成品图不能被两个 slug 共用。
 * @returns {string} 非空 = 拦截原因
 */
function findMaterialConflict({ url, sourceUrl }) {
  const owner = source.value?.ownerId || '';
  // 只有「从框库选来的素材」才要求 slug 回指它自己：新上传的素材允许随后改 slug 命名
  if (source.value && source.value.ownerKind === 'library' && owner && owner !== draft.id) {
    return `编辑器里的素材是从「${owner}」选来的，当前 slug 是「${draft.id}」—— 直接发会把 ${owner} 的图案发到 ${draft.id} 上。请重新从左侧框库选 ${draft.id}，或点「上传 PNG 新建」重新给素材，再发布。`;
  }
  const bakedKey = stripQuery(url);
  const sourceKey = stripQuery(sourceUrl);
  const clash = frames.value.find((f) => f.id !== draft.id
    && ((bakedKey && stripQuery(f.url) === bakedKey) || (sourceKey && f.sourceUrl && stripQuery(f.sourceUrl) === sourceKey)));
  if (clash) {
    return `这份素材已经用在「${clash.name || clash.id}」上了：一个素材不能同时占两个框（渲染会串图）。请换素材，或把它改回自己的 slug。`;
  }
  return '';
}

async function save(status) {
  if (!draft.id) { notice.value = { cls: 'bad', text: '请先填标识 slug。' }; return; }
  if (!/^[a-z0-9-]{3,32}$/.test(draft.id)) {
    notice.value = { cls: 'bad', text: 'slug 只允许小写字母、数字和短横线，长度 3~32。' };
    return;
  }
  // scale 是库里的必填真实读数：测不出就别拿 NaN 去撞 not null（那样只会换来一条看不懂的 23502）
  if (!Number.isFinite(resolvedScale.value)) {
    notice.value = {
      cls: 'bad',
      text: source.value
        ? '还没测出内孔，不能保存：scale 是必填的真实读数 —— 先点「自动抠白底」。'
        : '这个框没有素材、也没有已记录的 scale，无法保存。'
    };
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
        const rawUp = await uploadImageToCloudinary(rawFile, { folder: `${folder}/source`, pendingSource: 'avatar-frames-source', claimPendingUpload: true });
        sourceUrl = rawUp.url || rawUp.secure_url || '';
      }
      const file = new File([baked.blob], `${draft.id}.png`, { type: 'image/png' });
      const up = await uploadImageToCloudinary(file, { folder, pendingSource: 'avatar-frames', claimPendingUpload: true });
      url = up.url || up.secure_url || '';
      if (!url) throw new Error('上传未返回 URL');
    }
    if (!url) { notice.value = { cls: 'bad', text: '没有素材 URL，无法保存。' }; return; }

    const conflict = findMaterialConflict({ url, sourceUrl });
    if (conflict) { notice.value = { cls: 'bad', text: conflict }; return; }

    const res = await upsertAvatarFrame({
      id: draft.id, name: draft.name, desc: draft.desc, url, sourceUrl,
      scale: Number(resolvedScale.value.toFixed(2)),
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
/* 测不出内孔时占位：明说「画不出来」而不是画一个 6px 的假头像圆 */
.afc-no-hole {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 2;
  display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
  max-width: 250px; padding: 10px 14px; border-radius: 12px; pointer-events: none;
  background: rgba(255,255,255,.86); border: 1px dashed rgba(179,38,30,.45);
}
.afc-no-hole b { color: #b3261e; font-size: 12.5px; }
.afc-no-hole span { color: #5a6377; font-size: 11.5px; line-height: 1.45; }
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
/* 没测出内孔：四档都无从判定，别用绿色「通过」骗人 */
.sizebox.unknown .box { border-style: dashed; border-color: rgba(31,41,66,.12); }
.sizebox.unknown .ring, .sizebox.unknown .av { opacity: .25; }
.sizebox.unknown .cap { color: #8a92a6; }
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

/* 按人发放：用户搜索（与积分发放台同一套查询，这里只是换了皮） */
.afc-user-search { position: relative; }
.afc-user-search input { width: 100%; box-sizing: border-box; padding-right: 58px; }
.afc-user-flag {
  position: absolute; right: 9px; top: 50%; transform: translateY(-50%);
  font-size: 10.5px; color: #8a92a6; pointer-events: none;
}
.afc-user-flag.ok { color: #0f8a6a; font-weight: 650; }
.afc-user-list {
  list-style: none; margin: -3px 0 9px; padding: 4px; max-height: 196px; overflow: auto;
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid rgba(31,41,66,.12); border-radius: 10px; background: #fff;
}
.afc-user-item {
  display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 8px;
  border: 0; border-radius: 7px; background: transparent; font-family: inherit;
  font-size: 12.5px; color: inherit; cursor: pointer; text-align: left;
}
.afc-user-item:hover { background: #eef4ff; }
.afc-user-item b { flex: 1; min-width: 0; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.afc-user-item code { font-size: 10.5px; color: #8a92a6; }
.afc-user-points { font-size: 10.5px; color: #8a92a6; }
</style>
