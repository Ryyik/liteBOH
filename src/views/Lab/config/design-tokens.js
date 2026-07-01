/**
 * Design Tokens 系统
 * 统一的颜色/字体/间距/圆角/阴影令牌，供 PPT 和 Word 生成器共用
 * AI 输出引用 token 名（如 "heading-1"）而非裸值，确保设计一致性
 */

// ===== 基础令牌（不直接使用，供样式集引用） =====
export const BASE_TOKENS = {
  // 间距阶梯（单位：磅 pt，PPT 用英寸需转换）
  spacing: {
    none: 0,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
    '3xl': 64,
  },
  // 圆角（pt）
  radius: {
    none: 0,
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
    '2xl': 16,
    full: 9999,
  },
  // 字号阶梯（半磅，与 OOXML 一致；pt × 2）
  type: {
    display: 96,   // 48pt
    h1: 72,        // 36pt
    h2: 56,        // 28pt
    h3: 44,        // 22pt
    h4: 36,        // 18pt
    title: 32,     // 16pt
    subtitle: 28,  // 14pt
    body: 24,      // 12pt
    bodyLg: 26,    // 13pt
    caption: 20,   // 10pt
    small: 18,     // 9pt
  },
  // 阴影（PPT 用 transparency 百分比表达）
  shadow: {
    none: 'none',
    sm: 'sm',
    md: 'md',
    lg: 'lg',
  },
}

// ===== 字体栈（中文优先 + 英文兜底） =====
export const FONT_STACKS = {
  // 无衬线（标题/正文）
  sans: {
    ascii: 'Arial',
    eastAsia: 'Microsoft YaHei',  // 微软雅黑
    ppt: 'Microsoft YaHei',
  },
  sansModern: {
    ascii: 'Helvetica Neue',
    eastAsia: 'PingFang SC',      // 苹方
    ppt: 'PingFang SC',
  },
  // 衬线（学术/正文）
  serif: {
    ascii: 'Times New Roman',
    eastAsia: 'SimSun',           // 宋体
    ppt: 'SimSun',
  },
  serifElegant: {
    ascii: 'Georgia',
    eastAsia: 'KaiTi',            // 楷体
    ppt: 'KaiTi',
  },
  // 等宽（科技/代码）
  mono: {
    ascii: 'Consolas',
    eastAsia: 'SimHei',           // 黑体兜底
    ppt: 'Consolas',
  },
  // 黑体（标题强）
  heiti: {
    ascii: 'Arial Black',
    eastAsia: 'SimHei',           // 黑体
    ppt: 'SimHei',
  },
}

// ===== 样式集预设（每套 = 一组完整 token） =====
// 这是 AI 和渲染层之间的"设计系统"抽象
export const STYLE_PRESETS = [
  {
    id: 'business',
    name: '商务简约',
    description: '深蓝主色，白底，适合商务汇报、年报',
    tokens: {
      color: {
        primary: '1e40af',        // 深蓝
        primaryFg: 'ffffff',
        secondary: '3b82f6',
        accent: '60a5fa',
        neutral: {
          50: 'f8fafc',
          100: 'f1f5f9',
          200: 'e2e8f0',
          500: '64748b',
          700: '334155',
          900: '0f172a',
        },
        bg: {
          cover: '1e3a8a',
          content: 'ffffff',
          end: '1e3a8a',
          muted: 'f8fafc',
        },
        text: {
          onDark: 'ffffff',
          onLight: '0f172a',
          muted: '64748b',
        },
      },
      font: {
        title: FONT_STACKS.sans,
        heading: FONT_STACKS.sans,
        body: FONT_STACKS.sans,
      },
    },
  },
  {
    id: 'academic',
    name: '学术专业',
    description: '黑白灰，衬线字体，适合论文答辩、学术报告',
    tokens: {
      color: {
        primary: '18181b',
        primaryFg: 'ffffff',
        secondary: '3f3f46',
        accent: '71717a',
        neutral: {
          50: 'fafafa',
          100: 'f4f4f5',
          200: 'e4e4e7',
          500: '71717a',
          700: '3f3f46',
          900: '18181b',
        },
        bg: {
          cover: '27272a',
          content: 'ffffff',
          end: '27272a',
          muted: 'fafafa',
        },
        text: {
          onDark: 'ffffff',
          onLight: '18181b',
          muted: '71717a',
        },
      },
      font: {
        title: FONT_STACKS.serif,
        heading: FONT_STACKS.serif,
        body: FONT_STACKS.serif,
      },
    },
  },
  {
    id: 'minimal',
    name: '极简素雅',
    description: '大量留白，细线分隔，适合设计、品牌提案',
    tokens: {
      color: {
        primary: '0f766e',        // 墨绿
        primaryFg: 'ffffff',
        secondary: '14b8a6',
        accent: '5eead4',
        neutral: {
          50: 'ffffff',
          100: 'fafafa',
          200: 'f5f5f5',
          500: '737373',
          700: '404040',
          900: '0a0a0a',
        },
        bg: {
          cover: 'fafafa',
          content: 'ffffff',
          end: 'fafafa',
          muted: 'f5f5f5',
        },
        text: {
          onDark: 'ffffff',
          onLight: '0a0a0a',
          muted: '737373',
        },
      },
      font: {
        title: FONT_STACKS.sansModern,
        heading: FONT_STACKS.sansModern,
        body: FONT_STACKS.sansModern,
      },
    },
  },
  {
    id: 'tech',
    name: '科技深色',
    description: '深色背景，青色荧光，适合技术分享、产品发布',
    tokens: {
      color: {
        primary: '06b6d4',
        primaryFg: '0f172a',
        secondary: '0891b2',
        accent: '22d3ee',
        neutral: {
          50: 'f8fafc',
          100: '1e293b',
          200: '334155',
          500: '94a3b8',
          700: 'cbd5e1',
          900: 'f0f9ff',
        },
        bg: {
          cover: '0f172a',
          content: '1e293b',
          end: '0f172a',
          muted: '0f172a',
        },
        text: {
          onDark: 'f0f9ff',
          onLight: '0f172a',
          muted: '94a3b8',
        },
      },
      font: {
        title: FONT_STACKS.mono,
        heading: FONT_STACKS.mono,
        body: FONT_STACKS.mono,
      },
    },
  },
  {
    id: 'guofeng',
    name: '国风典雅',
    description: '朱红墨黑，楷体衬线，适合文化、传统主题',
    tokens: {
      color: {
        primary: '9f1239',        // 朱红
        primaryFg: 'ffffff',
        secondary: 'b91c1c',
        accent: 'd4a574',         // 鎏金
        neutral: {
          50: 'fafaf9',
          100: 'f5f5f4',
          200: 'e7e5e4',
          500: '78716c',
          700: '44403c',
          900: '1c1917',
        },
        bg: {
          cover: '1c1917',
          content: 'fafaf9',
          end: '1c1917',
          muted: 'f5f5f4',
        },
        text: {
          onDark: 'fafaf9',
          onLight: '1c1917',
          muted: '78716c',
        },
      },
      font: {
        title: FONT_STACKS.serifElegant,
        heading: FONT_STACKS.serifElegant,
        body: FONT_STACKS.serif,
      },
    },
  },
  {
    id: 'boh',
    name: 'BOH 品牌',
    description: 'BOH 绿，团队内部汇报、分享',
    tokens: {
      color: {
        primary: '0f9f7a',
        primaryFg: 'ffffff',
        secondary: '059669',
        accent: '34d399',
        neutral: {
          50: 'f0fdf4',
          100: 'dcfce7',
          200: 'bbf7d0',
          500: '4b5563',
          700: '1f2937',
          900: '111827',
        },
        bg: {
          cover: '1a1a2e',
          content: 'ffffff',
          end: '1a1a2e',
          muted: 'f0fdf4',
        },
        text: {
          onDark: 'ffffff',
          onLight: '1a1a2e',
          muted: '4b5563',
        },
      },
      font: {
        title: FONT_STACKS.sans,
        heading: FONT_STACKS.sans,
        body: FONT_STACKS.sans,
      },
      brand: {
        logo: 'BOH Agent',
        showOnSlides: true,
      },
    },
  },
]

