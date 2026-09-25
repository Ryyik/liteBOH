# BOHLITE 长期记忆（只放硬规则/易踩坑；细节见日期日志与 docs/plans）

## 环境 / 探针
- hash 路由；dev 只听 IPv6 → `http://[::1]:5173`。构建验证 `vite build --outDir dist-check`（**勿动 dist**）。
- playwright：`channel:'chrome'` + `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；1 browser + 每场景新 context；同一 path 只注册一条 route（**按注册逆序匹配 → catch-all 最先注册**）；mock Supabase 必回 `Access-Control-Expose-Headers: Content-Range`。
- 伪造登录：注 pinia（合法 UUID），禁种 `sb-*-auth-token`；切路由用 `location.hash`。首页探针须预置 `boh-home-gate-passed`（24h 时间窗）才跳过开场画。Vite 的 `vite-error-overlay` 会拦点击 → `addInitScript` 定时清除。
- 本机 zsh `grep` 多模式 `\|` 静默失效 → 一律用专用搜索工具。改完必反证：stash→记红→pop→复跑全绿。有些探针本身抖动（`probe-home-revamp` 42~46/46、失败集每次不同）→ 判回归前先跑不含改动的基线。
- vitest：禁固定 tick → `waitUntil(...,5000)`；沙箱/CI 必加 `--pool=forks`；npx 可能被 SIGTERM → 走 `./node_modules/.bin/<tool>`。

## CSS 动效（高频坑）
- ⚠️ **`animation-fill-mode: both` 会让该属性从此「不可过渡」**：移除动画 + 同帧改该属性时浏览器不启动 transition，值一帧瞬跳（表现是「没有动画」而非报错）。判据：`getAnimations()` 为空且加类瞬间 computed 已是终值。凡「入场用动画、离场用过渡」的组合几乎必然失效 → 离场也用关键帧动画。
- 动效单源 `tokens.css`：`--ease-out/-in-out/-emphasized/-standard/-drawer` + `--duration-*`（≤500ms）。Vue scoped CSS 会给选择器加 `[data-v-*]`（**+1 特异性**），算特异性时别忘了。
- `prefers-reduced-motion: reduce` 块里有 `animation/transform: none !important` 的组件，回收态要另补「纯淡出」终值，否则 reduce 用户看到的是「到点消失」；补 opacity 别加 `!important`（撞棘轮）。

## 网络 / Supabase
- `github.com` HTTPS 被 SNI 阻断 → push 走 SSH（`ssh.github.com:443`，remote `git@github.com:Ryyik/liteBOH.git`），抖动重试；`api.github.com` 直连可通。兜底 `scripts/push-via-api.py`（默认干跑，`--apply` 才推，保留代理变量）。
- `api.supabase.com` / `<ref>.supabase.co` 直连不通 → 走代理；5432 时断 → 迁移走 Management API（`read_only:false`）+ 手写 `schema_migrations`（同事务）。EF 验证走 DB 侧 `net.http_post`。CLI 已登录（查部署首选）；`secrets set` 一次一个；「EF 有没有被调用过」看 `pg_stat_statements`（扣探针），`logs.all` 不可判。凭据在钥匙串 `Supabase CLI`。ref `nplnlefdwfgtyimfkyih`；迁移名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst,'reload schema'`。`vite preview` 与代理冲突 → 依赖 preview 的探针跑不了。
- 授权（安全核心）：撤 EXECUTE 必须 `from anon, authenticated, public`；表级撤 anon 即可。撤权优先于 drop。普通用户路径函数只能撤权、不能加 `auth.role()` 门。`alter default privileges` 管不住 supabase_admin 默认 ACL → 护栏 `scripts/check-anon-execute.mjs` + baseline 棘轮。撤权前五查：pg_depend / `pg_get_functiondef` 全库扫 / EF / 前端调用点 / RLS。新表 revoke 后 grant anon+authenticated（漏 anon→42501）。凭据走 Vault；EF 在请求处理内读 `Deno.env.get()`（顶层读被缓存）。drop 列前全库 grep + 迁移后冒烟。09-22 复检：anon 可执行函数 232→155、可写表 75→0；待办二阶段 5 项撤权 + GoTrue `password_min_length` 仍 6。
- RPC 静默失败套路（09-25 抽奖报名挂 17 天）：`exception when others` 吞错 → 审计表只留通用 code。审计表取 code → 导出线上 `pg_get_functiondef` → DO 块分步复现 → 修完把 `sqlstate` 落审计表 message。

