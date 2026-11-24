# 046 — 订阅档位合并：Plus 并入 Pro（4 档制）

> **定稿（2026-11-24 用户逐条确认，四条全按推荐）：**
> 1. 合并后 Pro **权益取现 Pro 全套不动**，只改价：月 20 → **15**，年付 **150**。Max / Ultra 承诺一字不改。
> 2. 现有 23 个活跃 Plus 用户 **免费升 Pro 至原到期日**，不追差价、不补积分。
> 3. 免费档 **plan_code 保持 `free`**，只把显示名改成 `Standard`。
> 4. 昵称色三档：**Pro = 银 / Max = 金 / Ultra = 虹**（蓝从昵称体系退场）。
>
> 一句话方案：**不删档、不搬数据，靠已有的别名归一表把 `plus` 折到 `pro`**——历史行保留"当初花 8 积分买 Plus"的台账事实。

## 0. 现状（实测 2026-11-24）

### 0.1 线上存量：合并影响 37% 的付费用户

| 结论 | 判据 | 实测值 |
| --- | --- | --- |
| plus 活跃 23 人 / pro 31 / max 6 / ultra 2，合计 62 | `select plan_code,status,count(*) from user_subscriptions group by 1,2` | plus 23 active + 1 expired；pro 32 行 / 31 人；max 8 行 / 6 人；ultra 3 行 / 2 人 |
| `user_subscriptions.plan_code` **无 CHECK 约束** | `grep -rn "plan_code" supabase/migrations/*.sql \| grep -i check` | 无匹配 ⇒ 迁移不需要动表结构 |
| 头像框有 1 个 `tier='plus'` | `select tier,count(*) from avatar_frames group by 1` | free 4 / **plus 1** / ultra 2 / limit 1 |

### 0.2 档位序被复制了 24 处

| 结论 | 判据 | 实测值 |
| --- | --- | --- |
| 前端档位序有 6 份独立实现 | `grep -rn "TIER_RANK\|TIER_ORDER\|NEXT_TIER" src supabase/functions` | 6 份（见 §0.3） |
| SQL 里内联 `when 'ultra' then N` 阶梯出现在 18 个迁移 | `grep -rl "when 'ultra'" supabase/migrations \| wc -l` | 18 |
| 含 `ultra` 的迁移 / 全仓源文件 | `grep -rl ultra supabase/migrations \| wc -l`；`grep -rl ultra src tests scripts supabase \| wc -l` | 33 / 71 |

### 0.3 六个前端档位序落点（本次必须收敛，不是各改一遍）

| 文件 | 行 | 现状 |
| --- | --- | --- |
| `src/utils/subscription-benefits.js` | 243 | `resolveHighestTierCode` 内联 `TIER_ORDER` |
| `src/components/SubscriptionPlans.vue` | 674 | `TIER_RANK` |
| `src/composables/useAvatarFrame.js` | 119 | `TIER_RANK` |
| `src/composables/useLabQuota.js` | 95 | `getNextTier` 内联 map |
| `src/utils/photo-albums/quota.js` | 37 | `NEXT_TIER_MAP` |
| `supabase/functions/api-key-vault/index.ts` | 2119 | `TIER_RANK`（guest 0 … ultra 5） |

另有 4 份**数值表**重复：`photo-albums/quota.js` 三张 enforcement MAP、`useLabQuota.js` `TIER_QUOTA_MAP`、`AssetsHubPanel.vue:615` 内联 Cloud+ MAP、`AiQuotaConfigConsole` 档位标签表。

### 0.4 已知的过期基线（P0 必须先确认）

`scripts/probes/probe-subscription-benefits.mjs` 仍断言 **C2「四个附加包」** 与实验室行，而 Coding 附加包 2026-10-20 已下线（`plans/030`）、实验室 2026-10-19 退场。该探针当前**可能本来就是红的**，动手前必须先跑无改动基线，否则无法区分回归与新红。

## 1. 目标曲线（唯一真源）

所有层从这张表派生，任何数字不得在别处再写一份。

