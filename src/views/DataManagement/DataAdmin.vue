<template>
  <div class="data-management-page">

    <div class="admin-shell">
      <AdminSidebar
        :active-admin-section="activeAdminSection"
        :active-tab-group-id="activeTabGroupId"
        :current-tab="currentTab"
        :get-tab-count="getTabCount"
        :get-tabs-by-group="getTabsByGroup"
        :is-data-tree-collapsed="isDataTreeCollapsed"
        :is-open="isAdminSidebarOpen"
        :navigation="adminNavigation"
        :pinned-tabs="currentPinnedTabs"
        :recent-records="recentRecordsForSidebar"
        :tab-groups="tabGroupsWithCounts"
        v-model:search-query="globalSearchQuery"
        @nav-click="handleAdminNavClick"
        @recent-click="jumpToRecentRecord"
        @tab-click="handleSidebarTabClick"
        @create-record="handleAdminCreate"
        @refresh-data="refreshAllData"
        @quick-edit="handleQuickEdit"
        @toggle-theme="toggleAdminTheme"
      />

      <div v-if="isAdminSidebarOpen" class="sidebar-scrim" @click="isAdminSidebarOpen = false"></div>

      <main class="admin-main">
        <AdminHeader
          :can-create="canCreateCurrentTab && !isModerationTab"
          :is-refreshing="isRefreshing"
          :is-sidebar-open="isAdminSidebarOpen"
          @create="handleAdminCreate"
          @refresh="refreshAllData"
          @toggle-sidebar="isAdminSidebarOpen = !isAdminSidebarOpen"
        />

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
          />

          <ApiKeyConsole v-else-if="isApiKeysSection" />

          <ModelRouting v-else-if="isModelRoutingSection" />

          <section v-if="activeAdminSection !== 'overview' && !isApiKeysSection && !isModelRoutingSection" class="admin-section-hero">
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
        <div class="toolbar-primary">
          <div class="toolbar-left">
            <div>
              <h2 class="section-title">{{ currentTabLabel }}</h2>
              <div class="view-context">
                <span>{{ currentTabGroup?.label || '全部' }}</span>
                <span>{{ activeFilterSummary }}</span>
                <span>{{ lastRefreshLabel }}</span>
              </div>
            </div>
            <span class="data-badge">{{ totalRecordCount }} 条记录</span>
          </div>
          <div class="toolbar-right">
            <button v-if="!isModerationTab && canCreateCurrentTab" class="btn btn-primary" @click="openEditModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新增
            </button>
          </div>
        </div>
        <div class="toolbar-secondary">
          <div class="search-box">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input v-model="searchQuery" type="text" placeholder="搜索数据..." aria-label="搜索数据" @input="handleSearch" />
            <button v-if="searchQuery" class="clear-search" @click="clearSearch">×</button>
          </div>
          <button class="filter-toggle" type="button" @click="showFilterBar = !showFilterBar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="8" y1="12" x2="20" y2="12"></line>
              <line x1="12" y1="18" x2="20" y2="18"></line>
            </svg>
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
        <div class="data-content">
          <div class="content-toolbar">
            <div class="toolbar-right">
              <button class="btn btn-secondary" type="button" @click="showColumnPanel = !showColumnPanel">
                列配置
              </button>
              <button class="btn btn-secondary" type="button" @click="showChangeLogPanel = !showChangeLogPanel">
                变更日志
              </button>
              <button v-if="selectedItems.length > 0 && editableFields.length && !isReadOnlyTab" class="btn btn-secondary" type="button" @click="showBatchEditPanel = !showBatchEditPanel">
                批量编辑 ({{ selectedItems.length }})
              </button>
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
                导出当前表
              </button>
              <button class="btn btn-secondary" :disabled="isExportingBackup" @click="exportBackupData">
                <Database :size="16" />
                {{ isExportingBackup ? '备份中' : '备份全部' }}
              </button>
      <div v-if="isBackupExporting" class="backup-progress-overlay">
        <div class="backup-progress-panel">
          <div class="backup-progress-header">数据备份导出中...</div>
          <div class="backup-progress-bar-track">
            <div class="backup-progress-bar-fill" :style="{ width: backupProgress + '%' }"></div>
          </div>
          <div class="backup-progress-text">{{ backupProgressText }}</div>
          <button class="btn btn-secondary btn-sm" @click="cancelBackupExport">取消</button>
        </div>
      </div>
              <button v-if="isLotteryOpsTab" class="btn btn-secondary" :disabled="lotteryDueDrawPending" @click="runDueLotteryDraws">
                <RefreshCw :size="16" :class="{ spinning: lotteryDueDrawPending }" />
                执行到期开奖
              </button>
            </div>
          </div>

          <div class="table-mini-stats">
            <div v-for="item in tableMiniStats" :key="item.label" class="table-mini-stat">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              新增数据
            </button>
          </div>

          <!-- 移动端卡片 -->
          <div v-if="isMobileView" class="mobile-card-list">
            <div v-for="item in paginatedData" :key="item.id || getRowIdentity(item)" class="mobile-card" :class="{ selected: isSelected(item), anomaly: isAnomalyRow(item) }">
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
                <button class="mobile-action-btn edit" @click="openEditModal(item)" aria-label="编辑">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button v-if="!isProfileDerivedTab && !isReadOnlyTab" class="mobile-action-btn delete" @click="deleteItem(item)" aria-label="删除">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
          <!-- 数据表格 -->
          <div v-else style="position: relative;">
            <div v-if="isFilterLoading" class="filter-loading-overlay">
              <div class="filter-loading-shimmer"></div>
            </div>
            <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="checkbox-col">
                    <label class="checkbox-wrapper">
                      <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
                      <span class="checkmark"></span>
                    </label>
                  </th>
                  <th v-for="col in visibleCurrentColumns" :key="col.key" :class="{ sortable: col.sortable }"
                    @click="col.sortable && sortBy(col.key)">
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
                  :class="{ selected: isSelected(item), anomaly: isAnomalyRow(item) }">
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
                        :class="`badge-${getBadgeType(item[col.key])}`"
                        @dblclick="startInlineEdit(item, col)"
                      >
                        {{ item[col.key] || '-' }}
                      </span>
                    </template>
                    <template v-else-if="col.type === 'tags'">
                      <div class="cell-tags">
                        <span v-for="tag in getTags(item[col.key])" :key="tag" class="tag">{{ tag }}</span>
                      </div>
                    </template>
                    <template v-else-if="col.type === 'price'">
                      <span class="cell-price" @dblclick="startInlineEdit(item, col)">{{ item[col.key] || '-' }}</span>
                    </template>
                    <template v-else-if="col.type === 'date'">
                      <span class="cell-date" @dblclick="startInlineEdit(item, col)">{{ formatDate(item[col.key]) }}</span>
                    </template>
                    <template v-else-if="col.type === 'datetime'">
                      <span class="cell-date" @dblclick="startInlineEdit(item, col)">{{ formatDateTime(item[col.key]) }}</span>
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
                        :title="`${item[col.key] || ''}${isAnomalyRow(item) && col.key === visibleCurrentColumns[0]?.key ? ` · ${getAnomalyReason(item)}` : ''}`"
                        @dblclick="startInlineEdit(item, col)"
                        v-html="highlightCellValue(item[col.key], col.maxLength)"
                      ></span>
                    </template>
                  </td>
                  <td v-if="hasActionColumn" class="actions-col">
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
              </TransitionGroup>
            </table>
          </div>
          </div>

          <!-- 分页 -->
          <div v-if="totalRecordCount > 0" class="dm-pagination">
            <div class="dm-pagination-info">
              显示 {{ (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, totalRecordCount) }}
              条，共 {{ totalRecordCount }} 条
            </div>
            <div class="dm-pagination-controls">
              <button class="dm-page-btn" :disabled="currentPage === 1" aria-label="上一页" @click="currentPage--">
                上一页
              </button>
              <div class="dm-page-numbers">
                <button v-for="page in visiblePages" :key="page" class="dm-page-number"
                  :class="{ active: currentPage === page }" aria-label="第 {{ page }} 页" @click="currentPage = page">
                  {{ page }}
                </button>
              </div>
              <button class="dm-page-btn" :disabled="currentPage === totalPages" aria-label="下一页" @click="currentPage++">
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
          <button v-if="isMobileView && !isModerationTab && canCreateCurrentTab" class="fab-button" @click="openEditModal()" aria-label="新增">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
          </section>
        </div>
      </main>
    </div>

    <EditDrawer
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
      :gift-address-bundle-text="giftAddressBundleText"
      :uploading-image-fields="uploadingImageFields"
      :user-picker-loading="userPickerLoading"
      :is-field-disabled="isFieldDisabled"
      :is-image-upload-pending="isImageUploadPending"
      :has-prev-record="editDrawerNav.hasPrev"
      :has-next-record="editDrawerNav.hasNext"
      :record-nav-label="editDrawerNav.label"
      @close="closeModal"
      @save="saveData"
      @prev-record="navigateEditRecord(-1)"
      @next-record="navigateEditRecord(1)"
      @regenerate-id="regenerateAutoIdForCurrentTab"
      @regenerate-news-id="regenerateNewsId"
      @inject-news-template="injectNewsTemplate"
      @generate-excerpt="generateExcerptFromContent"
      @copy-gift-address="copyGiftAddressBundle"
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
    />

    <!-- 全局提示 -->
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
        <button v-if="toast.type === 'error'" class="toast-dismiss" @click="dismissToast" aria-label="关闭提示">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
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
  Database,
  FileText,
  Gauge,
  Home,
  Image,
  KeyRound,
  MessageSquare,
  Network,
  RefreshCw,
  Settings,
  ShieldCheck,
  Server,
  Users
} from 'lucide-vue-next';
import AdminHeader from './components/AdminHeader.vue';
import AdminOverview from './components/AdminOverview.vue';
import AdminSidebar from './components/AdminSidebar.vue';
import ApiKeyConsole from './components/ApiKeyConsole.vue';
import ModelRouting from './components/ModelRouting.vue';
import EditDrawer from './components/EditDrawer.vue';
import { getImageUrl } from '../../utils/asset-helper';
import { supabase } from '@/utils/supabase-client.js';
import { invalidateByTags } from '@/utils/request-core.js';
import {
  isCloudinaryNoteUploadConfigured,
  uploadImageToCloudinary
} from '@/utils/cloudinary-client.js';
import { getExpiredActiveGiftIds, markGiftsAsHistory } from '@/utils/gift-archive.js';
import { getDefaultApiUrlForBohaiProvider } from '@/utils/api/bohai-model-config-api.js';
import { logger } from '@/utils/logger.js';
import {
  ADMIN_PAGE_META,
  NEWS_CATEGORY_VALUES,
  PRODUCT_CATEGORY_OPTIONS,
  SUBSCRIPTION_PLAN_NAMES,
  TABS_KEEP_ID_ON_INSERT,
  TAB_WRITABLE_FIELDS,
  dataConfig,
  invalidateProductsCache,
  tabGroups,
  tabs
} from './config.js';
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
  validateDateString
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
import { SAVE_STRATEGIES } from './config/saveStrategies.js';
import { setupDataAdminLifecycle } from './composables/useDataAdminLifecycle.js';

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
const currentTab = ref('users');
const isLoading = ref(false);
const isFilterLoading = ref(false);
const isRefreshing = ref(false);
const hasLoadedOnce = ref(false);
const isSaving = ref(false);
const isExportingBackup = ref(false);
const isBackupExporting = ref(false);
const backupProgress = ref(0);
const backupProgressText = ref('');
let backupAbortController = null;
let cancelBackupExport = () => {};
const showModal = ref(false);
const showUserPickerModal = ref(false);
const showGlobalSearchPanel = ref(false);
const showAdvancedFilterPanel = ref(false);
const showColumnPanel = ref(false);
const showBatchEditPanel = ref(false);
const showChangeLogPanel = ref(false);
const showFilterBar = ref(false);
const isEditing = ref(false);
const editingItem = ref({});
const editingOriginalItem = ref(null);
const jsonBuffers = ref({});
const fieldErrors = reactive({});
const searchQuery = ref('');
const globalSearchQuery = ref('');
const globalSearchResults = ref([]);
const isGlobalSearching = ref(false);
const statusFilter = ref('');
const dateFromFilter = ref('');
const dateToFilter = ref('');
const advancedFilterRules = ref([]);
const activeTabGroupId = ref(tabGroups[0]?.id || 'people');
const userPickerKeyword = ref('');
const selectedItems = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const sortKey = ref('');
const sortOrder = ref('asc');
const isAdminSidebarOpen = ref(false);
const routeAdminSection = router.currentRoute.value?.meta?.adminSection;
const activeAdminSection = ref(typeof routeAdminSection === 'string' && routeAdminSection ? routeAdminSection : 'overview');
const isDataTreeCollapsed = ref(false);
const isMobileView = ref(window.innerWidth < 768);
const handleResize = () => { isMobileView.value = window.innerWidth < 768; };

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

