<template>
  <div class="cloud-page" :class="{ embedded: isDesktopEmbed, 'with-topbar': !isDesktopEmbed }">
    <!-- 页头只剩「BOH Cloud+」这一个标题。
         ⚠️ 返回按钮 2026-11-05 删除（`:show-back="false"`），别再凭「子页都要有返回」加回来：
         图库自 2026-10-22 起是**全站底栏第五席**（/user-space/note，与 内容 / 消息 / 周边 / 我 平级），
         而「我」这一席的页头本来就没有返回 —— 顶栏给一个 tab 根页配返回，语义上就是错的。
         更实际的问题是它**回不到原地**：goBack 走 `resolveSettingsBackLocation`，只有带
         `?from=userspace*` 才认，而首页 hero / 首页页脚 / 历史页 / 全站搜索这几个入口都是裸
         `router.push('/user-space/note')` ⇒ 一律回落到「我」页。从首页点「立即体验」进来，
         按「返回」却落在「我」，比没有按钮更误导。
         离开图库始终有出口：竖屏 / 手机横屏是底栏（左起第四席），≥1024 横屏是左栏。
         页头容器是 `grid-template-columns: 52px 1fr 52px`、标题固定在第二列，
         所以少掉返回那一格**不会**让标题偏移。 -->
    <UserCenterPageHeader
      v-if="!isDesktopEmbed"
      title="BOH Cloud+"
      max-width="1200px"
      :show-back="false"
    />

    <!-- 2026-11-04 第二轮（用户口径：其他 tab 的位置和布局要和内容 tab 一样）：
         shell **恒为全宽**，不再按 tab 在「980 居中 / 全宽」之间切 ——
         那是切一次 tab 标题就从最左跳到页面中间的主因。
         设置 / 分享的正文限宽移到页内（见 style.scoped.css 的 .cloud-settings-page /
         .cloud-share-page），限的是卡片宽度，不是标题左缘。 -->
    <div class="cloud-shell is-gallery">
      <main class="cloud-main" :class="{ 'is-view-entering': isViewEntering }">
        <!-- 视图切换（2026-10-22 从底部胶囊上移到这里）：Cloud+ 成为全站底栏第五席后，
             底部那套位置要让给全局底栏（UserSpaceBottomNav），否则同屏两套底栏。
             内容/分享/设置本来就是**同一页面的三个视图**（靠 ?view= 切），不是跨模块导航
             ⇒ 归位成页面内 SegmentTabs，与「我」页三段、Newsroom 同一套组件。
             探针按 `.cloud-segment-tabs .segment-tab` 定位（`.segment-tab` 全站多处，必须带作用域）。 -->
        <SegmentTabs
          class="cloud-segment-tabs"
          :sections="cloudTabSections"
          :model-value="cloudTab"
          aria-label="Cloud+ 视图"
          @update:model-value="switchCloudTab"
        />

        <header v-if="cloudTab === 'content'" class="cloud-header gallery-header">
          <div class="gallery-title-block">
            <h2>图库</h2>
            <p class="gallery-subtitle">
              私密空间 · 图片 {{ cloudAccounting.usedImages }} / {{ currentCloudImageLimit }}
            </p>
          </div>
          <div class="gallery-header-actions">
            <label class="search-field gallery-search-field" for="cloud-search">
              <Search class="search-icon" :size="16" :stroke-width="1.8" aria-hidden="true" />
              <input
                id="cloud-search"
                v-model.trim="searchQuery"
                type="search"
                placeholder="搜索"
              />
            </label>

            <div class="filter-popover-shell">
              <button
                type="button"
                class="refresh-btn filter-trigger"
                :class="{ 'is-filtering': hasGalleryFilters }"
                @click="toggleFilterPanel"
              >
                筛选
                <span v-if="activeFilterCount" class="toolbar-pill-badge">{{
                  activeFilterCount
                }}</span>
              </button>
              <div
                v-if="isFilterPanelOpen"
                class="filter-popover-backdrop"
                aria-hidden="true"
                @click="toggleFilterPanel"
              ></div>
              <div
                v-if="isFilterPanelOpen"
                class="filter-popover"
                role="dialog"
                aria-label="筛选条件"
              >
                <div class="filter-popover-row">
                  <button
                    v-for="option in filterOptions"
                    :key="option.value"
                    type="button"
                    class="filter-chip"
                    :class="{ active: currentFilter === option.value }"
                    @click="currentFilter = option.value"
                  >
                    {{ option.label }}
                    <span class="chip-count">{{ getFilterCount(option.value) }}</span>
                  </button>
                </div>
                <div class="date-range filter-popover-dates">
                  <label class="date-field">
                    <span>开始</span>
                    <input v-model="dateFrom" type="date" />
                  </label>
                  <label class="date-field">
                    <span>结束</span>
                    <input v-model="dateTo" type="date" />
                  </label>
                </div>
                <button
                  v-if="hasGalleryFilters"
                  type="button"
                  class="toolbar-reset-btn"
                  @click="resetGalleryFilters"
                >
                  清除全部筛选
                </button>
              </div>
            </div>

            <button type="button" class="refresh-btn" :disabled="isLoading" @click="loadEntries">
              <span v-if="showRefreshIndicator" class="refresh-btn-dot" aria-hidden="true"></span>
              <span>{{ showRefreshIndicator ? '同步中' : '刷新' }}</span>
            </button>

            <!-- BOH Camera Beta（plans/041）：实时滤镜取景 → 成片直接进下面「新建」的图片队列。
                 图标按钮 + 角标；前置检查与 openImagePicker 同源（额度/Cloudinary），
                 不让用户拍完一张才被告知存不进去。 -->
            <button
              v-if="!isSelectMode"
              type="button"
              class="refresh-btn gallery-camera-entry"
              data-testid="gallery-camera-entry"
              aria-label="相机（Beta）"
              @click="openCamera"
            >
              <Camera :size="16" :stroke-width="1.9" aria-hidden="true" />
              <span class="gallery-camera-entry__beta" aria-hidden="true">Beta</span>
            </button>

            <!-- 选择入口（2026-11-04 第二轮）：原先是相册网格上方一行 ghost-link 文字，
                 用户要求「选择应该是一个按钮样式」⇒ 收进头部动作区，与筛选/刷新同一套 .refresh-btn，
                 ≤640 那条 `.gallery-header-actions > .refresh-btn` 规则会自动让它跟其它按钮平分第二行。
                 选择态下同一个按钮变「完成」，底部操作条仍保留「取消」（两处都能退）。 -->
            <button
              type="button"
              class="refresh-btn album-select-trigger"
              :class="{ 'is-selecting': isSelectMode }"
              :aria-pressed="isSelectMode ? 'true' : 'false'"
              @click="isSelectMode ? exitSelectMode() : enterSelectMode()"
            >
              <CheckSquare :size="15" :stroke-width="1.9" aria-hidden="true" />
              <span>{{ isSelectMode ? '完成' : '选择' }}</span>
            </button>

            <!-- 选择态下不给「新建」：选中格子时点开编辑器会把选择态和草稿搅在一起 -->
            <button v-if="!isSelectMode" type="button" class="primary-btn" @click="openComposer">
              ＋ 新建
            </button>
          </div>
        </header>

        <!-- 分享 / 设置 / 回收站的页头（2026-11-04 第二轮用户口径：
             「其他页面 Tab 切换位置和布局保持和内容 Tab 的时候一样」）。
             原先这里是 hero 档：11px 英文 eyebrow + 36px 大标题 + 15px 副标题，
             而内容页是 28px 标题 + 13px 副标题 —— 同一排 SegmentTabs 下面，
             切一次 tab 标题就换一次字号、整块内容往下跳 ~40px。
             现在直接复用内容页的 .gallery-title-block / .gallery-subtitle 口径，
             eyebrow 一并删掉（内容页没有，它就是跳动的主因之一）。 -->
        <header v-else class="cloud-header">
          <div class="gallery-title-block">
            <h2>{{ cloudPageHero.title }}</h2>
            <p class="gallery-subtitle">{{ cloudPageHero.subtitle }}</p>
          </div>
        </header>

        <div v-if="!isLoggedIn" class="login-state">
          <div class="login-card">
            <Cloud class="login-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
            <h3>登录后开启你的 BOH Cloud+</h3>
            <p>这里会保存你的文字、图片和图文混合内容。</p>
            <button class="primary-btn" @click="authStore.showLoginModal = true">去登录</button>
          </div>
        </div>

        <template v-else>
          <div v-if="showRefreshIndicator" class="cloud-refresh-indicator" aria-live="polite">
            <div class="cloud-refresh-track">
              <div class="cloud-refresh-bar"></div>
            </div>
            <p class="cloud-refresh-text">正在更新 Cloud+ 内容</p>
          </div>

          <section v-if="cloudTab === 'settings'" class="cloud-settings-page">
            <div class="cloud-settings-grid">
              <!-- 液态玻璃：材质单源 = styles/common/liquid-glass.css 的 .liquid-glass。
                   ⚠️ 这里**只加基础类**，不要加 --subtle/--strong/--inset 变体：
                   那些变体在 ≤768px 会被 liquid-glass.css 强制成 backdrop-filter:none + 近实白
                   （「移动端只保留外层玻璃」的性能策略），竖屏下就完全没有玻璃感了。 -->
              <div class="sidebar-card quota-card liquid-glass">
                <div class="card-label">图片使用限额</div>
                <div class="quota-minimal">
                  <div class="quota-meta">
                    <strong>{{ totalStoredImages }}</strong>
                    <span>/ {{ currentCloudImageLimit }}</span>
                  </div>
                  <div class="quota-action-row">
                    <div
                      class="quota-meter"
                      role="progressbar"
                      :aria-valuenow="totalStoredImages"
                      :aria-valuemin="0"
                      :aria-valuemax="currentCloudImageLimit"
                    >
                      <div class="quota-meter-fill" :style="{ width: `${quotaPercent}%` }"></div>
                    </div>
                    <button
                      type="button"
                      class="quota-upgrade-btn"
                      @click="openSubscriptionsFromCloudSettings"
                    >
                      升级限额
                    </button>
                  </div>
                  <p class="quota-caption">{{ remainingImageQuota }} 张可用</p>
                </div>
                <!-- 2026-10-01 极简排版：原 quota-hint「限额按账号计算，私密内容和共享访问使用同一额度」
                     与紧随其后的 CloudStorageBar 说明是同一件事，删掉这条、只留存储条那一条。 -->
              </div>
            </div>

            <CloudStorageBar
              :accounting="cloudAccounting"
              :loading="isLoading"
              @jump-private="scrollAlbumToTop"
              @manage-public="goWorksGrid"
            />
          </section>

          <section v-else-if="cloudTab === 'share'" class="cloud-share-page">
            <div class="cloud-share-grid">
              <div
                class="sidebar-card share-card liquid-glass"
                :aria-busy="isLoadingMyShareChannel ? 'true' : undefined"
              >
                <div class="card-label">频道状态</div>
                <div
                  v-if="isLoadingMyShareChannel"
                  class="share-status-skeleton"
                  aria-hidden="true"
                >
                  <div class="skeleton-block share-skeleton-copy"></div>
                  <div class="skeleton-block share-skeleton-copy short"></div>
                  <div class="skeleton-block share-skeleton-button"></div>
                </div>
                <template v-else>
                  <!-- 2026-10-01 极简排版：原来这里连着三条同义说明
                       （「只有拿到令牌的人可以查看」/「仅持有令牌的人可以查看」/「只有拿到令牌的人可以访问」），
                       合并为一句，把「不公开 + 需令牌」两点讲完就停。 -->
                  <!-- 2026-11-04 硬切审计：骨架⇄分享状态补内容侧淡入 -->
                  <p class="share-card-copy content-swap-in-fade">
                    系统提供 1 个私密令牌频道。它不会出现在社区列表，只有持有令牌的人可以查看。
                  </p>
                  <button
                    type="button"
                    class="primary-btn share-action-btn"
                    :class="{ 'is-active-share': myShareChannel?.isActive }"
                    :disabled="isSavingShareChannel || isLoadingMyShareChannel"
                    @click="toggleMyShareChannel"
                  >
                    {{
                      isSavingShareChannel
                        ? '处理中...'
                        : myShareChannel?.isActive
                          ? `关闭${activeShareChannelLabel}`
                          : `开启${activeShareChannelLabel}`
                    }}
                  </button>
                  <div class="share-description-control">
                    <div class="share-token-label">令牌备注</div>
                    <textarea
                      v-model="shareDescriptionDraft"
                      class="share-description-input"
                      maxlength="160"
                      rows="3"
                      placeholder="给这枚令牌写一句备注。"
                      :disabled="isSavingShareChannel"
                      @blur="saveShareDescription"
                    ></textarea>
                    <div class="share-description-footer">
                      <span>{{ shareDescriptionDraft.length }}/160</span>
                      <button
                        type="button"
                        class="secondary-btn share-description-save-btn"
                        :disabled="
                          isSavingShareChannel ||
                          shareDescriptionDraft.trim() ===
                            (myShareChannel?.description || '').trim()
                        "
                        @click="saveShareDescription"
                      >
                        保存描述
                      </button>
                    </div>
                  </div>
                  <div v-if="myShareChannel?.shareToken" class="share-token-shell">
                    <div class="share-token-label">访问令牌</div>
                    <div class="share-token-row">
                      <input
                        :value="myShareChannel.shareToken"
                        type="text"
                        class="share-token-input"
                        readonly
                      />
                      <button
                        type="button"
                        class="secondary-btn share-copy-btn"
                        @click="copyMyShareToken"
                      >
                        复制
                      </button>
                    </div>
                    <div class="share-token-actions">
                      <button
                        type="button"
                        class="secondary-btn share-inline-btn"
                        :disabled="isSavingShareChannel"
                        @click="regenerateMyShareChannel"
                      >
                        撤销并生成新令牌
                      </button>
                    </div>
                    <div class="share-viewers-panel">
                      <div class="share-token-label">令牌访问记录</div>
                      <div
                        v-if="isLoadingShareViewers"
                        class="share-viewers-skeleton"
                        aria-hidden="true"
                      >
                        <div
                          v-for="item in 3"
                          :key="`settings-share-viewer-loading-${item}`"
                          class="share-viewer-row skeleton"
                        >
                          <div class="skeleton-block share-viewer-avatar"></div>
                          <div class="share-viewer-main">
                            <div class="skeleton-block share-viewer-name-skeleton"></div>
                            <div class="skeleton-block share-viewer-meta-skeleton"></div>
                          </div>
                        </div>
                      </div>
                      <p v-else-if="shareViewersError" class="share-error-text">
                        {{ shareViewersError }}
                      </p>
                      <p v-else-if="shareViewers.length === 0" class="share-token-hint">
                        暂时还没有已登录用户通过令牌访问过你的私密频道。
                      </p>
                      <!-- 2026-11-04 硬切审计：访客骨架⇄列表补内容侧淡入 -->
                      <div v-else class="share-viewer-list content-swap-in-fade">
                        <div
                          v-for="viewer in shareViewers"
                          :key="viewer.viewerUserId"
                          class="share-viewer-row"
                        >
                          <img
                            v-if="viewer.viewerAvatarUrl"
                            :src="viewer.viewerAvatarUrl"
                            :alt="viewer.viewerUsername || '访客头像'"
                            class="share-viewer-avatar"
                            loading="lazy"
                          />
                          <span v-else class="share-viewer-avatar placeholder">
                            {{ (viewer.viewerUsername || 'U').slice(0, 1).toUpperCase() }}
                          </span>
                          <div class="share-viewer-main">
                            <strong>{{ viewer.viewerUsername || '未知用户' }}</strong>
                            <span
                              >{{ formatViewerTime(viewer.lastViewedAt) }} ·
                              {{ viewer.viewCount }} 次查看</span
                            >
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <div class="sidebar-card access-card liquid-glass">
                <div class="card-label">访问别人的频道</div>
                <p class="share-card-copy">
                  输入别人分享给你的私密访问令牌，打开 TA 的 Cloud+ 频道。
                </p>
                <input
                  v-model.trim="sharedTokenInput"
                  type="text"
                  class="share-token-input editable"
                  placeholder="输入访问令牌"
                  @keydown.enter.prevent="openSharedChannel"
                />
                <div class="share-token-actions">
                  <button
                    type="button"
                    class="primary-btn share-action-btn"
                    :disabled="isLoadingSharedChannel || !normalizedSharedTokenInput"
                    @click="openSharedChannel"
                  >
                    {{ isLoadingSharedChannel ? '加载中...' : '查看共享 Cloud+' }}
                  </button>
                  <button
                    v-if="sharedChannel"
                    type="button"
                    class="ghost-link"
                    @click="exitSharedChannel"
                  >
                    退出共享
                  </button>
                </div>
                <p v-if="sharedChannelError" class="share-error-text">{{ sharedChannelError }}</p>
              </div>
            </div>

            <section
              v-if="isLoadingSharedChannel"
              class="gallery-section shared-channel-section shared-channel-loading"
              aria-busy="true"
            >
              <div class="section-heading">
                <div>
                  <span class="section-kicker">Shared Channel</span>
                  <h3>正在读取共享频道</h3>
                </div>
              </div>
              <div class="gallery-grid shared-skeleton-grid" aria-hidden="true">
                <article
                  v-for="item in 4"
                  :key="`settings-shared-loading-${item}`"
                  class="cloud-card skeleton-card"
                >
                  <div class="skeleton-block shared-skeleton-visual"></div>
                  <div class="card-body shared-card-skeleton-body">
                    <div class="skeleton-block skeleton-date"></div>
                    <div class="skeleton-block skeleton-title"></div>
                    <div class="skeleton-block skeleton-text"></div>
                    <div class="skeleton-block skeleton-footer"></div>
                  </div>
                </article>
              </div>
            </section>

            <!-- 2026-11-04 硬切审计：共享频道骨架⇄画廊补内容侧淡入 -->
            <section
              v-else-if="sharedChannel"
              class="gallery-section shared-channel-section content-swap-in-fade"
            >
              <div class="section-heading">
                <div>
                  <span class="section-kicker">Shared Channel</span>
                  <h3>{{ sharedChannelTitle }}</h3>
                </div>
                <div class="section-heading-actions">
                  <p>{{ sharedEntries.length }} 条内容</p>
                  <button
                    type="button"
                    class="secondary-btn shared-collapse-btn"
                    @click="toggleSharedContentCollapse"
                  >
                    {{ isSharedContentCollapsed ? '展开内容' : '折叠内容' }}
                  </button>
                </div>
              </div>

              <div class="gallery-inline-feedback shared-channel-banner">
                <span
                  >访问令牌已验证成功。你正在查看 {{ sharedChannelTitle }} 的 Cloud+ 内容。</span
                >
                <button type="button" class="ghost-link feedback-action" @click="exitSharedChannel">
                  退出共享
                </button>
              </div>

              <div v-if="isSharedContentCollapsed" class="empty-state shared-collapsed-state">
                <ChevronDown class="empty-icon" :size="36" :stroke-width="1.7" aria-hidden="true" />
                <h4>共享内容已折叠</h4>
                <p>展开后可继续查看全部条目。</p>
                <button type="button" class="primary-btn" @click="toggleSharedContentCollapse">
                  展开共享内容
                </button>
              </div>

              <div v-else-if="sharedEntries.length === 0" class="empty-state filter-empty-state">
                <Cloud class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
                <h4>这个共享频道还没有内容</h4>
                <p>对方发布 Cloud+ 后，这里会显示 TA 的内容。</p>
              </div>

              <TransitionGroup v-else name="list-transition" tag="div" class="gallery-grid" appear>
                <article
                  v-for="(entry, index) in sharedEntries"
                  :key="`settings-shared-${entry.id}`"
                  class="cloud-card"
                  :class="[`type-${entry.entryType}`, { featured: entry.coverImageUrl }]"
                  :style="{ '--item-index': index }"
                  @click="openEntry(entry, 'shared', $event)"
                >
                  <div v-if="entry.coverImageUrl" class="card-visual">
                    <img
                      :src="resolveDbCloudCoverImage(entry.coverImageUrl)"
                      :alt="entry.title || 'Cloud cover'"
                      class="card-cover cloud-loading-image"
                      loading="eager"
                      decoding="async"
                      referrerpolicy="no-referrer"
                      @load="handleCloudImageLoaded"
                      @error="retryCloudImageLoad"
                    />
                    <div class="card-overlay">
                      <span class="entry-badge">{{ entryTypeLabel(entry.entryType) }}</span>
                    </div>
                  </div>

                  <div class="card-body">
                    <div class="card-date">
                      {{ formatEntryDate(entry.entryDate, entry.updatedAt) }}
                    </div>
                    <h4 class="card-title">{{ entry.title || defaultTitle(entry) }}</h4>
                    <p class="card-text">
                      {{ entry.previewText || '这条内容里暂时没有文字预览。' }}
                    </p>
                    <div class="card-footer">
                      <span class="card-meta">{{ blockSummary(entry) }}</span>
                      <button type="button" class="ghost-link">打开</button>
                    </div>
                  </div>
                </article>
              </TransitionGroup>
            </section>
          </section>

          <!-- 回收站（2026-11-04 第二轮）：从底部弹层升成**独立页面**，与内容/分享/设置同级。
               弹层里只有 76vh 的滚动区，图一多就得在「页面滚动 + 弹层滚动」两层里点勾，
               而且恢复后看不出图片回到了哪条内容 —— 页面形态才能给出完整说明与空态。
               页面头（标题/副标题）由上面共用的 .cloud-header 走 cloudPageHero 提供。 -->
          <section v-else-if="cloudTab === 'trash'" class="cloud-trash-page">
            <div class="trash-page-toolbar">
              <p class="trash-page-hint">
                删除的图片在这里保留
                {{ TRASH_RETENTION_DAYS }} 天，到期自动清理。恢复后图片回到原内容；
                来自论坛帖的图片会同时回到原帖。
              </p>
              <div class="trash-page-actions">
                <button
                  v-if="restorableTrashIds.length"
                  type="button"
                  class="ghost-link"
                  @click="toggleSelectAllRestorableTrash"
                >
                  {{ isAllRestorableTrashSelected ? '取消全选' : '全选' }}
                </button>
                <button
                  type="button"
                  class="refresh-btn"
                  :disabled="isTrashLoading"
                  @click="loadTrashedImages"
                >
                  <span>{{ isTrashLoading ? '读取中' : '刷新' }}</span>
                </button>
                <button
                  type="button"
                  class="primary-btn trash-page-restore"
                  :disabled="trashSelectedIds.size === 0 || isRestoringTrash || isPurgingTrash"
                  @click="restoreSelectedTrashImages"
                >
                  <RotateCcw :size="15" :stroke-width="2" aria-hidden="true" />
                  {{
                    isRestoringTrash
                      ? '恢复中…'
                      : trashSelectedIds.size
                        ? `恢复 ${trashSelectedIds.size} 张`
                        : '恢复'
                  }}
                </button>
                <!-- 永久删除（2026-11-04）：与恢复并排，但用 danger 档 ——
                     这是整页唯一不可撤销的动作，视觉上不能和恢复同权重。 -->
                <button
                  type="button"
                  class="danger-btn trash-page-purge"
                  :disabled="trashSelectedIds.size === 0 || isRestoringTrash || isPurgingTrash"
                  @click="purgeSelectedTrashImages"
                >
                  <Trash2 :size="15" :stroke-width="2" aria-hidden="true" />
                  {{ isPurgingTrash ? '删除中…' : '永久删除' }}
                </button>
              </div>
            </div>

            <div v-if="isTrashLoading && !trashItems.length" class="trash-empty">
              正在读取回收站…
            </div>
            <div v-else-if="!trashItems.length" class="empty-state trash-page-empty">
              <Trash2 class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
              <h4>回收站是空的</h4>
              <p>在图库里删除的图片会先放到这里，{{ TRASH_RETENTION_DAYS }} 天内都能恢复。</p>
            </div>
            <div v-else class="trash-grid">
              <button
                v-for="item in trashItems"
                :key="item.id"
                type="button"
                class="trash-tile"
                :class="{
                  'is-selected': trashSelectedIds.has(item.id),
                  'is-expired': item.expired,
                }"
                :disabled="item.expired"
                @click="toggleTrashSelection(item)"
              >
                <img :src="resolveDbCloudTileImage(item.imageUrl)" alt="" loading="lazy" />
                <span class="trash-days">{{
                  item.expired ? '已过期' : `剩 ${item.daysLeft} 天`
                }}</span>
                <span class="trash-check" :class="{ checked: trashSelectedIds.has(item.id) }">
                  <Check
                    v-if="trashSelectedIds.has(item.id)"
                    :size="12"
                    :stroke-width="3.2"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>

            <p v-if="trashItems.length" class="trash-page-foot">
              共 {{ trashItems.length }} 张 · 已选 {{ trashSelectedIds.size }} 张
            </p>
          </section>

          <template v-else>
            <section v-if="cloudModeBanner" class="cloud-mode-banner">
              <div>
                <span class="section-kicker">{{ cloudModeBanner.kicker }}</span>
                <h3>{{ cloudModeBanner.title }}</h3>
                <p>{{ cloudModeBanner.subtitle }}</p>
              </div>
              <button
                v-if="cloudModeBanner.action"
                type="button"
                class="secondary-btn cloud-mode-action"
                @click="cloudModeBanner.action"
              >
                {{ cloudModeBanner.actionText }}
              </button>
            </section>

            <div class="storage-strip" role="status" aria-label="Cloud+ 存储用量">
              <div class="storage-strip-track" aria-hidden="true">
                <div class="storage-strip-fill" :style="{ width: `${quotaPercent}%` }"></div>
              </div>
              <span class="storage-strip-meta">
                已用 {{ cloudAccounting.usedImages }} / {{ cloudAccounting.limit }} 张 · 私密
                {{ cloudAccounting.privateEntries }} · 公开 {{ cloudAccounting.publicEntries }} ·
                剩余 {{ cloudAccounting.remainingImages }} 张
                <span v-if="cloudAccounting.overflow" class="storage-strip-overflow">已超限</span>
              </span>
            </div>

            <button
              v-if="publicEntries.length"
              type="button"
              class="public-notes-pill"
              @click="goWorksGrid"
            >
              <span class="public-notes-pill-text">
                {{ publicEntries.length }} 条公开笔记在作品格展示 · 占
                {{ cloudAccounting.publicImages }} 张图片额度
              </span>
              <span class="public-notes-pill-action">去管理 ›</span>
            </button>

            <!-- 发布面板（2026-10-18 重构）
                 设计口径：
                   · 按钮从 12 个收到 4 个：关闭 / 图片 / 心情 / 发布。
                     「心情」是折叠开关，9 个情绪胶囊只在展开时出现（竖屏曾占 3 行 117px）。
                     装饰性 chip（Cloud+ Draft / Memo Layout / N 张图片 / N 字符）全部删除 ——
                     其中两项与输入区计数重复，另两项是英文占位文案、不承载任何操作。
                   · 材质走全局 `.liquid-glass`（与底栏/设置卡/论坛发帖器同一套 token），
                     外面压一层 scrim；不再是不透明白底全屏。
                   · 布局：竖屏底部抽屉（贴底 + 上圆角）、宽屏居中对话框；
                     `max-height` 用 dvh 且扣掉 --kb-inset（键盘高度，全站单一真源），
                     正文区自己滚、底栏常驻 ⇒ 横屏 844×390 下发布按钮不再跑到屏幕外。 -->
            <Transition name="cloud-composer">
              <div v-if="isComposerOpen" class="composer-overlay" @click.self="closeComposer">
                <section
                  class="composer-panel liquid-glass"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="cloud-composer-title"
                >
                  <header class="composer-head">
                    <div class="composer-head-text">
                      <h3 id="cloud-composer-title">发布新内容</h3>
                      <p class="composer-sub">{{ composerSubtitle }}</p>
                    </div>
                    <button
                      type="button"
                      class="composer-close"
                      aria-label="关闭发布面板"
                      @click="closeComposer"
                    >
                      <X :size="18" :stroke-width="2.2" aria-hidden="true" />
                    </button>
                  </header>

                  <div class="composer-body">
                    <input
                      v-model.trim="draftTitle"
                      type="text"
                      class="composer-title-input"
                      maxlength="120"
                      placeholder="标题"
                    />

                    <textarea
                      ref="draftTextareaRef"
                      v-model="draftText"
                      class="composer-text-input"
                      rows="5"
                      placeholder="记录今天的心情…"
                      @keydown.meta.enter.prevent="publishEntry"
                      @keydown.ctrl.enter.prevent="publishEntry"
                    ></textarea>
                    <p v-if="draftText.length" class="composer-counter">
                      {{ draftText.length }} 字
                    </p>

                    <!-- 心情抽屉：默认收起，点底栏「心情」展开。用行内展开而不是绝对定位浮层 ——
                         窄屏 + 短横屏下浮层容易被面板的 contain: paint 裁掉。
                         开合走高度 + 透明度过渡（css 见 .cp-tray-*）：生硬地 v-if 会让
                         一整片胶囊突然砸下来。 -->
                    <Transition name="cp-tray">
                      <div
                        v-if="isMoodTrayOpen"
                        class="mood-tray"
                        role="radiogroup"
                        aria-label="记录心情"
                      >
                        <button
                          type="button"
                          class="mood-chip"
                          :class="{ active: !draftMood }"
                          @click="draftMood = ''"
                        >
                          不标注
                        </button>
                        <button
                          v-for="mood in moodChoices"
                          :key="mood.value"
                          type="button"
                          class="mood-chip"
                          :class="{ active: draftMood === mood.value }"
                          :aria-checked="draftMood === mood.value"
                          role="radio"
                          @click="draftMood = draftMood === mood.value ? '' : mood.value"
                        >
                          <span aria-hidden="true">{{ mood.icon }}</span>
                          {{ mood.value }}
                        </button>
                      </div>
                    </Transition>

                    <!-- 已选图片：整条横滚动。新上传进来的缩略图逐个淡入（TransitionGroup），
                         不做过位动画 —— 「逐格错峰/FLIP」在相册网格上已被 2026-10-02 的
                         性能报障否掉，这里只有 3~9 个小图，淡入即可。 -->
                    <Transition name="cp-strip">
                      <div v-if="uploadedImages.length" class="upload-strip">
                        <TransitionGroup name="cp-thumb">
                          <div v-for="image in uploadedImages" :key="image.url" class="upload-card">
                            <img
                              :src="getCloudImageDisplayUrl(image.url)"
                              :alt="image.alt || '上传图片'"
                              class="upload-thumb"
                              loading="lazy"
                            />
                            <button
                              type="button"
                              class="remove-image-btn"
                              aria-label="移除这张图片"
                              @click="removeDraftImage(image.url)"
                            >
                              ×
                            </button>
                          </div>
                        </TransitionGroup>
                      </div>
                    </Transition>

                    <Transition name="cp-status">
                      <div v-if="cloudState.upload.uploading" class="composer-status">
                        <div class="composer-status-track" aria-hidden="true">
                          <div
                            class="composer-status-fill"
                            :style="{ width: `${cloudState.upload.progress}%` }"
                          ></div>
                        </div>
                        <span class="composer-status-text">
                          {{ cloudState.upload.phase === 'compressing' ? '压缩中' : '上传中' }}
                          {{ cloudState.upload.progress }}%
                        </span>
                        <button type="button" class="composer-text-btn" @click="cancelUpload">
                          取消
                        </button>
                      </div>
                    </Transition>

                    <!-- 上传失败：**必须把原因写出来**。改造前这里只有「N 张图片上传失败」，
                         真实原因（限流 / 未登录 / 目录不合法 / 网络）被丢在岛里 ——
                         用户报障「为啥还有图片上传失败也不显示原因」即此。 -->
                    <Transition name="cp-status">
                      <div
                        v-if="!cloudState.upload.uploading && cloudState.upload.failedImages.length"
                        class="composer-status is-error"
                        role="alert"
                      >
                        <div class="composer-failed">
                          <strong class="composer-failed-title">
                            {{ cloudState.upload.failedImages.length }} 张图片上传失败
                          </strong>
                          <ul class="composer-failed-list">
                            <li v-for="failed in failedUploadItems" :key="failed.name">
                              <span class="composer-failed-name">{{ failed.name }}</span>
                              <span class="composer-failed-reason">{{ failed.error }}</span>
                            </li>
                            <li
                              v-if="
                                cloudState.upload.failedImages.length > failedUploadItems.length
                              "
                              class="composer-failed-more"
                            >
                              另有
                              {{ cloudState.upload.failedImages.length - failedUploadItems.length }}
                              张同样原因失败
                            </li>
                          </ul>
                        </div>
                        <button type="button" class="composer-text-btn" @click="retryFailedUploads">
                          重试
                        </button>
                      </div>
                    </Transition>
                  </div>

                  <footer class="composer-foot">
                    <input
                      ref="imageInputRef"
                      type="file"
                      class="hidden-file-input"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      @change="handleImageSelection"
                    />
                    <button
                      type="button"
                      class="composer-tool"
                      :disabled="cloudState.upload.uploading"
                      @click="openImagePicker"
                    >
                      <ImagePlus :size="18" :stroke-width="1.9" aria-hidden="true" />
                      <span>图片</span>
                      <span v-if="uploadedImages.length" class="composer-tool-count">{{
                        uploadedImages.length
                      }}</span>
                    </button>
                    <button
                      type="button"
                      class="composer-tool"
                      :class="{ 'is-on': Boolean(draftMood) }"
                      :aria-expanded="isMoodTrayOpen ? 'true' : 'false'"
                      @click="toggleMoodTray"
                    >
                      <Smile :size="18" :stroke-width="1.9" aria-hidden="true" />
                      <span>{{
                        draftMood ? `${selectedMoodMeta?.icon || ''} ${draftMood}` : '心情'
                      }}</span>
                    </button>
                    <button
                      type="button"
                      class="composer-submit"
                      :disabled="
                        cloudState.publish.publishing ||
                        (!draftText.trim() && uploadedImages.length === 0)
                      "
                      @click="publishEntry"
                    >
                      {{ cloudState.publish.publishing ? '发布中…' : '发布' }}
                    </button>
                  </footer>
                </section>
              </div>
            </Transition>

            <Transition name="cp-status">
              <div v-if="noticeText" class="notice-bar">{{ noticeText }}</div>
            </Transition>

            <!-- 手势宿主：捏合改列数（仿 iOS 图库），列数经 CSS 变量下发给网格。
                 touchmove 必须是**非 passive** 才能在两指时 preventDefault 掉浏览器缩放
                 （Vue 的 @touchmove 默认就是非 passive；别加 .passive 修饰符）。
                 wheel 分支服务 Mac 触控板：浏览器把「双指捏合」报成 ctrlKey=true 的 wheel。 -->
            <section
              ref="albumSectionRef"
              class="gallery-section album-gallery-section"
              :style="{ '--album-columns': resolvedAlbumColumns }"
              @touchstart.passive="onAlbumTouchStart"
              @touchmove.passive="cancelTileLongPress"
              @touchend.passive="onAlbumPinchEnd"
              @touchcancel.passive="onAlbumPinchEnd"
              @wheel="onAlbumWheel"
            >
              <!-- 2026-11-04 第二轮：原「相册工具行」（选择 / 回收站）已拆掉 ——
                   选择收进头部动作区当按钮、回收站升成顶部 tab 的独立页面。
                   这里不再占一行，网格直接从顶部开始（竖屏那行 32px 对图库密度是实打实的损失）。 -->
              <div
                v-if="entriesLoadError && entries.length > 0"
                class="gallery-inline-feedback warning"
              >
                <span>{{ entriesLoadError }}</span>
                <button type="button" class="ghost-link feedback-action" @click="loadEntries">
                  重新加载
                </button>
              </div>

              <div
                v-else-if="isShowingCachedEntries && entries.length > 0"
                class="gallery-inline-feedback"
              >
                <span>正在显示最近一次成功同步的 Cloud+ 内容，后台会继续尝试刷新。</span>
                <button type="button" class="ghost-link feedback-action" @click="loadEntries">
                  立即刷新
                </button>
              </div>

              <div v-if="isInitialLoading" class="gallery-grid skeleton-grid" aria-hidden="true">
                <article
                  v-for="item in skeletonCards"
                  :key="item.id"
                  class="cloud-card skeleton-card"
                  :class="item.variant"
                >
                  <div class="skeleton-block skeleton-visual"></div>
                  <div class="card-body skeleton-body">
                    <div class="skeleton-block skeleton-date"></div>
                    <div class="skeleton-block skeleton-title"></div>
                    <div class="skeleton-block skeleton-title short"></div>
                    <div class="skeleton-block skeleton-text"></div>
                    <div class="skeleton-block skeleton-text short"></div>
                    <div class="skeleton-block skeleton-footer"></div>
                  </div>
                </article>
              </div>
              <div v-else-if="hasEntriesLoadFailure" class="empty-state loading-error">
                <Cloud class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
                <h4>Cloud+ 暂时没有连上</h4>
                <p>{{ entriesLoadError }}</p>
                <button type="button" class="primary-btn" @click="loadEntries">重新加载</button>
              </div>
              <div
                v-else-if="filteredEntries.length === 0 && activeGalleryEntries.length === 0"
                class="empty-state"
              >
                <Cloud class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
                <h4>这里还空着</h4>
                <p>发布第一条内容后，它会像相册卡片一样出现在这里。</p>
              </div>
              <div v-else-if="filteredEntries.length === 0" class="empty-state filter-empty-state">
                <Search class="empty-icon" :size="38" :stroke-width="1.7" aria-hidden="true" />
                <h4>没有匹配到结果</h4>
                <p>试试更换关键词、放宽日期范围，或者清除当前筛选。</p>
                <button type="button" class="secondary-btn" @click="resetGalleryFilters">
                  清除筛选
                </button>
              </div>

              <div v-else class="album-flow">
                <!-- 2026-10-02 去掉月份分组：改回 iOS 图库那种「一整片图直接密铺」。
                     原实现是「一个月一个 <section> + 一条标题行（『2026年9月 · N 条』）+ 一个独立网格」，
                     在密集网格里这些横条会把相册切成一段段、每段还各起一列，正是 iOS 图库没有的东西。
                     现在只有一个网格、一条列表，日期只在点开详情后出现。 -->
                <!-- 2026-10-02 性能修复（报障：滑动不流畅、内容一直闪烁）：
                     ① TransitionGroup 对 26+ 个格子做 FLIP move 动画（transform 0.4s），
                        滚动中任何更新都会让整片格子重新布局测量；
                     ② `--item-index` 逐格错峰淡入，30 格 × 0.04s = 首屏连续闪烁 1.2s。
                     iOS 图库的格子也是直接出现 —— 这里改回普通 div，不做逐格动画。 -->
                <div
                  class="gallery-grid album-tile-grid"
                  :class="{ 'is-settling': isAlbumSettling }"
                >
                  <article
                    v-for="tile in albumTiles"
                    :key="tile.key"
                    class="gallery-tile"
                    :class="[
                      `tile-${tile.entry.entryType}`,
                      {
                        'is-selectable': isSelectMode && Boolean(tile.imageUrl),
                        'is-selected': isTileSelected(tile),
                      },
                    ]"
                    :style="tile.lqipUrl ? { backgroundImage: `url(${tile.lqipUrl})` } : undefined"
                    @pointerdown="handleTilePointerDown(tile, $event)"
                    @pointerup="cancelTileLongPress"
                    @pointerleave="cancelTileLongPress"
                    @pointercancel="cancelTileLongPress"
                    @contextmenu.prevent="handleTileContextMenu(tile)"
                    @click="handleTileClick(tile, $event)"
                  >
                    <span
                      v-if="isSelectMode && tile.imageUrl"
                      class="tile-check"
                      :class="{ checked: isTileSelected(tile) }"
                      aria-hidden="true"
                    >
                      <Check v-if="isTileSelected(tile)" :size="13" :stroke-width="3.2" />
                    </span>
                    <template v-if="tile.imageUrl">
                      <img
                        :src="tile.displayUrl"
                        :alt="tile.entry.title || 'Cloud cover'"
                        class="tile-cover cloud-loading-image"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        @load="handleCloudImageLoaded"
                        @error="retryCloudImageLoad"
                      />
                      <!-- 多图贴的每张图都各占一格了（2026-10-02），「N 图」角标失去意义；
                           心情角标只在同一条内容的第一格出现，避免同一心情刷满一片格子。 -->
                      <span
                        v-if="tile.entry.mood && tile.isFirstOfEntry"
                        class="mood-badge tile-mood-badge"
                      >
                        {{ resolveMoodMeta(tile.entry.mood)?.icon || '•' }}
                      </span>
                    </template>
                    <div v-else class="tile-paper">
                      <h5 class="tile-paper-title">
                        {{ tile.entry.title || defaultTitle(tile.entry) }}
                      </h5>
                      <p class="tile-paper-text">
                        {{ tile.entry.previewText || '这条内容没有文字预览。' }}
                      </p>
                      <span class="tile-paper-date">{{
                        formatEntryDate(tile.entry.entryDate, tile.entry.updatedAt)
                      }}</span>
                    </div>
                  </article>
                </div>

                <div class="album-flow-actions">
                  <button
                    v-if="canLoadMoreEntries"
                    type="button"
                    class="secondary-btn album-load-more-btn"
                    @click="loadMoreGalleryEntries"
                  >
                    加载更多
                  </button>
                  <button
                    v-if="visibleFilteredEntries.length > GALLERY_INITIAL_LIMIT"
                    type="button"
                    class="ghost-link album-top-btn"
                    @click="scrollAlbumToTop"
                  >
                    回到顶部
                  </button>
                </div>
              </div>
            </section>
          </template>
        </template>
      </main>
    </div>

    <button
      v-if="
        cloudTab === 'content' && isLoggedIn && !isComposerOpen && !selectedEntry && !isSelectMode
      "
      type="button"
      class="gallery-fab"
      aria-label="新建 Cloud+ 内容"
      @click="openComposer"
    >
      ＋
    </button>

    <!-- 多选操作条：固定在全局底栏上方（与 .gallery-fab 同一底距口径） -->
    <Transition name="cp-status">
      <div v-if="isSelectMode" class="album-select-bar" role="toolbar" aria-label="图片选择操作">
        <span class="album-select-count">已选 {{ selectedTileCount }} 张</span>
        <button type="button" class="ghost-link" @click="toggleSelectAllVisibleImages">
          {{ isAllVisibleImagesSelected ? '取消全选' : '全选' }}
        </button>
        <button type="button" class="ghost-link" @click="exitSelectMode">取消</button>
        <button
          type="button"
          class="danger-btn album-select-delete"
          :disabled="selectedTileCount === 0 || isDeletingSelected"
          @click="deleteSelectedImages"
        >
          {{ isDeletingSelected ? '删除中…' : '删除' }}
        </button>
      </div>
    </Transition>

    <!-- 横屏左栏（2026-10-26）：图库补齐「左右栏布局」，与「我」/ 首页 / 他人空间 / BOH
         共用同一份组件与同一份 navItems 单源，current-tab 传 'cloud' —— 进图库后左栏仍高亮
         「图库」席。embedded（内嵌进「我」页的面板）不挂：那时宿主自己已经有一条左栏。
         可见性与让位规则在 landscape-rail.css 的 body.page-bohcloudplus 段。 -->
    <UserSpaceSideRail
      v-if="!isDesktopEmbed"
      :nav-items="BOTTOM_NAV_ITEMS"
      current-tab="cloud"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      :current-theme="currentTheme"
      :is-logged-in="isLoggedIn"
      @preload-tab="preloadUserSpaceForNav"
      @nav-click="handleBottomNavClick"
      @action="handleRailAction"
    />

    <!-- 全站底栏（2026-10-22 接入）：Cloud+ 自己是第五席「图库」，
         页面内必须能看到底栏才切得走（原来这里是 Cloud+ 私有的三席胶囊，已上移成 SegmentTabs）。
         接线与 Home/index.vue:81-93 同一份：同一 store 的未读数、同一份 BOTTOM_NAV_ITEMS。
         bottom-nav.css 由 UserSpaceBottomNav.vue 自己的 <style src> 带进来，这里不用再引。 -->
    <UserSpaceBottomNav
      :visible="true"
      :hidden="bottomNavHidden"
      :nav-items="BOTTOM_NAV_ITEMS"
      current-tab="cloud"
      :nav-indicator-style="bottomNavIndicatorStyle"
      :has-unread-messages="hasUnreadMessages"
      :unread-count="unreadCount"
      @preload-tab="preloadUserSpaceForNav"
      @nav-click="handleBottomNavClick"
    />

    <!-- 2026-10-03 动效：详情是**放大展开 / 缩回**的进出场（Transition 挂 .detail-overlay），
         transform-origin 由 openEntry 写入的 --detail-origin-x/y 决定 = 点中的那一格中心。
         进出场规则见 style.scoped.css 的 .cloud-detail-* 段。 -->
    <Transition name="cloud-detail">
      <div
        v-if="selectedEntry"
        class="detail-overlay"
        :style="{ '--detail-origin-x': detailOrigin.x, '--detail-origin-y': detailOrigin.y }"
        @click.self="closeEntry"
      >
        <div class="detail-modal">
          <button type="button" class="detail-close" @click="closeEntry">×</button>
          <div class="detail-head">
            <div>
              <span class="section-kicker">{{ selectedEntryKicker }}</span>
              <h3>{{ selectedEntry.title || defaultTitle(selectedEntry) }}</h3>
              <p>
                {{ formatEntryDate(selectedEntry.entryDate, selectedEntry.updatedAt) }}
                <!-- 可见性必须明示：报障「已经是公开的帖子为什么还有设为公开按钮」——
                   状态藏在按钮里用户看不见，放在日期旁边一眼可查。 -->
                <span class="detail-visibility" :class="{ 'is-public': isSelectedEntryPublic }">{{
                  isSelectedEntryPublic ? '已公开' : '私密'
                }}</span>
              </p>
            </div>
            <div class="detail-actions">
              <span v-if="selectedEntry.mood" class="detail-mood">
                {{ resolveMoodMeta(selectedEntry.mood)?.icon || '•' }} {{ selectedEntry.mood }}
              </span>
              <template v-if="selectedEntrySource === 'mine'">
                <!-- 2026-10-02 产品口径：Cloud+ = 作品照片的**私密备份库**，「设为公开」入口取消。
                   对外可见走两条路：token 令牌分享（已有）/ 转为帖子（plans/023 待做）。
                   存量已公开条目不迁移：仍计入作品格，由「去作品格管理」出口维护；
                   私密条目只给「删除」（备份库里的增删是用户自己的事）。 -->
                <button
                  v-if="isSelectedEntryPublic"
                  type="button"
                  class="secondary-btn detail-public-btn"
                  @click="goWorksGrid"
                >
                  去作品格管理
                </button>
                <!-- Phase 4（plans/023）：对外可见的第二条路 —— 把备份转为帖子。
                   图片直接复用 Cloudinary url（不二次上传），经论坛草稿通道预填发帖器。
                   2026-10-03：论坛同步来的条目（source==='forum'）本身就是帖子，不再出现此入口，
                   判据收口在 canConvertSelectedEntryToPost（见 script 里的说明）。 -->
                <button
                  v-if="canConvertSelectedEntryToPost"
                  type="button"
                  class="secondary-btn detail-public-btn"
                  @click="convertEntryToPost(selectedEntry)"
                >
                  转为帖子
                </button>
                <button type="button" class="danger-btn" @click="removeEntry(selectedEntry)">
                  删除
                </button>
              </template>
            </div>
          </div>

          <div class="detail-content">
            <template
              v-for="(block, index) in selectedEntry.contentBlocks"
              :key="`${selectedEntry.id}-${index}`"
            >
              <p v-if="block.type === 'text'" class="detail-text">{{ block.text }}</p>
              <figure v-else class="detail-image-wrap">
                <img
                  :src="resolveDbDetailImage(block.url)"
                  :alt="block.alt || 'BOH Cloud 图片'"
                  class="detail-image cloud-loading-image"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  @load="handleCloudImageLoaded"
                  @error="retryCloudImageLoad"
                  loading="lazy"
                />
                <!-- alt 是上传时的系统默认值（如「论坛图片」），展示出来只是一条灰杠；语义保留在 DOM 属性里 -->
                <figcaption v-if="block.alt" class="sr-only">{{ block.alt }}</figcaption>
              </figure>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import {
  computed,
  ref,
  watch,
  onMounted,
  onUnmounted,
  onActivated,
  onDeactivated,
  reactive,
} from 'vue';
import { useDebounce } from '@/composables/useDebounceThrottle';
import { storeToRefs } from 'pinia';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  Cloud,
  ImagePlus,
  RotateCcw,
  Search,
  Smile,
  Trash2,
  X,
} from 'lucide-vue-next';
import { takeCameraCapture } from '@/utils/camera-capture-bridge.js';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import CloudStorageBar from './CloudStorageBar.vue';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';
/* 底栏滚动方向隐藏（2026-11-04 用户报障「竖屏滚动时底部导航栏不会消失」）：
   首页 / 我 / 周边三个宿主都接了同一个 composable，图库接底栏时漏了这一步 ——
   于是图库是唯一一个「滚到底栏还钉在屏底」的主页面。
   它是 document 级 scroll 捕获（Cloud+ 走 body 滚动），与 .cloud-page 的长文档流同构。 */
