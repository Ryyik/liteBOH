<template>
  <div class="data-management-page" :data-theme="currentTheme">

    <div class="admin-shell">
      <AdminSidebar
        :active-module="activeModule"
        :collapsed="isSidebarCollapsed"
        :denied-ids="deniedModuleIds"
        :has-unmoderated="moderationPendingCount > 0"
        :is-open="isAdminSidebarOpen"
        :modules="sidebarModules"
        :search-query="sidebarSearchQuery"
        @denied-click="handleDeniedModuleClick"
        @module-click="guardedModuleClick"
        @create-record="handleAdminCreate"
        @refresh-data="refreshAllData"
        @update:searchQuery="sidebarSearchQuery = $event"
      />

      <div v-if="isAdminSidebarOpen" class="sidebar-scrim is-visible" @click="isAdminSidebarOpen = false"></div>

      <main class="admin-main">
        <AdminHeader
          :can-create="canCreateCurrentTab && !isModerationTab"
          :eyebrow="currentAdminPageMeta.eyebrow"
          :is-refreshing="isRefreshing"
          :is-sidebar-open="sidebarToggleOpen"
          :notification-count="moderationPendingCount"
          :searchable="true"
          :search-placeholder="'全局搜索：用户 / 抽奖 / 帖子...'"
          :search-value="globalSearchQuery"
          :theme="currentTheme"
          :title="currentAdminPageMeta.title"
          :user-label="adminUserLabel"
          :user-sub="adminUserSub"
          :avatar-url="adminAvatarUrl"
          @create="handleAdminCreate"
          @refresh="refreshAllData"
          @toggle-sidebar="toggleSidebar"
          @toggle-theme="() => toggleAdminTheme()"
          @search="onHeaderGlobalSearch"
          @update:searchValue="globalSearchQuery = $event"
          @notify="goNotificationsTab"
          @home="goSiteHome"
          @logout="handleAdminLogout"
        />

        <nav class="admin-breadcrumb" aria-label="面包屑导航">
          <template v-for="(crumb, index) in adminBreadcrumbs" :key="`${crumb.label}-${index}`">
            <span v-if="index > 0" class="admin-breadcrumb-sep" aria-hidden="true">/</span>
            <button
              v-if="!crumb.current"
              type="button"
              class="admin-breadcrumb-link"
              @click="handleBreadcrumbClick(crumb)"
            >{{ crumb.label }}</button>
            <span v-else class="admin-breadcrumb-current" aria-current="page">{{ crumb.label }}</span>
          </template>
        </nav>

        <div class="main-container">
          <AdminOverview
            v-if="activeAdminSection === 'overview'"
            :active-diagnostics="activeDiagnostics"
            :active-filter-summary="activeFilterSummary"
            :current-tab="currentTab"
            :current-tab-label="currentTabLabel"
            :is-loading="isLoading"
            :is-refreshing="isRefreshing"
            :live-status-cards="liveStatusCards"
            :recent-activity-items="recentActivityItems"
            :seconds-until-refresh="secondsUntilRefresh"
            :table-summary-cards="tableSummaryCards"
            :total-record-count="totalRecordCount"
            @refresh-now="refreshAllData"
            @select-tab="handleOverviewTabClick"
            @quick-create="quickCreateRecord"
          />

          <section v-if="activeAdminSection !== 'overview' && !isPlaceholderAdminSection && !isPageTab" class="admin-section-hero">
            <div>
              <span class="admin-section-eyebrow">{{ currentAdminPageMeta.eyebrow }}</span>
              <h2>{{ currentAdminPageMeta.title }}</h2>
              <p>{{ currentAdminPageMeta.description }}</p>
            </div>
            <div class="admin-section-metrics">
              <div v-for="item in currentAdminPageMetrics" :key="item.label" class="admin-section-metric">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </section>

          <section v-if="isPlaceholderAdminSection" class="admin-placeholder-panel">
            <div class="panel-heading">
              <div>
                <h2>{{ currentAdminPageMeta.title }}</h2>
                <p>{{ currentAdminPageMeta.placeholder }}</p>
              </div>
              <component :is="currentAdminPageMeta.icon" :size="19" />
            </div>
            <div class="placeholder-actions">
              <button
                v-for="action in currentAdminPageActions"
                :key="action.label"
                type="button"
                class="table-summary-item"
                @click="handlePlaceholderAction(action)"
              >
                <component :is="action.icon" :size="17" />
                <span class="table-summary-label">{{ action.label }}</span>
                <strong>{{ action.value }}</strong>
              </button>
            </div>
          </section>

      <!-- 管理模块标签页 -->
          <section v-if="isDataConsoleSection" id="data-console" class="management-section">

        <!-- 模块内子表 Tabs -->
        <div v-if="currentModuleTabIds.length > 1" class="g-module-tabs" role="tablist" aria-label="子表切换">
          <button
            v-for="tabId in currentModuleTabIds"
            :key="tabId"
            type="button"
            role="tab"
            :class="['g-module-tab', { 'is-active': currentTab === tabId }]"
            :aria-selected="currentTab === tabId"
            @click="switchTab(tabId)"
          >
            {{ getTabLabel(tabId) }}
          </button>
        </div>

        <LotteryOperationsPanel
          v-if="activeModule === 'lottery'"
          :snapshot="lotteryOperationsSnapshot"
          :scheduler-status="lotterySchedulerStatus"
          :due-draw-pending="lotteryDueDrawPending"
          @advance-fulfillment="advanceLotteryFulfillment"
          @open-tab="switchTab"
          @refresh="refreshLotteryOperationsSnapshot"
          @replace-winner="replaceLotteryWinner"
          @retry-notification="retryLotteryNotification"
          @run-due-draws="runDueLotteryDraws"
        />

        <!-- 页面类型 Tab：直接渲染对应组件 -->
        <div v-if="isPageTab && currentPageComponent" class="page-tab-container">
          <component :is="currentPageComponent" />
        </div>

        <!-- 表格类型 Tab：原有工具栏和表格 -->
        <template v-else>
        <div class="toolbar-primary">
          <div class="toolbar-left">
            <div>
              <h2 class="section-title">{{ currentTabLabel }}</h2>
              <div class="view-context">
                <span>{{ currentModule?.label || '数据管理' }}</span>
                <span>{{ activeFilterSummary }}</span>
                <span>{{ lastRefreshLabel }}</span>
              </div>
            </div>
            <span class="data-badge">{{ totalRecordCount }} 条记录</span>
          </div>
          <div class="toolbar-right">
            <button v-if="!isModerationTab && canCreateCurrentTab" class="btn btn-primary" @click="openEditModal()">
              <Plus :size="16" />
              新增
            </button>
            <button class="btn btn-secondary" type="button" title="导出当前表" @click="exportData">
              <Download :size="16" />
              导出
            </button>
          </div>
        </div>
        <div class="toolbar-secondary">
          <div class="search-box">
            <Search class="search-icon" :size="18" aria-hidden="true" />
            <input v-model="searchQuery" type="text" placeholder="搜索数据..." aria-label="搜索数据" @input="handleSearch" />
            <button v-if="searchQuery" class="clear-search" @click="clearSearch">×</button>
          </div>
          <button class="filter-toggle" type="button" @click="showFilterBar = !showFilterBar">
            <Filter :size="16" />
            筛选
          </button>
          <div v-if="showFilterBar" class="filter-bar">
            <button class="clear-filters-btn" type="button" @click="showGlobalSearchPanel = !showGlobalSearchPanel">
              跨表搜索
            </button>
            <button class="clear-filters-btn" type="button" @click="showAdvancedFilterPanel = !showAdvancedFilterPanel">
              高级筛选
            </button>
            <button class="clear-filters-btn" type="button" @click="saveCurrentFilterView">
              保存视图
            </button>
            <button class="clear-filters-btn" type="button" @click="togglePinnedTab(currentTab)">
              {{ isTabPinned(currentTab) ? '取消置顶' : '置顶表' }}
            </button>
            <div v-if="statusFilterOptions.length > 0" class="filter-select">
              <select v-model="statusFilter" @change="handleFilterChange">
                <option value="">全部状态</option>
                <option v-for="option in statusFilterOptions" :key="String(option.value)" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div v-if="currentDateFilterField" class="date-filter">
              <input v-model="dateFromFilter" type="date" aria-label="开始日期" @change="handleFilterChange" />
              <span>至</span>
              <input v-model="dateToFilter" type="date" aria-label="结束日期" @change="handleFilterChange" />
            </div>
            <button v-if="hasActiveFilters" class="clear-filters-btn" type="button" @click="clearAllFilters">
              清空筛选
            </button>
          </div>
        </div>

        <!-- 收集结果概览: 状态分布 chip, 点击即筛选 -->
        <section
          v-if="statusBreakdownForCurrentTab.length"
          class="collection-overview"
        >
          <span class="collection-overview-label">状态分布</span>
          <div class="collection-chips">
            <button
              v-for="chip in statusBreakdownForCurrentTab"
              :key="chip.value || 'all'"
              type="button"
              class="collection-chip"
              :class="[`tone-${chip.tone}`, { 'is-active': chip.active }]"
              :aria-pressed="chip.active"
              @click="applyCollectionStatusFilter(chip.value)"
            >
              <span class="collection-chip-label">{{ chip.label }}</span>
              <span class="collection-chip-count">{{ chip.count }}</span>
            </button>
          </div>
          <span class="collection-overview-hint">当前视图 {{ currentData.length }} 条</span>
        </section>

        <div v-if="showGlobalSearchPanel" class="editor-panel search-panel">
          <div class="panel-inline-form">
            <input v-model="globalSearchQuery" class="form-input" type="text" placeholder="跨表搜索用户 ID / 邮箱 / 抽奖 ID / 帖子关键词" @keydown.enter.prevent="runGlobalSearch" />
            <button class="btn btn-primary" type="button" :disabled="isGlobalSearching" @click="runGlobalSearch">
              {{ isGlobalSearching ? '搜索中...' : '搜索' }}
            </button>
          </div>
          <div v-if="globalSearchResults.length" class="global-result-list">
            <button
              v-for="result in globalSearchResults"
              :key="`${result.tabId}-${result.id}`"
              type="button"
              class="global-result-item"
              @click="openGlobalSearchResult(result)"
            >
              <strong>{{ result.tabLabel }} · {{ result.title || result.id }}</strong>
              <span v-html="highlightCellValue(result.preview, 120)"></span>
            </button>
          </div>
        </div>

        <div v-if="showAdvancedFilterPanel" class="editor-panel">
          <div class="advanced-filter-head">
            <strong>高级筛选</strong>
            <button class="btn btn-secondary" type="button" @click="addAdvancedFilterRule">添加条件</button>
          </div>
          <div v-if="currentSavedViews.length" class="saved-view-list">
            <button v-for="view in currentSavedViews" :key="view.id" type="button" class="saved-view-chip" @click="applySavedFilterView(view)">
              {{ view.name }}
              <span @click.stop="removeSavedFilterView(view.id)">×</span>
            </button>
          </div>
          <div v-for="rule in advancedFilterRules" :key="rule.id" class="advanced-filter-row">
            <select v-model="rule.field" class="form-select">
              <option v-for="col in currentColumns" :key="col.key" :value="col.key">{{ col.label }}</option>
            </select>
            <select v-model="rule.operator" class="form-select">
              <option value="contains">包含</option>
              <option value="eq">等于</option>
              <option value="neq">不等于</option>
              <option value="gt">大于</option>
              <option value="gte">大于等于</option>
              <option value="lt">小于</option>
              <option value="lte">小于等于</option>
              <option value="starts">开头是</option>
            </select>
            <input v-model="rule.value" class="form-input" type="text" placeholder="筛选值" @keydown.enter.prevent="handleFilterChange" />
            <button class="btn btn-secondary" type="button" @click="removeAdvancedFilterRule(rule.id)">删除</button>
          </div>
          <div class="panel-actions">
            <button class="btn btn-primary" type="button" @click="handleFilterChange">应用筛选</button>
          </div>
        </div>

        <!-- 数据表格区域 -->
        <div class="data-content" :data-density="density">
          <div class="content-toolbar">
            <div class="toolbar-right">
              <button class="btn btn-secondary" type="button" @click="showColumnPanel = !showColumnPanel">
                列配置
              </button>
              <RowActionMenu :items="toolbarMenuItems" title="更多表格操作" @open="openRowMenu" />
              <button class="btn btn-secondary" type="button" title="命令面板（⌘K / Ctrl+K）" @click="openCommandPalette">
                命令 ⌘K
              </button>
            </div>
          </div>

          <!-- 浮动批量操作条：选中后出现，替代常驻的批量按钮组 -->
          <div v-if="selectedItems.length > 0" class="bulk-bar" role="status">
            <span class="bulk-count">已选 <strong>{{ selectedItems.length }}</strong> 项<span v-if="selectAllResultsMode">（跨页全选）</span></span>
            <div class="bulk-actions">
              <button
                v-if="!selectAllResultsMode && totalRecordCount > paginatedData.length"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="selectAllResults"
              >
                全选全部 {{ totalRecordCount }}
              </button>
              <button
                v-if="editableFields.length && canEditCurrentTab"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="showBatchEditPanel = !showBatchEditPanel"
              >
                批量编辑
              </button>
              <button
                v-if="!isModerationTab && canDeleteCurrentTab && !isProfileDerivedTab"
                type="button"
                class="btn btn-danger btn-sm"
                @click="batchDelete"
              >
                删除
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="clearAllSelection">
                清除
              </button>
            </div>
          </div>

          <div v-if="showColumnPanel" class="editor-panel column-panel">
            <div class="advanced-filter-head">
              <strong>列配置</strong>
              <button class="btn btn-secondary" type="button" @click="resetColumnSettings">恢复默认</button>
            </div>
            <div class="column-config-list">
              <div v-for="col in currentColumns" :key="col.key" class="column-config-item">
                <label>
                  <input
                    type="checkbox"
                    :checked="visibleCurrentColumns.some((item) => item.key === col.key)"
                    @change="setColumnVisible(col.key, $event.target.checked)"
                  />
                  <span>{{ col.label }}</span>
                </label>
                <div class="column-move-actions">
                  <button type="button" @click="moveColumn(col.key, -1)">上移</button>
                  <button type="button" @click="moveColumn(col.key, 1)">下移</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showBatchEditPanel" class="editor-panel">
            <div class="advanced-filter-head">
              <strong>批量编辑预览</strong>
              <span>已选 {{ selectedItems.length }} 条记录</span>
            </div>
            <div class="panel-inline-form">
              <select v-model="batchEditState.fieldKey" class="form-select">
                <option value="">选择字段</option>
                <option v-for="field in editableFields" :key="field.key" :value="field.key">{{ field.label }}</option>
              </select>
              <select v-if="getFieldByKey(batchEditState.fieldKey)?.type === 'select'" v-model="batchEditState.value" class="form-select">
                <option v-for="opt in (getFieldByKey(batchEditState.fieldKey)?.options || [])" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-else v-model="batchEditState.value" class="form-input" type="text" placeholder="新值" />
              <button class="btn btn-primary" type="button" @click="applyBatchEdit">预览并执行</button>
            </div>
          </div>

          <!-- 引用面板：一条记录的所有关联入口 -->
          <div v-if="showRelatedPanel && relatedPanelItem" class="editor-panel related-panel">
            <div class="advanced-filter-head">
              <strong>关联记录</strong>
              <button class="btn btn-secondary" type="button" @click="closeRelatedPanel">关闭</button>
            </div>
            <div class="related-list">
              <button
                v-for="r in relatedJumpsForItem(relatedPanelItem)"
                :key="`${r.tabId}-${r.search}`"
                type="button"
                class="related-item"
                @click="jumpToRelatedRecord({ tabId: r.tabId, search: r.search }, relatedPanelItem)"
              >
                <span class="related-item-label">{{ r.field }}</span>
                <span class="related-item-target">{{ r.tabLabel }}</span>
                <span class="related-item-search">{{ r.search }}</span>
              </button>
              <p v-if="!relatedJumpsForItem(relatedPanelItem).length" class="panel-empty-text">暂无关联</p>
            </div>
          </div>

          <div v-if="showChangeLogPanel" class="editor-panel">
            <div class="advanced-filter-head">
              <strong>变更日志</strong>
              <span>最近 {{ currentChangeLogEntries.length }} 条</span>
            </div>
            <div class="change-log-list">
              <div v-for="entry in currentChangeLogEntries" :key="entry.id" class="change-log-item">
                <strong>{{ entry.action }} · {{ entry.recordId || '-' }}</strong>
                <span>{{ formatDateTime(entry.createdAt) }} · {{ entry.operator }}</span>
              </div>
              <p v-if="!currentChangeLogEntries.length" class="panel-empty-text">暂无本地变更日志</p>
            </div>
          </div>

          <div v-if="isLotteryOpsTab" class="lottery-scheduler-panel">
            <div class="lottery-scheduler-card" v-for="item in lotterySchedulerCards" :key="item.label" :class="`tone-${item.tone}`">
              <span>{{ item.label }}</span>
              <strong>{{ lotterySchedulerStatusLoading ? '加载中' : item.value }}</strong>
            </div>
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
          <div v-else-if="totalRecordCount === 0 && hasLoadedOnce" class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>暂无数据</h3>
            <p>{{ searchQuery ? '没有找到匹配的数据' : '当前模块还没有数据，点击新增按钮添加第一条记录' }}</p>
            <button v-if="!searchQuery && !isModerationTab && canCreateCurrentTab" class="btn btn-primary" @click="openEditModal()">
              <Plus :size="16" />
              新增数据
            </button>
          </div>

          <!-- 移动端卡片 -->
          <div v-if="isMobileView" class="mobile-card-list">
            <div v-for="item in paginatedData" :key="item.id || getRowIdentity(item)" class="mobile-card" :class="{ selected: isSelected(item), anomaly: isAnomalyRow(item), 'row-flash': flashRowId === String(item?.id) }">
              <div class="mobile-card-header">
                <label class="checkbox-wrapper">
                  <input type="checkbox" :checked="isSelected(item)" @change="toggleSelect(item)" />
                  <span class="checkmark"></span>
                </label>
                <div class="mobile-card-title">{{ getCardTitle(item) }}</div>
              </div>
              <div class="mobile-card-body">
                <div v-for="col in mobileVisibleColumns" :key="col.key" class="mobile-card-field">
                  <span class="mobile-card-label">{{ col.label }}</span>
                  <span class="mobile-card-value">{{ formatCellValue(item[col.key], col.maxLength) }}</span>
                </div>
              </div>
              <div class="mobile-card-actions">
                <button
                  v-for="act in getRowActionModel(item).primary"
                  :key="act.id"
                  type="button"
                  :class="['review-btn', act.tone]"
                  :disabled="act.disabled"
                  :title="act.title"
                  @click="act.run"
                >{{ act.label }}</button>
                <button v-if="canEditCurrentTab" type="button" class="mobile-action-btn edit" @click="openEditModal(item)" aria-label="编辑">
                  <Pencil :size="16" />
                </button>
                <RowActionMenu :items="getRowActionModel(item).menu" @open="openRowMenu" />
              </div>
            </div>
          </div>

          <div v-if="isMobileView && totalRecordCount > 0" class="mobile-data-pagination">
            <span class="g-sheet-foot-text">
              显示 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, totalRecordCount) }} 条 / 共 {{ totalRecordCount }} 条
            </span>
            <div class="mobile-pagination-controls">
              <label class="mobile-page-size">
                每页
                <select v-model="pageSize" aria-label="每页条数">
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select>
                条
              </label>
              <DashboardPagination
                v-model="currentPage"
                :total="totalRecordCount"
                :page-size="pageSize"
              />
            </div>
          </div>

          <!-- 数据表格 -->
          <DashboardSheet
            v-if="!isMobileView"
            :title="currentTabLabel"
            :badge="totalRecordCount > 0 ? `${totalRecordCount} 条` : ''"
            style="position: relative;"
          >
            <template #actions>
              <div class="density-toggle" role="group" aria-label="表格密度">
                <button
                  type="button"
                  :class="{ 'is-active': density === 'compact' }"
                  :aria-pressed="density === 'compact'"
                  title="紧凑密度"
                  @click="setDensity('compact')"
                >紧凑</button>
                <button
                  type="button"
                  :class="{ 'is-active': density === 'comfortable' }"
                  :aria-pressed="density === 'comfortable'"
                  title="舒适密度"
                  @click="setDensity('comfortable')"
                >舒适</button>
              </div>
              <div v-if="availableViewModes.length > 1" class="view-mode-toggle" role="tablist" aria-label="视图模式">
                <button
                  v-for="mode in availableViewModes"
                  :key="mode"
                  type="button"
                  :class="{ 'is-active': viewMode === mode }"
                  :aria-pressed="viewMode === mode"
                  @click="setViewMode(mode)"
                >{{ VIEW_MODE_LABELS[mode] }}</button>
              </div>
              <select v-model="pageSize" class="g-select" style="height: 32px; width: auto; padding: 0 calc(var(--spacing) * 3); font-size: 0.78rem;" aria-label="每页条数">
                <option :value="10">10 条/页</option>
                <option :value="20">20 条/页</option>
                <option :value="50">50 条/页</option>
                <option :value="100">100 条/页</option>
              </select>
            </template>

            <div v-if="isFilterLoading" class="filter-loading-overlay">
              <div class="filter-loading-shimmer"></div>
            </div>

            <!-- 卡片视图 -->
            <div v-if="isCardViewActive" class="lottery-card-grid">
              <article
                v-for="item in paginatedData"
                :key="item.id || getRowIdentity(item)"
                class="lottery-card"
                :class="{ selected: isSelected(item), anomaly: isAnomalyRow(item) }"
              >
                <div v-if="currentCardViewConfig.imageKey" class="lottery-card-cover" :class="{ 'is-placeholder': !item[currentCardViewConfig.imageKey] || isCardImageBroken(item, currentCardViewConfig) }">
                  <img
                    v-if="item[currentCardViewConfig.imageKey] && !isCardImageBroken(item, currentCardViewConfig)"
                    :src="getImageUrl(item[currentCardViewConfig.imageKey], { silent: true })"
                    :alt="item[currentCardViewConfig.titleKey]"
                    loading="lazy"
                    @error="onCardImageError(item, currentCardViewConfig)"
                  />
                  <span v-else class="lottery-card-cover-icon">{{ currentCardViewConfig.placeholderIcon || '📦' }}</span>
                  <span v-if="getCardStatusMeta(item, currentCardViewConfig)" class="lottery-card-status" :class="`tone-${getCardStatusMeta(item, currentCardViewConfig).tone}`">
                    {{ getCardStatusMeta(item, currentCardViewConfig).label }}
                  </span>
                </div>
                <div class="lottery-card-body">
                  <h4 class="lottery-card-title" :title="item[currentCardViewConfig.titleKey]">{{ item[currentCardViewConfig.titleKey] || '未命名' }}</h4>
                  <div v-if="currentCardViewConfig.subtitleKey && formatCardSubtitle(item, currentCardViewConfig)" class="lottery-card-prize">
                    <span v-if="currentCardViewConfig.subtitleLabel" class="lottery-card-prize-label">{{ currentCardViewConfig.subtitleLabel }}</span>
                    <span class="lottery-card-prize-value">{{ formatCardSubtitle(item, currentCardViewConfig) }}</span>
                  </div>
                  <div v-if="currentCardViewConfig.stats?.length" class="lottery-card-stats">
                    <div v-for="stat in currentCardViewConfig.stats" :key="stat.key" class="lottery-card-stat">
                      <span class="lottery-card-stat-label">{{ stat.label }}</span>
                      <span class="lottery-card-stat-value">{{ formatCardStatValue(item, stat) }}</span>
                    </div>
                  </div>
                  <div v-if="currentCardViewConfig.meta?.length" class="lottery-card-meta">
                    <template v-for="meta in currentCardViewConfig.meta" :key="meta.key">
                      <div v-if="item[meta.key] != null && item[meta.key] !== ''" class="lottery-card-meta-row">
                        <span class="lottery-card-meta-label">{{ meta.label }}</span>
                        <span class="lottery-card-meta-value">{{ formatCardMetaValue(item, meta) }}</span>
                        <button
                          v-if="meta.copyable"
                          type="button"
                          class="card-copy-btn"
                          :class="{ copied: isCardFieldCopied(meta, item) }"
                          @click="copyCardField(item, meta)"
                          :title="isCardFieldCopied(meta, item) ? '已复制' : '一键复制'"
                          aria-label="复制"
                        >
                          <Copy v-if="!isCardFieldCopied(meta, item)" :size="12" />
                          <Check v-else :size="12" />
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
                <div class="lottery-card-actions">
                  <button v-if="currentTab === 'lotteries' && item.status === 'open'" class="review-btn approve" :disabled="isLotteryActionPending(item.id)" @click="drawLotteryNow(item)" title="立即随机开奖">开奖</button>
                <button v-if="currentTab === 'lotteries' && item.status === 'drawn' && item.pity_mode === 'none'" class="review-btn approve" :disabled="isLotteryActionPending(item.id)" @click="redrawLottery(item)" title="保留历史记录并重新随机开奖">重抽</button>
                <button v-if="currentTab === 'lotteries'" class="review-btn approve" @click="viewLotteryFulfillments(item)" title="按中奖人处理联系、发货和替补">履约</button>
                <button v-if="currentTab === 'lotteries'" class="review-btn approve" @click="viewLotteryEntries(item)" title="查看本次抽奖报名名单">名单</button>
                  <button v-if="currentTab === 'lotteries'" class="review-btn approve" @click="viewLotteryDrawLogs(item)" title="查看本次抽奖开奖日志">日志</button>
                  <button v-if="currentTab === 'lotteries' && item.status !== 'closed'" class="review-btn reject" :disabled="isLotteryActionPending(item.id)" @click="closeLottery(item)" title="关闭该抽奖">关闭</button>
                  <button v-if="canEditCurrentTab" class="icon-btn edit" @click="openEditModal(item)" title="编辑" aria-label="编辑">
                    <Pencil :size="15" />
                  </button>
                  <button v-if="canDeleteCurrentTab && !isProfileDerivedTab" class="icon-btn delete" @click="deleteItem(item)" title="删除" aria-label="删除">
                    <Trash2 :size="15" />
                  </button>
                </div>
              </article>
            </div>

            <!-- 看板视图（状态分列，config 驱动） -->
            <div v-if="isKanbanViewActive" class="kanban-board">
              <div
                v-for="col in kanbanViewConfig.columns"
                :key="String(col.value)"
                class="kanban-col"
              >
                <div class="kanban-col-head">
                  <span class="kanban-col-dot" :class="`tone-${col.tone}`"></span>
                  <span class="kanban-col-label">{{ col.label }}</span>
                  <span class="kanban-col-count">{{ kanbanItemsInCol(col.value).length }}</span>
                </div>
                <div class="kanban-col-body">
                  <div
                    v-for="item in kanbanItemsInCol(col.value)"
                    :key="item.id || getRowIdentity(item)"
                    class="kanban-card"
                    role="button"
                    tabindex="0"
                    :aria-label="`查看 ${getCardTitle(item)}`"
                    @click="openEditModal(item)"
                    @keydown.enter.prevent="openEditModal(item)"
                    @keydown.space.prevent="openEditModal(item)"
                  >
                    <span class="kanban-card-title">{{ getCardTitle(item) }}</span>
                    <span class="kanban-card-sub">{{ kanbanCardSubtitle(item) }}</span>
                    <span v-if="isModerationTab" class="kanban-card-actions" @click.stop>
                      <button
                        v-if="!isRejectedModerationRecord(item)"
                        type="button"
                        class="kanban-mini-btn approve"
                        :disabled="isModerationActionPending(item.id)"
                        @click="approveModerationItem(item)"
                      >通过</button>
                      <button
                        v-if="!isRejectedModerationRecord(item)"
                        type="button"
                        class="kanban-mini-btn reject"
                        :disabled="isModerationActionPending(item.id)"
                        @click="rejectModerationItem(item)"
                      >拒绝</button>
                      <button
                        v-else
                        type="button"
                        class="kanban-mini-btn approve"
                        :disabled="isModerationActionPending(item.id)"
                        @click="approveModerationItem(item)"
                      >恢复</button>
                    </span>
                  </div>
                  <p v-if="kanbanItemsInCol(col.value).length === 0" class="kanban-col-empty">空</p>
                </div>
              </div>
            </div>

            <!-- 时间线视图（日志/流水，config 驱动） -->
            <div v-if="isTimelineViewActive" class="timeline-view">
              <div v-for="day in timelineDays" :key="day.label" class="timeline-day">
                <div class="timeline-day-label">{{ day.label }}</div>
                <div
                  v-for="item in day.items"
                  :key="item.id || getRowIdentity(item)"
                  class="timeline-item"
                  role="button"
                  tabindex="0"
                  :aria-label="`查看 ${timelineTitle(item)}`"
                  @click="openEditModal(item)"
                  @keydown.enter.prevent="openEditModal(item)"
                >
                  <div class="timeline-item-head">
                    <span class="timeline-item-title">{{ timelineTitle(item) }}</span>
                    <span class="timeline-item-time">{{ timelineTimeText(item) }}</span>
                  </div>
                  <div v-if="timelineBody(item).length" class="timeline-item-body">
                    <span v-for="f in timelineBody(item)" :key="f.key" class="timeline-item-field">
                      <strong>{{ f.label }}</strong>{{ f.value }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-show="viewMode === 'table'" class="g-sheet-table-scroll" role="region" aria-label="数据表格" tabindex="0">
            <table class="g-table-sheet">
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <label class="checkbox-wrapper">
                      <input type="checkbox" :checked="isAllSelected" :aria-label="selectAllResultsMode ? '取消全选所有结果' : '全选本页'" :title="selectAllResultsMode ? '取消全选所有结果' : '全选本页'" @change="toggleSelectAll" />
                      <span class="checkmark"></span>
                    </label>
                  </th>
                  <th v-for="col in visibleCurrentColumns" :key="col.key" :class="{ sortable: col.sortable }"
                    :tabindex="col.sortable ? 0 : -1"
                    :aria-sort="col.sortable
                      ? (sortKey === col.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none')
                      : null"
                    @click="col.sortable && sortBy(col.key)"
                    @keydown.enter.prevent="col.sortable && sortBy(col.key)"
                    @keydown.space.prevent="col.sortable && sortBy(col.key)">
                    {{ col.label }}
                    <span v-if="sortKey === col.key" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '↑' : '↓' }}
                    </span>
                  </th>
                  <th v-if="hasActionColumn" class="actions-col">操作</th>
                </tr>
              </thead>
              <TransitionGroup name="row-fade" tag="tbody">
                <tr v-for="item in paginatedData" :key="item.id || getRowIdentity(item)"
                  :class="{ selected: isSelected(item), anomaly: isAnomalyRow(item), 'row-flash': flashRowId === String(item?.id) }">
                  <td class="checkbox-col">
                    <label class="checkbox-wrapper">
                      <input type="checkbox" :checked="isSelected(item)" @change="toggleSelect(item)" />
                      <span class="checkmark"></span>
                    </label>
                  </td>
                  <td v-for="col in visibleCurrentColumns" :key="col.key">
                    <template v-if="isInlineEditing(item, col)">
                      <div class="inline-edit-box">
                        <select
                          v-if="getFieldByKey(col.key)?.type === 'select'"
                          v-model="inlineEditState.value"
                          class="inline-edit-input"
                        >
                          <option
                            v-for="opt in (getFieldByKey(col.key)?.options || [])"
                            :key="String(opt.value)"
                            :value="opt.value"
                          >
                            {{ opt.label }}
                          </option>
                        </select>
                        <input
                          v-else
                          v-model="inlineEditState.value"
                          class="inline-edit-input"
                          :type="getFieldByKey(col.key)?.type === 'number' ? 'number' : getFieldByKey(col.key)?.type === 'date' ? 'date' : getFieldByKey(col.key)?.type === 'datetime' ? 'datetime-local' : 'text'"
                          @keydown.enter.prevent="saveInlineEdit(item, col)"
                          @keydown.esc.prevent="cancelInlineEdit"
                          @keydown.tab.prevent="saveInlineEdit(item, col)"
                        />
                        <button type="button" class="inline-edit-action" :disabled="inlineEditState.saving" @click="saveInlineEdit(item, col)">保存</button>
                        <button type="button" class="inline-edit-action" @click="cancelInlineEdit">取消</button>
                      </div>
                    </template>
                    <template v-else-if="col.type === 'image'">
                      <div class="cell-image">
                        <img :src="getImageUrl(item[col.key])" :alt="item.title || 'Image'" loading="lazy" />
                      </div>
                    </template>
                    <template v-else-if="col.type === 'badge'">
                      <span
                        class="cell-badge"
                        :class="col.key === 'is_banned' || col.key === 'is_muted'
                          ? (item[col.key] === true ? 'badge-danger' : 'badge-muted')
                          : `badge-${getBadgeType(item[col.key])}`"
                        :tabindex="isInlineEditable(col, item) ? 0 : -1"
                        role="button"
                        :aria-label="`编辑 ${col.label}`"
                        @dblclick="quickEditCell(item, col)"
                        @keydown.enter.prevent="quickEditCell(item, col)"
                        @keydown.space.prevent="quickEditCell(item, col)"
                      >
                        {{ col.key === 'is_banned' || col.key === 'is_muted'
                          ? (item[col.key] === true ? '是' : '否')
                          : (item[col.key] || '-') }}
                      </span>
                      <button v-if="isCellEditable(col, item) && !isInlineEditing(item, col)" type="button" class="cell-edit-trigger" :aria-label="`编辑 ${col.label}`" title="编辑" @click="quickEditCell(item, col)">
                        <Pencil :size="12" />
                      </button>
                    </template>
                    <template v-else-if="col.type === 'tags'">
                      <div class="cell-tags">
                        <span v-for="tag in getTags(item[col.key])" :key="tag" class="tag">{{ tag }}</span>
                      </div>
                    </template>
                    <template v-else-if="col.type === 'price'">
                      <span class="cell-price"
                        :tabindex="isInlineEditable(col, item) ? 0 : -1"
                        role="button"
                        :aria-label="`编辑 ${col.label}`"
                        @dblclick="quickEditCell(item, col)"
                        @keydown.enter.prevent="quickEditCell(item, col)"
                        @keydown.space.prevent="quickEditCell(item, col)"
                      >{{ item[col.key] || '-' }}</span>
                      <button v-if="isCellEditable(col, item) && !isInlineEditing(item, col)" type="button" class="cell-edit-trigger" :aria-label="`编辑 ${col.label}`" title="编辑" @click="quickEditCell(item, col)">
                        <Pencil :size="12" />
                      </button>
                    </template>
                    <template v-else-if="col.type === 'date'">
                      <span class="cell-date"
                        :tabindex="isInlineEditable(col, item) ? 0 : -1"
                        role="button"
                        :aria-label="`编辑 ${col.label}`"
                        @dblclick="quickEditCell(item, col)"
                        @keydown.enter.prevent="quickEditCell(item, col)"
                        @keydown.space.prevent="quickEditCell(item, col)"
                      >{{ formatDate(item[col.key]) }}</span>
                      <button v-if="isCellEditable(col, item) && !isInlineEditing(item, col)" type="button" class="cell-edit-trigger" :aria-label="`编辑 ${col.label}`" title="编辑" @click="quickEditCell(item, col)">
                        <Pencil :size="12" />
                      </button>
                    </template>
                    <template v-else-if="col.type === 'datetime'">
                      <span class="cell-date"
                        :tabindex="isInlineEditable(col, item) ? 0 : -1"
                        role="button"
                        :aria-label="`编辑 ${col.label}`"
                        @dblclick="quickEditCell(item, col)"
                        @keydown.enter.prevent="quickEditCell(item, col)"
                        @keydown.space.prevent="quickEditCell(item, col)"
                      >{{ formatDateTime(item[col.key]) }}</span>
                      <button v-if="isCellEditable(col, item) && !isInlineEditing(item, col)" type="button" class="cell-edit-trigger" :aria-label="`编辑 ${col.label}`" title="编辑" @click="quickEditCell(item, col)">
                        <Pencil :size="12" />
                      </button>
                    </template>
                    <template v-else-if="col.type === 'json'">
                      <span class="cell-json" :title="JSON.stringify(item[col.key])">
                        {{ getJsonPreview(item[col.key]) }}
                      </span>
                    </template>
                    <template v-else>
                      <button
                        v-if="getRelatedJump(col, item)"
                        type="button"
                        class="cell-link"
                        :title="`跳转到关联记录：${item[col.key]}`"
                        @click="jumpToRelatedRecord(getRelatedJump(col, item), item)"
                      >
                        <span v-html="highlightCellValue(item[col.key], col.maxLength)"></span>
                      </button>
                      <span
                        v-else
                        class="cell-text"
                        :class="{ editable: isInlineEditable(col, item) }"
                        :tabindex="isInlineEditable(col, item) ? 0 : -1"
                        role="button"
                        :aria-label="`编辑 ${col.label}`"
                        :title="`${item[col.key] || ''}${isAnomalyRow(item) && col.key === visibleCurrentColumns[0]?.key ? ` · ${getAnomalyReason(item)}` : ''}`"
                        @dblclick="quickEditCell(item, col)"
                        @keydown.enter.prevent="quickEditCell(item, col)"
                        @keydown.space.prevent="quickEditCell(item, col)"
                        v-html="highlightCellValue(item[col.key], col.maxLength)"
                      ></span>
                      <button v-if="isCellEditable(col, item) && !isInlineEditing(item, col)" type="button" class="cell-edit-trigger" :aria-label="`编辑 ${col.label}`" title="编辑" @click="quickEditCell(item, col)">
                        <Pencil :size="12" />
                      </button>
                    </template>
                  </td>
                  <td v-if="hasActionColumn" class="actions-col">
                    <div class="action-btns">
                      <button
                        v-for="act in getRowActionModel(item).primary"
                        :key="act.id"
                        type="button"
                        :class="['review-btn', act.tone]"
                        :disabled="act.disabled"
                        :title="act.title"
                        @click="act.run"
                      >{{ act.label }}</button>
                      <button v-if="canEditCurrentTab" class="icon-btn edit" @click="openEditModal(item)" title="编辑" aria-label="编辑">
                        <Pencil :size="14" />
                      </button>
                      <RowActionMenu :items="getRowActionModel(item).menu" @open="openRowMenu" />
                    </div>
                  </td>
                </tr>
              </TransitionGroup>
            </table>
            </div>

            <template #pagination>
              <span v-if="totalRecordCount > 0" class="g-sheet-foot-text">
                显示 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, totalRecordCount) }}
                条 / 共 {{ totalRecordCount }} 条
              </span>
              <DashboardPagination
                v-if="totalRecordCount > 0"
                v-model="currentPage"
                :total="totalRecordCount"
                :page-size="pageSize"
              />
            </template>
          </DashboardSheet>
          <button v-if="isMobileView && !isModerationTab && canCreateCurrentTab" class="fab-button" @click="openEditModal()" aria-label="新增">
            <Plus :size="24" />
          </button>
        </div>
        </template>
          </section>
        </div>
      </main>
    </div>

    <!-- 行级 ⋯ 浮动菜单（fixed 定位，不被表格滚动裁剪） -->
    <div
      v-if="rowMenu"
      class="row-float-menu"
      role="menu"
      :style="{ top: `${rowMenu.y}px`, left: `${rowMenu.x}px` }"
    >
      <button
        v-for="m in rowMenu.items"
        :key="m.id"
        type="button"
        role="menuitem"
        :class="['row-float-item', { 'is-danger': m.tone === 'danger' }]"
        :disabled="m.disabled"
        @click="runRowMenuItem(m)"
      >{{ m.label }}</button>
    </div>

    <EditDrawer
      ref="editDrawerRef"
      :show="showModal"
      :is-editing="isEditing"
      :editing-item="editingItem"
      :current-tab="currentTab"
      :current-fields="currentFields"
      :is-saving="isSaving"
      :is-news-tab="isNewsTab"
      :can-regenerate-auto-id="canRegenerateAutoId"
      :current-tab-label="currentTabLabel"
      :field-errors="fieldErrors"
      :json-buffers="jsonBuffers"
      :selected-gift-user="selectedGiftUser"
      :show-user-picker="showUserPickerModal"
      :user-picker-keyword="userPickerKeyword"
      @update:user-picker-keyword="(v) => (userPickerKeyword = v)"
      :filtered-gift-users="filteredGiftUsers"
      :address-bundle-text="addressBundleText"
      :address-ai-text="addressAiText"
      :is-processing-address-ai="isProcessingAddressAi"
      :gift-address-options="giftAddressOptions"
      @update:address-ai-text="(v) => (addressAiText = v)"
      @extract-address="handleExtractAddress"
      @clear-address-ai-text="clearAddressAiText"
      @select-gift-address="handleSelectGiftAddress"
      :uploading-image-fields="uploadingImageFields"
      :user-picker-loading="userPickerLoading"
      :show-product-picker="showProductPicker"
      :product-picker-keyword="productPickerKeyword"
      :product-picker-loading="productPickerLoading"
      :filtered-products="filteredProducts"
      @update:product-picker-keyword="(v) => (productPickerKeyword = v)"
      @toggle-product-picker="toggleProductPicker"
      @select-product="selectProduct"
      :is-field-disabled="isFieldDisabled"
      :is-image-upload-pending="isImageUploadPending"
      :has-prev-record="editDrawerNav.hasPrev"
      :has-next-record="editDrawerNav.hasNext"
      :record-nav-label="editDrawerNav.label"
      @close="closeModal"
      @save="saveData"
      @save-and-next="saveAndEditNext"
      @save-and-create="saveAndCreateNext"
      @prev-record="navigateEditRecord(-1)"
      @next-record="navigateEditRecord(1)"
      @regenerate-id="regenerateAutoIdForCurrentTab"
      @regenerate-news-id="regenerateNewsId"
      @inject-news-template="injectNewsTemplate"
      @generate-excerpt="generateExcerptFromContent"
      @copy-address-bundle="copyAddressBundle"
      @open-user-picker="openUserPicker"
      @close-user-picker="closeUserPicker"
      @select-gift-user="selectGiftUser"
      @clear-gift-user="clearSelectedGiftUser"
      @clear-image-field="clearImageField"
      @copy-image-value="copyImageValue"
      @image-upload="handleAdminImageUpload"
      @add-tag="addTag"
      @remove-tag="removeTag"
      @add-spec="addSpec"
      @remove-spec="removeSpec"
      @clear-field-error="clearFieldError"
      @validate-field="validateField"
      @update-field="handleUpdateField"
      @update-json-buffer="handleUpdateJsonBuffer"
      @update-spec-field="handleUpdateSpecField"
      @bohai-key-select="handleBohaiKeySelect"
    />

    <!-- 全局提示 -->
    <div v-if="isBackupExporting" class="backup-progress-overlay" role="dialog" aria-modal="true" aria-label="数据备份导出中">
      <div class="backup-progress-panel">
        <div class="backup-progress-header">数据备份导出中...</div>
        <div class="backup-progress-bar-track">
          <div class="backup-progress-bar-fill" :style="{ width: backupProgress + '%' }"></div>
        </div>
        <div class="backup-progress-text">{{ backupProgressText }}</div>
        <button class="btn btn-secondary btn-sm" @click="cancelBackupExport">取消</button>
      </div>
    </div>

    <Transition name="palette">
      <div
        v-if="showCommandPalette"
        class="command-palette-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        @click.self="closeCommandPalette"
      >
        <div class="command-palette">
          <div class="command-palette-input-row">
            <Search :size="16" class="command-palette-search-icon" aria-hidden="true" />
            <input
              ref="commandInputRef"
              v-model="commandQuery"
              type="text"
              class="command-palette-input"
              placeholder="输入命令或模块名称..."
              aria-label="命令搜索"
              @keydown="onCommandInputKeydown"
            />
            <span class="command-palette-kbd">ESC</span>
          </div>
          <ul v-if="filteredCommandPaletteItems.length" class="command-palette-list" role="listbox" aria-label="命令列表">
            <li
              v-for="(item, idx) in filteredCommandPaletteItems"
              :key="item.id"
              role="option"
              :aria-selected="idx === commandActiveIndex"
              :class="['command-palette-item', { 'is-active': idx === commandActiveIndex }]"
              @mouseenter="commandActiveIndex = idx"
              @click="runCommandPaletteItem(item)"
            >
              <span class="command-palette-label">{{ item.label }}</span>
              <span v-if="item.hint" class="command-palette-hint">{{ item.hint }}</span>
            </li>
          </ul>
          <p v-else class="command-palette-empty">没有匹配的命令</p>
        </div>
      </div>
    </Transition>

    <Transition name="toast">
      <div
        v-if="toast.show"
        class="toast"
        :class="`toast-${toast.type}`"
        :role="toast.type === 'error' ? 'alert' : 'status'"
        :aria-live="toast.type === 'error' ? 'assertive' : 'polite'"
      >
        <span class="toast-icon" aria-hidden="true">{{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ' }}</span>
        <span class="toast-message">{{ toast.message }}</span>
        <button v-if="toast.action" class="toast-action" @click="runToastAction">{{ toast.action.label }}</button>
        <button v-if="toast.type === 'error'" class="toast-dismiss" @click="dismissToast" aria-label="关闭提示">
          <X :size="14" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, reactive, shallowReactive, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import {
  Activity,
  Check,
  Copy,
  Cpu,
  Database,
  Download,
  FileText,
  Filter,
  Gauge,
  Home,
  Image,
  KeyRound,
  MessageSquare,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Server,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-vue-next';
import AdminHeader from './components/AdminHeader.vue';
import AdminOverview from './components/AdminOverview.vue';
import AdminSidebar from './components/AdminSidebar.vue';
import LotteryOperationsPanel from './components/LotteryOperationsPanel.vue';
import ApiKeyConsole from './components/ApiKeyConsole.vue';
import LabAiModelConfig from './components/LabAiModelConfig.vue';
import ModerationModelConfig from './components/ModerationModelConfig.vue';
import FreemodelsConfig from './components/FreemodelsConfig.vue';
import AiQuotaConfigConsole from './components/AiQuotaConfigConsole.vue';
import PointsGrantConsole from './components/PointsGrantConsole.vue';
import PityGrantConsole from './components/PityGrantConsole.vue';
import SubscriptionGrantConsole from './components/SubscriptionGrantConsole.vue';
import EditDrawer from './components/EditDrawer.vue';
import DashboardSheet from './components/shared/DashboardSheet.vue';
import DashboardPagination from './components/shared/DashboardPagination.vue';
import RowActionMenu from './components/shared/RowActionMenu.vue';
import { getImageUrl } from '../../utils/asset-helper';
import { supabase } from '@/utils/supabase-client.js';
import { invalidateByTags } from '@/utils/request-core.js';
import {
  isCloudinaryNoteUploadConfigured,
  uploadImageToCloudinary
} from '@/utils/cloudinary-client.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory } from '@/utils/gift-archive.js';
import { getDefaultApiUrlForBohaiProvider, listActiveBohaiModelConfigs, buildBohaiRuntimeModels } from '@/utils/api/bohai-model-config-api.js';
import { clearVaultModelCache, clearUserTierCache, callVaultSiliconChat } from '@/utils/api/api-key-runtime-api.js';
import { logger } from '@/utils/logger.js';
import { themeManager } from '@/utils/theme-manager.js';
import {
  ADMIN_PAGE_META,
  NEWS_CATEGORY_VALUES,
  PRODUCT_CATEGORY_OPTIONS,
  SUBSCRIPTION_PLAN_NAMES,
  TABS_ACTIONS,
  TABS_KEEP_ID_ON_INSERT,
  TAB_WRITABLE_FIELDS,
  dataConfig,
  invalidateProductsCache,
  tabs
} from './config.js';
import { tabModules } from './config/tabs.js';
import {
  canViewModule,
  filterTabActionsByRole,
  getDeniedModuleIds,
  getRoleLabel,
  getUserRole
} from './config/rbac.js';
import { BOHAI_MODEL_PROVIDER_OPTIONS } from './config/fields.js';
import {
  ADMIN_SECTION_DEFAULT_TABS,
  DATA_CONSOLE_SECTIONS,
  DATE_FILTER_FIELDS,
  LOTTERY_LEGACY_SELECT_COLUMNS,
  PLACEHOLDER_ADMIN_SECTIONS,
  STATUS_FILTER_FIELDS,
  TAB_DEFAULT_SORT,
  TAB_SEARCH_FIELDS,
  TAB_SELECT_COLUMNS,
  TAB_SORT_COLUMNS,
  isMissingLotteryObservabilitySchemaError
} from './query-config.js';
import DOMPurify from '@/utils/dompurify.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import {
  createFieldValidator,
  createRequiredFieldsValidator,
  createNewsPayloadValidator,
  getNextNumericId,
  splitForumContent,
  normalizeNewsContent,
  validateDateString,
  // P1 修复: 从 validation.js 导入 stripHtml/escapeHtml/hasHtmlTag，删除重复定义
  stripHtml,
  escapeHtml,
  hasHtmlTag,
  UUID_REGEX,
  EMAIL_REGEX
} from './composables/useDataAdminValidation.js';
import {
  createPersisters,
  hydrateAdminPreferences,
  readLocalJson,
  writeLocalJson,
  ADMIN_STORAGE_KEYS as STORAGE_KEYS
} from './composables/useDataAdminPersistence.js';
import {
  applySearchAndSort as applySearchAndSortUtil,
  buildSearchFilters as buildSearchFiltersUtil,
  getSearchablePreviewFields as getSearchablePreviewFieldsUtil,
  sanitizeSearchTerm
} from './composables/useDataAdminFilters.js';
import { createChangeLogCenter } from './composables/useDataAdminChangeLog.js';
import { createFilterState } from './composables/useDataAdminFilterState.js';
import { createMutationsCenter } from './composables/useDataAdminMutations.js';
import { createLotteryOperationsCenter } from './composables/useLotteryOperations.js';
import { SAVE_STRATEGIES } from './config/saveStrategies.js';
import { setupDataAdminLifecycle } from './composables/useDataAdminLifecycle.js';
import {
  formatCellValue,
  formatDate,
  formatDateTime,
  getBadgeType,
  getTags,
  createHighlightHelpers,
  getJsonPreview,
  downloadBlob,
  createRelatedJumpHelpers,
  createAnomalyHelpers,
  toDateInputValue,
  toISOStringFromInput,
  normalizeQuickEditValue
} from './composables/useDataAdminHelpers.js';
import { createExportCenter } from './composables/useDataAdminExport.js';
import { createGlobalSearchCenter } from './composables/useDataAdminGlobalSearch.js';
import { createShortcutsCenter } from './composables/useDataAdminShortcuts.js';
import { createNavigationCenter } from './composables/useDataAdminNavigation.js';

const CACHE_TTL = 45_000;

const router = useRouter();
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

// 管理面板返回站点首页，避免后台操作被带回个人空间。
const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

// 替换 window.confirm / window.prompt 的响应式弹窗(P1-P2)
// 弹窗实例已在 App.vue 全局挂载, 此处仅获取 dialog API
const dialog = useConfirmDialog();

// ==================== 状态管理 ====================
// tab/section 持久化：变更写回 URL query（?section=..&tab=..），刷新后原位恢复。
// 非法值（过期 tab id、乱写 URL）回退默认，防止 currentConfig 指向 undefined。
const routeQuery = router.currentRoute.value?.query || {};
const routeQueryTab = typeof routeQuery.tab === 'string' ? routeQuery.tab : '';
const isValidAdminTab = (tabId) => tabs.some((tab) => tab.id === tabId);
const currentTab = ref(isValidAdminTab(routeQueryTab) ? routeQueryTab : 'users');
const isLoading = ref(false);
const isFilterLoading = ref(false);
const isRefreshing = ref(false);
const hasLoadedOnce = ref(false);
const isSaving = ref(false);
// isExportingBackup / isBackupExporting / backupProgress / backupProgressText /
// cancelBackupExport 由下方 createExportCenter 工厂注入
const showModal = ref(false);
const showUserPickerModal = ref(false);
// showGlobalSearchPanel 由下方 createGlobalSearchCenter 工厂注入
const showAdvancedFilterPanel = ref(false);
const showColumnPanel = ref(false);
const showBatchEditPanel = ref(false);
const showChangeLogPanel = ref(false);
const isCleaningLogs = ref(false);
const showFilterBar = ref(false);
const brokenCardImages = ref(new Set());
const isEditing = ref(false);
const editingItem = ref({});
const editingOriginalItem = ref(null);
const jsonBuffers = ref({});
const fieldErrors = reactive({});
const searchQuery = ref('');
// globalSearchQuery / globalSearchResults / isGlobalSearching / showGlobalSearchPanel
// 由下方 createGlobalSearchCenter 工厂注入
const statusFilter = ref('');
const dateFromFilter = ref('');
const dateToFilter = ref('');
const advancedFilterRules = ref([]);
const userPickerKeyword = ref('');
// 商品选择器状态（礼物编辑专用）
const showProductPicker = ref(false);
const productPickerKeyword = ref('');
const productPickerLoading = ref(false);
const productPickerProducts = ref([]);
const selectedItems = ref([]);
// 全选所有结果模式：为 true 时 selectedItems 代表跨页全选（Gmail 语义）
const selectAllResultsMode = ref(false);
  const currentPage = ref(1);
  const pageSize = ref(20);
  // 表格密度：compact 紧凑（默认）| comfortable 舒适，持久化到 localStorage
  const density = ref((() => {
    try { return localStorage.getItem('dm-density') || 'compact'; }
    catch (e) { return 'compact'; }
  })());
  const setDensity = (mode) => {
    density.value = mode;
    try { localStorage.setItem('dm-density', mode); } catch (e) { /* ignore */ }
  };
const sortKey = ref('');
const sortOrder = ref('asc');
const isAdminSidebarOpen = ref(false);
// 桌面端侧栏折叠（图标栏）；移动端抽屉仍由 isAdminSidebarOpen 控制
// 偏好持久化，悬停 150ms 浮层展开（见 AdminSidebar 样式）
const isSidebarCollapsed = ref((() => {
  try { return localStorage.getItem('dm-sidebar-collapsed') === '1'; }
  catch (e) { return false; }
})());
watch(isSidebarCollapsed, (collapsed) => {
  try { localStorage.setItem('dm-sidebar-collapsed', collapsed ? '1' : '0'); }
  catch (e) { /* ignore */ }
});
// 侧栏模块筛选关键词（仅过滤导航，不过滤表格数据）
const sidebarSearchQuery = ref('');
const routeAdminSection = router.currentRoute.value?.meta?.adminSection;
const routeQuerySection = typeof routeQuery.section === 'string' && /^[a-z][a-z-]{1,29}$/.test(routeQuery.section)
  ? routeQuery.section
  : '';
// query.section 优先于路由 meta：用户在面板内切换 section 后，刷新应恢复"最后停留处"而非路由默认
const activeAdminSection = ref(routeQuerySection
  || (typeof routeAdminSection === 'string' && routeAdminSection ? routeAdminSection : 'overview'));

// section/tab 变更统一写回 URL（replace 不堆积历史）：watch 收口所有变更路径
// （switchTab / handleModuleClick / handleAdminNavClick / 占位页动作），无需逐处补 replace
watch([activeAdminSection, currentTab], ([section, tab]) => {
  const currentQuery = router.currentRoute.value?.query || {};
  if (currentQuery.section === section && currentQuery.tab === tab) return;
  router.replace({ query: { ...currentQuery, section, tab } }).catch(() => {});
});
// 反向同步（浏览器后退/前进）在下方 switchTab 定义之后挂载，需复用其完整状态重置逻辑
const isDataTreeCollapsed = ref(false);
// 移动端判定：窄屏，或粗指针+横屏矮视口（手机横屏按移动卡片走，不进桌面表格）
const computeMobileView = () => {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < 768) return true;
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  return coarse && window.innerWidth < 950 && window.innerHeight < 550;
};
const isMobileView = ref(computeMobileView());
const handleResize = () => { isMobileView.value = computeMobileView(); };

// ==================== 当前表配置（前置声明） ====================
// 视图形态区块的 immediate watcher 会在 setup 期立即求值 currentConfig，
// 故在此提前声明；原位置保留引用注释。
const currentConfig = computed(() => dataConfig[currentTab.value]);
const currentColumns = computed(() => currentConfig.value?.columns || []);
const currentFields = computed(() => currentConfig.value?.fields || []);

// ==================== 通用视图形态：table | card | kanban | timeline ====================
const VIEW_MODE_LABELS = { table: '表格', card: '卡片', kanban: '看板', timeline: '时间线' };
const currentCardViewConfig = computed(() => currentConfig.value?.cardView || null);
const hasCardView = computed(() => Boolean(currentCardViewConfig.value));

// 看板配置：kanban.statusKey/statusMeta 显式 > cardView.statusKey/statusMeta > 自动推断 status select 字段
const kanbanViewConfig = computed(() => {
  const cfg = currentConfig.value || {};
  if (cfg.kanban === false) return null;
  const fieldsAll = [...(cfg.fields || []), ...(cfg.columns || [])];
  const explicit = cfg.kanban && typeof cfg.kanban === 'object' ? cfg.kanban : null;
  const statusField = (explicit?.statusKey && fieldsAll.find(f => f.key === explicit.statusKey))
    || (cfg.cardView?.statusKey && fieldsAll.find(f => f.key === cfg.cardView.statusKey))
    || fieldsAll.find(f => /status/i.test(f.key) && f.type === 'select' && Array.isArray(f.options));
  if (!statusField) return null;
  const statusMeta = { ...(cfg.cardView?.statusMeta || {}), ...(explicit?.statusMeta || {}) };
  const rawCols = explicit?.statusMeta
    ? Object.entries(explicit.statusMeta)
    : (statusField.options || []).map(o => [o.value, { label: o.label, tone: 'muted' }]);
  const columns = rawCols.map(([value, meta]) => ({ value, label: meta.label, tone: meta.tone || 'muted' }));
  if (!columns.length) return null;
  return { statusKey: statusField.key, columns, statusMeta };
});

// 时间线配置：timeline.dateKey/titleKey/bodyKeys 显式 > 自动推断 datetime 列 + 首文本列
const timelineViewConfig = computed(() => {
  const cfg = currentConfig.value || {};
  if (cfg.timeline === false) return null;
  const cols = cfg.columns || [];
  const explicit = cfg.timeline && typeof cfg.timeline === 'object' ? cfg.timeline : null;
  const dateField = (explicit?.dateKey && cols.find(f => f.key === explicit.dateKey))
    || cols.find(f => f.type === 'datetime' || f.type === 'date')
    || cols.find(f => /time|date|at$/i.test(f.key));
  if (!dateField) return null;
  const titleField = (explicit?.titleKey && cols.find(f => f.key === explicit.titleKey))
    || cols.find(f => f.key !== dateField.key && !/id$/i.test(f.key) && f.type !== 'datetime' && f.type !== 'date')
    || cols.find(f => f.key !== dateField.key);
  const bodyFields = (explicit?.bodyKeys || [])
    .map(k => cols.find(f => f.key === k)).filter(Boolean);
  const bodyFieldsAuto = bodyFields.length
    ? bodyFields
    : cols.filter(f => f.key !== dateField.key && f.key !== titleField?.key
        && f.type !== 'datetime' && f.type !== 'date' && !/^id$/i.test(f.key)).slice(0, 4);
  return { dateKey: dateField.key, titleKey: titleField?.key, bodyFields: bodyFieldsAuto };
});

const hasKanbanView = computed(() => Boolean(kanbanViewConfig.value));
const hasTimelineView = computed(() => Boolean(timelineViewConfig.value));
const availableViewModes = computed(() => {
  const modes = ['table'];
  if (hasCardView.value) modes.push('card');
  if (hasKanbanView.value) modes.push('kanban');
  if (hasTimelineView.value) modes.push('timeline');
  return modes;
});

const defaultViewMode = computed(() => currentConfig.value?.defaultView || (hasCardView.value ? 'card' : 'table'));
const viewMode = ref('table');
const viewModeStorageKey = () => `dm-view-${currentTab.value}`;
const loadViewMode = () => {
  try {
    const stored = localStorage.getItem(viewModeStorageKey());
    if (stored && availableViewModes.value.includes(stored)) return stored;
  } catch (e) { /* ignore */ }
  return defaultViewMode.value;
};
const setViewMode = (mode) => {
  if (!availableViewModes.value.includes(mode)) return;
  viewMode.value = mode;
  try { localStorage.setItem(viewModeStorageKey(), mode); } catch (e) { /* ignore */ }
};
watch(currentTab, () => { viewMode.value = loadViewMode(); }, { immediate: true });

const isCardViewActive = computed(() => viewMode.value === 'card');
const isKanbanViewActive = computed(() => viewMode.value === 'kanban');
const isTimelineViewActive = computed(() => viewMode.value === 'timeline');

// ===== 看板辅助 =====
const kanbanItemsInCol = (colValue) => {
  const statusKey = kanbanViewConfig.value?.statusKey;
  if (!statusKey) return [];
  return currentData.value.filter(item => String(item[statusKey] ?? '') === String(colValue));
};
const kanbanCardSubtitle = (item) => {
  const cfg = currentCardViewConfig.value;
  if (cfg?.subtitleKey) return formatCardSubtitle(item, cfg);
  const cols = currentConfig.value?.columns || [];
  const first = cols.find(f => f.key !== kanbanViewConfig.value?.statusKey
    && !/id$/i.test(f.key) && f.type !== 'datetime' && f.type !== 'date');
  return first ? formatCellValue(item[first.key], first.maxLength) : '';
};

// ===== 时间线辅助 =====
const timelineDays = computed(() => {
  const cfg = timelineViewConfig.value;
  if (!cfg) return [];
  const groups = new Map();
  for (const item of currentData.value) {
    const raw = item[cfg.dateKey];
    const label = raw ? formatDate(raw) : '未标注时间';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  const days = [...groups.entries()].map(([label, items]) => ({ label, items }));
  days.sort((a, b) => (a.label > b.label ? -1 : a.label < b.label ? 1 : 0));
  return days;
});
const timelineTitle = (item) => {
  const cfg = timelineViewConfig.value;
  if (cfg?.titleKey) {
    const v = item[cfg.titleKey];
    if (v != null && v !== '') return String(v);
  }
  return getCardTitle(item);
};
const timelineTimeText = (item) => {
  const cfg = timelineViewConfig.value;
  if (!cfg) return '';
  return item[cfg.dateKey] ? formatDateTime(item[cfg.dateKey]) : '';
};
const timelineBody = (item) => {
  const cfg = timelineViewConfig.value;
  if (!cfg) return [];
  return cfg.bodyFields
    .map(f => ({ key: f.key, label: f.label, value: formatCellValue(item[f.key], f.maxLength) }))
    .filter(f => f.value !== '' && f.value !== null && f.value !== undefined);
};

// 卡片视图通用格式化
const formatCardStatValue = (item, stat) => {
  const raw = item?.[stat.key];
  if (raw == null || raw === '') return '—';
  if (stat.values) {
    const key = String(raw);
    return stat.values[key] ?? stat.values[String(raw === true)] ?? String(raw);
  }
  if (stat.format === 'price') return `¥${raw}`;
  if (stat.format === 'datetime') return formatDateTime(raw);
  if (stat.format === 'date') return formatDate(raw);
  return String(raw);
};
const formatCardMetaValue = (item, meta) => {
  const raw = item?.[meta.key];
  if (raw == null || raw === '') return '—';
  if (meta.format === 'price') return `¥${raw}`;
  if (meta.format === 'datetime') return formatDateTime(raw);
  if (meta.format === 'date') return formatDate(raw);
  return String(raw);
};
const formatCardSubtitle = (item, config) => {
  if (!config?.subtitleKey) return '';
  const raw = item?.[config.subtitleKey];
  if (raw == null || raw === '') return '';
  if (config.subtitleFormat === 'datetime') return formatDateTime(raw);
  if (config.subtitleFormat === 'date') return formatDate(raw);
  return String(raw);
};
const isCardImageBroken = (item, config) => {
  const id = item?.id || getRowIdentity(item);
  return brokenCardImages.value.has(`${id}:${config?.imageKey}`);
};
const onCardImageError = (item, config) => {
  const id = item?.id || getRowIdentity(item);
  brokenCardImages.value.add(`${id}:${config?.imageKey}`);
  // 触发响应式更新
  brokenCardImages.value = new Set(brokenCardImages.value);
};
const getCardStatusMeta = (item, config) => {
  if (!config?.statusKey) return null;
  const raw = item?.[config.statusKey];
  const key = String(raw);
  const meta = config.statusMeta?.[key] || config.statusMeta?.[String(raw === true)] || config.statusMeta?.[key.toLowerCase?.()];
  if (meta) return meta;
  if (raw == null || raw === '') return null;
  return { label: String(raw), tone: 'muted' };
};

// 卡片一键复制
const copiedFieldKey = ref('');
const getCardFieldCopyKey = (item, meta) => `${item?.id || getRowIdentity(item)}:${meta?.key || ''}`;
const copyCardField = async (item, meta) => {
  let text;
  if (meta.copyText === 'fullAddress') {
    const parts = [item.recipient, item.phone, item.region, item.detail].filter(Boolean);
    text = parts.join(' ');
  } else {
    text = String(item?.[meta.key] ?? '');
  }
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const stamp = getCardFieldCopyKey(item, meta);
    copiedFieldKey.value = stamp;
    setTimeout(() => { if (copiedFieldKey.value === stamp) copiedFieldKey.value = ''; }, 1500);
  } catch (e) {
    console.warn('[DataAdmin] 复制失败:', e);
  }
};
const isCardFieldCopied = (meta, item) => {
  return copiedFieldKey.value === getCardFieldCopyKey(item, meta);
};

// 主题只认 dark / light：AdminHeader 的图标与 aria 只判这两个值，
// 而 themeManager 还可能返回 home-cat / anniversary-mc 这类自定义主题。
const normalizeTheme = (theme) => (theme === 'dark' ? 'dark' : 'light');
// 本页根元素自绑 data-theme（与 ForumMain / UserSpaceMain 等组件同款写法），
// 因此断言/样式都能直接依赖 .data-management-page[data-theme="dark"]，
// 不再依赖 document 级旁路或 prefers-color-scheme 兜底。
const currentTheme = ref(normalizeTheme(themeManager.getTheme()));
const uploadingImageFields = ref([]);
const tabTotals = reactive(tabs.reduce((acc, tab) => {
  acc[tab.id] = 0;
  return acc;
}, {}));
const activeFetchId = ref(0);
const searchDebounceTimer = ref(null);
const suppressNextPageFetch = ref(false);
const tabFetchCache = reactive({});
const userPickerUsers = ref([]);
const userPickerLoading = ref(false);
const userPickerFetchId = ref(0);
const userPickerSearchDebounceTimer = ref(null);
// 地址管理 AI 识别
const addressAiText = ref('');
const isProcessingAddressAi = ref(false);
const addressAiModelRef = ref(null);
// 礼物地址选择：当前选中用户的地址列表 options
const giftAddressOptions = ref([]);
const giftAddressRawList = ref([]);
const moderationPendingIds = ref([]);
const lotterySchedulerStatus = ref(null);
const lotterySchedulerStatusLoading = ref(false);
const lotteryDueDrawPending = ref(false);
const lastRefreshedAt = ref(null);
const columnSettings = ref({});
const savedFilterViews = ref({});
const pinnedTabIds = ref([]);
const recentRecords = ref([]);
const changeLogEntries = ref([]);
// 持久化工厂 (替换原先内联的 persist* / writeLocalJson 调用)
const {
  persistColumnSettings,
  persistSavedViews,
  persistPinnedTabs,
  persistRecentRecords,
  persistChangeLog
} = createPersisters({
  columnSettings,
  savedFilterViews,
  pinnedTabIds,
  recentRecords,
  changeLogEntries
});
const inlineEditState = reactive({
  rowId: '',
  fieldKey: '',
  value: '',
  saving: false
});
const batchEditState = reactive({
  fieldKey: '',
  value: ''
});
const suppressDraftSave = ref(false);

const autoRefreshInterval = ref(null);
const secondsUntilRefresh = ref(30);
const isAutoRefreshing = ref(false);

// 提示消息（action 为可选操作按钮，如审核撤销）
const toast = reactive({
  show: false,
  message: '',
  type: 'info',
  timer: null,
  action: null
});

let toastTimer = null;
const showToast = (message, type = 'info', action = null) => {
  if (toastTimer) clearTimeout(toastTimer);
  if (toast.timer) clearTimeout(toast.timer);
  toast.message = message;
  toast.type = type;
  toast.action = action;
  toast.show = true;
  if (type !== 'error') {
    toastTimer = setTimeout(() => {
      toast.show = false;
      toast.action = null;
      toastTimer = null;
    }, 4000);
  }
};
const runToastAction = () => {
  const action = toast.action;
  toast.show = false;
  toast.action = null;
  action?.run?.();
};
const dismissToast = () => {
  if (toastTimer) clearTimeout(toastTimer);
  toast.show = false;
  toast.action = null;
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

const handleUpdateField = (fieldKey, value) => {
  if (fieldKey && editingItem.value) {
    editingItem.value[fieldKey] = value;
  }
};

// BOHAI 模型配置：从 API Key 预填 provider / provider_label / api_url
const handleBohaiKeySelect = (keyMeta) => {
  if (!editingItem.value || !keyMeta) return;
  // 同步 provider
  editingItem.value.provider = keyMeta.provider;
  // 同步 provider_label（优先用 Key 自带 label，否则按 provider 取默认显示名）
  const providerOpt = BOHAI_MODEL_PROVIDER_OPTIONS.find((o) => o.value === keyMeta.provider);
  editingItem.value.provider_label = keyMeta.label || providerOpt?.label || keyMeta.provider;
  // 同步 api_url：仅当 Key 自身配置了 apiUrl 时才覆盖；
  // 否则保留当前 editingItem 的 api_url（避免给 custom 错填 siliconflow 默认值）
  if (keyMeta.apiUrl) {
    editingItem.value.api_url = keyMeta.apiUrl;
  } else if (keyMeta.provider === 'custom') {
    // custom provider 没有默认 URL，清空让用户手填
    editingItem.value.api_url = '';
  } else {
    // 其他 provider 走默认值兜底
    editingItem.value.api_url = getDefaultApiUrlForBohaiProvider(keyMeta.provider);
  }
  // model_id 清空，让用户从 freemodels 下拉里重新选（不同 provider 对应不同模型）
  editingItem.value.model_id = '';
};

const handleUpdateJsonBuffer = (fieldKey, value) => {
  if (!fieldKey) return;
  jsonBuffers.value = { ...jsonBuffers.value, [fieldKey]: value };
};

const handleUpdateSpecField = (fieldKey, index, prop, value) => {
  if (!fieldKey || !editingItem.value || !Array.isArray(editingItem.value[fieldKey])) return;
  const next = editingItem.value[fieldKey].map((spec, i) =>
    i === index ? { ...spec, [prop]: value } : spec
  );
  editingItem.value[fieldKey] = next;
};

const invalidateSubscriptionCache = (userId = '') => {
  const tags = ['subscriptions'];
  const normalizedUserId = String(userId || '').trim();
  if (normalizedUserId) {
    tags.push(`subscriptions:user:${normalizedUserId}`);
  }
  invalidateByTags(tags);
  // 管理员代开/变更订阅后，同步清除目标用户的服务端 tier 缓存（5 分钟 TTL），让额度/模式立即生效
  if (normalizedUserId && isCurrentUserAdmin.value) {
    clearUserTierCache({ targetUserId: normalizedUserId }).catch((error) => {
      logger.warn('data-admin', '清除目标用户服务端订阅缓存失败:', error);
    });
  }
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
// 使用 shallowReactive: 顶层字段响应,但行内嵌对象(specifications/metadata 等)不需要 deep proxy,
// 大幅减少启动时 proxy 包装次数
const dataStore = shallowReactive({
  users: [],
  points: [],
  subscriptions: [],
  gifts: [],
  forum: [],
  reportedPosts: [],
  reviewPosts: [],
  reviewComments: [],
  coreMemories: [],
  bohaiModels: [],
  lotteries: [],
  lotteryEntries: [],
  lotteryDrawLogs: [],
  lotteryFailureStats: [],
  lotteryFulfillments: [],
  lotterySchedulerLogs: [],
  lotteryNotificationJobs: [],
  lotteryJoinAttempts: [],
  lotteryAuditLogs: [],
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
  totalBohaiModels: 0,
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
// NOTE: currentConfig/currentColumns/currentFields 已前移至视图形态区块之前声明
//（immediate watcher 在 setup 期即求值，声明在后会触发 TDZ，见上方“当前表配置”）。
const visibleCurrentColumns = computed(() => {
  const configured = columnSettings.value[currentTab.value];
  if (!configured || !Array.isArray(configured.visibleKeys)) return currentColumns.value;
  const visibleKeys = new Set(configured.visibleKeys);
  const orderedKeys = Array.isArray(configured.orderKeys) ? configured.orderKeys : currentColumns.value.map((col) => col.key);
  const columnsByKey = new Map(currentColumns.value.map((col) => [col.key, col]));
  const orderedColumns = orderedKeys
    .map((key) => columnsByKey.get(key))
    .filter((col) => col && visibleKeys.has(col.key));
  const missingColumns = currentColumns.value.filter((col) => visibleKeys.has(col.key) && !orderedKeys.includes(col.key));
  return [...orderedColumns, ...missingColumns];
});
const mobileVisibleColumns = computed(() => {
  return visibleCurrentColumns.value.slice(0, 4);
});
const getCardTitle = (item) => {
  return item.title || item.name || item.username || item.email || item.id || '记录';
};
const editableFields = computed(() => {
  const writable = new Set(TAB_WRITABLE_FIELDS[currentTab.value] || []);
  return currentFields.value.filter((field) =>
    writable.has(field.key)
    && !field.disabled
    && !['json', 'tags', 'specifications', 'image', 'user-picker', 'product-picker', 'textarea'].includes(field.type)
  );
});
const inlineEditableFieldKeys = computed(() => new Set(
  editableFields.value
    .filter((field) => ['select', 'number', 'text', 'email', 'date', 'datetime'].includes(field.type))
    .map((field) => field.key)
));
const currentTabLabel = computed(() => tabs.find(t => t.id === currentTab.value)?.label || '');
const isNewsTab = computed(() => currentTab.value === 'news');
const isCurrentUserAdmin = computed(() => String(userInfo.value?.role || '').trim() === 'admin');
// RBAC：当前角色（admin 全量；moderator 受 MODULE_ALLOWED_ROLES 约束，见 config/rbac.js）
const currentUserRole = computed(() => getUserRole(userInfo.value));
const {
  lotteryOperationsSnapshot,
  refreshLotteryOperationsSnapshot
} = createLotteryOperationsCenter({ isCurrentUserAdmin, showToast });
const canRegenerateAutoId = computed(() =>
  !isEditing.value && ['news', 'activities', 'products'].includes(currentTab.value)
);

const currentTabActions = computed(() => {
  const actions = TABS_ACTIONS?.[currentTab.value];
  return filterTabActionsByRole(currentUserRole.value, actions);
});
const hasTabAction = (action) => currentTabActions.value.has(action);
const canCreateCurrentTab = computed(() => hasTabAction('create'));
const canEditCurrentTab = computed(() => hasTabAction('edit'));
const canDeleteCurrentTab = computed(() => hasTabAction('delete'));
const canBanMute = computed(() => hasTabAction('ban') || hasTabAction('mute'));
const isProfileDerivedTab = computed(() => !canDeleteCurrentTab.value && hasTabAction('edit') && !hasTabAction('create'));
const isReadOnlyTab = computed(() => currentTabActions.value.size <= 1 && hasTabAction('view'));
const isSubscriptionTab = computed(() => currentTab.value === 'subscriptions');
const currentTabInfo = computed(() => tabs.find(t => t.id === currentTab.value));
const isPageTab = computed(() => currentTabInfo.value?.type === 'page');
const isTableTab = computed(() => !isPageTab.value);
const PAGE_TAB_COMPONENTS = {
  'api-keys': ApiKeyConsole,
  'freemodels': FreemodelsConfig,
  'ai-quota': AiQuotaConfigConsole,
  'moderation-model': ModerationModelConfig,
  'lab-ai-model': LabAiModelConfig,
  'points-grant': PointsGrantConsole,
  'pity-grant': PityGrantConsole,
  'subscriptions-grant': SubscriptionGrantConsole
};
const currentPageComponent = computed(() => PAGE_TAB_COMPONENTS[currentTab.value] || null);
const lotteryOpsTabs = new Set(['lotteries', 'lotteryFulfillments', 'lotteryEntries', 'lotteryAuditLogs']);
const isLotteryOpsTab = computed(() => lotteryOpsTabs.has(currentTab.value));
const moderationTabConfig = computed(() => {
  if (!hasTabAction('moderate')) return null;
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
  };
  return configMap[currentTab.value] || null;
});
const isModerationTab = computed(() => Boolean(moderationTabConfig.value));
const hasActionColumn = computed(() =>
  isModerationTab.value ||
  canEditCurrentTab.value ||
  canDeleteCurrentTab.value ||
  canBanMute.value ||
  currentTab.value === 'lotteries' ||
  currentTab.value === 'lotteryFulfillments'
);
const isRejectedModerationTab = computed(() => ['reviewPosts', 'reviewComments'].includes(currentTab.value));
const isMessageModerationTab = computed(() => currentTab.value === 'reviewComments');
const isReportedPostModerationTab = computed(() => currentTab.value === 'reportedPosts');
const lotteryActionPendingIds = ref([]);

const isDataConsoleSection = computed(() => DATA_CONSOLE_SECTIONS.has(activeAdminSection.value));
const isPlaceholderAdminSection = computed(() => PLACEHOLDER_ADMIN_SECTIONS.has(activeAdminSection.value));
// 筛选相关的 computeds (currentStatusFilterField/currentDateFilterField/statusFilterOptions/
//   hasActiveFilters/activeAdvancedRules/activeFilterSummary/statusFilterLabel/currentDateFilterLabel/
//   currentSavedViews) 由 createFilterState 工厂提供 (见 fetchTabData 之后)
// 当前先声明占位引用, 避免模板渲染时找不到变量
// (createFilterState 调用后将重新赋值)
// 变更日志/最近访问/固定 Tab 相关的 computeds 由 createChangeLogCenter 工厂提供 (见 switchTab 之后)
// 当前先声明占位引用, 避免模板渲染时找不到变量
// (createChangeLogCenter 调用后将重新赋值)
const lastRefreshLabel = computed(() =>
  lastRefreshedAt.value ? `刷新于 ${formatDateTime(lastRefreshedAt.value)}` : '尚未刷新'
);

// 收集结果类 tab: 管理员查看用户提交的收集表数据 (当前为海报申请, 后续可扩展自建收集表)
const COLLECTION_RESULT_TABS = new Set(['posterRequests']);
const isCollectionResultTab = computed(() => COLLECTION_RESULT_TABS.has(currentTab.value));

// 收集结果状态分布概览: 基于当前视图统计各状态条数, 点击 chip 即按状态筛选
const collectionStatusBreakdown = computed(() => {
  if (!isCollectionResultTab.value) return [];
  const options = statusFilterOptions.value;
  const counts = new Map();
  let total = 0;
  for (const row of currentData.value) {
    total++;
    const statusKey = String(row?.status ?? '');
    if (statusKey) counts.set(statusKey, (counts.get(statusKey) || 0) + 1);
  }
  return [
    { value: '', label: '全部', count: total, tone: 'muted', active: statusFilter.value === '' },
    ...options.map((option) => {
      const value = String(option.value);
      return {
        value,
        label: option.label,
        count: counts.get(value) || 0,
        tone: getBadgeType(value),
        active: statusFilter.value === value
      };
    })
  ];
});

const applyCollectionStatusFilter = (value) => {
  statusFilter.value = value;
  handleFilterChange();
};

// 通用状态分布（config 驱动）：有看板/状态字段的表都显示状态分布条并支持下钻筛选
const statusBreakdownForCurrentTab = computed(() => {
  const kb = kanbanViewConfig.value;
  if (!kb) return collectionStatusBreakdown.value;
  const counts = new Map();
  let total = 0;
  for (const row of currentData.value) {
    total++;
    const key = String(row?.[kb.statusKey] ?? '');
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [
    { value: '', label: '全部', count: total, tone: 'muted', active: statusFilter.value === '' },
    ...kb.columns.map(col => ({
      value: col.value,
      label: col.label,
      count: counts.get(col.value) || 0,
      tone: col.tone,
      active: statusFilter.value === col.value
    }))
  ];
});

const diagnosticIssueCount = computed(() => {
  const dueDraws = Number(lotterySchedulerStatus.value?.due_count || 0);
  const schedulerFailed = ['failed', 'partial_failure'].includes(String(lotterySchedulerStatus.value?.last_run?.status || ''));
  return moderationPendingCount.value
    + dueDraws
    + getTabCount('lotteryNotificationJobs')
    + (schedulerFailed ? 1 : 0);
});
const healthScore = computed(() => Math.max(70, 100 - Math.min(diagnosticIssueCount.value * 3, 30)));

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

  // addresses / posterRequests 表使用 recipient / phone 字段，归一化为 EditDrawer 显示所需的 shipping_* 键
  if (currentTab.value === 'addresses' || currentTab.value === 'posterRequests') {
    return {
      id: userId,
      username: editingItem.value?.username || '',
      email: '',
      shipping_recipient: editingItem.value?.recipient || '',
      shipping_phone: editingItem.value?.phone || '',
      shipping_address: currentTab.value === 'posterRequests' ? (editingItem.value?.address || '') : ''
    };
  }

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

// 商品选择器：过滤后的商品列表
const filteredProducts = computed(() => {
  const keyword = productPickerKeyword.value.trim().toLowerCase();
  const products = productPickerProducts.value;
  if (!keyword) return products.slice(0, 50);
  return products
    .filter((p) => String(p.title || '').toLowerCase().includes(keyword))
    .slice(0, 50);
});

// 商品选择器：加载商城商品
const loadProductPickerProducts = async (force = false) => {
  if (!force && productPickerProducts.value.length > 0) return;
  productPickerLoading.value = true;
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, title, image, points_cost, is_active')
      .order('id', { ascending: true })
      .limit(200);
    if (error) throw error;
    productPickerProducts.value = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[DataAdmin] 加载商城商品失败:', e?.message || e);
  } finally {
    productPickerLoading.value = false;
  }
};

// 商品选择器：切换展开/收起
const toggleProductPicker = () => {
  showProductPicker.value = !showProductPicker.value;
  if (showProductPicker.value && productPickerProducts.value.length === 0) {
    void loadProductPickerProducts();
  }
};

// 商品选择器：选中商品后自动填充
const selectProduct = (product) => {
  if (!editingItem.value || !product) return;
  editingItem.value = {
    ...editingItem.value,
    gift_content: product.title || '',
    gift_image: product.image || '',
    gift_price: product.points_cost ?? 0
  };
  showProductPicker.value = false;
  productPickerKeyword.value = '';
  showToast(`已从商城填入「${product.title || '未命名商品'}」`, 'success');
};

// 收件信息整段文本: gifts 用 profiles 的 shipping_*, posterRequests 用表内 recipient/phone/address
const addressBundleText = computed(() => {
  if (currentTab.value === 'gifts') {
    const recipient = String(editingItem.value?.shipping_recipient || '').trim() || '未填写';
    const address = String(editingItem.value?.shipping_address || '').trim() || '未填写';
    const phone = String(editingItem.value?.shipping_phone || '').trim() || '未填写';
    return [
      `收货人：${recipient}`,
      `地址：${address}`,
      `电话：${phone}`
    ].join('\n');
  }
  if (currentTab.value === 'posterRequests') {
    const recipient = String(editingItem.value?.recipient || '').trim() || '未填写';
    const phone = String(editingItem.value?.phone || '').trim() || '未填写';
    const address = String(editingItem.value?.address || '').trim() || '未填写';
    const username = String(editingItem.value?.username || '').trim();
    const lines = [];
    if (username) lines.push(`用户名：${username}`);
    lines.push(`收件人：${recipient}`, `电话：${phone}`, `地址：${address}`);
    return lines.join('\n');
  }
  return '';
});

const dashboardTableIds = ['users', 'subscriptions', 'forum', 'news', 'activities', 'products'];
const moderationPendingCount = computed(() =>
  ['reportedPosts', 'reviewPosts', 'reviewComments']
    .reduce((total, tabId) => total + getTabCount(tabId), 0)
);
// activeModule / sidebarModules / currentModule / currentModuleTabIds / getTabLabel /
// syncModuleFromSection / currentAdminPageMeta 已迁移至 useDataAdminNavigation.js
// 由下方 createNavigationCenter 工厂注入

const currentAdminPageActions = computed(() => {
  if (activeAdminSection.value === 'media') {
    return [
      { label: '商品图片', value: getTabCount('products'), tab: 'products', icon: Image, section: 'data' },
      { label: '新闻封面', value: getTabCount('news'), tab: 'news', icon: FileText, section: 'data' },
      { label: '活动图片', value: getTabCount('activities'), tab: 'activities', icon: Activity, section: 'data' },
      { label: '抽奖封面', value: getTabCount('lotteries'), tab: 'lotteries', icon: ShieldCheck, section: 'data' }
    ];
  }
  if (activeAdminSection.value === 'settings') {
    return [
      { label: 'API Key 管理', value: 'Vault', section: 'api-keys', icon: KeyRound },
      { label: '官方事实配置', value: getTabCount('coreMemories'), tab: 'coreMemories', icon: Database, section: 'data' },
      { label: '履约与通知', value: getTabCount('lotteryFulfillments'), tab: 'lotteryFulfillments', icon: MessageSquare, section: 'data' },
      { label: '管理员权限', value: isCurrentUserAdmin.value ? 'Admin' : '受限', tab: 'users', icon: ShieldCheck, section: 'data' }
    ];
  }
  return [];
});
const currentAdminPageMetrics = computed(() => {
  const section = activeAdminSection.value;
  if (section === 'data') {
    return [
      { label: '当前模块', value: currentModule.value?.label || '数据管理' },
      { label: '当前数据表', value: currentTabLabel.value || '未选择' },
      { label: '当前记录', value: totalRecordCount.value },
      { label: '待复核', value: moderationPendingCount.value }
    ];
  }
  if (section === 'media') {
    return [
      { label: '商品图', value: getTabCount('products') },
      { label: '新闻图', value: getTabCount('news') },
      { label: '活动图', value: getTabCount('activities') },
      { label: '抽奖图', value: getTabCount('lotteries') }
    ];
  }
  if (section === 'settings') {
    return [
      { label: '健康度', value: `${healthScore.value}%` },
      { label: '通知任务', value: getTabCount('lotteryFulfillments') },
      { label: '最近刷新', value: lastRefreshLabel.value }
    ];
  }
  return [];
});

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

const activeDiagnostics = computed(() => [
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
    id: 'lottery-fulfillments',
    tab: 'lotteryFulfillments',
    title: '中奖履约',
    description: '等待联系、确认或发货的中奖人',
    count: lotteryOperationsSnapshot.isLoaded
      ? lotteryOperationsSnapshot.fulfillments.length
      : getTabCount('lotteryFulfillments'),
    tone: (lotteryOperationsSnapshot.isLoaded
      ? lotteryOperationsSnapshot.fulfillments.length
      : getTabCount('lotteryFulfillments')) > 0 ? 'warning' : 'success'
  },
  {
    id: 'lottery-due-draws',
    tab: 'lotteries',
    title: '待开奖抽奖',
    description: '已到开奖时间、等待调度处理',
    count: lotteryOperationsSnapshot.dueLotteries.length,
    tone: lotteryOperationsSnapshot.dueLotteries.length > 0 ? 'warning' : 'success'
  },
  {
    id: 'lottery-risk',
    tab: 'lotteryEntries',
    title: '报名风控',
    description: '最近 50 次报名中的异常尝试（并入报名明细）',
    count: lotteryOperationsSnapshot.isLoaded
      ? lotteryOperationsSnapshot.joinRiskCount
      : 0,
    tone: lotteryOperationsSnapshot.joinRiskCount > 0 ? 'warning' : 'success'
  },
  {
    id: 'lottery-notifications',
    tab: 'lotteryFulfillments',
    title: '中奖通知',
    description: '待发送或发送失败的中奖通知（并入履约）',
    count: lotteryOperationsSnapshot.isLoaded
      ? lotteryOperationsSnapshot.notificationFailures.length
      : getTabCount('lotteryFulfillments'),
    tone: (lotteryOperationsSnapshot.isLoaded
      ? lotteryOperationsSnapshot.notificationFailures.length
      : getTabCount('lotteryFulfillments')) > 0 ? 'warning' : 'success'
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

// handleModuleClick / handleAdminNavClick / getTabsByGroup / handleOverviewTabClick /
// handleSidebarTabClick / handlePlaceholderAction 已迁移至 useDataAdminNavigation.js

const totalRecordCount = computed(() => tabTotals[currentTab.value] || currentData.value.length || 0);
const totalCountAllTables = computed(() =>
  tabs.reduce((sum, tab) => sum + getTabCount(tab.id), 0)
);
const liveStatusCards = computed(() => [
  {
    id: 'uptime',
    label: '系统状态',
    value: '运行中',
    status: 'success',
    icon: Server,
    detail: `数据自动刷新 ${secondsUntilRefresh.value}s`
  },
  {
    id: 'records',
    label: '总记录数',
    value: totalCountAllTables.value,
    status: 'info',
    icon: Database,
    detail: `${tabs.length} 个数据表`
  },
  {
    id: 'pending',
    label: '待处理事项',
    value: diagnosticIssueCount.value,
    status: diagnosticIssueCount.value > 0 ? 'warning' : 'success',
    icon: ShieldCheck,
    detail: diagnosticIssueCount.value > 0 ? '需关注' : '一切正常'
  },
  {
    id: 'refresh',
    label: '最后刷新',
    value: lastRefreshLabel.value || '刚刚',
    status: 'info',
    icon: RefreshCw,
    detail: `${secondsUntilRefresh.value}s 后自动刷新`
  }
]);
// 分页
const totalPages = computed(() => Math.max(1, Math.ceil(totalRecordCount.value / pageSize.value)));
// 服务端已通过 range() 真分页返回当前页数据, 直接展示
const paginatedData = computed(() => currentData.value || []);

// 为每行缓存身份字符串,避免 v-for 中 itemIndex() O(N) 线性扫描
const rowIdentityCache = new WeakMap();
const getRowIdentity = (item) => {
  if (!item) return '';
  let id = rowIdentityCache.get(item);
  if (!id) {
    id = String(item.id || '');
    if (!id) id = `row-${Math.random().toString(36).slice(2, 10)}`;
    rowIdentityCache.set(item, id);
  }
  return id;
};

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
  return selectAllResultsMode.value || (paginatedData.value.length > 0 && paginatedData.value.every(item => isSelected(item)));
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

// P1 修复: stripHtml / escapeHtml / hasHtmlTag / UUID_REGEX / EMAIL_REGEX
// 已从 composables/useDataAdminValidation.js 导入，此处删除重复定义

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
    logger.warn('data-admin', '获取下一个数字 ID 失败，使用当前页兜底:', error);
    return getNextNumericId(fallbackRows);
  }
};

// splitForumContent / normalizeNewsContent / validateDateString
// 已迁移至 composables/useDataAdminValidation.js, 此处不再重复定义

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

// validateDateString / normalizeNewsContent / validateField / validateRequiredFields / validateNewsPayload
// 已迁移至 composables/useDataAdminValidation.js, 此处通过 createFieldValidator / createNewsPayloadValidator 工厂注入
// (具体注入点见 getTabCount 上方)

// 验证器工厂: 注入响应式状态依赖, 生成可调用的校验函数
// 这样验证逻辑可在 composable 中做单元测试, 且 DataAdmin.vue 不再持有校验实现
const validateField = createFieldValidator({
  getCurrentFields: () => currentFields.value,
  editingItemRef: editingItem,
  fieldErrors,
  getCurrentTab: () => currentTab.value,
  clearFieldError,
  NEWS_CATEGORY_VALUES
});
const validateRequiredFields = createRequiredFieldsValidator({
  getCurrentFields: () => currentFields.value,
  editingItemRef: editingItem,
  fieldErrors
});
const validateNewsPayload = createNewsPayloadValidator({
  fieldErrors,
  getNewsRows: () => dataStore.news,
  getIsEditing: () => isEditing.value,
  getEditingItemId: () => editingItem.value?.id,
  NEWS_CATEGORY_VALUES
});

// ==================== 方法 ====================
const getTabCount = (tabId) => {
  switch (tabId) {
    case 'users': return stats.totalUsers;
    case 'points': return tabTotals.points;
    case 'subscriptions': return tabTotals.subscriptions;
    case 'gifts': return tabTotals.gifts;
    case 'addresses': return tabTotals.addresses;
    case 'forum': return stats.totalPosts;
    case 'reportedPosts': return tabTotals.reportedPosts;
    case 'reviewPosts': return tabTotals.reviewPosts;
    case 'reviewComments': return tabTotals.reviewComments;
    case 'coreMemories': return tabTotals.coreMemories;
    case 'bohaiModels': return stats.totalBohaiModels;
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

// resetFiltersForTab / handleSearch / handleFilterChange / clearSearch / clearAllFilters
// 已迁移至 composables/useDataAdminFilterState.js (createFilterState 工厂)
//
// addChangeLogEntry / addRecentRecord / togglePinnedTab / isTabPinned / jumpToRecentRecord
// 已迁移至 composables/useDataAdminChangeLog.js (createChangeLogCenter 工厂)
// currentChangeLogEntries / currentPinnedTabs / recentRecordsForSidebar computeds 同样由工厂提供

const saveCurrentFilterView = async () => {
  const name = await dialog.prompt({
    title: '保存筛选视图',
    message: '请输入视图名称',
    placeholder: '例如：本周到期',
    defaultValue: ''
  });
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return;
  const view = {
    id: `${Date.now()}`,
    name: normalizedName,
    search: searchQuery.value,
    status: statusFilter.value,
    dateFrom: dateFromFilter.value,
    dateTo: dateToFilter.value,
    advancedRules: activeAdvancedRules.value.map((rule) => ({ ...rule }))
  };
  savedFilterViews.value = {
    ...savedFilterViews.value,
    [currentTab.value]: [view, ...(savedFilterViews.value[currentTab.value] || []).filter((item) => item.name !== normalizedName)].slice(0, 8)
  };
  persistSavedViews();
  showToast('筛选视图已保存', 'success');
};

const applySavedFilterView = (view) => {
  searchQuery.value = view.search || '';
  statusFilter.value = view.status || '';
  dateFromFilter.value = view.dateFrom || '';
  dateToFilter.value = view.dateTo || '';
  advancedFilterRules.value = Array.isArray(view.advancedRules) ? view.advancedRules.map((rule) => ({ ...rule })) : [];
  handleFilterChange();
};

const removeSavedFilterView = (viewId) => {
  savedFilterViews.value = {
    ...savedFilterViews.value,
    [currentTab.value]: (savedFilterViews.value[currentTab.value] || []).filter((view) => view.id !== viewId)
  };
  persistSavedViews();
};

const addAdvancedFilterRule = () => {
  const firstField = currentColumns.value[0]?.key || currentFields.value[0]?.key || 'id';
  advancedFilterRules.value = [
    ...advancedFilterRules.value,
    { id: `${Date.now()}`, field: firstField, operator: 'contains', value: '' }
  ];
};

const removeAdvancedFilterRule = (ruleId) => {
  advancedFilterRules.value = advancedFilterRules.value.filter((rule) => rule.id !== ruleId);
  handleFilterChange();
};

const setColumnVisible = (columnKey, visible) => {
  const current = columnSettings.value[currentTab.value] || {
    visibleKeys: currentColumns.value.map((col) => col.key),
    orderKeys: currentColumns.value.map((col) => col.key)
  };
  const visibleKeys = new Set(current.visibleKeys || []);
  if (visible) visibleKeys.add(columnKey);
  else visibleKeys.delete(columnKey);
  columnSettings.value = {
    ...columnSettings.value,
    [currentTab.value]: {
      visibleKeys: currentColumns.value.filter((col) => visibleKeys.has(col.key)).map((col) => col.key),
      orderKeys: current.orderKeys || currentColumns.value.map((col) => col.key)
    }
  };
  persistColumnSettings();
};

const moveColumn = (columnKey, direction) => {
  const current = columnSettings.value[currentTab.value] || {
    visibleKeys: currentColumns.value.map((col) => col.key),
    orderKeys: currentColumns.value.map((col) => col.key)
  };
  const orderKeys = [...(current.orderKeys || currentColumns.value.map((col) => col.key))];
  const index = orderKeys.indexOf(columnKey);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= orderKeys.length) return;
  [orderKeys[index], orderKeys[nextIndex]] = [orderKeys[nextIndex], orderKeys[index]];
  columnSettings.value = {
    ...columnSettings.value,
    [currentTab.value]: {
      visibleKeys: current.visibleKeys || currentColumns.value.map((col) => col.key),
      orderKeys
    }
  };
  persistColumnSettings();
};

const resetColumnSettings = () => {
  const next = { ...columnSettings.value };
  delete next[currentTab.value];
  columnSettings.value = next;
  persistColumnSettings();
};

// switchTab / handleModuleClick / handleAdminNavClick / handleSidebarTabClick /
// handleOverviewTabClick / handlePlaceholderAction / syncModuleFromSection / getTabsByGroup /
// activeModule / sidebarModules / currentModule / currentModuleTabIds / currentAdminPageMeta
// 已迁移至 composables/useDataAdminNavigation.js (createNavigationCenter)
// 由下方工厂注入

// createChangeLogCenter 已移至 createNavigationCenter 之后注入 (依赖 switchTab)
// 见下方 "变更日志中心注入" 区块

const copyAddressBundle = async () => {
  const content = addressBundleText.value;
  if (!content) {
    showToast('暂无可复制的收件信息', 'error');
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
    showToast('收件信息已复制', 'success');
  } catch (error) {
    logger.error('data-admin', '复制收件信息失败:', error);
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
    logger.error('data-admin', '复制图片链接失败:', error);
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
    logger.error('data-admin', '管理员图片上传失败:', error);
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

// 主题切换统一走 themeManager（唯一写入点：html[data-theme] + html.dark + boh-theme）。
// 这里曾经直写 documentElement 并把偏好另存到 localStorage['dm-theme']，形成第二套主题真相源，
// 后果是"用户在站内显式选了浅色、系统是暗色时，后台仍变暗"。
const toggleAdminTheme = (forced) => {
  const nextDark = typeof forced === 'boolean' ? forced : !themeManager.isDark();
  themeManager.setTheme(nextDark ? 'dark' : 'light');
  currentTheme.value = normalizeTheme(themeManager.getTheme());
};

// 站内其他地方切主题时同步本页（监听器在 onUnmounted 摘除）
const handleThemeChange = (theme) => {
  currentTheme.value = normalizeTheme(theme);
};

const handleQuickEdit = async (record) => {
  if (!record?.tabId || !record?.id) return;
  switchTab(record.tabId);
  await nextTick();
  const items = dataStore[record.tabId] || [];
  const item = items.find(i => String(i.id) === String(record.id));
  if (item) {
    openEditModal(item);
  } else {
    const table = dataConfig[record.tabId]?.table;
    if (!table) return;
    try {
      const { data } = await supabase.from(table).select('*').eq('id', record.id).single();
      if (data) {
        // H-1 修复：profiles 表敏感字段已收窄，通过 RPC 补充
        if (table === 'profiles' && data.id) {
          try {
            const { data: secData } = await supabase.rpc('admin_get_user_sensitive', { p_user_id: data.id });
            if (secData) Object.assign(data, secData);
          } catch (secErr) {
            logger.warn('data-admin', '获取用户敏感字段失败:', secErr);
          }
        }
        openEditModal(data);
      }
    } catch (error) {
      logger.warn('data-admin', '快速编辑获取记录失败:', error);
      showToast('获取记录失败', 'error');
    }
  }
};

const toggleSelectAll = () => {
  if (selectAllResultsMode.value) {
    // 已全选所有结果时，再次点击 = 取消全选
    selectAllResultsMode.value = false;
    selectedItems.value = [];
    return;
  }
  if (isAllSelected.value) {
    selectedItems.value = selectedItems.value.filter(
      selected => !paginatedData.value.some(item => item.id === selected.id)
    );
  } else {
    const newSelections = paginatedData.value.filter(item => !isSelected(item));
    selectedItems.value.push(...newSelections);
  }
};

const selectAllResults = () => {
  selectAllResultsMode.value = true;
  selectedItems.value = [...currentData.value];
  showToast(`已选择全部 ${selectedItems.value.length} 条结果`, 'success');
};

const clearAllSelection = () => {
  selectAllResultsMode.value = false;
  selectedItems.value = [];
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

  // posterRequests 的 recipient/phone/address 均为 disabled，编辑时换 user_id 会导致
  // 收件信息与所属用户错位且无法手动修正，故编辑态禁止换人。
  if (currentTab.value === 'posterRequests' && isEditing.value && field.key === 'user_id') {
    return true;
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
    logger.warn('data-admin', '同步官方事实向量索引失败:', error);
  }
};

// sanitizeSearchTerm / buildSearchFilters / normalizeFilterValue / ALLOWED_ADVANCED_OPERATORS
// applyAdvancedFilters / applySearchAndSort / buildSearchFiltersForKeyword / getSearchablePreviewFields
// 已迁移至 composables/useDataAdminFilters.js
// 本文件中:
//   - sanitizeSearchTerm -> sanitizeSearchTermUtil (导入别名)
//   - buildSearchFilters(tabId) -> buildSearchFiltersUtil(tabId, searchQuery.value, TAB_SEARCH_FIELDS)
//   - applySearchAndSort(query, tabId) -> applySearchAndSortUtil({ query, tabId, ...全部状态 })
//   - buildSearchFiltersForKeyword(tab.id, kw) -> buildSearchFiltersUtil(tab.id, kw, TAB_SEARCH_FIELDS)
//   - getSearchablePreviewFields(tab.id) -> getSearchablePreviewFieldsUtil(tab.id, dataConfig, TAB_SEARCH_FIELDS)

// 跨表搜索已迁移至 composables/useDataAdminGlobalSearch.js (createGlobalSearchCenter)
// globalSearchQuery / globalSearchResults / isGlobalSearching / showGlobalSearchPanel /
// runGlobalSearch / openGlobalSearchResult 由下方 createGlobalSearchCenter 工厂注入

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

const getTabFetchCacheKey = (tabId = currentTab.value) => JSON.stringify({
  tabId,
  page: currentPage.value,
  pageSize: pageSize.value,
  search: searchQuery.value,
  status: statusFilter.value,
  dateFrom: dateFromFilter.value,
  dateTo: dateToFilter.value,
  sortKey: sortKey.value,
  sortOrder: sortOrder.value,
  advancedRules: advancedFilterRules.value
});

const clearTabFetchCache = (tabId = '') => {
  Object.keys(tabFetchCache).forEach((key) => {
    if (!tabId || key.includes(`"tabId":"${tabId}"`)) {
      delete tabFetchCache[key];
    }
  });
  if (!tabId) {
    brokenCardImages.value = new Set();
  }
};

const assignTabRows = (tabId, rows, total) => {
  dataStore[tabId] = rows;
  hasLoadedOnce.value = true;
  const nextTotal = Number.isFinite(Number(total)) ? Number(total) : rows.length;
  updateCountsForTab(tabId, nextTotal);
  if (tabId === currentTab.value) {
    tabFetchCache[getTabFetchCacheKey(tabId)] = {
      rows: [...rows],
      total: nextTotal,
      cachedAt: Date.now()
    };
  }
};

const runAfterFirstPaint = (callback) => {
  if (typeof window === 'undefined') return;
  const runner = () => callback();
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runner, { timeout: 1200 });
    return;
  }
  window.setTimeout(runner, 160);
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
    stats.totalBohaiModels = tabTotals.bohaiModels;
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
    // The overview RPC predates derived reporting views; keep this new tab's count accurate.
    try {
      const { count, error } = await supabase
        .from('lottery_failure_stats')
        .select('id', { count: 'exact', head: true });
      if (!error) setTabTotal('lotteryFailureStats', count || 0);
    } catch (error) {
      logger.warn('data-admin', '获取抽奖失败统计数量失败:', error);
    }
    return;
  }
  if (rpcCountsError && !isMissingRpcFunctionError(rpcCountsError, 'admin_data_management_counts')) {
    logger.warn('data-admin', '获取数据管理统计 RPC 失败，回退到 head count:', rpcCountsError);
  }

  const nowIso = new Date().toISOString();
  const countTasks = {
    users: fetchCount('profiles'),
    points: fetchCount('profiles'),
    subscriptions: fetchCount('user_subscriptions'),
    activeSubscriptions: fetchCount('user_subscriptions', (query) => query.eq('status', 'active').gt('expires_at', nowIso)),
    gifts: fetchCount('user_gifts'),
    posterRequests: fetchCount('poster_requests'),
    forum: fetchCount('posts'),
    reportedPosts: fetchCount('posts', (query) => query.eq('status', 'limited')),
    reviewPosts: fetchCount('posts', (query) => query.ilike('status', 'rejected')),
    reviewComments: fetchCount('comments', (query) => query.ilike('status', 'rejected')),
    coreMemories: fetchCount('boh_ai_core_memories'),
    bohaiModels: fetchCount('bohai_model_configs'),
    lotteries: fetchCount('lotteries'),
    lotteryEntries: fetchCount('lottery_entries'),
    lotteryDrawLogs: fetchCount('lottery_draw_logs'),
    lotteryFailureStats: fetchCount('lottery_failure_stats'),
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
      logger.warn('data-admin', '获取数据管理统计失败:', entry.reason);
      return;
    }
    const [key, value] = entry.value;
    fallbackCounts[key] = value;
  });

  applyCountMap(fallbackCounts);
};

// 敏感用户数据缓存: admin_list_users_with_sensitive 每次最多返回 500 行,
// 翻页/搜索/筛选/刷新都会重复拉取同样的大载荷, 会话内按参数缓存复用
const SENSITIVE_USERS_CACHE_TTL = 90 * 1000;
const sensitiveUsersCacheMap = new Map();

const fetchSensitiveUsers = async ({ p_search = null, p_limit = 500 } = {}) => {
  const key = `${p_search === null ? '' : String(p_search)}|${Math.max(1, Number(p_limit) || 500)}`;
  const now = Date.now();
  const cached = sensitiveUsersCacheMap.get(key);
  if (cached?.data && now - cached.fetchedAt < SENSITIVE_USERS_CACHE_TTL) {
    return cached.data;
  }
  if (cached?.pending) return cached.pending;

  const entry = { data: null, fetchedAt: 0, pending: null };
  sensitiveUsersCacheMap.set(key, entry);
  entry.pending = supabase
    .rpc('admin_list_users_with_sensitive', { p_search, p_limit })
    .then(({ data }) => {
      entry.data = Array.isArray(data) ? data : [];
      entry.fetchedAt = Date.now();
      entry.pending = null;
      return entry.data;
    })
    .catch((error) => {
      entry.pending = null;
      throw error;
    });
  return entry.pending;
};

const flushSensitiveUsersCache = () => {
  sensitiveUsersCacheMap.clear();
};

const fetchTabData = async (tabId = currentTab.value, options = {}) => {
  const cacheKey = getTabFetchCacheKey(tabId);
  const cached = options.useCache ? tabFetchCache[cacheKey] : null;
  if (cached && Date.now() - Number(cached.cachedAt || 0) < CACHE_TTL) {
    dataStore[tabId] = [...cached.rows];
    setTabTotal(tabId, cached.total);
    return;
  }

  isFilterLoading.value = true;

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
    }

    let { data, error, count } = await paginateQuery(applySearchAndSortUtil({
      query,
      tabId,
      keyword: searchQuery.value,
      statusFilter: statusFilter.value,
      dateFrom: dateFromFilter.value,
      dateTo: dateToFilter.value,
      advancedRules: activeAdvancedRules.value,
      sortKey: sortKey.value,
      sortOrder: sortOrder.value,
      configs: {
        tabSearchFields: TAB_SEARCH_FIELDS,
        statusFilterFields: STATUS_FILTER_FIELDS,
        dateFilterFields: DATE_FILTER_FIELDS,
        tabSortColumns: TAB_SORT_COLUMNS,
        tabDefaultSort: TAB_DEFAULT_SORT
      },
      allowedAdvancedFields: (currentColumns.value || []).filter((c) => !c.virtual).map((c) => c.key)
    }));

    if (tabId === 'lotteries' && error && isMissingLotteryObservabilitySchemaError(error)) {
      logger.warn('data-admin', '抽奖观测字段尚未部署，使用旧字段兜底加载:', error);
      let fallbackQuery = supabase
        .from(table)
        .select(LOTTERY_LEGACY_SELECT_COLUMNS, { count: 'exact' });
      ({ data, error, count } = await paginateQuery(applySearchAndSortUtil({
        query: fallbackQuery,
        tabId,
        keyword: searchQuery.value,
        statusFilter: statusFilter.value,
        dateFrom: dateFromFilter.value,
        dateTo: dateToFilter.value,
        advancedRules: activeAdvancedRules.value,
        sortKey: sortKey.value,
        sortOrder: sortOrder.value,
        configs: {
          tabSearchFields: TAB_SEARCH_FIELDS,
          statusFilterFields: STATUS_FILTER_FIELDS,
          dateFilterFields: DATE_FILTER_FIELDS,
          tabSortColumns: TAB_SORT_COLUMNS,
          tabDefaultSort: TAB_DEFAULT_SORT
        },
        allowedAdvancedFields: (currentColumns.value || []).filter((c) => !c.virtual).map((c) => c.key)
      })));
    }

    if (fetchId !== activeFetchId.value) return;
    if (error) throw error;

    let rows = Array.isArray(data) ? data : [];
    const offset = Math.max(0, ((Number(currentPage.value) || 1) - 1) * (Number(pageSize.value) || 20));

    if (tabId === 'users' || tabId === 'points') {
      // H-1 修复：profiles 敏感字段已通过列级权限收窄，
      // 通过 admin_list_users_with_sensitive RPC 批量补充 email/shipping_* 字段。
      try {
        const userIds = rows.map(r => r.id).filter(Boolean);
        if (userIds.length > 0) {
          // 获取当前页用户的敏感字段（会话内缓存复用，避免翻页/搜索时重复拉取 500 行）
          const sensitiveList = await fetchSensitiveUsers({ p_search: null, p_limit: 500 });
          if (Array.isArray(sensitiveList)) {
            const sensitiveMap = new Map(sensitiveList.map(s => [s.id, s]));
            rows.forEach(row => {
              const s = sensitiveMap.get(row.id);
              if (s) {
                row.email = s.email;
                row.shipping_recipient = s.shipping_recipient;
                row.shipping_phone = s.shipping_phone;
                row.shipping_address = s.shipping_address;
              }
            });
          }
        }
      } catch (secError) {
        logger.warn('data-admin', '获取用户敏感字段失败:', secError);
      }
      assignTabRows(tabId, rows, count);
      return;
    }

    if (tabId === 'subscriptions') {
      // H-1 修复：email 已通过列级权限收窄，通过 RPC 补充
      let enrichedRows = rows.map((subscription) => {
        const { profile: rawProfile, ...restSubscription } = subscription;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restSubscription,
          username: profile.username || '-',
          email: '-'
        };
      });
      try {
        const userIds = rows.map(r => r.user_id).filter(Boolean);
        if (userIds.length > 0) {
          const sensitiveList = await fetchSensitiveUsers({ p_search: null, p_limit: 500 });
          if (Array.isArray(sensitiveList)) {
            const emailMap = new Map(sensitiveList.map(s => [s.id, s.email || '-']));
            enrichedRows.forEach(row => {
              if (row.user_id) row.email = emailMap.get(row.user_id) || '-';
            });
          }
        }
      } catch (secError) {
        logger.warn('data-admin', '获取订阅用户邮箱失败:', secError);
      }
      assignTabRows(tabId, enrichedRows, count);
      return;
    }

    if (tabId === 'gifts') {
      let normalizedGifts = [...rows];
      const expiredGiftIds = getExpiredActiveGiftIds(normalizedGifts);
      if (expiredGiftIds.length > 0) {
        normalizedGifts = markGiftsAsHistory(normalizedGifts, expiredGiftIds);
        // P0 修复: 改为 await 并添加 toast 提示，而非 fire-and-forget
        try {
          const { error: archiveError } = await supabase
            .from('user_gifts')
            .update({ is_active: false })
            .in('id', expiredGiftIds);
          if (archiveError) {
            logger.warn('data-admin', '自动归档过期礼物失败:', archiveError);
            showToast(`自动归档 ${expiredGiftIds.length} 个过期礼物失败`, 'warning');
          } else {
            showToast(`已自动归档 ${expiredGiftIds.length} 个过期礼物`, 'success');
          }
        } catch (archiveException) {
          logger.warn('data-admin', '自动归档过期礼物异常:', archiveException);
        }
      }

      // H-1 修复：shipping_* 已通过列级权限收窄，通过 RPC 批量补充
      let giftRows = normalizedGifts.map((gift) => {
        const { profile: rawProfile, ...restGift } = gift;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restGift,
          username: profile.username || '-',
          shipping_recipient: '-',
          shipping_phone: '-',
          shipping_address: '-',
          gift_scope_label: gift.is_active ? '当前礼物' : '历史礼物',
          completed_at: gift.gift_status === 'completed'
            ? (gift.completed_at || gift.updated_at || gift.created_at)
            : null
        };
      });
      try {
        const giftUserIds = normalizedGifts.map(g => g.user_id).filter(Boolean);
        if (giftUserIds.length > 0) {
          // 统一从 user_addresses 取地址（地址管理是唯一地址源）
          // 查询所有相关用户的地址，按 is_default 优先、created_at 倒序排列
          const { data: addressList } = await supabase
            .from('user_addresses')
            .select('id, user_id, recipient, phone, region, detail, is_default, created_at')
            .in('user_id', giftUserIds)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

          if (Array.isArray(addressList) && addressList.length > 0) {
            // 按 user_id 分组
            const addressMap = new Map();
            addressList.forEach(addr => {
              if (!addressMap.has(addr.user_id)) addressMap.set(addr.user_id, []);
              addressMap.get(addr.user_id).push(addr);
            });
            giftRows.forEach(row => {
              if (!row.user_id) return;
              const userAddrs = addressMap.get(row.user_id);
              if (!userAddrs || userAddrs.length === 0) return;
              // 若礼物绑定了 address_id，优先用绑定的地址；否则取默认地址（列表已排序，第一条即默认）
              const matched = row.address_id
                ? userAddrs.find(a => a.id === row.address_id) || userAddrs[0]
                : userAddrs[0];
              row.shipping_recipient = matched.recipient || '-';
              row.shipping_phone = matched.phone || '-';
              const region = matched.region ? matched.region + ' ' : '';
              const fullAddr = (region + (matched.detail || '')).trim();
              row.shipping_address = fullAddr || '-';
              row.address_count = userAddrs.length;
            });
          }
        }
      } catch (secError) {
        logger.warn('data-admin', '获取礼物收货信息失败:', secError);
      }
      assignTabRows(tabId, giftRows, count);
      return;
    }

    if (tabId === 'addresses') {
      const addressRows = rows.map((addr) => {
        const { profile: rawProfile, ...restAddr } = addr;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restAddr,
          username: profile.username || '-'
        };
      });
      assignTabRows(tabId, addressRows, count);
      return;
    }

    if (tabId === 'posterRequests') {
      const posterRows = rows.map((request) => {
        const { profile: rawProfile, ...restRequest } = request;
        const profile = normalizeJoinedObject(rawProfile);
        return {
          ...restRequest,
          username: profile.username || '-'
        };
      });
      assignTabRows(tabId, posterRows, count);
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
            logger.warn('data-admin', '抽奖报名人数 RPC 失败，回退到轻量列表计数:', rpcEntryCountError);
          }
          const { data: entryCountRows, error: entryCountError } = await supabase
            .from('lottery_entries')
            .select('lottery_id')
            .in('lottery_id', lotteryIds);
          if (entryCountError) {
            logger.warn('data-admin', '获取抽奖报名人数失败:', entryCountError);
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

    if (tabId === 'lotteryFulfillments') {
      assignTabRows(tabId, rows.map((fulfillment) => {
        const lottery = normalizeJoinedObject(fulfillment.lottery);
        const profile = normalizeJoinedObject(fulfillment.profile);
        return {
          ...fulfillment,
          lottery_title: lottery.title || '-',
          username: fulfillment.username_snapshot || profile.username || profile.email || '-',
          is_current_label: fulfillment.is_current ? '当前' : '历史'
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

    if (tabId === 'lotteryAuditLogs') {
      assignTabRows(tabId, rows.map((audit) => {
        const lottery = normalizeJoinedObject(audit.lottery);
        const actor = normalizeJoinedObject(audit.actor);
        return {
          ...audit,
          lottery_title: lottery.title || '-',
          actor_username: actor.username || actor.email || (audit.actor_id ? '管理员' : '系统'),
          detail_preview: JSON.stringify(audit.detail || {})
        };
      }), count);
      return;
    }

    // 通用扁平化：将关联查询返回的嵌套对象提取为顶层字段
    const flattenFieldMap = {
      profile: 'username',
      reporter: 'reporter_name',
      resolver: 'resolver_name',
      sender: 'sender_name',
      recipient: 'recipient_name',
      operator: 'operator_name',
      follower: 'follower_name',
      following: 'following_name',
      author: 'author_name',
      target: 'target_name'
    };
    const needsFlatten = ['forumPostImages', 'shopOrders', 'pointsTransactions', 'forumWeeklyCheckins',
      'cloudinaryUploads', 'aiWebSearchLog', 'anniversaryClaims', 'forumPostReports',
      'notifications', 'userFollows', 'userImpressions'].includes(tabId);
    if (needsFlatten) {
      rows = rows.map((row) => {
        const flat = { ...row };
        for (const [nestedKey, flatKey] of Object.entries(flattenFieldMap)) {
          if (row[nestedKey] != null) {
            const obj = normalizeJoinedObject(row[nestedKey]);
            if (obj.username) flat[flatKey] = obj.username;
            delete flat[nestedKey];
          }
        }
        return flat;
      });
    }

    // 行装饰器：为行派生只读展示字段（如 postReward 的生命周期），需在写入缓存前应用
    const rowDecorator = dataConfig[tabId]?.rowDecorator;
    if (typeof rowDecorator === 'function') {
      rows = rows.map(rowDecorator);
    }

    assignTabRows(tabId, rows, count);
  } catch (error) {
    logger.error('data-admin', '获取数据失败:', error);
    dataStore[tabId] = [];
    showToast('获取数据失败: ' + buildActionErrorMessage(error, '获取数据失败'), 'error');
  } finally {
    isFilterLoading.value = false;
    if (fetchId === activeFetchId.value) {
      isLoading.value = false;
    }
  }
};

// ==================== 第二阶段: createFilterState 工厂注入 ====================
// 在 fetchTabData 定义之后注入, 这样筛选状态工厂可以引用真实的 fetchTabData
const {
  currentStatusFilterField,
  currentDateFilterField,
  statusFilterOptions,
  hasActiveFilters,
  activeAdvancedRules,
  activeFilterSummary,
  statusFilterLabel,
  currentDateFilterLabel,
  currentSavedViews,
  resetFiltersForTab,
  handleSearch,
  handleFilterChange,
  clearSearch,
  clearAllFilters
} = createFilterState({
  currentTab,
  searchQuery,
  statusFilter,
  dateFromFilter,
  dateToFilter,
  advancedFilterRules,
  currentPage,
  suppressNextPageFetch,
  searchDebounceTimer,
  savedFilterViews,
  STATUS_FILTER_FIELDS,
  DATE_FILTER_FIELDS,
  fetchTabData,
  getCurrentFields: () => currentFields.value,
  getCurrentData: () => currentData.value,
  getCurrentColumns: () => currentColumns.value
});

// ==================== 数据操作 ====================
const fetchSecondaryData = async () => {
  await Promise.allSettled([
    fetchStats(),
    isLotteryOpsTab.value ? loadLotterySchedulerStatus() : Promise.resolve(),
    (activeModule.value === 'lottery' || activeAdminSection.value === 'overview')
      ? refreshLotteryOperationsSnapshot()
      : Promise.resolve()
  ]);
};

// loadLotterySchedulerStatus 需在 createNavigationCenter 之前定义 (被其引用)
// isMissingRpcFunctionError 来自 createMutationsCenter (下方), 此处内联检查以打破循环依赖
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
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    const isMissingRpc = code === 'PGRST202' || message.includes('admin_lottery_scheduler_status');
    if (!isMissingRpc) {
      logger.warn('data-admin', '获取抽奖定时任务状态失败:', error);
    }
  } finally {
    lotterySchedulerStatusLoading.value = false;
  }
};

// ==================== 导航中心注入 ====================
const {
  activeModule,
  sidebarModules,
  currentModule,
  currentModuleTabIds,
  currentAdminPageMeta,
  getTabLabel,
  syncModuleFromSection,
  handleModuleClick,
  handleAdminNavClick,
  handleOverviewTabClick,
  handleSidebarTabClick,
  handlePlaceholderAction,
  getTabsByGroup,
  switchTab
} = createNavigationCenter({
  activeAdminSectionRef: activeAdminSection,
  isAdminSidebarOpenRef: isAdminSidebarOpen,
  isDataTreeCollapsedRef: isDataTreeCollapsed,
  currentTabRef: currentTab,
  currentPageRef: currentPage,
  suppressNextPageFetchRef: suppressNextPageFetch,
  searchQueryRef: searchQuery,
  selectedItemsRef: selectedItems,
  userPickerKeywordRef: userPickerKeyword,
  showUserPickerModalRef: showUserPickerModal,
  sortKeyRef: sortKey,
  isPlaceholderAdminSectionRef: isPlaceholderAdminSection,
  lotteryOpsTabs,
  resetFiltersForTab,
  clearFieldErrors,
  fetchTabData,
  loadLotterySchedulerStatus
});

watch(activeModule, (moduleId) => {
  if (moduleId !== 'lottery') return;
  loadLotterySchedulerStatus();
  refreshLotteryOperationsSnapshot();
}, { immediate: true });

// ==================== RBAC：模块级隐藏/置灰 ====================
// 路由门禁仍为 admin-only（见 router guard），此处为 UI 层执行器：
// admin 全可见；其它角色按 MODULE_ALLOWED_ROLES 置灰禁用（denied-click 守卫 + 操作集过滤）。
const deniedModuleIds = computed(() => getDeniedModuleIds(sidebarModules.value, currentUserRole.value));

const guardedModuleClick = (mod) => {
  if (mod && !canViewModule(currentUserRole.value, mod.id)) {
    handleDeniedModuleClick(mod);
    return;
  }
  handleModuleClick(mod);
};

const handleDeniedModuleClick = (mod) => {
  showToast(`当前角色（${getRoleLabel(currentUserRole.value)}）无权访问「${mod?.label || mod?.id || '该模块'}」`, 'error');
};

// 角色切换时若正停留在无权模块，自动退回概览
// （跳过用户信息水合前：此时 role 回落为 user，避免误触发）
watch(currentUserRole, (role) => {
  if (!userInfo.value?.id) return;
  if (!canViewModule(role, activeModule.value)) {
    guardedModuleClick({ id: 'overview', label: '概览' });
  }
});

// 跨表搜索等直接 switchTab 的入口兜底：目标表所属模块无权则拦截
watch(currentTab, (tabId) => {
  if (!userInfo.value?.id) return;
  const tabInfo = tabs.find((t) => t.id === tabId);
  if (tabInfo?.module && !canViewModule(currentUserRole.value, tabInfo.module)) {
    showToast(`当前角色（${getRoleLabel(currentUserRole.value)}）无权访问该数据表`, 'error');
    guardedModuleClick({ id: 'overview', label: '概览' });
  }
});

// ==================== 顶栏：折叠/搜索/通知/用户菜单 ====================
// 桌面端折叠图标栏，移动端切换抽屉
const sidebarToggleOpen = computed(() =>
  isMobileView.value ? isAdminSidebarOpen.value : !isSidebarCollapsed.value
);
const toggleSidebar = () => {
  if (isMobileView.value) {
    isAdminSidebarOpen.value = !isAdminSidebarOpen.value;
  } else {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
  }
};

const adminUserLabel = computed(() =>
  userInfo.value?.username || userInfo.value?.email || '管理员'
);
const adminUserSub = computed(() => getRoleLabel(currentUserRole.value));
const adminAvatarUrl = computed(() => String(userInfo.value?.avatarUrl || '').trim());

// 顶栏全局搜索：复用跨表搜索通道
const onHeaderGlobalSearch = (value) => {
  if (typeof value === 'string') globalSearchQuery.value = value;
  showGlobalSearchPanel.value = true;
  runGlobalSearch();
};

// 通知铃铛：跳转到通知管理（无权则提示）
const goNotificationsTab = () => {
  if (!canViewModule(currentUserRole.value, 'moderation')) {
    showToast(`当前角色（${getRoleLabel(currentUserRole.value)}）无权查看通知`, 'error');
    return;
  }
  const moderationMod = (sidebarModules.value || []).find((m) => m.id === 'moderation');
  if (moderationMod) handleModuleClick(moderationMod);
  else activeModule.value = 'moderation';
  switchTab('notifications');
};

const goSiteHome = () => {
  router.push('/');
};

// 概览快捷创建：鉴权后切表并打开新增抽屉
const quickCreateRecord = (tabId) => {
  const allowed = filterTabActionsByRole(currentUserRole.value, TABS_ACTIONS?.[tabId] || []);
  if (!allowed.has('create')) {
    showToast(`当前角色（${getRoleLabel(currentUserRole.value)}）无权新建该内容`, 'error');
    return;
  }
  const mod = (sidebarModules.value || []).find((m) => (m.tabIds || []).includes(tabId));
  if (mod && !canViewModule(currentUserRole.value, mod.id)) {
    showToast(`当前角色（${getRoleLabel(currentUserRole.value)}）无权访问该模块`, 'error');
    return;
  }
  switchTab(tabId);
  nextTick(() => openEditModal());
};

const handleAdminLogout = async () => {
  try {
    await authStore.logout();
  } catch (error) {
    logger.warn('data-admin', '退出登录失败:', error);
  } finally {
    router.push('/');
  }
};

// ==================== 面包屑：首页 / 模块 / 子表 ====================
const isOverviewSection = computed(() => activeAdminSection.value === 'overview');
const adminBreadcrumbs = computed(() => {
  const crumbs = [{ label: '首页', moduleId: 'overview' }];
  if (isOverviewSection.value) {
    crumbs.push({ label: currentAdminPageMeta.value?.title || '概览', current: true });
    return crumbs;
  }
  crumbs.push({
    label: currentModule.value?.label || '数据管理',
    moduleId: currentModule.value?.id
  });
  if (isDataConsoleSection.value && currentTabLabel.value) {
    crumbs.push({ label: currentTabLabel.value, current: true });
  } else {
    crumbs.push({ label: currentAdminPageMeta.value?.title || '', current: true });
  }
  return crumbs;
});
const handleBreadcrumbClick = (crumb) => {
  if (crumb.current || !crumb.moduleId) return;
  const mod = (sidebarModules.value || []).find((m) => m.id === crumb.moduleId);
  guardedModuleClick(mod || { id: crumb.moduleId, label: crumb.label });
};

// ==================== 行动作模型：主操作 inline + 其余收进 ⋯ 菜单 ====================
// 目标：操作列永远单行（通过/拒绝/封禁等高频保留，开奖/履约/删除等收进菜单），
// 根治 112px 固定列 + 换行把行高撑到 200px 的问题。
const getRowActionModel = (item) => {
  const primary = [];
  const menu = [];
  if (isModerationTab.value) {
    const rejected = isRejectedModerationRecord(item);
    const pending = isModerationActionPending(item.id);
    primary.push({
      id: rejected ? 'restore' : 'approve',
      label: rejected ? '恢复' : '通过',
      tone: 'approve',
      disabled: pending,
      title: rejected ? '恢复为通过' : '审核通过',
      run: () => moderateAndAdvance(item, 'approve')
    });
    if (!rejected) {
      primary.push({
        id: 'reject', label: '拒绝', tone: 'reject', disabled: pending,
        title: '拒绝并填写原因', run: () => moderateAndAdvance(item, 'reject')
      });
      if (isReportedPostModerationTab.value) {
        menu.push({
          id: 'keep', label: '维持下架', disabled: pending,
          run: () => keepLimitedModerationItem(item)
        });
      }
    }
    menu.push({
      id: 'delete-mod', label: '删除', tone: 'danger', disabled: pending,
      run: () => deleteModerationItem(item)
    });
    return { primary, menu };
  }
  if (currentTab.value === 'lotteries') {
    const lotPending = isLotteryActionPending(item.id);
    if (item.status === 'open') {
      primary.push({
        id: 'draw', label: '开奖', tone: 'approve', disabled: lotPending,
        title: '立即随机开奖', run: () => drawLotteryNow(item)
      });
    }
    if (item.status === 'drawn' && item.pity_mode === 'none') {
      menu.push({
        id: 'redraw', label: '重抽', disabled: lotPending,
        run: () => redrawLottery(item)
      });
    }
    menu.push(
      { id: 'fulfill', label: '履约', run: () => viewLotteryFulfillments(item) },
      { id: 'entries', label: '报名名单', run: () => viewLotteryEntries(item) },
      { id: 'drawlogs', label: '开奖日志', run: () => viewLotteryDrawLogs(item) }
    );
    if (item.status !== 'closed') {
      menu.push({
        id: 'close', label: '关闭抽奖', tone: 'danger', disabled: lotPending,
        run: () => closeLottery(item)
      });
    }
  } else if (currentTab.value === 'lotteryFulfillments') {
    if (item.is_current && !['fulfilled', 'forfeited', 'voided'].includes(item.status)) {
      primary.push({
        id: 'advance', label: '推进', tone: 'approve',
        title: '推进下一履约状态', run: () => advanceLotteryFulfillment(item)
      });
    }
    if (item.is_current && item.status !== 'fulfilled') {
      menu.push({
        id: 'replace', label: '替补中奖人',
        run: () => replaceLotteryWinner(item)
      });
    }
  } else if (currentTab.value === 'lotteryNotificationJobs' && item.status !== 'sent') {
    menu.push({
      id: 'retry-notify', label: '重新发送通知',
      run: () => retryLotteryNotification(item)
    });
  }
  if (canBanMute.value) {
    primary.push(
      item.is_banned
        ? { id: 'unban', label: '解封', tone: 'approve', title: '解封用户', run: () => unbanUser(item) }
        : { id: 'ban', label: '封禁', tone: 'reject', title: '封禁用户（禁止登录）', run: () => banUser(item) },
      item.is_muted
        ? { id: 'unmute', label: '解禁', tone: 'approve', title: '解除禁言', run: () => unmuteUser(item) }
        : { id: 'mute', label: '禁言', tone: 'reject', title: '禁言用户（禁止发言）', run: () => muteUser(item) }
    );
    // 应急通道：为丢失邮箱/密码访问的用户签发一次性登录 token（服务端强制审计 + 限流）
    if (currentTab.value === 'users' && !item.is_banned) {
      menu.push({
        id: 'issue-token', label: '签发登录token',
        title: '为信任用户签发一次性登录 token（写入审计，token 直接进剪贴板）',
        run: () => issueLoginToken(item)
      });
    }
  }
  if (relatedJumpsForItem(item).length) {
    menu.push({ id: 'related', label: '关联记录', run: () => openRelatedPanel(item) });
  }
  if (canDeleteCurrentTab.value && !isProfileDerivedTab.value) {
    menu.push({ id: 'delete', label: '删除', tone: 'danger', run: () => deleteItem(item) });
  }
  return { primary, menu };
};

// 全局浮动行菜单（fixed 定位，避免被表格滚动容器裁剪）
const rowMenu = ref(null);
let rowMenuCleanup = null;
const closeRowMenu = () => {
  if (rowMenuCleanup) {
    try { rowMenuCleanup(); } catch (e) { /* ignore */ }
    rowMenuCleanup = null;
  }
  rowMenu.value = null;
};
const openRowMenu = ({ rect, items }) => {
  closeRowMenu();
  if (!items?.length || typeof window === 'undefined') return;
  const MENU_W = 188;
  const MENU_H = items.length * 36 + 12;
  const openUp = rect.bottom + MENU_H + 8 > window.innerHeight;
  rowMenu.value = {
    items,
    x: Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8)),
    y: openUp
      ? Math.max(8, rect.top - MENU_H - 6)
      : Math.min(rect.bottom + 6, window.innerHeight - MENU_H - 8)
  };
  const scroller = document.querySelector('.g-sheet-table-scroll');
  const onPointer = (e) => {
    if (!e.target.closest('.row-float-menu') && !e.target.closest('.row-more-btn')) closeRowMenu();
  };
  const onKey = (e) => { if (e.key === 'Escape') closeRowMenu(); };
  const onScroll = () => closeRowMenu();
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onScroll);
  scroller?.addEventListener('scroll', onScroll);
  rowMenuCleanup = () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onScroll);
    scroller?.removeEventListener('scroll', onScroll);
  };
};
const runRowMenuItem = (menuItem) => {
  closeRowMenu();
  menuItem.run?.();
};

