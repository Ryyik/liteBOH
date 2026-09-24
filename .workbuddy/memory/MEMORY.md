# BOHLITE 长期记忆（只放跨会话硬规则与易踩坑；细节见日期日志 / docs / plans）

## 环境 / 探针
- hash 路由；dev 只听 IPv6 → `http://[::1]:5173`（preview `:4180`）。构建验证 `vite build --outDir dist-check`（**勿动 dist**）。
- playwright：必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；内核未装用 `channel:'chrome'`；一 browser+每场景新 context；同一 path 只注册一条 page.route；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：注 pinia（合法 UUID），禁种 `sb-*-auth-token`；切路由用 `location.hash`；截图前点掉残留 `vite-error-overlay`。
- 本机 zsh `grep` 多模式 `\|` 静默失效 → 一律用专用搜索工具。改完必反证：stash→记红→pop→复跑全绿。
- vitest：禁固定 tick 放行 → `waitUntil(...,5000)`；沙箱/CI 必加 `--pool=forks`（exit 143/137）；npx 可能被 SIGTERM → 用 `./node_modules/.bin/<tool>` 直接调。

## 网络 / Supabase（本机长期限制）
- `github.com` HTTPS 被 SNI 阻断 → push 走 SSH（`ssh.github.com:443`，remote `git@github.com:Ryyik/liteBOH.git`）；抖动重试 1~2 次；兜底 `scripts/push-via-api.py`（默认干跑，`--apply` 才推；必须保留代理变量）。
- ⚠️ 订正（09-24）：`api.github.com` 本机实测直连可通（200/0.24s），被阻断的只有 `github.com` HTTPS；旧探针注释「SNI 阻断」已过期。国内访客环境仍可能不通 → GitHub API 功能验证仍建议 mock。
- Supabase 5432 时断 → 迁移走 Management API（`read_only:false`）+ 手写 `schema_migrations`（同事务）。CLI 已登录（查部署首选）。curl 到 `<ref>.supabase.co` 不通 → EF 验证走 DB 侧 `net.http_post`。`secrets set` 一次一个。logs.all 不可判「是否调用过」→ 用 `pg_stat_statements`（扣探针）。凭据在钥匙串 `Supabase CLI`。
- Supabase ref `nplnlefdwfgtyimfkyih`；迁移名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst,'reload schema'`。

## Supabase 授权（安全核心）
- 撤 EXECUTE 必须 `from anon, authenticated, public`；表级撤 anon 即可（另持 TRUNCATE）。撤权优先于 drop。普通用户路径函数只能撤权、不能加 `auth.role()` 门。service_role 下 `auth.uid()` 为 NULL。
- ⚠️ `alter default privileges` 管不住 supabase_admin 默认 ACL → 护栏 `scripts/check-anon-execute.mjs` + baseline 棘轮（不接 build:ci）。
- 撤权前五查：pg_depend / `pg_get_functiondef` 全库扫 / EF / 前端调用点 / RLS 策略引用。新表 revoke 后 grant anon+authenticated（漏 anon→42501）。
- 凭据一律走 Vault；EF 在请求处理内读 `Deno.env.get()`（顶层读被缓存）。drop 列前全库 grep 引用 + 迁移后冒烟。
- 现状 09-22 复检：anon 可执行函数 232→155、可写表 75→0（`docs/2026-09-21-安全审计报告核验与全量复检.md`）。待办：二阶段 5 项撤权；GoTrue `password_min_length` 仍 6。

## 数据管理面板（/admin/data-management）
- 列全部声明在 `query-config.js` + `config/tables.js`；列名漂移 → PostgREST 400 `42703`。点开即报 vs 筛选才报是两套配置。
- `profiles` 无 `email` 列；FK 指 `auth.users` 的列不能 PostgREST 内嵌（PGRST200）。`TAB_SORT_COLUMNS` 值是 Set，`Object.keys()` 得 `[]`。
- 查错四件套：`audit:dm-schema-refresh` / `audit:dm-columns` / `audit:dm-columns:live` / `probe:dm-errors`（真打必须重试）。
- 2026-09-24 首查：14 页签 400 + 20 处筛选报错，已定位未修（`docs/2026-09-24-数据管理面板列错误查错报告.md`）。

## Cloudinary 台账（cloudinary_pending_uploads）
- 是「上传归属台账」非队列：删图 EF `filterOwnedCloudPublicIds` 查它 → 不能删表、不能硬删行。
- `claimed_at is null` ≠ 可清理（装修台没接 mark，孤儿可能正被引用）。真该清：`source='forum' and claimed_at is null and created_at < now()-7d`。

## 注册 / 认证 / Push / AI
- 邮箱验证已生效。GoTrue：gmail 剥 +tag；未确认登录报 invalid_credentials；`verifyOtp({type:'recovery'})` 只发 PASSWORD_RECOVERY。
- 注册=三步向导；密码下限 8 位唯一真源 `src/utils/auth-validation.js`（Deno 副本 → 门禁 `check:auth-validation`）。通行密钥：注册 Step3 收意图+完成页执行。
- Push 链路：notifications 触发器 → push_outbox → pg_net → EF `push-send` → `push-sw.js`。VAPID 必 `jsr:@negrel/webpush`；单 secret `VAPID_KEYS_JSON`；SUBJECT 必须 mailto:；Declarative 双格式；`navigate` 绝对 URL。iOS 仅 PWA 内可订阅；绝不自动 unsubscribe。
- AI：EF `api-key-vault` → 上游；唯一生效字段 `bohai_model_configs.api_url`；只说 OpenAI 协议（只解析 choices[0]）。Google：frequency_penalty 400、reasoning_effort 仅 low、错误是 JSON 数组。限流 10/分/用户。改 AI 页必跑 `scripts/probes/probe-ai-panels.mjs`。

## 样式 / 主题 / 性能 / PWA / CI
- 玻璃单源 `tokens.css`（--liquid-*）；子组件禁压父级变量→`var(--x,40px)`；空态 EmptyState.vue。暗色真源 theme-manager.js + 13 容器白名单。
- 首屏壳 = app-*.js 9 个静态 import；页面底色纯白三处同步：`tokens.css --boh-page-bg` + `index.html` `.boh-boot` + `Home/style.scoped.css`（check:first-paint 断言）；暗色暖炭 #16120e。
- 首页 `/` = 一次性街景开场层（`.home-gate` fixed 覆盖 + sessionStorage）。锁滚动别新增 `!important`（撞 important-budget 棘轮）。
- SW 预缓存两半一对（壳样式 + manifestTransforms），删任一半「有 HTML 无样式」。`push-sw.js` 必须经典脚本。TWA 单源 `android-twa/twa-manifest.json`。
- CI 链序 views→structure→liquid-glass→important-budget→dark-tokens→first-paint→build→shell-precache→bundle；新 `!important` 同步 important-budget.json。
- sticky 坑：全局 `body{overflow-x:hidden!important}` 使 body 成滚动容器致 sticky 全灭 → 任何 sticky 叙事页必须挂 `html.<页>-scroll body{overflow:visible!important}`（AboutUs 已接）。
- 键盘适配（09-24 审查+修复，`docs/2026-09-24-竖屏手机端键盘输入体验审查报告.md`）：`--kb-inset` 全局真源 = `useKeyboardInset.js`（main.js initKeyboardInset 写 documentElement，阈值 120px）；三处 P0 已接线（发帖 overlay / BOHAI / 底栏 is-hidden）。⚠️ `.bohai-page` 高度真源**三处**：adaptive-layout.css + shell-header.css 双定义 + `style.css` 的 `body.page-aichat #app/.bohai-page:not(...)` 覆盖链（特异性更高、独立模式真源），改高度必须三处同步。`100dvh` iOS 不随键盘缩；`interactive-widget=resizes-content` 不能单独加（翻转 composer/forum 的 599/600px 断点）。PostDetail `--pd-dock-inset` 是连续跟随语义（无阈值），与 kb-inset 阈值化语义不同，勿合并。探针 `probe-keyboard-inset.mjs`（mock visualViewport 全链路）。

