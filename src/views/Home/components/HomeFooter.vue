<template>
  <footer ref="footerRef" class="home-footer" aria-label="网站页脚">
    <div class="home-footer-inner">
      <!-- 第零层：历史回顾（归档的英雄区） -->
      <HomeArchiveSection :archived-count="totalArchivedCount" />

      <!-- 第一层：免责声明 -->
      <div class="home-footer-disclaimer">
        <p v-for="(line, i) in footerDisclaimer" :key="i">{{ line }}</p>
      </div>

      <!-- 第二层：5 列导航 -->
      <nav class="home-footer-columns" aria-label="页脚导航">
        <div v-for="col in footerColumns" :key="col.h" class="home-footer-col">
          <h5>{{ col.h }}</h5>
          <ul>
            <li v-for="item in col.items" :key="item.label">
              <router-link v-if="item.to" :to="item.to" class="home-footer-link">{{ item.label }}</router-link>
              <a v-else-if="item.href" :href="item.href" class="home-footer-link">{{ item.label }}</a>
              <button v-else-if="item.agreement" type="button" class="home-footer-link home-footer-link-btn" @click="openAgreement(item.agreement)">{{ item.label }}</button>
            </li>
          </ul>
        </div>
      </nav>

      <!-- 第三层：版权底部 -->
      <div class="home-footer-bottom">
        <span class="home-footer-copyright">{{ footerCopyright }}</span>
        <div class="home-footer-bottom-links">
          <span v-for="link in footerBottomLinks" :key="link.label" class="home-footer-bottom-link-wrap">
            <router-link v-if="link.to" :to="link.to" class="home-footer-link">{{ link.label }}</router-link>
            <button v-else-if="link.agreement" type="button" class="home-footer-link home-footer-link-btn" @click="openAgreement(link.agreement)">{{ link.label }}</button>
          </span>
        </div>
        <span class="home-footer-locale">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          <span>中文</span>
        </span>
      </div>
    </div>

    <!-- 协议弹窗 — 复用注册流程的 AgreementModal -->
    <AgreementModal
      v-model:visible="showAgreementModal"
      :title="agreementTitle"
    >
      <div v-html="safeAgreementContent"></div>
    </AgreementModal>
  </footer>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import DOMPurify from '@/utils/dompurify.js';
import AgreementModal from '@/components/AgreementModal.vue';
import { userAgreementContent, privacyPolicyContent } from '@/data/agreementData.js';
import HomeArchiveSection from './HomeArchiveSection.vue';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import {
  footerDisclaimer,
  footerColumns,
  footerBottomLinks,
  footerCopyright,
} from './homeFooterData.js';

// 协议弹窗状态
const showAgreementModal = ref(false);
const agreementType = ref('user'); // 'user' 或 'privacy'

const agreementTitle = computed(() => {
  return agreementType.value === 'user' ? '方块之家用户服务协议' : '方块之家隐私政策';
});

const safeAgreementContent = computed(() => {
  const rawContent = agreementType.value === 'user' ? userAgreementContent : privacyPolicyContent;
  // 安全约束：v-html 内容必须经 DOMPurify 消毒
  return DOMPurify.sanitize(rawContent);
});

// 打开协议弹窗
const openAgreement = (type) => {
  agreementType.value = type;
  showAgreementModal.value = true;
};

// 动态归档英雄区：统一从数据库读取（含 builtin 与数据驱动两类）
const homeHeroesStore = useHomeHeroesStore();
const totalArchivedCount = computed(() => homeHeroesStore.archivedHeroes.length);
const footerRef = ref(null);
let archiveObserver = null;
let hasStartedArchiveLoad = false;

const loadArchivedHeroes = () => {
  if (hasStartedArchiveLoad) return;
  hasStartedArchiveLoad = true;
  // 归档数据仅用于页脚计数，不能与首屏英雄区争抢首次数据库请求。
  void homeHeroesStore.fetchArchived();
};

onMounted(() => {
  if (!('IntersectionObserver' in window) || !footerRef.value) {
    loadArchivedHeroes();
    return;
  }

  archiveObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    loadArchivedHeroes();
    archiveObserver?.disconnect();
    archiveObserver = null;
  }, { rootMargin: '800px 0px' });
  archiveObserver.observe(footerRef.value);
});

onBeforeUnmount(() => {
  archiveObserver?.disconnect();
  archiveObserver = null;
});
</script>

