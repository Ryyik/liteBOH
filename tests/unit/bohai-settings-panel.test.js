import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// 源码守卫断言的格式宽容归一（读源码 + toContain 的断言必须过它，见 helpers/source.js）
import { flattenSource, squeezeSource, scriptSection, stripComments } from '../helpers/source.js';

// ============================================================
// 测试 chatErrorMessages 工具函数
// ============================================================
import {
  safeErrorDetail,
  isAbortError,
  CHAT_ERROR_MESSAGES,
  getAbortMessage,
} from '../../src/views/BOHAI/utils/chatErrorMessages.js';

describe('chatErrorMessages 工具函数', () => {
  describe('safeErrorDetail', () => {
    it('extracts message from Error object', () => {
      const err = new Error('网络连接超时');
      expect(safeErrorDetail(err)).toBe('网络连接超时');
    });

    it('truncates long messages to 300 characters', () => {
      const longMsg = 'x'.repeat(500);
      const err = new Error(longMsg);
      expect(safeErrorDetail(err).length).toBe(300);
    });

    it('handles string errors', () => {
      expect(safeErrorDetail('请求失败')).toBe('请求失败');
    });

    it('returns fallback for null/undefined', () => {
      expect(safeErrorDetail(null)).toBe('网络请求异常');
      expect(safeErrorDetail(undefined)).toBe('网络请求异常');
    });

    it('accepts custom fallback', () => {
      expect(safeErrorDetail(null, '自定义错误')).toBe('自定义错误');
    });

    it('handles error-like objects without message', () => {
      expect(safeErrorDetail({ name: 'Error' })).toBe('网络请求异常');
    });
  });

  describe('isAbortError', () => {
    it('detects AbortError by name', () => {
      const err = new Error('cancel');
      err.name = 'AbortError';
      expect(isAbortError(err)).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isAbortError(new Error('fail'))).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
    });

    it('handles DOMException AbortError', () => {
      const err = new DOMException('Aborted', 'AbortError');
      expect(isAbortError(err)).toBe(true);
    });
  });

  describe('CHAT_ERROR_MESSAGES', () => {
    it('generationFailed returns base message without detail', () => {
      expect(CHAT_ERROR_MESSAGES.generationFailed()).toBe('服务暂时繁忙，请稍后重试。');
    });

    it('generationFailed appends detail when provided', () => {
      const msg = CHAT_ERROR_MESSAGES.generationFailed('OpenRouter API Key 未配置');
      expect(msg).toContain('服务暂时繁忙');
      expect(msg).toContain('OpenRouter API Key 未配置');
    });

    it('resourceSearchFailed is a static string', () => {
      const msg = CHAT_ERROR_MESSAGES.resourceSearchFailed();
      expect(msg).toContain('资源搜索暂时失败');
      expect(msg).toContain('资源中心手动搜索');
    });

    it('abnormalReply is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.abnormalReply).toBe('回答内容出现异常，请重新发送一次。');
    });

    it('noValidContent is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.noValidContent).toBe('我暂时没有生成到有效内容，请再试一次。');
    });

    it('generationStopped is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.generationStopped).toBe('已停止生成。');
    });

    it('generationStoppedWithContent appends suffix', () => {
      const msg = CHAT_ERROR_MESSAGES.generationStoppedWithContent('部分内容');
      expect(msg).toBe('部分内容\n\n（已停止生成）');
    });

    it('generationTimeout is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.generationTimeout).toBe('生成超时已自动停止，请重试。');
    });

    it('degenerateReplyStopped is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.degenerateReplyStopped).toBe('回答出现异常已自动停止，请重试。');
    });

    it('resourceSearchStopped is a static string', () => {
      expect(CHAT_ERROR_MESSAGES.resourceSearchStopped).toBe('资源搜索已停止。');
    });
  });

  describe('getAbortMessage', () => {
    it('returns timeout message when timedOut', () => {
      expect(getAbortMessage('', { timedOut: true })).toBe('生成超时已自动停止，请重试。');
    });

    it('returns degenerate message when isDegenerate', () => {
      expect(getAbortMessage('', { isDegenerate: true })).toBe('回答出现异常已自动停止，请重试。');
    });

    it('returns stopped with content when content exists', () => {
      expect(getAbortMessage('你好')).toBe('你好\n\n（已停止生成）');
    });

    it('returns simple stopped when no content', () => {
      expect(getAbortMessage('')).toBe('已停止生成。');
    });

    it('prioritizes timedOut over isDegenerate', () => {
      expect(getAbortMessage('xxx', { timedOut: true, isDegenerate: true })).toBe(
        '生成超时已自动停止，请重试。',
      );
    });

    it('uses default options when not provided', () => {
      expect(getAbortMessage('test')).toBe('test\n\n（已停止生成）');
    });
  });
});