## 路由 / 页面结构
- ⚠️ `App.vue` 非 keepAlive 路由 key = **`route.path`**（仅 3 个 keepAlive 走 `route.name`）。不可回退 `fullPath`（同 path 换 query 会整组件重建 → 状态归零 + onMounted 补发取数覆盖筛选），也不可用 `name`（`/news/1→/news/2` 不重建，而 `NewsDetailPage` 无 watch params）。护栏 `tests/unit/global-error-boundary.test.js` + `probe-dm-lottery-entries-jump.mjs`。同页换 query 的页面必须自带 watch/computed；跳转携带的状态别只放 ref（`composables/useAdminTabIntent.js`，3s TTL）；**实时输入搜索不许写 URL**。
- 分页总数与全表计数必须分槽：`tabQueryTotals`（列表 count，含筛选，分页只读它）vs `tabTotals`（概览 RPC 全表计数）。

## 论坛 / 首页 / 横屏左栏
- 论坛**规范化入口 = 首页 `/`**：顶栏「社区 → 论坛」= `/?view=latest`，底栏「方块」= `/`。底栏/左栏 items 单源 `config/bottom-nav.ts`（方块/我的/资产/消息/设置）。
- 横屏左栏（`UserSpaceSideRail` + `side-rail.css` + `landscape-rail.css`）现挂**三处 shell**：`.user-space-page`(`body.page-userspace`)、他人空间(`.profile-page`/`body.page-userprofile`)、**首页论坛层(`body.page-home`，09-25 补)**。判据：`display:none` → landscape+≥1024+≥600（88px）→ landscape+≥1280+≥600（240px）。
- 新 shell 复用左栏要逐个补：`--userspace-rail-w`、`.userspace-rail` 改 **fixed**（长文档流页必改，否则 rail 被拉满整页）、内容让位、`--rail-*` 淡染（亮+暗）、顶部导航以内容区居中（`left: railW/2`）、发布会话 overlay 左缘收栏宽 + 隐藏内嵌编辑器/周签到。首页开场画在场时用 `body.page-home:has(.home-gate)` 先藏左栏。护栏 `probe-home-forum-rail.mjs`(21) + `probe-rail-landing.mjs`(45)。详见 `docs/2026-09-25-横屏左栏与登录回收修复.md`。
- 分区七席单源 `config/forum-sections.ts`，分区单源 = URL `view`；横屏帖子详情走弹窗（`usePostDetailModal` + `utils/forum-viewport.js` 判据）。
- ⚠️ `ForumMain` 里 `watch(...,{immediate:true})` 不得同步调用下方 `const`（TDZ → 错误边界）；延迟用 `Promise.resolve().then(...)`。
- 活动：日期单源 `utils/activity-date.js`；slug 发布后不可变。

