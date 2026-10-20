# 030 · BOH AI 模型体系重构：策略三档 + 模型直选 + 删 Coding 包

- **状态**：DRAFT（2026-10-20 出方案，待实施）
- **日期**：2026-10-20
- **触发**：用户口径「模型不再分模式，直接显示模型名；搭配 Cost / Balance / Intelligence 三档策略；Coding plan 下线」
- **影响面**：`bohai_model_configs` / `ai_quota_config` / `subscription_plan_prices`、`api-key-vault` EF、BOHAI 前端选择器、订阅页
- **关联**：`docs/2026-10-02-BOHAI模型倍率与积分制度审查.md`（历史倍率口径，**本文已覆盖其结论**）、`plans/024`（延迟治理，`preferAccuracyModel` 相关）

---

## 1. 一句话结论

把「模式（mode）」这一层从**产品概念**降级为**技术主键**，产品层只保留两个正交概念：
**策略（Cost / Balance / Intelligence，决定选哪个模型）** 与 **模型（用户可直接指定）**。
Coding 附加包整体下线——它把「额度加成」和「模型准入」压在同一个 plan_code 上，是本次重构里最该消除的结构性缺陷。

---

## 2. 实测现状（2026-10-20，Management API `POST /v1/projects/{ref}/database/query`）

> 判据：`select mode_id, display_name, provider, model_id, quota_multiplier, min_tier, status, max_tokens from public.bohai_model_configs order by sort_order`
> 环境说明：本机 `*.supabase.co` 的 443/REST 被中间设备按 SNI 重置（`curl`/`node` 均复现，`openssl s_client` 同主机握手成功），**Management API 与 pooler 可用**，故全部查询走 Management API。

### 2.1 线上 9 行（6 用户可见 + 2 内部 + 1 禁用）

| mode_id | display_name | provider | model_id | 倍率 | min_tier | status | max_tokens |
| --- | --- | --- | --- | ---: | --- | --- | ---: |
| `fast` | Fast | siliconflow | `THUDM/GLM-4-9B-0414` | 0.00 | guest | active | 1200 |
| `Air` | Air | zhipu | `GLM-4-Flash-250414` | 0.30 | free | active | 1600 |
| `Code` | Code | zhipu | `GLM-Z1-Flash` | 0.50 | **coding-lite** | active | 1600 |
| `Ultra` | Ultra | openrouter | `openrouter/free` | 1.00 | free | active | 1600 |
| `gemini` | Gemini | custom | `gemini-3.5-flash` | 1.50 | pro | active | 1800 |
| `38Flash` | 3.8flash | custom | `gemini-3.8-flash` | 2.00 | free | active | 1600 |
| `agent-cluster` | Caelum | siliconflow | `Qwen/Qwen3-8B` | 1.00 | max | **disabled** | 1600 |
| `moderation-text` | 审核·文本 | custom | `gemini-3.5-flash` | 0.10 | free | active | 256 |
| `moderation-image` | 审核·图片 | custom | `gemini-3.5-flash-lite` | 0.10 | free | active | 256 |

### 2.2 额度现状

| tier | daily_token_limit | web_search_daily_limit | points_multiplier |
| --- | ---: | ---: | ---: |
| guest | 30,000 | 0 | 1.00 |
| **free** | **0** | 10 | 1.00 |
| plus | 400,000 | 30 | 0.95 |
| pro | 1,000,000 | 60 | 0.90 |
| max | 2,500,000 | 120 | 0.85 |
| ultra | 5,000,000 | 240 | 0.80 |

（另有 `boh-ai-plus` 800k / `boh-pro` 2M / `boh-max` 5M 三行**历史死数据**，`resolveUserTier` 永不产出，不动。）

### 2.3 计费开关

```json
{ "enabled": true, "rate_tokens_per_point": 500000, "daily_points_burn_cap": 20 }
```

### 2.4 Coding 包存量：**零**

判据：`select plan_code, count(*) from public.user_subscriptions where plan_code like 'coding-%' group by plan_code` → `[]`
⇒ **删除无需善后**（退款/折算/到期保留都不需要）。

