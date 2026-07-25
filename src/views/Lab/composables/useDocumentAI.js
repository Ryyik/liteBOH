import { ref } from 'vue'
import { callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { supabase } from '@/utils/supabase-client.js'
import { FRONTEND_MAX_OUTPUT_TOKENS } from '../config/ai-schemas.js'

const API_URL = import.meta.env.VITE_SILICON_CLOUD_URL || 'https://api.siliconflow.cn/v1/chat/completions'
const FALLBACK_MODEL = 'Qwen/Qwen3-8B'

// 从 lab_ai_model_configs 表读取文档排版的模型配置
async function loadDocModelConfig() {
  try {
    const { data, error } = await supabase
      .from('lab_ai_model_configs')
      .select('model_id, temperature, max_tokens, api_key_purpose')
      .eq('feature_key', 'doc-formatting')
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) return { model: FALLBACK_MODEL, temperature: 0.1, max_tokens: 4096, apiKeyPurpose: 'chat' }
    return {
      model: data.model_id || FALLBACK_MODEL,
      temperature: Number(data.temperature) || 0.1,
      max_tokens: data.max_tokens || 4096,
      apiKeyPurpose: data.api_key_purpose || 'chat',
    }
  } catch {
    return { model: FALLBACK_MODEL, temperature: 0.1, max_tokens: 4096, apiKeyPurpose: 'chat' }
  }
}

const SYSTEM_PROMPT = `<role>
你是 BOH 办公 AI，一个专业的 Word 文档排版专家。可以修改文档的样式、段落格式、页面布局，以及直接编辑文档内容。
</role>

<thinking>
在编辑前，先在 &lt;thinking&gt; 内推演：
1. 理解用户需求是排版还是内容修改
2. 如果用户要求模糊，先确认关键参数（字体/字号/风格）
3. 规划操作序列，确保不产生冲突的指令
</thinking>

<constraints>
- 绝对不能执行无法准确理解的样式修改；需要时主动提问
- 内容操作的 atIndex 是段落序号，从 0 开始计数
- 没有修改时 operations 返回 []
- 一次性可以修改多个样式和内容
- 按中文排版规范做合理推断
</constraints>

<output_format>
纯 JSON，不要额外文字：
{
  "reply": "你的回复，解释做了什么修改",
  "operations": [
    { "target": "Heading 1", "font": "SimHei", "size": 36, "bold": true, "align": "center", "color": "1a1a1a" },
    { "target": "Normal", "font": "SimSun", "size": 24, "line": 360, "firstLine": 480 },
    { "type": "replaceText", "find": "旧标题", "replace": "新标题" },
    { "type": "addParagraph", "text": "这是新增的段落", "style": "Normal" }
  ]
}
</output_format>

<capabilities>
- 修改字体、字号、颜色、加粗/斜体/下划线/删除线
- 调整段落对齐方式（左/中/右/两端）、行距（单倍/1.5倍/双倍）
- 设置段前距、段后距（单位: 磅）
- 设置首行缩进（单位: 字符或磅）
- 设置页面边距、纸张大小、横排/竖排
- 应用中文排版规范（首行缩进2字符、标题层级等）
- 理解"正式"、"学术"、"文艺"等风格概念
- 修改文档中的文字内容（替换、插入、删除）
- 在文档中添加新段落
</capabilities>

<styles>
Normal: 正文 | Heading 1/2/3: 标题1/2/3 | 直接写中文名也会被自动映射
</styles>

<attributes>
font=s(字体名, e.g. SimSun, SimHei) | size=s(字号半磅, 12pt=24) | bold=bool | italic=bool | underline=bool | strikethrough=bool | color=s(hex) | shading=s(hex) | align=s(left/center/right/both) | line=s(240=单倍,360=1.5倍,480=双倍) | before=s(段前距磅) | after=s(段后距磅) | firstLine=s(首行缩进磅,480≈2字符) | indentLeft=s(磅) | pageWidth=s(1/1440英寸) | pageHeight=s | orientation=s(portrait/landscape) | marginTop/Left/Right/Bottom=s(1/1440英寸)
</attributes>

<operations>
replaceText: {"type":"replaceText","find":"旧文字","replace":"新文字"} | insertText: {"type":"insertText","atIndex":0,"text":"插入的文字"} | deleteParagraph: {"type":"deleteParagraph","atIndex":2} | addParagraph: {"type":"addParagraph","text":"新段落内容","style":"Normal","align":"left"}
operations 可以包含 __document__ 目标来设置页面参数，可以混合样式操作和内容操作
</operations>`

export function useDocumentAI() {
  const aiLoading = ref(false)

  function buildDocSummary(styles, content) {
    const s = styles.slice(0, 20).map(st => {
      const parts = [`${st.name}(${st.styleId})`]
      if (st.font?.ascii) parts.push(st.font.ascii)
      if (st.size) parts.push(`${(st.size / 2).toFixed(1)}pt`)
      if (st.bold) parts.push('加粗')
      if (st.color) parts.push(`#${st.color}`)
      if (st.spacing?.line) parts.push(`行距${(st.spacing.line / 240).toFixed(1)}倍`)
      if (st.align) parts.push(st.align)
      if (st.indent?.firstLine) parts.push(`首行缩进${st.indent.firstLine}twip`)
      return '- ' + parts.join(', ')
    }).join('\n')

    const c = content.slice(0, 25).map(p => {
      const mark = p.isHeading ? '#' : ' '
      const txt = p.text.slice(0, 60).replace(/\n/g, ' ')
      return `${mark} [${p.styleName}] ${txt}`
    }).join('\n')

    return `【样式清单】\n${s || '(无)'}\n\n【内容预览】\n${c || '(空)'}`
  }

  async function chat(userMessage, history, styles, content, signal) {
    aiLoading.value = true
    const docSummary = buildDocSummary(styles, content)
    const systemPrompt = `${SYSTEM_PROMPT}\n\n## 当前文档\n${docSummary}`

    try {
      const modelConfig = await loadDocModelConfig()
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ]

      const vaultResult = await callVaultSiliconChatStreamCollect({
        provider: 'siliconflow',
        purpose: modelConfig.apiKeyPurpose,
        payload: { model: modelConfig.model, messages, stream: true, temperature: modelConfig.temperature, max_tokens: Math.min(modelConfig.max_tokens, FRONTEND_MAX_OUTPUT_TOKENS) },
        apiUrl: API_URL,
        timeoutMs: 120000,
        signal,
      })

      if (!vaultResult.ok) throw new Error(vaultResult.error?.message || 'AI 调用失败')
      const raw = vaultResult.data?.choices?.[0]?.message?.content || ''
      return parseResponse(raw)
    } catch (e) {
      if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
        return { reply: '已停止生成。', operations: [] }
      }
      return { reply: `调用失败：${e.message}，请重试`, operations: [] }
    } finally {
      aiLoading.value = false
    }
  }

  return { chat, aiLoading }
}

function parseResponse(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    return {
      reply: parsed.reply || '已完成。',
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
    }
  } catch {
    const r = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    const o = cleaned.match(/"operations"\s*:\s*(\[[\s\S]*?\])/)
    return {
      reply: r ? r[1].replace(/\\n/g, '\n') : '已处理。',
      operations: o ? safeParse(o[1], []) : [],
    }
  }
}

function safeParse(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}
