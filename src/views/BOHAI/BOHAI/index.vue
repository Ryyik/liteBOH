<template>
    <div class="bohai-page" :class="{ 'embedded-mode': embedded }" :data-ui-style="currentUiStyle">
        <div class="bohai-container">
            <aside :class="['sidebar', { open: isSidebarOpen }]">
                <div class="sidebar-header">
                    <button @click="startNewChat" class="new-chat-btn">
                        <Plus size="16" />
                        <span>新对话</span>
                    </button>
                    <button class="sidebar-close-btn" @click="isSidebarOpen = false">
                        <X size="20" />
                    </button>
                </div>

                <div class="session-list custom-scrollbar">
                    <div v-for="group in groupedChatSessions" :key="group.id" class="session-group">
                        <div class="session-group-title">{{ group.label }}</div>
                        <div v-for="item in group.items" :key="item.session.timestamp"
                            @click="switchSession(item.index); isSidebarOpen = false"
                            :class="['session-item', { active: currentSessionIndex === item.index }]">
                            <MessageSquare size="16" />
                            <span class="session-title">{{ item.session.title || '新对话' }}</span>
                            <button v-if="chatSessions.length > 1" @click.stop="deleteSession(item.index)" class="delete-btn">
                                <Trash2 size="14" />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            <div v-if="isSidebarOpen" class="sidebar-overlay" @click="isSidebarOpen = false"></div>

            <main class="main-content">
                <header class="chat-header">
                    <div class="header-left">
                        <div v-if="!embedded" class="mac-window-controls" aria-hidden="true">
                            <span class="control-dot red"></span>
                            <span class="control-dot yellow"></span>
                            <span class="control-dot green"></span>
                        </div>
                        <button class="header-icon-btn sidebar-toggle-btn" title="打开侧边栏" @click="isSidebarOpen = !isSidebarOpen">
                            <PanelLeft size="18" />
                        </button>
                        <button class="header-icon-btn header-new-chat-btn" title="新对话" @click="startNewChat">
                            <PenLine size="18" />
                        </button>
                    </div>

                    <div class="header-content" :title="currentSessionTitle">
                        <span class="header-title">BOH AI</span>
                        <ChevronDown size="15" aria-hidden="true" />
                        <select v-model="currentModeId" class="header-mode-select" :aria-label="`当前模式：${currentMode.name}`">
                            <option v-for="mode in chatModes" :key="mode.id" :value="mode.id">
                                {{ mode.name }}
                            </option>
                        </select>
                    </div>

                    <div class="header-actions">
                        <button v-if="isPlanExperienceActive" class="header-icon-btn plan-header-btn"
                            :class="{ active: planPanelOpen }" title="计划面板" @click="planPanelOpen = true">
                            <ListChecks size="18" />
                        </button>
                        <button class="header-icon-btn" title="分享当前对话" @click="shareCurrentConversation">
                            <Share2 size="18" />
                        </button>
                    </div>
                </header>

                <section v-if="isPlanExperienceActive" class="plan-progress-dock" aria-label="计划进度">
                    <div class="plan-dock-head">
                        <span class="plan-dock-icon">
                            <ListChecks size="18" />
                        </span>
                        <div class="plan-dock-copy">
                            <strong>{{ planPanelTitle }}</strong>
                            <span>{{ planPanelSubtitle }}</span>
                        </div>
                        <button type="button" class="plan-dock-open" @click="planPanelOpen = true">
                            展开
                        </button>
                    </div>
                    <div class="plan-step-strip">
                        <div v-for="step in planTodoItems" :key="step.id"
                            class="plan-step-chip" :class="step.state">
                            <span class="plan-step-dot" aria-hidden="true"></span>
                            <span>{{ step.title }}</span>
                        </div>
                    </div>
                </section>

                <section v-if="isAgentClusterModeActive" class="agent-cluster-dock" aria-label="Agent 集群进度">
                    <div class="agent-cluster-dock-head">
                        <span class="agent-cluster-dock-icon">
                            <Network size="18" />
                        </span>
                        <div class="agent-cluster-dock-copy">
                            <strong>{{ agentClusterPanelTitle }}</strong>
                            <span>{{ agentClusterPanelSubtitle }}</span>
                        </div>
                        <span v-if="agentClusterState?.isRunning" class="agent-cluster-dock-badge running">
                            运行中
                        </span>
                        <span v-else-if="agentClusterState?.degraded" class="agent-cluster-dock-badge degraded">
                            已降级
                        </span>
                        <span v-else-if="agentClusterState?.answer" class="agent-cluster-dock-badge done">
                            已完成
                        </span>
                    </div>
                    <div class="agent-cluster-strip">
                        <div v-for="entry in agentClusterEntries" :key="entry.key"
                            class="agent-cluster-chip" :class="entry.status">
                            <span class="agent-cluster-dot" aria-hidden="true"></span>
                            <span class="agent-cluster-chip-label">{{ entry.label }}</span>
                            <span v-if="entry.status === 'running'" class="agent-cluster-chip-meta">…</span>
                            <span v-else-if="Number.isFinite(entry.ms) && entry.ms > 0" class="agent-cluster-chip-meta">
                                {{ formatAgentClusterMs(entry.ms) }}
                            </span>
                        </div>
                    </div>
                </section>

                <div ref="chatContainer" class="chat-container custom-scrollbar" @scroll="updateActiveUserMessageFromScroll">
                    <div v-if="messages.length === 0" class="empty-state">
                        <div class="logo-container">
                            <Bot size="64" />
                        </div>
                        <h2>Hello，{{ userInfo?.username || '朋友' }}</h2>
                        <p class="empty-subtitle">我可以帮你整理、创作、查询和执行社区操作。</p>
                        <div class="empty-suggestion-grid" aria-label="对话建议">
                            <button v-for="card in emptySuggestionCards" :key="card.prompt" type="button"
                                class="empty-suggestion-card" :disabled="isLoading" @click="sendEmptySuggestion(card)">
                                <span class="empty-suggestion-icon">
                                    <MessageSquare v-if="card.icon === 'forum'" size="18" />
                                    <Archive v-else-if="card.icon === 'cloud'" size="18" />
                                    <Code v-else size="18" />
                                </span>
                                <span class="empty-suggestion-copy">
                                    <span class="empty-suggestion-category">{{ card.category }}</span>
                                    <span class="empty-suggestion-text">{{ card.label }}</span>
                                </span>
                            </button>
                        </div>
                    </div>

                    <button v-if="hiddenMessageCount > 0" type="button" class="load-earlier-btn" @click="showMoreMessages">
                        显示更早 {{ hiddenMessageCount }} 条消息
                    </button>

                    <div v-for="({ message: msg, index: idx }) in visibleMessageItems" :key="idx" :class="['message-wrapper', msg.role]"
                        :data-message-index="idx">
                        <div class="message-content-inner">
                            <div class="message-header">
                                <span v-if="msg.role === 'assistant'" class="message-role">BOH AI</span>
                                <button v-if="msg.role === 'assistant' && !isThinking" @click="deleteMessage(idx)"
                                    class="delete-message-btn" title="删除此消息">
                                    <Trash2 size="14" />
                                </button>
                            </div>
                            <div :class="['message', msg.role]">
                                <div v-if="getMessageActionNotes(msg).length" class="message-action-notes">
                                    <p v-for="note in getMessageActionNotes(msg)" :key="note">{{ note }}</p>
                                </div>
                                <div v-if="shouldRenderPlanTodoCard(msg, idx)" class="plan-todo-card">
                                    <div class="plan-todo-card-head">
                                        <span class="plan-todo-card-icon">
                                            <ListChecks size="17" />
                                        </span>
                                        <div>
                                            <strong>计划代办</strong>
                                            <span>{{ planTodoSummary }}</span>
                                        </div>
                                    </div>
                                    <div class="plan-todo-list">
                                        <div v-for="todo in planTodoItems" :key="todo.id"
                                            class="plan-todo-item" :class="todo.state">
                                            <span class="plan-todo-check">
                                                <CheckCircle2 v-if="todo.state === 'done'" size="16" />
                                                <LoaderCircle v-else-if="todo.state === 'active'" size="16" />
                                                <Circle v-else size="16" />
                                            </span>
                                            <span class="plan-todo-copy">
                                                <strong>{{ todo.title }}</strong>
                                                <span>{{ todo.detail }}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="shouldRenderPostDraftEditor(msg, idx)" class="action-draft-card">
                                    <div class="action-draft-head">
                                        <span class="action-draft-title">发帖草稿</span>
                                        <span class="action-draft-subtitle">编辑后可直接发布</span>
                                    </div>
                                    <label class="draft-field-label">AI总结标题</label>
                                    <input v-model="postDraftTitle" type="text" maxlength="64" class="draft-input"
                                        placeholder="AI会先提炼一个帖子标题" />
                                    <label class="draft-field-label">AI撰写正文</label>
                                    <textarea v-model="postDraftContent" rows="5" maxlength="3000"
                                        class="draft-textarea" placeholder="AI会把你的想法整理成可发布正文"></textarea>
                                    <p v-if="actionDraftFeedback" class="draft-feedback">{{ actionDraftFeedback }}</p>
                                    <div class="draft-actions">
                                        <button type="button" class="draft-btn secondary"
                                            :disabled="!isPostDraftDirty || draftUiBusy" @click="applyPostDraftEdits">
                                            应用修改
                                        </button>
                                        <button type="button" class="draft-btn primary" :disabled="draftUiBusy"
                                            @click="confirmDraftFromUi">
                                            确认发布
                                        </button>
                                        <button type="button" class="draft-btn ghost" :disabled="draftUiBusy"
                                            @click="cancelDraftFromUi">
                                            取消
                                        </button>
                                    </div>
                                </div>
                                <div v-else-if="shouldRenderMailDraftEditor(msg, idx)" class="action-draft-card">
                                    <div class="action-draft-head">
                                        <span class="action-draft-title">私信草稿</span>
                                        <span class="action-draft-subtitle">编辑后可直接发送</span>
                                    </div>
                                    <label class="draft-field-label">收件人用户名</label>
                                    <input v-model="mailDraftReceiver" type="text" maxlength="40" class="draft-input"
                                        placeholder="请输入准确用户名" />
                                    <label class="draft-field-label">主题</label>
                                    <input v-model="mailDraftSubject" type="text" maxlength="80" class="draft-input"
                                        placeholder="请输入私信主题" />
                                    <label class="draft-field-label">内容</label>
                                    <textarea v-model="mailDraftContent" rows="5" maxlength="3000"
                                        class="draft-textarea" placeholder="请输入私信正文"></textarea>
                                    <p v-if="actionDraftFeedback" class="draft-feedback">{{ actionDraftFeedback }}</p>
                                    <div class="draft-actions">
                                        <button type="button" class="draft-btn secondary"
                                            :disabled="!isMailDraftDirty || draftUiBusy" @click="applyMailDraftEdits">
                                            应用修改
                                        </button>
                                        <button type="button" class="draft-btn primary" :disabled="draftUiBusy"
                                            @click="confirmDraftFromUi">
                                            确认发送
                                        </button>
                                        <button type="button" class="draft-btn ghost" :disabled="draftUiBusy"
                                            @click="cancelDraftFromUi">
                                            取消
                                        </button>
                                    </div>
                                </div>
                                <div v-else-if="shouldRenderCloudReferenceConsent(msg, idx)" class="consent-card action-draft-card">
                                    <div class="action-draft-head consent-card-head">
                                        <span class="action-draft-title">允许 Cloud+ 私有参考</span>
                                        <span class="action-draft-subtitle">仅用于当前账号回答，不会公开</span>
                                    </div>
                                    <div class="message-content consent-copy" v-html="renderMarkdown(msg.content)"></div>
                                    <div class="draft-actions consent-actions">
                                        <button type="button" class="draft-btn primary" @click="approveCloudReferenceConsent">
                                            同意
                                        </button>
                                        <button type="button" class="draft-btn secondary" @click="rejectCloudReferenceConsent">
                                            拒绝
                                        </button>
                                    </div>
                                </div>
                                <div v-else-if="shouldRenderQuickNoteConfirm(msg, idx)" class="quick-note-card action-draft-card">
                                    <div class="action-draft-head consent-card-head">
                                        <span class="action-draft-title">记录到 Cloud+？</span>
                                        <span class="action-draft-subtitle">标题由 BOH AI 自动生成</span>
                                    </div>
                                    <div class="quick-note-preview">
                                        <span class="quick-note-preview-label">标题</span>
                                        <strong>{{ pendingQuickNote.title }}</strong>
                                    </div>
                                    <div class="quick-note-preview">
                                        <span class="quick-note-preview-label">原文摘录</span>
                                        <p>{{ pendingQuickNote.content }}</p>
                                    </div>
                                    <p v-if="pendingQuickNote.error" class="draft-feedback">{{ pendingQuickNote.error }}</p>
                                    <div class="draft-actions consent-actions">
                                        <button type="button" class="draft-btn primary"
                                            :disabled="pendingQuickNote.busy" @click="confirmQuickNoteDraft">
                                            {{ pendingQuickNote.busy ? '记录中...' : '记录到 Cloud+' }}
                                        </button>
                                        <button type="button" class="draft-btn secondary"
                                            :disabled="pendingQuickNote.busy" @click="dismissQuickNoteDraft">
                                            不记录
                                        </button>
                                    </div>
                                </div>
                                <div v-else-if="shouldRenderPageDraftEditor(msg, idx)" class="action-draft-card">
                                    <div class="action-draft-head">
                                        <span class="action-draft-title">网页草稿</span>
                                        <span class="action-draft-subtitle">可在创作工作台中继续编辑</span>
                                    </div>
                                    <label class="draft-field-label">页面类型</label>
                                    <input :value="pageDraftType" type="text" class="draft-input" disabled />
                                    <label class="draft-field-label">HTML 代码</label>
                                    <textarea :value="pageDraftHtml" rows="8" class="draft-textarea code-textarea"
                                        spellcheck="false" readonly></textarea>
                                    <div class="draft-actions">
                                        <button type="button" class="draft-btn primary" :disabled="draftUiBusy"
                                            @click="sendPageToStudio">
                                            <ExternalLink size="14" />
                                            打开创作工作台
                                        </button>
                                        <button type="button" class="draft-btn secondary" :disabled="draftUiBusy"
                                            @click="copyPageHtml">
                                            复制代码
                                        </button>
                                        <button type="button" class="draft-btn ghost" :disabled="draftUiBusy"
                                            @click="cancelDraftFromUi">
                                            取消
                                        </button>
                                    </div>
                                </div>
                                <div v-if="!shouldRenderPostDraftEditor(msg, idx) && !shouldRenderMailDraftEditor(msg, idx) && !shouldRenderCloudReferenceConsent(msg, idx) && !shouldRenderQuickNoteConfirm(msg, idx) && !shouldRenderPageDraftEditor(msg, idx)"
                                    class="message-content" v-html="renderMarkdown(msg.content)"></div>
                                <div v-if="shouldRenderResourceResultsCard(msg)" class="resource-results-card">
                                    <div class="resource-results-card-top">
                                        <div class="resource-results-card-main">
                                            <span class="resource-results-icon">
                                                <Package size="18" />
                                            </span>
                                            <div class="resource-results-copy">
                                                <strong>{{ getResourceSearchTitle(msg) }}</strong>
                                                <span>{{ getResourceSearchSubtitle(msg) }}</span>
                                            </div>
                                        </div>
                                        <div class="resource-results-actions">
                                            <button type="button" class="draft-btn primary" @click="openResourceResults(msg)">
                                                查看资源列表
                                            </button>
                                        <button type="button" class="draft-btn secondary" @click="openResourceCenter(msg)">
                                                打开资源中心
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="getInlineResourceResults(msg).length" class="resource-inline-list">
                                        <a
                                            v-for="resource in getInlineResourceResults(msg)"
                                            :key="resource.project_id"
                                            class="resource-inline-item"
                                            :href="resource.url"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <img v-if="resource.icon_url" :src="resource.icon_url" :alt="resource.title" loading="lazy" />
                                            <span v-else class="resource-inline-fallback">
                                                <Package size="16" />
                                            </span>
                                            <span class="resource-inline-body">
                                                <strong>{{ resource.title }}</strong>
                                                <span>{{ resource.description || resource.author || '暂无描述' }}</span>
                                            </span>
                                            <span class="resource-inline-meta">
                                                <Download size="13" />
                                                {{ formatResourceCount(resource.downloads) }}
                                            </span>
                                        </a>
                                    </div>
                                </div>
                                <div v-if="isThinking && idx === messages.length - 1 && msg.role === 'assistant'"
                                    class="thinking grok-thinking" aria-live="polite" aria-label="正在处理">
                                    <span class="grok-dot-grid" aria-hidden="true">
                                        <span v-for="dotIndex in 9" :key="dotIndex"></span>
                                    </span>
                                    <span class="grok-thinking-text">
                                        {{ getGrokLoadingLabel() }} · {{ Math.max(1, Math.floor(thinkingTime || 0)) }}s
                                    </span>
                                </div>
                            </div>
                            <div v-if="msg.role === 'assistant' && !(isThinking && idx === messages.length - 1)"
                                class="message-actions" aria-label="回复操作">
                                <button type="button" class="message-action-btn" title="复制" @click="copyMessage(msg.content)">
                                    <Copy size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="朗读" @click="readMessageAloud(msg.content)">
                                    <Volume2 size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="赞同"
                                    :class="{ active: getMessageFeedback(idx) === 'up' }"
                                    @click="setMessageFeedback(idx, 'up')">
                                    <ThumbsUp size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="不赞同"
                                    :class="{ active: getMessageFeedback(idx) === 'down' }"
                                    @click="setMessageFeedback(idx, 'down')">
                                    <ThumbsDown size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="更多"
                                    :class="{ active: isMessageDetailsOpen(idx) }"
                                    @click="toggleMessageDetails(idx)">
                                    <MoreHorizontal size="16" />
                                </button>
                            </div>
                            <div v-if="isMessageDetailsOpen(idx)" class="message-meta-panel">
                                <div v-if="getMessageRetrievalTrace(msg)" class="message-meta-section">
                                    <strong>检索观察</strong>
                                    <p>{{ getRetrievalTraceSummary(msg) }}</p>
                                    <div v-if="getRetrievalTraceSources(msg).length" class="meta-chip-row">
                                        <span v-for="source in getRetrievalTraceSources(msg)" :key="source.connectorId || source.label"
                                            class="meta-chip" :class="{ failed: !source.ok }">
                                            {{ source.label || source.source }} · {{ source.ok ? `${source.total || 0}条` : '失败' }}
                                        </span>
                                    </div>
                                </div>
                                <div v-if="getMessageActionAudit(msg)" class="message-meta-section">
                                    <strong>动作审计</strong>
                                    <p>{{ formatActionAudit(getMessageActionAudit(msg)) }}</p>
                                </div>
                                <div v-if="!getMessageRetrievalTrace(msg) && !getMessageActionAudit(msg)" class="message-meta-section">
                                    <p>这条回复没有可展示的检索或动作记录。</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <nav v-if="userMessageNavItems.length > 1" class="conversation-jump-nav" aria-label="用户消息导航">
                    <button v-for="item in userMessageNavItems" :key="item.index" type="button"
                        class="conversation-jump-item"
                        :class="{ active: activeUserMessageIndex === item.index }"
                        :title="item.fullText"
                        @click="scrollToMessage(item.index)">
                        <span class="conversation-jump-label">{{ item.label }}</span>
                        <span class="conversation-jump-mark" aria-hidden="true"></span>
                    </button>
                </nav>

                <footer class="input-area">
                    <div v-if="isCommandMode" class="quick-prompts">
                        <button v-for="item in commandQuickPrompts" :key="item.label" type="button"
                            class="quick-prompt-btn" @click="applyQuickPrompt(item.prompt)">
                            {{ item.label }}
                        </button>
                    </div>

                    <div class="input-box">
                        <div class="input-left">
                            <button @click="toggleFeaturesMenu" class="features-btn"
                                :class="{ active: showFeaturesMenu }">
                                <Plus size="18" />
                            </button>
                            <div v-if="showFeaturesMenu" class="features-menu">
                                <div class="feature-item" @click="toggleCommandMode">
                                    <span class="feature-icon">
                                        <Code size="16" />
                                    </span>
                                    <span class="feature-name">指令模式</span>
                                    <span v-if="isCommandMode" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" @click="toggleSearch">
                                    <span class="feature-icon">
                                        <Globe size="16" />
                                    </span>
                                    <span class="feature-name">联网搜索</span>
                                    <span v-if="isSearching" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" @click="toggleForumSearch">
                                    <span class="feature-icon">
                                        <MessageSquare size="16" />
                                    </span>
                                    <span class="feature-name">论坛检索</span>
                                    <span v-if="isForumSearchEnabled" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" @click="toggleMemoryCaptureMode">
                                    <span class="feature-icon">
                                        <Archive size="16" />
                                    </span>
                                    <span class="feature-name">公共记忆</span>
                                    <span v-if="isMemoryCaptureEnabled" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" :class="{ disabled: isTreeholeMemoryToggling }"
                                    @click="toggleTreeholeMemoryMode">
                                    <span class="feature-icon">
                                        <Database size="16" />
                                    </span>
                                    <span class="feature-name">Cloud+ 参考</span>
                                    <span v-if="isTreeholeMemoryToggling" class="feature-status">检查中...</span>
                                    <span v-else-if="isTreeholeMemoryEnabled" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" @click="toggleQuickNoteCaptureMode">
                                    <span class="feature-icon">
                                        <NotebookPen size="16" />
                                    </span>
                                    <span class="feature-name">随手记</span>
                                    <span v-if="isQuickNoteEnabled" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-item" @click="togglePlanModeFromMenu">
                                    <span class="feature-icon">
                                        <ListChecks size="16" />
                                    </span>
                                    <span class="feature-name">Plan 模式</span>
                                    <span v-if="isPlanModeEnabled" class="feature-status active">开启</span>
                                    <span v-else class="feature-status">关闭</span>
                                </div>
                                <div class="feature-style-panel">
                                    <div class="feature-style-title">回答风格</div>
                                    <div class="feature-style-options">
                                        <button v-for="style in responseStyleOptions" :key="style.id" type="button"
                                            class="feature-style-option"
                                            :class="{ active: currentResponseStyleId === style.id }"
                                            @click="selectResponseStyle(style.id)">
                                            {{ style.shortName || style.name }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="composer-main">
                            <div v-if="isCommandMode || isSearching || isForumSearchEnabled || isMemoryCaptureEnabled || isTreeholeMemoryEnabled || isQuickNoteEnabled || isPlanModeEnabled || currentResponseStyleId !== 'default'"
                                class="composer-chips">
                                <button v-if="isCommandMode" type="button" class="composer-chip" @click="toggleCommandMode">
                                    <Code size="14" />
                                    <span>指令模式</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isSearching" type="button" class="composer-chip" @click="toggleSearch">
                                    <Globe size="14" />
                                    <span>联网搜索</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isForumSearchEnabled" type="button" class="composer-chip" @click="toggleForumSearch">
                                    <MessageSquare size="14" />
                                    <span>论坛检索</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isMemoryCaptureEnabled" type="button" class="composer-chip" @click="toggleMemoryCaptureMode">
                                    <Archive size="14" />
                                    <span>公共记忆</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isTreeholeMemoryEnabled" type="button" class="composer-chip"
                                    :disabled="isTreeholeMemoryToggling" @click="toggleTreeholeMemoryMode">
                                    <Database size="14" />
                                    <span>Cloud+ 参考</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isQuickNoteEnabled" type="button" class="composer-chip" @click="toggleQuickNoteCaptureMode">
                                    <NotebookPen size="14" />
                                    <span>随手记</span>
                                    <X size="13" />
                                </button>
                                <button v-if="isPlanModeEnabled" type="button" class="composer-chip" @click="togglePlanModeFromMenu">
                                    <ListChecks size="14" />
                                    <span>Plan 模式</span>
                                    <X size="13" />
                                </button>
                                <button v-if="currentResponseStyleId !== 'default'" type="button" class="composer-chip neutral"
                                    @click="selectResponseStyle('default')">
                                    <MessageSquare size="14" />
                                    <span>{{ currentResponseStyle.name }}</span>
                                    <X size="13" />
                                </button>
                            </div>
                            <textarea ref="textareaRef" v-model="inputMessage" @keydown.enter="handleEnter"
                                placeholder="有问题，尽管问" class="input-textarea" rows="1" @input="autoResize"></textarea>
                        </div>

                        <div class="input-right">
                            <button type="button" class="mic-btn" title="语音输入暂未开放" @click="notifyUnavailable('语音输入暂未开放')">
                                <Mic size="18" />
                            </button>
                            <div class="input-actions">
                                <button v-if="isLoading" @click="stopGeneration" class="stop-btn">
                                    <Square size="18" />
                                </button>
                                <button v-else @click="sendMessage" :disabled="!inputMessage.trim()" class="send-btn">
                                    <ArrowUp size="18" />
                                </button>
                            </div>
                        </div>
                    </div>
                    <p v-if="rateLimitMessage" class="rate-limit">{{ rateLimitMessage }}</p>
                    <p v-if="uiNotice" class="ui-notice" role="status">{{ uiNotice }}</p>
                </footer>
            </main>
        </div>

        <Teleport to="body">
            <div v-if="planPanelOpen" class="plan-modal-backdrop" role="presentation" @click.self="planPanelOpen = false">
                <section class="plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
                    <header class="plan-modal-header">
                        <div>
                            <span class="plan-modal-kicker">Plan 模式</span>
                            <h2 id="plan-modal-title">{{ planPanelTitle }}</h2>
                            <p>{{ currentPlanGoal }}</p>
                        </div>
                        <button type="button" class="plan-modal-close" title="关闭" @click="planPanelOpen = false">
                            <X size="18" />
                        </button>
                    </header>
                    <div class="plan-modal-body custom-scrollbar">
                        <section class="plan-modal-section">
                            <h3>执行进度</h3>
                            <div class="plan-step-list">
                                <article v-for="step in planTodoItems" :key="step.id"
                                    class="plan-step-row" :class="step.state">
                                    <span class="plan-step-status">
                                        <CheckCircle2 v-if="step.state === 'done'" size="16" />
                                        <LoaderCircle v-else-if="step.state === 'active'" size="16" />
                                        <Circle v-else size="16" />
                                    </span>
                                    <div>
                                        <strong>{{ step.title }}</strong>
                                        <p>{{ step.detail }}</p>
                                    </div>
                                </article>
                            </div>
                        </section>
                        <section class="plan-modal-section plan-modal-grid">
                            <div>
                                <h3>依据状态</h3>
                                <p>{{ planEvidenceSummary }}</p>
                            </div>
                            <div>
                                <h3>风险提示</h3>
                                <p>{{ planRiskSummary }}</p>
                            </div>
                        </section>
                        <section class="plan-modal-section">
                            <h3>下一步行动</h3>
                            <p>{{ planNextAction }}</p>
                        </section>
                    </div>
                    <footer class="plan-modal-footer">
                        <button type="button" class="draft-btn secondary" @click="planPanelOpen = false">
                            收起
                        </button>
                    </footer>
                </section>
            </div>

            <div v-if="resourceModalOpen" class="resource-modal-backdrop" role="presentation" @click.self="closeResourceResults">
                <section class="resource-modal" role="dialog" aria-modal="true" aria-labelledby="resource-modal-title">
                    <header class="resource-modal-header">
                        <div>
                            <span class="resource-modal-kicker">资源搜索结果</span>
                            <h2 id="resource-modal-title">{{ activeResourceSearchTitle }}</h2>
                            <p>{{ activeResourceSearchSubtitle }}</p>
                        </div>
                        <button type="button" class="resource-modal-close" title="关闭" @click="closeResourceResults">
                            <X size="18" />
                        </button>
                    </header>
                    <div class="resource-modal-list custom-scrollbar">
                        <article v-for="resource in activeResourceResults" :key="resource.project_id" class="resource-modal-item">
                            <img v-if="resource.icon_url" :src="resource.icon_url" :alt="resource.title" class="resource-modal-icon" loading="lazy" />
                            <div v-else class="resource-modal-icon fallback">
                                <Package size="22" />
                            </div>
                            <div class="resource-modal-body">
                                <div class="resource-modal-item-head">
                                    <div>
                                        <span class="resource-type-pill">{{ resource.project_type_label || getResourceTypeLabel(resource.project_type) }}</span>
                                        <h3>{{ resource.title }}</h3>
                                    </div>
                                    <a class="resource-open-link" :href="resource.url" target="_blank" rel="noopener noreferrer" title="打开原站">
                                        <ExternalLink size="16" />
                                    </a>
                                </div>
                                <p>{{ resource.description || '这个资源暂时没有描述。' }}</p>
                                <div class="resource-modal-meta">
                                    <span v-if="resource.author">{{ resource.author }}</span>
                                    <span>
                                        <Download size="14" />
                                        {{ formatResourceCount(resource.downloads) }}
                                    </span>
                                    <span>
                                        <Users size="14" />
                                        {{ formatResourceCount(resource.follows) }}
                                    </span>
                                    <span v-if="formatResourceDate(resource.date_modified)">{{ formatResourceDate(resource.date_modified) }}</span>
                                </div>
                            </div>
                        </article>
                        <div v-if="activeResourceResults.length === 0" class="resource-modal-empty">
                            没有可展示的资源结果。
                        </div>
                    </div>
                    <footer class="resource-modal-footer">
                        <button type="button" class="draft-btn secondary" @click="openResourceCenter()">
                            打开资源中心
                        </button>
                        <button type="button" class="draft-btn primary" @click="closeResourceResults">
                            完成
                        </button>
                    </footer>
                </section>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch, onUnmounted } from 'vue';