// 提示消息
const toast = reactive({
  show: false,
  message: '',
  type: 'info',
  timer: null
});

let toastTimer = null;
const showToast = (message, type = 'info') => {
  if (toastTimer) clearTimeout(toastTimer);
  if (toast.timer) clearTimeout(toast.timer);
  toast.message = message;
  toast.type = type;
  toast.show = true;
  if (type !== 'error') {
    toastTimer = setTimeout(() => {
      toast.show = false;
      toastTimer = null;
    }, 3000);
  }
};
const dismissToast = () => {
  if (toastTimer) clearTimeout(toastTimer);
  toast.show = false;
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
const currentConfig = computed(() => dataConfig[currentTab.value]);
const currentColumns = computed(() => currentConfig.value?.columns || []);
const currentFields = computed(() => currentConfig.value?.fields || []);
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
    && !['json', 'tags', 'specifications', 'image', 'user-picker', 'textarea'].includes(field.type)
  );
});
const inlineEditableFieldKeys = computed(() => new Set(
  editableFields.value
    .filter((field) => ['select', 'number', 'text', 'email', 'date', 'datetime'].includes(field.type))
    .map((field) => field.key)
));
const currentTabLabel = computed(() => tabs.find(t => t.id === currentTab.value)?.label || '');
const currentTabGroup = computed(() =>
  tabGroups.find((group) => group.tabIds.includes(currentTab.value)) || tabGroups[0]
);
const tabGroupsWithCounts = computed(() =>
  tabGroups.map((group) => ({
    ...group,
    count: group.tabIds.reduce((total, tabId) => total + getTabCount(tabId), 0)
  }))
);
const isNewsTab = computed(() => currentTab.value === 'news');
const isCurrentUserAdmin = computed(() => String(userInfo.value?.role || '').trim() === 'admin');
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
  };

  return configMap[currentTab.value] || null;
});
const isModerationTab = computed(() => Boolean(moderationTabConfig.value));
const hasActionColumn = computed(() =>
  isModerationTab.value ||
  currentTab.value === 'lotteries' ||
  !isReadOnlyTab.value
);
const isRejectedModerationTab = computed(() => ['reviewPosts', 'reviewComments'].includes(currentTab.value));
const isMessageModerationTab = computed(() => currentTab.value === 'reviewComments');
const isReportedPostModerationTab = computed(() => currentTab.value === 'reportedPosts');
const lotteryActionPendingIds = ref([]);

