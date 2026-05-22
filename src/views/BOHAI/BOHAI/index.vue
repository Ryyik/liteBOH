<template>
    <div class="bohai-page" :class="{ 'embedded-mode': embedded }">
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
                    <div v-for="(session, index) in chatSessions" :key="session.timestamp"
                        @click="switchSession(index); isSidebarOpen = false"
                        :class="['session-item', { active: currentSessionIndex === index }]">
                        <MessageSquare size="16" />
                        <span class="session-title">{{ session.title || '新对话' }}</span>
                        <button v-if="chatSessions.length > 1" @click.stop="deleteSession(index)" class="delete-btn">
                            <Trash2 size="14" />
                        </button>
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
                        <button class="header-icon-btn" title="打开侧边栏" @click="isSidebarOpen = !isSidebarOpen">
                            <PanelLeft size="18" />
                        </button>
                        <button class="header-icon-btn" title="新对话" @click="startNewChat">
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
                        <button class="header-icon-btn" title="分享当前对话">
                            <Share2 size="18" />
                        </button>
                    </div>
                </header>

                <div ref="chatContainer" class="chat-container custom-scrollbar">
                    <div v-if="messages.length === 0" class="empty-state">
                        <div class="logo-container">
                            <Bot size="64" />
                        </div>
                        <h2>Hello，{{ userInfo?.username || '朋友' }}</h2>
                        <p class="empty-subtitle">今天有什么可以帮你？</p>
                        <div class="empty-suggestion-grid" aria-label="对话建议">
                            <button v-for="card in emptySuggestionCards" :key="card.prompt" type="button"
                                class="empty-suggestion-card" :disabled="isLoading" @click="sendEmptySuggestion(card)">
                                <span class="empty-suggestion-icon">
                                    <MessageSquare v-if="card.icon === 'forum'" size="18" />
                                    <Archive v-else-if="card.icon === 'history'" size="18" />
                                    <Code v-else size="18" />
                                </span>
                                <span class="empty-suggestion-text">{{ card.label }}</span>
                            </button>
                        </div>
                    </div>

                    <div v-for="(msg, idx) in messages" :key="idx" :class="['message-wrapper', msg.role]">
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
                                <div v-if="shouldRenderPostDraftEditor(msg, idx)" class="action-draft-card">
                                    <div class="action-draft-head">
                                        <span class="action-draft-title">发帖草稿</span>
                                        <span class="action-draft-subtitle">编辑后可直接发布</span>
                                    </div>
                                    <label class="draft-field-label">标题</label>
                                    <input v-model="postDraftTitle" type="text" maxlength="64" class="draft-input"
                                        placeholder="请输入帖子标题" />
                                    <label class="draft-field-label">内容</label>
                                    <textarea v-model="postDraftContent" rows="5" maxlength="3000"
                                        class="draft-textarea" placeholder="请输入帖子正文"></textarea>
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
                                <div v-else class="message-content" v-html="renderMarkdown(msg.content)"></div>
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
                            <div v-if="msg.role === 'assistant'" class="message-actions" aria-label="回复操作">
                                <button type="button" class="message-action-btn" title="复制" @click="copyMessage(msg.content)">
                                    <Copy size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="朗读">
                                    <Volume2 size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="赞同">
                                    <ThumbsUp size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="不赞同">
                                    <ThumbsDown size="15" />
                                </button>
                                <button type="button" class="message-action-btn" title="更多">
                                    <MoreHorizontal size="16" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

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
                            </div>
                        </div>

                        <div class="composer-main">
                            <div v-if="isCommandMode || isSearching || isMemoryCaptureEnabled || isTreeholeMemoryEnabled || isQuickNoteEnabled"
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
                            </div>
                            <textarea ref="textareaRef" v-model="inputMessage" @keydown.enter="handleEnter"
                                placeholder="有问题，尽管问" class="input-textarea" rows="1" @input="autoResize"></textarea>
                        </div>

                        <div class="input-right">
                            <button type="button" class="mic-btn" title="语音输入">
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
                </footer>
            </main>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch, onUnmounted } from 'vue';
import { Plus, MessageSquare, Trash2, Square, Bot, Globe, Code, X, Archive, Database, NotebookPen, PanelLeft, PenLine, ChevronDown, Share2, Copy, Volume2, ThumbsUp, ThumbsDown, MoreHorizontal, ArrowUp, Mic } from 'lucide-vue-next';
import { useChatEngine } from '../composables/useChatEngine';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import { marked } from 'marked';
import DOMPurify from '@/utils/dompurify.js';
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

const {
    chatSessions,
    currentSessionIndex,
    inputMessage,
    isLoading,
    isThinking,
    thinkingTime,
    textareaRef,
    currentModeId,
    currentMode,
    isCommandMode,
    isSearching,
    isMemoryCaptureEnabled,
    isTreeholeMemoryEnabled,
    isTreeholeMemoryToggling,
    isQuickNoteEnabled,
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
    clearCache: _clearCache
} = useChatEngine();

const chatContainer = ref(null);
const currentSessionTitle = computed(() => {
    const title = String(chatSessions[currentSessionIndex.value]?.title || '').trim();
    return title && title !== '新对话' ? title : currentMode.value.name;
});
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

const renderMarkdown = (content) => {
    if (!content) return '';
    const parsed = marked.parse(typeof content === 'string' ? content : JSON.stringify(content));
    const parsedHtml = typeof parsed === 'string' ? parsed : String(parsed || '');
    return DOMPurify.sanitize(parsedHtml, MARKDOWN_SANITIZE_OPTIONS);
};

const getMessageActionNotes = (msg) => {
    if (!msg || msg.role !== 'assistant') return [];
    const notes = Array.isArray(msg?.meta?.actionNotes) ? msg.meta.actionNotes : [];
    return notes
        .map((note) => String(note || '').trim())
        .filter(Boolean)
        .slice(0, 4);
};

const getGrokLoadingLabel = () => {
    const seconds = Number(thinkingTime.value || 0);
    if (seconds < 1.2) return 'Understanding';
    if (seconds < 3.2) return 'Exploring';
    if (seconds < 6.5) return 'Gathering context';
    return 'Composing';
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
        label: '总结一下论坛最近发生的事',
        prompt: '总结一下论坛最近发生的事',
        icon: 'forum'
    },
    {
        label: '方块之家成立背景',
        prompt: '方块之家成立背景',
        icon: 'history'
    },
    {
        label: '帮我生成一把附魔钻石剑',
        prompt: '帮我生成一把附魔钻石剑',
        icon: 'command',
        enableCommandMode: true
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
        currentModeId.value = 'pro';
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

const deleteMessage = (index) => {
    if (index >= 0 && index < chatSessions[currentSessionIndex.value].messages.length) {
        chatSessions[currentSessionIndex.value].messages.splice(index, 1);
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
};

const handleClickOutside = (e) => {
    if (showFeaturesMenu.value && !e.target.closest('.input-left')) {
        showFeaturesMenu.value = false;
    }
};

onMounted(() => {
    onScrollToBottom(scrollToBottom);
    scrollToBottom(true);
    document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});

watch(messages, () => scrollToBottom(), { deep: true });
</script>

<style scoped src="./style.scoped.css"></style>
