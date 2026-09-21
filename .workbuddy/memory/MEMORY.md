# BOHLITE 长期记忆（**索引版**：只放跨会话硬规则与易踩坑；细节见 `.workbuddy/memory/` 日期日志、`docs/`、`plans/`）

## 环境 / 探针
- hash 路由；dev/preview 只听 IPv6 → `http://[::1]:5173` / preview `:4180`。构建验证用 `vite build --outDir dist-check`（**勿动 dist**）。
- playwright：必加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；内核未装用 `channel:'chrome'`；一 browser + 每场景新 context；**同一 path 只注册一条 `page.route`**（后注册优先会短路前序）；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：注 pinia（合法 UUID），**禁种 `sb-*-auth-token`**；切路由用 `location.hash`。
- ⚠️ 本机 bash `grep` 的多模式 `\|` **静默失效**（返回空却不报错）→ 一律用专用搜索工具。
- **改完必反证**：stash（带 pathspec，先看 `git stash list`）→ 记红 → pop → 复跑全绿。

## 网络 / 推送（本机长期限制）
- ⚠️ **`github.com` 的 HTTPS 被 SNI 阻断**（TCP 443 通、TLS 直接失败）→ `git push` 不可能成功，重试无意义。**改用 `scripts/push-via-api.py`**（GitHub Git Data API，走可用的 `api.github.com`；完整复现 commit 元数据使 SHA 与本地一致；默认干跑，`--apply` 才推）。
- ⚠️ **Supabase 5432 时通时断**（`tls error EOF`）→ `db push` 不可靠。改用 Management API（`read_only:false`）执行语句 + 手工写 `supabase_migrations.schema_migrations`（`version/name/statements text[]`），与语句**同一事务**。
- 日志端点 `…/analytics/endpoints/logs.all` 两个时间参数**必须是 ISO8601**；⚠️ 其时间窗过滤结果自相矛盾（24h 得 4629 行、72h 得 0）→ **不可用于判断「是否调用过」**。
- **Supabase Management API 凭据在本机**：钥匙串 `Supabase CLI` 条目 = `go-keyring-base64:` + base64(sbp_ PAT)，剥壳解码即可直调 api.supabase.com（passkeys 已用 PATCH config/auth 开启）；该 API 的 `webauthn_rp_origins` 要**逗号字符串**（数组 400）。

## CI 门禁
- 链序：views → structure → liquid-glass → **important-budget** → dark-tokens(观察) → first-paint → build → shell-precache → bundle。CI 中途断则后续没跑 → 本地跑全链。
- 新文件用 `!important` 须同步 `scripts/important-budget.json`（只查单文件超基线）。例外：`html.<页> body{overflow:visible!important}`。
- ⚠️ 往 workflow 加步骤前**先确认该 job 有没有 checkout**：`deploy` job 只跑 `actions/deploy-pages`、无源码 → `node scripts/…` 会 `MODULE_NOT_FOUND` 把整个 run 染红（而 Pages 部署本身是成功的）。

