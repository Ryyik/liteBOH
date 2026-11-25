/**
 * 后台侧栏的「设置页式」导航结构（plans/048 期 2，2026-11-25）
 *
 * ── 为什么单独一份，而不是改 tabModules ──────────────────────────────
 * `tabModules` 承担的是**落点注册表**的职责：每个 `/admin/*-console` 路由都必须在
 * 里面有一席（`tests/unit/admin-console-wiring.test.js` 锁了这条），否则侧栏与
 * 命令面板里都找不到入口。而设置页式导航要的是**渲染结构**：
 *   4 个控制台 ≠ 4 个并列模块，它们是「视觉装修」这一组的子页。
 *
 * 两者的颗粒度天然不同 ⇒ 拆成两份：
 *   · `tabModules`（config/tabs.js）  = 落点与权限的单位，**保持 18 个不动**
 *   · `NAV_GROUPS`（本文件）          = 侧栏怎么分组、哪几行合成一个子页
 *
 * 这样 `admin-console-wiring` / `data-admin-tab-config-coverage` / `function-index`
 * 全部不用改口径，本文件纯增量。
 *
 * ── 搜索索引仍然覆盖全部页签 ────────────────────────────────────────
 * 被「融合」掉的行（如 `points` 并进「用户」）在侧栏不再出现，但 `tabModules.tabIds`
 * 里仍留着它 ⇒ `function-index.js` 照旧为它生成 tab 落点 ⇒ 搜「积分管理」还能进。
 * 这是有意的：**侧栏负责「常用」，搜索负责「全量」**。
 *
 * ── 行类型（kind） ──────────────────────────────────────────────
 *   'tab'     点它 = switchTab(tabId)，落在数据管理面板的某一页签
 *   'module'  点它 = 跳它自己的独立路由（type:'page' 的控制台 / 编辑器）
 *   'section' 点它 = 进占位 section（媒体资源 / 网站设置）
 *   'group'   有 children，点它进子页列表（第二层）
 *
 * ⚠️ 组内行数上限 8：44px × 8 ≈ 352px，加组头正好一屏。
 *    超过就必须再分一层，否则「一屏看全」这个目标当场失效（`admin-tab-groups.test.js` 锁这条）。
 */

/**
 * @typedef {Object} NavRow
 * @property {string} id        行 id（唯一，用于 key / 高亮）
 * @property {string} label     行文案
 * @property {'tab'|'module'|'section'|'group'} kind
 * @property {string} [tabId]   kind==='tab' 时的页签 id
 * @property {string} [moduleId] kind==='module' 时的模块 id
 * @property {string} [section] kind==='section' 时的 section 名
 * @property {NavRow[]} [children] kind==='group' 时的子行
 * @property {string} [mergedFrom] 被并进这一行的其它 tabId（仅供文档/测试核对，不参与渲染）
 * @property {string} [hint]    行右侧的值或说明（无计数数据时的静态文案）
 */