import { useScrollDirectionHide } from '@/views/user-center/UserSpace/composables/useScrollDirectionHide.js';
import { useAuthStore } from '@/stores/auth';
import { moodChoices, getMoodMeta } from './config.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import {
  uploadImageToCloudinary,
  assertCloudinaryUploadAllowed,
  isCloudinaryNoteUploadConfigured,
  deleteCloudinaryAssetByToken,
  supportsCloudinaryClientDeleteToken,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
} from '@/utils/cloudinary-client.js';
/* 相册格子的图走 db-image-url 的 Cloud+ 档变换（缩略图 + LQIP 占位）。
   此前格子用的是 `getCloudinaryDisplayUrl` —— 那只换主机不换尺寸，等于让 78px 的格子
   拉 1200px 的原图，是「滚动闪白 + 顿挫」的根因。详见 utils/db-image-url.js 的注释。 */
import {
  resolveDbCloudCoverImage,
  resolveDbCloudTileImage,
  resolveDbDetailImage,
} from '@/utils/db-image-url.js';
import { buildAlbumTiles } from '@/utils/cloud-album-tiles.js';
import {
  CLOUD_UPLOAD_BURST_LIMIT,
  CLOUD_UPLOAD_BURST_WINDOW_MS,
  validateImageFileBasics,
  registerCloudUploadBurst,
  resolveCloudUploadConcurrency,
} from '@/utils/cloud-upload-guard.js';
import {
  createMyCloudEntry,
  disableMyCloudShareChannel,
  getMyCloudShareChannel,
  getMyCloudShareViewers,
  getSharedCloudChannelByToken,
  listMyCloudEntries,
  normalizeCloudShareToken,
  revokeMyCloudShareToken,
  setMyCloudShareDescription,
  upsertMyCloudShareChannel,
  CLOUD_PLUS_UPLOAD_SOURCE,
  CLOUD_PLUS_CLOUDINARY_FOLDER,
} from '@/utils/api/boh-cloud-api.js';
import { normalizeDbError } from '@/utils/request-core.js';
import { serializeCloudTextAndImages, cloudEntryDefaultTitle } from '@/utils/boh-cloud-content.js';
import {
  computeCloudStorageAccounting,
  isPublicCloudEntry,
  normalizeCloudVisibility,
} from '@/utils/cloud-storage-accounting.js';
import { deleteCloudEntryWithAssets } from '@/utils/cloud-entry-maintenance.js';
import {
  deleteCloudEntryImages,
  listMyTrashedImages,
  purgeCloudImageTrash,
  restoreCloudImageTrash,
} from '@/utils/api/cloud-image-trash-api.js';
import {
  TRASH_RETENTION_DAYS,
  groupSelectedTileKeys,
  isForumEntryTitleOnly,
  listDeletableImageBlocks,
  removeImageBlocks,
  resolveCoverAfterRemoval,
} from '@/utils/cloud-image-trash.js';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  resolveCloudBenefitFromSubscriptions,
} from '@/utils/subscription-benefits.js';
import { logger } from '@/utils/logger.js';
import { createCloudSettingsSubscriptionLocation } from '@/utils/user-space-navigation.js';
import { isDialogBusy, useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { showIsland } from '@/composables/useIsland.js';
/* 2026-10-22：Cloud+ 接入全站底栏第五席。
   SegmentTabs 从 UserSpace/components 跨目录引用有先例（Newsroom/index.vue:319 同样这么引）。 */
import SegmentTabs from '@/views/user-center/UserSpace/components/SegmentTabs.vue';
import UserSpaceBottomNav from '@/views/user-center/UserSpace/components/UserSpaceBottomNav.vue';
/* 横屏左栏（2026-10-26）：图库补齐左右栏布局，与「我」/首页/他人空间/BOH 用同一份组件 */
import UserSpaceSideRail from '@/views/user-center/UserSpace/components/UserSpaceSideRail.vue';
import { preloadProfileStyles } from '@/views/user-center/UserSpace/async-loaders.js';
import { BOTTOM_NAV_ITEMS } from '@/config/bottom-nav';
import { getNotificationStoreRef } from '@/stores/notification-loader';
import { themeManager } from '@/utils/theme-manager.js';
import { logoutAndReload } from '@/utils/logout-and-reload.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const dialog = useConfirmDialog();
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
});

