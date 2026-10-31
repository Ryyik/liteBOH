<template>
  <div class="gc">
    <header class="gc-head">
      <div>
        <h1>开屏控制台</h1>
        <p>活动期打开、结束关掉，都不用发版。保存后用户下次进站生效（已通过过的人 24h 内不会重播）。</p>
      </div>
      <div class="gc-actions">
        <button type="button" class="btn" :disabled="busy" @click="load">重新读取</button>
        <button type="button" class="btn primary" :disabled="busy || !canSave" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </header>

    <p v-if="notice" class="gc-notice" :class="notice.type">{{ notice.text }}</p>

    <div class="gc-body">
      <!-- ═════ 左：实时预览 ═════ -->
      <section class="gc-preview">
        <div class="gc-preview-head">
          <span>实时预览</span>
          <span class="muted">{{ statusText }}</span>
        </div>

        <div
          ref="phoneRef"
          class="gc-phone"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @wheel.prevent="onWheel"
        >
          <div class="gc-desk">
            <i class="bar"></i>
            <i class="bar short"></i>
            <i class="card"></i>
            <i class="card"></i>
          </div>
          <div class="gc-gate" :style="{ '--gate-p': progress }">
            <GateSceneHero v-if="draft.theme !== 'default'" :config="draft" @cta="onPreviewCta" />
            <div v-else class="gc-fallback">
              <img src="/icons/icon-512.png" alt="" />
              <p>晚上好，欢迎回到方块街</p>
            </div>
          </div>
        </div>

        <div class="gc-preview-foot">
          <span class="muted">拖动画面看「揭开」过程</span>
          <button type="button" class="btn sm" @click="replay">重播</button>
        </div>
      </section>

      <!-- ═════ 右：表单 ═════ -->
      <section class="gc-form">
        <div class="gc-section">
          <div class="gc-section-head">
            <h2>状态</h2>
            <label class="gc-switch">
              <input v-model="draft.enabled" type="checkbox" />
              <span>{{ draft.enabled ? '已启用' : '已停用' }}</span>
            </label>
          </div>
          <p class="gc-hint">
            关掉后线上立刻回到默认开屏（白底 + 红苹果 + 时段问候）。正在看的人不受影响，下次进站生效。
          </p>
        </div>

        <div class="gc-section">
          <h2>生效时间</h2>
          <div class="gc-grid2">
            <label class="gc-field">
              <span>开始</span>
              <input v-model="draft.starts_at_local" type="datetime-local" />
            </label>
            <label class="gc-field">
              <span>结束</span>
              <input v-model="draft.ends_at_local" type="datetime-local" />
            </label>
          </div>
          <p class="gc-hint">留空 = 不限。两个都留空时，只由上面的开关控制。</p>
        </div>

        <div class="gc-section">
          <h2>文案</h2>
          <label class="gc-field">
            <span>小标（英文/日期）</span>
            <input v-model="draft.eyebrow" type="text" placeholder="HALLOWEEN · 10.31" />
          </label>
          <label class="gc-field">
            <span>主标题</span>
            <input v-model="draft.title" type="text" placeholder="万圣节，来方块街有惊喜" />
          </label>
          <p class="gc-hint">主标题有逗号时在逗号后断行，字数多会自动缩字号。</p>
          <label class="gc-field">
            <span>副标题</span>
            <input v-model="draft.subtitle" type="text" placeholder="万圣夜限定 · 糖果盒已备好" />
          </label>
          <label class="gc-field">
            <span>底部提示</span>
            <input v-model="draft.hint_text" type="text" placeholder="或上滑进入方块街" />
          </label>
        </div>

        <div class="gc-section">
          <h2>按钮</h2>
          <label class="gc-field">
            <span>按钮文字</span>
            <input v-model="draft.cta_text" type="text" placeholder="看看有什么惊喜（留空 = 不放按钮）" />
          </label>
          <label class="gc-field">
            <span>点击后</span>
            <select v-model="draft.cta_target_type">
              <option v-for="option in GATE_CTA_TYPES" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <template v-if="draft.cta_target_type === 'lottery'">
            <label class="gc-field">
              <span>绑定抽奖</span>
              <select v-model="draft.cta_lottery_id">
                <option value="">（暂不指定 · 落到抽奖列表页）</option>
                <option v-for="item in lotteries" :key="item.id" :value="item.id">
                  {{ item.title }} · {{ lotteryStatusText(item) }}
                </option>
              </select>
            </label>
            <p class="gc-hint">
              抽奖还没建就先留空 —— 按钮会落到 <code>/lotteries</code>，等抽奖建好再回来选。
            </p>
          </template>

          <label v-if="draft.cta_target_type === 'route'" class="gc-field">
            <span>站内路径</span>
            <input v-model="draft.cta_route" type="text" placeholder="/newsroom?tab=activities" />
          </label>
        </div>

        <div class="gc-section">
          <h2>主题</h2>
          <label class="gc-field">
            <span>外观</span>
            <select v-model="draft.theme">
              <option v-for="option in GATE_THEMES" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="gc-hint">选「默认开屏」等价于停用（用于确认换回来之后长什么样）。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import GateSceneHero from '@/views/Home/components/GateSceneHero.vue';
