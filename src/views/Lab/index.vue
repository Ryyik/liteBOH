<template>
  <main ref="labPageRef" class="lab-page">
    <!-- 主体内容：sidebar + main + right panel -->
    <!-- 旧顶栏（BOH Agent Preview 横条）已删除：品牌标识由导航栏灵动岛 Agent 卡承接，
         工具按钮迁入底部对话框工具区（composer-left） -->
    <div class="lab-body">
      <!-- Sidebar -->
      <aside class="lab-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="sidebar-head">
          <button class="sidebar-new-btn" @click="resetConversation">
            <AppIcon name="plus" size="small" weight="medium" />
            <span v-if="!sidebarCollapsed">新会话</span>
          </button>
          <button class="sidebar-toggle" @click="sidebarCollapsed = !sidebarCollapsed">
            <AppIcon name="chevron-left" size="small" weight="medium" />
          </button>
        </div>
        <div v-if="!sidebarCollapsed" class="sidebar-sessions">
          <div
            v-for="(s, si) in sessions"
            :key="s.id"
            class="sidebar-session"
            :class="{ active: si === currentSessionIndex }"
            @click="switchSession(si)"
          >
            <AppIcon name="message" size="small" weight="medium" />
            <div class="session-info">
              <div class="session-title">{{ s.title || '新对话' }}</div>
              <div class="session-date">{{ formatSessionDate(s.timestamp) }}</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 主内容 -->
      <div class="lab-main">
        <!-- 空状态：居中对话框 -->
        <section v-if="!hasConversation && !isLoading" class="empty-state">
        <div class="empty-hero">
          <div class="hero-icon">
            <AppIcon name="sparkles" size="xl" weight="light" />
          </div>
          <h1 class="hero-title">和 AI 一起创造任何内容</h1>
          <p class="hero-subtitle">
            对话即可生成 PPT、Word、网页，或上传文档让 AI 帮你排版
          </p>
        </div>

        <!-- 对话框（空状态即对话框） -->
        <div class="composer composer-hero">
          <textarea
            ref="heroTextareaRef"
            v-model="text"
            class="composer-input"
            :placeholder="composerPlaceholder"
            rows="3"
            :disabled="aiLoading"
            @keydown.enter.exact.prevent="onComposerEnter"
            @input="autoGrow"
          />
          <div v-if="pendingFile" class="composer-chips">
            <span v-if="pendingFile" class="attach-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">{{ truncate(pendingFile.name, 28) }}</span>
              <button class="chip-remove" title="移除" @click="clearFile">
                <AppIcon name="close" size="small" />
              </button>
            </span>
          </div>
          <div class="composer-footer">
            <div class="composer-left">
              <!-- + 直达上传（原 + 菜单与样式集弹窗已迁入导航栏灵动岛展开区） -->
              <button class="plus-btn" title="上传 Word 文档" @click="chooseDoc">
                <AppIcon name="plus" size="small" weight="medium" />
              </button>
              <!-- 思考预算列表框：本次生成的临时参数，五档带说明点选（与灵动岛·思考共享状态） -->
              <div class="composer-pill-wrap">
                <button
                  class="composer-pill"
                  :class="{ active: thinkingMenuOpen }"
                  title="思考预算：推理深度档位"
                  @click.stop="thinkingMenuOpen = !thinkingMenuOpen; presetMenuOpen = false"
                >
                  <AppIcon name="tuning" size="small" weight="medium" />
                  <span>思考 · {{ thinkingLevelLabel }}</span>
                </button>
                <Transition name="popover">
                  <div v-if="thinkingMenuOpen" class="pill-menu" role="listbox" aria-label="思考预算档位" @click.stop>
                    <button
                      v-for="lv in THINKING_LEVELS_UI"
                      :key="lv.label"
                      type="button"
                      class="pill-menu-item"
                      :class="{ active: thinkingLevelLabel === lv.label }"
                      role="option"
                      :aria-selected="thinkingLevelLabel === lv.label"
                      @click="setThinkingLevel(lv.value)"
                    >
                      <span class="pill-menu-label">{{ lv.label }}</span>
                      <span class="pill-menu-hint">{{ lv.hint }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <!-- 样式集列表框：8 套点选，与灵动岛·样式共享状态 -->
              <div class="composer-pill-wrap">
                <button
                  class="composer-pill"
                  :class="{ active: presetMenuOpen }"
                  :title="`样式集：${currentPresetName}`"
                  @click.stop="presetMenuOpen = !presetMenuOpen; thinkingMenuOpen = false"
                >
                  <AppIcon name="paintbrush" size="small" weight="medium" />
                  <span>{{ currentPresetName }}</span>
                </button>
                <Transition name="popover">
                  <div v-if="presetMenuOpen" class="pill-menu pill-menu--grid" role="listbox" aria-label="选择样式集" @click.stop>
                    <button
                      v-for="p in STYLE_PRESETS"
                      :key="p.id"
                      type="button"
                      class="pill-menu-item"
                      :class="{ active: selectedPresetId === p.id }"
                      role="option"
                      :aria-selected="selectedPresetId === p.id"
                      :title="p.description || p.name"
                      @click="choosePreset(p.id)"
                    >
                      <span class="pill-menu-label">{{ p.name }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <!-- 工具组（原顶栏迁入）：压缩/撤销/重做/思考预算/对话树/文档工具/下载，条件类按钮自动隐藏 -->
              <button
                v-if="hasConversation && needsCompression(messages)"
                class="icon-btn"
                :class="{ 'icon-btn--warn': contextCompressing }"
                title="压缩上下文释放 Token"
                :disabled="contextCompressing"
                @click="handleCompressContext"
              >
                <AppIcon name="text" size="small" weight="medium" />
                <span v-if="contextCompressing" class="icon-btn-badge">...</span>
              </button>
              <button
                v-if="canUndo"
                class="icon-btn"
                title="撤销"
                @click="handleUndo"
              >
                <AppIcon name="undo" size="small" weight="medium" />
              </button>
              <button
                v-if="canRedo"
                class="icon-btn"
                title="重做"
                @click="handleRedo"
              >
                <AppIcon name="redo" size="small" weight="medium" />
              </button>
              <!-- 思考预算已迁入导航栏灵动岛展开区（五档点选） -->
              <button
                v-if="hasConversation"
                class="icon-btn"
                :class="{ 'icon-btn--active': rightPanelOpen && rightPanelTab === 'tree' }"
                title="对话树"
                @click="toggleTreePanel"
              >
                <AppIcon name="git-branch" size="small" weight="medium" />
              </button>
              <button
                v-if="docData"
                class="icon-btn"
                title="文档工具"
                @click="drawerOpen = true"
              >
                <AppIcon name="sidebar" size="small" weight="medium" />
              </button>
              <button
                v-if="modifiedBlob"
                class="icon-btn"
                title="下载文档"
                @click="downloadModified"
              >
                <AppIcon name="download" size="small" weight="medium" />
              </button>
            </div>
            <button
              v-if="aiLoading"
              class="composer-stop"
              title="停止生成"
              @click="stopGeneration"
            >
              <AppIcon name="stop" size="small" weight="semibold" />
              <span>停止</span>
            </button>
            <button
              v-else
              class="composer-send"
              :disabled="!canSend"
              @click="send"
            >
              <AppIcon name="arrow-right" size="small" weight="semibold" />
              <span>发送</span>
            </button>
          </div>
        </div>
        <input
          ref="heroFileInput"
          type="file"
          accept=".docx"
          hidden
          @change="onFileChange"
        />

        <!-- 建议提示 -->
        <div class="suggestions">
          <button
            v-for="s in suggestions"
            :key="s.text"
            class="suggestion-chip"
            @click="onSuggestion(s)"
          >
            {{ s.text }}
          </button>
        </div>
      </section>

      <!-- 初始加载（文档解析中） -->
      <section v-else-if="isLoading && !hasConversation" class="loading-state">
        <div class="loading-card">
          <ProgressRing :progress="0.6" size="large" indeterminate />
          <p class="loading-text">{{ loadingMessage }}</p>
        </div>
      </section>

      <!-- 对话状态：消息流 + 底部对话框 -->
      <section v-else class="conversation">
        <div ref="threadRef" class="thread">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="message"
            :class="msg.role"
          >
            <div v-if="msg.role === 'assistant'" class="message-avatar">B</div>
            <div class="message-body">
              <div v-if="msg.progress === undefined && msg.content" class="message-meta">
                <span class="meta-name">{{ msg.role === 'user' ? '你' : 'BOH Agent' }}</span>
                <span class="meta-time">{{ msg.time }}</span>
              </div>
              <div v-if="msg.progress === undefined && msg.content" class="message-content">{{ msg.content }}</div>
              <div v-if="msg.file" class="message-attachment">
                <AppIcon name="doc" size="small" weight="medium" />
                <span>{{ msg.file }}</span>
              </div>
              <div v-if="msg.operations?.length" class="message-ops">
                已应用 {{ msg.operations.length }} 项修改
                <button class="ops-view" @click="drawerOpen = true">查看</button>
              </div>
              <!-- 进度卡片 -->
              <div v-if="msg.progress !== undefined" class="progress-card">
                <div class="progress-card-head">
                  <div class="progress-icon">
                    <ProgressRing :progress="msg.progress / 100" size="medium" />
                  </div>
                  <div class="progress-info">
                    <div class="progress-title">BOH Agent</div>
                    <div class="progress-text">{{ msg.progressText || '正在处理...' }}</div>
                  </div>
                </div>
                <div class="progress-bar-container">
                  <div class="progress-bar" :style="{ width: `${msg.progress}%` }"></div>
                </div>
                <div class="progress-percent">{{ msg.progress }}%</div>
              </div>
              <!-- PPT 结果卡片 -->
              <div v-if="msg.ppt" class="ppt-result-card">
                <div class="ppt-result-head">
                  <div>
                    <div class="ppt-result-title">{{ msg.ppt.title }}</div>
                    <div class="ppt-result-meta">{{ msg.ppt.slides.length }} 张幻灯片</div>
                  </div>
                  <button class="ppt-download-btn" @click="downloadPPT(msg.ppt)">
                    <AppIcon name="download" size="small" weight="medium" />
                    下载 PPT
                  </button>
                </div>
                <div class="ppt-slide-previews">
                  <div
                    v-for="(slide, si) in msg.ppt.slides"
                    :key="msg.id + '-s' + si"
                    class="ppt-slide-mini"
                    :class="`slide-${slide.type}`"
                  >
                    <div class="slide-mini-num">{{ si + 1 }}</div>
                    <div class="slide-mini-title">{{ slide.title }}</div>
                    <div v-if="slide.points" class="slide-mini-points">
                      {{ slide.points.length }} 个要点
                    </div>
                    <div v-else-if="slide.leftColumn" class="slide-mini-points">
                      对比页
                    </div>
                    <div v-else-if="slide.chartType" class="slide-mini-points">
                      图表
                    </div>
                    <div v-else-if="slide.headers" class="slide-mini-points">
                      表格
                    </div>
                    <div v-else-if="slide.events" class="slide-mini-points">
                      时间线
                    </div>
                  </div>
                </div>
              </div>
              <!-- Word 结果卡片 -->
              <div v-if="msg.word" class="ppt-result-card">
                <div class="ppt-result-head">
                  <div>
                    <div class="ppt-result-title">{{ msg.word.title }}</div>
                    <div class="ppt-result-meta">{{ (msg.word.blocks || []).length }} 个内容块</div>
                  </div>
                  <button class="ppt-download-btn" @click="downloadWord(msg.word)">
                    <AppIcon name="download" size="small" weight="medium" />
                    下载 Word
                  </button>
                </div>
                <div class="word-block-previews">
                  <div
                    v-for="(block, bi) in (msg.word.blocks || []).slice(0, 12)"
                    :key="msg.id + '-b' + bi"
                    class="word-block-mini"
                    :class="`block-${block.type}`"
                  >
                    <span class="block-type-tag">{{ blockTypeLabel(block.type) }}</span>
                    <span class="block-text">{{ blockPreview(block) }}</span>
                  </div>
                </div>
              </div>
              <!-- Code 结果卡片 -->
              <div v-if="msg.code" class="code-result-card">
                <div class="code-result-head">
                  <div class="code-result-title">{{ msg.code.title || 'AI 生成网页' }}</div>
                  <div class="code-result-meta">{{ getCodeFileCount(msg.code) }} 个文件</div>
                </div>
                <div class="code-preview-wrap">
                  <CodePreview :code-data="msg.code" />
                </div>
              </div>
              <!-- 大纲预览卡片（只读，不再要求确认） -->
              <div v-if="msg.outline" class="outline-card">
                <div class="outline-card-head">
                  <div class="outline-card-title">{{ msg.outline.title }}</div>
                  <div class="outline-card-meta">
                    {{ msg.outline.outline.length }} 个章节
                    <span v-if="msg.outlineFlow" class="outline-card-tag">{{ msg.outlineFlow === 'ppt' ? 'PPT' : msg.outlineFlow === 'code' ? '网页' : 'Word' }}</span>
                  </div>
                </div>
                <div class="outline-items">
                  <div
                    v-for="(item, oi) in msg.outline.outline"
                    :key="msg.id + '-o' + oi"
                    class="outline-item"
                    :class="`outline-type-${item.type}`"
                  >
                    <div class="outline-item-num">{{ oi + 1 }}</div>
                    <div class="outline-item-body">
                      <div class="outline-item-title">{{ item.title }}</div>
                      <div v-if="item.summary" class="outline-item-summary">{{ item.summary }}</div>
                    </div>
                    <div class="outline-item-type-tag">{{ outlineTypeLabel(item.type) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- AI 思考中（仅当没有进度卡片且尚未收到任何流式内容时显示） -->
          <div v-if="aiLoading && progressMsgIndex < 0 && streamingTokens === 0" class="message assistant">
            <div class="message-avatar">B</div>
            <div class="message-body">
              <div class="message-meta">
                <span class="meta-name">BOH Agent</span>
                <span class="meta-time">思考中</span>
              </div>
              <div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
            </div>
          </div>
        </div>

        <!-- 底部对话框 -->
        <div class="composer composer-bottom">
          <textarea
            ref="bottomTextareaRef"
            v-model="text"
            class="composer-input"
            :placeholder="composerPlaceholder"
            rows="2"
            :disabled="aiLoading"
            @keydown.enter.exact.prevent="onComposerEnter"
            @input="autoGrow"
          />
          <div v-if="pendingFile" class="composer-chips">
            <span v-if="pendingFile" class="attach-chip">
              <AppIcon name="doc" size="small" weight="medium" />
              <span class="chip-text">{{ truncate(pendingFile.name, 24) }}</span>
              <button class="chip-remove" title="移除" @click="clearFile">
                <AppIcon name="close" size="small" />
              </button>
            </span>
          </div>
          <div class="composer-footer">
            <div class="composer-left">
              <!-- + 直达上传（原 + 菜单与样式集弹窗已迁入导航栏灵动岛展开区） -->
              <button class="plus-btn" title="上传 Word 文档" @click="chooseDoc">
                <AppIcon name="plus" size="small" weight="medium" />
              </button>
              <!-- 思考预算列表框：本次生成的临时参数，五档带说明点选（与灵动岛·思考共享状态） -->
              <div class="composer-pill-wrap">
                <button
                  class="composer-pill"
                  :class="{ active: thinkingMenuOpen }"
                  title="思考预算：推理深度档位"
                  @click.stop="thinkingMenuOpen = !thinkingMenuOpen; presetMenuOpen = false"
                >
                  <AppIcon name="tuning" size="small" weight="medium" />
                  <span>思考 · {{ thinkingLevelLabel }}</span>
                </button>
                <Transition name="popover">
                  <div v-if="thinkingMenuOpen" class="pill-menu" role="listbox" aria-label="思考预算档位" @click.stop>
                    <button
                      v-for="lv in THINKING_LEVELS_UI"
                      :key="lv.label"
                      type="button"
                      class="pill-menu-item"
                      :class="{ active: thinkingLevelLabel === lv.label }"
                      role="option"
                      :aria-selected="thinkingLevelLabel === lv.label"
                      @click="setThinkingLevel(lv.value)"
                    >
                      <span class="pill-menu-label">{{ lv.label }}</span>
                      <span class="pill-menu-hint">{{ lv.hint }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <!-- 样式集列表框：8 套点选，与灵动岛·样式共享状态 -->
              <div class="composer-pill-wrap">
                <button
                  class="composer-pill"
                  :class="{ active: presetMenuOpen }"
                  :title="`样式集：${currentPresetName}`"
                  @click.stop="presetMenuOpen = !presetMenuOpen; thinkingMenuOpen = false"
                >
                  <AppIcon name="paintbrush" size="small" weight="medium" />
                  <span>{{ currentPresetName }}</span>
                </button>
                <Transition name="popover">
                  <div v-if="presetMenuOpen" class="pill-menu pill-menu--grid" role="listbox" aria-label="选择样式集" @click.stop>
                    <button
                      v-for="p in STYLE_PRESETS"
                      :key="p.id"
                      type="button"
                      class="pill-menu-item"
                      :class="{ active: selectedPresetId === p.id }"
                      role="option"
                      :aria-selected="selectedPresetId === p.id"
                      :title="p.description || p.name"
                      @click="choosePreset(p.id)"
                    >
                      <span class="pill-menu-label">{{ p.name }}</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <!-- 工具组（原顶栏迁入）：压缩/撤销/重做/思考预算/对话树/文档工具/下载，条件类按钮自动隐藏 -->
              <button
                v-if="hasConversation && needsCompression(messages)"
                class="icon-btn"
                :class="{ 'icon-btn--warn': contextCompressing }"
                title="压缩上下文释放 Token"
                :disabled="contextCompressing"
                @click="handleCompressContext"
              >
                <AppIcon name="text" size="small" weight="medium" />
                <span v-if="contextCompressing" class="icon-btn-badge">...</span>
              </button>
              <button
                v-if="canUndo"
                class="icon-btn"
                title="撤销"
                @click="handleUndo"
              >
                <AppIcon name="undo" size="small" weight="medium" />
              </button>
              <button
                v-if="canRedo"
                class="icon-btn"
                title="重做"
                @click="handleRedo"
              >
                <AppIcon name="redo" size="small" weight="medium" />
              </button>
              <!-- 思考预算已迁入导航栏灵动岛展开区（五档点选） -->
              <button
                v-if="hasConversation"
                class="icon-btn"
                :class="{ 'icon-btn--active': rightPanelOpen && rightPanelTab === 'tree' }"
                title="对话树"
                @click="toggleTreePanel"
              >
                <AppIcon name="git-branch" size="small" weight="medium" />
              </button>
              <button
                v-if="docData"
                class="icon-btn"
                title="文档工具"
                @click="drawerOpen = true"
              >
                <AppIcon name="sidebar" size="small" weight="medium" />
              </button>
              <button
                v-if="modifiedBlob"
                class="icon-btn"
                title="下载文档"
                @click="downloadModified"
              >
                <AppIcon name="download" size="small" weight="medium" />
              </button>
            </div>
            <button
              v-if="aiLoading"
              class="composer-stop"
              title="停止生成"
              @click="stopGeneration"
            >
              <AppIcon name="stop" size="small" weight="semibold" />
              <span>停止</span>
            </button>
            <button
              v-else
              class="composer-send"
              :disabled="!canSend"
              @click="send"
            >
              <AppIcon name="arrow-right" size="small" weight="semibold" />
              <span>发送</span>
            </button>
          </div>
        </div>
        <input
          ref="bottomFileInput"
          type="file"
          accept=".docx"
          hidden
          @change="onFileChange"
        />
      </section>
    </div><!-- .lab-main -->

    <!-- 右侧面板 -->
    <aside class="lab-right-panel" :class="{ collapsed: !rightPanelOpen }">
      <div class="right-panel-tabs">
        <button
          v-for="tab in rightPanelTabs"
          :key="tab.id"
          class="right-panel-tab"
          :class="{ active: rightPanelTab === tab.id }"
          @click="rightPanelTab = tab.id"
        >
          <AppIcon :name="tab.icon" size="small" weight="medium" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
      <button class="right-panel-close-btn" @click="rightPanelOpen = false">
        <AppIcon name="chevron-right" size="small" weight="medium" />
      </button>
      <div class="right-panel-body">
        <!-- 任务列表 Tab -->
        <div v-if="rightPanelTab === 'tasks'" class="right-panel-content">
          <div
            v-for="(task, idx) in taskList"
            :key="task.id"
            class="task-item"
            :class="`task-${task.status}`"
          >
            <div class="task-icon">
              <template v-if="task.status === 'done'">
                <AppIcon name="check" size="small" weight="bold" />
              </template>
              <template v-else-if="task.status === 'error'">
                <AppIcon name="warning" size="small" weight="medium" />
              </template>
              <template v-else-if="task.status === 'doing'">
                <div class="task-spinner"></div>
              </template>
              <template v-else>
                <span class="task-num">{{ idx + 1 }}</span>
              </template>
            </div>
            <div class="task-content">
              <div class="task-title">{{ task.title }}</div>
              <div v-if="task.desc" class="task-desc">{{ task.desc }}</div>
            </div>
          </div>
          <div v-if="!taskList.length" class="right-panel-empty">暂无任务</div>
        </div>
        <!-- 对话树 Tab -->
        <div v-if="rightPanelTab === 'tree'" class="right-panel-content">
          <div v-if="branches.length" class="tree-view">
            <div v-for="branch in branches" :key="branch.map(n => n.id).join('-')" class="tree-branch">
              <div class="tree-branch-path">
                <div
                  v-for="node in branch"
                  :key="node.id"
                  class="tree-node"
                  :class="{ 'tree-node--active': node.id === activeTreeNodeId }"
                  @click="switchBranch(node.id)"
                >
                  <div class="tree-node-dot"></div>
                  <div class="tree-node-info">
                    <div class="tree-node-label">{{ node.branchLabel || '消息' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="right-panel-empty">暂无分支</div>
        </div>
        <!-- 代码预览 Tab -->
        <div v-if="rightPanelTab === 'code'" class="right-panel-content">
          <div v-if="lastCodeData" class="code-preview-panel">
            <div class="code-panel-info">
              <div class="code-panel-info-row">
                <span>文件</span>
                <strong>{{ getCodeFileCount(lastCodeData) }} 个</strong>
              </div>
              <div class="code-panel-info-row">
                <span>大小</span>
                <strong>{{ lastCodeData.html?.length ? (lastCodeData.html.length / 1024).toFixed(1) + ' KB' : '-' }}</strong>
              </div>
            </div>
            <div class="code-panel-preview">
              <CodePreview :code-data="lastCodeData" />
            </div>
            <button class="code-panel-download-btn" @click="downloadCodeFromPanel">
              <AppIcon name="download" size="small" weight="semibold" />
              下载 ZIP
            </button>
          </div>
          <div v-else class="right-panel-empty">暂无代码预览</div>
        </div>
        <!-- 文档大纲 Tab -->
        <div v-if="rightPanelTab === 'outline'" class="right-panel-content">
          <div v-if="docOutlineItems.length" class="outline-tree">
            <div
              v-for="(item, oi) in docOutlineItems"
              :key="'outline-' + oi"
              class="outline-tree-item"
            >
              <span class="outline-tree-type">{{ outlineTypeLabel(item.type) }}</span>
              <span class="outline-tree-text">{{ item.title || item.text || '' }}</span>
            </div>
          </div>
          <div v-else class="right-panel-empty">暂无文档大纲</div>
        </div>
      </div>
    </aside>

  </div><!-- .lab-body -->

    <!-- 错误提示 -->
    <Transition name="toast">
      <div v-if="error" class="error-toast">
        <AppIcon name="warning" size="small" weight="medium" />
        <span class="error-text">{{ error }}</span>
        <button class="error-close" @click="error = ''">
          <AppIcon name="close" size="small" />
        </button>
      </div>
    </Transition>

    <!-- 文档工具抽屉 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="drawerOpen"
          class="drawer-mask"
          @click="drawerOpen = false"
        />
      </Transition>
      <Transition name="drawer">
        <aside v-if="drawerOpen && docData" class="drawer">
          <div class="drawer-header">
            <h3 class="drawer-title">文档工具</h3>
            <button class="drawer-close" @click="drawerOpen = false">
              <AppIcon name="close" size="small" />
            </button>
          </div>
          <div class="drawer-body">
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.preview }"
                @click="drawerSection.preview = !drawerSection.preview"
              >
                <AppIcon name="doc" size="small" weight="medium" />
                <span>文档预览</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.preview" class="drawer-section-body">
                <DocPreview
                  :html="previewHtml"
                  :loading="previewLoading"
                  @context-action="onContextAction"
                />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.styles }"
                @click="drawerSection.styles = !drawerSection.styles"
              >
                <AppIcon name="paintbrush" size="small" weight="medium" />
                <span>样式清单</span>
                <span class="drawer-count">{{ docData.styles.styles.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.styles" class="drawer-section-body">
                <StyleInspector :styles="docData.styles.styles" />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.templates }"
                @click="drawerSection.templates = !drawerSection.templates"
              >
                <AppIcon name="sidebar" size="small" weight="medium" />
                <span>模板管理</span>
                <span class="drawer-count">{{ templates.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.templates" class="drawer-section-body">
                <TemplatePanel
                  :templates="templates"
                  :active-id="activeTemplateId"
                  :can-save="true"
                  @select="handleTemplateSelect"
                  @save="saveCurrentAsTemplate"
                  @update="refreshTemplates"
                />
              </div>
            </div>
            <div class="drawer-section">
              <button
                class="drawer-section-head"
                :class="{ open: drawerSection.history }"
                @click="drawerSection.history = !drawerSection.history"
              >
                <AppIcon name="clock" size="small" weight="medium" />
                <span>操作历史</span>
                <span class="drawer-count">{{ historyItems.length }}</span>
                <AppIcon
                  name="chevron-down"
                  size="small"
                  class="drawer-chevron"
                />
              </button>
              <div v-show="drawerSection.history" class="drawer-section-body">
                <HistoryTimeline :items="historyItems" @restore="onHistoryRestore" />
              </div>
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>

    <!-- 样式集选择模态框已删除：样式集选择迁入导航栏灵动岛展开区 -->

    <!-- 命令面板 (Cmd+K) -->
    <CommandPalette
      :commands="commandGroups"
      @execute="executeCommand"
      @close="closeCommandPalette"
    />

    <!-- Guardrail 确认对话框 -->
    <GuardrailDialog ref="guardrailRef" />

    <!-- 通知 -->
    <NotificationToast ref="toastRef" />
  </main>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import DOMPurify from '@/utils/dompurify.js'
import AppIcon from './components/AppIcon.vue'
import ProgressRing from './components/ProgressRing.vue'
import NotificationToast from './components/NotificationToast.vue'
import DocPreview from './components/DocPreview.vue'
import StyleInspector from './components/StyleInspector.vue'
import TemplatePanel from './components/TemplatePanel.vue'
import HistoryTimeline from './components/HistoryTimeline.vue'

import CodePreview from './components/CodePreview.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import DiffViewer from './components/DiffViewer.vue'
import CommandPalette from './components/CommandPalette.vue'
import GuardrailDialog from './components/GuardrailDialog.vue'
import ThinkingBudgetSlider from './components/ThinkingBudgetSlider.vue'
import { getAllTemplates, saveTemplate } from './engine/template-store.js'
import { useDocumentAI } from './composables/useDocumentAI.js'
import { usePPTGenerator } from './composables/usePPTGenerator.js'
import { useWordGenerator } from './composables/useWordGenerator.js'
import { useCodeGenerator } from './composables/useCodeGenerator.js'
import { useContextManager } from './composables/useContextManager.js'
import { useUndoManager } from './composables/useUndoManager.js'
import { useConversationTree } from './composables/useConversationTree.js'
import { withRetry } from './utils/withRetry.js'
import { callVaultSiliconChatStream } from '@/utils/api/api-key-runtime-api.js'
import { listActiveBohaiModelConfigs, buildBohaiRuntimeModels } from '@/utils/api/bohai-model-config-api.js'
const CHAT_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'
import { useLabQuota } from '@/composables/useLabQuota.js'
import { BASE_SYSTEM_PROMPT } from '@/prompts/index.js'
import { STYLE_PRESETS, DEFAULT_PRESET_ID, getPresetById } from './config/design-tokens.js'
import { showIsland } from '@/composables/useIsland.js'
import LabQuotaIsland from './components/LabQuotaIsland.vue'

const router = useRouter()
const { chat, aiLoading } = useDocumentAI()
const { generateSlidesPageByPage, generateOutline: generatePPTOutline, buildPPT, buildPPTFile } = usePPTGenerator()
const { generateDoc: generateWordDoc, generateOutline: generateWordOutline, buildWordFile } = useWordGenerator()

const loadDocParser = () => import('./engine/docx-parser.js')
const loadDocStyleEngine = () => import('./engine/style-engine.js')
const loadDocBuilder = () => import('./engine/docx-builder.js')
const {
  generateOutline: generateCodeOutline,
  generateCode,
  codeData,
  downloadCode,
} = useCodeGenerator()

const {
  estimateTokens,
  trimMessages,
  needsCompression,
  generateSummary,
  buildCompressedContext,
} = useContextManager()

const {
  canUndo,
  canRedo,
  takeSnapshot,
  undo,
  redo,
  getStatus: getUndoStatus,
} = useUndoManager()

const treeState = useConversationTree()
const treeNodes = treeState.nodes
const activeTreeNodeId = treeState.activeNodeId
const currentBranch = treeState.currentBranch
const branches = treeState.branches
const treeCreateRoot = treeState.createRoot
const treeAddNode = treeState.addNode
const treeFork = treeState.fork
const treeNavigateTo = treeState.navigateTo
const treeGetMessages = treeState.getMessages

// ===== 实验室使用限额（配额展示由导航栏灵动岛 LabQuotaIsland 承接） =====
const {
  remainingCount,
  isExceeded,
  isUnlimited,
  initialize: initializeQuota,
  recordUsage,
  preConsumeQuota,
  refundQuota,
  getQuotaHint,
  getUpgradeHint,
  effectiveTier,
  quotaDisplayData
} = useLabQuota()

// ===== 顶层状态 =====
// 会话侧栏可收起：默认收起给对话留宽度，折叠状态持久化（boh_lab_sidebar_collapsed）
const SIDEBAR_COLLAPSED_KEY = 'boh_lab_sidebar_collapsed'
const readSidebarCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return true
  }
}
const sidebarCollapsed = ref(readSidebarCollapsed())
watch(sidebarCollapsed, (val) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, val ? '1' : '0')
  } catch { /* ignore */
  }
})
const rightPanelOpen = ref(false)
const rightPanelTab = ref('tasks')
const rightPanelTabs = [
  { id: 'tasks', icon: 'check-circle', label: '任务' },
  { id: 'tree', icon: 'git-branch', label: '分支' },
  { id: 'code', icon: 'code', label: '代码' },
  { id: 'outline', icon: 'text', label: '大纲' }
]
const sessions = ref([])
const currentSessionIndex = ref(0)
const thinkingBudgetValue = ref(0.55) // 0-1，五档映射见岛卡（默认对齐「中」档位值，pill 循环切档体验顺滑）
const labModelConfig = reactive({
  temperature: 0.5,
  maxTokens: 4096
})
const text = ref('')
const messages = ref([])
let _idSeq = 0
const genId = () => ++_idSeq
const pendingFile = ref(null)
const isLoading = ref(false)
const loadingMessage = ref('正在解析文档...')
const error = ref('')
const toastRef = ref(null)
const threadRef = ref(null)

// ===== 灵动岛封装：优先走全局顶部状态卡，失败回退本地 NotificationToast =====
const showLabIsland = (payload = {}) => {
  try {
    return showIsland.notify(payload)
  } catch {
    return false
  }
}
const notifyLab = (title, message = '', type = 'info') => {
  const iconMap = { success: 'success', error: 'warning', warning: 'warning', info: 'ai' }
  const icon = iconMap[type] || 'ai'
  const durationMs = type === 'error' || type === 'warning' ? 3600 : 3200
  const ok = showLabIsland({ title, message, icon, durationMs })
  if (ok) return true
  const t = toastRef.value
  if (!t) return false
  if (type === 'success' && t.success) t.success(title, message)
  else if (type === 'error' && t.error) t.error(title, message)
  else if (type === 'warning' && t.warning) t.warning(title, message)
  else if (t.info) t.info(title, message)
  else if (t.success) t.success(title, message)
  return false
}
const heroTextareaRef = ref(null)
const bottomTextareaRef = ref(null)
const heroFileInput = ref(null)
const bottomFileInput = ref(null)

// ===== 灵动岛：配额 + 生成状态常驻岛（导航栏 custom 槽位，同 PityIslandCard 管线） =====
// 页面 useLabQuota 是单一真相源，岛卡纯展示；顶栏配额徽章与底部状态栏横条已移除，由本岛承接。
let quotaIslandHandle = null
const genStatus = reactive({ running: false, label: '', stage: '', progress: null })

const syncQuotaIsland = () => {
  if (!quotaIslandHandle) return
  quotaIslandHandle.update({
    quota: quotaDisplayData.value,
    gen: { ...genStatus },
    models: islandModels(),
    presets: islandPresets(),
    thinking: thinkingBudgetValue.value,
  })
}

const mountQuotaIsland = () => {
  if (quotaIslandHandle) return
  quotaIslandHandle = showIsland.custom(LabQuotaIsland, {
    quota: quotaDisplayData.value,
    gen: { ...genStatus },
    models: islandModels(),
    presets: islandPresets(),
    thinking: thinkingBudgetValue.value,
    loading: false,
    goSubscription: handleUpgradeFromBadge,
    onSelectModel: handleSelectModel,
    onSelectPreset: handleSelectPreset,
    onSetThinking: handleSetThinking,
  })
}

// ===== 对话模型选择（BOHAI 模式，经 vault 按 mode 路由；任务生成模型仍走 lab_ai_model_configs） =====
const LAB_MODE_SETTING_KEY = 'boh_lab_chat_mode'
const TIER_RANK = { anonymous: 0, guest: 0, free: 0, plus: 1, pro: 2, max: 3, ultra: 4 }
const MIN_TIER_LABEL = { plus: 'Plus', pro: 'Pro', max: 'Max', ultra: 'Ultra' }
let bohaiRuntime = { availableModels: [], generationProfiles: {} }
const bohaiChatModes = ref([])
const bohaiModelsLoading = ref(false)
const selectedBohaiModeId = ref('')

const islandModels = () => ({
  list: [
    { id: '', name: '默认模型', tagline: 'Qwen 直连', tierTag: '', locked: false, mult: 0 },
    ...bohaiChatModes.value.map((m) => {
      const need = TIER_RANK[m.minTier] ?? 0
      const own = TIER_RANK[effectiveTier.value] ?? 0
      return {
        id: m.id,
        name: m.name,
        tagline: m.tagline || '',
        tierTag: need > 0 ? (MIN_TIER_LABEL[m.minTier] || m.minTier) : '',
        locked: need > own,
        mult: Number(m.quotaMultiplier) > 1 ? Number(m.quotaMultiplier) : 0,
      }
    }),
  ],
  selectedId: selectedBohaiModeId.value,
  loading: bohaiModelsLoading.value,
})

// 样式集（原选择弹窗迁移到岛卡展开区）
const islandPresets = () => ({
  list: STYLE_PRESETS.map((p) => ({ id: p.id, name: p.name })),
  selectedId: selectedPresetId.value,
})

function handleSelectPreset(presetId) {
  selectedPresetId.value = String(presetId || DEFAULT_PRESET_ID)
  syncQuotaIsland()
}

// 思考预算档位写入（岛卡五档点选回调；输入框列表框复用）
function handleSetThinking(value) {
  const v = Number(value)
  if (Number.isFinite(v)) thinkingBudgetValue.value = Math.max(0, Math.min(1, v))
  syncQuotaIsland()
}

// ===== 输入框参数列表框：思考预算（五档带说明）/ 样式集（8 套），与灵动岛共享状态 =====
const THINKING_LEVELS_UI = [
  { label: '低', value: 0.1, hint: '直接输出 · 最快最省' },
  { label: '偏低', value: 0.35, hint: '简要思考 · 日常任务' },
  { label: '中', value: 0.55, hint: '适度推理 · 均衡推荐' },
  { label: '偏高', value: 0.75, hint: '多步推理 · 复杂结构' },
  { label: '高', value: 0.95, hint: '深度推理 · 高难内容' },
]
const thinkingLevelLabel = computed(() => {
  const v = thinkingBudgetValue.value
  if (v < 0.25) return '低'
  if (v < 0.45) return '偏低'
  if (v < 0.65) return '中'
  if (v < 0.85) return '偏高'
  return '高'
})

const thinkingMenuOpen = ref(false)
const presetMenuOpen = ref(false)

function setThinkingLevel(value) {
  handleSetThinking(value)
  thinkingMenuOpen.value = false
}

function choosePreset(id) {
  selectedPresetId.value = String(id || DEFAULT_PRESET_ID)
  presetMenuOpen.value = false
  syncQuotaIsland()
}

function closePillMenus() {
  thinkingMenuOpen.value = false
  presetMenuOpen.value = false
}

// 点击列表框外关闭（两处 composer 的 pill 菜单共用）
function onDocClick(e) {
  if (!e.target.closest('.composer-pill-wrap')) closePillMenus()
}

async function loadBohaiChatModes() {
  if (bohaiModelsLoading.value || bohaiChatModes.value.length) return
  bohaiModelsLoading.value = true
  try {
    const result = await listActiveBohaiModelConfigs()
    const runtime = buildBohaiRuntimeModels(result?.data || [])
    bohaiRuntime = {
      availableModels: runtime.availableModels || [],
      generationProfiles: runtime.generationProfiles || {},
    }
    bohaiChatModes.value = runtime.chatModes || []
    // 恢复持久化选择；失效（模式下架）则回退默认直连
    let saved = ''
    try {
      saved = localStorage.getItem(LAB_MODE_SETTING_KEY) || ''
    } catch { /* ignore */ }
    selectedBohaiModeId.value = saved && bohaiChatModes.value.some((m) => m.id === saved) ? saved : ''
  } catch {
    bohaiChatModes.value = []
  } finally {
    bohaiModelsLoading.value = false
  }
}

function handleSelectModel(modeId) {
  selectedBohaiModeId.value = String(modeId || '')
  try {
    localStorage.setItem(LAB_MODE_SETTING_KEY, selectedBohaiModeId.value)
  } catch { /* ignore */ }
  syncQuotaIsland()
}

/** 解析当前选中的 BOHAI 模式调用参数；未选/失效返回 null（走默认直连） */
function resolveBohaiChatCall() {
  const modeId = selectedBohaiModeId.value
  if (!modeId) return null
  const mode = bohaiChatModes.value.find((m) => m.id === modeId)
  const runtimeModel = bohaiRuntime.availableModels.find((m) => m.id === mode?.model)
  if (!mode || !runtimeModel) return null
  return {
    provider: runtimeModel.providerKey || 'boh',
    mode: mode.id,
    apiUrl: runtimeModel.url || '',
    modelId: runtimeModel.id,
    profile: bohaiRuntime.generationProfiles?.[mode.id] || null,
  }
}

// ===== 灵动岛：生成任务卡（showIsland.task，进行中→成功/失败） =====
let genTaskHandle = null
// 预扣显性化：preConsumeQuota 在 AI 调用前扣 1 次（防并发刷量的 TOCTOU 设计，失败/取消自动退还），
// 文案明确「已预扣」语义，消除「还没生成就扣了」的困惑
const genTaskQuotaLine = () => {
  if (isUnlimited.value) return '无限生成'
  return isExceeded.value ? '本月配额已用完' : `本次已预扣 1 次（取消自动退还） · 剩余 ${remainingCount.value} 次`
}

/** 开启一张生成任务卡（重复调用先关闭旧卡），并点亮岛卡生成态 */
function beginGenTask(label) {
  closeGenTask()
  genStatus.running = true
  genStatus.label = label
  genStatus.stage = '正在思考…'
  genStatus.progress = null
  try {
    genTaskHandle = showIsland.task({
      title: `正在生成${label}`,
      message: genTaskQuotaLine(),
      onAction: (actionId) => {
        if (actionId === 'dismiss') closeGenTask()
      },
    })
  } catch {
    genTaskHandle = null
  }
}

/** 更新任务卡进度（0-100）与阶段文案；同步点亮常驻岛卡的生成态 */
function updateGenTask(progress, stage) {
  genStatus.progress = progress
  if (stage) genStatus.stage = stage
  try {
    genTaskHandle?.progress?.(progress, `${stage || genStatus.stage || '处理中'} · ${genTaskQuotaLine()}`)
  } catch { /* ignore */ }
}

/** 无百分比流程的阶段推进（普通聊天流式开始、文档排版等） */
function updateGenTaskStage(stage) {
  genStatus.stage = stage
  try {
    genTaskHandle?.update?.({ message: `${stage} · ${genTaskQuotaLine()}` })
  } catch { /* ignore */ }
}

/** 成功：进度环满格，短暂停留后自动收起 */
function succeedGenTask(title, message) {
  genStatus.running = false
  genStatus.stage = ''
  genStatus.progress = null
  try {
    genTaskHandle?.success?.({ title, message: `${message} · ${genTaskQuotaLine()}` })
  } catch { /* ignore */ }
  genTaskHandle = null
}

/** 失败：常驻卡 + 「知道了」按钮；tone: 'danger' | 'warning' */
function failGenTask(title, message, tone = 'danger') {
  genStatus.running = false
  genStatus.stage = ''
  genStatus.progress = null
  try {
    genTaskHandle?.fail?.({
      title,
      message,
      tone,
      actions: [{ id: 'dismiss', label: '知道了', kind: 'ghost' }],
    })
  } catch { /* ignore */ }
  genTaskHandle = null
}

/** 手动收起（用户取消生成 / 页面卸载） */
function closeGenTask() {
  try {
    genTaskHandle?.close?.()
  } catch { /* ignore */ }
  genTaskHandle = null
  genStatus.running = false
  genStatus.stage = ''
  genStatus.progress = null
}

// 流式生成中的 token 实时计数（由 onChunk 更新）
const streamingTokens = ref(0)

// P1-9: rAF 节流的流式 content 更新，将同一帧内的多次 chunk 合并为一次 messages 赋值，
// 减少 Vue deep diff 触发频率（流式时每个 chunk 都会触发 messages 响应式更新）。
// flushStreamContent 在取消/错误/完成时必须显式调用，确保最终 content 落盘。
let _streamContentRafId = null
let _pendingStreamContent = { idx: -1, text: '' }
function _applyStreamContent() {
  _streamContentRafId = null
  const { idx, text } = _pendingStreamContent
  _pendingStreamContent.idx = -1
  if (idx >= 0 && messages.value[idx]) {
    messages.value[idx].content = text
  }
}
function scheduleStreamContent(idx, text) {
  _pendingStreamContent = { idx, text }
  if (_streamContentRafId === null) {
    _streamContentRafId = requestAnimationFrame(_applyStreamContent)
  }
}
function flushStreamContent() {
  if (_streamContentRafId !== null) {
    cancelAnimationFrame(_streamContentRafId)
    _applyStreamContent()
  }
}

// AbortController：用于停止 AI 生成（覆盖所有 sendXxx 流程）
const abortController = ref(null)

// 判断是否为用户主动取消
const isAbortError = (e) => e?.name === 'AbortError' || e?.name === 'TimeoutError'

// 布局 computed
const docOutlineItems = computed(() => {
  if (!docData.value) return []
  return docData.value.styles?.filter(s => s.type === 'heading').slice(0, 50) || []
})
const hasConversation = computed(() => messages.value.length > 0)

const formatSessionDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const switchSession = (idx) => {
  currentSessionIndex.value = idx
}

const getCodeFileCount = (data) => {
  if (!data) return 0
  let count = 0
  if (data.html) count++
  if (data.css) count++
  if (data.js) count++
  return count || 1
}

// 样式集（选择入口已迁入导航栏灵动岛展开区）
const selectedPresetId = ref(DEFAULT_PRESET_ID)

// 文档相关
const docData = ref(null)
const modifiedBlob = ref(null)
const previewHtml = ref('')
const previewLoading = ref(false)
const activeTemplateId = ref(null)
const templates = ref(getAllTemplates())
const historyItems = ref([])

// 生成的结果数据（用于下载/重新渲染）
const lastPPTData = ref(null)
const lastWordData = ref(null)
const lastCodeData = ref(null)
// 面板控制已迁移至 rightPanelOpen

// 进度消息状态（用于显示进度卡片）
const progressMsgIndex = ref(-1) // 进度消息在 messages 数组中的索引

// 上下文压缩
const contextCompressing = ref(false)
const contextCompressed = ref(false)

// 对话树
// 面板控制已迁移至 rightPanelOpen

// 自动/智能模式
const autoMode = ref(false)

// Guardrail 弹窗引用
const guardrailRef = ref(null)

// 命令面板命令列表
const commandGroups = computed(() => [
  {
    label: '对话',
    items: [
      { label: '新对话', description: '重置所有对话', action: 'resetConversation', icon: 'sparkles', shortcut: '⌘N' },
      { label: '压缩上下文', description: '压缩对话历史释放 Token', action: 'compressContext', icon: 'text', shortcut: '' },
      { label: '切换智能模式', description: autoMode.value ? '关闭自动执行' : '开启自动执行', action: 'toggleAutoMode', icon: 'wand', shortcut: '⌘⇧A' },
    ],
  },
  {
    label: '导航',
    items: [
      { label: '对话树', description: '查看对话分支', action: 'toggleTreePanel', icon: 'git-branch', shortcut: '⌘⇧T' },
      { label: '撤销', description: '撤销上一步操作', action: 'undo', icon: 'undo', shortcut: '⌘Z', disabled: !canUndo.value },
      { label: '重做', description: '重做已撤销的操作', action: 'redo', icon: 'redo', shortcut: '⌘⇧Z', disabled: !canRedo.value },
    ],
  },
  {
    label: '文档',
    items: [
      { label: '下载文档', description: '下载当前文档', action: 'downloadModified', icon: 'download' },
      { label: '文档工具', description: '打开文档工具面板', action: 'toggleDrawer', icon: 'sidebar' },
    ],
  },
  {
    label: '生成',
    items: [
      { label: '生成 PPT', description: '直接在对话框输入「生成 PPT」即可', action: 'hintPPT', icon: 'chart-bar' },
      { label: '生成 Word', description: '直接在对话框输入「写一份 Word」即可', action: 'hintWord', icon: 'doc' },
      { label: '生成网页', description: '直接在对话框输入「做一个网页」即可', action: 'hintCode', icon: 'code' },
    ],
  }])

// ===== 任务面板 =====
const taskList = ref([])
const currentTaskFlow = ref(null) // 'ppt' | 'word' | null

/**
 * 初始化任务列表（已移除"确认大纲"步骤，直接生成）
 */
function initTaskFlow(flow, topic) {
  currentTaskFlow.value = flow
  if (flow === 'ppt') {
    taskList.value = [
      { id: 'outline', title: '规划 PPT 大纲', desc: `主题：${topic}`, status: 'doing' },
      { id: 'detail', title: '生成完整 PPT', desc: '生成幻灯片内容', status: 'pending' },
    ]
  } else if (flow === 'word') {
    taskList.value = [
      { id: 'outline', title: '规划文档大纲', desc: `主题：${topic}`, status: 'doing' },
      { id: 'detail', title: '生成完整 Word', desc: '生成文档内容', status: 'pending' },
    ]
  } else if (flow === 'code') {
    taskList.value = [
      { id: 'outline', title: '规划网页架构', desc: `需求：${topic}`, status: 'doing' },
      { id: 'detail', title: '编写网页代码', desc: '生成 HTML/CSS/JS', status: 'pending' },
    ]
  }
  rightPanelOpen.value = true
  rightPanelTab.value = 'tasks'
}

/**
 * 更新任务状态
 */
function updateTask(taskId, status, desc = null) {
  const task = taskList.value.find(t => t.id === taskId)
  if (task) {
    task.status = status
    if (desc !== null) task.desc = desc
  }
}

/**
 * 进入下一个任务
 */
function nextTask(currentId) {
  updateTask(currentId, 'done')
  const idx = taskList.value.findIndex(t => t.id === currentId)
  if (idx >= 0 && idx + 1 < taskList.value.length) {
    updateTask(taskList.value[idx + 1].id, 'doing')
  }
}

/**
 * 关闭任务面板
 */
let closeTaskPanelTimer = null
function closeTaskPanel() {
  rightPanelOpen.value = false
  if (closeTaskPanelTimer) clearTimeout(closeTaskPanelTimer)
  closeTaskPanelTimer = setTimeout(() => {
    currentTaskFlow.value = null
    taskList.value = []
  }, 300)
}

/**
 * 进度回调函数 - 更新消息流中的进度卡片 + 灵动岛任务卡/常驻岛
 */
function handleProgress(stage, progress, text) {
  if (progressMsgIndex.value >= 0 && messages.value[progressMsgIndex.value]) {
    messages.value[progressMsgIndex.value].progress = progress
    messages.value[progressMsgIndex.value].progressText = text
  }
  if (genStatus.running) {
    updateGenTask(progress, text || '')
  }
}

// 抽屉
const drawerOpen = ref(false)
const drawerSection = reactive({
  preview: true,
  styles: false,
  templates: false,
  history: false,
})

// PPT 模板（向后兼容，实际用 selectedPresetId）
const pptTemplateId = ref(DEFAULT_PRESET_ID)

const currentPresetName = computed(() => getPresetById(selectedPresetId.value).name)

const canSend = computed(() => {
  if (aiLoading.value || isLoading.value) return false
  return !!pendingFile.value || !!text.value.trim()
})

const composerPlaceholder = computed(() => {
  if (pendingFile.value) {
    return '告诉 AI 你想怎么改样式，例如「标题黑体加粗、正文宋体、1.5 倍行距」…'
  }
  return '告诉我要做什么，例如「生成项目总结 PPT」、「写一份工作总结 Word」、「做个个人网页」…'
})

const suggestions = computed(() => {
  if (pendingFile.value) {
    return [
      { text: '标题黑体加粗居中', action: 'text' },
      { text: '正文宋体 1.5 倍行距', action: 'text' },
      { text: '首行缩进 2 字符', action: 'text' },
      { text: '正式报告风格', action: 'text' },
    ]
  }
  return [
    { text: '生成项目总结 PPT', action: 'text' },
    { text: '写一份年度工作总结 Word', action: 'text' },
    { text: '做一个个人作品集网页', action: 'text' },
    { text: '上传文档让我排版', action: 'doc' },
  ]
})

// ===== 方法 =====
function closeCommandPalette() {
  // CommandPalette 自身已隐藏，无需额外操作
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str
}

function blockTypeLabel(type) {
  const map = {
    heading: '标题', paragraph: '段落', list: '列表', 'ordered-list': '有序列表',
    quote: '引用', code: '代码', table: '表格', image: '图片', divider: '分隔', toc: '目录',
  }
  return map[type] || type
}

function blockPreview(block) {
  if (block.type === 'heading') return `H${block.level || 1} · ${truncate(block.text || '', 30)}`
  if (block.type === 'paragraph') {
    if (Array.isArray(block.runs)) return truncate(block.runs.map(r => r.text || '').join(''), 40)
    return truncate(block.text || '', 40)
  }
  if (block.type === 'list' || block.type === 'ordered-list') return `${(block.items || []).length} 项`
  if (block.type === 'table') return `${(block.headers || []).length} 列 × ${(block.rows || []).length} 行`
  if (block.type === 'quote') return truncate(block.text || '', 30)
  if (block.type === 'code') return truncate(block.text || block.code || '', 30)
  if (block.type === 'divider') return '—— 分隔线 ——'
  if (block.type === 'image') return '图片'
  if (block.type === 'toc') return '目录域'
  return ''
}

function nowTime() {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function autoGrow(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function chooseDoc() {
  const which = hasConversation.value ? 'bottom' : 'hero'
  nextTick(() => triggerUpload(which))
}

function clearFile() {
  pendingFile.value = null
}

function onSuggestion(s) {
  if (s.action === 'doc') {
    chooseDoc()
  } else {
    send(s.text)
  }
}

function resetConversation() {
  messages.value = []
  text.value = ''
  pendingFile.value = null
  docData.value = null
  modifiedBlob.value = null
  previewHtml.value = ''
  historyItems.value = []
  error.value = ''
  clarifyStage.value = 'none'
  clarifyDetails.value = []
  lastPPTData.value = null
  lastWordData.value = null
  lastCodeData.value = null
  rightPanelOpen.value = false
}

function triggerUpload(which) {
  const ref = which === 'hero' ? heroFileInput : bottomFileInput
  ref.value?.click()
}

function onFileChange(e) {
  const file = e.target?.files?.[0]
  if (file) {
    if (!file.name.endsWith('.docx')) {
      error.value = '仅支持 .docx 格式文档'
      return
    }
    pendingFile.value = file
    error.value = ''
    // 自动触发解析
    handleFileUpload(file)
  }
  // 清空 input 以便重复选择同一文件
  if (heroFileInput.value) heroFileInput.value.value = ''
  if (bottomFileInput.value) bottomFileInput.value.value = ''
}

function addHistory(label, detail, type = 'style') {
  const now = new Date()
  historyItems.value.push({
    label,
    detail,
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
    type,
  })
}

async function updatePreview(blob) {
  previewLoading.value = true
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
    previewHtml.value = DOMPurify.sanitize(result.value)
  } catch (e) {
    previewHtml.value = `<p style="color:#d64545">预览渲染失败：${e.message}</p>`
  } finally {
    previewLoading.value = false
  }
}

async function rebuildAndPreview() {
  if (!docData.value) return
  const { buildModifiedDocx } = await loadDocBuilder()
  const blob = await buildModifiedDocx(
    docData.value.zip,
    docData.value.stylesDoc,
    docData.value.documentDoc
  )
  modifiedBlob.value = blob
  await updatePreview(blob)
}

async function handleFileUpload(file) {
  if (!file) return
  isLoading.value = true
  loadingMessage.value = '正在解析文档...'
  error.value = ''
  modifiedBlob.value = null
  try {
    const { parseDocx } = await loadDocParser()
    docData.value = await parseDocx(file)
    await rebuildAndPreview()
    addHistory('文档上传', `解析 ${docData.value.content.length} 段内容`, 'content')
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已读取「${docData.value.fileName}」，共 ${docData.value.content.length} 段、${docData.value.styles.styles.length} 种样式。想怎么调整？`,
      time: nowTime(),
      file: docData.value.fileName,
    })
    notifyLab('文档解析成功', `${docData.value.content.length} 段 · ${docData.value.styles.styles.length} 样式`, 'success')
  } catch (e) {
    error.value = `解析失败：${e.message}`
    docData.value = null
    pendingFile.value = null
    notifyLab('解析失败', e.message, 'error')
  } finally {
    isLoading.value = false
  }
}

/**
 * 意图识别：根据用户消息判断应走哪种生成流程
 * 返回 'doc' | 'ppt' | 'word' | 'code' | 'chat'
 */
function detectIntent(message) {
  const t = (message || '').toLowerCase()
  if (!t) return 'chat'
  // 文档排版：上传文件或明确提到"排版/样式/字体/行距"
  if (pendingFile.value || /排版|样式|字体|行距|缩进|加粗|居中|段落格式/.test(t)) return 'doc'
  // PPT 生成
  if (/ppt|幻灯片|演示|slides?|pitch\s*deck/.test(t) || /生成.*ppt|做.*ppt|ppt.*生成/.test(t)) return 'ppt'
  // Word 生成
  if (/word|文档|总结|报告|纪要|方案|说明书/.test(t) && /生成|写|做|起草|产出/.test(t)) return 'word'
  // 网页生成
  if (/网页|网站|落地页|官网|html|web\s*page|个人主页|作品集.*网页|网页.*作品集/.test(t)) return 'code'
  return 'chat'
}

// ===== 生成前澄清 + 确认状态机：任务型意图（PPT/Word/网页）三段推进 =====
// asked：命中意图 → AI 主动问关键细节（不预扣不生成）
// confirm：用户补充后 → AI 汇总「已记录的要求」并主动询问是否可以开始
// 用户回「开始生成」等确认词才真正预扣+生成；补充/修改会更新记录并再次确认（牢记提示词要求）
const CLARIFY_PROMPTS = {
  ppt: '好的，开始生成前先对齐几个细节，直接回复即可：\n1. 主题与受众（给谁看、讲什么）\n2. 大致页数（不说默认 10 页左右）\n3. 想重点强调的内容或数据\n回复后我会汇总确认，确认后才会开始生成（会消耗 1 次配额）。',
  word: '好的，写文档前先对齐几点，直接回复即可：\n1. 文档类型与读者（方案/总结/说明，给谁看）\n2. 大致篇幅\n3. 必须覆盖的要点或结论\n回复后我会汇总确认，确认后才会开始生成（会消耗 1 次配额）。',
  code: '好的，生成网页前先对齐几点，直接回复即可：\n1. 页面用途与风格倾向\n2. 单页还是多区块（首页/落地页/后台…）\n3. 有无参考网站或必须包含的模块\n回复后我会汇总确认，确认后才会开始生成（会消耗 1 次配额）。',
}
const clarifyStage = ref('none') // none | asked | confirm
const clarifyFlow = ref('') // 待生成任务流（ppt/word/code）
const clarifyIntentText = ref('') // 首轮意图原文
const clarifyDetails = ref([]) // 用户补充的要求（牢记，生成时全部带入）

function buildClarifySummary() {
  const lines = [clarifyIntentText.value, ...clarifyDetails.value].map((t, i) => `${i + 1}. ${t}`)
  return `已记录你的要求：\n${lines.join('\n')}\n\n确认无误请回复「开始生成」，我会按以上要求生成（消耗 1 次配额）；要补充或修改直接说。`
}

// 确认词判断：短消息 + 确认语义才视为「开始」（长消息一律当作继续补充，避免误触发扣费）
function isAffirmative(text) {
  const t = String(text || '').trim()
  if (t.length > 10) return false
  return /(开始|生成|确认|可以|没问题|好的?|ok|start|go)/i.test(t)
}

// 输入法守卫：中文输入法选词/确认候选的 Enter（isComposing/229）不触发发送，
// 否则会出现「打字还没打完就莫名发送并开始生成」的误触
function onComposerEnter(e) {
  if (e?.isComposing || e?.keyCode === 229) return
  send()
}

async function send(presetText) {  const content = (typeof presetText === 'string' ? presetText : text.value).trim()
  if (!content && !pendingFile.value) return
  // 安全守卫：如果 aiLoading/isLoading 卡在 true（HMR 残留/异常退出），强制重置而非静默返回
  if (aiLoading.value || isLoading.value) {
    // 若有正在进行的生成，先停止它（而非直接强重置，避免后台流继续消耗 token）
    stopGeneration()
  }

  // 有待解析文件时先解析
  if (pendingFile.value && !docData.value) {
    await handleFileUpload(pendingFile.value)
  }

  text.value = ''
  // 重置 textarea 高度
  nextTick(() => {
    if (heroTextareaRef.value) heroTextareaRef.value.style.height = 'auto'
    if (bottomTextareaRef.value) bottomTextareaRef.value.style.height = 'auto'
  })

  let userText = content || (pendingFile.value ? '帮我优化这份文档的排版' : '')
  if (userText) {
    messages.value.push({ id: genId(), role: 'user', content: userText, time: nowTime() })
    await scrollToBottom()
  }

  // 为本次生成创建独立的 AbortController
  abortController.value = new AbortController()
  const currentSignal = abortController.value.signal

  // 单一对话流：AI 自主识别意图，无需手动切换模式
  // （detectIntent 用正则自动判断意图；不使用 LLM 分类器——P2-12 结论：误判率高且消耗 guest 配额）
  let flow = detectIntent(userText)
  const isTaskFlow = flow === 'ppt' || flow === 'word' || flow === 'code'

  // ===== 生成前澄清 + 确认状态机 =====
  if (clarifyStage.value === 'none' && isTaskFlow) {
    // 第一段：命中任务意图 → 主动询问关键细节（零扣费、零 AI 调用）
    clarifyStage.value = 'asked'
    clarifyFlow.value = flow
    clarifyIntentText.value = userText
    clarifyDetails.value = []
    messages.value.push({ id: genId(), role: 'assistant', content: CLARIFY_PROMPTS[flow] || CLARIFY_PROMPTS.ppt, time: nowTime() })
    await scrollToBottom()
    return
  }

  if (clarifyStage.value === 'asked') {
    if (isTaskFlow) clarifyFlow.value = flow // 用户在补充时换意图（如改口写 Word），跟随更新
    // 第二段：用户补充细节 → 记录（牢记）→ 汇总并主动询问是否可以开始
    clarifyDetails.value.push(userText)
    clarifyStage.value = 'confirm'
    messages.value.push({ id: genId(), role: 'assistant', content: buildClarifySummary(), time: nowTime() })
    await scrollToBottom()
    return
  }

  if (clarifyStage.value === 'confirm') {
    if (isTaskFlow) clarifyFlow.value = flow
    if (isAffirmative(userText)) {
      // 第三段：用户确认开始 → 牢记的全部要求拼入生成输入，清状态，进入真实生成（此时才预扣）
      userText = [clarifyIntentText.value, ...clarifyDetails.value].filter(Boolean).join('\n')
      flow = clarifyFlow.value || flow
      clarifyStage.value = 'none'
      clarifyDetails.value = []
    } else {
      // 继续补充/修改 → 更新记录，再次确认
      clarifyDetails.value.push(userText)
      messages.value.push({ id: genId(), role: 'assistant', content: buildClarifySummary(), time: nowTime() })
      await scrollToBottom()
      return
    }
  }

  try {
    if (flow === 'doc' && docData.value) {
      await sendDoc(userText, currentSignal)
    } else if (flow === 'ppt') {
      await sendPPT(userText, currentSignal)
    } else if (flow === 'word') {
      await sendWord(userText, currentSignal)
    } else if (flow === 'code') {
      await sendCode(userText, currentSignal)
    } else {
      await sendGeneralChat(userText, currentSignal)
    }
  } finally {
    // 生成结束（正常或异常）后清理 controller 引用
    if (abortController.value?.signal === currentSignal) {
      abortController.value = null
    }
  }
}

/**
 * 停止当前正在进行的 AI 生成
 * 会触发 AbortController.abort()，让上游 fetch 立即终止
 */
function stopGeneration() {
  if (abortController.value) {
    try {
      abortController.value.abort()
    } catch { /* ignore */ }
    abortController.value = null
  }
  // 重置加载状态，让 UI 立即响应
  aiLoading.value = false
  isLoading.value = false
  // P1-9: flush 确保 content 已落盘，避免下方检查 msg.content 时读到 rAF pending 的旧值
  flushStreamContent()
  // 保留 progressMsgIndex 对应的进度卡片内容（让用户看到已停止时的状态），但移除进度指示
  if (progressMsgIndex.value >= 0 && messages.value[progressMsgIndex.value]) {
    const msg = messages.value[progressMsgIndex.value]
    if (typeof msg.progress === 'number') {
      msg.progress = undefined
      msg.content = msg.content || ''
      if (!msg.content) {
        // 进度卡片从未收到内容，直接移除
        messages.value.splice(progressMsgIndex.value, 1)
      }
    }
  }
  progressMsgIndex.value = -1
  streamingTokens.value = 0
}

/**
 * 通用 AI 对话（非任务流时的普通聊天）
 */
async function sendGeneralChat(content, signal) {
  // 配额预检查，与其他 sendXxx 一致
  if (isExceeded.value) {
    notifyLab('次数已达上限', getUpgradeHint(), 'warning')
    return
  }

  aiLoading.value = true
  // 灵动岛任务卡：普通聊天也接管生成状态（无固定进度，流式开始后转为阶段文案）
  beginGenTask('回复')
  const msgIdx = messages.value.length
  messages.value.push({ id: genId(),
    role: 'assistant',
    content: '',
    time: nowTime(),
  })
  await scrollToBottom()

  try {
    // 取最近 20 轮对话作为上下文
    const history = messages.value
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.code && !m.ppt && !m.word && !m.outline))
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content || '' }))

    // 模型分流：选中 BOHAI 模式走 vault mode 路由；未选/加载失败走默认 Qwen 直连
    const bohaiCall = resolveBohaiChatCall()
    const requestConfig = bohaiCall
      ? {
          provider: bohaiCall.provider,
          purpose: 'chat',
          mode: bohaiCall.mode,
          apiUrl: bohaiCall.apiUrl,
          payload: {
            model: bohaiCall.modelId,
            messages: [
              { role: 'system', content: BASE_SYSTEM_PROMPT },
              ...history,
            ],
            stream: true,
            temperature: bohaiCall.profile?.temperature ?? 0.7,
            ...(bohaiCall.profile?.top_p != null ? { top_p: bohaiCall.profile.top_p } : {}),
            ...(bohaiCall.profile?.frequency_penalty != null ? { frequency_penalty: bohaiCall.profile.frequency_penalty } : {}),
            max_tokens: bohaiCall.profile?.max_tokens ?? 4096,
          },
        }
      : {
          provider: 'siliconflow',
          purpose: 'chat',
          apiUrl: CHAT_API_URL,
          payload: {
            model: import.meta.env.VITE_BOHAI_DEFAULT_MODEL || '',
            messages: [
              { role: 'system', content: BASE_SYSTEM_PROMPT },
              ...history,
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 4096,
          },
        }

    const response = await callVaultSiliconChatStream({
      ...requestConfig,
      timeoutMs: 120000,
      signal,
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''
    let sseError = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        // 处理 Edge Function 发来的 SSE error 事件
        if (line.startsWith('event: error')) {
          sseError = true
          continue
        }
        if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue
          try {
            const parsed = JSON.parse(dataStr)
            // SSE error 事件携带错误信息
            if (sseError || parsed.ok === false) {
              const errMsg = parsed.message || 'AI 服务返回错误'
              messages.value.splice(msgIdx, 1)
              messages.value.push({ id: genId(),
                role: 'assistant',
                content: `抱歉，出错了：${errMsg}`,
                time: nowTime(),
              })
              return
            }
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              fullContent += delta
              if (messages.value[msgIdx]) {
                scheduleStreamContent(msgIdx, fullContent)
                streamingTokens.value = estimateTokens(fullContent)
                if (genStatus.running && genStatus.stage !== '正在生成回复') {
                  updateGenTaskStage('正在生成回复')
                }
              }
            }
          } catch { /* skip non-JSON */ }
          sseError = false
        }
      }
    }

    flushStreamContent()
    if (!fullContent) {
      messages.value[msgIdx].content = '（AI 未返回有效回复，请稍后重试）'
    }
    succeedGenTask('回复完成', fullContent ? '已输出至对话' : '未返回有效内容')
  } catch (e) {
    // P1-9: flush 确保 content 已落盘，避免取消时读到 rAF pending 的旧值
    flushStreamContent()
    // 用户主动取消：保留已生成的部分内容
    if (isAbortError(e)) {
      closeGenTask()
      if (messages.value[msgIdx]) {
        if (messages.value[msgIdx].content) {
          // 已有部分内容，追加停止提示
          messages.value[msgIdx].content += '\n\n_（已停止生成）_'
        } else {
          // 没有任何内容，直接移除空消息
          messages.value.splice(msgIdx, 1)
        }
      }
      return
    }
    // 处理配额超限错误（429）和其他 API 错误
    const isQuotaError = e.status === 429 && e.quota
    messages.value.splice(msgIdx, 1)
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: isQuotaError
        ? '今日 BOH AI Token 额度已用完，明天 0:00 重置。'
        : `抱歉，出错了：${e.message}`,
      time: nowTime(),
    })
    if (isQuotaError) {
      failGenTask('次数已达上限', getUpgradeHint(), 'warning')
    } else {
      failGenTask('生成失败', e.message)
    }
  } finally {
    aiLoading.value = false
    await scrollToBottom()
  }
}

/**
 * 大纲项类型中文标签
 */
function outlineTypeLabel(type) {
  const map = {
    cover: '封面', agenda: '目录', section: '章节', content: '内容',
    bullets: '要点', 'two-column': '对比', 'image-text': '图文',
    chart: '图表', table: '表格', timeline: '时间线', quote: '引用',
    end: '结尾',
    heading: '标题', paragraph: '段落', list: '列表', 'ordered-list': '有序列表',
    code: '代码', image: '图片', divider: '分隔', toc: '目录',
    nav: '导航', hero: '首屏', grid: '网格', cards: '卡片',
    features: '功能', testimonials: '评价', pricing: '定价',
    gallery: '画廊', faq: '问答', contact: '联系', footer: '页脚',
  }
  return map[type] || type
}

async function sendDoc(content, signal) {
  if (!docData.value) {
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: '请先上传一份 .docx 文档，我才能帮你调整样式。',
      time: nowTime(),
    })
    return
  }
  try {
    const [{ applyOperations, applyContentOperations }, { reparseStylesFromDoc }] = await Promise.all([
      loadDocStyleEngine(),
      loadDocParser(),
    ])
    // 灵动岛任务卡：文档排版也是生成流程（无固定进度，用不确定态）
    beginGenTask('文档排版')
    const result = await chat(
      content,
      messages.value,
      docData.value.styles.styles,
      docData.value.content,
      signal
    )
    const reply = result.reply || '已处理。'
    const operations = result.operations || []
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: reply,
      operations,
      time: nowTime(),
    })

    if (operations.length > 0) {
      const newStylesDoc = docData.value.stylesDoc.cloneNode(true)
      applyOperations(newStylesDoc, operations)
      docData.value.stylesDoc = newStylesDoc
      docData.value.styles = reparseStylesFromDoc(newStylesDoc)

      const newDocumentDoc = docData.value.documentDoc.cloneNode(true)
      applyContentOperations(newDocumentDoc, operations)
      docData.value.documentDoc = newDocumentDoc

      await rebuildAndPreview()
      error.value = ''
      addHistory('样式修改', `已修改 ${operations.length} 项样式`, 'style')
      succeedGenTask('样式已更新', `共 ${operations.length} 项修改`)
    } else {
      closeGenTask()
    }
  } catch (e) {
    if (isAbortError(e)) {
      closeGenTask() // 用户主动取消，静默处理
      return
    }
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `出错：${e.message}`,
      time: nowTime(),
    })
    failGenTask('操作失败', e.message)
  }
  await scrollToBottom()
}

async function sendPPT(content, signal) {
  // 生成前检查限额，避免浪费 token
  if (isExceeded.value) {
    notifyLab('生成次数已达上限', getUpgradeHint(), 'warning')
    return
  }

  // H-3 修复：AI 调用前预扣减配额，防止 TOCTOU 竞态导致无限生成消耗 token
  const quotaResult = await preConsumeQuota('ppt')
  if (!quotaResult.success) {
    notifyLab('生成次数已达上限', quotaResult.error || getUpgradeHint(), 'warning')
    return
  }

  aiLoading.value = true
  // 灵动岛任务卡：接管生成状态（进行中/成功/失败）
  beginGenTask('PPT')

  // 初始化任务面板
  initTaskFlow('ppt', content)

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({ id: genId(),
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你生成PPT大纲',
    time: nowTime(),
  })

  try {
    // 第一阶段：生成大纲
    const outlineData = await generatePPTOutline(content, '', handleProgress, signal)
    nextTask('outline')
    updateTask('detail', 'doing', '正在生成完整 PPT')
    updateGenTaskStage('正在生成完整 PPT')

    // 展示大纲（只读，不再要求确认）
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为「${content}」规划大纲，共 ${outlineData.outline.length} 个章节，正在生成完整 PPT…`,
      outline: outlineData,
      outlineFlow: 'ppt',
      time: nowTime(),
    })
    await scrollToBottom()

    // 第二阶段：直接生成完整 PPT（无需用户确认）
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: '',
      progress: 0,
      progressText: 'BOH Agent正在为你输出PPT',
      time: nowTime(),
    })

    const data = await generateSlidesPageByPage(content, '', outlineData, handleProgress, signal)
    lastPPTData.value = data

    nextTask('detail')
    updateTask('detail', 'done', `已生成 ${data.slides.length} 张幻灯片`)

    // 移除进度卡片，替换为结果卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    // 质检摘要（逐页生成内置本地校验 + 修复回路）
    const qa = data.qa || null
    const qaText = qa && qa.degradedPages > 0
      ? `质检发现 ${qa.degradedPages} 页未达标准已降级为内容页（${qa.degradedTitles.join('、')}），其余 ${data.slides.length - qa.degradedPages} 页通过校验。`
      : '全部页面已通过质检校验。'

    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为你生成完整 PPT「${data.title}」，共 ${data.slides.length} 张幻灯片，样式集「${currentPresetName.value}」。${qaText}可以下载查看，或告诉我要调整的地方。`,
      ppt: data,
      artifact: { kind: 'ppt', data },
      time: nowTime(),
    })
    succeedGenTask('PPT 生成成功', `${data.slides.length} 张幻灯片 · ${currentPresetName.value}`)
  } catch (e) {
    // 用户主动取消：保留已生成的大纲信息，回退配额
    if (isAbortError(e)) {
      if (progressMsgIndex.value >= 0) {
        messages.value.splice(progressMsgIndex.value, 1)
        progressMsgIndex.value = -1
      }
      messages.value.push({ id: genId(),
        role: 'assistant',
        content: '已停止 PPT 生成。',
        time: nowTime(),
      })
      closeGenTask()
      await refundQuota('ppt')
      return
    }
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('outline', 'error', e.message)
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `PPT 生成失败：${e.message}`,
      time: nowTime(),
    })
    failGenTask('PPT 生成失败', e.message)
    // H-3 修复：AI 调用失败，回退预扣减的配额
    await refundQuota('ppt')
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

async function sendWord(content, signal) {
  // 生成前检查限额，避免浪费 token
  if (isExceeded.value) {
    notifyLab('生成次数已达上限', getUpgradeHint(), 'warning')
    return
  }

  // H-3 修复：AI 调用前预扣减配额
  const quotaResult = await preConsumeQuota('word')
  if (!quotaResult.success) {
    notifyLab('生成次数已达上限', quotaResult.error || getUpgradeHint(), 'warning')
    return
  }

  aiLoading.value = true
  // 灵动岛任务卡：接管生成状态（进行中/成功/失败）
  beginGenTask('Word')

  // 初始化任务面板
  initTaskFlow('word', content)

  // 添加进度卡片到消息流
  progressMsgIndex.value = messages.value.length
  messages.value.push({ id: genId(),
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你生成Word大纲',
    time: nowTime(),
  })

  try {
    // 第一阶段：生成大纲
    const outlineData = await generateWordOutline(content, '', handleProgress, signal)
    nextTask('outline')
    updateTask('detail', 'doing', '正在生成完整文档')
    updateGenTaskStage('正在生成完整 Word')

    // 展示大纲（只读，不再要求确认）
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为「${content}」规划大纲，共 ${outlineData.outline.length} 个章节，正在生成完整 Word…`,
      outline: outlineData,
      outlineFlow: 'word',
      time: nowTime(),
    })
    await scrollToBottom()

    // 第二阶段：直接生成完整 Word（无需用户确认）
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: '',
      progress: 0,
      progressText: 'BOH Agent正在为你输出Word文档',
      time: nowTime(),
    })

    const data = await generateWordDoc(content, '', outlineData, handleProgress, signal)
    lastWordData.value = data
    const blockCount = (data.blocks || []).length

    nextTask('detail')
    updateTask('detail', 'done', `已生成 ${blockCount} 个内容块`)

    // 移除进度卡片，替换为结果卡片
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为你生成完整 Word 文档「${data.title}」，共 ${blockCount} 个内容块，样式集「${currentPresetName.value}」。可以下载查看，或告诉我要调整的地方。`,
      word: data,
      time: nowTime(),
    })
    succeedGenTask('Word 生成成功', `${blockCount} 个内容块 · ${currentPresetName.value}`)
  } catch (e) {
    // 用户主动取消：回退配额
    if (isAbortError(e)) {
      if (progressMsgIndex.value >= 0) {
        messages.value.splice(progressMsgIndex.value, 1)
        progressMsgIndex.value = -1
      }
      messages.value.push({ id: genId(),
        role: 'assistant',
        content: '已停止 Word 生成。',
        time: nowTime(),
      })
      closeGenTask()
      await refundQuota('word')
      return
    }
    // 移除进度卡片，显示错误
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('outline', 'error', e.message)
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `Word 生成失败：${e.message}`,
      time: nowTime(),
    })
    failGenTask('Word 生成失败', e.message)
    // H-3 修复：AI 调用失败，回退预扣减的配额
    await refundQuota('word')
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

// ===== Code 生成方法 =====

async function sendCode(content, signal) {
  if (isExceeded.value) {
    notifyLab('生成次数已达上限', getUpgradeHint(), 'warning')
    return
  }

  // H-3 修复：AI 调用前预扣减配额
  const quotaResult = await preConsumeQuota('code')
  if (!quotaResult.success) {
    notifyLab('生成次数已达上限', quotaResult.error || getUpgradeHint(), 'warning')
    return
  }

  aiLoading.value = true
  // 灵动岛任务卡：接管生成状态（进行中/成功/失败）
  beginGenTask('网页')
  initTaskFlow('code', content)

  progressMsgIndex.value = messages.value.length
  messages.value.push({ id: genId(),
    role: 'assistant',
    content: '',
    progress: 0,
    progressText: 'BOH Agent正在为你规划网页架构',
    time: nowTime(),
  })

  try {
    // 第一阶段：生成架构大纲
    const outlineData = await generateCodeOutline(content, '', handleProgress, thinkingBudgetValue.value, signal)
    nextTask('outline')
    updateTask('detail', 'doing', '正在编写网页代码')
    updateGenTaskStage('正在编写网页代码')

    // 展示架构（只读，不再要求确认）
    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为「${content}」规划网页架构，共 ${outlineData.outline.length} 个区域，正在编写代码…`,
      outline: outlineData,
      outlineFlow: 'code',
      time: nowTime(),
    })
    await scrollToBottom()

    // 第二阶段：直接生成完整网页代码（无需用户确认）
    progressMsgIndex.value = messages.value.length
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: '',
      progress: 0,
      progressText: 'BOH Agent正在为你编写网页代码',
      time: nowTime(),
    })

    const data = await generateCode(
      content, '',
      outlineData, handleProgress,
      thinkingBudgetValue.value,
      (text) => {
        if (progressMsgIndex.value >= 0 && messages.value[progressMsgIndex.value]) {
          scheduleStreamContent(progressMsgIndex.value, text)
          streamingTokens.value = estimateTokens(text)
        }
      },
      signal
    )
    lastCodeData.value = data

    nextTask('detail')
    updateTask('detail', 'done', `已生成完整网页`)

    messages.value.splice(progressMsgIndex.value, 1)
    progressMsgIndex.value = -1

    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `已为你生成网页「${data.title || 'AI 生成网页'}」。你可以继续告诉我需要调整的地方，或在右侧面板下载完整文件。`,
      code: data,
      time: nowTime(),
    })
    rightPanelOpen.value = true
    rightPanelTab.value = 'code'
    succeedGenTask('网页生成成功', '点击右侧面板下载 ZIP')
  } catch (e) {
    // P1-9: flush 确保 content 已落盘，避免取消时 partialContent 读到 rAF pending 的旧值
    flushStreamContent()
    // 用户主动取消：回退配额
    if (isAbortError(e)) {
      if (progressMsgIndex.value >= 0) {
        // 保留已生成的部分代码到结果中
        const partialContent = messages.value[progressMsgIndex.value].content
        messages.value.splice(progressMsgIndex.value, 1)
        progressMsgIndex.value = -1
        if (partialContent) {
          messages.value.push({ id: genId(),
            role: 'assistant',
            content: '已停止网页代码生成（部分代码已显示）。',
            code: { title: 'AI 生成网页（未完成）', html: partialContent },
            time: nowTime(),
          })
          rightPanelOpen.value = true
          rightPanelTab.value = 'code'
        } else {
          messages.value.push({ id: genId(),
            role: 'assistant',
            content: '已停止网页代码生成。',
            time: nowTime(),
          })
        }
      }
      closeGenTask()
      await refundQuota('code')
      return
    }
    if (progressMsgIndex.value >= 0) {
      messages.value.splice(progressMsgIndex.value, 1)
      progressMsgIndex.value = -1
    }
    updateTask('outline', 'error', e.message)
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `网页生成失败：${e.message}`,
      time: nowTime(),
    })
    failGenTask('网页生成失败', e.message)
    // H-3 修复：AI 调用失败，回退预扣减的配额
    await refundQuota('code')
  } finally {
    aiLoading.value = false
  }
  await scrollToBottom()
}