// C2: 审核流水线 —— 通过/拒绝成功后自动高亮下一条待审 + toast 撤销
const flashRowId = ref(null);
let flashRowTimer = null;
const moderateAndAdvance = async (item, kind) => {
  const cfg = moderationTabConfig.value;
  const prevStatus = cfg ? item?.[cfg.statusField] : undefined;
  try {
    if (kind === 'approve') await approveModerationItem(item);
    else await rejectModerationItem(item);
  } catch (e) { return; } // 取消/失败时工厂已提示，不推进
  // 确认状态确已变更（排除原因弹窗取消等静默返回）
  const after = (currentData.value || []).find((r) => String(r?.id) === String(item?.id));
  const expected = kind === 'approve' ? cfg?.approveValue : cfg?.rejectValue;
  if (!after || (expected != null && after[cfg.statusField] !== expected)) return;
  const next = (currentData.value || []).find(
    (r) => String(r?.id) !== String(item?.id) && !isRejectedModerationRecord(r)
  );
  if (next) {
    flashRowId.value = String(next.id);
    if (flashRowTimer) clearTimeout(flashRowTimer);
    flashRowTimer = setTimeout(() => { flashRowId.value = null; flashRowTimer = null; }, 1800);
  }
  showToast(kind === 'approve' ? '审核通过已生效' : '已拒绝并记录原因', 'success', {
    label: '撤销',
    run: () => undoModeration({ id: item.id, status: prevStatus, tab: currentTab.value })
  });
};
const undoModeration = async (snap) => {
  try {
    const cfg = moderationTabConfig.value;
    if (!cfg || snap.tab !== currentTab.value) {
      showToast('页面已切换，无法撤销', 'warning');
      return;
    }
    const { error } = await supabase
      .from(cfg.table)
      .update({ [cfg.statusField]: snap.status })
      .eq('id', snap.id);
    if (error) throw error;
    patchStoreRow(snap.tab, { id: snap.id, [cfg.statusField]: snap.status });
    clearTabFetchCache(snap.tab);
    showToast('已撤销本次审核', 'success');
  } catch (e) {
    showToast('撤销失败: ' + buildActionErrorMessage(e, '撤销失败'), 'error');
  }
};