const isDataConsoleSection = computed(() => DATA_CONSOLE_SECTIONS.has(activeAdminSection.value));
const isPlaceholderAdminSection = computed(() => PLACEHOLDER_ADMIN_SECTIONS.has(activeAdminSection.value));
const isApiKeysSection = computed(() => activeAdminSection.value === 'api-keys');
const isModelRoutingSection = computed(() => activeAdminSection.value === 'model-routing');
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
const anomalyRows = computed(() => currentData.value.filter((item) => isAnomalyRow(item)));
const tableMiniStats = computed(() => [
  { label: '当前页', value: currentData.value.length },
  { label: '已选中', value: selectedItems.value.length },
  { label: '异常', value: anomalyRows.value.length },
  { label: '列显示', value: `${visibleCurrentColumns.value.length}/${currentColumns.value.length}` }
]);

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
  ['reportedPosts', 'reviewPosts', 'reviewComments']
    .reduce((total, tabId) => total + getTabCount(tabId), 0)
);
const adminNavigation = computed(() => [
  { id: 'overview', label: '概览', icon: Home, active: activeAdminSection.value === 'overview' },
  { id: 'data', label: '数据管理', icon: Database, active: activeAdminSection.value === 'data', badge: dataConsoleTotalCount.value || '' },
  { id: 'api-keys', label: 'API Key 管理', icon: KeyRound, active: activeAdminSection.value === 'api-keys' },
  { id: 'model-routing', label: '模型路由', icon: Network, active: activeAdminSection.value === 'model-routing' },
  { id: 'media', label: '媒体资源', icon: Image, active: activeAdminSection.value === 'media' },
  { id: 'settings', label: '网站设置', icon: Settings, active: activeAdminSection.value === 'settings' }
]);

