import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================
// 测试 chatErrorMessages 工具函数
// ============================================================
import {
  safeErrorDetail,
  isAbortError,
  CHAT_ERROR_MESSAGES,
  getAbortMessage
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
    it('generationFailed is a static string', () => {
      const msg = CHAT_ERROR_MESSAGES.generationFailed();
      expect(msg).toContain('服务暂时繁忙');
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
      expect(getAbortMessage('xxx', { timedOut: true, isDegenerate: true })).toBe('生成超时已自动停止，请重试。');
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
const settingsPanelPath = resolve(projectRoot, 'src/views/BOHAI/BOHAI/components/BohaiSettingsPanel.vue');

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
      'isSearching',
      'isTreeholeMemoryEnabled',
      'isSharedMemoryEnabled',
      'contextBudgetUsage',
      'contextBudgetPercentText'
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
      'update:isSearching',
      'update:isTreeholeMemoryEnabled',
      'update:isSharedMemoryEnabled',
      'clearCurrentChat',
      'exportChatData',
      'clearAllChatData'
    ];
    for (const emit of requiredEmits) {
      expect(content).toContain(emit);
    }
  });

  it('使用 Teleport 渲染到 body', () => {
    const content = readComponent();
    expect(content).toContain('<Teleport to="body">');
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
    const icons = ['X', 'Settings', 'Globe', 'Check', 'Trash2'];
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
      ':is-searching',
      ':is-treehole-memory-enabled',
      ':is-shared-memory-enabled',
      ':context-budget-usage',
      ':context-budget-percent-text'
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
      '@update:is-searching',
      '@update:is-treehole-memory-enabled',
      '@update:is-shared-memory-enabled',
      '@clear-current-chat',
      '@export-chat-data',
      '@clear-all-chat-data'
    ];
    for (const event of requiredEvents) {
      expect(content).toContain(event);
    }
  });
});

// ============================================================
// 测试 useChatEngine.js 正确引用 chatErrorMessages
// ============================================================
const chatEnginePath = resolve(projectRoot, 'src/views/BOHAI/composables/useChatEngine.js');

function readChatEngine() {
  return readFileSync(chatEnginePath, 'utf-8');
}

describe('useChatEngine.js 引用 chatErrorMessages 验证', () => {
  it('导入了 chatErrorMessages 工具函数', () => {
    const content = readChatEngine();
    expect(content).toContain("import { isAbortError, CHAT_ERROR_MESSAGES, getAbortMessage } from '../utils/chatErrorMessages.js'");
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
});