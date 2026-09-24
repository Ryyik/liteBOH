# BOHLITE 长期记忆（只放跨会话硬规则与易踩坑；细节见日期日志 / docs / plans）

## 环境 / 探针
- hash 路由；dev 只听 IPv6 → `http://[::1]:5173`（preview `:4180`）。构建验证 `vite build --outDir dist-check`（**勿动 dist**）。
- playwright：必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；内核未装用 `channel:'chrome'`；一 browser+每场景新 context；**同一 path 只注册一条 page.route**；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：注 pinia（合法 UUID），**禁种 `sb-*-auth-token`**；切路由用 `location.hash`；截图前点掉残留 `vite-error-overlay`。
- ⚠️ 本机 zsh `grep` 多模式 `\|` 静默失效 → 一律用专用搜索工具。**改完必反证**：stash(pathspec)→记红→pop→复跑全绿。

## 网络 / Supabase（本机长期限制）
- `github.com` HTTPS 被 SNI 阻断 → push 走 **SSH**（`ssh.github.com:443`，公钥已注册，remote `git@github.com:Ryyik/liteBOH.git`，仓库级 `core.sshCommand` ConnectTimeout=15）；抖动重试 1~2 次；小改动/要确定性 → 兜底 `scripts/push-via-api.py`（默认干跑 `--apply` 才推；**必须保留代理变量**）。注册公钥只能人做。
- Supabase 5432 时断 → 迁移走 Management API（`read_only:false`）+ 手写 `schema_migrations`（同事务）。CLI 本机已登录（查部署状态首选）。curl 到 `<ref>.supabase.co` 不通 → **验证 EF 走 DB 侧** `net.http_post` + 查 `net._http_response`。`secrets set` 一次一个；`secrets list` DIGEST=sha256(值)。
- logs.all 时间窗自相矛盾 → 不可判断「是否调用过」；判调用用 `pg_stat_statements`（扣探针；无事件≠调用者消失；别用 `_rate_limits`）。Management API 凭据在钥匙串 `Supabase CLI`（go-keyring-base64 壳）。