const isDesktopEmbed = computed(
  () => props.embedded || String(route.query.embed || '') === 'desktop',
);

/* 左栏「更多」菜单要按当前主题显示「深色 / 浅色模式」，所以这里跟一份只读的主题态。
   ⚠️ 监听的是 themeManager 派发的 window 事件（全站唯一真源），不是在本地改属性。 */
const currentTheme = ref(themeManager.getTheme());
const handleThemeChanged = () => {
  currentTheme.value = themeManager.getTheme();
};
const imageInputRef = ref(null);
const albumSectionRef = ref(null);
const entries = ref([]);
const subscriptions = ref([]);
const myShareChannel = ref(null);
const shareViewers = ref([]);
const sharedChannel = ref(null);
const sharedEntries = ref([]);
const selectedEntry = ref(null);
const selectedEntrySource = ref('mine');
const isSharedContentCollapsed = ref(false);

/* ── 多选删除 + 回收站（plans/039）───────────────────────────────────────────
   多选粒度 = **格子**（一张图），不是条目：图库本来就把一条内容摊平成多个格子，
   而删除 RPC 的入参是「一条内容 + 一组 block 下标」⇒ 这里存 key，提交前按条目归组。

   key 口径与 albumTiles 完全一致（`${entryId}::${index}`），不另造一套 id；
   纸片格（纯文字条目）不参与选择 —— 那类删除走详情页整条删除。 */
const isSelectMode = ref(false);
const selectedTileKeys = ref(new Set());
const isDeletingSelected = ref(false);
const suppressTileClick = ref(false);
let tileLongPressTimer = null;

/* 回收站（2026-11-04 第二轮）：从弹层改成独立页面后，开合状态不再存在 ——
   页面在不在由 `cloudTab === 'trash'` 决定，加载时机交给 applyCloudPlusRouteView。 */
const isTrashLoading = ref(false);
const trashItems = ref([]);
const trashSelectedIds = ref(new Set());
const isRestoringTrash = ref(false);
const isPurgingTrash = ref(false);
const restorableTrashIds = computed(() =>
  trashItems.value.filter((item) => !item.expired).map((item) => item.id),
);
const isAllRestorableTrashSelected = computed(() => {
  const ids = restorableTrashIds.value;
  return ids.length > 0 && ids.every((id) => trashSelectedIds.value.has(id));
});

const selectedTileCount = computed(() => selectedTileKeys.value.size);
const isAllVisibleImagesSelected = computed(() => {
  const keys = albumTiles.value.filter((tile) => tile.imageUrl).map((tile) => tile.key);
  return keys.length > 0 && keys.every((key) => selectedTileKeys.value.has(key));
});
const noticeText = ref('');
const draftTitle = ref('');
const draftText = ref('');
const draftMood = ref('');
const searchQuery = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const sharedTokenInput = ref('');
const shareDescriptionDraft = ref('');
const uploadedImages = ref([]);

// 合并状态管理
const cloudState = reactive({
  content: {
    loading: false,
    error: null,
    hasLoaded: false,
    isShowingCached: false,
    activeUserId: '',
    lastFetchTime: null,
  },
  share: {
    loading: false,
    error: null,
    tokenState: 'idle', // 状态机: idle → loading → active → error
    loadingViewers: false,
    viewersError: null,
    saving: false,
    loadingShared: false,
    sharedError: null,
    abortController: null, // 用于取消共享频道请求
  },
  upload: {
    uploading: false,
    // 'compressing' | 'uploading' —— 压缩与上传共用一根进度条，阶段只决定文案
    phase: 'uploading',
    progress: 0,
    currentFile: null,
    failedImages: [],
    abortController: null, // 用于取消图片上传
  },
  publish: {
    publishing: false,
  },
});

