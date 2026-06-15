<template>
  <div class="data-management-page">
    <UnifiedNavbar />

    <div class="admin-shell">
      <AdminSidebar
        :active-admin-section="activeAdminSection"
        :active-tab-group-id="activeTabGroupId"
        :current-tab="currentTab"
        :get-tab-count="getTabCount"
        :get-tabs-by-group="getTabsByGroup"
        :is-data-tree-collapsed="isDataTreeCollapsed"
        :is-group-collapsed="isSidebarGroupCollapsed"
        :is-open="isAdminSidebarOpen"
        :navigation="adminNavigation"
        :pinned-tabs="currentPinnedTabs"
        :recent-records="recentRecordsForSidebar"
        :tab-groups="tabGroupsWithCounts"
        @group-click="handleSidebarGroupClick"
        @nav-click="handleAdminNavClick"
        @recent-click="jumpToRecentRecord"
        @tab-click="handleSidebarTabClick"
      />

      <div v-if="isAdminSidebarOpen" class="sidebar-scrim" @click="isAdminSidebarOpen = false"></div>

      <main class="admin-main">
        <AdminHeader
          :can-create="isDataConsoleSection && !isModerationTab && canCreateCurrentTab"
          :is-refreshing="isRefreshing"
          @back="goBack"
          @create="openEditModal()"
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
            :recent-activity-items="recentActivityItems"
            :site-health-cards="siteHealthCards"
            :stats-cards="statsCards"
            :table-summary-cards="tableSummaryCards"
            :total-record-count="totalRecordCount"
            @select-tab="switchTab"
          />

          <section v-if="activeAdminSection !== 'overview'" class="admin-section-hero">
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
        <div class="tabs-header">
          <div class="tabs-actions">
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
                  <th v-for="col in visibleCurrentColumns" :key="col.key" :class="{ sortable: col.sortable }"
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
                    <img :src="getImageUrl(editingItem[field.key])" alt="Preview"  loading="lazy" />
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
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
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
  RefreshCw,
  Settings,
  ShieldCheck,
  Server,
  Users
} from 'lucide-vue-next';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';
import AdminHeader from './components/AdminHeader.vue';
import AdminOverview from './components/AdminOverview.vue';
import AdminSidebar from './components/AdminSidebar.vue';
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
const isExportingBackup = ref(false);
const showModal = ref(false);
const showUserPickerModal = ref(false);
const showGlobalSearchPanel = ref(false);
const showAdvancedFilterPanel = ref(false);
const showColumnPanel = ref(false);
const showBatchEditPanel = ref(false);
const showChangeLogPanel = ref(false);
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
const activeAdminSection = ref('overview');
const isDataTreeCollapsed = ref(false);
const collapsedSidebarGroupIds = ref([]);
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
    toast.timer = null;
  }, 3000);
};

const STORAGE_KEYS = {
  columns: 'boh-admin-table-columns-v1',
  savedViews: 'boh-admin-saved-filter-views-v1',
  pinnedTabs: 'boh-admin-pinned-tabs-v1',
  recentRecords: 'boh-admin-recent-records-v1',
  changeLog: 'boh-admin-change-log-v1',
  drafts: 'boh-admin-edit-drafts-v1'
};

const readLocalJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    logger.warn('data-admin', '读取本地配置失败:', key, error);
    return fallback;
  }
};

const writeLocalJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logger.warn('data-admin', '写入本地配置失败:', key, error);
  }
};

const hydrateEditorPreferences = () => {
  columnSettings.value = readLocalJson(STORAGE_KEYS.columns, {});
  savedFilterViews.value = readLocalJson(STORAGE_KEYS.savedViews, {});
  pinnedTabIds.value = readLocalJson(STORAGE_KEYS.pinnedTabs, []);
  recentRecords.value = readLocalJson(STORAGE_KEYS.recentRecords, []);
  changeLogEntries.value = readLocalJson(STORAGE_KEYS.changeLog, []);
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
  };

  return configMap[currentTab.value] || null;
});
const isModerationTab = computed(() => Boolean(moderationTabConfig.value));
const isRejectedModerationTab = computed(() => ['reviewPosts', 'reviewComments'].includes(currentTab.value));
const isMessageModerationTab = computed(() => false);
const isReportedPostModerationTab = computed(() => currentTab.value === 'reportedPosts');
const lotteryActionPendingIds = ref([]);