async function downloadCodeFromPanel() {
  if (!lastCodeData.value) return
  try {
    const fileName = `${(lastCodeData.value.title || 'AI生成网页').replace(/\s+/g, '_')}.zip`
    await downloadCode(lastCodeData.value, fileName)
    // H-3 修复：配额已在 sendCode 阶段预扣减，此处无需再记录
    notifyLab('下载成功', fileName, 'success')
  } catch (e) {
    console.error('downloadCodeFromPanel 失败:', e, 'lastCodeData:', lastCodeData.value)
    notifyLab('下载失败', `${e.message}（HTML 长度: ${lastCodeData.value?.html?.length || 0}）`, 'error')
  }
}

async function downloadPPT(pptData) {
  if (!pptData) return
  try {
    const fileName = `${(pptData.title || 'AI生成').replace(/\s+/g, '_')}.pptx`
    await buildPPTFile(pptData, selectedPresetId.value, fileName)

    // H-3 修复：配额已在 sendPPT 阶段预扣减，此处无需再记录
    notifyLab('下载成功', fileName, 'success')
  } catch (e) {
    error.value = `下载失败：${e.message}`
    notifyLab('下载失败', e.message, 'error')
  }
}

async function downloadWord(wordData) {
  if (!wordData) return
  try {
    const fileName = `${(wordData.title || 'AI生成').replace(/\s+/g, '_')}.docx`
    await buildWordFile(wordData, selectedPresetId.value, fileName)

    // H-3 修复：配额已在 sendWord 阶段预扣减，此处无需再记录
    notifyLab('下载成功', fileName, 'success')

    // 刷新限额状态
    await initializeQuota()
  } catch (e) {
    error.value = `下载失败：${e.message}`
    notifyLab('下载失败', e.message, 'error')
  }
}