// 内容工具栏 ⋯ 菜单：低频操作收纳（变更日志/备份/清理/到期开奖/全选）
const toolbarMenuItems = computed(() => {
  const items = [
    {
      id: 'changelog',
      label: '变更日志',
      run: () => { showChangeLogPanel.value = !showChangeLogPanel.value; }
    }
  ];
  if (currentTab.value === 'lotterySchedulerLogs') {
    items.push({
      id: 'clean-logs',
      label: isCleaningLogs.value ? '清理中...' : '清理日志',
      disabled: isCleaningLogs.value,
      run: () => cleanupSchedulerLogs()
    });
  }
  items.push({
    id: 'backup',
    label: isExportingBackup.value ? '备份中...' : '备份全部数据',
    disabled: isExportingBackup.value,
    run: () => exportBackupData()
  });
  if (isLotteryOpsTab.value) {
    items.push({
      id: 'due-draws',
      label: '执行到期开奖',
      disabled: lotteryDueDrawPending.value,
      run: () => runDueLotteryDraws()
    });
  }
  return items;
});

// ==================== 变更日志中心注入 ====================
// 在 createNavigationCenter 之后注入, 因为需要 switchTab
const {
  addChangeLogEntry,
  addRecentRecord,
  togglePinnedTab,
  isTabPinned,
  jumpToRecentRecord,
  currentChangeLogEntries,
  currentPinnedTabs,
  recentRecordsForSidebar
} = createChangeLogCenter({
  changeLogEntries,
  recentRecords,
  pinnedTabIds,
  currentTab,
  currentTabLabel,
  getUserInfo: () => userInfo.value,
  tabs,
  persistChangeLog,
  persistRecentRecords,
  persistPinnedTabs,
  switchTab
});