### 2.5 `api_key_vault` 现有密钥（决定哪些模型能真调）

| provider | purpose | label |
| --- | --- | --- |
| `siliconflow` | chat | SiliconFlow Chat |
| `zhipu` | chat | 智谱 GLM Chat |
| `openrouter` | chat | OpenRouter Chat |
| `custom` | chat | gemini |
| `custom` | default | botcf |

⇒ 6 个用户可见模型的 provider 密钥**全部齐备**。

### 2.6 🔴 已实测的缺陷：`get_ai_mode_token_multiplier` 丢失 `security definer`

判据 1：`select prosecdef from pg_proc where proname='get_ai_mode_token_multiplier'` → `false`（owner = `postgres`）
判据 2（角色模拟，只读，已 rollback）：`begin; set local role authenticated; select get_ai_mode_token_multiplier('Air'); rollback;` → **`1`**，而正确值应为 `0.30`

成因：`2026081501` 版本带 `security definer`（并写明理由），`2026092906` 用 `create or replace` 重写时**未带该属性**，此后无迁移补回。

影响：`get_ai_mode_token_multiplier` 读 `bohai_model_configs`（RLS 仅 `current_user_is_admin()`），非管理员角色查不到行 ⇒ 回退到 `MODE_TOKEN_MULTIPLIERS` 的默认值 `1`。
**当前主链路未受影响**（EF 走 `settle_ai_token_quota`，它是 `security definer`、owner 即表 owner），但任何以 `authenticated` 角色直接调它的新代码都会静默拿到 1x。**本次一并修复。**

### 2.7 EF 用 `policy.modelId` 覆盖前端 `payload.model`

判据：`supabase/functions/api-key-vault/index.ts` 的 `buildRuntimePayload()` 写 `model: policy.modelId`，`policy` 由请求体 `mode` 查 `bohai_model_configs` 得到。
⇒ **客户端指定的模型不生效**；要换模型只能改 `mode`。这条决定了策略必须在服务端解析（见 §6）。

---

## 3. 目标形态

### 3.1 策略（`sort_order = 10`）

| mode_id | display_name | 倍率 | min_tier | 内部候选池 |
| --- | --- | ---: | --- | --- |
| `cost` | Cost | **0.45** | free | GLM4Flash 70% / GLM4 30% |
| `balance` | **Balance（默认）** | **1.10** | free | GLMZ1Flash 65% / GLM4Flash 35% |
| `intelligence` | Intelligence | **2.10** | free | Gemini3.8 40% / Gemini3.5 40% / GLMZ1 20% |

**定价依据（期望值校验）**：

- Cost 池期望 `0.7×0.5 + 0.3×0.0 = 0.35` ⇒ 定价 0.45（溢价 0.10，买"帮你选"）
- Balance 期望 `0.65×1.5 + 0.35×0.5 = 1.15` ⇒ 定价 1.10（略优惠）
- Intelligence 期望 `0.4×3.0 + 0.4×2.4 + 0.2×1.5 = 2.46` ⇒ 定价 2.10（略优惠）

> ⚠️ 原方案 Cost 定价 0.7x **算术不成立**（池上限仅 0.5x，永远达不到定价），已下调为 0.45。

### 3.2 模型（`sort_order = 100`）

| mode_id（**不改**） | 新 display_name | 倍率 | min_tier（改后） |
| --- | --- | ---: | --- |
| `fast` | GLM4 | 0.00 | **guest**（唯一对游客开放） |
| `Air` | GLM4Flash | 0.50 | free |
| `Ultra` | Openrouter | **1.20** | free |
| `Code` | GLMZ1Flash | **1.50** | free ← 原 `coding-lite` |
| `gemini` | Gemini3.5Flash | **2.40** | free ← 原 `pro` |
| `38Flash` | Gemini3.8Flash | **3.00** | free |

**`Openrouter` 不进任何策略池**：`openrouter/free` 本身就是随机免费池（可能挑到 Llama 3.2 3B），再叠一层策略随机等于双重不确定，属产品质量事故而非概率问题。