const currentAdminPageMeta = computed(() => ADMIN_PAGE_META[activeAdminSection.value] || ADMIN_PAGE_META.overview);
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
      { label: '中奖通知', value: getTabCount('lotteryNotificationJobs'), tab: 'lotteryNotificationJobs', icon: MessageSquare, section: 'data' },
      { label: '管理员权限', value: isCurrentUserAdmin.value ? 'Admin' : '受限', tab: 'users', icon: ShieldCheck, section: 'data' }
    ];
  }
  return [];
});
const currentAdminPageMetrics = computed(() => {
  const section = activeAdminSection.value;
  if (section === 'data') {
    return [
      { label: '当前分组', value: currentTabGroup.value?.label || '用户' },
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
      { label: '通知任务', value: getTabCount('lotteryNotificationJobs') },
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
    id: 'lottery-risk',
    tab: 'lotteryJoinAttempts',
    title: '报名风控',
    description: '抽奖报名尝试记录',
    count: getTabCount('lotteryJoinAttempts'),
    tone: 'info'
  },
  {
    id: 'lottery-notifications',
    tab: 'lotteryNotificationJobs',
    title: '中奖通知',
    description: '待发送或失败通知任务',
    count: getTabCount('lotteryNotificationJobs'),
    tone: getTabCount('lotteryNotificationJobs') > 0 ? 'warning' : 'success'
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
  if (item.id === 'data' && activeAdminSection.value === 'data') {
    isDataTreeCollapsed.value = !isDataTreeCollapsed.value;
    return;
  }
  activeAdminSection.value = item.id;
  if (item.id === 'data') {
    isDataTreeCollapsed.value = false;
  }
  const routeMap = {
    overview: '/admin/data-management',
    'api-keys': '/admin/api-keys',
    'model-routing': '/admin/model-routing',
    data: '/admin/data-management',
    media: '/admin/data-management',
    settings: '/admin/data-management'
  };
  const target = routeMap[item.id];
  if (target && router.currentRoute.value.path !== target) {
    router.push(target);
  }
  const defaultTab = ADMIN_SECTION_DEFAULT_TABS[item.id];
  if (defaultTab) {
    switchTab(defaultTab);
  }
  isAdminSidebarOpen.value = false;
};

const getTabsByGroup = (group) => {
  const tabIds = new Set(group?.tabIds || []);
  return tabs.filter((tab) => tabIds.has(tab.id));
};



const handleOverviewTabClick = (tabId) => {
  activeAdminSection.value = 'data';
  switchTab(tabId);
};

const handleSidebarTabClick = (tabId) => {
  activeAdminSection.value = 'data';
  isDataTreeCollapsed.value = false;
  switchTab(tabId);
  isAdminSidebarOpen.value = false;
};

const handlePlaceholderAction = (action) => {
  if (action?.route) {
    router.push(action.route);
    return;
  }
  if (action?.section && !action?.tab) {
    activeAdminSection.value = action.section;
    return;
  }
  if (!action?.tab) return;
  activeAdminSection.value = action.section || 'data';
  switchTab(action.tab);
};

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
const dataConsoleTotalCount = computed(() =>
  tabGroups.reduce((groupTotal, group) =>
    groupTotal + group.tabIds.reduce((tabTotal, tabId) => tabTotal + getTabCount(tabId), 0),
  0)
);
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

// v-html 输出前用 DOMPurify 清洗(项目硬约束),仅允许 <mark> 高亮标签
const sanitizeHighlightHtml = (html) => DOMPurify.sanitize(String(html || ''), {
  ALLOWED_TAGS: ['mark'],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true
});

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
  clearFieldError
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

const switchTab = (tabId, options = {}) => {
  if (activeAdminSection.value === 'overview' || isPlaceholderAdminSection.value) {
    activeAdminSection.value = 'data';
  }
  currentTab.value = tabId;
  activeTabGroupId.value = currentTabGroup.value?.id || activeTabGroupId.value;
  isDataTreeCollapsed.value = false;
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  selectedItems.value = [];
  searchQuery.value = options.search || '';
  resetFiltersForTab();
  userPickerKeyword.value = '';
  showUserPickerModal.value = false;
  sortKey.value = '';
  clearFieldErrors();
  fetchTabData(tabId, { useCache: true });
  if (lotteryOpsTabs.has(tabId)) {
    loadLotterySchedulerStatus();
  }
};

// ==================== 第二阶段 Composable 工厂注入 ====================
// 所有工厂通过解构直接注入, 不再使用前向声明 + 延迟赋值模式

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
    logger.error('data-admin', '复制地址失败:', error);
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

const toggleAdminTheme = () => {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const page = document.querySelector('.data-management-page');
  if (page) {
    page.classList.toggle('dark', !isDark);
  }
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
      if (data) openEditModal(data);
    } catch (error) {
      logger.warn('data-admin', '快速编辑获取记录失败:', error);
      showToast('获取记录失败', 'error');
    }
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

let globalSearchAbortController = null;

const runGlobalSearch = async () => {
  if (globalSearchAbortController) {
    globalSearchAbortController.abort();
  }
  globalSearchAbortController = new AbortController();
  const signal = globalSearchAbortController.signal;

  const keyword = sanitizeSearchTerm(globalSearchQuery.value || searchQuery.value);
  if (!keyword) {
    showToast('请输入跨表搜索关键词', 'error');
    return;
  }

  isGlobalSearching.value = true;
  showGlobalSearchPanel.value = true;
  globalSearchResults.value = [];

  try {
    const tasks = tabs.map(async (tab) => {
      if (signal.aborted) return [];
      const table = dataConfig[tab.id]?.table;
      const selectColumns = TAB_SELECT_COLUMNS[tab.id];
      const filters = buildSearchFiltersUtil(tab.id, keyword, TAB_SEARCH_FIELDS);
      if (!table || !selectColumns || filters.length === 0) return [];

      let query = supabase
        .from(table)
        .select(selectColumns, { signal })
        .or(filters.join(','))
        .limit(5);

      if (tab.id === 'reportedPosts') query = query.eq('status', 'limited');
      if (tab.id === 'reviewPosts') query = query.ilike('status', 'rejected');
      if (tab.id === 'reviewComments') query = query.ilike('status', 'rejected');

      const { data, error } = await query;
      if (error) {
        logger.warn('data-admin', `跨表搜索 ${tab.id} 失败:`, error);
        return [];
      }

      return (Array.isArray(data) ? data : []).map((row) => {
        const previewFields = getSearchablePreviewFieldsUtil(tab.id, dataConfig, TAB_SEARCH_FIELDS);
        const preview = previewFields
          .map((field) => row?.[field])
          .find((value) => String(value || '').toLowerCase().includes(keyword.toLowerCase()))
          || row.title
          || row.username
          || row.email
          || row.content
          || row.id;
        return {
          tabId: tab.id,
          tabLabel: tab.label,
          id: row.id,
          title: String(row.title || row.username || row.email || row.plan_name || row.prize_title || row.gift_content || row.id || '').slice(0, 80),
          preview: String(preview || '').slice(0, 160),
          row
        };
      });
    });

    const settled = await Promise.allSettled(tasks);
    if (signal.aborted) return;
    globalSearchResults.value = settled.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : []);
    showToast(globalSearchResults.value.length ? `跨表搜索完成，命中 ${globalSearchResults.value.length} 条` : '没有找到跨表结果', globalSearchResults.value.length ? 'success' : 'info');
  } catch (error) {
    logger.error('data-admin', '跨表搜索失败:', error);
    showToast('跨表搜索失败: ' + buildActionErrorMessage(error, '跨表搜索失败'), 'error');
  } finally {
    isGlobalSearching.value = false;
  }
};

const openGlobalSearchResult = (result) => {
  if (!result?.tabId) return;
  addRecentRecord(result.row || { id: result.id, title: result.title }, result.tabId);
  switchTab(result.tabId, { search: String(result.id || globalSearchQuery.value) });
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

const getTabFetchCacheKey = (tabId = currentTab.value) => JSON.stringify({
  tabId,
  page: currentPage.value,
  pageSize: pageSize.value,
  search: searchQuery.value,
  status: statusFilter.value,
  dateFrom: dateFromFilter.value,
  dateTo: dateToFilter.value,
  sortKey: sortKey.value,
  sortOrder: sortOrder.value
});

const clearTabFetchCache = (tabId = '') => {
  Object.keys(tabFetchCache).forEach((key) => {
    if (!tabId || key.includes(`"tabId":"${tabId}"`)) {
      delete tabFetchCache[key];
    }
  });
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
    forum: fetchCount('posts'),
    reportedPosts: fetchCount('posts', (query) => query.eq('status', 'limited')),
    reviewPosts: fetchCount('posts', (query) => query.ilike('status', 'rejected')),
    reviewComments: fetchCount('comments', (query) => query.ilike('status', 'rejected')),
    coreMemories: fetchCount('boh_ai_core_memories'),
    bohaiModels: fetchCount('bohai_model_configs'),
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
      logger.warn('data-admin', '获取数据管理统计失败:', entry.reason);
      return;
    }
    const [key, value] = entry.value;
    fallbackCounts[key] = value;
  });

  applyCountMap(fallbackCounts);
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
      allowedAdvancedFields: (currentColumns.value || []).map((c) => c.key)
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
        allowedAdvancedFields: (currentColumns.value || []).map((c) => c.key)
      })));
    }

    if (fetchId !== activeFetchId.value) return;
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const offset = Math.max(0, ((Number(currentPage.value) || 1) - 1) * (Number(pageSize.value) || 20));

    if (tabId === 'users' || tabId === 'points') {
      // 修复: 不再把 users 数据复用到 points(或反之),
      // 避免积分页面的 count 永远等于用户总数
      assignTabRows(tabId, rows, count);
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
            if (archiveError) logger.warn('data-admin', '自动归档过期礼物失败:', archiveError);
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
    isLotteryOpsTab.value ? loadLotterySchedulerStatus() : Promise.resolve()
  ]);
};

