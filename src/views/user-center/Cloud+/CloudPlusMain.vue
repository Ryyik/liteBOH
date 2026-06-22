<template>
  <div class="cloud-page" :class="{ embedded: isDesktopEmbed, 'with-topbar': !isDesktopEmbed }">
    <UserCenterPageHeader v-if="!isDesktopEmbed" title="BOH Cloud+" max-width="1200px" @back="goBack" />

    <div class="cloud-shell">
      <main class="cloud-main">
        <header class="cloud-header">
          <div>
            <div class="hero-copy">
              <span class="hero-eyebrow">{{ cloudPageHero.eyebrow }}</span>
              <h2>{{ cloudPageHero.title }}</h2>
              <p>{{ cloudPageHero.subtitle }}</p>
            </div>
          </div>
          <button v-if="cloudTab === 'content'" class="refresh-btn" type="button" :disabled="isLoading" @click="loadEntries">
            <span v-if="showRefreshIndicator" class="refresh-btn-dot" aria-hidden="true"></span>
            <span>{{ showRefreshIndicator ? '同步中' : '刷新内容' }}</span>
          </button>
        </header>

        <div v-if="!isLoggedIn" class="login-state">
          <div class="login-card">
            <Cloud class="login-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
            <h3>登录后开启你的 BOH Cloud+</h3>
            <p>这里会保存你的文字、图片和图文混合内容。</p>
            <button class="primary-btn" @click="router.push('/login')">去登录</button>
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
              <div class="sidebar-card quota-card">
                <div class="card-label">图片使用限额</div>
                <div class="quota-minimal">
                  <div class="quota-meta">
                    <strong>{{ totalStoredImages }}</strong>
                    <span>/ {{ currentCloudImageLimit }}</span>
                  </div>
                  <div class="quota-action-row">
                    <div class="quota-meter" role="progressbar" :aria-valuenow="totalStoredImages" :aria-valuemin="0"
                      :aria-valuemax="currentCloudImageLimit">
                      <div class="quota-meter-fill" :style="{ width: `${quotaPercent}%` }"></div>
                    </div>
                    <button type="button" class="quota-upgrade-btn" @click="openSubscriptionsFromCloudSettings">
                      升级限额
                    </button>
                  </div>
                  <p class="quota-caption">{{ remainingImageQuota }} 张可用</p>
                </div>
                <p class="quota-hint">Cloud+ 图片限额按账号计算，私密内容和共享访问使用同一额度。</p>
              </div>
            </div>
          </section>

          <section v-else-if="cloudTab === 'share'" class="cloud-share-page">
            <div class="cloud-share-grid">
              <div class="sidebar-card share-card" :aria-busy="isLoadingMyShareChannel ? 'true' : undefined">
                <div class="card-label">频道状态</div>
                <div v-if="isLoadingMyShareChannel" class="share-status-skeleton" aria-hidden="true">
                  <div class="skeleton-block share-skeleton-copy"></div>
                  <div class="skeleton-block share-skeleton-copy short"></div>
                  <div class="skeleton-block share-skeleton-button"></div>
                </div>
                <template v-else>
                  <p class="share-card-copy">
                    系统提供 1 个私密令牌频道。只有拿到访问令牌的人可以查看你的 Cloud+ 内容。
                  </p>
                  <p class="share-token-hint">私密频道不会出现在社区列表，仅持有访问令牌的人可以查看。</p>
                  <button type="button" class="primary-btn share-action-btn"
                    :class="{ 'is-active-share': myShareChannel?.isActive }"
                    :disabled="isSavingShareChannel || isLoadingMyShareChannel" @click="toggleMyShareChannel">
                    {{ isSavingShareChannel ? '处理中...' : (myShareChannel?.isActive ? `关闭${activeShareChannelLabel}` : `开启${activeShareChannelLabel}`) }}
                  </button>
                  <div class="share-description-control">
                    <div class="share-token-label">令牌备注</div>
                    <textarea v-model="shareDescriptionDraft" class="share-description-input" maxlength="160" rows="3"
                      placeholder="给这枚令牌写一句备注。"
                      :disabled="isSavingShareChannel" @blur="saveShareDescription"></textarea>
                    <div class="share-description-footer">
                      <span>{{ shareDescriptionDraft.length }}/160</span>
                      <button type="button" class="secondary-btn share-description-save-btn"
                        :disabled="isSavingShareChannel || shareDescriptionDraft.trim() === (myShareChannel?.description || '').trim()"
                        @click="saveShareDescription">
                        保存描述
                      </button>
                    </div>
                  </div>
                  <div v-if="myShareChannel?.shareToken" class="share-token-shell">
                    <div class="share-token-label">访问令牌</div>
                    <div class="share-token-row">
                      <input :value="myShareChannel.shareToken" type="text" class="share-token-input" readonly>
                      <button type="button" class="secondary-btn share-copy-btn" @click="copyMyShareToken">复制</button>
                    </div>
                    <p class="share-token-hint">
                      私密频道默认不公开，只有拿到令牌的人可以访问。
                    </p>
                    <div class="share-token-actions">
                      <button type="button" class="secondary-btn share-inline-btn" :disabled="isSavingShareChannel"
                        @click="regenerateMyShareChannel">
                        撤销并生成新令牌
                      </button>
                    </div>
                    <div class="share-viewers-panel">
                      <div class="share-token-label">令牌访问记录</div>
                      <div v-if="isLoadingShareViewers" class="share-viewers-skeleton" aria-hidden="true">
                        <div v-for="item in 3" :key="`settings-share-viewer-loading-${item}`" class="share-viewer-row skeleton">
                          <div class="skeleton-block share-viewer-avatar"></div>
                          <div class="share-viewer-main">
                            <div class="skeleton-block share-viewer-name-skeleton"></div>
                            <div class="skeleton-block share-viewer-meta-skeleton"></div>
                          </div>
                        </div>
                      </div>
                      <p v-else-if="shareViewersError" class="share-error-text">{{ shareViewersError }}</p>
                      <p v-else-if="shareViewers.length === 0" class="share-token-hint">
                        暂时还没有已登录用户通过令牌访问过你的私密频道。
                      </p>
                      <div v-else class="share-viewer-list">
                        <div v-for="viewer in shareViewers" :key="viewer.viewerUserId" class="share-viewer-row">
                          <img v-if="viewer.viewerAvatarUrl" :src="viewer.viewerAvatarUrl" :alt="viewer.viewerUsername || '访客头像'"
                            class="share-viewer-avatar" loading="lazy">
                          <span v-else class="share-viewer-avatar placeholder">
                            {{ (viewer.viewerUsername || 'U').slice(0, 1).toUpperCase() }}
                          </span>
                          <div class="share-viewer-main">
                            <strong>{{ viewer.viewerUsername || '未知用户' }}</strong>
                            <span>{{ formatViewerTime(viewer.lastViewedAt) }} · {{ viewer.viewCount }} 次查看</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>

              <div class="sidebar-card access-card">
                <div class="card-label">访问别人的频道</div>
                <p class="share-card-copy">
                  输入别人分享给你的私密访问令牌，打开 TA 的 Cloud+ 频道。
                </p>
                <input v-model.trim="sharedTokenInput" type="text" class="share-token-input editable"
                  placeholder="输入访问令牌" @keydown.enter.prevent="openSharedChannel">
                <div class="share-token-actions">
                  <button type="button" class="primary-btn share-action-btn"
                    :disabled="isLoadingSharedChannel || !normalizedSharedTokenInput" @click="openSharedChannel">
                    {{ isLoadingSharedChannel ? '加载中...' : '查看共享 Cloud+' }}
                  </button>
                  <button v-if="sharedChannel" type="button" class="ghost-link" @click="exitSharedChannel">
                    退出共享
                  </button>
                </div>
                <p v-if="sharedChannelError" class="share-error-text">{{ sharedChannelError }}</p>
              </div>
            </div>

            <section v-if="isLoadingSharedChannel" class="gallery-section shared-channel-section shared-channel-loading"
              aria-busy="true">
              <div class="section-heading">
                <div>
                  <span class="section-kicker">Shared Channel</span>
                  <h3>正在读取共享频道</h3>
                </div>
              </div>
              <div class="gallery-grid shared-skeleton-grid" aria-hidden="true">
                <article v-for="item in 4" :key="`settings-shared-loading-${item}`" class="cloud-card skeleton-card">
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
                  <button type="button" class="secondary-btn shared-collapse-btn" @click="toggleSharedContentCollapse">
                    {{ isSharedContentCollapsed ? '展开内容' : '折叠内容' }}
                  </button>
                </div>
              </div>

              <div class="gallery-inline-feedback shared-channel-banner">
                <span>访问令牌已验证成功。你正在查看 {{ sharedChannelTitle }} 的 Cloud+ 内容。</span>
                <button type="button" class="ghost-link feedback-action" @click="exitSharedChannel">退出共享</button>
              </div>

              <div v-if="isSharedContentCollapsed" class="empty-state shared-collapsed-state">
                <ChevronDown class="empty-icon" :size="36" :stroke-width="1.7" aria-hidden="true" />
                <h4>共享内容已折叠</h4>
                <p>展开后可继续查看全部条目。</p>
                <button type="button" class="primary-btn" @click="toggleSharedContentCollapse">展开共享内容</button>
              </div>

              <div v-else-if="sharedEntries.length === 0" class="empty-state filter-empty-state">
                <Cloud class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
                <h4>这个共享频道还没有内容</h4>
                <p>对方发布 Cloud+ 后，这里会显示 TA 的内容。</p>
              </div>

              <div v-else class="gallery-grid">
                <article v-for="entry in sharedEntries" :key="`settings-shared-${entry.id}`" class="cloud-card"
                  :class="[`type-${entry.entryType}`, { featured: entry.coverImageUrl }]" @click="openEntry(entry, 'shared')">
                  <div v-if="entry.coverImageUrl" class="card-visual">
                    <img :src="getCloudImageDisplayUrl(entry.coverImageUrl)" :alt="entry.title || 'Cloud cover'"
                      class="card-cover cloud-loading-image" loading="eager" decoding="async" referrerpolicy="no-referrer"
                      @load="handleCloudImageLoaded" @error="retryCloudImageLoad">
                    <div class="card-overlay">
                      <span class="entry-badge">{{ entryTypeLabel(entry.entryType) }}</span>
                    </div>
                  </div>

                  <div class="card-body">
                    <div class="card-date">{{ formatEntryDate(entry.entryDate, entry.updatedAt) }}</div>
                    <h4 class="card-title">{{ entry.title || defaultTitle(entry) }}</h4>
                    <p class="card-text">{{ entry.previewText || '这条内容里暂时没有文字预览。' }}</p>
                    <div class="card-footer">
                      <span class="card-meta">{{ blockSummary(entry) }}</span>
                      <button type="button" class="ghost-link">打开</button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </section>

          <template v-else>
          <section v-if="cloudModeBanner" class="cloud-mode-banner">
            <div>
              <span class="section-kicker">{{ cloudModeBanner.kicker }}</span>
              <h3>{{ cloudModeBanner.title }}</h3>
              <p>{{ cloudModeBanner.subtitle }}</p>
            </div>
            <button v-if="cloudModeBanner.action" type="button" class="secondary-btn cloud-mode-action"
              @click="cloudModeBanner.action">
              {{ cloudModeBanner.actionText }}
            </button>
          </section>

          <section class="composer-card">
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
                    {{ draftMood ? `${selectedMoodMeta?.icon || ''} ${draftMood}` : '未标注情绪' }}
                  </div>
                </div>

                <input v-model.trim="draftTitle" type="text" class="title-input" maxlength="120"
                  placeholder="标题">

                <div class="editor-divider"></div>

                <textarea v-model="draftText" class="text-input" rows="8"
                  placeholder="记录今天的心情..."
                  @keydown.meta.enter.prevent="publishEntry" @keydown.ctrl.enter.prevent="publishEntry" />
              </div>

              <div class="composer-toolbar">
                <div class="mood-row">
                  <button type="button" class="mood-pill clear" :class="{ active: !draftMood }" @click="draftMood = ''">
                    不标注
                  </button>
                  <button v-for="mood in moodChoices" :key="mood.value" type="button" class="mood-pill"
                    :class="{ active: draftMood === mood.value }" @click="draftMood = mood.value">
                    <span>{{ mood.icon }}</span>
                    <span>{{ mood.value }}</span>
                  </button>
                </div>

                <div class="toolbar-actions">
                  <input ref="imageInputRef" type="file" class="hidden-file-input"
                    accept="image/png,image/jpeg,image/webp,image/gif" multiple @change="handleImageSelection">
                  <button type="button" class="secondary-btn" :disabled="isUploadingImages" @click="openImagePicker">
                    <span v-if="isUploadingImages" class="btn-spinner"></span>
                    {{ isUploadingImages ? '上传中...' : '添加图片' }}
                  </button>
                  <button type="button" class="primary-btn"
                    :disabled="isPublishing || (!draftText.trim() && uploadedImages.length === 0)" @click="publishEntry">
                    {{ isPublishing ? '发布中...' : publishButtonLabel }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="uploadedImages.length" class="upload-strip">
              <div v-for="image in uploadedImages" :key="image.url" class="upload-card">
                <img :src="getCloudImageDisplayUrl(image.url)" :alt="image.alt || '上传图片'" class="upload-thumb" loading="lazy">
                <button type="button" class="remove-image-btn" @click="removeDraftImage(image.url)">×</button>
              </div>
            </div>

            <p class="composer-hint">
              {{ draftMood ? `当前心情：${selectedMoodMeta?.icon || ''}${draftMood}` : '可以只写文字，也可以只上传图片。' }}
              <span class="composer-hint-sep">/</span>
              Cmd/Ctrl + Enter 可直接发布
            </p>
          </section>

          <div v-if="noticeText" class="notice-bar">{{ noticeText }}</div>

          <section ref="albumSectionRef" class="gallery-section album-gallery-section">
            <div class="gallery-stats-bar">
              <div class="stats-row">
                <div class="stat-box">
                  <span class="stat-value">{{ activeGalleryEntries.length }}</span>
                  <span class="stat-name">总条目</span>
                </div>
                <div class="stat-box">
                  <span class="stat-value">{{ imageCount }}</span>
                  <span class="stat-name">纯图片</span>
                </div>
                <div class="stat-box">
                  <span class="stat-value">{{ mixedCount }}</span>
                  <span class="stat-name">图文</span>
                </div>
                <div class="stat-box">
                  <span class="stat-value">{{ currentMonthCount }}</span>
                  <span class="stat-name">本月</span>
                </div>
              </div>
              <div class="filter-row">
                <button v-for="option in filterOptions" :key="option.value" type="button" class="filter-chip"
                  :class="{ active: currentFilter === option.value }" @click="currentFilter = option.value">
                  {{ option.label }}
                  <span class="chip-count">{{ getFilterCount(option.value) }}</span>
                </button>
              </div>
            </div>

            <div class="section-heading">
              <div>
                <span class="section-kicker">Your Album</span>
                <h3>{{ currentFilterLabel }}</h3>
              </div>
              <p>{{ visibleFilteredEntries.length }} / {{ filteredEntries.length }} 条内容</p>
            </div>

            <div class="gallery-toolbar">
              <label class="search-field" for="cloud-search">
                <Search class="search-icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
                <input id="cloud-search" v-model.trim="searchQuery" type="search" placeholder="搜索标题、文字、心情或日期">
              </label>

              <div class="date-range">
                <label class="date-field">
                  <span>开始</span>
                  <input v-model="dateFrom" type="date">
                </label>
                <label class="date-field">
                  <span>结束</span>
                  <input v-model="dateTo" type="date">
                </label>
              </div>

              <button v-if="hasActiveFilters" type="button" class="toolbar-reset-btn" @click="resetGalleryFilters">
                清除筛选
              </button>
            </div>

            <div v-if="entriesLoadError && entries.length > 0" class="gallery-inline-feedback warning">
              <span>{{ entriesLoadError }}</span>
              <button type="button" class="ghost-link feedback-action" @click="loadEntries">重新加载</button>
            </div>

            <div v-else-if="isShowingCachedEntries && entries.length > 0" class="gallery-inline-feedback">
              <span>正在显示最近一次成功同步的 Cloud+ 内容，后台会继续尝试刷新。</span>
              <button type="button" class="ghost-link feedback-action" @click="loadEntries">立即刷新</button>
            </div>

            <div v-if="isInitialLoading" class="gallery-grid skeleton-grid" aria-hidden="true">
              <article v-for="item in skeletonCards" :key="item.id" class="cloud-card skeleton-card" :class="item.variant">
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
            <div v-else-if="filteredEntries.length === 0 && activeGalleryEntries.length === 0" class="empty-state">
              <Cloud class="empty-icon" :size="40" :stroke-width="1.6" aria-hidden="true" />
              <h4>这里还空着</h4>
              <p>发布第一条内容后，它会像相册卡片一样出现在这里。</p>
            </div>
            <div v-else-if="filteredEntries.length === 0" class="empty-state filter-empty-state">
              <Search class="empty-icon" :size="38" :stroke-width="1.7" aria-hidden="true" />
              <h4>没有匹配到结果</h4>
              <p>试试更换关键词、放宽日期范围，或者清除当前筛选。</p>
              <button type="button" class="secondary-btn" @click="resetGalleryFilters">清除筛选</button>
            </div>

            <div v-else class="album-month-list">
              <section v-for="group in groupedVisibleEntries" :key="group.key" class="album-month-group">
                <div class="album-month-heading">
                  <h4>{{ group.label }}</h4>
                  <span>{{ group.entries.length }} 条</span>
                </div>

                <div class="gallery-grid">
                  <article v-for="entry in group.entries" :key="entry.id" class="cloud-card"
                    :class="[`type-${entry.entryType}`, { featured: entry.coverImageUrl }]" @click="openEntry(entry)">
                    <div v-if="entry.coverImageUrl" class="card-visual">
                      <img :src="getCloudImageDisplayUrl(entry.coverImageUrl)" :alt="entry.title || 'Cloud cover'"
                        class="card-cover cloud-loading-image" loading="eager" decoding="async" referrerpolicy="no-referrer"
                        @load="handleCloudImageLoaded" @error="retryCloudImageLoad">
                      <div class="card-overlay">
                        <span class="entry-badge">{{ entryTypeLabel(entry.entryType) }}</span>
                        <span v-if="entry.mood" class="mood-badge">
                          {{ resolveMoodMeta(entry.mood)?.icon || '•' }} {{ entry.mood }}
                        </span>
                      </div>
                    </div>

                    <div class="card-body">
                      <div class="card-date">{{ formatEntryDate(entry.entryDate, entry.updatedAt) }}</div>
                      <h4 class="card-title">{{ entry.title || defaultTitle(entry) }}</h4>
                      <p class="card-text">{{ entry.previewText || '这条内容里暂时没有文字预览。' }}</p>
                      <div class="card-footer">
                        <span class="card-meta">
                          <span v-if="entry.mood" class="card-mood">{{ resolveMoodMeta(entry.mood)?.icon || '•' }} {{ entry.mood }}</span>
                          <span>{{ blockSummary(entry) }}</span>
                        </span>
                        <button type="button" class="ghost-link">打开</button>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              <div class="album-flow-actions">
                <button v-if="canLoadMoreEntries" type="button" class="secondary-btn album-load-more-btn" @click="loadMoreGalleryEntries">
                  加载更多
                </button>
                <button v-if="visibleFilteredEntries.length > GALLERY_INITIAL_LIMIT" type="button" class="ghost-link album-top-btn"
                  @click="scrollAlbumToTop">
                  回到顶部
                </button>
              </div>
            </div>
          </section>
          </template>
        </template>
      </main>
    </div>

    <nav class="cloud-bottom-nav" aria-label="Cloud+ 页面导航">
      <button v-for="item in cloudBottomNavItems" :key="item.id" type="button" class="cloud-bottom-nav-item"
        :class="{ active: cloudTab === item.id }" @click="switchCloudTab(item.id)">
        {{ item.label }}
      </button>
    </nav>

    <div v-if="selectedEntry" class="detail-overlay" @click.self="closeEntry">
      <div class="detail-modal">
        <button type="button" class="detail-close" @click="closeEntry">×</button>
        <div class="detail-head">
          <div>
            <span class="section-kicker">{{ selectedEntrySource === 'shared' ? 'BOH Cloud Channel Entry' : 'BOH Cloud+ Entry' }}</span>
            <h3>{{ selectedEntry.title || defaultTitle(selectedEntry) }}</h3>
            <p>{{ formatEntryDate(selectedEntry.entryDate, selectedEntry.updatedAt) }}</p>
          </div>
          <div class="detail-actions">
            <span v-if="selectedEntry.mood" class="detail-mood">
              {{ resolveMoodMeta(selectedEntry.mood)?.icon || '•' }} {{ selectedEntry.mood }}
            </span>
            <button v-if="selectedEntrySource === 'mine'" type="button" class="danger-btn" @click="removeEntry(selectedEntry)">删除</button>
          </div>
        </div>

        <div class="detail-content">
          <template v-for="(block, index) in selectedEntry.contentBlocks" :key="`${selectedEntry.id}-${index}`">
            <p v-if="block.type === 'text'" class="detail-text">{{ block.text }}</p>
            <figure v-else class="detail-image-wrap">
              <img :src="getCloudImageDisplayUrl(block.url)" :alt="block.alt || 'BOH Cloud 图片'" class="detail-image cloud-loading-image"
                decoding="async" referrerpolicy="no-referrer" @load="handleCloudImageLoaded" @error="retryCloudImageLoad" loading="lazy">
              <figcaption v-if="block.alt">{{ block.alt }}</figcaption>
            </figure>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ChevronDown, Cloud, Search } from 'lucide-vue-next';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
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
  getCloudinaryDisplayUrl
} from '@/utils/cloudinary-client.js';
import {
  CLOUD_UPLOAD_BURST_LIMIT,
  CLOUD_UPLOAD_BURST_WINDOW_MS,
  validateImageFileBasics,
  registerCloudUploadBurst
} from '@/utils/cloud-upload-guard.js';
import {
  createMyCloudEntry,
  deleteMyCloudEntry,
  disableMyCloudShareChannel,
  getMyCloudShareChannel,
  getMyCloudShareViewers,
  getSharedCloudChannelByToken,
  listMyCloudEntries,
  normalizeCloudShareToken,
  revokeMyCloudShareToken,
  setMyCloudShareDescription,
  upsertMyCloudShareChannel
} from '@/utils/api/boh-cloud-api.js';
import { serializeCloudTextAndImages } from '@/utils/boh-cloud-content.js';
import { DEFAULT_CLOUD_IMAGE_LIMIT, resolveCloudBenefitFromSubscriptions } from '@/utils/subscription-benefits.js';
import { logger } from '@/utils/logger.js';
import {
  createCloudSettingsSubscriptionLocation,
  createUserSpaceProfileReturnLocation,
  resolveSettingsBackLocation
} from '@/utils/user-space-navigation.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { isLoggedIn, userInfo } = storeToRefs(authStore);
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
});

