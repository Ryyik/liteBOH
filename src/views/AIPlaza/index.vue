<template>
  <div class="ai-plaza-page">
    <UnifiedNavbar />

    <main class="plaza-main">
      <section class="workspace">
        <header class="workspace-header">
          <div class="workspace-header-main">
            <button type="button" class="model-trigger" aria-haspopup="dialog" :aria-expanded="isModelPickerOpen"
              @click="openModelPicker">
              <span class="model-trigger-label">当前模型</span>
              <strong>{{ selectedModel.name }}</strong>
              <small>{{ selectedModel.id }}</small>
            </button>
            <div class="mode-switch">
              <button v-for="mode in MODE_OPTIONS" :key="mode.id" type="button"
                :class="{ active: workMode === mode.id }" @click="workMode = mode.id">
                {{ mode.label }}
              </button>
            </div>
          </div>
        </header>

        <div ref="chatLogRef" class="chat-log custom-scrollbar">
          <div v-if="messages.length === 0" class="chat-empty">
            <h3>有什么可以帮你？</h3>
            <p>选择模型后输入问题即可。</p>
          </div>
          <article v-for="(item, index) in messages" :key="`${item.role}-${index}-${item.timestamp}`" class="chat-item"
            :class="item.role">
            <header class="chat-meta">
              <div class="chat-role">{{ item.role === 'assistant' ? (item.modelName || selectedModel.name) : '你' }}
              </div>
              <time class="chat-time">{{ formatChatTime(item.timestamp) }}</time>
            </header>
            <div class="chat-content" v-html="renderMarkdown(item.content)"></div>
          </article>
          <article v-if="isDeepSeekThinking" class="chat-item assistant thinking-item">
            <header class="chat-meta">
              <div class="chat-role">{{ activeRequestModelName }}</div>
              <span class="chat-time">生成中</span>
            </header>
            <div class="thinking-line">
              <span class="thinking-label">思考中</span>
              <span class="thinking-dots" aria-hidden="true">
                <i></i>
                <i></i>
                <i></i>
              </span>
            </div>
          </article>
        </div>

        <footer class="composer">
          <div class="input-box-wrapper">
            <div class="input-box">
              <textarea ref="textareaRef" v-model="userInput" class="composer-textarea"
                :placeholder="currentMode.placeholder" rows="1" maxlength="12000" @keydown="handleEnter"
                @input="autoResize"></textarea>
            </div>

            <div v-if="workMode === 'translate'" class="extra-row">
              <label for="target-lang">目标语言</label>
              <input id="target-lang" v-model.trim="targetLanguage" type="text" maxlength="24"
                placeholder="如：英文 / 日文 / 法文" />
            </div>

            <div class="action-row">
              <button type="button" class="ghost-btn" @click="clearConversation"
                :disabled="isLoading || messages.length === 0">
                清空对话
              </button>
              <button v-if="isLoading" type="button" class="danger-btn" @click="stopRequest">
                停止生成
              </button>
              <button v-else type="button" class="primary-btn" @click="sendMessage" :disabled="!canSend">
                发送
              </button>
            </div>

            <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
            <p v-if="usageText" class="usage-text">{{ usageText }}</p>
          </div>
        </footer>
      </section>
    </main>

    <div v-if="isModelPickerOpen" class="model-picker-overlay" role="presentation" @click="closeModelPicker">
      <section class="model-picker" role="dialog" aria-modal="true" aria-label="选择 AI 模型" @click.stop>
        <header class="model-picker-header">
          <div>
            <h3>选择模型</h3>
            <p>共 {{ AI_MODELS.length }} 个，可随时切换</p>
          </div>
          <button type="button" class="picker-close-btn" @click="closeModelPicker">关闭</button>
        </header>
        <div class="model-picker-list custom-scrollbar">
          <button v-for="model in AI_MODELS" :key="model.id" type="button" class="model-card"
            :class="{ active: selectedModelId === model.id }" @click="selectModel(model.id); closeModelPicker()">
            <div class="model-main">
              <strong>{{ model.name }}</strong>
              <span class="model-id">{{ model.id }}</span>
            </div>
            <div class="model-tags">
              <span class="tag">{{ model.familyLabel }}</span>
              <span class="tag">{{ model.bestFor }}</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import UnifiedNavbar from "@/components/UnifiedNavbar/index.vue";
import { marked } from "marked";
import DOMPurify from "@/utils/dompurify.js";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/github.css";

const API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || "https://api.siliconflow.cn/v1/chat/completions";
const API_KEY = import.meta.env.VITE_SILICON_CLOUD_API_KEY || "";
const STORAGE_KEY = "boh_ai_plaza_v1";
const HISTORY_LIMIT = 12;

