/**
 * BOH 精选节目 —— **单一真源**（2026-10-20「内容页合并」收口）。
 *
 * 为什么有这个文件：这批节目原本在仓库里**存了两份**，字段名还不同 ——
 *   · `views/Newsroom/index.vue` 的 `SHOW_ITEMS`（进混排信息流，用 `excerpt` / 有 `date`）
 *   · `views/Shows/index.vue` 的 `shows`（节目页网格，用 `description` / 无 `date`）
 * 两者内容一致、只有字段名与 `date` 有无的差别 ⇒「改一处要动两处」的典型。
 * 合并后这里保留**并集**字段：信息流要 `date` 排序，节目页要 `description` 长文案。
 *
 * ⚠️ 当前节目页 `/shows` 已于本次合并退场（见 `router/routes/compat.ts`），
 * 消费者是 `/newsroom` 的资讯流与 `CreatorShowsPanel` 所在的节目段；但字段集保持不变，
 * 以免将来重新引入节目页时又要拆一次。
 *
 * 图片写 `@/assets/...` 别名，渲染时必须过 `utils/asset-helper.js` 的 `getImageUrl()`。
 */

/** @typedef {'survival' | 'city' | 'event'} ShowKind */

export const SHOW_ITEMS = [
  {
    kind: 'show',
    id: 'winter-s4',
    /** 节目页网格用的历史数字 id（旧 `views/Shows/index.vue` 的 `shows` 那一份） */
    legacyId: 1,
    title: '冬眠生存 第四季',
    subtitle: 'Season 4',
    excerpt: '方块之家经典生存系列，在寒冷的方块世界中与伙伴们一起探索、建造、生存。',
    description:
      '方块之家最经典的生存系列节目，第四季已完播。在寒冷的方块世界中，与伙伴们一起探索、建造、生存。',
    date: '2026-02-15',
    author: 'BOH 节目组',
    category: '生存挑战',
    image: '@/assets/images/26coffee.webp',
    link: 'https://www.bilibili.com/video/BV1gdzTBiECq/?share_source=copy_web',
    /** 「观看精剪」等副链接（旧节目页 Hero 区有，信息流不用） */
    secondaryLink: 'https://www.bilibili.com/video/BV1CFziBiErz/?share_source=copy_web',
    badge: '热播',
    episodes: '连载中',
    status: '完播',
    type: 'survival',
  },
  {
    kind: 'show',
    id: 'block-street',
    legacyId: 2,
    title: '方块街',
    subtitle: 'New Series',
    excerpt: '方块之家的方块街建设系列，打造繁华的方块世界街区，体验城市建设的乐趣。',
    description:
      '方块之家的商业街建设系列，打造繁华的商业街区。体验城市建设的乐趣，创造属于你的方块都市。',
    date: '2026-02-06',
    author: 'BOH 节目组',
    category: '模拟建设',
    image: '@/assets/images/main1.webp',
    link: 'https://www.bilibili.com/video/BV1nj421Q7hH/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0',
    secondaryLink:
      'https://www.bilibili.com/video/BV1nj421Q7hH/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0',
    badge: '新节目',
    episodes: '更新中',
    status: '更新中',
    type: 'city',
  },
  {
    kind: 'show',
    id: 'newyear-2025',
    legacyId: 3,
    title: '新年活动 2025',
    subtitle: '',
    excerpt: '方块之家新年庆典活动，精彩游戏与丰厚奖品，与伙伴们一起欢度佳节。',
    description: '方块之家新年庆典活动，精彩游戏与丰厚奖品，与伙伴们一起欢度佳节。',
    date: '2026-01-10',
    author: 'BOH 节目组',
    category: '特别活动',
    image: '@/assets/images/2025-newyear.webp',
    link: 'https://www.bilibili.com/video/BV1nW4y157LA/?share_source=copy_web&vd_source=56d8f1dd1b26f4f6c0e9e572921f4cc0',
    secondaryLink: '',
    badge: '精选',
    episodes: '年度特辑',
    status: '年度特辑',
    type: 'event',
  },
];

/** 按分类去重后的节目分类（资讯流筛选的「节目 · 分类」那一组从这里派生，别再手写第二份） */
export const SHOW_CATEGORIES = [...new Set(SHOW_ITEMS.map((item) => item.category))];
