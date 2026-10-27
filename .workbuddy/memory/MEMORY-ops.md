# BOHLITE 分册规则：运维 / 云 / 页游
> 主文件是 `MEMORY.md`（常驻注入）。本册按需读取 —— 动 Supabase/EF/CI/Cloud+/图片列/游戏 时先读这里。

## Supabase / 网络
- ref `nplnlefdwfgtyimfkyih`；SMTP 走 Brevo（smtp-relay.brevo.com:587；key 90 天不活跃回收，探活 `POST /auth/v1/recover` 期待 200+`{}`；保活＝mail-keepalive EF + 每月 pg_cron，运维单点 `scripts/mail-keepalive-ops.mjs`）。
- ⚠️ EF 部署：① **CLI（2026-10-16 实证）**：`supabase functions deploy <slug> --use-api` 本机可用（无 config.toml 也行，靠 `supabase/.temp/project-ref`）；部署前先 `functions download <slug>` + diff 校验部署面（plans/024 纪律）。② admin-API 路线见下条。`/secrets` GET 读回值 ≠ EF env。
- ⚠️ 本机→`*.supabase.co` **直连不通**（沙箱代理 TLS reset + 直连 reset；浏览器 / `api.supabase.com` / `api.siliconflow.cn` 均通）⇒ 触发 EF 与端到端冒烟走 **Management API + pg_net**：`select net.http_post(url:=…, body:=…::jsonb, headers:=…::jsonb, timeout_milliseconds:=120000)` → 轮询 `net._http_response where id=<request_id>`（status_code 非空即回）。**`x-` 头经 headers JSONB 实测可过**（`x-retrieval-sync-secret`，sync+search 双验证）—— 旧注记「x- 头过不了 pg_net→EF」不成立；若丢头先查 `net._http_response.error_msg`。
- 检索链路密钥（2026-10-16 已设）：`SILICON_CLOUD_API_KEY` + `BOH_AI_RETRIEVAL_SYNC_SECRET`（`boh-ai-forum-memory` 读同一把）；`boh-ai-retrieval` v33 = 提交树（重排默认 `BAAI/bge-reranker-v2-m3`）。
- ⚠️ **cron 通道函数必须 `verify_jwt=false`**（push-send / generate-forum-weekly-report / mail-keepalive / boh-ai-forum-memory v4 起均是）：cron 的 dispatch key 非 JWT，网关校验开会全量 401（`UNAUTHORIZED_INVALID_JWT_FORMAT`）。本仓库无 config.toml ⇒ **重部署这些函数必须显式 `--no-verify-jwt`**（2026-10-16 boh-ai-forum-memory 首部署漏带 ⇒ jobid 28 每晚 401，v4 已修）。论坛摄取冒烟实录：limit=12 → 11 扫 / 4 卡 / 1 超时；检索端到端 ✓（来源 `forum_memory`）。
- 部署脚本 `scripts/lib/supabase-admin-api.mjs` → `POST /functions/deploy?slug=<name>`（`slug` 是 **query 参数**，不传＝UUID slug→404；multipart 字段 `file`（单数）+`metadata`；`_shared/*` 依赖必须一起传；`verify_jwt` 沿用线上现值）。`api-key-vault` 依赖 `_shared/{cors,rate-limiter,supabase}.ts`。
- 迁移走 Management API + 手写 `schema_migrations`；凭据在钥匙串（剥 `go-keyring-base64:`）。撤 EXECUTE 用 `from anon,authenticated,public`；撤权优先于 drop；新表 grant anon+authenticated；RPC 静默失败＝审计表取 code。

## GitHub CI
- ⚠️ Dependabot 触发的 workflow 读不到 repository secrets（须 `gh secret list --app dependabot` 另配一套）；改 secrets 后要 `gh run rerun` 才验得到。
- ⚠️ `git push` SIGTERM(137) ≠ 失败 → 先 `git ls-remote origin main`。

## Cloud+（plans/023）
- 私密备份库：对外只有 token 分享/转帖子；底账(source='forum')禁单独删/公开；发帖→`backupPostImagesToCloud` 建底账（best-effort）；删帖删备份＝DB cascade。
- 相册排序：API 层 `entry_date desc, nullsFirst:false`（别按 updated_at 主排、别视图层补 sort）；多图贴 key＝`${entry.id}::${index}`（否则串图）。