## Supabase 授权（安全核心 · 最易踩）
- ref `nplnlefdwfgtyimfkyih`；迁移名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst,'reload schema'`。
- ⚠️ **撤 EXECUTE 必须 `from anon, authenticated, public`**：函数 EXECUTE 同时有 PUBLIC 内建授权，anon 经 PUBLIC 继承 → **只撤 anon 无效**（实测）。表级授权是对 anon 的显式 grant（无 PUBLIC 份额），撤 anon 即可；anon 另持 TRUNCATE（**不受 RLS 约束**）。
- ⚠️ **`alter default privileges` 保证不了增量安全**：`pg_default_acl` 另有一条 `defaclrole=supabase_admin` 改不动（42501），PUBLIC 内建 EXECUTE 仍在 → 新建函数照样匿名可调。**增量护栏放仓库侧**：`scripts/check-anon-execute.mjs` + `anon-execute-baseline.json`（棘轮，超出即 exit 1，`--update` 只能下调）。**不接 `build:ci`**（CI 只有 anon key，接了永远降级跳过 = 假门禁）。
- ⚠️ **撤权前五项核查**：`pg_depend` 依赖 / 全库 `pg_get_functiondef` 扫库内调用（**须匹配裸调用名**，漏 `public.` 前缀会漏判）/ EF 调用 / 前端调用点 / **是否被 RLS 策略引用**（策略按查询者角色求值 → `current_user_is_admin` 不能撤 anon，撤了游客查询直接 42501）。
- **撤权优先于 drop**（对调用方效果相同，但 `revoke` 可一条 `grant` 秒回滚）。被普通用户路径调用的函数（发帖/点赞/抽奖/评论）**只能撤权、不能加 `auth.role()` 门**。
- 新表 revoke 后须**分别** grant anon + authenticated（漏 anon → 42501，mock 不暴露）；service_role 下 `auth.uid()` 为 NULL → security definer 拆内部函数。
- `executeRead(scope, params, fetcher, options)`，**options 第 4 参**；**fetcher 必须返回 `{data,error}`**（返回数组 → data 恒 null 且不报错）。取消唯一出口 request-core `code:'ABORTED'`（消费侧判 `aborted || code==='ABORTED'`）。`clearAuthReadCache` 无人调用；getCache 命中不回插 → 注释写 LRU 实为 **FIFO**。
- `supabase secrets list` 的 DIGEST = **`sha256(值)`（不含换行）** → 可让用户本地自查：`printf '%s' '值' | shasum -a 256`。⚠️ 它**没有创建时间/作者** → 「是谁配的」只能反查代码。
- ⚠️ **EF 必须在请求处理内读 `Deno.env.get()`**：模块顶层读会被复用的 isolate 缓存 → 改 secret「看起来没生效」。

## 安全现状（2026-09-21；详见 `docs/2026-09-21-安全审计报告核验与全量复检.md`）
- **既有安全报告主体已过期**（`docs/boh-full-health-check-2026-06-26.md` 第一章 72/100：S-1 九项 8 修 1 废、S-2/3/4 已修）→ 引用前必须按 `pg_policy` 现时点复核。
- ✅ **已修**：`resolve_email_for_login` 去邮箱化（登录走 `auth-login` EF、降级分支已删、迁移 `2026092103` 撤权，实测匿名 **401 `42501`**）；anon 可执行函数 232→**155**、anon 可写表 75→**0**；Cloudinary 已切**签名上传**（`BOHIMG_SIGNED`，旧 preset 已关）。
- ⬜ **待办**：`cron.job#8` 明文内嵌 41 字符 `sb_secret_`（**唯一未开工的 P0**，service_role 等价；改法 `alter database postgres set "app.settings.service_role_key"` + `current_setting`）；线上**零安全响应头**（Pages 加不了 → Cloudflare Transform Rules，脚本已就绪但 token 缺 `Zone→Config→Edit`）；`resolve_email_for_login` **函数本体未 drop**（刻意留回滚能力）；第二阶段 5 项公开页撤权（须先做匿名流量实测）。
- 判授权现状**只能靠目录快照**：`has_function_privilege` + `pg_get_functiondef` 文本搜门 + `aclexplode` 看 PUBLIC 份额；`git ls-files`/`-S` 查密钥是否进仓。
- ⚠️ 判断「某函数是否还有人调用」用 **`pg_stat_statements`**（Supabase 默认启用）查 PostgREST 包装语句的 `calls`：① 须扣除自己的探针调用；② 窗口内无事件时「calls 不增长」**不能证明**调用者已消失；③ **不要用 `_rate_limits`**（实测多次调用不留键）。

## AI 出口（vault / Worker）
- 浏览器 → EF `api-key-vault` → 上游；线上唯一生效字段 `bohai_model_configs.api_url`；vault 只说 OpenAI 协议（penalty/stream_options 必清洗，只解析 `choices[0]`）。CF Worker `cloudflare/gemini-proxy/`（改完 `npx wrangler deploy`）；Google 坑：frequency_penalty 400、reasoning_effort 仅 low 且不给 gemma、max_tokens≥512、错误是 JSON 数组。
- ⚠️ vault `unique(provider,purpose)` 遮蔽自定义上游；localStorage 配置在 vault 端不生效；配额预扣 stringify/4；限流 10 次/分/用户。
- ⚠️ **AI 面板不能「挂载即打开」**（焦点/取数挂 `watch(modelValue|visible)` 缺 `immediate`；补 `immediate` 也修不好）→ **先预热再打开**（await import → mounted → nextTick → 置 open）。改 AI 页必跑 `scripts/probes/probe-ai-panels.mjs`。

## 样式 / 主题
- `:global(.x)` 被 scoped 压 → 用 `:not()` 提特异性，勿加 important；子组件禁压父级变量 → `var(--x,40px)`。玻璃单源 `tokens.css`（`--liquid-*`）；禁 `content-visibility:auto`；空态统一 `EmptyState.vue`；设置面板用 `settings-glass.css` 的 `gs-*`。
- **sticky 坑**：全局 `body{overflow-x:hidden}` 使 body 成滚动容器 → sticky 永不吸附；修法：挂载时给 html 加类、卸载移除。暗色真源 `theme-manager.js` + 13 容器白名单。
- 首屏壳 = `app-*.js` 9 个静态 import；改骨架必跑 first-paint + shell-precache。红线：入口 CSS 必须 render-blocking `<link>`。