const isDataConsoleSection = computed(() => DATA_CONSOLE_SECTIONS.has(activeAdminSection.value));
const isPlaceholderAdminSection = computed(() => PLACEHOLDER_ADMIN_SECTIONS.has(activeAdminSection.value));
const currentStatusFilterField = computed(() => STATUS_FILTER_FIELDS[currentTab.value] || '');
const currentDateFilterField = computed(() => DATE_FILTER_FIELDS[currentTab.value] || '');
const statusFilterOptions = computed(() => {
  const field = currentStatusFilterField.value;
  if (!field) return [];

  const configuredField = currentFields.value.find((item) => item.key === field);
  if (Array.isArray(configuredField?.options)) {
    return configuredField.options.map((item) => ({
      value: item.value,
      label: item.label
    }));
  }

  const values = new Map();
  (currentData.value || []).forEach((row) => {
    const raw = row?.[field];
    if (raw === null || raw === undefined || raw === '') return;
    const key = String(raw);
    values.set(key, { value: raw, label: key });
  });
  return [...values.values()].slice(0, 12);
});
const hasActiveFilters = computed(() =>
  Boolean(searchQuery.value.trim() || statusFilter.value || dateFromFilter.value || dateToFilter.value || activeAdvancedRules.value.length)
);
const activeAdvancedRules = computed(() =>
  advancedFilterRules.value.filter((rule) =>
    String(rule.field || '').trim()
    && String(rule.operator || '').trim()
    && rule.value !== undefined
    && rule.value !== null
    && String(rule.value).trim() !== ''
  )
);
const activeFilterSummary = computed(() => {
  const parts = [];
  if (searchQuery.value.trim()) parts.push(`关键词「${searchQuery.value.trim()}」`);
  if (statusFilter.value) parts.push(`状态 ${statusFilterLabel.value}`);
  if (dateFromFilter.value || dateToFilter.value) {
    parts.push(`${currentDateFilterLabel.value}${dateFromFilter.value || '最早'} - ${dateToFilter.value || '现在'}`);
  }
  if (activeAdvancedRules.value.length) parts.push(`${activeAdvancedRules.value.length} 个高级条件`);
  return parts.length ? `已应用 ${parts.join('、')}` : '未应用筛选';
});
const statusFilterLabel = computed(() => {
  if (!statusFilter.value) return '';
  return statusFilterOptions.value.find((item) => String(item.value) === String(statusFilter.value))?.label || statusFilter.value;
});
const currentDateFilterLabel = computed(() => {
  const field = currentColumns.value.find((item) => item.key === currentDateFilterField.value)
    || currentFields.value.find((item) => item.key === currentDateFilterField.value);
  return field?.label || '日期';
});
const lastRefreshLabel = computed(() =>
  lastRefreshedAt.value ? `刷新于 ${formatDateTime(lastRefreshedAt.value)}` : '尚未刷新'
);
const currentSavedViews = computed(() => savedFilterViews.value[currentTab.value] || []);
const currentPinnedTabs = computed(() => {
  const pinned = new Set(pinnedTabIds.value);
  return tabs.filter((tab) => pinned.has(tab.id));
});
const recentRecordsForSidebar = computed(() => recentRecords.value.slice(0, 8));
const currentChangeLogEntries = computed(() =>
  changeLogEntries.value
    .filter((entry) => !entry.tabId || entry.tabId === currentTab.value)
    .slice(0, 30)
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
      { label: 'API Key 管理', value: 'Vault', route: '/admin/api-keys', icon: KeyRound },
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

const siteHealthCards = computed(() => [
  { label: '环境', value: 'Production', icon: Server },
  { label: '权限', value: isCurrentUserAdmin.value ? 'Admin' : '受限', icon: ShieldCheck },
  { label: '健康度', value: `${healthScore.value}%`, icon: Gauge },
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

const isSidebarGroupCollapsed = (groupId) => collapsedSidebarGroupIds.value.includes(groupId);

const toggleSidebarGroupCollapsed = (groupId) => {
  if (isSidebarGroupCollapsed(groupId)) {
    collapsedSidebarGroupIds.value = collapsedSidebarGroupIds.value.filter((id) => id !== groupId);
    return;
  }
  collapsedSidebarGroupIds.value = [...collapsedSidebarGroupIds.value, groupId];
};

const ensureSidebarGroupExpanded = (groupId) => {
  collapsedSidebarGroupIds.value = collapsedSidebarGroupIds.value.filter((id) => id !== groupId);
};

const handleSidebarGroupClick = (group) => {
  activeAdminSection.value = 'data';
  isDataTreeCollapsed.value = false;
  if (activeTabGroupId.value === group.id) {
    toggleSidebarGroupCollapsed(group.id);
    return;
  }
  ensureSidebarGroupExpanded(group.id);
  setActiveTabGroup(group.id);
  isAdminSidebarOpen.value = false;
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
  if (!action?.tab) return;
  activeAdminSection.value = action.section || 'data';
  switchTab(action.tab);
};

// 统计卡片
const statsCards = computed(() => [
  { id: 'users', type: 'users', icon: Users, label: '总用户数', value: stats.totalUsers, trend: 12 },
  { id: 'subscriptions', type: 'products', icon: ShieldCheck, label: '有效订阅', value: stats.totalSubscriptions, trend: 0 },
  { id: 'posts', type: 'posts', icon: MessageSquare, label: '论坛帖子', value: stats.totalPosts, trend: 8 },
  { id: 'news', type: 'news', icon: FileText, label: '新闻文章', value: stats.totalNews, trend: -3 }
]);

const totalRecordCount = computed(() => tabTotals[currentTab.value] || currentData.value.length || 0);
const dataConsoleTotalCount = computed(() =>
  tabGroups.reduce((groupTotal, group) =>
    groupTotal + group.tabIds.reduce((tabTotal, tabId) => tabTotal + getTabCount(tabId), 0),
  0)
);
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
    logger.warn('data-admin', '获取下一个数字 ID 失败，使用当前页兜底:', error);
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

const resetFiltersForTab = () => {
  statusFilter.value = '';
  dateFromFilter.value = '';
  dateToFilter.value = '';
  advancedFilterRules.value = [];
};

const persistColumnSettings = () => writeLocalJson(STORAGE_KEYS.columns, columnSettings.value);
const persistSavedViews = () => writeLocalJson(STORAGE_KEYS.savedViews, savedFilterViews.value);
const persistPinnedTabs = () => writeLocalJson(STORAGE_KEYS.pinnedTabs, pinnedTabIds.value);
const persistRecentRecords = () => writeLocalJson(STORAGE_KEYS.recentRecords, recentRecords.value);
const persistChangeLog = () => writeLocalJson(STORAGE_KEYS.changeLog, changeLogEntries.value);

const getRowIdentity = (item) => String(item?.id || itemIndex(item));

const addChangeLogEntry = (action, item = {}, detail = {}) => {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    tabId: currentTab.value,
    tabLabel: currentTabLabel.value,
    recordId: item?.id || detail.recordId || '',
    detail,
    operator: userInfo?.username || userInfo?.email || 'admin',
    createdAt: new Date().toISOString()
  };
  changeLogEntries.value = [entry, ...changeLogEntries.value].slice(0, 300);
  persistChangeLog();
};

const addRecentRecord = (item, tabId = currentTab.value) => {
  const id = String(item?.id || '').trim();
  if (!id) return;
  const tabLabel = tabs.find((tab) => tab.id === tabId)?.label || tabId;
  const title = String(item.title || item.username || item.email || item.plan_name || item.prize_title || item.gift_content || id).trim();
  const record = {
    tabId,
    tabLabel,
    id,
    title,
    visitedAt: new Date().toISOString()
  };
  recentRecords.value = [
    record,
    ...recentRecords.value.filter((entry) => !(entry.tabId === tabId && String(entry.id) === id))
  ].slice(0, 20);
  persistRecentRecords();
};

const togglePinnedTab = (tabId) => {
  if (pinnedTabIds.value.includes(tabId)) {
    pinnedTabIds.value = pinnedTabIds.value.filter((id) => id !== tabId);
  } else {
    pinnedTabIds.value = [tabId, ...pinnedTabIds.value].slice(0, 8);
  }
  persistPinnedTabs();
};

const isTabPinned = (tabId) => pinnedTabIds.value.includes(tabId);

const jumpToRecentRecord = (record) => {
  if (!record?.tabId) return;
  switchTab(record.tabId, { search: String(record.id || record.title || '') });
};

const saveCurrentFilterView = () => {
  const name = window.prompt('请输入筛选视图名称');
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

const setActiveTabGroup = (groupId) => {
  activeTabGroupId.value = groupId;
  const group = tabGroups.find((item) => item.id === groupId);
  const firstTabId = group?.tabIds?.[0];
  if (firstTabId && !group.tabIds.includes(currentTab.value)) {
    switchTab(firstTabId);
  }
};

const switchTab = (tabId, options = {}) => {
  if (activeAdminSection.value === 'overview' || isPlaceholderAdminSection.value) {
    activeAdminSection.value = 'data';
  }
  currentTab.value = tabId;
  activeTabGroupId.value = currentTabGroup.value?.id || activeTabGroupId.value;
  isDataTreeCollapsed.value = false;
  ensureSidebarGroupExpanded(activeTabGroupId.value);
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

const handleFilterChange = () => {
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  fetchTabData(currentTab.value);
};

const clearSearch = () => {
  searchQuery.value = '';
  if (currentPage.value !== 1) {
    suppressNextPageFetch.value = true;
    currentPage.value = 1;
  }
  fetchTabData(currentTab.value);
};

const clearAllFilters = () => {
  searchQuery.value = '';
  resetFiltersForTab();
  handleFilterChange();
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

const normalizeFilterValue = (value) => String(value || '').trim().replace(/[,%()]/g, ' ').slice(0, 160);

const applyAdvancedFilters = (query) => {
  let nextQuery = query;
  activeAdvancedRules.value.forEach((rule) => {
    const field = String(rule.field || '').trim();
    const operator = String(rule.operator || 'contains').trim();
    const value = normalizeFilterValue(rule.value);
    if (!field || !value) return;

    if (operator === 'eq') nextQuery = nextQuery.eq(field, value);
    else if (operator === 'neq') nextQuery = nextQuery.neq(field, value);
    else if (operator === 'gt') nextQuery = nextQuery.gt(field, value);
    else if (operator === 'gte') nextQuery = nextQuery.gte(field, value);
    else if (operator === 'lt') nextQuery = nextQuery.lt(field, value);
    else if (operator === 'lte') nextQuery = nextQuery.lte(field, value);
    else if (operator === 'starts') nextQuery = nextQuery.ilike(field, `${value}%`);
    else nextQuery = nextQuery.ilike(field, `%${value}%`);
  });
  return nextQuery;
};

const applySearchAndSort = (query, tabId) => {
  const searchFilters = buildSearchFilters(tabId);
  let nextQuery = query;
  if (searchFilters.length > 0) {
    nextQuery = nextQuery.or(searchFilters.join(','));
  }

  const statusField = STATUS_FILTER_FIELDS[tabId];
  if (statusField && statusFilter.value !== '') {
    nextQuery = nextQuery.eq(statusField, statusFilter.value);
  }

  const dateField = DATE_FILTER_FIELDS[tabId];
  if (dateField && dateFromFilter.value) {
    nextQuery = nextQuery.gte(dateField, dateFromFilter.value);
  }
  if (dateField && dateToFilter.value) {
    const endDate = new Date(`${dateToFilter.value}T23:59:59`);
    nextQuery = nextQuery.lte(dateField, Number.isNaN(endDate.getTime()) ? dateToFilter.value : endDate.toISOString());
  }

  nextQuery = applyAdvancedFilters(nextQuery);

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

const buildSearchFiltersForKeyword = (tabId, keywordValue) => {
  const keyword = sanitizeSearchTerm(keywordValue);
  if (!keyword) return [];

  const isUuid = UUID_REGEX.test(keyword);
  const isInteger = /^\d+$/.test(keyword);

  return (TAB_SEARCH_FIELDS[tabId] || []).flatMap((field) => {
    if (field.type === 'uuid') return isUuid ? [`${field.column}.eq.${keyword}`] : [];
    if (field.type === 'number') return isInteger ? [`${field.column}.eq.${keyword}`] : [];
    return [`${field.column}.ilike.%${keyword}%`];
  });
};

const getSearchablePreviewFields = (tabId) => {
  const config = dataConfig[tabId] || {};
  return [
    ...(config.columns || []).map((col) => col.key),
    ...(TAB_SEARCH_FIELDS[tabId] || []).map((field) => field.column)
  ].filter((value, index, list) => value && list.indexOf(value) === index);
};

const runGlobalSearch = async () => {
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
      const table = dataConfig[tab.id]?.table;
      const selectColumns = TAB_SELECT_COLUMNS[tab.id];
      const filters = buildSearchFiltersForKeyword(tab.id, keyword);
      if (!table || !selectColumns || filters.length === 0) return [];

      let query = supabase
        .from(table)
        .select(selectColumns)
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
        const previewFields = getSearchablePreviewFields(tab.id);
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
  if (cached && Date.now() - Number(cached.cachedAt || 0) < 45000) {
    dataStore[tabId] = [...cached.rows];
    setTabTotal(tabId, cached.total);
    return;
  }

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

    let { data, error, count } = await paginateQuery(applySearchAndSort(query, tabId));

    if (tabId === 'lotteries' && error && isMissingLotteryObservabilitySchemaError(error)) {
      logger.warn('data-admin', '抽奖观测字段尚未部署，使用旧字段兜底加载:', error);
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
    if (fetchId === activeFetchId.value) {
      isLoading.value = false;
    }
  }
};

// ==================== 数据操作 ====================
const fetchSecondaryData = async () => {
  await Promise.allSettled([
    fetchStats(),
    isLotteryOpsTab.value ? loadLotterySchedulerStatus() : Promise.resolve()
  ]);
};

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

const maybeRestoreDraft = () => {
  const draft = readDrafts()[getDraftKey()];
  if (!draft?.editingItem) return;
  const updatedAt = draft.updatedAt ? formatDateTime(draft.updatedAt) : '上次';
  if (!confirm(`发现 ${updatedAt} 未保存草稿，是否恢复？`)) return;
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

const confirmPayloadDiffs = (payload) => {
  if (!isEditing.value) {
    return confirm(`确定要新增 1 条「${currentTabLabel.value}」记录吗？`);
  }
  const diffs = getPayloadDiffs(editingOriginalItem.value || {}, payload);
  if (!diffs.length) return true;
  const preview = diffs
    .slice(0, 8)
    .map((diff) => `${diff.key}: ${String(diff.from ?? '-').slice(0, 40)} -> ${String(diff.to ?? '-').slice(0, 40)}`)
    .join('\n');
  return confirm(`保存前差异预览（${diffs.length} 项）：\n${preview}${diffs.length > 8 ? '\n...' : ''}\n\n确认保存？`);
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
};

const closeModal = ({ askDraft = true } = {}) => {
  if (askDraft && showModal.value && Object.keys(editingItem.value || {}).length > 0) {
    const shouldKeepDraft = confirm('是否保留本次未保存草稿？选择“取消”会丢弃草稿并关闭。');
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

    if (currentTab.value === 'bohaiModels') {
      const normalizedModeId = String(editingItem.value.mode_id || '').trim();
      const normalizedDisplayName = String(editingItem.value.display_name || '').trim();
      const normalizedProvider = String(editingItem.value.provider || 'siliconflow').trim().toLowerCase();
      const normalizedModelId = String(editingItem.value.model_id || '').trim();
      const normalizedCapability = String(editingItem.value.capability || 'chat').trim().toLowerCase();
      const normalizedStatus = String(editingItem.value.status || 'active').trim().toLowerCase();
      const normalizedIcon = String(editingItem.value.icon || 'sparkles').trim() || 'sparkles';
      const normalizedTemperature = Number(editingItem.value.temperature);
      const normalizedTopP = Number(editingItem.value.top_p);
      const normalizedFrequencyPenalty = Number(editingItem.value.frequency_penalty);
      const normalizedMaxTokens = Number(editingItem.value.max_tokens);
      const normalizedSortOrder = Number(editingItem.value.sort_order);

      if (!normalizedModeId || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(normalizedModeId)) {
        fieldErrors.mode_id = '模式 ID 只能包含字母、数字、横线或下划线，长度 2-64';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedDisplayName) {
        fieldErrors.display_name = '显示名称不能为空';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!['siliconflow', 'zhipu', 'custom'].includes(normalizedProvider)) {
        fieldErrors.provider = '供应商必须是 siliconflow / zhipu / custom';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!normalizedModelId) {
        fieldErrors.model_id = '模型 ID 不能为空';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!['chat', 'multimodal', 'plan', 'agent'].includes(normalizedCapability)) {
        fieldErrors.capability = '能力类型无效';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!['active', 'disabled'].includes(normalizedStatus)) {
        fieldErrors.status = '状态必须是 active 或 disabled';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isFinite(normalizedTemperature) || normalizedTemperature < 0 || normalizedTemperature > 1.2) {
        fieldErrors.temperature = 'Temperature 必须在 0-1.2 之间';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isFinite(normalizedTopP) || normalizedTopP < 0.1 || normalizedTopP > 1) {
        fieldErrors.top_p = 'Top P 必须在 0.1-1 之间';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isFinite(normalizedFrequencyPenalty) || normalizedFrequencyPenalty < 0 || normalizedFrequencyPenalty > 2) {
        fieldErrors.frequency_penalty = 'Frequency Penalty 必须在 0-2 之间';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isInteger(normalizedMaxTokens) || normalizedMaxTokens < 256 || normalizedMaxTokens > 4096) {
        fieldErrors.max_tokens = '最大输出 tokens 必须是 256-4096 的整数';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      if (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0 || normalizedSortOrder > 10000) {
        fieldErrors.sort_order = '显示排序必须是 0-10000 的整数';
        showToast('请修复 BOHAI 模型表单错误后再保存', 'error');
        isSaving.value = false;
        return;
      }

      dataToSave = pickWritableFields('bohaiModels', {
        mode_id: normalizedModeId,
        display_name: normalizedDisplayName,
        tagline: String(editingItem.value.tagline || '').trim(),
        description: String(editingItem.value.description || '').trim(),
        provider: normalizedProvider,
        provider_label: String(editingItem.value.provider_label || '').trim() || normalizedProvider,
        model_id: normalizedModelId,
        api_url: String(editingItem.value.api_url || '').trim() || getDefaultApiUrlForBohaiProvider(normalizedProvider),
        capability: normalizedCapability,
        icon: normalizedIcon,
        temperature: normalizedTemperature,
        top_p: normalizedTopP,
        frequency_penalty: normalizedFrequencyPenalty,
        max_tokens: normalizedMaxTokens,
        sort_order: normalizedSortOrder,
        status: normalizedStatus,
        notes: String(editingItem.value.notes || '').trim(),
        created_by: isEditing.value ? undefined : (userInfo?.id || null),
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

    if (!confirmPayloadDiffs(dataToSave)) {
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
    closeModal({ askDraft: false });
  } catch (error) {
    logger.error('data-admin', '保存失败:', error);
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
    addChangeLogEntry('delete', item, { recordId: item?.id || '' });
    showToast('删除成功', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '删除失败:', error);
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
    addChangeLogEntry('lottery_draw', item, { winners: winnerNames, entryCount });
    showToast(winnerNames.length ? `开奖完成，中奖者：${winnerNames.join('、')}` : '开奖完成，本期暂无中奖者', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '抽奖开奖失败:', error);
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
    addChangeLogEntry('lottery_redraw', item, { reason: normalizedReason, winners: winnerNames });
    showToast(winnerNames.length ? `重抽完成，中奖者：${winnerNames.join('、')}` : '重抽完成，本期暂无中奖者', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '抽奖重抽失败:', error);
    showToast('重抽失败: ' + buildActionErrorMessage(error, '重抽失败'), 'error');
  } finally {
    setLotteryActionPending(item.id, false);
  }
};

const viewLotteryEntries = (item) => {
  if (!item?.id) return;
  addRecentRecord(item);
  switchTab('lotteryEntries', { search: String(item.id) });
};

const viewLotteryDrawLogs = (item) => {
  if (!item?.id) return;
  addRecentRecord(item);
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
    addChangeLogEntry('lottery_close', item, { status: 'closed' });
    showToast('抽奖已关闭，已保留在历史抽奖中', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '关闭抽奖失败:', error);
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
    logger.warn('data-admin', '写入 moderation_logs 失败（不阻断主流程）:', error);
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
    addChangeLogEntry(`moderation_${action}`, item, {
      status: updateData[config.statusField],
      reason
    });
    showToast(isApprove ? '审核通过已生效' : isKeepLimited ? '已维持下架并结案举报' : '已拒绝并记录原因', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '审核操作失败:', error);
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
    addChangeLogEntry('moderation_delete', item, { targetType: config.targetType });
    showToast('删除成功', 'success');
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '删除审核记录失败:', error);
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
    addChangeLogEntry('batch_delete', { id: ids.join(',') }, { count: ids.length });
    showToast('批量删除成功', 'success');
    selectedItems.value = [];
    await refreshCurrentViewAfterMutation();
  } catch (error) {
    logger.error('data-admin', '批量删除失败:', error);
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

const getHighlightKeyword = () => sanitizeSearchTerm(searchQuery.value || globalSearchQuery.value);

const highlightCellValue = (value, maxLength) => {
  const display = formatCellValue(value, maxLength);
  const escaped = escapeHtml(display);
  const keyword = getHighlightKeyword();
  if (!keyword || display === '-') return escaped;
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${safeKeyword})`, 'ig'), '<mark>$1</mark>');
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
    if (!confirm(preview)) return;

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
  const data = filteredData.value;
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
    isExportingBackup.value = true;
    const exportedAt = new Date().toISOString();
    const targets = getBackupTableTargets();
    const tablesPayload = {};
    const summary = [];

    for (const target of targets) {
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
    }

    const backupPayload = {
      type: 'boh-admin-data-backup',
      version: 1,
      exportedAt,
      exportedBy: {
        id: userInfo?.id || '',
        username: userInfo?.username || '',
        email: userInfo?.email || '',
        role: userInfo?.role || ''
      },
      summary,
      tables: tablesPayload
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const timestamp = exportedAt.replace(/[:.]/g, '-');
    downloadBlob(blob, `boh-data-backup_${timestamp}.json`);
    showToast(`备份导出成功，共 ${summary.length} 张表`, 'success');
  } catch (error) {
    logger.error('data-admin', '备份导出失败:', error);
    showToast('备份导出失败: ' + buildActionErrorMessage(error, '备份导出失败'), 'error');
  } finally {
    isExportingBackup.value = false;
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

// ==================== 生命周期 ====================
onMounted(() => {
  hydrateEditorPreferences();
  fetchData({ deferSecondary: true });
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

watch(editingItem, () => {
  if (!showModal.value || suppressDraftSave.value) return;
  saveCurrentDraft();
}, { deep: true });

onUnmounted(() => {
  if (searchDebounceTimer.value) {
    clearTimeout(searchDebounceTimer.value);
    searchDebounceTimer.value = null;
  }
  if (userPickerSearchDebounceTimer.value) {
    clearTimeout(userPickerSearchDebounceTimer.value);
    userPickerSearchDebounceTimer.value = null;
  }
  if (toast.timer) {
    clearTimeout(toast.timer);
    toast.timer = null;
  }
});

</script>

<style scoped>
@import './styles/base.css';
@import './styles/console.css';
@import './styles/overlays.css';
@import './styles/responsive.css';
</style>
