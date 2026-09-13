import { ref } from 'vue'
import { callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { supabase } from '@/utils/supabase-client.js'
import { DEFAULT_PRESET_ID } from '../config/design-tokens.js'
import {
  PPT_OUTLINE_PROMPT, PPT_PAGE_PROMPT, PPT_PAGE_FIX_PROMPT, extractJSON, FRONTEND_MAX_OUTPUT_TOKENS,
} from '../config/ai-schemas.js'

/**
 * PPT 生成器（v2：大纲 → 逐页生成 + 本地质检 + 错误驱动修复 + 单页降级）
 * model_id 存 bohai_model_configs.mode_id，调用时以 mode 传给 vault，由服务端按模式配置路由。
 */
export function usePPTGenerator() {
  const isGenerating = ref(false)
  const error = ref('')
  const pptData = ref(null)
  const outline = ref(null)
  const stage = ref('') // 'outline' | 'detail' | ''

  async function loadPptModelConfig() {
    try {
      const { data, error } = await supabase
        .from('lab_ai_model_configs')
        .select('model_id, temperature, max_tokens, api_key_purpose')
        .eq('feature_key', 'ppt-generator')
        .eq('is_active', true)
        .maybeSingle()
      if (error || !data || !data.model_id) {
        throw new Error('lab_ai_model_configs 中未配置 ppt-generator 模型')
      }
      return {
        model: data.model_id,
        // 结构化 JSON 生成对温度敏感：服务端配置偏高（0.6+）会显著提高解析失败率与 FIX 重试，
        // 前端 clamp 到 ≤0.5（质量优化 2026-09-12）；mode 路由保持不变（模型仍由 BOHAI 模式配置决定）。
        temperature: Math.min(Number(data.temperature) || 0.45, 0.5),
        max_tokens: data.max_tokens || 4096,
        apiKeyPurpose: data.api_key_purpose || 'chat',
      }
    } catch (e) {
      throw new Error('加载 PPT 生成模型配置失败：' + (e?.message || e))
    }
  }

  // 统一的模型调用（mode 路由）
  async function callModel({ modelConfig, systemPrompt, userPrompt, timeoutMs, signal }) {
    const result = await callVaultSiliconChatStreamCollect({
      mode: modelConfig.model,
      purpose: modelConfig.apiKeyPurpose,
      timeoutMs,
      signal,
      payload: {
        model: modelConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        temperature: modelConfig.temperature,
        max_tokens: Math.min(modelConfig.max_tokens, FRONTEND_MAX_OUTPUT_TOKENS),
      },
    })
    if (!result.ok) throw new Error(result.error?.message || 'AI 调用失败')
    const raw = result.data?.choices?.[0]?.message?.content || ''
    return { raw, data: extractJSON(raw) }
  }

  // ===== 本地质检（溢出风险 + 结构完整性） =====
  const SLIDE_TYPES = new Set([
    'cover', 'agenda', 'section', 'content', 'bullets',
    'two-column', 'image-text', 'chart', 'table', 'timeline', 'quote', 'end',
  ])
  const pointText = (p) => String(typeof p === 'object' ? (p?.text ?? '') : (p ?? ''))

  /**
   * 校验单页结构，返回错误清单（空数组 = 通过）
   * @param {object} slide - 单页数据
   */
  function validateSlide(slide) {
    const errors = []
    if (!slide || typeof slide !== 'object') return ['页面不是有效对象']
    if (!SLIDE_TYPES.has(slide.type)) errors.push(`未知版式类型 "${slide.type}"，必须使用 12 种标准版式之一`)
    if (!String(slide.title || '').trim()) errors.push('缺少标题 title')

    const points = Array.isArray(slide.points) ? slide.points : []
    switch (slide.type) {
      case 'bullets':
        if (points.length < 2) errors.push('要点少于 2 条，应扩充为 2-5 条')
        if (points.length > 5) errors.push('要点超过 5 条，版面放不下，请合并到 5 条以内')
        if (points.some(p => pointText(p).length > 40)) errors.push('存在超过 40 字的要点，请精简到 30 字以内')
        if (points.some(p => pointText(p).length > 0 && pointText(p).length < 8)) errors.push('存在过于单薄的要点（少于 8 字），必须补入具体信息（数据/主体/结论/动作），禁止空泛表述')
        break
      case 'content':
        if (!Array.isArray(slide.paragraphs) || slide.paragraphs.length < 1) errors.push('缺少段落内容 paragraphs')
        if (Array.isArray(slide.paragraphs) && slide.paragraphs.length > 4) errors.push('段落超过 4 段，版面放不下，请精简')
        break
      case 'two-column': {
        const l = Array.isArray(slide.leftColumn?.items) ? slide.leftColumn.items : []
        const r = Array.isArray(slide.rightColumn?.items) ? slide.rightColumn.items : []
        if (l.length === 0 || r.length === 0) errors.push('两栏对比缺少左栏或右栏内容')
        if (l.length > 5 || r.length > 5) errors.push('单栏条目超过 5 条，请精简')
        break
      }
      case 'image-text':
        if (points.length < 2 && !String(slide.text || '').trim()) errors.push('图文页缺少要点或正文')
        if (!String(slide.imagePrompt || '').trim()) errors.push('图文页缺少 imagePrompt 配图描述')
        if (points.length > 4) errors.push('图文页要点超过 4 条，请精简')
        break
      case 'chart': {
        const cd = Array.isArray(slide.chartData) ? slide.chartData : []
        if (cd.length < 3) errors.push('图表数据少于 3 项，请补充到 3-6 项')
        if (cd.length > 6) errors.push('图表数据超过 6 项，请精简')
        if (cd.some(d => !Number.isFinite(Number(d?.value)))) errors.push('图表数据存在非数值项，value 必须是数字')
        break
      }
      case 'table': {
        const headers = Array.isArray(slide.headers) ? slide.headers : []
        const rows = Array.isArray(slide.rows) ? slide.rows : []
        if (headers.length < 2) errors.push('表格列数少于 2')
        if (headers.length > 5) errors.push('表格超过 5 列，请精简')
        if (rows.length < 1) errors.push('表格缺少数据行')
        if (rows.length > 6) errors.push('表格超过 6 行，请精简')
        break
      }
      case 'timeline': {
        const ev = Array.isArray(slide.events) ? slide.events : []
        if (ev.length < 3) errors.push('时间线少于 3 个节点，请补充到 3-6 个')
        if (ev.length > 6) errors.push('时间线超过 6 个节点，请精简')
        break
      }
      case 'quote':
        if (!String(slide.quote || slide.text || '').trim()) errors.push('引述页缺少引文 quote')
        if (!String(slide.source || slide.author || '').trim()) errors.push('引述页缺少来源 source')
        break
      case 'agenda': {
        const items = Array.isArray(slide.items) ? slide.items : []
        if (items.length < 2) errors.push('目录少于 2 项')
        if (items.length > 8) errors.push('目录超过 8 项，请精简')
        break
      }
      default:
        break
    }
    if (!String(slide.speakerNotes || '').trim()) errors.push('缺少演讲者备注 speakerNotes')
    return errors
  }

  // 单页降级：保证任何页都有可用内容
  function degradeSlide(item) {
    return {
      type: 'content',
      title: String(item?.title || '内容'),
      paragraphs: [{
        text: String(item?.summary || '本页内容生成失败，可在下载后手动补充。'),
        style: 'body',
      }],
      speakerNotes: '本页内容暂缺，请根据大纲要点口头补充讲解。',
    }
  }

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
    if (onProgress) onProgress('outline', 0, 'BOH Agent正在为你规划PPT结构')
    try {
      const modelConfig = await loadPptModelConfig()

      const prompt = `${PPT_OUTLINE_PROMPT}

主题：${topic}
${context ? `额外要求：${context}` : ''}

请输出大纲 JSON（结构见 constraints 中的 output_format）。`

      if (onProgress) onProgress('outline', 30, 'BOH Agent正在为你规划PPT结构')

      const { data } = await callModel({
        modelConfig,
        systemPrompt: PPT_OUTLINE_PROMPT,
        userPrompt: prompt,
        timeoutMs: 120000,
        signal,
      })

      if (onProgress) onProgress('outline', 70, 'BOH Agent正在解析大纲结构')

      if (!data || !Array.isArray(data.outline) || data.outline.length === 0) {
        throw new Error('AI 未返回有效大纲')
      }

      if (onProgress) onProgress('outline', 100, '大纲规划完成')
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

  // 检查取消信号（逐页循环中及时中断）
  function ensureNotAborted(signal) {
    if (signal?.aborted) {
      const err = new Error('生成已取消')
      err.name = 'AbortError'
      throw err
    }
  }

  /**
   * 生成单页：生成 → 本地质检 → 错误驱动修复（Reviewer）→ 降级
   * @param {object} prev - 上一页衔接信息 { type, digest }：版式衔接 + 已生成页概览（防重复、强连贯）
   * @param {Array} prevPages - 已生成页摘要列表（最多带最近 3 页）
   */
  async function generateSlidePage(topic, context, outlineData, item, modelConfig, signal, prev = null, prevPages = []) {
    const prevLines = prevPages
      .slice(-3)
      .map((p, i) => `${prevPages.length - Math.min(prevPages.length, 3) + i + 1}. ${p}`)
      .join('\n')
    const pageContext = `主题：${topic}
${context ? `额外要求：${context}` : ''}
整体标题：${outlineData.title || topic}
本页大纲条目：${JSON.stringify(item)}
${item.summary ? `本页核心论点：${item.summary}` : ''}
${prev ? `上一页版式：${prev.type || '未知'}（本页版式已被大纲指定时以大纲为准；未指定时避免与上一页相同，保持视觉节奏）` : ''}
${prevLines ? `已生成页面概览（不得重复这些页面的论点，内容要承接递进）：\n${prevLines}` : ''}

请输出本页的单页 JSON 对象（遵循系统提示中的约束）。`

    // 1) 首次生成
    let { data: slide } = await callModel({
      modelConfig,
      systemPrompt: PPT_PAGE_PROMPT,
      userPrompt: pageContext,
      timeoutMs: 90000,
      signal,
    })

    // 2) 本地质检 + 错误驱动修复（Reviewer 回路）
    let errors = validateSlide(slide)
    if (slide && errors.length > 0) {
      const fixPrompt = `${PPT_PAGE_FIX_PROMPT}

主题：${topic}

当前页面 JSON：
${JSON.stringify(slide, null, 2)}

质检错误清单：
${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

请输出修正后的完整单页 JSON。`
      const fix = await callModel({
        modelConfig,
        systemPrompt: PPT_PAGE_FIX_PROMPT,
        userPrompt: fixPrompt,
        timeoutMs: 90000,
        signal,
      }).catch(() => ({ data: null }))
      if (fix.data && validateSlide(fix.data).length < errors.length) {
        slide = fix.data
        errors = validateSlide(slide)
      }
    }

    // 3) 仍不通过：本地尽力兜底（补 speakerNotes）后交给降级判断
    if (slide && errors.length > 0) {
      if (!String(slide.speakerNotes || '').trim()) {
        slide.speakerNotes = `本页围绕"${item.summary || item.title}"展开，请结合要点补充讲解。`
        errors = validateSlide(slide)
      }
      if (errors.length > 0) return { slide: degradeSlide(item), degraded: true, errors }
    }
    if (!slide) return { slide: degradeSlide(item), degraded: true, errors: ['生成失败'] }

    // 统一裁剪：type/title 与大纲对齐
    slide.type = SLIDE_TYPES.has(slide.type) ? slide.type : 'content'
    if (item?.title && slide.type !== 'cover') slide.title = slide.title || String(item.title)
    return { slide, degraded: false, errors }
  }

  /**
   * 第二阶段：逐页生成（替代旧的整份生成）
   * 单页失败不影响整体；进度按页推进；全程可取消。
   * @returns {object} { title, author, date, slides, qa }
   */
  async function generateSlidesPageByPage(topic, context = '', outlineData = null, onProgress = null, signal) {
    isGenerating.value = true
    error.value = ''
    stage.value = 'detail'
    if (onProgress) onProgress('detail', 0, 'BOH Agent正在为你输出PPT')
    try {
      const useOutline = outlineData || outline.value
      if (!useOutline || !Array.isArray(useOutline.outline)) throw new Error('缺少有效大纲')
      const modelConfig = await loadPptModelConfig()

      const items = useOutline.outline
      const total = items.length
      const slides = []
      const qa = { total, degradedPages: 0, degradedTitles: [] }
      let prev = null // 上一页 { type, digest }：逐页衔接（版式节奏 + 防重复）
      const prevPages = [] // 已生成页摘要（传给后续页做上下文）

      for (let i = 0; i < total; i++) {
        ensureNotAborted(signal)
        const item = items[i]
        if (onProgress) {
          const pct = Math.round((i / total) * 100)
          onProgress('detail', pct, `正在生成第 ${i + 1}/${total} 页：${item.title || ''}`)
        }

        const { slide, degraded } = await generateSlidePage(topic, context, useOutline, item, modelConfig, signal, prev, prevPages)
        if (degraded) {
          qa.degradedPages += 1
          qa.degradedTitles.push(item.title || `第 ${i + 1} 页`)
        }
        slides.push(slide)
        // 摘要 = 标题 + 首要点/首段/备注前 40 字（所有版式兜底），供后续页防重复与承接
        const firstPoint = Array.isArray(slide.points) ? pointText(slide.points[0]) : ''
        const firstPara = Array.isArray(slide.paragraphs) ? String(slide.paragraphs[0]?.text || '') : ''
        const digest = String(firstPoint || firstPara || slide.speakerNotes || '').slice(0, 40)
        prev = { type: slide.type || '', digest }
        prevPages.push(`${slide.title || item.title || `第 ${i + 1} 页`}：${digest}`)
      }

      if (onProgress) onProgress('detail', 96, '正在组装演示文稿…')
      ensureNotAborted(signal)

      const data = {
        title: useOutline.title || topic,
        author: useOutline.author || '',
        date: useOutline.date || '',
        slides,
        qa,
      }
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

  // 向后兼容：旧接口名
  const generatePPTStructure = generateSlidesPageByPage

  /**
   * 构建 PPT 文件（接入渲染引擎）
   */
  async function buildPPTFile(data, presetId = DEFAULT_PRESET_ID, fileName = 'AI生成.pptx', options = {}) {
    const { buildPPT: renderPPT } = await import('../engine/ppt-renderer.js')
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
    validateSlide,
    generateOutline,
    generateSlidesPageByPage,
    generatePPTStructure,
    buildPPTFile,
    buildPPT,
  }
}