// P1-8: rAF 节流的 scrollToBottom，合并同一帧内的多次调用，避免流式生成时频繁 scroll 触发布局抖动。
let _scrollRafId = null
function scrollToBottom() {
  if (_scrollRafId !== null) return Promise.resolve()
  return new Promise((resolve) => {
    _scrollRafId = requestAnimationFrame(() => {
      _scrollRafId = null
      if (threadRef.value) {
        threadRef.value.scrollTop = threadRef.value.scrollHeight
      }
      resolve()
    })
  })
}

function onContextAction({ action }) {
  if (!docData.value) return
  const actionMap = {
    'copy-format': '复制当前段落的格式信息',
    'paste-format': '将之前复制的格式应用到当前段落',
    'set-heading': '将当前段落设为标题样式',
    'set-bold': '将当前段落设为加粗',
    'ai-suggest': '对当前段落给出排版建议',
  }
  const t = actionMap[action] || action
  send(t)
}

function refreshTemplates() {
  templates.value = getAllTemplates()
}

async function handleTemplateSelect(tpl) {
  if (!docData.value) return
  const content = `应用模板「${tpl.name}」到当前文档`
  messages.value.push({ id: genId(), role: 'user', content, time: nowTime() })
  await scrollToBottom()
  try {
    const [{ applyOperations }, { reparseStylesFromDoc }] = await Promise.all([
      loadDocStyleEngine(),
      loadDocParser(),
    ])
    const result = await chat(
      content,
      messages.value,
      docData.value.styles.styles,
      docData.value.content
    )
    const operations = result.operations || []
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: result.reply || `已应用「${tpl.name}」`,
      operations,
      time: nowTime(),
    })
    if (operations.length > 0) {
      const newStylesDoc = docData.value.stylesDoc.cloneNode(true)
      applyOperations(newStylesDoc, operations)
      docData.value.stylesDoc = newStylesDoc
      docData.value.styles = reparseStylesFromDoc(newStylesDoc)
      await rebuildAndPreview()
      activeTemplateId.value = tpl.id
      error.value = ''
      addHistory('模板应用', `应用「${tpl.name}」`, 'template')
      notifyLab('模板已应用', tpl.name, 'success')
    }
  } catch (e) {
    messages.value.push({ id: genId(),
      role: 'assistant',
      content: `模板应用失败：${e.message}`,
      time: nowTime(),
    })
    notifyLab('模板应用失败', e.message, 'error')
  }
  await scrollToBottom()
}

