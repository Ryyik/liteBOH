<template>
  <div class="hero-console">
    <header class="console-toolbar">
      <div class="toolbar-heading">
        <button type="button" class="icon-button" title="返回数据管理" @click="goBackToAdmin">
          <ChevronLeft :size="20" aria-hidden="true" />
        </button>
        <div>
          <h1>首页英雄区装修</h1>
          <p>{{ heroes.length }} 个英雄区<span v-if="dirtyCount"> · {{ dirtyCount }} 项未保存</span></p>
        </div>
      </div>

      <div class="toolbar-actions">
        <button type="button" class="icon-button" title="刷新" :disabled="isLoading" @click="loadHeroes()">
          <RefreshCw :size="18" :class="{ spinning: isLoading }" aria-hidden="true" />
        </button>
        <button type="button" class="secondary-button" @click="startNewHero">
          <Plus :size="17" aria-hidden="true" /> 新建英雄区
        </button>
        <button type="button" class="secondary-button" :disabled="isSaving || !selectedHero" @click="saveCurrent">
          <Save :size="17" aria-hidden="true" /> 保存草稿
        </button>
        <button type="button" class="primary-button" :disabled="isSaving || !selectedHero" @click="publishCurrent">
          <Upload :size="17" aria-hidden="true" /> {{ isSaving ? '处理中' : '发布' }}
        </button>
      </div>
    </header>

    <main class="console-layout">
      <!-- 左侧：英雄区列表 -->
      <aside class="hero-sidebar glass-panel">
        <div class="sidebar-filters">
          <label class="search-field">
            <Search :size="17" aria-hidden="true" />
            <input v-model.trim="searchQuery" type="search" placeholder="搜索英雄区" aria-label="搜索英雄区" />
          </label>
          <div class="filter-row">
            <select v-model="statusFilter" aria-label="按状态筛选">
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
            </select>
            <select v-model="archiveFilter" aria-label="按归档筛选">
              <option value="all">全部</option>
              <option value="active">首屏显示</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>

        <div class="hero-list">
          <button
            v-for="hero in filteredHeroes"
            :key="hero.id"
            type="button"
            class="hero-row"
            :class="{ selected: selectedId === hero.id }"
            @click="selectHero(hero)"
          >
            <span class="row-thumb" :class="`thumb-${hero.template}`">
              <img v-if="getThumbUrl(hero)" :src="getThumbUrl(hero)" :alt="hero.title" />
              <LayoutIcon v-else :size="18" aria-hidden="true" />
            </span>
            <span class="row-copy">
              <strong>{{ hero.label || hero.title || '未命名' }}</strong>
              <small>{{ templateLabel(hero.template) }} · {{ hero.variant }}</small>
            </span>
            <span class="row-status" :class="heroStatus(hero).tone">{{ heroStatus(hero).label }}</span>
            <span v-if="isDirty(hero.id)" class="dirty-dot" title="未保存"></span>
          </button>

          <div v-if="!filteredHeroes.length" class="empty-list">
            <LayoutIcon :size="26" aria-hidden="true" />
            <span>没有匹配的英雄区</span>
          </div>
        </div>
      </aside>

      <!-- 中间：预览区 -->
      <section v-if="selectedHero" class="preview-workspace glass-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">实时预览</span>
            <h2>{{ selectedHero.label || selectedHero.title || '新英雄区' }}</h2>
          </div>
          <div class="preview-toolbar">
            <button type="button" class="text-button" @click="moveHero(-1)" :disabled="!canMove(-1)">
              <ArrowUp :size="14" /> 上移
            </button>
            <button type="button" class="text-button" @click="moveHero(1)" :disabled="!canMove(1)">
              <ArrowDown :size="14" /> 下移
            </button>
          </div>
        </div>

        <div ref="previewStage" class="preview-stage" :class="`device-${previewDevice}`">
          <div
            class="preview-canvas-shell"
            :style="{
              width: `${previewCanvas.width * previewScale}px`,
              height: `${previewCanvas.height * previewScale}px`
            }"
          >
            <div
              class="preview-canvas"
              :style="{
                width: `${previewCanvas.width}px`,
                height: `${previewCanvas.height}px`,
              transform: `scale(${previewScale})`
            }"
            >
              <div v-if="!isBuiltin" class="preview-canvas-content">
                <DynamicHomeHero
                  :hero="draftHero"
                  :preview-device="previewDevice"
                  @link-click="() => {}"
                  @image-position="updatePreviewImagePosition"
                  @content-offset="updatePreviewContentOffset"
                />
              </div>
              <div v-else class="builtin-preview-placeholder">
                <LayoutIcon :size="32" aria-hidden="true" />
                <p>内置英雄区暂不支持画布预览</p>
                <small>请访问首页查看实际渲染效果</small>
              </div>
            </div>
          </div>
        </div>

        <div class="preview-device-switch">
          <button type="button" :class="['device-btn', { active: previewDevice === 'desktop' }]" @click="setPreviewDevice('desktop')">桌面 1440 × 900</button>
          <button type="button" :class="['device-btn', { active: previewDevice === 'mobile' }]" @click="setPreviewDevice('mobile')">竖屏 390 × 844</button>
        </div>
      </section>

      <!-- 右侧：编辑面板 -->
      <section v-if="selectedHero" class="editor-panel glass-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">英雄区配置</span>
            <h2>{{ selectedHero.title || '新英雄区' }}</h2>
          </div>
          <button type="button" class="danger-icon-button" title="删除英雄区" :disabled="isSaving" @click="deleteCurrent">
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </div>

        <div class="status-settings">
          <label class="toggle-row">
            <span><strong>归档到历史区</strong><small>归档后从首屏移入 Footer 历史回顾</small></span>
            <input v-model="draftHero.is_archived" type="checkbox" @change="markDirty(selectedHero.id)" />
            <i aria-hidden="true"></i>
          </label>
        </div>

        <!-- 内置组件只读提示 -->
        <div v-if="isBuiltin" class="builtin-readonly-hint">
          <Info :size="16" aria-hidden="true" />
          <p>这是内置英雄区，内容由代码组件自带，无法编辑文字/图片/按钮。你可以调整排序顺序或归档到历史区。</p>
        </div>

        <div class="form-grid" v-if="!isBuiltin">
          <label class="field">
            <span>模板类型</span>
            <select v-model="draftHero.template" @change="markDirty(selectedHero.id)">
              <option value="standard">标准卡片型</option>
              <option value="overlay">全幅图片叠加型</option>
              <option value="split">分栏并排型</option>
              <option value="responsive">横竖屏适配型</option>
            </select>
          </label>
          <label class="field">
            <span>配色方案</span>
            <select v-model="draftHero.variant" @change="markDirty(selectedHero.id)">
              <option value="light">浅色（白底）</option>
              <option value="dark">深色（黑底）</option>
            </select>
          </label>

          <label class="field field-wide">
            <span>内部标签（管理面板显示用）</span>
            <input v-model="draftHero.label" type="text" placeholder="如：2026秋款吉祥物" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide">
            <span>无障碍标签（aria-label）</span>
            <input v-model="draftHero.aria_label" type="text" placeholder="如：全新吉祥物上线" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide" v-if="draftHero.template === 'overlay'">
            <span>眉题（Eyebrow）</span>
            <input v-model="draftHero.eyebrow" type="text" placeholder="如：遇见系列" @input="markDirty(selectedHero.id)" />
          </label>

          <label class="field field-wide">
            <span>主标题（支持 &lt;br&gt;）</span>
            <textarea v-model="draftHero.title" rows="2" placeholder="如：Halo,&lt;br&gt;新朋友来啦" @input="markDirty(selectedHero.id)"></textarea>
          </label>

          <label class="field field-wide">
            <span>副标题</span>
            <textarea v-model="draftHero.subtitle" rows="2" placeholder="如：2026秋款全新上线" @input="markDirty(selectedHero.id)"></textarea>
          </label>
        </div>

        <div class="spec-section content-layout-section" v-if="!isBuiltin && draftHero.template !== 'split'">
          <div class="spec-heading"><span>标题文字位置</span></div>
          <div class="layout-device-tabs" role="tablist" aria-label="标题文字位置设备设置">
            <button type="button" :class="{ active: layoutDevice === 'desktop' }" @click="setPreviewDevice('desktop')">标题 · 桌面端</button>
            <button type="button" :class="{ active: layoutDevice === 'mobile' }" @click="setPreviewDevice('mobile')">标题 · 竖屏端</button>
          </div>
          <label v-if="layoutDevice === 'mobile'" class="inherit-layout-row">
            <input :checked="isMobileLayoutInherited" type="checkbox" @change="toggleMobileLayoutInheritance($event.target.checked)" />
          <span>继承桌面端文字位置</span>
          </label>
          <div class="position-layout-grid" role="group" aria-label="标题文字位置">
            <button
              v-for="position in layoutPositions"
              :key="`${position.align}-${position.valign}`"
              type="button"
              class="position-cell"
              :class="{ active: contentLayout.align === position.align && contentLayout.valign === position.valign }"
              :title="position.label"
              :aria-label="position.label"
              @click="setContentPosition(position.align, position.valign)"
            ><span></span></button>
          </div>
          <div class="layout-control-row">
            <label class="field">
              <span>标题内部对齐</span>
              <select :value="contentLayout.text_align" @change="setContentTextAlign($event.target.value)">
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </label>
            <label class="field width-control">
              <span>最大宽度 {{ contentLayout.max_width }} px</span>
              <input type="range" min="320" max="1200" step="20" :value="contentLayout.max_width" @input="setContentMaxWidth($event.target.value)" />
            </label>
          </div>
          <div class="layout-offset-row">
            <label class="field">
              <span>水平偏移</span>
              <input type="number" min="-720" max="720" step="1" :value="contentLayout.offset_x" @input="setContentOffset('x', $event.target.value)" />
            </label>
            <label class="field">
              <span>垂直偏移</span>
              <input type="number" min="-480" max="480" step="1" :value="contentLayout.offset_y" @input="setContentOffset('y', $event.target.value)" />
            </label>
          </div>
        </div>

        <!-- 快捷填充：从抽奖活动选择 -->
        <div class="spec-section quick-fill-section" v-if="!isBuiltin">
          <div class="spec-heading">
            <span>快捷填充</span>
          </div>
          <button type="button" class="text-button lottery-fill-btn" @click="openLotteryPicker">
            <Plus :size="14" /> 从抽奖活动选择
          </button>
          <p class="quick-fill-hint">选择一个抽奖活动，自动填充标题、副标题、封面图和跳转按钮</p>
        </div>

        <!-- 图片配置区：根据模板显示不同字段 -->
        <div class="image-section" v-if="!isBuiltin && draftHero.template !== 'split'">
          <div class="spec-heading">
            <span>图片配置</span>
            <div class="spec-heading-actions">
              <button type="button" class="text-button" @click="openDirectUpload(draftHero.template === 'responsive' ? 'landscape' : 'main')" :disabled="isUploading">
                <Upload :size="14" /> 上传图片
              </button>
              <button type="button" class="text-button" @click="openCropper(draftHero.template === 'responsive' ? 'landscape' : 'main')">
                <Crop :size="14" /> 裁切图片
              </button>
            </div>
          </div>

          <!-- standard / overlay：单图 -->
          <template v-if="draftHero.template === 'standard' || draftHero.template === 'overlay'">
            <details open class="image-config-group">
              <summary>桌面端</summary>
            <label class="url-field">
              <span>图片链接</span>
              <input v-model="draftHero.image_config.src" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <div class="image-position-editor">
              <span>图片定位</span>
              <div class="position-layout-grid compact" role="group" aria-label="桌面端图片定位">
                <button v-for="position in layoutPositions" :key="`desktop-${position.align}-${position.valign}`" type="button" class="position-cell" :class="{ active: imagePositionMatches('desktop', position) }" :title="position.label" :aria-label="position.label" @click="setImagePosition('desktop', position.align, position.valign)"><span></span></button>
              </div>
              <input :value="draftHero.image_config.position || ''" type="text" placeholder="高级：center 54%" @input="setImagePositionValue('desktop', $event.target.value)" />
            </div>
            <label class="field">
              <span>图片 Alt 文本</span>
              <input v-model="draftHero.image_config.alt" type="text" placeholder="如：吉祥物玩偶" @input="markDirty(selectedHero.id)" />
            </label>
            </details>
            <details class="image-config-group">
              <summary>竖屏端（留空继承桌面端）</summary>
              <div class="spec-heading-actions image-group-actions">
                <button type="button" class="text-button" @click="openDirectUpload('mobile')" :disabled="isUploading"><Upload :size="14" /> 上传竖屏图</button>
                <button type="button" class="text-button" @click="openCropper('mobile')"><Crop :size="14" /> 裁切</button>
              </div>
              <label class="url-field"><span>独立图片链接</span><input v-model="draftHero.image_config.mobile_src" type="url" placeholder="留空继承桌面端" @input="markDirty(selectedHero.id)" /></label>
              <div class="image-position-editor">
                <span>图片定位</span>
                <div class="position-layout-grid compact" role="group" aria-label="竖屏端图片定位">
                  <button v-for="position in layoutPositions" :key="`mobile-${position.align}-${position.valign}`" type="button" class="position-cell" :class="{ active: imagePositionMatches('mobile', position) }" :title="position.label" :aria-label="position.label" @click="setImagePosition('mobile', position.align, position.valign)"><span></span></button>
                </div>
                <input :value="draftHero.image_config.mobile_position || ''" type="text" placeholder="高级：center 54%" @input="setImagePositionValue('mobile', $event.target.value)" />
              </div>
              <label class="field"><span>填充模式</span><select v-model="draftHero.image_config.mobile_object_fit" @change="markDirty(selectedHero.id)"><option value="">继承默认</option><option value="cover">cover（铺满）</option><option value="contain">contain（完整显示）</option></select></label>
              <label v-if="draftHero.template === 'overlay'" class="field">
                <span>取景缩放 {{ Math.round(mobileImageScale * 100) }}%</span>
                <input type="range" min="1" max="2.2" step="0.02" :value="mobileImageScale" @input="setMobileImageScale($event.target.value)" />
              </label>
            </details>
          </template>

          <!-- responsive：横竖屏双图 -->
          <template v-if="draftHero.template === 'responsive'">
            <details open class="image-config-group">
              <summary>横屏端</summary>
            <label class="url-field">
              <span>横屏图片链接（landscape）</span>
              <input v-model="draftHero.image_config.landscapeSrc" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            </details>
            <details class="image-config-group">
              <summary>竖屏端</summary>
              <div class="spec-heading-actions image-group-actions">
                <button type="button" class="text-button" @click="openDirectUpload('portrait')" :disabled="isUploading"><Upload :size="14" /> 上传竖屏图</button>
                <button type="button" class="text-button" @click="openCropper('portrait')"><Crop :size="14" /> 裁切</button>
              </div>
            <label class="url-field">
              <span>竖屏图片链接（portrait）</span>
              <input v-model="draftHero.image_config.portraitSrc" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <div class="image-position-editor">
              <span>竖屏图片定位</span>
              <div class="position-layout-grid compact" role="group" aria-label="竖屏图片定位">
                <button v-for="position in layoutPositions" :key="`portrait-${position.align}-${position.valign}`" type="button" class="position-cell" :class="{ active: imagePositionMatches('portrait', position) }" :title="position.label" :aria-label="position.label" @click="setImagePosition('portrait', position.align, position.valign)"><span></span></button>
              </div>
              <input :value="draftHero.image_config.portrait_position || ''" type="text" placeholder="高级：center 54%" @input="setImagePositionValue('portrait', $event.target.value)" />
            </div>
            </details>
            <label class="field">
              <span>图片 Alt 文本</span>
              <input v-model="draftHero.image_config.alt" type="text" placeholder="如：吉祥物玩偶" @input="markDirty(selectedHero.id)" />
            </label>
          </template>
        </div>

        <!-- split 模板：两张子卡片 -->
        <div class="image-section" v-if="!isBuiltin && draftHero.template === 'split'">
          <div class="spec-heading">
            <span>分栏子卡片（左右两张）</span>
          </div>
          <div class="split-card-editor" v-for="(card, idx) in splitCardsDraft" :key="`split-${idx}`">
            <h4 class="split-card-title">卡片 {{ idx + 1 }}</h4>
            <label class="field">
              <span>标题</span>
              <input v-model="card.title" type="text" placeholder="如：BOH X 小猫主题" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>副标题</span>
              <input v-model="card.subtitle" type="text" placeholder="如：快来体验萌萌小猫" @input="markDirty(selectedHero.id)" />
            </label>
            <label class="field">
              <span>配色</span>
              <select v-model="card.variant" @change="markDirty(selectedHero.id)">
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label class="url-field">
              <span>图片链接</span>
              <input v-model="card.image_config.src" type="url" placeholder="https://" @input="markDirty(selectedHero.id)" />
            </label>
            <div class="image-position-editor">
              <span>文字位置</span>
              <div class="position-layout-grid compact" role="group" :aria-label="`卡片 ${idx + 1} 文字位置`">
                <button v-for="position in layoutPositions" :key="`card-${idx}-${position.align}-${position.valign}`" type="button" class="position-cell" :class="{ active: getCardContentLayout(card).align === position.align && getCardContentLayout(card).valign === position.valign }" :title="position.label" :aria-label="position.label" @click="setCardContentPosition(card, position.align, position.valign)"><span></span></button>
              </div>
            </div>
            <label class="field">
              <span>文字对齐</span>
              <select :value="getCardContentLayout(card).text_align" @change="setCardTextAlign(card, $event.target.value)">
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
              <button type="button" class="text-button" @click="openDirectUpload('split', idx)" :disabled="isUploading">
                <Upload :size="14" /> 上传卡片 {{ idx + 1 }}
              </button>
              <button type="button" class="text-button" @click="openCropper('split', idx)">
                <Crop :size="14" /> 裁切卡片 {{ idx + 1 }} 图片
              </button>
              </div>
            </div>
          </div>

          <div class="compression-settings" role="group" aria-label="图片压缩设置">
            <label class="compression-toggle">
              <input v-model="autoCompressImages" type="checkbox" />
              <span>上传时自动压缩</span>
            </label>
            <label v-if="autoCompressImages" class="compression-quality">
              <span>压缩质量 {{ compressionQuality }}%</span>
              <input v-model.number="compressionQuality" type="range" min="40" max="100" step="1" />
            </label>
            <small>仅当文件超过 10MB 时自动压缩；10MB 以内保持原图质量。</small>
          </div>

        <!-- 按钮配置 -->
        <div class="spec-section" v-if="!isBuiltin">
          <div class="spec-heading">
            <span>按钮配置</span>
            <button type="button" class="text-button" @click="addLink">
              <Plus :size="14" /> 添加按钮
            </button>
          </div>
          <div class="link-list">
            <div class="link-row" v-for="(link, idx) in draftLinks" :key="`link-${idx}`">
              <input v-model="link.text" type="text" placeholder="按钮文字" @input="markDirty(selectedHero.id)" />
              <select v-model="link.type" @change="markDirty(selectedHero.id)">
                <option value="primary">主按钮</option>
                <option value="secondary">次按钮</option>
              </select>
              <input v-model="link.to" type="text" placeholder="内部路由 /shop" @input="markDirty(selectedHero.id)" />
              <input v-model="link.href" type="text" placeholder="外部链接 https://" @input="markDirty(selectedHero.id)" />
              <select v-model="link.onClick" @change="markDirty(selectedHero.id)">
                <option value="">无弹窗</option>
                <option value="modal:fuzhou">福州弹窗</option>
                <option value="modal:cloud-plus">Cloud+弹窗</option>
                <option value="modal:anniversary-letter">周年信件弹窗</option>
              </select>
              <button type="button" class="text-button link-lottery-btn" title="关联抽奖活动" @click="openLotteryPicker({ type: 'link', linkIndex: idx })">
                <Gift :size="14" /> 抽奖
              </button>
              <button type="button" class="spec-remove" @click="removeLink(idx)">
                <X :size="14" />
              </button>
            </div>
            <p v-if="!draftLinks.length" class="spec-empty">还没有按钮，点击「添加按钮」开始配置</p>
          </div>
        </div>

        <div class="editor-footer">
          <span v-if="selectedHero.status === 'published'">已于 {{ formatDate(selectedHero.published_at) }} 发布</span>
          <span v-else>当前为草稿状态，发布后在首页显示</span>
          <div class="footer-actions">
            <button type="button" class="text-button" @click="showRevisions = !showRevisions">
              <History :size="14" /> 历史版本
            </button>
          </div>
        </div>

        <!-- 历史版本面板 -->
        <div v-if="showRevisions" class="revisions-panel">
          <h4>发布历史</h4>
          <div v-if="revisionsLoading" class="revisions-loading">加载中...</div>
          <div v-else-if="!revisions.length" class="revisions-empty">暂无发布历史</div>
          <div v-else class="revisions-list">
            <div v-for="rev in revisions" :key="rev.id" class="revision-item">
              <span class="revision-time">{{ formatDate(rev.published_at) }}</span>
              <button type="button" class="text-button" @click="rollbackTo(rev.id)">回滚</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 未选中时的空状态 -->
      <section v-else class="editor-panel glass-panel selection-empty">
        <LayoutIcon :size="36" aria-hidden="true" />
        <h2>选择一个英雄区开始编辑</h2>
        <button type="button" class="primary-button" @click="startNewHero">
          <Plus :size="17" aria-hidden="true" /> 新建英雄区
        </button>
      </section>
    </main>

    <!-- 图片裁切弹窗 -->
    <AvatarCropModal
      v-model:visible="cropVisible"
      :image-src="cropSource"
      :loading="isUploading"
      title="裁切英雄区图片"
      hint="自由拖动裁切框，调整宽高比例"
      sub-hint="可随意裁切图片任意区域，不受固定比例限制"
      :aspect-ratio="cropAspectRatio"
      shape="rectangle"
      output-type="image/webp"
      :output-quality="0.92"
      @confirm="handleCropConfirm"
      @cancel="releaseCropSource"
    />

    <!-- 抽奖活动选择弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="lotteryPickerVisible" class="lottery-picker-overlay" @click.self="lotteryPickerVisible = false">
          <div class="lottery-picker-modal glass-container-heavy">
            <header class="lottery-picker-header">
              <h3>选择抽奖活动</h3>
              <button class="close-btn" @click="lotteryPickerVisible = false">
                <X :size="20" />
              </button>
            </header>
            <div class="lottery-picker-search">
              <Search :size="16" />
              <input v-model.trim="lotteryPickerKeyword" type="search" placeholder="搜索抽奖标题或奖品" />
            </div>
            <div class="lottery-picker-list">
              <div v-if="lotteryPickerLoading" class="lottery-picker-loading">加载中...</div>
              <div v-else-if="!filteredLotteries.length" class="lottery-picker-empty">没有匹配的抽奖活动</div>
              <button
                v-for="lottery in filteredLotteries"
                :key="lottery.id"
                type="button"
                class="lottery-picker-item"
                @click="selectLottery(lottery)"
              >
                <span class="lottery-picker-thumb">
                  <img v-if="lottery.cover_image_url" :src="lottery.cover_image_url" :alt="lottery.title" loading="lazy" />
                  <span v-else class="lottery-picker-thumb-placeholder">🎲</span>
                </span>
                <span class="lottery-picker-info">
                  <strong>{{ lottery.title || '未命名抽奖' }}</strong>
                  <small>奖品：{{ lottery.prize_title || '未设置' }}</small>
                  <small v-if="lottery.status === 'open'" class="lottery-status open">报名中</small>
                  <small v-else-if="lottery.status === 'drawn'" class="lottery-status drawn">已开奖</small>
                  <small v-else-if="lottery.status === 'closed'" class="lottery-status closed">已关闭</small>
                  <small v-else class="lottery-status draft">草稿</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="toast.show" class="console-toast" role="status">{{ toast.message }}</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ChevronLeft, Crop, Layout as LayoutIcon, Plus, Info,
  RefreshCw, Save, Search, Trash2, Upload, X, ArrowUp, ArrowDown, History, Gift
} from 'lucide-vue-next';
import AvatarCropModal from '@/components/AvatarCropModal.vue';
import DynamicHomeHero from '@/views/Home/components/DynamicHomeHero.vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { useAuthStore } from '@/stores/auth';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import { uploadImageToCloudinary, isCloudinaryNoteUploadConfigured } from '@/utils/cloudinary-client.js';
import {
  compressImageFileToUploadLimit,
  formatImageFileSize,
  getImageCompressionPlan
} from '@/utils/image-compression.js';
import { CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES } from '@/utils/cloud-upload-guard.js';
import { supabase } from '@/utils/supabase-client.js';
import { logger } from '@/utils/logger.js';