| 维度 | Standard (`free`) | Pro | Max | Ultra |
| --- | --- | --- | --- | --- |
| 月价 / 年付积分 | 0 | **15 / 150** | 40 / 400 | 70 / 700 |
| AI 每日 token | 50 000 | 1 000 000 | 2 500 000 | 5 000 000 |
| AI 额度百分比（尺子 = **Pro 100%**） | **5%** | 100% | **250%** | **500%** |
| AI 积分折扣 | 1 | 0.9 | 0.85 | 0.8 |
| Cloud+ 张数 | 150 | 450 | 900 | 1200 |
| 影集数量 / 单集张数 / 月导出 | 1 / 12 / 2 | 5 / 40 / 10 | 10 / 60 / 20 | 不限 |
| 抽奖保底 | 不计保底 | 18 场 | 12 场 | 8 场 |
| 昵称色 | — | 银 | 金 | 虹 |
| 客服优先级 | 普通 | 普通 | 优先 | 最高 |

**可见变化（不是回归，须写进更新说明）：**
- 百分比尺子从 `PLAN_AI_TOKEN_BASELINE_TIER = 'plus'` 换成 `'pro'` ⇒ Max 625%→250%、Ultra 1250%→500%、free 13%→5%。**绝对 token 数一个没动。**
- 年付继续沿用既有硬规则「月价 × 10」（页面 `calculatePrice` 与 `subscription_plan_prices` 一致，文案「省 17%」）。
- 昵称 `.nickname-blue` 与 `.tier-plus` 失去消费者 —— 按 CSS 孤儿三步证死法确认后再删，不直接删。

## 2. 为什么走别名而不是数据回填

`normalizeSubscriptionPlanCode()` 本来就是一张别名表（`boh-ai-plus` / `boh-plus` → `plus`）。加一条 `plus → pro` 即完成合并：

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **别名收敛（采用）** | 历史行零改动，台账保留真实成交价；新旧客户端双向兼容，无发布顺序约束；23 人自动生效 | `plus` 这个字符串要长期留在归一表里（这是**明账**，加注释说明） |
| UPDATE 回填 `plus → pro` | 库里只剩 4 个 code | 32 行历史的 `points_cost=8` 变成"Pro 只要 8 积分"，破坏审计；不解决旧 PWA 发出的 `plus` 购买请求 |

配套：`subscription_plan_prices` 的 `plus` 两行置 `is_active = false`（与 coding-* 下线同款手法），**谁都别再以 8 积分买到 Pro**。

## 3. 阶段（顺序有依赖：先收敛，再改档位）

### P0 · 起点基线（不碰代码）

- 跑一次 `node scripts/probes/probe-subscription-benefits.mjs`，记录红/绿与失败项 —— 判定 §0.4 的过期范围。
- 跑 `npm run verify` 记录起点。
- **判据**：两份输出落盘存档，后续每一步都与之对比。

### P1 · 把 6 份档位序收成 1 份

`subscription-benefits.js` 新增导出：`TIER_ORDER`、`tierRank(code)`、`nextTier(code)`；`PLAN_CODE_ALIASES` 增加 `plus → pro`（同文件，与 `boh-*` 别名并列并注明「历史档位，2026-11-24 合并」）。
五个消费者改为引用：`SubscriptionPlans.vue:674`、`useAvatarFrame.js:119`、`useLabQuota.js:95`、`photo-albums/quota.js:37`；`AssetsHubPanel.vue:615` 内联 Cloud+ MAP 改为引用 `PLAN_CLOUD_IMAGE_LIMITS`。
EF 那份（`api-key-vault`）无法共享前端模块，保留但由 P5 的单测锁「与前端同序」。

- **判据**：新增单测断言「六处档位序同源」（前五处直接 import；EF 那份比对源码文本）。
- **反证**：改 `TIER_ORDER` 里任意一档的顺序，上条单测必须变红。

### P2 · SQL：一个迁移（`2026112401_subscription_tier_merge.sql`）

经 Management API 执行 + 手写 `schema_migrations`（**不直连 5432**），结尾 `notify pgrst, 'reload schema'`。

1. 新增 helper 作为 SQL 侧单一真源：
   - `boh_tier_alias(text)` —— 含 `plus → pro`；
   - `boh_tier_rank(text)` —— free 0 / pro 1 / max 2 / ultra 3。
2. 替换 18 个迁移里**活跃版本**的 case 阶梯（以最后一次 `create or replace` 为准）：`get_user_subscription_tier`（单/批）、`subscribe_with_points`、`start_subscription_trial`、`get_my_lottery_pity_status`、`lottery_pity_threshold`、`boh_cloud_image_limit_for_user`、`apply_yearly_membership_gift`、`get_ai_mode_token_multiplier`、积分卡容量。
3. `subscription_plan_prices`：plus 两行 `is_active = false`；pro 改 `15 / 150`。
4. `avatar_frames`：`update … set tier = 'pro' where tier = 'plus'`（那 1 条）。
5. `ai_quota_config`：plus 行保留但标注「历史，无新订阅可达」；pro 行数值不动。
6. **不动**：`user_subscriptions.plan_code`（无约束）、`bolek_model_configs.min_tier` 的 CHECK（实测零行在用；收紧约束属对外变更，需单独确认）。

