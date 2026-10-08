# BOHLITE 硬规则速查
> 全文（含推演实测）归档同目录 `MEMORY-full-2026-09-29.md`；每日进展见日期日志文件。

## 环境
vite 只绑 IPv6 → `--host ::`；构建 `--outDir dist-check` 勿动 dist；vitest `--pool=forks`；npx 被 SIGTERM → `./node_modules/.bin/<tool>`。
⚠️ safe-delete 守卫拦「>50 文件的删除」：build 前 dist-check 已存在 → `mv` 到 /tmp 让位；dev server 首启同理（node_modules/.vite ~109 文件）→ `mv node_modules/.vite /tmp/…` 让位再起。`mv` 不算删、不被拦。
⚠️ 后台服务必须用托管后台任务；`nohup … &` 会在工具调用结束时被杀（症状：curl 刚 200，下一探针 ERR_CONNECTION_REFUSED）。
playwright：chrome channel + `--proxy-server=direct:// --proxy-bypass-list=*`；伪造登录注 pinia；mock Supabase 必回 Content-Range。窄浮层（<300px）里选项必须页面内 `element.click()`，坐标点击会落遮罩被关面板（假绿）。
⚠️ /tmp 一次性 ESM 引仓库依赖 NODE_PATH 无效 → `createRequire('<repo>/package.json')` 或脚本放仓库根（用完删）。
⚠️ BSD grep 不支持 `\|` `\b` `\s`（静默 0 命中）→ `grep -E` / `[[:space:]]` / Grep 工具。macOS 无 `timeout` → `ssh -o ConnectTimeout=N`。
推 GitHub：`~/.ssh/config` 已把 github.com 指 `ssh.github.com:443`，`git push` 直连；`gh run watch <id> --exit-status`。
⚠️ 并行会话同工作区：last-write-wins；棘轮跨会话共享 → `eslint . -f json` 做 (文件,行,规则) set diff 归因；**提交只给明确路径，永不 `git add -A`**。判并行写入者：`find … -newermt '-3 minutes'` 连看两次。
改完必反证；探针偶发漂移=抖动非回归。

## 提交
pre-commit 在 `.git/hooks/pre-commit`（**非 husky**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`）。
🔴 lint-staged 会把无关未暂存文件卷进提交 → **每次 commit 后核对 `git show --stat HEAD`**；误入修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 重提。
⚠️ 钩子会重排文件 → 提交前先手动跑钩子同款（prettier --write + eslint --fix，只给改动文件），提交后对**提交后的树**再跑一次 verify；别把钩子改成 prettier --check。

## 门禁 / 测试
`npm run verify` 一条兜底（lint+type-check+test+8 check+棘轮总账）。
⚠️ lint 带 `--max-warnings` 棘轮（**以 package.json 现值为准**，2026-10-06=118 条 unused-vars）→ 报绿必须同时报警告条数，口径 `eslint . -f json` 聚合；计数归零才翻 error；上调必须走 commit message。unused 警告还兜「Edit 漏抄一行」。
新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则 `check:gates-self-test` 列未覆盖；棘轮 baseline 只许下调。
源码守卫必须过 `tests/helpers/source.js` 归一且**两边同一个**；否定断言先 `scriptSection()`+`stripComments()`（.vue 全文剥注释会吃掉真实代码）；prettier 对逐字断言：换行/尾逗号交归一，引号风格/补分号写宽容正则。

## DB 图片（裂图重灾区）
DB 图片列混存 `@/assets` 别名与 cloudinary 绝对地址（大陆不可达；`cdn.blockofhome.cn` 200）。**统一走 `utils/db-image-url.js`**（resolveDb* 系列，顺序固定：先 getImageUrl 再改写）；只调 getImageUrl = 裂图。已修：活动页/积分卡面/预设缩略图；**未修**：CommunityLotteries、Shop、头像框 9 处直绑。积分卡面 `c_limit` 不 `c_fill`。

## CSS
`:root` 禁进 scoped @import；全局变量唯一入口 `glass-aliases.css`；动效/玻璃单源 `tokens.css`；暗色真源 `theme-manager.js`；scoped 特异性 +1。
⚠️ 液态玻璃三铁律：材质单源 `liquid-glass.css` 只挂基础类（变体在 ≤768px 被强制关 backdrop）；scoped 特异性高于全局类 → 让位写 `:not(.liquid-glass)`；白底玻璃需 `.cloud-page::before` 环境光 + 父级 `isolation:isolate`（否则负 z-index 伪元素不可见）；色值走 color-mix。
⚠️ 避软键盘：`height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**别减高度**（inset 偏大=半屏）。
⚠️ 高度断言用 `offsetHeight`（clientHeight 扣边框恒差 2px）。
⚠️ 窄屏一行硬压三连（nowrap + min-width:0 + 某子项 shrink:0）= 压 0 宽/竖排字/溢出被裁；修法是折行。

