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

import { logger } from '@/utils/logger.js';
import {
  callVaultSiliconChat,
  callVaultSiliconChatStream,
} from '@/utils/api/api-key-runtime-api.js';
import {
  PARTIAL_THINK_CLOSE_RE,
  PARTIAL_THINK_OPEN_RE,
  REASONING_CLOSE_RE,
  REASONING_OPEN_RE,
  isLikelyBareCloseReasoningModel,
  stripReasoningBlocks,
} from '@/utils/reasoning-tags.js';

// Default timeout for model calls (ms)
const MODEL_CALL_TIMEOUT_MS = 30_000;
const STREAM_MODEL_CALL_TIMEOUT_MS = 60_000;

export function useGenerationPipeline({ availableModels, abortController, currentModeId }) {
  const getMode = () => currentModeId?.value || '';

  // ==============================================================
  // SSE (Server-Sent Events) 解析器
  // ==============================================================

  const handleSsePayloadLine = (line, onPayload, state) => {
    if (!line) return false;
    if (line.startsWith('event:')) {
      state.currentEvent = line.slice(6).trim().toLowerCase();
      return false;
    }
    if (line.startsWith('data: [DONE]')) return true;
    if (line.startsWith('data:')) {
      // 兼容 "data: {...}" 和 "data:{...}" 两种格式
      const payloadText = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
      if (state.currentEvent === 'error') {
        // SSE error 事件：解析 data 中的错误信息
        let errorMsg = '流式生成失败';
        try {
          const errData = JSON.parse(payloadText.trim());
          errorMsg = errData?.message || errorMsg;
        } catch {
          if (payloadText.trim()) errorMsg = payloadText.trim().slice(0, 240);
        }
        state.lastError = new Error(errorMsg);
        return true;
      }
      if (state.currentEvent === 'meta') {
        // meta 事件携带 keyInfo，不影响内容流
        state.currentEvent = '';
        return false;
      }
      onPayload(payloadText);
      state.currentEvent = '';
      return false;
    }
    if (line.startsWith('error:')) {
      state.lastError = new Error(line.slice(6).trim() || '流式生成失败');
      return true;
    }
    return false;
  };

  const createSseLineParser = (onPayload) => {
    let lineBuffer = '';
    let done = false;
    const state = { currentEvent: '', lastError: null };

    return {
      push(chunkText) {
        if (!chunkText || done) return;
        lineBuffer += chunkText;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          if (handleSsePayloadLine(line, onPayload, state)) {
            done = true;
            lineBuffer = '';
            break;
          }
        }
      },
      flush() {
        if (!lineBuffer || done) return;
        if (handleSsePayloadLine(lineBuffer, onPayload, state)) {
          done = true;
        }
        lineBuffer = '';
      },
      isDone() {
        return done;
      },
      getError() {
        return state.lastError;
      },
    };
  };

  // ==============================================================
  // Fallback 模型选择（使用 LRU 缓存避免重复查找）
  // ==============================================================

  const _fallbackModelCache = new Map();
  const _FALLBACK_CACHE_MAX = 16;

  const getFallbackModel = (failedModelId) => {
    if (!Array.isArray(availableModels) || availableModels.length <= 1) return null;
    // Cache hit
    if (_fallbackModelCache.has(failedModelId)) {
      return _fallbackModelCache.get(failedModelId);
    }
    const model = availableModels.find((m) => m.id === failedModelId);
    if (!model) {
      if (_fallbackModelCache.size >= _FALLBACK_CACHE_MAX) {
        const firstKey = _fallbackModelCache.keys().next().value;
        _fallbackModelCache.delete(firstKey);
      }
      _fallbackModelCache.set(failedModelId, null);
      return null;
    }
    const candidates = [].concat(model.fallback || [], model.aliasFallback || []);
    const fallback =
      candidates
        .map((id) => availableModels.find((m) => m.id === id))
        .find((m) => m && m.id !== failedModelId) ||
      availableModels.find((m) => m.id !== failedModelId) ||
      availableModels[0];
    // Cache with LRU eviction
    if (_fallbackModelCache.size >= _FALLBACK_CACHE_MAX) {
      const firstKey = _fallbackModelCache.keys().next().value;
      _fallbackModelCache.delete(firstKey);
    }
    _fallbackModelCache.set(failedModelId, fallback);
    return fallback;
  };

  // ==============================================================
  // Number 工具
  // ==============================================================

  const toFiniteNumber = (
    value,
    fallback,
    { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {},
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  // ==============================================================
  // Signal 工具 — 合并外部 abort signal 与超时 signal
  // ==============================================================

  const _combineSignals = (customSignal, timeoutMs) => {
    const externalSignal =
      customSignal || (abortController.value ? abortController.value.signal : undefined);
    if (!externalSignal && !timeoutMs) return undefined;
    if (externalSignal && !timeoutMs) return externalSignal;
    if (!externalSignal && timeoutMs) return AbortSignal.timeout(timeoutMs);
    // Both signals: use AbortSignal.any when available, otherwise manual
    try {
      return AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)]);
    } catch {
      // Fallback for older Node/browser: just use external signal
      return externalSignal;
    }
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
    options = {},
    mode = '',
  ) => {
    const model = availableModels.find((m) => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const resolvedOptions = {
      max_tokens: Math.trunc(toFiniteNumber(options.max_tokens, 1800, { min: 256, max: 4096 })),
      temperature: toFiniteNumber(options.temperature, 0.22, { min: 0, max: 1.2 }),
      top_p: toFiniteNumber(options.top_p, 0.75, { min: 0.1, max: 1 }),
      frequency_penalty: toFiniteNumber(options.frequency_penalty, 0.08, { min: 0, max: 2 }),
    };

    try {
      const payload = {
        model: model.id,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: resolvedOptions.max_tokens,
        temperature: resolvedOptions.temperature,
        top_p: resolvedOptions.top_p,
        frequency_penalty: resolvedOptions.frequency_penalty,
      };

      // B6 fix: 传递 requestSignal，让用户取消能中止内部模型调用
      const effectiveSignal = _combineSignals(
        requestSignal || (abortController.value ? abortController.value.signal : undefined),
        MODEL_CALL_TIMEOUT_MS,
      );
      const vaultResult = await callVaultSiliconChat({
        provider: model.providerKey || 'siliconflow',
        purpose: 'chat',
        mode: mode || getMode(),
        payload,
        apiUrl: model.url,
        timeoutMs: MODEL_CALL_TIMEOUT_MS,
        signal: effectiveSignal,
      });
      if (!vaultResult.ok) {
        throw new Error(vaultResult.error?.message || `API proxy error for model ${modelId}`);
      }
      const data = vaultResult.data || {};

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
            max_tokens: Math.min(
              toFiniteNumber(options.max_tokens, 1200, { min: 256, max: 4096 }),
              2048,
            ),
          };
          return callModelInternal(
            fallbackModel.id,
            prompt,
            systemPrompt,
            history,
            requestSignal,
            retryCount + 1,
            fallbackOptions,
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
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item?.type === 'text') return item.text || '';
          if (item?.text) return item.text;
          return safeChunkToString(item);
        })
        .join('');
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_e) {
        return '[Invalid Object Content]';
      }
    }
    return String(value);
  };

  // 前导暂存（leading hold）的两个上限。
  // 只在「裸闭合家族」（GLM-Z1 系）上启用，见 createThinkingState 的注释。
  // 超限就放行 —— 宁可回到修复前的行为（思考闪一下），也不要把整段正文扣住不出。
  const LEADING_HOLD_MAX_CHARS = 4000;
  const LEADING_HOLD_MAX_MS = 6000;

  // 修复状态残留：将thinking状态改为函数级而非模块级
  // 创建thinking状态管理器，确保每次调用独立
  //
  // 2026-10-10（用户口径「推理过程可展开」）：**推理内容不再丢弃，改为分流**。
  //   旧实现把 `<think>…</think>` 里的文字直接扔掉（正文里只剩答案），于是
  //   用户看不到模型在想什么。现在同一段文字累积进 `reasoning`，由消息层
  //   渲染成「正在思考 / 思考过程」可展开块（默认收起）。
  //   ⚠️ 正文输出**一个字符都不变** —— 只是不再丢，不是新增可见文本。
  //   ⚠️ `reset()` **不清 reasoning**：它属于「这一轮生成」，不属于解析状态；
  //      解析状态会在一轮里被 flush 多次，清掉就把前面的推理丢了。
  //
  // 2026-10-22（用户报障「Z1 也有推理把思考过程泄露」）：加**前导暂存**。
  //   Z1 系的思考形如 `思考……</think>答案`（开口标签由对话模板替它说了，见
  //   `src/utils/reasoning-tags.js` 文件头）。闭合标签到手之前，我们在字面上无法
  //   区分「这是思考」和「这是答案的开头」—— 已经吐进正文的字**收不回来**
  //   （stage 是 `assistantMessage += 过滤结果`）。所以对这类模型先把**开头**按住，
  //   等判定出来再决定去正文还是去推理。
  //   ⚠️ 三个「立刻放行」的出口，缺任何一个都会把正文扣住（比泄漏更糟）：
  //      ① 见到开/闭标签 → 判定完成；
  //      ② 上游给了 `reasoning_content`/`reasoning` ⇒ 思考走独立字段，content 是干净正文；
  //      ③ 超时/超长（LEADING_HOLD_*）⇒ 放弃判定，按修复前行为放行。
  //   ⚠️ 只对**裸闭合家族**启用（`isLikelyBareCloseReasoningModel`）：开标签家族
  //      （`<think>` 打头）本来就靠开标签分流，按住开头纯属白等。
  // 参数接受两种形态：字符串（= 模型提示）或 `{ modelHint }`。
  // 字符串形态是为了兼容既有调用点 —— 它们原本就是无参调用，改签名不该波及调用方。
  const createThinkingState = (options = {}) => {
    const modelHint = typeof options === 'string' ? options : options?.modelHint || '';
    let inThinkingBlock = false;
    let thinkingBuffer = '';
    let reasoning = '';
    // 前导暂存：leadingHold 为真时，进来的字先攒在 heldText 里，一个都不吐。
    // ⚠️ `initialHold` 要单独记：`reset()` 是**每轮流开始时**被调的（callModelStream 建完
    //    状态立刻 reset），如果 reset 把 leadingHold 清成 false，Z1 的按住就永远不生效。
    const initialHold = isLikelyBareCloseReasoningModel(modelHint);
    let leadingHold = initialHold;
    let heldText = '';
    let holdStartedAt = 0;
    let upstreamModel = '';
    let emittedChars = 0;
    // 上游是否把思考放进了独立字段（Zhipu 的 `delta.reasoning_content`、OpenRouter 的
    // `delta.reasoning`）—— 只要有，content 里就没有思考，前导暂存立刻收工。
    let reasoningSeparated = false;

    const isBareCloseFamily = () =>
      isLikelyBareCloseReasoningModel(upstreamModel) || isLikelyBareCloseReasoningModel(modelHint);

    return {
      reset: () => {
        inThinkingBlock = false;
        thinkingBuffer = '';
        // 回到「这一轮开始」的样子：提示命中的模型仍然要按住开头等判定。
        leadingHold = initialHold && !reasoningSeparated;
        heldText = '';
        holdStartedAt = 0;
      },
      getState: () => ({ inThinkingBlock, thinkingBuffer }),
      setState: (state) => {
        inThinkingBlock = state.inThinkingBlock;
        thinkingBuffer = state.thinkingBuffer;
      },
      appendReasoning: (text) => {
        const next = String(text || '');
        if (next) reasoning += next;
      },
      getReasoning: () => reasoning,

      // ── 前导暂存（2026-10-22）────────────────────────────────────────
      isLeadingHoldActive: () => leadingHold,
      getHeldText: () => heldText,
      appendHeld: (text) => {
        if (!text) return;
        if (!holdStartedAt) holdStartedAt = Date.now();
        heldText += text;
      },
      startLeadingHold: () => {
        leadingHold = true;
        heldText = '';
        holdStartedAt = Date.now();
      },
      endLeadingHold: () => {
        leadingHold = false;
      },
      takeHeldText: () => {
        const text = heldText;
        heldText = '';
        leadingHold = false;
        holdStartedAt = 0;
        return text;
      },
      /**
       * 每个上游 SSE payload 都过一遍（只读观测，不产生可见文本）：
       * ① 记下真实模型名（前端拿不到它 —— 策略行的模型由 Edge Function 在服务端抽）；
       * ② 发现 `reasoning_content` / `reasoning` ⇒ 思考不在 content 里，暂存没必要。
       */
      notePayload: (data) => {
        const delta = data?.choices?.[0]?.delta || {};
        const message = data?.choices?.[0]?.message || {};
        const modelName = String(data?.model || data?.choices?.[0]?.model || '');
        if (modelName && !upstreamModel) {
          upstreamModel = modelName;
          // 首块常带 `model` 而 content 为空 ⇒ 还来得及按住。
          // ⚠️ 只在「一个可见字符都没吐过」时才允许**中途启用**，否则已经吐出去的
          //    正文收不回来，这时再按住只会让用户等到一个不完整的开头。
          if (emittedChars === 0 && isBareCloseFamily()) leadingHold = true;
        }
        if (
          delta.reasoning_content ||
          delta.reasoning ||
          message.reasoning_content ||
          message.reasoning ||
          // Gemini 代理把思考签名放在这里（cloudflare/gemini-proxy/README.md §3）
          delta.extra_content ||
          message.extra_content
        ) {
          reasoningSeparated = true;
          // content 干净 ⇒ 不按住（攒着的字当正文放行）
          leadingHold = false;
        }
        return 'keep';
      },
      /** 记一笔「已经吐出过内容」—— 中途启用前导暂存的前提是它仍为 0。 */
      noteEmitted: (text) => {
        emittedChars += String(text || '').length;
      },
      /** 超限判定：超时或超长就放弃判定（回到修复前行为）。 */
      isLeadingHoldExpired: () =>
        Boolean(holdStartedAt) &&
        (heldText.length > LEADING_HOLD_MAX_CHARS ||
          Date.now() - holdStartedAt > LEADING_HOLD_MAX_MS),
    };
  };

  // 非流式文本的思考内容过滤（后处理）
  // 标签名单与「裸闭合」规则都在 `src/utils/reasoning-tags.js`（唯一真源），
  // 这里只保留中文标记清洗与空行收敛这些**与标签无关**的收尾。
  const filterThinkingContent = (content) => {
    if (!content) return '';
    let filtered = String(content);

    let previousFiltered;
    do {
      previousFiltered = filtered;

      // 1. 剥掉思考标签（成对 / 只有开口 / 只有闭合 / 孤立，四种形态）
      filtered = stripReasoningBlocks(filtered);

      // 2. 过滤中文思考标记（无标签渠道的兜底；只作用于非流式，理由见下）
      filtered = filtered.replace(/\*\*思考\*\*[\s\S]*?(?=\*\*回答\*\*|$)/g, '');
      filtered = filtered.replace(/思考过程[\s\S]*?(?=回答|$)/g, '');
    } while (previousFiltered !== filtered);

    // 3. 去除多余空行
    filtered = filtered.replace(/\n{3,}/g, '\n\n');

    return filtered.trim();
  };

  // 流式处理时的思考内容过滤（带状态跟踪）
  //
  // ⚠️ 两条与「正文一个字符都不许变」直接相关的纪律：
  //   ① **不能**把上面的中文标记规则搬到流式：那些规则是「见到 `思考过程` 就删到 `回答`」，
  //      流式下只要正文里出现「思考过程」四个字就会开始吞字，而流式无法回滚已吐出的正文。
  //   ② 分块会把标签切成两半 ⇒ 半截标签必须留在缓冲区等下一块（PARTIAL_* 两条正则）。
  const filterThinkingContentStream = (chunk, thinkingState) => {
    const state = thinkingState;

    // ── 前导暂存：判定完成前，一个字都不吐 ───────────────────────────
    if (state.isLeadingHoldActive?.()) {
      if (chunk) state.appendHeld(chunk);
      const held = state.getHeldText();
      const settled =
        REASONING_OPEN_RE.test(held) || REASONING_CLOSE_RE.test(held) || state.isLeadingHoldExpired();
      if (!settled) return '';
      // 判定完成（或放弃）：把攒下的字交给下面的常态逻辑重新处理一遍。
      // 交给它而不是就地处理，是为了让「裸闭合 = 前面全是思考」这条规则只有一份实现。
      state.takeHeldText();
      state.setState({ inThinkingBlock: false, thinkingBuffer: '' });
      return filterThinkingContentStream(held, state);
    }

    if (!chunk) return '';

    const { inThinkingBlock, thinkingBuffer } = state.getState();
    let newBuffer = thinkingBuffer + chunk;
    let output = '';
    let newInThinkingBlock = inThinkingBlock;

    while (true) {
      if (newInThinkingBlock) {
        const endMatch = newBuffer.match(REASONING_CLOSE_RE);
        if (endMatch) {
          newBuffer = newBuffer.slice(endMatch.index + endMatch[0].length);
          newInThinkingBlock = false;
          continue;
        }
        // 这一整段都是推理内容（修复前在这里被**丢弃**）。分块可能把闭合标签切开 ⇒
        // 把不完整的 `</think…` 尾巴留在缓冲区等下一块拼回来，其余归推理。
        const partial = newBuffer.match(PARTIAL_THINK_CLOSE_RE);
        state.appendReasoning(partial ? newBuffer.slice(0, partial.index) : newBuffer);
        state.setState({
          inThinkingBlock: newInThinkingBlock,
          thinkingBuffer: partial ? partial[0] : '',
        });
        return output;
      }

      const startMatch = newBuffer.match(REASONING_OPEN_RE);
      // ★ 裸闭合（Z1 形态）：**闭合之前全是思考**，且优先级高于开标签匹配 ——
      //   两者同时出现时，谁在前谁定界（见下一条判断）。
      const bareCloseMatch = newBuffer.match(REASONING_CLOSE_RE);
      if (bareCloseMatch && (!startMatch || bareCloseMatch.index < startMatch.index)) {
        state.appendReasoning(newBuffer.slice(0, bareCloseMatch.index));
        newBuffer = newBuffer.slice(bareCloseMatch.index + bareCloseMatch[0].length);
        continue;
      }

      if (startMatch) {
        const beforeThink = newBuffer.slice(0, startMatch.index);
        const afterThink = newBuffer.slice(startMatch.index + startMatch[0].length);

        const endMatch = afterThink.match(REASONING_CLOSE_RE);
        if (endMatch) {
          // 同一块里的完整 `<think>…</think>`：中间就是推理内容（修复前丢弃）
          state.appendReasoning(afterThink.slice(0, endMatch.index));
          output += beforeThink;
          newBuffer = afterThink.slice(endMatch.index + endMatch[0].length);
          continue;
        }
        newInThinkingBlock = true;
        output += beforeThink;
        const partial = afterThink.match(PARTIAL_THINK_CLOSE_RE);
        state.appendReasoning(partial ? afterThink.slice(0, partial.index) : afterThink);
        state.setState({
          inThinkingBlock: newInThinkingBlock,
          thinkingBuffer: partial ? partial[0] : '',
        });
        return output;
      }

      break;
    }

    // 检测不完整标签结尾：闭合（`</thi`）、开口（`<thi`）、以及孤零零的 `<` / `</`。
    // 三者都必须留到下一块 —— 提前吐出去就是「标签被拆成两半」的漏洞来源。
    const partialClose = newBuffer.match(PARTIAL_THINK_CLOSE_RE);
    const partialOpen = partialClose ? null : newBuffer.match(PARTIAL_THINK_OPEN_RE);
    const dangling = partialClose || partialOpen ? null : newBuffer.match(/(<\/?)$/);
    const pendingTag = partialClose || partialOpen || dangling;
    if (pendingTag) {
      output += newBuffer.slice(0, pendingTag.index);
      state.setState({ inThinkingBlock: newInThinkingBlock, thinkingBuffer: pendingTag[0] });
      return output;
    }

    output += newBuffer;
    state.setState({ inThinkingBlock: newInThinkingBlock, thinkingBuffer: '' });
    return output;
  };

  // 流式处理结束时刷新缓冲区
  const flushThinkingBuffer = (thinkingState) => {
    const state = thinkingState;
    // 前导暂存到 EOF 还没判定：交给常态逻辑再跑一遍 —— 没有闭合标签 ⇒ 它是正文；
    // 有闭合标签 ⇒ 前面的归推理。绝不在这里直接当正文吐（那正是这次要修的漏洞）。
    if (state.isLeadingHoldActive?.()) {
      const held = state.takeHeldText();
      if (!held) {
        state.reset();
        return '';
      }
      const visible = filterThinkingContentStream(held, state);
      return visible + flushThinkingBuffer(state);
    }
    const { inThinkingBlock, thinkingBuffer } = state.getState();
    if (inThinkingBlock) {
      // 流在思考块里结束：残留内容（可能是不完整的闭合标签）也归**推理**，
      // 绝不能当成正文吐出去（否则推理尾巴会混进答案）。
      state.appendReasoning(thinkingBuffer.replace(PARTIAL_THINK_CLOSE_RE, ''));
      state.reset();
      return '';
    }
    state.reset();
    // 缓冲区里只剩半截标签（EOF 时拼不回来了）⇒ 半截标签本身不是正文，丢掉。
    return thinkingBuffer.replace(PARTIAL_THINK_CLOSE_RE, '').replace(PARTIAL_THINK_OPEN_RE, '');
  };

  /** 取本轮累积的推理内容（渲染层「思考过程」块的数据源） */
  const getThinkingReasoning = (thinkingState) => thinkingState?.getReasoning?.() || '';

  // 重置思考过滤状态（兼容旧接口）
  const resetThinkingState = () => {};

  // ==============================================================
  // 流式模型调用（callModelStream）
  // ==============================================================

  const callModelStream = async (
    modelId,
    prompt,
    systemPrompt,
    history = [],
    onChunk,
    options = {},
    requestSignal = undefined,
    retryCount = 0,
    mode = '',
  ) => {
    const model = availableModels.find((m) => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    // 修复状态残留：每次调用创建独立的thinking状态
    // `model.name` / `model.id` 只用于「要不要先按住开头等判定」的启发式
    // （GLM-Z1 系的思考只有闭合标签），不影响任何可见文本。
    const thinkingState = createThinkingState(`${model.name || ''} ${model.id || ''}`);
    thinkingState.reset();

    const resolvedOptions = {
      max_tokens: Math.trunc(toFiniteNumber(options.max_tokens, 4096, { min: 256, max: 8192 })),
      temperature: toFiniteNumber(options.temperature, 0.7, { min: 0, max: 1.2 }),
      top_p: toFiniteNumber(options.top_p, 0.9, { min: 0.1, max: 1 }),
      frequency_penalty: toFiniteNumber(options.frequency_penalty, 0, { min: 0, max: 2 }),
    };
    const payload = {
      model: model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: prompt },
      ],
      stream: true,
      max_tokens: resolvedOptions.max_tokens,
      temperature: resolvedOptions.temperature,
      top_p: resolvedOptions.top_p,
      frequency_penalty: resolvedOptions.frequency_penalty,
    };

    try {
      const response = await callVaultSiliconChatStream({
        provider: model.providerKey || 'siliconflow',
        purpose: 'chat',
        mode: mode || getMode(),
        payload,
        apiUrl: model.url,
        timeoutMs: STREAM_MODEL_CALL_TIMEOUT_MS,
        signal: _combineSignals(
          requestSignal || (abortController.value ? abortController.value.signal : undefined),
          STREAM_MODEL_CALL_TIMEOUT_MS,
        ),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let finalText = '';
      const sseParser = createSseLineParser((payload) => {
        try {
          const data = JSON.parse(payload);
          // 真实模型名 / 「思考走独立字段」只有上游报文里才有（前端拿到的是 boh:<mode_id>），
          // 前导暂存的解除条件依赖它 —— 见 createThinkingState 的 notePayload。
          thinkingState.notePayload?.(data);
          const delta = data.choices?.[0]?.delta || {};
          const rawContent = delta.content || '';

          if (rawContent) {
            const content = safeChunkToString(rawContent);
            const filteredContent = filterThinkingContentStream(content, thinkingState);
            if (filteredContent && filteredContent !== '[object Object]') {
              thinkingState.noteEmitted?.(filteredContent);
              finalText += filteredContent;
              if (typeof onChunk === 'function') onChunk(filteredContent);
            }
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

      // SSE error 事件处理：边缘函数在流中发送 event: error 时，抛出错误让上层捕获
      const sseError = sseParser.getError?.();
      if (sseError) {
        throw sseError;
      }

      const remainingContent = flushThinkingBuffer(thinkingState);
      if (remainingContent && remainingContent !== '[object Object]') {
        finalText += remainingContent;
        if (typeof onChunk === 'function') onChunk(remainingContent);
      }
      return finalText;
    } catch (error) {
      if (retryCount < 1 && error.name !== 'AbortError') {
        logger.warn('boh-ai', `Model ${modelId} failed (Stream), trying fallback`, error);
        const fallbackModel = getFallbackModel(modelId);
        if (fallbackModel && fallbackModel.id !== modelId) {
          // B4 fix: 返回 fallback 调用结果，而非 undefined
          return callModelStream(
            fallbackModel.id,
            prompt,
            systemPrompt,
            history,
            onChunk,
            options,
            requestSignal,
            retryCount + 1,
          );
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
      return messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    }

    const olderMessages = messages.slice(0, -5);
    const recentMessages = messages.slice(-5).map((m) => ({ role: m.role, content: m.content }));

    try {
      const summaryModel =
        availableModels.find((m) => m.id === 'Qwen/Qwen2.5-7B-Instruct') || availableModels[0];
      const summaryPromptForModel = [
        '<role>对话摘要器</role>',
        '<constraints>',
        '- 输出简洁摘要（最多 300 词）',
        '- 聚焦核心用户需求、项目目标和关键决策',
        '- 不要添加原文没有的信息',
        '</constraints>',
        '<context>',
        olderMessages.map((m) => `${m.role}: ${m.content}`).join('\n'),
        '</context>',
      ].join('\n');
      const summary = await callModelInternal(
        summaryModel.id,
        summaryPromptForModel,
        '<role>你是对话摘要器。</role>\n<constraints>\n- 只输出摘要正文\n- 不要额外说明\n</constraints>',
        [],
        requestSignal,
      );

      return [
        { role: 'system', content: `【Previous Conversation Summary】: ${summary}` },
        ...recentMessages,
      ];
    } catch (e) {
      logger.warn('boh-ai', 'Smart Context summary failed, falling back to slice', e);
      return messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
    }
  };

  // ==============================================================
  // 暴露接口
  // ==============================================================

  return {
    callModelInternal,
    callModelStream,
    _getSmartContext,
    createThinkingState,
    filterThinkingContent,
    filterThinkingContentStream,
    flushThinkingBuffer,
    getThinkingReasoning,
    resetThinkingState,
    createSseLineParser,
    getFallbackModel,
    toFiniteNumber,
    safeChunkToString,
  };
}
