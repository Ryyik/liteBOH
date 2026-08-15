import { ref } from 'vue'
import { callVaultSiliconChatStream, callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { supabase } from '@/utils/supabase-client.js'
import { buildCodeZip, downloadZipBlob } from '../engine/html-renderer.js'
import { CODE_OUTLINE_PROMPT, CODE_DETAIL_PROMPT } from '../config/code-prompts.js'
import { extractJSON, buildThinkingInstruction, FRONTEND_MAX_OUTPUT_TOKENS } from '../config/ai-schemas.js'

const API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'

async function loadCodeModelConfig() {
  try {
    const { data, error } = await supabase
      .from('lab_ai_model_configs')
      .select('model_id, temperature, max_tokens, api_key_purpose')
      .eq('feature_key', 'code-generator')
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data || !data.model_id) {
      throw new Error('lab_ai_model_configs 中未配置 code-generator 模型')
    }
    return {
      model: data.model_id,
      temperature: Number(data.temperature) || 0.5,
      max_tokens: data.max_tokens || 8192,
      apiKeyPurpose: data.api_key_purpose || 'chat',
    }
  } catch (e) {
    throw new Error('加载代码生成模型配置失败：' + (e?.message || e))
  }
}

/**
 * Code 生成器（两阶段：大纲 → 完整 HTML/CSS/JS）
 */
