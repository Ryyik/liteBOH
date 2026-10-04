export const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export const FONT_MAP = {
  宋体: 'SimSun',
  黑体: 'SimHei',
  仿宋: 'FangSong',
  楷体: 'KaiTi',
  微软雅黑: 'Microsoft YaHei',
  雅黑: 'Microsoft YaHei',
  华文细黑: 'STXihei',
  华文楷体: 'STKaiti',
  华文仿宋: 'STFangsong',
  华文中宋: 'STZhongsong',
  'Times New Roman': 'Times New Roman',
  Arial: 'Arial',
};

export const PRESET_TEMPLATES = [
  {
    id: 'formal-report',
    name: '正式报告',
    description: '标题黑体18pt居中，正文宋体12pt1.5倍行距',
    operations: [
      {
        target: 'Heading 1',
        font: 'SimHei',
        size: 36,
        bold: true,
        align: 'center',
        color: '1a1a1a',
      },
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
];
