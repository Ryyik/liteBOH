# 积分兑现入口方案 V2 —— 现金兑现（points-redeem-plan）

> 2026-09-14 · 方向已定：积分兑现金（用户拍板）。本文按「风险最小化」设计。
> V1（权益兑现主推）作废，权益兑换降级为可选并行项。未改任何代码。

## 〇、口径更正（CLI 实锤）

上一版沿用了 0910 报告的旧值，**已过时**。线上 `ai_quota_config` 已手工对齐页面宣传口径（`supabase db query --linked` 实测）：

| tier | daily_token_limit |
|---|---|
| guest | 3 万 |
| free | 20 万 |
| plus | 80 万 |
| pro | 200 万 |
| max | 500 万 |
| ultra | 1000 万 |

别名 tier（boh-ai-plus 80万 / boh-pro 200万 / boh-max 500万）已同步。Edge Function `api-key-vault` 读的正是这张表 → 线上实际生效值即上表。两个推论：
1. ~~「前置修复：日 Token 口径统一」~~ **删除**，已统一。
2. 0910 报告的「单位价值倒挂」结论失效：现在每积分日 Token = Plus 10 万 = Pro 10 万 < Max 12.5 万 < Ultra 14.3 万，Pro/Plus 是单位价值最高档，与「主推 Pro」一致，不再是凹点。

## 一、合规基石：让「充值积分」天然无法套现

现金兑现在中国监管语境下的敏感点 = 变相支付结算（资金二清）。本方案用**费率折价**从结构上消除这个性质：

- **充值 1:1 买入 → 兑现 0.5 兑出**：充值 100 积分花 100 元，提现只能拿回 50 元，纯亏 50% → 无人会「充值→套现」→ 平台不构成资金退回通道。
- 因此能被提现的积分**事实上只有「赚取积分」**（签到 / 发帖活动 / 管理员奖励）→ 兑现的法律性质 = **营销激励发放**，与各类签到 App 的现金红包同型，不是支付业务。
- 红线纪律：**永远不要把兑现率提到 1.0**，也不要做「充值积分白名单兑换率 1:1」之类的功能——那一步跨过去性质就变了。

## 二、折算率与限额（全部服务端单一真相源）

**兑现率 0.5（2 积分 = 1 元）**，不是拍的——与商城实物隐含兑换率对齐：

| 商品 | 积分价 | 估算实物成本 | 隐含兑换率 |
|---|---|---|---|
| BOH 特制贴纸 | 5 | ~2–3 元 | 0.5–0.6 |
| 纪念勋章 | 16 | ~8–10 元 | 0.5–0.6 |
| BOH BAG Air | 40 | ~20–30 元 | 0.5–0.75 |

现金取 **0.5 = 商城下限**：现金永远不优于实物（用户倾向选实物，实物自带品牌传播价值），但差距不悬殊不惹恼用户。

| 参数 | 值 | 目的 |
|---|---|---|
| 兑现率 | 0.5 元/积分 | 见上 |
| 起兑 | 50 积分（= 25 元） | 挡小额高频，降低审核负担 |
| **月度上限** | **60 积分/人/月（= 30 元）** | 总敞口封顶：签到党 21.7 分/月全提也只 ~11 元，全站敞口 = 活跃数 × ≤30 元 |
| 审核制 | 全额人工 | 复用商城「申请单 + 管理员履约」既有模式 |

签到通胀结论更新：**月度上限 60 积分已把白嫖敞口封死在 30 元/月/人**，签到值 5/周 可以不动，上线后观测「兑现申请通过率 + 批量小号特征」再定是否调整。

## 三、全链路流程

```
用户端（AssetsHubPanel 兑现面板）
  填积分数量（≥50）+ 联系方式（qq/vx，复用商城约定）
    → RPC request_points_cash_redemption
        校验：登录 / 配置 is_active / 下限 / 本月已兑+本单 ≤ 60 / 余额充足
        扣分 + 流水（reason='cash_redeem'，balance_after 原子快照）
        插入 points_cash_redemptions(status='pending')
  → 申请单进入管理端
管理端（DataManagement 兑现审核面板）
  同意：线下微信红包/转账发放（截图留痕）→ 标记已支付（记录 operator_id / paid_at）
  拒绝：退回积分 + 正向流水（reason='cash_redeem_refund'）+ 拒绝原因
```

零支付 API：发放纯人工，与商城订单履约、充值人工入账同一套运营动作。

## 四、数据层（迁移 2026091401）