const isDesktopEmbed = computed(() => props.embedded || String(route.query.embed || '') === 'desktop');
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
const isLoading = ref(false);
const isLoadingMyShareChannel = ref(false);
const isLoadingShareViewers = ref(false);
const isSavingShareChannel = ref(false);
const isLoadingSharedChannel = ref(false);
const hasLoadedEntries = ref(false);
const entriesLoadError = ref('');
const isShowingCachedEntries = ref(false);
const sharedChannelError = ref('');
const shareViewersError = ref('');
const activeEntriesUserId = ref('');
const isPublishing = ref(false);
const isUploadingImages = ref(false);
const currentFilter = ref('all');
const cloudinaryCleanupLocks = new Set();
let uploadAttemptTimestamps = [];
const CLOUD_BATCH_LIMIT = 9;
const CLOUD_ENTRIES_CACHE_VERSION = 'v2';
const SKELETON_CARD_COUNT = 6;
const GALLERY_INITIAL_LIMIT = 30;
const GALLERY_LOAD_MORE_STEP = 30;
const SHARED_TOKEN_STORAGE_KEY = 'boh_cloud:last_shared_token';
const visibleEntryLimit = ref(GALLERY_INITIAL_LIMIT);

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'image', label: '图片' },
  { value: 'mixed', label: '图文' },
  { value: 'text', label: '文字' }
];