function saveCurrentAsTemplate(name) {
  if (!docData.value || !modifiedBlob.value) return
  const ops = []
  for (const st of docData.value.styles.styles) {
    const op = { target: st.styleId }
    if (st.font) op.font = st.font.ascii || st.font.eastAsia
    if (st.size) op.size = st.size
    if (st.bold) op.bold = true
    if (st.italic) op.italic = true
    if (st.underline) op.underline = true
    if (st.strikethrough) op.strikethrough = true
    if (st.color) op.color = st.color
    if (st.shading) op.shading = st.shading
    if (st.align) op.align = st.align
    if (st.spacing?.line) op.line = st.spacing.line
    if (st.spacing?.before) op.before = st.spacing.before
    if (st.spacing?.after) op.after = st.spacing.after
    if (st.indent?.firstLine) op.firstLine = st.indent.firstLine
    if (Object.keys(op).length > 1) ops.push(op)
  }
  saveTemplate(name, `从 ${docData.value.fileName} 保存`, ops)
  refreshTemplates()
  addHistory('保存模板', `保存「${name}」`, 'template')
  notifyLab('模板已保存', name, 'success')
}

function downloadModified() {
  if (!modifiedBlob.value) return
  const url = URL.createObjectURL(modifiedBlob.value)
  const a = document.createElement('a')
  a.href = url
  a.download = `modified_${docData.value?.fileName || 'doc.docx'}`
  a.click()
  URL.revokeObjectURL(url)
  notifyLab('下载成功', docData.value?.fileName || '文档', 'success')
}