export const DEFAULT_PRESET_ID = 'boh'

export function getPresetById(id) {
  return STYLE_PRESETS.find(p => p.id === id) || STYLE_PRESETS.find(p => p.id === DEFAULT_PRESET_ID)
}

// ===== 排版样式映射（token 名 → 具体属性） =====
// AI 输出 "style": "heading-1" 时，渲染层查这张表
export const TYPOGRAPHY_SCALE = {
  'display':      { size: BASE_TOKENS.type.display,    bold: true,  line: 320, before: 240, after: 120 },
  'heading-1':    { size: BASE_TOKENS.type.h1,         bold: true,  line: 320, before: 240, after: 120 },
  'heading-2':    { size: BASE_TOKENS.type.h2,         bold: true,  line: 320, before: 200, after: 100 },
  'heading-3':    { size: BASE_TOKENS.type.h3,         bold: true,  line: 300, before: 160, after: 80 },
  'heading-4':    { size: BASE_TOKENS.type.h4,         bold: true,  line: 280, before: 120, after: 60 },
  'title':        { size: BASE_TOKENS.type.title,      bold: true,  line: 280, before: 100, after: 60 },
  'subtitle':     { size: BASE_TOKENS.type.subtitle,   bold: false, line: 280, before: 60,  after: 80 },
  'body':         { size: BASE_TOKENS.type.body,       bold: false, line: 320, before: 0,   after: 80, firstLine: 480 },
  'body-large':   { size: BASE_TOKENS.type.bodyLg,     bold: false, line: 320, before: 0,   after: 80, firstLine: 480 },
  'caption':      { size: BASE_TOKENS.type.caption,    bold: false, line: 260, before: 0,   after: 40 },
  'quote':        { size: BASE_TOKENS.type.body,       bold: false, italic: true, line: 320, before: 80, after: 80, indentLeft: 480 },
  'code':         { size: BASE_TOKENS.type.caption,    bold: false, font: FONT_STACKS.mono, shading: 'f4f4f5' },
}

/**
 * 解析样式引用，返回完整属性
 * @param {string|object} styleRef - 样式名（token）或内联对象
 * @param {object} presetTokens - 样式集 tokens
 * @returns {object} 合并后的属性
 */
export function resolveStyle(styleRef, presetTokens) {
  if (!styleRef) return {}
  if (typeof styleRef === 'object') return styleRef
  const base = TYPOGRAPHY_SCALE[styleRef] || TYPOGRAPHY_SCALE['body']
  return { ...base }
}

/**
 * 获取字体栈
 * @param {string} role - title | heading | body
 * @param {object} presetTokens - 样式集 tokens
 */
export function getFontStack(role, presetTokens) {
  return presetTokens?.font?.[role] || FONT_STACKS.sans
}