// ============================================================
// 测试 BohaiSettingsPanel 组件结构
// ============================================================
const projectRoot = resolve(import.meta.dirname, '../..');
const settingsPanelPath = resolve(
  projectRoot,
  'src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue',
);

function readComponent() {
  return readFileSync(settingsPanelPath, 'utf-8');
}

describe('BohaiSettingsPanel 组件结构验证', () => {
  it('文件存在', () => {
    const content = readComponent();
    expect(content).toBeTruthy();
    expect(content.length).toBeGreaterThan(100);
  });

  it('定义了所有必需的 props', () => {
    const content = readComponent();
    const requiredProps = [
      'modelValue',
      'currentMode',
      'currentModeId',
      'chatModes',
      'currentResponseStyleId',
      'responseStyleOptions',
      'isTreeholeMemoryEnabled',
      'isSharedMemoryEnabled',
      'isTreeholeMemoryToggling',
      'memoryStatusText',
      'resolvedTheme',
    ];
    for (const prop of requiredProps) {
      expect(content).toContain(prop);
    }
  });

  it('定义了所有必需的 emits', () => {
    const content = readComponent();
    const requiredEmits = [
      'update:modelValue',
      'selectMode',
      'selectResponseStyle',
      'toggleTreeholeMemory',
      'toggleSharedMemory',
      'clearCurrentChat',
      'exportChatData',
      'clearAllChatData',
    ];
    for (const emit of requiredEmits) {
      expect(content).toContain(emit);
    }
    // 2026-10-03（plans/023 步骤 ④）：思考强度只在输入区面板（同一个状态），
    // 设置面板不再有第二个入口；额度侧板退役后 openQuotaPanel 也不再需要。
    // 否定断言必须剥注释 —— 组件里有一句说明「删 openQuotaPanel」的注释，
    // 直接在原文上断言会假红（见 helpers/source.js 文件头）。
    const codeOnly = stripComments(scriptSection(content));
    expect(codeOnly).not.toContain("'selectThinkingSpeed'");
    expect(codeOnly).not.toContain('openQuotaPanel');
  });

  it('使用 Teleport 渲染到 body', () => {
    const content = readComponent();
    expect(content).toContain('<Teleport to="body" :disabled="embedded">');
  });

  it('包含设置面板的 ARIA 无障碍属性', () => {
    const content = readComponent();
    expect(content).toContain('role="dialog"');
    expect(content).toContain('aria-modal="true"');
    expect(content).toContain('aria-label="BOH AI 设置"');
  });

  it('使用 v-if 根据 modelValue 控制显示', () => {
    const content = readComponent();
    expect(content).toContain('v-if="modelValue"');
  });

  it('close 方法重置 picker 状态并触发 update:modelValue', () => {
    const content = readComponent();
    expect(content).toContain("emit('update:modelValue', false)");
    expect(content).toContain('showModePicker.value = false');
    expect(content).toContain('showStylePicker.value = false');
  });

  it('导出所有需要的图标组件', () => {
    const content = readComponent();
    const icons = ['X', 'ArrowLeft', 'Settings', 'Check', 'Trash2'];
    for (const icon of icons) {
      expect(content).toContain(icon);
    }
  });
});

// ============================================================
// 测试 BOHAIMain.vue 正确引用 BohaiSettingsPanel
// ============================================================
const bohaiMainPath = resolve(projectRoot, 'src/views/BOHAI/BOHAI/BOHAIMain.vue');

function readMain() {
  return readFileSync(bohaiMainPath, 'utf-8');
}