- **判据**：迁移后只读运行 `select user_id, get_user_subscription_tier(user_id) from user_subscriptions where plan_code='plus' and status='active'` ⇒ 23 行全为 `pro`。
- **反证**：摘掉 `boh_tier_alias` 的 `plus → pro` 分支 ⇒ 23 行必须掉回 `''`。

### P3 · Edge Function `api-key-vault`

改 `TIER_RANK`、`SUBSCRIPTION_PLAN_ALIASES`、`WEB_SEARCH_DAILY_LIMIT_FALLBACKS`、`resolveUserTier` 的 if 链、`tierAllows`。
⚠️ **不碰** 同文件的 `MODE_TOKEN_MULTIPLIERS` —— 那里的 pro/max/ultra 是**模型模式 id**，不是订阅档位。
⚠️ 部署 EF 属对外行动，动手前单独确认。

- **判据**：`deno check` 过 + 部署后对 plus 用户取 `quota-status` 返回 `pro`。

### P4 · 前端数值表 + UI

- `subscription-benefits.js`：8 张 MAP 去 `plus`；`PLAN_AI_TOKEN_BASELINE_TIER = 'pro'`；`PLAN_DISPLAY_NAMES.free = 'Standard'`；`TIER_DISPLAY_LABELS.free = '标准用户'`（保持与其它档同构的口语风格）。
- `SubscriptionPlans.vue`：`plans` 数组 5 → 4；`comparisonRows` 里两行**手写档位表**（年度徽章 / 客服优先级）改成 4 列；试用仍 `planCode: 'pro'`、3 天（不变）。
- `DataManagement/config/fields.js`：`SUBSCRIPTION_PLAN_OPTIONS` 与 `BOLEK_MODEL_MIN_TIER_OPTIONS` 去 plus（注明 CHECK 仍允许历史值）。
- `AiQuotaConfigConsole.vue`、`AvatarFrameGrid.vue`、`AvatarConsole/index.vue`（档位 select 去 plus）。
- 昵称 CSS：`PostCard.vue` / `PostDetailMain.vue` 白名单数组去 plus；`.tier-plus` / `.nickname-blue` 三步证死后删除（6 个 CSS 文件涉及）。
- `useLabQuota.js` / `photo-albums/quota.js` 数值链同步（P1 已改成引用，这里只改值）。

- **判据**：订阅页只渲染 4 张卡；对比表 4 列；`npm run audit:css:orphans` 不新增孤儿。

### P5 · 测试与探针

| 对象 | 要改什么 |
| --- | --- |
| `tests/unit/subscription-benefits.test.js` | 五档 code 集合 → 四档；Cloud+ 去掉 300；保底去掉 24；百分比 13/100/250/625/1250 → 5/100/250/500；`BASELINE_TIER` 必须 `pro`；单调递增断言保留 |
| `scripts/probes/probe-subscription-benefits.mjs` | A1 卡片名 `['Plus','Pro','Max','Ultra']` → `['Pro','Max','Ultra']`；六项文案逐字；昵称行 → `—/银/金/虹`；保底行 → `—/18/12/8`；D1–D3 价格改 Pro 年付 150 / Pro 月付 15；**C2 附加包与实验室行按 P0 结论一并清理** |
| `bolek-quota-percent` / `user-tier-persist` / `avatar-frame-campaign` / `avatar-frame-sync` / `ai-mode-token-multipliers` | 去 plus 档位、改 ultra 权重、EF 与迁移字面量同步 |
| `probe-ai-billing-config.mjs` / `probe-data-admin-pages-mobile.mjs` | 内联档位加权表与 mock 值域去 plus |

- **判据**：`npm run verify` + 全部订阅相关探针全绿。
- **反证**：至少一条「撤掉 alias ⇒ 探针/单测转红」。

### P6 · 上线与存量核对