import { Plus, MessageSquare, Trash2, Square, Bot, Globe, Code, X, Archive, Database, NotebookPen, PanelLeft, PenLine, ChevronDown, Share2, Copy, Volume2, ThumbsUp, ThumbsDown, MoreHorizontal, ArrowUp, Mic, Package, ExternalLink, Download, Users, ListChecks, CheckCircle2, LoaderCircle, Circle, Network } from 'lucide-vue-next';
import { useChatEngine } from '../composables/useChatEngine';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { marked } from 'marked';
import DOMPurify from '@/utils/dompurify.js';
import { themeManager } from '@/utils/theme-manager.js';
import { formatBohAIRetrievalTraceSummary } from '@/utils/bohai-observability.js';
import { getResourceTypeLabel } from '@/utils/api/resource-search-api.js';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import 'highlight.js/styles/github.css';

// 获取用户信息
const authStore = useAuthStore();
const { userInfo } = storeToRefs(authStore);

defineProps({
    embedded: {
        type: Boolean,
        default: false
    }
});

const isSidebarOpen = ref(false);
const showFeaturesMenu = ref(false);
const currentUiStyle = ref(themeManager.getUiStyle?.() || 'glass');
const uiNotice = ref('');
const visibleMessageLimit = ref(80);
const messageFeedbackByIndex = ref({});
const expandedMessageDetails = ref(new Set());
const resourceModalOpen = ref(false);
const activeResourceSearch = ref(null);
const lastAutoOpenedResourceRequest = ref(0);
const planPanelOpen = ref(false);
let uiNoticeTimer = null;