const startAutoRefresh = () => {
  stopAutoRefresh();
  secondsUntilRefresh.value = 30;
  autoRefreshInterval.value = setInterval(() => {
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
  if (section === 'overview') {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

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
  clearTabFetchCache(currentTab.value);
  await fetchTabData(currentTab.value);
  lastRefreshedAt.value = new Date().toISOString();
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
  approveModerationItem,
  rejectModerationItem,
  keepLimitedModerationItem,
  deleteModerationItem,
  applyModerationAction,
  updateModerationStatus,
  deleteModerationTarget,
  saveModerationLog,
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
  switchTab
});

const refreshAllData = async () => {
  isRefreshing.value = true;
  clearTabFetchCache();
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
      logger.warn('data-admin', '获取抽奖定时任务状态失败:', error);
    }
  } finally {
    lotterySchedulerStatusLoading.value = false;
  }
};

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

const toISOStringFromInput = (dateInput) => {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

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

const openEditModal = async (item = null) => {
  try {
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
    nextTick(maybeRestoreDraft);
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
    logger.warn('data-admin', '加载用户选择器失败:', error);
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
    const strategy = SAVE_STRATEGIES[currentTab.value];
    if (!strategy) {
      showToast(`暂不支持保存 ${currentTabLabel.value}`, 'error');
      isSaving.value = false;
      return;
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
      return;
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
      addChangeLogEntry('update', editingItem.value, {
        diffs: getPayloadDiffs(editingOriginalItem.value || {}, dataToSave).slice(0, 20)
      });
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
      addChangeLogEntry('create', { id: dataToSave.id || editingItem.value.id || '' }, {
        fields: Object.keys(dataToSave)
      });
      showToast('数据添加成功', 'success');
    }

    clearCurrentDraft();
    await refreshCurrentViewAfterMutation();
    await closeModal({ askDraft: false });
  } catch (error) {
    logger.error('data-admin', '保存失败:', error);
    showToast('保存失败: ' + buildActionErrorMessage(error, '保存失败'), 'error');
  } finally {
    isSaving.value = false;
  }
};

// 第二阶段: 所有 mutations (deleteItem / drawLotteryNow / approveModerationItem / batchDelete 等)
// 已迁移至 composables/useDataAdminMutations.js (createMutationsCenter 工厂)
// 工厂在 refreshCurrentViewAfterMutation 之后注入, 上述 let 变量会被重新赋值为真实函数
// 这里删除内联的重复实现, 避免命名冲突与重复定义

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

const BADGE_STATUS_MAP = {
  active: 'success',
  inactive: 'warning',
  banned: 'danger',
  trialing: 'info',
  active_trial: 'info',
  past_due: 'warning',
  canceled: 'muted',
  expired: 'muted',
  completed: 'success',
  pending: 'warning',
  shipped: 'info',
  received: 'success',
  approved: 'success',
  pending_review: 'warning',
  rejected: 'danger',
  draft: 'warning',
  published: 'success',
  archived: 'muted',
  in_stock: 'success',
  low_stock: 'warning',
  out_of_stock: 'danger',
  active_draw: 'success',
  closed: 'info',
  cancelled: 'muted',
  paid: 'success',
  pending_payment: 'warning',
  failed: 'danger',
  refunded: 'info',
  true: 'success',
  false: 'muted',
  yes: 'success',
  no: 'muted',
  enabled: 'success',
  disabled: 'muted',
  on: 'success',
  off: 'muted',
  review: 'warning',
  normal: 'success',
  warning: 'warning',
  error: 'danger',
  success: 'success',
  info: 'info',
  muted: 'muted',
  danger: 'danger',
  admin: 'success',
  管理员: 'success',
  '进行中': 'success',
  open: 'success',
  '首页显示': 'success',
  confirmed: 'success',
  fulfilled: 'success',
  joined: 'success',
  sent: 'success',
  准点: 'success',
  '定时任务': 'success',
  '当前礼物': 'success',
  'current gift': 'success',
  delivered: 'success',
  signed: 'success',
  drawn: 'success',
  user: 'info',
  '普通用户': 'info',
  upcoming: 'info',
  '即将开始': 'info',
  manual_admin: 'info',
  '手动补跑': 'info',
  '未开奖': 'info',
  processing: 'info',
  '处理中': 'info',
  '历史礼物': 'warning',
  'history gift': 'warning',
  '已隐藏': 'warning',
  pending_contact: 'warning',
  rate_limited: 'warning',
  already_joined: 'warning',
  running: 'warning',
  partial_failure: 'warning',
  '待调度': 'warning',
  ended: 'warning',
  '已结束': 'warning',
  voided: 'warning',
  entry_closed: 'warning',
  not_open: 'warning',
  full: 'warning',
  account_too_new: 'warning',
  limited: 'warning',
  preparing: 'warning',
  '封禁': 'danger',
  not_found: 'danger',
  profile_not_found: 'danger',
  reject: 'danger'
};

const getBadgeType = (val) => {
  if (val == null || val === '') return 'muted';
  const key = String(val).toLowerCase();
  if (key.startsWith('延迟')) return 'warning';
  return BADGE_STATUS_MAP[key] || 'info';
};

const getTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.slice(0, 3);
  return [String(value)];
};