// 保留原有的 ref 变量用于向后兼容（模板中使用）
const isLoading = computed(() => cloudState.content.loading);
const isLoadingMyShareChannel = computed(() => cloudState.share.loading);
const isLoadingShareViewers = computed(() => cloudState.share.loadingViewers);
const isSavingShareChannel = computed(() => cloudState.share.saving);
const isLoadingSharedChannel = computed(() => cloudState.share.loadingShared);
const hasLoadedEntries = computed(() => cloudState.content.hasLoaded);
const entriesLoadError = computed({
  get: () => cloudState.content.error || '',
  set: (val) => (cloudState.content.error = val),
});
const isShowingCachedEntries = computed({
  get: () => cloudState.content.isShowingCached,
  set: (val) => (cloudState.content.isShowingCached = val),
});
const sharedChannelError = computed({
  get: () => cloudState.share.sharedError || '',
  set: (val) => (cloudState.share.sharedError = val),
});
const shareViewersError = computed({
  get: () => cloudState.share.viewersError || '',
  set: (val) => (cloudState.share.viewersError = val),
});
const isPublishing = computed(() => cloudState.publish.publishing);
const isUploadingImages = computed(() => cloudState.upload.uploading);
const currentFilter = ref('all');
const isComposerOpen = ref(false);
/* 心情抽屉默认收起（2026-10-18）：9 个情绪胶囊常驻时在竖屏要占 3 行 117px，
   而绝大多数条目根本不标心情 —— 收进一个开关里，用的时候才展开。 */
const isMoodTrayOpen = ref(false);
const isFilterPanelOpen = ref(false);
const cloudinaryCleanupLocks = new Set();
let uploadAttemptTimestamps = [];
const CLOUD_BATCH_LIMIT = 9;
const CLOUD_ENTRIES_CACHE_VERSION = 'v3'; // 升级缓存版本以支持新字段
const CLOUD_ENTRIES_CACHE_MAX_SIZE = 50; // 限制缓存大小
const SKELETON_CARD_COUNT = 6;
const GALLERY_INITIAL_LIMIT = 30;
const GALLERY_LOAD_MORE_STEP = 30;
const SHARED_TOKEN_STORAGE_KEY = 'boh_cloud:last_shared_token';
const visibleEntryLimit = ref(GALLERY_INITIAL_LIMIT);

// 防抖优化 - 分享描述保存（500ms）
const { debouncedFn: debouncedSaveShareDescription, cancel: cancelSaveShareDescription } =
  useDebounce(async (description) => {
    if (!isLoggedIn.value || !userInfo.value?.id) {
      showNotice('请先登录后再设置频道描述');
      authStore.showLoginModal = true;
      return;
    }

    const nextDescription = description.trim().slice(0, 160);
    if (nextDescription === String(myShareChannel.value?.description || '').trim()) return;

    cloudState.share.saving = true;
    try {
      const result = myShareChannel.value?.shareToken
        ? await setMyCloudShareDescription(nextDescription)
        : await upsertMyCloudShareChannel({
            regenerate: false,
            description: nextDescription,
          });
      if (!result.ok) {
        showNotice(result.error?.message || '频道描述保存失败');
        return;
      }

      replaceLocalShareChannel(result.data || null);
      showNotice('频道描述已保存');
    } finally {
      cloudState.share.saving = false;
    }
  }, 500);

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'mixed', label: '图文' },
  { value: 'text', label: '文字' },
];

const selectedMoodMeta = computed(() => getMoodMeta(draftMood.value));

/* 正文「多字扩展」走全站单一实现（composables/useAutoGrowTextarea.js）。
   改造前这里是固定 `rows="8"`：写长了框内滚动、写短了留一大片空白，
   而站内其余输入框（论坛回复 / 详情评论 / 发帖标题）早已收敛到该 composable。
   ⚠️ 上限只声明在 CSS 的 `.composer-text-input { max-height }`，JS 不写第二份像素值；
   传 getter 而不是 `() => unref(draftText)` —— 后者让 watcher 依赖恒为同一函数、永不触发。 */
const { textareaRef: draftTextareaRef } = useAutoGrowTextarea({
  value: () => draftText.value,
});
const cloudTab = computed(() => {
  const view = String(route.query.view || route.query.mode || '').trim();
  if (['settings', 'share', 'trash'].includes(view)) return view;
  return 'content';
});

/* 2026-10-03 动效：内容 / 分享 / 设置三档切换时，右区整体走一次「淡入 + 轻微上浮」。
   为什么用 JS 开关类而不是给每档挂 mount 动画：
     · 内容档是 `<template v-else>`，根节点是**条件渲染**的（cloudModeBanner 可能不存在），
       没有稳定的单元素可挂，三档也就没法共用同一条规则；
     · 统一挂 .cloud-main 上，三档切换观感一致，且只有**一个**元素参与动画。
   只动 opacity + translateY，不动布局几何（探索针读 rect 不受影响）。
   ⚠️ 与切列回弹同理：必须 false → 下一帧 true，否则同一帧内的类名增删会被合并、动画不重播。 */
const isViewEntering = ref(false);
let viewEnterTimer = null;

watch(cloudTab, () => {
  isViewEntering.value = false;
  requestAnimationFrame(() => {
    isViewEntering.value = true;
  });
  clearTimeout(viewEnterTimer);
  viewEnterTimer = setTimeout(() => {
    isViewEntering.value = false;
  }, 320);
});
/* 副标题只说一件用户真正会犹豫的事（要不要写标题 / 能不能只发图），
   不再复述「像写一页备忘录一样记录今天」这类比喻文案。 */
const composerSubtitle = computed(() =>
  uploadedImages.value.length
    ? '可以只发图片，标题和正文都可以留空。'
    : '只写文字也可以，标题不是必填。',
);
/* 视图分段（2026-10-22）：原 `cloudBottomNavItems`（底部 fixed 胶囊的三席）改为页面内
   SegmentTabs 的 sections。三个 id 与 ?view= 取值一一对应，`switchCloudTab` 原样接
   SegmentTabs 的 `update:modelValue` —— 路由机制没变，只是切换控件从底部搬到顶部。 */
const cloudTabSections = [
  { id: 'content', label: '内容' },
  // 回收站是**独立页面**而不是内容页里的弹层（2026-11-04 第二轮用户口径）：
  // 它有自己的标题/说明/空态，恢复后要能说清图片回到了哪条内容。
  { id: 'trash', label: '回收站' },
  { id: 'share', label: '分享' },
  { id: 'settings', label: '设置' },
];
const cloudPageHero = computed(() => {
  if (cloudTab.value === 'trash') {
    return {
      eyebrow: 'Recycle Bin',
      title: '回收站',
      subtitle: `删除的图片保留 ${TRASH_RETENTION_DAYS} 天，期间可以恢复到原内容。`,
    };
  }
  if (cloudTab.value === 'share') {
    return {
      eyebrow: 'Share',
      title: '分享',
      subtitle: '管理私密令牌频道，或用访问令牌查看别人分享的 Cloud+。',
    };
  }
  if (cloudTab.value === 'settings') {
    return {
      eyebrow: 'Settings',
      title: 'Cloud+ 设置',
      subtitle: '管理 Cloud+ 图片使用限额。',
    };
  }
  return {
    eyebrow: 'Private Space',
    title: '内容',
    subtitle: '私密空间 · 全部存储。这里陈列私密笔记；公开笔记在作品格展示，占用同一份额度。',
  };
});
/* 页头的返回按钮已删除（2026-11-05，理由见模板顶部注释）：图库是底栏席位，
   离开靠底栏 / 左栏；原先那个返回恒落「我」页，与用户来路无关。
   两个「返回落点」工具只服务于它，一并下掉，避免留下无调用方的 import。 */
const openSubscriptionsFromCloudSettings = () => {
  router.push(createCloudSettingsSubscriptionLocation());
};
const hasActiveFilters = computed(() =>
  Boolean(searchQuery.value || dateFrom.value || dateTo.value),
);
const hasGalleryFilters = computed(() => currentFilter.value !== 'all' || hasActiveFilters.value);
const activeFilterCount = computed(
  () =>
    (currentFilter.value !== 'all' ? 1 : 0) +
    (normalizeDateInput(dateFrom.value) ? 1 : 0) +
    (normalizeDateInput(dateTo.value) ? 1 : 0),
);
const currentCloudBenefit = computed(() =>
  resolveCloudBenefitFromSubscriptions(subscriptions.value),
);
const currentCloudImageLimit = computed(() =>
  Number(currentCloudBenefit.value.cloudImageLimit || DEFAULT_CLOUD_IMAGE_LIMIT),
);
const normalizedSharedTokenInput = computed(() => normalizeCloudShareToken(sharedTokenInput.value));
const sharedChannelTitle = computed(() => {
  const nickname = String(sharedChannel.value?.ownerNickname || '').trim();
  const username = String(sharedChannel.value?.ownerUsername || '').trim();
  return nickname || username ? `${nickname || username} 的 BOH Cloud` : '共享 Cloud+ 频道';
});
const activeShareChannelLabel = computed(() => '私密令牌频道');
const cloudModeBanner = computed(() => null);
const isInitialLoading = computed(
  () => isLoading.value && !hasLoadedEntries.value && entries.value.length === 0,
);
const hasEntriesLoadFailure = computed(
  () => Boolean(entriesLoadError.value) && !isLoading.value && entries.value.length === 0,
);
const showRefreshIndicator = computed(() => isLoading.value && !isInitialLoading.value);
// 主列表只陈列私密内容；公开笔记是账目（只读分组），两者都计入存储记账。
const publicEntries = computed(() => entries.value.filter((entry) => isPublicCloudEntry(entry)));
const cloudAccounting = computed(() =>
  computeCloudStorageAccounting({
    entries: entries.value,
    limit: currentCloudImageLimit.value,
  }),
);
/**
 * 相册条目顺序：**降序 —— 最新的在最上面**（2026-10-02 与产品确认过两次，
 * 中途试过升序又改回降序，别再翻）。
 * 顺序来自 API 的 `.order('entry_date', { ascending: false, nullsFirst: false })`（内容日期），
 * 视图层不重排：一旦在这里加 sort，就会和「加载更多」的分页游标各排各的，出现重复/漏项。
 *
 * 2026-10-02 产品口径：相册显示**全部备份**（含存量已公开条目，详情里有「已公开」徽章与
 * 「去作品格管理」出口）—— Cloud+ 定位从「私密 + 手动公开」收敛为「私密备份库」，
 * 不再按可见性把一半备份藏起来；「设为公开」入口已随口径取消。
 */
const activeGalleryEntries = computed(() => entries.value);
const isSelectedEntryPublic = computed(() => isPublicCloudEntry(selectedEntry.value));
/**
 * 「转为帖子」入口的显示条件（2026-10-03 报障：已经是帖子了还显示「转为帖子」）。
 *
 * 判据 = **来源不是论坛同步**。`source === 'forum'` 的条目是发帖成功时自动落库的备份
 * （`ForumMain` 的 `createMyCloudEntry({ source: 'forum', sourcePostId })`），
 * 它本身就已经对应一篇论坛帖 —— 再点一次「转为帖子」只会拿同一批图再发一遍，
 * 产出重复内容。其余来源（manual / ai / migrated）才是「还没对外发过的备份」，保留入口。
 *
 * ⚠️ 别改用 visibility 判断：论坛同步条目是 `private`（被 API 锁死禁止设为公开），
 * 用 `isSelectedEntryPublic` 过滤等于一条都挡不住。
 */
const canConvertSelectedEntryToPost = computed(
  () =>
    selectedEntrySource.value === 'mine' &&
    String(selectedEntry.value?.source || '').trim() !== 'forum' &&
    collectEntryImageUrls(selectedEntry.value).length > 0,
);
const selectedEntryKicker = computed(() => {
  if (selectedEntrySource.value === 'shared') return 'BOH Cloud Channel Entry';
  return isSelectedEntryPublic.value ? 'BOH Cloud+ · 已公开 · 作品格' : 'BOH Cloud+ Entry';
});
const skeletonCards = computed(() =>
  Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => ({
    id: `cloud-skeleton-${index}`,
    variant:
      index % 3 === 0
        ? 'skeleton-card-featured'
        : index % 3 === 1
          ? 'skeleton-card-text'
          : 'skeleton-card-mixed',
  })),
);

