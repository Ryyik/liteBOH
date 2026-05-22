<template>
  <div class="data-management-page">
    <UnifiedNavbar />

    <div class="admin-shell">
      <aside class="admin-sidebar" :class="{ open: isAdminSidebarOpen }">
        <div class="sidebar-brand">
          <div class="brand-mark">B</div>
          <div>
            <div class="brand-title">BOH Admin</div>
            <div class="brand-subtitle">Website Console</div>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="网站管理导航">
          <button
            v-for="item in adminNavigation"
            :key="item.id"
            class="sidebar-link"
            :class="{ active: item.active }"
            type="button"
            @click="handleAdminNavClick(item)"
          >
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="sidebar-badge">{{ item.badge }}</span>
          </button>
        </nav>

        <div class="sidebar-status">
          <div class="status-dot"></div>
          <div>
            <div class="status-label">Production</div>
            <div class="status-value">所有服务在线</div>
          </div>
        </div>
      </aside>

      <div v-if="isAdminSidebarOpen" class="sidebar-scrim" @click="isAdminSidebarOpen = false"></div>

      <main class="admin-main">
        <!-- 顶部导航栏 -->
        <header class="dm-header">
          <div class="header-content">
            <div class="header-left">
              <button class="sidebar-toggle" type="button" @click="isAdminSidebarOpen = !isAdminSidebarOpen" aria-label="切换管理导航">
                <PanelLeft :size="19" />
              </button>
              <button class="back-btn" @click="goBack" aria-label="返回首页" title="返回首页">
                <ArrowLeft :size="19" />
              </button>
              <div class="header-title-group">
                <span class="header-eyebrow">Website Dashboard</span>
                <h1 class="header-title">网站管理面板</h1>
                <p class="header-subtitle">内容、用户、审核和站点数据的统一工作台</p>
              </div>
            </div>
            <div class="header-actions">
              <button class="refresh-btn" @click="refreshAllData" :class="{ 'spinning': isRefreshing }">
                <RefreshCw :size="17" />
                <span>刷新数据</span>
              </button>
              <button v-if="!isModerationTab && canCreateCurrentTab" class="publish-btn" @click="openEditModal()">
                <Plus :size="17" />
                <span>新增记录</span>
              </button>
            </div>
          </div>
        </header>

        <div class="main-container">
          <section class="dashboard-hero">
            <div class="hero-copy">
              <div class="hero-kicker">
                <span class="live-dot"></span>
                方块之家管理控制台
              </div>
              <h2>站点运行、内容发布和数据维护集中处理。</h2>
              <p>当前正在管理 {{ currentTabLabel }}，共 {{ totalRecordCount }} 条记录。管理员可以快速刷新、筛选、导出或打开右侧抽屉编辑数据。</p>
            </div>
            <div class="hero-status-grid">
              <div v-for="item in siteHealthCards" :key="item.label" class="hero-status-card">
                <component :is="item.icon" :size="18" />
                <div>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </section>

          <!-- 统计概览卡片 -->
          <section class="stats-section">
            <div class="stat-card" v-for="stat in statsCards" :key="stat.id" :class="`stat-${stat.type}`">
              <div class="stat-icon">
                <component :is="stat.icon" :size="22" />
              </div>
              <div class="stat-content">
                <template v-if="isLoading">
                  <span class="dm-skeleton-block dm-stat-value-skeleton"></span>
                  <span class="dm-skeleton-block dm-stat-label-skeleton"></span>
                </template>
                <template v-else>
                  <span class="stat-value">{{ stat.value }}</span>
                  <span class="stat-label">{{ stat.label }}</span>
                </template>
              </div>
              <div class="stat-trend" v-if="!isLoading && stat.trend">
                <span :class="{ 'up': stat.trend > 0, 'down': stat.trend < 0 }">
                  {{ stat.trend > 0 ? '+' : '' }}{{ stat.trend }}%
                </span>
              </div>
            </div>
          </section>

          <section class="dashboard-grid">
            <div class="overview-panel">
              <div class="panel-heading">
                <div>
                  <h2>数据表概览</h2>
                  <p>当前管理模块的数据规模</p>
                </div>
                <Database :size="19" />
              </div>
              <div class="table-summary-list">
                <button
                  v-for="table in tableSummaryCards"
                  :key="table.id"
                  class="table-summary-item"
                  :class="{ active: currentTab === table.id }"
                  type="button"
                  @click="switchTab(table.id)"
                >
                  <span class="table-summary-icon">{{ table.icon }}</span>
                  <span class="table-summary-label">{{ table.label }}</span>
                  <strong>{{ table.count }}</strong>
                </button>
              </div>
            </div>

            <div class="overview-panel">
              <div class="panel-heading">
                <div>
                  <h2>待处理事项</h2>
                  <p>审核、风控和抽奖任务</p>
                </div>
                <ShieldCheck :size="19" />
              </div>
              <div class="operations-list">
                <button
                  v-for="item in activeOperations"
                  :key="item.id"
                  type="button"
                  class="operation-item"
                  @click="switchTab(item.tab)"
                >
                  <span class="operation-status" :class="item.tone"></span>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.description }}</span>
                  </div>
                  <span class="operation-count">{{ item.count }}</span>
                </button>
              </div>
            </div>

            <div class="overview-panel activity-panel">
              <div class="panel-heading">
                <div>
                  <h2>最近活动</h2>
                  <p>按数据表更新时间聚合</p>
                </div>
                <Activity :size="19" />
              </div>
              <div class="activity-list">
                <div v-for="item in recentActivityItems" :key="item.id" class="activity-item">
                  <div class="activity-dot"></div>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.meta }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

      <!-- 管理模块标签页 -->
          <section id="data-console" class="management-section">
        <div class="tabs-header" @touchstart.passive="onTabsHeaderTouchStart" @touchend.passive="onTabsHeaderTouchEnd">
          <div class="mobile-tab-switcher">
            <button class="mobile-tab-toggle" type="button" @click="isMobileTabMenuOpen = !isMobileTabMenuOpen">
              <span class="mobile-tab-toggle-label">切换管理视图</span>
              <span class="mobile-tab-toggle-current">{{ currentTabMeta.icon }} {{ currentTabMeta.label }}</span>
              <span class="mobile-tab-toggle-arrow" :class="{ open: isMobileTabMenuOpen }">⌄</span>
            </button>
            <div v-if="isMobileTabMenuOpen" class="mobile-tab-panel">
              <button
                v-for="tab in tabs"
                :key="`mobile-${tab.id}`"
                type="button"
                class="mobile-tab-option"
                :class="{ active: currentTab === tab.id }"
                @click="switchTabFromMobile(tab.id)"
              >
                <span class="mobile-tab-option-icon">{{ tab.icon }}</span>
                <span class="mobile-tab-option-label">{{ tab.label }}</span>
                <span class="mobile-tab-option-count" v-if="getTabCount(tab.id) > 0">{{ getTabCount(tab.id) }}</span>
              </button>
            </div>
          </div>

          <div ref="tabsNavRef" class="tabs-nav">
            <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: currentTab === tab.id }"
              :ref="(el) => setTabButtonRef(tab.id, el)"
              @click="switchTab(tab.id)">
              <span class="tab-icon">{{ tab.icon }}</span>
              <span class="tab-label">{{ tab.label }}</span>
              <span class="tab-count" v-if="getTabCount(tab.id) > 0">{{ getTabCount(tab.id) }}</span>
            </button>
          </div>
          <div class="tabs-actions">
            <div class="search-box">
              <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input v-model="searchQuery" type="text" placeholder="搜索数据..." @input="handleSearch" />
              <button v-if="searchQuery" class="clear-search" @click="clearSearch">×</button>
            </div>
          </div>
        </div>

        <!-- 数据表格区域 -->
        <div class="data-content">
          <div class="content-toolbar">
            <div class="toolbar-left">
              <h2 class="section-title">{{ currentTabLabel }}</h2>
              <span class="data-badge">{{ totalRecordCount }} 条记录</span>
            </div>
            <div class="toolbar-right">
              <button v-if="selectedItems.length > 0 && !isModerationTab && !isProfileDerivedTab && !isReadOnlyTab" class="btn btn-danger" @click="batchDelete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                删除选中 ({{ selectedItems.length }})
              </button>
              <button class="btn btn-secondary" @click="exportData">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                导出
              </button>
              <button v-if="isLotteryOpsTab" class="btn btn-secondary" :disabled="lotteryDueDrawPending" @click="runDueLotteryDraws">
                <RefreshCw :size="16" :class="{ spinning: lotteryDueDrawPending }" />
                执行到期开奖
              </button>
              <button v-if="!isModerationTab && canCreateCurrentTab" class="btn btn-primary" @click="openEditModal()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                新增
              </button>
            </div>
          </div>

          <div v-if="isLotteryOpsTab" class="lottery-scheduler-panel">
            <div class="lottery-scheduler-card" v-for="item in lotterySchedulerCards" :key="item.label" :class="`tone-${item.tone}`">
              <span>{{ item.label }}</span>
              <strong>{{ lotterySchedulerStatusLoading ? '加载中' : item.value }}</strong>
            </div>
            <button class="lottery-scheduler-link" type="button" @click="switchTab('lotterySchedulerLogs')">
              查看调度日志
            </button>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading" class="dm-table-skeleton" aria-hidden="true">
            <div class="dm-skeleton-table-head">
              <span class="dm-skeleton-block dm-check-skeleton"></span>
              <span v-for="item in 5" :key="`dm-head-loading-${item}`"
                class="dm-skeleton-block dm-head-cell-skeleton"></span>
              <span class="dm-skeleton-block dm-action-cell-skeleton"></span>
            </div>
            <div v-for="row in 8" :key="`dm-row-loading-${row}`" class="dm-skeleton-table-row">
              <span class="dm-skeleton-block dm-check-skeleton"></span>
              <span class="dm-skeleton-block dm-cell-skeleton title"></span>
              <span class="dm-skeleton-block dm-cell-skeleton"></span>
              <span class="dm-skeleton-block dm-cell-skeleton short"></span>
              <span class="dm-skeleton-block dm-cell-skeleton badge"></span>
              <span class="dm-skeleton-block dm-cell-skeleton"></span>
              <span class="dm-skeleton-block dm-action-cell-skeleton"></span>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else-if="totalRecordCount === 0" class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>暂无数据</h3>
            <p>{{ searchQuery ? '没有找到匹配的数据' : '当前模块还没有数据，点击新增按钮添加第一条记录' }}</p>
            <button v-if="!searchQuery && !isModerationTab && canCreateCurrentTab" class="btn btn-primary" @click="openEditModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新增数据
            </button>
          </div>

          <!-- 数据表格 -->
          <div v-else class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <label class="checkbox-wrapper">
                      <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
                      <span class="checkmark"></span>
                    </label>
                  </th>
                  <th v-for="col in currentColumns" :key="col.key" :class="{ sortable: col.sortable }"
                    @click="col.sortable && sortBy(col.key)">
                    {{ col.label }}
                    <span v-if="sortKey === col.key" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '↑' : '↓' }}
                    </span>
                  </th>
                  <th class="actions-col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in paginatedData" :key="item.id || itemIndex(item)"
                  :class="{ selected: isSelected(item) }">
                  <td class="checkbox-col">
                    <label class="checkbox-wrapper">
                      <input type="checkbox" :checked="isSelected(item)" @change="toggleSelect(item)" />
                      <span class="checkmark"></span>
                    </label>
                  </td>
                  <td v-for="col in currentColumns" :key="col.key">
                    <template v-if="col.type === 'image'">
                      <div class="cell-image">
                        <img :src="getImageUrl(item[col.key])" :alt="item.title || 'Image'" loading="lazy" />
                      </div>
                    </template>
                    <template v-else-if="col.type === 'badge'">
                      <span class="cell-badge" :class="`badge-${getBadgeType(item[col.key])}`">
                        {{ item[col.key] || '-' }}
                      </span>
                    </template>
                    <template v-else-if="col.type === 'tags'">
                      <div class="cell-tags">
                        <span v-for="tag in getTags(item[col.key])" :key="tag" class="tag">{{ tag }}</span>
                      </div>
                    </template>
                    <template v-else-if="col.type === 'price'">
                      <span class="cell-price">{{ item[col.key] || '-' }}</span>
                    </template>
                    <template v-else-if="col.type === 'date'">
                      <span class="cell-date">{{ formatDate(item[col.key]) }}</span>
                    </template>
                    <template v-else-if="col.type === 'datetime'">
                      <span class="cell-date">{{ formatDateTime(item[col.key]) }}</span>
                    </template>
                    <template v-else-if="col.type === 'json'">
                      <span class="cell-json" :title="JSON.stringify(item[col.key])">
                        {{ getJsonPreview(item[col.key]) }}
                      </span>
                    </template>
                    <template v-else>
                      <span class="cell-text" :title="item[col.key]">{{ formatCellValue(item[col.key], col.maxLength)
                        }}</span>
                    </template>
                  </td>
                  <td class="actions-col">
                    <div class="action-btns">
                      <template v-if="isModerationTab">
                        <button
                          class="review-btn approve"
                          :disabled="isModerationActionPending(item.id)"
                          @click="approveModerationItem(item)"
                          :title="isRejectedModerationRecord(item) ? '恢复为通过' : '审核通过'"
                        >
                          {{ isRejectedModerationRecord(item) ? '恢复' : '通过' }}
                        </button>
                        <button
                          v-if="isMessageModerationTab && !isRejectedModerationRecord(item)"
                          class="review-btn reject"
                          :disabled="isModerationActionPending(item.id)"
                          @click="rejectModerationItem(item)"
                          title="拒绝并填写原因"
                        >
                          拒绝
                        </button>
                        <button
                          v-if="isReportedPostModerationTab && !isRejectedModerationRecord(item)"
                          class="review-btn reject"
                          :disabled="isModerationActionPending(item.id)"
                          @click="keepLimitedModerationItem(item)"
                          title="维持仅作者可见并结案举报"
                        >
                          维持下架
                        </button>
                        <button
                          v-if="isRejectedModerationRecord(item) || isMessageModerationTab"
                          class="review-btn reject"
                          :disabled="isModerationActionPending(item.id)"
                          @click="deleteModerationItem(item)"
                          title="删除该记录"
                        >
                          删除
                        </button>
                        <button
                          v-else
                          class="review-btn reject"
                          :disabled="isModerationActionPending(item.id)"
                          @click="rejectModerationItem(item)"
                          title="拒绝并填写原因"
                        >
                          拒绝
                        </button>
                      </template>
                      <template v-else>
                        <button
                          v-if="currentTab === 'lotteries' && item.status === 'open'"
                          class="review-btn approve"
                          :disabled="isLotteryActionPending(item.id)"
                          @click="drawLotteryNow(item)"
                          title="立即随机开奖"
                        >
                          开奖
                        </button>
                        <button
                          v-if="currentTab === 'lotteries' && item.status === 'drawn'"
                          class="review-btn approve"
                          :disabled="isLotteryActionPending(item.id)"
                          @click="redrawLottery(item)"
                          title="保留历史记录并重新随机开奖"
                        >
                          重抽
                        </button>
                        <button
                          v-if="currentTab === 'lotteries'"
                          class="review-btn approve"
                          @click="viewLotteryEntries(item)"
                          title="查看本次抽奖报名名单"
                        >
                          名单
                        </button>
                        <button
                          v-if="currentTab === 'lotteries'"
                          class="review-btn approve"
                          @click="viewLotteryDrawLogs(item)"
                          title="查看本次抽奖开奖日志"
                        >
                          日志
                        </button>
                        <button
                          v-if="currentTab === 'lotteries' && item.status !== 'closed'"
                          class="review-btn reject"
                          :disabled="isLotteryActionPending(item.id)"
                          @click="closeLottery(item)"
                          title="关闭该抽奖"
                        >
                          关闭
                        </button>
                        <button v-if="!isReadOnlyTab" class="icon-btn edit" @click="openEditModal(item)" title="编辑">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                          </svg>
                        </button>
                        <button v-if="!isProfileDerivedTab && !isReadOnlyTab" class="icon-btn delete" @click="deleteItem(item)" title="删除">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2">
                            </path>
                          </svg>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页 -->
          <div v-if="totalRecordCount > 0" class="dm-pagination">
            <div class="dm-pagination-info">
              显示 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, totalRecordCount) }}
              条，共 {{ totalRecordCount }} 条
            </div>
            <div class="dm-pagination-controls">
              <button class="dm-page-btn" :disabled="currentPage === 1" @click="currentPage--">
                上一页
              </button>
              <div class="dm-page-numbers">
                <button v-for="page in visiblePages" :key="page" class="dm-page-number"
                  :class="{ active: currentPage === page }" @click="currentPage = page">
                  {{ page }}
                </button>
              </div>
              <button class="dm-page-btn" :disabled="currentPage === totalPages" @click="currentPage++">
                下一页
              </button>
            </div>
            <div class="dm-page-size-selector">
              <select v-model="pageSize">
                <option :value="10">10条/页</option>
                <option :value="20">20条/页</option>
                <option :value="50">50条/页</option>
                <option :value="100">100条/页</option>
              </select>
            </div>
          </div>
        </div>
          </section>
        </div>
      </main>
    </div>

    <!-- 编辑/新增抽屉 -->
    <Transition name="drawer">
      <div v-if="showModal" class="drawer-overlay" @click.self="closeModal">
        <div class="drawer">
          <div class="drawer-header">
            <div class="drawer-title-group">
              <h3>{{ isEditing ? '编辑数据' : '新增数据' }}</h3>
              <p>{{ currentTabLabel }}</p>
            </div>
            <button class="drawer-close" @click="closeModal">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="drawer-body">
            <form @submit.prevent="saveData" class="edit-form">
              <div v-if="isNewsTab" class="news-assist-panel">
                <div class="assist-title">新闻录入助手</div>
                <div class="assist-actions">
                  <button type="button" class="btn btn-secondary" :disabled="isEditing" @click="regenerateNewsId">
                    自动生成 ID
                  </button>
                  <button type="button" class="btn btn-secondary" @click="injectNewsTemplate(true)">
                    生成写作提纲
                  </button>
                  <button type="button" class="btn btn-secondary" @click="generateExcerptFromContent(true)">
                    根据正文生成摘要
                  </button>
                </div>
                <p class="assist-hint">
                  新增新闻时会自动填充 ID、日期和基础提纲，正文按普通文章写即可，保存时会自动排版成新闻详情。
                </p>
              </div>

              <div v-else-if="canRegenerateAutoId" class="news-assist-panel">
                <div class="assist-title">自动编号助手</div>
                <div class="assist-actions">
                  <button type="button" class="btn btn-secondary" @click="regenerateAutoIdForCurrentTab">
                    自动生成 ID
                  </button>
                </div>
                <p class="assist-hint">
                  当前模块新增时会自动分配数值 ID，你也可以点击按钮重新生成。
                </p>
              </div>

              <div v-if="currentTab === 'gifts'" class="gift-address-copy-box">
                <div class="gift-address-copy-header">
                  <span>用户地址整段（便于复制）</span>
                  <button type="button" class="btn btn-secondary address-copy-btn" @click="copyGiftAddressBundle">
                    复制整段
                  </button>
                </div>
                <textarea
                  class="form-textarea code-font address-copy-textarea"
                  :value="giftAddressBundleText"
                  rows="4"
                  readonly
                ></textarea>
              </div>

              <div v-for="field in currentFields" :key="field.key" class="form-group" :class="`field-${field.type}`">
                <label class="form-label">
                  {{ field.label }}
                  <span v-if="field.required" class="required">*</span>
                </label>

                <!-- 用户选择器（礼物专用） -->
                <div v-if="field.type === 'user-picker'" class="user-picker-field">
                  <div v-if="selectedGiftUser" class="selected-user-card">
                    <div class="selected-user-main">
                      <div class="selected-user-name">{{ selectedGiftUser.username || '未命名用户' }}</div>
                      <div class="selected-user-id">{{ selectedGiftUser.id }}</div>
                    </div>
                    <div class="selected-user-meta">
                      <span>{{ selectedGiftUser.email || '无邮箱' }}</span>
                      <span>{{ selectedGiftUser.shipping_phone || '无联系电话' }}</span>
                    </div>
                  </div>
                  <div v-else class="selected-user-empty">
                    尚未选择用户，请点击下方按钮选择
                  </div>
                  <div class="user-picker-actions">
                    <button type="button" class="btn btn-secondary" :disabled="isFieldDisabled(field)" @click="openUserPicker">
                      选择用户
                    </button>
                    <button
                      v-if="editingItem.user_id && !isFieldDisabled(field)"
                      type="button"
                      class="btn btn-secondary"
                      @click="clearSelectedGiftUser"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <!-- 文本输入 -->
                <input v-else-if="field.type === 'text'" v-model="editingItem[field.key]" type="text"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                  :disabled="isFieldDisabled(field)" :required="field.required" :maxlength="field.maxLength"
                  @input="clearFieldError(field.key)"
                  @blur="validateField(field.key)" />

                <!-- 邮箱输入 -->
                <input v-else-if="field.type === 'email'" v-model="editingItem[field.key]" type="email"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                  :disabled="isFieldDisabled(field)" :required="field.required" :maxlength="field.maxLength"
                  @input="clearFieldError(field.key)"
                  @blur="validateField(field.key)" />

                <!-- 数字输入 -->
                <input v-else-if="field.type === 'number'" v-model.number="editingItem[field.key]" type="number"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                  :disabled="isFieldDisabled(field)" :required="field.required" :min="field.min" :max="field.max"
                  :step="field.step || 1" @input="clearFieldError(field.key)"
                  @blur="validateField(field.key)" />

                <!-- 日期输入 -->
                <input v-else-if="field.type === 'date'" v-model="editingItem[field.key]" type="date"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                  :required="field.required" @input="clearFieldError(field.key)" @blur="validateField(field.key)" />

                <!-- 日期时间输入 -->
                <input v-else-if="field.type === 'datetime'" v-model="editingItem[field.key]" type="datetime-local"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                  :required="field.required" @input="clearFieldError(field.key)" @blur="validateField(field.key)" />

                <!-- 文本域 -->
                <textarea v-else-if="field.type === 'textarea'" v-model="editingItem[field.key]"
                  :class="['form-textarea', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                  :disabled="isFieldDisabled(field)" :required="field.required" :rows="field.rows || 4"
                  :maxlength="field.maxLength"
                  @input="clearFieldError(field.key)" @blur="validateField(field.key)"></textarea>

                <!-- 选择器 -->
                <select v-else-if="field.type === 'select'" v-model="editingItem[field.key]"
                  :class="['form-select', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                  :required="field.required" @change="clearFieldError(field.key)" @blur="validateField(field.key)">
                  <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>

                <!-- 图片输入 -->
                <div v-else-if="field.type === 'image'" class="image-input">
                  <div class="image-preview" v-if="editingItem[field.key]">
                    <img :src="getImageUrl(editingItem[field.key])" alt="Preview" />
                    <button type="button" class="remove-image" @click="clearImageField(field.key)">×</button>
                  </div>
                  <div v-else class="image-placeholder">
                    <span>🖼️</span>
                    <p>上传或粘贴图片</p>
                  </div>
                  <div class="image-source-actions">
                    <label
                      class="cloud-upload-btn"
                      :class="{ disabled: isImageUploadPending(field.key) || isFieldDisabled(field) }"
                    >
                      <input
                        type="file"
                        class="image-file-input"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        :disabled="isImageUploadPending(field.key) || isFieldDisabled(field)"
                        @change="handleAdminImageUpload($event, field)"
                      />
                      <span v-if="isImageUploadPending(field.key)" class="btn-spinner"></span>
                      <span>{{ isImageUploadPending(field.key) ? '上传中...' : '上传到 Cloud' }}</span>
                    </label>
                    <button
                      v-if="editingItem[field.key]"
                      type="button"
                      class="image-link-btn"
                      @click="copyImageValue(field.key)"
                    >
                      复制链接
                    </button>
                  </div>
                  <input v-model="editingItem[field.key]" type="text"
                    :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                    :placeholder="field.placeholder || 'https://... 或 @/assets/images/...'"
                    :disabled="isFieldDisabled(field)"
                    @input="clearFieldError(field.key)" @blur="validateField(field.key)" />
                </div>

                <!-- 标签输入 -->
                <div v-else-if="field.type === 'tags'" class="tags-input">
                  <div class="tags-list">
                    <span v-for="(tag, idx) in (editingItem[field.key] || [])" :key="idx" class="tag-item">
                      {{ tag }}
                      <button type="button" @click="removeTag(field.key, idx)">×</button>
                    </span>
                  </div>
                  <input type="text" class="form-input" placeholder="输入标签后按回车"
                    @keydown.enter.prevent="addTag($event, field.key)" />
                </div>

                <!-- 规格输入 (商品专用) -->
                <div v-else-if="field.type === 'specifications'" class="specs-input">
                  <div v-for="(spec, idx) in (editingItem[field.key] || [])" :key="idx" class="spec-item">
                    <input v-model="spec.label" type="text" class="form-input" placeholder="规格名称" />
                    <input v-model="spec.value" type="text" class="form-input" placeholder="规格值" />
                    <button type="button" class="btn-icon" @click="removeSpec(field.key, idx)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>
                  <button type="button" class="btn-add-spec" @click="addSpec(field.key)">
                    + 添加规格
                  </button>
                </div>

                <!-- JSON 输入 -->
                <div v-else-if="field.type === 'json'" class="json-input">
                  <textarea v-model="jsonBuffers[field.key]" class="form-textarea code-font" rows="6"
                    placeholder="请输入有效的 JSON"></textarea>
                </div>

                <span v-if="fieldErrors[field.key]" class="field-error">{{ fieldErrors[field.key] }}</span>
                <span v-else-if="field.hint" class="input-hint">{{ field.hint }}</span>
              </div>
            </form>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-secondary" @click="closeModal">取消</button>
            <button class="btn btn-primary" @click="saveData" :disabled="isSaving">
              {{ isSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 用户选择弹窗（礼物新增） -->
    <Transition name="picker">
      <div v-if="showUserPickerModal" class="user-picker-modal-overlay" @click.self="closeUserPicker">
        <div class="user-picker-modal">
          <div class="user-picker-header">
            <h3>选择用户</h3>
            <button class="drawer-close" @click="closeUserPicker">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div class="user-picker-search">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              v-model="userPickerKeyword"
              type="text"
              placeholder="搜索用户名 / 邮箱 / 用户ID"
            />
          </div>
          <div class="user-picker-list">
            <button
              v-for="user in filteredGiftUsers"
              :key="user.id"
              type="button"
              class="user-picker-item"
              @click="selectGiftUser(user)"
            >
              <div class="user-picker-item-main">
                <span class="user-picker-name">{{ user.username || '未命名用户' }}</span>
                <span class="user-picker-id">{{ user.id }}</span>
              </div>
              <div class="user-picker-item-meta">
                <span>{{ user.email || '无邮箱' }}</span>
                <span>{{ user.shipping_recipient || '无收件人' }}</span>
              </div>
            </button>
            <div v-if="filteredGiftUsers.length === 0" class="user-picker-empty">
              没有匹配的用户
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 提示消息 -->
    <Transition name="toast">
      <div v-if="toast.show" class="toast" :class="`toast-${toast.type}`">
        <span class="toast-icon">{{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ' }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  Activity,
  ArrowLeft,
  Database,
  FileText,
  Gauge,
  Home,
  Image,
  MessageSquare,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Server,
  Users
} from 'lucide-vue-next';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';
import { getImageUrl } from '../../utils/asset-helper';
import { supabase } from '@/utils/supabase-client.js';
import { invalidateByTags } from '@/utils/request-core.js';
import {
  isCloudinaryNoteUploadConfigured,
  uploadImageToCloudinary
} from '@/utils/cloudinary-client.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory } from '@/utils/gift-archive.js';
import {
  NEWS_CATEGORY_VALUES,
  PRODUCT_CATEGORY_OPTIONS,
  SUBSCRIPTION_PLAN_NAMES,
  TABS_KEEP_ID_ON_INSERT,
  TAB_WRITABLE_FIELDS,
  dataConfig,
  invalidateProductsCache,
  tabs
} from './config.js';

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = authStore;

// 管理面板返回站点首页，避免后台操作被带回个人空间。
const goBack = () => {
  router.push('/');
};

// ==================== 状态管理 ====================
const currentTab = ref('users');
const isLoading = ref(false);
const isRefreshing = ref(false);
const isSaving = ref(false);
const showModal = ref(false);
const showUserPickerModal = ref(false);
const isEditing = ref(false);
const editingItem = ref({});
const jsonBuffers = ref({});
const fieldErrors = reactive({});
const searchQuery = ref('');
const userPickerKeyword = ref('');
const selectedItems = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const sortKey = ref('');
const sortOrder = ref('asc');
const tabsNavRef = ref(null);
const tabButtonRefs = ref({});
const isMobileTabMenuOpen = ref(false);
const isAdminSidebarOpen = ref(false);
const uploadingImageFields = ref([]);
const tabTotals = reactive(tabs.reduce((acc, tab) => {
  acc[tab.id] = 0;
  return acc;
}, {}));
const activeFetchId = ref(0);
const searchDebounceTimer = ref(null);
const suppressNextPageFetch = ref(false);
const userPickerUsers = ref([]);
const userPickerLoading = ref(false);
const userPickerFetchId = ref(0);
const userPickerSearchDebounceTimer = ref(null);
const tabsTouchState = reactive({
  active: false,
  startX: 0,
  startY: 0,
  startAt: 0
});
const moderationPendingIds = ref([]);
const lotterySchedulerStatus = ref(null);
const lotterySchedulerStatusLoading = ref(false);
const lotteryDueDrawPending = ref(false);

// 提示消息
const toast = reactive({
  show: false,
  message: '',
  type: 'info',
  timer: null
});

const showToast = (message, type = 'info') => {
  if (toast.timer) clearTimeout(toast.timer);
  toast.message = message;
  toast.type = type;
  toast.show = true;
  toast.timer = setTimeout(() => {
    toast.show = false;
  }, 3000);
};

const clearFieldErrors = () => {
  Object.keys(fieldErrors).forEach((key) => {
    delete fieldErrors[key];
  });
};

const clearFieldError = (fieldKey) => {
  if (fieldErrors[fieldKey]) {
    delete fieldErrors[fieldKey];
  }
};

const invalidateSubscriptionCache = (userId = '') => {
  const tags = ['subscriptions'];
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    tags.push(`subscriptions:user:${normalizedUserId}`);
  }
  invalidateByTags(tags);
};

const buildActionErrorMessage = (error, fallback = '操作失败') => {
  const rawMessage = String(error?.message || '').trim();
  const rawLower = rawMessage.toLowerCase();
  const rawCode = String(error?.code || '').toUpperCase();

  if (rawCode === '42501' || rawLower.includes('row-level security') || rawLower.includes('permission denied')) {
    return '权限不足：请确认当前账号是管理员，并已部署最新管理员权限策略';
  }
  if (rawCode === 'PGRST116' || rawLower.includes('0 rows') || rawLower.includes('no rows')) {
    return '没有记录被修改，可能是记录不存在或权限策略拒绝了本次操作';
  }
  return rawMessage || fallback;
};

const assertAdminAction = () => {
  if (!isCurrentUserAdmin.value) {
    throw new Error('仅管理员可执行该操作');
  }
};

// ==================== 数据存储 ====================
const dataStore = reactive({
  users: [],
  points: [],
  subscriptions: [],
  gifts: [],
  forum: [],
  reportedPosts: [],
  reviewPosts: [],
  reviewComments: [],
  reviewMessages: [],
  coreMemories: [],
  lotteries: [],
  lotteryEntries: [],
  lotteryDrawLogs: [],
  lotterySchedulerLogs: [],
  lotteryNotificationJobs: [],
  lotteryJoinAttempts: [],
  news: [],
  activities: [],
  products: []
});

const setTabTotal = (tabId, total) => {
  tabTotals[tabId] = Math.max(0, Number(total || 0));
};

const stats = reactive({
  totalUsers: 0,
  totalSubscriptions: 0,
  totalPosts: 0,
  totalCoreMemories: 0,
  totalLotteries: 0,
  totalLotteryEntries: 0,
  totalLotteryDrawLogs: 0,
  totalLotterySchedulerLogs: 0,
  totalLotteryNotificationJobs: 0,
  totalLotteryJoinAttempts: 0,
  totalNews: 0,
  totalActivities: 0,
  totalProducts: 0
});

// ==================== 标签页配置（已拆分） ====================
// ==================== 计算属性 ====================
const currentConfig = computed(() => dataConfig[currentTab.value]);
const currentColumns = computed(() => currentConfig.value?.columns || []);
const currentFields = computed(() => currentConfig.value?.fields || []);
const currentTabLabel = computed(() => tabs.find(t => t.id === currentTab.value)?.label || '');
const currentTabMeta = computed(() => tabs.find((tab) => tab.id === currentTab.value) || tabs[0]);
const isNewsTab = computed(() => currentTab.value === 'news');
const isCurrentUserAdmin = computed(() => String(userInfo?.role || '').trim() === 'admin');
const canRegenerateAutoId = computed(() =>
  !isEditing.value && ['news', 'activities', 'products'].includes(currentTab.value)
);
const readOnlyTabs = new Set(['lotteryEntries', 'lotteryDrawLogs', 'lotterySchedulerLogs', 'lotteryNotificationJobs', 'lotteryJoinAttempts']);
const canCreateCurrentTab = computed(() => !['points', ...readOnlyTabs].includes(currentTab.value));
const isProfileDerivedTab = computed(() => ['points'].includes(currentTab.value));
const isReadOnlyTab = computed(() => readOnlyTabs.has(currentTab.value));
const isSubscriptionTab = computed(() => currentTab.value === 'subscriptions');
const lotteryOpsTabs = new Set(['lotteries', 'lotteryDrawLogs', 'lotterySchedulerLogs', 'lotteryNotificationJobs', 'lotteryJoinAttempts']);
const isLotteryOpsTab = computed(() => lotteryOpsTabs.has(currentTab.value));
const moderationTabConfig = computed(() => {
  const configMap = {
    reviewPosts: {
      table: 'posts',
      statusField: 'status',
      approveValue: 'approved',
      rejectValue: 'rejected',
      reasonField: null,
      targetType: 'post'
    },
    reportedPosts: {
      table: 'posts',
      statusField: 'status',
      approveValue: 'approved',
      rejectValue: 'rejected',
      reasonField: null,
      targetType: 'post'
    },
    reviewComments: {
      table: 'comments',
      statusField: 'status',
      approveValue: 'approved',
      rejectValue: 'rejected',
      reasonField: null,
      targetType: 'comment'
    },
    reviewMessages: {
      table: 'messages',
      statusField: 'moderation_status',
      approveValue: 'approved',
      rejectValue: 'rejected',
      reasonField: 'moderation_reason',
      targetType: 'message'
    }
  };

  return configMap[currentTab.value] || null;
});
const isModerationTab = computed(() => Boolean(moderationTabConfig.value));
const isRejectedModerationTab = computed(() => ['reviewPosts', 'reviewComments'].includes(currentTab.value));
const isMessageModerationTab = computed(() => currentTab.value === 'reviewMessages');
const isReportedPostModerationTab = computed(() => currentTab.value === 'reportedPosts');
const lotteryActionPendingIds = ref([]);

const lotterySchedulerCards = computed(() => {
  const status = lotterySchedulerStatus.value || {};
  const lastRun = status.last_run || null;
  const cronOk = Boolean(status.pg_cron_enabled && status.job_exists && status.job_active);
  return [
    {
      label: 'pg_cron',
      value: cronOk ? '运行中' : '未就绪',
      tone: cronOk ? 'success' : 'warning'
    },
    {
      label: '任务',
      value: status.job_exists ? (status.job_schedule || '* * * * *') : '未注册',
      tone: status.job_exists ? 'success' : 'warning'
    },
    {
      label: '到期待开奖',
      value: String(Number(status.due_count || 0)),
      tone: Number(status.due_count || 0) > 0 ? 'warning' : 'success'
    },
    {
      label: '上次运行',
      value: lastRun?.started_at ? formatDateTime(lastRun.started_at) : '暂无记录',
      tone: lastRun?.status === 'failed' || lastRun?.status === 'partial_failure' ? 'danger' : 'info'
    }
  ];
});

const isRejectedModerationRecord = (item) => {
  if (!item) return isRejectedModerationTab.value;
  if (isMessageModerationTab.value) {
    return String(item.moderation_status || '').trim().toLowerCase() === 'rejected';
  }
  return isRejectedModerationTab.value;
};

const currentData = computed(() => dataStore[currentTab.value] || []);
const selectedGiftUser = computed(() => {
  const userId = String(editingItem.value?.user_id || '').trim();
  if (!userId) return null;

  const fromStore = [...(dataStore.users || []), ...(userPickerUsers.value || [])].find((user) => user.id === userId);
  if (fromStore) return fromStore;

  return {
    id: userId,
    username: editingItem.value?.username || '',
    email: editingItem.value?.email || '',
    shipping_recipient: editingItem.value?.shipping_recipient || '',
    shipping_phone: editingItem.value?.shipping_phone || '',
    shipping_address: editingItem.value?.shipping_address || ''
  };
});

const filteredGiftUsers = computed(() => {
  const keyword = userPickerKeyword.value.trim().toLowerCase();
  const mergedUsers = [...(dataStore.users || []), ...(userPickerUsers.value || [])];
  const usersById = new Map();
  mergedUsers.forEach((user) => {
    if (user?.id) usersById.set(user.id, user);
  });
  const users = [...usersById.values()].sort((a, b) =>
    String(a.username || '').localeCompare(String(b.username || ''), 'zh-Hans-CN')
  );

  if (!keyword) return users.slice(0, 200);

  return users
    .filter((user) => {
      const targets = [
        user.username,
        user.email,
        user.id,
        user.shipping_recipient,
        user.shipping_phone
      ];
      return targets.some((value) => String(value || '').toLowerCase().includes(keyword));
    })
    .slice(0, 200);
});

const giftAddressBundleText = computed(() => {
  if (currentTab.value !== 'gifts') return '';

  const recipient = String(editingItem.value?.shipping_recipient || '').trim() || '未填写';
  const address = String(editingItem.value?.shipping_address || '').trim() || '未填写';
  const phone = String(editingItem.value?.shipping_phone || '').trim() || '未填写';

  return [
    `收货人：${recipient}`,
    `地址：${address}`,
    `电话：${phone}`
  ].join('\n');
});

const dashboardTableIds = ['users', 'subscriptions', 'forum', 'news', 'activities', 'products'];
const moderationPendingCount = computed(() =>
  ['reportedPosts', 'reviewPosts', 'reviewComments', 'reviewMessages']
    .reduce((total, tabId) => total + getTabCount(tabId), 0)
);
const currentAdminSection = computed(() => {
  if (['users', 'points', 'subscriptions', 'gifts'].includes(currentTab.value)) return 'users';
  if (isModerationTab.value || ['lotteryJoinAttempts'].includes(currentTab.value)) return 'feedback';
  if (['forum', 'news', 'activities', 'products', 'coreMemories', 'lotteries', 'lotteryEntries', 'lotteryDrawLogs', 'lotterySchedulerLogs', 'lotteryNotificationJobs'].includes(currentTab.value)) return 'content';
  return 'data';
});

const adminNavigation = computed(() => [
  { id: 'overview', label: '概览', icon: Home, active: false },
  { id: 'data', label: '数据管理', icon: Database, active: currentAdminSection.value === 'data', badge: totalRecordCount.value || '' },
  { id: 'content', label: '内容管理', icon: FileText, active: currentAdminSection.value === 'content' },
  { id: 'media', label: '媒体资源', icon: Image, active: false },
  { id: 'users', label: '用户与权限', icon: Users, active: currentAdminSection.value === 'users' },
  { id: 'feedback', label: '表单与反馈', icon: MessageSquare, active: currentAdminSection.value === 'feedback', badge: moderationPendingCount.value || '' },
  { id: 'settings', label: '网站设置', icon: Settings, active: false }
]);

const siteHealthCards = computed(() => [
  { label: '环境', value: 'Production', icon: Server },
  { label: '权限', value: isCurrentUserAdmin.value ? 'Admin' : '受限', icon: ShieldCheck },
  { label: '健康度', value: `${Math.max(92, 100 - Math.min(moderationPendingCount.value, 8))}%`, icon: Gauge },
  { label: '当前数据表', value: currentTabLabel.value || '未选择', icon: Database }
]);

const tableSummaryCards = computed(() =>
  dashboardTableIds.map((tabId) => {
    const meta = tabs.find((tab) => tab.id === tabId) || {};
    return {
      id: tabId,
      icon: meta.icon || '•',
      label: meta.label || tabId,
      count: getTabCount(tabId)
    };
  })
);

const activeOperations = computed(() => [
  {
    id: 'reported-posts',
    tab: 'reportedPosts',
    title: '举报下架',
    description: '需要管理员复核的帖子',
    count: getTabCount('reportedPosts'),
    tone: getTabCount('reportedPosts') > 0 ? 'warning' : 'success'
  },
  {
    id: 'review-comments',
    tab: 'reviewComments',
    title: '评论审核',
    description: '已拒绝或待处理评论',
    count: getTabCount('reviewComments'),
    tone: getTabCount('reviewComments') > 0 ? 'danger' : 'success'
  },
  {
    id: 'lottery-risk',
    tab: 'lotteryJoinAttempts',
    title: '报名风控',
    description: '抽奖报名尝试记录',
    count: getTabCount('lotteryJoinAttempts'),
    tone: 'info'
  },
  {
    id: 'lottery-scheduler',
    tab: 'lotterySchedulerLogs',
    title: '定时开奖',
    description: '数据库调度运行日志',
    count: Number(lotterySchedulerStatus.value?.due_count || 0),
    tone: Number(lotterySchedulerStatus.value?.due_count || 0) > 0 ? 'warning' : 'success'
  }
]);

const recentActivityItems = computed(() => {
  const sourceTabs = ['forum', 'news', 'activities', 'products'];
  return sourceTabs.map((tabId) => {
    const meta = tabs.find((tab) => tab.id === tabId) || {};
    const rows = dataStore[tabId] || [];
    const latest = rows[0] || {};
    const timestamp = latest.updated_at || latest.created_at || latest.date || '';
    return {
      id: tabId,
      title: `${meta.label || tabId} ${rows.length ? '已有更新' : '暂无本页数据'}`,
      meta: timestamp ? formatDateTime(timestamp) : `${getTabCount(tabId)} 条记录`
    };
  });
});

const handleAdminNavClick = (item) => {
  const tabMap = {
    data: currentTab.value,
    content: 'news',
    users: 'users',
    feedback: 'reportedPosts'
  };
  if (tabMap[item.id]) {
    switchTab(tabMap[item.id]);
  }
  isAdminSidebarOpen.value = false;
};

// 统计卡片
const statsCards = computed(() => [
  { id: 'users', type: 'users', icon: Users, label: '总用户数', value: stats.totalUsers, trend: 12 },
  { id: 'subscriptions', type: 'products', icon: ShieldCheck, label: '有效订阅', value: stats.totalSubscriptions, trend: 0 },
  { id: 'posts', type: 'posts', icon: MessageSquare, label: '论坛帖子', value: stats.totalPosts, trend: 8 },
  { id: 'news', type: 'news', icon: FileText, label: '新闻文章', value: stats.totalNews, trend: -3 }
]);

const totalRecordCount = computed(() => tabTotals[currentTab.value] || currentData.value.length || 0);
const filteredData = computed(() => currentData.value);

// 分页
const totalPages = computed(() => Math.max(1, Math.ceil(totalRecordCount.value / pageSize.value)));
const paginatedData = computed(() => currentData.value);

const visiblePages = computed(() => {
  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages.value, start + maxVisible - 1);

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
});

// 选择相关
const isAllSelected = computed(() => {
  return paginatedData.value.length > 0 && paginatedData.value.every(item => isSelected(item));
});

const setModerationPending = (itemId, pending) => {
  const id = String(itemId || '').trim();
  if (!id) return;
  if (pending) {
    if (!moderationPendingIds.value.includes(id)) {
      moderationPendingIds.value = [...moderationPendingIds.value, id];
    }
    return;
  }
  moderationPendingIds.value = moderationPendingIds.value.filter((entry) => entry !== id);
};

const isModerationActionPending = (itemId) => {
  const id = String(itemId || '').trim();
  if (!id) return false;
  return moderationPendingIds.value.includes(id);
};

const setLotteryActionPending = (itemId, pending) => {
  const id = String(itemId || '').trim();
  if (!id) return;
  if (pending) {
    if (!lotteryActionPendingIds.value.includes(id)) {
      lotteryActionPendingIds.value = [...lotteryActionPendingIds.value, id];
    }
    return;
  }
  lotteryActionPendingIds.value = lotteryActionPendingIds.value.filter((entry) => entry !== id);
};

const isLotteryActionPending = (itemId) => {
  const id = String(itemId || '').trim();
  return Boolean(id && lotteryActionPendingIds.value.includes(id));
};

const toDateInputValue = (dateValue) => {
  if (!dateValue) return '';
  const raw = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
};

const stripHtml = (value) => String(value || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const hasHtmlTag = (value) => /<[^>]+>/.test(String(value || ''));

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pickWritableFields = (tabKey, payload) => {
  const allowList = TAB_WRITABLE_FIELDS[tabKey] || [];
  const next = {};
  allowList.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      next[key] = payload[key];
    }
  });
  return next;
};

