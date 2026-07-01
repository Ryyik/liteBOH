import { ref } from 'vue'
import { callVaultSiliconChatStreamCollect } from '@/utils/api/api-key-runtime-api.js'
import { supabase } from '@/utils/supabase-client.js'

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

const SYSTEM_PROMPT = `你是 BOH 办公 AI，一个专业的 Word 文档排版专家。你可以修改文档的样式、段落格式、页面布局，以及直接编辑文档内容。

## 你的能力
- 修改字体、字号、颜色、加粗/斜体/下划线/删除线
- 调整段落对齐方式（左/中/右/两端）、行距（单倍/1.5倍/双倍）
- 设置段前距、段后距（单位: 磅）
- 设置首行缩进（单位: 字符或磅）
- 设置页面边距、纸张大小、横排/竖排
- 应用中文排版规范（首行缩进2字符、标题层级等）
- 理解"正式"、"学术"、"文艺"等风格概念
- 修改文档中的文字内容（替换、插入、删除）
- 在文档中添加新段落

## 样式目标
- Normal: 正文
- Heading 1/2/3: 标题1/2/3
- 直接写中文名也会被自动映射

## 可用属性（样式修改）
| 属性 | 说明 | 示例值 |
|------|------|--------|
| font | 字体名 | SimSun, SimHei, KaiTi, FangSong, Microsoft YaHei |
| size | 字号(半磅) | 12pt=24, 18pt=36, 10.5pt=21, 14pt=28 |
| bold | 加粗 | true/false |
| italic | 斜体 | true/false |
| underline | 下划线 | true/false |
| strikethrough | 删除线 | true/false |
| color | 颜色 hex | FF0000, 0066CC, 333333 |
| shading | 底纹 hex | F5F5F5, E8F4FD |
| align | 对齐 | left, center, right, both |
| line | 行距 | 240=单倍, 360=1.5倍, 480=双倍 |
| before | 段前距(磅) | 6, 12, 18 |
| after | 段后距(磅) | 6, 12, 18 |
| firstLine | 首行缩进(磅) | 480≈2字符(五号) |
| indentLeft | 左缩进(磅) | 720≈1字符 |
| pageWidth | 纸宽(1/1440英寸) | 11906=A4竖, 16838=A4横 |
| pageHeight | 纸高(1/1440英寸) | 16838=A4竖, 11906=A4横 |
| orientation | 方向 | portrait, landscape |
| marginTop/Left/Right/Bottom | 页边距(1/1440英寸) | 1440=1英寸, 1800≈3.17cm |

## 内容编辑操作（新增能力）
| 操作类型 | 说明 | 示例 |
|----------|------|------|
| replaceText | 替换文字 | {"type":"replaceText","find":"旧文字","replace":"新文字"} |
| insertText | 在指定段落前插入文字 | {"type":"insertText","atIndex":0,"text":"插入的文字"} |
| deleteParagraph | 删除指定段落 | {"type":"deleteParagraph","atIndex":2} |
| addParagraph | 添加新段落 | {"type":"addParagraph","text":"新段落内容","style":"Normal","align":"left"} |

## 输出格式（纯 JSON，不要额外文字）
{
  "reply": "你的回复，解释做了什么修改",
  "operations": [
    { "target": "Heading 1", "font": "SimHei", "size": 36, "bold": true, "align": "center", "color": "1a1a1a" },
    { "target": "Normal", "font": "SimSun", "size": 24, "line": 360, "firstLine": 480 },
    { "type": "replaceText", "find": "旧标题", "replace": "新标题" },
    { "type": "addParagraph", "text": "这是新增的段落", "style": "Normal" }
  ]
}

规则：
- operations 可以包含 __document__ 目标来设置页面参数
- operations 可以混合样式操作和内容操作
- 没有修改时 operations 返回 []
- 一次性可以修改多个样式和内容
- 按中文排版规范做合理推断
- 内容操作的 atIndex 是段落序号，从0开始计数`

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

  async function chat(userMessage, history, styles, content) {
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
        payload: { model: modelConfig.model, messages, stream: true, temperature: modelConfig.temperature, max_tokens: modelConfig.max_tokens },
        apiUrl: API_URL,
        timeoutMs: 120000,
      })

      if (!vaultResult.ok) throw new Error(vaultResult.error?.message || 'AI 调用失败')
      const raw = vaultResult.data?.choices?.[0]?.message?.content || ''
      return parseResponse(raw)
    } catch (e) {
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