const selectedMoodMeta = computed(() => getMoodMeta(draftMood.value));
const currentFilterLabel = computed(() => filterOptions.find((item) => item.value === currentFilter.value)?.label || '全部');
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
  { id: 'settings', label: '设置' }
];
const cloudPageHero = computed(() => {
  if (cloudTab.value === 'share') {
    return {
      eyebrow: 'Share',
      title: '分享',
      subtitle: '管理私密令牌频道，或用访问令牌查看别人分享的 Cloud+。'
    };
  }
  if (cloudTab.value === 'settings') {
    return {
      eyebrow: 'Settings',
      title: 'Cloud+ 设置',
      subtitle: '管理 Cloud+ 图片使用限额。'
    };
  }
  return {
    eyebrow: 'Content',
    title: '内容',
    subtitle: '展示和发布你的私密 Cloud+ 内容。'
  };
});
const goBack = () => {
  router.push(resolveSettingsBackLocation(route, createUserSpaceProfileReturnLocation()));
};
const openSubscriptionsFromCloudSettings = () => {
  router.push(createCloudSettingsSubscriptionLocation());
};
const hasActiveFilters = computed(() => Boolean(searchQuery.value || dateFrom.value || dateTo.value));
const currentCloudBenefit = computed(() => resolveCloudBenefitFromSubscriptions(subscriptions.value));
const currentCloudImageLimit = computed(() => Number(currentCloudBenefit.value.cloudImageLimit || DEFAULT_CLOUD_IMAGE_LIMIT));
const normalizedSharedTokenInput = computed(() => normalizeCloudShareToken(sharedTokenInput.value));
const sharedChannelTitle = computed(() => {
  const nickname = String(sharedChannel.value?.ownerNickname || '').trim();
  const username = String(sharedChannel.value?.ownerUsername || '').trim();
  return nickname || username ? `${nickname || username} 的 BOH Cloud` : '共享 Cloud+ 频道';
});
const activeShareChannelLabel = computed(() => '私密令牌频道');
const cloudModeBanner = computed(() => null);
const isInitialLoading = computed(() => isLoading.value && !hasLoadedEntries.value && entries.value.length === 0);
const hasEntriesLoadFailure = computed(() => Boolean(entriesLoadError.value) && !isLoading.value && entries.value.length === 0);
const showRefreshIndicator = computed(() => isLoading.value && !isInitialLoading.value);
const skeletonCards = computed(() => Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => ({
  id: `cloud-skeleton-${index}`,
  variant: index % 3 === 0 ? 'skeleton-card-featured' : index % 3 === 1 ? 'skeleton-card-text' : 'skeleton-card-mixed'
})));
const activeGalleryEntries = computed(() => entries.value);

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
        : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
});
const visibleFilteredEntries = computed(() => filteredEntries.value.slice(0, visibleEntryLimit.value));
const canLoadMoreEntries = computed(() => visibleFilteredEntries.value.length < filteredEntries.value.length);
const groupedVisibleEntries = computed(() => {
  const groups = [];
  const groupMap = new Map();

  visibleFilteredEntries.value.forEach((entry) => {
    const key = resolveEntryMonthKey(entry);
    if (!groupMap.has(key)) {
      const group = {
        key,
        label: formatMonthGroupLabel(key),
        entries: []
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    groupMap.get(key).entries.push(entry);
  });

  return groups;
});

const imageCount = computed(() => activeGalleryEntries.value.filter((entry) => entry.entryType === 'image').length);
const mixedCount = computed(() => activeGalleryEntries.value.filter((entry) => entry.entryType === 'mixed').length);
const totalStoredImages = computed(() => entries.value.reduce(
  (sum, entry) => sum + entry.contentBlocks.filter((block) => block.type === 'image').length,
  0
));
const draftImageCount = computed(() => uploadedImages.value.length);
const remainingImageQuota = computed(() => Math.max(0, currentCloudImageLimit.value - totalStoredImages.value));
const quotaPercent = computed(() => {
  if (currentCloudImageLimit.value <= 0) return 0;
  return Math.min(100, Math.round((totalStoredImages.value / currentCloudImageLimit.value) * 100));
});
const currentMonthCount = computed(() => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return activeGalleryEntries.value.filter((entry) => String(entry.entryDate || '').startsWith(monthKey)).length;
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
    String(parsed.getDate()).padStart(2, '0')
  ].join('-');
}

function resolveEntryMonthKey(entry) {
  const dateKey = resolveEntryDateKey(entry);
  return dateKey ? dateKey.slice(0, 7) : 'unknown';
}

function formatMonthGroupLabel(monthKey) {
  const safeKey = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(safeKey)) return '未标注日期';

  const [year, month] = safeKey.split('-');
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (safeKey === currentKey) return '本月';
  return `${year}.${month}`;
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
    String(updatedParsed.getDate()).padStart(2, '0')
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
  if (diffMs >= 0 && diffMs < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diffMs / 60000))} 分钟前`;
  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diffMs / 3600000))} 小时前`;
  return `${formatDisplayDate(parsed)} 查看`;
}