const getNextNumericId = (rows = []) => {
  const numericIds = (rows || [])
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const maxId = numericIds.length ? Math.max(...numericIds) : 0;
  return maxId + 1;
};

const fetchNextNumericId = async (tabKey, fallbackRows = []) => {
  const table = dataConfig[tabKey]?.table;
  if (!table) return getNextNumericId(fallbackRows);

  try {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const currentMax = Number(data?.id || 0);
    return Number.isInteger(currentMax) && currentMax > 0
      ? currentMax + 1
      : getNextNumericId(fallbackRows);
  } catch (error) {
    console.warn('获取下一个数字 ID 失败，使用当前页兜底:', error);
    return getNextNumericId(fallbackRows);
  }
};

const splitForumContent = (rawContent) => {
  const content = String(rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!content) return { title: '', body: '' };

  const titleMatch = content.match(/^【([^】\n]{1,80})】\s*\n?/);
  if (!titleMatch) {
    return { title: '', body: content };
  }

  return {
    title: titleMatch[1].trim(),
    body: content.slice(titleMatch[0].length).trim()
  };
};

const buildNewsTemplate = () => {
  const title = String(editingItem.value.title || '').trim() || '请填写新闻标题';
  const date = editingItem.value.date || toDateInputValue(new Date());
  const author = String(editingItem.value.author || '').trim() || '编辑部';

  return [
    `${date}｜${title}`,
    '',
    '导语：用 1-2 句话概括本条新闻。',
    '',
    '重点内容',
    '- 要点 1：请填写具体内容',
    '- 要点 2：请填写具体内容',
    '- 要点 3：请填写具体内容',
    '',
    `作者：${author}`
  ].join('\n');
};

