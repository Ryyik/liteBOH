/**
 * Home 英雄区归档元数据 — 分层混合方案
 *
 * 职责：
 * 1. homeArchiveMeta：为内置（builtin）英雄区登记「归档卡片」所需的展示元数据
 *    （标题、眉题、日期、封面图、跳转）。数据库英雄区归档后直接用自身字段展示。
 * 2. builtinHeroLayout：内置英雄区的布局类型（full / split），供首页渲染时使用。
 *
 * 显隐/归档控制已统一到数据库 home_heroes 表的 is_archived 字段，
 * 不再使用前端硬编码的 archivedHomeHeroIds 数组。
 */
import blockWallImg from '@/assets/images/2024-1-fangkuai.webp?url';
import mascotImg from '@/assets/images/breadgift.webp?url';
import anniversaryImg from '@/assets/images/8yearstext.webp?url';
import cafeImg from '@/assets/images/26coffee4.webp?url';
import fuzhouImg from '@/assets/images/fuzhou.webp?url';

/**
 * 内置英雄区归档卡片展示元数据
 * key 对应 home_heroes 表的 builtin_key 字段
 */
export const homeArchiveMeta = {
  'mascot-new': {
    title: '全新吉祥物',
    eyebrow: '全新上线',
    date: '2026',
    description: '全新吉祥物现已上线。',
  },
  'agent-preview': {
    title: 'BOH Agent 预览',
    eyebrow: 'Agent',
    date: '2026',
    description: '尚在演化的 Agent 预览英雄区。',
  },
  'birthday': {
    title: '今日生日',
    eyebrow: '纪念日',
    date: '每年',
    description: '当有用户过生日时出现的限时英雄区。',
  },
  'block-wall': {
    title: '方块墙',
    eyebrow: '社区 · 故事收集处',
    date: '持续',
    description: '把心情、祝福或想记住的瞬间钉在墙上。',
    image: blockWallImg,
  },
  'mascot-evolution': {
    title: '吉祥物进化史',
    eyebrow: 'BOH 吉祥物',
    date: '2018 至今',
    description: '从熊到面包，再到下一个故事。',
    image: mascotImg,
  },
  'anniversary-8': {
    title: '八周年庆典',
    eyebrow: '方块之家八周年',
    date: '2026 · 7/21',
    description: '八周年纪念海报、订阅礼与 Ryyik 的信。',
    image: anniversaryImg,
  },
  'cloud-cafe': {
    title: '云上咖啡店',
    eyebrow: '八周年 · 网页游戏',
    date: '2026',
    description: '招待方块熟客，亲手完成研磨、萃取、奶泡与拉花。',
    image: cafeImg,
    to: '/anniversary-cafe',
  },
  'fuzhou': {
    title: '遇见福州',
    eyebrow: '遇见系列',
    date: '2026',
    description: 'Halo，福州。有福之州，等待与你相遇。',
    image: fuzhouImg,
  },
  'split-theme-cloud': {
    title: 'BOH X 小猫主题 × BOH Cloud+',
    eyebrow: '主题与云端',
    date: '持续',
    description: '小猫主题与云端内容的分栏英雄区，被时间收进这里，随时可以回看。',
  },
  'split-brand-letter': {
    title: 'BOH 与 Ryyik 的信',
    eyebrow: '品牌与八周年寄语',
    date: '八周年',
    description: '了解什么是 BOH，以及一封给方块之家的信。',
    image: anniversaryImg,
    to: '/about',
  },
  'special-custom': {
    title: '特别企划',
    eyebrow: '代码接管',
    date: '2026',
    description: '由代码定义的特殊英雄区，归档后显示此卡片。',
    image: anniversaryImg,
  },
};

/**
 * 内置英雄区的布局类型
 * 用于 HomeHeroRow 的 layout prop
 */
export const builtinHeroLayout = {
  'mascot-new': 'full',
  'agent-preview': 'full',
  'birthday': 'full',
  'block-wall': 'full',
  'mascot-evolution': 'full',
  'anniversary-8': 'full',
  'cloud-cafe': 'full',
  'fuzhou': 'full',
  'split-theme-cloud': 'split',
  'split-brand-letter': 'split',
  'special-custom': 'full',
};
