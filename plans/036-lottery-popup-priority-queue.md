# 036 · 抽奖弹窗：优先级队列与去重

> 状态：**方案待确认（2026-10-31）**，只有规格与判断逻辑，代码未动
> 目标：两类弹窗（未报名提醒 / 结果通知）在同一仲裁器里排序，做到「该弹的必弹一次，弹过的不再弹」
> 前提：规则必须映射到 `lotteries` / `lottery_entries`，**不是空的 `activity_campaigns`**（§2.1）
> 关联：`src/utils/island-notify-policy.js`（2026-10-31 入库的通知岛闸门）、`plans/009`（导航岛形态）

---

## 1. 一句话

同一个活动的「邀你报名」和「你的结果」是**两件独立的事**，必须按 `(用户, 活动, 阶段)` 分开记账；只按活动去重，会造出两种反向故障——报名提醒一弹，开奖后用户就永远收不到结果；或者结果发过之后，系统误以为报名提醒也发过了。

---

## 2. 现状核查（2026-10-31 读线上库 + 读码）

### 2.1 规则挂错了表

`activity_campaigns` 线上 **0 行**；真正在跑的是 `lotteries` + `lottery_entries`（43 条报名、6 条中奖发放）。所以字段映射是：

| 语义 | 真实字段 |
|---|---|
| 报名截止 | `lotteries.entry_deadline_at` |
| 开奖时间（计划 / 实际） | `draw_at` / `drawn_at` |
| 是否已报名 | `lottery_entries` 存在 `(lottery_id, user_id)` |
| 是否中奖 | `winner_user_id = auth.uid()`，多人中奖时还有 `lottery_draw_logs` |
| 领取状态 | `lottery_winner_fulfillments.status`（`pending_contact` / `fulfilled` …） |

### 2.2 六场活动的真实分布

| 活动 | 状态 | 参与 | 封面 | 获奖 |
|---|---|---|---|---|
| 中秋节抽奖 | `drawn` | 6 | 有（iPhone 直出 3024×4032 竖图） | 雨芙蕖酱酱酱酱 |
| 七夕·方块之家抽奖 | `closed` | 10 | 有（286×276 小方图） | 白烨 |
| 开学季，好礼为你备好。 | `closed` | 7 | 有（2848×1600 横图） | Eleven |
| 离开方块之家谁还把你当小孩 | `closed` | 10 | **空** | CELLINIA |
| 520 Leo请你瑞一下～ | `closed` | 5 | **空** | 雨芙蕖酱酱 |
| 方块之家周日请你喝库迪～ | `closed` | 5 | **空** | 白烨 |

两个直接结论：**①「未报名提醒」目前是空态**——没有任何 `open` 状态的活动，这类弹窗现在触发不了；**②一半没封面**，必须有降级版式，否则头图位是空白。

### 2.3 权限矩阵（决定游客能不能被弹）

| 对象 | anon | authenticated | admin |
|---|---|---|---|
| `lotteries` SELECT | ✅ `is_community_visible` 且 status ∈ (open, drawn, closed)；或 `is_home_visible` 且 status ∈ (open, drawn) | 同左 | 全部 |
| `lottery_entries` SELECT | ❌ | 仅本人 / admin | 全部 |
| `get_community_lotteries()` | ✅ 实测 `has_function_privilege(anon) = true` | ✅ | ✅ |

也就是说：**游客看得见活动，永远看不见也产生不了任何「我的参与」记录**。

### 2.4 现有 UI 与缺口