const startAutoRefresh = () => {
  stopAutoRefresh();
  secondsUntilRefresh.value = 30;
  autoRefreshInterval.value = setInterval(() => {
    // 页面在后台时暂停倒计时与统计刷新, 避免无意义的 21 个 count 请求
    if (document.visibilityState === 'hidden') return;
    secondsUntilRefresh.value--;
    if (secondsUntilRefresh.value <= 0) {
      secondsUntilRefresh.value = 30;
      lastRefreshedAt.value = new Date().toISOString();
      fetchSecondaryData();
    }
  }, 1000);
};

const stopAutoRefresh = () => {
  if (autoRefreshInterval.value) {
    clearInterval(autoRefreshInterval.value);
    autoRefreshInterval.value = null;
  }
};

watch(activeAdminSection, (section) => {
  syncModuleFromSection(section);
  if (section === 'overview') {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}, { immediate: true });

const fetchData = async ({ deferSecondary = false } = {}) => {
  if (deferSecondary) {
    await fetchTabData(currentTab.value);
    lastRefreshedAt.value = new Date().toISOString();
    runAfterFirstPaint(async () => {
      await fetchSecondaryData();
      lastRefreshedAt.value = new Date().toISOString();
    });
    return;
  }

  await Promise.allSettled([
    fetchTabData(currentTab.value),
    fetchSecondaryData()
  ]);
  lastRefreshedAt.value = new Date().toISOString();
};

const refreshCurrentViewAfterMutation = async () => {
  // 数据已变更, 敏感字段缓存立即失效, 下次查询拉取最新数据
  flushSensitiveUsersCache();
  clearTabFetchCache(currentTab.value);
  // C1: 快照滚动位置，刷新后恢复（勾选按 id 比对，天然保留）
  const scroller = typeof document !== 'undefined'
    ? document.querySelector('.g-sheet-table-scroll')
    : null;
  const savedTop = scroller ? scroller.scrollTop : 0;
  await fetchTabData(currentTab.value);
  lastRefreshedAt.value = new Date().toISOString();
  if (scroller) {
    await nextTick();
    try { scroller.scrollTop = savedTop; } catch (e) { /* ignore */ }
  }
  runAfterFirstPaint(async () => {
    await fetchSecondaryData();
    lastRefreshedAt.value = new Date().toISOString();
  });
};

// ==================== 第二阶段: createMutationsCenter 工厂注入 ====================
// 在 refreshCurrentViewAfterMutation 之后注入, 这样 mutations 工厂可以引用真实函数
const {
  deleteItem,
  deleteAdminUser,
  batchDelete,
  drawLotteryNow,
  redrawLottery,
  closeLottery,
  viewLotteryEntries,
  viewLotteryDrawLogs,
  viewLotteryFulfillments,
  advanceLotteryFulfillment,
  replaceLotteryWinner,
  retryLotteryNotification,
  approveModerationItem,
  rejectModerationItem,
  keepLimitedModerationItem,
  deleteModerationItem,
  applyModerationAction,
  updateModerationStatus,
  deleteModerationTarget,
  saveModerationLog,
  // 批量审核
  batchApproveModerationItems,
  batchRejectModerationItems,
  // 用户封禁/禁言
  banUser,
  unbanUser,
  issueLoginToken,
  muteUser,
  unmuteUser,
  isMissingRpcFunctionError,
  buildModerationErrorMessage
} = createMutationsCenter({
  dialog,
  showToast,
  userInfo,
  assertAdminAction,
  invalidateSubscriptionCache,
  addChangeLogEntry,
  refreshCurrentViewAfterMutation,
  currentTab,
  currentConfig,
  selectedItems,
  buildActionErrorMessage,
  setLotteryActionPending,
  isLotteryActionPending,
  setModerationPending,
  isModerationActionPending,
  moderationTabConfig,
  addRecentRecord,
  switchTab,
  // P1 修复: 传入 dataStore 用于封禁/禁言状态联动
  dataStore
});

const refreshAllData = async () => {
  isRefreshing.value = true;
  flushSensitiveUsersCache();
  clearTabFetchCache();
  await fetchData();
  isRefreshing.value = false;
  showToast('数据已刷新', 'success');
};

const cleanupSchedulerLogs = async () => {
  if (isCleaningLogs.value) return;
  const confirmed = await dialog.confirm({
    title: '清理调度日志',
    message: '将删除 30 天前的调度日志（保留最近 30 天）。确定执行？',
    confirmText: '清理'
  });
  if (!confirmed) return;

  isCleaningLogs.value = true;
  try {
    const { data, error } = await supabase.rpc('cleanup_lottery_scheduler_logs', { p_retention_days: 30 });
    if (error) throw error;
    const deletedCount = data?.deleted_count ?? 0;
    showToast(`已清理 ${deletedCount} 条过期日志`, 'success');
    clearTabFetchCache();
    await fetchData();
  } catch (err) {
    logger.error('清理调度日志失败:', err);
    showToast(`清理失败: ${err.message || '未知错误'}`, 'error');
  } finally {
    isCleaningLogs.value = false;
  }
};

// loadLotterySchedulerStatus 已上移至 fetchSecondaryData 之后, 以解决 createNavigationCenter 的 TDZ 依赖

const runDueLotteryDraws = async () => {
  if (lotteryDueDrawPending.value) return;
  if (!await dialog.confirm({
    title: '批量开奖',
    message: '确定要立即执行所有已到期但未开奖的抽奖吗？',
    tone: 'warning',
    confirmText: '立即开奖'
  })) return;

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
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '执行到期开奖任务失败:', error);
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

// toISOStringFromInput / toDateInputValue 已迁移至 useDataAdminHelpers.js (导入即可用)

const getDraftKey = () => `${currentTab.value}:${isEditing.value ? editingItem.value?.id || 'unknown' : 'new'}`;

const readDrafts = () => readLocalJson(STORAGE_KEYS.drafts, {});

const saveCurrentDraft = () => {
  if (!showModal.value || suppressDraftSave.value) return;
  const key = getDraftKey();
  if (!key) return;
  const drafts = readDrafts();
  drafts[key] = {
    tabId: currentTab.value,
    recordId: isEditing.value ? editingItem.value?.id || '' : '',
    isEditing: isEditing.value,
    editingItem: editingItem.value,
    jsonBuffers: jsonBuffers.value,
    updatedAt: new Date().toISOString()
  };
  writeLocalJson(STORAGE_KEYS.drafts, drafts);
};

const clearCurrentDraft = () => {
  const drafts = readDrafts();
  delete drafts[getDraftKey()];
  writeLocalJson(STORAGE_KEYS.drafts, drafts);
};

const maybeRestoreDraft = async () => {
  const draft = readDrafts()[getDraftKey()];
  if (!draft?.editingItem) return;
  const updatedAt = draft.updatedAt ? formatDateTime(draft.updatedAt) : '上次';
  const choice = await dialog.confirmThree({
    title: '检测到未保存的草稿',
    message: `这条记录在 ${updatedAt} 有未保存的编辑内容。\n• 选「继续编辑」恢复并保留草稿\n• 选「重新开始」丢弃草稿并加载最新数据\n• 选「稍后再说」暂时关闭`,
    confirmText: '继续编辑',
    cancelText: '稍后再说',
    tertiaryText: '重新开始',
    tone: 'warning'
  });
  if (choice === 'cancel') return;
  if (choice === 'tertiary') {
    clearCurrentDraft();
    return;
  }
  // choice === 'confirm' => 恢复草稿
  suppressDraftSave.value = true;
  editingItem.value = { ...editingItem.value, ...draft.editingItem };
  jsonBuffers.value = { ...jsonBuffers.value, ...(draft.jsonBuffers || {}) };
  nextTick(() => {
    suppressDraftSave.value = false;
  });
};

const cloneComparable = (value) => JSON.parse(JSON.stringify(value || {}));

const getPayloadDiffs = (before = {}, after = {}) => {
  const diffs = [];
  Object.keys(after || {}).forEach((key) => {
    const fromValue = before?.[key];
    const toValue = after?.[key];
    if (JSON.stringify(fromValue ?? null) === JSON.stringify(toValue ?? null)) return;
    diffs.push({ key, from: fromValue, to: toValue });
  });
  return diffs;
};

const confirmPayloadDiffs = async (payload) => {
  if (!isEditing.value) {
    return await dialog.confirm({
      title: '新增记录',
      message: `确定要新增 1 条「${currentTabLabel.value}」记录吗？`,
      confirmText: '新增'
    });
  }
  const diffs = getPayloadDiffs(editingOriginalItem.value || {}, payload);
  if (!diffs.length) return true;
  const preview = diffs
    .slice(0, 8)
    .map((diff) => `${diff.key}: ${String(diff.from ?? '-').slice(0, 40)} -> ${String(diff.to ?? '-').slice(0, 40)}`)
    .join('\n');
  return await dialog.confirm({
    title: '保存前差异预览',
    message: `保存前差异预览（${diffs.length} 项）：\n${preview}${diffs.length > 8 ? '\n...' : ''}\n\n确认保存？`,
    confirmText: '保存'
  });
};

// ==================== 编辑模态框 ====================
const handleAdminCreate = () => openEditModal();

const openEditModal = async (item = null, opts = {}) => {
  try {
    pendingFocusField = opts.focusField || '';
    jsonBuffers.value = {};
    clearFieldErrors();
    userPickerKeyword.value = '';
    showUserPickerModal.value = false;
    if (item) {
      isEditing.value = true;
      editingItem.value = { ...item };
      editingOriginalItem.value = cloneComparable(item);
      addRecentRecord(item);

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

      // 编辑已有礼物时，加载该用户的地址列表填充地址选择器
      if (currentTab.value === 'gifts' && item.user_id) {
        const addrList = await loadGiftAddresses(item.user_id);
        const existingAddressId = item.address_id;
        const matched = existingAddressId
          ? addrList.find(a => a.id === existingAddressId)
          : null;
        const defaultAddr = matched || addrList[0] || null;
        if (defaultAddr) {
          editingItem.value.address_id = matched ? existingAddressId : defaultAddr.id;
          editingItem.value.shipping_recipient = defaultAddr.recipient || '';
          editingItem.value.shipping_phone = defaultAddr.phone || '';
          const region = defaultAddr.region ? defaultAddr.region + ' ' : '';
          editingItem.value.shipping_address = (region + (defaultAddr.detail || '')).trim();
        } else {
          editingItem.value.address_id = '';
          editingItem.value.shipping_recipient = '-';
          editingItem.value.shipping_phone = '-';
          editingItem.value.shipping_address = '该用户暂无收货地址';
        }
      } else if (currentTab.value === 'gifts') {
        giftAddressOptions.value = [];
        giftAddressRawList.value = [];
      }
    } else {
      isEditing.value = false;
      editingItem.value = {};
      editingOriginalItem.value = null;
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
        editingItem.value.address_id = '';
        editingItem.value.shipping_recipient = '';
        editingItem.value.shipping_phone = '';
        editingItem.value.shipping_address = '';
        editingItem.value.gift_no = `BOH-${year}-${serial}`;
        editingItem.value.gift_status = 'preparing';
        editingItem.value.gift_price = 0;
        editingItem.value.is_active = true;
        editingItem.value.completed_at = '';
        giftAddressOptions.value = [];
        giftAddressRawList.value = [];
      }

      if (currentTab.value === 'subscriptions') {
        const now = new Date();
        const expires = new Date(now);
        expires.setMonth(expires.getMonth() + 1);
        editingItem.value.user_id = '';
        editingItem.value.username = '';
        editingItem.value.email = '';
        editingItem.value.plan_code = 'plus';
        editingItem.value.plan_name = SUBSCRIPTION_PLAN_NAMES['plus'];
        editingItem.value.billing_cycle = 'monthly';
        editingItem.value.points_cost = 8;
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
        editingItem.value.author = userInfo.value?.username || localStorage.getItem('username') || 'admin';
        editingItem.value.image = '';
        injectNewsTemplate(false);
      }

      if (currentTab.value === 'forum') {
        editingItem.value.title = '';
        editingItem.value.content = '';
        editingItem.value.author_id = userInfo.value?.id || '';
        editingItem.value.author_username = userInfo.value?.username || localStorage.getItem('username') || '';
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

      if (currentTab.value === 'bohaiModels') {
        editingItem.value.mode_id = 'fast';
        editingItem.value.display_name = 'Fast';
        editingItem.value.tagline = '快速响应';
        editingItem.value.description = '';
        editingItem.value.provider = 'siliconflow';
        editingItem.value.provider_label = 'SiliconFlow';
        editingItem.value.model_id = 'Qwen/Qwen3-8B';
        editingItem.value.api_url = getDefaultApiUrlForBohaiProvider('siliconflow');
        editingItem.value.capability = 'chat';
        editingItem.value.icon = 'zap';
        editingItem.value.temperature = 0.18;
        editingItem.value.top_p = 0.72;
        editingItem.value.frequency_penalty = 0.05;
        editingItem.value.max_tokens = 1600;
        editingItem.value.quota_multiplier = 1;
        editingItem.value.min_tier = 'free';
        editingItem.value.sort_order = 10;
        editingItem.value.status = 'active';
        editingItem.value.notes = '';
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
        editingItem.value.pity_mode = 'count_only';
        editingItem.value.pity_reward_title = '';
        editingItem.value.pity_reward_description = '';
        editingItem.value.pity_overflow_reward_title = '';
        editingItem.value.pity_overflow_reward_description = '';
        editingItem.value.entry_deadline_at = '';
        editingItem.value.draw_at = '';
        editingItem.value.drawn_at = '';
        editingItem.value.winner_username = '';
      }

      if (currentTab.value === 'addresses') {
        editingItem.value.user_id = '';
        editingItem.value.username = '';
        editingItem.value.recipient = '';
        editingItem.value.phone = '';
        editingItem.value.region = '';
        editingItem.value.detail = '';
        editingItem.value.tag = '';
        editingItem.value.is_default = false;
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
    nextTick(maybeRestoreDraft);
    // E4: 直达字段（行内铅笔）— 抽屉渲染后滚动定位并高亮
    if (pendingFocusField) {
      const target = pendingFocusField;
      pendingFocusField = '';
      nextTick(() => nextTick(() => editDrawerRef.value?.revealField?.(target)));
    }
  } catch (error) {
    logger.error('data-admin', '打开编辑弹窗失败:', error);
    showToast('打开编辑弹窗失败: ' + buildActionErrorMessage(error, '请稍后重试'), 'error');
    // 兜底: 确保弹窗一定会打开, 哪怕初始化失败
    if (!showModal.value) {
      isEditing.value = Boolean(item);
      if (item) {
        editingItem.value = { ...item };
        editingOriginalItem.value = cloneComparable(item);
      } else {
        editingItem.value = {};
        editingOriginalItem.value = null;
      }
      showModal.value = true;
    }
  }
};

const navigateEditRecord = (direction) => {
  const idx = paginatedData.value.findIndex(item => String(item.id) === String(editingItem.value?.id));
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= paginatedData.value.length) return;
  openEditModal(paginatedData.value[nextIdx]);
};

const editDrawerNav = computed(() => {
  if (!showModal.value || !isEditing.value) return { hasPrev: false, hasNext: false, label: '' };
  const idx = paginatedData.value.findIndex(item => String(item.id) === String(editingItem.value?.id));
  const total = paginatedData.value.length;
  return {
    hasPrev: idx > 0,
    hasNext: idx < total - 1,
    label: idx >= 0 ? `${idx + 1} / ${total}` : ''
  };
});

const closeModal = async ({ askDraft = true } = {}) => {
  if (askDraft && showModal.value && Object.keys(editingItem.value || {}).length > 0) {
    const shouldKeepDraft = await dialog.confirm({
      title: '保留草稿',
      message: '是否保留本次未保存草稿？\n选"保留"会保存草稿以便下次恢复；选"丢弃"会清除并关闭。',
      confirmText: '保留',
      cancelText: '丢弃'
    });
    if (shouldKeepDraft) saveCurrentDraft();
    else clearCurrentDraft();
  }
  showModal.value = false;
  showUserPickerModal.value = false;
  userPickerKeyword.value = '';
  showProductPicker.value = false;
  productPickerKeyword.value = '';
  addressAiText.value = '';
  giftAddressOptions.value = [];
  giftAddressRawList.value = [];
  editingItem.value = {};
  editingOriginalItem.value = null;
  jsonBuffers.value = {};
  clearFieldErrors();
};

const fetchUserPickerUsers = async () => {
  const fetchId = userPickerFetchId.value + 1;
  userPickerFetchId.value = fetchId;
  userPickerLoading.value = true;
  try {
    // H-1 修复：profiles 敏感字段已通过列级权限收窄，
    // admin 查询用户列表（含敏感字段）改用 admin_list_users_with_sensitive RPC。
    const keyword = sanitizeSearchTerm(userPickerKeyword.value);
    let data;
    try {
      data = await fetchSensitiveUsers({ p_search: keyword || null, p_limit: 200 });
    } catch (fetchError) {
      if (fetchId !== userPickerFetchId.value) return;
      throw fetchError;
    }

    if (fetchId !== userPickerFetchId.value) return;
    userPickerUsers.value = Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn('data-admin', '加载用户选择器失败:', error);
    showToast('加载用户列表失败', 'error');
  } finally {
    if (fetchId === userPickerFetchId.value) {
      userPickerLoading.value = false;
    }
  }
};

const openUserPicker = () => {
  if (!['gifts', 'subscriptions', 'addresses', 'posterRequests'].includes(currentTab.value)) return;
  showUserPickerModal.value = true;
  fetchUserPickerUsers();
};

const closeUserPicker = () => {
  showUserPickerModal.value = false;
};

// 加载指定用户的地址列表，填充 giftAddressOptions 和 giftAddressRawList
const loadGiftAddresses = async (userId) => {
  if (!userId) {
    giftAddressOptions.value = [];
    giftAddressRawList.value = [];
    return [];
  }
  try {
    const { data: addrRows } = await supabase
      .from('user_addresses')
      .select('id, recipient, phone, region, detail, is_default, created_at')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    const list = Array.isArray(addrRows) ? addrRows : [];
    giftAddressRawList.value = list;
    giftAddressOptions.value = list.map(addr => {
      const region = addr.region ? addr.region + ' ' : '';
      const fullAddr = (region + (addr.detail || '')).trim();
      const tag = addr.is_default ? '【默认】' : '';
      return {
        value: addr.id,
        label: `${tag}${addr.recipient} ${addr.phone} ${fullAddr}`.trim()
      };
    });
    return list;
  } catch (err) {
    logger.warn('data-admin', '加载用户地址列表失败:', err);
    giftAddressOptions.value = [];
    giftAddressRawList.value = [];
    return [];
  }
};

const selectGiftUser = async (user) => {
  editingItem.value.user_id = user.id;
  editingItem.value.username = user.username || '';
  // addresses / posterRequests 表用 recipient / phone（posterRequests 额外有 address）
  // 仅在为空时自动填充用户已有收货信息，避免覆盖已编辑内容
  if (currentTab.value === 'addresses' || currentTab.value === 'posterRequests') {
    if (!editingItem.value.recipient) editingItem.value.recipient = user.shipping_recipient || '';
    if (!editingItem.value.phone) editingItem.value.phone = user.shipping_phone || '';
    if (currentTab.value === 'posterRequests' && !editingItem.value.address) {
      editingItem.value.address = user.shipping_address || '';
    }
  } else {
    editingItem.value.email = user.email || '';
    // 从 user_addresses 加载地址列表，填入地址选择器
    const addrList = await loadGiftAddresses(user.id);
    // 默认选 is_default 的地址（列表已排序，第一条即默认）；若礼物已绑定 address_id 则保留
    const existingAddressId = editingItem.value.address_id || '';
    const matched = existingAddressId
      ? addrList.find(a => a.id === existingAddressId)
      : null;
    const defaultAddr = matched || addrList[0] || null;
    if (defaultAddr) {
      editingItem.value.address_id = defaultAddr.id;
      editingItem.value.shipping_recipient = defaultAddr.recipient || '';
      editingItem.value.shipping_phone = defaultAddr.phone || '';
      const region = defaultAddr.region ? defaultAddr.region + ' ' : '';
      editingItem.value.shipping_address = (region + (defaultAddr.detail || '')).trim();
    } else {
      editingItem.value.address_id = '';
      editingItem.value.shipping_recipient = '-';
      editingItem.value.shipping_phone = '-';
      editingItem.value.shipping_address = '该用户暂无收货地址，请先在地址管理中添加';
    }
  }
  showUserPickerModal.value = false;
};

// 礼物编辑：切换地址选择器
const handleSelectGiftAddress = (addrId) => {
  const id = String(addrId || '').trim();
  if (!id) {
    // 选「使用默认地址」：取 is_default 的地址（giftAddressOptions 第一条）
    editingItem.value.address_id = '';
    // 重新从已加载列表取默认地址更新展示
    const _list = giftAddressRawList.value;
    const defaultAddr = _list.find(a => a.is_default) || _list[0] || null;
    if (defaultAddr) {
      editingItem.value.shipping_recipient = defaultAddr.recipient || '';
      editingItem.value.shipping_phone = defaultAddr.phone || '';
      const region = defaultAddr.region ? defaultAddr.region + ' ' : '';
      editingItem.value.shipping_address = (region + (defaultAddr.detail || '')).trim();
    } else {
      editingItem.value.shipping_recipient = '-';
      editingItem.value.shipping_phone = '-';
      editingItem.value.shipping_address = '该用户暂无收货地址';
    }
    return;
  }
  editingItem.value.address_id = id;
  const matched = giftAddressRawList.value.find(a => a.id === id);
  if (matched) {
    editingItem.value.shipping_recipient = matched.recipient || '';
    editingItem.value.shipping_phone = matched.phone || '';
    const region = matched.region ? matched.region + ' ' : '';
    editingItem.value.shipping_address = (region + (matched.detail || '')).trim();
  }
};

const clearSelectedGiftUser = () => {
  editingItem.value.user_id = '';
  editingItem.value.username = '';
  if (currentTab.value === 'addresses' || currentTab.value === 'posterRequests') {
    editingItem.value.recipient = '';
    editingItem.value.phone = '';
    if (currentTab.value === 'posterRequests') editingItem.value.address = '';
  } else {
    editingItem.value.email = '';
    editingItem.value.shipping_recipient = '';
    editingItem.value.shipping_phone = '';
    editingItem.value.shipping_address = '';
  }
};

// 地址管理 AI 识别：从粘贴文本提取收件人/电话/地区/详细地址
const extractJsonPayload = (rawText = '') => {
  const normalizedText = String(rawText || '').trim();
  if (!normalizedText) return null;
  const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const directSource = fencedMatch?.[1] || normalizedText;
  const jsonBlockMatch = directSource.match(/\{[\s\S]*\}/);
  const source = (jsonBlockMatch?.[0] || directSource).trim();
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
};

const normalizePhone = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasLeadingPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return hasLeadingPlus ? `+${digits}` : digits;
};

const loadAddressAiModel = async () => {
  if (addressAiModelRef.value) return addressAiModelRef.value;
  try {
    const result = await listActiveBohaiModelConfigs();
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null;
    const { chatModes, availableModels } = buildBohaiRuntimeModels(result.data);
    const mode = chatModes.find((m) => m.id === 'fast') || chatModes[0];
    const resolved = availableModels.find((m) => m.id === mode?.model) || availableModels[0];
    addressAiModelRef.value = {
      modeId: mode?.id || 'fast',
      provider: resolved?.providerKey || 'boh',
      url: resolved?.url || '',
      modelTag: resolved?.id || 'boh:fast'
    };
    return addressAiModelRef.value;
  } catch (err) {
    logger.warn('data-admin', '加载地址 AI 模型失败:', err);
    return null;
  }
};

const handleExtractAddress = async () => {
  const rawText = String(addressAiText.value || '').trim();
  if (!rawText) return showToast('请先粘贴地址原文', 'warning');

  const model = await loadAddressAiModel();
  if (!model?.modeId) return showToast('AI 地址识别模型未配置，请手动填写', 'error');

  isProcessingAddressAi.value = true;
  const systemPrompt = [
    '你是一个地址信息提取助手。',
    '从用户粘贴的文本中提取收件人姓名、联系电话、省市区、详细地址。',
    '只返回 JSON。',
    '返回格式: {"recipient":"...","phone":"...","region":"...","detail":"..."}'
  ].join('');
  try {
    const payload = {
      model: model.modelTag,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: rawText }],
      temperature: 0.1,
      stream: false
    };
    const vaultResult = await callVaultSiliconChat({
      provider: model.provider,
      purpose: 'chat',
      mode: model.modeId,
      apiUrl: model.url,
      payload,
      timeoutMs: 12000
    });
    if (!vaultResult.ok) throw new Error(vaultResult.error?.message || 'AI 识别代理请求失败');
    const rawContent = vaultResult.data?.choices?.[0]?.message?.content;
    const result = extractJsonPayload(rawContent);
    if (!result || typeof result !== 'object') throw new Error('AI 返回内容不可解析');

    const recipient = String(result.recipient || '').trim();
    const phone = normalizePhone(result.phone || '');
    const region = String(result.region || '').trim();
    const detail = String(result.detail || '').trim();

    if (!recipient && !phone && !region && !detail) {
      return showToast('AI 未识别到有效信息，请补充文本', 'warning');
    }
    if (recipient) editingItem.value.recipient = recipient;
    if (phone) editingItem.value.phone = phone;
    if (region) editingItem.value.region = region;
    if (detail) editingItem.value.detail = detail;
    showToast('已填入识别结果，请核对后保存', 'success');
  } catch (err) {
    logger.error('data-admin', 'AI 地址识别失败:', err);
    showToast('AI 识别失败，请手动填写', 'error');
  } finally {
    isProcessingAddressAi.value = false;
  }
};