import {
  GATE_CTA_TYPES,
  GATE_THEMES,
  fetchGateConfig,
  isGateConfigActive,
  listLotteryOptions,
  normalizeGateConfig,
  resolveGateCtaTarget,
  saveGateConfig,
} from '@/utils/api/gate-config-api.js';

/* 表还没建 / 首次进入时的表单初值。
   刻意给成「一套能直接用的万圣夜配置」而不是空表单：管理台一打开就该看见
   预览长什么样，而不是一片空白 + 一个禁用的保存按钮。 */
const DEFAULTS = {
  enabled: true,
  theme: 'halloween',
  eyebrow: 'HALLOWEEN · 10.31',
  title: '万圣节，来方块街有惊喜',
  subtitle: '万圣夜限定 · 糖果盒已备好',
  hint_text: '或上滑进入方块街',
  cta_text: '看看有什么惊喜',
  cta_target_type: 'lottery',
  cta_lottery_id: '',
  cta_route: '',
  starts_at_local: '',
  ends_at_local: '',
};

const draft = reactive({ ...DEFAULTS });
const lotteries = ref([]);
const loading = ref(false);
const saving = ref(false);
const busy = computed(() => loading.value || saving.value);
const notice = ref(null);

/* datetime-local 与 ISO 互转：本地时区进、ISO 出（DB 是 timestamptz） */
const pad = (value) => String(value).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const applyConfig = (config) => {
  const source = config || DEFAULTS;
  Object.assign(draft, {
    ...DEFAULTS,
    ...normalizeGateConfig(source),
    cta_lottery_id: source.cta_lottery_id || '',
    cta_route: source.cta_route || '',
    starts_at_local: toLocalInput(source.starts_at),
    ends_at_local: toLocalInput(source.ends_at),
  });
};

const load = async () => {
  loading.value = true;
  notice.value = null;
  try {
    const [configResult, lotteryResult] = await Promise.all([
      fetchGateConfig(),
      listLotteryOptions(),
    ]);
    if (configResult.error) {
      const message = String(configResult.error.message || '');
      notice.value = {
        type: 'bad',
        text: /does not exist|relation|schema cache|Could not find the table/i.test(message)
          ? '表 home_gate_config 还不存在 —— 先执行迁移 2026103101_home_gate_config.sql 再回来。'
          : `读取失败：${message}`,
      };
    } else {
      applyConfig(configResult.data);
    }
    lotteries.value = lotteryResult.data || [];
  } finally {
    loading.value = false;
  }
};

const canSave = computed(() => String(draft.title || '').trim().length > 0);