const filteredEntries = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLowerCase();
  const rawStartKey = normalizeDateInput(dateFrom.value);
  const rawEndKey = normalizeDateInput(dateTo.value);
  const startKey = rawStartKey && rawEndKey && rawStartKey > rawEndKey ? rawEndKey : rawStartKey;
  const endKey = rawStartKey && rawEndKey && rawStartKey > rawEndKey ? rawStartKey : rawEndKey;

  return activeGalleryEntries.value.filter((entry) => {
    if (currentFilter.value !== 'all' && entry.entryType !== currentFilter.value) {
      return false;
    }

    const entryDateKey = resolveEntryDateKey(entry);
    if (startKey && entryDateKey && entryDateKey < startKey) {
      return false;
    }
    if (endKey && entryDateKey && entryDateKey > endKey) {
      return false;
    }
    if ((startKey || endKey) && !entryDateKey) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableText = [
      entry.title,
      entry.previewText,
      entry.mood,
      entry.entryDate,
      entry.updatedAt,
      ...(Array.isArray(entry.contentBlocks)
        ? entry.contentBlocks.map((block) => {
            if (block?.type === 'text') return block.text;
            return [block?.alt, block?.url].filter(Boolean).join(' ');
          })
        : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
});
const visibleFilteredEntries = computed(() =>
  filteredEntries.value.slice(0, visibleEntryLimit.value),
);
const canLoadMoreEntries = computed(
  () => visibleFilteredEntries.value.length < filteredEntries.value.length,
);

/**
 * 相册格子单源（2026-10-02）：把「一条内容」摊平成「一张图一个格子」。
 * 为什么格子 ≠ 条目：多图贴要每张图都直接铺出来，堆成「一张封面 + N 图角标」是卡片语汇，
 * 不是相册语汇。所以这里 flatMap：
 *   · 有图的条目 → 每张图各一个 tile（key 必须带下标，否则同一条目的多格会撞 key）
 *   · 纯文字条目 → 1 个 tile，走 .tile-paper
 * 点任一格都是 openEntry(该条目)：详情里能看到这条内容的全貌。
 */
// key 的后半段是 contentBlocks 的真实下标（不是「第几张图」）——
// 删除 RPC 按 block 下标定位，论坛备份的 blocks 永远是 [标题文字, 图1, 图2…]，
// 用图片序号会整体错位一位（详见 utils/cloud-album-tiles.js 的注释与单测）。
const albumTiles = computed(() => buildAlbumTiles(visibleFilteredEntries.value));

/** 取一条内容的全部图片地址（口径与 utils/cloud-storage-accounting 的图片计数一致：contentBlocks 里 type==='image'） */
function collectEntryImageUrls(entry) {
  const blocks = Array.isArray(entry?.contentBlocks) ? entry.contentBlocks : [];
  const urls = blocks
    .filter((block) => block?.type === 'image')
    .map((block) => String(block?.url || '').trim())
    .filter(Boolean);
  if (urls.length) return urls;
  const cover = String(entry?.coverImageUrl || '').trim();
  return cover ? [cover] : [];
}

/* ---- 相册列数：捏合切换（仿 iOS 图库）----
   分两层值：
     · albumColumnCount —— 用户显式选择（捏合后落盘），null = 还没手动调过
     · autoAlbumColumns —— 按当前宽度算出的自然列数
   再合成 resolvedAlbumColumns 下发 CSS 变量。之所以由 JS 算而不是交给 CSS 的
   `auto-fill`：auto-fill 没法被手势覆盖，横屏（Mac 触控板捏合）就无从调节。
   窄屏固定对齐 iOS 的 5 列（不按宽度算：320 宽的老机型上 iOS 也是 5 列）；
   宽屏按「格宽 ~130px」推列数。
   只走整数档、不做连续缩放：格子可读性只在整数列下成立，整数档才能落盘复用。 */
const ALBUM_COLUMNS_STORAGE_KEY = 'boh-cloud-album-columns';
const ALBUM_NARROW_VIEWPORT = 700;
const ALBUM_NARROW_COLUMNS = 5;
const ALBUM_WIDE_TILE_TARGET = 130;
const ALBUM_COLUMN_MIN = 3;
const ALBUM_COLUMN_MAX = 12;
const albumColumnCount = ref(null);
const autoAlbumColumns = ref(ALBUM_NARROW_COLUMNS);
const resolvedAlbumColumns = computed(() => albumColumnCount.value ?? autoAlbumColumns.value);

/* 2026-10-03 动效：捏合切列时给网格一个「落定」回弹。
   grid-template-columns 本身在多数浏览器里不可过渡（改列数是一步 reflow），
   所以不做「连续缩放」的假象，而是在列数真的变了之后给整片网格一次 280ms 的
   scale/opacity 收束 —— 手感上就是「张手 → 格子收拢到位」，且只有**一个**元素在动，
   不会重蹈 2026-10-02「26 格逐个 FLIP 导致滑动卡顿/闪烁」的覆辙。
   注意：不能直接绑 :class 常驻，否则动画只在首次渲染播一次 —— 必须先落回 false
   再在下一帧置 true（同一帧内 false→true 会被 Vue 合并掉）。 */
const isAlbumSettling = ref(false);
let albumSettleTimer = null;

watch(resolvedAlbumColumns, () => {
  isAlbumSettling.value = false;
  requestAnimationFrame(() => {
    isAlbumSettling.value = true;
  });
  clearTimeout(albumSettleTimer);
  albumSettleTimer = setTimeout(() => {
    isAlbumSettling.value = false;
  }, 300);
});

onUnmounted(() => {
  clearTimeout(albumSettleTimer);
  clearTimeout(viewEnterTimer);
});

try {
  const savedColumns = Number(localStorage.getItem(ALBUM_COLUMNS_STORAGE_KEY));
  if (Number.isFinite(savedColumns) && savedColumns >= ALBUM_COLUMN_MIN) {
    albumColumnCount.value = Math.min(savedColumns, ALBUM_COLUMN_MAX);
  }
} catch {
  // 隐私模式 / 无 storage 时读不到；列数只是观感偏好，回落自动列数即可
}

let lastAlbumSectionWidth = 0;

function measureAutoAlbumColumns(observedWidth) {
  // ResizeObserver 回调里**直接用**它给的 contentRect.width，不要回头读 clientWidth ——
  // 读 clientWidth 会 flush 一次同步布局（这正是本函数注释里要避免的那次抖动；
  // 旧写法把读宽度写在早退判断**之前**，早退其实没挡住这次 flush）。
  // window.resize 那条路径没有观测值（回调首参是 Event，Number(Event) = NaN），才回落去读。
  const width =
    Number(observedWidth) || albumSectionRef.value?.clientWidth || window.innerWidth || 0;
  if (!width) return;
  // 列数只跟**宽度**有关：高度变化（图片陆续加载）不该重算
  if (width === lastAlbumSectionWidth) return;
  lastAlbumSectionWidth = width;
  autoAlbumColumns.value =
    width <= ALBUM_NARROW_VIEWPORT
      ? ALBUM_NARROW_COLUMNS
      : Math.max(
          ALBUM_COLUMN_MIN,
          Math.min(ALBUM_COLUMN_MAX, Math.round(width / ALBUM_WIDE_TILE_TARGET)),
        );
}

function setAlbumColumns(next) {
  const clamped = Math.min(
    Math.max(Math.round(Number(next) || resolvedAlbumColumns.value), ALBUM_COLUMN_MIN),
    ALBUM_COLUMN_MAX,
  );
  if (clamped === resolvedAlbumColumns.value) return;
  albumColumnCount.value = clamped;
  try {
    localStorage.setItem(ALBUM_COLUMNS_STORAGE_KEY, String(clamped));
  } catch {
    // 写不进不影响本次会话的切换效果
  }
}

// 捏合状态：故意用普通对象（不需要响应式，避免每帧触发渲染）
const albumPinch = { active: false, startDistance: 0, startColumns: ALBUM_NARROW_COLUMNS };

// 用 ResizeObserver 而不是只监听 window.resize：图库页宽屏是「铺满」的（.is-gallery 解除 980
// 上限），从设置页切回内容页时容器宽度会变，而 window 不 resize —— 只监听 window 会留下
// 错误的列数。回调只在值真变时赋值，不会形成「改列数 → 触发布局 → 再触发」的环。
let albumResizeObserver = null;

function disconnectAlbumResizeObserver() {
  albumResizeObserver?.disconnect();
  albumResizeObserver = null;
}

function observeAlbumSection(section) {
  disconnectAlbumResizeObserver();
  lastAlbumSectionWidth = 0;
  if (!section) return;

  measureAutoAlbumColumns();
  if (typeof ResizeObserver !== 'undefined') {
    albumResizeObserver = new ResizeObserver((entries) =>
      measureAutoAlbumColumns(entries?.[0]?.contentRect?.width),
    );
    albumResizeObserver.observe(section);
  }
}

// 内容档是条件渲染的：切到设置 / 分享时 section 会卸载，切回时 ref 指向新节点。
// 监听 template ref，保证新节点重新测量并重新接上 ResizeObserver，而不是等窗口 resize。
watch(
  albumSectionRef,
  (section) => {
    if (!section) {
      disconnectAlbumResizeObserver();
      return;
    }

    requestAnimationFrame(() => {
      if (section === albumSectionRef.value) observeAlbumSection(section);
    });
  },
  { flush: 'post' },
);

onMounted(() => {
  window.addEventListener('resize', measureAutoAlbumColumns);
});
onUnmounted(() => {
  window.removeEventListener('resize', measureAutoAlbumColumns);
  disconnectAlbumResizeObserver();
});

function readTouchDistance(touches) {
  const [a, b] = touches;
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// 只有「两指期间」才需要非 passive 的 touchmove（拦默认缩放）。常挂在元素上的话，
// 浏览器每一帧都要等 JS 判断完才敢滚动 —— 单指滑动的流畅度会被整体拖慢，
// 这正是报障「滑动不流畅」的一半原因。所以 touchmove 用完即拆。
let albumPinchMoveBound = false;

function bindAlbumPinchMove() {
  if (albumPinchMoveBound || !albumSectionRef.value) return;
  albumPinchMoveBound = true;
  albumSectionRef.value.addEventListener('touchmove', onAlbumTouchMove, { passive: false });
}

function unbindAlbumPinchMove() {
  if (!albumPinchMoveBound) return;
  albumPinchMoveBound = false;
  albumSectionRef.value?.removeEventListener('touchmove', onAlbumTouchMove);
}

function onAlbumTouchStart(event) {
  if (event.touches?.length !== 2) {
    albumPinch.active = false;
    unbindAlbumPinchMove();
    return;
  }
  albumPinch.active = true;
  albumPinch.startDistance = readTouchDistance(event.touches);
  albumPinch.startColumns = resolvedAlbumColumns.value;
  bindAlbumPinchMove();
}

function onAlbumTouchMove(event) {
  if (!albumPinch.active || event.touches?.length !== 2) return;
  // 两指必须拦掉默认行为，否则浏览器会拿去做页面缩放
  event.preventDefault?.();
  const distance = readTouchDistance(event.touches);
  if (!albumPinch.startDistance || !distance) return;
  const scale = distance / albumPinch.startDistance;
  // 阶梯式而非连续映射：每跨过一档就重置基线，一次张手可以连切 5→4→3
  if (scale >= 1.25) {
    setAlbumColumns(resolvedAlbumColumns.value - 1);
    albumPinch.startDistance = distance;
    albumPinch.startColumns = resolvedAlbumColumns.value;
  } else if (scale <= 0.8) {
    setAlbumColumns(resolvedAlbumColumns.value + 1);
    albumPinch.startDistance = distance;
    albumPinch.startColumns = resolvedAlbumColumns.value;
  }
}

function onAlbumPinchEnd() {
  albumPinch.active = false;
  unbindAlbumPinchMove();
}

/** Mac 触控板：浏览器把「双指捏合」上报成 ctrlKey=true 的 wheel */
function onAlbumWheel(event) {
  if (!event.ctrlKey) return;
  event.preventDefault?.();
  if (event.deltaY < 0) setAlbumColumns(resolvedAlbumColumns.value - 1);
  else if (event.deltaY > 0) setAlbumColumns(resolvedAlbumColumns.value + 1);
}
const totalStoredImages = computed(() => cloudAccounting.value.usedImages);
const draftImageCount = computed(() => uploadedImages.value.length);
const remainingImageQuota = computed(() =>
  Math.max(0, currentCloudImageLimit.value - totalStoredImages.value),
);
const quotaPercent = computed(() => {
  if (currentCloudImageLimit.value <= 0) return 0;
  return Math.min(100, Math.round((totalStoredImages.value / currentCloudImageLimit.value) * 100));
});

function resolveMoodMeta(value) {
  return getMoodMeta(value);
}

function getFilterCount(filter) {
  if (filter === 'all') return activeGalleryEntries.value.length;
  return activeGalleryEntries.value.filter((entry) => entry.entryType === filter).length;
}

function formatDisplayDate(date) {
  const current = new Date(date);
  return `${current.getFullYear()}.${String(current.getMonth() + 1).padStart(2, '0')}.${String(current.getDate()).padStart(2, '0')}`;
}

function formatDateKey(dateKey) {
  const safeKey = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeKey)) return '';
  const [year, month, day] = safeKey.split('-');
  return `${year}.${month}.${day}`;
}

function normalizeDateInput(value) {
  const safeValue = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : '';
}

function toggleSharedContentCollapse() {
  isSharedContentCollapsed.value = !isSharedContentCollapsed.value;
}

function resolveEntryDateKey(entry) {
  const safeEntryDate = normalizeDateInput(entry?.entryDate);
  if (safeEntryDate) return safeEntryDate;

  const parsed = entry?.updatedAt ? new Date(entry.updatedAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatEntryDate(entryDate, updatedAt = '') {
  const entryDateText = formatDateKey(entryDate);
  if (!entryDateText) {
    const parsed = updatedAt ? new Date(updatedAt) : new Date();
    if (Number.isNaN(parsed.getTime())) return String(entryDate || '');
    return formatDisplayDate(parsed);
  }

  const updatedText = String(updatedAt || '').trim();
  if (!updatedText) return entryDateText;

  const updatedParsed = new Date(updatedText);
  if (Number.isNaN(updatedParsed.getTime())) return entryDateText;

  const updatedDateKey = [
    updatedParsed.getFullYear(),
    String(updatedParsed.getMonth() + 1).padStart(2, '0'),
    String(updatedParsed.getDate()).padStart(2, '0'),
  ].join('-');

  if (updatedDateKey === String(entryDate || '').trim()) {
    return entryDateText;
  }

  return `${entryDateText} · 更新于 ${formatDisplayDate(updatedParsed)}`;
}

function formatViewerTime(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '刚刚查看';

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  if (diffMs >= 0 && diffMs < 60 * 1000) return '刚刚查看';
  if (diffMs >= 0 && diffMs < 60 * 60 * 1000)
    return `${Math.max(1, Math.floor(diffMs / 60000))} 分钟前`;
  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000)
    return `${Math.max(1, Math.floor(diffMs / 3600000))} 小时前`;
  return `${formatDisplayDate(parsed)} 查看`;
}

function entryTypeLabel(type) {
  if (type === 'image') return '图片';
  if (type === 'mixed') return '图文';
  return '文字';
}

function defaultTitle(entry) {
  return cloudEntryDefaultTitle(entry);
}

function blockSummary(entry) {
  const textCount = entry.contentBlocks.filter((block) => block.type === 'text').length;
  const imageBlocks = entry.contentBlocks.filter((block) => block.type === 'image');
  const imageText = imageBlocks.length ? `${imageBlocks.length} 张图` : '无图片';
  const textLabel = textCount ? `${textCount} 段文字` : '纯图片';
  return `${imageText} · ${textLabel}`;
}

function resetGalleryFilters() {
  searchQuery.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  currentFilter.value = 'all';
}

/* 面板里有没有「会丢的东西」——关窗/点遮罩时用它决定要不要先问一句。
   只看用户可见的三类输入，不看上传状态（上传中的图还没进草稿，取消按钮自己会提示）。 */
const hasComposerDraft = computed(
  () =>
    Boolean(draftTitle.value.trim()) ||
    Boolean(draftText.value.trim()) ||
    uploadedImages.value.length > 0,
);

/* 失败清单最多列 4 条（每条 = 文件名 + 真实原因）。
   取 4 而不是全量：一次最多 9 张，全列会把正文区挤爆；零星失败时 4 条足够定位问题，
   第 5 条起折叠成一行「另有 N 张同样原因失败」。 */
const FAILED_LIST_LIMIT = 4;
const failedUploadItems = computed(() =>
  cloudState.upload.failedImages.slice(0, FAILED_LIST_LIMIT),
);

function openComposer() {
  isComposerOpen.value = true;
  // 每次打开都从「收起」起步：上次留着的展开态会让面板一开就长一截
  isMoodTrayOpen.value = false;
}

function toggleMoodTray() {
  isMoodTrayOpen.value = !isMoodTrayOpen.value;
}

/**
 * 关闭发布面板。
 *
 * 2026-10-18 之前这里是 `isComposerOpen.value = false` 一行 —— 点 × 或点遮罩，
 * 写了一半的正文、标题、已上传的图片**全部静默丢弃**（图片还留在 Cloudinary 上成为孤儿）。
 * 现在有内容时先问一次；`publishEntry` 成功后走的是直接置 false，不弹这一问。
 */
async function closeComposer() {
  if (cloudState.publish.publishing) return;
  if (hasComposerDraft.value) {
    let confirmed = false;
    try {
      confirmed = await dialog.confirm({
        title: '放弃这次编辑？',
        message: '还没有发布的内容不会保留。',
        tone: 'warning',
        confirmText: '放弃',
        cancelText: '继续编辑',
      });
    } catch (error) {
      // 弹窗互斥（连点 × 两次）时按「用户取消」处理，不要把 rejection 冒泡成错误日志
      if (isDialogBusy(error)) return;
      throw error;
    }
    if (!confirmed) return;
  }
  isComposerOpen.value = false;
  isMoodTrayOpen.value = false;
}

function toggleFilterPanel() {
  isFilterPanelOpen.value = !isFilterPanelOpen.value;
}

function loadMoreGalleryEntries() {
  visibleEntryLimit.value = Math.min(
    filteredEntries.value.length,
    visibleEntryLimit.value + GALLERY_LOAD_MORE_STEP,
  );
}

function scrollAlbumToTop() {
  albumSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function readStoredSharedToken() {
  if (typeof window === 'undefined') return '';
  try {
    return normalizeCloudShareToken(window.localStorage.getItem(SHARED_TOKEN_STORAGE_KEY) || '');
  } catch (error) {
    logger.warn('cloud-plus', '读取 Cloud+ 共享令牌缓存失败:', error);
    return '';
  }
}

function persistStoredSharedToken(token) {
  if (typeof window === 'undefined') return;
  const safeToken = normalizeCloudShareToken(token);
  try {
    if (safeToken) {
      window.localStorage.setItem(SHARED_TOKEN_STORAGE_KEY, safeToken);
    } else {
      window.localStorage.removeItem(SHARED_TOKEN_STORAGE_KEY);
    }
  } catch (error) {
    logger.warn('cloud-plus', '写入 Cloud+ 共享令牌缓存失败:', error);
  }
}

function derivePreviewFromBlocks(blocks = [], contentText = '') {
  const textFromBlocks = Array.isArray(blocks)
    ? blocks
        .filter((block) => block?.type === 'text')
        .map((block) => String(block?.text || '').trim())
        .filter(Boolean)
        .join(' ')
    : '';
  const merged = String(textFromBlocks || contentText || '').trim();
  return merged.length > 180 ? `${merged.slice(0, 180)}...` : merged;
}

function normalizeCachedImageBlock(block) {
  const url = String(block?.url || '').trim();
  if (!url) return null;
  return {
    type: 'image',
    url,
    alt: String(block?.alt || '').trim(),
    publicId: String(block?.publicId || '').trim(),
  };
}

function normalizeCachedTextBlock(block) {
  const text = String(block?.text || '').trim();
  if (!text) return null;
  return {
    type: 'text',
    text,
  };
}

function normalizeCachedEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const id = String(entry.id || '').trim();
  const userId = String(entry.userId || '').trim();
  const entryDate = normalizeDateInput(entry.entryDate);
  if (!id || !userId || !entryDate) return null;

  const contentBlocks = Array.isArray(entry.contentBlocks)
    ? entry.contentBlocks
        .map((block) => {
          if (block?.type === 'image') return normalizeCachedImageBlock(block);
          if (block?.type === 'text') return normalizeCachedTextBlock(block);
          return null;
        })
        .filter(Boolean)
    : [];

  const coverImageUrl = String(
    entry.coverImageUrl || contentBlocks.find((block) => block.type === 'image')?.url || '',
  ).trim();

  return {
    id,
    userId,
    entryDate,
    legacyNoteDate: normalizeDateInput(entry.legacyNoteDate),
    title: String(entry.title || '').trim(),
    entryType: ['text', 'image', 'mixed'].includes(String(entry.entryType || '').trim())
      ? String(entry.entryType).trim()
      : 'text',
    visibility: normalizeCloudVisibility(entry.visibility),
    contentText: String(entry.contentText || '').trim(),
    contentBlocks,
    coverImageUrl,
    previewText: String(
      entry.previewText || derivePreviewFromBlocks(contentBlocks, entry.contentText || ''),
    ).trim(),
    mood: String(entry.mood || '').trim(),
    source: String(entry.source || 'manual').trim() || 'manual',
    createdAt: String(entry.createdAt || '').trim(),
    updatedAt: String(entry.updatedAt || '').trim(),
  };
}

function getCloudEntriesCacheKey(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return '';
  return `boh_cloud_entries_cache:${CLOUD_ENTRIES_CACHE_VERSION}:${safeUserId}`;
}

function readCachedEntries(userId) {
  if (typeof window === 'undefined') return [];
  const cacheKey = getCloudEntriesCacheKey(userId);
  if (!cacheKey) return [];

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 限制缓存大小，只返回前50条
    const limitedEntries = parsed.slice(0, CLOUD_ENTRIES_CACHE_MAX_SIZE);
    return limitedEntries.map(normalizeCachedEntry).filter(Boolean);
  } catch (error) {
    logger.warn('cloud-plus', '读取 Cloud+ 本地缓存失败:', error);
    return [];
  }
}

function persistCachedEntries(userId, items) {
  if (typeof window === 'undefined') return;
  const cacheKey = getCloudEntriesCacheKey(userId);
  if (!cacheKey) return;

  try {
    const safeItems = Array.isArray(items) ? items.map(normalizeCachedEntry).filter(Boolean) : [];
    if (!safeItems.length) {
      window.localStorage.removeItem(cacheKey);
      return;
    }
    // 限制缓存大小，只保存前50条
    const limitedItems = safeItems.slice(0, CLOUD_ENTRIES_CACHE_MAX_SIZE);
    const cacheData = {
      entries: limitedItems,
      lastFetchTime: Date.now(),
      version: CLOUD_ENTRIES_CACHE_VERSION,
    };
    window.localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    logger.warn('cloud-plus', '写入 Cloud+ 本地缓存失败:', error);
  }
}

function syncActiveShareChannel() {
  shareDescriptionDraft.value = String(myShareChannel.value?.description || '');
}

function replaceLocalShareChannel(channel) {
  myShareChannel.value = channel || null;
  syncActiveShareChannel();
}

function refreshSharePanelState() {
  syncActiveShareChannel();
  if (myShareChannel.value?.shareToken) {
    void loadMyShareViewers();
  } else {
    shareViewers.value = [];
    shareViewersError.value = '';
  }
}

function switchCloudTab(tabId) {
  const safeTab = ['content', 'share', 'settings', 'trash'].includes(String(tabId))
    ? String(tabId)
    : 'content';
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      view: safeTab,
    },
  });
}

/* ---- 全站底栏（2026-10-22 接入） ---- */

// Cloud+ 自己是第五席「图库」：选中态恒指向本席，不随 ?view= 变化（view 是页内分段，不是导航）
const activeBottomNavId = 'cloud';
const bottomNavIndicatorStyle = computed(() => {
  const index = Math.max(
    0,
    BOTTOM_NAV_ITEMS.findIndex((item) => item.id === activeBottomNavId),
  );
  return {
    '--active-nav-index': index,
    '--active-nav-center': `${((index + 0.5) / BOTTOM_NAV_ITEMS.length) * 100}%`,
    '--nav-count': BOTTOM_NAV_ITEMS.length,
  };
});

/* 底栏随滚动方向隐藏（与首页 / 我 / 周边同一条实现）：图库是长文档流 + body 滚动，
   下滑 20px 收起、上滑 8px 回来、回到顶部一定显现。
   浮层打开时强制显示 —— 否则关闭详情/发布器后底栏可能停在 hidden，
   要等用户再滑一下才回来（那两个浮层都是覆盖层，底栏本就该在下面备着）。 */
const isBottomNavForceVisible = computed(
  () => isComposerOpen.value || Boolean(selectedEntry.value),
);
const { hidden: bottomNavHidden, reset: resetBottomNavAutoHide } = useScrollDirectionHide({
  forceVisible: isBottomNavForceVisible,
});

// 未读徽标：与首页 / UserSpace 底栏读同一个 store，三处数字必然一致
const notificationStoreRef = getNotificationStoreRef();
const unreadCount = computed(() => notificationStoreRef.value?.unreadCount || 0);
const hasUnreadMessages = computed(() => unreadCount.value > 0);

/* 底栏预热（2026-10-22）：底栏的 pointerenter / focus 会 emit `preload-tab`，
   我页此前没有接 —— 首次从图库点「我」要现拉 路由 chunk + 身份卡 chunk + 三份
   profile 样式，期间分段 tab 在、内容一片白。预热之后点击基本即时落位；
   只在悬停/聚焦时触发（不点就不付这笔成本），Promise 缓存保证只拉一次。 */
let userSpacePreloadPromise = null;
const preloadUserSpaceForNav = () => {
  if (userSpacePreloadPromise) return userSpacePreloadPromise;
  userSpacePreloadPromise = Promise.all([
    import('@/views/user-center/UserSpace/index.vue'),
    import('@/views/user-center/UserSpace/components/ProfileHomePanel.vue'),
    preloadProfileStyles(),
  ]).catch(() => {});
  return userSpacePreloadPromise;
};

/* 切走前必须先把编辑器收干净。两条「走不了」的分支都靠 isComposerOpen 判断：
   · 有草稿时 closeComposer 会弹「放弃这次编辑？」—— 用户选「继续编辑」⇒ 它 return，flag 仍为 true；
   · 发布中（cloudState.publish.publishing）closeComposer 直接 return ⇒ flag 仍为 true。
   此时若照旧导航，正在写的内容会被静默丢弃、已上传图片变成 Cloudinary 孤儿（closeComposer 头注释记的就是这事）。 */
