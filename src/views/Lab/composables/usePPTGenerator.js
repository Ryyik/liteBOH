import { ref } from 'vue'
import pptxgen from 'pptxgenjs'
import { callVaultSiliconChat } from '@/utils/api/api-key-runtime-api.js'
import { resolveSiliconFlowFreeModelId, SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID } from '@/utils/siliconflow-free-models.js'
import { getTemplateById } from '../config/ppt-templates.js'

const BOHAI_CHAT_API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'
const BOHAI_DEFAULT_MODEL_ID = resolveSiliconFlowFreeModelId(
  import.meta.env.VITE_BOHAI_DEFAULT_MODEL,
  SILICONFLOW_DEFAULT_FREE_CHAT_MODEL_ID
)

/**
 * PPT 生成器 composable
 * 实现 AI 输出结构化 JSON + 前端转换为 PPT 的方案
 * 使用 BOHAI 同款的 API Key Vault 调用方式
 * 支持预设模板系统
 */
export function usePPTGenerator() {
  const isGenerating = ref(false)
  const error = ref('')
  const pptData = ref(null)

  /**
   * 让 AI 生成 PPT 结构化内容
   * @param {string} topic - PPT 主题
   * @param {string} context - 额外上下文（可选）
   * @returns {Promise<Object>} - PPT 数据对象
   */
  async function generatePPTStructure(topic, context = '') {
    isGenerating.value = true
    error.value = ''

    try {
      // 构建 Prompt
      const prompt = buildPrompt(topic, context)

      // 使用 BOHAI 同款的 API 调用方式
      const result = await callVaultSiliconChat({
        provider: 'siliconflow',
        purpose: 'ppt-generator',
        apiUrl: BOHAI_CHAT_API_URL,
        timeoutMs: 60000,
        payload: {
          model: BOHAI_DEFAULT_MODEL_ID,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的PPT内容策划助手，擅长生成结构化的演示文稿内容。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false,
          temperature: 0.7,
          max_tokens: 2000
        }
      })

      if (!result.ok) {
        throw new Error(result.error?.message || 'AI API 调用失败')
      }

      const response = result.data?.choices?.[0]?.message?.content || ''

      // 解析 JSON
      const jsonData = parseJSONResponse(response)

      pptData.value = jsonData
      return jsonData

    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * 构建 AI Prompt
   */
  function buildPrompt(topic, context) {
    return `你是一个专业的PPT内容策划助手。请根据用户提供的主题，生成一份结构化的PPT大纲。

主题：${topic}
${context ? `额外要求：${context}` : ''}

请严格按照以下JSON格式输出，不要添加任何额外的文字说明：

{
  "title": "PPT标题",
  "author": "BOH AI",
  "slides": [
    {
      "type": "title",
      "title": "封面标题",
      "subtitle": "副标题或日期"
    },
    {
      "type": "content",
      "title": "章节标题",
      "points": [
        "要点1（简洁有力）",
        "要点2",
        "要点3",
        "要点4",
        "要点5"
      ]
    },
    {
      "type": "two-column",
      "title": "对比分析",
      "leftColumn": {
        "title": "左侧标题",
        "items": ["项目1", "项目2"]
      },
      "rightColumn": {
        "title": "右侧标题",
        "items": ["项目1", "项目2"]
      }
    },
    {
      "type": "end",
      "title": "谢谢观看",
      "subtitle": "联系方式或总结"
    }
  ]
}

要求：
1. 每张幻灯片内容不超过5个要点
2. 标题简洁有力，不超过10个字
3. 内容要有逻辑性，符合PPT演示流程
4. 必须输出有效的JSON格式，不要有任何语法错误
5. 包含封面页和结束页
6. 根据主题生成5-8张幻灯片
7. 只输出JSON，不要有任何其他文字

现在开始生成：`
  }

  /**
   * 解析 JSON 响应
   */
  function parseJSONResponse(response) {
    try {
      // 尝试直接解析
      return JSON.parse(response)
    } catch (e) {
      // 如果失败，尝试提取 JSON 部分
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0])
        } catch (e2) {
          throw new Error('AI 输出的 JSON 格式无效，请重新生成')
        }
      }
      throw new Error('AI 未返回有效的 JSON 格式')
    }
  }

  /**
   * 根据 PPT 数据生成 PPT 文件
   * @param {Object} data - PPT 结构数据
   * @param {string} templateId - 模板 ID（可选）
   * @param {string} fileName - 文件名
   */
  async function buildPPT(data, templateId = 'boh-brand', fileName = 'AI生成.pptx') {
    const template = getTemplateById(templateId)
    const pptx = new pptxgen()

    // 设置 PPT 属性
    pptx.author = data.author || 'BOH AI'
    pptx.title = data.title
    pptx.subject = 'AI 生成演示文稿'

    // 设置布局
    pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 7.5 })
    pptx.layout = 'CUSTOM'

    // 遍历幻灯片
    for (const slideData of data.slides) {
      const slide = pptx.addSlide()

      // 根据类型渲染不同布局，使用模板配置
      switch (slideData.type) {
        case 'title':
          renderTitleSlide(slide, slideData, template)
          break

        case 'content':
          renderContentSlide(slide, slideData, template)
          break

        case 'two-column':
          renderTwoColumnSlide(slide, slideData, template)
          break

        case 'end':
          renderEndSlide(slide, slideData, template)
          break

        default:
          renderContentSlide(slide, slideData, template)
      }
    }

    // 导出 PPT
    await pptx.writeFile({ fileName })
    return true
  }

  /**
   * 渲染封面页（使用模板配置）
   */
  function renderTitleSlide(slide, data, template) {
    const { colors, fonts, layout } = template
    const padding = layout.padding.title

    // 背景
    slide.background = { color: colors.background.title }

    // 标题
    slide.addText(data.title, {
      x: padding.x,
      y: padding.y,
      w: 9,
      h: 1.5,
      fontSize: fonts.title.size,
      fontFace: fonts.title.family,
      color: colors.text.primary,
      bold: fonts.title.bold,
      align: 'center',
    })

    // 副标题
    if (data.subtitle) {
      slide.addText(data.subtitle, {
        x: layout.padding.subtitle.x,
        y: layout.padding.subtitle.y,
        w: 9,
        h: 0.8,
        fontSize: fonts.subtitle.size,
        fontFace: fonts.subtitle.family,
        color: colors.text.primary,
        align: 'center',
      })
    }

    // Logo（如果模板配置了品牌）
    if (template.brand?.showOnSlides) {
      slide.addText(template.brand.logo, {
        x: 8,
        y: 6.5,
        w: 1.5,
        h: 0.5,
        fontSize: 12,
        color: colors.primary,
        align: 'right',
      })
    }
  }

  /**
   * 渲染内容页（使用模板配置）
   */
  function renderContentSlide(slide, data, template) {
    const { colors, fonts } = template

    // 背景
    slide.background = { color: colors.background.content }

    // 标题
    slide.addText(data.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: fonts.contentTitle.size,
      fontFace: fonts.contentTitle.family,
      color: colors.text.secondary,
      bold: fonts.contentTitle.bold,
    })

    // 要点列表
    if (data.points && data.points.length > 0) {
      const bulletPoints = data.points.map(p => ({ text: p, options: { bullet: true } }))
      
      slide.addText(bulletPoints, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 5,
        fontSize: fonts.body.size,
        fontFace: fonts.body.family,
        color: colors.text.muted,
        valign: 'top',
        lineSpacing: 28,
      })
    }

    // 底部装饰线（如果模板是商务简约）
    if (template.id === 'business') {
      slide.addShape(pptx.ShapeType.line, {
        x: 0.5,
        y: 7,
        w: 9,
        h: 0,
        line: { color: colors.primary, width: 2 }
      })
    }
  }

  /**
   * 渲染两栏页（使用模板配置）
   */
  function renderTwoColumnSlide(slide, data, template) {
    const { colors, fonts } = template

    // 背景
    slide.background = { color: colors.background.content }

    // 标题
    slide.addText(data.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: fonts.contentTitle.size,
      fontFace: fonts.contentTitle.family,
      color: colors.text.secondary,
      bold: fonts.contentTitle.bold,
    })

    // 左栏标题
    if (data.leftColumn) {
      slide.addText(data.leftColumn.title, {
        x: 0.5,
        y: 1.5,
        w: 4,
        h: 0.5,
        fontSize: fonts.subtitle.size,
        fontFace: fonts.subtitle.family,
        color: colors.primary,
        bold: true,
      })

      // 左栏内容
      const leftPoints = data.leftColumn.items.map(i => ({ text: i, options: { bullet: true } }))
      slide.addText(leftPoints, {
        x: 0.5,
        y: 2.2,
        w: 4,
        h: 4,
        fontSize: fonts.body.size,
        fontFace: fonts.body.family,
        color: colors.text.muted,
      })
    }

    // 右栏标题
    if (data.rightColumn) {
      slide.addText(data.rightColumn.title, {
        x: 5.5,
        y: 1.5,
        w: 4,
        h: 0.5,
        fontSize: fonts.subtitle.size,
        fontFace: fonts.subtitle.family,
        color: colors.primary,
        bold: true,
      })

      // 右栏内容
      const rightPoints = data.rightColumn.items.map(i => ({ text: i, options: { bullet: true } }))
      slide.addText(rightPoints, {
        x: 5.5,
        y: 2.2,
        w: 4,
        h: 4,
        fontSize: fonts.body.size,
        fontFace: fonts.body.family,
        color: colors.text.muted,
      })
    }
  }

  /**
   * 渲染结束页（使用模板配置）
   */
  function renderEndSlide(slide, data, template) {
    const { colors, fonts, layout } = template
    const padding = layout.padding.title

    // 背景
    slide.background = { color: colors.background.end }

    // 标题
    slide.addText(data.title, {
      x: padding.x,
      y: 2.8,
      w: 9,
      h: 1.2,
      fontSize: fonts.title.size,
      fontFace: fonts.title.family,
      color: colors.text.primary,
      bold: fonts.title.bold,
      align: 'center',
    })

    // 副标题
    if (data.subtitle) {
      slide.addText(data.subtitle, {
        x: padding.x,
        y: 4.2,
        w: 9,
        h: 0.8,
        fontSize: fonts.subtitle.size,
        fontFace: fonts.subtitle.family,
        color: colors.text.primary,
        align: 'center',
      })
    }

    // Logo（如果模板配置了品牌）
    if (template.brand?.showOnSlides) {
      slide.addText(`由 ${template.brand.logo} 生成`, {
        x: 0.5,
        y: 6,
        w: 9,
        h: 0.5,
        fontSize: 14,
        color: colors.primary,
        align: 'center',
      })
    }
  }

  return {
    isGenerating,
    error,
    pptData,
    generatePPTStructure,
    buildPPT,
  }
}