const injectNewsTemplate = (forceOverwrite = false) => {
  if (!isNewsTab.value) return;
  const currentContent = String(editingItem.value.content || '').trim();
  if (!forceOverwrite && currentContent) return;
  editingItem.value.content = buildNewsTemplate();
  clearFieldError('content');
};

const generateExcerptFromContent = (forceOverwrite = false) => {
  if (!isNewsTab.value) return;
  const currentExcerpt = String(editingItem.value.excerpt || '').trim();
  if (!forceOverwrite && currentExcerpt) return;

  const plainContent = stripHtml(editingItem.value.content || '');
  if (!plainContent) {
    editingItem.value.excerpt = '';
    return;
  }

  editingItem.value.excerpt = plainContent.length > 80
    ? `${plainContent.slice(0, 80)}...`
    : plainContent;
  clearFieldError('excerpt');
};

const regenerateNewsId = async () => {
  if (!isNewsTab.value || isEditing.value) return;
  editingItem.value.id = await fetchNextNumericId('news', dataStore.news);
  clearFieldError('id');
};

const regenerateAutoIdForCurrentTab = async () => {
  if (!canRegenerateAutoId.value) return;

  if (currentTab.value === 'news') {
    editingItem.value.id = await fetchNextNumericId('news', dataStore.news);
  } else if (currentTab.value === 'activities') {
    editingItem.value.id = await fetchNextNumericId('activities', dataStore.activities);
  } else if (currentTab.value === 'products') {
    editingItem.value.id = await fetchNextNumericId('products', dataStore.products);
  }

  clearFieldError('id');
};

const validateDateString = (value) => {
  const source = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return false;

  const [year, month, day] = source.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return false;

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const normalizeNewsContent = (content) => {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  if (hasHtmlTag(trimmed)) return trimmed;

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1].trim());
      return;
    }

    flushList();
    if (/^(重点内容|活动安排|更新内容|后续计划|注意事项|详情|总结)$/.test(line)) {
      blocks.push(`<h4>${escapeHtml(line)}</h4>`);
      return;
    }
    blocks.push(`<p>${escapeHtml(line)}</p>`);
  });

  flushList();
  return blocks.join('\n');
};

