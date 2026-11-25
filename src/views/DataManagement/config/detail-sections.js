/**
 * 详情页展示分段（plans/050 期 1）。
 *
 * tabId → `[{ id, label, fields }]`；fields 里每一项是字段 key 或
 * `{ key, label?, action?, hideValue? }`。
 *
 * 口径：
 * - **只配需要分段的表**。未配置的表由 DetailFields 退回原来的单组平铺
 *   （49 个页签零回归，见 tests/unit/data-admin-detail-sections.test.js）。
 * - 配置里必须覆盖 `dataConfig[tab].columns` 的**全部** key —— 少写一个，
 *   详情页就少显示一列（这里不是白名单，是展示顺序）。
 * - `action` 只声明交互意图，处理在 DataAdmin（见 onDetailFieldAction）。
 *   未实现的动作不要先画出来：点了没反应的入口比不画更糟。
 */
export const DETAIL_SECTIONS = {
  users: [
    { id: 'identity', label: '身份', fields: ['username', 'role', 'id'] },
    { id: 'account', label: '账号状态', fields: ['is_banned', 'is_muted', 'join_date'] },
    {
      id: 'assets',
      label: '资产',
      fields: [
        { key: 'points', action: 'edit-points' },
        { key: 'subscription_tier', label: '订阅层级', action: 'edit-tier' },
      ],
    },
    { id: 'contact', label: '联系方式', fields: ['email'] },
    {
      id: 'shipping',
      label: '收货信息',
      fields: ['shipping_recipient', 'shipping_phone', 'shipping_address'],
    },
  ],
  gifts: [
    {
      id: 'order',
      label: '订单',
      fields: ['username', 'created_at', 'gift_content', 'gift_scope_label'],
    },
    {
      id: 'shipping',
      label: '收货信息',
      fields: [
        'shipping_recipient',
        'shipping_address',
        {
          key: '__copy_address',
          label: '一键复制收货信息',
          action: 'copy-address',
          hideValue: true,
        },
      ],
    },
    {
      id: 'progress',
      label: '进度',
      fields: [{ key: 'gift_status', action: 'edit-status' }, 'gift_no', 'completed_at'],
    },
    { id: 'amount', label: '金额', fields: ['gift_price', 'gift_points'] },
  ],
};