describe('BOHAIMain.vue 引用 BohaiSettingsPanel 验证', () => {
  it('导入了 BohaiSettingsPanel 组件', () => {
    const content = readMain();
    expect(content).toContain('BohaiSettingsPanel');
    expect(content).toContain('./components/BohaiSettingsPanel.vue');
  });

  it('传递了所有必需的 props 到 BohaiSettingsPanel', () => {
    const content = readMain();
    const requiredBindings = [
      ':current-mode',
      ':current-mode-id',
      ':chat-modes',
      ':current-response-style-id',
      ':response-style-options',
      ':is-treehole-memory-enabled',
      ':is-shared-memory-enabled',
      ':is-treehole-memory-toggling',
      ':memory-status-text',
      ':resolved-theme',
    ];
    for (const binding of requiredBindings) {
      expect(content).toContain(binding);
    }
  });

  it('监听了所有必需的 emits 从 BohaiSettingsPanel', () => {
    const content = readMain();
    const requiredEvents = [
      '@select-mode',
      '@select-response-style',
      '@toggle-treehole-memory',
      '@toggle-shared-memory',
      '@clear-current-chat',
      '@export-chat-data',
      '@clear-all-chat-data',
    ];
    for (const event of requiredEvents) {
      expect(content).toContain(event);
    }
    // 思考强度**只许**在输入区面板（BohComposer）里，设置面板不许有第二个入口。
    // 2026-10-08（plans/025 Step 6-4）：输入区整体重绘为 BohComposer，它的强度分段改走
    // `@select-thinking-speed` ⇒ 不能再用「整份 BOHAIMain 不含该串」这种粗断言（会假红）。
    // 改成：**设置面板那一块**不许含它 + 输入区必须真的接线。
    const settingsTagStart = content.indexOf('<BohaiSettingsPanel');
    const settingsTagEnd = content.indexOf('/>', settingsTagStart);
    const settingsTag = content.slice(settingsTagStart, settingsTagEnd);
    expect(settingsTag.length, '未找到 <BohaiSettingsPanel ... /> 标签').toBeGreaterThan(0);
    expect(settingsTag).not.toContain('@select-thinking-speed');
    expect(content).toContain('@select-thinking-speed="selectThinkingSpeed"');
  });

  it('完整 AI 页面接入主题、密度和字号设置', () => {
    const content = readMain();
    expect(content).toContain(':data-theme="resolvedAiTheme"');
    expect(content).toContain(':data-density="globalAiPreferences.density"');
    expect(content).toContain(':data-font-scale="globalAiPreferences.fontScale"');
  });

  it('清除操作调用会话管理正式接口', () => {
    const content = readMain();
    expect(content).toContain('clearCurrentSession();');
    expect(content).toContain('clearAllSessions();');
  });

  it('设置页用量卡显示「剩余」百分比（不再有 Token 绝对数），进度条按消耗归一', () => {
    const content = readComponent();
    expect(content).toContain('ai-settings-quota-overview');
    // 2026-10-08 用户口径：「不再展示你还有多少 token，只用百分比」——
    // 口径与归一计算全部交给 utils/ai-quota-display.js，组件里不再自己算除法。
    // 第二版补充：主指标是**剩余**，尺子是唯一的「Plus = 100%」（Max ⇒ 625%）。
    expect(content).toContain('resolveAiQuotaDisplay');
    expect(content).toContain('quotaRemainingLabel');
    expect(content).toContain('今日剩余');
    expect(content).toContain('quotaMeterText');
    expect(content).toContain('role="progressbar"');
    expect(content).toContain('quotaIsUnlimited');
    // 剩余是 625% 这种三位数 ⇒ 条宽必须归一（aria 量程固定 0–100），
    // 「总额 + 附加包」只在有包时作为副行出现。
    expect(content).toContain('quotaDisplay.meterPercent');
    expect(content).toContain('quotaTotalLabel');
    expect(content).toContain("'has-usage': quotaDisplay.meterPercent > 0");
    // 否定断言分两路，避免源码注释里的「合法复述」造成假红（见 helpers/source.js 文件头）：
    //   · 模板侧：锁插值形态 —— 注释里不会出现收尾的 `}}`
    //   · 脚本侧：剥掉注释后再断言
    expect(content).not.toContain('formatTokenCount(quotaUsed) }}');
    expect(content).not.toContain('formatTokenCount(quotaLimit) }}');
    const code = stripComments(scriptSection(readComponent()));
    expect(code).not.toContain('formatTokenCount(quotaUsed)');
    expect(code).not.toContain('formatTokenCount(quotaRemaining)');
    expect(code).not.toContain('Math.round((quotaUsed.value / quotaLimit.value) * 100)');
  });
});