- **判据**（只读）：23 个 plus 用户全部报 `pro`；pro 31 / max 6 / ultra 2 无变化；**无一用户降级**。
- PWA 旧包风险：旧前端仍渲染 5 张卡并发送 `plan_code='plus'` ⇒ 价格行下架后服务端拒绝（**安全，但表现为"点订阅失败"**）。是否配 SW 强制更新提示 —— **待定，需用户拍板**。
- Plus 用户当月即获得 Cloud+ 300→450、AI 100%→250%、蓝名→银名、保底 24→18，需一条站内通知/更新说明。

## 4. 风险

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 18 处 SQL 阶梯漏改一处 | 某条链上 plus 仍当独立档 ⇒ 权益错发 | P2 收成 helper 后「grep 到 0 处残留 case 阶梯」作为判据 |
| 旧 PWA 发包 | 购买失败（非白嫖） | 见 P6，待定 |
| 探针基线本身已红 | 无法判断回归 | P0 强制先跑 |
| `plus` 名义档框（1 个） | 该框永久锁死（`TIER_RANK['plus']` 为 undefined） | P2 第 4 条 UPDATE 到 `pro` |
| 昵称蓝类误删 | 若仍被其它动态拼接引用会丢样式 | 按三步证死法：脚本枚举 → 非 CSS 文件查引用 → splice 式剪枝 |

## 5. 验收清单

> 状态：2026-11-24 已执行完毕（P1–P6）。下方逐条标注结果。

- [x] P0 基线存档（探针 + verify）—— 探针 41 pass / 12 fail，12 条全为 §0.4 预判的过期基线
- [x] 档位序只剩 1 份前端真源 + 1 份 EF 真源（由单测锁同序）—— `TIER_ORDER` / `TIER_RANK`，`tests/unit/subscription-tier-order-single-source.test.js` 11 条锁六处同序；**反证**：打乱 `TIER_ORDER` ⇒ 4 条转红
- [x] SQL 侧 `boh_tier_alias` / `boh_tier_rank` 唯一 —— 迁移 `2026112401` 建 helper，7 个函数改用 + 周年礼内联阶梯收编；`prosrc ilike '%''plus''%'` 现只命中 `boh_tier_alias` 自己
- [x] 23 个 Plus 用户 = `pro`（正证 + 反证各一次）—— 正证：事务内 relax 有效期后 **23/23 报 pro、regressed=0**；反证：同一事务内摘 alias ⇒ 掉回 `''` / Cloud+ 150 / 保底 0。⚠️ 首次反证是**假红**（23 行本就已过期），必须在事务内先 relax 再摘
- [x] 订阅页 4 卡 / 对比表 4 列 / 价格 15 · 150 —— 实际为 **3 张付费卡 + 4 列表格**（free 按设计不上卡，显示名 Standard），Pro 15/150、Plus 两行 `is_active=false`
- [x] 昵称三色生效，`.nickname-blue` 无消费者后已删 —— 三步证死后剪枝（含 `tier-plus` 一并清理），CSS 孤儿 349 → 348 无新增
- [x] `npm run verify` + 订阅/计费探针全绿 —— 订阅探针 **40/0**、AI 额度探针 **30/0**、单测 5234 过。⚠️ `check:important-budget` 当期红来自并行会话的 `BohDropdown.vue`（`8d597aa2`），非本计划改动
- [x] `docs/guides/PROBES.md` 订阅条目断言数更新（49 → 40）；`plans/007` / `plans/030` 的「5 档」口径加注

### 执行中新增的一条计划外修复（重要）

**.cards 网格写死 `repeat(4)` ⇒ 三卡右侧空出 294px 一整列。** A1/A2 全是读文字断言、40 条**全绿**，程序化差分也报 0 项 —— 只有截图看得见。已补 **A1b 几何断言**（量右沿留白，因为 grid 计算列数读不到），并把响应式断点从 1100 下移到 1024（三列在 900 处每列仅 229px，权益文案折行），≤1024 时第三张卡跨满整行避免孤行。**反证**：`repeat(3)` 改回 `repeat(4)` ⇒ A1b FAIL（右留白 294），其余 39 条仍绿。

### 仍未闭环的两项（需用户决定）

1. **PWA 旧包风险**（§3 P6 原文）：旧前端仍渲染 5 张卡并发送 `plan_code='plus'`，价格行下架后服务端会拒绝 —— **安全但表现为「点订阅失败」**。SW 已配 `updateViaCache: 'none'`（会尽快拿到新包），但是否再加强制更新提示需拍板。
2. **站内通知**：Plus 用户当月即获得 Cloud+ 300→450、AI 100%→250%、银名、保底 24→18，建议一条更新说明 —— 未做。