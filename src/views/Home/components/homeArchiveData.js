/**
 * Home 历史回顾区配置 — Apple Style 归档机制
 *
 * 职责：
 * 1. homeArchiveMeta：为首页每一个英雄区登记「归档卡片」所需的展示元数据
 *    （标题、眉题、日期、封面图、跳转）。
 * 2. archivedHomeHeroIds —— 决定哪些英雄区「过时」并被移至 Footer 历史区。
 *    · 从数组移除某个 id → 该英雄区重新出现在首屏。
 *    · 往数组添加一个 id → 该英雄区从首屏消失，并出现在历史区内。
 *
 * 首页英雄区 key 对照：
 *  - agent-preview      BOH Agent 预览
 *  - birthday           今日生日
 *  - block-wall         方块墙
 *  - mascot-evolution   吉祥物进化史
 *  - anniversary-8      八周年
 *  - cloud-cafe         云上咖啡店
 *  - fuzhou             遇见福州
 *  - split-theme-cloud  主题 & Cloud+（分栏）
 *  - split-brand-letter BOH & Ryyik 的信（分栏）
 */
import blockWallImg from '@/assets/images/2024-1-fangkuai.webp?url';
import mascotImg from '@/assets/images/breadgift.webp?url';
import anniversaryImg from '@/assets/images/8yearstext.webp?url';
import cafeImg from '@/assets/images/26coffee4.webp?url';
import fuzhouImg from '@/assets/images/fuzhou.webp?url';

export const archivedHomeHeroIds = ['mascot-evolution', 'split-theme-cloud'];

export const homeArchiveMeta = {
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
};

export const archivedHomeHeroes = archivedHomeHeroIds
  .map((id) => ({ id, ...homeArchiveMeta[id] }))
  .filter((entry) => entry && entry.title);