## 性能 / 缓存 / PWA（`docs/2026-09-20-*` 报告；探针在 `scripts/`）
- **SW 预缓存**：壳样式进预缓存，其余路由 CSS 由 `workbox.manifestTransforms` 移出 + CacheFirst —— **两半是一对**，删任一半会「有 HTML 无样式」，`check:shell-precache` 断言守。⚠️ manifestTransforms 入参是 `{url,revision,size}` 数组，须返回 `{manifest, warnings}`。
- `public/_headers` 线上**完全不生效**（Pages + CNAME）→ 这是 version.json/forceUpdate 存在的理由。
- 路由成本反解：扒 `app-*.js` 的 `__vite__mapDeps([...])`，扣 index.html preload 壳 = 增量。**依赖表看不见二级动态 import**。
- 版本更新：`buildId = commit + timestamp`（每次构建唯一）→ `version-checker.js` 在 `visibilitychange`/路由跳转时**绕过 SW 直接 HTTP 拉** `version.json` 比对，不同即自动 `forceCleanAndReload`。⚠️ **有 SW 安装中时 `unregister()` 会拖到安装结束才 resolve**，不能 await 到底。
- TWA：单源 `android-twa/twa-manifest.json`；**触发路径不含 src/**，但改 `vite.config.js` / `public/icons/**` / `.well-known` **也会触发 APK 构建**；包名签名永久不可换。Web Push 已实现未部署（库必须 `jsr:@negrel/webpush`，VAPID 须 JWK），与 Pushplus 会双发。

## UserSpace / 切换（`docs/2026-09-20-*` 审计 + 已落地）
- ✅ `boundaryErrored` 只在**真错误态**自增 boundaryKey（原监听 `route.path` → 换页整树重建、KeepAlive 全清）。⚠️ 只能挂 `route.path`，不能挂 `fullPath`。
- 分区单源 = URL `view`；`resolveSectionFromRoute` 遇「URL tab ≠ 当前 tab」**拒采信**。forumData 是 shallowRef → 感知态走 prop；主 feed 走 keyset 直查 posts（RPC 主列表不生效）。
- 探针坑：① 未过 `requiresLogin` 时走 `next(false)`+弹登录岛、hash 不变 → 「主内容类名变化」判据会命中 `boh-login-modal-overlay`；伪造登录每次测量前**幂等补打**。② `.community-forum-host` 是 `display:contents`（0×0）→ 判据落在真盒子根。③「返回耗时」测**数据就位**（在途请求落定 + 静默 500ms），DOM 出现恒十几毫秒。
- 分区过渡已成熟（`userspace-tab-in/out-*`）**不要重造**；`preloadSettingsSubPanels()` 的**模块说明符必须与 defineAsyncComponent 一致**。**生产构建剥掉 Vue 告警，「没告警」不能当依据**。
- 横屏左栏判据 landscape + ≥1024 + ≥600（3 处同步）；`probe-user-space-ia.mjs` 基线 79 PASS / 1 FAIL（既有）。`CommunityTab.vue` 有 **30s 轮询**。

## 活动 / 头像框
- 日期单源 `utils/activity-date.js`（禁 `new Date` 宽松解析）；slug 单源 `activity-campaign.js`；**发布后 slug/url 永久不可变**。
- 清单是 **DB 优先合并**（DB 行覆盖同 id 内置行）→ DB 一行 url 写错就顶掉仓库素材且无告警。
- 框 scale ≈ 1/内孔占比，按孔心裁切；`frameScale` 写错静默回落 1.24。画布 `setPointerCapture` **必须 try/catch**（否则白屏）；手势只能用 CDP `Input.dispatchTouchEvent`。

## 测试约定（vitest）
- ⚠️ 禁止「固定 tick 数」放行事件循环（setImmediate 属 check 阶段）→ 用**条件 + 真实时间上限** `waitUntil(() => …, 5000)`；等假定时器用 `vi.getTimerCount() >= 1`。
- ⚠️ 未 await 的 promise 会级联污染下一用例 → `afterEach` 先 `await setImmediate` 再 `useRealTimers()`。
- 判「偶发」前先做**因果实验**（参数改极端 + 临时文件复跑），复现不出就别称根因。