function entryTypeLabel(type) {
  if (type === 'image') return '图片';
  if (type === 'mixed') return '图文';
  return '文字';
}

function defaultTitle(entry) {
  if (entry.entryType === 'image') return '一组新的照片';
  if (entry.entryType === 'mixed') return '图文记忆片段';
  return '新的文字记录';
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
}

function loadMoreGalleryEntries() {
  visibleEntryLimit.value = Math.min(
    filteredEntries.value.length,
    visibleEntryLimit.value + GALLERY_LOAD_MORE_STEP
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
    publicId: String(block?.publicId || '').trim()
  };
}

function normalizeCachedTextBlock(block) {
  const text = String(block?.text || '').trim();
  if (!text) return null;
  return {
    type: 'text',
    text
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
    entry.coverImageUrl
    || contentBlocks.find((block) => block.type === 'image')?.url
    || ''
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
    visibility: 'private',
    contentText: String(entry.contentText || '').trim(),
    contentBlocks,
    coverImageUrl,
    previewText: String(entry.previewText || derivePreviewFromBlocks(contentBlocks, entry.contentText || '')).trim(),
    mood: String(entry.mood || '').trim(),
    source: String(entry.source || 'manual').trim() || 'manual',
    createdAt: String(entry.createdAt || '').trim(),
    updatedAt: String(entry.updatedAt || '').trim()
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
    return parsed.map(normalizeCachedEntry).filter(Boolean);
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
    window.localStorage.setItem(cacheKey, JSON.stringify(safeItems));
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
  const safeTab = ['content', 'share', 'settings'].includes(String(tabId)) ? String(tabId) : 'content';
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      view: safeTab
    }
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
    return;
  }

  isLoadingMyShareChannel.value = true;
  try {
    const result = await getMyCloudShareChannel();
    if (!result.ok) {
      logger.error('cloud-plus', '读取 Cloud+ 共享频道失败:', result.error);
      myShareChannel.value = null;
      return;
    }

    myShareChannel.value = result.data || null;
    syncActiveShareChannel();
    if (myShareChannel.value?.shareToken) {
      void loadMyShareViewers();
    } else {
      shareViewers.value = [];
    }
  } finally {
    isLoadingMyShareChannel.value = false;
  }
}