- `/community-lotteries` 页面公开可访问，游客点「立即报名」→ `handleJoinLottery` 第一句 `if (!isLoggedIn) { showLoginModal = true; return }`，属**轻提示 + 点击才拦**。
- **全仓没有任何抽奖弹窗实现**——`src/` 里没有 `LotteryPopup` 之类的组件，弹窗是从零开始。
- 资格判定只在 `join_community_lottery` 里做：`enforce_account_age_check` 为真时以 `auth.users.created_at` 为准校验 **24 小时**，且 **fail-closed**（取不到时间直接拒，码 `ACCOUNT_CREATED_AT_MISSING`）。
- **`get_community_lotteries()` 不返回任何资格字段**（实测函数定义里没有 `can_join`）⇒ 客户端事前无法判断「这个人能不能报名」，这是 §5.3 必须先补的后端能力。
- 保底（`lottery_pity_progress` / `pity_mode`）是**第三个会说话的实体**：保底礼可兑换时也需要触达。本计划不含它，但仲裁器要给它留位置（§8.4）。

---

## 3. 设计原则

1. **按「活动 × 阶段」去重**，不按活动去重。
2. **上屏才计数**：入队、被淘汰、被更高优先级抢占，一律不写 `shown_at`。否则用户被开场门挡住、什么都没看见，却被永久静音。
3. **服务端为真源，本地只做缓存**：否则手机关掉、电脑再弹一次。
4. **不可逆的动作不与悔改路径共用文案**：「不再提示」必须直说永久，不能写成「稍后」。

---

## 4. 数据模型

```sql
create table public.lottery_popup_log (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lottery_id   uuid not null references public.lotteries(id) on delete cascade,
  phase        text not null check (phase in ('recruit', 'result')),
  shown_at     timestamptz,
  viewed_at    timestamptz,
  dismissed_at timestamptz,
  action       text check (action in ('decline', 'later')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, lottery_id, phase)
);

create index lottery_popup_log_user_idx on public.lottery_popup_log (user_id, updated_at desc);
```

- **主键就是唯一键**，`(user_id, lottery_id, phase)`，天然挡住重复写入。
- RLS：`select/insert/update` 只允许 `user_id = auth.uid()`；不给 `delete`（记录是审计凭据）。
- 三个时间戳的写入时机决定去重强弱：

| 字段 | 写入时机 | 效果 |
|---|---|---|
| `shown_at` | 真正显示到屏幕上（入场动画结束后仍在屏 ≥ 600ms） | 该格永久不再弹 |
| `viewed_at` | 进详情页停留 ≥ 1.5s，或从弹窗点击跳转 | 永久不再弹，且清角标未读 |
| `dismissed_at` + `action` | `decline` 永久 / `later` 7 天 | 按 action 静音 |

`shown_at` 与 `viewed_at` 是**或**关系：任一命中即静音。只写了 `shown` 没写 `viewed` 时，角标保持未读——用**非阻断的角标**承接「弹过一次但没看」，替代二次弹窗。

---

## 5. 判定规则：四道闸门

判定顺序**不可交换**，任何一道不过就返回 `null`（不弹）。

### 闸门 0 · 身份

```
if (!session) return null;
```

**未登录：两类弹窗都不给。** 理由不是「没数据」，而是**去重无处可存**：按 `user_id` 记，游客没有；按设备记，清缓存就重置，等于永久复发。而游客的「未报名」判定永远成立（他不可能报名），照弹就是每次进站都弹。

游客的触达载体是活动页页头的非阻断横幅（「登录后即可参与本期抽奖」），不消耗弹窗配额。

### 闸门 1 · 阶段

`settled` 定义：`status ∈ {drawn, closed}` 或 `drawn_at` 非空。两个阶段互斥，不可能同时成立。

### 闸门 2 · 资格（本次新增）

| 条件 | 处理 |
|---|---|
| 命中 `lottery_eligibility_exclusions`（`is_active = true`） | **P1 静默**，P0 照常 |
| `enforce_account_age_check` 且账号未满 24h | **P1 静默且不写记录**，P0 照常 |
| `max_entries` 已满 | P1 静默，不写记录 |
| `entry_deadline_at` 已过 | P1 静默 |

两条细则：

- **P0 不受资格影响**。排除名单是「不许再参加」，不是「你参加过的结果可以瞒着你」；账号未满 24h 的人也可能已经报名（规则是后来才加的）。
- **时变的失败（未满 24h、名额满）不写 `shown_at`**，到期后自然允许再判定；**固定的失败（排除名单）也不写**，因为那是「不许弹」而不是「弹过了」。