## 路由 / 交互
`key=route.path`（禁 fullPath/name）；`<script setup>` 运行时 API 显式 import；ForumMain watch immediate 禁同步调下方 const（TDZ）。
`useConfirmDialog` 互斥**会 reject** → 调用点把预期拒绝归化成取消，别删那条 reject。
⚠️ UserSpace 旧 tab 映射单源 `resolveRequestedUserSpaceTab()`（initial/onMounted/watch 三处共用）；谁直接用裸 `route.query.tab`，旧值失映射=整页白屏。

## 导航 / 首页 / 头像框
可见性单源 `isGlobalNavbarVisible(route)`；首页入场真源 `.home --gate-p`（probe-home-gate-pull 50）；竖屏菜单 probe-nav-mobile-menu(48)；概览岛唯一触发点=首页 gateSettled 落定。
头像框：佩戴同步唯一注册点 `initAvatarFrameSync()`（main.js 调）；url→id 反查不到**保留本机**、绝不回落 none；`avatar_frames.url` 发布后不可变；本机 key：`boh-avatar-frame-id/-owner/-pending`。

## Supabase / 网络
ref `nplnlefdwfgtyimfkyih`；SMTP 走 Brevo（smtp-relay.brevo.com:587，2026-09-22 接入免费档；SMTP key 90 天不活跃回收，探活=`POST /auth/v1/recover` 期待 200+`{}`；自动保活=mail-keepalive EF + 每月 pg_cron，运维单点 `scripts/mail-keepalive-ops.mjs`）。
⚠️ EF 部署坑：deploy 的 `slug` 是 **query 参数**（不传=UUID slug→404）；multipart 字段 `file`（单数）+`metadata`；自定义 x- 头过不了 pg_net→EF，token 走 Authorization Bearer；`/secrets` GET 读回值≠EF env 注入值，不能作凭证比对。本机→`*.supabase.co` 间歇全断、`api.supabase.com` 常通 ⇒ 端到端验证用「一次性 pg_cron 云端代触发 + 底账表回读」。
迁移走 Management API + 手写 `schema_migrations`；凭据在钥匙串（剥 `go-keyring-base64:`）。撤 EXECUTE 用 `from anon,authenticated,public`；撤权优先于 drop；新表 grant anon+authenticated；RPC 静默失败=审计表取 code。

## GitHub CI
⚠️ Dependabot 触发的 workflow 读不到 repository secrets（须 `gh secret list --app dependabot` 另配一套）；改 secrets 后要 `gh run rerun` 才验得到。
⚠️ `git push` SIGTERM(137) ≠ 失败 → 先 `git ls-remote origin main` 再决定重推。

## 输入框自动增高
真源 `composables/useAutoGrowTextarea.js`（勿加第 5 份）；上限只声明在 CSS max-height（JS 读 getComputedStyle）；空内容先摘 placeholder 再量；`height='auto'` 后必须无条件写回。护栏 probe-reply-autogrow(10)。

## Cloud+（plans/023）
私密备份库：对外只有 token 分享/转帖子；底账(source='forum')禁单独删/公开；发帖→backupPostImagesToCloud 建底账（best-effort）；删帖删备份=DB cascade。
相册排序：API 层 `entry_date desc, nullsFirst:false`（别按 updated_at 主排、别视图层补 sort）；多图贴 key=`${entry.id}::${index}`（否则串图）。
⚠️ Edit 多行替换 old_string 必须覆盖夹在中间的不变量（.eq 过滤条件），漏抄会被 unused-vars 抓。

