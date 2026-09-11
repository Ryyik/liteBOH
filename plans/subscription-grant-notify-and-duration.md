# 订阅发放：赠送通知 + 时长选项改造方案

> 调研日期：2026-09-11 · 范围：数据管理面板「订阅发放」与用户消息中心
> 结论先行：两个改进都不需要动表结构（不加列、不改 RLS），1 个 SQL 迁移 + 3 个前端文件即可完成。

---

## 一、现状调研

### 1.1 订阅发放链路（数据管理面板）

| 层 | 文件 | 说明 |
|---|---|---|
| UI | `src/views/DataManagement/components/SubscriptionGrantConsole.vue` | 订阅发放控制台：全部/指定用户、层级、周期、月数、起止时间、跳过策略、批次记录 |
| API | `src/utils/api/subscription-admin-api.js` → `grantSubscriptions()` | 透传到 RPC `admin_batch_grant_subscriptions` |
| DB | `supabase/migrations/2026082603_admin_subscription_grant.sql`（+02604/02607 补参数） | security definer RPC，批量插 `user_subscriptions`，带 `batch_id` |

**关键发现：**
1. **发放成功后对用户零通知**——`submitGrant()` 只更新管理面板内的 message 提示，用户完全无感知。
2. RPC 最新签名（02607）共 12 参：`p_user_ids, p_plan_code, p_plan_name, p_billing_cycle, p_points_cost, p_duration_months, p_started_at, p_expires_at, p_status, p_metadata, p_skip_existing, p_skip_any_tier`。
3. 到期时间逻辑：`v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(months => p_duration_months))` —— **显式 `p_expires_at` 优先级最高**。
4. 时长 UI 仅「月付/年付 + 整数月数（1–120）」，`duration_months` 是唯一时长记录字段；`user_subscriptions.metadata` 是现成的 `jsonb` 列（当前发放传 `'{}'`）。
5. `p_duration_months` 校验为 `1–120 整数`，无法表达 7 天。

### 1.2 通知中心链路

| 层 | 文件 | 说明 |
|---|---|---|
| 表 | `notifications`（`recipient_id, sender_id, type, post_id, comment_id, status, created_at` + 后加的 `content` / `archived_at`） | type 为自由 text，无 CHECK 约束 |
| 服务端先例 | `2026081904_lottery_dynamic_pity_rewards.sql:224` | **抽奖 RPC 内直接 insert 通知**：`insert into notifications (recipient_id, sender_id, type, status, content) values (..., auth.uid(), 'lottery_win', 'unread', v_content)` |
| 客户端 API | `src/utils/api/notifications-api.js` → `createNotification()` / `subscribeToNotifications()` | 前端 insert + 实时 INSERT 监听（push 到在线用户） |
| 消息中心 UI | `src/views/user-center/Messages/index.vue` | tab 白名单 + 类型标签/标题/预览映射 |
| 管理端筛选 | `src/views/DataManagement/config/fields.js` → `NOTIFICATION_TYPE_OPTIONS` | 管理员「通知管理」tab 的类型选项 |

**关键发现：**
1. 消息中心「系统」tab 的类型白名单有两处，需要同步：
   - `isSystemNotificationType()`（`index.vue:895`）：`['system','gift','lottery_win','post_rejected','post_report_limited','comment_rejected']`
   - `archiveCurrentTabMessages` 的 targetType（`index.vue:1707`）：同一组值
2. 未读数走 `get_unread_notification_count` RPC，按 `status='unread'` 统计，**新类型自动计入**，无需改动。
3. Realtime：`notifications` 表 INSERT 即实时推送（`subscribeToNotifications`），**用户在线会立即收到，零额外开发**。
4. Pushplus 推送白名单仅 `like/comment/impression/repost`——新类型默认不外推，符合预期，无需处理。
5. `filterSelfActionNotifications` 只过滤 like/comment 自操作，`sender_id=null` 不受影响。
6. `fields.js` 的 `NOTIFICATION_TYPE_OPTIONS` 目前没有 subscription 选项。

---

## 二、改进点 1：发放会员自动触发通知

### 2.1 触发位置决策

| 方案 | 评估 |
|---|---|
| **A. RPC 内 insert（推荐）** | 与发放同事务、原子一致；全站批量（几百用户）一条 SQL 搞定；有抽奖先例；被 skip 的用户天然不插行→不误发 |
| B. 前端循环 `createNotification()` | 批量发放需 N 次往返；发放成功但通知失败会出现状态不一致；不采纳 |

### 2.2 SQL 迁移（新文件）

新建 `supabase/migrations/2026091101_admin_grant_subscription_notify.sql`：

1. `create or replace function public.admin_batch_grant_subscriptions(...)`，签名 = 02607 全量 12 参 + **末尾追加 `p_notify boolean default true`**（追加参数保持向后兼容，旧调用不传默认发通知）。
2. 在现有 `insert into user_subscriptions ... select ...` 与 `get diagnostics` 之间，插入通知写入（仅对 status='active' 生效）：

