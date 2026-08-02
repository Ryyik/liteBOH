/**
 * BOHAgent (Hiagent WebSDK) 助手入口
 *
 * 以"隐藏 SDK 默认气泡 + 站内自定义入口"方式嵌入：
 *  - 动态注入 embedLite.js（异步、防重复）
 *  - 实例化 WebLiteClient，并传入登录用户变量（user_id / username）
 *  - 注入覆盖样式：隐藏默认气泡、提升 z-index、移动端全屏面板
 *  - 暴露 toggleHiagentChat() 供导航栏等自定义入口调用
 */

import { logger } from "@/utils/logger.js";
import { notify } from "@/utils/notify.js";

const HIAGENT_SDK_URL = "https://agent.wzbc.edu.cn/resources/product/llm/public/sdk/embedLite.js";
const HIAGENT_BASE_URL = "https://agent.wzbc.edu.cn";
const HIAGENT_APP_KEY = "d8kgc4mlvnd5dndmhg1g";

let sdkLoadPromise = null;
let initPromise = null;
let clientInstance = null;
let chatController = null;
let ready = false;
let lastVariablesKey = "";

/**
 * 动态加载 SDK 脚本（Promise 缓存，防重复加载）
 */
const loadHiagentSdk = () => {
  if (sdkLoadPromise) return sdkLoadPromise;
  if (typeof window === "undefined") {
    sdkLoadPromise = Promise.reject(new Error("无 window 环境"));
    return sdkLoadPromise;
  }
  if (window.HiagentWebSDK?.WebLiteClient) {
    sdkLoadPromise = Promise.resolve();
    return sdkLoadPromise;
  }
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = HIAGENT_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.HiagentWebSDK?.WebLiteClient) {
        resolve();
      } else {
        sdkLoadPromise = null;
        reject(new Error("HiagentWebSDK 未定义"));
      }
    };
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("HiagentWebSDK 脚本加载失败"));
    };
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
};

/**
 * 构建传给智能体的用户变量。
 *
 * 注意：所有值必须是字符串！SDK 收到 updateVariables 后会把变量写入会话
 * InputData（JsonValue 字段），服务端按字符串类型解析。布尔/数字值会写成
 * 不带引号的 JsonValue（如 true），导致服务端 "cannot unmarshal bool into
 * Go value of type string"，且该会话记录被污染，后续会话列表接口全部报错。
 */
const buildVariables = (authStore) => ({
  user_id: String(authStore?.userInfo?.id || ""),
  username: String(authStore?.userInfo?.username || ""),
  is_logged_in: authStore?.isLoggedIn ? "true" : "false",
});

/**
 * 注入覆盖样式。
 * 必须在 WebLiteClient 实例化之后执行（SDK 构造时会向 head 追加自身的 style，
 * 晚注入的样式在同优先级下生效，配合 !important 保证覆盖）。
 */
const injectOverrideStyles = () => {
  const style = document.createElement("style");
  style.textContent = `
    /* 隐藏 SDK 默认气泡，使用站内自定义入口 */
    .hiagent-bubble { display: none !important; }
    /* 对话面板提升到全站顶层 */
    .hiagent-conversation { z-index: 2147483000 !important; }
    /* 移动端：420px 固定宽度溢出，改为全屏面板 */
    @media (max-width: 640px) {
      .hiagent-conversation {
        width: 100vw !important;
        right: 0 !important;
        bottom: 0 !important;
        height: 100dvh !important;
        max-height: none !important;
        border-radius: 12px 12px 0 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
};

/**
 * 同步用户变量到智能体（登录态变化时调用）
 */
const syncVariables = (authStore) => {
  if (!clientInstance || !chatController) return;
  try {
    const variables = buildVariables(authStore);
    const key = JSON.stringify(variables);
    if (key === lastVariablesKey) return;
    lastVariablesKey = key;
    chatController.updateVariables(variables);
  } catch (err) {
    logger.warn("hiagent", "同步 BOHAgent 变量失败", err);
  }
};

/**
 * 初始化 BOHAgent 助手（幂等，应用挂载后调用一次）
 */
export const initHiagentWidget = () => {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await loadHiagentSdk();
      const { useAuthStore } = await import("@/stores/auth");
      const authStore = useAuthStore();
      clientInstance = new window.HiagentWebSDK.WebLiteClient({
        appKey: HIAGENT_APP_KEY,
        baseUrl: HIAGENT_BASE_URL,
        variables: buildVariables(authStore),
        onLoad: ({ chatInstance }) => {
          chatController = chatInstance;
        },
      });
      ready = true;
      injectOverrideStyles();
      // 调试句柄：便于排查面板开关状态
      if (typeof window !== "undefined") {
        window.__bohagentDebug = {
          get ready() { return ready; },
          get isRenderConversation() { return clientInstance?.isRenderConversation ?? null; },
          get hasClient() { return !!clientInstance; },
        };
      }
      // 登录态变化时更新变量（内部比对值变化后再调用）
      authStore.$subscribe(() => {
        syncVariables(authStore);
      });
    } catch (err) {
      initPromise = null;
      ready = false;
      logger.warn("hiagent", "BOHAgent 初始化失败", err);
    }
  })();
  return initPromise;
};

/**
 * 切换对话面板开关（导航栏等自定义入口调用）
 *
 * 注意：SDK 渲染面板时会同步向 document 注册"点击外部关闭"监听器
 * (handleBodyClick)。若在本次点击事件冒泡过程中同步调用，该监听器
 * 会被同一事件触发，导致面板"打开即关闭"。因此用 setTimeout(0) 延后
 * 到当前点击事件完全结束后再切换。
 */
export const toggleHiagentChat = () => {
  if (!ready || !clientInstance) {
    void initHiagentWidget().then(() => {
      if (ready) {
        toggleHiagentChat();
      } else {
        notify("AI 助手暂时不可用，请稍后再试", "warning");
      }
    });
    return;
  }
  window.setTimeout(() => {
    try {
      if (typeof clientInstance.handleBubbleClick === "function") {
        clientInstance.handleBubbleClick();
        return;
      }
      document.querySelector(".hiagent-bubble")?.click();
    } catch (err) {
      logger.warn("hiagent", "切换 BOHAgent 面板失败", err);
    }
  }, 0);
};