const router = useRouter();
const authStore = useAuthStore();
const dialog = useConfirmDialog();
const homeHeroesStore = useHomeHeroesStore();

const heroes = computed(() => homeHeroesStore.allHeroes);
const isLoading = computed(() => homeHeroesStore.isFetching);
const isSaving = computed(() => homeHeroesStore.isSaving);

const drafts = reactive({}); // id -> draft hero
const dirtyIds = reactive(new Set());
const selectedId = ref(null);
const searchQuery = ref('');
const statusFilter = ref('all');
const archiveFilter = ref('all');
const previewDevice = ref('desktop');
const layoutDevice = ref('desktop');
const previewStage = ref(null);
const previewScale = ref(1);
const showRevisions = ref(false);
const revisions = ref([]);
const revisionsLoading = ref(false);

// 图片裁切
const cropVisible = ref(false);
const cropSource = ref('');
const cropTarget = ref({ type: 'main', splitIndex: -1 }); // main / split
const isUploading = ref(false);
const HERO_COMPRESSION_SETTINGS_KEY = 'boh.hero-console.image-compression.v1';
const savedCompressionSettings = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(HERO_COMPRESSION_SETTINGS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
})();
const autoCompressImages = ref(savedCompressionSettings.autoCompress !== false);
const compressionQuality = ref(Math.min(100, Math.max(40, Number(savedCompressionSettings.quality) || 82)));
let tempCounter = 0;