const {
    chatSessions,
    currentSessionIndex,
    inputMessage,
    isLoading,
    isThinking,
    thinkingTime,
    thinkingStatus,
    textareaRef,
    currentModeId,
    currentMode,
    isCommandMode,
    isSearching,
    isForumSearchEnabled,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
    isPlanModeEnabled,
    currentResponseStyleId,
    currentResponseStyle,
    responseStyleOptions,
    pendingCloudReferenceConsent,
    pendingQuickNote,
    rateLimitMessage,
    chatModes,
    messages,
    onScrollToBottom,
    startNewChat,
    deleteSession,
    switchSession,
    sendMessage,
    toggleMemoryCapture,
    toggleTreeholeMemory,
    toggleQuickNoteMode,
    togglePlanMode,
    setResponseStyle,
    dismissQuickNoteDraft,
    confirmQuickNoteDraft,
    approveCloudReferenceConsent,
    rejectCloudReferenceConsent,
    activeActionDraft,
    updatePendingPostDraftFromUI,
    updatePendingMailDraftFromUI,
    cancelPendingActionDraftFromUI,
    confirmPendingActionDraftFromUI,
    stopGeneration,
    clearCache: _clearCache,
    agentClusterState
} = useChatEngine();

const chatContainer = ref(null);
const activeUserMessageIndex = ref(-1);
const currentSessionTitle = computed(() => {
    const title = String(chatSessions[currentSessionIndex.value]?.title || '').trim();
    return title && title !== '新对话' ? title : currentMode.value.name;
});

