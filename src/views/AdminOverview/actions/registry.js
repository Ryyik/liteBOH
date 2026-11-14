/**
 * 概览页 `@` 动作注册表（2026-11-12，P1：抽奖可真实创建）
 *
 * 硬约束（见 docs/2026-11-12-管理台概览页-@动作方案.md）：
 *   · 动作**只能**通过 `@` 触发，没有 `@` 的输入只做搜索；
 *   · 本表是唯一清单，页面不另写一份；
 *   · **写入必须复用后台已有的保存路径**：抽奖走 `SAVE_STRATEGIES.lotteries`
 *     （与数据管理面板同一份归一化 + 字段白名单）再 `insertAdminRow`，
 *     不在概览页拼 SQL，也不新增表级写口。
 *
 * 没有 `submit` 的动作 = 只跳转（P0 行为），params 为空数组。
 *
 * ── 抽奖参数的三个坑（都是实测出来的，别当成普通表单） ────────────────
 * 1. `is_home_visible` 在保存策略里的默认值是 **true**（`!== false` 即真），
 *    不显式传 false 就会直接推到首页轮播。所以 draft 初始化必须写死默认值。
 * 2. `enforce_account_age_check` 默认值是 **false**（`=== true` 才算开），
 *    不显式传 true 等于悄悄关掉账号年龄门槛。
 * 3. `winner_count` 不是自由输入：`pity_mode === 'eligible'` 时必须 2，
 *    其余必须 1，填错会被 `SAVE_STRATEGIES` 直接抛错。所以它是**派生值**。
 * 4. `pity_mode === 'eligible'` 在 DB 上还要求 `pity_overflow_reward_title` **非空**
 *    （`lotteries_pity_reward_config_check`，这个字段是给第二位中奖人的）。
 *    2026-11-14 之前它不在保存策略 / 字段白名单 / 本表任何一处 ⇒ 选「计入并兑现」
 *    必然写库失败。现在三处都补齐了，别再把它当成「可选的第二份保底礼」删掉。
 */
import { SAVE_STRATEGIES } from '@/views/DataManagement/config/saveStrategies.js';
import { insertAdminRow } from '@/utils/api/data-admin-table-api.js';

const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isBlank = (value) => String(value ?? '').trim() === '';

/** 中奖人数由保底规则派生，避免出现「选了保底却填 1 人」这种必然报错的组合 */
export const deriveLotteryWinnerCount = (pityMode) => (pityMode === 'eligible' ? 2 : 1);

/** datetime-local 的值 → 本地时间字符串，仅用于展示 */
const displayDateTime = (value) => (value ? String(value).replace('T', ' ') : '');

const PITY_MODE_OPTIONS = [
  { value: 'none', label: '不计入失败' },
  { value: 'count_only', label: '仅计入失败' },
  { value: 'eligible', label: '计入并兑现（2 人）' },
];

/* ── 抽奖：前端即时体检（与 SAVE_STRATEGIES 的硬校验对齐，提前拦住） ── */
const validateLotteryDraft = (draft) => {
  if (isBlank(draft.prize_title)) return '奖品名称不能为空';
  if (isBlank(draft.draw_at)) return '开奖时间不能为空';

  const drawAt = Date.parse(draft.draw_at);
  if (Number.isNaN(drawAt)) return '开奖时间格式无效';
  if (drawAt <= Date.now()) return '开奖时间已经过去，保存后会立刻开奖';

  if (!isBlank(draft.entry_deadline_at)) {
    const deadline = Date.parse(draft.entry_deadline_at);
    if (Number.isNaN(deadline)) return '报名截止时间格式无效';
    if (deadline > drawAt) return '报名截止不能晚于开奖时间';
  }

  const winnerCount = deriveLotteryWinnerCount(draft.pity_mode);
  const maxEntries = optionalNumber(draft.max_entries);
  if (maxEntries !== null) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0)
      return '报名上限必须是正整数，或留空表示不限';
    if (winnerCount > maxEntries) return '中奖人数不能大于报名上限';
  }

  if (draft.pity_mode === 'eligible' && isBlank(draft.pity_reward_title)) {
    return '选了「兑现保底」就必须填保底礼';
  }
  /* 溢出保底礼（2026-11-14）：DB 的 `lotteries_pity_reward_config_check` 要求
     eligible 时**两个**保底礼标题都非空。只校验主保底礼等于放一个必然失败的组合过去 ——
     用户点确认后只会看到一条数据库约束错误。 */
  if (draft.pity_mode === 'eligible' && isBlank(draft.pity_overflow_reward_title)) {
    return '选了「兑现保底」还必须填溢出保底礼（第二位中奖人的奖品）';
  }

  const cover = String(draft.cover_image_url ?? '').trim();
  if (cover && !/^https?:\/\//i.test(cover)) return '封面链接必须以 http(s):// 开头';

  return '';
};

