/**
 * Home 首屏页脚配置 — Apple Style 三层结构
 * 仅在 Home 路由使用，其他页面不受影响
 */

export const footerDisclaimer = [
  '1. 八周年订阅礼每个账号可免费领取一次，有效期一个月，不可重复领取。',
  '2. 遇见福州等内容为 BOH 遇见系列线下活动，详情请关注社群公告。',
];

export const footerColumns = [
  {
    h: '探索 BOH',
    items: [
      { label: '首页', to: '/' },
      { label: '商店', to: '/shop' },
      { label: '好礼', to: '/gift' },
      { label: '节目', to: '/shows' },
      { label: 'MBTI', to: '/mbti' },
      { label: 'BOH AI', to: '/ai-chat' },
    ],
  },
  {
    h: '社群',
    items: [
      { label: '论坛', to: '/forum' },
      { label: '社群动态', to: '/activities' },
      { label: '方块墙', to: '/block-wall' },
      { label: '抽奖', to: '/lotteries' },
      { label: '生日', to: '/birthday' },
    ],
  },
  {
    h: '账户',
    items: [
      { label: '个人中心', to: '/user-space' },
      { label: 'BOH Cloud+', to: '/user-space/note' },
      { label: '我的订阅', to: '/user-space/subscriptions' },
    ],
  },
  {
    h: '帮助',
    items: [
      { label: '下载', to: '/download' },
      { label: '入门教程', to: '/download?tab=tutorial' },
      { label: '联系客服', href: 'mailto:3197329096@qq.com' },
      { label: '问题反馈', href: 'mailto:3197329096@qq.com' },
      { label: '帮助中心', to: '/tutorial' },
    ],
  },
  {
    h: '关于',
    items: [
      { label: '关于方块', to: '/about' },
      { label: '加入我们', to: '/join' },
      { label: '新闻&节目', to: '/newsroom' },
      { label: '隐私政策', agreement: 'privacy' },
      { label: '服务条款', agreement: 'user' },
    ],
  },
];

export const footerBottomLinks = [
  { label: '隐私政策', agreement: 'privacy' },
  { label: '服务条款', agreement: 'user' },
  { label: '帮助中心', to: '/download?tab=tutorial' },
];

export const footerCopyright = '© 2018-2026 方块之家. 保留所有权利。';