⚠️ 这一道闸门**当前无法在客户端计算**：`get_community_lotteries()` 不返回 `can_join`，排除表在 `authenticated` 侧也只对本人开放。必须先补后端（§7.2）。

### 闸门 3 · 去重

| 阶段 | 静默条件 |
|---|---|
| `recruit` | 已报名（有 entry）；或 `recruit` 格 `shown_at` / `viewed_at` / `dismissed_at` 任一非空 |
| `result` | 无 entry；或 `result` 格 `shown_at` / `viewed_at` 非空；或 `dismissed_at` 且 `now - dismissed_at < 7d` |

### 5.5 优先级：P0 结果通知 > P1 未报名提醒

**跨类不让步**——哪怕报名提醒 10 分钟后截止，也压不过结果通知。

| | P0 结果通知 | P1 未报名提醒 |
|---|---|---|
| 性质 | 已发生事实的回执 | 机会型招徕 |
| 用户投入 | 已报名，有沉没成本 | 零投入 |
| 时效 | 强（常带领奖期限） | 弱 |
| 延迟成本 | 高（用户会追问「我中了吗」） | 低（下次还能提醒，且本就只提醒一次） |

同类内排序：

1. `priority` 升序（P0 = 0）；
2. 结果通知：中奖优先于未中奖 → 再按 `drawn_at` **倒序**（最新在前）；
3. 报名提醒：2 小时内截止的提权 → 再按 `entry_deadline_at` **正序**；
4. 最后按 `lottery_id` 升序兜底（保证多端排序一致，不因接口顺序抖动换人）。

---

## 6. 判断逻辑（纯函数，可单测）

```js
export function pickLotteryPopup({ lotteries, entries, logs, now, session }) {
  if (!session?.userId) return null;                       // 闸门 0
  if (session.popupShown) return null;                      // 本会话配额
  if (now - session.lastPopupAt < 30_000) return null;      // 相邻间隔

  return lotteries
    .map((item) => candidateFor(item, entries[item.id], logs, now))
    .filter(Boolean)
    .sort(compareCandidate(now))[0] ?? null;                // 只弹一条
}

function candidateFor(item, entry, logs, now) {
  const settled = item.drawn_at || ['drawn', 'closed'].includes(item.status);

  if (settled) {
    if (!entry) return null;                                // 没参加 → 没有「你的结果」
    const log = logs[`${item.id}:result`];
    if (log?.shown_at || log?.viewed_at) return null;
    if (log?.dismissed_at && now - log.dismissed_at < 7 * 864e5) return null;
    const won = item.winner_user_id === session.userId || item.winners?.some(w => w.user_id === session.userId);
    return {
      id: item.id, phase: 'result', priority: 0, won: Boolean(won),
      eventAt: item.drawn_at ?? item.updated_at,
    };
  }

  if (item.status !== 'open') return null;                  // 闸门 1
  if (!entry && !isEligible(item, now)) return null;         // 闸门 2
  if (entry) return null;                                    // 已报名
  if (!item.entry_deadline_at || now >= Date.parse(item.entry_deadline_at)) return null;

  const log = logs[`${item.id}:recruit`];
  if (log?.shown_at || log?.viewed_at || log?.dismissed_at) return null;

  return {
    id: item.id, phase: 'recruit', priority: 1,
    deadline: Date.parse(item.entry_deadline_at),
  };
}

function isEligible(item, now) {
  if (item.excluded) return false;                          // 排除名单
  if (item.can_join === false) return false;                 // 后端算好的结论
  if (item.max_entries != null && item.entry_count >= item.max_entries) return false;
  return true;
}
```

关键分支与需求逐条对应：