const validateField = (fieldKey) => {
  const field = currentFields.value.find((item) => item.key === fieldKey);
  if (!field) return true;

  const value = editingItem.value[fieldKey];
  const isEmpty = value === null
    || value === undefined
    || (typeof value === 'string' && !value.trim())
    || (Array.isArray(value) && value.length === 0);

  if (field.required && isEmpty) {
    fieldErrors[fieldKey] = `${field.label}不能为空`;
    return false;
  }

  if (isEmpty) {
    clearFieldError(fieldKey);
    return true;
  }

  const textValue = String(value).trim();

  if (field.type === 'email' && textValue && !EMAIL_REGEX.test(textValue)) {
    fieldErrors[fieldKey] = '邮箱格式不正确';
    return false;
  }

  if (fieldKey === 'id' && (currentTab.value === 'users' || currentTab.value === 'points')) {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '用户 ID 必须是有效 UUID';
      return false;
    }
  }

  if (fieldKey === 'author_id' && currentTab.value === 'forum') {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '作者 ID 必须是 UUID 格式';
      return false;
    }
  }

  if (fieldKey === 'user_id' && currentTab.value === 'subscriptions') {
    if (textValue && !UUID_REGEX.test(textValue)) {
      fieldErrors[fieldKey] = '用户 ID 必须是 UUID 格式';
      return false;
    }
  }

  if (field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      fieldErrors[fieldKey] = `${field.label}必须是有效数字`;
      return false;
    }
    if (field.min !== undefined && numeric < Number(field.min)) {
      fieldErrors[fieldKey] = `${field.label}不能小于 ${field.min}`;
      return false;
    }
    if (field.max !== undefined && numeric > Number(field.max)) {
      fieldErrors[fieldKey] = `${field.label}不能大于 ${field.max}`;
      return false;
    }
  }

  if (field.maxLength && textValue.length > Number(field.maxLength)) {
    fieldErrors[fieldKey] = `${field.label}不能超过 ${field.maxLength} 个字符`;
    return false;
  }

  if (field.type === 'select' && Array.isArray(field.options) && field.options.length > 0) {
    const allowedValues = field.options.map((opt) => opt.value);
    if (!allowedValues.includes(value)) {
      fieldErrors[fieldKey] = `${field.label}选项无效`;
      return false;
    }
  }

  if (currentTab.value === 'news') {
    if (fieldKey === 'id') {
      const numId = Number(value);
      if (!Number.isInteger(numId) || numId <= 0) {
        fieldErrors[fieldKey] = 'ID 必须是正整数';
        return false;
      }
    }

    if (fieldKey === 'category' && !NEWS_CATEGORY_VALUES.includes(textValue)) {
      fieldErrors[fieldKey] = '分类必须使用下拉中的系统值';
      return false;
    }

    if (fieldKey === 'title' && textValue.length < 4) {
      fieldErrors[fieldKey] = '标题至少 4 个字符';
      return false;
    }

    if (fieldKey === 'date' && !validateDateString(textValue)) {
      fieldErrors[fieldKey] = '日期格式无效，请使用日期选择器';
      return false;
    }

    if (fieldKey === 'author' && textValue.length < 2) {
      fieldErrors[fieldKey] = '作者名至少 2 个字符';
      return false;
    }

    if (fieldKey === 'excerpt') {
      const excerpt = stripHtml(textValue);
      if (excerpt.length < 10) {
        fieldErrors[fieldKey] = '摘要建议至少 10 个字符';
        return false;
      }
      if (excerpt.length > 120) {
        fieldErrors[fieldKey] = '摘要建议不超过 120 个字符';
        return false;
      }
    }

    if (fieldKey === 'content') {
      const contentLength = stripHtml(textValue).length;
      if (contentLength < 20) {
        fieldErrors[fieldKey] = '正文内容过短，至少 20 个字符';
        return false;
      }
    }
  }

  clearFieldError(fieldKey);
  return true;
};

const validateRequiredFields = () => {
  let valid = true;

  currentFields.value.forEach((field) => {
    if (!field.required) return;
    const value = editingItem.value[field.key];
    const isEmpty = value === null
      || value === undefined
      || (typeof value === 'string' && !value.trim())
      || (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      fieldErrors[field.key] = `${field.label}不能为空`;
      valid = false;
    }
  });

  return valid;
};

const validateNewsPayload = (payload) => {
  let valid = true;
  const normalizedId = Number(payload.id);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    fieldErrors.id = 'ID 必须是正整数';
    valid = false;
  } else {
    const duplicate = dataStore.news.some((item) => {
      const itemId = Number(item.id);
      if (!Number.isInteger(itemId)) return false;
      if (isEditing.value && itemId === Number(editingItem.value.id)) return false;
      return itemId === normalizedId;
    });
    if (duplicate) {
      fieldErrors.id = 'ID 已存在，请点击“自动生成 ID”';
      valid = false;
    }
  }

  if (!NEWS_CATEGORY_VALUES.includes(payload.category)) {
    fieldErrors.category = '分类值不合法，请从下拉中选择';
    valid = false;
  }

  if (!validateDateString(payload.date)) {
    fieldErrors.date = '日期无效，请重新选择';
    valid = false;
  }

  const plainExcerpt = stripHtml(payload.excerpt);
  const plainContent = stripHtml(payload.content);
  if (plainExcerpt.length < 10) {
    fieldErrors.excerpt = '摘要至少 10 个字符';
    valid = false;
  }
  if (plainContent.length < 20) {
    fieldErrors.content = '正文至少 20 个字符';
    valid = false;
  }

  return valid;
};

// ==================== 方法 ====================
const getTabCount = (tabId) => {
  switch (tabId) {
    case 'users': return stats.totalUsers;
    case 'points': return tabTotals.points;
    case 'subscriptions': return tabTotals.subscriptions;
    case 'gifts': return tabTotals.gifts;
    case 'forum': return stats.totalPosts;
    case 'reportedPosts': return tabTotals.reportedPosts;
    case 'reviewPosts': return tabTotals.reviewPosts;
    case 'reviewComments': return tabTotals.reviewComments;
    case 'reviewMessages': return tabTotals.reviewMessages;
    case 'coreMemories': return tabTotals.coreMemories;
    case 'lotteries': return stats.totalLotteries;
    case 'lotteryEntries': return stats.totalLotteryEntries;
    case 'lotteryDrawLogs': return stats.totalLotteryDrawLogs;
    case 'lotterySchedulerLogs': return stats.totalLotterySchedulerLogs;
    case 'lotteryNotificationJobs': return stats.totalLotteryNotificationJobs;
    case 'lotteryJoinAttempts': return stats.totalLotteryJoinAttempts;
    case 'news': return stats.totalNews;
    case 'activities': return stats.totalActivities;
    case 'products': return stats.totalProducts;
    default: return 0;
  }
};

const setTabButtonRef = (tabId, el) => {
  if (!el) return;
  tabButtonRefs.value[tabId] = el;
};

const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

const scrollActiveTabIntoView = (smooth = true) => {
  const currentBtn = tabButtonRefs.value[currentTab.value];
  if (!currentBtn || !tabsNavRef.value) return;

  currentBtn.scrollIntoView({
    block: 'nearest',
    inline: 'center',
    behavior: smooth ? 'smooth' : 'auto'
  });
};

const switchToAdjacentTab = (offset) => {
  const currentIndex = tabs.findIndex((tab) => tab.id === currentTab.value);
  if (currentIndex < 0) return;
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), tabs.length - 1);
  if (nextIndex !== currentIndex) {
    switchTab(tabs[nextIndex].id);
  }
};

const switchTab = (tabId, options = {}) => {
  currentTab.value = tabId;
  isMobileTabMenuOpen.value = false;
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  selectedItems.value = [];
  searchQuery.value = options.search || '';
  userPickerKeyword.value = '';
  showUserPickerModal.value = false;
  sortKey.value = '';
  clearFieldErrors();
  nextTick(() => scrollActiveTabIntoView(true));
  fetchTabData(tabId);
  if (lotteryOpsTabs.has(tabId)) {
    loadLotterySchedulerStatus();
  }
};

const switchTabFromMobile = (tabId) => {
  switchTab(tabId);
  isMobileTabMenuOpen.value = false;
};

const onTabsHeaderTouchStart = (event) => {
  if (!isMobileViewport()) return;
  const touch = event.touches?.[0];
  if (!touch) return;

  const target = event.target;
  if (target instanceof Element && (target.closest('.search-box') || target.closest('.mobile-tab-switcher'))) {
    tabsTouchState.active = false;
    return;
  }

  tabsTouchState.active = true;
  tabsTouchState.startX = touch.clientX;
  tabsTouchState.startY = touch.clientY;
  tabsTouchState.startAt = Date.now();
};

const onTabsHeaderTouchEnd = (event) => {
  if (!tabsTouchState.active || !isMobileViewport()) return;
  tabsTouchState.active = false;

  const touch = event.changedTouches?.[0];
  if (!touch) return;

  const deltaX = touch.clientX - tabsTouchState.startX;
  const deltaY = touch.clientY - tabsTouchState.startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  const duration = Date.now() - tabsTouchState.startAt;

  const isHorizontalSwipe = absX >= 42 && absX > absY * 1.2 && duration <= 700;
  if (!isHorizontalSwipe) return;

  if (deltaX < 0) {
    switchToAdjacentTab(1);
  } else {
    switchToAdjacentTab(-1);
  }
};

const handleSearch = () => {
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  if (searchDebounceTimer.value) clearTimeout(searchDebounceTimer.value);
  searchDebounceTimer.value = setTimeout(() => {
    fetchTabData(currentTab.value);
  }, 300);
};

const clearSearch = () => {
  searchQuery.value = '';
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  fetchTabData(currentTab.value);
};

const copyGiftAddressBundle = async () => {
  const content = giftAddressBundleText.value;
  if (!content) {
    showToast('暂无可复制的地址信息', 'error');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    showToast('地址信息已复制', 'success');
  } catch (error) {
    console.error('复制地址失败:', error);
    showToast('复制失败，请手动复制', 'error');
  }
};

const setImageUploadPending = (fieldKey, pending) => {
  const key = String(fieldKey || '').trim();
  if (!key) return;
  if (pending) {
    if (!uploadingImageFields.value.includes(key)) {
      uploadingImageFields.value = [...uploadingImageFields.value, key];
    }
    return;
  }
  uploadingImageFields.value = uploadingImageFields.value.filter((item) => item !== key);
};

const isImageUploadPending = (fieldKey) => {
  const key = String(fieldKey || '').trim();
  return Boolean(key && uploadingImageFields.value.includes(key));
};

const clearImageField = (fieldKey) => {
  editingItem.value[fieldKey] = '';
  clearFieldError(fieldKey);
};

const copyImageValue = async (fieldKey) => {
  const content = String(editingItem.value?.[fieldKey] || '').trim();
  if (!content) {
    showToast('暂无图片链接可复制', 'error');
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    showToast('图片链接已复制', 'success');
  } catch (error) {
    console.error('复制图片链接失败:', error);
    showToast('复制失败，请手动复制', 'error');
  }
};

const handleAdminImageUpload = async (event, field) => {
  const input = event?.target;
  const file = input?.files?.[0] || null;
  if (!file) return;

  try {
    assertAdminAction();
    if (!isCloudinaryNoteUploadConfigured()) {
      throw new Error('请先配置 Cloudinary 后再上传图片');
    }
    if (!String(file.type || '').startsWith('image/')) {
      throw new Error('仅支持上传图片文件');
    }

    const fieldKey = field.key;
    setImageUploadPending(fieldKey, true);
    const uploaded = await uploadImageToCloudinary(file, {
      folder: `boh-cloud-plus/admin-${currentTab.value}`
    });
    if (!uploaded.url) {
      throw new Error('Cloud 上传成功但没有返回图片地址');
    }
    editingItem.value[fieldKey] = uploaded.url;
    clearFieldError(fieldKey);
    showToast('图片已上传到 Cloud', 'success');
  } catch (error) {
    console.error('管理员图片上传失败:', error);
    showToast('图片上传失败: ' + buildActionErrorMessage(error, '图片上传失败'), 'error');
  } finally {
    setImageUploadPending(field?.key, false);
    if (input) input.value = '';
  }
};

const sortBy = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
  fetchTabData(currentTab.value);
};

const isSelected = (item) => {
  return selectedItems.value.some(selected => selected.id === item.id);
};

const toggleSelect = (item) => {
  const index = selectedItems.value.findIndex(selected => selected.id === item.id);
  if (index > -1) {
    selectedItems.value.splice(index, 1);
  } else {
    selectedItems.value.push(item);
  }
};

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedItems.value = selectedItems.value.filter(
      selected => !paginatedData.value.some(item => item.id === selected.id)
    );
  } else {
    const newSelections = paginatedData.value.filter(item => !isSelected(item));
    selectedItems.value.push(...newSelections);
  }
};

const itemIndex = (item) => {
  return currentData.value.findIndex(i => i.id === item.id);
};

const isFieldDisabled = (field) => {
  if (field.disabled) return true;

  if (currentTab.value === 'news' && field.key === 'id') return true;

  if (currentTab.value === 'gifts') {
    const alwaysReadonly = ['username', 'shipping_recipient', 'shipping_phone', 'shipping_address'];
    if (alwaysReadonly.includes(field.key)) return true;
    // 编辑礼物时不允许更换所属用户；新增时可填写 user_id。
    if (isEditing.value && field.key === 'user_id') return true;
  }

  return false;
};

const extractPostTitle = (post) => {
  const explicitTitle = String(post?.title || '').trim();
  if (explicitTitle) return explicitTitle;

  const content = String(post?.content || '').trim();
  if (!content) return '（无标题）';

  const bracketTitle = content.match(/^【([^】\n]{1,80})】/);
  if (bracketTitle?.[1]) return bracketTitle[1].trim();

  const firstLine = content.split('\n').find((line) => line.trim());
  if (!firstLine) return '（无标题）';

  return firstLine.trim().slice(0, 40);
};

const collectReportSummary = (reports = []) => {
  const normalizedReports = Array.isArray(reports) ? reports : [];
  const activeReports = normalizedReports
    .filter((report) => String(report?.status || '').trim() === 'active');
  const displayReports = activeReports.length > 0 ? activeReports : normalizedReports;

  const reasons = [];
  const seenReasons = new Set();
  let latestReportAt = '';

  displayReports.forEach((report) => {
    const reason = String(report?.reason || '').trim();
    if (reason && !seenReasons.has(reason)) {
      seenReasons.add(reason);
      reasons.push(reason);
    }

    const createdAt = String(report?.created_at || '').trim();
    if (createdAt) {
      const createdTs = Date.parse(createdAt);
      const latestTs = Date.parse(latestReportAt || '');
      if (Number.isFinite(createdTs) && (!Number.isFinite(latestTs) || createdTs > latestTs)) {
        latestReportAt = createdAt;
      }
    }
  });

  return {
    activeReportCount: activeReports.length || normalizedReports.length,
    reportReasons: reasons,
    latestReportAt
  };
};

const syncCoreMemoriesIndex = async () => {
  try {
    await supabase.functions.invoke('boh-ai-retrieval', {
      body: {
        action: 'sync',
        sourceTypes: ['core_memory'],
        syncLimit: 80
      }
    });
  } catch (error) {
    console.warn('同步官方事实向量索引失败:', error);
  }
};

