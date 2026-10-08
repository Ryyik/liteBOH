/**
 * 顾客与回忆的**元数据** —— plans/026 P0-1
 *
 * ⚠️ 这个文件刻意**不import 任何图片资源**：
 * core/ 与 systems/ 必须能被 vitest 直接引用（计划 §3 的验收条件），
 * 而 vite 的图片 import 只在应用构建里有意义。
 * 图片 key 由视图层（views/AnniversaryCafe/images.js）解析成真实 URL。
 */

/** 顾客表：imageKey 对应 skins/ 下的立绘文件名（不含扩展名） */
export const CUSTOMERS = [
  { name: 'Ryyik', note: '今天也想喝熟悉的味道', imageKey: 'ryyik' },
  { name: '白夜', note: '刚结束一段很长的旅程', imageKey: 'baiye' },
  { name: '橙子', note: '想在窗边休息一会儿', imageKey: 'chengzi' },
  { name: '汉堡', note: '带着新地图来到了店里', imageKey: 'hamburger' },
  { name: '小牛', note: '点单前已经拍了很多照片', imageKey: 'xiaoniu' },
  { name: 'Thoik', note: '今天想试试菜单上的新品', imageKey: 'thoik' },
  { name: '丁老师', note: '下课后需要一杯热咖啡', imageKey: 'teacher-ding' },
  { name: '河豚', note: '在气泡果咖前犹豫了很久', imageKey: 'pufferfish' },
  { name: '十一', note: '想把咖啡带去新的世界', imageKey: 'eleven' },
  { name: 'End', note: '还是坐在靠近吧台的位置', imageKey: 'end' },
  { name: '渔夫曲', note: '从很远的海边赶来', imageKey: 'yufuqu' },
  { name: '五歌', note: '想尝尝今天最复杂的一杯', imageKey: 'fivege' },
];

/** 方块之家的回忆：assetKey 对应 assets/images 下的图片 */
export const MEMORIES = [
  {
    id: 'four-years',
    year: '2022',
    title: '四周年烟花夜',
    detail: '老朋友们重新聚在一起，也留下了第一批被认真保存的周年影像。',
    assetKey: '2022-7-4years',
  },
  {
    id: 'five-years',
    year: '2023',
    title: '五周年纪念册',
    detail: '第五年的合影被收进纪念册，后来每一次周年都延续了这份仪式感。',
    assetKey: '2023-7-5years',
  },
  {
    id: 'winter-museum',
    year: '2025',
    title: '冬眠博物馆',
    detail: '方块街圣诞与生日会特别活动，把大家的冬日回忆收藏进了博物馆。',
    assetKey: '2025wintermuseam',
  },
  {
    id: 'habitrain',
    year: '2026',
    title: '哈比快车谋杀案',
    detail: '那趟充满推理、身份与笑声的列车，至今仍是方块之家最热闹的游戏之一。',
    assetKey: 'habitrain',
  },
  {
    id: 'fuzhou',
    year: '2026',
    title: 'Halo，福州',
    detail: '遇见系列从线上世界走到真实城市，新的共同记忆正在福州发生。',
    assetKey: 'fuzhou',
  },
];

export function getCustomer(index) {
  return CUSTOMERS[index] || CUSTOMERS[0];
}
