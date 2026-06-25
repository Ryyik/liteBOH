<template>
    <div class="bohai-page"
        :class="{ 'embedded-mode': props.embedded, 'overlay-mode': props.overlayMode, 'empty-chat-mode': messages.length === 0, 'sidebar-open': isSidebarOpen }"
        :data-ui-style="currentUiStyle">
        <div class="bohai-container">
            <BohaiSidebar
                v-model="isSidebarOpen"
                :chat-sessions="chatSessions"
                :current-session-index="currentSessionIndex"
                :user-info="userInfo"
                :embedded="props.embedded"
                :is-component-visible="isComponentVisible"
                @start-new-chat="startNewChat"
                @switch-session="switchSession"
                @delete-session="deleteSession"
                @open-settings="openSettings" />

            <main class="main-content">
                <div ref="chatContainer" class="chat-container custom-scrollbar"
                    :class="{ 'is-positioning-initial-scroll': props.overlayMode && !isInitialScrollReady }"
                    @scroll="updateActiveUserMessageFromScroll">
                    <div v-if="messages.length === 0" class="empty-state">
                        <div class="empty-brand" aria-label="BOH AI">
                            <span>BOH</span>
                            <span>AI</span>
                        </div>
                        <h2>今天需要我如何帮你？</h2>
                        <p class="empty-subtitle">提问、检索、计划任务，或让 BOH AI 整理你的想法。</p>
                    </div>

                    <button v-if="hiddenMessageCount > 0" type="button" class="load-earlier-btn"
                        @click="showMoreMessages">
                        显示更早 {{ hiddenMessageCount }} 条消息
                    </button>

                    <div v-for="({ message: msg, index: idx }) in visibleMessageItems" :key="msg.id || idx"
                        :class="['message-wrapper', msg.role]" :data-message-index="idx">
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
                                            <Network v-if="isAgentClusterModeActive" size="17" />
                                            <ListChecks v-else size="17" />
                                        </span>
                                        <div>
                                            <strong>{{ isAgentClusterModeActive ? 'Agent 集群' : '计划代办' }}</strong>
                                            <span>{{ isAgentClusterModeActive ? taskStatusSubtitle : planTodoSummary }}</span>
                                        </div>
                                    </div>
                                    <div class="plan-todo-list">
                                        <div v-for="todo in planTodoItems" :key="todo.id" class="plan-todo-item"
                                            :class="todo.state">
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
                                <div class="message-content" v-html="renderMarkdown(stripAiQuestion(msg.content))"></div>
                                <div v-if="activeInlineQuestion && activeInlineQuestion.messageIndex === idx" class="ai-question-inline">
                                    <div class="ai-question-inline-question">{{ activeInlineQuestion.question }}</div>
                                    <div class="ai-question-inline-options">
                                        <button
                                            v-for="(opt, i) in activeInlineQuestion.options"
                                            :key="i"
                                            class="ai-question-option"
                                            :class="{ selected: aiQuestionAnswer === opt }"
                                            @click="selectInlineOption(opt)"
                                        >
                                            <span class="ai-question-option-icon">
                                                <CheckCircle2 v-if="aiQuestionAnswer === opt" size="16" />
                                                <Circle v-else size="16" />
                                            </span>
                                            <span class="ai-question-option-text">{{ opt }}</span>
                                        </button>
                                    </div>
                                    <div class="ai-question-inline-custom">
                                        <div class="ai-question-divider"><span>或者自己填写</span></div>
                                        <textarea
                                            v-model="aiQuestionAnswer"
                                            class="ai-question-input"
                                            placeholder="输入你的回答..."
                                            rows="2"
                                            :disabled="isLoading"
                                            @keydown.enter="onInlineEnter"
                                        />
                                    </div>
                                    <div class="ai-question-inline-actions">
                                        <button class="ai-question-btn ai-question-btn-submit" :disabled="!aiQuestionAnswer.trim() || isLoading" @click="submitInlineAnswer">
                                            发送回答
                                        </button>
                                    </div>
                                </div>
                                <div v-if="isThinking && idx === messages.length - 1 && msg.role === 'assistant'"
                                    class="thinking" aria-live="polite" aria-label="正在处理">
                                    <span class="thinking-dot" aria-hidden="true"></span>
                                </div>
                            </div>
                            <div v-if="msg.role === 'assistant' && !(isThinking && idx === messages.length - 1)"
                                class="message-actions" aria-label="回复操作">
                                <button type="button" class="message-action-btn" title="复制"
                                    @click="copyMessage(msg.content)">
                                    <Copy size="15" />
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
                                    :class="{ active: isMessageDetailsOpen(idx) }" @click="toggleMessageDetails(idx)">
                                    <MoreHorizontal size="16" />
                                </button>
                                <div v-if="idx === lastAssistantMessageIndex" class="message-context-budget">
                                    <div v-if="isCompressingContext" class="context-compressing-hint">
                                        <LoaderCircle size="12" class="compressing-spinner" />
                                        <span>正在压缩上下文</span>
                                    </div>
                                    <div v-else :class="['context-ring-wrap', ringColorClass]"
                                        :title="contextBudgetTitle">
                                        <svg class="context-ring" viewBox="0 0 20 20">
                                            <circle class="ring-track" cx="10" cy="10" r="8" fill="none"
                                                stroke-width="2.5" />
                                            <circle class="ring-fill" cx="10" cy="10" r="8" fill="none"
                                                stroke-width="2.5"
                                                :stroke-dasharray="`${ringProgress} ${ringCircumference}`"
                                                transform="rotate(-90 10 10)" />
                                        </svg>
                                        <span class="ring-percent">{{ contextBudgetPercentText }}</span>
                                    </div>
                                </div>
                            </div>
                            <div v-if="isMessageDetailsOpen(idx)" class="message-meta-panel">
                                <div v-if="getMessageRetrievalTrace(msg)" class="message-meta-section">
                                    <strong>检索观察</strong>
                                    <p>{{ getRetrievalTraceSummary(msg) }}</p>
                                    <div v-if="getRetrievalTraceSources(msg).length" class="meta-chip-row">
                                        <span v-for="source in getRetrievalTraceSources(msg)"
                                            :key="source.connectorId || source.label" class="meta-chip"
                                            :class="{ failed: !source.ok }">
                                            {{ source.label || source.source }} · {{ source.ok ? `${source.total || 0}条`
                                                : '失败' }}
                                        </span>
                                    </div>
                                </div>
                                <div v-if="getMessageActionAudit(msg)" class="message-meta-section">
                                    <strong>动作审计</strong>
                                    <p>{{ formatActionAudit(getMessageActionAudit(msg)) }}</p>
                                </div>
                                <div v-if="!getMessageRetrievalTrace(msg) && !getMessageActionAudit(msg)"
                                    class="message-meta-section">
                                    <p>这条回复没有可展示的检索或动作记录。</p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <nav v-if="userMessageNavItems.length > 1" class="conversation-jump-nav" aria-label="用户消息导航">
                    <button v-for="item in userMessageNavItems" :key="item.index" type="button"
                        class="conversation-jump-item" :class="{ active: activeUserMessageIndex === item.index }"
                        :title="item.fullText" @click="scrollToMessage(item.index)">
                        <span class="conversation-jump-label">{{ item.label }}</span>
                        <span class="conversation-jump-mark" aria-hidden="true"></span>
                    </button>
                </nav>

                <footer class="input-area">
                    <div v-if="isSearching" class="composer-chips">
                        <button type="button" class="composer-chip" @click="toggleSearch">
                            <Globe size="14" />
                            <span>联网搜索</span>
                            <X size="13" />
                        </button>
                    </div>
                    <div class="input-box">
                        <div class="input-left">
                            <button @click="toggleFeaturesMenu" class="features-btn"
                                :class="{ active: showFeaturesMenu }">
                                <Plus size="18" />
                            </button>
                            <div v-if="showFeaturesMenu" class="features-menu">
                                <div class="feature-action-list">
                                    <button type="button" class="feature-action-row" @click="toggleSearch">
                                        <span class="feature-action-icon">
                                            <Globe size="16" />
                                        </span>
                                        <span class="feature-action-copy">
                                            <strong>联网搜索</strong>
                                        </span>
                                        <span v-if="isSearching" class="feature-action-check"></span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="composer-main">
                            <textarea ref="textareaRef" v-model="inputMessage" @keydown.enter="handleEnter"
                                placeholder="有问题，尽管问" class="input-textarea" rows="1" @input="autoResize"></textarea>
                        </div>

                        <div class="input-right">
                            <div class="composer-mode-picker" @click.stop>
                                <button type="button" class="composer-mode-button" :class="{ open: modeMenuOpen }"
                                    :title="currentMode.description || currentMode.tagline"
                                    :aria-expanded="modeMenuOpen" aria-haspopup="menu" @click.stop="toggleModeMenu">
                                    <span>{{ currentMode.name }}</span>
                                    <ChevronDown size="15" aria-hidden="true" />
                                </button>
                                <div v-show="modeMenuOpen" class="composer-mode-menu" role="menu"
                                    aria-label="选择 BOH AI 模式" @click.stop>
                                    <button v-for="(mode, index) in chatModes" :key="mode.id" type="button"
                                        class="composer-mode-option" :class="{ active: currentModeId === mode.id }"
                                        role="menuitemradio" :aria-checked="currentModeId === mode.id"
                                        :data-mode-id="mode.id" :data-mode-index="index"
                                        @click.stop="selectMode(mode.id)">
                                        <span class="mode-option-main">
                                            <strong>{{ mode.name }}</strong>
                                            <small>{{ mode.tagline }}</small>
                                        </span>
                                        <span class="mode-option-desc">{{ mode.description }}</span>
                                    </button>
                                </div>
                            </div>
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

        <BohaiSettingsPanel
            v-model="settingsOpen"
            :current-mode="currentMode"
            :current-mode-id="currentModeId"
            :chat-modes="chatModes"
            :current-response-style-id="currentResponseStyleId"
            :response-style-options="responseStyleOptions"
            :is-searching="isSearching"
            :is-treehole-memory-enabled="isTreeholeMemoryEnabled"
            :is-shared-memory-enabled="isSharedMemoryEnabled"
            :context-budget-usage="contextBudgetUsage"
            :context-budget-percent-text="contextBudgetPercentText"
            :is-compressing-context="isCompressingContext"
            @select-mode="selectMode"
            @select-response-style="setResponseStyle"
            @update:is-searching="isSearching = $event"
            @update:is-treehole-memory-enabled="isTreeholeMemoryEnabled = $event"
            @update:is-shared-memory-enabled="isSharedMemoryEnabled = $event"
            @clear-current-chat="clearCurrentChat"
            @export-chat-data="exportChatData"
            @clear-all-chat-data="clearAllChatData" />

        <CommonAlertModal
            v-model:visible="confirmState.show"
            :type="confirmState.type"
            :title="confirmState.title"
            :message="confirmState.message"
            @confirm="handleConfirm"
            @close="handleClose" />


    </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch, onUnmounted } from 'vue';