function handleUpgradeFromBadge() {
  router.push('/user-center/subscriptions')
}

function onHistoryRestore(index) {
  notifyLab('历史回滚', `已定位到第 ${index + 1} 步操作（完整回滚功能开发中）`, 'info')
  addHistory('回滚操作', `尝试回滚到步骤 ${index + 1}`, 'undo')
}

// ===== 上下文压缩 =====
async function handleCompressContext() {
  if (contextCompressing.value) return
  contextCompressing.value = true
  contextCompressed.value = false
  try {
    const summary = await withRetry(() => generateSummary(messages.value))
    const trimmed = trimMessages(messages.value)
    messages.value = trimmed
    messages.value.unshift({ id: genId(),
      role: 'system',
      content: `【上下文压缩摘要】\n${summary}`,
      compressed: true,
      time: nowTime(),
    })
    contextCompressed.value = true
    notifyLab('上下文已压缩', `从 ${messages.value.length + trimmed.length} 轮压缩至 ${messages.value.length} 轮`, 'success')
  } catch (e) {
    notifyLab('压缩失败', e.message, 'error')
  } finally {
    contextCompressing.value = false
  }
}

// ===== Guardrail 配置 =====
const guardrailConfigs = {
  resetConversation: {
    title: '重置对话',
    message: '这将清除当前所有对话记录，确定要继续吗？',
    severity: 'danger',
    confirmLabel: '确定重置',
    reminder: '不再提示',
  },
  deleteMessage: {
    title: '删除消息',
    message: '确定要删除选中的消息吗？此操作不可撤销。',
    severity: 'warning',
  },
}