- 已报名、未开奖 → 两个分支都不成立 → 静默；
- 已报名、已开奖、没看过 → 走 `result`；
- 没报名、已开奖 → 静默（不推「你没中」）；
- 报名截止、未开奖 → 静默（点进去既不能报名也没结果，是死路）；
- 弹过报名提醒仍未报名 → `shown_at` 已写 → 永不复发，只留角标。

---

## 7. 改动范围

### 7.1 前端

| 文件 | 内容 |
|---|---|
| `src/utils/lottery-popup-policy.js`（新） | §6 纯函数，与 `island-notify-policy.js` 同构（无 Vue 依赖、可直接单测） |
| `src/components/LotteryPopup/index.vue`（新） | 弹窗本体 + 三态 + 无封面降级 + 描述截断 |
| `src/utils/api/lottery-api.js` | 新增 `getLotteryPopupLogs()` / `markLotteryPopup()` 两个薄封装 |
| `src/App.vue` | 挂载仲裁器（**Teleport 到页根，不挂 body**） |

### 7.2 后端（阻塞项，必须先做）

1. **`get_community_lotteries()` 增列**：`can_join boolean` + `ineligible_reason text`（`EXCLUDED` / `ACCOUNT_TOO_NEW` / `FULL` / `DEADLINE_PASSED` / `ALREADY_ENTERED`）。判定复用 `join_community_lottery` 里那套逻辑，避免两处口径漂移——**同一套规则写两遍，第三个月必然对不上**。
2. **新表 `lottery_popup_log`** + RLS（§4）。
3. **批量读取 RPC**：`get_my_lottery_popup_logs()`，一次返回本人全部记录，进站只发一个请求。

### 7.3 展示规格

| 元素 | 规格 | 说明 |
|---|---|---|
| 卡片宽 | `min(100%, 362px)` | 手机单列可读，桌面不拉成横幅 |
| 圆角 / 遮罩 | 16px / `rgba(18,20,24,.44)`，**不做模糊** | 模糊遮罩在弱机上掉帧，还把背后内容糊成一片 |
| 头图 | 174px 高，`object-fit: cover` + 逐活动 `object-position` | 竖图（中秋 3:4）靠定位切到主体，小方图（七夕 286×276）改 `contain` |
| 无封面降级 | 米色底 + 活动标题居中，**不留空白块** | 线上 3/6 无封面，这是必走分支 |
| 奖品描述 | `-webkit-line-clamp: 2` | 库里有的描述带换行且三行以上（「可转赠，不可折现」），不截断会把按钮挤出屏幕 |
| 按钮 | 主实心 / 次描边，右对齐，主按钮在右 | 与仓库现有 confirm 弹窗一致；不可逆动作永远在左侧描边位 |
| 状态 chip | 语义色 50 底 + 800 字 | 报名=信息色，中奖=成功色，未中奖=中性色 |

---

## 8. 队列与节奏

1. **每次会话只弹 1 条**活动弹窗；落选者降级为角标，**不消耗配额**，下次进入重新评估。
2. 队列上限 3；溢出时先淘汰 `recruit`，`result` 永不淘汰（与通知岛闸门的淘汰顺序一致）。
3. 相邻两次活动弹窗 ≥ 30s。
4. **全局模态互斥顺序**：开场门 > 活动 P0 > 账号绑定引导 > 活动 P1。
   - 开场门是首屏仪式，不能被打断；
   - 绑定引导现在是「挂载后 900ms 必然弹」，等于把所有活动弹窗都提前挤掉——它应降到活动 P0 之后；
   - `useConfirmDialog` 的互斥会 **reject**，调用点必须把「被高优先级抢占」归化成「取消排队」，不能当成失败。
5. **与通知岛的边界**：岛是常驻轻提示（78px 条），弹窗是阻断式。两者不共用量表，但共享会话配额计数——同一次进站不应既弹窗又刷岛。

---

## 9. 验收与探针

新增 `scripts/probes/probe-lottery-popup.mjs`，断言必须「有牙」（找不到元素就 fail，不做跳过）：