## UserSpace / 活动
- 论坛 = 底栏第一席「方块」（ForumSectionShell.vue）；分区七席单源 `config/forum-sections.ts`；五席底栏 = 方块/我的/资产/消息/设置。
- ⚠️ ForumMain 里 `watch(...,{immediate:true})` 不得同步调用下方声明的 `const`（TDZ → 错误边界）；延迟用 `Promise.resolve().then(...)`。
- 分区单源 = URL `view`；横屏左栏判据 landscape+≥1024+≥600（3 处同步）。活动：日期单源 `utils/activity-date.js`；slug 发布后不可变。

## BOH AI 心理访谈（访谈态）
- ⚠️ 两条激活路径只有一条初始化状态机：`expertState` 唯一写入点 `BOHAIMain.vue:1898`（路径 A）；BohaiSettingsPanel.vue:119 选风格是路径 B（不建 expertState，状态机/守门/封闭域全 false）。未修，属产品决策；附录与 L1 规则逐字重复是症状，不能盲删。
- 守门重写必须严格更优才采纳（guards.js shouldAdoptRewrite：硬 3 分/软 1 分）。`expertState` 是显式白名单（bohai-chat-session-store.js），新字段不登记被静默丢弃。
- 访谈态封闭域：检索/联网/记忆读写全关，挂 `psychInterviewActive`。减约束顺序：先量 guardStats → 调阈值 → 才删 prompt 副本。访谈跑 `pro`，temperature 0.18（GENERATION_PROFILE_BY_MODE 全局共享，访谈需单独 profile）。

## /about 热力图（GitHubHeatmap.vue）
- 7行×53列矩阵（gridAutoFlow:column），cell 尺寸容器实测反推（53→26 降级），CSS 不写死；缓存 6h + 静默刷新 + 403 专用提示；探针 `probe-about-heatmap.mjs`（19 断言）。待办：国内访客首访 error → CF Worker 代理（`cloudflare/` 有 gemini-proxy 先例）。
- 颜色 = **动态四分位分档**（colorThresholds，GitHub 同款；写死阈值让低频仓库整图偏浅，实测深色占比 22.6%→43.5%）。标注：月份行（重叠让位）+ 星期列 一/三/五 + 悬停中文年月日；measure 读外层 frame 宽（勿读网格自身 → 循环锁定）。综合探针 `probe-heatmap-tiers.mjs`（8 断言+截图）。

## 订阅页权益（/user-space/subscriptions）
- 权益展示单源 `utils/subscription-benefits.js` 五常量：PLAN_AI_TOKENS / PLAN_CLOUD_IMAGE_LIMITS / PLAN_LAB_QUOTAS / TIER_NICKNAME_COLORS / PLAN_LOTTERY_PITY_THRESHOLDS（保底 24·18·12·8，free null）。卡片与对比表由 `SubscriptionPlans.vue` 的 buildCardFeatures/buildBenefitRow 生成——改一处两处同步，勿再手写第二份。
- 保底口径=RPC `get_my_lottery_pity_status` 的 consecutive_losses：连续未中奖**场**、中奖清零、达标兑保底礼（勿写「抽够必中」）；Free 可抽奖不计保底。守门：单测 `subscription-benefits.test.js`（7 条）+ 探针 `probe-subscription-benefits.mjs`（37 断言，含月年切换/手机端）。