const getHighlightKeyword = () => sanitizeSearchTerm(searchQuery.value || globalSearchQuery.value);

const highlightCellValue = (value, maxLength) => {
  const display = formatCellValue(value, maxLength);
  const escaped = escapeHtml(display);
  const keyword = getHighlightKeyword();
  if (!keyword || display === '-') return escaped;
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 用 DOMPurify 二次清洗(项目硬约束),只允许 <mark>
  return sanitizeHighlightHtml(escaped.replace(new RegExp(`(${safeKeyword})`, 'ig'), '<mark>$1</mark>'));
};

const getRelatedJump = (col, item) => {
  const key = String(col?.key || '');
  const value = item?.[key];
  if (!value) return null;
  const relationMap = {
    user_id: 'users',
    author_id: 'users',
    sender_id: 'users',
    receiver_id: 'users',
    winner_user_id: 'users',
    drawn_by: 'users',
    post_id: 'forum',
    lottery_id: 'lotteries',
    entry_id: 'lotteryEntries',
    winner_entry_id: 'lotteryEntries'
  };
  const targetTab = relationMap[key];
  if (!targetTab || targetTab === currentTab.value) return null;
  return {
    tabId: targetTab,
    search: String(value)
  };
};

const jumpToRelatedRecord = (jump, item) => {
  if (!jump?.tabId) return;
  addRecentRecord(item);
  switchTab(jump.tabId, { search: jump.search });
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

const cancelInlineEdit = () => {
  inlineEditState.rowId = '';
  inlineEditState.fieldKey = '';
  inlineEditState.value = '';
  inlineEditState.saving = false;
};

const isInlineEditing = (item, col) =>
  inlineEditState.rowId === getRowIdentity(item) && inlineEditState.fieldKey === col.key;

const getFieldByKey = (fieldKey) => currentFields.value.find((field) => field.key === fieldKey);

const normalizeQuickEditValue = (field, value) => {
  if (!field) return value;
  if (field.type === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) throw new Error(`${field.label}必须是有效数字`);
    return Math.round(numberValue);
  }
  if (field.type === 'datetime') return toISOStringFromInput(value);
  if (field.type === 'date') return toDateInputValue(value);
  if (field.type === 'select') return value;
  return String(value ?? '').trim();
};

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