## Supabase 授权（安全核心）
- ref `nplnlefdwfgtyimfkyih`；迁移名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst,'reload schema'`。
- 撤 EXECUTE 必须 `from anon, authenticated, public`（PUBLIC 内建份额）；表级撤 anon 即可（anon 另持 TRUNCATE，不受 RLS 约束）。撤权优先于 drop。普通用户路径函数只能撤权、不能加 `auth.role()` 门。service_role 下 `auth.uid()` 为 NULL。
- ⚠️ `alter default privileges` 管不住 supabase_admin 默认 ACL → 增量护栏在仓库侧：`scripts/check-anon-execute.mjs` + `anon-execute-baseline.json`（棘轮；**不接 build:ci**，CI 只有 anon key）。
- 撤权前五项核查：pg_depend / 全库 `pg_get_functiondef` 扫调用（含裸名）/ EF / 前端调用点 / **RLS 策略是否引用**（`current_user_is_admin` 不能撤 anon）。新表 revoke 后分别 grant anon+authenticated（漏 anon→42501）。
- `executeRead(scope,params,fetcher,options)`：options 第 4 参；fetcher 必须返回 `{data,error}`；取消唯一出口 `code:'ABORTED'`；authReadCache 实为 FIFO。
- **凭据一律走 Vault**（`vault.create_secret` + 读 `vault.decrypted_secrets`）：`alter database set app.settings.*` 实测 42501 已证伪。EF 必须在请求处理内读 `Deno.env.get()`（顶层读被 isolate 缓存）。drop 列前全库 grep 触发器/函数/视图引用 + 迁移后真实冒烟。

## 安全现状（2026-09-22 复检；详见 `docs/2026-09-21-安全审计报告核验与全量复检.md`）
- 旧健康检查报告（boh-full-health-check-2026-06-26）主体过期，引用前按 pg_policy 复核。
- 已修：`resolve_email_for_login` 撤权（登录走 auth-login EF）；anon 可执行函数 232→155、anon 可写表 75→0；Cloudinary 签名上传；安全响应头经 CF 上线；cron 明文密钥 P0 改 Vault 读。
- 待办：第二阶段 5 项公开页撤权（先匿名流量实测）；GoTrue `password_min_length` 仍 6；iOS「添加到主屏幕」引导 UX；国内 Android 推送通道决策。

## 数据管理面板（/admin/data-management）
- 表页签的列**全部声明在** `query-config.js`（TAB_SELECT_COLUMNS / STATUS_FILTER_FIELDS / DATE_FILTER_FIELDS / TAB_SORT_COLUMNS / TAB_SEARCH_FIELDS）+ `config/tables.js`（columns/fields）。列名一旦与 DB 漂移 → PostgREST 400 `42703 column X does not exist` → 前端弹「获取数据失败」。**点开即报 vs 用筛选才报是两套配置，改一处不等于全修**。
- ⚠️ **`profiles` 表没有 `email` 列**（email 在 `auth.users`，前端靠 RPC `admin_list_users_with_sensitive` 补）。任何 `profile:user_id(username,email)` 内嵌必 400（报 `profiles_1.email does not exist`）。同理 `shipping_*` 也只有 RPC 路径。
- ⚠️ FK 指向 **`auth.users`** 的列**不能被 PostgREST 内嵌**（跨 schema，报 `PGRST200 Could not find a relationship`）：`ai_web_search_log.user_id`、`api_key_vault_audit_logs.actor_id`、`profiles.banned_by/muted_by`。指向 `public.profiles` 的才可内嵌。
- `TAB_SORT_COLUMNS` 的值是 **Set**（不是数组），`Object.keys()` 得 `[]` → 会整类漏检。
- 一键查错四件套：`audit:dm-schema-refresh` / `audit:dm-columns`（静态，秒级离线）/ `audit:dm-columns:live`（真打决定性）/ `probe:dm-errors`（UI 逐页签）。真打**不能剥内嵌**，且必须重试（本机到 supabase 间歇 fetch failed，不重试会把失败误判为通过）。
- 2026-09-24 首查：14 个页签点开即 400 + 20 处筛选/搜索报错，全部已定位未修，见 `docs/2026-09-24-数据管理面板列错误查错报告.md`。

## Cloudinary 上传台账（cloudinary_pending_uploads）
- ⚠️ 表**不是"上传队列"**，是「上传归属台账」：删图 EF 的 `filterOwnedCloudPublicIds`（`cloudinary-delete/index.ts:167`）第一道归属校验就查它 → **不能删表、不能硬删行**（硬删后用户删自己的图会 403「只能删除当前账号已保存的图片」）。
- ⚠️ **`claimed_at is null` ≠ 可清理**：`markCloudinaryUploadsClaimed` 全仓只有 3 个调用点（`forum/post-api.js:924`、`block-wall-api.js:104`、`UserSpaceMain.vue:2301`），**装修台 HeroConsole/ShopConsole/AvatarConsole 没接** → 它们上传的线上素材永远停在"孤儿"态。实测 20 个"孤儿"里 8 个正被引用（hero 4 / shop 2 / avatar 2）。任何按 `claimed_at is null` 的批量清理都会误删线上素材。
- 无任何 cron 清理此表；真该清的是 `source='forum' and claimed_at is null and created_at < now()-7d`，且必须走 EF 删 Cloudinary 文件 + 标 `deleted_at`，不能硬删行。

## 注册 / 认证链（/join、/login、auth-login EF）
- 邮箱验证已生效：`mailer_autoconfirm=false`（SMTP=Brevo，凭据在 CLI 钥匙串；key 90 天不活跃过期→月度保活已建）。确认邮件 token_hash 型 → `useSignupEmailConfirmation.js` 消费。
- GoTrue 坑：gmail 剥 +tag；signup 未确认响应 `{session:null,user:null}`；未确认登录报 invalid_credentials；`verifyOtp({type:'recovery'})` 只发 PASSWORD_RECOVERY 不发 SIGNED_IN（已在 auth.ts `updateLocalState` 登录跃迁统一处理）。
- 注册页 `src/views/Join/index.vue` = 三步向导方案 B（液态玻璃外卡；导航让位靠 onMounted 实测 `.unified-nav` 高度写 `--join-nav-h`）。
- 密码下限 8 位唯一真源 `src/utils/auth-validation.js`；Deno 副本 `supabase/functions/_shared/auth-validation.ts` → 门禁 `check:auth-validation`（已接 build:ci）；LEGACY=6 刻意低（追平会锁死历史短密码用户）。
- 查重共用 `auth-api.js#isUsernameAvailable()`（ilike 偏严）。通行密钥：注册=Step3 收意图+完成页执行；邮箱确认模式不给开关（无 session 必 401）。
- 未做：birth_year（需迁移）；OAuth 登录无 UI 入口；无邀请码机制。头像：裁切→压缩→直传 avatars→回写（失败静默回删）。

## 消息中心 / Web Push / AI 出口
- 链路：notifications 触发器 → push_outbox → pg_net → EF `push-send` → 推送服务 → `push-sw.js`；cron 2 分钟重投。VAPID 库必须 `jsr:@negrel/webpush`；密钥单 secret `VAPID_KEYS_JSON`；SUBJECT 必须 mailto:。payload Declarative 双格式（顶层 web_push:8030 + notification，保留扁平字段）；`navigate` 绝对 URL（SW 侧退化成 path+hash）。
- iOS：仅「添加到主屏幕」内可订阅；权限须用户手势；绝不在自动路径 unsubscribe；每条必须 showNotification。国内 Android 走 FCM 基本死路 → Pushplus(微信) 兜底。
- AI：浏览器 → EF `api-key-vault` → 上游；唯一生效字段 `bohai_model_configs.api_url`；只说 OpenAI 协议（penalty/stream_options 清洗，只解析 choices[0]）。CF Worker `cloudflare/gemini-proxy/`（改完 wrangler deploy）。Google：frequency_penalty 400、reasoning_effort 仅 low、max_tokens≥512、错误是 JSON 数组。限流 10/分/用户。
- 改 AI 页必跑 `scripts/probes/probe-ai-panels.mjs`；AI 面板「先预热再打开」（挂载即打开修不好）。

