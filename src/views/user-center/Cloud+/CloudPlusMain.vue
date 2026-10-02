<template>
  <div class="cloud-page" :class="{ embedded: isDesktopEmbed, 'with-topbar': !isDesktopEmbed }">
    <UserCenterPageHeader
      v-if="!isDesktopEmbed"
      title="BOH Cloud+"
      max-width="1200px"
      @back="goBack"
    />

    <!-- is-gallery：图库页在宽屏要铺满（iPad 图库的网格是全宽的，
         980px 居中会让两侧各空一大块）；设置页 / 分享页仍是窄栏居中，保持文字可读性。 -->
    <div class="cloud-shell" :class="{ 'is-gallery': cloudTab === 'content' }">
      <main class="cloud-main">
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

            <button type="button" class="primary-btn" @click="openComposer">＋ 新建</button>
          </div>
        </header>

        <header v-else class="cloud-header">
          <div>
            <div class="hero-copy">
              <span class="hero-eyebrow">{{ cloudPageHero.eyebrow }}</span>
              <h2>{{ cloudPageHero.title }}</h2>
              <p>{{ cloudPageHero.subtitle }}</p>
            </div>
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
                  <p class="share-card-copy">
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
                      <div v-else class="share-viewer-list">
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

            <section v-else-if="sharedChannel" class="gallery-section shared-channel-section">
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
                  @click="openEntry(entry, 'shared')"
                >
                  <div v-if="entry.coverImageUrl" class="card-visual">
                    <img
                      :src="getCloudImageDisplayUrl(entry.coverImageUrl)"
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

            <div v-if="isComposerOpen" class="composer-overlay" @click.self="closeComposer">
              <section class="composer-card composer-panel">
                <button
                  type="button"
                  class="detail-close composer-close"
                  aria-label="关闭新建面板"
                  @click="closeComposer"
                >
                  ×
                </button>
                <div class="composer-topline">
                  <div>
                    <span class="section-kicker">Create Entry</span>
                    <h3>{{ composerTitle }}</h3>
                    <p class="composer-intro">{{ composerIntro }}</p>
                  </div>
                  <div class="composer-meta">{{ todayDisplay }}</div>
                </div>

                <div class="editor-shell">
                  <div class="editor-ribbon">
                    <span class="editor-chip strong">Cloud+ Draft</span>
                    <span class="editor-chip">Memo Layout</span>
                    <span class="editor-chip">{{ uploadedImages.length }} 张图片</span>
                    <span class="editor-chip">{{ draftText.trim().length }} 字符</span>
                  </div>

                  <div class="editor-page">
                    <div class="editor-page-head">
                      <div class="editor-page-meta">
                        <span>Personal Memo</span>
                        <span>{{ todayDisplay }}</span>
                      </div>
                      <div class="editor-page-status">
                        {{
                          draftMood ? `${selectedMoodMeta?.icon || ''} ${draftMood}` : '未标注情绪'
                        }}
                      </div>
                    </div>

                    <input
                      v-model.trim="draftTitle"
                      type="text"
                      class="title-input"
                      maxlength="120"
                      placeholder="标题"
                    />

                    <div class="editor-divider"></div>

                    <textarea
                      v-model="draftText"
                      class="text-input"
                      rows="8"
                      placeholder="记录今天的心情..."
                      @keydown.meta.enter.prevent="publishEntry"
                      @keydown.ctrl.enter.prevent="publishEntry"
                    />
                  </div>

                  <div class="composer-toolbar">
                    <div class="mood-row">
                      <button
                        type="button"
                        class="mood-pill clear"
                        :class="{ active: !draftMood }"
                        @click="draftMood = ''"
                      >
                        不标注
                      </button>
                      <button
                        v-for="mood in moodChoices"
                        :key="mood.value"
                        type="button"
                        class="mood-pill"
                        :class="{ active: draftMood === mood.value }"
                        @click="draftMood = mood.value"
                      >
                        <span>{{ mood.icon }}</span>
                        <span>{{ mood.value }}</span>
                      </button>
                    </div>

                    <div class="toolbar-actions">
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
                        class="secondary-btn"
                        :disabled="cloudState.upload.uploading"
                        @click="openImagePicker"
                      >
                        <span v-if="cloudState.upload.uploading" class="btn-spinner"></span>
                        {{
                          cloudState.upload.uploading
                            ? `上传中 ${cloudState.upload.progress}%`
                            : '添加图片'
                        }}
                      </button>
                      <button
                        v-if="cloudState.upload.uploading"
                        type="button"
                        class="ghost-link upload-cancel-btn"
                        @click="cancelUpload"
                      >
                        取消上传
                      </button>
                      <button
                        v-if="cloudState.upload.failedImages.length"
                        type="button"
                        class="secondary-btn retry-btn"
                        @click="retryFailedUploads"
                      >
                        重试上传 ({{ cloudState.upload.failedImages.length }})
                      </button>
                      <button
                        type="button"
                        class="primary-btn"
                        :disabled="
                          cloudState.publish.publishing ||
                          (!draftText.trim() && uploadedImages.length === 0)
                        "
                        @click="publishEntry"
                      >
                        {{ cloudState.publish.publishing ? '发布中...' : publishButtonLabel }}
                      </button>
                    </div>

                    <!-- 上传进度条 -->
                    <div v-if="cloudState.upload.uploading" class="upload-progress-bar">
                      <div class="upload-progress-track">
                        <div
                          class="upload-progress-fill"
                          :style="{ width: `${cloudState.upload.progress}%` }"
                        ></div>
                      </div>
                      <p class="upload-progress-text">
                        正在上传 {{ cloudState.upload.currentFile || '图片' }}...
                      </p>
                    </div>

                    <!-- 上传失败的图片提示 -->
                    <div
                      v-if="cloudState.upload.failedImages.length && !cloudState.upload.uploading"
                      class="upload-failed-notice"
                    >
                      <p>以下图片上传失败：</p>
                      <ul>
                        <li v-for="failed in cloudState.upload.failedImages" :key="failed.name">
                          {{ failed.name }} - {{ failed.error }}
                        </li>
                      </ul>
                      <button type="button" class="secondary-btn" @click="retryFailedUploads">
                        重新上传
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="uploadedImages.length" class="upload-strip">
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
                      @click="removeDraftImage(image.url)"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <p class="composer-hint">
                  {{
                    draftMood
                      ? `当前心情：${selectedMoodMeta?.icon || ''}${draftMood}`
                      : '可以只写文字，也可以只上传图片。'
                  }}
                  <span class="composer-hint-sep">/</span>
                  Cmd/Ctrl + Enter 可直接发布
                </p>
              </section>
            </div>

            <div v-if="noticeText" class="notice-bar">{{ noticeText }}</div>

            <!-- 手势宿主：捏合改列数（仿 iOS 图库），列数经 CSS 变量下发给网格。
                 touchmove 必须是**非 passive** 才能在两指时 preventDefault 掉浏览器缩放
                 （Vue 的 @touchmove 默认就是非 passive；别加 .passive 修饰符）。
                 wheel 分支服务 Mac 触控板：浏览器把「双指捏合」报成 ctrlKey=true 的 wheel。 -->
            <section
              ref="albumSectionRef"
              class="gallery-section album-gallery-section"
              :style="{ '--album-columns': resolvedAlbumColumns }"
              @touchstart.passive="onAlbumTouchStart"
              @touchend.passive="onAlbumPinchEnd"
              @touchcancel.passive="onAlbumPinchEnd"
              @wheel="onAlbumWheel"
            >
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
                <div class="gallery-grid album-tile-grid">
                  <article
                    v-for="tile in albumTiles"
                    :key="tile.key"
                    class="gallery-tile"
                    :class="`tile-${tile.entry.entryType}`"
                    @click="openEntry(tile.entry)"
                  >
                    <template v-if="tile.imageUrl">
                      <img
                        :src="getCloudImageDisplayUrl(tile.imageUrl)"
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
      v-if="cloudTab === 'content' && isLoggedIn && !isComposerOpen && !selectedEntry"
      type="button"
      class="gallery-fab"
      aria-label="新建 Cloud+ 内容"
      @click="openComposer"
    >
      ＋
    </button>

    <nav class="cloud-bottom-nav" aria-label="Cloud+ 页面导航">
      <button
        v-for="item in cloudBottomNavItems"
        :key="item.id"
        type="button"
        class="cloud-bottom-nav-item"
        :class="{ active: cloudTab === item.id }"
        @click="switchCloudTab(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div v-if="selectedEntry" class="detail-overlay" @click.self="closeEntry">
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
                   图片直接复用 Cloudinary url（不二次上传），经论坛草稿通道预填发帖器。 -->
              <button
                v-if="collectEntryImageUrls(selectedEntry).length"
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
                :src="getCloudImageDisplayUrl(block.url)"
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
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, reactive } from 'vue';
import { useDebounce } from '@/composables/useDebounceThrottle';
import { storeToRefs } from 'pinia';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ChevronDown, Cloud, Search } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import CloudStorageBar from './CloudStorageBar.vue';
import { useAuthStore } from '@/stores/auth';
import { moodChoices, getMoodMeta } from './config.js';
import { getMySubscriptions } from '@/utils/api/subscription-api.js';
import {
  uploadImageToCloudinary,
  isCloudinaryNoteUploadConfigured,
  deleteCloudinaryAssetByToken,
  supportsCloudinaryClientDeleteToken,
  deleteCloudinaryAssetsByPublicIds,
  extractCloudinaryPublicIdFromUrl,
  getCloudinaryDisplayUrl,
} from '@/utils/cloudinary-client.js';
import {
  CLOUD_UPLOAD_BURST_LIMIT,
  CLOUD_UPLOAD_BURST_WINDOW_MS,
  validateImageFileBasics,
  registerCloudUploadBurst,
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
} from '@/utils/api/boh-cloud-api.js';
import { serializeCloudTextAndImages, cloudEntryDefaultTitle } from '@/utils/boh-cloud-content.js';
import {
  computeCloudStorageAccounting,
  isPublicCloudEntry,
  normalizeCloudVisibility,
} from '@/utils/cloud-storage-accounting.js';
import { deleteCloudEntryWithAssets } from '@/utils/cloud-entry-maintenance.js';
import {
  DEFAULT_CLOUD_IMAGE_LIMIT,
  resolveCloudBenefitFromSubscriptions,
} from '@/utils/subscription-benefits.js';
import { logger } from '@/utils/logger.js';
import {
  createCloudSettingsSubscriptionLocation,
  createUserSpaceProfileReturnLocation,
  resolveSettingsBackLocation,
} from '@/utils/user-space-navigation.js';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { showIsland } from '@/composables/useIsland.js';

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
const activeEntriesUserId = computed({
  get: () => cloudState.content.activeUserId,
  set: (val) => (cloudState.content.activeUserId = val),
});
const isPublishing = computed(() => cloudState.publish.publishing);
const isUploadingImages = computed(() => cloudState.upload.uploading);
const currentFilter = ref('all');
const isComposerOpen = ref(false);
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
const todayDisplay = computed(() => formatDisplayDate(new Date()));
const cloudTab = computed(() => {
  const view = String(route.query.view || route.query.mode || '').trim();
  if (['settings', 'share'].includes(view)) return view;
  return 'content';
});
const composerTitle = computed(() => '发布新内容');
const composerIntro = computed(() => '像写一页备忘录一样记录今天，让文字和图片自然排版。');
const publishButtonLabel = computed(() => '发布到 Cloud+');
const cloudBottomNavItems = [
  { id: 'content', label: '内容' },
  { id: 'share', label: '分享' },
  { id: 'settings', label: '设置' },
];
const cloudPageHero = computed(() => {
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
const goBack = () => {
  router.push(resolveSettingsBackLocation(route, createUserSpaceProfileReturnLocation()));
};
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
const albumTiles = computed(() =>
  visibleFilteredEntries.value.flatMap((entry) => {
    const images = collectEntryImageUrls(entry);
    if (!images.length) {
      return [{ key: `${entry.id}::paper`, entry, imageUrl: '', isFirstOfEntry: true }];
    }
    return images.map((imageUrl, index) => ({
      key: `${entry.id}::${index}`,
      entry,
      imageUrl,
      isFirstOfEntry: index === 0,
    }));
  }),
);

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

try {
  const savedColumns = Number(localStorage.getItem(ALBUM_COLUMNS_STORAGE_KEY));
  if (Number.isFinite(savedColumns) && savedColumns >= ALBUM_COLUMN_MIN) {
    albumColumnCount.value = Math.min(savedColumns, ALBUM_COLUMN_MAX);
  }
} catch {
  // 隐私模式 / 无 storage 时读不到；列数只是观感偏好，回落自动列数即可
}

let lastAlbumSectionWidth = 0;

function measureAutoAlbumColumns() {
  const width = albumSectionRef.value?.clientWidth || window.innerWidth || 0;
  if (!width) return;
  // ResizeObserver 观察的是整个 section：图片陆续加载会让**高度**不断变化，
  // 但列数只跟**宽度**有关。不做这个早退的话，首屏每加载一张图就强制同步布局一次
  // （回调查 clientWidth 会 flush），30 张图 = 30 次布局抖动，滚动时就是肉眼可见的顿挫。
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

onMounted(() => {
  measureAutoAlbumColumns();
  window.addEventListener('resize', measureAutoAlbumColumns);
  if (typeof ResizeObserver !== 'undefined' && albumSectionRef.value) {
    albumResizeObserver = new ResizeObserver(measureAutoAlbumColumns);
    albumResizeObserver.observe(albumSectionRef.value);
  }
});
onUnmounted(() => {
  window.removeEventListener('resize', measureAutoAlbumColumns);
  albumResizeObserver?.disconnect();
  albumResizeObserver = null;
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

function openComposer() {
  isComposerOpen.value = true;
}

function closeComposer() {
  isComposerOpen.value = false;
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
  const safeTab = ['content', 'share', 'settings'].includes(String(tabId))
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

function applyCloudPlusRouteView() {
  if (cloudTab.value === 'share') {
    refreshSharePanelState();
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

async function handleImageSelection(event) {
  const input = event?.target;
  const files = Array.from(input?.files || []);
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
  let uploadedCount = 0;

  try {
    for (const file of files) {
      cloudState.upload.currentFile = file.name;

      // 检查是否被取消
      if (uploadController.signal.aborted) {
        showNotice('上传已取消');
        break;
      }

      try {
        // 传入 signal：用户点取消时真正中止在途 HTTP 上传，而不是只重置 UI 状态让请求继续跑到超时
        const uploaded = await uploadImageToCloudinary(file, {
          signal: uploadController.signal,
        });
        uploadedImages.value.push({
          url: uploaded.url,
          publicId: uploaded.publicId,
          deleteToken: uploaded.deleteToken,
          alt: uploaded.originalFilename || file.name,
          width: uploaded.width,
          height: uploaded.height,
        });
        uploadedCount++;
        cloudState.upload.progress = Math.round((uploadedCount / totalFiles) * 100);
      } catch (uploadError) {
        // 用户主动取消：中止剩余文件，不计入失败列表
        if (uploadError?.name === 'AbortError' || uploadController.signal.aborted) {
          showNotice('上传已取消');
          break;
        }
        // 记录失败的图片，提供重试选项
        cloudState.upload.failedImages.push({
          file,
          error: uploadError?.message || '上传失败',
          name: file.name,
        });
        logger.error('cloud-plus', `上传图片 ${file.name} 失败:`, uploadError);
      }
    }

    if (uploadedCount > 0) {
      showNotice(`已添加 ${uploadedCount} 张图片`);
    }

    if (cloudState.upload.failedImages.length > 0) {
      showNotice(`${cloudState.upload.failedImages.length} 张图片上传失败，可以重新尝试上传`);
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
      showNotice(error?.message || '图片上传失败');
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
    isComposerOpen.value = false;
    void loadEntries();
  } finally {
    cloudState.publish.publishing = false;
  }
}

function openEntry(entry, source = 'mine') {
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

watch(isComposerOpen, (open) => {
  if (typeof window === 'undefined') return;
  window.document.body.style.overflow = open ? 'hidden' : '';
});

const handlePageHide = () => {
  void cleanupDraftUploads({ silent: true, keepalive: true });
};

onBeforeRouteLeave(() => {
  void cleanupDraftUploads({ silent: true, keepalive: true });
});

onMounted(() => {
  applyCloudPlusRouteView();
  if (typeof window !== 'undefined') {
    const cachedToken = readStoredSharedToken();
    if (cachedToken && !sharedTokenInput.value) {
      sharedTokenInput.value = cachedToken;
    }
    window.addEventListener('pagehide', handlePageHide);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', handlePageHide);
    window.document.body.style.overflow = '';
  }
});

watch(
  cloudTab,
  () => {
    applyCloudPlusRouteView();
  },
  { immediate: true },
);
</script>

<style scoped>
@import './style.scoped.css';
</style>
