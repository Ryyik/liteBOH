<template>
  <main class="motion-lab" :class="{ 'is-reduced-motion': reducedMotion }">
    <header class="lab-header">
      <div>
        <p class="eyebrow">Development / Motion</p>
        <h1>Motion Lab</h1>
      </div>
      <div class="header-actions">
        <button class="icon-button" type="button" title="重播状态岛" aria-label="重播状态岛" @click="replay">
          <RotateCcw :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
        <button class="icon-button" type="button" title="连播状态队列" aria-label="连播状态队列" :disabled="sequenceRunning" @click="playSequence">
          <ListRestart :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
    </header>

    <section class="lab-shell" aria-label="状态岛动画实验台">
      <aside class="control-panel">
        <section class="control-section">
          <div class="section-heading">
            <BellRing :size="16" aria-hidden="true" />
            <h2>状态</h2>
          </div>
          <div class="tone-grid" role="group" aria-label="状态类型">
            <button v-for="item in tones" :key="item.id" type="button" class="tone-option"
              :class="[{ active: tone === item.id }, `tone-${item.id}`]" @click="tone = item.id">
              <component :is="item.icon" :size="16" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </button>
          </div>
          <label class="field-label" for="motion-copy">文案</label>
          <textarea id="motion-copy" v-model="message" class="copy-input" rows="3" maxlength="56"></textarea>
          <div class="inline-switch">
            <span>扩展状态</span>
            <button type="button" class="switch" :class="{ on: longCopy }" role="switch" :aria-checked="longCopy" @click="longCopy = !longCopy">
              <span></span>
            </button>
          </div>
        </section>

        <section class="control-section">
          <div class="section-heading">
            <SlidersHorizontal :size="16" aria-hidden="true" />
            <h2>动效</h2>
          </div>
          <label class="range-label" for="motion-duration"><span>时长</span><output>{{ duration }} ms</output></label>
          <input id="motion-duration" v-model.number="duration" type="range" min="240" max="1200" step="20">
          <label class="range-label" for="motion-distance"><span>位移</span><output>{{ distance }} px</output></label>
          <input id="motion-distance" v-model.number="distance" type="range" min="0" max="48" step="2">
          <label class="range-label" for="motion-blur"><span>模糊</span><output>{{ blur }} px</output></label>
          <input id="motion-blur" v-model.number="blur" type="range" min="0" max="32" step="1">
        </section>

        <section class="control-section control-section-last">
          <div class="inline-switch">
            <span>减弱动态效果</span>
            <button type="button" class="switch" :class="{ on: reducedMotion }" role="switch" :aria-checked="reducedMotion" @click="reducedMotion = !reducedMotion">
              <span></span>
            </button>
          </div>
        </section>
      </aside>

      <section class="preview-panel" aria-label="状态岛预览">
        <div class="preview-toolbar">
          <div class="segmented-control viewports" role="group" aria-label="预览设备">
            <button v-for="item in viewports" :key="item.id" type="button" :class="{ active: viewport === item.id }" @click="viewport = item.id">
              <component :is="item.icon" :size="15" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </button>
          </div>
          <button class="visibility-button" type="button" :class="{ active: visible }" @click="visible = !visible">
            <Eye v-if="visible" :size="16" aria-hidden="true" />
            <EyeOff v-else :size="16" aria-hidden="true" />
            <span>{{ visible ? '隐藏' : '显示' }}</span>
          </button>
        </div>

        <div class="viewport-stage" :class="`viewport-${viewport}`">
          <div class="device-screen">
            <div class="mock-content">
              <span class="mock-kicker">TODAY</span>
              <div class="mock-heading"></div>
              <div class="mock-heading short"></div>
              <div class="mock-story-grid">
                <article v-for="index in 4" :key="index" class="mock-story">
                  <div class="mock-story-image"></div>
                  <div class="mock-line"></div>
                  <div class="mock-line short"></div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  BellRing,
  Bot,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Laptop,
  ListRestart,
  MessageCircle,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Tablet,
} from 'lucide-vue-next';

const tone = ref('success');
const viewport = ref('mobile');
const message = ref('已保存为自定义卡面预设');
const longCopy = ref(false);
const visible = ref(true);
const duration = ref(620);
const distance = ref(22);
const blur = ref(20);
const reducedMotion = ref(false);
const islandKey = ref(0);
const sequenceRunning = ref(false);
let disposed = false;