### 3.3 额度调整

| tier | 改动 |
| --- | --- |
| **free** | `0` → **50,000**（注册即可用；订阅页由 `—` 变为 12.5%，需同步文案） |
| guest | **不动**（30,000）。GLM4 倍率 0.0 ⇒ `billed = ceil(tokens×0) = 0`，额度自然不消耗，它是"将来 GLM4 若改非 0 倍率"的安全网 |
| 其余 | 不动 |

### 3.4 游客策略

- **只能选 GLM4**（其余全部灰掉并提示"该模型登录后可使用"）
- GLM4 为 0.0x ⇒ 游客**零成本**
- 游客限制走**次数**而非 token（token 额度对其无效）：
  `checkRateLimitDb('ai_guest_daily:' + ip, 100, 86_400_000)`，超出返回"登录后可继续使用"
- 现有 IP 级 `ai_chat_rt:guest:<ip>` 10 次/分钟**保留**

### 3.5 随机：按天固定（方案 3）

```js
seed = hash(BEIJING_DATE + ':' + (userId || 'guest:ip') + ':' + strategyId)
```

- **不需要存储**：同一天同用户同策略恒定选中同一模型
- 比"按会话固定"更稳：避免同一用户当天三次提问拿到三个模型
- `/compress` **不重掷**（其语义是压缩上下文，不是换模型）
- 游客种子必须含 IP，否则所有游客落到同一个模型

### 3.6 UI

- **单一列表，不分组**，策略在前、模型在后（靠 `sort_order` 实现）
- 策略区与模型区之间加 **1px 分隔线**
- 策略行带**副标题**（解"Cost 和 GLM4Flash 有什么区别"的困惑）
- 游客看到的锁定项：置灰 + 点击提示

---

## 4. 决策记录

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | Auto 是否保留 | **取消**。三档策略已覆盖成本/质量光谱，Auto 与之重复 |
| D2 | 策略倍率怎么收 | **A：改 EF**，服务端解析。B（按模型浮动）做不到"策略独立定价"，C（绑固定模型）丢掉随机 |
| D3 | 策略落点 | **做成 `bohai_model_configs` 的行**，不新建策略表 —— 结算按 `mode_id` 查行，倍率天然一致，无需"传递倍率"改造 |
| D4 | 随机粒度 | **按天固定**（§3.5） |
| D5 | `/compress` 是否重掷 | **否** |
| D6 | 游客可用范围 | **仅 GLM4** |
| D7 | 游客限额方式 | **次数**（100 次/天/IP），非 token |
| D8 | free 额度 | **0 → 50,000** |
| D9 | Coding plan | **整体删除**（零存量） |
| D10 | `mode_id` 大小写 | **本次不改**，避免 `ai_quota_log` 历史脱节与 localStorage 失效；统计侧记得 `lower()` |
| D11 | 列表分组 | **不分组**，靠分隔线 + 副标题 |

---

## 5. 删除清单（Coding plan）

### 5.1 数据库

- `subscription_plan_prices` 里 8 行 `coding-*` → `is_active = false`（**保留行**，留审计痕迹，不物理删）
- `RPC subscribe_coding_pack_with_points` → `revoke`（保留定义，避免破坏历史调用方；如后续确认零调用可再 drop）
- `bohai_model_configs.min_tier` 约束：去掉 4 个 `coding-*` 合法值

### 5.2 Edge Function

- 删 `CODING_PLAN_BONUSES` / `CODING_PLAN_RANK` / `getCodingPlanRank` / `sumCodingBonuses`
- 删 `resolveRuntimeModelPolicy` 里的 `codingRank !== undefined` 分支
- 删 `checkTokenQuota` / `handleQuotaStatus` 里的 `sumCodingBonuses` 调用与 `bonusTokens` 计算

### 5.3 前端

