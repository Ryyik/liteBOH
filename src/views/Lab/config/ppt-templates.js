/**
 * PPT 预设模板配置
 * 每个模板包含配色、字体、背景等设计元素
 */

export const PPT_TEMPLATES = [
  {
    id: 'business',
    name: '商务简约',
    description: '蓝白配色，简洁线条，适合商务汇报',
    colors: {
      primary: '#1e40af',      // 主色：深蓝
      secondary: '#3b82f6',    // 辅色：亮蓝
      accent: '#60a5fa',       // 点缀：浅蓝
      background: {
        title: '1e3a8a',       // 封面背景：深蓝
        content: 'f8fafc',     // 内容背景：浅灰白
        end: '1e3a8a'          // 结束页背景：深蓝
      },
      text: {
        primary: 'ffffff',     // 主文本：白色（用于深色背景）
        secondary: '1e293b',   // 次文本：深灰（用于浅色背景）
        muted: '64748b'        // 辅助文本：灰
      }
    },
    fonts: {
      title: {
        family: 'Arial',
        size: 44,
        bold: true
      },
      subtitle: {
        family: 'Arial',
        size: 24,
        bold: false
      },
      contentTitle: {
        family: 'Arial',
        size: 32,
        bold: true
      },
      body: {
        family: 'Arial',
        size: 18,
        bold: false
      }
    },
    layout: {
      padding: {
        title: { x: 0.5, y: 2.5 },
        subtitle: { x: 0.5, y: 4.2 }
      }
    }
  },
  {
    id: 'academic',
    name: '学术专业',
    description: '黑白灰配色，适合论文答辩、学术报告',
    colors: {
      primary: '#18181b',      // 主色：黑
      secondary: '#3f3f46',    // 辅色：深灰
      accent: '#71717a',       // 点缀：灰
      background: {
        title: '27272a',       // 封面背景：深灰黑
        content: 'fafafa',     // 内容背景：浅灰白
        end: '27272a'          // 结束页背景：深灰黑
      },
      text: {
        primary: 'ffffff',     // 主文本：白色
        secondary: '18181b',   // 次文本：黑
        muted: '71717a'        // 辅助文本：灰
      }
    },
    fonts: {
      title: {
        family: 'Georgia',
        size: 48,
        bold: true
      },
      subtitle: {
        family: 'Georgia',
        size: 22,
        bold: false
      },
      contentTitle: {
        family: 'Georgia',
        size: 34,
        bold: true
      },
      body: {
        family: 'Times New Roman',
        size: 18,
        bold: false
      }
    },
    layout: {
      padding: {
        title: { x: 0.5, y: 2.2 },
        subtitle: { x: 0.5, y: 4.0 }
      }
    }
  },
  {
    id: 'boh-brand',
    name: 'BOH 品牌',
    description: 'BOH 绿色系，适合团队分享、内部汇报',
    colors: {
      primary: '#0f9f7a',      // 主色：BOH 绿
      secondary: '#059669',    // 辅色：深绿
      accent: '#34d399',       // 点缀：浅绿
      background: {
        title: '1a1a2e',       // 封面背景：深色
        content: 'ffffff',     // 内容背景：白色
        end: '1a1a2e'          // 结束页背景：深色
      },
      text: {
        primary: 'ffffff',     // 主文本：白色
        secondary: '1a1a2e',   // 次文本：深色
        muted: '4b5563'        // 辅助文本：灰
      }
    },
    fonts: {
      title: {
        family: 'Arial',
        size: 44,
        bold: true
      },
      subtitle: {
        family: 'Arial',
        size: 24,
        bold: false
      },
      contentTitle: {
        family: 'Arial',
        size: 32,
        bold: true
      },
      body: {
        family: 'Arial',
        size: 18,
        bold: false
      }
    },
    layout: {
      padding: {
        title: { x: 0.5, y: 2.5 },
        subtitle: { x: 0.5, y: 4.2 }
      }
    },
    brand: {
      logo: 'BOH AI',
      showOnSlides: true
    }
  },
  {
    id: 'tech',
    name: '科技风格',
    description: '深色背景，荧光色点缀，适合技术分享',
    colors: {
      primary: '#06b6d4',      // 主色：青色
      secondary: '#0891b2',    // 辅色：深青
      accent: '#22d3ee',       // 点缀：亮青
      background: {
        title: '0f172a',       // 封面背景：深蓝黑
        content: '1e293b',     // 内容背景：深灰蓝
        end: '0f172a'          // 结束页背景：深蓝黑
      },
      text: {
        primary: 'f0f9ff',     // 主文本：浅蓝白
        secondary: 'e2e8f0',   // 次文本：浅灰
        muted: '94a3b8'        // 辅助文本：灰蓝
      }
    },
    fonts: {
      title: {
        family: 'Courier New',
        size: 46,
        bold: true
      },
      subtitle: {
        family: 'Courier New',
        size: 22,
        bold: false
      },
      contentTitle: {
        family: 'Courier New',
        size: 34,
        bold: true
      },
      body: {
        family: 'Consolas',
        size: 18,
        bold: false
      }
    },
    layout: {
      padding: {
        title: { x: 0.5, y: 2.3 },
        subtitle: { x: 0.5, y: 4.1 }
      }
    }
  },
  {
    id: 'nature',
    name: '清新自然',
    description: '绿色系，适合环保、自然主题',
    colors: {
      primary: '#16a34a',      // 主色：绿
      secondary: '#15803d',    // 辅色：深绿
      accent: '#22c55e',       // 点缀：亮绿
      background: {
        title: '14532d',       // 封面背景：森林绿
        content: 'f0fdf4',     // 内容背景：浅绿白
        end: '14532d'          // 结束页背景：森林绿
      },
      text: {
        primary: 'ffffff',     // 主文本：白色
        secondary: '14532d',   // 次文本：深绿
        muted: '4ade80'        // 辅助文本：浅绿
      }
    },
    fonts: {
      title: {
        family: 'Arial',
        size: 44,
        bold: true
      },
      subtitle: {
        family: 'Arial',
        size: 24,
        bold: false
      },
      contentTitle: {
        family: 'Arial',
        size: 32,
        bold: true
      },
      body: {
        family: 'Arial',
        size: 18,
        bold: false
      }
    },
    layout: {
      padding: {
        title: { x: 0.5, y: 2.5 },
        subtitle: { x: 0.5, y: 4.2 }
      }
    }
  }
]

/**
 * 获取默认模板
 */
export const DEFAULT_TEMPLATE = PPT_TEMPLATES[2] // BOH 品牌

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(templateId) {
  return PPT_TEMPLATES.find(t => t.id === templateId) || DEFAULT_TEMPLATE
}