/** 预览分块：确认前把「写什么、会出现在哪、有什么风险」一次讲完 */
const summarizeLottery = (draft) => {
  const winnerCount = deriveLotteryWinnerCount(draft.pity_mode);
  const title = isBlank(draft.title)
    ? `${String(draft.prize_title || '').trim() || '未命名'} 抽奖`
    : String(draft.title).trim();
  const pityLabel =
    PITY_MODE_OPTIONS.find((option) => option.value === draft.pity_mode)?.label || '不计入失败';

  const sections = [
    {
      title: '基本信息',
      rows: [
        { label: '标题', value: title },
        { label: '奖品', value: String(draft.prize_title || '').trim() || '未填' },
        { label: '开奖时间', value: displayDateTime(draft.draw_at) || '未填' },
        {
          label: '报名截止',
          value: displayDateTime(draft.entry_deadline_at) || '开奖前均可报名',
        },
      ],
    },
    {
      title: '中奖规则',
      rows: [
        { label: '中奖人数', value: `${winnerCount} 人` },
        { label: '保底', value: pityLabel },
        ...(draft.pity_mode === 'eligible'
          ? [
              { label: '保底礼', value: String(draft.pity_reward_title || '').trim() || '未填' },
              {
                label: '溢出保底礼',
                value: String(draft.pity_overflow_reward_title || '').trim() || '未填',
              },
            ]
          : []),
        { label: '报名上限', value: optionalNumber(draft.max_entries) ?? '不限' },
        {
          label: '账号年龄校验',
          value: draft.enforce_account_age_check === false ? '不启用' : '启用',
        },
      ],
    },
    {
      title: '前台影响',
      rows: [
        {
          label: '社区抽奖页',
          value: draft.is_community_visible === false ? '不展示' : '展示',
        },
        { label: '首页轮播', value: draft.is_home_visible === true ? '展示' : '不展示' },
        { label: '状态', value: '草稿（开报名前不会出现）' },
      ],
    },
  ];

  // 不阻断提交、但提交前应该知道的事
  const checks = [];
  if (optionalNumber(draft.max_entries) === null) {
    checks.push({ tone: 'info', text: '报名人数不限，开奖时按实际报名名单抽取' });
  }
  if (draft.is_home_visible === true) {
    checks.push({ tone: 'warn', text: '草稿状态下首页不会出现，改成「报名中」后会推到首页轮播' });
  }
  if (isBlank(draft.cover_image_url)) {
    checks.push({ tone: 'info', text: '没有封面，前台会用占位图；可以建完再去详情页上传' });
  }

  return { sections, checks };
};