```sql
-- 兑现配置（单行表，service_role 可写，RPC 读 —— 真相源单一，前端只展示不传参）
points_cash_redeem_config(
  id int primary key default 1 check (id = 1),
  rate numeric(3,2) not null default 0.50,
  min_points integer not null default 50,
  monthly_cap_points integer not null default 60,
  is_active boolean not null default true
)

-- 兑现申请单
points_cash_redemptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  points_amount integer not null,        -- 扣除积分
  cash_amount numeric(10,2) not null,    -- = points_amount * rate（服务端计算）
  rate numeric(3,2) not null,            -- 成交时快照
  contact_type text not null check (contact_type in ('qq','vx')),
  contact_value text not null,
  status text not null default 'pending',  -- pending / paid / rejected
  reject_reason text,
  operator_id uuid,                        -- 审核管理员
  paid_at timestamptz,
  created_at timestamptz default now()
)
-- RLS：本人只读自己的单；写只经 RPC / service_role
```

- RPC `request_points_cash_redemption(p_points integer, p_contact_type text, p_contact_value text)`：
  rate/下限/月限全部服务端读 config 表，**不收任何价格参数**（复刻 2026091001 守卫模式）；月度用量 = `sum(points_amount) where status in ('pending','paid') and date_trunc('month', created_at) = 本月`。
- 流水 reason 新枚举：`'cash_redeem'`（扣）、`'cash_redeem_refund'`（拒绝退回）。`get_points_ledger_drift()` 天然覆盖，无需改。

## 五、入口位置

| 优先级 | 位置 | 改法 |
|---|---|---|
| **P0** | `src/views/user-center/UserSpace/components/AssetsHubPanel.vue` 积分面板 action grid | 第三卡 `is-redeem`「兑现积分」→ 兑现面板（余额、当前兑现率、起兑/月限提示、数量输入、联系方式、提交）。与「充值 / 明细」三卡对偶。 |
| P1 | `src/components/SubscriptionPlans.vue` 积分 pill | 余额 ≥ 50 时加「可兑现」角标引流到兑现面板。 |
| P2 | `src/views/Shop/index.vue` | 余额 banner（现金率 0.5 vs 实物同率的对比展示，引导选实物）。 |

## 六、管理端审核面板（P0 必做，否则申请单无人能处理）

- 落点：`src/views/DataManagement/components/` 新组件（如 `PointsRedeemConsole.vue`），注册进 `DataManagement/config/tables.js` 与侧栏（复用 `PointsGrantConsole.vue` / shop-console 模式）。
- 功能最小集：pending 单列表（用户/UID、积分、应付现金、联系方式、时间）+ 「标记已支付」（二次确认）+ 「拒绝」（必填原因，自动退分）。已处理单可查（status 筛选）。

## 七、风控清单

1. 服务端取价：rate / min / cap 只读 config 表，前端传值一律无视。
2. 人工审核 = 第一道闸：批量小号在审核端肉眼可见（同联系方式、同注册时段）。
3. 月度上限 60 积分 = 单号敞口硬顶。
4. 联系方式必须与提现收款一致（qq/vx），管理员发放前核对。
5. 流水全量 + batch 可撤销模式沿用；每笔 paid 单留 operator_id 与 paid_at。
6. 后续可选（P2）：同 IP/设备多号识别、注册时长门槛（如 ≥30 天）、账号等级门槛。
7. 合规自守（运营侧）：保持「低频、限额、人工」形态；若未来规模上去（高频/大额），需要自行评估个税申报（偶然所得）与平台资质——本方案的设计让这天的到来尽量晚。

## 八、路线图

| 阶段 | 内容 | 落点 |
|---|---|---|
| **P0a** | 迁移 `2026091401_points_cash_redemption.sql`（两张表 + RPC + RLS + 流水 reason）；dry-run → push | `supabase/migrations/` |
| **P0b** | 用户侧：AssetsHubPanel 第三卡 + 兑现面板 | `AssetsHubPanel.vue` |
| **P0c** | 管理侧：兑现审核面板 | `DataManagement/components/PointsRedeemConsole.vue`、`config/tables.js` |
| P1 | SubscriptionPlans「可兑现」角标；观测面板（兑现转化/通过率） | `SubscriptionPlans.vue` |
| P2 | 商城余额 banner；多号识别；权益兑换并行项（订阅/加油包聚合，V1 方案保留备用） | `Shop/index.vue` 等 |

## 附：现状事实底座（调研结论，仍有效）

- **流入 3 条**：周签到 +5（`submit_weekly_checkin`，≈21.7/月）；发帖有奖活动（`post_reward_campaigns` + `grant_post_publish_reward`，可配置上限）；管理员发放（`admin_grant_points`，batch 可撤销）。
- **流出 2 条**：商城实物（`/shop`，13 款 5~200 积分，`create_shop_order_with_points` → pending 人工履约）；订阅（服务端价表取价）。
- **账本闭环**：余额 `profiles.points`；流水 `points_transactions`（reason：subscription / shop_order / weekly_checkin / admin_grant / post_reward）；用户查账 = UserSpace assets tab →「方块积分 → 积分获取明细」。
- **充值 = 扫码转账 + 人工入账**（`SubscriptionPlans.vue` 弹层 sponsorQrImage + UID），无支付 API，1 元 ≈ 1 积分隐性锚定。