const clearAddressAiText = () => {
  addressAiText.value = '';
};

// P0 修复: saveData 竞态条件 - 使用 saveDataId 模式防止重复提交
let saveDataIdCounter = 0;
const activeSaveDataId = ref(0);

const editDrawerRef = ref(null);

// E4: 行内铅笔直达字段 —— 记录抽屉打开后要定位的字段 key，被 openEditModal 消费一次即清空。
// 只做同步交接、不参与渲染，故用普通 let 而非 ref（与 editDrawerRef 同层声明）。
let pendingFocusField = '';

// C1: 写后单行 patch（命中当前页时跳过整表刷新，保留滚动与勾选）
const patchStoreRow = (tabId, row) => {
  if (!row || (row.id == null && row.id !== 0)) return false;
  const rows = dataStore[tabId];
  if (!Array.isArray(rows)) return false;
  const idx = rows.findIndex((r) => String(r?.id) === String(row.id));
  if (idx < 0) return false;
  rows[idx] = { ...rows[idx], ...row };
  return true;
};

// 保存失败时定位首个错误字段（展开分组 + 滚动 + 高亮）
const revealFirstError = () => {
  const key = (currentFields.value || []).map((f) => f.key).find((k) => fieldErrors[k]);
  if (key) nextTick(() => editDrawerRef.value?.revealField?.(key));
};

