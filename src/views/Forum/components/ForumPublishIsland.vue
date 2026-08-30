<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Check, AlertTriangle, Upload } from 'lucide-vue-next';

const props = defineProps({
  items: { type: Array, default: () => [] }
});
const emit = defineEmits(['retry','cancel','fix']);

const activeItem = computed(() => {
  if (!props.items.length) return null;
  return props.items.find(i => ['queued','uploading','publishing'].includes(i.state))
      || props.items.find(i => i.state==='failed')
      || props.items[0]
});

const isModeration = computed(()=> activeItem.value?.state==='failed' && activeItem.value?.failType==='moderation');
const isNetwork = computed(()=> activeItem.value?.state==='failed' && activeItem.value?.failType!=='moderation');
const isSuccess = computed(()=> activeItem.value?.state==='success');
const isSending = computed(()=> activeItem.value && ['queued','uploading','publishing'].includes(activeItem.value.state));

const title = computed(()=>{
  if (!activeItem.value) return '';
  if (isModeration.value) return '审核未通过';
  if (isNetwork.value) return '发送失败';
  if (isSuccess.value) return '发帖成功';
  return '正在发送';
});
const message = computed(()=>{
  if (!activeItem.value) return '';
  if (isModeration.value) return `第${(activeItem.value.failedImageIndex||0)+1}张图片需处理`;
  if (isNetwork.value) return '网络异常';
  if (isSuccess.value) return '已发布';
  const p = Math.round(activeItem.value.progress||0);
  return `${p}%`;
});
const progress = computed(()=> Math.round(activeItem.value?.progress||0));
const CIRC = 81.68; // 2*pi*13
const dashOffset = computed(()=> CIRC - CIRC*progress.value/100);
const strokeColor = computed(()=>{
  if (isModeration.value) return '#f59e0b';
  if (isNetwork.value) return '#ff3b30';
  if (isSuccess.value) return '#00b578';
  return '#1677ff';
});
const thumbImages = computed(()=>{
  const raw = activeItem.value?.images || [];
  return raw.map(i=> String(i.localPreviewUrl || i.url || '').trim()).filter(Boolean).slice(0,3);
});
const hasThumb = computed(()=> thumbImages.value.length>0);

// 让灵动岛与顶部导航栏“连在一起”：复用 UnifiedNavbar 的 has-status-card 展开机制，横竖屏自适应
const hasSurface = ref(false);
const checkSurface = () => { hasSurface.value = typeof document !== 'undefined' && !!document.querySelector('.unified-nav-surface'); };
let surfaceObserver = null;
const syncSurface = (visible) => {
  if (typeof document === 'undefined') return;
  const surface = document.querySelector('.unified-nav-surface');
  if (!surface) return;
  if (visible) {
    // 带图 44px 缩略图+20px padding=64，需撑高；纯文 34px 图标只需 58
    const needTall = hasThumb.value;
    surface.style.setProperty('--global-nav-status-card-height', needTall ? '64px' : '58px');
    surface.classList.add('has-publish-card');
    surface.classList.add('has-status-card');
  } else {
    surface.classList.remove('has-publish-card');
    surface.style.removeProperty('--global-nav-status-card-height');
    const hasOther = !!document.querySelector('.global-nav-status-card');
    if (!hasOther) surface.classList.remove('has-status-card');
  }
};
watch(activeItem, (val)=> syncSurface(!!val), { immediate: true });
watch(hasSurface, (val)=> syncSurface(!!activeItem.value && val));
watch(hasThumb, ()=> syncSurface(!!activeItem.value));
onMounted(()=> {
  checkSurface();
  syncSurface(!!activeItem.value);
  window.addEventListener('resize', checkSurface);
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
    surfaceObserver = new MutationObserver(() => {
      const next = !!document.querySelector('.unified-nav-surface');
      if (next !== hasSurface.value) hasSurface.value = next;
    });
    surfaceObserver.observe(document.body, { childList: true, subtree: true });
  }
});
onUnmounted(()=> {
  window.removeEventListener('resize', checkSurface);
  surfaceObserver?.disconnect();
  surfaceObserver = null;
  syncSurface(false);
});
</script>