## DB 图片（裂图重灾区）
- 图片列混存 `@/assets` 别名与 cloudinary 绝对地址（大陆不可达；`cdn.blockofhome.cn` 200）⇒ **统一走 `utils/db-image-url.js`**（resolveDb* 系列，顺序固定：先 getImageUrl 再改写）；只调 getImageUrl＝裂图。
- 已修：活动页/积分卡面/预设缩略图；**未修**：CommunityLotteries、Shop、头像框 9 处直绑。积分卡面 `c_limit` 不 `c_fill`。

## 页游 / 小游戏（src/games/）
- **不引 Phaser**（345KB gzip 与路由/无障碍冲突；「不好玩」是设计问题）；要渲染层用 **PixiJS v8**（~50KB，只做粒子/精灵，DOM 管 HUD）。
- ⚠️ 最易塌陷＝「所有玩法退化成同一条规则」：`new Set(kinds).size` 要等于机制数；断言写「达标⇒高档 / 不达标⇒fail」，不能调评分函数蒙。
- 四铁律：① 设计可达性先算（窗口穿越时间 ≥ 停留要求×1.6；互斥时间窗不重叠），单测看不出须显式断言区间关系；② 采样型机制（拖画轨迹）必须正方形归一化；③ absolute 元素显式确认定位祖先（`.machine-deck` 无 position ⇒ 捕获层落左上角盖订单条）；④ SVG 里不能放 HTML 按钮（恒 0 尺寸）。
- 布局禁 `transform: scale()` 响应式（改 Grid + clamp()）；「占屏比」会骗人 ⇒ 拆 UI chrome vs 玩法画面（后者主判据），断言直接测装置内部（SVG 实高）。
- ⚠️ **并行实体的状态容器必须以实体 id 为第一层 key**：`{[stepId]:state}` 被多单共用 ⇒ A 单 failed 污染 B 单，`canInteract()` 见 failed 直接 return ⇒ 切单完全无反应。
- ⚠️ **失败态必须能重置回可交互**（否则偶发失败＝永久卡死）；失败反馈**绝不能出现「下一步」**。两条都要写断言。
- ⚠️ **只在终态出现的空指针单测抓不到**（`createStepState(null)`）⇒ 靠 E2E 探针 +「撤掉修复确认重现」。
- ⚠️ E2E 判据：`doneCount` 在订单移除时重置为 0（`2→0` 假失败）⇒ 用 `activeStepIndex`；场景互相污染 ⇒ 每场景独立开页 + 调试钩子 `window.__cafeDebug.forceDrink(id)`（DEV 门控）。
- 护栏：probe:cafe-layout(21)、probe:cafe-mechanics(30+)、cafe-steps(23)、cafe-cat(13)、cafe-round(9)。

## 邮件链路保活（Brevo SMTP key 90 天不活跃会回收）
- 真源：`supabase/functions/mail-keepalive` + pg_cron `boh_mail_keepalive_monthly`（**jobid 24**，`0 1 8 * *` = 每月 8 号 01:00 UTC），
  运维/验证走 `scripts/mail-keepalive-ops.mjs`（`--verify` 只读 8 项、`--trigger` 真发一封）。
- ⚠️ **cron 不在迁移里注册**（`2026100801_mail_keepalive.sql` 只建表），靠 `--cron` 把 service key 与 token 烘焙进命令文本
  ⇒ token 轮换后**必须重跑 `--cron`**，否则自动执行静默 401。
- ⚠️ `cron.job_run_details` 为空 **≠ 任务坏了**：排期是每月 8 号，10-08 注册 ⇒ 首次自动执行 11-08；先看排期再判死。
- ⚠️ **本机 DNS 解析不到 `*.supabase.co`**（HTTP 000 / ECONNRESET，`api.supabase.com` 正常）⇒ 不能本地直调 EF；
  端到端验证的做法：建**一次性 pg_cron 任务**（`to_char(now()+interval '2 minutes','MI HH24 DD MM')||' *'`，复用 job 24 的命令原文，
  具体日期而非 `* * * * *` 兜底），跑完 `cron.unschedule`。2026-10-27 实测通过：底账 HTTP 200 / ok=true。
- WorkBuddy 侧的「邮件链路保活体检」自动化**已不存在**（记录停在 2026-10-01，automation list 为空），别再指望它兜底。