| 文件 | 改动 |
| --- | --- |
| `src/utils/subscription-benefits.js` | 删 `CODING_PACKS`、`resolvePackQuotaPercent`；`free: 0 → 50000` |
| `src/components/SubscriptionPlans.vue` | 删包卡片区块（`:232` `v-for="pack in codingPacks"`）与购买入口 |
| `src/utils/api/subscription-api.js` | 删 `subscribe_coding_pack_with_points` 调用 |
| `src/utils/ai-quota-display.js` | 删 `packPercent` / `packLabel` 分支 |
| `src/utils/api/ai-quota-admin-api.js` | 删 `coding-*` 列表 |
| `src/views/DataManagement/config/fields.js` | 删 8 处 `coding-*` 标签 |
| `src/views/DataManagement/config/saveStrategies.js` | 删 `coding-*` 白名单 |
| `src/views/DataManagement/components/AiQuotaConfigConsole.vue` | 删包名映射 |
| `tests/unit/ai-coding-pack-bonus-parity.test.js` | **整体删除**（它锁的就是前后端两处 tokenBonus 一致，源已不存在） |

---

## 6. EF 改动（第二阶段，需部署确认）

### 6.1 第一阶段：零 EF 改动（**先上线验证**）

策略先**固定绑定**单模型，验证「策略行能被选中 + 倍率按策略扣 + 结算一致」：

```sql
-- cost → GLM-4-Flash-250414；balance → GLM-Z1-Flash；intelligence → gemini-3.8-flash
```

此时策略就是普通行，`list_public_bohai_modes` 自动返回，前端零改动即可选中。

### 6.2 第二阶段：加随机（需部署 `supabase functions deploy api-key-vault`）

```sql
alter table public.bohai_model_configs
  add column if not exists strategy_candidates jsonb;
```

`resolveRuntimeModelPolicy` 查到行后追加：

```ts
if (Array.isArray(row.strategy_candidates) && row.strategy_candidates.length) {
  const seedKey = [
    beijingDateKey(),                       // YYYY-MM-DD, Asia/Shanghai
    userId || `guest:${ip}`,
    normalizeModeId(row.mode_id),
  ].join(':');
  const target = pickBySeed(row.strategy_candidates, seedKey);   // 加权 + 确定性
  return {
    ...policy,
    provider: target.provider,
    modelId: target.model_id,
    apiUrl: target.api_url,
    maxTokens: target.max_tokens,
    quotaMultiplier: policy.quotaMultiplier,   // ← 保留策略倍率，这是本方案的核心
  };
}
```

⚠️ 此时 `policy.mode` 仍是策略的 `mode_id`，所以 `settle_ai_token_quota` 与 `get_ai_mode_token_multiplier` 都按**策略行**查倍率 ⇒ 预扣与结算自动一致。

---

## 7. 前端改动

### 7.1 默认模式

```js
// chat-engine-config.js
export const BOH_DEFAULT_MODE_ID = 'balance';
```

⚠️ **游客必须回落 `fast`**。`resolveInitialModeId()` 是同步的、拿不到登录态，需在壳层补一层校正：

```js
// useBohShell.js —— 与现有登出 watch 同一处收口
watch(() => authStore.isLoggedIn, (loggedIn) => {
  if (!loggedIn && currentModeId.value !== 'fast') currentModeId.value = 'fast';
}, { immediate: true });
```

`filteredChatModes` 当前硬编码 `m.id === 'fast'`，**保持不动**（语义已从"游客只能用 fast"变成"游客只能用 GLM4"，恰好一致）。

### 7.2 灰态与提示

- `boh-mm-item` 新增 `is-locked` 态（现只有 `:hover` / `.is-on`）
- 锁定时点击不切换 + 提示「该模型登录后可使用」+ 前往登录
- 判断依据：`mode.minTier === 'guest'` vs `authStore.isLoggedIn`
  ⚠️ 前端目前**拿不到用户档位**（`quota-status` 返回了 `tier`，但只存进 `todayTokenUsage`）。本次只需区分"游客/已登录"，用 `isLoggedIn` 即可，**不需要拉 tier**

### 7.3 分隔线与副标题