async function handleBottomNavClick(itemId) {
  const item = BOTTOM_NAV_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return;
  if (isComposerOpen.value) {
    await closeComposer();
    if (isComposerOpen.value) return;
  }
  if (route.path === item.route) {
    // 再点一次当前席：iOS 惯例是回该模块的根视图。图库的根 = 内容视图，已在内容就回顶。
    if (itemId === 'cloud' && cloudTab.value !== 'content') {
      switchCloudTab('content');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }
  router.push(item.route);
}

/* 横屏左栏的动作分发（2026-10-26）。与 Home / ProfileMain / UserSpaceMain 同一套 id：
   发布 / 资产 / 主题 / 首页 / 退出登录。图库自己没有发布器 ⇒ 发布走首页的 ?compose=1 深链。 */
async function handleRailAction(actionId) {
  switch (actionId) {
    case 'compose':
      router.push({ path: '/', query: { view: 'latest', compose: '1' } });
      break;
    case 'assets':
      router.push('/user-space?tab=assets');
      break;
    case 'theme':
      themeManager.toggle();
      break;
    case 'home':
      router.push('/');
      break;
    case 'logout':
      await logoutAndReload(authStore);
      break;
    default:
      break;
  }
}

function applyCloudPlusRouteView() {
  if (cloudTab.value === 'share') {
    refreshSharePanelState();
  }
  // 回收站升成页面后，取数时机跟 share 一样挂在「切到这一档」上（深链 ?view=trash 也走这里）。
  if (cloudTab.value === 'trash') {
    void loadTrashedImages();
  }
}

async function loadMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    myShareChannel.value = null;
    shareViewers.value = [];
    cloudState.share.tokenState = 'idle';
    return;
  }

  cloudState.share.loading = true;
  cloudState.share.tokenState = 'loading';
  try {
    const result = await getMyCloudShareChannel();
    if (!result.ok) {
      logger.error('cloud-plus', '读取 Cloud+ 共享频道失败:', result.error);
      myShareChannel.value = null;
      cloudState.share.tokenState = 'error';
      cloudState.share.error = result.error?.message || '读取共享频道失败';
      return;
    }

    myShareChannel.value = result.data || null;
    syncActiveShareChannel();
    cloudState.share.tokenState = myShareChannel.value?.isActive ? 'active' : 'idle';
    cloudState.share.error = null;
    if (myShareChannel.value?.shareToken) {
      void loadMyShareViewers();
    } else {
      shareViewers.value = [];
    }
  } finally {
    cloudState.share.loading = false;
  }
}

async function loadMyShareViewers() {
  if (!isLoggedIn.value || !userInfo.value?.id || !myShareChannel.value?.shareToken) {
    shareViewers.value = [];
    cloudState.share.viewersError = null;
    return;
  }

  cloudState.share.loadingViewers = true;
  cloudState.share.viewersError = null;
  try {
    const result = await getMyCloudShareViewers({ limit: 50 });
    if (!result.ok) {
      shareViewers.value = [];
      cloudState.share.viewersError = result.error?.message || '访客记录读取失败';
      return;
    }

    shareViewers.value = Array.isArray(result.data) ? result.data : [];
  } finally {
    cloudState.share.loadingViewers = false;
  }
}

async function activateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再开启共享');
    authStore.showLoginModal = true;
    return;
  }

  cloudState.share.saving = true;
  cloudState.share.tokenState = 'loading';
  try {
    const result = await upsertMyCloudShareChannel({ regenerate: false });
    if (!result.ok) {
      showNotice(result.error?.message || '开启共享失败');
      cloudState.share.tokenState = 'error';
      cloudState.share.error = result.error?.message || '开启共享失败';
      return;
    }

    replaceLocalShareChannel(result.data || null);
    cloudState.share.tokenState = 'active';
    cloudState.share.error = null;
    void loadMyShareViewers();
    showNotice(`${activeShareChannelLabel.value}已开启`);
  } finally {
    cloudState.share.saving = false;
  }
}

async function toggleMyShareChannel() {
  if (myShareChannel.value?.isActive) {
    await deactivateMyShareChannel();
    return;
  }
  await activateMyShareChannel();
}

async function saveShareDescription() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再设置频道描述');
    authStore.showLoginModal = true;
    return;
  }

  const nextDescription = shareDescriptionDraft.value.trim().slice(0, 160);
  if (nextDescription === String(myShareChannel.value?.description || '').trim()) return;

  cloudState.share.saving = true;
  try {
    const result = myShareChannel.value?.shareToken
      ? await setMyCloudShareDescription(nextDescription)
      : await upsertMyCloudShareChannel({
          regenerate: false,
          description: nextDescription,
        });
    if (!result.ok) {
      showNotice(result.error?.message || '频道描述保存失败');
      return;
    }

    replaceLocalShareChannel(result.data || null);
    showNotice('频道描述已保存');
  } finally {
    cloudState.share.saving = false;
  }
}

async function regenerateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再生成令牌');
    return;
  }
  if (
    myShareChannel.value?.shareToken &&
    !confirm('撤销后，旧令牌会立刻失效，并生成一枚新令牌。确定继续吗？')
  ) {
    return;
  }

  cloudState.share.saving = true;
  cloudState.share.tokenState = 'loading';
  try {
    const result = await revokeMyCloudShareToken();
    if (!result.ok) {
      showNotice(result.error?.message || '生成新令牌失败');
      cloudState.share.tokenState = 'error';
      cloudState.share.error = result.error?.message || '生成新令牌失败';
      return;
    }

    replaceLocalShareChannel(result.data || null);
    cloudState.share.tokenState = 'active';
    cloudState.share.error = null;
    shareViewers.value = [];
    void loadMyShareViewers();
    showNotice('已生成新的访问令牌');
  } finally {
    cloudState.share.saving = false;
  }
}

async function deactivateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再关闭共享');
    return;
  }
  if (
    !(await dialog.confirm({
      title: '关闭共享',
      message: '关闭共享后，当前令牌将暂时失效。确定关闭吗？',
      tone: 'warning',
      confirmText: '关闭',
    }))
  ) {
    return;
  }

  cloudState.share.saving = true;
  cloudState.share.tokenState = 'loading';
  try {
    const result = await disableMyCloudShareChannel();
    if (!result.ok) {
      showNotice(result.error?.message || '关闭共享失败');
      cloudState.share.tokenState = 'error';
      cloudState.share.error = result.error?.message || '关闭共享失败';
      return;
    }

    replaceLocalShareChannel(result.data || null);
    cloudState.share.tokenState = 'idle';
    cloudState.share.error = null;
    void loadMyShareViewers();
    showNotice(`${activeShareChannelLabel.value}已关闭`);
  } finally {
    cloudState.share.saving = false;
  }
}

async function copyMyShareToken() {
  const token = String(myShareChannel.value?.shareToken || '').trim();
  if (!token) {
    showNotice('还没有可复制的访问令牌');
    return;
  }

  try {
    await navigator.clipboard.writeText(token);
    showNotice('访问令牌已复制');
  } catch (error) {
    logger.error('cloud-plus', '复制 Cloud+ 访问令牌失败:', error);
    showNotice('复制失败，请手动复制令牌');
  }
}

async function openSharedChannel() {
  const token = normalizedSharedTokenInput.value;
  if (!token) {
    cloudState.share.sharedError = '请输入有效的访问令牌';
    showNotice('请输入有效的访问令牌');
    return;
  }

  // 取消之前的请求
  if (cloudState.share.abortController) {
    cloudState.share.abortController.abort();
  }
  cloudState.share.abortController = new AbortController();

  sharedTokenInput.value = token;
  cloudState.share.sharedError = null;
  cloudState.share.loadingShared = true;
  try {
    const result = await getSharedCloudChannelByToken(token, { limit: 500 });
    // 检查是否被取消
    if (cloudState.share.abortController?.signal.aborted) {
      return;
    }

    if (!result.ok) {
      sharedChannel.value = null;
      sharedEntries.value = [];
      cloudState.share.sharedError = result.error?.message || '共享频道读取失败';
      showNotice(cloudState.share.sharedError);
      return;
    }

    sharedChannel.value = result.data?.channel || null;
    sharedEntries.value = Array.isArray(result.data?.entries) ? result.data.entries : [];
    isSharedContentCollapsed.value = false;
    cloudState.share.sharedError = null;
    persistStoredSharedToken(token);
    showNotice('共享频道已打开');
  } catch (error) {
    // 如果是取消导致的错误，不显示提示
    if (error.name === 'AbortError') {
      return;
    }
    cloudState.share.sharedError = error?.message || '共享频道读取失败';
    showNotice(cloudState.share.sharedError);
  } finally {
    cloudState.share.loadingShared = false;
    cloudState.share.abortController = null;
  }
}

function exitSharedChannel() {
  // 取消正在进行的请求
  if (cloudState.share.abortController) {
    cloudState.share.abortController.abort();
    cloudState.share.abortController = null;
  }

  sharedChannel.value = null;
  sharedEntries.value = [];
  cloudState.share.sharedError = null;
  isSharedContentCollapsed.value = false;
  if (selectedEntrySource.value === 'shared') {
    selectedEntry.value = null;
    selectedEntrySource.value = 'mine';
  }
  showNotice('已退出共享频道');
}

function showNotice(message) {
  noticeText.value = message;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    if (noticeText.value === message) noticeText.value = '';
  }, 2600);
}
showNotice.timer = null;

// 劫持原始 showNotice：优先灵动岛，失败回退本地 notice-bar
const _originShowNotice = showNotice;
function showCloudIsland(title, message = '', icon = 'success', durationMs = 3200) {
  try {
    const ok = showIsland.notify({ title, message, icon, durationMs });
    return ok;
  } catch {
    return false;
  }
}
function showNoticeWithIsland(message, opts = {}) {
  const title = String(opts.title || message || '提示').trim() || '提示';
  const msg = String(opts.message ?? (opts.title ? message : '')).trim();
  const icon =
    opts.icon ||
    (/失败|错误|不足|超过|无效|请先|超过|受限|频繁/.test(String(message)) ? 'warning' : 'success');
  const durationMs = opts.durationMs || (icon === 'warning' ? 3600 : 3000);
  const ok = showCloudIsland(title, msg, icon, durationMs);
  if (!ok) _originShowNotice(message);
  return ok;
}
let _cloudNoticeTimer = null;
showNotice = function (message) {
  const text = String(message || '');
  const isError =
    /失败|错误|不足|超过|无效|超过|不能为空|不能超过|未变化|请先|受限|频繁|无法识别|已满|取消/.test(
      text,
    );
  const icon = isError ? (/已取消|已退出/.test(text) ? 'success' : 'warning') : 'success';
  const title = text.length > 24 ? text.slice(0, 24) : text;
  const msg = text.length > 24 ? text.slice(24) : '';
  let ok = false;
  try {
    ok = showIsland.notify({ title, message: msg, icon, durationMs: isError ? 3600 : 3000 });
  } catch {
    ok = false;
  }
  if (ok) {
    noticeText.value = '';
    window.clearTimeout(_cloudNoticeTimer);
    window.clearTimeout(_originShowNotice.timer);
    window.clearTimeout(showNotice.timer);
    return;
  }
  noticeText.value = text;
  window.clearTimeout(_cloudNoticeTimer);
  window.clearTimeout(_originShowNotice.timer);
  window.clearTimeout(showNotice.timer);
  const timer = window.setTimeout(() => {
    if (noticeText.value === text) noticeText.value = '';
  }, 2600);
  _cloudNoticeTimer = timer;
  _originShowNotice.timer = timer;
  showNotice.timer = timer;
};
showNotice.timer = _originShowNotice.timer;

async function deleteDraftAssetFromCloudinary(image, { silent = false, keepalive = false } = {}) {
  const token = String(image?.deleteToken || '').trim();
  const publicId = String(image?.publicId || extractCloudinaryPublicIdFromUrl(image?.url)).trim();
  if (!token) {
    if (publicId) {
      const fallbackResult = await deleteCloudinaryAssetsByPublicIds([publicId]);
      if (fallbackResult.ok) {
        return { ok: true, skipped: false };
      }
      if (!silent) {
        showNotice(fallbackResult.error?.message || '云端图片删除失败');
      }
      return { ok: false, skipped: false };
    }
    if (!silent) {
      showNotice('已从草稿移除，但无法识别云端图片标识，未能同步删除 Cloudinary 图片');
    }
    return { ok: false, skipped: true };
  }

  if (cloudinaryCleanupLocks.has(token)) {
    return { ok: true, skipped: true };
  }

  cloudinaryCleanupLocks.add(token);
  try {
    await deleteCloudinaryAssetByToken(token, { keepalive });
    return { ok: true, skipped: false };
  } catch (error) {
    if (publicId) {
      const fallbackResult = await deleteCloudinaryAssetsByPublicIds([publicId]);
      if (fallbackResult.ok) {
        return { ok: true, skipped: false };
      }
      if (!silent) {
        showNotice(fallbackResult.error?.message || '云端图片删除失败');
      }
      return { ok: false, skipped: false };
    }
    if (!silent) {
      showNotice(error?.message || '云端图片删除失败');
    }
    return { ok: false, skipped: false };
  } finally {
    cloudinaryCleanupLocks.delete(token);
  }
}

async function cleanupDraftUploads({ silent = true, keepalive = false } = {}) {
  if (isPublishing.value || isUploadingImages.value) return;

  const images = [...uploadedImages.value];
  if (!images.length) return;

  await Promise.allSettled(
    images.map((image) => deleteDraftAssetFromCloudinary(image, { silent, keepalive })),
  );
}

async function loadEntries() {
  const userId = String(userInfo.value?.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    entries.value = [];
    cloudState.content.hasLoaded = false;
    cloudState.content.error = null;
    cloudState.content.isShowingCached = false;
    cloudState.content.activeUserId = '';
    cloudState.content.lastFetchTime = null;
    return;
  }

  const hadEntriesBeforeLoad = entries.value.length > 0;
  const cachedEntries = readCachedEntries(userId);
  if (!hadEntriesBeforeLoad && cachedEntries.length > 0) {
    entries.value = cachedEntries;
    cloudState.content.isShowingCached = true;
    cloudState.content.activeUserId = userId;
  }

  cloudState.content.loading = true;
  cloudState.content.error = null;
  try {
    const result = await listMyCloudEntries({
      userId,
      limit: 500,
    });

    if (!result.ok) {
      const errorMessage = result.error?.message || '读取 Cloud+ 失败，请检查网络后重试';
      cloudState.content.error =
        hadEntriesBeforeLoad || cachedEntries.length
          ? `${errorMessage}，当前为你保留最近一次成功加载的内容。`
          : errorMessage;
      cloudState.content.isShowingCached = entries.value.length > 0;
      cloudState.content.activeUserId = userId;
      showNotice(
        hadEntriesBeforeLoad || cachedEntries.length
          ? '网络波动，已保留最近一次成功加载的内容'
          : errorMessage,
      );
      cloudState.content.hasLoaded = true;
      return;
    }

    const nextEntries = Array.isArray(result.data) ? result.data : [];
    entries.value = nextEntries;
    persistCachedEntries(userId, nextEntries);
    cloudState.content.error = null;
    cloudState.content.isShowingCached = false;
    cloudState.content.hasLoaded = true;
    cloudState.content.activeUserId = userId;
    cloudState.content.lastFetchTime = Date.now();
    tryOpenEntryFromQuery();
  } finally {
    cloudState.content.loading = false;
  }
}

async function loadSubscriptions() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    subscriptions.value = [];
    return;
  }

  const result = await getMySubscriptions(String(userInfo.value.id).trim(), {
    includeExpired: true,
  });
  if (!result.ok) {
    subscriptions.value = [];
    logger.error('cloud-plus', '读取 Cloud+ 订阅权益失败:', result.error);
    return;
  }

  subscriptions.value = Array.isArray(result.data) ? result.data : [];
}

function openImagePicker() {
  if (!isCloudinaryNoteUploadConfigured()) {
    showNotice('请先配置 Cloudinary 后再上传图片');
    return;
  }
  if (remainingImageQuota.value <= 0) {
    showNotice(`你的 Cloud+ 图片额度已满，当前最多可保存 ${currentCloudImageLimit.value} 张图片`);
    return;
  }
  imageInputRef.value?.click();
}

/** BOH Camera Beta 入口：与 openImagePicker 同一套前置检查，过了才跳取景页。 */
function openCamera() {
  if (!isLoggedIn.value) return;
  if (!isCloudinaryNoteUploadConfigured()) {
    showNotice('请先配置 Cloudinary 后再上传图片');
    return;
  }
  if (remainingImageQuota.value <= 0) {
    showNotice(`你的 Cloud+ 图片额度已满，当前最多可保存 ${currentCloudImageLimit.value} 张图片`);
    return;
  }
  void router.push('/user-space/note/camera');
}

async function handleImageSelection(event) {
  const input = event?.target;
  const files = Array.from(input?.files || []);
  await addFilesToDraft(files, input);
}

/**
 * 把一批文件塞进当前草稿的上传队列。
 * 两个调用方：图片选择器（input[change]）与相机（拍完从 bridge 接过来）。
 * 校验/额度/并发/压缩全在这里，**别在调用方复制一份** —— 复制出来的那份
 * 一定会和这里漂移，表现为「拍照这条路绕过了额度检查」。
 */