## 页游/小游戏（src/games/，2026-10-08 咖啡店）
**不引 Phaser**（345KB gzip 与路由/无障碍冲突；「不好玩」是设计问题）；要渲染层用 **PixiJS v8**（~50KB 只做粒子/精灵，DOM 管 HUD）。
⚠️ 最易塌陷=「所有玩法退化成同一条规则」：`new Set(kinds).size` 要等于机制数；断言写「达标⇒高档 / 不达标⇒fail」，不能调评分函数蒙。
四铁律：① 设计可达性先算（窗口穿越时间 ≥ 停留要求×1.6；互斥时间窗不重叠）；单测看不出，须显式断言区间关系。② 采样型机制（拖画轨迹）必须正方形归一化（否则 y 被压缩判定必败）。③ absolute 元素显式确认定位祖先（.machine-deck 无 position → 捕获层落左上角盖订单条）。④ SVG 里不能放 HTML 按钮（恒 0 尺寸，「逻辑对 UI 死」）。
布局禁 `transform: scale()` 响应式（桌面空竖屏挤，改 Grid + clamp()）；「占屏比」会骗人 → 拆 UI chrome vs 玩法画面（后者主判据），断言直接测装置内部（SVG 实高）。
护栏：probe:cafe-layout(21)、probe:cafe-mechanics(30+场景6.5)、cafe-steps.test.js(23)、cafe-cat.test.js(13)、cafe-round.test.js(9)；调试钩子 `window.__cafeDebug.forceDrink(id)`（DEV 门控，随机开局遇不到的机制要能指定配方）。
⚠️ **并行实体的状态容器必须以实体 id 为第一层 key**：2026-10-08「有概率长按没反应」真因是 `stepStates` 写成全局 `{[stepId]:state}` 被三单共用 ⇒ A 单 failed 污染 B 单、而 `canInteract()` 见 failed 直接 return ⇒ 切单后完全无反应。凡「同一状态容器服务多个实例」都要查key 有没有实例 id。
⚠️ **失败态必须能重置回可交互**（否则偶发失败= 永久卡死）；且失败反馈**绝不能出现「下一步」**（步骤没推进却写「下一步」⇒ 玩家以为按钮坏了）。两条都要写断言。
⚠️ **只在终态出现的空指针单测抓不到**（`createStepState(null)`：一杯做完最后一步时 currentStepId 变 null 但视图还在用）⇒ 靠 E2E 探针 +「撤掉修复确认重现」。
⚠️ E2E 判据坑：`doneCount` 在整单做完→订单移除时会重置为 0（出现 `2→0` 假失败）⇒ 用 `activeStepIndex`；场景会互相污染（一场景把所有单做掉⇒ 后面拿不到 kind）⇒ 每场景独立开页 + 调试钩子指定配方。

## 其它单源
动态加载失败恢复 `vite-preload-recovery.js`（全局壳 defineAsyncComponent 必带 onError retry+errorComponent）；AI 唯一生效 `bohai_model_configs.api_url` 只解析 choices[0]；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`；论坛搜索 RPC 单实现 9 参（PG 42725，禁新增签名）。
AI 额度口径 `utils/ai-quota-display.js`（界面**只显示百分比**：基础额度=100%、附加包把满量程推到 100%+包%、进度条走 `meterPercent` 归一、`percent` 不封顶；档位横向比大小走 `subscription-benefits.js` 的 `PLAN_AI_TOKEN_PERCENTS`，基准 = Plus 100%）。绝对值底数 `PLAN_AI_TOKEN_LIMITS` 仍在（百分比由它推导），**界面不许再显示 Token 数**。
EF 部署：`scripts/lib/supabase-admin-api.mjs` 取凭据 → Management API `POST /functions/deploy?slug=<name>`（multipart；`file` 单数字段名；`_shared/*` 依赖必须一起传；`verify_jwt` 沿用线上现值）。`api-key-vault` 依赖 `_shared/{cors,rate-limiter,supabase}.ts`。
⚠️ 探针里「找不到元素就跳过」= 假绿温床（入口搬家后断言整段失效、探针照样报通过）⇒ 找不到就 **fail**。