- 策略行与模型行之间插 `.boh-mm-divider`（1px）
- 策略行补 `description` 副标题（数据已存在，`boh-mm-detail` 的 hover 卡已消费该字段）

---

## 8. 自证清单

| 项 | 判据 |
| --- | --- |
| 迁移可回滚 | 每个 migration 末尾附 `-- 回滚：` 段，写明反向 SQL |
| 倍率生效 | `select get_ai_mode_token_multiplier('cost')` → `0.45` |
| 结算一致 | 跑 1 次 Cost 请求后 `select mode, total_tokens, billed_tokens from ai_quota_log order by created_at desc limit 1`，`billed/total ≈ 0.45` |
| security definer 已修 | `select prosecdef from pg_proc where proname='get_ai_mode_token_multiplier'` → `true` |
| Coding 包已下线 | `select count(*) from subscription_plan_prices where plan_code like 'coding-%' and is_active` → `0` |
| 前端 | `npm run probe:ai-panels` + `node scripts/probes/probe-bohai-composer.mjs`（32） |
| 生成参数门禁 | `npm run check:bohai-params` |
| 全量 | `npm run verify` |

---

## 9. 风险与未决

| 风险 | 说明 | 处置 |
| --- | --- | --- |
| **游客成本敞口** | 游客 + 2.1x 在旧方案下是敞口；新方案游客只用 GLM4（0.0x）⇒ **已消除** | —— |
| **GLM4 改为非 0 倍率时** | guest 额度 30k 会自动生效 | 无需动作 |
| **`free` 额度 0→50k 的展示副作用** | 订阅页 `free` 由 `—` 变 `12.5%` | 需同步文案，**待确认** |
| **`38Flash` 3.0x 但 `min_tier=free`** | 旧方案下属"最贵却免费"；新方案游客只能用 GLM4，**登录后全开是既定口径** | 不改 |
| **Gemini 反代可达性** | 本机 `curl` 到 `boh-gemini-proxy.*` 超时，但本机 `*.supabase.co` 亦被重置 ⇒ **不能作为证据** | **待人工确认** |
| **`mode_id` 大小写混用** | `Air`/`Code`/`Ultra`/`38Flash` vs `fast`/`gemini`；EF 用 `ilike` 查、唯一约束精确匹配 | D10：本次不改；建议后续加 `unique index on (lower(trim(mode_id)))` |
| **`preferAccuracyModel` 与计费脱节** | `useChatEngine.js:1599` 会切 plan 模型但 `mode` 仍是当前值；实测被 EF 的 `policy.modelId` 覆盖 ⇒ **该分支实际不生效** | 本次不动，但在 `plans/024` 侧标注；删策略重构后再评估是否移除该死代码 |
| **管理员模式列表变长** | 9 行 + 3 策略 = 12 行 | 可接受 |

---

## 10. 实施顺序

```
阶段 0  修 get_ai_mode_token_multiplier 的 security definer        （独立迁移，先合）
阶段 1  数据：改 display_name / 倍率 / min_tier / sort_order + 3 个策略行（固定绑定）
阶段 2  数据：free 额度 0 → 50k
阶段 3  删 Coding 包（DB → EF → 前端 → 删 parity 测试）
阶段 4  前端：默认模式、灰态、分隔线、副标题
阶段 5  验证阶段 1 的倍率是否按预期生效（接真实请求，查 ai_quota_log）
阶段 6  加 strategy_candidates + 按天哈希（需部署 EF）
```

阶段 1–4 全部**不需要部署 EF**，可先上线；阶段 6 才需要。

---

## 11. 附：会话中确认为"不必做"的项

- ❌ 小模型给请求打复杂度分（零成本场景下纯延迟支出）
- ❌ 代码静态分析 / 依赖图谱（面向普通用户的社区站，无仓库可分析）
- ❌ 每轮重新路由（无 prompt caching，换模型要重发全部 system prompt）
- ❌ 新建策略表（策略做成 `bohai_model_configs` 行即可，见 D3）
- ❌ 删 `mode_id`（仍是主键 + 计费日志关联键 + 审核前缀隔离依据）