## 头像框（归属 + 控制台）
- 归属唯一出口 `is_avatar_frame_owned_by` 四条来源：①`tier=free` 全员 ②`free_until` 限免 ③`user_avatar_frames` 台账**按人** ④订阅档位达标。「只给某些人」只能走 ③。
- **按人发放唯一写入口 = `grant_avatar_frame(user, frame, source)`**（管理员；表 RLS 只开 SELECT）。幂等且不覆盖原 source。撤销用 `delete`，先确认 `source <> 'points'`。发放区支持**搜用户列表**（复用 `searchGrantTargetUsers`，点选直接用 id、不再按用户名反查 → 同名不会发错人；手填 UUID 仍兜底）。探针 `probe-avatar-frame-grant.mjs`（23）。
- ⚠️ `tier=limit` = 活动限定（不参与档位比较）；**新增 tier 值必须同步 `avatar_frame_tier_rank`** —— `else` 返回 **-1**，用户 rank ≥ 0 → 第④条恒真 → 全员自动解锁。
- ⚠️ 控制台 `AvatarConsole`：`hasRealAlpha` 按**像素事实**判（alpha<250 占比 >2%），文件头 `hasAlpha: yes` ≠ 有透明区。**素材层变换必须走 `frame-geometry.js` 的 `layerTransform()`**，手拼 transform 会因 `metrics` 早退缺 `k` 塌成 0×0 → 素材不可见。抠白底 `resolveWhiteBackground(244)` 只清四角/中心连通白。
- ⚠️ `avatar_frames.scale` 是 `not null` 真实读数：测不出内孔时 NaN → 保存必 23502（**草稿凭空消失**的真相）→ 未测出内孔时「存草稿」禁用（原因写按钮 title），只改元数据时沿用该行已有 scale。锚点由 `anchorPoint()` 唯一实现（无孔回退图片中心），`layerTransform` 与 `bakeFrame` 共用。探针 `probe-avatar-frame-console.mjs`（44）。

## Cloudinary 台账（cloudinary_pending_uploads）
- 是「上传归属台账」非队列：删图 EF `filterOwnedCloudPublicIds` 查它 → 不能删表/硬删行。`claimed_at is null` ≠ 可清理。真该清：`source='forum' and claimed_at is null and created_at < now()-7d`。

## 注册 / 认证 / Push / AI
- GoTrue：gmail 剥 +tag；未确认登录报 invalid_credentials；`verifyOtp({type:'recovery'})` 只发 PASSWORD_RECOVERY。密码下限 8 位唯一真源 `src/utils/auth-validation.js`（Deno 副本 → 门禁 `check:auth-validation`）。注册 = 三步向导，通行密钥在 Step3 收意图、完成页执行。
- Push：notifications 触发器 → push_outbox → pg_net → EF `push-send` → `push-sw.js`（**必须经典脚本**）。VAPID 必 `jsr:@negrel/webpush`；单 secret `VAPID_KEYS_JSON`；SUBJECT 必须 mailto:；`navigate` 绝对 URL。iOS 仅 PWA 内可订阅；绝不自动 unsubscribe。
- AI：EF `api-key-vault` → 上游；唯一生效字段 `bohai_model_configs.api_url`；只走 OpenAI 协议（只解析 choices[0]）。Google：frequency_penalty 400、reasoning_effort 仅 low。限流 10/分/用户。改 AI 页必跑 `probe-ai-panels.mjs`。
- 上游 = 多平台各一把 key（`api_keys` onConflict provider+purpose，无同平台 key 池；解析链 DB→env，`index.ts:864`）。09-24 定调 P0 = EF 内跨平台候选链（`fallback_chain` jsonb，仅 429/5xx/超时且首 chunk 前重试）+ openrouter 叠加 `models`；Portkey = P1（未实施）。
- ⚠️ **降级必须档位感知**：模型绑定是收费承诺。候选须显式配置 + `tier_semantics`（equivalent 静默切 / temporary UI 明示）、按实际 `quota_multiplier` 扣、档位隔离（premium 禁混低档、free 永不升档）。默认空链 = 行为不变。