const TAB_SELECT_COLUMNS = {
  users: 'id, username, email, role, points, experience, join_date, bio, avatar_url, tags, shipping_recipient, shipping_phone, shipping_address',
  points: 'id, username, email, role, points, experience, join_date',
  subscriptions: `
    id,
    user_id,
    plan_code,
    plan_name,
    billing_cycle,
    points_cost,
    duration_months,
    started_at,
    expires_at,
    status,
    metadata,
    created_at,
    updated_at,
    profile:user_id(username, email)
  `,
  gifts: `
    id,
    user_id,
    gift_no,
    gift_content,
    gift_price,
    gift_image,
    gift_status,
    is_active,
    created_at,
    completed_at,
    updated_at,
    profile:user_id(username, shipping_recipient, shipping_phone, shipping_address)
  `,
  forum: `
    id,
    content,
    author_id,
    author_username,
    created_at,
    updated_at,
    status,
    likes_count:likes(count)
  `,
  reportedPosts: `
    id,
    content,
    author_id,
    author_username,
    created_at,
    updated_at,
    status,
    reports:forum_post_reports(id, reason, detail, status, created_at, reporter_id)
  `,
  reviewPosts: 'id, content, author_id, author_username, created_at, updated_at, status',
  reviewComments: 'id, post_id, author_id, author_username, content, created_at, status, parent_id, reply_to_username',
  reviewMessages: 'id, sender_id, sender_name, receiver_id, receiver_name, subject, content, status, moderation_status, moderation_reason, created_at',
  coreMemories: 'id, title, content, category, tags, priority, source_label, source_url, status, updated_by, created_at, updated_at',
  lotteries: 'id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, draw_attempted_at, draw_failed_at, draw_failure_message, draw_entry_count_snapshot, draw_candidate_hash, draw_algorithm_version, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at',
  lotteryEntries: `
    id,
    lottery_id,
    user_id,
    username_snapshot,
    created_at,
    lottery:lottery_id(title),
    profile:user_id(username, email, join_date)
  `,
  lotteryDrawLogs: `
    id,
    lottery_id,
    draw_no,
    winner_position,
    entry_id,
    user_id,
    username_snapshot,
    drawn_by,
    reason,
    created_at,
    lottery:lottery_id(title),
    drawer:drawn_by(username, email)
  `,
  lotterySchedulerLogs: `
    id,
    run_source,
    status,
    checked_count,
    drawn_count,
    failed_count,
    due_count,
    started_at,
    finished_at,
    duration_ms,
    error_message,
    details,
    created_at
  `,
  lotteryNotificationJobs: `
    id,
    lottery_id,
    draw_no,
    winner_position,
    user_id,
    type,
    content,
    status,
    notification_id,
    attempt_count,
    last_error,
    created_at,
    updated_at,
    lottery:lottery_id(title),
    profile:user_id(username, email)
  `,
  lotteryJoinAttempts: `
    id,
    lottery_id,
    user_id,
    result_code,
    message,
    created_at,
    lottery:lottery_id(title),
    profile:user_id(username, email)
  `,
  news: 'id, category, title, excerpt, date, author, image, content, created_at, updated_at',
  activities: 'id, title, date, image, description, created_at, updated_at',
  products: 'id, title, category, description, points_cost, stock, image, specifications'
};

const LOTTERY_LEGACY_SELECT_COLUMNS = 'id, title, description, prize_title, prize_description, cover_image_url, status, is_community_visible, max_entries, winner_count, entry_deadline_at, draw_at, drawn_at, winner_entry_id, winner_user_id, winner_username, fulfillment_status, created_by, updated_by, created_at, updated_at';

const isMissingLotteryObservabilitySchemaError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42703'
    || message.includes('draw_attempted_at')
    || message.includes('draw_failed_at')
    || message.includes('draw_candidate_hash')
    || message.includes('lottery_scheduler_logs')
    || message.includes('lottery_notification_jobs');
};

const TAB_DEFAULT_SORT = {
  users: { column: 'join_date', ascending: false },
  points: { column: 'points', ascending: false },
  subscriptions: { column: 'expires_at', ascending: false },
  gifts: { column: 'created_at', ascending: false },
  forum: { column: 'created_at', ascending: false },
  reportedPosts: { column: 'updated_at', ascending: false },
  reviewPosts: { column: 'created_at', ascending: false },
  reviewComments: { column: 'created_at', ascending: false },
  reviewMessages: { column: 'created_at', ascending: false },
  coreMemories: { column: 'priority', ascending: false, secondary: { column: 'updated_at', ascending: false } },
  lotteries: { column: 'created_at', ascending: false },
  lotteryEntries: { column: 'created_at', ascending: true },
  lotteryDrawLogs: { column: 'created_at', ascending: false },
  lotterySchedulerLogs: { column: 'started_at', ascending: false },
  lotteryNotificationJobs: { column: 'created_at', ascending: false },
  lotteryJoinAttempts: { column: 'created_at', ascending: false },
  news: { column: 'date', ascending: false },
  activities: { column: 'date', ascending: false },
  products: { column: 'id', ascending: true }
};

const TAB_SORT_COLUMNS = {
  users: new Set(['username', 'email', 'role', 'points', 'join_date']),
  points: new Set(['username', 'role', 'points', 'experience', 'join_date']),
  subscriptions: new Set(['plan_code', 'billing_cycle', 'status', 'started_at', 'expires_at', 'points_cost']),
  gifts: new Set(['created_at', 'completed_at', 'gift_status', 'gift_price']),
  forum: new Set(['created_at', 'status', 'author_username']),
  reportedPosts: new Set(['updated_at', 'created_at', 'status', 'author_username']),
  reviewPosts: new Set(['created_at', 'status', 'author_username']),
  reviewComments: new Set(['created_at', 'status', 'author_username']),
  reviewMessages: new Set(['created_at', 'moderation_status', 'sender_name', 'receiver_name']),
  coreMemories: new Set(['priority', 'updated_at', 'category', 'status']),
  lotteries: new Set(['created_at', 'status', 'fulfillment_status', 'draw_at', 'drawn_at']),
  lotteryEntries: new Set(['created_at', 'lottery_id', 'user_id']),
  lotteryDrawLogs: new Set(['created_at', 'draw_no', 'lottery_id']),
  lotterySchedulerLogs: new Set(['started_at', 'status', 'run_source', 'due_count', 'failed_count']),
  lotteryNotificationJobs: new Set(['created_at', 'status', 'lottery_id', 'user_id', 'draw_no']),
  lotteryJoinAttempts: new Set(['created_at', 'result_code', 'lottery_id', 'user_id']),
  news: new Set(['id', 'date', 'category', 'author']),
  activities: new Set(['id', 'date', 'created_at']),
  products: new Set(['id', 'category', 'points_cost', 'stock'])
};

const TAB_SEARCH_FIELDS = {
  users: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'email', type: 'text' }, { column: 'role', type: 'text' }],
  points: [{ column: 'id', type: 'uuid' }, { column: 'username', type: 'text' }, { column: 'email', type: 'text' }, { column: 'role', type: 'text' }],
  subscriptions: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'plan_code', type: 'text' }, { column: 'plan_name', type: 'text' }, { column: 'status', type: 'text' }],
  gifts: [{ column: 'id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'gift_no', type: 'text' }, { column: 'gift_content', type: 'text' }, { column: 'gift_status', type: 'text' }],
  forum: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reportedPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewPosts: [{ column: 'id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewComments: [{ column: 'id', type: 'uuid' }, { column: 'post_id', type: 'uuid' }, { column: 'author_id', type: 'uuid' }, { column: 'author_username', type: 'text' }, { column: 'content', type: 'text' }, { column: 'status', type: 'text' }],
  reviewMessages: [{ column: 'id', type: 'uuid' }, { column: 'sender_id', type: 'uuid' }, { column: 'receiver_id', type: 'uuid' }, { column: 'sender_name', type: 'text' }, { column: 'receiver_name', type: 'text' }, { column: 'subject', type: 'text' }, { column: 'content', type: 'text' }, { column: 'moderation_status', type: 'text' }],
  coreMemories: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'content', type: 'text' }, { column: 'category', type: 'text' }, { column: 'status', type: 'text' }],
  lotteries: [{ column: 'id', type: 'uuid' }, { column: 'title', type: 'text' }, { column: 'prize_title', type: 'text' }, { column: 'status', type: 'text' }, { column: 'fulfillment_status', type: 'text' }, { column: 'winner_username', type: 'text' }],
  lotteryEntries: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }],
  lotteryDrawLogs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'username_snapshot', type: 'text' }, { column: 'reason', type: 'text' }],
  lotterySchedulerLogs: [{ column: 'id', type: 'uuid' }, { column: 'run_source', type: 'text' }, { column: 'status', type: 'text' }, { column: 'error_message', type: 'text' }],
  lotteryNotificationJobs: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'status', type: 'text' }, { column: 'last_error', type: 'text' }],
  lotteryJoinAttempts: [{ column: 'id', type: 'uuid' }, { column: 'lottery_id', type: 'uuid' }, { column: 'user_id', type: 'uuid' }, { column: 'result_code', type: 'text' }, { column: 'message', type: 'text' }],
  news: [{ column: 'id', type: 'number' }, { column: 'category', type: 'text' }, { column: 'title', type: 'text' }, { column: 'excerpt', type: 'text' }, { column: 'author', type: 'text' }],
  activities: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'date', type: 'text' }, { column: 'description', type: 'text' }],
  products: [{ column: 'id', type: 'number' }, { column: 'title', type: 'text' }, { column: 'category', type: 'text' }, { column: 'description', type: 'text' }]
};

const sanitizeSearchTerm = (value) => String(value || '')
  .trim()
  .replace(/[,%()]/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 120);

const buildSearchFilters = (tabId) => {
  const keyword = sanitizeSearchTerm(searchQuery.value);
  if (!keyword) return [];

  const isUuid = UUID_REGEX.test(keyword);
  const isInteger = /^\d+$/.test(keyword);

  return (TAB_SEARCH_FIELDS[tabId] || []).flatMap((field) => {
    if (field.type === 'uuid') {
      return isUuid ? [`${field.column}.eq.${keyword}`] : [];
    }
    if (field.type === 'number') {
      return isInteger ? [`${field.column}.eq.${keyword}`] : [];
    }
    return [`${field.column}.ilike.%${keyword}%`];
  });
};

const applySearchAndSort = (query, tabId) => {
  const searchFilters = buildSearchFilters(tabId);
  let nextQuery = query;
  if (searchFilters.length > 0) {
    nextQuery = nextQuery.or(searchFilters.join(','));
  }

  const sortableColumns = TAB_SORT_COLUMNS[tabId] || new Set();
  const configuredSort = sortableColumns.has(sortKey.value)
    ? { column: sortKey.value, ascending: sortOrder.value === 'asc' }
    : TAB_DEFAULT_SORT[tabId];

  if (configuredSort?.column) {
    nextQuery = nextQuery.order(configuredSort.column, { ascending: configuredSort.ascending });
  }
  if (configuredSort?.secondary?.column) {
    nextQuery = nextQuery.order(configuredSort.secondary.column, { ascending: configuredSort.secondary.ascending });
  }

  return nextQuery;
};

const paginateQuery = (query) => {
  const limit = Math.max(1, Number(pageSize.value) || 20);
  const from = Math.max(0, (Math.max(1, Number(currentPage.value) || 1) - 1) * limit);
  return query.range(from, from + limit - 1);
};

const normalizeJoinedObject = (value) => Array.isArray(value) ? (value[0] || {}) : (value || {});

const getLotteryDrawDelayLabel = (lottery) => {
  const planned = Date.parse(lottery?.draw_at || '');
  const actual = Date.parse(lottery?.drawn_at || '');
  if (!Number.isFinite(planned)) return '未设置';
  if (!Number.isFinite(actual)) {
    if (String(lottery?.status || '') === 'open' && planned <= Date.now()) return '待调度';
    return '未开奖';
  }
  const diffSeconds = Math.max(0, Math.round((actual - planned) / 1000));
  if (diffSeconds <= 60) return '准点';
  const diffMinutes = Math.ceil(diffSeconds / 60);
  return `延迟 ${diffMinutes} 分钟`;
};

const getSchedulerRunSourceLabel = (value) => {
  const source = String(value || '').trim();
  if (source === 'manual_admin') return '手动补跑';
  if (source === 'scheduled') return '定时任务';
  return source || '未知';
};

const getDurationLabel = (durationMs) => {
  const value = Number(durationMs);
  if (!Number.isFinite(value) || value < 0) return '-';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
};

const updateCountsForTab = (tabId, total) => {
  setTabTotal(tabId, total);
};

const assignTabRows = (tabId, rows, total) => {
  dataStore[tabId] = rows;
  updateCountsForTab(tabId, Number.isFinite(Number(total)) ? Number(total) : rows.length);
};

const fetchCount = async (table, configure = (query) => query) => {
  const { count, error } = await configure(
    supabase.from(table).select('id', { count: 'exact', head: true })
  );
  if (error) throw error;
  return count || 0;
};

const fetchStats = async () => {
  const applyCountMap = (countMap = {}) => {
    Object.entries(countMap).forEach(([key, value]) => {
      if (key === 'ok' || key === 'code') return;
      if (key === 'activeSubscriptions') {
        stats.totalSubscriptions = Number(value || 0);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(tabTotals, key)) {
        setTabTotal(key, value);
      }
    });

    stats.totalUsers = tabTotals.users;
    stats.totalPosts = tabTotals.forum;
    stats.totalCoreMemories = tabTotals.coreMemories;
    stats.totalLotteries = tabTotals.lotteries;
    stats.totalLotteryEntries = tabTotals.lotteryEntries;
    stats.totalLotteryDrawLogs = tabTotals.lotteryDrawLogs;
    stats.totalLotterySchedulerLogs = tabTotals.lotterySchedulerLogs;
    stats.totalLotteryNotificationJobs = tabTotals.lotteryNotificationJobs;
    stats.totalLotteryJoinAttempts = tabTotals.lotteryJoinAttempts;
    stats.totalNews = tabTotals.news;
    stats.totalActivities = tabTotals.activities;
    stats.totalProducts = tabTotals.products;
  };

  const { data: rpcCounts, error: rpcCountsError } = await supabase.rpc('admin_data_management_counts');
  if (!rpcCountsError && rpcCounts?.ok) {
    applyCountMap(rpcCounts);
    return;
  }
  if (rpcCountsError && !isMissingRpcFunctionError(rpcCountsError, 'admin_data_management_counts')) {
    console.warn('获取数据管理统计 RPC 失败，回退到 head count:', rpcCountsError);
  }

  const nowIso = new Date().toISOString();
  const countTasks = {
    users: fetchCount('profiles'),
    points: fetchCount('profiles'),
    subscriptions: fetchCount('user_subscriptions'),
    activeSubscriptions: fetchCount('user_subscriptions', (query) => query.eq('status', 'active').gt('expires_at', nowIso)),
    gifts: fetchCount('user_gifts'),
    forum: fetchCount('posts'),
    reportedPosts: fetchCount('posts', (query) => query.eq('status', 'limited')),
    reviewPosts: fetchCount('posts', (query) => query.ilike('status', 'rejected')),
    reviewComments: fetchCount('comments', (query) => query.ilike('status', 'rejected')),
    reviewMessages: fetchCount('messages', (query) => query.ilike('moderation_status', 'rejected')),
    coreMemories: fetchCount('boh_ai_core_memories'),
    lotteries: fetchCount('lotteries'),
    lotteryEntries: fetchCount('lottery_entries'),
    lotteryDrawLogs: fetchCount('lottery_draw_logs'),
    lotterySchedulerLogs: fetchCount('lottery_scheduler_logs'),
    lotteryNotificationJobs: fetchCount('lottery_notification_jobs'),
    lotteryJoinAttempts: fetchCount('lottery_join_attempts'),
    news: fetchCount('news'),
    activities: fetchCount('activities'),
    products: fetchCount('products')
  };

  const entries = await Promise.allSettled(
    Object.entries(countTasks).map(async ([key, task]) => [key, await task])
  );

  const fallbackCounts = {};
  entries.forEach((entry) => {
    if (entry.status !== 'fulfilled') {
      console.warn('获取数据管理统计失败:', entry.reason);
      return;
    }
    const [key, value] = entry.value;
    fallbackCounts[key] = value;
  });

  applyCountMap(fallbackCounts);
};