const validation = computed(() => {
  const problems = [];
  if (!String(draft.title || '').trim()) problems.push('主标题不能为空');
  if (draft.cta_target_type === 'lottery' && !String(draft.cta_text || '').trim()) {
    problems.push('选了「跳转抽奖」但按钮文字为空 —— 按钮不会渲染');
  }
  if (draft.cta_target_type === 'route') {
    const path = String(draft.cta_route || '').trim();
    if (!path.startsWith('/') || path.startsWith('//')) problems.push('站内路径必须以单个 / 开头');
  }
  const start = fromLocalInput(draft.starts_at_local);
  const end = fromLocalInput(draft.ends_at_local);
  if (start && end && new Date(start) >= new Date(end)) problems.push('结束时间必须晚于开始时间');
  return problems;
});

const save = async () => {
  if (validation.value.length) {
    notice.value = { type: 'bad', text: validation.value.join('；') };
    return;
  }
  saving.value = true;
  notice.value = null;
  try {
    const { data, error } = await saveGateConfig({
      ...draft,
      starts_at: fromLocalInput(draft.starts_at_local),
      ends_at: fromLocalInput(draft.ends_at_local),
    });
    if (error) {
      notice.value = { type: 'bad', text: `保存失败：${error.message || error}` };
      return;
    }
    applyConfig(data);
    notice.value = { type: 'ok', text: `已保存 · ${statusText.value}` };
  } finally {
    saving.value = false;
  }
};

const statusText = computed(() => {
  const config = normalizeGateConfig({
    ...draft,
    starts_at: fromLocalInput(draft.starts_at_local),
    ends_at: fromLocalInput(draft.ends_at_local),
  });
  if (config.theme === 'default') return '预览：默认开屏';
  if (!config.enabled) return '未启用 · 线上走默认开屏';
  const now = Date.now();
  if (config.starts_at && now < new Date(config.starts_at).getTime()) {
    return `未开始 · ${new Date(config.starts_at).toLocaleString('zh-CN')} 起生效`;
  }
  if (config.ends_at && now >= new Date(config.ends_at).getTime()) {
    return `已过期 · ${new Date(config.ends_at).toLocaleString('zh-CN')} 结束`;
  }
  return isGateConfigActive(config) ? '生效中' : '未生效';
});

const lotteryStatusText = (item) => {
  if (!item.draw_at) return item.status === 'open' ? '进行中' : item.status;
  return `开奖 ${new Date(item.draw_at).toLocaleDateString('zh-CN')}`;
};

const ctaTarget = computed(() =>
  resolveGateCtaTarget(
    normalizeGateConfig({
      ...draft,
      starts_at: fromLocalInput(draft.starts_at_local),
      ends_at: fromLocalInput(draft.ends_at_local),
    }),
  ),
);

const onPreviewCta = () => {
  notice.value = {
    type: 'info',
    text: ctaTarget.value
      ? `线上会跳到 ${ctaTarget.value.to}`
      : '按钮文字为空时不会渲染按钮',
  };
};

/* ---------- 预览的跟手进度（与线上同一套公式，只是不进路由） ---------- */
const phoneRef = ref(null);
const progress = ref(0);
let dragging = false;
let startY = 0;
let rafId = 0;
let idleTimer = 0;

const setProgress = (value) => {
  progress.value = Math.max(0, Math.min(1, value));
};

const tween = (to, duration) => {
  cancelAnimationFrame(rafId);
  const from = progress.value;
  const startedAt = performance.now();
  const ease = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
  const step = (now) => {
    const t = Math.min(1, (now - startedAt) / duration);
    setProgress(from + (to - from) * ease(t));
    if (t < 1) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
};

const replay = () => {
  cancelAnimationFrame(rafId);
  setProgress(0);
};

const onPointerDown = (event) => {
  if (progress.value >= 0.999) return;
  dragging = true;
  startY = event.clientY;
};

const onPointerMove = (event) => {
  if (!dragging) return;
  const height = phoneRef.value?.clientHeight || 538;
  setProgress((startY - event.clientY) / (height * 1.2));
};

const endDrag = () => {
  if (!dragging) return;
  dragging = false;
  if (progress.value >= 0.08) tween(1, 900);
  else tween(0, 420);
};

const onWheel = (event) => {
  if (progress.value >= 0.999) return;
  const height = phoneRef.value?.clientHeight || 538;
  setProgress(progress.value + event.deltaY / (height * 1.2));
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (progress.value >= 0.08) tween(1, 900);
    else tween(0, 420);
  }, 160);
};