## 样式 / 主题 / 性能 / PWA / CI
- 玻璃单源 `tokens.css`（`--liquid-*`）；子组件禁压父级变量（用 `var(--x,40px)` 兜底）；空态 `EmptyState.vue`。暗色真源 `theme-manager.js` + 13 容器白名单，`check-dark-tokens` 观察模式。
- 首屏壳 = app-*.js 9 个静态 import；底色纯白三处同步（`tokens.css --boh-page-bg` + `index.html .boh-boot` + `Home/style.scoped.css`，`check:first-paint` 断言）；暗色暖炭 `#16120e`。首页 `/` = 一次性街景开场层（`.home-gate`）。
- 锁滚动别新增 `!important`（棘轮当前 1319/1319，新增要同步 `important-budget.json`）。CI 链序：views→structure→liquid-glass→important-budget→dark-tokens→first-paint→build→shell-precache→bundle。
- ⚠️ CI 红了先分层：Lint/Build 绿、只有 deploy 秒挂（`due to in progress deployment`）= **Pages 部署撞车**（连推两提交造成），**不是构建失败** → `gh run rerun <id> --failed` 即转绿；已补 `concurrency: {group: pages, cancel-in-progress: false}`。本地验证要用 `npm run build:ci`（`vite build` 不含 lint/vue-tsc）。
- SW 预缓存两半一对（壳样式 + manifestTransforms），删任一半「有 HTML 无样式」。TWA 单源 `android-twa/twa-manifest.json`。
- ⚠️ `node-fetch` 必须留在 `vite.config.js` 的 `resolve.alias`（指向 `scripts/shims/node-fetch.browser.js` 空实现）：tfjs 的 Node 分支留着 `require('node-fetch')`，一被解析就进 `lib/index.mjs` 的 `import https from 'https'` → `Failed to resolve entry for package "https"` + **整页报错遮罩（吃掉所有点击）**，并拖死 tfjs chunk（图片审核不可用）。**只靠 `optimizeDeps.exclude` 不够**（实测真被 import 时返回 HTTP 500）。护栏 `probe-vite-dep-scan.mjs`（6 断言）。
- sticky：全局 `body{overflow-x:hidden!important}` 使 body 成滚动容器致 sticky 全灭 → sticky 叙事页必须挂 `html.<页>-scroll body{overflow:visible!important}`。
- 键盘：`--kb-inset` 真源 `useKeyboardInset.js`（写 documentElement，阈值 120px），三处 P0 已接线。⚠️ `.bohai-page` 高度**三处**真源（adaptive-layout + shell-header + `style.css` 的 `body.page-aichat` 覆盖链）→ 改高度三处同步。`100dvh` iOS 不随键盘缩；`interactive-widget=resizes-content` 不能单独加（会翻转 599/600px 断点）。PostDetail `--pd-dock-inset` 是连续跟随语义，勿与 kb-inset 合并。探针 `probe-keyboard-inset.mjs`。

## BOH AI 心理访谈 / 热力图 / 订阅页
- ⚠️ 访谈两条激活路径只有一条初始化状态机：`expertState` 唯一写入点 `BOHAIMain.vue:1898`（路径 A）；`BohaiSettingsPanel.vue:119` 选风格是路径 B（不建 expertState，状态机/守门/封闭域全 false）—— 未修，属产品决策。守门重写须「严格更优」才采纳（硬 3 分/软 1 分）；`expertState` 是显式白名单，新字段不登记被静默丢弃。封闭域：检索/联网/记忆全关。访谈跑 `pro`、temperature 0.18（需单独 profile）。减约束顺序：先量 guardStats → 调阈值 → 才删 prompt 副本。
- `/about` 热力图：7×53 矩阵（cell 尺寸容器实测反推，53→26 降级）、**动态四分位分档**（写死阈值会让低频仓库整图偏浅）、缓存 6h + 静默刷新 + 403 提示；measure 读外层 frame 宽（勿读网格自身 → 循环锁定）。探针 `probe-heatmap-tiers.mjs`。待办：国内访客首访 error → CF Worker 代理。
- 订阅页权益单源 `utils/subscription-benefits.js` 五常量（卡片与对比表都由它生成，勿手写第二份）。保底口径 = RPC `get_my_lottery_pity_status` 的 consecutive_losses（连续未中奖**场**、中奖清零、达标兑保底礼；Free 可抽不计保底，勿写「抽够必中」）。守门单测 7 条 + `probe-subscription-benefits.mjs`(37)。