const fetchTabData = async (tabId = currentTab.value) => {
  const fetchId = activeFetchId.value + 1;
  activeFetchId.value = fetchId;
  isLoading.value = true;

  try {
    const table = dataConfig[tabId]?.table;
    const selectColumns = TAB_SELECT_COLUMNS[tabId];
    if (!table || !selectColumns) return;

    let query = supabase
      .from(table)
      .select(selectColumns, { count: 'exact' });

    if (tabId === 'reportedPosts') {
      query = query.eq('status', 'limited');
    } else if (tabId === 'reviewPosts') {
      query = query.ilike('status', 'rejected');
    } else if (tabId === 'reviewComments') {
      query = query.ilike('status', 'rejected');
    } else if (tabId === 'reviewMessages') {
      query = query.ilike('moderation_status', 'rejected');
    }

    let { data, error, count } = await paginateQuery(applySearchAndSort(query, tabId));

    if (tabId === 'lotteries' && error && isMissingLotteryObservabilitySchemaError(error)) {
      console.warn('抽奖观测字段尚未部署，使用旧字段兜底加载:', error);
      let fallbackQuery = supabase
        .from(table)
        .select(LOTTERY_LEGACY_SELECT_COLUMNS, { count: 'exact' });
      ({ data, error, count } = await paginateQuery(applySearchAndSort(fallbackQuery, tabId)));
    }

    if (fetchId !== activeFetchId.value) return;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const offset = Math.max(0, ((Number(currentPage.value) || 1) - 1) * (Number(pageSize.value) || 20));

    if (tabId === 'users' || tabId === 'points') {
      assignTabRows(tabId, rows, count);
      if (tabId === 'users') dataStore.points = dataStore.points.length ? dataStore.points : rows;
      if (tabId === 'points') dataStore.users = dataStore.users.length ? dataStore.users : rows;
      return;
    }

    if (tabId === 'subscriptions') {
      assignTabRows(tabId, rows.map((subscription) => {
        const { profile: rawProfile, ...restSubscription } = subscription;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restSubscription,
          username: profile.username || '-',
          email: profile.email || '-'
        };
      }), count);
      return;
    }

    if (tabId === 'gifts') {
      let normalizedGifts = [...rows];
      const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);
      if (expiredGiftIds.length > 0) {
        normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);
        supabase
          .from('user_gifts')
          .update({ is_active: false })
          .in('id', expiredGiftIds)
          .then(({ error: archiveError }) => {
            if (archiveError) console.warn('自动归档过期礼物失败:', archiveError);
          });
      }

      assignTabRows(tabId, normalizedGifts.map((gift) => {
        const { profile: rawProfile, ...restGift } = gift;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restGift,
          username: profile.username || '-',
          shipping_recipient: profile.shipping_recipient || '-',
          shipping_phone: profile.shipping_phone || '-',
          shipping_address: profile.shipping_address || '-',
          gift_scope_label: gift.is_active ? '当前礼物' : '历史礼物',
          completed_at: gift.gift_status === 'completed'
            ? (gift.completed_at || gift.updated_at || gift.created_at)
            : null
        };
      }), count);
      return;
    }

    if (tabId === 'forum') {
      assignTabRows(tabId, rows.map((post) => ({
        ...post,
        title: extractPostTitle(post),
        likes_count: post.likes_count?.[0]?.count || post.like_count || 0,
        status: post.status || 'approved'
      })), count);
      return;
    }

    if (tabId === 'reportedPosts') {
      assignTabRows(tabId, rows.map((post) => {
        const summary = collectReportSummary(post.reports);
        return {
          ...post,
          title: extractPostTitle(post),
          active_report_count: summary.activeReportCount,
          report_reasons: summary.reportReasons,
          latest_report_at: summary.latestReportAt,
          status: post.status || 'limited'
        };
      }), count);
      return;
    }

    if (tabId === 'reviewPosts') {
      assignTabRows(tabId, rows.map((post) => ({
        ...post,
        title: extractPostTitle(post)
      })), count);
      return;
    }

    if (tabId === 'lotteries') {
      const lotteryIds = rows.map((lottery) => lottery.id).filter(Boolean);
      const lotteryEntryCounts = new Map();
      if (lotteryIds.length > 0) {
        const { data: rpcEntryCountRows, error: rpcEntryCountError } = await supabase.rpc('admin_lottery_entry_counts', {
          p_lottery_ids: lotteryIds
        });

        if (!rpcEntryCountError) {
          (rpcEntryCountRows || []).forEach((entry) => {
            const lotteryId = String(entry?.lottery_id || '');
            if (!lotteryId) return;
            lotteryEntryCounts.set(lotteryId, Number(entry.entry_count || 0));
          });
        } else {
          if (!isMissingRpcFunctionError(rpcEntryCountError, 'admin_lottery_entry_counts')) {
            console.warn('抽奖报名人数 RPC 失败，回退到轻量列表计数:', rpcEntryCountError);
          }
          const { data: entryCountRows, error: entryCountError } = await supabase
            .from('lottery_entries')
            .select('lottery_id')
            .in('lottery_id', lotteryIds);
          if (entryCountError) {
            console.warn('获取抽奖报名人数失败:', entryCountError);
          } else {
            (entryCountRows || []).forEach((entry) => {
              const lotteryId = String(entry?.lottery_id || '');
              if (!lotteryId) return;
              lotteryEntryCounts.set(lotteryId, (lotteryEntryCounts.get(lotteryId) || 0) + 1);
            });
          }
        }
      }

      assignTabRows(tabId, rows.map((lottery) => ({
        ...lottery,
        entry_count: lotteryEntryCounts.get(String(lottery.id || '')) || 0,
        is_community_visible_label: lottery.is_community_visible ? '社区显示' : '社区隐藏',
        max_entries_label: lottery.max_entries ? String(lottery.max_entries) : '不限',
        draw_delay_label: getLotteryDrawDelayLabel(lottery)
      })), count);
      return;
    }

    if (tabId === 'lotteryEntries') {
      assignTabRows(tabId, rows.map((entry, index) => {
        const profile = normalizeJoinedObject(entry.profile);
        const lottery = normalizeJoinedObject(entry.lottery);
        return {
          ...entry,
          lottery_title: lottery.title || '-',
          username: entry.username_snapshot || profile.username || profile.email || '-',
          user_created_at: profile.join_date || null,
          entry_number: offset + index + 1
        };
      }), count);
      return;
    }

    if (tabId === 'lotteryDrawLogs') {
      assignTabRows(tabId, rows.map((log) => {
        const lottery = normalizeJoinedObject(log.lottery);
        const drawer = normalizeJoinedObject(log.drawer);
        return {
          ...log,
          lottery_title: lottery.title || '-',
          drawn_by_username: drawer.username || drawer.email || (log.drawn_by ? '管理员' : '系统')
        };
      }), count);
      return;
    }

    if (tabId === 'lotterySchedulerLogs') {
      assignTabRows(tabId, rows.map((log) => ({
        ...log,
        run_source_label: getSchedulerRunSourceLabel(log.run_source),
        duration_label: getDurationLabel(log.duration_ms)
      })), count);
      return;
    }

    if (tabId === 'lotteryNotificationJobs') {
      assignTabRows(tabId, rows.map((job) => {
        const lottery = normalizeJoinedObject(job.lottery);
        const profile = normalizeJoinedObject(job.profile);
        return {
          ...job,
          lottery_title: lottery.title || '-',
          username: profile.username || profile.email || '-'
        };
      }), count);
      return;
    }

    if (tabId === 'lotteryJoinAttempts') {
      assignTabRows(tabId, rows.map((attempt) => {
        const lottery = normalizeJoinedObject(attempt.lottery);
        const profile = normalizeJoinedObject(attempt.profile);
        return {
          ...attempt,
          lottery_title: lottery.title || '-',
          username: profile.username || profile.email || '-'
        };
      }), count);
      return;
    }

    assignTabRows(tabId, rows, count);
  } catch (error) {
    console.error('获取数据失败:', error);
    dataStore[tabId] = [];
    showToast('获取数据失败: ' + buildActionErrorMessage(error, '获取数据失败'), 'error');
  } finally {
    if (fetchId === activeFetchId.value) {
      isLoading.value = false;
    }
  }
};

// ==================== 数据操作 ====================
const fetchData = async () => {
  await Promise.allSettled([
    fetchStats(),
    fetchTabData(currentTab.value),
    isLotteryOpsTab.value ? loadLotterySchedulerStatus() : Promise.resolve()
  ]);
};

const refreshAllData = async () => {
  isRefreshing.value = true;
  await fetchData();
  isRefreshing.value = false;
  showToast('数据已刷新', 'success');
};

const loadLotterySchedulerStatus = async () => {
  if (!isCurrentUserAdmin.value) return;
  lotterySchedulerStatusLoading.value = true;
  try {
    const { data, error } = await supabase.rpc('admin_lottery_scheduler_status');
    if (error) throw error;
    if (data?.ok) {
      lotterySchedulerStatus.value = data;
    }
  } catch (error) {
    if (!isMissingRpcFunctionError(error, 'admin_lottery_scheduler_status')) {
      console.warn('获取抽奖定时任务状态失败:', error);
    }
  } finally {
    lotterySchedulerStatusLoading.value = false;
  }
};

const runDueLotteryDraws = async () => {
  if (lotteryDueDrawPending.value) return;
  if (!confirm('确定要立即执行所有已到期但未开奖的抽奖吗？')) return;

  lotteryDueDrawPending.value = true;
  try {
    assertAdminAction();
    const { data, error } = await supabase.rpc('execute_due_lottery_draws', {
      p_limit: 100,
      p_run_source: 'manual_admin'
    });
    if (error) throw error;
    if (!data?.ok) {
      throw new Error(String(data?.message || '执行到期开奖任务失败'));
    }
    showToast(`已扫描 ${Number(data.checked || 0)} 个，到期开奖 ${Number(data.drawn || 0)} 个，失败 ${Number(data.failed || 0)} 个`, Number(data.failed || 0) > 0 ? 'error' : 'success');
    await fetchData();
  } catch (error) {
    console.error('执行到期开奖任务失败:', error);
    showToast('执行失败: ' + buildActionErrorMessage(error, '执行到期开奖任务失败'), 'error');
  } finally {
    lotteryDueDrawPending.value = false;
  }
};