<style scoped>
/* ============ Container ============ */
.home-footer {
  background: var(--muted, #f5f5f7);
  color: var(--text-500, #6e6e73);
  font-size: 12px;
  line-height: 1.33;
  letter-spacing: -0.01em;
  padding: 18px 22px 22px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin-top: 40px;
}

.home-footer-inner {
  max-width: 1024px;
  margin: 0 auto;
}

/* ============ 第一层：免责声明 ============ */
.home-footer-disclaimer {
  padding: 18px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--background-900, #1d1d1f) 10%, transparent);
}

.home-footer-disclaimer p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.33;
}

.home-footer-disclaimer p:last-child {
  margin: 0;
}

/* ============ 第二层：5 列导航 ============ */
.home-footer-columns {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 24px;
  padding: 30px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--background-900, #1d1d1f) 10%, transparent);
}

.home-footer-col h5 {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--foreground, #1d1d1f);
  letter-spacing: -0.01em;
}

.home-footer-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-footer-link {
  color: var(--text-500, #6e6e73);
  font-size: 12px;
  line-height: 1.33;
  text-decoration: none;
  transition: color 0.2s var(--ease-out, ease);
}

.home-footer-link:hover {
  text-decoration: underline;
  color: var(--foreground, #1d1d1f);
}

/* 协议按钮：外观与链接一致，重置 button 默认样式 */
.home-footer-link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-align: left;
  display: inline;
}

/* ============ 第三层：版权底部 ============ */
.home-footer-bottom {
  padding: 18px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  justify-content: space-between;
}

.home-footer-copyright {
  color: var(--text-500, #6e6e73);
}

.home-footer-bottom-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
}

.home-footer-bottom-link-wrap {
  position: relative;
  padding-right: 16px;
}

/* Apple 标志性 1px 竖线分隔符 */
.home-footer-bottom-link-wrap:not(:last-child)::after {
  content: "";
  position: absolute;
  right: 0;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: color-mix(in srgb, var(--background-900, #1d1d1f) 18%, transparent);
}

.home-footer-locale {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-500, #6e6e73);
}

.home-footer-locale svg {
  flex-shrink: 0;
}

/* ============ 响应式 — 4 档断点 ============ */

/* 平板横屏 / 小桌面：5 列 → 3 列（前 3 列一行，后 2 列一行） */
@media (max-width: 832px) {
  .home-footer-columns {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
}

/* 平板竖屏：3 列 → 2 列 */
@media (max-width: 600px) {
  .home-footer {
    padding: 18px 18px 20px;
  }
  .home-footer-columns {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    padding: 24px 0;
  }
  .home-footer-disclaimer {
    padding: 14px 0;
  }
  .home-footer-disclaimer p {
    font-size: 11px;
    line-height: 1.4;
  }
}

/* 手机竖屏：2 列保持，但版权底部竖排 */
@media (max-width: 480px) {
  .home-footer {
    padding: 18px 16px 20px;
    font-size: 12px;
  }
  .home-footer-columns {
    grid-template-columns: repeat(2, 1fr);
    gap: 18px 16px;
    padding: 20px 0;
  }
  .home-footer-col h5 {
    font-size: 12px;
    margin-bottom: 6px;
  }
  .home-footer-col ul {
    gap: 6px;
  }
  .home-footer-link {
    font-size: 12px;
  }
  .home-footer-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 0 0;
  }
  .home-footer-bottom-links {
    gap: 0 12px;
  }
  .home-footer-bottom-link-wrap {
    padding-right: 12px;
  }
}

/* 超窄屏（< 360px）：列表完全单列 */
@media (max-width: 360px) {
  .home-footer-columns {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}

/* ============ 深色模式 ============ */
:global([data-theme="dark"]) .home-footer {
  background: var(--background-900, #1d1d1f);
  color: var(--text-500, #98989d);
}

:global([data-theme="dark"]) .home-footer-disclaimer,
:global([data-theme="dark"]) .home-footer-columns {
  border-bottom-color: color-mix(in srgb, var(--background-50, #f5f5f7) 10%, transparent);
}

:global([data-theme="dark"]) .home-footer-link {
  color: var(--text-500, #98989d);
}

:global([data-theme="dark"]) .home-footer-link:hover {
  color: var(--background-50, #f5f5f7);
}

:global([data-theme="dark"]) .home-footer-col h5 {
  color: var(--background-50, #f5f5f7);
}

:global([data-theme="dark"]) .home-footer-copyright {
  color: var(--text-500, #98989d);
}

:global([data-theme="dark"]) .home-footer-locale {
  color: var(--text-500, #98989d);
}

:global([data-theme="dark"]) .home-footer-bottom-link-wrap:not(:last-child)::after {
  background: color-mix(in srgb, var(--background-50, #f5f5f7) 18%, transparent);
}
</style>