async function loadMyShareViewers() {
  if (!isLoggedIn.value || !userInfo.value?.id || !myShareChannel.value?.shareToken) {
    shareViewers.value = [];
    shareViewersError.value = '';
    return;
  }

  isLoadingShareViewers.value = true;
  shareViewersError.value = '';
  try {
    const result = await getMyCloudShareViewers({ limit: 50 });
    if (!result.ok) {
      shareViewers.value = [];
      shareViewersError.value = result.error?.message || '访客记录读取失败';
      return;
    }

    shareViewers.value = Array.isArray(result.data) ? result.data : [];
  } finally {
    isLoadingShareViewers.value = false;
  }
}

async function activateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再开启共享');
    authStore.showLoginModal = true;
    return;
  }

  isSavingShareChannel.value = true;
  try {
    const result = await upsertMyCloudShareChannel({ regenerate: false });
    if (!result.ok) {
      showNotice(result.error?.message || '开启共享失败');
      return;
    }

    replaceLocalShareChannel(result.data || null);
    void loadMyShareViewers();
    showNotice(`${activeShareChannelLabel.value}已开启`);
  } finally {
    isSavingShareChannel.value = false;
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

  isSavingShareChannel.value = true;
  try {
    const result = myShareChannel.value?.shareToken
      ? await setMyCloudShareDescription(nextDescription)
      : await upsertMyCloudShareChannel({
        regenerate: false,
        description: nextDescription
      });
    if (!result.ok) {
      showNotice(result.error?.message || '频道描述保存失败');
      return;
    }

    replaceLocalShareChannel(result.data || null);
    showNotice('频道描述已保存');
  } finally {
    isSavingShareChannel.value = false;
  }
}