<template>
  <!-- 主形态：Teleport 到导航的 surface 内，与消息岛完全同长同位，保留导航栏向下延伸 -->
  <Teleport to=".unified-nav-surface" :disabled="!hasSurface">
    <Transition name="global-nav-status">
      <div v-if="activeItem && hasSurface" class="publish-island-card" :class="{ 'is-moderation': isModeration, 'is-network': isNetwork, 'is-success': isSuccess }">
        <!-- 纯文简化：普通图标+文字；带图才显示 Airdrop 堆叠 -->
        <div v-if="hasThumb" class="thumb-stack" :class="{ single: thumbImages.length===1 }">
          <div v-for="(url, idx) in thumbImages" :key="url+idx" class="thumb"><img :src="url" alt="" loading="eager" /></div>
        </div>
        <span v-else class="status-icon" :class="isModeration ? 'tone-warning' : isNetwork ? 'tone-failed' : isSuccess ? 'tone-success' : 'tone-uploading'">
          <Check v-if="isSuccess" :size="16" :stroke-width="2.3"/>
          <AlertTriangle v-else-if="isModeration || isNetwork" :size="16" :stroke-width="2"/>
          <Upload v-else :size="16" :stroke-width="2"/>
        </span>
        <span class="status-copy">
          <strong>{{ title }}</strong>
          <span>{{ message }}</span>
        </span>
        <!-- 进度环：发送中显示，失败时显示操作按钮 — 加大避免数字压边 -->
        <div v-if="isSending || isSuccess" class="island-ring">
          <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="13" stroke="rgba(0,0,0,.08)" stroke-width="3.6" fill="none"/><circle :stroke="strokeColor" cx="22" cy="22" r="13" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-dasharray="81.68" :stroke-dashoffset="dashOffset" style="transition: stroke-dashoffset .35s cubic-bezier(.16,1,.3,1)"/></svg>
          <span class="pct">{{ progress }}%</span>
        </div>
        <span v-else class="island-actions">
          <button v-if="isModeration" class="island-btn fix" @click="emit('fix', activeItem.id)">移除该图</button>
          <button v-if="isNetwork" class="island-btn retry" @click="emit('retry', activeItem.id)">重试</button>
          <button class="island-btn ghost" @click="emit('cancel', activeItem.id)">{{ isModeration ? '取消' : '取消' }}</button>
        </span>
      </div>
    </Transition>
  </Teleport>
  <!-- Fallback：不在主导航时（如嵌入/无 surface），悬浮于视口顶部居中 -->
  <Teleport to="body">
    <Transition name="publish-island-fallback">
      <div v-if="activeItem && !hasSurface" class="publish-island-fallback">
        <div class="publish-island-card is-fallback" :class="{ 'is-moderation': isModeration, 'is-network': isNetwork }">
          <div v-if="hasThumb" class="thumb-stack" :class="{ single: thumbImages.length===1 }">
            <div v-for="(url, idx) in thumbImages" :key="url+idx" class="thumb"><img :src="url" alt="" loading="eager" /></div>
          </div>
          <span v-else class="status-icon" :class="isModeration ? 'tone-warning' : isNetwork ? 'tone-failed' : isSuccess ? 'tone-success' : 'tone-uploading'">
            <Check v-if="isSuccess" :size="16" :stroke-width="2.3"/>
            <AlertTriangle v-else-if="isModeration || isNetwork" :size="16" :stroke-width="2"/>
            <Upload v-else :size="16" :stroke-width="2"/>
          </span>
          <span class="status-copy"><strong>{{ title }}</strong><span>{{ message }}</span></span>
          <div v-if="isSending || isSuccess" class="island-ring"><svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="13" stroke="rgba(0,0,0,.08)" stroke-width="3.6" fill="none"/><circle :stroke="strokeColor" cx="22" cy="22" r="13" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-dasharray="81.68" :stroke-dashoffset="dashOffset"/></svg><span class="pct">{{ progress }}%</span></div>
          <span v-else class="island-actions"><button v-if="isModeration" class="island-btn fix" @click="emit('fix', activeItem.id)">移除该图</button><button v-if="isNetwork" class="island-btn retry" @click="emit('retry', activeItem.id)">重试</button><button class="island-btn ghost" @click="emit('cancel', activeItem.id)">取消</button></span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 与消息通知岛完全一致：置于 surface 内，top/left/right 7px，与导航连为一体，横竖屏自适应 */