const toDateTimeInputValue = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const toISOStringFromInput = (dateInput) => {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

// ==================== 编辑模态框 ====================
const openEditModal = async (item = null) => {
  jsonBuffers.value = {};
  clearFieldErrors();
  userPickerKeyword.value = '';
  showUserPickerModal.value = false;
  if (item) {
    isEditing.value = true;
    editingItem.value = { ...item };

    if (currentTab.value === 'forum') {
      const { title, body } = splitForumContent(item.content);
      editingItem.value.title = String(item.title || title || '').trim();
      editingItem.value.content = body || '';
      if (!editingItem.value.status) {
        editingItem.value.status = 'approved';
      }
    }

    if (currentTab.value === 'subscriptions') {
      const planCode = String(editingItem.value.plan_code || '').trim();
      if (!editingItem.value.plan_name && planCode) {
        editingItem.value.plan_name = SUBSCRIPTION_PLAN_NAMES[planCode] || planCode;
      }
      if (!editingItem.value.billing_cycle) {
        editingItem.value.billing_cycle = 'monthly';
      }
      if (!editingItem.value.status) {
        editingItem.value.status = 'active';
      }
    }

    // 初始化 JSON/日期时间缓冲区
    currentFields.value.forEach(field => {
      if (field.type === 'json' && item[field.key]) {
        jsonBuffers.value[field.key] = JSON.stringify(item[field.key], null, 2);
      }
      if (field.type === 'datetime') {
        editingItem.value[field.key] = toDateTimeInputValue(item[field.key]);
      }
      if (field.type === 'date') {
        editingItem.value[field.key] = toDateInputValue(item[field.key]);
      }
    });
  } else {
    isEditing.value = false;
    editingItem.value = {};
    // 初始化默认值
    currentFields.value.forEach(field => {
      if (field.type === 'tags' || field.type === 'specifications') {
        editingItem.value[field.key] = [];
      } else if (field.type === 'json') {
        editingItem.value[field.key] = {};
        jsonBuffers.value[field.key] = '{}';
      }
    });

    if (currentTab.value === 'gifts') {
      const year = new Date().getFullYear();
      const serial = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      editingItem.value.user_id = '';
      editingItem.value.username = '';
      editingItem.value.shipping_recipient = '';
      editingItem.value.shipping_phone = '';
      editingItem.value.shipping_address = '';
      editingItem.value.gift_no = `BOH-${year}-${serial}`;
      editingItem.value.gift_status = 'preparing';
      editingItem.value.gift_price = 0;
      editingItem.value.is_active = true;
      editingItem.value.completed_at = '';
    }

    if (currentTab.value === 'subscriptions') {
      const now = new Date();
      const expires = new Date(now);
      expires.setMonth(expires.getMonth() + 1);
      editingItem.value.user_id = '';
      editingItem.value.username = '';
      editingItem.value.email = '';
      editingItem.value.plan_code = 'boh-ai-plus';
      editingItem.value.plan_name = SUBSCRIPTION_PLAN_NAMES['boh-ai-plus'];
      editingItem.value.billing_cycle = 'monthly';
      editingItem.value.points_cost = 120;
      editingItem.value.duration_months = 1;
      editingItem.value.started_at = toDateTimeInputValue(now);
      editingItem.value.expires_at = toDateTimeInputValue(expires);
      editingItem.value.status = 'active';
      editingItem.value.metadata = {};
      jsonBuffers.value.metadata = '{}';
    }

    if (currentTab.value === 'news') {
      editingItem.value.id = await fetchNextNumericId('news', dataStore.news);
      editingItem.value.category = 'update';
      editingItem.value.title = '';
      editingItem.value.excerpt = '';
      editingItem.value.content = '';
      editingItem.value.date = toDateInputValue(new Date());
      editingItem.value.author = userInfo?.username || localStorage.getItem('username') || 'admin';
      editingItem.value.image = '';
      injectNewsTemplate(false);
    }

    if (currentTab.value === 'forum') {
      editingItem.value.title = '';
      editingItem.value.content = '';
      editingItem.value.author_id = userInfo?.id || '';
      editingItem.value.author_username = userInfo?.username || localStorage.getItem('username') || '';
      editingItem.value.status = 'approved';
    }

    if (currentTab.value === 'coreMemories') {
      editingItem.value.title = '';
      editingItem.value.category = 'general';
      editingItem.value.status = 'active';
      editingItem.value.priority = 50;
      editingItem.value.source_label = 'BOH 官方';
      editingItem.value.source_url = '';
      editingItem.value.tags = [];
      editingItem.value.content = '';
    }

    if (currentTab.value === 'lotteries') {
      editingItem.value.title = '';
      editingItem.value.description = '';
      editingItem.value.prize_title = '';
      editingItem.value.prize_description = '';
      editingItem.value.cover_image_url = '';
      editingItem.value.status = 'open';
      editingItem.value.fulfillment_status = 'pending_contact';
      editingItem.value.is_community_visible = true;
      editingItem.value.max_entries = null;
      editingItem.value.winner_count = 1;
      editingItem.value.entry_deadline_at = '';
      editingItem.value.draw_at = '';
      editingItem.value.drawn_at = '';
      editingItem.value.winner_username = '';
    }

    if (currentTab.value === 'activities') {
      editingItem.value.id = await fetchNextNumericId('activities', dataStore.activities);
      editingItem.value.title = '';
      editingItem.value.date = toDateInputValue(new Date());
      editingItem.value.description = '';
      editingItem.value.image = '';
    }

    if (currentTab.value === 'products') {
      editingItem.value.id = await fetchNextNumericId('products', dataStore.products);
      editingItem.value.title = '';
      editingItem.value.category = PRODUCT_CATEGORY_OPTIONS[0].value;
      editingItem.value.description = '';
      editingItem.value.points_cost = 0;
      editingItem.value.stock = 0;
      editingItem.value.image = '';
      editingItem.value.specifications = [];
    }
  }
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  showUserPickerModal.value = false;
  userPickerKeyword.value = '';
  editingItem.value = {};
  jsonBuffers.value = {};
  clearFieldErrors();
};

const fetchUserPickerUsers = async () => {
  const fetchId = userPickerFetchId.value + 1;
  userPickerFetchId.value = fetchId;
  userPickerLoading.value = true;
  try {
    let query = supabase
      .from('profiles')
      .select('id, username, email, shipping_recipient, shipping_phone, shipping_address')
      .order('username', { ascending: true })
      .limit(200);

    const keyword = sanitizeSearchTerm(userPickerKeyword.value);
    if (keyword) {
      const filters = [
        `username.ilike.%${keyword}%`,
        `email.ilike.%${keyword}%`,
        `shipping_recipient.ilike.%${keyword}%`,
        `shipping_phone.ilike.%${keyword}%`
      ];
      if (UUID_REGEX.test(keyword)) filters.unshift(`id.eq.${keyword}`);
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;
    if (fetchId !== userPickerFetchId.value) return;
    if (error) throw error;
    userPickerUsers.value = Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('加载用户选择器失败:', error);
    showToast('加载用户列表失败', 'error');
  } finally {
    if (fetchId === userPickerFetchId.value) {
      userPickerLoading.value = false;
    }
  }
};

const openUserPicker = () => {
  if (!['gifts', 'subscriptions'].includes(currentTab.value)) return;
  showUserPickerModal.value = true;
  fetchUserPickerUsers();
};

const closeUserPicker = () => {
  showUserPickerModal.value = false;
};

const selectGiftUser = (user) => {
  editingItem.value.user_id = user.id;
  editingItem.value.username = user.username || '';
  editingItem.value.email = user.email || '';
  editingItem.value.shipping_recipient = user.shipping_recipient || '';
  editingItem.value.shipping_phone = user.shipping_phone || '';
  editingItem.value.shipping_address = user.shipping_address || '';
  showUserPickerModal.value = false;
};

const clearSelectedGiftUser = () => {
  editingItem.value.user_id = '';
  editingItem.value.username = '';
  editingItem.value.email = '';
  editingItem.value.shipping_recipient = '';
  editingItem.value.shipping_phone = '';
  editingItem.value.shipping_address = '';
};

const saveData = async () => {
  if (isSaving.value) return;
  isSaving.value = true;
  try {
    assertAdminAction();
    clearFieldErrors();

    if (currentTab.value === 'news') {
      injectNewsTemplate(false);
      generateExcerptFromContent(false);
    }

    if (!validateRequiredFields()) {
      showToast('请先补全必填字段', 'error');
      isSaving.value = false;
      return;
    }

    const hasInvalidField = currentFields.value.some((field) => !validateField(field.key));
    if (hasInvalidField) {
      showToast('请修复表单错误后再保存', 'error');
      isSaving.value = false;
      return;
    }

    // 处理 JSON 字段
    for (const field of currentFields.value) {
      if (field.type === 'json' && jsonBuffers.value[field.key]) {
        try {
          editingItem.value[field.key] = JSON.parse(jsonBuffers.value[field.key]);
        } catch (_e) {
          showToast(`${field.label} JSON 格式错误`, 'error');
          isSaving.value = false;
          return;
        }
      }
    }

    const table = currentConfig.value.table;
    let dataToSave = pickWritableFields(currentTab.value, { ...editingItem.value });

    if (currentTab.value === 'users' || currentTab.value === 'points') {
      if (dataToSave.points !== undefined && dataToSave.points !== null && dataToSave.points !== '') {
        const normalizedPoints = Number(dataToSave.points);
        if (!Number.isFinite(normalizedPoints) || normalizedPoints < 0) {
          fieldErrors.points = '积分必须是大于等于 0 的数字';
          showToast('请修复表单错误后再保存', 'error');
          isSaving.value = false;
          return;
        }
        dataToSave.points = Math.round(normalizedPoints);
      }

      if (dataToSave.experience !== undefined && dataToSave.experience !== null && dataToSave.experience !== '') {
        const normalizedExperience = Number(dataToSave.experience);
        if (!Number.isFinite(normalizedExperience) || normalizedExperience < 0) {
          fieldErrors.experience = '经验值必须是大于等于 0 的数字';
          showToast('请修复表单错误后再保存', 'error');
          isSaving.value = false;
          return;
        }
        dataToSave.experience = Math.round(normalizedExperience);
      }

      if (dataToSave.join_date) {
        dataToSave.join_date = toDateInputValue(dataToSave.join_date);
      }

      if (dataToSave.email !== undefined) {
        const email = String(dataToSave.email || '').trim();
        if (email && !EMAIL_REGEX.test(email)) {
          fieldErrors.email = '邮箱格式不正确';
          showToast('请修复表单错误后再保存', 'error');
          isSaving.value = false;
          return;
        }
        dataToSave.email = email || null;
      }
    }

    if (currentTab.value === 'forum') {
      const forumTitle = String(editingItem.value.title || '').trim();
      const forumBody = String(editingItem.value.content || '').trim();
      const normalizedAuthorId = String(editingItem.value.author_id || '').trim();
      const normalizedAuthorUsername = String(editingItem.value.author_username || '').trim();
      const normalizedStatus = String(editingItem.value.status || 'approved').trim() || 'approved';

      if (!forumTitle) {
        fieldErrors.title = '帖子标题不能为空';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!forumBody) {
        fieldErrors.content = '帖子正文不能为空';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (normalizedAuthorId && !UUID_REGEX.test(normalizedAuthorId)) {
        fieldErrors.author_id = '作者 ID 必须是 UUID';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      const finalForumContent = `【${forumTitle}】\n${forumBody}`;
      dataToSave = pickWritableFields('forum', {
        content: finalForumContent,
        author_id: normalizedAuthorId || null,
        author_username: normalizedAuthorUsername || null,
        status: normalizedStatus,
        updated_at: new Date().toISOString()
      });
    }

    if (currentTab.value === 'subscriptions') {
      const normalizedUserId = String(editingItem.value.user_id || '').trim();
      const normalizedPlanCode = String(editingItem.value.plan_code || '').trim();
      const normalizedPlanName = String(editingItem.value.plan_name || '').trim();
      const normalizedBillingCycle = String(editingItem.value.billing_cycle || '').trim();
      const normalizedStatus = String(editingItem.value.status || '').trim();
      const normalizedPointsCost = Number(editingItem.value.points_cost);
      const normalizedDurationMonths = Number(editingItem.value.duration_months);
      const startedAtIso = toISOStringFromInput(editingItem.value.started_at);
      const expiresAtIso = toISOStringFromInput(editingItem.value.expires_at);

      if (!normalizedUserId || !UUID_REGEX.test(normalizedUserId)) {
        fieldErrors.user_id = '请先选择有效用户';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedPlanCode || !normalizedPlanName) {
        fieldErrors.plan_code = '订阅内容不能为空';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isFinite(normalizedPointsCost) || normalizedPointsCost < 0) {
        fieldErrors.points_cost = '积分成本必须是大于等于 0 的数字';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isInteger(normalizedDurationMonths) || normalizedDurationMonths <= 0 || normalizedDurationMonths > 120) {
        fieldErrors.duration_months = '订阅月数必须是 1-120 之间的整数';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!startedAtIso) {
        fieldErrors.started_at = '订阅时间无效';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!expiresAtIso) {
        fieldErrors.expires_at = '到期时间无效';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (Date.parse(expiresAtIso) <= Date.parse(startedAtIso)) {
        fieldErrors.expires_at = '到期时间必须晚于订阅时间';
        showToast('请修复订阅表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('subscriptions', {
        user_id: normalizedUserId,
        plan_code: normalizedPlanCode,
        plan_name: normalizedPlanName,
        billing_cycle: normalizedBillingCycle,
        points_cost: Math.round(normalizedPointsCost),
        duration_months: normalizedDurationMonths,
        started_at: startedAtIso,
        expires_at: expiresAtIso,
        status: normalizedStatus,
        metadata: editingItem.value.metadata || {},
        updated_at: new Date().toISOString()
      });
    }

    if (currentTab.value === 'coreMemories') {
      const normalizedTitle = String(editingItem.value.title || '').trim();
      const normalizedContent = String(editingItem.value.content || '').trim();
      const normalizedCategory = String(editingItem.value.category || 'general').trim() || 'general';
      const normalizedStatus = String(editingItem.value.status || 'active').trim() || 'active';
      const normalizedPriority = Number(editingItem.value.priority);
      const normalizedTags = Array.isArray(editingItem.value.tags)
        ? editingItem.value.tags
          .map((tag) => String(tag || '').trim())
          .filter(Boolean)
          .slice(0, 30)
        : [];

      if (!normalizedTitle) {
        fieldErrors.title = '标题不能为空';
        showToast('请修复官方事实表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedContent) {
        fieldErrors.content = '官方事实内容不能为空';
        showToast('请修复官方事实表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isFinite(normalizedPriority) || normalizedPriority < 0 || normalizedPriority > 100) {
        fieldErrors.priority = '优先级必须是 0-100 之间的数字';
        showToast('请修复官方事实表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('coreMemories', {
        title: normalizedTitle,
        content: normalizedContent,
        category: normalizedCategory,
        tags: normalizedTags,
        priority: Math.round(normalizedPriority),
        source_label: String(editingItem.value.source_label || 'BOH 官方').trim() || 'BOH 官方',
        source_url: String(editingItem.value.source_url || '').trim(),
        status: normalizedStatus,
        updated_by: userInfo?.id || null
      });
    }

    if (currentTab.value === 'lotteries') {
      const normalizedTitle = String(editingItem.value.title || '').trim();
      const normalizedPrizeTitle = String(editingItem.value.prize_title || '').trim();
      const normalizedStatus = String(editingItem.value.status || 'open').trim() || 'open';
      const normalizedFulfillmentStatus = String(editingItem.value.fulfillment_status || 'pending_contact').trim() || 'pending_contact';
      const normalizedCommunityVisible = editingItem.value.is_community_visible !== false && editingItem.value.is_community_visible !== 'false';
      const rawMaxEntries = editingItem.value.max_entries;
      const hasMaxEntries = rawMaxEntries !== null && rawMaxEntries !== undefined && rawMaxEntries !== '';
      const normalizedMaxEntries = hasMaxEntries ? Number(rawMaxEntries) : null;
      const rawWinnerCount = editingItem.value.winner_count;
      const normalizedWinnerCount = rawWinnerCount === null || rawWinnerCount === undefined || rawWinnerCount === ''
        ? 1
        : Number(rawWinnerCount);
      const normalizedEntryDeadlineAt = toISOStringFromInput(editingItem.value.entry_deadline_at);
      const normalizedDrawAt = toISOStringFromInput(editingItem.value.draw_at);

      if (!normalizedTitle) {
        fieldErrors.title = '抽奖标题不能为空';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedPrizeTitle) {
        fieldErrors.prize_title = '奖品名称不能为空';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!['draft', 'open', 'drawn', 'closed'].includes(normalizedStatus)) {
        fieldErrors.status = '抽奖状态无效';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!['pending_contact', 'confirmed', 'fulfilled', 'voided'].includes(normalizedFulfillmentStatus)) {
        fieldErrors.fulfillment_status = '中奖处理状态无效';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (hasMaxEntries && (!Number.isInteger(normalizedMaxEntries) || normalizedMaxEntries <= 0)) {
        fieldErrors.max_entries = '报名人数上限必须是正整数，或留空表示不限';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isInteger(normalizedWinnerCount) || normalizedWinnerCount <= 0) {
        fieldErrors.winner_count = '中奖人数必须是正整数';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (normalizedMaxEntries !== null && normalizedWinnerCount > normalizedMaxEntries) {
        fieldErrors.winner_count = '中奖人数不能大于报名人数上限';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (editingItem.value.draw_at && !normalizedDrawAt) {
        fieldErrors.draw_at = '自动开奖时间无效';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (editingItem.value.entry_deadline_at && !normalizedEntryDeadlineAt) {
        fieldErrors.entry_deadline_at = '报名截止时间无效';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (normalizedEntryDeadlineAt && normalizedDrawAt && Date.parse(normalizedEntryDeadlineAt) > Date.parse(normalizedDrawAt)) {
        fieldErrors.entry_deadline_at = '报名截止时间不能晚于自动开奖时间';
        showToast('请修复抽奖表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('lotteries', {
        title: normalizedTitle,
        description: String(editingItem.value.description || '').trim(),
        prize_title: normalizedPrizeTitle,
        prize_description: String(editingItem.value.prize_description || '').trim(),
        cover_image_url: String(editingItem.value.cover_image_url || '').trim(),
        status: normalizedStatus,
        fulfillment_status: normalizedFulfillmentStatus,
        is_community_visible: normalizedCommunityVisible,
        max_entries: normalizedMaxEntries,
        winner_count: normalizedWinnerCount,
        entry_deadline_at: normalizedEntryDeadlineAt,
        draw_at: normalizedDrawAt,
        created_by: isEditing.value ? undefined : (userInfo?.id || null),
        updated_by: userInfo?.id || null
      });
    }

    if (currentTab.value === 'products') {
      const normalizedId = Number(editingItem.value.id);
      if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        fieldErrors.id = '商品 ID 必须是正整数';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      const normalizedPointsCost = Number(editingItem.value.points_cost);
      if (!Number.isFinite(normalizedPointsCost) || normalizedPointsCost < 0) {
        fieldErrors.points_cost = '商品积分定价必须是大于等于 0 的数字';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }
      const normalizedStock = Number(editingItem.value.stock);
      if (!Number.isFinite(normalizedStock) || normalizedStock < 0) {
        fieldErrors.stock = '库存必须是大于等于 0 的数字';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      const normalizedSpecifications = Array.isArray(editingItem.value.specifications)
        ? editingItem.value.specifications
          .map((spec) => ({
            label: String(spec?.label || '').trim(),
            value: String(spec?.value || '').trim()
          }))
          .filter((spec) => spec.label && spec.value)
        : [];

      dataToSave = pickWritableFields('products', {
        ...dataToSave,
        id: normalizedId,
        title: String(editingItem.value.title || '').trim(),
        category: String(editingItem.value.category || '').trim(),
        description: String(editingItem.value.description || '').trim(),
        points_cost: Math.round(normalizedPointsCost),
        stock: Math.round(normalizedStock),
        image: String(editingItem.value.image || '').trim(),
        specifications: normalizedSpecifications
      });
    }

    if (currentTab.value === 'news') {
      dataToSave.id = Number(editingItem.value.id);
      dataToSave.category = String(editingItem.value.category || '').trim();
      dataToSave.title = String(editingItem.value.title || '').trim();
      dataToSave.date = String(editingItem.value.date || '').trim();
      dataToSave.author = String(editingItem.value.author || '').trim();
      dataToSave.content = normalizeNewsContent(editingItem.value.content);

      const normalizedExcerpt = String(editingItem.value.excerpt || '').trim();
      dataToSave.excerpt = normalizedExcerpt || stripHtml(dataToSave.content).slice(0, 80);

      if (!validateNewsPayload(dataToSave)) {
        showToast('请修复新闻表单中的错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('news', dataToSave);
    }

    if (currentTab.value === 'activities') {
      const normalizedId = Number(editingItem.value.id);
      const normalizedTitle = String(editingItem.value.title || '').trim();
      const normalizedDate = toDateInputValue(editingItem.value.date);

      if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        fieldErrors.id = '活动 ID 必须是正整数';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedDate) {
        fieldErrors.date = '活动日期不能为空';
        showToast('请修复表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('activities', {
        id: normalizedId,
        title: normalizedTitle,
        date: normalizedDate,
        image: String(editingItem.value.image || '').trim(),
        description: String(editingItem.value.description || '').trim()
      });
    }

    if (currentTab.value === 'gifts') {
      const normalizedUserId = String(editingItem.value.user_id || '').trim();
      if (!normalizedUserId) {
        showToast('请先选择用户', 'error');
        isSaving.value = false;
        return;
      }

      if (!editingItem.value.gift_content || !String(editingItem.value.gift_content).trim()) {
        showToast('礼物内容不能为空', 'error');
        isSaving.value = false;
        return;
      }

      const customCompletedAt = toISOStringFromInput(editingItem.value.completed_at);
      const normalizedIsActive = typeof editingItem.value.is_active === 'string'
        ? editingItem.value.is_active === 'true'
        : Boolean(editingItem.value.is_active);
      const normalizedGiftStatus = editingItem.value.gift_status;
      const nowIso = new Date().toISOString();
      const normalizedCompletedAt = normalizedGiftStatus === 'completed'
        ? (customCompletedAt || nowIso)
        : null;

      dataToSave = {
        user_id: normalizedUserId,
        gift_no: editingItem.value.gift_no,
        gift_content: editingItem.value.gift_content,
        gift_price: editingItem.value.gift_price,
        gift_image: editingItem.value.gift_image,
        gift_status: normalizedGiftStatus,
        is_active: normalizedIsActive,
        completed_at: normalizedCompletedAt,
        updated_at: nowIso
      };

      dataToSave = pickWritableFields('gifts', dataToSave);
    }

    // 移除 id 字段（如果是新增）
    if (!isEditing.value && !TABS_KEEP_ID_ON_INSERT.has(currentTab.value)) {
      delete dataToSave.id;
    }

    if (isEditing.value) {
      const { data, error } = await supabase
        .from(table)
        .update(dataToSave)
        .eq('id', editingItem.value.id)
        .select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('保存失败：没有记录被更新，请检查管理员权限或记录是否存在');
      }
      if (currentTab.value === 'products') invalidateProductsCache();
      if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(dataToSave.user_id || editingItem.value.user_id);
      if (currentTab.value === 'coreMemories') await syncCoreMemoriesIndex();
      showToast('数据更新成功', 'success');
    } else {
      if (currentTab.value === 'gifts' && dataToSave.is_active) {
        const { error: archiveError } = await supabase
          .from('user_gifts')
          .update({ is_active: false })
          .eq('user_id', dataToSave.user_id);
        if (archiveError) throw archiveError;
      }
      const { error } = await supabase.from(table).insert([dataToSave]);
      if (error) throw error;
      if (currentTab.value === 'products') invalidateProductsCache();
      if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(dataToSave.user_id);
      if (currentTab.value === 'coreMemories') await syncCoreMemoriesIndex();
      searchQuery.value = '';
      currentPage.value = 1;
      showToast('数据添加成功', 'success');
    }

    await fetchData();
    closeModal();
  } catch (error) {
    console.error('保存失败:', error);
    showToast('保存失败: ' + buildActionErrorMessage(error, '保存失败'), 'error');
  } finally {
    isSaving.value = false;
  }
};

const deleteAdminUser = async (item) => {
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_user_account', {
    p_user_id: item.id
  });

  if (rpcError) {
    if (isMissingRpcFunctionError(rpcError, 'admin_delete_user_account')) {
      throw new Error('管理员删除用户 RPC 尚未部署，请先执行最新 Supabase migration');
    }
    throw rpcError;
  }

  if (!rpcData?.ok) {
    throw new Error(String(rpcData?.message || '用户删除失败，未返回成功状态'));
  }
};

const deleteItem = async (item) => {
  if (!confirm('确定要删除这条记录吗？')) return;

  try {
    assertAdminAction();
    if ((currentTab.value === 'users' || currentTab.value === 'points') && item?.id) {
      await deleteAdminUser(item);
    } else {
      const { data, error } = await supabase
        .from(currentConfig.value.table)
        .delete()
        .eq('id', item.id)
        .select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('删除失败：没有记录被删除，请检查管理员权限或记录是否存在');
      }
    }
    if (currentTab.value === 'products') invalidateProductsCache();
    if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(item?.user_id);
    showToast('删除成功', 'success');
    await fetchData();
  } catch (error) {
    console.error('删除失败:', error);
    showToast('删除失败: ' + buildActionErrorMessage(error, '删除失败'), 'error');
  }
};

const drawLotteryNow = async (item) => {
  if (!item?.id || isLotteryActionPending(item.id)) return;
  const entryCount = Number(item.entry_count || 0);
  const confirmMessage = entryCount > 0
    ? `确定要从 ${entryCount} 名报名用户中随机开奖吗？`
    : '当前还没有报名用户，仍要开奖并标记为“无中奖者”吗？';
  if (!confirm(confirmMessage)) return;

  setLotteryActionPending(item.id, true);
  try {
    assertAdminAction();
    const { data, error } = await supabase.rpc('execute_lottery_draw', {
      p_lottery_id: item.id,
      p_force: true,
      p_redraw: false,
      p_reason: 'manual_draw'
    });
    if (error) throw error;
    if (!data?.ok) {
      throw new Error(String(data?.message || '开奖失败'));
    }
    const winnerNames = Array.isArray(data?.winners)
      ? data.winners.map((winner) => String(winner?.username || '').trim()).filter(Boolean)
      : [];
    showToast(winnerNames.length ? `开奖完成，中奖者：${winnerNames.join('、')}` : '开奖完成，本期暂无中奖者', 'success');
    await fetchData();
  } catch (error) {
    console.error('抽奖开奖失败:', error);
    showToast('开奖失败: ' + buildActionErrorMessage(error, '开奖失败'), 'error');
  } finally {
    setLotteryActionPending(item.id, false);
  }
};

const redrawLottery = async (item) => {
  if (!item?.id || isLotteryActionPending(item.id)) return;
  const reason = window.prompt('请输入重抽原因（例如：中奖者失联 / 不符合资格）');
  if (reason === null) return;
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    showToast('重抽必须填写原因', 'error');
    return;
  }
  if (!confirm('确定要重新开奖吗？系统会保留历史开奖日志，并通知新的中奖用户。')) return;

  setLotteryActionPending(item.id, true);
  try {
    assertAdminAction();
    const { data, error } = await supabase.rpc('execute_lottery_draw', {
      p_lottery_id: item.id,
      p_force: true,
      p_redraw: true,
      p_reason: normalizedReason
    });
    if (error) throw error;
    if (!data?.ok) {
      throw new Error(String(data?.message || '重抽失败'));
    }
    const winnerNames = Array.isArray(data?.winners)
      ? data.winners.map((winner) => String(winner?.username || '').trim()).filter(Boolean)
      : [];
    showToast(winnerNames.length ? `重抽完成，中奖者：${winnerNames.join('、')}` : '重抽完成，本期暂无中奖者', 'success');
    await fetchData();
  } catch (error) {
    console.error('抽奖重抽失败:', error);
    showToast('重抽失败: ' + buildActionErrorMessage(error, '重抽失败'), 'error');
  } finally {
    setLotteryActionPending(item.id, false);
  }
};

const viewLotteryEntries = (item) => {
  if (!item?.id) return;
  switchTab('lotteryEntries', { search: String(item.id) });
};

const viewLotteryDrawLogs = (item) => {
  if (!item?.id) return;
  switchTab('lotteryDrawLogs', { search: String(item.id) });
};

const closeLottery = async (item) => {
  if (!item?.id || isLotteryActionPending(item.id)) return;
  if (!confirm('确定要关闭这个抽奖吗？关闭后仍会保留在历史抽奖中。')) return;

  setLotteryActionPending(item.id, true);
  try {
    assertAdminAction();
    const { data, error } = await supabase
      .from('lotteries')
      .update({
        status: 'closed',
        updated_by: userInfo?.id || null
      })
      .eq('id', item.id)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('关闭失败：没有记录被更新，请检查管理员权限或记录是否存在');
    }
    showToast('抽奖已关闭，已保留在历史抽奖中', 'success');
    await fetchData();
  } catch (error) {
    console.error('关闭抽奖失败:', error);
    showToast('关闭失败: ' + buildActionErrorMessage(error, '关闭失败'), 'error');
  } finally {
    setLotteryActionPending(item.id, false);
  }
};

const saveModerationLog = async (item, actionStatus, reason = '') => {
  const payload = {
    target_id: item.id,
    target_type: moderationTabConfig.value?.targetType || 'unknown',
    ai_result: actionStatus,
    ai_reason: reason || null,
    moderator_id: userInfo?.id || null
  };

  const { error } = await supabase.from('moderation_logs').insert([payload]);
  if (error) {
    console.warn('写入 moderation_logs 失败（不阻断主流程）:', error);
  }
};

const buildModerationErrorMessage = (error) => {
  const normalizedMessage = buildActionErrorMessage(error, '操作失败');
  if (normalizedMessage !== String(error?.message || '').trim()) {
    return normalizedMessage;
  }
  const rawMessage = String(error?.message || '').toLowerCase();
  const rawCode = String(error?.code || '').toUpperCase();
  if (rawCode === '42501' || rawMessage.includes('row-level security') || rawMessage.includes('permission denied')) {
    return '当前账号没有审核写入权限，请检查 Supabase 的 RLS/策略配置';
  }
  return String(error?.message || '操作失败');
};

const isMissingRpcFunctionError = (error, fnName) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST202' || message.includes(String(fnName || '').toLowerCase());
};

const updateModerationStatus = async (item, config, updateData) => {
  const rpcPayload = {
    p_target_type: config.targetType,
    p_target_id: item.id,
    p_action_status: updateData[config.statusField],
    p_reason: config.reasonField ? (updateData[config.reasonField] || null) : null
  };
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_apply_moderation_action', rpcPayload);

  if (!rpcError) {
    const ok = Boolean(rpcData?.ok);
    const affected = Number(rpcData?.affected || 0);
    if (!ok || affected <= 0) {
      throw new Error(String(rpcData?.message || '记录未更新，可能是权限不足或记录状态已变化'));
    }
    return;
  }

  if (!isMissingRpcFunctionError(rpcError, 'admin_apply_moderation_action')) {
    throw rpcError;
  }

  const { data, error } = await supabase
    .from(config.table)
    .update(updateData)
    .eq('id', item.id)
    .select('id');

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('记录未更新，可能是权限不足或记录状态已变化');
  }
};

const deleteModerationTarget = async (item, config) => {
  const { data: rpcData, error: rpcError } = await supabase.rpc('admin_delete_moderation_target', {
    p_target_type: config.targetType,
    p_target_id: item.id
  });

  if (!rpcError) {
    const ok = Boolean(rpcData?.ok);
    const affected = Number(rpcData?.affected || 0);
    if (!ok || affected <= 0) {
      throw new Error(String(rpcData?.message || '记录未删除，可能是权限不足或记录不存在'));
    }
    return;
  }

  if (!isMissingRpcFunctionError(rpcError, 'admin_delete_moderation_target')) {
    throw rpcError;
  }

  const { data, error } = await supabase
    .from(config.table)
    .delete()
    .eq('id', item.id)
    .select('id');
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('记录未删除，可能是权限不足或记录不存在');
  }
};

const applyModerationAction = async (item, action) => {
  if (!moderationTabConfig.value) return;
  if (!item?.id) {
    showToast('记录缺少 ID，无法执行审核操作', 'error');
    return;
  }
  if (isModerationActionPending(item.id)) return;

  const config = moderationTabConfig.value;
  const isApprove = action === 'approve';
  const isKeepLimited = action === 'limit';
  let reason = '';

  if (!isApprove && !isKeepLimited && config.reasonField) {
    const inputReason = window.prompt('请输入拒绝原因（必填）');
    if (inputReason === null) return;
    reason = inputReason.trim();
    if (!reason) {
      showToast('拒绝时必须填写原因', 'error');
      return;
    }
  }

  setModerationPending(item.id, true);
  try {
    const updateData = {
      [config.statusField]: isApprove
        ? config.approveValue
        : isKeepLimited
          ? 'limited'
          : config.rejectValue
    };

    if (config.reasonField) {
      updateData[config.reasonField] = isApprove ? null : reason;
    }

    await updateModerationStatus(item, config, updateData);

    await saveModerationLog(item, updateData[config.statusField], reason);
    showToast(isApprove ? '审核通过已生效' : isKeepLimited ? '已维持下架并结案举报' : '已拒绝并记录原因', 'success');
    await fetchData();
  } catch (error) {
    console.error('审核操作失败:', error);
    showToast('审核操作失败: ' + buildModerationErrorMessage(error), 'error');
  } finally {
    setModerationPending(item.id, false);
  }
};

const approveModerationItem = async (item) => {
  await applyModerationAction(item, 'approve');
};

const rejectModerationItem = async (item) => {
  await applyModerationAction(item, 'reject');
};

const keepLimitedModerationItem = async (item) => {
  await applyModerationAction(item, 'limit');
};

const deleteModerationItem = async (item) => {
  if (!moderationTabConfig.value || !item?.id) return;
  if (isModerationActionPending(item.id)) return;
  if (!confirm('确定要删除这条记录吗？删除后不可恢复。')) return;

  const config = moderationTabConfig.value;
  setModerationPending(item.id, true);
  try {
    await deleteModerationTarget(item, config);
    await saveModerationLog(item, 'deleted', 'admin_delete');
    showToast('删除成功', 'success');
    await fetchData();
  } catch (error) {
    console.error('删除审核记录失败:', error);
    showToast('删除失败: ' + buildModerationErrorMessage(error), 'error');
  } finally {
    setModerationPending(item.id, false);
  }
};

const batchDelete = async () => {
  if (!confirm(`确定要删除选中的 ${selectedItems.value.length} 条记录吗？`)) return;

  try {
    assertAdminAction();
    const table = currentConfig.value.table;
    const ids = selectedItems.value.map(item => item.id);

    if (currentTab.value === 'users') {
      for (const item of selectedItems.value) {
        await deleteAdminUser(item);
      }
    } else {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .in('id', ids)
        .select('id');

      if (error) throw error;
      if (!Array.isArray(data) || data.length !== ids.length) {
        throw new Error(`批量删除未完全生效：请求 ${ids.length} 条，实际删除 ${Array.isArray(data) ? data.length : 0} 条`);
      }
    }
    if (currentTab.value === 'products') invalidateProductsCache();
    if (currentTab.value === 'subscriptions') {
      selectedItems.value.forEach((item) => invalidateSubscriptionCache(item?.user_id));
    }
    showToast('批量删除成功', 'success');
    selectedItems.value = [];
    await fetchData();
  } catch (error) {
    console.error('批量删除失败:', error);
    showToast('批量删除失败: ' + buildActionErrorMessage(error, '批量删除失败'), 'error');
  }
};

// ==================== 辅助方法 ====================
const formatCellValue = (val, maxLength) => {
  if (val === null || val === undefined || val === '') return '-';
  const str = String(val);
  if (maxLength && str.length > maxLength) {
    return str.substring(0, maxLength) + '...';
  }
  return str;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getBadgeType = (value) => {
  if (!value) return 'default';
  const val = String(value).toLowerCase();
  if (['admin', '管理员', 'active', '进行中', 'open', '首页显示', 'confirmed', 'fulfilled', 'joined', 'success', 'sent', '准点', '定时任务'].includes(val)) return 'success';
  if (['user', '普通用户', 'upcoming', '即将开始', 'manual_admin', '手动补跑', '未开奖'].includes(val)) return 'info';
  if (['processing', '处理中'].includes(val)) return 'info';
  if (['当前礼物', 'current gift'].includes(val)) return 'success';
  if (['历史礼物', 'history gift', 'draft', '已隐藏', 'pending_contact', 'rate_limited', 'already_joined', 'running', 'pending', 'partial_failure', '待调度'].includes(val) || val.startsWith('延迟')) return 'warning';
  if (['ended', '已结束', 'disabled', 'closed', 'voided', 'entry_closed', 'not_open', 'full', 'account_too_new'].includes(val)) return 'warning';
  if (['banned', '封禁', 'not_found', 'profile_not_found', 'failed'].includes(val)) return 'danger';
  if (['preparing'].includes(val)) return 'warning';
  if (['shipped', 'completed', 'delivered', 'signed', 'drawn'].includes(val)) return 'success';
  if (['approved'].includes(val)) return 'success';
  if (['limited'].includes(val)) return 'warning';
  if (['rejected', 'reject'].includes(val)) return 'danger';
  return 'default';
};

const getTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, 3);
  return [String(value)];
};

const getJsonPreview = (val) => {
  if (!val) return '{}';
  const str = JSON.stringify(val);
  return str.length > 30 ? str.substring(0, 30) + '...' : str;
};

const exportData = () => {
  const data = filteredData.value;
  const columns = currentColumns.value;

  const csvContent = [
    columns.map(col => col.label).join(','),
    ...data.map(item => columns.map(col => {
      let val = item[col.key];
      if (typeof val === 'object') val = JSON.stringify(val);
      return `"${String(val || '').replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${currentTab.value}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  showToast('数据导出成功', 'success');
};

// 标签输入
const addTag = (e, fieldKey) => {
  const value = e.target.value.trim();
  if (!value) return;

  if (!editingItem.value[fieldKey]) {
    editingItem.value[fieldKey] = [];
  }
  if (!editingItem.value[fieldKey].includes(value)) {
    editingItem.value[fieldKey].push(value);
  }
  e.target.value = '';
};

const removeTag = (fieldKey, index) => {
  editingItem.value[fieldKey].splice(index, 1);
};

// 规格输入
const addSpec = (fieldKey) => {
  if (!editingItem.value[fieldKey]) {
    editingItem.value[fieldKey] = [];
  }
  editingItem.value[fieldKey].push({ label: '', value: '' });
};

const removeSpec = (fieldKey, index) => {
  editingItem.value[fieldKey].splice(index, 1);
};

// ==================== 生命周期 ====================
onMounted(() => {
  fetchData();
  nextTick(() => scrollActiveTabIntoView(false));
});

// 监听分页大小变化
watch(pageSize, () => {
  if (currentPage.value !== 1) {
    currentPage.value = 1;
  } else {
    fetchTabData(currentTab.value);
  }
});

watch(currentPage, () => {
  if (suppressNextPageFetch.value) {
    suppressNextPageFetch.value = false;
    return;
  }
  fetchTabData(currentTab.value);
});

watch(() => editingItem.value?.plan_code, (planCode) => {
  if (!isSubscriptionTab.value) return;
  const normalizedPlanCode = String(planCode || '').trim();
  const planName = SUBSCRIPTION_PLAN_NAMES[normalizedPlanCode];
  if (planName) {
    editingItem.value.plan_name = planName;
  }
});

// 过滤、删除或切换每页条数后，确保当前页始终有效
watch(totalPages, (pages) => {
  const safePages = Math.max(1, pages || 1);
  if (currentPage.value > safePages) {
    currentPage.value = safePages;
  }
  if (currentPage.value < 1) {
    currentPage.value = 1;
  }
});

watch(userPickerKeyword, () => {
  if (!showUserPickerModal.value) return;
  if (userPickerSearchDebounceTimer.value) clearTimeout(userPickerSearchDebounceTimer.value);
  userPickerSearchDebounceTimer.value = setTimeout(() => {
    fetchUserPickerUsers();
  }, 300);
});

</script>

<style scoped src="./style.scoped.css"></style>