export const ADMIN_ACTIONS = [
  {
    id: 'lottery.create',
    label: '抽奖',
    aliases: ['摇奖'],
    keys: 'cj',
    desc: '新建一场抽奖（草稿）',
    group: '活动',
    risk: 'normal',
    detailTab: 'lotteries',
    /** draft 初值：必须显式写死，否则会踩保存策略的默认值（见文件头三条） */
    defaults: {
      title: '',
      prize_title: '',
      prize_description: '',
      description: '',
      cover_image_url: '',
      draw_at: '',
      entry_deadline_at: '',
      max_entries: '',
      pity_mode: 'none',
      pity_reward_title: '',
      // 溢出保底礼（eligible 的第二个中奖人）：DB 约束要求与主保底礼同时非空
      pity_overflow_reward_title: '',
      is_community_visible: true,
      is_home_visible: false,
      enforce_account_age_check: true,
    },
    params: [
      // 主行：只填这两项就能建出可用草稿
      {
        key: 'prize_title',
        label: '奖品',
        type: 'text',
        required: true,
        maxLength: 120,
        group: 'main',
        placeholder: '例如：BOH 纪念礼盒',
      },
      {
        key: 'draw_at',
        label: '开奖时间',
        type: 'datetime',
        required: true,
        group: 'main',
      },
      {
        key: 'max_entries',
        label: '报名上限',
        type: 'number',
        min: 1,
        group: 'main',
        placeholder: '留空不限',
        hint: '不填即不限人数',
      },
      {
        key: 'entry_deadline_at',
        label: '报名截止',
        type: 'datetime',
        group: 'main',
        hint: '留空则报名到开奖前',
      },

      // 更多设置
      {
        key: 'title',
        label: '抽奖标题',
        type: 'text',
        maxLength: 120,
        group: 'more',
        placeholder: '留空自动生成',
      },
      {
        key: 'pity_mode',
        label: '保底规则',
        type: 'select',
        group: 'more',
        options: PITY_MODE_OPTIONS,
        hint: '所有中奖都会重置保底次数',
      },
      {
        key: 'pity_reward_title',
        label: '保底礼',
        type: 'text',
        maxLength: 120,
        group: 'more',
        placeholder: '例如：BOH 基础礼盒',
        visibleWhen: (draft) => draft.pity_mode === 'eligible',
        hint: '仅 1 位达到保底且未获普通奖的用户获得',
      },
      {
        key: 'pity_overflow_reward_title',
        label: '溢出保底礼',
        type: 'text',
        maxLength: 120,
        group: 'more',
        placeholder: '例如：BOH 纪念徽章',
        visibleWhen: (draft) => draft.pity_mode === 'eligible',
        hint: '第二位中奖人的奖品（与保底礼一起构成 2 人档，两者都必填）',
      },
      {
        key: 'prize_description',
        label: '奖品说明',
        type: 'textarea',
        rows: 2,
        maxLength: 800,
        group: 'more',
        placeholder: '规格、数量、发放方式',
      },
      {
        key: 'description',
        label: '抽奖说明',
        type: 'textarea',
        rows: 2,
        maxLength: 1200,
        group: 'more',
        placeholder: '写在抽奖页上的活动说明',
      },
      {
        key: 'cover_image_url',
        label: '封面链接',
        type: 'text',
        group: 'more',
        placeholder: 'https://…（也可建完在详情页上传）',
      },
      {
        key: 'is_community_visible',
        label: '社区抽奖页展示',
        type: 'switch',
        group: 'more',
      },
      {
        key: 'is_home_visible',
        label: '首页轮播展示',
        type: 'switch',
        group: 'more',
        hint: '默认关闭；改成报名中后才会出现在首页',
      },
      {
        key: 'enforce_account_age_check',
        label: '账号年龄校验',
        type: 'switch',
        group: 'more',
        hint: '启用后仅满足账号年龄要求的用户可报名',
      },
    ],
    validate: validateLotteryDraft,
    summarize: summarizeLottery,
    /** 只读展示项：由其他字段算出来，不给输入框 */
    derived: [
      {
        key: 'winner_count',
        label: '中奖人数',
        group: 'more',
        compute: (draft) => `${deriveLotteryWinnerCount(draft.pity_mode)} 人`,
      },
    ],
    submit: async ({ draft, userId }) => {
      const payload = await SAVE_STRATEGIES.lotteries({
        editingItem: {
          title: isBlank(draft.title)
            ? `${String(draft.prize_title || '').trim() || '未命名'} 抽奖`
            : draft.title.trim(),
          description: draft.description,
          prize_title: draft.prize_title,
          prize_description: draft.prize_description,
          cover_image_url: draft.cover_image_url,
          pity_mode: draft.pity_mode || 'none',
          pity_reward_title: draft.pity_reward_title,
          pity_overflow_reward_title: draft.pity_overflow_reward_title,
          draw_at: draft.draw_at,
          entry_deadline_at: draft.entry_deadline_at,
          max_entries: optionalNumber(draft.max_entries),
          // 派生，不接受用户直填
          winner_count: deriveLotteryWinnerCount(draft.pity_mode),
          is_community_visible: draft.is_community_visible !== false,
          is_home_visible: draft.is_home_visible === true,
          enforce_account_age_check: draft.enforce_account_age_check !== false,
          // 先落草稿：概览页创建不应直接开报名，避免误发到前台
          status: 'draft',
        },
        userId,
        isEditing: false,
      });
      return insertAdminRow('lotteries', payload);
    },
  },
  {
    id: 'campaign.create',
    label: '活动',
    aliases: ['活动平台'],
    keys: 'hd',
    desc: '新建活动与报名',
    group: '活动',
    risk: 'normal',
    to: { tab: 'campaigns' },
    params: [],
  },
  {
    id: 'lottery.draw',
    label: '开奖',
    aliases: ['抽奖开奖'],
    keys: 'kj',
    desc: '处理到期抽奖',
    group: '活动',
    risk: 'high',
    to: { tab: 'lotteries', status: 'open' },
    params: [],
  },
  {
    id: 'order.ship',
    label: '发货',
    aliases: ['发件', '待发货'],
    keys: 'fh',
    desc: '打开待发货订单',
    group: '交易',
    risk: 'normal',
    to: { tab: 'shopOrders', status: 'preparing' },
    params: [],
  },
  {
    id: 'points.grant',
    label: '发积分',
    aliases: ['补发', '加分', '送积分'],
    keys: 'ffjf',
    desc: '给用户补积分',
    group: '用户',
    risk: 'high',
    to: { tab: 'points-grant' },
    params: [],
  },
  {
    id: 'user.ban',
    label: '封禁',
    aliases: ['禁言', '拉黑'],
    keys: 'fj',
    desc: '处理违规账号',
    group: '用户',
    risk: 'high',
    to: { tab: 'users' },
    params: [],
  },
];

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** `@` 后的输入过滤：label / 别名 / 拼音首字母，前缀优先 */
export const filterActions = (query) => {
  const q = normalize(query).replace(/^[@＠]/, '');
  if (!q) return [...ADMIN_ACTIONS];

  const scored = [];
  for (const action of ADMIN_ACTIONS) {
    const label = normalize(action.label);
    const aliases = (action.aliases || []).map(normalize);
    let score = 0;
    if (label === q || aliases.includes(q) || action.keys === q) score = 1;
    else if (label.startsWith(q) || aliases.some((a) => a.startsWith(q))) score = 0.8;
    else if (label.includes(q) || aliases.some((a) => a.includes(q))) score = 0.6;
    else if (action.keys.startsWith(q)) score = 0.5;
    else if (normalize(action.desc).includes(q)) score = 0.3;
    if (score > 0) scored.push({ action, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((item) => item.action);
};

/** 动作 → 目标页 URL（只带后台认得的 query） */
export const buildActionRoute = (action) => {
  if (!action) return null;
  const { tab, ...rest } = action.to || {};
  return { path: '/admin/data-management', query: { tab, ...rest } };
};

/** 当前该显示的参数（visibleWhen 不成立的先藏起来） */
export const visibleParams = (action, draft) => {
  if (!action) return [];
  return (action.params || []).filter(
    (param) => !param.visibleWhen || param.visibleWhen(draft || {}),
  );
};

/** 还缺哪些必填参数（用于按钮可用性与提示文案） */
export const missingParams = (action, draft) => {
  if (!action) return [];
  return visibleParams(action, draft)
    .filter((param) => param.required)
    .filter((param) => {
      const value = draft?.[param.key];
      if (param.type === 'number') return value !== 0 && optionalNumber(value) === null;
      return isBlank(value);
    })
    .map((param) => param.label);
};

/** 校验：不通过时返回**可行动**的原因，通过返回空串 */
export const validateDraft = (action, draft) => {
  const missing = missingParams(action, draft);
  if (missing.length > 0) return `还缺：${missing.join('、')}`;

  for (const param of visibleParams(action, draft)) {
    if (param.type !== 'number') continue;
    const value = optionalNumber(draft?.[param.key]);
    if (value === null) continue;
    if (param.min !== undefined && value < param.min) return `${param.label}不能小于 ${param.min}`;
    if (param.max !== undefined && value > param.max) return `${param.label}不能大于 ${param.max}`;
  }

  // 动作自带的业务校验（互锁规则都在这里，先拦一道再交给保存策略）
  if (typeof action?.validate === 'function') {
    return action.validate(draft || {}) || '';
  }
  return '';
};

/** 进入动作时的初始 draft：把 defaults 显式铺开 */
export const initialDraft = (action) => ({ ...(action?.defaults || {}) });