const AI_MODELS = [
  { id: "Qwen/Qwen3.5-4B", name: "Qwen 3.5 4B", familyLabel: "通用", bestFor: "轻量问答", supportsImage: false },
  { id: "Qwen/Qwen3-8B", name: "Qwen 3 8B", familyLabel: "通用", bestFor: "多场景聊天", supportsImage: false },
  { id: "tencent/Hunyuan-MT-7B", name: "Hunyuan MT 7B", familyLabel: "翻译", bestFor: "多语翻译", supportsImage: false },
  { id: "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B", name: "DeepSeek R1 0528 8B", familyLabel: "推理", bestFor: "高强推理", supportsImage: false },
  { id: "THUDM/GLM-Z1-9B-0414", name: "GLM Z1 9B", familyLabel: "通用", bestFor: "综合任务", supportsImage: false },
  { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen 2.5 7B Instruct", familyLabel: "指令", bestFor: "稳定执行", supportsImage: false },
  { id: "nex-agi/Nex-N2-Pro", name: "Nex N2 Pro", familyLabel: "通用", bestFor: "轻量通用对话", supportsImage: false },
  { id: "THUDM/GLM-4-9B-0414", name: "GLM 4 9B", familyLabel: "通用", bestFor: "快速响应", supportsImage: false }
];

const MODE_OPTIONS = [
  {
    id: "chat",
    label: "通用对话",
    placeholder: "输入消息..."
  },
  {
    id: "translate",
    label: "翻译助手",
    placeholder: "输入需要翻译的原文..."
  }
];

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

const selectedModelId = ref("Qwen/Qwen3-8B");
const workMode = ref("chat");
const userInput = ref("");
const targetLanguage = ref("英文");
const messages = ref([]);
const isLoading = ref(false);
const errorMessage = ref("");
const usageText = ref("");
const abortController = ref(null);
const chatLogRef = ref(null);
const textareaRef = ref(null);
const activeRequestModelId = ref("");
const activeRequestModelName = ref("");
const isModelPickerOpen = ref(false);

const selectedModel = computed(() => AI_MODELS.find((item) => item.id === selectedModelId.value) || AI_MODELS[0]);
const currentMode = computed(() => MODE_OPTIONS.find((item) => item.id === workMode.value) || MODE_OPTIONS[0]);
const canSend = computed(() => String(userInput.value || "").trim().length > 0 && !isLoading.value);
const isDeepSeekThinking = computed(() => isLoading.value && /deepseek/i.test(activeRequestModelId.value));
const chatTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit"
});

const renderMarkdown = (content) => {
  if (!content) return '';
  const parsed = marked.parse(typeof content === 'string' ? content : JSON.stringify(content));
  const parsedHtml = typeof parsed === 'string' ? parsed : String(parsed || '');
  return DOMPurify.sanitize(parsedHtml, MARKDOWN_SANITIZE_OPTIONS);
};

const formatChatTime = (value) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return "";
  return chatTimeFormatter.format(new Date(timestamp));
};

const selectModel = (id) => {
  selectedModelId.value = id;
};

const openModelPicker = () => {
  isModelPickerOpen.value = true;
};

const closeModelPicker = () => {
  isModelPickerOpen.value = false;
};

const normalizeContentText = (value) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "";
};

const buildSystemPrompt = () => {
  if (workMode.value === "translate") {
    return "你是专业翻译助手。保持原文含义，术语前后一致，不补充无关解释。";
  }
  return "你是 BOH AI 广场助手。回答要清晰、可执行、尽量结构化。";
};

const buildUserPromptText = (rawInput) => {
  const safeInput = String(rawInput || "").trim();
  if (workMode.value === "translate") {
    const safeTarget = String(targetLanguage.value || "").trim() || "英文";
    return `请将以下内容翻译为${safeTarget}，保留原有专有名词与格式：\n\n${safeInput}`;
  }
  if (workMode.value === "ocr") {
    return `请按以下要求处理：${safeInput}\n如果有图片，请先识别全部文字，再按要求整理。`;
  }
  return safeInput;
};

const buildUserPayload = (promptText) => {
  return { role: "user", content: promptText };
};

const stopRequest = () => {
  if (abortController.value) {
    abortController.value.abort();
  }
};

const clearConversation = () => {
  messages.value = [];
  errorMessage.value = "";
  usageText.value = "";
};

const scrollToBottom = () => {
  nextTick(() => {
    if (!chatLogRef.value) return;
    chatLogRef.value.scrollTop = chatLogRef.value.scrollHeight;
  });
};

const autoResize = () => {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
    textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px';
  }
};