| # | 断言 |
|---|---|
| 1 | 同一活动二次进入不再弹（`shown_at` 生效） |
| 2 | 已报名后 `recruit` 分支静默 |
| 3 | 未登录时两类弹窗都不渲染 |
| 4 | 被淘汰/被抢占的那条 `shown_at` **仍为空**（配额没被白白消耗——这是最容易悄悄退化的信号） |
| 5 | 结果通知能压过「30 秒后截止」的报名提醒 |
| 6 | 排除名单中的用户，P1 不弹、P0 照弹 |
| 7 | 无封面活动的头图位不塌陷（高度仍是 174px，无裂图图标） |
| 8 | 描述超过两行时按钮仍在视口内 |

单测 `tests/unit/lottery-popup-policy.test.js` 覆盖 §6 的 8 个分支（含闸门顺序：先身份后阶段）。

`--update` 类基线一律在**提交树**口径上做；`verify` 跑在工作区会与 CI 差几件。

---

## 10. 风险与已知坑

| 风险 | 说明 |
|---|---|
| **遮罩定位被劫持** | `position: fixed` 的祖先若有 `backdrop-filter` 或收尾的 `transform: matrix(...)`，遮罩会退化成「相对该祖先」。仓库已踩过：1440×900 只剩 1131×600 @(275,0)。必须 `Teleport` 到**页根**，且暗色覆盖前缀用 `html[data-theme=dark]`（节点已不在页根里） |
| **文字对比度** | `--muted-foreground: #7f8d9f` 在白底只有 3.38:1（< AA 4.5）。弹窗里的 11px 信息栏标签必须换 `#5a6577`(5.41) |
| **`activity_campaigns` 误用** | 表在线上是空的，写完才发现挂错表就是白干。本方案只用 `lotteries` |
| **规则两处实现** | 资格判定若前端再写一遍，必然与 RPC 漂移 → 一律由 RPC 返回 `can_join` |
| **EXIF 与体积** | 中秋封面是 3024×4032 带 GPS 的手机原图，上传端没裁剪；客户端必须裁，长期建议上传时压到 1600px 内 |
| **空态** | 当前 0 个 `open` 活动，功能上线后可能长期不弹——验收要用造数据，别等真实活动 |

---

## 11. 分批执行

| 批次 | 内容 | 可独立验收 |
|---|---|---|
| **P0** | 纯函数 `lottery-popup-policy.js` + 8 条单测（不接 UI、不接后端） | ✅ 纯减法，不动线上行为 |
| **P1** | 后端：`can_join` 增列 + 表 + RLS + 批量读 RPC | ✅ 只加字段，前端未接 |
| **P2** | 弹窗组件 + 三态 + 无封面降级（先用假数据渲染） | ✅ 视觉验收 |
| **P3** | 接入仲裁器 + 记账写入 + 探针 | ✅ 端到端 |
| **P4** | 与开场门/绑定引导/island 的互斥顺序调整 | ⚠️ 会动到既有弹窗时序，单独一轮 |

P0/P1 互不阻塞，可并行；P3 必须在 P1 之后（否则 `can_join` 拿不到）。

---

## 12. 已定 / 待决

**已定（2026-10-31）**

- 按 `(user, lottery, phase)` 去重，不按活动去重。
- P0 结果通知 > P1 未报名提醒，跨类不让步。
- 未登录两类都不弹。
- 资格闸门：排除名单 / 账号未满 24h / 名额满 / 已截止 → P1 静默，P0 不受影响。
- 每次会话只弹 1 条，落选走角标。

**待决（不阻塞 P0/P1）**

1. 「稍后」的冷静期用 7 天还是 3 天？
2. 结果通知的 `viewed_at` 停留阈值取 1.5s 是否够（详情页首屏有图片加载）？
3. 保底礼可兑换要不要也走同一仲裁器（它没有 `phase` 概念，需要扩成 `kind` 枚举）？
4. 角标落在哪个入口——导航岛、活动页 tab，还是首页卡？