async function regenerateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再生成令牌');
    return;
  }
  if (myShareChannel.value?.shareToken && !confirm('撤销后，旧令牌会立刻失效，并生成一枚新令牌。确定继续吗？')) {
    return;
  }

  isSavingShareChannel.value = true;
  try {
    const result = await revokeMyCloudShareToken();
    if (!result.ok) {
      showNotice(result.error?.message || '生成新令牌失败');
      return;
    }

    replaceLocalShareChannel(result.data || null);
    shareViewers.value = [];
    void loadMyShareViewers();
    showNotice('已生成新的访问令牌');
  } finally {
    isSavingShareChannel.value = false;
  }
}

async function deactivateMyShareChannel() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    showNotice('请先登录后再关闭共享');
    return;
  }
  if (!confirm('关闭共享后，当前令牌将暂时失效。确定关闭吗？')) {
    return;
  }

  isSavingShareChannel.value = true;
  try {
    const result = await disableMyCloudShareChannel();
    if (!result.ok) {
      showNotice(result.error?.message || '关闭共享失败');
      return;
    }

    replaceLocalShareChannel(result.data || null);
    void loadMyShareViewers();
    showNotice(`${activeShareChannelLabel.value}已关闭`);
  } finally {
    isSavingShareChannel.value = false;
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
    sharedChannelError.value = '请输入有效的访问令牌';
    showNotice('请输入有效的访问令牌');
    return;
  }

  sharedTokenInput.value = token;
  sharedChannelError.value = '';
  isLoadingSharedChannel.value = true;
  try {
    const result = await getSharedCloudChannelByToken(token, { limit: 500 });
    if (!result.ok) {
      sharedChannel.value = null;
      sharedEntries.value = [];
      sharedChannelError.value = result.error?.message || '共享频道读取失败';
      showNotice(sharedChannelError.value);
      return;
    }

    sharedChannel.value = result.data?.channel || null;
    sharedEntries.value = Array.isArray(result.data?.entries) ? result.data.entries : [];
    isSharedContentCollapsed.value = false;
    sharedChannelError.value = '';
    persistStoredSharedToken(token);
    showNotice('共享频道已打开');
  } finally {
    isLoadingSharedChannel.value = false;
  }
}