const guardrailCache = ref({})

async function withGuardrail(actionType) {
  if (guardrailCache.value[actionType] && guardrailRef.value) {
    const result = await guardrailRef.value.show(guardrailConfigs[actionType])
    if (result?.dontShowAgain) {
      guardrailCache.value[actionType] = false
    }
    return result?.confirmed || false
  }
  return true
}

// ===== 命令执行 =====
function executeCommand(cmd) {
  switch (cmd.action) {
    case 'resetConversation':
      withGuardrail('resetConversation').then(ok => ok && resetConversation())
      break
    case 'compressContext':
      handleCompressContext()
      break
    case 'toggleAutoMode':
      autoMode.value = !autoMode.value
      notifyLab('智能模式', autoMode.value ? '已开启' : '已关闭', 'info')
      break
    case 'toggleTreePanel':
      toggleTreePanel()
      break
    case 'undo':
      handleUndo()
      break
    case 'redo':
      handleRedo()
      break
    case 'downloadModified':
      downloadModified()
      break
    case 'toggleDrawer':
      drawerOpen.value = !drawerOpen.value
      break
    case 'hintPPT':
      text.value = '生成项目总结 PPT'
      nextTick(() => (hasConversation.value ? bottomTextareaRef : heroTextareaRef).value?.focus())
      break
    case 'hintWord':
      text.value = '写一份年度工作总结 Word'
      nextTick(() => (hasConversation.value ? bottomTextareaRef : heroTextareaRef).value?.focus())
      break
    case 'hintCode':
      text.value = '做一个个人作品集网页'
      nextTick(() => (hasConversation.value ? bottomTextareaRef : heroTextareaRef).value?.focus())
      break
  }
}