const tones = [
  { id: 'success', label: '完成', title: '已完成', icon: Check },
  { id: 'message', label: '消息', title: '收到新消息', icon: MessageCircle },
  { id: 'warning', label: '提醒', title: '需要留意', icon: CircleAlert },
  { id: 'ai', label: 'AI', title: 'AI 已就绪', icon: Bot }
];

const viewports = [
  { id: 'desktop', label: '桌面', icon: Laptop },
  { id: 'tablet', label: '平板', icon: Tablet },
  { id: 'mobile', label: '手机', icon: Smartphone }
];

const activeTone = computed(() => tones.find((item) => item.id === tone.value) || tones[0]);
const emitPreviewState = () => {
  window.dispatchEvent(new CustomEvent('boh_global_nav_status_preview', {
    detail: {
      visible: visible.value,
      title: activeTone.value.title,
      message: message.value,
      icon: tone.value,
      isLong: longCopy.value,
      duration: duration.value,
      distance: distance.value,
      blur: blur.value,
      reducedMotion: reducedMotion.value
    }
  }));
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const replay = async () => {
  visible.value = false;
  await nextTick();
  if (disposed) return;
  islandKey.value += 1;
  requestAnimationFrame(() => {
    if (!disposed) visible.value = true;
  });
};

const playSequence = async () => {
  if (sequenceRunning.value) return;
  sequenceRunning.value = true;
  const originalTone = tone.value;
  const originalMessage = message.value;
  for (const item of tones) {
    if (disposed) break;
    tone.value = item.id;
    message.value = item.id === 'message' ? '晓宁回复了你的帖子' : `${item.title}，状态岛队列正在演示`;
    await replay();
    await wait(1200);
  }
  if (!disposed) {
    tone.value = originalTone;
    message.value = originalMessage;
    sequenceRunning.value = false;
  }
};

onBeforeUnmount(() => {
  disposed = true;
  window.dispatchEvent(new CustomEvent('boh_global_nav_status_preview', { detail: { visible: false } }));
});

watch([tone, message, longCopy, visible, duration, distance, blur, reducedMotion], emitPreviewState);
onMounted(emitPreviewState);
</script>

<style scoped>
.motion-lab {
  --ink: #18212e;
  --muted: #687588;
  --line: #d9e1ea;
  --canvas: #edf2f7;
  --panel: rgba(255, 255, 255, 0.82);
  min-height: 100dvh;
  padding: 28px;
  color: var(--ink);
  background: #eef2f5;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.lab-header,
.lab-shell {
  width: min(100%, 1280px);
  margin: 0 auto;
}

.lab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #58708a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

h1,
h2,
p { margin: 0; }

h1 {
  font-size: 26px;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1.1;
}

.header-actions { display: flex; gap: 8px; }

.icon-button,
.visibility-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: #314055;
  background: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  transition: transform 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.icon-button:active,
.visibility-button:active { transform: scale(0.96); }
.icon-button:disabled { cursor: wait; opacity: 0.55; }

.lab-shell {
  display: grid;
  grid-template-columns: 284px minmax(0, 1fr);
  min-height: 680px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 18px 44px rgba(29, 48, 73, 0.1);
}

.control-panel {
  display: flex;
  flex-direction: column;
  padding: 18px;
  border-right: 1px solid var(--line);
  background: rgba(248, 250, 252, 0.84);
}

.control-section { padding: 0 0 19px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
.control-section-last { margin-bottom: 0; border-bottom: 0; }
.section-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 13px; color: #40536a; }
.section-heading h2 { font-size: 13px; font-weight: 720; letter-spacing: 0; }

.segmented-control {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
  padding: 3px;
  border: 1px solid #d8e0e8;
  border-radius: 7px;
  background: #e9eef3;
}

.segmented-control button,
.tone-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: 5px;
  color: #607084;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  transition: transform 140ms ease, color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}

.segmented-control button.active {
  color: #1b2839;
  background: #fff;
  box-shadow: 0 1px 3px rgba(30, 46, 67, 0.14);
}

.tone-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tone-option { justify-content: flex-start; border: 1px solid #dce4eb; background: #fff; }
.tone-option.active { color: #172235; border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; }
.tone-option.tone-success { color: #047857; }
.tone-option.tone-message { color: #2563eb; }
.tone-option.tone-warning { color: #c2410c; }
.tone-option.tone-ai { color: #7c3aed; }

.field-label,
.range-label { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 7px; color: #536378; font-size: 12px; font-weight: 650; }
.range-label { margin-top: 13px; }
.range-label output { color: #33455c; font-variant-numeric: tabular-nums; }
.copy-input { width: 100%; resize: vertical; min-height: 64px; padding: 8px 9px; border: 1px solid #d6dfe8; border-radius: 6px; outline: 0; color: #243247; background: #fff; font: 13px/1.4 inherit; }
.copy-input:focus { border-color: #4b93d1; box-shadow: 0 0 0 3px rgba(75, 147, 209, 0.14); }
input[type="range"] { width: 100%; accent-color: #2874b6; }

.inline-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 13px; color: #536378; font-size: 12px; font-weight: 650; }
.switch { position: relative; width: 36px; height: 22px; padding: 0; border: 0; border-radius: 999px; background: #b8c3d0; cursor: pointer; transition: background-color 180ms ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(32, 44, 61, 0.24); transition: transform 180ms ease; }
.switch.on { background: #1674be; }
.switch.on span { transform: translateX(14px); }

.preview-panel { display: flex; flex-direction: column; min-width: 0; background: #f7f9fb; }
.preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 65px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.viewports { width: min(100%, 276px); }
.visibility-button { gap: 6px; padding: 0 10px; font-size: 12px; font-weight: 700; }
.visibility-button.active { color: #0b6650; border-color: #a7d8cc; background: #f0fbf7; }

.viewport-stage { display: grid; flex: 1; place-items: center; min-height: 580px; padding: 30px; background: var(--canvas); }
.device-screen { position: relative; display: flex; flex-direction: column; width: min(100%, 404px); aspect-ratio: 9 / 16; overflow: hidden; border: 8px solid #1d2734; border-radius: 30px; background: #f8fafc; box-shadow: 0 22px 46px rgba(33, 50, 72, 0.2); }
.viewport-tablet .device-screen { width: min(100%, 590px); aspect-ratio: 4 / 3; border-radius: 24px; }
.viewport-desktop .device-screen { width: min(100%, 840px); aspect-ratio: 16 / 10; border-radius: 15px; }

.mock-content { flex: 1; padding: 78px 18px 24px; }
.mock-kicker { color: #5d7895; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; }
.mock-heading { width: 68%; height: 14px; margin-top: 9px; border-radius: 3px; background: #b8c7d5; }
.mock-heading.short { width: 42%; height: 10px; margin-top: 7px; background: #d6e0e8; }
.mock-story-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 22px; }
.mock-story { padding: 8px; border: 1px solid #e0e7ee; border-radius: 7px; background: #fff; }
.mock-story-image { height: 58px; border-radius: 4px; background: #a7c5bd; }
.mock-story:nth-child(2) .mock-story-image { background: #b7c5df; }
.mock-story:nth-child(3) .mock-story-image { background: #d9c2a4; }
.mock-story:nth-child(4) .mock-story-image { background: #d1b9c8; }
.mock-line { width: 85%; height: 7px; margin-top: 8px; border-radius: 2px; background: #c7d3de; }
.mock-line.short { width: 54%; height: 5px; margin-top: 5px; background: #e1e8ee; }

@media (max-width: 760px) {
  .motion-lab { padding: 16px; }
  .lab-shell { grid-template-columns: 1fr; }
  .control-panel { border-right: 0; border-bottom: 1px solid var(--line); }
  .control-section { display: grid; grid-template-columns: minmax(0, 1fr); }
  .viewport-stage { min-height: 510px; padding: 20px; }
  .viewport-desktop .device-screen { width: 100%; }
}

@media (max-width: 430px) {
  .motion-lab { padding: 12px; }
  .lab-header { margin-bottom: 12px; }
  .preview-toolbar { align-items: flex-start; flex-direction: column; }
  .viewports { width: 100%; }
  .visibility-button { width: 100%; }
  .viewport-stage { min-height: 480px; padding: 16px; }
  .device-screen { width: min(100%, 340px); }
}
</style>