function exitSharedChannel() {
  sharedChannel.value = null;
  sharedEntries.value = [];
  sharedChannelError.value = '';
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
    images.map((image) => deleteDraftAssetFromCloudinary(image, { silent, keepalive }))
  );
}

async function loadEntries() {
  const userId = String(userInfo.value?.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    entries.value = [];
    hasLoadedEntries.value = false;
    entriesLoadError.value = '';
    isShowingCachedEntries.value = false;
    activeEntriesUserId.value = '';
    return;
  }

  const hadEntriesBeforeLoad = entries.value.length > 0;
  const cachedEntries = readCachedEntries(userId);
  if (!hadEntriesBeforeLoad && cachedEntries.length > 0) {
    entries.value = cachedEntries;
    isShowingCachedEntries.value = true;
    activeEntriesUserId.value = userId;
  }

  isLoading.value = true;
  entriesLoadError.value = '';
  try {
    const result = await listMyCloudEntries({
      userId,
      limit: 500
    });

    if (!result.ok) {
      const errorMessage = result.error?.message || '读取 Cloud+ 失败，请检查网络后重试';
      entriesLoadError.value = hadEntriesBeforeLoad || cachedEntries.length
        ? `${errorMessage}，当前为你保留最近一次成功加载的内容。`
        : errorMessage;
      isShowingCachedEntries.value = entries.value.length > 0;
      activeEntriesUserId.value = userId;
      showNotice(hadEntriesBeforeLoad || cachedEntries.length ? '网络波动，已保留最近一次成功加载的内容' : errorMessage);
      hasLoadedEntries.value = true;
      return;
    }

    const nextEntries = Array.isArray(result.data) ? result.data : [];
    entries.value = nextEntries;
    persistCachedEntries(userId, nextEntries);
    entriesLoadError.value = '';
    isShowingCachedEntries.value = false;
    hasLoadedEntries.value = true;
    activeEntriesUserId.value = userId;
  } finally {
    isLoading.value = false;
  }
}