```sql
if p_status = 'active' and p_notify then
  insert into public.notifications (recipient_id, sender_id, type, status, content)
  select s.user_id,
         auth.uid(),
         'subscription',
         'unread',
         '您已获得' || p_plan_name || '订阅，有效期至 '
           || to_char(v_expires_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
  from public.user_subscriptions s
  where s.batch_id = v_batch_id;
end if;
```

**文案规则（与需求一致）：`您已获得[层级名称]订阅，有效期至[YYYY-MM-DD HH24:MI]`**
- `[层级名称]` 用表单展示名 `p_plan_name`（如 Pro / Coding Plus）。
- 时间统一转 `Asia/Shanghai` 后格式化，避免服务器 UTC 显示成 8 小时差。
- `status='active'` 才发（发 expired/cancelled 没有意义）；撤销订阅不发通知（如需「订阅已撤销」通知列为后续可选项）。

3. 同迁移内 `recreate` 授权：`revoke all ... from public; grant execute ... to authenticated, service_role;`，末尾 `notify pgrst, 'reload schema';`。

### 2.3 消息中心展示（`src/views/user-center/Messages/index.vue`，4 处小改）

1. **常量**（`index.vue:587` 旁）：`const SUBSCRIPTION_NOTIFICATION_TYPE = 'subscription';`
2. **白名单两处同步**：
   - `isSystemNotificationType()`（`index.vue:895`）数组加入 `SUBSCRIPTION_NOTIFICATION_TYPE`
   - `archiveCurrentTabMessages` targetType（`index.vue:1707`）同步加入
3. **文案映射**（`index.vue:2233–2291`）：
   - `getTypeLabel`：`[SUBSCRIPTION_NOTIFICATION_TYPE]: '订阅通知'`
   - `getNotificationTypeLabel`：`'订阅通知'`
   - `getNotificationTitle`：`case SUBSCRIPTION_NOTIFICATION_TYPE: return '您已获得订阅权益';`
   - `getNotificationPreview`：新增 `if (notification.type === SUBSCRIPTION_NOTIFICATION_TYPE) return notification.content || '查看您的订阅详情';`（其余 system 类已有该模式）
   - `getNotificationSummary` 无需改（非 social 类型已直出 `content`）
4. **标签配色**（`src/views/user-center/Messages/style.scoped.css`）：按 `x-t-lottery_win` 等现有样式补一条 `.x-t-subscription`（建议品牌蓝/紫金任一现成色 token）。

### 2.4 管理端类型筛选（`src/views/DataManagement/config/fields.js`）

`NOTIFICATION_TYPE_OPTIONS`（`fields.js:205`）增加 `{ value: 'subscription', label: '订阅' }`——管理员「通知管理」tab 即可按类型筛出订阅通知。

### 2.5 用户侧体验（无需开发，自动获得）

- 在线：realtime INSERT → 消息中心/未读徽标实时 +1。
- 离线：下次登录消息中心「系统」tab 可见；未读数计入导航岛「N 条未读·全部已读」链路（`ensureNotificationStore` 既有逻辑）。

---

## 三、改进点 2：赠送时长选项增强

### 3.1 设计决策

| 方案 | 评估 |
|---|---|
| **A. RPC 加 `p_duration_days` + metadata 存真值（推荐）** | 时长真相源仍单点在 RPC；批次记录可精确显示「7 天」；不动表结构 |
| B. 前端算好 `expires_at` 直接传显式值 | 零迁移，但 `duration_months` 会被迫写折算值（7 天→记 1 个月），批次列表文案失真，违背「真相源单一」 |

### 3.2 SQL 迁移（并入 2026091101 同一文件）

`admin_batch_grant_subscriptions` 在 2.2 基础上再追加参数 `p_duration_days integer default 0`（追加到签名末尾，兼容旧调用），内部逻辑：

```sql
-- 时长解析优先级：显式 p_expires_at > 天数 > 月数（现有 coalesce 行为不变）
if coalesce(p_duration_days, 0) > 0 then
  if coalesce(p_duration_days, 0) > 3650 then
    raise exception '赠送天数不能超过 3650';
  end if;
  v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(days => p_duration_days));
  v_duration_months := 0;  -- 月数语义让位，真实天数进 metadata
  v_metadata := coalesce(p_metadata, '{}'::jsonb)
                || jsonb_build_object('duration_days', p_duration_days);
else
  v_expires_at := coalesce(p_expires_at, v_started_at + make_interval(months => p_duration_months));
end if;
```

- `duration_months` 列写 0：**实施前先 `supabase db push --dry-run` / 查该列 CHECK 约束**；若列约束为 `>= 1`，则写 1 并以 `metadata.duration_days` 为展示真相源（读方以 metadata 优先）。
- `admin_list_subscription_grant_batches` 的批次聚合（02603 第 197–213 行）补一项 `min(metadata->>'duration_days') as duration_days`，返回体加 `duration_days` 字段。