// E3: 连续作业（保存并下一条 / 保存并新建）
const saveAndEditNext = async () => {
  if (await saveData({ keepOpen: true })) navigateEditRecord(1);
};
const saveAndCreateNext = async () => {
  if (await saveData({ keepOpen: true })) openEditModal(null);
};

const saveData = async ({ keepOpen = false } = {}) => {
  // 先检查锁：防止计数器被篡改后导致 finally 永远不释放锁
  if (isSaving.value) {
    showToast('已有保存操作进行中，请稍候', 'warning');
    return false;
  }
  // 使用原子计数器防止竞态
  const currentSaveId = ++saveDataIdCounter;
  activeSaveDataId.value = currentSaveId;
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
      revealFirstError();
      return false;
    }

    const hasInvalidField = currentFields.value.some((field) => !validateField(field.key));
    if (hasInvalidField) {
      showToast('请修复表单错误后再保存', 'error');
      isSaving.value = false;
      revealFirstError();
      return false;
    }

    // 处理 JSON 字段
    for (const field of currentFields.value) {
      if (field.type === 'json' && jsonBuffers.value[field.key]) {
        try {
          editingItem.value[field.key] = JSON.parse(jsonBuffers.value[field.key]);
        } catch (_e) {
          showToast(`${field.label} JSON 格式错误`, 'error');
          isSaving.value = false;
          nextTick(() => editDrawerRef.value?.revealField?.(field.key));
          return false;
        }
      }
    }

    const table = currentConfig.value.table;
    const strategy = SAVE_STRATEGIES[currentTab.value];
    if (!strategy) {
      showToast(`暂不支持保存 ${currentTabLabel.value}`, 'error');
      isSaving.value = false;
      return false;
    }
    const dataToSave = await strategy({
      editingItem: editingItem.value,
      isEditing: isEditing.value,
      userId: userInfo.value?.id,
      validateNewsPayload
    });

    // 移除 id 字段（如果是新增）
    if (!isEditing.value && !TABS_KEEP_ID_ON_INSERT.has(currentTab.value)) {
      delete dataToSave.id;
    }

    if (!await confirmPayloadDiffs(dataToSave)) {
      isSaving.value = false;
      return false;
    }

    let savedRowPatched = false;
    if (isEditing.value) {
      const { data, error } = await supabase
        .from(table)
        .update(dataToSave)
        .eq('id', editingItem.value.id)
        .select();
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('保存失败：没有记录被更新，请检查管理员权限或记录是否存在');
      }
      if (currentTab.value === 'products') invalidateProductsCache();
      if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(dataToSave.user_id || editingItem.value.user_id);
      if (currentTab.value === 'coreMemories') await syncCoreMemoriesIndex();
      if (currentTab.value === 'bohaiModels') {
        clearVaultModelCache().catch((e) => logger.warn('清除模型缓存失败:', e));
      }
      addChangeLogEntry('update', editingItem.value, {
        diffs: getPayloadDiffs(editingOriginalItem.value || {}, dataToSave).slice(0, 20)
      });
      // C1: 命中当前页则单行 patch，跳过整表刷新（保留滚动与勾选）
      savedRowPatched = patchStoreRow(currentTab.value, data[0]);
      if (savedRowPatched) clearTabFetchCache(currentTab.value);
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
      if (currentTab.value === 'bohaiModels') {
        clearVaultModelCache().catch((e) => logger.warn('清除模型缓存失败:', e));
      }
      searchQuery.value = '';
      currentPage.value = 1;
      addChangeLogEntry('create', { id: dataToSave.id || editingItem.value.id || '' }, {
        fields: Object.keys(dataToSave)
      });
      showToast('数据添加成功', 'success');
    }

    clearCurrentDraft();
    if (keepOpen) {
      // 连续作业：不关抽屉，重锚定原始值避免误报未保存
      editingOriginalItem.value = cloneComparable(editingItem.value);
      if (savedRowPatched) lastRefreshedAt.value = new Date().toISOString();
      return true;
    }
    if (!savedRowPatched) {
      await refreshCurrentViewAfterMutation();
    } else {
      lastRefreshedAt.value = new Date().toISOString();
    }
    await closeModal({ askDraft: false });
    return true;
  } catch (error) {
    // P0 修复: 检查是否是当前保存请求，忽略过期的请求错误
    if (activeSaveDataId.value !== currentSaveId) {
      logger.warn('data-admin', '忽略过期的保存请求错误（已有新的保存请求）');
      return false;
    }
    logger.error('data-admin', '保存失败:', error);
    showToast('保存失败: ' + buildActionErrorMessage(error, '保存失败'), 'error');
    return false;
  } finally {
    // P0 修复: 仅当是当前保存请求时才释放锁
    if (activeSaveDataId.value === currentSaveId) {
      isSaving.value = false;
      activeSaveDataId.value = 0;
    }
  }
};

