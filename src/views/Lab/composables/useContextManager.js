import { ref, computed } from 'vue'

/**
 * 上下文管理器
 * 负责：Token 预算分配、上下文压缩、压缩摘要生成
 */

// P1-7: 模块级 memoize 缓存，消除流式生成时对历史消息的重复 estimateTokens 调用（O(n²) → O(n)）。
// 历史消息 content 不变，缓存命中；流式消息 content 每次追加产生新 key，旧 key 自然保留。
// 限制大小避免流式场景内存无限增长，LRU 式清理（Map 保持插入顺序）。
const _tokenCache = new Map()
const _TOKEN_CACHE_MAX = 800

export function useContextManager() {
  const TOKEN_BUDGET = 32000
  const SYSTEM_PROMPT_COST = 2000
  const DOC_SUMMARY_COST = 3000
  const MARGIN = 2000

  // 对话历史 token 预算
  const historyBudget = computed(() => TOKEN_BUDGET - SYSTEM_PROMPT_COST - DOC_SUMMARY_COST - MARGIN)

  // token 估算（中文约 1.5 chars/token，英文约 4 chars/token）
  // 已 memoize：相同 content 只计算一次，流式生成时历史消息零开销
  function estimateTokens(text) {
    if (!text) return 0
    const cached = _tokenCache.get(text)
    if (cached !== undefined) return cached
    const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
    const ascii = text.length - cjk
    const result = Math.ceil(cjk * 1.5 + ascii / 4)
    if (_tokenCache.size >= _TOKEN_CACHE_MAX) {
      // 清理最旧的 1/4 条目，分摊清理成本
      const it = _tokenCache.keys()
      const removeCount = Math.floor(_TOKEN_CACHE_MAX / 4)
      for (let i = 0; i < removeCount; i++) _tokenCache.delete(it.next().value)
    }
    _tokenCache.set(text, result)
    return result
  }

  // 压缩消息列表：移除最早的非关键消息，保留系统提示和最近 N 轮
  function trimMessages(messages, maxTokens = historyBudget.value) {
    if (!messages || messages.length === 0) return []

    const result = [...messages]
    let totalTokens = result.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0)

    // 从最旧消息开始移除（保留最后 2 轮）
    while (totalTokens > maxTokens && result.length > 4) {
      const removed = result.shift()
      totalTokens -= estimateTokens(removed.content || '')
    }

    return result
  }

  // 生成对话摘要（用于压缩上下文）
  async function generateSummary(messages, maxTokens = 500) {
    if (!messages || messages.length === 0) return ''

    // 提取关键信息：用户意图、AI 操作、当前状态
    const userIntents = messages
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => m.content?.slice(0, 100))
      .filter(Boolean)

    const aiActions = messages
      .filter(m => m.role === 'assistant' && m.content)
      .slice(-3)
      .map(m => {
        const text = m.content.slice(0, 150)
        if (m.operations?.length) return `${text} (${m.operations.length}项操作)`
        if (m.ppt) return `${text} (PPT: ${m.ppt.slides?.length || 0}页)`
        if (m.word) return `${text} (Word: ${m.word.blocks?.length || 0}块)`
        if (m.code) return `${text} (网页代码)`
        if (m.outline) return `${text} (大纲: ${m.outline.outline?.length || 0}项)`
        return text
      })
      .filter(Boolean)

    const summary = [
      userIntents.length ? `用户需求：${userIntents.join('；')}` : '',
      aiActions.length ? `已完成：${aiActions.join('；')}` : '',
      `对话轮次：${messages.length}`,
    ].filter(Boolean).join('\n')

    // 控制摘要长度
    if (estimateTokens(summary) > maxTokens) {
      return summary.slice(0, maxTokens * 2)
    }
    return summary
  }

  // 构建压缩后的上下文（自动或手动）
  function buildCompressedContext(systemPrompt, docSummary, messages, force = false) {
    const trimmed = force ? trimMessages(messages, historyBudget.value / 2) : trimMessages(messages)
    const summary = generateSummary(messages)

    return {
      systemPrompt: `${systemPrompt}\n\n## 对话摘要\n${summary}\n\n## 当前文档\n${docSummary}`,
      messages: trimmed,
      compressed: trimmed.length < messages.length,
      originalCount: messages.length,
      compressedCount: trimmed.length,
    }
  }

  // 检查是否需要压缩
  function needsCompression(messages) {
    if (!messages || messages.length < 6) return false
    const total = messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0)
    return total > historyBudget.value * 0.8
  }

  return {
    estimateTokens,
    trimMessages,
    generateSummary,
    buildCompressedContext,
    needsCompression,
    historyBudget,
  }
}