// 抽奖活动选择器
const lotteryPickerVisible = ref(false);
const lotteryPickerLoading = ref(false);
const lotteryPickerList = ref([]);
const lotteryPickerKeyword = ref('');
// target: { type: 'fill' | 'link', linkIndex?: number }
// fill = 整体填充英雄区；link = 仅配置某个按钮跳转到抽奖
const lotteryPickerTarget = ref({ type: 'fill' });

const toast = ref({ show: false, message: '' });
let toastTimer = null;
let previewResizeObserver = null;

// 模板标签
const templateLabel = (t) => ({
  standard: '标准卡片',
  overlay: '全幅叠加',
  split: '分栏并排',
  responsive: '横竖屏',
  builtin: '内置组件'
})[t] || t;

// 状态
const dirtyCount = computed(() => dirtyIds.size);
const selectedHero = computed(() => selectedId.value === null ? null : heroes.value.find(h => h.id === selectedId.value) || drafts[selectedId.value] || null);
const draftHero = computed(() => selectedId.value === null ? null : drafts[selectedId.value] || null);
const draftLinks = computed(() => draftHero.value?.links || []);
const splitCardsDraft = computed(() => draftHero.value?.split_cards || []);
const isBuiltin = computed(() => draftHero.value?.template === 'builtin');
const defaultContentLayout = Object.freeze({ align: 'center', valign: 'bottom', text_align: 'center', max_width: 980, offset_x: 0, offset_y: 0 });
const layoutPositions = Object.freeze([
  { align: 'left', valign: 'top', label: '左上' }, { align: 'center', valign: 'top', label: '上方居中' }, { align: 'right', valign: 'top', label: '右上' },
  { align: 'left', valign: 'center', label: '左侧居中' }, { align: 'center', valign: 'center', label: '正中' }, { align: 'right', valign: 'center', label: '右侧居中' },
  { align: 'left', valign: 'bottom', label: '左下' }, { align: 'center', valign: 'bottom', label: '下方居中' }, { align: 'right', valign: 'bottom', label: '右下' }
]);
const previewCanvas = computed(() => previewDevice.value === 'mobile'
  ? { width: 390, height: 844 }
  : { width: 1440, height: 900 });