import { Plus, Trash2, Square, Globe, X, ChevronDown, Copy, ThumbsUp, ThumbsDown, MoreHorizontal, ArrowUp, ListChecks, CheckCircle2, LoaderCircle, Circle, Network } from 'lucide-vue-next';
import { useChatEngine } from '../composables/useChatEngine';
import { useAuthStore } from '@/stores/auth';
import { storeToRefs } from 'pinia';
import BohaiSidebar from './components/BohaiSidebar.vue';
import BohaiSettingsPanel from './components/BohaiSettingsPanel.vue';
import CommonAlertModal from '@/components/CommonAlertModal.vue';
import { marked } from 'marked';
import DOMPurify from '@/utils/dompurify.js';
import { themeManager } from '@/utils/theme-manager.js';
import { formatBohAIRetrievalTraceSummary } from '@/utils/bohai-observability.js';
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

const props = defineProps({
    embedded: {
        type: Boolean,
        default: false
    },
    overlayMode: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['island-message']);

const isSidebarOpen = ref(false);
const isComponentVisible = ref(true);
let visibilityObserver = null;
const showFeaturesMenu = ref(false);
const currentUiStyle = ref(themeManager.getUiStyle?.() || 'glass');
const uiNotice = ref('');
const visibleMessageLimit = ref(80);
const expandedMessageDetails = ref(new Set());
const messageFeedbackByIndex = ref({});
const modeMenuOpen = ref(false);
const settingsOpen = ref(false);
const confirmState = reactive({
    show: false,
    type: 'warning',
    title: '',
    message: '',
    resolve: null
});

const aiQuestionAnswer = ref('');

const activeInlineQuestion = ref(null);

const openSettings = () => {
    settingsOpen.value = true;
};

const clearAllChatData = () => {
    confirmState.type = 'warning';
    confirmState.title = '清除所有对话';
    confirmState.message = '确定要清除所有对话数据吗？此操作不可撤销。';
    confirmState.show = true;
    confirmState.resolve = (ok) => {
        confirmState.show = false;
        if (ok) {
            localStorage.removeItem('boh_chat_sessions');
            localStorage.removeItem('boh_current_session_index');
            startNewChat();
            settingsOpen.value = false;
        }
    };
};

const clearCurrentChat = () => {
    confirmState.type = 'warning';
    confirmState.title = '清除当前对话';
    confirmState.message = '确定要清除当前对话吗？此操作不可撤销。';
    confirmState.show = true;
    confirmState.resolve = (ok) => {
        confirmState.show = false;
        if (ok) {
            startNewChat();
            settingsOpen.value = false;
        }
    };
};

const handleConfirm = () => {
    if (confirmState.resolve) {
        confirmState.resolve(true);
        confirmState.resolve = null;
    }
};

const handleClose = () => {
    if (confirmState.resolve) {
        confirmState.resolve(false);
        confirmState.resolve = null;
    }
};

const exportChatData = () => {
    try {
        const data = {
            sessions: chatSessions.value,
            exportedAt: new Date().toISOString(),
            version: '2.5'
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `boh-ai-chat-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch { /* ignore */ }
};

let uiNoticeTimer = null;

const emitIslandMessage = (payload = {}) => {
    emit('island-message', payload);
};

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
    isTreeholeMemoryEnabled,
    isPlanModeEnabled,
    isSharedMemoryEnabled,
    rateLimitMessage,
    chatModes,
    messages,
    contextBudgetUsage,
    isCompressingContext,
    onScrollToBottom,
    startNewChat,
    deleteSession,
    switchSession,
    sendMessage,
    stopGeneration,
    clearCache,
    agentClusterState,
    currentResponseStyleId,
    setResponseStyle,
    responseStyleOptions,
    persistModeSetting
} = useChatEngine();

const AI_QUESTION_MARKER = '【追问】';

const parseAiQuestion = (content) => {
    if (!content) return null;
    const markerIndex = content.indexOf(AI_QUESTION_MARKER);
    if (markerIndex === -1) return null;

    const afterMarker = content.slice(markerIndex + AI_QUESTION_MARKER.length).trim();
    const lines = afterMarker.split('\n').map((l) => l.trim()).filter(Boolean);

    const question = lines[0] || '';
    const options = lines
        .slice(1)
        .filter((l) => /^[-•*\d]+[.)]?\s/.test(l))
        .map((l) => l.replace(/^[-•*\d]+[.)]?\s+/, '').trim());
    if (!question || options.length < 2) return null;

    return { question, options };
};

watch(() => {
    const msgs = Array.isArray(messages.value) ? messages.value : [];
    return msgs.length > 0 ? msgs[msgs.length - 1]?.content : '';
}, (content) => {
    const msgs = Array.isArray(messages.value) ? messages.value : [];
    if (!msgs.length) { activeInlineQuestion.value = null; return; }
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant') { activeInlineQuestion.value = null; return; }
    const parsed = parseAiQuestion(content || '');
    activeInlineQuestion.value = parsed
        ? { question: parsed.question, options: parsed.options, messageIndex: msgs.length - 1 }
        : null;
}, { immediate: true });

const chatContainer = ref(null);
const isInitialScrollReady = ref(false);
const activeUserMessageIndex = ref(-1);

// BOH AI 实际可见上下文窗口：与 useChatEngine 中送入模型的预算口径保持一致
const contextBudgetPercentText = computed(() => {
    const usage = contextBudgetUsage.value;
    const pct = usage?.historyPercent ?? usage?.percent ?? 0;
    return `${Math.round(pct)}%`;
});

// 顶层模式（4 个）：Fast / Pro / Plan / Agent。
// - Fast: 极速响应（默认）
// - Pro:  质量
// - Plan: 超级高质量
// - Agent: 工作
// AUTO 模式已于 2026-06-08 移除，不再有"自动路由到哪个子模式"的 chip 概念。

const contextBudgetTitle = computed(() => {
    const usage = contextBudgetUsage.value || { used: 0, max: 0, percent: 0, includedMessageCount: 0, totalMessageCount: 0, hasSummary: false };
    const summaryHint = usage.hasSummary ? '（已包含此前对话摘要）' : '';
    if (isCompressingContext.value) {
        return `上下文已满，正在自动压缩 BOH AI 历史窗口：已用 ${usage.used} / ${usage.max} 字符 · ${contextBudgetPercentText.value} · 实际携带 ${usage.includedMessageCount} 条消息${summaryHint}`;
    }
    return `BOH AI 上下文窗口：已用 ${usage.used} / ${usage.max} 字符 · ${contextBudgetPercentText.value} · 实际携带 ${usage.includedMessageCount} 条消息${summaryHint}`;
});

const lastAssistantMessageIndex = computed(() => {
    const list = Array.isArray(messages.value) ? messages.value : [];
    for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]?.role === 'assistant') return i;
    }
    return -1;
});

const RING_RADIUS = 8;
const ringCircumference = 2 * Math.PI * RING_RADIUS;

const ringProgress = computed(() => {
    const percent = Math.max(0, Math.min(100, contextBudgetUsage.value?.percent || 0));
    return (percent / 100) * ringCircumference;
});

const ringColorClass = computed(() => {
    const level = contextBudgetUsage.value?.level || 'low';
    return `level-${level}`;
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
    const tokens = Number(agentClusterState?.usage?.total || agentClusterState?.tokenEstimate || 0);
    const tokensHint = tokens > 0 ? ` · ${formatAgentClusterTokens(tokens)}` : '';
    if (agentClusterState?.isRunning) {
        return `${finished}/${total} 个 Agent 已完成 · ${agentClusterState.clusterMode || 'auto'}${tokensHint}`;
    }
    if (agentClusterState?.strategy) {
        return `${total} 个 Agent · 策略 ${agentClusterState.strategy} · ${agentClusterState.totalMs || 0}ms${tokensHint}`;
    }
    return `${total} 个 Agent · ${finished} 已完成${tokensHint}`;
});

const formatAgentClusterMs = (ms) => {
    const value = Number(ms) || 0;
    if (value < 1000) return `${value}ms`;
    return `${(value / 1000).toFixed(1)}s`;
};

const formatAgentClusterTokens = (tokens) => {
    const value = Number(tokens) || 0;
    if (value < 1000) return `${value} tok`;
    if (value < 10000) return `${(value / 1000).toFixed(1)}k tok`;
    return `${Math.round(value / 1000)}k tok`;
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
    if (isAgentClusterModeActive.value && agentClusterEntries.value.length > 0) {
        return agentClusterEntries.value.map((entry) => {
            const statusMap = {
                ok: 'done',
                failed: 'done',
                skipped: 'done',
                cancelled: 'done',
                running: 'active'
            };
            const detailMap = {
                ok: '完成',
                failed: '失败',
                skipped: '已跳过',
                cancelled: '已取消',
                running: '执行中…'
            };
            return {
                id: entry.key,
                title: entry.label,
                detail: detailMap[entry.status] || '等待中',
                state: statusMap[entry.status] || 'pending'
            };
        });
    }
    if (currentModeId.value === 'plan') {
        const assistantMsg = latestAssistantPlanMessage.value;
        const parsed = parseTaskListFromContent(assistantMsg?.content);
        if (parsed.length > 0) return parsed;
        if (assistantMsg?.content) {
            return [{
                id: 'plan-goal',
                title: compactPlanText(assistantMsg.content, 80),
                detail: 'Plan 模式 · 正在推进',
                state: isLoading.value ? 'active' : 'done'
            }];
        }
        return [];
    }
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

const taskStatusSubtitle = computed(() => {
    if (isPlanExperienceActive.value) return planPanelSubtitle.value;
    return agentClusterPanelSubtitle.value;
});

const hasTaskListMarkers = (msg) => {
    if (!msg || msg.role !== 'assistant') return false;
    return /-\s*\[[ x]\]/.test(String(msg.content || ''));
};

const parseTaskListFromContent = (content) => {
    if (!content) return [];
    const items = [];
    const regex = /-\s*\[([ x])\]\s*(.+?)(?:\s*[-—]\s*(.+?))?(?=\n|$)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        items.push({
            id: `task-${items.length}`,
            title: match[2].trim(),
            detail: (match[3] || '').trim(),
            state: match[1] === 'x' ? 'done' : 'pending'
        });
    }
    return items;
};

const shouldRenderPlanTodoCard = (msg, _idx) => {
    if (isAgentClusterModeActive.value && agentClusterEntries.value.length > 0) return true;
    if (currentModeId.value === 'plan' && hasTaskListMarkers(msg)) return true;
    return false;
};

const stripAiQuestion = (content) => {
    if (!content) return content;
    const markerIndex = content.indexOf(AI_QUESTION_MARKER);
    if (markerIndex === -1) return content;
    return content.slice(0, markerIndex).trimEnd();
};

const onInlineEnter = (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.shiftKey) return;
    e.preventDefault();
    submitInlineAnswer();
};

const selectInlineOption = (option) => {
    aiQuestionAnswer.value = option;
    submitInlineAnswer();
};

const submitInlineAnswer = () => {
    const answer = aiQuestionAnswer.value.trim();
    if (!answer || isLoading.value) return;
    inputMessage.value = answer;
    aiQuestionAnswer.value = '';
    nextTick(() => { sendMessage().catch(console.error); });
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

const closeFeaturesMenu = () => {
    const menu = document.querySelector('.features-menu');
    if (menu) {
        menu.classList.add('exiting');
        setTimeout(() => {
            showFeaturesMenu.value = false;
        }, 160);
    } else {
        showFeaturesMenu.value = false;
    }
};

const closeModeMenu = () => {
    const menu = document.querySelector('.composer-mode-menu');
    if (menu) {
        menu.classList.add('exiting');
        setTimeout(() => {
            modeMenuOpen.value = false;
        }, 140);
    } else {
        modeMenuOpen.value = false;
    }
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
            if (force || scrollHeight - clientHeight - scrollTop < 300) {
                chatContainer.value.scrollTo({ top: scrollHeight, behavior: force ? 'auto' : 'smooth' });
            }
        }
    });
};

const jumpToBottomNow = () => {
    const container = chatContainer.value;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
};

const settleInitialScrollPosition = async () => {
    if (!props.overlayMode) {
        isInitialScrollReady.value = true;
        scrollToBottom(true);
        nextTick(updateActiveUserMessageFromScroll);
        return;
    }

    isInitialScrollReady.value = false;
    await nextTick();
    jumpToBottomNow();

    requestAnimationFrame(() => {
        jumpToBottomNow();
        requestAnimationFrame(() => {
            jumpToBottomNow();
            isInitialScrollReady.value = true;
            updateActiveUserMessageFromScroll();
        });
    });
};

const toggleFeaturesMenu = () => {
    showFeaturesMenu.value = !showFeaturesMenu.value;
};

const toggleModeMenu = () => {
    modeMenuOpen.value = !modeMenuOpen.value;
    if (modeMenuOpen.value) {
        closeFeaturesMenu();
    }
};

const selectMode = (modeId) => {
    const mode = chatModes.value?.find((item) => item.id === modeId);
    if (!mode) {
        return;
    }

    currentModeId.value = modeId;
    persistModeSetting();
    closeModeMenu();
    emitIslandMessage({
        title: `已切换 ${mode.name}`,
        message: mode.description || mode.tagline || 'BOH AI 模式已更新',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 3600
    });
};

const toggleSearch = () => {
    isSearching.value = !isSearching.value;
    if (isSearching.value) {
        isCommandMode.value = false;
    }
    closeFeaturesMenu();
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
    if (uiNotice.value) {
        emitIslandMessage({
            title: uiNotice.value,
            message: '',
            icon: 'notification',
            type: 'notification',
            actionLabel: '知道了',
            durationMs: 2600
        });
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

const syncThemeAttribute = () => {
    if (themeManager.isDark?.()) {
        document.documentElement.setAttribute('data-boh-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-boh-theme');
    }
};

const handleClickOutside = (e) => {
    // 关闭 features 菜单
    if (showFeaturesMenu.value && !e.target.closest('.input-left')) {
        closeFeaturesMenu();
    }

    if (modeMenuOpen.value) {
        const isClickInPicker = e.target.closest('.composer-mode-picker');
        const isClickInMenu = e.target.closest('.composer-mode-menu');

        if (!isClickInPicker && !isClickInMenu) {
            closeModeMenu();
        }
    }
};

const handleThemeChange = (_theme, _preference, uiStyle = themeManager.getUiStyle?.() || currentUiStyle.value) => {
    currentUiStyle.value = uiStyle;
    syncThemeAttribute();
};

onMounted(() => {
    currentUiStyle.value = themeManager.getUiStyle?.() || 'glass';
    themeManager.addListener(handleThemeChange);
    syncThemeAttribute();
    onScrollToBottom(scrollToBottom);
    settleInitialScrollPosition();
    document.addEventListener('click', handleClickOutside);

    // Detect component visibility for Teleported elements (sidebar/overlay).
    // When the parent tab switches away (v-show="false"), the .bohai-page
    // becomes display:none and offsetHeight === 0. We poll this because
    // IntersectionObserver doesn't fire for display:none elements.
    const checkVisibility = () => {
        const pageEl = document.querySelector('.bohai-page');
        if (pageEl) {
            const visible = pageEl.offsetHeight > 0;
            if (isComponentVisible.value !== visible) {
                isComponentVisible.value = visible;
                if (!visible) isSidebarOpen.value = false;
            }
        }
    };
    // Check on visibility change (tab switch) and periodically
    document.addEventListener('visibilitychange', checkVisibility);
    const visInterval = setInterval(checkVisibility, 300);
    checkVisibility();

    // Store cleanup references
    visibilityObserver = {
        cleanup: () => {
            document.removeEventListener('visibilitychange', checkVisibility);
            clearInterval(visInterval);
        }
    };
});

onUnmounted(() => {
    themeManager.removeListener(handleThemeChange);
    document.removeEventListener('click', handleClickOutside);
    if (visibilityObserver) {
        visibilityObserver.cleanup();
        visibilityObserver = null;
    }
    if (uiNoticeTimer) {
        clearTimeout(uiNoticeTimer);
        uiNoticeTimer = null;
    }
    if (deepWatchScrollRafId) {
        cancelAnimationFrame(deepWatchScrollRafId);
        deepWatchScrollRafId = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (confirmState.resolve) {
        confirmState.resolve(false);
        confirmState.resolve = null;
    }
    confirmState.show = false;
});

watch(currentSessionIndex, () => {
    visibleMessageLimit.value = 80;
    expandedMessageDetails.value = new Set();
    messageFeedbackByIndex.value = {};
    markdownRenderCache.clear();
    settleInitialScrollPosition();
});

// 消息列表深度监听的滚动节流
let deepWatchScrollRafId = null;
watch(messages, () => {
    if (props.overlayMode && !isInitialScrollReady.value) {
        return;
    }
    if (deepWatchScrollRafId) return;
    deepWatchScrollRafId = requestAnimationFrame(() => {
        deepWatchScrollRafId = null;
        scrollToBottom();
        nextTick(updateActiveUserMessageFromScroll);
    });
}, { deep: true });

watch(isCompressingContext, (compressing) => {
    if (!compressing) return;
    emitIslandMessage({
        title: 'BOH AI 自动压缩',
        message: '历史窗口已满，正在自动摘要并压缩历史会话...',
        icon: 'ai',
        type: 'notification',
        actionLabel: '知道了',
        durationMs: 4000
    });
});


</script>

<style scoped src="./styles/shell-header.css"></style>
<style scoped src="./styles/messages.css"></style>
<style scoped src="./styles/adaptive-layout.css"></style>

<style>
.ai-question-inline {
    margin: 12px 0 4px;
    padding: 16px 18px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.55);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.7);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.ai-question-inline-question {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
    color: #0f172a;
    margin-bottom: 12px;
}

.ai-question-inline-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
}

.ai-question-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 10px 14px;
    border: 1.5px solid rgba(226, 232, 240, 0.7);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.7);
    font-size: 14px;
    line-height: 1.4;
    color: #1e293b;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
}

.ai-question-option:hover {
    border-color: #1459d9;
    background: rgba(20, 89, 217, 0.06);
}

.ai-question-option.selected {
    border-color: #1459d9;
    background: rgba(20, 89, 217, 0.08);
    font-weight: 500;
}

.ai-question-option.selected .ai-question-option-text {
    color: #1459d9;
}

.ai-question-option-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    color: #94a3b8;
}

.ai-question-option.selected .ai-question-option-icon {
    color: #1459d9;
}

.ai-question-option-text {
    flex: 1;
    min-width: 0;
    color: inherit;
}

.ai-question-inline-custom {
    margin-top: 4px;
}

.ai-question-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}

.ai-question-divider::before,
.ai-question-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(226, 232, 240, 0.6);
}

.ai-question-divider span {
    font-size: 12px;
    color: #94a3b8;
    white-space: nowrap;
}

.ai-question-input {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid rgba(226, 232, 240, 0.7);
    border-radius: 10px;
    font-size: 14px;
    line-height: 1.5;
    color: #0f172a;
    background: rgba(255, 255, 255, 0.7);
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
    font-family: inherit;
    box-sizing: border-box;
}

.ai-question-input:focus {
    border-color: #1459d9;
}

.ai-question-inline-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
}

.ai-question-btn {
    padding: 8px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    font-family: inherit;
}

.ai-question-btn-submit {
    background: #1459d9;
    color: #fff;
}

.ai-question-btn-submit:hover {
    background: #1045b0;
}

.ai-question-btn-submit:disabled {
    background: #94a3b8;
    cursor: not-allowed;
}

.ai-question-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

@media (max-width: 767px) {
    .ai-question-inline {
        padding: 12px 14px;
        border-radius: 12px;
    }
    .ai-question-inline-question {
        font-size: 14px;
    }
    .ai-question-option {
        padding: 8px 12px;
        font-size: 13px;
    }
    .ai-question-input {
        padding: 8px 12px;
        font-size: 13px;
    }
    .ai-question-btn {
        padding: 7px 14px;
        font-size: 13px;
    }
}
</style>