// 第二阶段: 所有 mutations (deleteItem / drawLotteryNow / approveModerationItem / batchDelete 等)
// 已迁移至 composables/useDataAdminMutations.js (createMutationsCenter 工厂)
// 工厂在 refreshCurrentViewAfterMutation 之后注入, 上述 let 变量会被重新赋值为真实函数
// 这里删除内联的重复实现, 避免命名冲突与重复定义

// ==================== 辅助方法（已拆分到 useDataAdminHelpers.js） ====================
// formatCellValue / formatDate / formatDateTime / getBadgeType / getTags /
// getHighlightKeyword / highlightCellValue / getJsonPreview / downloadBlob /
// getRelatedJump / toDateInputValue / toISOStringFromInput / normalizeQuickEditValue /
// isAnomalyRow / getAnomalyReason 已迁移到 composable

// createHighlightHelpers / createRelatedJumpHelpers / createAnomalyHelpers
// 已下移至 createGlobalSearchCenter 之后 (依赖 globalSearchQuery)

const jumpToRelatedRecord = (jump, item) => {
  if (!jump?.tabId) return;
  addRecentRecord(item);
  switchTab(jump.tabId, { search: jump.search });
};

// ===== 引用面板：一条记录的所有关联入口（复用 RELATED_JUMP_MAP）=====
const showRelatedPanel = ref(false);
const relatedPanelItem = ref(null);
const relatedJumpsForItem = (item) => {
  if (!item) return [];
  return currentColumns.value
    .map(col => ({ col, jump: getRelatedJump(col, item) }))
    .filter(x => x.jump)
    .map(x => ({
      field: x.col.label,
      tabId: x.jump.tabId,
      search: x.jump.search,
      tabLabel: getTabLabel(x.jump.tabId)
    }));
};
const openRelatedPanel = (item) => {
  relatedPanelItem.value = item;
  showRelatedPanel.value = true;
};
const closeRelatedPanel = () => {
  showRelatedPanel.value = false;
  relatedPanelItem.value = null;
};

const isInlineEditable = (col, item) => {
  if (!item?.id || isReadOnlyTab.value || isModerationTab.value) return false;
  return inlineEditableFieldKeys.value.has(col.key);
};

const startInlineEdit = (item, col) => {
  if (!isInlineEditable(col, item)) return;
  inlineEditState.rowId = getRowIdentity(item);
  inlineEditState.fieldKey = col.key;
  inlineEditState.value = item[col.key] ?? '';
};

// E4: 单元格快捷编辑 —— 行内支持的走行内（select/number/text…），
// textarea/tags/json/image 等走抽屉并直达对应字段，铅笔不再是死按钮
// （editDrawerRef / pendingFocusField 见 saveData 上方声明）
const isDrawerEditable = (col, item) => {
  if (!item?.id || isReadOnlyTab.value || isModerationTab.value) return false;
  if (inlineEditableFieldKeys.value.has(col.key)) return false;
  const field = getFieldByKey(col.key);
  if (!field || field.disabled) return false;
  return (TAB_WRITABLE_FIELDS[currentTab.value] || []).includes(col.key);
};
const isCellEditable = (col, item) => isInlineEditable(col, item) || isDrawerEditable(col, item);
const quickEditCell = (item, col) => {
  if (isInlineEditable(col, item)) startInlineEdit(item, col);
  else if (isDrawerEditable(col, item)) openEditModal(item, { focusField: col.key });
};

const cancelInlineEdit = () => {
  inlineEditState.rowId = '';
  inlineEditState.fieldKey = '';
  inlineEditState.value = '';
  inlineEditState.saving = false;
};

const isInlineEditing = (item, col) =>
  inlineEditState.rowId === getRowIdentity(item) && inlineEditState.fieldKey === col.key;

const getFieldByKey = (fieldKey) => currentFields.value.find((field) => field.key === fieldKey);

// normalizeQuickEditValue 已迁移至 useDataAdminHelpers.js (导入即可用)

const saveInlineEdit = async (item, col) => {
  if (inlineEditState.saving) return;
  const field = getFieldByKey(col.key);
  try {
    assertAdminAction();
    inlineEditState.saving = true;
    const normalizedValue = normalizeQuickEditValue(field, inlineEditState.value);
    const oldValue = item[col.key];
    if (String(oldValue ?? '') === String(normalizedValue ?? '')) {
      cancelInlineEdit();
      return;
    }
    const payload = pickWritableFields(currentTab.value, { [col.key]: normalizedValue });
    const { data, error } = await supabase
      .from(currentConfig.value.table)
      .update(payload)
      .eq('id', item.id)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('行内编辑未生效，请检查权限或记录是否存在');
    }
    addChangeLogEntry('inline_update', item, { field: col.key, from: oldValue, to: normalizedValue });
    if (currentTab.value === 'products') invalidateProductsCache();
    if (currentTab.value === 'subscriptions') invalidateSubscriptionCache(item?.user_id);
    if (currentTab.value === 'bohaiModels') {
      clearVaultModelCache().catch((e) => logger.warn('清除模型缓存失败:', e));
    }
    showToast('行内编辑已保存', 'success');
    cancelInlineEdit();
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '行内编辑失败:', error);
    showToast('行内编辑失败: ' + buildActionErrorMessage(error, '行内编辑失败'), 'error');
  } finally {
    inlineEditState.saving = false;
  }
};

// isAnomalyRow / getAnomalyReason 已迁移至 useDataAdminHelpers.js (createAnomalyHelpers 工厂注入)