// ===== Undo/Redo =====
function handleUndo() {
  const snapshot = undo()
  if (snapshot) {
    restoreSnapshot(snapshot)
    notifyLab('撤销', snapshot.label || '上一步操作', 'info')
  }
}

function handleRedo() {
  const snapshot = redo()
  if (snapshot) {
    restoreSnapshot(snapshot)
    notifyLab('重做', snapshot.label || '下一步操作', 'info')
  }
}

function restoreSnapshot(snapshot) {
  if (!snapshot) return
  if (snapshot.stylesDoc && docData.value) {
    void loadDocParser().then(({ reparseStylesFromDoc }) => {
      if (!docData.value) return
      docData.value.stylesDoc = snapshot.stylesDoc
      docData.value.styles = reparseStylesFromDoc(snapshot.stylesDoc)
      if (snapshot.historyItems) {
        historyItems.value = snapshot.historyItems
      }
      return rebuildAndPreview()
    }).catch((error) => {
      console.error('[lab] restore snapshot failed:', error)
    })
  }
}

// ===== 对话树 =====
function toggleTreePanel() {
  if (rightPanelOpen.value && rightPanelTab.value === 'tree') {
    rightPanelOpen.value = false
  } else {
    rightPanelOpen.value = true
    rightPanelTab.value = 'tree'
  }
}

function initConversationTree() {
  if (treeNodes.value.length === 0 && messages.value.length > 0) {
    for (const msg of messages.value) {
      treeAddNode(msg)
    }
  }
}

function switchBranch(nodeId) {
  treeNavigateTo(nodeId)
  const branchMessages = treeGetMessages()
  if (branchMessages.length > 0) {
    messages.value = branchMessages
    notifyLab('已切换分支', `当前路径 ${treeNodes.value.indexOf(findNode(nodeId)) + 1} 条消息`, 'info')
    scrollToBottom()
  }
}

function findNode(id) {
  return treeNodes.value.find(n => n.id === id)
}

// ===== 键盘快捷键 =====
function handleKeyboardShortcuts(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    if (canUndo.value) handleUndo()
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault()
    if (canRedo.value) handleRedo()
  }
}

// 数据源变化 → 同步岛卡（配额/生成态/模型列表/样式集/思考预算）
// 位置约束：所有被监听的 ref 必须已声明（避免 TDZ），故置于 setup 尾部
watch(
  [quotaDisplayData, genStatus, bohaiChatModes, bohaiModelsLoading, selectedBohaiModeId, effectiveTier, selectedPresetId, thinkingBudgetValue],
  syncQuotaIsland
)

// ===== 导航高度同步：灵动岛展开撑高 surface 时页面自动下移留出安全距离（CommunityLotteries 先例） =====
const labPageRef = ref(null)
let labNavResizeObserver = null
const syncLabNavHeight = () => {
  const nav = document.getElementById('unified-nav-container')
  const page = labPageRef.value
  if (!nav || !page) return
  const height = Math.ceil(nav.getBoundingClientRect().height)
  if (height > 0) page.style.setProperty('--lab-nav-h', `${height + 12}px`)
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', handleKeyboardShortcuts)
  // 初始化实验室使用限额
  initializeQuota()
  // 灵动岛：挂载配额 + 生成状态常驻岛（initializeQuota 完成后由 watch 自动同步数据）
  mountQuotaIsland()
  // 拉取 BOHAI 对话模型列表（岛卡展开区可切换；失败时岛卡显示默认模型兜底）
  void loadBohaiChatModes()
  // 导航高度安全距离：观察导航（灵动岛展开撑高时页面自动下移）
  syncLabNavHeight()
  const navEl = document.getElementById('unified-nav-container')
  if (navEl && typeof ResizeObserver !== 'undefined') {
    labNavResizeObserver = new ResizeObserver(syncLabNavHeight)
    labNavResizeObserver.observe(navEl)
  }
  // 安全重置：防止 HMR 热更新或路由切换后残留脏状态导致 send() 静默返回
  aiLoading.value = false
  isLoading.value = false
  progressMsgIndex.value = -1
})

onBeforeUnmount(() => {
  // 组件卸载时停止所有正在进行的 AI 生成，避免内存泄漏和后台流继续消耗 token
  stopGeneration()
  // 同步收起灵动岛任务卡与常驻配额岛（showIsland.custom 约定：宿主必须负责 close）
  closeGenTask()
  quotaIslandHandle?.close()
  quotaIslandHandle = null
  // 取消 pending 的 scroll rAF
  if (_scrollRafId !== null) {
    cancelAnimationFrame(_scrollRafId)
    _scrollRafId = null
  }
  // 取消 pending 的流式 content rAF
  if (_streamContentRafId !== null) {
    cancelAnimationFrame(_streamContentRafId)
    _streamContentRafId = null
  }
  // 清理 closeTaskPanel 的延迟定时器
  if (closeTaskPanelTimer) {
    clearTimeout(closeTaskPanelTimer)
    closeTaskPanelTimer = null
  }
  // 灵动岛安全距离：导航高度观察器
  labNavResizeObserver?.disconnect()
  labNavResizeObserver = null
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', handleKeyboardShortcuts)
})
</script>

<style scoped>
/* ===== Liquid Glass 设计令牌（2026-09 UI 换新：液态玻璃 + 极简布局） ===== */
/* 灰度变量映射到全站 --liquid-* 语义：主区透明化浮于环境底色之上，
   --muted 即嵌套玻璃色块，--border 统一 hairline。 */
.lab-page {
  /* 冷调低饱和灰度配色（玻璃语义） */
  --background: transparent;
  --surface-solid: #f7f7f8;
  --foreground: #1d1d1f;
  --foreground-inverse: #f7f7f8;
  --muted: rgba(255, 255, 255, 0.52);            /* 嵌套玻璃：hover/小块 */
  --muted-strong: rgba(255, 255, 255, 0.72);     /* 嵌套玻璃：略强 */
  --muted-foreground: #6e6e73;
  --border: rgba(15, 23, 42, 0.07);              /* hairline */
  --border-light: rgba(15, 23, 42, 0.045);
  --accent: #0071e3;
  --accent-hover: #0058b9;
  --accent-light: rgba(0, 113, 227, 0.12);
  --accent-foreground: #ffffff;
  --destructive: #ff3b30;
  --destructive-light: rgba(255, 59, 48, 0.1);
  --code-bg: rgba(15, 23, 42, 0.04);
  --code-border: rgba(15, 23, 42, 0.07);

  /* 玻璃表面成品（引用全站 token） */
  --glass-panel: var(--liquid-bg);               /* 侧栏/右栏/顶栏 */
  --glass-strong: var(--liquid-bg-strong);       /* composer/弹窗 */
  --glass-filter: var(--liquid-filter);
  --glass-filter-sm: var(--liquid-filter-sm);
  --glass-highlight: var(--liquid-highlight-subtle);
  --glass-shadow: var(--liquid-shadow-sm);
  --glass-shadow-lg: var(--liquid-shadow);

  /* 圆角：玻璃表面用大圆角，控件统一 8px，仅输入框为 pill */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* 字体 */
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;

  /* 阴影：极轻，几乎不可见 */
  --shadow-sm: var(--liquid-shadow-sm);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.05);
  --shadow-lg: var(--liquid-shadow);
}

/* ===== 页面骨架 ===== */
.lab-page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 留出全局固定导航栏的空间（含灵动岛展开撑高的动态高度 + 12px 安全余量，脚本实时同步） */
  padding-top: var(--lab-nav-h, 84px);
  box-sizing: border-box;
  /* 环境底色：浅灰 + 两个柔和光斑，为液态玻璃提供可模糊的背景层次 */
  background:
    radial-gradient(52% 42% at 12% -6%, rgba(0, 113, 227, 0.07), transparent 68%),
    radial-gradient(46% 40% at 92% 8%, rgba(52, 199, 89, 0.06), transparent 66%),
    linear-gradient(180deg, #f6f6f8 0%, #eef0f3 100%);
  color: var(--foreground);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ===== 三栏布局 ===== */
.lab-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ===== 主内容区 ===== */
.lab-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--background);
}

/* ===== 对话区 ===== */
.conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 14px 20px 0;
  box-sizing: border-box;
  overflow: hidden;
}

/* ===== 左侧栏：液态玻璃浮岛 ===== */
.lab-sidebar {
  width: 240px;
  flex-shrink: 0;
  margin: 10px 0 10px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--glass-panel);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  display: flex;
  flex-direction: column;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.lab-sidebar.collapsed {
  width: 62px;
}
.sidebar-head {
  display: flex;
  align-items: center;
  padding: 10px 10px;
  gap: 6px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
}
.sidebar-new-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: var(--font-sans);
}
.sidebar-new-btn:hover {
  background: var(--muted);
  border-color: var(--border);
}
.sidebar-toggle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.sidebar-toggle:hover {
  background: var(--muted);
  color: var(--foreground);
}
.sidebar-sessions {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.06) transparent;
}
.sidebar-sessions::-webkit-scrollbar { width: 4px; }
.sidebar-sessions::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.06); border-radius: 2px; }
.sidebar-sessions::-webkit-scrollbar-track { background: transparent; }
.sidebar-session {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.12s ease;
  color: var(--muted-foreground);
  margin-bottom: 2px;
}
.sidebar-session:hover {
  background: var(--muted);
  color: var(--foreground);
}
.sidebar-session.active {
  background: var(--muted-strong);
  color: var(--foreground);
  box-shadow: var(--liquid-highlight-subtle);
}
.sidebar-session.active .session-title {
  font-weight: 500;
}
.session-info {
  flex: 1;
  min-width: 0;
}
.session-title {
  font-size: 12px;
  font-weight: 400;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
  font-family: var(--font-sans);
}
.session-date {
  font-size: 10px;
  color: var(--muted-foreground);
  margin-top: 2px;
  font-family: var(--font-mono);
  opacity: 0.7;
}

/* ===== 右侧面板：液态玻璃浮岛 ===== */
.lab-right-panel {
  width: 320px;
  flex-shrink: 0;
  margin: 10px 10px 10px 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--glass-panel);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  display: flex;
  flex-direction: column;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
}
.lab-right-panel.collapsed {
  width: 0;
  margin-right: 0;
  border: none;
}
.right-panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--background);
  padding: 0 8px;
}
.right-panel-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 6px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-family: var(--font-sans);
}
.right-panel-tab:hover {
  color: var(--foreground);
}
.right-panel-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.right-panel-close-btn {
  position: absolute;
  top: 8px;
  right: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  cursor: pointer;
  z-index: 2;
  transition: all 0.15s ease;
}
.right-panel-close-btn:hover {
  background: var(--muted);
  color: var(--foreground);
}
.right-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  position: relative;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.06) transparent;
}
.right-panel-body::-webkit-scrollbar { width: 4px; }
.right-panel-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.06); border-radius: 2px; }
.right-panel-body::-webkit-scrollbar-track { background: transparent; }
.right-panel-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.right-panel-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-family: var(--font-sans);
}
.code-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.code-panel-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--muted);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}
.code-panel-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-family: var(--font-sans);
}
.code-panel-info-row span {
  color: var(--muted-foreground);
}
.code-panel-info-row strong {
  font-weight: 500;
  color: var(--foreground);
  font-family: var(--font-mono);
}
.code-panel-preview {
  flex: 1;
  min-height: 200px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.code-panel-download-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px 20px;
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
  font-family: var(--font-sans);
}
.code-panel-download-btn:hover {
  opacity: 0.85;
}

/* ===== 右侧面板任务项：嵌套玻璃 ===== */
.task-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--muted);
  border: 1px solid var(--border-light);
  transition: all 0.2s ease;
}
.task-item.task-done {
  border-color: var(--border-light);
  opacity: 0.7;
}
.task-item.task-doing {
  border-color: rgba(0, 113, 227, 0.4);
  background: var(--accent-light);
}
.task-item.task-error {
  border-color: rgba(255, 59, 48, 0.4);
  background: var(--destructive-light);
}
.task-item.task-pending {
  opacity: 0.5;
}
.task-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  margin-top: 1px;
}
.task-done .task-icon {
  background: #34c759;
  color: white;
}
.task-error .task-icon {
  background: var(--destructive);
  color: white;
}
.task-doing .task-icon {
  background: transparent;
}
.task-pending .task-icon {
  background: var(--muted);
  color: var(--muted-foreground);
}
.task-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: taskSpin 0.8s linear infinite;
}
@keyframes taskSpin {
  to { transform: rotate(360deg); }
}
.task-content {
  flex: 1;
  min-width: 0;
}
.task-title {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.4;
}
.task-desc {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 2px;
  line-height: 1.4;
}

/* ===== 图标按钮：扁平细线、8px 圆角（composer 工具区） ===== */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.15s ease;
}
.icon-btn:hover {
  background: var(--muted);
  color: var(--foreground);
}
.icon-btn--active {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}
.icon-btn--warn {
  color: var(--muted-foreground);
  border-color: var(--border);
}
.icon-btn--warn:hover {
  background: var(--muted);
}
.icon-btn-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  font-size: 9px;
  font-weight: 600;
  color: var(--muted-foreground);
}

/* + 直达上传按钮（菜单与样式集弹窗已迁入导航栏灵动岛） */
.plus-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-full);
  background: var(--muted);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  flex-shrink: 0;
}
.plus-btn:hover {
  background: var(--border);
  color: var(--foreground);
}
.plus-btn:active {
  transform: scale(0.94);
}

/* ===== 输入框参数列表框：思考预算/样式集（实底弹层，防透明不可见） ===== */
.composer-pill-wrap {
  position: relative;
  flex-shrink: 0;
}

.composer-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--muted);
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}
.composer-pill:hover {
  background: var(--border-light);
  border-color: var(--border);
  color: var(--foreground);
}
.composer-pill.active {
  background: var(--border);
  border-color: var(--border);
  color: var(--foreground);
}
.composer-pill:active {
  transform: scale(0.96);
}

/* 列表框弹层：高不透明实底 + blur，向上弹出（composer 位于页面底部） */
.pill-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  padding: 5px;
  border: 1px solid var(--liquid-border, rgba(0, 0, 0, 0.1));
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: var(--glass-filter, blur(18px));
  -webkit-backdrop-filter: var(--glass-filter, blur(18px));
  box-shadow: 0 18px 44px rgba(29, 41, 56, 0.18), 0 2px 8px rgba(29, 41, 56, 0.08);
  z-index: 60;
}
.pill-menu--grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  min-width: 260px;
}

.pill-menu-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--foreground);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}
.pill-menu--grid .pill-menu-item {
  justify-content: center;
  padding: 7px 6px;
}
.pill-menu-item:hover {
  background: var(--muted);
}
.pill-menu-item.active {
  background: rgba(0, 113, 227, 0.1);
  color: #0071e3;
}
.pill-menu-item.active:hover {
  background: rgba(0, 113, 227, 0.14);
}