## 样式 / 主题 / 性能 / PWA / CI
- 玻璃单源 `tokens.css`（--liquid-*）；子组件禁压父级变量→`var(--x,40px)`；空态统一 EmptyState.vue；设置面板用 settings-glass.css。sticky 坑：全局 overflow-x:hidden 使 body 成滚动容器→挂载给 html 加类。暗色真源 theme-manager.js + 13 容器白名单。
- 首屏壳 = app-*.js 9 个静态 import；改骨架必跑 first-paint + shell-precache；入口 CSS 必须 render-blocking link。**页面底色纯白**：`tokens.css --boh-page-bg` + `index.html` 骨架 `.boh-boot` + `Home/style.scoped.css` fallback **三处同步**（check:first-paint 断言）；暗色仍暖炭 #16120e。
- 首页 `/` = **一次性街景开场层**（`.home-gate` 用 `position: fixed` 覆盖视口；标记 `sessionStorage['boh-home-gate-passed']`，删掉它刷新即可重看）→ 线性 1080ms 退出 → 方块论坛铺满，**不支持上滑回开场画**。⚠️ 不要为「锁开场画滚动」新增 `!important`：style.global.css 里 html/body/.home 都带 `!important`，覆盖必撞 important-budget 棘轮 —— fixed 覆盖层 + 进入瞬间 `window.scrollTo(0,0)` 即可。
- SW 预缓存两半一对（壳样式预缓存 + manifestTransforms 移路由 CSS），删任一半「有 HTML 无样式」。`public/_headers` 线上不生效→靠 version-checker（visibilitychange/路由时绕 SW 拉 version.json）。`push-sw.js` 必须经典脚本（importScripts 拼接）。
- TWA：单源 `android-twa/twa-manifest.json`；改 vite.config / public/icons / .well-known 也触发 APK 构建。
- CI 链序 views→structure→liquid-glass→important-budget→dark-tokens→first-paint→build→shell-precache→bundle；新 `!important` 同步 important-budget.json（例外 html.<页> body overflow:visible）；deploy job 无 checkout，别往里加 node 脚本。

## UserSpace / 活动 / 测试
- 论坛 = 底栏第一席「**方块**」（`ForumSectionShell.vue`），**首页 `/` 与 UserSpace 方块分区共用同一份**；分区七席单源 `config/forum-sections.ts`（官方居首、默认落「最新」）。五席底栏 = 方块/我的/资产/消息/设置。首页要自己探测 `#unified-nav-container` 实测高度写 `--userspace-nav-h`（页签顶部避让；UserSpaceMain 有同口径逻辑，首页不经过它）—— 写死 inset 会被悬浮导航胶囊压住页签。
- ⚠️ ForumMain 里 `watch(..., { immediate: true })` **不得同步调用在下方声明的 `const` 函数**：`fetchForumData` 在 800 行后声明，同步调 → TDZ ReferenceError → 点「关注/新闻/活动」整页被错误边界接管成「页面出了问题」。延迟用 `Promise.resolve().then(...)`；`probe-home-revamp.mjs` 的 C4 会逐分区点击做回归。
- 分区单源 = URL `view`；`resolveSectionFromRoute` 遇 URL tab ≠ 当前 tab 拒采信。过渡已成熟（userspace-tab-in/out-*）勿重造；`preloadSettingsSubPanels` 模块说明符必须与 defineAsyncComponent 一致；CommunityTab 30s 轮询。生产构建剥 Vue 告警，「没告警」不能当依据。横屏左栏判据 landscape+≥1024+≥600（3 处同步）。
- 活动：日期单源 `utils/activity-date.js`；slug 单源 activity-campaign.js，发布后永久不可变；清单 DB 优先合并（DB 行覆盖内置行，写错无告警）。框 scale≈1/内孔占比按孔心裁切；画布 setPointerCapture 必须 try/catch；手势用 CDP Input.dispatchTouchEvent。
- vitest：禁固定 tick 放行 → `waitUntil(...,5000)`；等假定时器用 `vi.getTimerCount()`。afterEach 先 `await setImmediate` 再 useRealTimers。跨用例 void 异步尾随→假红：beforeEach 复位+装实现同步一口气完成。判「偶发」前先做因果实验。
