import { ref } from 'vue'
import { callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { resolveSiliconFlowFreeModelId, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID } from '@/utils/siliconflow-free-models.js'
import { supabase } from '@/utils/supabase-client.js'
import { buildPPT as renderPPT } from '../engine/ppt-renderer.js'
import { STYLE_PRESETS, DEFAULT_PRESET_ID } from '../config/design-tokens.js'
import {
  PPT_OUTLINE_PROMPT, PPT_DETAIL_PROMPT, PPT_SCHEMA, OUTLINE_SCHEMA, extractJSON,
} from '../config/ai-schemas.js'

const BOHAI_CHAT_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'

async function loadPptModelConfig() {
  try {
    const { data, error } = await supabase
      .from('lab_ai_model_configs')
      .select('model_id, temperature, max_tokens, api_key_purpose')
      .eq('feature_key', 'ppt-generator')
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) {
      return {
        model: resolveSiliconFlowFreeModelId(import.meta.env.VITE_BOHAI_DEFAULT_MODEL, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID),
        temperature: 0.7,
        max_tokens: 4096,
        apiKeyPurpose: 'chat',
      }
    }
    return {
      model: resolveSiliconFlowFreeModelId(data.model_id, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID),
      temperature: Number(data.temperature) || 0.7,
      max_tokens: data.max_tokens || 4096,
      apiKeyPurpose: data.api_key_purpose || 'chat',
    }
  } catch {
    return {
      model: resolveSiliconFlowFreeModelId(import.meta.env.VITE_BOHAI_DEFAULT_MODEL, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID),
      temperature: 0.7,
      max_tokens: 4096,
      apiKeyPurpose: 'chat',
    }
  }
}

/**
 * PPT 生成器（两阶段：大纲 → 详情 + token-based 渲染）
 */
export function usePPTGenerator() {
  const isGenerating = ref(false)
  const error = ref('')
  const pptData = ref(null)
  const outline = ref(null)
  const stage = ref('') // 'outline' | 'detail' | ''

  /**
   * 第一阶段：生成大纲
   * @param {string} topic - 主题
   * @param {string} context - 上下文
   * @param {function} onProgress - 进度回调 (stage, progress, text)
   */
  async function generateOutline(topic, context = '', onProgress = null) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'outline'
    if (onProgress) onProgress('outline', 0, 'BOH Agent正在为你生成PPT大纲')
    try {
      const modelConfig = await loadPptModelConfig()
      const prompt = `${PPT_OUTLINE_PROMPT}

主题：${topic}
${context ? `额外要求：${context}` : ''}

输出格式（JSON）：
{
  "title": "PPT 主标题",
  "outline": [
    { "type": "cover", "title": "封面标题", "summary": "副标题/日期" },
    { "type": "section", "title": "第一篇", "summary": "概述" },
    { "type": "bullets", "title": "核心要点", "summary": "3-5 个要点" },
    { "type": "end", "title": "谢谢观看", "summary": "结语" }
  ]
}`

      if (onProgress) onProgress('outline', 30, 'BOH Agent正在为你生成PPT大纲')

      const result = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: BOHAI_CHAT_API_URL,
        timeoutMs: 120000,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: PPT_OUTLINE_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: modelConfig.max_tokens,
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
  async function generatePPTStructure(topic, context = '', outlineData = null, onProgress = null) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'detail'
    if (onProgress) onProgress('detail', 0, 'BOH Agent正在为你输出PPT')
    try {
      const useOutline = outlineData || outline.value
      const modelConfig = await loadPptModelConfig()

      if (onProgress) onProgress('detail', 20, 'BOH Agent正在为你输出PPT')

      const prompt = `${PPT_DETAIL_PROMPT}

主题：${topic}
${context ? `额外要求：${context}` : ''}

已确认大纲：
${JSON.stringify(useOutline, null, 2)}

请输出完整的 PPT JSON，结构与以下 Schema 一致：
${JSON.stringify(PPT_SCHEMA, null, 2)}

要求：
- slides 数组顺序与大纲一致
- 严格输出 JSON，不要任何额外文字`

      if (onProgress) onProgress('detail', 40, 'BOH Agent正在生成幻灯片内容')

      const result = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        apiUrl: BOHAI_CHAT_API_URL,
        timeoutMs: 180000,
        payload: {
          model: modelConfig.model,
          messages: [
            { role: 'system', content: PPT_DETAIL_PROMPT },
            { role: 'user', content: prompt },
          ],
          stream: true,
          temperature: modelConfig.temperature,
          max_tokens: modelConfig.max_tokens,
        },
      })

      if (onProgress) onProgress('detail', 70, 'BOH Agent正在构建PPT结构')

      if (!result.ok) throw new Error(result.error?.message || 'AI 调用失败')
      const raw = result.data?.choices?.[0]?.message?.content || ''
      const data = extractJSON(raw)
      if (!data || !data.slides) throw new Error('AI 未返回有效 PPT 结构')

      if (onProgress) onProgress('detail', 100, 'PPT生成完成')
      pptData.value = data
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
   * 构建 PPT 文件（接入新引擎）
   */
  async function buildPPTFile(data, presetId = DEFAULT_PRESET_ID, fileName = 'AI生成.pptx', options = {}) {
    return renderPPT(data, presetId, fileName, options)
  }

  // 向后兼容：旧接口
  async function buildPPT(data, templateId, fileName) {
    return buildPPTFile(data, templateId || DEFAULT_PRESET_ID, fileName)
  }

  return {
    isGenerating,
    error,
    pptData,
    outline,
    stage,
    generateOutline,
    generatePPTStructure,
    buildPPTFile,
    buildPPT,
  }
}
