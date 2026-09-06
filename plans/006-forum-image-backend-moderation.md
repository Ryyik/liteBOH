# 006 论坛图片后端审核方案（Supabase Free 限额友好）

> 目标：把图片审核从"仅客户端 nsfwjs 预审"升级为后端权威审核，同时不突破 Supabase Free 限额、外部 API 成本可忽略。
> 前置：文本审核已经是后端队列模式（forum-async-worker + SiliconFlow Qwen），本方案是同一模式的图片分支。

## 一、核心思路：不跑模型，借算力

Supabase Free 的 Edge Functions 限制（官方文档核实）：

| 项目 | Free 限额 | 对本方案的影响 |
|---|---|---|
| 调用次数 | 50 万次/月 | 每帖仅 +2 次调用，绰绰有余 |
| CPU 时间 | **2s/请求** | ❌ 不能在函数里跑任何 ML 推理 |
| 墙钟时间 | 150s | ✅ fetch 外部 API 是异步 I/O，不占 CPU，12s 超时绰绰有余 |
| 数据库 | 500MB | 任务行极小（<1KB/条），加定期清理 |
| 带宽 | 5GB/月 | ✅ **图片不经过 Supabase**，URL 直传视觉 API |

→ 结论：**Edge Function 只做"调度 + 调外部视觉 API"**，图像理解全部外包给 SiliconFlow。

外部 API 选型（价格已核实）：
- **Qwen2.5-VL-7B-Instruct：$0.05/百万 token（≈¥0.36/M）** ← 推荐
- Qwen2.5-VL-72B：¥4.13/M（误判率更低，作为难例二次复检备选）

成本测算：单帖 4 图 + prompt ≈ 2~4K token ≈ **¥0.001~0.0015/帖**。按月发帖 1 万帖算，月成本 ≈ ¥10~15；现在这个量级基本等于免费。

## 二、三层过滤架构

```
发帖（带图）
   │
   ▼
[L1] 客户端 nsfwjs 预审（保留现状）
     明显违规 → 上传前直接拦截，省掉后端调用
   │ 通过
   ▼
[L2] 后端权威复审（新增，先发后审）
     复用 forum_async_jobs 队列：enqueue → claim → 审核 → complete/fail
     worker 把 Cloudinary URL（带 w_512,q_auto 缩略变换）作为 image_url
     传给 Qwen2.5-VL → 拒绝则改 forum_post_images.moderation_status
   │
   ▼
[L3] Cron 兜底
     pg_cron 每 5 分钟唤醒 worker，补处理漏掉/重试的任务（复用现有 Cron 模式）
```

关键点：L1 挡住大头流量，L2 只处理 L1 放行的图，L3 保底。即使有人绕过客户端直接调 API 发帖，L2 仍然兜得住。

## 三、复用清单（大部分零件已存在）

| 组件 | 状态 |
|---|---|
| `forum_async_jobs` 任务表 + `enqueue/claim/complete/fail_forum_async_jobs` RPC | ✅ 已上线（0601 迁移） |
| `forum-async-worker` 边缘函数（含鉴权/Cron 双通道、单 job 模式） | ✅ 已部署 |
| `moderation_logs` 审计日志 | ✅ 已有 |
| `forum_post_images.moderation_status` 字段 | ✅ 已有，只需接上状态机 |
| 发布队列乐观卡的"审核未过"UI | ✅ 已有（扩展一个"审核中"态） |
| **图片分支处理逻辑（worker 多模态 prompt）** | 🆕 唯一要新写的核心 |
| 图片判定缓存（同图去重） | 🆕 一张小表 |

## 四、落地步骤

**1. 迁移（1 个 SQL）**
- `forum_async_jobs` 加 `job_type`（text_moderation / image_moderation），老数据默认 text
- 新表 `forum_image_moderation_cache`：`public_id, content_hash, verdict, checked_at`（同图去重，30 天过期）
- `forum_post_images.moderation_status` 状态机：`pending → approved / rejected`（默认 approved 保持向后兼容，入队后置 pending）
- 清理策略：pg_cron 每日删除 7 天前 completed 任务行

**2. Worker 扩展（forum-async-worker/index.ts）**
- claim 到 image 类型 job 时：
  - 先查缓存表，全命中直接出结果（0 API 成本）
  - 未命中 → 拼 Cloudinary 缩略 URL（`f_auto,q_auto,w_512`），一帖全部图片放**同一个 prompt** 多图判定，输出 JSON `{per_image: [{public_id, status, reason}]}`，结果写回缓存
  - 拒绝 → `moderation_status='rejected'` + 帖子隐藏/打标（沿用现有"审核未过"链路）
- 超时 12s、单 job 模式、失败 `fail_forum_async_job` 重试 30s——全部沿用现有参数

**3. 前端（改动很小）**
- 发布队列乐观卡：`_publishState` 增加 `reviewing` 态，文案"已发布，安全复审中"
- 被后端拒绝的图：复用现有 moderation 失败 UI（`forum_post_images.moderation_status` 变化时前端已有展示位）

**4. Cron**
- 复用周报同款模式：pg_cron 每 5 分钟带 `x-worker-secret`（FORUM_WORKER_SECRET）POST 一次 worker

**5. 限额护栏**
- 入队时按用户限频（复用 04302 反垃圾限流思路，如 20 张图/小时/人）
- `attempt_count` 上限沿用现有 RPC，超限任务标记 `exhausted`，默认放行但打 `needs_human_review` 标（宁放勿拦 + 人工兜底）

## 五、风险与降级

| 风险 | 对策 |
|---|---|
| 视觉模型误判 | 低阈值放行：仅高置信拒绝；7B 疑难 → 可选升级 72B 复检（¥4.13/M，只审低置信样本，成本仍可忽略） |
| SiliconFlow 不可用 | 任务重试 → 超限放行打标（先发后审），Cron 稍后补审 |
| 多图帖 token 膨胀 | 缩略图变换 + 单 prompt 多图 + 缓存去重，单帖封顶 ~4K token |
| Free 项目 7 天不活跃暂停 | 已有真实用户流量，不构成问题；Cron 本身也算活跃 |

## 六、验收口径

- 绕过前端直发违规图 → 帖子可见时间 ≤ 5 分钟内被撤（Cron 周期决定）
- 正常图 → 无感知，`moderation_status` 静默变 approved
- Supabase 用量：invocations 增幅 < 发帖量 × 2，CPU 时间无感（纯 I/O）
- 外部成本：月账单可预期在 ¥20 以内（现量级 < ¥5）