const sendMessage = async () => {
  const safeInput = String(userInput.value || "").trim();
  if (!safeInput || isLoading.value) return;

  if (!API_KEY) {
    errorMessage.value = "缺少 AI Key：请在环境变量中配置 VITE_SILICON_CLOUD_API_KEY。";
    return;
  }

  errorMessage.value = "";
  usageText.value = "";

  const userPromptText = buildUserPromptText(safeInput);
  const requestModel = selectedModel.value;
  const previousMessages = messages.value.slice(-HISTORY_LIMIT).map((item) => ({
    role: item.role,
    content: item.rawContent || item.content
  }));

  messages.value.push({
    role: "user",
    content: safeInput,
    rawContent: safeInput,
    timestamp: Date.now()
  });
  userInput.value = "";

  isLoading.value = true;
  activeRequestModelId.value = requestModel.id;
  activeRequestModelName.value = requestModel.name;
  const controller = new AbortController();
  abortController.value = controller;
  scrollToBottom();

  try {
    const payload = {
      model: requestModel.id,
      stream: false,
      temperature: workMode.value === "ocr" ? 0.1 : 0.6,
      max_tokens: 1400,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...previousMessages,
        buildUserPayload(userPromptText)
      ]
    };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = result?.error?.message || `请求失败（${response.status}）`;
      throw new Error(reason);
    }

    const assistantText = normalizeContentText(result?.choices?.[0]?.message?.content);
    if (!assistantText) {
      throw new Error("模型未返回有效文本");
    }

    messages.value.push({
      role: "assistant",
      content: assistantText,
      rawContent: assistantText,
      modelId: requestModel.id,
      modelName: requestModel.name,
      timestamp: Date.now()
    });

    if (result?.usage) {
      const promptTokens = Number(result.usage.prompt_tokens || 0);
      const completionTokens = Number(result.usage.completion_tokens || 0);
      const totalTokens = Number(result.usage.total_tokens || promptTokens + completionTokens);
      usageText.value = `本次消耗：输入 ${promptTokens} tokens，输出 ${completionTokens} tokens，总计 ${totalTokens} tokens。`;
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      errorMessage.value = "已停止本次生成。";
      return;
    }
    errorMessage.value = `调用失败：${error?.message || "未知错误"}`;
  } finally {
    isLoading.value = false;
    abortController.value = null;
    activeRequestModelId.value = "";
    activeRequestModelName.value = "";
    scrollToBottom();
  }
};

const handleEnter = (event) => {
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  sendMessage();
};

const handleWindowKeydown = (event) => {
  if (event.key === "Escape" && isModelPickerOpen.value) {
    closeModelPicker();
  }
};

const saveState = () => {
  try {
    const snapshot = {
      selectedModelId: selectedModelId.value,
      workMode: workMode.value,
      targetLanguage: targetLanguage.value,
      messages: messages.value.slice(-30)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("保存 AI 广场状态失败:", error);
  }
};

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.selectedModelId && AI_MODELS.some((item) => item.id === parsed.selectedModelId)) {
      selectedModelId.value = parsed.selectedModelId;
    }
    if (parsed?.workMode && MODE_OPTIONS.some((item) => item.id === parsed.workMode)) {
      workMode.value = parsed.workMode;
    }
    if (typeof parsed?.targetLanguage === "string") {
      targetLanguage.value = parsed.targetLanguage || "英文";
    }
    if (Array.isArray(parsed?.messages)) {
      messages.value = parsed.messages
        .slice(-30)
        .map((item) => ({
          role: item?.role === "assistant" ? "assistant" : "user",
          content: String(item?.content || ""),
          rawContent: String(item?.rawContent || item.content || ""),
          modelId: String(item?.modelId || ""),
          modelName: String(item?.modelName || ""),
          timestamp: Number(item?.timestamp || Date.now())
        }))
        .filter((item) => item.content);
    }
  } catch (error) {
    console.warn("读取 AI 广场状态失败:", error);
  }
};

const syncNavOffset = () => {
  const navContainer = document.getElementById('unified-nav-container');
  const nav = navContainer || document.querySelector('.unified-nav');
  const navHeight = nav?.offsetHeight || 72;
  document.documentElement.style.setProperty('--bohai-nav-offset', `${navHeight}px`);
};

onMounted(() => {
  loadState();
  scrollToBottom();
  window.addEventListener("keydown", handleWindowKeydown);
  nextTick(() => syncNavOffset());
  window.addEventListener('resize', syncNavOffset);
  window.addEventListener('scroll', syncNavOffset, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener('resize', syncNavOffset);
  window.removeEventListener('scroll', syncNavOffset);
});

watch([selectedModelId, workMode, targetLanguage, messages], saveState, { deep: true });
</script>

<style scoped src="./style.scoped.css"></style>
