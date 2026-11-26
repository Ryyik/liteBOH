/**
 * 详情页展示分段（plans/050 期 1，期 5 按草图重排）。
 *
 * tabId → `[{ id, label, fields }]`；fields 里每一项是字段 key 或
 * `{ key, label?, action?, hideValue?, editable?, copyValue?, chip?, custom? }`。
 *
 * 口径：
 * - **只配需要分段的表**。未配置的表由 DetailFields 退回原来的单组平铺
 *   （49 个页签零回归，见 tests/unit/data-admin-detail-sections.test.js）。
 * - 配置里必须覆盖 `dataConfig[tab].columns` 的**全部** key —— 少写一个，
 *   详情页就少显示一列（这里不是白名单，是展示顺序）。
 * - `action` 只声明交互意图，处理在 DataAdmin（见 onDetailFieldAction）。
 *   未实现的动作不要先画出来：点了没反应的入口比不画更糟。
 * - `editable` = 详情页内直接改（页面本身是编辑器，底部一个「保存」）；
 *   不加 `editable` 的数据行只是展示或经 `action` 走浮层。
 * - `label: ''` 的段不渲染分段标题（草图里主字段是平铺的一列）。
 */
export const DETAIL_SECTIONS = {
  users: [
    {
      id: 'main',
      label: '',
      fields: [
        { key: 'username', editable: true },
        { key: 'birthday', label: '生日', editable: true, custom: 'birthday' },
        { key: 'points', action: 'edit-points' },
        { key: 'subscription_tier', label: '订阅层级', action: 'edit-tier' },
        {
          key: '__grant_token',
          label: '发放一次性令牌',
          action: 'grant-token',
          hideValue: true,
        },
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
    {
      id: 'main',
      label: '',
      fields: [
        'username',
        'created_at',
        'gift_content',
        { key: 'shipping_address', label: '地址', action: 'copy-address', copyValue: true },
        { key: 'gift_status', label: '状态', action: 'edit-status', chip: true },
      ],
    },
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
 * 草稿只要求展示少数核心字段；其余字段仍在「完整编辑」里可改，但不在详情页铺开。
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