async function loadSubscriptions() {
  if (!isLoggedIn.value || !userInfo.value?.id) {
    subscriptions.value = [];
    return;
  }

  const result = await getMySubscriptions(String(userInfo.value.id).trim(), { includeExpired: true });
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

  const remainingAfterDraft = Math.max(0, currentCloudImageLimit.value - totalStoredImages.value - draftImageCount.value);
  if (files.length > remainingAfterDraft) {
    showNotice(`图片额度不足：当前最多还能添加 ${remainingAfterDraft} 张图片`);
    if (input) input.value = '';
    return;
  }

  const burst = registerCloudUploadBurst(uploadAttemptTimestamps, files.length, {
    windowMs: CLOUD_UPLOAD_BURST_WINDOW_MS,
    limit: CLOUD_UPLOAD_BURST_LIMIT
  });
  uploadAttemptTimestamps = burst.timestamps;
  if (!burst.ok) {
    showNotice(`上传过于频繁，请 ${burst.retryAfterSeconds} 秒后再试`);
    if (input) input.value = '';
    return;
  }

  isUploadingImages.value = true;
  try {
    for (const file of files) {
      const uploaded = await uploadImageToCloudinary(file);
      uploadedImages.value.push({
        url: uploaded.url,
        publicId: uploaded.publicId,
        deleteToken: uploaded.deleteToken,
        alt: uploaded.originalFilename || file.name,
        width: uploaded.width,
        height: uploaded.height
      });
    }
    showNotice(`已添加 ${files.length} 张图片`);
    if (files.length && uploadedImages.value.some((image) => !supportsCloudinaryClientDeleteToken(image))) {
      showNotice('图片已上传，但当前 Cloudinary preset 未开启 delete token；取消上传时将无法自动清理云端图片');
    }
  } catch (error) {
    showNotice(error?.message || '图片上传失败');
  } finally {
    isUploadingImages.value = false;
    if (input) input.value = '';
  }
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

  isPublishing.value = true;
  try {
    const blocks = serializeCloudTextAndImages({
      text: draftText.value,
      images: uploadedImages.value
    });

    const result = await createMyCloudEntry(userId, {
      entryDate: new Date(),
      title: draftTitle.value,
      visibility: 'private',
      contentText: draftText.value,
      contentBlocks: blocks,
      mood: draftMood.value,
      source: 'manual'
    });

    if (!result.ok) {
      showNotice(result.error?.message || '发布失败');
      return;
    }

    draftTitle.value = '';
    draftText.value = '';
    draftMood.value = '';
    uploadedImages.value = [];
    if (result.data) {
      entries.value = [result.data, ...entries.value.filter((item) => item.id !== result.data.id)];
      persistCachedEntries(userId, entries.value);
      hasLoadedEntries.value = true;
      entriesLoadError.value = '';
      isShowingCachedEntries.value = false;
      activeEntriesUserId.value = userId;
    }
    showNotice('已发布到 BOH Cloud+');
    void loadEntries();
  } finally {
    isPublishing.value = false;
  }
}

function openEntry(entry, source = 'mine') {
  selectedEntry.value = entry;
  selectedEntrySource.value = source === 'shared' ? 'shared' : 'mine';
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

  window.setTimeout(() => {
    try {
      const nextSrc = retryCount >= 1 ? buildCloudinaryDisplayFallbackUrl(originalSrc) : originalSrc;
      const retryUrl = new URL(nextSrc);
      retryUrl.searchParams.set('_boh_retry', `${Date.now()}-${retryCount + 1}`);
      image.src = retryUrl.toString();
    } catch (_error) {
      image.src = originalSrc;
    }
  }, 600 * (retryCount + 1));
}

async function removeEntry(entry) {
  const userId = String(userInfo.value?.id || '').trim();
  if (!userId) return;

  if (String(entry?.source || '').trim() === 'forum') {
    showNotice('这条内容来自论坛同步，不能在 Cloud+ 里单独删除，请到论坛删除原帖');
    return;
  }

  if (!confirm('确定删除这条内容吗？')) return;

  const guardResult = await deleteMyCloudEntry(userId, entry?.id, {
    legacyNoteDate: entry?.legacyNoteDate || entry?.entryDate || '',
    validateOnly: true
  });
  if (!guardResult.ok) {
    showNotice(guardResult.error?.message || '删除失败');
    return;
  }

  const publicIds = Array.from(new Set(
    (Array.isArray(entry?.contentBlocks) ? entry.contentBlocks : [])
      .filter((block) => block?.type === 'image')
      .map((block) => String(block?.publicId || extractCloudinaryPublicIdFromUrl(block?.url)).trim())
      .filter(Boolean)
  ));

  if (publicIds.length) {
    const cloudinaryResult = await deleteCloudinaryAssetsByPublicIds(publicIds);
    if (!cloudinaryResult.ok) {
      showNotice(cloudinaryResult.error?.message || '云端图片删除失败，请稍后重试');
      return;
    }
  }

  const result = await deleteMyCloudEntry(userId, entry?.id, {
    legacyNoteDate: entry?.legacyNoteDate || entry?.entryDate || ''
  });
  if (!result.ok) {
    showNotice(result.error?.message || '删除失败');
    return;
  }

  entries.value = entries.value.filter((item) => item.id !== entry?.id);
  persistCachedEntries(userId, entries.value);
  hasLoadedEntries.value = true;
  entriesLoadError.value = '';
  isShowingCachedEntries.value = false;
  activeEntriesUserId.value = userId;
  if (selectedEntry.value?.id === entry?.id) {
    selectedEntry.value = null;
    selectedEntrySource.value = 'mine';
  }
  showNotice('内容已删除');
  void loadEntries();
}

watch(() => [isLoggedIn.value, userInfo.value?.id], () => {
  const userId = String(userInfo.value?.id || '').trim();
  if (!isLoggedIn.value || !userId) {
    entries.value = [];
    subscriptions.value = [];
    myShareChannel.value = null;
    shareViewers.value = [];
    hasLoadedEntries.value = false;
    entriesLoadError.value = '';
    isShowingCachedEntries.value = false;
    return;
  }
  if (activeEntriesUserId.value && activeEntriesUserId.value !== userId) {
    entries.value = [];
    hasLoadedEntries.value = false;
    entriesLoadError.value = '';
    isShowingCachedEntries.value = false;
  }
  void loadEntries();
  void loadSubscriptions();
  void loadMyShareChannel();
}, { immediate: true });

watch(() => [cloudTab.value, currentFilter.value, searchQuery.value, dateFrom.value, dateTo.value], () => {
  visibleEntryLimit.value = GALLERY_INITIAL_LIMIT;
});

watch(normalizedSharedTokenInput, (token) => {
  if (token.length >= 12) {
    persistStoredSharedToken(token);
  } else if (!String(sharedTokenInput.value || '').trim()) {
    persistStoredSharedToken('');
  }
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

watch(cloudTab, () => {
  applyCloudPlusRouteView();
}, { immediate: true });

</script>

<style scoped>
@import './style.scoped.css';
</style>