onMounted(load);

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.clearTimeout(idleTimer);
});
</script>

<style scoped>
.gc {
  min-height: 100vh;
  background: #f6f4f1;
  color: #17130e;
  padding: 24px clamp(16px, 3vw, 40px) 48px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
}

.gc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.gc-head h1 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.gc-head p {
  margin: 0;
  max-width: 620px;
  font-size: 12px;
  line-height: 1.7;
  color: #7c756c;
}

.gc-actions {
  display: flex;
  gap: 8px;
}

.btn {
  height: 34px;
  padding: 0 16px;
  border-radius: 9px;
  border: 0.5px solid rgba(0, 0, 0, 0.16);
  background: #fff;
  color: #17130e;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: #1a0d22;
  border-color: #1a0d22;
  color: #fff1dc;
}

.btn.sm {
  height: 28px;
  padding: 0 12px;
}

.gc-notice {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.6;
}

.gc-notice.ok {
  background: #e8f3e6;
  color: #2f5a2a;
}

.gc-notice.bad {
  background: #fbe9e7;
  color: #8c2f22;
}

.gc-notice.info {
  background: #eef1f7;
  color: #33415c;
}

.gc-body {
  display: grid;
  grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .gc-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.gc-preview {
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 14px;
}

.gc-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 600;
}

.gc-preview-head .muted {
  font-weight: 400;
  color: #8a8378;
}

.gc-phone {
  position: relative;
  width: 100%;
  aspect-ratio: 378 / 636;
  border-radius: 18px;
  overflow: hidden;
  background: #f4f2ee;
  border: 0.5px solid rgba(0, 0, 0, 0.12);
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.gc-phone:active {
  cursor: grabbing;
}

.gc-desk {
  position: absolute;
  inset: 0;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gc-desk .bar {
  height: 30px;
  border-radius: 15px;
  background: #fff;
  border: 0.5px solid #e6e2db;
}

.gc-desk .bar.short {
  height: 9px;
  width: 46%;
  border-radius: 5px;
  border: 0;
  background: #e6e2db;
  margin: 4px 0;
}

.gc-desk .card {
  height: 72px;
  border-radius: 12px;
  background: #fff;
  border: 0.5px solid #ebe7e0;
}

.gc-gate {
  position: absolute;
  inset: 0;
  transform: translateY(calc(var(--gate-p) * -42%)) scale(calc(1 - var(--gate-p) * 0.1));
  border-radius: calc(var(--gate-p) * 32px);
  opacity: clamp(0, calc((1 - var(--gate-p)) * 5), 1);
  overflow: hidden;
}

.gc-fallback {
  position: absolute;
  inset: 0;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.gc-fallback img {
  height: 140px;
  width: auto;
  image-rendering: pixelated;
}

.gc-fallback p {
  position: absolute;
  left: 22px;
  top: 46px;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.gc-preview-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  font-size: 11px;
}

.gc-preview-foot .muted {
  color: #8a8378;
}

.gc-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gc-section {
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  padding: 16px 18px 18px;
}

.gc-section h2 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
}

.gc-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.gc-section-head h2 {
  margin: 0;
}

.gc-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
}

.gc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.gc-field > span {
  font-size: 11px;
  color: #7c756c;
}

.gc-field input,
.gc-field select {
  height: 36px;
  padding: 0 11px;
  border-radius: 9px;
  border: 0.5px solid rgba(0, 0, 0, 0.16);
  background: #fdfcfa;
  font-family: inherit;
  font-size: 13px;
  color: #17130e;
}

.gc-field input:focus,
.gc-field select:focus {
  outline: 2px solid rgba(26, 13, 34, 0.18);
  outline-offset: 1px;
}

.gc-grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.gc-hint {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.7;
  color: #8a8378;
}

.gc-hint code {
  background: #f1eee9;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11px;
}
</style>