async function addFilesToDraft(files, input = null) {
  if (!files.length) {
    if (input) input.value = '';
    return;
  }

  const invalidFile = files.find((file) => {
    try {
      validateImageFileBasics(file);
      return false;
    } catch (_error) {
      return true;
    }
  });
  if (invalidFile) {
    try {
      validateImageFileBasics(invalidFile);
    } catch (error) {
      showNotice(error?.message || '请选择有效的图片文件');
    }
    if (input) input.value = '';
    return;
  }

  if (files.length > CLOUD_BATCH_LIMIT) {
    showNotice(`单次最多上传 ${CLOUD_BATCH_LIMIT} 张图片，请分批上传`);
    if (input) input.value = '';
    return;
  }

  const remainingAfterDraft = Math.max(
    0,
    currentCloudImageLimit.value - totalStoredImages.value - draftImageCount.value,
  );
  if (files.length > remainingAfterDraft) {
    showNotice(`图片额度不足：当前最多还能添加 ${remainingAfterDraft} 张图片`);
    if (input) input.value = '';
    return;
  }

  const burst = registerCloudUploadBurst(uploadAttemptTimestamps, files.length, {
    windowMs: CLOUD_UPLOAD_BURST_WINDOW_MS,
    limit: CLOUD_UPLOAD_BURST_LIMIT,
  });
  uploadAttemptTimestamps = burst.timestamps;
  if (!burst.ok) {
    showNotice(`上传过于频繁，请 ${burst.retryAfterSeconds} 秒后再试`);
    if (input) input.value = '';
    return;
  }

  // 取消之前的上传请求
  if (cloudState.upload.abortController) {
    cloudState.upload.abortController.abort();
  }
  const uploadController = new AbortController();
  cloudState.upload.abortController = uploadController;
  cloudState.upload.failedImages = [];

  cloudState.upload.uploading = true;
  cloudState.upload.progress = 0;
  const totalFiles = files.length;
  let aborted = false;
  // 按下标落位：并发下「完成顺序」≠「选图顺序」，直接 push 会让相册里的照片顺序乱掉
  const uploadedByIndex = new Array(totalFiles).fill(null);
  const failedByIndex = new Array(totalFiles).fill(null);

  try {
    // 额度预检：与论坛链路同一套做法（forum-images-api 显式 preflight + skipUploadPreflight）。
    // Cloud+ 改造前**不传 source**，落到 'generic' 桶 —— 这个桶与装修台等路径共用限流计数，
    // 互相挤占；而且它读的是 pending 表，Cloud+ 以前不登记 pending，等于既挤占别人又不记账。
    await assertCloudinaryUploadAllowed({ source: CLOUD_PLUS_UPLOAD_SOURCE });
  } catch (preflightError) {
    cloudState.upload.uploading = false;
    cloudState.upload.progress = 0;
    // 整批未开始：把原因写进失败列表，用户端能看到「为什么发不出去」
    const reason = normalizeDbError(preflightError, '图片上传暂不可用，请稍后再试');
    cloudState.upload.failedImages = files.map((file) => ({
      file,
      name: file.name,
      error: reason?.message || '图片上传暂不可用，请稍后再试',
    }));
    showNotice(reason?.message || '图片上传暂不可用，请稍后再试');
    if (input) input.value = '';
    return;
  }

  // 并发池：与论坛发帖 / 影集上传同一个上限真源（cloud-upload-guard.js）。
  // 改造前是 `for (const file of files)` 纯串行，9 张图 = 9 次串行上传。
  const concurrency = resolveCloudUploadConcurrency();
  const queue = [];
  let activeCount = 0;
  let drainResolve = null;
  const drained = new Promise((resolve) => {
    drainResolve = resolve;
  });

  // 并发池内的真实进度：**压缩占前一半、上传占后一半**。
  // 压缩走 browser-image-compression 的 onProgress（0~100），上传走 XHR upload 事件（0~100），
  // 各按 0.5 加权 —— 只看上传进度的话，压缩大图的那几秒进度条会一动不动，
  // 用户分不清「在干活」还是「卡死了」。不压缩的文件压缩段直接记满 100。
  const compressPctByIndex = new Array(totalFiles).fill(100);
  const uploadPctByIndex = new Array(totalFiles).fill(0);
  const syncProgress = () => {
    const totalProgress = files.reduce(
      (sum, _file, index) =>
        sum + (compressPctByIndex[index] || 0) * 0.5 + (uploadPctByIndex[index] || 0) * 0.5,
      0,
    );
    cloudState.upload.progress = Math.min(100, Math.round(totalProgress / totalFiles));
    // 阶段文案：只要还有图在压缩段，就报「压缩中」，全部进入上传段才报「上传中」
    const stillCompressing = compressPctByIndex.some(
      (pct, index) => pct < 100 && !uploadedByIndex[index],
    );
    cloudState.upload.phase = stillCompressing ? 'compressing' : 'uploading';
  };

  const pump = () => {
    while (activeCount < concurrency && queue.length) {
      const runJob = queue.shift();
      activeCount += 1;
      runJob()
        .catch(() => {})
        .finally(() => {
          activeCount -= 1;
          syncProgress();
          if (queue.length || activeCount) pump();
          else drainResolve();
        });
    }
  };

  try {
    files.forEach((file, index) => {
      queue.push(async () => {
        // 检查是否被取消
        if (uploadController.signal.aborted) {
          aborted = true;
          return;
        }
        cloudState.upload.currentFile = file.name;

        try {
          /* ── 压缩 / 优化：与论坛发帖、影集编辑器同一条管线（单一真源 image-compression.js）──
             改造前 Cloud+ 是**原图直传**（只挡 10MB / 8192px / 25MP 硬限），iPhone 实拍 3~5MB
             一张，9 张图要传 30MB+。论坛口径 `optimizeForUpload: true`：超过 2MB / 2048px 就
             优化成 ≤2MB 的 WebP（展示端 Cloudinary 走 f_auto，源图格式无关紧要）。
             ⚠️ 若产品哪天要求「备份保留原图」，把 optimizeForUpload 改成 false 即可 ——
             那样只有超过硬限的图才会被压缩。 */
          const { getImageCompressionPlan, compressImageFileToUploadLimit, formatImageFileSize } =
            await import('@/utils/image-compression.js');
          const plan = await getImageCompressionPlan(file, {
            optimizeForUpload: true,
          });
          let payload = file;
          if (plan.shouldCompress) {
            if (!plan.canCompress) {
              // GIF 动图不可压缩（会丢帧），超限时给出与论坛同款的可读文案
              throw new Error(
                '图片超过上传限制，且当前格式不支持自动压缩，请换成 JPG、PNG 或 WebP 后重试',
              );
            }
            payload = await compressImageFileToUploadLimit(file, plan, {
              signal: uploadController.signal,
              onProgress: (percent) => {
                compressPctByIndex[index] = Math.max(
                  compressPctByIndex[index],
                  Number(percent) || 0,
                );
                syncProgress();
              },
            });
            // 与论坛同款二次校验：压缩库偶发压不到目标体积时，宁可让用户手动压也别脏数据
            if (Number(payload.size || 0) > Number(plan.maxSizeBytes || 0)) {
              throw new Error(
                `压缩后仍超过限制（${formatImageFileSize(payload.size)}），请手动压缩后再上传`,
              );
            }
          }
          compressPctByIndex[index] = 100;
          syncProgress();

          // 传入 signal：用户点取消时真正中止在途 HTTP 上传，而不是只重置 UI 状态让请求继续跑到超时
          const uploaded = await uploadImageToCloudinary(payload, {
            signal: uploadController.signal,
            // 显式指定 folder / 归属标记，与论坛发帖链路对齐（见 CLOUD_PLUS_* 常量注释）
            folder: CLOUD_PLUS_CLOUDINARY_FOLDER,
            pendingSource: CLOUD_PLUS_UPLOAD_SOURCE,
            // 预检已在批次开始时做过，逐图再查一次只是把并发池打成串行
            skipUploadPreflight: true,
            onProgress: (percent) => {
              uploadPctByIndex[index] = Math.max(uploadPctByIndex[index], Number(percent) || 0);
              syncProgress();
            },
          });
          uploadPctByIndex[index] = 100;
          uploadedByIndex[index] = {
            url: uploaded.url,
            publicId: uploaded.publicId,
            deleteToken: uploaded.deleteToken,
            alt: uploaded.originalFilename || file.name,
            width: uploaded.width,
            height: uploaded.height,
          };
        } catch (uploadError) {
          // 用户主动取消：中止剩余文件，不计入失败列表
          if (uploadError?.name === 'AbortError' || uploadController.signal.aborted) {
            aborted = true;
            return;
          }
          // 记录失败的图片 + **真实原因**。改造前这里把 normalizeDbError 之后的文案丢在岛里，
          // 面板上只剩「N 张图片上传失败」—— 用户问「为什么不显示原因」，就是指这一处。
          const reason = normalizeDbError(uploadError, '上传失败');
          failedByIndex[index] = {
            file,
            error: reason?.message || uploadError?.message || '上传失败',
            name: file.name,
          };
          logger.error('cloud-plus', `上传图片 ${file.name} 失败:`, uploadError);
        }
      });
    });

    pump();
    if (queue.length || activeCount) await drained;

    // 队列跑完后按选图顺序落位（并发完成顺序不可依赖）
    const uploaded = uploadedByIndex.filter(Boolean);
    const failed = failedByIndex.filter(Boolean);
    if (uploaded.length) uploadedImages.value.push(...uploaded);
    cloudState.upload.failedImages = failed;
    const uploadedCount = uploaded.length;

    if (aborted) {
      showNotice('上传已取消');
    }

    if (uploadedCount > 0) {
      showNotice(`已添加 ${uploadedCount} 张图片`);
    }

    if (cloudState.upload.failedImages.length > 0) {
      const firstReason = cloudState.upload.failedImages[0]?.error || '';
      showNotice(
        cloudState.upload.failedImages.length === 1 && firstReason
          ? `图片上传失败：${firstReason}`
          : `${cloudState.upload.failedImages.length} 张图片上传失败：${firstReason}`,
      );
    }

    if (
      files.length &&
      uploadedImages.value.some((image) => !supportsCloudinaryClientDeleteToken(image))
    ) {
      showNotice(
        '图片已上传，但当前 Cloudinary preset 未开启 delete token；取消上传时将无法自动清理云端图片',
      );
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      showNotice('上传已取消');
    } else {
      showNotice(normalizeDbError(error, '图片上传失败')?.message || '图片上传失败');
    }
  } finally {
    cloudState.upload.uploading = false;
    cloudState.upload.progress = 0;
    cloudState.upload.currentFile = null;
    // 仅当仍是本次流程的 controller 时才清理：取消后重新选文件会创建新 controller，
    // 旧流程的 finally 不得把它清掉，否则新一轮上传的取消按钮会失效
    if (cloudState.upload.abortController === uploadController) {
      cloudState.upload.abortController = null;
    }
    if (input) input.value = '';
  }
}

// 重试上传失败的图片
async function retryFailedUploads() {
  const failedFiles = cloudState.upload.failedImages.map((item) => item.file);
  if (!failedFiles.length) return;

  // 重置失败列表
  cloudState.upload.failedImages = [];

  // 创建新的 input 元素来触发上传
  const dataTransfer = new DataTransfer();
  failedFiles.forEach((file) => dataTransfer.items.add(file));

  const mockEvent = {
    target: {
      files: dataTransfer.files,
      value: '',
    },
  };

  await handleImageSelection(mockEvent);
}

// 取消上传
function cancelUpload() {
  if (cloudState.upload.abortController) {
    cloudState.upload.abortController.abort();
    cloudState.upload.abortController = null;
  }
  cloudState.upload.uploading = false;
  cloudState.upload.progress = 0;
  cloudState.upload.currentFile = null;
}

async function removeDraftImage(url) {
  const target = uploadedImages.value.find((item) => item.url === url);
  uploadedImages.value = uploadedImages.value.filter((item) => item.url !== url);
  if (!target) return;
  await deleteDraftAssetFromCloudinary(target);
}

async function publishEntry() {
  const userId = String(userInfo.value?.id || '').trim();
  if (!isLoggedIn.value || !userId) return;
  if (!draftText.value.trim() && uploadedImages.value.length === 0) {
    showNotice('至少写点文字或上传一张图片');
    return;
  }
  if (totalStoredImages.value + draftImageCount.value > currentCloudImageLimit.value) {
    showNotice(`发布失败：图片总数不能超过 ${currentCloudImageLimit.value} 张`);
    return;
  }

  cloudState.publish.publishing = true;
  try {
    const blocks = serializeCloudTextAndImages({
      text: draftText.value,
      images: uploadedImages.value,
    });

    const result = await createMyCloudEntry(userId, {
      entryDate: new Date(),
      title: draftTitle.value,
      visibility: 'private',
      contentText: draftText.value,
      contentBlocks: blocks,
      mood: draftMood.value,
      source: 'manual',
    });

    if (!result.ok) {
      showNotice(result.error?.message || '发布失败');
      return;
    }

    draftTitle.value = '';
    draftText.value = '';
    draftMood.value = '';
    uploadedImages.value = [];
    cloudState.upload.failedImages = [];
    if (result.data) {
      entries.value = [result.data, ...entries.value.filter((item) => item.id !== result.data.id)];
      persistCachedEntries(userId, entries.value);
      cloudState.content.hasLoaded = true;
      cloudState.content.error = null;
      cloudState.content.isShowingCached = false;
      cloudState.content.activeUserId = userId;
      cloudState.content.lastFetchTime = Date.now();
    }
    showNotice('已发布到 BOH Cloud+');
    // 发布成功直接关面板：内容已落库，不能再走 closeComposer 的「放弃编辑」确认
    isComposerOpen.value = false;
    isMoodTrayOpen.value = false;
    void loadEntries();
  } finally {
    cloudState.publish.publishing = false;
  }
}

/**
 * 打开条目详情。
 *
 * 2026-10-03 动效：把「点中的那一格的中心」记进 --detail-origin-x/y，
 * 详情弹窗的进出场 transform-origin 就用它 —— 视觉上是「从这一格放大展开」，
 * 关闭时缩回同一处（而不是从屏幕正中凭空长出）。
 * 没有事件（深链 / 程序化打开）时回落 50% 50%，即居中展开。
 */
const detailOrigin = reactive({ x: '50%', y: '50%' });

/* ── 多选删除 + 回收站（plans/039）─────────────────────────────────────────── */
function enterSelectMode() {
  if (!isLoggedIn.value) return;
  if (!albumTiles.value.some((tile) => tile.imageUrl)) {
    showNotice('这里还没有可以选择的图片');
    return;
  }
  isSelectMode.value = true;
  selectedTileKeys.value = new Set();
}

function exitSelectMode() {
  isSelectMode.value = false;
  selectedTileKeys.value = new Set();
  cancelTileLongPress();
}

function cancelTileLongPress() {
  if (tileLongPressTimer) {
    clearTimeout(tileLongPressTimer);
    tileLongPressTimer = null;
  }
}

function isTileSelected(tile) {
  return selectedTileKeys.value.has(tile?.key);
}

function toggleTileSelection(tile) {
  if (!tile?.imageUrl) return;
  const next = new Set(selectedTileKeys.value);
  if (next.has(tile.key)) next.delete(tile.key);
  else next.add(tile.key);
  selectedTileKeys.value = next;
}

/** 长按 500ms 进入多选（iOS 图库同款）；随后的 click 必须被吞掉，否则会顺带打开详情。 */
function handleTilePointerDown(tile, event) {
  if (isSelectMode.value || !tile?.imageUrl) return;
  if (event?.button !== undefined && event.button !== 0) return;
  cancelTileLongPress();
  tileLongPressTimer = setTimeout(() => {
    tileLongPressTimer = null;
    isSelectMode.value = true;
    selectedTileKeys.value = new Set([tile.key]);
    suppressTileClick.value = true;
    // 长按后若没有触发 click（例如 pointercancel），600ms 后自动解除吞点击
    setTimeout(() => {
      suppressTileClick.value = false;
    }, 600);
  }, 500);
}

function handleTileClick(tile, event) {
  if (suppressTileClick.value) {
    suppressTileClick.value = false;
    return;
  }
  if (isSelectMode.value) {
    toggleTileSelection(tile);
    return;
  }
  openEntry(tile.entry, 'mine', event);
}

/** 右键（桌面）/ 长按系统菜单（移动端会被 contextmenu 拦下）：统一当作「进入多选」。 */
function handleTileContextMenu(tile) {
  if (!tile?.imageUrl) return;
  if (!isSelectMode.value) enterSelectMode();
  if (!isTileSelected(tile)) toggleTileSelection(tile);
}

function toggleSelectAllVisibleImages() {
  const imageKeys = albumTiles.value.filter((tile) => tile.imageUrl).map((tile) => tile.key);
  if (isAllVisibleImagesSelected.value) {
    selectedTileKeys.value = new Set();
    return;
  }
  selectedTileKeys.value = new Set(imageKeys);
}

/** 删除成功后本地摘块：不整页重拉，避免相册回顶/闪烁；缓存同步写回。 */
function applyLocalImageRemoval(entryId, indexes) {
  entries.value = entries.value
    .map((entry) => {
      if (entry.id !== entryId) return entry;
      const blocks = removeImageBlocks(entry.contentBlocks, indexes);
      // 删光且整条被服务端删除时走 removeEntryLocally；这里只剩「文字块还在」的兜底。
      if (!blocks.length) return null;
      const hasImage = blocks.some((block) => block?.type === 'image');
      const hasText = blocks.some((block) => block?.type === 'text');
      return {
        ...entry,
        contentBlocks: blocks,
        coverImageUrl: resolveCoverAfterRemoval(blocks),
        entryType: hasImage ? (hasText ? 'mixed' : 'image') : 'text',
      };
    })
    .filter(Boolean);
}

function removeEntryLocally(entryId) {
  entries.value = entries.value.filter((entry) => entry.id !== entryId);
  if (selectedEntry.value?.id === entryId) {
    selectedEntry.value = null;
    selectedEntrySource.value = 'mine';
  }
}

/**
 * 确认文案按「这次选中会不会把整条内容带走」分三档（2026-11-04 用户口径）：
 *   · 纯图片帖删光 → 该帖同步删除
 *   · 带文字帖删光 → 帖子保留，文字还在
 *   · 纯图片手记删光 → 整条内容移除
 * 判据用「正文是否为空」而不是 entryType：删第一张图后守卫会把 entry_type
 * 从 image 改写成 mixed（content_blocks 里永远有标题行），第二次就判不出来了。
 */
function resolveDeleteConfirmMessage(groups) {
  let deletesPost = false;
  let keepsPostText = false;
  let deletesEntry = false;

  for (const [entryId, indexes] of groups) {
    const entry = entries.value.find((item) => item.id === entryId);
    if (!entry) continue;
    // 下标口径与 albumTiles / RPC 一致：都是 contentBlocks 的真实下标。
    const imageIndexes = listDeletableImageBlocks(entry.contentBlocks).map(
      ({ blockIndex }) => blockIndex,
    );
    const coversAllImages =
      imageIndexes.length > 0 && imageIndexes.every((index) => indexes.includes(index));
    if (!coversAllImages) continue;

    if (String(entry.source || '').trim() === 'forum') {
      // 判据同服务端：看正文是否为空（entryType 会在删第一张图后被改写成 mixed）
      if (isForumEntryTitleOnly(entry)) deletesPost = true;
      else keepsPostText = true;
    } else {
      const remaining = removeImageBlocks(entry.contentBlocks, indexes);
      const hasText = remaining.some(
        (block) => block?.type === 'text' && String(block.text || '').trim(),
      );
      if (!hasText) deletesEntry = true;
    }
  }

  const tail = '图片在回收站保留 30 天，期间可以恢复。';
  if (deletesPost) return `所选内容包含该帖所有内容，该帖将会同步删除。${tail}`;
  if (keepsPostText) return `所选内容包含该帖的全部图片，该帖的文字将保留。${tail}`;
  if (deletesEntry) return `所选内容包含这条内容的全部图片，删除后这条内容将被移除。${tail}`;
  return `删除后会同时从论坛原帖移除。${tail}`;
}

