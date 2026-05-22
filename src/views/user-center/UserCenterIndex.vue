<template>
  <div class="user-center-index-page">
    <UnifiedNavbar />

    <div class="index-container">
      <header class="index-header">
        <h1 class="index-title">我的方块导航</h1>
        <p class="index-subtitle">整理所有个人中心相关的页面入口</p>
      </header>

      <section class="index-section">
        <h2 class="section-title">
          <Home class="section-icon" :size="22" :stroke-width="1.8" aria-hidden="true" />
          主要个人中心
        </h2>
        <div class="card-grid">
          <router-link to="/user-space" class="nav-card primary-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">我的方块</h3>
              <p class="card-desc">管理头像、生日、加群时间等个人资料</p>
              <span class="card-route">/user-space</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link :to="profileRoute" class="nav-card primary-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">我的空间</h3>
              <p class="card-desc">个人主页，展示帖子、回复、印象</p>
              <span class="card-route">/profile/:username</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>
        </div>
      </section>

      <section class="index-section">
        <h2 class="section-title">
          <Package class="section-icon" :size="22" :stroke-width="1.8" aria-hidden="true" />
          功能模块
        </h2>
        <div class="card-grid">
          <router-link to="/user-space/messages" class="nav-card">
            <div class="card-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">消息中心</h3>
              <p class="card-desc">系统通知与消息管理</p>
              <span class="card-route">/user-space/messages</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/global-pages-index" class="nav-card">
            <div class="card-icon cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16"></path>
                <path d="M4 12h16"></path>
                <path d="M4 18h16"></path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">全局页面跳转</h3>
              <p class="card-desc">查看全站 Vue 页面并一键跳转</p>
              <span class="card-route">/global-pages-index</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/gifts" class="nav-card">
            <div class="card-icon green">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">礼物</h3>
              <p class="card-desc">收货地址与礼物管理</p>
              <span class="card-route">/user-space/gifts</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/subscriptions" class="nav-card">
            <div class="card-icon yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">订阅与积分</h3>
              <p class="card-desc">查看积分与订阅状态</p>
              <span class="card-route">/user-space/subscriptions</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/partners" class="nav-card">
            <div class="card-icon purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">社区里的伙伴</h3>
              <p class="card-desc">查看社区成员列表</p>
              <span class="card-route">/user-space/partners</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/tags-impressions" class="nav-card">
            <div class="card-icon pink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">标签与印象</h3>
              <p class="card-desc">管理个人标签</p>
              <span class="card-route">/user-space/tags-impressions</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/shared-memories" class="nav-card">
            <div class="card-icon teal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"></path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">公共记忆管理</h3>
              <p class="card-desc">手动归档/删除 AI 公共记忆</p>
              <span class="card-route">/user-space/shared-memories</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>

          <router-link to="/user-space/messages?tab=mail" class="nav-card">
            <div class="card-icon indigo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">信箱</h3>
              <p class="card-desc">收发私信（已整合到消息中心）</p>
              <span class="card-route">/user-space/messages?tab=mail</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>
        </div>
      </section>

      <section v-if="isAdmin" class="index-section">
        <h2 class="section-title">
          <Settings class="section-icon" :size="22" :stroke-width="1.8" aria-hidden="true" />
          管理员功能
        </h2>
        <div class="card-grid">
          <router-link to="/admin/data-management" class="nav-card admin-card">
            <div class="card-icon gray">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path
                  d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z">
                </path>
              </svg>
            </div>
            <div class="card-content">
              <h3 class="card-title">数据管理</h3>
              <p class="card-desc">管理员数据管理面板</p>
              <span class="card-route">/admin/data-management</span>
            </div>
            <span class="card-arrow">→</span>
          </router-link>
        </div>
      </section>

      <section class="index-section">
        <h2 class="section-title">
          <ClipboardList class="section-icon" :size="22" :stroke-width="1.8" aria-hidden="true" />
          页面汇总表
        </h2>
        <div class="summary-table">
          <table>
            <thead>
              <tr>
                <th>页面名称</th>
                <th>路由路径</th>
                <th>文件位置</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>我的方块</td>
                <td><code>/user-space</code></td>
                <td>views/user-center/UserSpace/index.vue</td>
              </tr>
              <tr>
                <td>消息中心</td>
                <td><code>/user-space/messages</code></td>
                <td>views/user-center/Messages/index.vue</td>
              </tr>
              <tr>
                <td>礼物</td>
                <td><code>/user-space/gifts</code></td>
                <td>views/user-center/Address/index.vue</td>
              </tr>
              <tr>
                <td>订阅与积分</td>
                <td><code>/user-space/subscriptions</code></td>
                <td>订阅与积分主入口，旧 /user-center/points 兼容跳转</td>
              </tr>
              <tr>
                <td>社区伙伴</td>
                <td><code>/user-space/partners</code></td>
                <td>views/user-center/Partners.vue</td>
              </tr>
              <tr>
                <td>标签与印象</td>
                <td><code>/user-space/tags-impressions</code></td>
                <td>views/user-center/TagsImpressions.vue</td>
              </tr>
              <tr>
                <td>公共记忆管理</td>
                <td><code>/user-space/shared-memories</code></td>
                <td>views/user-center/SharedMemoryManagement.vue</td>
              </tr>
              <tr>
                <td>我的空间</td>
                <td><code>/profile/:username</code></td>
                <td>views/Profile/index.vue</td>
              </tr>
              <tr>
                <td>信箱</td>
                <td><code>/user-space/messages?tab=mail</code></td>
                <td>已整合到消息中心</td>
              </tr>
              <tr>
                <td>数据管理</td>
                <td><code>/admin/data-management</code></td>
                <td>views/DataManagement/index.vue</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { ClipboardList, Home, Package, Settings } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import UnifiedNavbar from '@/components/UnifiedNavbar/index.vue';