const isAnomalyRow = (item) => {
  const now = Date.now();
  if (currentTab.value === 'products') return Number(item?.stock ?? 0) <= 0;
  if (currentTab.value === 'subscriptions') {
    const expiresAt = Date.parse(item?.expires_at || '');
    return String(item?.status || '') === 'expired' || (Number.isFinite(expiresAt) && expiresAt < now);
  }
  if (currentTab.value === 'lotteries') {
    const drawAt = Date.parse(item?.draw_at || '');
    return String(item?.status || '') === 'open' && Number.isFinite(drawAt) && drawAt < now;
  }
  if (['reportedPosts', 'reviewPosts', 'reviewComments'].includes(currentTab.value)) return true;
  if (currentTab.value === 'lotteryNotificationJobs') return ['failed', 'pending'].includes(String(item?.status || ''));
  if (currentTab.value === 'lotteryJoinAttempts') return !['joined', 'success'].includes(String(item?.result_code || ''));
  return false;
};

const getAnomalyReason = (item) => {
  if (!isAnomalyRow(item)) return '';
  if (currentTab.value === 'products') return '库存不足';
  if (currentTab.value === 'subscriptions') return '订阅已过期';
  if (currentTab.value === 'lotteries') return '到期未开奖';
  if (currentTab.value === 'lotteryNotificationJobs') return '通知待处理/失败';
  if (currentTab.value === 'lotteryJoinAttempts') return '报名风控命中';
  return '需要复核';
};

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

    const payload = pickWritableFields(currentTab.value, { [batchEditState.fieldKey]: normalizedValue });
    const { data, error } = await supabase
      .from(currentConfig.value.table)
      .update(payload)
      .in('id', ids)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== ids.length) {
      throw new Error(`批量编辑未完全生效：请求 ${ids.length} 条，实际更新 ${Array.isArray(data) ? data.length : 0} 条`);
    }
    addChangeLogEntry('batch_update', { id: ids.join(',') }, { field: batchEditState.fieldKey, to: normalizedValue, count: ids.length });
    if (currentTab.value === 'products') invalidateProductsCache();
    if (currentTab.value === 'subscriptions') selectedItems.value.forEach((item) => invalidateSubscriptionCache(item?.user_id));
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

const getJsonPreview = (val) => {
  if (!val) return '{}';
  const str = JSON.stringify(val);
  return str.length > 30 ? str.substring(0, 30) + '...' : str;
};

const downloadBlob = (blob, filename) => {
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
};