export function useCodeGenerator() {
  const isGenerating = ref(false)
  const error = ref('')
  const codeData = ref(null)
  const outline = ref(null)
  const stage = ref('')

  /**
   * 第一阶段：生成网页架构大纲
   */
  async function generateOutline(topic, context = '', onProgress = null, thinkingLevel = 0.5, signal) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'outline'
    if (onProgress) onProgress('outline', 0, 'BOH Agent正在为你规划网页架构')
    try {
      const modelConfig = await loadCodeModelConfig()
      const thinkingInstr = buildThinkingInstruction(thinkingLevel)
      const prompt = `${CODE_OUTLINE_PROMPT}${thinkingInstr}

主题/需求：${topic}
${context ? `额外要求：${context}` : ''}

输出格式（JSON）：
{
  "title": "网页标题",
  "description": "页面描述",
  "colorScheme": { "primary": "#...", "secondary": "#...", "accent": "#..." },
  "outline": [
    { "type": "nav", "title": "导航栏", "summary": "品牌Logo + 导航链接" },
    { "type": "hero", "title": "首屏", "summary": "大标题 + 副标题 + CTA按钮" },
    { "type": "features", "title": "特色功能", "summary": "3列卡片展示核心功能" },
    { "type": "footer", "title": "页脚", "summary": "版权信息 + 社交链接" }
  ]
}`

      if (onProgress) onProgress('outline', 30, 'BOH Agent正在规划网页架构')

      const result = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: API_URL,
        timeoutMs: 120000,
        signal,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: CODE_OUTLINE_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: Math.min(Math.max(modelConfig.max_tokens, 8192), FRONTEND_MAX_OUTPUT_TOKENS),
        },
      })

      if (onProgress) onProgress('outline', 70, 'BOH Agent正在解析网页架构')

      if (!result.ok) throw new Error(result.error?.message || 'AI 调用失败')
      const raw = result.data?.choices?.[0]?.message?.content || ''
      const data = extractJSON(raw)
      if (!data || !data.outline) {
        throw new Error(`AI 未返回有效网页架构（原始响应前 200 字：${raw.slice(0, 200).replace(/\n/g, ' ')})`)
      }

      if (onProgress) onProgress('outline', 100, '网页架构规划完成')
      outline.value = data
      return data
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isGenerating.value = false
      stage.value = ''
    }
  }

  /**
   * 第二阶段：基于大纲生成完整 HTML 代码
   */
  async function generateCode(topic, context = '', outlineData = null, onProgress = null, thinkingLevel = 0.5, onChunk = null, signal) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'detail'
    if (onProgress) onProgress('detail', 0, 'BOH Agent正在为你编写网页代码')
    try {
      const useOutline = outlineData || outline.value
      const modelConfig = await loadCodeModelConfig()
      const thinkingInstr = buildThinkingInstruction(thinkingLevel)

      if (onProgress) onProgress('detail', 20, 'BOH Agent正在生成 HTML 结构')

      const prompt = `${CODE_DETAIL_PROMPT}${thinkingInstr}

主题/需求：${topic}
${context ? `额外要求：${context}` : ''}

已确认网页架构：
${JSON.stringify(useOutline, null, 2)}

请输出完整的 HTML5 文档，直接从 <!DOCTYPE html> 开始。`

      if (onProgress) onProgress('detail', 40, 'BOH Agent正在编写 CSS 样式')

      // 流式读取，通过 onChunk 实时推送到消息内容
      const response = await callVaultSiliconChatStream({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: API_URL,
        timeoutMs: 240000,
        signal,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: CODE_DETAIL_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: Math.min(Math.max(modelConfig.max_tokens, 32768), FRONTEND_MAX_OUTPUT_TOKENS),
        },
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      let sseError = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // 显式处理 Edge Function 发来的 SSE error 事件
          if (line.startsWith('event: error')) {
            sseError = true
            continue
          }
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim()
            if (!dataStr) continue
            try {
              const parsed = JSON.parse(dataStr)
              if (sseError || parsed.ok === false) {
                throw new Error(parsed.message || 'AI 服务返回错误')
              }
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                fullContent += delta
                if (onChunk) onChunk(fullContent)
              }
            } catch (_parseErr) {
              // 若是已识别的 SSE 错误，向上抛出（保留原始错误文本）
              if (sseError) {
                throw new Error(`AI 服务返回错误：${dataStr}`)
              }
              /* skip non-JSON lines */
            }
            sseError = false
          }
        }
      }

      if (sseError) {
        throw new Error('AI 服务返回错误事件但未提供详细错误信息')
      }

      if (onProgress) onProgress('detail', 70, 'BOH Agent正在提取 HTML')

      // 从原始响应中提取 HTML（AI 直接输出纯 HTML，无 JSON 包裹）
      let rawContent = fullContent.trim()
      // 去掉 markdown 代码围栏（如果 AI 没遵守指令）
      rawContent = rawContent.replace(/^```[\w-]*\s*/i, '').replace(/\s*```$/, '').trim()
      let html = ''
      // 优先匹配完整 <!DOCTYPE html>…</html>
      const fullMatch = rawContent.match(/<!DOCTYPE html>[\s\S]*<\/html>/i) || rawContent.match(/<html[\s\S]*<\/html>/i)
      if (fullMatch) {
        html = fullMatch[0]
      } else {
        // 截断时取从 <!DOCTYPE html> 或 <html 开始到末尾的内容
        const partial = rawContent.match(/<!DOCTYPE html>[\s\S]*/i) || rawContent.match(/<html[\s\S]*/i)
        if (partial) html = partial[0]
      }
      if (!html) {
        throw new Error(`AI 未返回有效 HTML 代码（原始响应前 200 字：${rawContent.slice(0, 200).replace(/\n/g, ' ')})`)
      }
      // 检测是否截断（缺少 </html> 闭合标签）
      const isTruncated = !/<\/html>/i.test(html)
      if (isTruncated) {
        html += '\n<!-- ⚠️ AI 输出被截断，可重新生成或手动补全 -->\n</html>'
      }

      // 从 <title> 提取标题
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : 'AI 生成网页'
      const data = { title, html }

      if (onProgress) onProgress('detail', 100, '网页代码生成完成')
      codeData.value = data
      return data
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isGenerating.value = false
      stage.value = ''
    }
  }

  /**
   * 下载 ZIP 文件
   */
  async function downloadCode(data, fileName = 'AI生成网页.zip') {
    const blob = await buildCodeZip(data)
    downloadZipBlob(blob, fileName)
  }

  return {
    isGenerating,
    error,
    codeData,
    outline,
    stage,
    generateOutline,
    generateCode,
    downloadCode,
  }
}