.pill-menu-label {
  font-size: 12.5px;
  font-weight: 650;
  line-height: 1.3;
}
.pill-menu--grid .pill-menu-label {
  font-size: 12px;
}
.pill-menu-hint {
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  line-height: 1.3;
}
.pill-menu-item.active .pill-menu-hint {
  color: rgba(0, 113, 227, 0.75);
}

.pill-menu .popover-enter-active,
.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

/* 暗色：实底深色玻璃 */
html[data-theme="dark"] .pill-menu {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(30, 32, 38, 0.96);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
}
html[data-theme="dark"] .pill-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
html[data-theme="dark"] .pill-menu-item.active {
  background: rgba(41, 151, 255, 0.16);
  color: #64b5ff;
}
html[data-theme="dark"] .pill-menu-item.active:hover {
  background: rgba(41, 151, 255, 0.22);
}

/* 窄窗（横竖屏）：pill 退化为图标钮，保住工具区一行不溢出 */
@media (max-width: 900px) {
  .composer-pill span {
    display: none;
  }
  .composer-pill {
    padding: 0 8px;
  }
  .pill-menu--grid {
    min-width: 220px;
  }
}

/* ===== 附件标签：Apple 风格胶囊 ===== */
.composer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 18px 6px;
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 12px;
  background: var(--muted);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  max-width: 280px;
}
.chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  border-radius: var(--radius-full);
  opacity: 0.5;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}
.chip-remove:hover {
  opacity: 1;
}

/* ===== 空状态：Apple 风格大留白居中 ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px 48px;
  gap: 32px;
}
.empty-hero {
  text-align: center;
  max-width: 580px;
}
.hero-icon {
  display: none;
}
.hero-title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 26px;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--foreground);
  text-wrap: balance;
}
.hero-subtitle {
  margin: 10px 0 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--muted-foreground);
  max-width: 440px;
  margin-left: auto;
  margin-right: auto;
}

/* ===== 对话框（Composer）：液态玻璃主面板 ===== */
.composer {
  width: min(100%, 720px);
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border: 1px solid var(--liquid-border);
  border-radius: 24px;
  box-shadow: var(--glass-shadow-lg), var(--liquid-highlight);
  display: flex;
  flex-direction: column;
  overflow: visible;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.composer:focus-within {
  border-color: rgba(0, 113, 227, 0.35);
  box-shadow: 0 0 0 4px var(--accent-light), var(--glass-shadow-lg), var(--liquid-highlight);
}
.composer-input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  padding: 16px 22px 8px;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  color: var(--foreground);
  min-height: 52px;
  box-sizing: border-box;
}
.composer-input::placeholder {
  color: var(--muted-foreground);
}
.composer-input:disabled {
  opacity: 0.5;
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px 10px 14px;
}
.composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.composer-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--accent);
  color: var(--accent-foreground);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease, background-color 0.15s ease;
  box-shadow: none;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 34px;
}
.composer-send:hover:not(:disabled) {
  background: var(--accent-hover, #0058b9);
}
.composer-send:active:not(:disabled) {
  transform: scale(0.96);
}
.composer-send:disabled {
  background: var(--muted);
  color: var(--muted-foreground);
  cursor: not-allowed;
  box-shadow: none;
}
/* 停止生成按钮：与发送按钮同尺寸，但用中性灰背景以示区别 */
.composer-stop {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--muted-foreground);
  color: #ffffff;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.1s ease;
  box-shadow: none;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 34px;
}
.composer-stop:hover {
  opacity: 0.88;
}
.composer-stop:active {
  transform: scale(0.96);
}

/* ===== 建议提示：Apple 风格浅底胶囊 ===== */
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 720px;
}
.suggestion-chip {
  padding: 8px 14px;
  background: var(--muted);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  color: var(--muted-foreground);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  box-shadow: none;
}
.suggestion-chip:hover {
  background: var(--border);
  color: var(--foreground);
}
.suggestion-chip:active {
  transform: scale(0.96);
}

/* ===== 加载状态 ===== */
.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}
.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 48px 40px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.loading-text {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--muted-foreground);
  font-weight: 400;
}

.thread {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.06) transparent;
}
.thread::-webkit-scrollbar {
  width: 4px;
}
.thread::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 2px;
}
.thread::-webkit-scrollbar-track {
  background: transparent;
}

/* ===== 消息：文字驱动层级，轻量化气泡 ===== */
.message {
  display: flex;
  gap: 12px;
  max-width: 100%;
}
.message.user {
  flex-direction: row-reverse;
}
.message-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--muted);
  color: var(--foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: 11px;
  flex-shrink: 0;
  box-shadow: none;
  margin-top: 2px;
}
.message.user .message-avatar {
  background: var(--accent);
  color: var(--accent-foreground);
}
.message.assistant .message-avatar {
  background: var(--foreground);
  color: var(--foreground-inverse);
}
.message-body {
  min-width: 0;
  max-width: calc(100% - 36px);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.message.user .message-body {
  align-items: flex-end;
}
.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 11px;
}
.message.user .message-meta {
  flex-direction: row-reverse;
}
.meta-name {
  font-weight: 500;
  color: var(--foreground);
}
.meta-time {
  color: var(--muted-foreground);
}
.message-content {
  padding: 0;
  border-radius: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: none;
  max-width: 100%;
}
.message.user .message-content {
  background: var(--accent);
  color: var(--accent-foreground);
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border-bottom-right-radius: 2px;
}
.message.assistant .message-content {
  background: transparent;
  border: none;
  border-radius: 0;
}
.message-attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--foreground);
  font-weight: 400;
  width: fit-content;
}
.message.user .message-attachment {
  background: var(--muted);
  border-color: var(--border);
  color: var(--foreground);
}
.message-ops {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
  font-weight: 400;
  width: fit-content;
}
.ops-view {
  background: transparent;
  border: none;
  color: var(--accent);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}
.ops-view:hover {
  text-decoration: underline;
}

/* ===== PPT 结果卡片：液态玻璃面板 ===== */
.ppt-result-card {
  width: 100%;
  max-width: 560px;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}
.ppt-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-light);
}
.ppt-result-title {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.3;
}
.ppt-result-meta {
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 4px;
}
.ppt-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  color: var(--accent-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}
.ppt-download-btn:hover {
  opacity: 0.85;
}
.ppt-slide-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  padding: 12px 16px 16px;
}
.ppt-slide-mini {
  padding: 10px;
  background: var(--muted);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  position: relative;
  min-height: 70px;
}
.slide-mini-num {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 10px;
  color: var(--muted-foreground);
  font-weight: 500;
  font-family: var(--font-mono);
}
.slide-mini-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.3;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.slide-mini-points {
  font-size: 10px;
  color: var(--muted-foreground);
}
.slide-title .slide-mini-title {
  color: var(--foreground);
}
.slide-end .slide-mini-title {
  color: var(--muted-foreground);
}

/* ===== Word 内容块预览：浅灰背景容器 ===== */
.word-block-previews {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px 16px;
}
.word-block-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 11px;
}
.block-type-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted-foreground);
  font-size: 9px;
  font-weight: 500;
  font-family: var(--font-mono);
}
.block-heading .block-type-tag {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-light);
}
.block-text {
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

/* ===== 进度卡片：液态玻璃 + 流光进度条 ===== */
.progress-card {
  width: 100%;
  max-width: 480px;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}
.progress-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.progress-icon {
  flex-shrink: 0;
}
.progress-info {
  flex: 1;
  min-width: 0;
}
.progress-title {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.3;
}
.progress-text {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress-bar-container {
  width: 100%;
  height: 3px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 8px;
}
.progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.3s ease-out;
}
.progress-percent {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
  text-align: right;
}

/* ===== 大纲预览卡片：液态玻璃面板 ===== */
.outline-card {
  width: 100%;
  max-width: 560px;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}
.outline-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
}
.outline-card-title {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.3;
}
.outline-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-sans);
  font-size: 11px;
  color: var(--muted-foreground);
  margin-top: 4px;
  flex-shrink: 0;
}
.outline-card-tag {
  padding: 2px 8px;
  background: var(--accent-light);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 500;
  font-family: var(--font-mono);
  letter-spacing: 0;
}
.outline-items {
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 0;
}
.outline-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  transition: background 0.12s ease;
}
.outline-item:hover {
  background: var(--muted);
}
.outline-item-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--muted-foreground);
  margin-top: 1px;
}
.outline-type-cover .outline-item-num,
.outline-type-end .outline-item-num {
  background: var(--accent);
  color: var(--accent-foreground);
  border-color: transparent;
}
.outline-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.outline-item-title {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.4;
}
.outline-item-summary {
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.outline-item-type-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
  color: var(--muted-foreground);
  margin-top: 2px;
}

/* 样式集选择模态框样式已删除：样式集选择迁入导航栏灵动岛展开区 */

/* ===== 思考动画：三点波浪 ===== */
.thinking {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
}
.thinking .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-foreground);
  opacity: 0.4;
  animation: thinkingWave 1.2s ease-in-out infinite;
}
.thinking .dot:nth-child(2) { animation-delay: 0.15s; }
.thinking .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes thinkingWave {
  0%, 60%, 100% { opacity: 0.35; transform: scale(0.85); }
  30% { opacity: 1; transform: scale(1.1); }
}

/* ===== 底部对话框：液态玻璃 sticky ===== */
.composer-bottom {
  position: sticky;
  bottom: 0;
  margin: 12px 0 0;
  padding: 8px 0 4px;
  background: linear-gradient(180deg, transparent 0%, rgba(238, 240, 243, 0.55) 42%, rgba(238, 240, 243, 0.85) 100%);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  z-index: 5;
}

/* ===== 错误提示：液态玻璃 toast ===== */
.error-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  color: var(--destructive);
  border: 1px solid rgba(255, 59, 48, 0.35);
  border-radius: var(--radius-full);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 400;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  z-index: 50;
  max-width: 90vw;
}
.error-text {
  flex: 1;
}
.error-close {
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--destructive);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}
.error-close:hover {
  background: var(--destructive-light);
}
.toast-enter-active, .toast-leave-active {
  transition: opacity 0.2s ease;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
}

/* ===== 抽屉：液态玻璃侧滑面板 ===== */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.18);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  z-index: 100;
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: min(420px, 92vw);
  height: 100dvh;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter);
  -webkit-backdrop-filter: var(--glass-filter);
  border-left: 1px solid var(--liquid-border);
  box-shadow: var(--liquid-shadow-overlay);
  z-index: 101;
  display: flex;
  flex-direction: column;
}
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}
.drawer-title {
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 500;
  font-size: 16px;
  color: var(--foreground);
}
.drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  transition: background 0.15s ease;
}
.drawer-close:hover {
  background: var(--muted);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.06) transparent;
}
.drawer-body::-webkit-scrollbar { width: 4px; }
.drawer-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.06); border-radius: 2px; }
.drawer-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: transparent;
}
.drawer-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground);
  text-align: left;
  transition: background 0.15s ease;
}
.drawer-section-head:hover {
  background: var(--muted);
}
.drawer-section-head span {
  flex: 1;
}
.drawer-count {
  flex: 0 0 auto !important;
  font-size: 11px;
  color: var(--muted-foreground);
  background: var(--muted);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 400;
  font-family: var(--font-mono);
}
.drawer-chevron {
  transition: transform 0.2s ease;
  color: var(--muted-foreground);
}
.drawer-section-head.open .drawer-chevron {
  transform: rotate(180deg);
}
.drawer-section-body {
  padding: 0 14px 12px;
  border-top: 1px solid var(--border);
}
.drawer-enter-active, .drawer-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.drawer-enter-from, .drawer-leave-to {
  transform: translateX(100%);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* ===== Code 结果卡片：液态玻璃面板 ===== */
.code-result-card {
  width: 100%;
  max-width: 580px;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-filter-sm);
  -webkit-backdrop-filter: var(--glass-filter-sm);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--glass-shadow), var(--glass-highlight);
}
.code-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
}
.code-result-title {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  line-height: 1.3;
}
.code-result-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted-foreground);
  flex-shrink: 0;
}
.code-preview-wrap {
  padding: 12px;
  background: var(--code-bg);
}

/* ===== 对话树视图 ===== */
.tree-view {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tree-branch {
  display: flex;
  flex-direction: column;
}
.tree-branch-path {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s ease;
}
.tree-node:hover {
  background: var(--muted);
}
.tree-node--active {
  background: var(--accent-light);
}
.tree-node--active .tree-node-label {
  color: var(--accent);
  font-weight: 500;
}
.tree-node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex-shrink: 0;
}
.tree-node--active .tree-node-dot {
  background: var(--accent);
}
.tree-node-info {
  flex: 1;
  min-width: 0;
}
.tree-node-label {
  font-size: 12px;
  color: var(--foreground);
  font-family: var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 文档大纲树 ===== */
.outline-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.outline-tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: var(--font-sans);
}
.outline-tree-type {
  flex-shrink: 0;
  padding: 1px 6px;
  background: var(--muted);
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--muted-foreground);
}
.outline-tree-text {
  flex: 1;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 响应式 ===== */
@media (max-width: 768px) {
  .empty-state {
    padding: 32px 16px 28px;
  }
  .conversation {
    padding: 20px 16px 0;
  }
  .message-body {
    max-width: calc(100% - 32px);
  }
  .ppt-slide-previews {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  }
  .lab-sidebar {
    position: absolute;
    z-index: 50;
    height: 100%;
  }
  .lab-right-panel {
    position: absolute;
    right: 0;
    z-index: 50;
    height: 100%;
  }
}

/* ===== 暗色主题（液态玻璃 audit 2026-09-12） ===== */
html[data-theme="dark"] .lab-page {
  --background: transparent;
  --surface-solid: #1a1a24;
  --foreground: #f5f5f7;
  --foreground-inverse: #1a1a24;
  --muted: rgba(255, 255, 255, 0.07);
  --muted-strong: rgba(255, 255, 255, 0.11);
  --muted-foreground: #a1a1a6;
  --border: rgba(255, 255, 255, 0.09);
  --border-light: rgba(255, 255, 255, 0.06);
  --accent: #409cff;
  --accent-hover: #6cb2ff;
  --accent-light: rgba(64, 156, 255, 0.16);
  --destructive-light: rgba(255, 59, 48, 0.16);
  --code-bg: rgba(255, 255, 255, 0.05);
  --code-border: rgba(255, 255, 255, 0.09);
  color: var(--foreground);
}
html[data-theme="dark"] .lab-page {
  /* 暗色环境底：深空灰 + 冷色光斑，玻璃浮岛自动从 --liquid-* 暗色 token 取值 */
  background:
    radial-gradient(52% 42% at 12% -6%, rgba(64, 156, 255, 0.1), transparent 68%),
    radial-gradient(46% 40% at 92% 8%, rgba(52, 199, 89, 0.07), transparent 66%),
    linear-gradient(180deg, #17171f 0%, #121218 100%);
}

</style>
