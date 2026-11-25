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
    {
      id: 'identity',
      label: '身份',
      fields: ['username', { key: 'birthday', label: '生日' }],
    },
    {
      id: 'assets',
      label: '资产',
      fields: [
        { key: 'points', action: 'edit-points' },
        { key: 'subscription_tier', label: '订阅层级', action: 'edit-tier' },
      ],
    },
    {
      id: 'actions',
      label: '操作',
      fields: [
        { key: 'is_banned', label: '封禁状态', action: 'toggle-ban' },
        { key: 'is_muted', label: '禁言状态', action: 'toggle-mute' },
        {
          key: '__delete_record',
          label: '删除记录',
          action: 'delete-record',
          hideValue: true,
        },
      ],
    },
  ],
  gifts: [
    { id: 'order', label: '订单', fields: ['username', 'created_at', 'gift_content'] },
    {
      id: 'shipping',
      label: '收货信息',
      fields: [
        'shipping_address',
        {
          key: '__copy_address',
          label: '一键复制收货信息',
          action: 'copy-address',
          hideValue: true,
        },
      ],
    },
    { id: 'progress', label: '进度', fields: [{ key: 'gift_status', action: 'edit-status' }] },
    {
      id: 'actions',
      label: '操作',
      fields: [
        {
          key: '__delete_record',
          label: '删除记录',
          action: 'delete-record',
          hideValue: true,
        },
      ],
    },
  ],
};

/**
 * 草稿只要求展示少数核心字段；其余字段仍在「编辑」里可改，但不在只读页铺开。
 * 这份清单让守卫能区分「刻意不展示」与「新增列漏配」：
 *   columns = sections 里用到的 key + 这里登记的 key（两边都必须恰好覆盖、互不重叠）。
 */
export const DETAIL_SECTION_OMITTED_FIELDS = {
  users: [
    'id',
    'role',
    'email',
    'join_date',
    'shipping_recipient',
    'shipping_phone',
    'shipping_address',
  ],
  gifts: [
    'gift_scope_label',
    'shipping_recipient',
    'gift_no',
    'gift_price',
    'gift_points',
    'completed_at',
  ],
};