const applyBatchEdit = async () => {
  if (!selectedItems.value.length || !batchEditState.fieldKey) return;
  const field = getFieldByKey(batchEditState.fieldKey);
  try {
    assertAdminAction();
    const normalizedValue = normalizeQuickEditValue(field, batchEditState.value);
    const ids = selectedItems.value.map((item) => item.id).filter(Boolean);
    const preview = `将修改 ${ids.length} 条「${currentTabLabel.value}」记录\n字段：${field?.label || batchEditState.fieldKey}\n新值：${normalizedValue}`;
    if (!await dialog.confirm({
      title: '确认批量修改',
      message: preview,
      tone: 'warning',
      confirmText: '应用修改'
    })) return;

    // P0 修复: 记录原始值用于回滚
    const originalValues = new Map();
    selectedItems.value.forEach((item) => {
      if (item.id) {
        originalValues.set(item.id, item[batchEditState.fieldKey]);
      }
    });

    const payload = pickWritableFields(currentTab.value, { [batchEditState.fieldKey]: normalizedValue });
    const { data, error } = await supabase
      .from(currentConfig.value.table)
      .update(payload)
      .in('id', ids)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== ids.length) {
      // P0 修复: 提供回滚选项
      const updatedIds = Array.isArray(data) ? data.map((d) => d.id) : [];
      const failedIds = ids.filter((id) => !updatedIds.includes(id));
      const rollbackChoice = await dialog.confirm({
        title: '批量编辑部分失败',
        message: `请求更新 ${ids.length} 条，实际更新 ${updatedIds.length} 条。\n失败记录: ${failedIds.slice(0, 5).join(', ')}${failedIds.length > 5 ? '...' : ''}\n\n是否回滚已更新的 ${updatedIds.length} 条记录？`,
        tone: 'warning',
        confirmText: '回滚',
        cancelText: '保留'
      });
      
      if (rollbackChoice && updatedIds.length > 0) {
        // 执行回滚
        const rollbackPromises = updatedIds.map(async (id) => {
          const originalValue = originalValues.get(id);
          if (originalValue !== undefined) {
            return supabase
              .from(currentConfig.value.table)
              .update({ [batchEditState.fieldKey]: originalValue })
              .eq('id', id);
          }
          return null;
        });
        await Promise.allSettled(rollbackPromises);
        showToast('已回滚批量编辑', 'warning');
      }
      
      throw new Error(`批量编辑未完全生效：请求 ${ids.length} 条，实际更新 ${Array.isArray(data) ? data.length : 0} 条`);
    }
    addChangeLogEntry('batch_update', { id: ids.join(',') }, { 
      field: batchEditState.fieldKey, 
      to: normalizedValue, 
      count: ids.length,
      // P0 修复: 记录原始值用于后续回滚
      originalValues: Object.fromEntries(originalValues)
    });
    if (currentTab.value === 'products') invalidateProductsCache();
    if (currentTab.value === 'subscriptions') selectedItems.value.forEach((item) => invalidateSubscriptionCache(item?.user_id));
    if (currentTab.value === 'bohaiModels') {
      clearVaultModelCache().catch((e) => logger.warn('清除模型缓存失败:', e));
    }
    showToast('批量编辑成功', 'success');
    selectedItems.value = [];
    batchEditState.fieldKey = '';
    batchEditState.value = '';
    showBatchEditPanel.value = false;
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '批量编辑失败:', error);
    showToast('批量编辑失败: ' + buildActionErrorMessage(error, '批量编辑失败'), 'error');
  }
};

// 导出/备份已迁移至 composables/useDataAdminExport.js (createExportCenter)
// getJsonPreview / downloadBlob 已迁移至 useDataAdminHelpers.js (导入即可用)
// exportData / exportBackupData / getBackupTableTargets / fetchBackupTableRows
// 由下方 createExportCenter 工厂注入

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

// 键盘快捷键已迁移至 composables/useDataAdminShortcuts.js (createShortcutsCenter)
// handleGlobalShortcuts 由下方 createShortcutsCenter 工厂注入

// ==================== 生命周期 ====================
const handleVisibilityChange = () => {
  if (document.hidden) {
    if (autoRefreshInterval.value !== null) {
      clearInterval(autoRefreshInterval.value);
      autoRefreshInterval.value = null;
    }
  } else {
    if (activeAdminSection.value === 'overview') {
      startAutoRefresh();
    }
  }
};

// ==================== ⌘K / Ctrl+K 命令面板 ====================
const showCommandPalette = ref(false);
const commandQuery = ref('');
const commandActiveIndex = ref(0);
const commandInputRef = ref(null);

const commandPaletteItems = computed(() => {
  const items = [];
  if (!isModerationTab.value && canCreateCurrentTab.value) {
    items.push({ id: 'create', label: '新增记录', hint: 'N', run: () => openEditModal() });
  }
  items.push({ id: 'refresh', label: '刷新数据', hint: '', run: () => refreshAllData() });
  items.push({ id: 'theme', label: '切换深/浅色主题', hint: '', run: () => toggleAdminTheme() });
  items.push({ id: 'export', label: '导出当前表', hint: '', run: () => exportData() });
  items.push({ id: 'backup', label: '备份全部数据', hint: '', run: () => exportBackupData() });
  items.push({ id: 'global-search', label: '跨表搜索', hint: '/', run: () => { showGlobalSearchPanel.value = true; } });
  items.push({ id: 'advanced-filter', label: '高级筛选', hint: '', run: () => { showAdvancedFilterPanel.value = true; } });
  items.push({ id: 'columns', label: '列配置', hint: '', run: () => { showColumnPanel.value = true; } });
  items.push({ id: 'changelog', label: '变更日志', hint: '', run: () => { showChangeLogPanel.value = true; } });
  if (selectedItems.value.length > 0 && !isModerationTab.value && canDeleteCurrentTab.value && !isProfileDerivedTab.value) {
    items.push({ id: 'batch-delete', label: `删除选中 (${selectedItems.value.length})`, hint: '', run: () => batchDelete() });
  }
  if (Array.isArray(sidebarModules.value)) {
    for (const mod of sidebarModules.value) {
      if (!canViewModule(currentUserRole.value, mod.id)) continue;
      items.push({ id: `module-${mod.id}`, label: `切换到：${mod.label}`, hint: '', run: () => guardedModuleClick(mod) });
    }
  }
  return items;
});

const filteredCommandPaletteItems = computed(() => {
  const q = commandQuery.value.trim().toLowerCase();
  if (!q) return commandPaletteItems.value;
  return commandPaletteItems.value.filter((it) => it.label.toLowerCase().includes(q));
});

const openCommandPalette = () => {
  showCommandPalette.value = true;
  commandQuery.value = '';
  commandActiveIndex.value = 0;
  nextTick(() => commandInputRef.value?.focus());
};
const closeCommandPalette = () => {
  showCommandPalette.value = false;
  commandQuery.value = '';
};
const runCommandPaletteItem = (item) => {
  closeCommandPalette();
  item.run();
};
const onCommandInputKeydown = (e) => {
  const list = filteredCommandPaletteItems.value;
  const len = list.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    commandActiveIndex.value = len ? (commandActiveIndex.value + 1) % len : 0;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    commandActiveIndex.value = len ? (commandActiveIndex.value - 1 + len) % len : 0;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (list[commandActiveIndex.value]) runCommandPaletteItem(list[commandActiveIndex.value]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
  }
};
const handleCommandPaletteKey = (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (showCommandPalette.value) closeCommandPalette();
    else openCommandPalette();
  }
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
  document.addEventListener('keydown', handleGlobalShortcuts);
  document.addEventListener('keydown', handleCommandPaletteKey);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  // 初始化主题：直接跟随全站主题（单一源 = themeManager，已由 main.js 初始化），
  // 不再读 dm-theme / 不再自己判断系统偏好 —— 那正是"后台与全站主题不一致"的来源。
  currentTheme.value = normalizeTheme(themeManager.getTheme());
  themeManager.addListener(handleThemeChange);
});
onUnmounted(() => {
  stopAutoRefresh();
  themeManager.removeListener(handleThemeChange);
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('keydown', handleGlobalShortcuts);
  document.removeEventListener('keydown', handleCommandPaletteKey);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
// 第二阶段: 所有 onMounted / onUnmounted / watch 已迁移至 composables/useDataAdminLifecycle.js
// (setupDataAdminLifecycle 工厂)
// 内部统一管理 searchDebounceTimer / userPickerSearchDebounceTimer / draftSaveDebounceTimer / toast.timer
setupDataAdminLifecycle({
  columnSettings,
  savedFilterViews,
  pinnedTabIds,
  recentRecords,
  changeLogEntries,
  pageSize,
  currentPage,
  currentTab,
  editingItem,
  showModal,
  suppressDraftSave,
  suppressNextPageFetch,
  totalPages,
  userPickerKeyword,
  searchDebounceTimer,
  userPickerSearchDebounceTimer,
  toast,
  isSubscriptionTab,
  showUserPickerModal,
  SUBSCRIPTION_PLAN_NAMES,
  fetchData,
  fetchTabData,
  fetchUserPickerUsers,
  saveCurrentDraft
});

// ==================== 工厂注入: 导出/跨表搜索/快捷键 ====================
const {
  isExportingBackup,
  isBackupExporting,
  backupProgress,
  backupProgressText,
  cancelBackupExport,
  exportData,
  exportBackupData,
  abortBackupExport
} = createExportCenter({
  currentTabRef: currentTab,
  currentDataRef: currentData,
  visibleCurrentColumnsRef: visibleCurrentColumns,
  userInfoRef: userInfo,
  showToast,
  assertAdminAction,
  buildActionErrorMessage,
  addChangeLogEntry
});

const {
  globalSearchQuery,
  globalSearchResults,
  isGlobalSearching,
  showGlobalSearchPanel,
  runGlobalSearch,
  openGlobalSearchResult,
  abortGlobalSearch
} = createGlobalSearchCenter({
  searchQueryRef: searchQuery,
  showToast,
  buildActionErrorMessage,
  switchTab,
  addRecentRecord
});

// ==================== 高亮/关联跳转/异常检测 Helpers 注入 ====================
// 在 createGlobalSearchCenter 之后注入 (createHighlightHelpers 依赖 globalSearchQuery)
const { getHighlightKeyword, highlightCellValue } = createHighlightHelpers({
  searchQueryRef: searchQuery,
  globalSearchQueryRef: globalSearchQuery
});

const { getRelatedJump } = createRelatedJumpHelpers({ currentTabRef: currentTab });

// 反向同步：浏览器后退/前进改变 URL query 时，UI 跟随回退。
// tab 恢复走 switchTab（完整状态重置 + 数据重拉），与手动点击行为一致；
// 相等守卫保证不会与上方正向写回 watcher 形成循环。
watch(() => router.currentRoute.value?.query, (query) => {
  const q = query || {};
  const qTab = typeof q.tab === 'string' ? q.tab : '';
  const qSection = typeof q.section === 'string' ? q.section : '';
  if (qSection && qSection !== activeAdminSection.value) {
    activeAdminSection.value = qSection;
  }
  if (qTab && isValidAdminTab(qTab) && qTab !== currentTab.value) {
    switchTab(qTab);
  }
});

const { isAnomalyRow, getAnomalyReason } = createAnomalyHelpers({ currentTabRef: currentTab });

const { handleGlobalShortcuts } = createShortcutsCenter({
  showModalRef: showModal,
  isSavingRef: isSaving,
  isEditingRef: isEditing,
  canCreateCurrentTabRef: canCreateCurrentTab,
  activeAdminSectionRef: activeAdminSection,
  editDrawerNavRef: editDrawerNav,
  saveData,
  closeModal,
  openEditModal,
  navigateEditRecord
});

// 卸载时中止后台请求
onUnmounted(() => {
  abortBackupExport();
  abortGlobalSearch();
});

</script>

<style scoped>
@import './styles/base.css';
@import './styles/google-components.css';
@import './styles/console.css';
@import './styles/responsive.css';

/* 侧栏与遮罩从管理页顶部工具栏下方开始，避免移动端覆盖操作区。 */
.data-management-page {
  --dm-nav-height: calc(var(--dm-header-height) + env(safe-area-inset-top));
}

/* Module sub-tabs (Google-style underline tabs) */
.g-module-tabs {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 6);
  border-bottom: 1px solid var(--border);
  margin-bottom: calc(var(--spacing) * 4);
  padding: 0 calc(var(--spacing) * 1);
  flex: 0 0 auto;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.g-module-tabs::-webkit-scrollbar { display: none; }
.g-module-tab {
  position: relative;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 1);
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s ease;
}
.g-module-tab:hover { color: var(--foreground); }
.g-module-tab.is-active {
  color: var(--primary);
  font-weight: 600;
}
.g-module-tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--primary);
  border-radius: 2px 2px 0 0;
}

.admin-shell {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-height: calc(100vh - var(--dm-nav-height));
  min-height: calc(100dvh - var(--dm-nav-height));
  position: relative;
  background: var(--background);
}

.admin-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.main-container {
  flex: 1;
  padding: calc(var(--spacing) * 5) calc(var(--spacing) * 8) calc(var(--spacing) * 10);
  max-width: 1320px;
  width: 100%;
  margin: 0 auto;
}

/* 面包屑：首页 / 模块 / 子表（标准后台定位路径） */
.admin-breadcrumb {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 8) 0;
  max-width: 1320px;
  width: 100%;
  margin: 0 auto;
  font-size: 0.78rem;
  color: var(--muted-foreground);
}
.admin-breadcrumb-sep { opacity: 0.5; }
.admin-breadcrumb-link {
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.admin-breadcrumb-link:hover { color: var(--primary); text-decoration: underline; }
.admin-breadcrumb-current { color: var(--foreground); font-weight: 600; }

@media (max-width: 768px) {
  .data-management-page {
    --dm-header-height: 58px;
  }

  .advanced-filter-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .advanced-filter-row > *,
  .panel-inline-form > * {
    min-width: 0;
    width: 100%;
  }

  .editor-panel {
    margin-inline: 0;
  }

  .mobile-data-pagination {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-top: 16px;
    padding: 12px 4px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }

  .mobile-data-pagination .g-sheet-foot-text {
    text-align: center;
  }

  .mobile-data-pagination .g-pager {
    justify-content: center;
  }

  .mobile-pagination-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .mobile-page-size {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--muted-foreground);
    font-size: 0.78rem;
  }

  .mobile-page-size select {
    min-height: 32px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--foreground);
  }
}

@media (min-width: 769px) {
  .mobile-data-pagination {
    display: none;
  }
}

@media (max-width: 480px) {
  .data-management-page {
    --dm-header-height: 56px;
  }
}

.sidebar-scrim {
  display: none;
  position: fixed;
  inset: var(--dm-nav-height) 0 0 0;
  background: color-mix(in srgb, var(--foreground) 35%, transparent);
  z-index: 1040;
}

@media (max-width: 768px) {
  .sidebar-scrim.is-visible { display: block; }
  .main-container { padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4) calc(var(--spacing) * 8); }
}

/* 收集结果概览条 */
.collection-overview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  margin: 0 0 12px;
  background: var(--card, #fff);
  border: 1px solid color-mix(in srgb, var(--foreground) 8%, transparent);
  border-radius: 12px;
}
.collection-overview-label {
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--foreground) 55%, transparent);
  letter-spacing: 0.02em;
}
.collection-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.collection-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 12px;
  border: 1px solid color-mix(in srgb, var(--foreground) 12%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
}
.collection-chip:hover {
  border-color: color-mix(in srgb, var(--foreground) 24%, transparent);
  transform: translateY(-1px);
}
.collection-chip:active { transform: translateY(0) scale(0.98); }
.collection-chip-label { font-weight: 500; }
.collection-chip-count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 10%, transparent);
  color: color-mix(in srgb, var(--foreground) 70%, transparent);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: background-color .18s ease, color .18s ease;
}
.collection-chip.is-active {
  color: #fff;
  border-color: transparent;
}
.collection-chip.is-active .collection-chip-count {
  background: color-mix(in srgb, #fff 28%, transparent);
  color: #fff;
}
.collection-chip.tone-muted.is-active { background: color-mix(in srgb, var(--foreground) 52%, #888); }
.collection-chip.tone-warning.is-active { background: #d97706; }
.collection-chip.tone-info.is-active { background: #2563eb; }
.collection-chip.tone-success.is-active { background: #16a34a; }
.collection-chip.tone-danger.is-active { background: #dc2626; }
.collection-overview-hint {
  margin-left: auto;
  font-size: 12px;
  color: color-mix(in srgb, var(--foreground) 45%, transparent);
  font-variant-numeric: tabular-nums;
}

/* 抽奖视图切换 */
.view-mode-toggle {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--muted, #f1f5f9);
  gap: 2px;
}
.view-mode-toggle button {
  border: none;
  background: transparent;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted-foreground, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}
.view-mode-toggle button.is-active {
  background: var(--card, #fff);
  color: var(--foreground, #0f172a);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.view-mode-toggle button:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

/* 看板视图 */
.kanban-board {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  align-items: flex-start;
}
.kanban-col {
  flex: 0 0 248px;
  max-width: 248px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface, var(--card));
  max-height: calc(100vh - 260px);
}
.kanban-col-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.kanban-col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #888;
}
.kanban-col-dot.tone-success { background: #16a34a; }
.kanban-col-dot.tone-warning { background: #d97706; }
.kanban-col-dot.tone-info { background: #2563eb; }
.kanban-col-dot.tone-danger { background: #dc2626; }
.kanban-col-dot.tone-muted { background: #64748b; }
.kanban-col-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kanban-col-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted-foreground);
  background: var(--muted);
  border-radius: 999px;
  padding: 1px 8px;
  flex: 0 0 auto;
}
.kanban-col-body {
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
}
.kanban-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  text-align: left;
}
.kanban-card:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}
.kanban-card:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.kanban-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.kanban-card-sub {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kanban-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.kanban-mini-btn {
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  cursor: pointer;
}
.kanban-mini-btn.approve {
  color: #34a853;
  background: rgba(52, 168, 83, 0.14);
  border-color: rgba(52, 168, 83, 0.3);
}
.kanban-mini-btn.reject {
  color: #ea4335;
  background: rgba(234, 67, 53, 0.12);
  border-color: rgba(234, 67, 53, 0.3);
}
.kanban-mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.kanban-mini-btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.kanban-col-empty {
  text-align: center;
  color: var(--muted-foreground);
  font-size: 12px;
  padding: 16px 0;
  margin: 0;
}

/* 时间线视图 */
.timeline-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.timeline-day-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-foreground);
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
.timeline-item {
  position: relative;
  padding: 10px 12px 10px 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  margin-bottom: 8px;
}
.timeline-item::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 14px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
}
.timeline-item:hover {
  border-color: var(--primary);
  transform: translateX(2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.timeline-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.timeline-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.timeline-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground);
}
.timeline-item-time {
  font-size: 12px;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
.timeline-item-body {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 6px;
}
.timeline-item-field {
  font-size: 12px;
  color: var(--muted-foreground);
}
.timeline-item-field strong {
  color: var(--foreground);
  font-weight: 500;
  margin-right: 4px;
}

/* 引用面板 */
.related-panel {
  margin-top: 12px;
}
.related-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.related-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  padding: 8px 12px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease;
}
.related-item:hover {
  border-color: var(--primary);
}
.related-item:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}
.related-item-label {
  font-size: 12px;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
.related-item-target {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  flex: 0 0 auto;
}
.related-item-search {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 40%;
}

/* 抽奖卡片视图 */
.lottery-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  padding: 4px;
}
.lottery-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--card, #fff);
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.lottery-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  border-color: color-mix(in srgb, var(--foreground, #0f172a) 20%, var(--border, #e2e8f0));
}
.lottery-card.selected {
  border-color: var(--primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary, #2563eb) 25%, transparent);
}
.lottery-card.is-closed { opacity: 0.78; }

.lottery-card-cover {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #f8fafc, #eef2f7);
  overflow: hidden;
}
.lottery-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.lottery-card-cover.is-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}
.lottery-card-cover-icon { font-size: 38px; opacity: 0.5; }
.lottery-card-status {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  backdrop-filter: var(--liquid-filter-sm);
  -webkit-backdrop-filter: var(--liquid-filter-sm);
  background: rgba(255, 255, 255, 0.85);
}
.lottery-card-status.tone-muted { color: #64748b; }
.lottery-card-status.tone-info { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.lottery-card-status.tone-success { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.lottery-card-status.tone-neutral { background: rgba(100, 116, 139, 0.15); color: #475569; }

.lottery-card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.lottery-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--foreground, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lottery-card-prize {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.lottery-card-prize-label { color: var(--muted-foreground, #64748b); flex-shrink: 0; }
.lottery-card-prize-value {
  color: var(--foreground, #0f172a);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lottery-card-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px 0;
  border-top: 1px solid var(--border, #e2e8f0);
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.lottery-card-stat { display: flex; flex-direction: column; gap: 2px; align-items: center; }
.lottery-card-stat-label { font-size: 10px; color: var(--muted-foreground, #64748b); }
.lottery-card-stat-value { font-size: 13px; font-weight: 700; color: var(--foreground, #0f172a); }
.lottery-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
}
.lottery-card-meta-row { display: flex; justify-content: space-between; gap: 8px; }
.lottery-card-meta-label { color: var(--muted-foreground, #64748b); flex-shrink: 0; }
.lottery-card-meta-value {
  color: var(--foreground, #0f172a);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tone-text-muted { color: #64748b; }
.tone-text-info { color: #2563eb; }
.tone-text-success { color: #16a34a; }
.tone-text-warning { color: #d97706; }
.tone-text-danger { color: #dc2626; }
.tone-text-neutral { color: #475569; }

/* 卡片一键复制按钮 */
.card-copy-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 5px;
  background: transparent;
  color: var(--muted-foreground, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}
.card-copy-btn:hover {
  background: var(--muted, #f1f5f9);
  color: var(--foreground, #0f172a);
  border-color: color-mix(in srgb, var(--foreground, #0f172a) 30%, transparent);
}
.card-copy-btn.copied {
  background: #ecfdf3;
  border-color: #16a34a;
  color: #16a34a;
}

.lottery-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--border, #e2e8f0);
  background: color-mix(in srgb, var(--muted, #f1f5f9) 50%, transparent);
}
.lottery-card-actions .review-btn,
.lottery-card-actions .icon-btn {
  padding: 4px 10px;
  font-size: 12px;
  min-height: 28px;
  border-radius: 6px;
}

@media (max-width: 720px) {
  .lottery-card-grid { grid-template-columns: 1fr; }
}

/* ==================== 密度优化：操作列单行 + 紧凑行高 ==================== */
/* 操作列取消 112px 定宽，内容不换行（主操作 inline + 其余进 ⋯ 菜单） */
.g-table-sheet .actions-col {
  min-width: 0;
  width: 1%;
  white-space: nowrap;
}
/* 列 hug 内容：表格按内容撑宽，不把多余宽度摊进列间距 */
.g-sheet-table-scroll > .g-table-sheet {
  width: max-content;
  min-width: 100%;
}
.g-table-sheet tbody td,
.g-table-sheet thead th {
  white-space: nowrap;
}
/* 例外：标签/JSON 单元格允许换行，避免被上面的一刀切 nowrap 撑爆 */
.g-table-sheet td .cell-tags,
.g-table-sheet td .cell-json {
  white-space: normal;
}
.g-table-sheet td .cell-text {
  max-width: 220px;
}
.action-btns {
  flex-wrap: nowrap;
  gap: 6px;
}
/* 表格内按钮缩小：40px 大圆钮 → 30px */
.action-btns .icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}
.action-btns .review-btn {
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 7px;
}
/* 行内编辑铅笔：平时隐藏，悬停/聚焦才显（触屏保持可见） */
.cell-edit-trigger { opacity: 0; }
.g-table-sheet tr:hover .cell-edit-trigger,
.g-table-sheet tr:focus-within .cell-edit-trigger,
.cell-edit-trigger:focus-visible {
  opacity: 1;
}
@media (hover: none), (pointer: coarse) {
  .cell-edit-trigger { opacity: 0.86; }
}

/* 密度：紧凑（默认）/ 舒适 */
.data-content[data-density="compact"] .g-table-sheet tbody td {
  padding: 8px 12px;
}
.data-content[data-density="compact"] .g-table-sheet thead th {
  padding: 8px 12px;
}
.data-content[data-density="comfortable"] .g-table-sheet tbody td {
  padding: 14px 16px;
}
.data-content[data-density="comfortable"] .g-table-sheet thead th {
  padding: 12px 16px;
}
.density-toggle {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--muted, #f1f5f9);
  gap: 2px;
}
.density-toggle button {
  border: none;
  background: transparent;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted-foreground, #64748b);
  cursor: pointer;
  white-space: nowrap;
}
.density-toggle button.is-active {
  background: var(--card, #fff);
  color: var(--foreground, #0f172a);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

/* 浮动批量操作条 */
.bulk-bar {
  position: sticky;
  top: calc(var(--dm-nav-height, 60px) + 8px);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 7%, var(--card, #fff));
  box-shadow: 0 6px 20px -12px rgba(0, 0, 0, 0.25);
}
.bulk-count { font-size: 0.82rem; color: var(--foreground); }
.bulk-count strong { font-variant-numeric: tabular-nums; }
.bulk-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* 行级 ⋯ 浮动菜单 */
.row-float-menu {
  position: fixed;
  z-index: 2000;
  width: 188px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--popover, var(--card, #fff));
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.28);
}
.row-float-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
}
.row-float-item:hover { background: var(--muted); }
.row-float-item.is-danger { color: var(--destructive, #e5484d); }
.row-float-item.is-danger:hover {
  background: color-mix(in srgb, var(--destructive, #e5484d) 10%, transparent);
}
.row-float-item:disabled { opacity: 0.45; cursor: not-allowed; }

/* 行高亮（审核流水线下一条定位） */
.g-table-sheet tbody tr.row-flash,
.mobile-card.row-flash {
  animation: row-flash 1.8s ease;
}
@keyframes row-flash {
  0%, 100% { background: transparent; }
  15%, 55% { background: color-mix(in srgb, var(--primary) 14%, transparent); }
}

/* 模块 hero 瘦身：收紧内边距与标题字号，减少首屏占用 */
.admin-section-hero {
  padding: 14px 18px;
  margin-bottom: 12px;
  align-items: center;
}
.admin-section-hero h2 { font-size: 19px; margin-bottom: 4px; }
.admin-section-hero p { font-size: 13px; }
</style>

<style>
@import './styles/overlays.css';
</style>
