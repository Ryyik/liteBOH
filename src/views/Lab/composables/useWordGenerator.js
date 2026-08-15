import { ref } from 'vue'
import { callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { supabase } from '@/utils/supabase-client.js'
import { DEFAULT_PRESET_ID } from '../config/design-tokens.js'
import {
  WORD_OUTLINE_PROMPT, WORD_DETAIL_PROMPT, WORD_SCHEMA, extractJSON, FRONTEND_MAX_OUTPUT_TOKENS,
} from '../config/ai-schemas.js'

const API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'

async function loadWordModelConfig() {
  try {
    const { data, error } = await supabase
      .from('lab_ai_model_configs')
      .select('model_id, temperature, max_tokens, api_key_purpose')
      .eq('feature_key', 'word-generator')
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data || !data.model_id) {
      throw new Error('lab_ai_model_configs 中未配置 word-generator 模型')
    }
    return {
      model: data.model_id,
      temperature: Number(data.temperature) || 0.5,
      max_tokens: data.max_tokens || 4096,
      apiKeyPurpose: data.api_key_purpose || 'chat',
    }
  } catch (e) {
    throw new Error('加载文档生成模型配置失败：' + (e?.message || e))
  }
}

/**
 * Word 从零生成器（两阶段：大纲 → 详情 + token-based 渲染）
 */
export function useWordGenerator() {
  const isGenerating = ref(false)
  const error = ref('')
  const docData = ref(null)
  const outline = ref(null)
  const stage = ref('')

  /**
   * 第一阶段：生成大纲
   * @param {string} topic - 主题
   * @param {string} context - 上下文
   * @param {function} onProgress - 进度回调 (stage, progress, text)
   */
  async function generateOutline(topic, context = '', onProgress = null, signal) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'outline'
    if (onProgress) onProgress('outline', 0, 'BOH Agent正在为你生成Word大纲')
    try {
      const modelConfig = await loadWordModelConfig()
      const prompt = `${WORD_OUTLINE_PROMPT}

主题：${topic}
${context ? `额外要求：${context}` : ''}

输出格式（JSON）：
{
  "title": "文档标题",
  "outline": [
    { "type": "heading", "title": "一级标题", "summary": "本章概述" },
    { "type": "paragraph", "title": "段落主题", "summary": "要点" },
    { "type": "list", "title": "列表项", "summary": "3-5 项" },
    { "type": "table", "title": "表格标题", "summary": "行列结构" }
  ]
}`

      if (onProgress) onProgress('outline', 30, 'BOH Agent正在为你生成Word大纲')

      const result = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: API_URL,
        timeoutMs: 120000,
        signal,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: WORD_OUTLINE_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: Math.min(modelConfig.max_tokens, FRONTEND_MAX_OUTPUT_TOKENS),
        },
      })

      if (onProgress) onProgress('outline', 70, 'BOH Agent正在解析大纲结构')

      if (!result.ok) throw new Error(result.error?.message || 'AI 调用失败')
      const raw = result.data?.choices?.[0]?.message?.content || ''
      const data = extractJSON(raw)
      if (!data || !data.outline) throw new Error('AI 未返回有效大纲')

      if (onProgress) onProgress('outline', 100, '大纲生成完成')
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
   * 第二阶段：基于大纲生成详细内容
   * @param {string} topic - 主题
   * @param {string} context - 上下文
   * @param {object} outlineData - 大纲数据
   * @param {function} onProgress - 进度回调 (stage, progress, text)
   */
  async function generateDoc(topic, context = '', outlineData = null, onProgress = null, signal) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'detail'
    if (onProgress) onProgress('detail', 0, 'BOH Agent正在为你输出Word文档')
    try {
      const useOutline = outlineData || outline.value
      const modelConfig = await loadWordModelConfig()

      if (onProgress) onProgress('detail', 20, 'BOH Agent正在为你输出Word文档')

      const prompt = `${WORD_DETAIL_PROMPT}

主题：${topic}
${context ? `额外要求：${context}` : ''}

已确认大纲：
${JSON.stringify(useOutline, null, 2)}

请输出完整的 Word 文档 JSON，结构与以下 Schema 一致：
${JSON.stringify(WORD_SCHEMA, null, 2)}

要求：
- blocks 数组顺序与大纲一致
- 正文段落充实，每段 100-300 字
- 严格输出 JSON，不要任何额外文字`

      if (onProgress) onProgress('detail', 40, 'BOH Agent正在生成文档内容')

      const result = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: API_URL,
        timeoutMs: 180000,
        signal,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: WORD_DETAIL_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: Math.min(modelConfig.max_tokens, FRONTEND_MAX_OUTPUT_TOKENS),
        },
      })

      if (onProgress) onProgress('detail', 70, 'BOH Agent正在构建文档结构')

      if (!result.ok) throw new Error(result.error?.message || 'AI 调用失败')
      const raw = result.data?.choices?.[0]?.message?.content || ''
      const data = extractJSON(raw)
      if (!data || !data.blocks) throw new Error('AI 未返回有效文档结构')

      if (onProgress) onProgress('detail', 100, 'Word文档生成完成')
      docData.value = data
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
   * 构建 Word 文件
   */
  async function buildWordFile(data, presetId = DEFAULT_PRESET_ID, fileName = 'AI生成.docx') {
    const { buildAndDownloadWord } = await import('../engine/word-builder.js')
    return buildAndDownloadWord(data, presetId, fileName)
  }

  /**
   * 构建 Word Blob（不触发下载，用于预览）
   */
  async function buildWordBlob(data, presetId = DEFAULT_PRESET_ID) {
    const { buildWordDoc } = await import('../engine/word-builder.js')
    return buildWordDoc(data, presetId)
  }

  return {
    isGenerating,
    error,
    docData,
    outline,
    stage,
    generateOutline,
    generateDoc,
    buildWordFile,
    buildWordBlob,
  }
}