const authStore = useAuthStore();
const { userInfo, isAdmin } = storeToRefs(authStore);

const username = computed(() => userInfo.value.username || localStorage.getItem('username') || '');
const profileRoute = computed(() => {
  const safeUsername = String(username.value || '').trim();
  if (!safeUsername) {
    return '/user-space/profile';
  }
  return `/profile/${encodeURIComponent(safeUsername)}`;
});
</script>

<style scoped>
.user-center-index-page {
  min-height: 100vh;
  background-color: #f8f9fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.index-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 100px 24px 60px;
}

.index-header {
  text-align: center;
  margin-bottom: 48px;
}

.index-title {
  font-size: 32px;
  font-weight: 800;
  color: #1d1d1f;
  margin: 0 0 12px;
  letter-spacing: -0.02em;
}

.index-subtitle {
  font-size: 16px;
  color: #86868b;
  margin: 0;
}

.index-section {
  margin-bottom: 48px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  stroke: currentColor;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.nav-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  text-decoration: none;
  color: inherit;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 16px;
}

.nav-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.08);
}

.nav-card:hover .card-arrow {
  opacity: 1;
  transform: translateX(0);
}

.primary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.primary-card .card-title {
  color: #fff;
}

.primary-card .card-desc,
.primary-card .card-route {
  color: rgba(255, 255, 255, 0.8);
}

.primary-card .card-icon {
  background: rgba(255, 255, 255, 0.2);
}

.primary-card .card-icon svg {
  stroke: #fff;
}

.admin-card {
  background: linear-gradient(135deg, #1d1d1f 0%, #3d3d3f 100%);
  color: #fff;
}

.admin-card .card-title {
  color: #fff;
}

.admin-card .card-desc,
.admin-card .card-route {
  color: rgba(255, 255, 255, 0.8);
}

.admin-card .card-icon {
  background: rgba(255, 255, 255, 0.2);
}

.admin-card .card-icon svg {
  stroke: #fff;
}

.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon svg {
  width: 24px;
  height: 24px;
  stroke: #1d1d1f;
}

.card-icon.blue {
  background: #EBF5FF;
}

.card-icon.blue svg {
  stroke: #007AFF;
}

.card-icon.green {
  background: #E8F9EE;
}

.card-icon.green svg {
  stroke: #34C759;
}

.card-icon.yellow {
  background: #FFFBE6;
}

.card-icon.yellow svg {
  stroke: #FFCC00;
}

.card-icon.purple {
  background: #F7EFFF;
}

.card-icon.purple svg {
  stroke: #AF52DE;
}

.card-icon.pink {
  background: #FFF0F3;
}

.card-icon.pink svg {
  stroke: #FF2D55;
}

.card-icon.indigo {
  background: #EEEDFF;
}

.card-icon.indigo svg {
  stroke: #5856D6;
}

.card-icon.gray {
  background: #f5f5f7;
}

.card-icon.gray svg {
  stroke: #8E8E93;
}

.card-icon.cyan {
  background: #E6F7FF;
}

.card-icon.cyan svg {
  stroke: #0E7490;
}

.card-icon.teal {
  background: #e6fbf7;
}

.card-icon.teal svg {
  stroke: #0f766e;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: #1d1d1f;
  margin: 0 0 4px;
}

.card-desc {
  font-size: 13px;
  color: #86868b;
  margin: 0 0 6px;
  line-height: 1.4;
}

.card-route {
  font-size: 11px;
  color: #86868b;
  font-family: 'SF Mono', Monaco, monospace;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
}

.card-arrow {
  font-size: 20px;
  color: #c7c7cc;
  opacity: 0;
  transform: translateX(-8px);
  transition: all 0.3s ease;
}

.primary-card .card-arrow,
.admin-card .card-arrow {
  color: rgba(255, 255, 255, 0.6);
}

.summary-table {
  background: #ffffff;
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  overflow: hidden;
}

.summary-table table {
  width: 100%;
  border-collapse: collapse;
}

.summary-table th,
.summary-table td {
  padding: 14px 20px;
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.summary-table th {
  background: #f5f5f7;
  font-size: 13px;
  font-weight: 600;
  color: #86868b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-table td {
  font-size: 14px;
  color: #1d1d1f;
}

.summary-table tr:last-child td {
  border-bottom: none;
}

.summary-table code {
  background: #f5f5f7;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  color: #667eea;
}

@media (max-width: 768px) {
  .index-container {
    padding: 80px 16px 40px;
  }

  .index-title {
    font-size: 26px;
  }

  .card-grid {
    grid-template-columns: 1fr;
  }

  .summary-table {
    overflow-x: auto;
  }

  .summary-table table {
    min-width: 500px;
  }
}
</style>