const getSessionGroupId = (timestamp) => {
    const value = Number(timestamp || Date.now());
    const date = Number.isFinite(value) ? new Date(value) : new Date();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayDiff = Math.floor((startOfToday - startOfTarget) / 86400000);
    if (dayDiff <= 0) return 'today';
    if (dayDiff === 1) return 'yesterday';
    return 'earlier';
};

const sessionGroupLabels = {
    today: '今天',
    yesterday: '昨天',
    earlier: '更早'
};

const groupedChatSessions = computed(() => {
    const groups = [
        { id: 'today', label: sessionGroupLabels.today, items: [] },
        { id: 'yesterday', label: sessionGroupLabels.yesterday, items: [] },
        { id: 'earlier', label: sessionGroupLabels.earlier, items: [] }
    ];
    const groupMap = new Map(groups.map((group) => [group.id, group]));
    chatSessions.forEach((session, index) => {
        const group = groupMap.get(getSessionGroupId(session?.timestamp)) || groupMap.get('earlier');
        group.items.push({ session, index });
    });
    return groups.filter((group) => group.items.length > 0);
});

const hiddenMessageCount = computed(() => {
    const total = Array.isArray(messages.value) ? messages.value.length : 0;
    return Math.max(0, total - visibleMessageLimit.value);
});

const visibleMessageItems = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    const start = Math.max(0, list.length - visibleMessageLimit.value);
    return list.slice(start).map((message, offset) => ({
        message,
        index: start + offset
    }));
});

const showMoreMessages = () => {
    visibleMessageLimit.value += 60;
    nextTick(updateActiveUserMessageFromScroll);
};