/** @type {{ id: string, label: string, icon: string, rows: NavRow[] }[]} */
export const NAV_GROUPS = [
  {
    id: 'users',
    label: '用户',
    icon: 'Users',
    rows: [
      {
        id: 'users',
        label: '用户',
        kind: 'tab',
        tabId: 'users',
        // 「积分管理」原本是独立页签，但它查的就是 profiles 表、保存策略是 users 的子集
        mergedFrom: ['points'],
      },
      { id: 'pointsTransactions', label: '积分流水', kind: 'tab', tabId: 'pointsTransactions' },
      {
        id: 'grants',
        label: '权益发放',
        kind: 'group',
        children: [
          { id: 'points-grant', label: '积分发放', kind: 'tab', tabId: 'points-grant' },
          {
            id: 'subscriptions-grant',
            label: '订阅发放',
            kind: 'tab',
            tabId: 'subscriptions-grant',
          },
        ],
      },
      { id: 'subscriptions', label: '订阅管理', kind: 'tab', tabId: 'subscriptions' },
    ],
  },
  {
    id: 'fulfillment',
    label: '订单与履约',
    icon: 'Package',
    rows: [
      {
        id: 'fulfillment',
        label: '履约台',
        kind: 'tab',
        tabId: 'fulfillment',
        // 履约台读的就是 shop_points_orders(source=lottery) + user_gifts
        // ⇒ 「商城订单」「礼物管理」是它的两个数据源视图，不再各占一行
        mergedFrom: ['shopOrders', 'gifts'],
      },
      { id: 'addresses', label: '地址管理', kind: 'tab', tabId: 'addresses' },
    ],
  },
  {
    id: 'lottery',
    label: '抽奖与活动',
    icon: 'Dice',
    rows: [
      { id: 'lotteries', label: '抽奖配置', kind: 'tab', tabId: 'lotteries' },
      { id: 'lotteryEntries', label: '报名明细', kind: 'tab', tabId: 'lotteryEntries' },
      { id: 'lottery-join-grant', label: '帮人报名', kind: 'tab', tabId: 'lottery-join-grant' },
      { id: 'pity-grant', label: '保底中心', kind: 'tab', tabId: 'pity-grant' },
      { id: 'activities', label: '活动管理', kind: 'tab', tabId: 'activities' },
      {
        id: 'campaign-ledger',
        label: '活动台账',
        kind: 'group',
        children: [
          { id: 'campaigns', label: '活动平台', kind: 'tab', tabId: 'campaigns' },
          { id: 'campaignEntries', label: '报名明细', kind: 'tab', tabId: 'campaignEntries' },
          { id: 'campaignRewards', label: '发放台账', kind: 'tab', tabId: 'campaignRewards' },
        ],
      },
      {
        id: 'lottery-diagnostics',
        label: '诊断',
        kind: 'group',
        // 低频诊断（一个月开不了一次）收进第二层，不再占 6 个高频位
        children: [
          {
            id: 'lotteryJoinAttempts',
            label: '报名尝试',
            kind: 'tab',
            tabId: 'lotteryJoinAttempts',
          },
          { id: 'lotteryDrawLogs', label: '开奖日志', kind: 'tab', tabId: 'lotteryDrawLogs' },
          {
            id: 'lotteryFailureStats',
            label: '失败统计',
            kind: 'tab',
            tabId: 'lotteryFailureStats',
          },
          {
            id: 'lotteryNotificationJobs',
            label: '通知作业',
            kind: 'tab',
            tabId: 'lotteryNotificationJobs',
          },
          { id: 'lotteryAuditLogs', label: '运行审计', kind: 'tab', tabId: 'lotteryAuditLogs' },
          {
            id: 'lotterySchedulerLogs',
            label: '抽奖调度',
            kind: 'tab',
            tabId: 'lotterySchedulerLogs',
          },
        ],
      },
    ],
  },
  {
    id: 'community',
    label: '社区',
    icon: 'MessageCircle',
    rows: [
      { id: 'forum', label: '论坛帖子', kind: 'tab', tabId: 'forum' },
      { id: 'ads', label: '广告管理', kind: 'tab', tabId: 'ads' },
      { id: 'photoAlbums', label: '摄影集', kind: 'tab', tabId: 'photoAlbums' },
    ],
  },
  {
    id: 'operations',
    label: '内容运营',
    icon: 'Megaphone',
    rows: [
      // 「新闻」做成 group 而不是两行：`news-editor` 是独立控制台路由（不在 tabs[] 里），
      // 但它与 `news` 改的是同一张表（表编辑 vs 页内所见即所得）⇒ 必须共享同一个上下文。
      // 与下方「商品」完全对称。
      {
        id: 'news-tools',
        label: '新闻',
        kind: 'group',
        children: [
          { id: 'news', label: '新闻管理', kind: 'tab', tabId: 'news' },
          { id: 'news-editor', label: '资讯页内编辑', kind: 'module', moduleId: 'news-editor' },
        ],
      },
      { id: 'postReward', label: '发帖有奖', kind: 'tab', tabId: 'postReward' },
      { id: 'bohCreatorShows', label: '创作者展示', kind: 'tab', tabId: 'bohCreatorShows' },
      {
        id: 'visual',
        label: '视觉装修',
        kind: 'group',
        children: [
          { id: 'hero-console', label: '首页装修', kind: 'module', moduleId: 'hero-console' },
          { id: 'gate-console', label: '开屏管理', kind: 'module', moduleId: 'gate-console' },
          { id: 'xmas-console', label: '圣诞活动', kind: 'module', moduleId: 'xmas-console' },
          { id: 'avatar-console', label: '头像框', kind: 'module', moduleId: 'avatar-console' },
        ],
      },
    ],
  },
  {
    id: 'moderation',
    label: '审核',
    icon: 'Flag',
    rows: [
      {
        id: 'reports',
        label: '举报',
        kind: 'group',
        // 「按事件看」（forum_post_reports）与「按对象看」（posts where status=limited）
        // 是同一件事的两个视角，合成一行两个子页；**不合成一张表**。
        children: [
          { id: 'forumPostReports', label: '举报明细', kind: 'tab', tabId: 'forumPostReports' },
          { id: 'reportedPosts', label: '举报下架', kind: 'tab', tabId: 'reportedPosts' },
        ],
      },
      { id: 'reviewPosts', label: '已拒绝帖子', kind: 'tab', tabId: 'reviewPosts' },
      { id: 'reviewComments', label: '已拒绝评论', kind: 'tab', tabId: 'reviewComments' },
      {
        id: 'auditLogs',
        label: '审核日志',
        kind: 'group',
        children: [
          { id: 'moderationLogs', label: '审核动作', kind: 'tab', tabId: 'moderationLogs' },
          { id: 'adminAuditLogs', label: '管理审计', kind: 'tab', tabId: 'adminAuditLogs' },
        ],
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    icon: 'Sparkles',
    rows: [
      { id: 'keys-models', label: '密钥与模型', kind: 'tab', tabId: 'keys-models' },
      {
        id: 'scene-models',
        label: '场景模型',
        kind: 'group',
        children: [
          { id: 'bolekModels', label: '博莱克模型', kind: 'tab', tabId: 'bolekModels' },
          { id: 'moderation-model', label: '审核模型', kind: 'tab', tabId: 'moderation-model' },
          { id: 'lab-ai-model', label: '实验室模型', kind: 'tab', tabId: 'lab-ai-model' },
        ],
      },
      { id: 'ai-quota', label: 'AI 额度', kind: 'tab', tabId: 'ai-quota' },
      {
        id: 'memories',
        label: '记忆与事实卡',
        kind: 'group',
        children: [
          { id: 'coreMemories', label: '官方事实', kind: 'tab', tabId: 'coreMemories' },
          { id: 'aiMemories', label: 'AI 沉淀记忆', kind: 'tab', tabId: 'aiMemories' },
          { id: 'forumMemories', label: '论坛事实卡', kind: 'tab', tabId: 'forumMemories' },
        ],
      },
      {
        id: 'ai-logs',
        label: 'AI 日志',
        kind: 'group',
        children: [
          { id: 'aiWebSearchLog', label: '联网搜索', kind: 'tab', tabId: 'aiWebSearchLog' },
          { id: 'labUsageRecords', label: '实验室用量', kind: 'tab', tabId: 'labUsageRecords' },
          { id: 'apiKeyAuditLogs', label: 'Key 审计', kind: 'tab', tabId: 'apiKeyAuditLogs' },
        ],
      },
    ],
  },
  {
    id: 'tools',
    label: '配置与工具',
    icon: 'Settings',
    rows: [
      {
        id: 'product-tools',
        label: '商品',
        kind: 'group',
        children: [
          { id: 'products', label: '商品管理', kind: 'tab', tabId: 'products' },
          { id: 'shop-console', label: '商品编辑台', kind: 'module', moduleId: 'shop-console' },
          { id: 'shop-editor', label: '商城页内编辑', kind: 'module', moduleId: 'shop-editor' },
        ],
      },
      { id: 'media', label: '媒体资源', kind: 'section', section: 'media' },
      { id: 'settings', label: '网站设置', kind: 'section', section: 'settings' },
    ],
  },
];

/**
 * 已从侧栏移除的页签（2026-11-25，plans/048 §8）。
 *
 * ⚠️ **删入口 ≠ 删表，也 ≠ 删定义**：这些 tab 在 `tabs[]` / `TABS_ACTIONS` /
 * `dataConfig` / `query-config` 里全部保留，旧深链 `?tab=xxx` 仍然能打开。
 * 只是不再出现在侧栏导航里。
 *
 * 判据：`TABS_ACTIONS` 只有 `['view']`，且看完之后无事可做。
 */
export const HIDDEN_TAB_IDS = [
  'forumPostImages', // 图片审核：无处置动作，审核结果体现在 posts 上
  'forumWeeklyCheckins', // 每周签到：只读
  'notifications', // 通知管理：只读，且不是送达记录
  'userDataExportJobs', // 用户导出：只读、低频
  'lotteryFulfillments', // 履约与通知：履约并入履约台，通知已有独立页签
  'anniversaryClaims', // 周年领取：只读，一次性活动已结束
];

/**
 * 给每个顶层行打上「我属于哪一组」的标记，供侧栏决定要不要渲染组图标。
 *
 * ⚠️ 「组」在这里有两层含义，别混：
 *   · `NAV_GROUPS` 的每一项 = 侧栏的**分区**（用户 / 订单与履约 / …），有组头文字；
 *   · 行上的 `kind: 'group'` = 这一行**自己**是个子页容器（可展开）。
 *   本函数打的是前者的标记（`groupId`），后者由 `kind` 表达。
 */
export const NAV_GROUPS_WITH_ROW_META = NAV_GROUPS.map((group) => ({
  ...group,
  rows: group.rows.map((row) => ({ ...row, groupId: group.id })),
}));

/** 全部行（含 children），用于按 id 反查 */
const buildRowIndex = () => {
  const map = new Map();
  const walk = (rows) => {
    rows.forEach((row) => {
      map.set(row.id, row);
      if (Array.isArray(row.children)) walk(row.children);
    });
  };
  NAV_GROUPS.forEach((group) => walk(group.rows));
  return map;
};

export const NAV_ROW_BY_ID = buildRowIndex();

/**
 * 侧栏**真实给了独立行**的页签 id 集合。
 *
 * ⚠️ 与 `ROW_ID_BY_TAB_ID` 的区别必须分清，两者容易混：
 *   · `ROW_ID_BY_TAB_ID`  = **高亮反查表**，含 `mergedFrom`（`points` → `users`），
 *                           因为它要回答「深链进来时侧栏该亮哪一行」
 *   · `LISTED_TAB_IDS`    = **是否留了位置**，只数 `kind === 'tab'` 的行，
 *                           因为它要回答「内容区还要不要补一行」
 *
 * 用错会静默失效：`DataAdmin` 的 `unlistedModuleTabIds` 曾用前者，
 * 于是 `points` / `shopOrders` / `gifts` 被当成「已列出」，该列表恒为空、
 * `AdminTabList` 一次都没渲染（2026-11-25 复核发现）。
 */
export const LISTED_TAB_IDS = new Set(
  [...NAV_ROW_BY_ID.values()]
    .filter((row) => row.kind === 'tab' && row.tabId)
    .map((row) => row.tabId),
);

/** tabId → 它出现在哪一行（含 children），用于「当前页签 → 侧栏高亮哪一行」 */
export const ROW_ID_BY_TAB_ID = (() => {
  const map = new Map();
  NAV_ROW_BY_ID.forEach((row) => {
    if (row.kind === 'tab' && row.tabId) map.set(row.tabId, row.id);
    (row.mergedFrom || []).forEach((tabId) => {
      if (!map.has(tabId)) map.set(tabId, row.id);
    });
  });
  return map;
})();

/**
 * 「当前页签 → 侧栏应高亮哪一行」。
 * 被融合掉的页签（如 `points`）会落回它被并进的那一行（「用户」），
 * 这样深链打开时侧栏不会「一个都没选中」。
 */
export const resolveNavRowIdForTab = (tabId) => ROW_ID_BY_TAB_ID.get(tabId) || '';

/**
 * 「当前独立控制台 module id → 应高亮哪一行」。
 * 4 个装修控制台都收在「视觉装修」子页里，进页后要能看出自己在哪。
 */
export const resolveNavRowIdForModule = (moduleId) => {
  for (const [rowId, row] of NAV_ROW_BY_ID) {
    if (row.kind === 'module' && row.moduleId === moduleId) return rowId;
  }
  return '';
};

/**
 * 待办角标：分区 id → 该分区下面有几个「待处理」。
 *
 * ── 数据从哪来（不新开 RPC，全用宿主已有的计数）────────────────────
 * 宿主算好一份 `{ moderation, lotteryDue }` 传进来，这里只负责挂到分区上：
 *   · 审核分站 → `moderationPendingCount`（reportedPosts + reviewPosts + reviewComments）
 *   · 抽奖分站 → 「有到期未开奖就点一个圆点」（宿主信号是 boolean，没有场次数）
 *   · 其它分站 → 不给（不硬凑「用户总数」这类统计数字，那是统计不是待办）
 *
 * ⚠️ 刻意**不**在本文件里算：这些数来自不同表，前端自己算要打多次请求。
 *    已经算过的地方在宿主里，直接复用才符合单一真源。
 *    「待发货」那种跨表 count 需要一个新 RPC，不在本期（plans/048 §9 期 3 已降级）。
 *
 * @param {{ moderation?: number, lotteryDue?: boolean }} source
 * @returns {Record<string, number|true>} 分区 id → 计数；`true` 表示「只画圆点」
 */
export const buildGroupBadges = (source = {}) => {
  const badges = {};
  const moderation = Number(source.moderation || 0);
  if (Number.isFinite(moderation) && moderation > 0) badges.moderation = moderation;
  /* 抽奖只给「有/没有」：宿主那个信号是 boolean，没有真实场次数。
     显示「1」会被读成「只有 1 场要开奖」——比不显示更糟。
     所以用 `true` 表达「用圆点，不要数字」。 */
  if (source.lotteryDue) badges.lottery = true;
  return badges;
};

/* ══════════════════════════════════════════════════════════════════════
 * 竖屏整页钻取的「目录层级」反查（plans/049 期 1，2026-11-25）
 *
 * 竖屏不再是「一个抽屉装 32 行」，而是**一页一层**：
 *   第一层 目录（8 个组）→ 第二层 组内行 →（有子页的再进一层）→ 内容页
 * 所以渲染时需要回答两个问题：
 *   ① 某个容器 id（组 id 或带 children 的行 id）里有哪几行？
 *   ② 当前页签在这条层级链的哪一层？—— 用于深链直达内容页时把返回路径补全，
 *      否则从 `?tab=pity-grant` 进来点「返回」会直接掉到目录，跳过用户本来该看见的那一层。
 *
 * 这两个函数是**纯函数**（无 ref、无 DOM），单测可直接穷举 54 个页签验证链路完整。
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 容器 id → 它的行列表与标题。
 * 容器有两种：分组（`NAV_GROUPS` 的项）与带 children 的行（`kind: 'group'`）。
 *
 * @param {string} containerId
 * @returns {{ id: string, label: string, rows: import('./nav-groups.js').NavRow[], isGroup: boolean } | null}
 */
export const resolveNavContainer = (containerId) => {
  const id = String(containerId || '');
  if (!id) return null;
  const group = NAV_GROUPS.find((g) => g.id === id);
  if (group) return { id: group.id, label: group.label, rows: group.rows, isGroup: true };
  const row = NAV_ROW_BY_ID.get(id);
  // 叶子行（没有 children）不是容器 —— 它点下去就该进内容页，没有「里面」可看
  if (row && Array.isArray(row.children) && row.children.length) {
    return { id: row.id, label: row.label, rows: row.children, isGroup: false };
  }
  return null;
};

/**
 * 某个页签在竖屏层级链上的**容器 id 序列**（从外到内）。
 *
 * 例：
 *   · `users`          → `['users']`              （在「用户」组的第一层）
 *   · `pity-grant`     → `['lottery', 'lottery-diagnostics']`？—— 不，保底中心是顶层行
 *                        ⇒ `['lottery']`
 *   · `lotteryDrawLogs`→ `['lottery', 'lottery-diagnostics']`（诊断 ▸ 里的子页）
 *
 * ⚠️ 深度最多 2（组 → 带子页的行）：`admin-tab-groups.test.js` 锁了「只支持两层」，
 *    本函数不递归到底，遇到第三层会原样返回已找到的两层 —— 那种结构在守卫里就过不了。
 */
export const resolveNavAncestryForTab = (tabId) => {
  const rowId = resolveNavRowIdForTab(tabId);
  if (!rowId) return [];
  return resolveNavAncestryForRow(rowId);
};

/** 行 id → 容器 id 序列（同上，但入口是行而不是页签） */
export const resolveNavAncestryForRow = (rowId) => {
  const id = String(rowId || '');
  if (!id) return [];
  for (const group of NAV_GROUPS) {
    for (const row of group.rows) {
      if (row.id === id) return [group.id];
      const children = Array.isArray(row.children) ? row.children : [];
      if (children.some((child) => child.id === id)) return [group.id, row.id];
    }
  }
  return [];
};

/** 行是否可达（用于「深链的 tab 已从导航里删掉」时不要凭空空展开一层） */
export const isNavRowReachable = (rowId) => resolveNavAncestryForRow(rowId).length > 0;
