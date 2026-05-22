<template>
  <div class="style-editor-page" :class="{ 'dark-mode': isDarkMode }">
    <!-- Navigation Bar -->
    <nav class="editor-nav">
      <div class="nav-brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-name">样式工作室</span>
          <span class="brand-tag">Alert Design</span>
        </div>
      </div>

      <div class="nav-center">
        <div class="material-switcher">
          <button v-for="mat in materials" :key="mat.id" class="material-btn"
            :class="{ active: currentMaterial === mat.id }" @click="switchMaterial(mat.id)">
            <span class="material-icon">{{ mat.icon }}</span>
            <span class="material-name">{{ mat.name }}</span>
          </button>
        </div>
      </div>

      <div class="nav-actions">
        <button class="nav-icon-btn" @click="toggleDarkMode" :title="isDarkMode ? '切换亮色模式' : '切换暗色模式'">
          <span v-if="isDarkMode">☀️</span>
          <span v-else>🌙</span>
        </button>
        <button class="nav-icon-btn" @click="toggleFullscreen" title="全屏预览">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
        <button class="nav-primary-btn" @click="copyCSS">
          <span>复制 CSS</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </nav>

    <div class="editor-body">
      <!-- Sidebar: Controls -->
      <aside class="editor-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
        </div>

        <div class="sidebar-content" v-show="!sidebarCollapsed">
          <!-- Section: Material Settings -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">✨</span>
              材质效果
            </h2>

            <div class="control-group" v-if="currentMaterial === 'frosted'">
              <label>模糊强度 (Blur)</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.frostedBlur" min="0" max="40" step="1">
                <span class="value-display">{{ styles.frostedBlur }}px</span>
              </div>
            </div>

            <div class="control-group" v-if="currentMaterial === 'frosted'">
              <label>饱和度 (Saturation)</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.frostedSaturation" min="50" max="200" step="5">
                <span class="value-display">{{ styles.frostedSaturation }}%</span>
              </div>
            </div>

            <div class="control-group">
              <label>背景透明度</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.bgOpacity" min="0" max="1" step="0.05">
                <span class="value-display">{{ Math.round(styles.bgOpacity * 100) }}%</span>
              </div>
            </div>
          </div>

          <!-- Section: Layout -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">📐</span>
              布局与形状
            </h2>

            <div class="control-group">
              <label>圆角半径</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.radius" min="0" max="50" step="1">
                <span class="value-display">{{ styles.radius }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label>内边距</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.padding" min="16" max="64" step="4">
                <span class="value-display">{{ styles.padding }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label>最大宽度</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.maxWidth" min="280" max="500" step="10">
                <span class="value-display">{{ styles.maxWidth }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label>边框宽度</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.borderWidth" min="0" max="4" step="0.5">
                <span class="value-display">{{ styles.borderWidth }}px</span>
              </div>
            </div>
          </div>

          <!-- Section: Effects -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">🎨</span>
              视觉效果
            </h2>

            <div class="control-group">
              <label>遮罩模糊</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.overlayBlur" min="0" max="20" step="1">
                <span class="value-display">{{ styles.overlayBlur }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label>遮罩透明度</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.overlayOpacity" min="0" max="1" step="0.05">
                <span class="value-display">{{ Math.round(styles.overlayOpacity * 100) }}%</span>
              </div>
            </div>

            <div class="control-group">
              <label>投影预设</label>
              <div class="preset-grid">
                <button v-for="preset in shadowPresets" :key="preset.id" class="preset-btn"
                  :class="{ active: styles.shadowPreset === preset.id }" @click="styles.shadowPreset = preset.id"
                  :title="preset.name">
                  <div class="preset-preview" :style="{ boxShadow: preset.style }"></div>
                  <span>{{ preset.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Section: Typography -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">📝</span>
              排版
            </h2>

            <div class="control-group">
              <label>标题大小</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.titleSize" min="14" max="32" step="1">
                <span class="value-display">{{ styles.titleSize }}px</span>
              </div>
            </div>

            <div class="control-group">
              <label>标题字重</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.titleWeight" min="400" max="900" step="100">
                <span class="value-display">{{ styles.titleWeight }}</span>
              </div>
            </div>

            <div class="control-group">
              <label>内容大小</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.messageSize" min="12" max="20" step="1">
                <span class="value-display">{{ styles.messageSize }}px</span>
              </div>
            </div>
          </div>

          <!-- Section: Colors -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">🎨</span>
              主题颜色
            </h2>

            <div class="color-grid">
              <div class="color-item">
                <input type="color" v-model="styles.modalBg">
                <span>背景</span>
              </div>
              <div class="color-item">
                <input type="color" v-model="styles.titleColor">
                <span>标题</span>
              </div>
              <div class="color-item">
                <input type="color" v-model="styles.messageColor">
                <span>内容</span>
              </div>
              <div class="color-item">
                <input type="color" v-model="styles.btnBg">
                <span>按钮</span>
              </div>
              <div class="color-item">
                <input type="color" v-model="styles.btnColor">
                <span>按钮文字</span>
              </div>
              <div class="color-item">
                <input type="color" v-model="styles.borderColor">
                <span>边框</span>
              </div>
            </div>
          </div>

          <!-- Section: Animation -->
          <div class="control-section">
            <h2 class="section-title">
              <span class="section-icon">🎬</span>
              动画效果
            </h2>

            <div class="control-group">
              <label>入场动画</label>
              <select v-model="styles.animationType" class="select-input">
                <option value="scale">缩放 (Scale)</option>
                <option value="slide-up">上滑 (Slide Up)</option>
                <option value="slide-down">下滑 (Slide Down)</option>
                <option value="fade">淡入 (Fade)</option>
                <option value="bounce">弹跳 (Bounce)</option>
              </select>
            </div>

            <div class="control-group">
              <label>动画时长</label>
              <div class="range-wrapper">
                <input type="range" v-model="styles.animationDuration" min="100" max="1000" step="50">
                <span class="value-display">{{ styles.animationDuration }}ms</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar-footer" v-show="!sidebarCollapsed">
          <button class="reset-btn" @click="resetStyles">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            重置默认
          </button>
        </div>
      </aside>

      <!-- Main: Preview -->
      <main class="editor-main" :class="{ fullscreen: isFullscreen }">
        <div class="preview-container" :class="currentMaterial">
          <!-- Background Pattern -->
          <div class="preview-bg">
            <div class="gradient-orb orb-1"></div>
            <div class="gradient-orb orb-2"></div>
            <div class="gradient-orb orb-3"></div>
            <div class="grid-pattern"></div>
          </div>

          <div class="preview-content">
            <div class="preview-header">
              <h1>弹窗预览</h1>
              <p>点击下方按钮触发不同类型的弹窗，实时预览样式效果</p>
            </div>

            <div class="preview-actions">
              <button class="trigger-btn success" @click="showModal('success')">
                <span class="icon">✅</span>
                <div class="btn-content">
                  <span class="btn-title">成功</span>
                  <span class="btn-desc">Success Alert</span>
                </div>
              </button>

              <button class="trigger-btn error" @click="showModal('error')">
                <span class="icon">❌</span>
                <div class="btn-content">
                  <span class="btn-title">错误</span>
                  <span class="btn-desc">Error Alert</span>
                </div>
              </button>

              <button class="trigger-btn warning" @click="showModal('warning')">
                <span class="icon">⚠️</span>
                <div class="btn-content">
                  <span class="btn-title">警告</span>
                  <span class="btn-desc">Warning Alert</span>
                </div>
              </button>

              <button class="trigger-btn info" @click="showModal('info')">
                <span class="icon">ℹ️</span>
                <div class="btn-content">
                  <span class="btn-title">信息</span>
                  <span class="btn-desc">Info Alert</span>
                </div>
              </button>
            </div>

            <!-- Live Code Preview -->
            <div class="css-output">
              <div class="output-header">
                <h3>生成的 CSS</h3>
                <button class="copy-code-btn" @click="copyCSS">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  复制
                </button>
              </div>
              <pre><code>{{ generatedCSS }}</code></pre>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- The Modal Component -->
    <CommonAlertModal v-model:visible="modal.visible" :type="modal.type" :title="modal.title" :message="modal.message"
      :material="currentMaterial" :styles="modalStyles" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';

// --- Materials ---
const materials = [
  { id: 'standard', name: '标准', icon: '⬜' },
  { id: 'frosted', name: '毛玻璃', icon: '🔮' }
];

const currentMaterial = ref('frosted');
const isDarkMode = ref(false);
const isFullscreen = ref(false);
const sidebarCollapsed = ref(false);

// --- State ---
const modal = reactive({
  visible: false,
  type: 'success',
  title: '',
  message: ''
});

const defaultStyles = {
  // Material
  frostedBlur: 20,
  frostedSaturation: 140,
  bgOpacity: 0.85,
  // Layout
  radius: 24,
  padding: 32,
  maxWidth: 360,
  borderWidth: 0,
  // Effects
  overlayBlur: 8,
  overlayOpacity: 0.5,
  shadowPreset: 'soft',
  // Typography
  titleSize: 20,
  titleWeight: 700,
  messageSize: 15,
  // Colors
  modalBg: '#ffffff',
  titleColor: '#1d1d1f',
  messageColor: '#86868b',
  btnBg: '#1d1d1f',
  btnColor: '#ffffff',
  borderColor: '#e5e5ea',
  // Animation
  animationType: 'scale',
  animationDuration: 300
};

const styles = reactive({ ...defaultStyles });

const shadowPresets = [
  { id: 'none', name: '无', style: 'none' },
  { id: 'soft', name: '柔和', style: '0 20px 40px -10px rgba(0, 0, 0, 0.2)' },
  { id: 'hard', name: '硬朗', style: '4px 4px 0px rgba(0,0,0,1)' },
  { id: 'glow', name: '发光', style: '0 0 30px rgba(66, 153, 225, 0.5)' },
  { id: 'float', name: '悬浮', style: '0 30px 60px -12px rgba(50, 50, 93, 0.25), 0 18px 36px -18px rgba(0, 0, 0, 0.3)' },
  { id: 'neon', name: '霓虹', style: '0 0 20px rgba(255, 0, 255, 0.5), 0 0 40px rgba(0, 255, 255, 0.3)' }
];

// --- Logic ---
const switchMaterial = (matId) => {
  currentMaterial.value = matId;
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    styles.modalBg = '#1c1c1e';
    styles.titleColor = '#ffffff';
    styles.messageColor = '#8e8e93';
    styles.btnBg = '#0a84ff';
    styles.borderColor = '#38383a';
  } else {
    styles.modalBg = '#ffffff';
    styles.titleColor = '#1d1d1f';
    styles.messageColor = '#86868b';
    styles.btnBg = '#1d1d1f';
    styles.borderColor = '#e5e5ea';
  }
};

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

const showModal = (type) => {
  modal.type = type;
  modal.visible = true;

  switch (type) {
    case 'success':
      modal.title = '操作成功';
      modal.message = '您的更改已成功保存到数据库，所有更新将立即生效。';
      break;
    case 'error':
      modal.title = '连接失败';
      modal.message = '无法连接到服务器，请检查您的网络连接后重试。';
      break;
    case 'warning':
      modal.title = '存储空间不足';
      modal.message = '您的存储空间即将耗尽，请清理一些文件以释放空间。';
      break;
    case 'info':
      modal.title = '可用更新';
      modal.message = '新版本的应用程序已准备好安装，点击确定开始更新。';
      break;
  }
};

const resetStyles = () => {
  Object.assign(styles, defaultStyles);
  isDarkMode.value = false;
};

const getShadow = (preset) => {
  const found = shadowPresets.find(p => p.id === preset);
  return found ? found.style : shadowPresets[1].style;
};

const modalStyles = computed(() => ({
  ...styles,
  shadow: getShadow(styles.shadowPreset)
}));

const generatedCSS = computed(() => {
  return `:root {
  /* Material Effects */
  --alert-material: ${currentMaterial.value};
  --alert-bg-opacity: ${styles.bgOpacity};
  ${currentMaterial.value === 'frosted' ? `
  --alert-frosted-blur: ${styles.frostedBlur}px;
  --alert-frosted-saturation: ${styles.frostedSaturation}%;` : ''}
  
  /* Layout */
  --alert-radius: ${styles.radius}px;
  --alert-padding: ${styles.padding}px;
  --alert-max-width: ${styles.maxWidth}px;
  --alert-border-width: ${styles.borderWidth}px;
  
  /* Effects */
  --alert-overlay-blur: ${styles.overlayBlur}px;
  --alert-overlay-bg: rgba(0, 0, 0, ${styles.overlayOpacity});
  --alert-shadow: ${getShadow(styles.shadowPreset)};
  
  /* Typography */
  --alert-title-size: ${styles.titleSize}px;
  --alert-title-weight: ${styles.titleWeight};
  --alert-message-size: ${styles.messageSize}px;
  
  /* Colors */
  --alert-modal-bg: ${styles.modalBg};
  --alert-title-color: ${styles.titleColor};
  --alert-message-color: ${styles.messageColor};
  --alert-btn-bg: ${styles.btnBg};
  --alert-btn-color: ${styles.btnColor};
  --alert-border-color: ${styles.borderColor};
  
  /* Animation */
  --alert-animation: ${styles.animationType};
  --alert-animation-duration: ${styles.animationDuration}ms;
}`.trim();
});

const copyCSS = () => {
  navigator.clipboard.writeText(generatedCSS.value);
  // Show toast notification
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = 'CSS 已复制到剪贴板！';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
};

// Watch for style changes to apply to document
watch(() => ({ ...styles, material: currentMaterial.value }), () => {
  const root = document.documentElement;
  root.style.setProperty('--alert-material', currentMaterial.value);
  root.style.setProperty('--alert-bg-opacity', styles.bgOpacity);
  root.style.setProperty('--alert-radius', `${styles.radius}px`);
  root.style.setProperty('--alert-padding', `${styles.padding}px`);
  root.style.setProperty('--alert-max-width', `${styles.maxWidth}px`);
  root.style.setProperty('--alert-border-width', `${styles.borderWidth}px`);
  root.style.setProperty('--alert-overlay-blur', `${styles.overlayBlur}px`);
  root.style.setProperty('--alert-overlay-bg', `rgba(0, 0, 0, ${styles.overlayOpacity})`);
  root.style.setProperty('--alert-shadow', getShadow(styles.shadowPreset));
  root.style.setProperty('--alert-title-size', `${styles.titleSize}px`);
  root.style.setProperty('--alert-title-weight', styles.titleWeight);
  root.style.setProperty('--alert-message-size', `${styles.messageSize}px`);
  root.style.setProperty('--alert-modal-bg', styles.modalBg);
  root.style.setProperty('--alert-title-color', styles.titleColor);
  root.style.setProperty('--alert-message-color', styles.messageColor);
  root.style.setProperty('--alert-btn-bg', styles.btnBg);
  root.style.setProperty('--alert-btn-color', styles.btnColor);
  root.style.setProperty('--alert-border-color', styles.borderColor);
  root.style.setProperty('--alert-animation-duration', `${styles.animationDuration}ms`);
}, { deep: true });

onMounted(() => {
  const root = document.documentElement;
  root.style.setProperty('--alert-material', currentMaterial.value);
});

onUnmounted(() => {
  const root = document.documentElement;
  const vars = [
    '--alert-material', '--alert-bg-opacity', '--alert-radius', '--alert-padding',
    '--alert-max-width', '--alert-border-width', '--alert-overlay-blur',
    '--alert-overlay-bg', '--alert-shadow', '--alert-title-size', '--alert-title-weight',
    '--alert-message-size', '--alert-modal-bg', '--alert-title-color',
    '--alert-message-color', '--alert-btn-bg', '--alert-btn-color',
    '--alert-border-color', '--alert-animation-duration'
  ];
  vars.forEach(v => root.style.removeProperty(v));
});
</script>

<style scoped src="./style.scoped.css"></style>