const HIGHLIGHT_LANGUAGE_SUBSET = ['javascript', 'typescript', 'json', 'bash', 'xml', 'css', 'markdown', 'python'];
const MARKDOWN_SANITIZE_OPTIONS = {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'del'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
};

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);

marked.setOptions({
    highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(code, { language: lang }).value; }
            catch { return hljs.highlightAuto(code, HIGHLIGHT_LANGUAGE_SUBSET).value; }
        }
        return hljs.highlightAuto(code, HIGHLIGHT_LANGUAGE_SUBSET).value;
    },
    breaks: true,
    gfm: true
});

const MARKDOWN_CACHE_LIMIT = 160;
const markdownRenderCache = new Map();

const renderMarkdown = (content) => {
    if (!content) return '';
    const source = typeof content === 'string' ? content : JSON.stringify(content);
    const cached = markdownRenderCache.get(source);
    if (cached) return cached;
    const parsed = marked.parse(source);
    const parsedHtml = typeof parsed === 'string' ? parsed : String(parsed || '');
    const sanitized = DOMPurify.sanitize(parsedHtml, MARKDOWN_SANITIZE_OPTIONS);
    markdownRenderCache.set(source, sanitized);
    if (markdownRenderCache.size > MARKDOWN_CACHE_LIMIT) {
        const firstKey = markdownRenderCache.keys().next().value;
        markdownRenderCache.delete(firstKey);
    }
    return sanitized;
};

const getMessageActionNotes = (msg) => {
    if (!msg || msg.role !== 'assistant') return [];
    const notes = Array.isArray(msg?.meta?.actionNotes) ? msg.meta.actionNotes : [];
    return notes
        .map((note) => String(note || '').trim())
        .filter(Boolean)
        .slice(0, 4);
};

const compactPlanText = (content, maxLength = 72) => {
    if (content === null || content === undefined) return '';
    const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    const text = raw.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text || text === '""' || text === "''" || text === 'null' || text === 'undefined') return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const isPlanText = (content) => /(plan\s*模式|计划模式|持续推进|不断推进|长期推进|分步推进|一步步推进|阶段|里程碑|路线图|拆成步骤|下一步行动|风险跟踪|降低幻觉|减少幻觉)/i.test(String(content || ''));

const latestUserPlanMessage = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item?.role === 'user') return item;
    }
    return null;
});

const latestAssistantPlanMessage = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item?.role === 'assistant') return item;
    }
    return null;
});

const latestAssistantPlanNotes = computed(() => getMessageActionNotes(latestAssistantPlanMessage.value));

const isPlanExperienceActive = computed(() => {
    if (isPlanModeEnabled.value) return true;
    if (currentModeId.value === 'plan') return true;
    if (latestAssistantPlanNotes.value.some((note) => /Plan 模式|分步推进/.test(note))) return true;
    if (isLoading.value && isPlanText(latestUserPlanMessage.value?.content)) return true;
    return false;
});

const isAgentClusterModeActive = computed(() => currentModeId.value === 'agent-cluster');

const AGENT_CLUSTER_LABEL_MAP = {
    orchestrator: '编排',
    synthesizer: '合成',
    'chat-engine': '对话',
    retriever: '检索',
    memory: '记忆',
    ops: '操作',
    code: '代码',
    creative: '创作',
    analyst: '推理'
};