const contentLayout = computed(() => {
  const raw = draftHero.value?.content_layout;
  const desktop = raw?.desktop || raw || {};
  const mobile = layoutDevice.value === 'mobile' ? (raw?.mobile || {}) : {};
  return { ...defaultContentLayout, ...desktop, ...mobile };
});
const isMobileLayoutInherited = computed(() => !draftHero.value?.content_layout?.mobile);

const filteredHeroes = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return heroes.value.filter((h) => {
    const matchesQuery = !q || `${h.label || ''} ${h.title}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter.value === 'all' || h.status === statusFilter.value;
    const matchesArchive = archiveFilter.value === 'all'
      || (archiveFilter.value === 'archived' && h.is_archived)
      || (archiveFilter.value === 'active' && !h.is_archived);
    return matchesQuery && matchesStatus && matchesArchive;
  });
});

const heroStatus = (hero) => {
  if (hero.is_archived) return { label: '已归档', tone: 'muted' };
  if (hero.status === 'published') return { label: '已发布', tone: 'success' };
  return { label: '草稿', tone: 'warning' };
};

const getThumbUrl = (hero) => {
  if (hero.template === 'responsive') return hero.image_config.landscapeSrc || hero.image_config.portraitSrc || '';
  if (hero.template === 'split') return hero.split_cards?.[0]?.image_config?.src || '';
  return hero.image_config.src || '';
};

const isDirty = (id) => dirtyIds.has(id);
const markDirty = (id) => dirtyIds.add(id);

function ensureContentLayoutRoot() {
  if (!draftHero.value) return null;
  const raw = draftHero.value.content_layout;
  if (!raw) {
    draftHero.value.content_layout = { desktop: { ...defaultContentLayout }, mobile: null };
  } else if (!raw.desktop) {
    draftHero.value.content_layout = { desktop: { ...defaultContentLayout, ...raw }, mobile: null };
  }
  return draftHero.value.content_layout;
}

function updateContentLayout(mutator) {
  const root = ensureContentLayoutRoot();
  if (!root || !draftHero.value) return;
  const desktop = { ...defaultContentLayout, ...(root.desktop || {}) };
  let mobile = root.mobile ? { ...desktop, ...root.mobile } : null;
  const target = layoutDevice.value === 'mobile' ? (mobile || { ...desktop }) : desktop;
  mutator(target);
  if (layoutDevice.value === 'mobile') mobile = target;
  draftHero.value.content_layout = { desktop, mobile };
  markDirty(selectedId.value);
}

function setContentPosition(align, valign) {
  setPreviewDevice(layoutDevice.value);
  updateContentLayout((layout) => {
    layout.align = align;
    layout.valign = valign;
  });
}

function setContentTextAlign(textAlign) {
  setPreviewDevice(layoutDevice.value);
  updateContentLayout((layout) => {
    layout.text_align = textAlign;
  });
}

function setContentMaxWidth(maxWidth) {
  setPreviewDevice(layoutDevice.value);
  updateContentLayout((layout) => {
    layout.max_width = Number(maxWidth);
  });
}

function setContentOffset(axis, value) {
  setPreviewDevice(layoutDevice.value);
  const limit = axis === 'x' ? 720 : 480;
  updateContentLayout((layout) => {
    layout[axis === 'x' ? 'offset_x' : 'offset_y'] = Math.max(-limit, Math.min(limit, Number(value) || 0));
  });
}

function toggleMobileLayoutInheritance(inherit) {
  const root = ensureContentLayoutRoot();
  if (!root || !draftHero.value) return;
  const desktop = { ...defaultContentLayout, ...(root.desktop || {}) };
  draftHero.value.content_layout = {
    desktop,
    mobile: inherit ? null : { ...desktop, ...(root.mobile || {}) }
  };
  markDirty(selectedId.value);
}

function imagePositionKey(target) {
  return target === 'mobile' ? 'mobile_position' : target === 'portrait' ? 'portrait_position' : 'position';
}

function positionValue(align, valign) {
  const x = { left: 'left', center: 'center', right: 'right' }[align];
  const y = { top: 'top', center: 'center', bottom: 'bottom' }[valign];
  return `${x} ${y}`;
}

function imagePositionMatches(target, position) {
  const value = draftHero.value?.image_config?.[imagePositionKey(target)] || '';
  return value === positionValue(position.align, position.valign);
}

const DEFAULT_MOBILE_IMAGE_SCALE = 1.24;
const mobileImageScale = computed(() => {
  const value = Number(draftHero.value?.image_config?.mobile_scale);
  return Number.isFinite(value) ? Math.max(1, Math.min(2.2, value)) : DEFAULT_MOBILE_IMAGE_SCALE;
});

function ensureMobileImageScale() {
  if (!draftHero.value || Number.isFinite(Number(draftHero.value.image_config.mobile_scale))) return;
  draftHero.value.image_config.mobile_scale = DEFAULT_MOBILE_IMAGE_SCALE;
}

function setMobileImageScale(value) {
  if (!draftHero.value) return;
  setPreviewDevice('mobile');
  draftHero.value.image_config.mobile_scale = Math.max(1, Math.min(2.2, Number(value) || DEFAULT_MOBILE_IMAGE_SCALE));
  markDirty(selectedId.value);
}

function setImagePosition(target, align, valign) {
  if (!draftHero.value) return;
  setPreviewDevice(target === 'mobile' || target === 'portrait' ? 'mobile' : 'desktop');
  if (target === 'mobile' && draftHero.value.template === 'overlay') ensureMobileImageScale();
  draftHero.value.image_config[imagePositionKey(target)] = positionValue(align, valign);
  markDirty(selectedId.value);
}

function setImagePositionValue(target, value) {
  if (!draftHero.value) return;
  setPreviewDevice(target === 'mobile' || target === 'portrait' ? 'mobile' : 'desktop');
  if (target === 'mobile' && draftHero.value.template === 'overlay') ensureMobileImageScale();
  draftHero.value.image_config[imagePositionKey(target)] = value;
  markDirty(selectedId.value);
}

function updatePreviewImagePosition({ x, y, portrait }) {
  if (!draftHero.value) return;
  const target = draftHero.value.template === 'responsive'
    ? (portrait ? 'portrait' : 'desktop')
    : (portrait ? 'mobile' : 'desktop');
  setImagePositionValue(target, `${x}% ${y}%`);
}

function updatePreviewContentOffset({ dx, dy, portrait }) {
  layoutDevice.value = portrait ? 'mobile' : 'desktop';
  updateContentLayout((layout) => {
    layout.offset_x = Math.max(-720, Math.min(720, Number(layout.offset_x || 0) + Number(dx || 0)));
    layout.offset_y = Math.max(-480, Math.min(480, Number(layout.offset_y || 0) + Number(dy || 0)));
  });
}

function setPreviewDevice(device) {
  previewDevice.value = device;
  layoutDevice.value = device;
}

function updatePreviewScale() {
  const element = previewStage.value;
  if (!element) return;
  const { width, height } = element.getBoundingClientRect();
  const canvas = previewCanvas.value;
  previewScale.value = Math.max(0.1, Math.min(width / canvas.width, height / canvas.height));
}

function getCardContentLayout(card) {
  return { ...defaultContentLayout, ...(card.content_layout || {}) };
}

function setCardTextAlign(card, textAlign) {
  card.content_layout = { ...getCardContentLayout(card), text_align: textAlign };
  markDirty(selectedId.value);
}

function setCardContentPosition(card, align, valign) {
  card.content_layout = { ...getCardContentLayout(card), align, valign };
  markDirty(selectedId.value);
}

const cropAspectRatio = computed(() => {
  // 自由裁切：不固定比例，用户可任意调整裁切框宽高
  return null;
});

function showToast(message) {
  toast.value = { show: true, message };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value.show = false; }, 3000);
}

const cloneContentLayout = (layout) => layout ? {
  ...layout,
  desktop: layout.desktop ? { ...layout.desktop } : undefined,
  mobile: layout.mobile ? { ...layout.mobile } : null
} : null;

const cloneHero = (hero) => ({
  ...hero,
  image_config: { ...hero.image_config },
  content_layout: cloneContentLayout(hero.content_layout),
  links: (hero.links || []).map(l => ({ ...l })),
  split_cards: (hero.split_cards || []).map(c => ({
    ...c,
    image_config: { ...c.image_config },
    content_layout: cloneContentLayout(c.content_layout),
    links: (c.links || []).map(l => ({ ...l }))
  }))
});

// ===== 抽奖活动选择器 =====
const filteredLotteries = computed(() => {
  const q = lotteryPickerKeyword.value.toLowerCase().trim();
  if (!q) return lotteryPickerList.value;
  return lotteryPickerList.value.filter(l =>
    `${l.title || ''} ${l.prize_title || ''}`.toLowerCase().includes(q)
  );
});

async function openLotteryPicker(target = { type: 'fill' }) {
  lotteryPickerTarget.value = target;
  lotteryPickerVisible.value = true;
  lotteryPickerKeyword.value = '';
  if (lotteryPickerList.value.length > 0) return;
  lotteryPickerLoading.value = true;
  try {
    const { data, error } = await supabase
      .from('lotteries')
      .select('id, title, prize_title, prize_description, cover_image_url, status, entry_deadline_at, draw_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    lotteryPickerList.value = data || [];
  } catch (e) {
    logger.error('hero-console', '加载抽奖列表失败', e);
    showToast('加载抽奖列表失败');
  } finally {
    lotteryPickerLoading.value = false;
  }
}

function selectLottery(lottery) {
  if (!draftHero.value) return;
  const lotteryLink = `/lotteries?lottery=${encodeURIComponent(lottery.id)}`;

  if (lotteryPickerTarget.value.type === 'link') {
    // 仅配置指定按钮跳转到该抽奖
    const idx = lotteryPickerTarget.value.linkIndex;
    if (typeof idx === 'number' && draftHero.value.links[idx]) {
      const link = draftHero.value.links[idx];
      link.to = lotteryLink;
      link.href = '';
      if (!link.text || link.text === '新按钮') link.text = '参与抽奖';
    }
    markDirty(selectedId.value);
    lotteryPickerVisible.value = false;
    showToast('已关联抽奖活动');
    return;
  }

  // 整体填充英雄区
  if (lottery.title) draftHero.value.title = lottery.title;
  if (lottery.prize_title) draftHero.value.subtitle = lottery.prize_title;
  if (lottery.cover_image_url) draftHero.value.image_config.src = lottery.cover_image_url;
  if (lottery.prize_title) draftHero.value.image_config.alt = lottery.prize_title;
  const existing = draftHero.value.links.findIndex(l => l.to && l.to.startsWith('/lotteries?lottery='));
  if (existing >= 0) {
    draftHero.value.links[existing].to = lotteryLink;
    draftHero.value.links[existing].text = '参与抽奖';
  } else {
    draftHero.value.links.push({
      text: '参与抽奖',
      type: 'primary',
      to: lotteryLink,
      href: '',
      onClick: ''
    });
  }
  markDirty(selectedId.value);
  lotteryPickerVisible.value = false;
  showToast('已从抽奖活动填充');
}

function selectHero(hero) {
  if (!drafts[hero.id]) drafts[hero.id] = cloneHero(hero);
  selectedId.value = hero.id;
  showRevisions.value = false;
}

function startNewHero() {
  tempCounter -= 1;
  const tempId = `temp-${tempCounter}`;
  const newHero = {
    id: tempId,
    // 新建项使用负数排序值，确保保存后位于所有现有英雄区之前。
    sort_order: -1,
    is_archived: false,
    template: 'standard',
    variant: 'light',
    eyebrow: null,
    title: '新英雄区',
    subtitle: null,
    image_config: { src: '', alt: '' },
    content_layout: { desktop: { ...defaultContentLayout }, mobile: null },
    links: [],
    split_cards: [
      { title: '卡片一', subtitle: '', variant: 'light', image_config: { src: '', alt: '' }, content_layout: { ...defaultContentLayout }, links: [] },
      { title: '卡片二', subtitle: '', variant: 'light', image_config: { src: '', alt: '' }, content_layout: { ...defaultContentLayout }, links: [] }
    ],
    label: '',
    aria_label: '',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  drafts[tempId] = newHero;
  selectedId.value = tempId;
  // 临时英雄区不入 store，保存时才入库
}

function addLink() {
  if (!draftHero.value) return;
  draftHero.value.links.push({ text: '新按钮', type: 'primary', to: '', href: '', onClick: '' });
  markDirty(selectedId.value);
}

function removeLink(idx) {
  if (!draftHero.value) return;
  draftHero.value.links.splice(idx, 1);
  markDirty(selectedId.value);
}

function canMove(direction) {
  if (!selectedHero.value) return false;
  const list = filteredHeroes.value;
  const idx = list.findIndex(h => h.id === selectedId.value);
  if (idx < 0) return false;
  return direction < 0 ? idx > 0 : idx < list.length - 1;
}

async function moveHero(direction) {
  if (!canMove(direction)) return;
  const list = filteredHeroes.value;
  const idx = list.findIndex(h => h.id === selectedId.value);
  const targetIdx = idx + direction;
  // 过滤条件只影响可操作邻居，持久化时仍按完整列表重排，避免把被过滤的区块挤到错误位置。
  const orderedIds = heroes.value.map((hero) => hero.id);
  const currentIndex = orderedIds.indexOf(list[idx].id);
  const targetIndex = orderedIds.indexOf(list[targetIdx].id);
  if (currentIndex < 0 || targetIndex < 0) return;
  [orderedIds[currentIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[currentIndex]];
  const ok = await homeHeroesStore.reorderHeroes(orderedIds);
  if (!ok) {
    showToast('调整顺序失败');
    return;
  }
  // 草稿会在列表刷新后保留；同步其排序，避免之后“保存草稿”又写回旧顺序。
  orderedIds.forEach((id, order) => {
    if (drafts[id]) drafts[id].sort_order = order;
  });
  await loadHeroes();
  showToast('已调整顺序');
}

async function saveCurrent() {
  if (!draftHero.value || !selectedHero.value) return;
  const draft = draftHero.value;
  // 验证
  if (!String(draft.title || '').trim()) {
    showToast('主标题不能为空');
    return;
  }
  const payload = {
    sort_order: draft.sort_order,
    is_archived: draft.is_archived,
    template: draft.template,
    variant: draft.variant,
    builtin_key: draft.builtin_key ?? null,
    eyebrow: draft.eyebrow || null,
    title: draft.title,
    subtitle: draft.subtitle || null,
    image_config: draft.image_config,
    content_layout: draft.content_layout || null,
    links: draft.links,
    split_cards: draft.template === 'split' ? draft.split_cards : null,
    label: draft.label || null,
    aria_label: draft.aria_label || null
  };
  const isTemp = String(selectedId.value).startsWith('temp-');
  let ok = false;
  if (isTemp) {
    // 新建
    const created = await homeHeroesStore.createHero(payload);
    if (created) {
      delete drafts[selectedId.value];
      // 把新创建的 hero 克隆到 drafts，否则 draftHero 返回 null 导致模板白屏
      drafts[created.id] = cloneHero(created);
      selectedId.value = created.id;
      ok = true;
    }
  } else {
    ok = await homeHeroesStore.saveHero(selectedId.value, payload);
    if (ok) dirtyIds.delete(selectedId.value);
  }
  showToast(ok ? '草稿已保存' : '保存失败');
}

async function publishCurrent() {
  if (!draftHero.value || !selectedHero.value) return;
  // 先保存草稿
  const isTemp = String(selectedId.value).startsWith('temp-');
  if (isTemp || isDirty(selectedId.value)) {
    await saveCurrent();
  }
  if (String(selectedId.value).startsWith('temp-')) return; // 保存失败
  // 保存失败（草稿仍为脏）时不得继续发布，否则首页会生效旧数据
  if (isDirty(selectedId.value)) {
    showToast('草稿保存失败，已取消发布，请重试保存');
    return;
  }
  const ok = await homeHeroesStore.publishHero(selectedId.value, authStore.userInfo?.id);
  showToast(ok ? '已发布，首页即将生效' : '发布失败');
}

async function deleteCurrent() {
  if (!selectedHero.value) return;
  const confirmed = await dialog.confirm({
    title: '删除英雄区',
    message: `确定删除「${selectedHero.value.label || selectedHero.value.title}」吗？此操作不可恢复。`,
    confirmText: '删除',
    tone: 'danger'
  });
  if (!confirmed) return;
  const isTemp = String(selectedId.value).startsWith('temp-');
  if (isTemp) {
    delete drafts[selectedId.value];
    selectedId.value = null;
    showToast('已删除');
    return;
  }
  const ok = await homeHeroesStore.deleteHero(selectedId.value);
  if (ok) {
    delete drafts[selectedId.value];
    selectedId.value = null;
    showToast('已删除');
  } else {
    showToast('删除失败');
  }
}

// 图片裁切
function releaseCropSource() {
  if (cropSource.value.startsWith('blob:')) URL.revokeObjectURL(cropSource.value);
  cropSource.value = '';
}

function openCropper(type, splitIndex = -1) {
  // 触发文件选择
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!String(file.type).startsWith('image/')) {
      showToast('请选择图片文件');
      return;
    }
    releaseCropSource();
    cropSource.value = URL.createObjectURL(file);
    cropTarget.value = { type, splitIndex };
    cropVisible.value = true;
  };
  input.click();
}

function persistCompressionSettings() {
  try {
    localStorage.setItem(HERO_COMPRESSION_SETTINGS_KEY, JSON.stringify({
      autoCompress: autoCompressImages.value,
      quality: compressionQuality.value
    }));
  } catch {
    // 本地存储不可用时仍保持当前页面设置。
  }
}

watch([autoCompressImages, compressionQuality], persistCompressionSettings);

async function prepareHeroImage(file) {
  const originalSize = Number(file?.size || 0);
  if (!autoCompressImages.value || !file) {
    return {
      file,
      changed: false,
      status: autoCompressImages.value ? 'empty' : 'disabled',
      originalSize,
      compressedSize: originalSize
    };
  }
  if (originalSize <= CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES) {
    return { file, changed: false, status: 'not-needed', originalSize, compressedSize: originalSize };
  }

  try {
    const plan = await getImageCompressionPlan(file, {
      maxSizeBytes: CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES,
      optimizeForUpload: true,
      optimizedTargetSizeMB: 9.6,
      optimizedMaxDimension: 2048,
      targetSizeMB: 9.6
    });
    if (!plan.canCompress || !plan.shouldCompress) {
      return { file, changed: false, status: 'not-needed', originalSize, compressedSize: originalSize };
    }

    const compressedFile = await compressImageFileToUploadLimit(file, plan, {
      initialQuality: compressionQuality.value / 100,
      targetSizeMB: plan.targetSizeMB,
      maxIteration: 8
    });
    const compressedSize = Number(compressedFile?.size || 0);
    if (!compressedSize || compressedSize >= originalSize) {
      return { file, changed: false, status: 'not-smaller', originalSize, compressedSize: originalSize };
    }
    return { file: compressedFile, changed: true, status: 'compressed', originalSize, compressedSize };
  } catch (error) {
    logger.warn('hero-console', '图片自动压缩失败，将尝试上传原图', error);
    return { file, changed: false, status: 'failed', originalSize, compressedSize: originalSize, compressionError: true };
  }
}

function compressionToast(result) {
  if (result?.status === 'compressed') {
    return `图片已自动压缩：${formatImageFileSize(result.originalSize)} → ${formatImageFileSize(result.compressedSize)}`;
  }
  if (result?.status === 'disabled') return '图片已上传（自动压缩未开启）';
  if (result?.status === 'failed') return '自动压缩失败，已上传原图';
  if (result?.status === 'not-smaller') return '图片已上传（压缩后没有更小，保留原图）';
  if (result?.status === 'not-needed') return '图片已上传（原图已符合压缩条件，无需处理）';
  return '图片已上传';
}

async function openDirectUpload(type, splitIndex = -1) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.onchange = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    if (!String(file.type).startsWith('image/')) {
      showToast('请选择图片文件');
      return;
    }
    if (!isCloudinaryNoteUploadConfigured()) {
      showToast('请先配置 Cloudinary 上传');
      return;
    }
    isUploading.value = true;
    try {
      const prepared = await prepareHeroImage(file);
      const uploaded = await uploadImageToCloudinary(prepared.file, {
        folder: 'boh-cloud-plus/admin-hero-console',
        pendingSource: 'hero-console'
      });
      if (!uploaded.url) throw new Error('上传成功但未返回图片地址');
      if (type === 'split') {
        if (draftHero.value.split_cards[splitIndex]) {
          draftHero.value.split_cards[splitIndex].image_config.src = uploaded.url;
        }
      } else if (type === 'mobile') {
        draftHero.value.image_config.mobile_src = uploaded.url;
      } else if (type === 'landscape') {
        draftHero.value.image_config.landscapeSrc = uploaded.url;
      } else if (type === 'portrait') {
        draftHero.value.image_config.portraitSrc = uploaded.url;
      } else {
        draftHero.value.image_config.src = uploaded.url;
      }
      markDirty(selectedId.value);
      showToast(compressionToast(prepared));
    } catch (error) {
      logger.error('hero-console', '英雄区图片上传失败', error);
      showToast(`图片上传失败：${error?.message || '未知错误'}`);
    } finally {
      isUploading.value = false;
    }
  };
  input.click();
}

async function handleCropConfirm(blob) {
  if (!draftHero.value || isUploading.value) return;
  let localPreview = '';
  try {
    if (!isCloudinaryNoteUploadConfigured()) throw new Error('请先配置 Cloudinary 上传');
    isUploading.value = true;
    localPreview = URL.createObjectURL(blob);
    const file = new File([blob], `hero-${Date.now()}.webp`, { type: 'image/webp' });
    const prepared = await prepareHeroImage(file);
    const uploaded = await uploadImageToCloudinary(prepared.file, {
      folder: 'boh-cloud-plus/admin-hero-console',
      pendingSource: 'hero-console'
    });
    if (!uploaded.url) throw new Error('上传成功但未返回图片地址');
    const url = uploaded.url;
    if (cropTarget.value.type === 'split') {
      if (draftHero.value.split_cards[cropTarget.value.splitIndex]) {
        draftHero.value.split_cards[cropTarget.value.splitIndex].image_config.src = url;
      }
    } else if (cropTarget.value.type === 'mobile') {
      draftHero.value.image_config.mobile_src = url;
    } else if (cropTarget.value.type === 'landscape') {
      draftHero.value.image_config.landscapeSrc = url;
    } else if (cropTarget.value.type === 'portrait') {
      draftHero.value.image_config.portraitSrc = url;
    } else {
      draftHero.value.image_config.src = url;
    }
    markDirty(selectedId.value);
    URL.revokeObjectURL(localPreview);
    localPreview = '';
    cropVisible.value = false;
    releaseCropSource();
    showToast(`${compressionToast(prepared)}，保存后生效`);
  } catch (error) {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      localPreview = '';
    }
    logger.error('hero-console', '英雄区图片上传失败', error);
    showToast(`图片上传失败：${error?.message || '未知错误'}`);
  } finally {
    isUploading.value = false;
  }
}

// 历史版本
watch([selectedId, showRevisions], async ([id, show]) => {
  if (!show || !id || String(id).startsWith('temp-')) {
    revisions.value = [];
    return;
  }
  revisionsLoading.value = true;
  revisions.value = await homeHeroesStore.fetchRevisions(id);
  revisionsLoading.value = false;
});

watch([draftHero, previewDevice], () => {
  requestAnimationFrame(() => {
    updatePreviewScale();
  });
}, { deep: true });

watch(previewStage, (element) => {
  previewResizeObserver?.disconnect();
  if (element && previewResizeObserver) previewResizeObserver.observe(element);
  requestAnimationFrame(updatePreviewScale);
});

async function rollbackTo(revisionId) {
  if (!selectedId.value) return;
  const confirmed = await dialog.confirm({
    title: '回滚到历史版本',
    message: '回滚后会覆盖当前草稿配置，但不影响已发布版本。需要重新发布才能生效。',
    confirmText: '回滚'
  });
  if (!confirmed) return;
  const ok = await homeHeroesStore.rollbackHero(selectedId.value, revisionId);
  if (ok) {
    delete drafts[selectedId.value];
    showToast('已回滚，请检查后发布');
  } else {
    showToast('回滚失败');
  }
}

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
};

const goBackToAdmin = () => {
  router.push('/admin/data-management');
};

async function loadHeroes() {
  await homeHeroesStore.fetchAllForAdmin({ force: true });
}

onMounted(async () => {
  previewResizeObserver = new ResizeObserver(updatePreviewScale);
  if (previewStage.value) previewResizeObserver.observe(previewStage.value);
  await loadHeroes();
  requestAnimationFrame(updatePreviewScale);
});

onBeforeUnmount(() => {
  releaseCropSource();
  previewResizeObserver?.disconnect();
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<style scoped src="../ShopConsole/style.css"></style>
<style scoped>
/* HeroConsole 特有样式：补充 ShopConsole 未覆盖的部分 */
.hero-console {
  /* 复用 shop-console 的所有变量和基础样式 */
  --blue: #007aff;
  --text: #1d1d1f;
  --secondary: #6e6e73;
  --line: rgba(60, 60, 67, 0.12);
  --fill: rgba(118, 118, 128, 0.1);
  min-height: 100vh;
  padding: 84px 18px 24px;
  color: var(--text);
  background: #f2f2f7;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
}

.compression-settings {
  display: grid;
  grid-template-columns: auto minmax(180px, 1fr);
  align-items: center;
  gap: 8px 16px;
  margin: 12px 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--fill) 62%, transparent);
}

.compression-settings small {
  grid-column: 1 / -1;
  color: var(--secondary);
  font-size: 12px;
}

.compression-toggle,
.compression-quality {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text);
  font-size: 13px;
}

.compression-quality {
  justify-content: space-between;
  gap: 12px;
}

.compression-quality input[type='range'] {
  min-width: 120px;
  accent-color: var(--blue);
}

@media (max-width: 720px) {
  .compression-settings {
    grid-template-columns: 1fr;
  }

  .compression-quality {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

.hero-console button, .hero-console input, .hero-console select, .hero-console textarea {
  font: inherit;
}
.hero-console button { letter-spacing: 0; }

/* 内置英雄区只读提示 */
.builtin-readonly-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  margin: 8px 0 4px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--blue, #007aff) 8%, transparent);
  color: var(--secondary, #6e6e73);
  font-size: 13px;
  line-height: 1.45;
}

.builtin-readonly-hint svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--blue, #007aff);
}

.builtin-readonly-hint p {
  margin: 0;
}

/* 内置组件预览占位 */
.builtin-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 20px;
  color: var(--secondary, #6e6e73);
  text-align: center;
}

.builtin-preview-placeholder svg {
  color: var(--line, rgba(60, 60, 67, 0.12));
}

.builtin-preview-placeholder p {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #1d1d1f);
}

.builtin-preview-placeholder small {
  font-size: 12px;
}

/* 英雄区列表行（与 product-row 一致，但缩略图比例不同） */
.hero-row {
  position: relative;
  width: 100%;
  min-height: 62px;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 11px;
  color: var(--text);
  text-align: left;
  background: transparent;
  cursor: pointer;
}
.hero-row:hover { background: rgba(118, 118, 128, 0.07); }
.hero-row.selected { background: rgba(0, 122, 255, 0.11); }

.row-thumb {
  width: 48px;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  color: #a1a1a6;
  background: rgba(118, 118, 128, 0.09);
}
.row-thumb img { width: 100%; height: 100%; object-fit: cover; }
.thumb-overlay { aspect-ratio: 16 / 9; }
.thumb-responsive { aspect-ratio: 1; }

/* 预览区 */
.preview-workspace {
  padding: 18px;
}
.preview-toolbar {
  display: flex;
  gap: 4px;
}
.preview-stage {
  width: 100%;
  height: min(66vh, 640px);
  min-height: 380px;
  border-radius: 14px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #e9e9ee;
  box-shadow: inset 0 0 0 1px var(--line);
}
.preview-stage.device-mobile { background: #d7d7dc; }
.preview-canvas-shell {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  transition: width 260ms cubic-bezier(0.16, 1, 0.3, 1), height 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.preview-canvas {
  position: absolute;
  inset: 0 auto auto 0;
  overflow: hidden;
  transform-origin: top left;
  background: #fff;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
  transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1), width 260ms cubic-bezier(0.16, 1, 0.3, 1), height 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.preview-canvas-content {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
  container-type: size;
}
.preview-device-switch {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  justify-content: center;
}
.device-btn {
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--secondary);
  font-size: 12px;
  cursor: pointer;
}
.device-btn.active {
  background: var(--fill);
  color: var(--text);
  font-weight: 600;
}

/* 编辑面板：图片配置区 */
.image-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

/* 按钮配置列表 */
.link-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.link-row {
  display: grid;
  grid-template-columns: 1fr 80px 1.2fr 1.2fr 110px 64px 30px;
  gap: 6px;
  align-items: center;
}
.link-row input, .link-row select {
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.68);
  font-size: 12px;
}
.link-row input:focus, .link-row select:focus {
  border-color: rgba(0, 122, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
  outline: 0;
}

/* 抽奖快捷按钮 */
.link-lottery-btn {
  height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(0, 122, 255, 0.35);
  border-radius: 8px;
  background: rgba(0, 122, 255, 0.08);
  color: #006aff;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.link-lottery-btn:hover {
  background: rgba(0, 122, 255, 0.16);
  border-color: rgba(0, 122, 255, 0.6);
}

/* 文字与图片定位 */
.content-layout-section,
.image-config-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.layout-device-tabs {
  display: inline-flex;
  width: fit-content;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.layout-device-tabs button {
  min-width: 72px;
  padding: 6px 10px;
  border: 0;
  border-right: 1px solid var(--line);
  color: var(--secondary);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.layout-device-tabs button:last-child { border-right: 0; }
.layout-device-tabs button.active { color: var(--text); background: var(--fill); font-weight: 650; }
.inherit-layout-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  color: var(--secondary);
  font-size: 12px;
  cursor: pointer;
}
.inherit-layout-row input { accent-color: var(--blue); }
.position-layout-grid {
  display: grid;
  grid-template-columns: repeat(3, 36px);
  width: fit-content;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.position-cell {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: rgba(118, 118, 128, 0.04);
  cursor: pointer;
}
.position-cell:nth-child(3n) { border-right: 0; }
.position-cell:nth-child(n + 7) { border-bottom: 0; }
.position-cell span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8e8e93;
}
.position-cell:hover { background: rgba(0, 122, 255, 0.1); }
.position-cell.active { background: rgba(0, 122, 255, 0.16); }
.position-cell.active span { background: var(--blue); }
.position-layout-grid.compact { grid-template-columns: repeat(3, 30px); }
.position-layout-grid.compact .position-cell { width: 30px; height: 30px; }
.layout-control-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}
.layout-offset-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.width-control input[type="range"] { width: 100%; accent-color: var(--blue); }
.image-config-group {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.035);
}
.image-config-group summary {
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.image-config-group[open] summary { margin-bottom: 4px; }
.image-group-actions { margin-top: 2px; }
.image-position-editor {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px 12px;
  color: var(--secondary);
  font-size: 12px;
}
.image-position-editor > input {
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.7);
}

/* 分栏子卡片编辑 */
.split-card-editor {
  padding: 14px;
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.split-card-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

/* 历史版本面板 */
.revisions-panel {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
}
.revisions-panel h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
}
.revisions-loading, .revisions-empty {
  color: var(--secondary);
  font-size: 12px;
}
.revisions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.revision-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(118, 118, 128, 0.06);
}
.revision-time {
  font-size: 12px;
  color: var(--text);
}

/* 编辑器底部 */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.editor-footer > span {
  color: var(--secondary);
  font-size: 11px;
}

/* 响应式 */
@media (max-width: 1120px) {
  .hero-console .console-layout {
    grid-template-columns: minmax(230px, 0.72fr) minmax(0, 1.35fr);
  }
  .preview-workspace { grid-column: 2; }
  .editor-panel { grid-column: 2; }
  .hero-sidebar { grid-row: 1 / span 2; }
}

@media (max-width: 740px) {
  .hero-console { padding: 74px 10px 18px; }
  .link-row {
    grid-template-columns: 1fr 1fr;
  }
  .link-row .link-lottery-btn,
  .link-row .spec-remove {
    grid-column: span 1;
  }
}

/* ===== 快捷填充 ===== */
.quick-fill-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lottery-fill-btn {
  justify-content: flex-start;
  width: fit-content;
}

.quick-fill-hint {
  font-size: 12px;
  color: var(--dm-muted, #7f8d9f);
  margin: 0;
}

/* ===== 抽奖选择弹窗 ===== */
.lottery-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(14, 17, 21, 0.45);
  z-index: 11060;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.lottery-picker-modal {
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  max-height: 80dvh;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.lottery-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.lottery-picker-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1d1d1f;
}

.lottery-picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  color: #86868b;
}

.lottery-picker-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: inherit;
}

.lottery-picker-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px;
}

.lottery-picker-loading,
.lottery-picker-empty {
  text-align: center;
  padding: 40px 20px;
  color: #86868b;
  font-size: 14px;
}

.lottery-picker-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.lottery-picker-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.lottery-picker-thumb {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: #f5f5f7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lottery-picker-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lottery-picker-thumb-placeholder {
  font-size: 22px;
}

.lottery-picker-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lottery-picker-info strong {
  font-size: 14px;
  font-weight: 600;
  color: #1d1d1f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lottery-picker-info small {
  font-size: 12px;
  color: #86868b;
}

.lottery-status {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  width: fit-content;
}

.lottery-status.open { background: rgba(66, 133, 244, 0.12); color: #4285f4; }
.lottery-status.drawn { background: rgba(52, 168, 83, 0.12); color: #34a853; }
.lottery-status.closed { background: rgba(142, 142, 147, 0.15); color: #8e8e93; }
.lottery-status.draft { background: rgba(251, 188, 5, 0.15); color: #fbbc05; }

@media (prefers-color-scheme: dark) {
  .lottery-picker-modal { background: #1d1d1f; }
  .lottery-picker-header h3 { color: #eff1f4; }
  .lottery-picker-header { border-bottom-color: rgba(255, 255, 255, 0.08); }
  .lottery-picker-search { border-bottom-color: rgba(255, 255, 255, 0.08); }
  .lottery-picker-item:hover { background: rgba(255, 255, 255, 0.06); }
  .lottery-picker-info strong { color: #eff1f4; }
  .lottery-picker-info small { color: #949494; }
  .lottery-picker-thumb { background: #2c2c2e; }
}
</style>