async function deleteSelectedImages() {
  if (isDeletingSelected.value) return;
  const groups = groupSelectedTileKeys([...selectedTileKeys.value]);
  if (groups.size === 0) return;

  const count = selectedTileKeys.value.size;
  let confirmed = false;
  try {
    confirmed = await dialog.confirm({
      title: count === 1 ? '删除这张图片' : `删除 ${count} 张图片`,
      message: resolveDeleteConfirmMessage(groups),
      tone: 'danger',
      confirmText: '删除',
    });
  } catch (error) {
    if (isDialogBusy(error)) return;
    throw error;
  }
  if (!confirmed) return;

  isDeletingSelected.value = true;
  let removed = 0;
  let alreadyGone = 0;
  const failures = [];
  try {
    for (const [entryId, indexes] of groups) {
      try {
        // publicId 是幂等定位键：服务端按它找 block，重试不会误删下一张。
        const entry = entries.value.find((item) => item.id === entryId);
        const publicIds = indexes
          .map((index) => entry?.contentBlocks?.[index])
          .map((block) => String(block?.publicId || block?.public_id || '').trim())
          .filter(Boolean);

        const result = await deleteCloudEntryImages(entryId, indexes, publicIds);
        if (!result.ok) {
          failures.push(result.error?.message || '删除失败');
          continue;
        }
        const payload = result.data || {};
        if (payload.alreadyDeleted) {
          // 幂等返回：这批图在别处（重试/双端）已经删掉了，本地同步摘掉即可。
          alreadyGone += indexes.length;
          applyLocalImageRemoval(entryId, indexes);
          continue;
        }
        removed += Number(payload.removed ?? 0);
        if (payload.entryDeleted) removeEntryLocally(entryId);
        else applyLocalImageRemoval(entryId, indexes);
      } catch (error) {
        failures.push(error?.message || '删除失败');
      }
    }
    const userId = String(userInfo.value?.id || '').trim();
    if (userId) persistCachedEntries(userId, entries.value);
  } finally {
    isDeletingSelected.value = false;
    exitSelectMode();
  }

  if (failures.length) {
    showNotice(`已删除 ${removed} 张，${failures.length} 组失败：${failures[0]}`);
  } else if (removed === 0 && alreadyGone > 0) {
    showNotice('这些图片已经删除过了');
  } else {
    showNotice(`已删除 ${removed} 张图片，可在回收站恢复`);
  }
}

async function loadTrashedImages() {
  if (!isLoggedIn.value) {
    trashItems.value = [];
    return;
  }
  // 页面切换（watch immediate + onMounted）会连着触发两次，这里挡掉重复请求；
  // 恢复流程在 finally 之后才调用，不会撞上这个闸。
  if (isTrashLoading.value) return;
  isTrashLoading.value = true;
  try {
    const result = await listMyTrashedImages({ limit: 240 });
    if (!result.ok) {
      trashItems.value = [];
      showNotice(result.error?.message || '回收站加载失败');
      return;
    }
    trashItems.value = result.data;
    trashSelectedIds.value = new Set();
  } finally {
    isTrashLoading.value = false;
  }
}

/* 离开回收站页面时只清选择态：页面本身由 tab 决定，不再有「关面板」这个动作。
   不清的话，切去图库删几张再切回来，会看到一批早已不存在的勾选（keepAlive 让它活得很久）。 */
function resetTrashSelection() {
  trashSelectedIds.value = new Set();
}

function toggleTrashSelection(item) {
  if (!item?.id || item.expired) return;
  const next = new Set(trashSelectedIds.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  trashSelectedIds.value = next;
}

function toggleSelectAllRestorableTrash() {
  if (isAllRestorableTrashSelected.value) {
    trashSelectedIds.value = new Set();
    return;
  }
  trashSelectedIds.value = new Set(restorableTrashIds.value);
}

async function restoreSelectedTrashImages() {
  if (isRestoringTrash.value) return;
  const ids = [...trashSelectedIds.value];
  if (!ids.length) return;

  isRestoringTrash.value = true;
  try {
    const result = await restoreCloudImageTrash(ids);
    if (!result.ok) {
      showNotice(result.error?.message || '恢复失败');
      return;
    }
    const restored = Number(result.data?.restored ?? 0);
    trashSelectedIds.value = new Set();
    await Promise.all([loadTrashedImages(), loadEntries()]);
    showNotice(`已恢复 ${restored} 张图片`);
  } catch (error) {
    showNotice(error?.message || '恢复失败');
  } finally {
    isRestoringTrash.value = false;
  }
}

/** 永久删除：立即销毁云端资产，不可撤销 —— 必须先过一道 danger 确认。 */
async function purgeSelectedTrashImages() {
  if (isPurgingTrash.value || isRestoringTrash.value) return;
  const ids = [...trashSelectedIds.value];
  if (!ids.length) return;

  let confirmed = false;
  try {
    confirmed = await dialog.confirm({
      title: `永久删除 ${ids.length} 张图片`,
      message: '永久删除后无法恢复，图片会立即从云端销毁。',
      tone: 'danger',
      confirmText: '永久删除',
    });
  } catch (error) {
    if (isDialogBusy(error)) return;
    throw error;
  }
  if (!confirmed) return;

  isPurgingTrash.value = true;
  try {
    const result = await purgeCloudImageTrash(ids);
    if (!result.ok) {
      showNotice(result.error?.message || '永久删除失败');
      return;
    }
    // ⚠️ 不能用 `purged || ids.length`：函数在「一条都没匹配到」时也返回 200/ok，
    //    purged=0 会被 `||` 兜成 ids.length，变成「假成功」。
    //    （双端同时操作 / 另一个标签页已经恢复过，就会命中。）
    const purged = Number(result.data?.purged ?? 0);
    trashSelectedIds.value = new Set();
    await loadTrashedImages();
    if (purged === 0) {
      showNotice('这些图片已经不在回收站了');
      return;
    }
    showNotice(`已永久删除 ${purged} 张图片`);
  } catch (error) {
    showNotice(error?.message || '永久删除失败');
  } finally {
    isPurgingTrash.value = false;
  }
}

function openEntry(entry, source = 'mine', originEvent = null) {
  const rect = originEvent?.currentTarget?.getBoundingClientRect?.();
  if (rect && rect.width > 0 && rect.height > 0) {
    detailOrigin.x = `${Math.round(rect.left + rect.width / 2)}px`;
    detailOrigin.y = `${Math.round(rect.top + rect.height / 2)}px`;
  } else {
    detailOrigin.x = '50%';
    detailOrigin.y = '50%';
  }
  selectedEntry.value = entry;
  selectedEntrySource.value = source === 'shared' ? 'shared' : 'mine';
}

/**
 * Phase 4（plans/023）：把备份**转为帖子** —— 对外可见的第二条路（第一条是 token 令牌分享）。
 * 图片直接复用 Cloudinary url（不二次上传），经论坛云端草稿通道预填发帖器；
 * ForumMain 挂载时读取同 key 的一次性预填（boh-cloud-convert-draft），并抑制旧草稿恢复，
 * 避免「刚选好的图被旧草稿覆盖」。
 */
function convertEntryToPost(entry) {
  // 兜底：入口已按 canConvertSelectedEntryToPost 隐藏，这里再挡一次，
  // 避免以后有人从别处（快捷键/深层链接）调进来时把一篇帖子再发一遍。
  if (String(entry?.source || '').trim() === 'forum') {
    showNotice('这条内容来自论坛同步，本身已经是一篇帖子');
    return;
  }
  const images = collectEntryImageUrls(entry);
  if (!images.length) {
    showNotice('这条备份没有图片，无法转为帖子');
    return;
  }
  try {
    sessionStorage.setItem(
      'boh-cloud-convert-draft',
      JSON.stringify({
        title: String(entry?.title || '').slice(0, 120),
        content: String(entry?.contentText || '').slice(0, 2000),
        images,
      }),
    );
  } catch (error) {
    logger.warn('cloud', '转为帖子：预填暂存失败', error);
    showNotice('转为帖子失败，请重试');
    return;
  }
  closeEntry();
  router.push({ path: '/user-space', query: { tab: 'community', from: 'cloud-plus-convert' } });
}

function goWorksGrid() {
  closeEntry();
  router.push({
    path: '/user-space',
    query: {
      tab: 'posts',
      from: 'cloud-plus',
    },
  });
}

/** 私密笔记 → 公开（Cloud+ 侧的发布路径 = 状态切换；公开后的管理在作品格做）。 */
function tryOpenEntryFromQuery() {
  const entryId = String(route.query.entry || '').trim();
  if (!entryId) return;
  const target = entries.value.find((item) => item.id === entryId);
  if (!target) return;
  openEntry(target);
  router.replace({ query: { ...route.query, entry: undefined } });
}

function closeEntry() {
  selectedEntry.value = null;
  selectedEntrySource.value = 'mine';
}

function getCloudImageDisplayUrl(url = '') {
  return getCloudinaryDisplayUrl(url);
}

function handleCloudImageLoaded(event) {
  const image = event?.target;
  if (!image) return;
  image.classList.add('is-loaded');
  image.parentElement?.classList.add('is-loaded');
  image.parentElement?.classList.remove('has-load-error');
}

function buildCloudinaryDisplayFallbackUrl(src = '') {
  const rawSrc = String(src || '').trim();
  if (!rawSrc) return '';

  try {
    const url = new URL(rawSrc);
    const marker = '/image/upload/';
    const uploadIndex = url.pathname.indexOf(marker);
    if (uploadIndex < 0) return rawSrc;

    const beforeUpload = url.pathname.slice(0, uploadIndex + marker.length);
    const afterUpload = url.pathname.slice(uploadIndex + marker.length);
    if (afterUpload.startsWith('c_limit,w_1800,q_auto:good/')) return rawSrc;

    url.pathname = `${beforeUpload}c_limit,w_1800,q_auto:good/${afterUpload}`;
    return url.toString();
  } catch (_error) {
    return rawSrc;
  }
}

function retryCloudImageLoad(event) {
  const image = event?.target;
  if (!image || !image.src) return;
  image.classList.remove('is-loaded');
  image.parentElement?.classList.remove('is-loaded');
  image.parentElement?.classList.remove('has-load-error');

  const retryCount = Number(image.dataset.retryCount || 0);
  if (retryCount >= 3) {
    image.parentElement?.classList.add('has-load-error');
    return;
  }

  image.dataset.retryCount = String(retryCount + 1);
  const originalSrc = image.dataset.originalSrc || image.src;
  image.dataset.originalSrc = originalSrc;

  window.setTimeout(
    () => {
      try {
        const nextSrc =
          retryCount >= 1 ? buildCloudinaryDisplayFallbackUrl(originalSrc) : originalSrc;
        const retryUrl = new URL(nextSrc);
        retryUrl.searchParams.set('_boh_retry', `${Date.now()}-${retryCount + 1}`);
        image.src = retryUrl.toString();
      } catch (_error) {
        image.src = originalSrc;
      }
    },
    600 * (retryCount + 1),
  );
}

async function removeEntry(entry) {
  const userId = String(userInfo.value?.id || '').trim();
  if (!userId) return;

  if (String(entry?.source || '').trim() === 'forum') {
    showNotice('这条内容来自论坛同步，不能在 Cloud+ 里单独删除，请到论坛删除原帖');
    return;
  }
  if (isPublicCloudEntry(entry)) {
    showNotice('公开笔记在作品格管理，请去作品格删除');
    return;
  }

  if (
    !(await dialog.confirm({
      title: '删除内容',
      message: '确定删除这条内容吗？',
      tone: 'danger',
      confirmText: '删除',
    }))
  )
    return;

  const result = await deleteCloudEntryWithAssets(userId, entry);
  if (!result.ok) {
    showNotice(result.error?.message || '删除失败');
    return;
  }

  entries.value = entries.value.filter((item) => item.id !== entry?.id);
  persistCachedEntries(userId, entries.value);
  cloudState.content.hasLoaded = true;
  cloudState.content.error = null;
  cloudState.content.isShowingCached = false;
  cloudState.content.activeUserId = userId;
  cloudState.content.lastFetchTime = Date.now();
  if (selectedEntry.value?.id === entry?.id) {
    selectedEntry.value = null;
    selectedEntrySource.value = 'mine';
  }
  showNotice('内容已删除');
  void loadEntries();
}

watch(
  () => [isLoggedIn.value, userInfo.value?.id],
  () => {
    const userId = String(userInfo.value?.id || '').trim();
    if (!isLoggedIn.value || !userId) {
      entries.value = [];
      subscriptions.value = [];
      myShareChannel.value = null;
      shareViewers.value = [];
      cloudState.content.hasLoaded = false;
      cloudState.content.error = null;
      cloudState.content.isShowingCached = false;
      cloudState.content.activeUserId = '';
      cloudState.content.lastFetchTime = null;
      cloudState.share.tokenState = 'idle';
      cloudState.share.error = null;
      return;
    }
    if (cloudState.content.activeUserId && cloudState.content.activeUserId !== userId) {
      entries.value = [];
      cloudState.content.hasLoaded = false;
      cloudState.content.error = null;
      cloudState.content.isShowingCached = false;
      cloudState.content.lastFetchTime = null;
    }
    void loadEntries();
    void loadSubscriptions();
    void loadMyShareChannel();
  },
  { immediate: true },
);

watch(
  () => [cloudTab.value, currentFilter.value, searchQuery.value, dateFrom.value, dateTo.value],
  () => {
    visibleEntryLimit.value = GALLERY_INITIAL_LIMIT;
  },
);

watch(normalizedSharedTokenInput, (token) => {
  if (token.length >= 12) {
    persistStoredSharedToken(token);
  } else if (!String(sharedTokenInput.value || '').trim()) {
    persistStoredSharedToken('');
  }
});

/* 面板打开时接管两件事：锁背景滚动 + Esc 关闭。
   Esc 走 closeComposer（而不是直接置 false），否则草稿保护会被键盘这条路径绕过。 */
function handleComposerKeydown(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  void closeComposer();
}

watch(isComposerOpen, (open) => {
  if (typeof window === 'undefined') return;
  window.document.body.style.overflow = open ? 'hidden' : '';
  if (open) window.addEventListener('keydown', handleComposerKeydown);
  else window.removeEventListener('keydown', handleComposerKeydown);
});

const handlePageHide = () => {
  void cleanupDraftUploads({ silent: true, keepalive: true });
};

onBeforeRouteLeave(() => {
  void cleanupDraftUploads({ silent: true, keepalive: true });
});

/* 空闲预热（2026-10-22）：悬停预热只在 pointerenter 时触发，用户**直接点**（手机上
   没有 hover）就完全不预热 ⇒ 首次点「我」仍是 白板→骨架→内容。挂载后空闲时预热一次，
   把 路由 chunk / 身份卡 chunk / 三份 profile 样式 都提前拉好，点击即可即时落位。
   idle 兜底 2s：不支持 requestIdleCallback 的环境（旧 Safari）也不至于永不预热。 */
onMounted(() => {
  const warm = () => preloadUserSpaceForNav();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 2000 });
  } else {
    window.setTimeout(warm, 2000);
  }
});

onMounted(() => {
  applyCloudPlusRouteView();
  // 首次挂载不会走 onActivated：直接深链进来 / 相机首次返回都要在这里接一次
  consumeCameraCapture();
  if (typeof window !== 'undefined') {
    const cachedToken = readStoredSharedToken();
    if (cachedToken && !sharedTokenInput.value) {
      sharedTokenInput.value = cachedToken;
    }
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('theme-changed', handleThemeChanged);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('keydown', handleComposerKeydown);
    window.removeEventListener('theme-changed', handleThemeChanged);
    window.document.body.style.overflow = '';
  }
});

/* ── keepAlive 激活 / 失活（2026-11-04）───────────────────────────────────
   底栏「图库」与「我」相邻，来回切不该整页重挂 ⇒ 路由加了 meta.keepAlive。
   缓存之后**离开页面不再走 onUnmounted**，原先靠卸载收尾的三件事必须显式搬过来，
   否则会以「不报错的静默残留」出现：

   ① body 滚动锁：发布面板打开时 watch(isComposerOpen) 把 body 设成 overflow:hidden。
      缓存实例离开时若不摘，底下的「我」页整页滚不动。
   ② 编辑态：路由离开时 onBeforeRouteLeave 已经把这批图从 Cloudinary 删了，
      缓存里再留一份「指向已删资源」的 uploadedImages 会让下次打开面板显示裂图。
      与不缓存时的「离开即丢弃」保持一致 —— 底栏那条路更早一步被 handleBottomNavClick
      拦成「放弃编辑？」确认，不会静默丢内容。
   ③ 数据新鲜度：见 onActivated 的 TTL 补拉。

   ⚠️ 实测口径（别再想当然）：本组件是 Cloud+/index.vue 里 Suspense + createPanelAsync
   包出来的，**首次挂载不会触发 onActivated**（探针实测：第一次进图库只有 loadEntries，
   没有任何 activated 回调），所以这里**不能**用「首调闩一次」的写法 —— 那会把第一次
   真正的重新激活吞掉。防重复取数靠下面两个条件：`loading`（setup 里的 immediate 取数
   正在飞）与 TTL（刚取过就不取），两条都满足才补拉。 */
const CLOUD_ACTIVATION_REFRESH_TTL_MS = 60 * 1000;

/**
 * 消费相机成片（plans/041）。
 *
 * 相机页把 File 放进 `camera-capture-bridge` 后返回图库，这里把它接进「新建」的
 * 图片队列 —— 用户补不补标题都能发布（`publishEntry` 允许纯图片条目）。
 *
 * ⚠️ onMounted 与 onActivated 都要调（见上面那段「首次挂载不触发 activated」），
 * 只挂一个的话，其中一条返回路径会「什么都不发生」，而 bridge 里的 File 已经被
 * 取走（不是没取），表现为照片凭空消失。
 */
function consumeCameraCapture() {
  const file = takeCameraCapture();
  if (!file) return;
  openComposer();
  void addFilesToDraft([file]);
}

onDeactivated(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = '';
  if (!isPublishing.value && !isUploadingImages.value && uploadedImages.value.length) {
    uploadedImages.value = [];
    cloudState.upload.failedImages = [];
  }
  isComposerOpen.value = false;
  isMoodTrayOpen.value = false;
  // 多选态与回收站勾选不跨页存活：KeepAlive 回来后不该自动停在选择模式
  exitSelectMode();
  resetTrashSelection();
});

onActivated(() => {
  if (isComposerOpen.value && typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }
  // 相机回来：成片接进「新建」的图片队列（plans/041）
  consumeCameraCapture();
  // 缓存实例回来时滚动位置可能已被 route-scroll-memory 还原到中途，
  // 但 hidden 是上一段滚动留下的状态 ⇒ 显式复位，避免「刚回来底栏就是收起的」。
  resetBottomNavAutoHide();
  // 深链 ?entry=… 靠 entries 就位后由 loadEntries 打开；缓存实例不会重跑它，这里补一次
  tryOpenEntryFromQuery();
  if (cloudTab.value === 'share') refreshSharePanelState();
  // 回收站是「删完马上来看」的页面，缓存实例回来必须重取，否则会展示已恢复/已过期的旧列表
  if (cloudTab.value === 'trash') void loadTrashedImages();
  // 资产数据允许短暂陈旧，但不该无限期陈旧：超 TTL 才静默补拉（DOM 与滚动位置不动，不回骨架）
  const lastFetchedAt = Number(cloudState.content.lastFetchTime || 0);
  if (!cloudState.content.loading && Date.now() - lastFetchedAt > CLOUD_ACTIVATION_REFRESH_TTL_MS) {
    void loadEntries();
  }
});

watch(
  cloudTab,
  (nextTab) => {
    if (nextTab !== 'content') {
      exitSelectMode();
    }
    if (nextTab !== 'trash') {
      resetTrashSelection();
    }
    applyCloudPlusRouteView();
  },
  { immediate: true },
);
</script>

<style scoped>
@import './style.scoped.css';
</style>

<!-- 左栏的定位 / 内容让位 / 条目状态色（body.page-bohcloudplus 段）。
     ⚠️ 必须非 scoped：它按 body 级 page class 命中，scoped 的 data-v 会把它废掉。 -->
<style src="@/views/user-center/UserSpace/styles/landscape-rail.css"></style>