const agentClusterEntries = computed(() => {
    const agents = agentClusterState?.agents && typeof agentClusterState.agents === 'object'
        ? agentClusterState.agents
        : {};
    const entries = Object.entries(agents).map(([key, info]) => ({
        key,
        label: info?.label || AGENT_CLUSTER_LABEL_MAP[key] || key,
        status: info?.status || 'pending',
        ms: info?.ms || 0
    }));
    const priority = ['orchestrator', 'retriever', 'memory', 'ops', 'chat-engine', 'analyst', 'creative', 'code', 'synthesizer'];
    entries.sort((a, b) => {
        const ai = priority.indexOf(a.key);
        const bi = priority.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return entries;
});

const agentClusterPanelTitle = computed(() => {
    if (agentClusterState?.isRunning) return 'Agent 集群运行中…';
    if (agentClusterState?.degraded) return 'Agent 集群已降级';
    if (agentClusterState?.answer) return 'Agent 集群已完成';
    return 'Agent 集群';
});

const agentClusterPanelSubtitle = computed(() => {
    const total = agentClusterEntries.value.length;
    if (total === 0) {
        return '选择此模式后，下次发送会自动编排多 Agent 并行处理。';
    }
    const finished = agentClusterEntries.value.filter((entry) =>
        entry.status === 'ok' || entry.status === 'failed' || entry.status === 'skipped' || entry.status === 'cancelled'
    ).length;
    if (agentClusterState?.isRunning) {
        return `${finished}/${total} 个 Agent 已完成 · ${agentClusterState.clusterMode || 'auto'}`;
    }
    if (agentClusterState?.strategy) {
        return `${total} 个 Agent · 策略 ${agentClusterState.strategy} · ${agentClusterState.totalMs || 0}ms`;
    }
    return `${total} 个 Agent · ${finished} 已完成`;
});

const formatAgentClusterMs = (ms) => {
    const value = Number(ms) || 0;
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(1)}s`;
};

const currentPlanGoal = computed(() => {
    const goal = compactPlanText(latestUserPlanMessage.value?.content, 96);
    return goal || '等待你给出一个要持续推进的目标。';
});

const planPanelTitle = computed(() => {
    if (isLoading.value) return '正在推进计划';
    if (latestAssistantPlanNotes.value.some((note) => /Plan 模式|分步推进/.test(note))) return '计划推进已就绪';
    return 'Plan 工作台';
});

const planPanelSubtitle = computed(() => {
    const status = String(thinkingStatus.value || '').trim();
    if (isLoading.value && status) return status;
    if (isLoading.value) return getGrokLoadingLabel();
    return compactPlanText(currentPlanGoal.value, 54);
});

const planEvidenceSummary = computed(() => {
    const trace = getMessageRetrievalTrace(latestAssistantPlanMessage.value);
    const sources = Array.isArray(trace?.connectors) ? trace.connectors.filter((item) => item?.ok) : [];
    if (sources.length > 0) {
        return `已参考 ${sources.map((item) => item.label || item.source).filter(Boolean).slice(0, 4).join('、')}。`;
    }
    if (isSearching.value || isForumSearchEnabled.value || isTreeholeMemoryEnabled.value) {
        return '已开启检索/参考能力，生成时会优先使用可获得的资料。';
    }
    return '当前主要依据本轮对话；需要事实核实时会标注不确定或提示补充资料。';
});

const planRiskSummary = computed(() => {
    if (isLoading.value) return '正在核对目标和资料边界，缺少依据的内容不会当作已确认事实。';
    if (latestAssistantPlanMessage.value?.content) return '后续继续推进时，建议围绕已确认步骤补充结果，避免把假设当成事实。';
    return '还没有生成计划，风险项会在开始推进后更新。';
});

const planNextAction = computed(() => {
    if (isLoading.value) return '等待当前回复完成，然后从输出的下一步行动继续。';
    if (latestAssistantPlanMessage.value?.content) return '按最近一次回复中的下一步行动继续，或补充新的约束让我更新计划。';
    return '输入目标后，我会先拆阶段，再逐步推进。';
});

const extractPlanSegments = (content) => {
    const text = compactPlanText(content, 180);
    const cleaned = text
        .replace(/^(请你|请|帮我|我想|我希望|需要|把|给我)\s*/i, '')
        .replace(/[。.!！?？]+$/g, '')
        .trim();
    if (!cleaned) {
        return {
            first: '确认目标和约束',
            later: '拆解步骤并给出下一步行动'
        };
    }

    const firstThenMatch = cleaned.match(/先(.{2,60}?)(?:再|然后|之后)(.{2,80})/);
    if (firstThenMatch) {
        return {
            first: compactPlanText(firstThenMatch[1], 42),
            later: compactPlanText(firstThenMatch[2], 52)
        };
    }

    const stageMatch = cleaned.match(/(.{2,60}?)(?:，|,|；|;|并|和)(.{2,80})/);
    if (stageMatch && cleaned.length > 24) {
        return {
            first: compactPlanText(stageMatch[1], 42),
            later: compactPlanText(stageMatch[2], 52)
        };
    }

    return {
        first: compactPlanText(cleaned, 54),
        later: '形成可执行步骤并保留下一步行动'
    };
};

const getPlanTodoState = (index) => {
    const hasAnswer = Boolean(compactPlanText(latestAssistantPlanMessage.value?.content, 8));
    if (hasAnswer && !isLoading.value) {
        return 'done';
    }
    if (!isLoading.value) {
        return index === 0 ? 'active' : 'pending';
    }
    const seconds = Number(thinkingTime.value || 0);
    if (index === 0) return 'done';
    if (index === 1) return seconds >= 2.4 ? 'done' : 'active';
    if (index === 2) return seconds >= 5.2 ? 'done' : (seconds >= 2.4 ? 'active' : 'pending');
    return seconds >= 5.2 ? 'active' : 'pending';
};

const planTodoItems = computed(() => {
    const segments = extractPlanSegments(latestUserPlanMessage.value?.content);
    const statusLabel = String(thinkingStatus.value || '').trim() || getGrokLoadingLabel();
    return [
        {
            id: 'first',
            title: '先做',
            detail: segments.first,
            state: getPlanTodoState(0)
        },
        {
            id: 'evidence',
            title: '核对依据',
            detail: planEvidenceSummary.value,
            state: getPlanTodoState(1)
        },
        {
            id: 'later',
            title: '后做',
            detail: segments.later,
            state: getPlanTodoState(2)
        },
        {
            id: 'finish',
            title: isLoading.value ? '正在执行' : '完成当前轮次',
            detail: isLoading.value ? statusLabel : planNextAction.value,
            state: getPlanTodoState(3)
        }
    ];
});

const planTodoSummary = computed(() => {
    const done = planTodoItems.value.filter((item) => item.state === 'done').length;
    return `${done}/${planTodoItems.value.length} 已完成`;
});

const shouldRenderPlanTodoCard = (msg, idx) => {
    if (!msg || msg.role !== 'assistant') return false;
    if (!isPlanExperienceActive.value) return false;
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i]?.role === 'assistant') return i === idx;
    }
    return false;
};

const getMessageRetrievalTrace = (msg) => {
    if (!msg || msg.role !== 'assistant') return null;
    return msg?.meta?.ragTrace || null;
};

const getRetrievalTraceSources = (msg) => {
    const trace = getMessageRetrievalTrace(msg);
    return Array.isArray(trace?.connectors) ? trace.connectors : [];
};

const getRetrievalTraceSummary = (msg) => {
    return formatBohAIRetrievalTraceSummary(getMessageRetrievalTrace(msg));
};

const getMessageActionAudit = (msg) => {
    if (!msg || msg.role !== 'assistant') return null;
    return msg?.meta?.actionAudit || null;
};

const getMessageResourceSearch = (msg) => {
    if (!msg || msg.role !== 'assistant') return null;
    const payload = msg?.meta?.resourceSearch;
    if (!payload || typeof payload !== 'object') return null;
    return payload;
};

const shouldRenderResourceResultsCard = (msg) => {
    const payload = getMessageResourceSearch(msg);
    return Boolean(payload && msg?.meta?.kind === 'resource_search_results');
};

const getResourceResultsCount = (payload) => {
    return Array.isArray(payload?.results) ? payload.results.length : 0;
};

const getInlineResourceResults = (msg) => {
    const payload = getMessageResourceSearch(msg);
    return Array.isArray(payload?.results) ? payload.results.slice(0, 5) : [];
};

const getResourceSearchTitle = (msg) => {
    const payload = getMessageResourceSearch(msg);
    const count = getResourceResultsCount(payload);
    return count > 0 ? `找到 ${count} 个资源` : '资源搜索结果';
};

const getResourceSearchSubtitle = (msg) => {
    const payload = getMessageResourceSearch(msg);
    if (!payload) return '';
    const displayKeywordText = Array.isArray(payload.displayKeywords) && payload.displayKeywords.length > 0
        ? payload.displayKeywords.slice(0, 3).join('、')
        : '';
    const parts = [
        payload.query ? `关键词：${payload.query}` : (displayKeywordText ? `关键词：${displayKeywordText}` : ''),
        payload.type && payload.type !== 'all' ? getResourceTypeLabel(payload.type) : '',
        payload.loader || '',
        payload.version || ''
    ].filter(Boolean);
    return parts.join(' · ') || '来自 Modrinth 资源索引';
};

const activeResourceResults = computed(() => {
    return Array.isArray(activeResourceSearch.value?.results)
        ? activeResourceSearch.value.results
        : [];
});

const activeResourceSearchTitle = computed(() => {
    const count = activeResourceResults.value.length;
    return count > 0 ? `找到 ${count} 个资源` : '资源搜索结果';
});

const activeResourceSearchSubtitle = computed(() => {
    const payload = activeResourceSearch.value || {};
    const displayKeywordText = Array.isArray(payload.displayKeywords) && payload.displayKeywords.length > 0
        ? payload.displayKeywords.slice(0, 3).join('、')
        : '';
    const parts = [
        payload.query ? `关键词：${payload.query}` : (displayKeywordText ? `关键词：${displayKeywordText}` : ''),
        payload.type && payload.type !== 'all' ? getResourceTypeLabel(payload.type) : '',
        payload.loader || '',
        payload.version || ''
    ].filter(Boolean);
    return parts.join(' · ') || '来自 Modrinth 资源索引';
});

const openResourceResults = (msg) => {
    const payload = getMessageResourceSearch(msg);
    if (!payload) return;
    activeResourceSearch.value = payload;
    resourceModalOpen.value = true;
};

const closeResourceResults = () => {
    resourceModalOpen.value = false;
};

const pickResourceCenterQuery = (payload = {}) => {
    const candidates = [
        ...(Array.isArray(payload?.queries) ? payload.queries : []),
        payload?.query,
        ...(Array.isArray(payload?.displayKeywords) ? payload.displayKeywords : [])
    ];
    return String(candidates.find((item) => /[A-Za-z]{2,}/.test(String(item || ''))) || candidates.find(Boolean) || '').trim();
};

const openResourceCenter = (msg = null) => {
    const payload = getMessageResourceSearch(msg) || activeResourceSearch.value || {};
    closeResourceResults();
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams();
        const query = pickResourceCenterQuery(payload);
        if (query) params.set('q', query);
        if (payload.type && payload.type !== 'all') params.set('type', payload.type);
        if (payload.version) params.set('version', payload.version);
        if (payload.loader) params.set('loader', payload.loader);
        params.set('from', 'bohai');
        window.location.hash = `#/resources?${params.toString()}`;
    }
};

const formatResourceCount = (value) => {
    const count = Number(value || 0);
    if (!Number.isFinite(count)) return '0';
    return count.toLocaleString('zh-CN');
};

const formatResourceDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const maybeAutoOpenLatestResourceResults = () => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    const latest = [...list].reverse().find((item) => item?.role === 'assistant' && item?.meta?.kind === 'resource_search_results');
    const payload = getMessageResourceSearch(latest);
    const requestId = Number(payload?.requestedAt || 0);
    if (!payload || !requestId || requestId <= lastAutoOpenedResourceRequest.value) return;
    lastAutoOpenedResourceRequest.value = requestId;
    activeResourceSearch.value = payload;
    resourceModalOpen.value = getResourceResultsCount(payload) > 0;
};

const formatActionAudit = (audit) => {
    if (!audit) return '';
    const status = audit.ok ? '成功' : '失败';
    const subject = audit.label || audit.actionId || '动作';
    const target = audit.source ? ` · ${audit.source}` : '';
    const detail = audit.ok
        ? (audit.message || '已记录')
        : (audit.errorMessage || '执行失败');
    return `${status} ${subject}${target}：${detail}`;
};

const isMessageDetailsOpen = (index) => expandedMessageDetails.value.has(index);

const toggleMessageDetails = (index) => {
    const next = new Set(expandedMessageDetails.value);
    if (next.has(index)) {
        next.delete(index);
    } else {
        next.add(index);
    }
    expandedMessageDetails.value = next;
};

const setMessageFeedback = (index, value) => {
    const next = { ...messageFeedbackByIndex.value };
    next[index] = next[index] === value ? '' : value;
    messageFeedbackByIndex.value = next;
    notifyUnavailable(next[index] ? '反馈已记录' : '已取消反馈');
};

const getMessageFeedback = (index) => String(messageFeedbackByIndex.value[index] || '');

const getGrokLoadingLabel = () => {
    const liveStatus = String(thinkingStatus.value || '').trim();
    if (liveStatus) return liveStatus;
    const seconds = Number(thinkingTime.value || 0);
    if (isForumSearchEnabled.value) {
        if (seconds < 1.2) return '正在理解问题';
        if (seconds < 4.5) return '正在检索论坛';
        return '正在整理社区线索';
    }
    if (isTreeholeMemoryEnabled.value) {
        if (seconds < 1.2) return '正在理解问题';
        if (seconds < 4.5) return '正在查询 Cloud+';
        return '正在结合私人参考';
    }
    if (isCommandMode.value) {
        if (seconds < 1.2) return '正在理解指令';
        if (seconds < 4.5) return '正在整理命令';
        return '正在生成回复';
    }
    if (activeActionDraft.value?.active) return '正在整理草稿';
    if (isSearching.value) {
        if (seconds < 1.2) return '正在理解问题';
        if (seconds < 4.5) return '正在联网查询';
        return '正在生成回复';
    }
    if (seconds < 1.2) return '正在理解问题';
    if (seconds < 3.2) return '正在探索上下文';
    if (seconds < 6.5) return '正在组织内容';
    return '正在生成回复';
};

