<template>
  <!-- 版本（2026-11-10 由独立路由页 /user-space/settings/version 收进设置三级页）
       原来是一整页：自带整屏底色 + 背景光斑 + 页头（BetaPreviewMain.vue），
       从设置点进来等于离开设置壳；横屏下左侧目录消失，返回还得另走一条路由。
       现在只留内容：横屏右栏 / 竖屏整页，返回交给设置壳的返回条。
       独立路由仍然保留（历史直链与外部跳转），两处共用同一份版本号来源。 -->
  <div class="version-panel">
    <section class="gs-group">
      <div class="gs-rows">
        <div class="gs-row is-static">
          <span class="gs-icon is-blue">
            <Sparkles :size="16" :stroke-width="2" aria-hidden="true" />
          </span>
          <span class="gs-text">
            <span class="gs-label">已使用 BOH Beta 7.0.1</span>
            <span class="gs-desc">构建版本 {{ buildVersion }}</span>
          </span>
          <span class="vp-live" aria-hidden="true"><i></i>正在使用</span>
        </div>
      </div>
    </section>

    <section class="gs-group">
      <div class="gs-card vp-card">
        <div class="vp-card-head">
          <span class="vp-card-badge">
            <Sparkles :size="18" :stroke-width="1.9" aria-hidden="true" />
          </span>
          <span class="vp-card-title">
            <strong>BOH Beta 7.0.1</strong>
            <span class="vp-pill">默认版本</span>
          </span>
        </div>

        <p class="vp-desc">
          这一版把界面与发布流程整体焕新：导航、积分、发帖与图片浏览都换成了新的统一体验。
        </p>

        <ul class="vp-features">
          <li v-for="feature in FEATURES" :key="feature.text">
            <span class="vp-feature-icon">
              <component :is="feature.icon" :size="15" :stroke-width="1.9" aria-hidden="true" />
            </span>
            {{ feature.text }}
          </li>
        </ul>
      </div>
    </section>

    <p class="vp-note">当前构建 {{ buildVersion }}。版本信息仅展示，历史版本切换已下线。</p>
  </div>
</template>

<script setup>
/**
 * 版本内联面板：只读。版本号仍取 <meta name="boh-version">（与 BetaPreviewMain 同源），
 * 这里不另存一份常量，避免构建后两处对不上。
 */
import { computed } from 'vue';
import { Images, PanelBottomClose, PanelTopOpen, Send, Sparkles } from 'lucide-vue-next';

const buildVersion = computed(
  () => document.querySelector('meta[name="boh-version"]')?.getAttribute('content') || 'unknown',
);

const FEATURES = [
  { icon: PanelTopOpen, text: '常驻悬浮导航岛，滚动不再收纳' },
  { icon: PanelBottomClose, text: '方块积分与自定义卡面（含小猫卡面）' },
  { icon: Send, text: '选图即后台预处理：压缩、检测、上传一步到位' },
  { icon: Images, text: '多图帖横向滚动浏览与全量大图查看' },
];
</script>

<style scoped>
@import '../styles/settings-glass.css';

.version-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: vp-in 240ms var(--ease-out, ease-out) both;
}

@keyframes vp-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.vp-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  font-size: 12px;
  font-weight: 600;
}

.vp-live i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.vp-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 20px;
}

.vp-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vp-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 12px;
  background: linear-gradient(160deg, #e8efff, #f5f8ff);
  color: #2563eb;
}

.vp-card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: var(--boh-text-primary, #1d1d1f);
}

.vp-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
  font-size: 11px;
  font-weight: 600;
}

.vp-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--boh-text-secondary, #515154);
}

.vp-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vp-features li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--boh-text-primary, #1d1d1f);
}

.vp-feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  margin-top: 1px;
  border-radius: 8px;
  background: var(--boh-fill-secondary, rgba(0, 0, 0, 0.04));
  color: #2563eb;
}

.vp-note {
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--boh-text-tertiary, #86868b);
}

@media (max-width: 767px) {
  /* 竖屏：设置壳的卡片是通栏的，这行说明没有卡片包着，得自己留出左右内边距，
     否则会贴到屏幕边上（横屏有右栏内边距，保持 2px 与卡片左缘对齐）。 */
  .vp-note {
    padding: 0 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .version-panel {
    animation: none;
  }
}
</style>