.publish-island-card{
  position:absolute;
  z-index:1;
  top: var(--global-nav-status-top, 79px);
  left:7px; right:7px;
  display:flex; align-items:center; gap:11px;
  min-height: var(--global-nav-status-card-height, 58px);
  padding:10px 13px;
  border:1px solid rgba(255,255,255,.26);
  border-radius:22px;
  color:#1e2938;
  background: rgba(255,255,255,.96);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 8px 24px rgba(0,0,0,.06);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  clip-path: inset(0 round 22px);
  will-change: transform, opacity;
}
.publish-island-card.is-fallback{ position:fixed; top:88px; left:50%; transform:translateX(-50%); width:min(380px, calc(100vw - 24px)); border:1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.96); box-shadow: 0 12px 32px rgba(0,0,0,.12); }
.publish-island-fallback{ position:fixed; top:88px; left:50%; transform:translateX(-50%); z-index: 9999; width:min(380px, calc(100vw - 24px)); }
/* 让 surface 的 has-publish-card 与 has-status-card 同等处理，连体圆角与高度 */
:global(.unified-nav-surface.has-publish-card){
  height: var(--global-nav-open-height) !important;
  border-radius: 30px !important;
}
:global(.unified-nav-surface.has-publish-card) > .nav-container{
  position:relative; z-index:2; height: var(--global-nav-rest-height);
}
@media (orientation: portrait) and (max-width: 768px){
  .publish-island-card{ top: var(--global-nav-status-top, 67px); min-height: var(--global-nav-status-card-height, 54px); }
  .publish-island-card.is-fallback, .publish-island-fallback{ top:76px; width:min(360px, calc(100vw - 16px)); }
}
@media (max-width: 768px){
  .publish-island-card.is-fallback, .publish-island-fallback{ top: 76px; width: min(360px, calc(100vw - 16px)); }
}
.status-icon{ display:inline-grid; place-items:center; width:34px; height:34px; border-radius:50%; flex:0 0 auto; }
.tone-uploading{ color:#1677ff; background:#e8f0ff }
.tone-success{ color:#057857; background:#d8f4e9 }
.tone-warning{ color:#b45309; background:#fff7ed }
.tone-failed{ color:#b91c1c; background:#ffe8e6 }
.thumb-stack{ position:relative; width:44px; height:44px; flex-shrink:0 }
.thumb-stack .thumb{ position:absolute; width:36px; height:36px; border-radius:10px; overflow:hidden; border:2px solid #fff; box-shadow:0 4px 12px rgba(0,0,0,.12); background:#f5f5f7 }
.thumb-stack .thumb img{ width:100%; height:100%; object-fit:cover; display:block }
.thumb-stack .thumb:nth-child(1){ left:0; top:0; transform:rotate(-4deg); z-index:1 }
.thumb-stack .thumb:nth-child(2){ left:8px; top:4px; transform:rotate(5deg); z-index:2 }
.thumb-stack .thumb:nth-child(3){ left:4px; top:8px; transform:rotate(0deg); z-index:3; width:38px; height:38px; border-radius:11px }
.thumb-stack.single .thumb{ left:0; top:0; width:44px; height:44px; transform:none; border-radius:12px }
.thumb-stack.text-only{ width:36px; height:36px; border-radius:50%; display:grid; place-items:center; background:linear-gradient(135deg,#a5b4fc,#f0abfc); color:#fff; font-weight:800; font-size:13px; flex-shrink:0 }
.status-copy{ display:grid; flex:1; min-width:0; gap:2px; text-align:left }
.status-copy strong{ color:#1d2938; font-size:13px; font-weight:760; line-height:1.25 }
.status-copy span{ overflow:hidden; color:#617084; font-size:12px; line-height:1.4; text-overflow:ellipsis; white-space:nowrap }
.island-ring{ position:relative; width:44px; height:44px; flex-shrink:0 }
.island-ring svg{ transform:rotate(-90deg) }
.island-ring .pct{ position:absolute; inset:0; display:grid; place-items:center; font-size:11px; font-weight:800; color:#1d2938 }
.island-actions{ display:flex; gap:6px; flex-shrink:0 }
.island-btn{ border:none; border-radius:999px; padding:6px 10px; font-size:11px; font-weight:800; cursor:pointer; transition:.18s }
.island-btn.fix{ background:#b45309; color:#fff }
.island-btn.retry{ background:#1d1d1f; color:#fff }
.island-btn.ghost{ background:#f5f5f7; color:#1d1d1f; border:1px solid rgba(0,0,0,.06) }
.island-btn:active{ transform:scale(.97) }
.global-nav-status-enter-active,.global-nav-status-leave-active{ transition: clip-path 420ms cubic-bezier(.16,1,.3,1), transform 420ms cubic-bezier(.16,1,.3,1), opacity 280ms ease, filter 300ms ease }
.global-nav-status-enter-from,.global-nav-status-leave-to{ opacity:0; filter:blur(2px); clip-path: inset(0 0 100% 0 round 22px); transform: translateY(-10px) }
.publish-island-fallback-enter-active,.publish-island-fallback-leave-active{ transition: transform 420ms cubic-bezier(.16,1,.3,1), opacity 280ms ease }
.publish-island-fallback-enter-from,.publish-island-fallback-leave-to{ opacity:0; transform:translate(-50%, -10px) }

@media (prefers-reduced-motion: reduce){
  .publish-island-card,
  .publish-island-fallback{ transition: opacity 160ms ease; }
  .publish-island-card .island-ring svg circle:last-child{ transition: none !important; }
}
</style>