const normalizeNavLabel = (content) => {
    const raw = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    return raw.replace(/\s+/g, ' ').trim();
};

const userMessageNavItems = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    return list
        .map((msg, index) => {
            if (msg?.role !== 'user') return null;
            const fullText = normalizeNavLabel(msg.content);
            if (!fullText) return null;
            const label = fullText.length > 16 ? `${fullText.slice(0, 16)}...` : fullText;
            return { index, label, fullText };
        })
        .filter(Boolean);
});

const updateActiveUserMessageFromScroll = () => {
    const container = chatContainer.value;
    if (!container || userMessageNavItems.value.length === 0) {
        activeUserMessageIndex.value = -1;
        return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const anchorOffset = Math.min(220, Math.max(96, container.clientHeight * 0.28));
    let nextActive = userMessageNavItems.value[0].index;

    for (const item of userMessageNavItems.value) {
        const node = container.querySelector(`[data-message-index="${item.index}"]`);
        if (!node) continue;
        const top = node.getBoundingClientRect().top - containerTop;
        if (top <= anchorOffset) {
            nextActive = item.index;
        } else {
            break;
        }
    }

    activeUserMessageIndex.value = nextActive;
};

const scrollToMessage = async (index) => {
    const container = chatContainer.value;
    if (!container) return;
    const total = Array.isArray(messages.value) ? messages.value.length : 0;
    const firstVisibleIndex = Math.max(0, total - visibleMessageLimit.value);
    if (index < firstVisibleIndex) {
        visibleMessageLimit.value = Math.max(visibleMessageLimit.value, total - index);
        await nextTick();
    }
    const node = container.querySelector(`[data-message-index="${index}"]`);
    if (!node) return;
    node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    activeUserMessageIndex.value = index;
};

const postDraftTitle = ref('');
const postDraftContent = ref('');
const mailDraftReceiver = ref('');
const mailDraftSubject = ref('');
const mailDraftContent = ref('');
const actionDraftFeedback = ref('');
const draftUiBusy = ref(false);

const latestActionDraftPreviewIndex = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item?.role === 'assistant' && item?.meta?.kind === 'action_draft_preview') {
            return i;
        }
    }
    return -1;
});

const latestCloudReferenceConsentIndex = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item?.role === 'assistant' && item?.meta?.kind === 'cloud_reference_consent') {
            return i;
        }
    }
    return -1;
});

const latestQuickNoteConfirmIndex = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const item = list[i];
        if (item?.role === 'assistant' && item?.meta?.kind === 'quick_note_confirm') {
            return i;
        }
    }
    return -1;
});

const isActionDraftPreviewMessage = (msg, idx) => {
    if (!msg || msg.role !== 'assistant') return false;
    if (msg?.meta?.kind !== 'action_draft_preview') return false;
    if (idx !== latestActionDraftPreviewIndex.value) return false;
    return Boolean(activeActionDraft.value?.active);
};

const shouldRenderPostDraftEditor = (msg, idx) => {
    return isActionDraftPreviewMessage(msg, idx) && activeActionDraft.value?.type === 'post';
};

const shouldRenderMailDraftEditor = (msg, idx) => {
    return isActionDraftPreviewMessage(msg, idx) && activeActionDraft.value?.type === 'mail';
};

const shouldRenderCloudReferenceConsent = (msg, idx) => {
    if (!msg || msg.role !== 'assistant') return false;
    if (msg?.meta?.kind !== 'cloud_reference_consent') return false;
    if (idx !== latestCloudReferenceConsentIndex.value) return false;
    return Boolean(pendingCloudReferenceConsent.awaitingConfirmation);
};

const shouldRenderQuickNoteConfirm = (msg, idx) => {
    if (!msg || msg.role !== 'assistant') return false;
    if (msg?.meta?.kind !== 'quick_note_confirm') return false;
    if (idx !== latestQuickNoteConfirmIndex.value) return false;
    return Boolean(pendingQuickNote.visible);
};

const shouldRenderPageDraftEditor = (msg, idx) => {
    return isActionDraftPreviewMessage(msg, idx) && activeActionDraft.value?.type === 'page';
};

const pageDraftType = computed(() => {
    return activeActionDraft.value?.pageType || '展示页';
});

const pageDraftHtml = computed(() => {
    return activeActionDraft.value?.pageHtml || '';
});

const sendPageToStudio = () => {
    const html = pageDraftHtml.value;
    if (!html) {
        actionDraftFeedback.value = '没有可发送的网页代码';
        return;
    }
    try {
        const workspaceKey = 'boh_creator_studio_web_workspace_v1';
        const existing = JSON.parse(localStorage.getItem(workspaceKey) || '{}');
        localStorage.setItem(workspaceKey, JSON.stringify({
            ...existing,
            html: html,
            mode: 'html',
            _fromBohai: Date.now()
        }));
        actionDraftFeedback.value = '代码已发送到创作工作台';
        window.location.hash = '#/creator-studio';
    } catch (error) {
        actionDraftFeedback.value = '发送失败，请手动复制代码';
    }
};

const copyPageHtml = async () => {
    const html = pageDraftHtml.value;
    if (!html) {
        actionDraftFeedback.value = '没有可复制的代码';
        return;
    }
    try {
        await navigator.clipboard?.writeText(html);
        actionDraftFeedback.value = '代码已复制';
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = html;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        actionDraftFeedback.value = '代码已复制';
    }
    setTimeout(() => {
        actionDraftFeedback.value = '';
    }, 2000);
};

const isPostDraftDirty = computed(() => {
    if (activeActionDraft.value?.type !== 'post') return false;
    const currentTitle = String(activeActionDraft.value?.postTitle || '');
    const currentContent = String(activeActionDraft.value?.postContent || '');
    return postDraftTitle.value !== currentTitle || postDraftContent.value !== currentContent;
});

const isMailDraftDirty = computed(() => {
    if (activeActionDraft.value?.type !== 'mail') return false;
    const currentReceiver = String(activeActionDraft.value?.mailReceiverName || '');
    const currentSubject = String(activeActionDraft.value?.mailSubject || '');
    const currentContent = String(activeActionDraft.value?.mailContent || '');
    return mailDraftReceiver.value !== currentReceiver
        || mailDraftSubject.value !== currentSubject
        || mailDraftContent.value !== currentContent;
});

watch(activeActionDraft, (nextDraft) => {
    actionDraftFeedback.value = '';
    if (!nextDraft?.active) {
        postDraftTitle.value = '';
        postDraftContent.value = '';
        mailDraftReceiver.value = '';
        mailDraftSubject.value = '';
        mailDraftContent.value = '';
        return;
    }
    if (nextDraft.type === 'post') {
        postDraftTitle.value = String(nextDraft.postTitle || '');
        postDraftContent.value = String(nextDraft.postContent || '');
        return;
    }
    if (nextDraft.type === 'mail') {
        mailDraftReceiver.value = String(nextDraft.mailReceiverName || '');
        mailDraftSubject.value = String(nextDraft.mailSubject || '');
        mailDraftContent.value = String(nextDraft.mailContent || '');
    }
}, { immediate: true, deep: true });

const applyPostDraftEdits = () => {
    actionDraftFeedback.value = '';
    updatePendingPostDraftFromUI({
        title: postDraftTitle.value,
        content: postDraftContent.value
    });
};

const applyMailDraftEdits = async () => {
    if (draftUiBusy.value) return;
    draftUiBusy.value = true;
    actionDraftFeedback.value = '';
    try {
        const result = await updatePendingMailDraftFromUI({
            receiverName: mailDraftReceiver.value,
            subject: mailDraftSubject.value,
            content: mailDraftContent.value
        });
        if (result.feedback) {
            actionDraftFeedback.value = result.feedback;
        }
    } finally {
        draftUiBusy.value = false;
    }
};

const confirmDraftFromUi = async () => {
    if (!activeActionDraft.value?.active || draftUiBusy.value) return;
    draftUiBusy.value = true;
    actionDraftFeedback.value = '';
    try {
        if (activeActionDraft.value.type === 'post') {
            updatePendingPostDraftFromUI({
                title: postDraftTitle.value,
                content: postDraftContent.value
            });
        } else if (activeActionDraft.value.type === 'mail') {
            const updateResult = await updatePendingMailDraftFromUI({
                receiverName: mailDraftReceiver.value,
                subject: mailDraftSubject.value,
                content: mailDraftContent.value
            });
            if (updateResult.feedback) {
                actionDraftFeedback.value = updateResult.feedback;
                return;
            }
        }
        await confirmPendingActionDraftFromUI();
    } finally {
        draftUiBusy.value = false;
    }
};