// ============================================================
// 测试 useChatEngine.js 正确引用 chatErrorMessages
// ============================================================
const chatEnginePath = resolve(projectRoot, 'src/views/BOHAI/composables/useChatEngine.js');
const modelConfigPath = resolve(projectRoot, 'src/views/BOHAI/composables/useModelConfig.js');
const conversationManagerPath = resolve(
  projectRoot,
  'src/views/BOHAI/composables/useConversationManager.js',
);

function readChatEngine() {
  return readFileSync(chatEnginePath, 'utf-8');
}

describe('useChatEngine.js 引用 chatErrorMessages 验证', () => {
  it('导入了 chatErrorMessages 工具函数', () => {
    // 源码守卫断言必须格式宽容：prettier 会把 import 展开成多行并补尾逗号，
    // 逐字断言会因此假红（本文件 2026-09-28 被咬过一次）。两边都要过同一个归一函数。
    const content = squeezeSource(readChatEngine());
    expect(content).toContain(
      squeezeSource(
        "import { isAbortError, CHAT_ERROR_MESSAGES, getAbortMessage, safeErrorDetail } from '../utils/chatErrorMessages.js'",
      ),
    );
  });

  it('使用 isAbortError 替代了 error?.name 直接比较', () => {
    const content = readChatEngine();
    // 不应再出现直接比较 error?.name === 'AbortError' 的模式
    expect(content).not.toMatch(/error\?\.name === 'AbortError'/);
    expect(content).not.toMatch(/error\.name === 'AbortError'/);
    // 应该使用 isAbortError
    expect(content).toContain('isAbortError(');
  });

  it('使用 CHAT_ERROR_MESSAGES 替代了内联错误消息', () => {
    const content = readChatEngine();
    // 不应再出现旧的内联错误消息
    expect(content).not.toContain('服务暂时繁忙，请稍后重试。\\n\\n错误详情');
    expect(content).not.toContain('资源搜索暂时失败：');
    // 应使用 CHAT_ERROR_MESSAGES
    expect(content).toContain('CHAT_ERROR_MESSAGES.');
  });

  it('使用 getAbortMessage 统一停止消息', () => {
    const content = readChatEngine();
    expect(content).toContain('getAbortMessage(');
  });

  it('新对话不会覆盖用户保存的默认响应模式和社区知识设置', () => {
    const content = readChatEngine();
    const startNewChatBlock =
      content.match(/const startNewChat = \(\) => \{[\s\S]*?\n  \};/)?.[0] || '';
    expect(startNewChatBlock).not.toContain('currentModeId.value = BOH_DEFAULT_MODE_ID');
    expect(startNewChatBlock).not.toContain('isSharedMemoryEnabled.value = false');
  });

  it('记忆设置使用布尔值持久化', () => {
    // 断言前先压掉空白：prettier 会把超长行拆成多行（本文件所在模块 2026-09-28 就被
    // 拆过，CI 直接红 —— 与 9-27 那次同一类问题）。**源码格式敏感的断言必须空白宽容。**
    // 归一走 helpers/source.js 的共享实现（此前这里内联过一份 `replace(/\s+/g,'')`，
    // 两份归一 = 两份真源，已收敛）。
    const flat = flattenSource(readFileSync(modelConfigPath, 'utf-8'));
    expect(flat).toContain(
      flattenSource(
        "localStorage.setItem(TREEHOLE_MEMORY_SYNC_SETTING_KEY,isTreeholeMemoryEnabled.value?'1':'0'",
      ),
    );
    expect(flat).toContain(
      flattenSource(
        "localStorage.setItem(SHARED_MEMORY_SETTING_KEY,isSharedMemoryEnabled.value?'1':'0'",
      ),
    );
  });

  it('会话管理提供当前与全部清理接口', () => {
    const content = readFileSync(conversationManagerPath, 'utf-8');
    expect(content).toContain('const clearCurrentSession = () =>');
    expect(content).toContain('const clearAllSessions = () =>');
    expect(content).toContain('chatSessions.splice(0, chatSessions.length');
  });
});