### 3.3 发放 UI 改造（`SubscriptionGrantConsole.vue`）

**替换**现有「订阅周期（月付/年付）+ 订阅月数」两个字段为「赠送时长」组合（`grant-fields` 网格内跨 2 列）：

1. **快捷时长芯片组**（醒目大按钮，替代藏在小下拉里的月数输入）：

```
[ 1 周 ]  [ 1 个月 ]  [ 3 个月 ]  [ 1 年 ]  [ 自定义 ]
```

| 芯片 | 传参 |
|---|---|
| 1 周 | `duration_days=7` |
| 1 个月 | `duration_months=1`（维持现状语义） |
| 3 个月 | `duration_months=3` |
| 1 年 | `duration_months=12` |
| 自定义 | 展开数值输入 + 单位切换（天/月），天→`duration_days`，月→`duration_months`（1–120 照旧） |

2. **联动逻辑**（复用/扩展现有 `computeExpiresAt`，`SubscriptionGrantConsole.vue:386`）：选芯片或改自定义值后重算 `expiresAt` 展示（天数分支用 `+7 days` 等直接加）；手动改「到期时间」仍可覆盖（沿用 `expiresAtTouched` 机制）。
3. **摘要行**（`grant-summary`，133 行）与确认弹窗文案同步：天数模式显示「赠送 7 天（至 X 到期）」而非「月付 N 个月」。
4. 样式沿用本组件 scoped 的 `grant-mode-switch` 芯片风格（胶囊 + is-active），无需引外部样式；响应式按项目规则写进本组件自己的 scoped media。

### 3.4 API 层与批次展示

1. `subscription-admin-api.js` → `grantSubscriptions()`：新增透传 `durationDays = 0` → `p_duration_days`。
2. `SubscriptionGrantConsole.vue` 批次卡片 `grant-batch-sub`（201 行）：`batch.durationDays > 0` 时显示「赠送 X 天」，否则维持「月付/年付 N 个月」。
3. `SubscriptionEditModal.vue`（编辑已有订阅）：若该条 `duration_months=0` 且 metadata 有 `duration_days`，编辑面板回显天数并保持原语义保存（低优先，P2，不阻塞上线）。

---

## 四、实施顺序与验收

| 优先级 | 事项 | 落点 |
|---|---|---|
| P0-1 | SQL 迁移：RPC 加 `p_notify` + `p_duration_days` + 通知 insert + 批次聚合补 duration_days | `supabase/migrations/2026091101_admin_grant_subscription_notify.sql` |
| P0-2 | API 透传 `durationDays` | `subscription-admin-api.js` |
| P0-3 | 消息中心 subscription 类型接入（白名单×2 + 文案映射 + 标签配色） | `Messages/index.vue`、`Messages/style.scoped.css` |
| P1-1 | 发放 UI 快捷时长芯片组 + 自定义天数 + 摘要/确认文案 | `SubscriptionGrantConsole.vue` |
| P1-2 | 批次记录「赠送 X 天」展示 | `SubscriptionGrantConsole.vue` |
| P2 | 管理端通知筛选加「订阅」；编辑弹窗天数兼容 | `fields.js`、`SubscriptionEditModal.vue` |

**验收清单：**
1. 指定用户赠送 Pro × 7 天 → 该用户消息中心「系统」tab 出现「订阅通知」，正文为「您已获得Pro订阅，有效期至 YYYY-MM-DD HH24:MI」（北京时间）；在线时实时弹出、未读徽标 +1。
2. 全部用户批量发放 + 勾选跳过 → 仅实际插入订阅的用户收到通知，被跳过者无通知。
3. 发放 `status=expired/cancelled` → 不产生通知。
4. 撤销单条/批次 → 不产生通知（行为与现状一致）。
5. 1 周/1 个月/1 年/自定义 90 天各发一次 → 批次记录分别显示「赠送 7 天 / 月付 1 个月 / 年付 12 个月 / 赠送 90 天」，到期时间正确。
6. 旧调用方（积分兑换 `subscribe_with_points` 等）不受影响：RPC 新参数均有默认值。
7. `npx supabase db push --dry-run` 先行，确认无迁移占用与约束冲突（0901/0909 教训）。

**风险与兜底：**
- `duration_months=0` 若撞 CHECK 约束 → 兜底写 1，展示层以 `metadata.duration_days` 优先（方案 3.2 已内置）。
- 通知 insert 若因列缺失报错（线上表缺 `content` 列的极端情况）→ 迁移里对 `notifications.content` 先做 `add column if not exists content text`（与抽奖迁移同款防御）。
- 迁移采用 `create or replace`，回滚 = 重新 create or replace 回 02607 版本签名即可。
