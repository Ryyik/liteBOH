export const CONTEXT_MODE_TITLE_URL = 'title-url'
export const CONTEXT_MODE_SELECTION = 'selection'
export const CONTEXT_MODE_FULL = 'full'

const SELECTOR_PRIORITY = ['article', '[role="main"]', '#app main', 'main', '#app']

const STRIP_SELECTORS = [
  'nav', 'footer', 'aside', '.sidebar', '.ad', '.ads',
  '[role="navigation"]', '[role="contentinfo"]', '[role="complementary"]',
  '.menu', '.navbar', '.footer', '.header-nav', '.advertisement'
]

function getPageTitle() {
  const raw = document.title || ''
  return raw.replace(/\s*[-|]\s*BOH.*$/i, '').trim().slice(0, 120)
}

function getContentElement() {
  for (const sel of SELECTOR_PRIORITY) {
    try {
      const el = document.querySelector(sel)
      if (el && el.textContent.trim().length > 50) return el
    } catch { }
  }
  return document.body
}

function stripElements(root) {
  const clone = root.cloneNode(true)
  for (const sel of STRIP_SELECTORS) {
    try {
      const elements = clone.querySelectorAll(sel)
      for (const el of elements) el.remove()
    } catch { }
  }
  return clone
}

function extractHeadings(root) {
  const tags = ['h1', 'h2', 'h3']
  const headings = []
  for (const tag of tags) {
    try {
      const els = root.querySelectorAll(tag)
      for (const el of els) {
        const text = (el.textContent || '').trim()
        if (text) headings.push({ level: parseInt(tag[1]), text })
      }
    } catch { }
  }
  return headings
}

function extractParagraphs(root) {
  const paragraphs = []
  try {
    const els = root.querySelectorAll('p, li, blockquote, pre, td:not(:has(table))')
    for (const el of els) {
      const text = (el.textContent || '').trim()
      if (text.length > 10) paragraphs.push(text)
    }
  } catch { }
  return paragraphs
}

function getMetaDescription() {
  try {
    const meta = document.querySelector('meta[name="description"]')
    return (meta?.getAttribute?.('content') || '').trim().slice(0, 300)
  } catch {
    return ''
  }
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

export function extractPageContext({ maxContentChars = 4000, mode = CONTEXT_MODE_FULL } = {}) {
  const title = getPageTitle()
  const url = window.location.href
  const path = window.location.hash || window.location.pathname

  let selection = ''
  let content = ''
  let headings = []
  let paragraphs = []

  if (mode === CONTEXT_MODE_SELECTION || mode === CONTEXT_MODE_FULL) {
    try {
      selection = (window.getSelection()?.toString() || '').trim().slice(0, 1800)
    } catch { }
  }

  if (mode === CONTEXT_MODE_FULL) {
    const root = getContentElement()
    const cleaned = stripElements(root)
    headings = extractHeadings(cleaned)
    paragraphs = extractParagraphs(cleaned)
    content = paragraphs.join('\n\n').slice(0, maxContentChars)
  }

  const description = getMetaDescription()

  let suggestions = generateSuggestions(path, { title, content, headings })

  const charCount = title.length + url.length + selection.length + content.length
  const tokenEstimate = estimateTokens(
    [title, url, selection, content].filter(Boolean).join('\n')
  )

  return {
    title,
    url,
    path,
    selection,
    content,
    description,
    headings,
    charCount,
    tokenEstimate,
    suggestions,
    text: buildContextText({ title, url, selection, content, description })
  }
}

function buildContextText({ title, url, selection, content, description }) {
  const parts = [`页面标题：${title}`, `页面地址：${url}`]
  if (description) parts.push(`页面描述：${description}`)
  if (selection) parts.push(`选中的内容：\n${selection}`)
  if (content) parts.push(`页面正文：\n${content.slice(0, 4000)}`)
  return parts.join('\n')
}

function generateSuggestions(path, { title, content, headings }) {
  const lowerPath = path.toLowerCase()
  const lowerTitle = (title || '').toLowerCase()
  const hasPostContent = /forum|post|thread/i.test(lowerPath) || /贴子|帖子|讨论/.test(lowerTitle)
  const hasProfile = /profile|user-space|member|用户/.test(lowerPath) || /个人|主页/.test(lowerTitle)
  const hasLab = /lab|工具/.test(lowerPath)
  const hasArticle = content.length > 200 && headings.length > 1
  const hasList = /列表|list|目录/.test(lowerPath) || /todo|task|备忘/.test(lowerTitle)
  const hasMessages = /message|mail|通知/.test(lowerPath)

  let suggestions = ['帮我整理一个计划', '总结一下我的想法', '快速查找相关信息']

  if (hasPostContent) {
    suggestions = ['总结当前帖子', '帮我起草一条回复', '提取讨论中的关键观点', '对此提出不同看法']
  } else if (hasProfile) {
    suggestions = ['帮我润色个人简介', '分析我的近期帖子', '检查我的账号与资料状态']
  } else if (hasMessages) {
    suggestions = ['总结我的未读消息', '找出需要我回复的消息', '按主题整理最近通知']
  } else if (hasArticle) {
    suggestions = ['总结这篇文章', '提取核心要点', '对此提出不同看法']
  } else if (hasLab) {
    suggestions = ['解释当前工具', '帮我设计处理步骤', '检查我的输出思路']
  } else if (hasList) {
    suggestions = ['帮我整理列表', '指出遗漏的项目', '帮我优化排序']

  }

  return suggestions
}
