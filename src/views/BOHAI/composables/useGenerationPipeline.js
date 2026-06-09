/**
 * useGenerationPipeline
 * ------------------------------------------------------------
 * AI 生成管线 composable — 模型调用、流式处理、Thinking 过滤、降级。
 *
 * 从 useChatEngine.js SECTION I 提取（原 ~1500 行），保持行为不变。
 * useChatEngine 通过本 composable 获取所有生成相关的函数。
 *
 * 使用方式（在 useChatEngine 中）：
 *   const pipeline = useGenerationPipeline({
 *     availableModels,
 *     abortController  // ref, 用于全局中止
 *   })
 *   pipeline.callModelStream(...)
 *   pipeline.callModelInternal(...)
 */

import { logger } from '@/utils/logger.js'
import { AUTO_ROUTER_MODEL_ID } from './chat-engine-config.js'

export function useGenerationPipeline({ availableModels, abortController }) {

  // ==============================================================
  // SSE (Server-Sent Events) 解析器
  // ==============================================================

  const handleSsePayloadLine = (line, onPayload) => {
    if (!line) return false
    if (line.startsWith('data: [DONE]')) return true
    if (line.startsWith('data: ')) {
      onPayload(line.slice(6))
      return false
    }
    if (line.startsWith('error:')) {
      return true
    }
    return false
  }

  const createSseLineParser = (onPayload) => {
    let lineBuffer = '';
    let done = false;

    return {
      push(chunkText) {
        if (!chunkText || done) return;
        lineBuffer += chunkText;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          if (handleSsePayloadLine(line, onPayload)) {
            done = true;
            lineBuffer = '';
            break;
          }
        }
      },
      flush() {
        if (!lineBuffer || done) return;
        if (handleSsePayloadLine(lineBuffer, onPayload)) {
          done = true;
        }
        lineBuffer = '';
      },
      isDone() {
        return done;
      }
    };
  };

  // ==============================================================
  // Fallback 模型选择
  // ==============================================================

  const getFallbackModel = (failedModelId) => {
    if (!Array.isArray(availableModels) || availableModels.length <= 1) return null;
    const model = availableModels.find((m) => m.id === failedModelId);
    if (!model) return null;
    const candidates = [].concat(model.fallback || [], model.aliasFallback || []);
    const fallback = candidates
      .map((id) => availableModels.find((m) => m.id === id))
      .find((m) => m && m.id !== failedModelId);
    return fallback || availableModels.find((m) => m.id !== AUTO_ROUTER_MODEL_ID && m.id !== failedModelId) || availableModels[0];
  };

  // ==============================================================
  // Number 工具
  // ==============================================================

  const toFiniteNumber = (value, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  // ==============================================================
  // 非流式模型调用（callModelInternal）
  // ==============================================================

  const callModelInternal = async (
    modelId,
    prompt,
    systemPrompt,
    history = [],
    requestSignal = undefined,
    retryCount = 0,
    options = {}
  ) => {
    const model = availableModels.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const resolvedOptions = {
      max_tokens: Math.trunc(toFiniteNumber(options.max_tokens, 1800, { min: 256, max: 4096 })),
      temperature: toFiniteNumber(options.temperature, 0.22, { min: 0, max: 1.2 }),
      top_p: toFiniteNumber(options.top_p, 0.75, { min: 0.1, max: 1 }),
      frequency_penalty: toFiniteNumber(options.frequency_penalty, 0.08, { min: 0, max: 2 })
    };

    try {
      const response = await fetch(model.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: false,
          max_tokens: resolvedOptions.max_tokens,
          temperature: resolvedOptions.temperature,
          top_p: resolvedOptions.top_p,
          frequency_penalty: resolvedOptions.frequency_penalty
        }),
        signal: requestSignal || (abortController.value ? abortController.value.signal : undefined)
      });

      if (!response.ok) throw new Error(`API Error: ${response.status} for model ${modelId}`);

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return content?.trim() || '';
    } catch (error) {
      if (retryCount < 1 && error.name !== 'AbortError') {
        logger.warn('boh-ai', `Model ${modelId} failed, trying fallback`, error);
        const fallbackModel = getFallbackModel(modelId);
        if (fallbackModel && fallbackModel.id !== modelId) {
          // B-15 fix: tighten max_tokens on fallback to avoid 400 errors
          const fallbackOptions = {
            ...options,
            max_tokens: Math.min(toFiniteNumber(options.max_tokens, 1200, { min: 256, max: 4096 }), 2048)
          };
          return callModelInternal(
            fallbackModel.id,
            prompt,
            systemPrompt,
            history,
            requestSignal,
            retryCount + 1,
            fallbackOptions
          );
        }
      }
      throw error;
    }
  };

  // ==============================================================
  // 流式处理工具
  // ==============================================================

  const safeChunkToString = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === 'string') return item
        if (item?.type === 'text') return item.text || ''
        if (item?.text) return item.text
        return safeChunkToString(item)
      }).join('')
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch (_e) {
        return '[Invalid Object Content]'
      }
    }
    return String(value)
  };

  // 用于流式处理的思考内容过滤状态（使用普通变量，非响应式）
  let inThinkingBlock = false
  let thinkingBuffer = ''

  // 重置思考过滤状态
  const resetThinkingState = () => {
    inThinkingBlock = false
    thinkingBuffer = ''
  }

  // 非流式文本的思考内容过滤（后处理）
  const filterThinkingContent = (content) => {
    if (!content) return ''
    let filtered = content

    let previousFiltered
    do {
      previousFiltered = filtered

      // 1. 过滤完整的 思考... 回答 标签
      filtered = filtered.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')
      filtered = filtered.replace(/<think[^>]*>[\s\S]*$/gi, '')
      filtered = filtered.replace(/^[\s\S]*<\/think>/gi, '')
      filtered = filtered.replace(/<\/?think[^>]*>/gi, '')

      // 5. 过滤中文思考标记
      filtered = filtered.replace(/\*\*思考\*\*[\s\S]*?(?=\*\*回答\*\*|$)/g, '')
      filtered = filtered.replace(/思考过程[\s\S]*?(?=回答|$)/g, '')

    } while (previousFiltered !== filtered)

    // 6. 去除多余空行
    filtered = filtered.replace(/\n{3,}/g, '\n\n')

    return filtered.trim()
  }

  // 流式处理时的思考内容过滤（带状态跟踪）
  const filterThinkingContentStream = (chunk) => {
    if (!chunk) return ''

    thinkingBuffer += chunk
    let output = ''

    while (true) {
      if (inThinkingBlock) {
        const endMatch = thinkingBuffer.match(/<\/think>/i)
        if (endMatch) {
          thinkingBuffer = thinkingBuffer.slice(endMatch.index + endMatch[0].length)
          inThinkingBlock = false
          continue
        } else {
          thinkingBuffer = ''
          return output
        }
      }

      const startMatch = thinkingBuffer.match(/<think[^>]*>/i)
      if (startMatch) {
        const beforeThink = thinkingBuffer.slice(0, startMatch.index)
        const afterThink = thinkingBuffer.slice(startMatch.index + startMatch[0].length)

        const endMatch = afterThink.match(/<\/think>/i)
        if (endMatch) {
          output += beforeThink
          thinkingBuffer = afterThink.slice(endMatch.index + endMatch[0].length)
          continue
        } else {
          inThinkingBlock = true
          output += beforeThink
          thinkingBuffer = ''
          return output
        }
      }

      break
    }

    // 检测不完整标签结尾
    const potentialTagMatch = thinkingBuffer.match(/<\/?(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i)
    if (potentialTagMatch) {
      output += thinkingBuffer.slice(0, potentialTagMatch.index)
      thinkingBuffer = potentialTagMatch[0]
      return output
    }

    output += thinkingBuffer
    thinkingBuffer = ''
    return output
  }

  // 流式处理结束时刷新缓冲区
  const flushThinkingBuffer = () => {
    const remaining = thinkingBuffer
    thinkingBuffer = ''
    inThinkingBlock = false
    return remaining
  }

  // ==============================================================
  // 流式模型调用（callModelStream）
  // ==============================================================

  const callModelStream = async (modelId, prompt, systemPrompt, history = [], onChunk, options = {}, requestSignal = undefined, retryCount = 0) => {
    const model = availableModels.find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    resetThinkingState();

    try {
      const response = await fetch(model.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey}`
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: prompt }
          ],
          stream: true,
          max_tokens: options.max_tokens || 4096,
          temperature: options.temperature || 0.7
        }),
        signal: requestSignal || (abortController.value ? abortController.value.signal : undefined)
      });

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sseParser = createSseLineParser((payload) => {
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta || {};
          const rawContent = delta.content || '';

          if (rawContent) {
            const content = safeChunkToString(rawContent);
            const filteredContent = filterThinkingContentStream(content);
            if (filteredContent && filteredContent !== '[object Object]') onChunk(filteredContent);
          }
        } catch {
          // Ignore malformed partial payloads
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseParser.push(chunk);
        if (sseParser.isDone()) break;
      }
      if (!sseParser.isDone()) {
        sseParser.push(decoder.decode());
        sseParser.flush();
      }

      const remainingContent = flushThinkingBuffer();
      if (remainingContent && remainingContent !== '[object Object]') {
        onChunk(remainingContent);
      }
    } catch (error) {
      if (retryCount < 1 && error.name !== 'AbortError') {
        logger.warn('boh-ai', `Model ${modelId} failed (Stream), trying fallback`, error);
        const fallbackModel = getFallbackModel(modelId);
        if (fallbackModel && fallbackModel.id !== modelId) {
          await callModelStream(fallbackModel.id, prompt, systemPrompt, history, onChunk, options, requestSignal, retryCount + 1);
          return;
        }
      }
      throw error;
    }
  };

  // ==============================================================
  // Smart Context — 动态压缩
  // ==============================================================

  const _getSmartContext = async (messages, requestSignal = undefined) => {
    if (messages.length <= 10) {
      return messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
    }

    const olderMessages = messages.slice(0, -5);
    const recentMessages = messages.slice(-5).map(m => ({ role: m.role, content: m.content }));

    try {
      const summaryPrompt = `
      Please summarize the following conversation history into a concise paragraph (max 300 words).
      Focus on the core user requirements, project goals, and key decisions.
      
      History:
      ${olderMessages.map(m => `${m.role}: ${m.content}`).join('\n')}
      `;

      const summaryModel = availableModels.find(m => m.id === 'Qwen/Qwen2.5-7B-Instruct') || availableModels[0];
      const summary = await callModelInternal(summaryModel.id, summaryPrompt, "You are a helpful summarizer.", [], requestSignal);

      return [
        { role: 'system', content: `【Previous Conversation Summary】: ${summary}` },
        ...recentMessages
      ];
    } catch (e) {
      logger.warn('boh-ai', 'Smart Context summary failed, falling back to slice', e);
      return messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
    }
  };

  // ==============================================================
  // 暴露接口
  // ==============================================================

  return {
    callModelInternal,
    callModelStream,
    _getSmartContext,
    filterThinkingContent,
    filterThinkingContentStream,
    flushThinkingBuffer,
    resetThinkingState,
    createSseLineParser,
    getFallbackModel,
    toFiniteNumber,
    safeChunkToString
  }
}