const exportData = () => {
  const data = currentData.value;
  const columns = visibleCurrentColumns.value;

  const csvContent = [
    columns.map(col => col.label).join(','),
    ...data.map(item => columns.map(col => {
      let val = item[col.key];
      if (typeof val === 'object') val = JSON.stringify(val);
      return `"${String(val || '').replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${currentTab.value}_${new Date().toISOString().split('T')[0]}.csv`);

  showToast('数据导出成功', 'success');
};

const getBackupTableTargets = () => {
  const targets = new Map();
  tabGroups.forEach((group) => {
    group.tabIds.forEach((tabId) => {
      const table = dataConfig[tabId]?.table;
      if (!table || targets.has(table)) return;
      targets.set(table, {
        table,
        sourceTabId: tabId,
        sourceLabel: tabs.find((tab) => tab.id === tabId)?.label || tabId,
        groupId: group.id,
        groupLabel: group.label
      });
    });
  });
  return Array.from(targets.values());
};

const fetchBackupTableRows = async (target) => {
  const batchSize = 1000;
  const rows = [];
  let from = 0;
  let total = null;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error, count } = await supabase
      .from(target.table)
      .select('*', { count: from === 0 ? 'exact' : undefined })
      .range(from, to);

    if (error) throw error;

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (from === 0 && Number.isFinite(Number(count))) {
      total = Number(count);
    }
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return {
    ...target,
    total: total ?? rows.length,
    exported: rows.length,
    rows
  };
};

const exportBackupData = async () => {
  if (isExportingBackup.value) return;

  try {
    assertAdminAction();
    backupAbortController = new AbortController();
    isExportingBackup.value = true;
    isBackupExporting.value = true;
    backupProgress.value = 0;
    backupProgressText.value = '';
    cancelBackupExport = () => {
      backupAbortController?.abort();
      isBackupExporting.value = false;
      isExportingBackup.value = false;
    };
    const exportedAt = new Date().toISOString();
    const targets = getBackupTableTargets();
    const tablesPayload = {};
    const summary = [];
    let done = 0;
    const total = targets.length;

    for (const target of targets) {
      if (backupAbortController?.signal.aborted) {
        showToast('备份已取消', 'info');
        return;
      }
      backupProgress.value = Math.round((done / total) * 100);
      backupProgressText.value = `正在导出 ${target.sourceLabel}... (${done}/${total})`;
      const result = await fetchBackupTableRows(target);
      tablesPayload[result.table] = result.rows;
      summary.push({
        table: result.table,
        sourceTabId: result.sourceTabId,
        sourceLabel: result.sourceLabel,
        groupId: result.groupId,
        groupLabel: result.groupLabel,
        total: result.total,
        exported: result.exported
      });
      done++;
    }

    const backupPayload = {
      type: 'boh-admin-data-backup',
      version: 1,
      exportedAt,
      exportedBy: {
        id: userInfo.value?.id || '',
        username: userInfo.value?.username || '',
        email: userInfo.value?.email || '',
        role: userInfo.value?.role || ''
      },
      summary,
      tables: tablesPayload
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const timestamp = exportedAt.replace(/[:.]/g, '-');
    downloadBlob(blob, `boh-data-backup_${timestamp}.json`);
    showToast(`备份导出成功，共 ${summary.length} 张表`, 'success');

    // 审计: 写入客户端变更日志 + 尝试写入服务端 audit
    addChangeLogEntry('backup_export', null, {
      tables: summary.map((s) => s.table),
      totalRows: summary.reduce((acc, s) => acc + (s.exported || 0), 0),
      note: '备份含 PII,请妥善保管'
    });
    try {
      await supabase.from('admin_audit_log').insert([{
        actor_id: userInfo.value?.id || null,
        action: 'backup_export',
        metadata: {
          tables: summary.map((s) => s.table),
          total_rows: summary.reduce((acc, s) => acc + (s.exported || 0), 0)
        }
      }]);
    } catch (auditErr) {
      logger.warn('data-admin', '备份审计写入失败(忽略):', auditErr);
    }
  } catch (error) {
    logger.error('data-admin', '备份导出失败:', error);
    showToast('备份导出失败: ' + buildActionErrorMessage(error, '备份导出失败'), 'error');
  } finally {
    isBackupExporting.value = false;
    isExportingBackup.value = false;
    backupAbortController = null;
  }
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

// ==================== 键盘快捷键 ====================
const handleGlobalShortcuts = (e) => {
  const tag = e.target.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  // Ctrl+S / Cmd+S → save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if (showModal.value && !isSaving.value) {
      saveData();
    }
    return;
  }

  // Escape → close drawer / close user picker
  if (e.key === 'Escape' && !isEditing) {
    if (showModal.value) {
      closeModal();
    }
    return;
  }

  // / → focus global search
  if (e.key === '/' && !isEditing) {
    e.preventDefault();
    const searchInput = document.querySelector('.search-box input');
    if (searchInput) searchInput.focus();
    return;
  }

  // n → new record (when not editing)
  if (e.key === 'n' && !isEditing && !e.ctrlKey && !e.metaKey) {
    if (canCreateCurrentTab.value && activeAdminSection.value === 'data') {
      openEditModal();
    }
    return;
  }

  // ← / → → navigate records in drawer
  if (showModal.value && isEditing.value) {
    if (e.key === 'ArrowLeft' && editDrawerNav.value.hasPrev) {
      e.preventDefault();
      navigateEditRecord(-1);
      return;
    }
    if (e.key === 'ArrowRight' && editDrawerNav.value.hasNext) {
      e.preventDefault();
      navigateEditRecord(1);
      return;
    }
  }
};

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

onMounted(() => {
  window.addEventListener('resize', handleResize);
  document.addEventListener('keydown', handleGlobalShortcuts);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});
onUnmounted(() => {
  stopAutoRefresh();
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('keydown', handleGlobalShortcuts);
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

</script>

<style scoped>
@import './styles/base.css';
@import './styles/console.css';
@import './styles/responsive.css';
</style>

<style>
@import './styles/overlays.css';
</style>
