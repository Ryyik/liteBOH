export const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export const FONT_MAP = {
  '宋体': 'SimSun',
  '黑体': 'SimHei',
  '仿宋': 'FangSong',
  '楷体': 'KaiTi',
  '微软雅黑': 'Microsoft YaHei',
  '雅黑': 'Microsoft YaHei',
  '华文细黑': 'STXihei',
  '华文楷体': 'STKaiti',
  '华文仿宋': 'STFangsong',
  '华文中宋': 'STZhongsong',
  'Times New Roman': 'Times New Roman',
  'Arial': 'Arial',
}

export const FONT_MAP_CN = Object.fromEntries(
  Object.entries(FONT_MAP).map(([k, v]) => [v, k])
)

export const ALIGN_MAP = {
  '居中': 'center',
  '左对齐': 'left',
  '右对齐': 'right',
  '两端对齐': 'both',
  '居中对齐': 'center',
  'left': 'left',
  'center': 'center',
  'right': 'right',
  'both': 'both',
  'justify': 'both',
}

export const LINE_SPACING_MAP = {
  '1.0': 240,
  '1.15': 276,
  '1.5': 360,
  '1.25': 300,
  '1.75': 420,
  '2.0': 480,
  '单倍': 240,
  '1.5倍': 360,
  '双倍': 480,
  '2倍': 480,
}

export const PRESET_TEMPLATES = [
  {
    id: 'formal-report',
    name: '正式报告',
    description: '标题黑体18pt居中，正文宋体12pt1.5倍行距',
    operations: [
      { target: 'Heading 1', font: 'SimHei', size: 36, bold: true, align: 'center', color: '1a1a1a' },
      { target: 'Heading 2', font: 'SimHei', size: 28, bold: true, color: '333333' },
      { target: 'Heading 3', font: 'SimHei', size: 24, bold: true, color: '555555' },
      { target: 'Normal', font: 'SimSun', size: 24, color: '333333', line: 360 },
    ],
  },
  {
    id: 'meeting-minutes',
    name: '会议纪要',
    description: '标题黑体16pt，正文楷体11pt',
    operations: [
      { target: 'Heading 1', font: 'SimHei', size: 32, bold: true, color: '1a1a1a' },
      { target: 'Heading 2', font: 'SimHei', size: 28, bold: true, color: '333333' },
      { target: 'Normal', font: 'KaiTi', size: 22, color: '444444', line: 360 },
    ],
  },
  {
    id: 'resume',
    name: '简历',
    description: '标题微软雅黑22pt，正文微软雅黑11pt',
    operations: [
      { target: 'Heading 1', font: 'Microsoft YaHei', size: 44, bold: true, color: '1a1a1a' },
      { target: 'Heading 2', font: 'Microsoft YaHei', size: 28, bold: true, color: '2c5282' },
      { target: 'Normal', font: 'Microsoft YaHei', size: 22, color: '333333', line: 300 },
    ],
  },
]

export const COMMAND_PATTERNS = [
  { regex: /(?:标题|heading|h1)[^，,。]*?用(.+?)(?:,|，|$)/i, target: 'Heading 1' },
  { regex: /(?:标题|heading|h2)[^，,。]*?用(.+?)(?:,|，|$)/i, target: 'Heading 2' },
  { regex: /(?:标题|heading|h3)[^，,。]*?用(.+?)(?:,|，|$)/i, target: 'Heading 3' },
  { regex: /正文[^，,。]*?用(.+?)(?:,|，|$)/i, target: 'Normal' },
]

export const STYLE_ID_MAP = {
  '标题1': 'Heading 1',
  '标题2': 'Heading 2',
  '标题3': 'Heading 3',
  '正文': 'Normal',
  'heading 1': 'Heading 1',
  'heading 2': 'Heading 2',
  'heading 3': 'Heading 3',
  'heading1': 'Heading 1',
  'heading2': 'Heading 2',
  'heading3': 'Heading 3',
  'normal': 'Normal',
}

export const PT_TO_HALF_PT = (pt) => Math.round(pt * 2)
export const HALF_PT_TO_PT = (hp) => hp / 2