const cancelDraftFromUi = () => {
    if (draftUiBusy.value) return;
    actionDraftFeedback.value = '';
    cancelPendingActionDraftFromUI();
};

const commandQuickPrompts = [
    {
        label: '双版本神兵',
        prompt: '给我一条“钻石剑 锋利200 不可破坏 自定义名称：弑神剑”的指令，未指定版本请同时给 Java 1.20.5+ 与 Java 1.13-1.20.4。'
    },
    {
        label: '基岩版附魔',
        prompt: '基岩版里我要给玩家一把钻石剑并附魔，给出可直接执行的分步命令方案。'
    },
    {
        label: '执行检测',
        prompt: '写一个 execute 检测：当玩家主手拿钻石剑时，给玩家速度 II 持续 10 秒。'
    },
    {
        label: '药水效果',
        prompt: '请给我“给予玩家自定义药水效果（力量3，持续30秒）”的双版本指令。'
    },
    {
        label: '标题广播',
        prompt: '生成 title / subtitle / actionbar 三条指令，内容分别是“欢迎来到服务器”“请遵守规则”“输入 /help 查看指令”。'
    },
    {
        label: 'gamerule 常用',
        prompt: '给我常用 gamerule 指令：死亡不掉落、关闭生物破坏、停止时间流逝、屏蔽命令方块输出。'
    }
];

const emptySuggestionCards = [
    {
        category: '社区',
        label: '整理论坛最近发生的事',
        prompt: '总结一下论坛近况',
        icon: 'forum',
        enableForumSearch: true
    },
    {
        category: '创作',
        label: '起草一条论坛发布文案',
        prompt: '帮我发一条论坛帖子，想法是：',
        icon: 'command'
    },
    {
        category: 'Cloud+',
        label: '记录一段 Cloud+ 笔记',
        prompt: '帮我把这段想法整理成一条 Cloud+ 笔记：',
        icon: 'cloud',
        enableQuickNote: true
    },
    {
        category: '网页',
        label: '生成一个活动落地页',
        prompt: '帮我做个活动落地页，用来宣传方块之家社区的夏日活动',
        icon: 'command'
    }
];

const applyQuickPrompt = (promptText) => {
    const previous = String(inputMessage.value || '').trim();
    inputMessage.value = previous ? `${previous}\n${promptText}` : promptText;
    nextTick(() => {
        autoResize();
        textareaRef.value?.focus();
    });
};

const sendEmptySuggestion = async (card) => {
    if (!card?.prompt || isLoading.value) return;
    inputMessage.value = card.prompt;
    if (card.enableCommandMode) {
        isCommandMode.value = true;
        isSearching.value = false;
        isForumSearchEnabled.value = false;
        currentModeId.value = 'pro';
    }
    if (card.enableForumSearch) {
        isForumSearchEnabled.value = true;
        isCommandMode.value = false;
    }
    if (card.enableQuickNote) {
        isQuickNoteEnabled.value = true;
    }
    showFeaturesMenu.value = false;
    await nextTick();
    autoResize();
    await sendMessage();
};

const autoResize = () => {
    if (textareaRef.value) {
        textareaRef.value.style.height = 'auto';
        textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px';
    }
};

const handleEnter = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey) return;
    e.preventDefault();
    sendMessage();
};

const scrollToBottom = (force = false) => {
    nextTick(() => {
        if (chatContainer.value) {
            const { scrollHeight, clientHeight, scrollTop } = chatContainer.value;
            if (force || scrollHeight - clientHeight - scrollTop < 150) {
                chatContainer.value.scrollTo({ top: scrollHeight, behavior: force ? 'auto' : 'smooth' });
            }
        }
    });
};

const toggleFeaturesMenu = () => {
    showFeaturesMenu.value = !showFeaturesMenu.value;
};

const toggleCommandMode = () => {
    isCommandMode.value = !isCommandMode.value;
    if (isCommandMode.value) {
        isSearching.value = false;
        isForumSearchEnabled.value = false;
    }
    showFeaturesMenu.value = false;

    // 当开启指令模式时，自动切换到专业模式
    if (isCommandMode.value) {
        currentModeId.value = 'pro';
    }
};

const toggleSearch = () => {
    isSearching.value = !isSearching.value;
    if (isSearching.value) {
        isCommandMode.value = false;
    }
    showFeaturesMenu.value = false;
};

const toggleForumSearch = () => {
    isForumSearchEnabled.value = !isForumSearchEnabled.value;
    if (isForumSearchEnabled.value) {
        isCommandMode.value = false;
    }
    showFeaturesMenu.value = false;
};

const toggleMemoryCaptureMode = () => {
    toggleMemoryCapture();
    showFeaturesMenu.value = false;
};

const toggleTreeholeMemoryMode = async () => {
    showFeaturesMenu.value = false;
    if (isTreeholeMemoryToggling.value) return;
    await toggleTreeholeMemory();
};

const toggleQuickNoteCaptureMode = () => {
    toggleQuickNoteMode();
    showFeaturesMenu.value = false;
};

const togglePlanModeFromMenu = () => {
    togglePlanMode();
    showFeaturesMenu.value = false;
};

const selectResponseStyle = (styleId) => {
    setResponseStyle(styleId);
    showFeaturesMenu.value = false;
};

const deleteMessage = (index) => {
    if (index >= 0 && index < chatSessions[currentSessionIndex.value].messages.length) {
        chatSessions[currentSessionIndex.value].messages.splice(index, 1);
    }
};

const notifyUnavailable = (message) => {
    uiNotice.value = String(message || '').trim();
    if (uiNoticeTimer) {
        clearTimeout(uiNoticeTimer);
        uiNoticeTimer = null;
    }
    if (uiNotice.value) {
        uiNoticeTimer = setTimeout(() => {
            uiNotice.value = '';
            uiNoticeTimer = null;
        }, 1800);
    }
};

const copyMessage = async (content) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
    try {
        await navigator.clipboard?.writeText(text);
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
    notifyUnavailable('已复制');
};

const shareCurrentConversation = async () => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    if (list.length === 0) {
        notifyUnavailable('当前还没有可分享的对话');
        return;
    }
    const text = list
        .map((item) => `${item.role === 'assistant' ? 'BOH AI' : '我'}：${typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? '')}`)
        .join('\n\n');
    try {
        if (navigator.share) {
            await navigator.share({ title: currentSessionTitle.value || 'BOH AI 对话', text });
            notifyUnavailable('已打开分享面板');
            return;
        }
    } catch (error) {
        if (error?.name === 'AbortError') return;
    }
    await copyMessage(text);
    notifyUnavailable('对话已复制，可直接分享');
};

const readMessageAloud = (content) => {
    const text = String(content || '').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) {
        notifyUnavailable('没有可朗读内容');
        return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
        notifyUnavailable('当前浏览器不支持朗读');
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 1200));
    utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
    window.speechSynthesis.speak(utterance);
    notifyUnavailable('开始朗读');
};

const handleClickOutside = (e) => {
    if (showFeaturesMenu.value && !e.target.closest('.input-left')) {
        showFeaturesMenu.value = false;
    }
};

const handleThemeChange = (_theme, _preference, uiStyle = themeManager.getUiStyle?.() || currentUiStyle.value) => {
    currentUiStyle.value = uiStyle;
};

onMounted(() => {
    currentUiStyle.value = themeManager.getUiStyle?.() || 'glass';
    themeManager.addListener(handleThemeChange);
    onScrollToBottom(scrollToBottom);
    scrollToBottom(true);
    nextTick(updateActiveUserMessageFromScroll);
    document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
    themeManager.removeListener(handleThemeChange);
    document.removeEventListener('click', handleClickOutside);
    if (uiNoticeTimer) {
        clearTimeout(uiNoticeTimer);
        uiNoticeTimer = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
});

watch(currentSessionIndex, () => {
    visibleMessageLimit.value = 80;
    expandedMessageDetails.value = new Set();
    messageFeedbackByIndex.value = {};
    activeResourceSearch.value = null;
    resourceModalOpen.value = false;
    planPanelOpen.value = false;
    markdownRenderCache.clear();
    nextTick(updateActiveUserMessageFromScroll);
});

watch(isPlanExperienceActive, (active) => {
    if (!active) {
        planPanelOpen.value = false;
    }
});

watch(messages, () => {
    scrollToBottom();
    maybeAutoOpenLatestResourceResults();
    nextTick(updateActiveUserMessageFromScroll);
}, { deep: true });
</script>

<style scoped src="./style.scoped.css"></style>
