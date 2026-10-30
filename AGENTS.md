# AGENTS.md — 给 AI 编码助手的入口

> 本文件不是新规则，**是已有规则的索引**。规则真源在 `PROJECT_MANUAL.md`（完整手册）和本文件引到的各单点定义里。
> 写在这里的每一条，都能在仓库里找到产出它的那次事故或那个文件；不要凭直觉推翻。

## 0. 项目一句话

Vue 3 + Vite 7 + Supabase 的 SPA，hash 路由，产品名「方块之家 BOH」，迭代代号 Beta 2.5 / Beta 6。
`src/` 576 个源文件（.vue/.js/.ts），272 个脚本（`scripts/*.mjs` 59 + `scripts/probes/*.mjs` 213），275 个单元测试文件。
（2026-10-20 随活动页与节目页并入 /newsroom 退场下调；这三个数由 `npm run check:doc-truth` 实时对账，写错/过时会被 verify 拦下——别手改估计值。）

三条最高纲领：

1. **单一真源** —— 同一条规则、同一个数字只应有一处定义。发现「改一处要动四处」，那是缺陷，不是工作量。
2. **改完必须自证** —— 跑对应门禁/探针，跑绿才算改完。判「红」之前先跑一遍无改动基线。
3. **破坏性操作先确认** —— 权限回收、变更表结构、部署 Edge Function、对外发布，都要先跟人确认；读代码、跑只读查询、改本机文件不需要。

## 1. 上下文预算不够时，按这个顺序读

| 优先级 | 读什么 | 什么时候 |
| --- | --- | --- |
| 必读 | 本文件 | 每次 |
| **必读** | **`docs/AI-ENV.md`**（环境坑 10 条 + **并行会话纪律** + 开工三步） | **开工前**，或任何"命令行为很怪"的时候。2026-10-15 提上来的：里面每条规则**每次会话都会踩** |
| 按需 | `docs/gate-matrix.md` | 改了某块代码要查「该跑哪个探针」的**事故级坑记录**时（AGENTS.md §2 该行会写「见 C-n」）；也放着门禁自证纪律与 CI/DB 两道线上门禁的细节 |
| 按需 | `PROJECT_MANUAL.md` 第 6 节（AI 修改指南）、第 8 节（表结构） | 改数据层或首次接手模块 |
| 按需 | `docs/PROBES.md` | 需要跑浏览器探针自证时 |
| 按需 | `docs/规范体系设计-2026-09-28.md` | 想知道「规则怎么才算生效」「为什么有些门禁是棘轮」「AI 交付必须提供哪些证据」 |
| 按需 | `plans/NNN-*.md` | 动效、左栏、搜索等已有既定方案的领域 |
| **接手 / 续做** | **`docs/未完成任务清单.md`** | 想知道「现在有哪些半成品、下一步该做什么」（**活文档，不按日期分文件，有新进展直接改它**） |
| 回溯 | `.workbuddy/memory/MEMORY.md` 与同名目录下的日期日志 | 想知道某条规则为什么这么定 |

## 2. 改动 → 必跑门禁（不许跳过）

`npm run verify` 是一条命令兜底（12 道 check → lint → type-check → test，末尾附**棘轮总账**，fail-fast：最贵的排最后，不需要构建）。
只改 CSS 或小改动用 `npm run verify:fast`；发布前用 `npm run verify:full`（含构建与产物门禁）。

> ⚠️ **判绿之前先确认门禁真的有牙**。这个仓库出过两次「检查在跑、但永远绿」：
> `check-project-structure` 曾只过滤 `.js`（路由全是 `.ts`，53 条一条没查）；`check:dark-tokens` 曾跑在观察模式（总量上升只打 ⚠️ 不 exit 1）。
> 两者都表现为「CI 全绿」。**改门禁或加门禁之后，跑 `npm run check:gates-self-test` 自证。**
> 它会给每条门禁注入一个已知违规样本、断言退出码非 0、再撤销；样本写在 `scripts/lib/gate-fixtures.mjs`。
> 没有 fixture 的门禁会在输出里被列成「未覆盖」——那是**明账**，不是可以忽略的噪声。

> ⭐ **两道「线上库」门禁**（`check:db-lint` 查函数体运行期必错、`check:db-advisors` 查提权/RLS，均为棘轮）：
> 发布前跑、**刻意不进 `verify`** —— CI 没有 Management API token，接进去只会永远降级跳过 = 假门禁。
> ⚠️ 底线只有一条：**不要把 `check:db-lint` / `check:db-advisors` 接进 `verify` / `build:ci`。**
> 首跑战绩（一次抓出 6 个线上坏函数）与基线维护细节 → `docs/gate-matrix.md` §A。

> ⭐ **CI 侧四件**：CodeQL（`security-extended`，每周一定时跑）、Dependabot（minor/patch 分组、**major 一律人工**）、
> `deno check`（**2026-10-13 起为阻断门禁** —— 不许把 `continue-on-error` 加回来）、
> `security:audit`（依赖漏洞棘轮；**改依赖清单才阻断、否则告警**，新公告由每日定时审计开 issue 兜底）。
> 四者的取舍与侦察依据 → `docs/gate-matrix.md` §A 与 `docs/2026-10-04-GitHub开源可引入方案调研.md` §8。

> ⚠️ **`verify` 绿 ≠ 干净**：`npm run lint` 带 `--max-warnings`（**现为 90**，以 `package.json` 现值为准；
> CI 与发布链都跑它，所以有牙）。这是一道**警告棘轮**，**新增一条死代码当场 exit 1**。
> 三条纪律：① 清理后把 90 改小（下调永远是好方向，不用交代）；② 确需上调必须走 commit message 说明理由
> （与 `check:important-budget` 等棘轮同规矩）；③ 计数口径 `eslint . -f json` 聚合，**别 grep 文本数**（会串）。
> 🤖 **归因用 `npm run lint:delta`** —— 一条命令告诉你新增了哪一条、在哪个文件哪一行、离上限还剩几格，
> 别再手工 set diff。为什么它是棘轮而不是直接把规则翻成 error → `docs/gate-matrix.md` §A。

| 你改了什么 | 除了 verify，还要跑 |
| --- | --- |
| `.github/workflows/**`、部署链路 | `npm run build:ci` |
| `src/App.vue` 路由、`<RouterView>` | `npm run probe:route-switch` |
| 首页 / 底栏 / 左栏 / 论坛入口布局 | `node scripts/probes/probe-home-forum-rail.mjs`（21 断言）、`node scripts/probes/probe-rail-landing.mjs`（45）、`node scripts/probes/probe-rail-more-menu.mjs`（16） |
| **横屏左栏「更多」浮层**（主题 / 退出登录的弹出菜单，窄栏 88px 下必须完整可见） | `node scripts/probes/probe-rail-more-menu.mjs`（16，四宿主 + 一条反证自检）。⚠️ 一条已实测的坑：**绝对定位的浮层不能脱离滚动容器这件事不能想当然** —— `.userspace-rail-scroll` 是 `overflow-x: hidden + overflow-y: auto`，任何非 `visible` 都会把后代裁到自己的 padding box；88px 窄栏下 172px 的浮层只剩 68px 可见（用户看到的「深色模式」→「深」、「退出登录」→「退」）。**240px 宽栏恰好不暴露**（滚动容器 215px > 172px）⇒ `probe-rail-landing` 的菜单断言全绿也测不出来。修法是让浮层与滚动容器**平级**（都是 `.userspace-rail` 的子元素），并注意「不被祖先裁」≠「看得见」—— 窄栏下浮层要向右越出栏、压到内容区上，所以断言必须同时做 `elementFromPoint` 遮挡检测。⚠️ 顺带一条：`contain: paint`（`.liquid-glass` 基础类）同样会裁后代，左栏靠 `side-rail.css` 的 `contain: none` 让位 —— 改左栏材质时别把它删了 |
| **横屏左栏「发布会话」闸门**（左栏「发布」的选中态；会话开着时切落点 / 点「搜索」必须先弹「保存草稿」确认再走，**不许遮罩残留**）。两个宿主都要过：首页 `/` 与 `/user-space?tab=community` | `node scripts/probes/probe-composer-session-gate.mjs`（26）。⚠️ 四条已实测的坑：① **「加了 class 但看不出选中」是假绿** —— `.userspace-rail-item.active` 那条规则（`background: transparent`）与 `[data-rail-action="compose"]`（实心主操作蓝）**同优先级**，后者在源序更靠后 ⇒ 光加 class 视觉零变化。选中态必须走独立通道（现为 `box-shadow` 光晕），断言也要抓**视觉值**（基线 `none` → 选中非 `none`），别只断言 class；② 会话的关闭链是 `closeMobileComposer`（`ForumMain`），**只有它**会按 `hasUnsavedChanges()` 弹「保存草稿」；外层一律经 `closeComposer()` → `dismissComposerSession()` 收口，且必须 `await` 完再导航（有脏内容时 Promise 挂到用户点完为止，极性是「先收会话再导航」）；③ 首页那条线的短路顺序是坑：`handleBottomNavClick` 里「已在论坛就回顶部」的提前 return **必须在闸门之后** —— 首页的 `activeBottomNavId` 恒为 `community`，而左栏「内容」那一席的 id 正好也是 `community` ⇒ 闸门写在短路后面等于永不生效（用户报障「点内容不弹草稿确认、只看到一层遮罩盖着页面」的真因，2026-10-11）。会话状态真源只有 `ForumMain` 的 `isMobileComposerOpen`（`composer-state` 事件 → `ForumSectionShell` 透传 → 父层），**别在父层自己推状态**；④ **`closeMobileComposer` 必须先判 `isMobileComposerOpen`**（2026-10-18 用户报障「点内容/点我的无故弹保存草稿」，编辑器根本没打开）：`hasUnsavedChanges()` 量的是「编辑器里有没有字」，而 `restorePostDraft()` 会把上次草稿回填进 `newPost`（mount / 登录 / 换账号都会跑）⇒ 只要存过草稿，`newPost` 就长期非空，每次导航都被当成「正在离开编辑器」；选「保存」还会原样再存一次，永远解不掉。`handleBeforeUnload` 里 `!isMobileComposerOpen.value ||` 那条短路就是正确写法，照它补。探针 G 组专测这个洞（A–F 全都先点「发布」开会话，测不出来） |
| 首页首屏拉动 / 落定动效 | `node scripts/probes/probe-home-gate-pull.mjs`（50） |
| 导航栏可见性 / 灵动岛 / 全局搜索 | 先改唯一真源 `utils/global-navbar-visibility.js` 的 `isGlobalNavbarVisible(route)`；再 `node scripts/probes/probe-global-search.mjs`（58） |
| 竖屏导航菜单：接缝、以及菜单内部的一级/二级/三级几何（`.nav-menu-mobile` 的 `top`、`.nav-mobile-submenu-container`、岛的下投影） | `node scripts/probes/probe-nav-mobile-menu.mjs`（48，含一个窄横屏档）。⚠️ 三个坑：① 菜单的包含块是那座**有 transform 的岛**、不是视口；② `visibility: hidden` **不释放高度**（点开二级菜单后的 272px 内部空洞就是这个）；③ 探针**全程不滚动**，所以 `.scrolled` 那一类回归它抓不到 —— 那条由 `tests/unit/unified-nav-scrolled-guard.test.js` 在源码层锁死（2026-09-29 起 vendor 里三组休眠 `.scrolled` 规则已删）。见该探针文件头的实测记录 |
| 论坛搜索 / 列表 RPC | `node scripts/probes/probe-forum-search.mjs`（27） |
| **消息中心「选择模式」** | `node scripts/probes/probe-messages-select.mjs`（91，5 档视口 + 长按/右键/已归档）。选择模式与详情必须互斥、动作条显隐只由 `v-if="isSelectMode"` 决定、底距走 `--messages-sab-offset`；坑见 `plans/028` |
| **智能概览（灵动岛 / `/overview` 页）**：自动触发时机、同日去重、「你离开了 N 天」口径 | `node scripts/probes/probe-overview-island-guards.mjs`（38，场景 A–I）。⚠️ 触发点 2026-09-30 定稿为**唯一一处**：首页首屏解锁落定（`views/Home/index.vue` 的 `watch([gateSettled, isLoggedIn])`）——**不**在登录/进站弹，点「我的方块」也不触发，别再往别处加调用。由此带来探针两条硬约束：① 每个场景是新 browser context ⇒ `boh-home-gate-passed` 必没落盘 ⇒ 开场画必播、`gateSettled` 初始 false ⇒ 要测弹岛必须显式调 `unlockHomeGate(page)`（走键盘路径一次按键 commitGate，别去伪造带构建指纹的 localStorage key），**不要**再点 `#nav-user-info`；② 「加载岛是否出现过」的 MutationObserver 必须在解锁之前装好（拦截响应是瞬时的，岛只闪几毫秒），`/overview` 页断言要压掉触发（预置 `boh_overview_island:<uid>` 会话标记）以免摘要请求抢写 `captured.body`。另三条口径真源：① 跨设备同日去重吃服务端 `profiles.overview_checked_day`，读它前必须 `await refreshOverviewMarks()`（否则首检读到 null 就重复弹）；② 离线天数按**真实锚点** `authStore.offlineAnchorAt` 算（同 `/overview` 页口径），**不要**用推送窗口游标日 —— 窗口按设计恒 < 今天，用它算出来永远 ≥ 1 天，「今天有 N 条新内容」那一支会变成死代码；③ 新账号锚点是合成的「now-7d」，靠 `authStore.isFirstLoginSession` 区分，别当真实离线天数展示。⚠️ 长会话（PWA 挂机）天粒度游标停滞 ⇒ 岛 p_anchor=max(frontier, 真实锚点)，场景 I 锁（2026-10-18 实证重推在线期间看过的帖） |
| **评论 / 回复输入框「多字扩展」**（竖屏不随内容长高） | `node scripts/probes/probe-reply-autogrow.mjs`（19，竖屏 390×844；场景 A = 论坛卡片回复框，场景 B = 详情页底部评论框）。真源是 `src/composables/useAutoGrowTextarea.js`（**不要再加第 5 份自研增高**，存量 4 份见 `plans/021` §1.3）。⚠️ 四条已实测的坑：① **上限只声明在 CSS 的 `max-height`**，JS 读 `getComputedStyle` 取用，不在 JS 写第二份像素值；② `height='auto'` 之后**必须无条件写回**，写「next 相等就 return」会把元素永久留在 `auto`（表现为内容超上限后掉回 `rows` 固有高度）；③ 内容源传 getter 时不能包成 `() => unref(value)` —— `unref` 只解 ref、**不调用函数**，watcher 永不触发（切换回复对象不会收缩，这条靠断言 E 才抓得到）；④ 详情页的 `.reply-textarea-x` 仍是**死 UI**（两处 `<CommentThread>` 都硬编码 `:hide-composer="true"`），别照 `plans/021` §5.1 的旧清单去"修"它 —— 但**详情页底部**那个 `input.pd-reply-input` 已于 2026-10-01 换成自动增高 `<textarea>`（同一 composable），场景 B 随之改回 A–D；⑤ 空内容时**必须临时摘掉 `placeholder` 再量** —— 浏览器会把折行后的占位文字算进 `scrollHeight`，窄框里 "说点什么" 折两行会把空态撑成两行高（详情页实测 64px vs 40px）；⑥ 上限比较用 `offsetHeight`（`max-height` 约束 border-box，`clientHeight` 扣边框会恒差 1~2px） |
| **活动页封面图 / 报名区 / 月份轨道** | `node scripts/probes/probe-activities-images.mjs`（7）、`node scripts/probes/probe-campaign-ui.mjs`（35）。⚠️ 数据库图片列混存 `@/assets/...` 别名与 Cloudinary 绝对地址两种形态，**渲染必须走 `utils/db-image-url.js`**；只调 `getImageUrl` 时 Cloudinary 那几条会指向大陆不可达的 `res.cloudinary.com` 而裂图（2026-09-29 活动页 id=16/17 即此成因） |
| **移动端发帖选图反馈口径**（选图→发布保持安静 + 4s 卡顿观察器 + 首帧优化） | `node scripts/probes/probe-composer-image-stall.mjs`（6，竖屏 390×844）。2026-10-02 产品口径：**不给常驻过程反馈**（无状态徽章/进度文案，`shouldShowImageStatus` 仅 failed），只有选图后 4s 本批就绪不足一半才写一次性底部提示「图片正在后台处理…」，全部 settle 后清除（`scheduleImageStallWatch` / `maybeSettleStallHint`，ForumMain）。配套 P1：① 选图 `await nextTick()` 再启模型预载/压缩；② 网格 img 无 `loading=lazy`；③ **上传完成后编辑器 `url` 保留 blob**，远端写 `uploadedUrl`，**发布快照处归一** `url: img.uploadedUrl || img.url`（漏掉归一会把 `blob:` 交给 createPost 落库）。⚠️ 探针入口在首页 `/#/` 的 FAB——`/#/forum` 已被 IA 改版重定向到 user-space（`isForumComposerFabVisible` 要求 `route.path === '/'`）；⚠️ mock 手法：api-key-vault 断流要**延迟 6s 再 abort**，秒败会让图过早 failed settle、A4 永不触发 |
| **方块积分卡自定义卡面**（`profiles.points_card_image_url` / `points_card_presets.image_url`） | `node scripts/probes/probe-points-card-image.mjs`（7，只读打本地 dev）。同一个裂图成因的第二个落点：卡面走 `PointsCard.vue` 内部收口 → `resolveDbPointsCardImage`（`c_limit,w_1280`，**不是 c_fill**：卡面是整幅画，服务端预裁会砍主体），预设缩略图走 `AssetsHubPanel.pointsCardPresetThumb`。⚠️ 预设 `:class` 的 active 判断必须继续比**原始** url，一边改写一边不改写会丢选中态 |
| 订阅权益 / 摄影集配额 | `node scripts/probes/probe-subscription-benefits.mjs`（49） |
| **Cloud+ 相册（图库）形态**：去日期分组、多图贴铺开、捏合切列、宽屏铺满 | `node scripts/probes/probe-cloud-album.mjs`（22，两档视口，需 mock 数据）。⚠️ 五条已实测的坑：① **多图贴要一张图一格** —— `albumTiles` 用 `flatMap` 摊平，key 必须带下标（`${entry.id}::${index}`），只写 `entry.id` 会让同一条目的多个格子撞 key、Vue 复用节点串图；② **排序在 API 层按 `entry_date` 降序**（不是 `updated_at`）—— 用 `updated_at` 的症状是「编辑旧内容会跳到最前」，看起来就是日期顺序错乱；`nullsFirst: false` 必写（PG 在 DESC 时默认 NULLS FIRST，会把没填日期的条目全顶到最上）；**别在视图层再 sort**，查询带 `limit(240)`，客户端只能对已截断的一页排，会真排错；③ **列数由 `--album-columns` 变量驱动、由 JS 算**（`resolvedAlbumColumns` = 用户选择 ?? 视口自动），别退回 CSS 的 `auto-fill` —— 那样横屏（Mac 触控板 ctrl+wheel）就捏不动；④ 捏合是**阶梯**不是连续映射：每跨过阈值就重置基线，一次张手可连切 5→4→3；`touchmove` 必须非 passive 才能 preventDefault，宿主还要 `touch-action: pan-y`（放行单指滚动、其余交给 JS）；⑤ 图库页宽屏用 `.cloud-shell.is-gallery` 解除 980px 上限铺满（设置页/分享页仍窄栏居中），列数测量用 **ResizeObserver** 而非只监听 `window.resize` —— 切分页时窗口不 resize 但容器宽度会变 |
| **Cloud+ 图库 / 设置 / 分享三页（竖屏）** | `node scripts/probes/probe-cloud-portrait.mjs`（27，三档竖屏：顶栏工具行几何 + 设置页卡片玻璃材质）。⚠️ 五条已实测的坑：① 工具行一行塞不下「搜索/筛选/刷新/新建」，`flex-wrap: nowrap` 硬压会同时造成「搜索框被压到 30px（placeholder 与输入全不可见）」「筛选/刷新 折字竖排」「新建因继承 `.primary-btn { width: 100% }` 又自带 `flex-shrink: 0` 而 right=518、超出视口 128px 被裁」；② 那条 `width: 100%` 在 `@media (max-width: 640px)`（**不是** ≤900），且与 `.toolbar-actions` 两列网格共用，工具行里必须局部还原成 `width: auto`；③ 玻璃必须挂全局 `.liquid-glass` **基础类**，加 `--subtle/--strong/--inset` 变体在 ≤768px 会被 liquid-glass.css 强制成 `backdrop-filter: none` + 近实白；④ scoped 选择器特异性**高于**全局类 —— 任何 `.sidebar-card { background: … }`（≤900 与 ≤640 各有一条）都会把玻璃盖回实色，必须 `:not(.liquid-glass)` 让位，否则症状是「backdrop-filter 生效了但卡片还是 #f5f5f7」；⑤ Cloud+ 整页目前零暗色适配（`.cloud-page` 硬编码亮色 token，连带顶栏标题在暗色下白字不可见），故玻璃在暗色下主动退回实色底，别指望它跟 `--liquid-*` 切暗 |
| 头像框发放 | `node scripts/probes/probe-avatar-frame-grant.mjs`（23） |
| **Cloud+ 动效**（图库格子放大/缩小、详情从点中的格子放大展开并缩回、三档切换过渡、捏合切列落定回弹） | `node scripts/probes/probe-cloud-motion.mjs`（16，竖屏 420×900，需 mock 数据）。⚠️ 三条已实测的坑：① **瞬时类必须在动画窗口内读** —— 进场类由 Vue 在 `animationend` 后摘掉，600ms 才读会拿到 `animation: none` 与默认 `transform-origin`（假红），统一 120ms 读；② 按压测试的 `mouse.up` 落在格子上 = 一次真实点击 → 详情会打开，必须先关掉，否则后续 `tiles[n].click()` 被遮罩拦截而超时；③ 观察 `is-settling` 的 MutationObserver 必须在**切回内容档之后**重装 —— 切 tab 会让内容档整体 `v-else` 重建，盯旧节点永远等不到（假红 `seen=0`）。**反证已做**：`openEntry` 里读 rect 的分支改成恒 false（退回居中展开）→ 两条 origin 断言当场 FAIL。源码层守卫在 `tests/unit/cloud-album-order.test.js` 的「Cloud+ 动效接线」describe（探针不进 CI，接线必须由单测锁） |
| **BOH AI 整页横屏左栏**（`/ai-chat` 切过去后左栏导航不能消失） | `node scripts/probes/probe-aichat-landscape-rail.mjs`（14，两档视口 1440×900 / 390×844）。⚠️ 两条已实测的坑：① 页面级规则在 `UserSpace/styles/landscape-rail.css`，而那个文件是**按页引入**的 —— `BOHAIMain` 不写 `<style src=...>` 时左栏照样渲染，但 `position` / 内容让位 / 会话侧栏左移全不生效（实测 `absolute` + `padding-left: 0` + 会话侧栏 `left: 0`），故第一条断言就是「左栏 fixed 且贴左」；② 顶部导航岛是「满宽容器里 `margin: 0 auto` 居中 + `left` 相对偏移」，判据必须写成「岛心 == 内容区中心」，拿 `left` 绝对值去比会假红。接线守卫在 `tests/unit/aichat-landscape-rail.test.js` |
| 头像框控制台（新素材 / 变换） | `node scripts/probes/probe-avatar-frame-console.mjs`（44） |
| **周签到 / 积分余额线上真值**（报障「签到能一直签」「余额不显示」先跑这个） | `node scripts/probes/probe-weekly-checkin-points.mjs`（5 项断言，只读）。判据是「唯一索引在不在 / 有没有同用户同周多行 / 本周签到行数 == 本周签到流水数 / 部署版函数是不是幂等版 / 签到者积分有无空值」。⚠️ 时间边界必须 `(date 'X'::timestamp at time zone 'Asia/Shanghai')`，直接比 `timestamptz` 会退化成 UTC 午夜、漏掉周一凌晨签到的行，得到假的「行数 != 流水数」 |
| **anon EXECUTE 收尾：哪些函数可以安全撤权** | `node scripts/probes/probe-anon-revoke-safety.mjs`（只读）。两条硬规则：① **被任何 RLS 策略引用 → 不可撤**（策略按查询者角色求值，撤 anon 会让游客查询直接 42501；实测 `current_user_is_admin` 被 113 条策略引用）；② 匿名态有前端调用点 → 需人工确认。⚠️ **撤权不等于加防线**：函数体内部只信 `auth.uid()`，`authenticated` 同样能调它 —— 无论撤不撤 anon，「内部守卫」都是唯一那道防线，故边际收益有限；落库前先跑「撤销 → 全站游客路径冒烟」 |
| AI 面板 / BOHAI | `npm run probe:ai-panels` |
| **BOH AI 输入区 composer**（底行两胶囊 / 模型与工具浮层 / 用量圆钮） | `node scripts/probes/probe-bohai-composer.mjs`（32，独立页 + AI 岛两形态 + 设置面板）。⚠️ 三条必读坑（窄浮层必须页面内 click 否则被遮罩关掉 / 要断言「模板引用未定义绑定」的 Vue warning / 模型清单异步竞态）+ 用量圆钮单环契约 + 2026-10-11 思考强度控件下线 → `docs/gate-matrix.md` C-1 |
| **BOH AI 输入区两胶囊 + 空态**（两颗独立胶囊 / 浮层玻璃 / 空态居中与 FLIP / 输入框底色与横屏高度） | `probe-bohai-composer.mjs`（31）+ `probe-bohai-shell.mjs`（39）+ `probe-bohai-slash-commands.mjs`；单测 `tests/unit/bohai-glass-surfaces.test.js`。⚠️ 两条必读坑（两处 `margin:auto` 会在中间裂开 309px 空洞 / FLIP 的 watcher 必须 `flush:'pre'`）+ 2026-10-12 用户口径反转成液态玻璃（第 6 个消费者，输入区浮在消息流之上）→ `docs/gate-matrix.md` C-2 |
| **BOHAI 侧栏与竖屏浮动 chrome + 消息列横向布局**（`.boh-sidebar` 展开/收起、沉浸球、消息区顶部留白、流光速度、AI 回复的靠左与限宽、用户气泡的贴右与白底、输入框的玻璃与浮层） | `node scripts/probes/probe-bohai-shell.mjs`（**39 条**，含「默认收起 + 展开路径 + 收起路径」「竖屏顶部留白 ≥68px」「抽屉打开时悬浮球让位且不吃点击」「场景 E：AI 回复靠左 + 宽 880 + 用户气泡贴可用区域右边 + 白底 + 输入框玻璃且与消息区重叠」）。⚠️ 五条实测坑：① 对话管理**默认收起**（初值 `false`），入口靠右上角浮动按钮，**不要**再做「记住上次展开」—— KeepAlive 下那会让它一直开着；② 沉浸球模式下页面顶到满屏，消息区要留顶部（竖屏 68 / 横屏 44，写成同一个值会在横屏白丢 24px）；③ 球让位必须同时写 `opacity: 0` + `visibility: hidden` —— vendor 给 nav surface 写了 `pointer-events: auto !important`，只写 pointer-events 会留下「看不见但能吃点击」的靶子，且这条规则只能进 `src/style.css`（scoped 会给最后一个选择器加 `[data-v]` 而永不匹配）；④ ⭐ **列宽约束必须在「消息级」、容器 `.boh-stream-pad` 必须全宽** —— 用户口径是「AI 回复靠左、用户气泡贴右边」；容器一旦限宽，气泡就只能贴到内容列右缘（实测 1440 下 928），够不到可用区域右边（`main.right − 40 = 1400`）。⑤ 比「输入框与消息同列」必须比**内容左缘**：`.boh-stream-pad` 的内衬写在它自己身上（盒内），输入框的让位来自父级 `.boh-composer-wrap` 的 padding（盒外），直接比两个盒子的 `x` 会差一个 padding（1440 下 40px）。流光速度单源是 `--boh-dur-bob`（1.8s，网页搜索与正在思考共用，别拆）。 |
| **BOH AI 切页不掐流**（改 `/ai-chat` 的 `meta.keepAlive`、会话落盘、灵动岛） | `node scripts/probes/probe-bohai-keepalive-stream.mjs`（**5 条**）+ `node --env-file=.env scripts/probes/…` 之外**不要**用真模型。⚠️ 它的慢流是 `addInitScript` 注入的 fetch 包装重放 SSE（`route.fulfill` 一次性给完 ⇒ 假绿），**且必须接住 abort 信号**，否则去掉 keepAlive 照样 PASS；改判据前先做反证。⚠️ 加 keepAlive 后页面实例与灵动岛**两个引擎共存**、共用 `boh_chat_sessions`，写入冲突由 `createBohAISessionWriteGuard` 挡住（改它要跑 `tests/unit/bohai-chat-session-store.test.js` 与 `use-conversation-manager.test.js`） |
| **BOHAI 层级**（动 `.boh-sidebar` / 浮层 / 全局 chrome 的 z-index） | `tests/unit/bohai-sidebar-layer.test.js`（锁**相对关系**：对话管理 < 临时浮层 < 全局 chrome < 全屏设置页）。实测判据用交叠点 `document.elementFromPoint`，不是肉眼看 || **BOH AI 生成参数**（改 temperature / max_tokens / top_p 等调参，或新增 LLM 调用点） | 已在 verify 链内跑 `check:bohai-params`（严格门禁，禁止在真源表之外内联字面量）。真源两张表：`src/views/BOHAI/generation-params.js`（按任务语义）与 `chat-engine-config.js` 的 `GENERATION_PROFILE_BY_MODE`（按对话模式）。改真源表的值属于**行为变更**：跑 `npm run probe:ai-panels` 并人眼复核对话质量 |
| **BOH AI 斜杠命令**（改 `/` 命令表、命令解析、或**新增任何「用户发出这条输入」的入口**） | `node scripts/probes/probe-bohai-slash-commands.mjs`（7）；单测 `tests/unit/bohai-slash-commands.test.js`（21）。⚠️ 四条必读坑 + 一条不变量（**每个 action 都要在壳的 switch 里有 case**）→ `docs/gate-matrix.md` C-3。**底线：新增入口只许汇到 `handleSend` / `executeSlashCommand`，不许再写第三处 `startsWith('/')`** |
| **BOH AI 推理过程块**（改思考态、推理内容的分流或渲染） | `node scripts/probes/probe-bohai-search-status.mjs`（14，含 A4b reduced-motion + A9/A10 展开往返）。2026-10-10 口径：**思考态 = 纯文本「正在思考」**（旧呼吸圆点已整段删除）、**默认收起**、点击展开看推理原文。⚠️ 四条硬约束：① 推理原文由 `createThinkingState` / `filterThinkingContentStream` 分流累积（`getThinkingReasoning`），壳用 `updateReasoning` 落到 `message.reasoning` —— **正文一个字符都不许变**（A7 的 `reasoningLeaked`）；② 推理块用 `v-show` 不用 `v-if`（节点常驻）；③ 分块会切开标签 ⇒ 半截 `</thi` / `<thi` 留在 `thinkingBuffer` 等拼回（`PARTIAL_THINK_*` 单源），流在块内结束的残留归推理、**绝不能当正文吐出**；④ **标签名单与「裸闭合」只在 `src/utils/reasoning-tags.js`**，两个过滤器都从那儿引 —— 以前四处各写一份且只认开口，造成「非流式正常、流式泄漏」（Z1 的 `思考…</think>答案` 整段进正文，2026-10-22 用户报障）。⚠️ 裸闭合**必须配前导暂存**：已吐出的字收不回来，故只对 Z1 系按住开头等判定，并有超时/超长兜底（普通正文绝不能被扣住）。⚠️ 要提取 JSON 的调用方只能用 `stripPairedReasoningBlocks`（完整版「只有开口就删到结尾」会吃掉 JSON 后半段、静默返回 null）。单测 `bohai-reasoning-capture.test.js`（18）+ `bohai-reasoning-tags.test.js`（28）。⑤ 思考中（`.is-live`）的「正在思考」走流光：**复用**「网页搜索」那组定义（`.boh-search-line.is-shimmer, .boh-reason.is-live .boh-reason-head span`），**别抄第二份** —— 必须挂 `…head span` 而非 `…head`（否则 caret 一起透明消失）；同组带 `prefers-reduced-motion` 兜底恢复实色。探针 **14/14** |
| 数据管理面板列定义 | `npm run audit:dm-columns` |
| `vite.config.js` 依赖别名 / optimizeDeps | `node scripts/probes/probe-vite-dep-scan.mjs`（6） |
| 权限策略 / 归档 SQL | `npm run security:anon-check`（棘轮，红了说明新增了 anon EXECUTE） |
| 暗色主题样式（新增裸色值） | 已在 verify 链内跑 `check:dark-tokens:strict`（棘轮，总量上升即红）。确需新增 token：写进 `src/styles/themes/dark-mode.css` 的 token 块再引用；只有「存量搬迁/新页面早期形态」才允许 `npm run check:dark-tokens:update` 登记，并在 commit message 里说明理由 |
| **在 `src/views`、`src/components`、`src/composables` 里写 `supabase.from/rpc/functions.invoke`** | 已在 verify 链内跑 `check:layering`（棘轮，基线 **155** 处 / 31 文件，**新文件违规即红**；2026-10-19 复核 `scripts/layering-baseline.json`，block-wall-api 随方块墙退场删除）。改法：复用 `src/utils/api/*` 已有封装，没有就在那儿新增一个模块收口。会话内省请用 `authStore` 而不是 `supabase.auth.getUser()`。清单：`npm run check:layering:list` |
| SW 预缓存改动上线前（**专项，没进自动化链**） | `npm run check:sw-upgrade`（对比 `dist` 与 `dist-check` 两份产物，CI 上没有 `dist-check` 所以只能在本地跑）；`npm run check:route-css-runtime` 还要先手工起 `npx vite preview --outDir dist-check --port 4180 --strictPort`，它是独立起服务的浏览器验收 |
| **首屏 / 加载性能**（改图片管线、SW 预缓存、首屏请求收敛之后） | `node scripts/probes/probe-perf-baseline.mjs`（4 断言；只读打线上冷首访 + 产物闭包 + DB RTT，**不进 verify 主链**；`--json` 落盘做前后对照。基线与口径源自 `docs/2026-09-29-加载速度与提速全面评测报告.md`） |
| RPC / 触发器静默失败 | 审计表取 code → `DO` 块分步复现 → 修完把 `sqlstate` 落进审计 message |
| **邮件链路保活**（`mail-keepalive` EF / cron 调度 / 21 天阈值） | `npm run mail:verify` + `npm run mail:health`（需 Management API token，**刻意不进 verify**）。三条硬规则 + 2026-10-27 事故记录 → `docs/gate-matrix.md` C-4 |

其余探针见 `docs/PROBES.md`。

## 3. 硬规则（都是踩出来的，不是风格偏好）

### Vue / 组件

- **`<script setup>` 里 `ref/computed/watch/onMounted` 必须显式 `import { ... } from 'vue'`。** 编译器只自动注入 `defineProps / defineEmits / defineModel / defineExpose / defineOptions / defineSlots` 这些 macro。漏掉的报错症状极迷惑（曾表现为 `Cannot read properties of undefined (reading 'length')`）。惯例：一次 import 写齐。
- `ForumMain.vue` 里的 `watch(..., { immediate: true })` 不得同步调用下方 `const`（TDZ），用 `Promise.resolve().then(...)`。
- `App.vue` 非 keepAlive 路由的 `key` 必须是 **`route.path`**，禁止 `fullPath` 或 `name`。同页换 query 由页面自带 watch/computed 处理；跨页状态用 `useAdminTabIntent`（3s TTL）。实时输入搜索**不要**写进 URL。
- 分页总数分两个槽：`tabQueryTotals`（列表 count）与 `tabTotals`（概览 RPC），不要混用。

### 状态 / 数据

- 用户状态一律从 `authStore` 取，用 `storeToRefs()` 解构，不在组件里复制一份。更新走 `authStore.updateUserProfile()`，登出走 `resetState()`。
- 禁止从 `utils/auth` 聚合入口 import（有 lint 规则拦），改从 `utils/api/*` 或 `utils/supabase-client.js` 按需引，避免公共 chunk 膨胀。
- 图片资源必须走 `getImageUrl()`（`utils/asset-helper.js`），写死路径打包后 404。
  **但来自数据库的图片列要再往前一步**：`activities.image` / `news.image` / `posts.cover_image_url` 等混存
  `@/assets/...` 别名与 `https://res.cloudinary.com/...` 绝对地址两种形态，后者在大陆不可达
  （实测直连 000，走 `cdn.blockofhome.cn` 200），只调 `getImageUrl` 会裂图。
  渲染 DB 图片统一用 `utils/db-image-url.js` 的 `resolveDbCardImage` / `resolveDbDetailImage`。

### CSS / 动效

- `animation-fill-mode: both` 会让该属性从此不可过渡，离场也必须走关键帧。
- 动效常量只有一个真源 `tokens.css`；Vue scoped 的 `[data-v-*]` 会让选择器特异性 +1。
- `.home` 的 `--gate-p` / `--forum-p` 是首页入场进度的唯一真源，时长唯一真源是 `GATE_TIMINGS`，CSS 里不许写字面时长。
- `--kb-inset` 真源在 `useKeyboardInset.js`；`.bohai-page` 的高度有三处真源，改一处要同步三处。
- 毛玻璃变量 `--liquid-*` 只有一个出口 `tokens.css`，子组件不许压父级变量。暗色模式真源是 `theme-manager.js`。首屏底色纯白有三处必须同步（看 `check:first-paint` 的报错定位）。
- 不要用 `!important` 抢特异性（棘轮门禁 `check:important-budget`），暗色裸色值同理（`check:dark-tokens:strict`），UI 层直连数据层出口同理（`check:layering`）。这些门禁都**只允许下降**，被卡住时先想别的办法，不要用 `--update` 抬基线（`check:important-budget` / `check:dark-tokens:update` / `check:layering:update` / `security:anon-check:update` 都是同一个出口，抬基线必须在 commit message 里交代为什么）。

### Supabase / 数据库（project ref `nplnlefdwfgtyimfkyih`）

- 论坛搜索 RPC 只有一份实现（`list_forum_posts`，9 参数 24 列 + 两个薄 wrapper）。不许新增同名不同参数签名 —— PG 靠实参无法消歧，会直接 42725。
- 撤回 EXECUTE 必须写全 `from anon, authenticated, public`，三个都不能漏。新表 revoke 后要 grant **anon + authenticated**，漏 anon 会在线上得到 42501。
- `alter default privileges` 管不住 `supabase_admin`，不要指望它。
- 撤权前必须查五处：`pg_depend`、函数定义全库扫、Edge Function、前端调用点、RLS。
- `exception when others` 会吞掉真实错误，是「线上静默失败数周」的头号成因。新写 plpgsql 必须把 `sqlstate` 落进审计表 message。
- `cloudinary_pending_uploads` 是台账不是队列，不要当队列消费。

### 报告 / 方案文档（量化结论必须带判据）

- **报告、方案、审查类文档里的每一条量化结论，必须写成「结论 / 判据 / 实测日期」三件套**，判据必须是**能重跑的命令**（`node …` / `grep …` / `npm run …`），不是散文。模板见 `docs/报告模板.md`。
- 为什么这条是硬规则：**没有判据的数字无法被证伪，而无法证伪的结论会带着权威感被下游照做。** 本仓库已经因此吃过三次：报告写 `formatDate` 26 处重复（实测 15 处 / 8 种不同语义，合并即改视觉）、写 `Skin/transparent` 是 1:1 重复省 1.5M（实测两套字节全不同，照做会掉功能）、写 CSS 孤儿 311 个（实测 1404 个）。
- **判据一变，旧结论自动作废**，不许继续被引用；发现实测与上游结论不符时，**以实测为准并当场更正上游文档**（不是只在聊天里说一句）。
- 量化结论必须能区分「实测」与「估计/外推」，后者要显式标注。
- **执行者：无机器门禁 —— 评审时打回。** 这条刻意不做成脚本：判断「哪个数字是结论、它的判据该是什么」无法机器化，硬做出来的门禁只会满屏假阳性，然后被习惯性绕过。按设计文档原则 1，这里**明确标注为评审规则，而不是假装有一条门禁**。

### 全局搜索

- 搜索源注册表 `config/site-search-sources.ts`，**拒绝 eval**；actions 的执行权归 navbar。高亮用 `[[..]]` → `splitMarks`，**不许 v-html**。快捷键是 `/`（⌘K 被 AI 岛占用）。

## 4. 环境事实（省得每次试）

> 🤖 **先跑 `npm run env:doctor`** —— 35 项环境自检（**实测**，不靠平台名推断）。
> 本机 10 条环境坑的完整清单、正确做法、以及**并行会话纪律**都在 `docs/AI-ENV.md`（必读通道）。
> 下面这几条是其中最容易撞上的。

- dev server 只监听 IPv6：`http://[::1]:5173`。构建验证用 `vite build --outDir dist-check`，**不要动 `dist/`**。
- Playwright 必须 `channel: 'chrome'` 加 `--no-proxy-server --proxy-server=direct:// --proxy-bypass-list=*`；一个 browser + 每场景新 context；同一 path 只注册一条 route（逆序匹配，catch-all 要最先注册）；mock Supabase 必须回 `Content-Range`；伪造登录注入 pinia，**不要**种 `sb-*-auth-token`；切路由用 `location.hash`。
- vitest 禁止依赖固定 tick，用 `waitUntil(..., 5000)`。沙箱或 CI 加 `--pool=forks`。优先 `./node_modules/.bin/<tool>` 而不是 `npx`（npx 会被 SIGTERM）。
- `github.com` 的 HTTPS 在本机被 SNI 阻断，push 走 SSH（`ssh.github.com:443`），兜底脚本 `scripts/push-via-api.py`。Supabase 直连 5432 时断，迁移走 Management API（`read_only: false`）+ 手写 `schema_migrations`（命名 `YYYYMMDDNN_snake.sql`，结尾 `notify pgrst, 'reload schema'`）。
- Supabase Management API 凭据在钥匙串：`security find-generic-password -s "Supabase CLI" -a supabase -w`，输出带 `go-keyring-base64:` 前缀，剥掉后再 base64 解码。

## 5. 工具链（已装好的，直接用）

- **格式**：Prettier（`.prettierrc`：printWidth 100 / 单引号 / 尾逗号 all）。全仓 `npm run format`，只检查 `npm run format:check`。`.prettierignore` 刻意排除了 `*.md` 和四个第三方 Style 目录 —— 近百个 md 全量重排会把有意义的 diff 淹掉。
- **CSS 审计**（只读，不删除）：`npm run audit:css`（约 10s）。两个子报告：
  - `audit:css:duplication` —— 共享 partial 被多处 scoped `@import` 的重复体量。口径：**体积 × (被 .vue 导入次数 − 1)**。⚠️ 别去数产物里的选择器，各 partial 前缀不同极易漏（曾把 443KB 漏成 24KB）；也别按 basename 匹配（全仓一堆同名 `style.scoped.css`，会得出「被 17 个文件导入」这种假结果）。
  - `audit:css:orphans` —— 孤儿类名。分三桶：**确定孤儿** / **疑似孤儿**（只被别的 CSS 引用）/ **待确认过渡类**（形如 `*-enter-active` 但没找到 `<transition name="…">`，可能是动态 `:name`，别直接删）。已规避四类假阳性：scoped 定义方=使用方、声明值被误当选择器、动态拼名、Vue 运行时过渡类。
  - ⚠️ 它**只报告**；删 CSS 需视觉回归。
- **重构验证协议**：`docs/重构验证协议.md`。拆组件 / 搬代码 / 外置 CSS 这类"不改行为"的重构，**只跑 verify 不够** —— 这类失效是静默的（没报错、没测试红，只是样式不生效或事件没人接）。协议给了 L1–L6 六层，每层都写明**能力与盲区**。
  - 核心自动化工具：`npm run compare:builds -- <改动前产物目录> <改动后产物目录>`。做四件事：总字节 / 文件级差异（**会归一文件名里的内容哈希**，否则每次重建都被报成"全部新增"）/ 变化 CSS 的**声明级逐条比对**（剥 `[data-v-*]` + 归一 8 位 scope 哈希）/ **CSS scope id ↔ JS scope id 配对**（L3 证明不了这一层，而它不配对 = 样式静默不生效）。
  - 用法：改动前 `mv dist-check /tmp/dist-before && npx vite build --outDir dist-check`；改动后再构建，然后 `npm run compare:builds -- /tmp/dist-before dist-check`。
  - ⚠️ 它只覆盖「产物结构 + 样式」。**运行时行为靠单测与探针，视觉仍须人眼确认** —— 协议里明确要求把没验证的说成"待确认"，不要把没验证的说成验证过了。
- **耦合分析**（只读）：`npm run audit:coupling -- <文件>`。给一个大文件（.vue/.js）算「顶层声明的引用图 + 连通分量」，用来回答**「这个文件能不能安全拆、拆哪一块」**。
  - 输出三个数：**真死代码**（声明区间外零出现）、**基础设施型**（被 ≥8 处引用，拆不动）、**候选簇**（按「簇外被引用次数」升序 —— **只有 0 才是完全自包含、可直接搬走**）。
  - ⚠️ 它用 **acorn 真解析**（不是正则/手搓边界）。这不是洁癖：手搓边界踩过两次坑 —— ① 用「下一个声明的位置」当结束边界会过度延伸，把中间顶层代码吞进定义区间，让「区间外零出现」恒成立；② 用括号深度时 `const f = () => {...}` 在 `()` 后深度就回到 0，被截断成 `const f = () =>`，refs 全空。**这类错误极隐蔽：工具照样输出、数字看着合理，但结论是错的。** 有真解析器就用真解析器。
  - 判据「只出现 1 次 = 必无引用」是**不会错的**（定义本身占 1 次）；而「区间外零出现」需要正确的区间，故依赖 acorn。
- **棘轮总账**：`npm run check:ratchets`（已挂在 `verify` 末尾）。把 4 个棘轮的「当前 / 基线 / 余量」汇成一张表，让「债务在减少还是增加」一眼可见。
  - 它**不复制计数逻辑** —— 只调各棘轮的 `--json` 机读出口拿数（自己再数一遍就成了第二份真源，迟早和真正的门禁给出不同的数）。
  - 它**只报数、不判定、永远 exit 0**；判定是各棘轮自己的职责，否则「总账」会变成第 5 个门禁，出问题时反而分不清是谁红的。
  - `anon-execute` 需 Management API token，离线只显示基线并标注原因 —— 不留一个看起来像 0 的假数字。
- **门禁自检**：`npm run check:gates-self-test`（约 45s）。给每道门禁注入一个已知违规样本 → 断言它 `exit` 非 0 → 撤销；样本在 `scripts/lib/gate-fixtures.mjs`。**改了门禁就跑它**，否则你无法区分「门禁通过」和「门禁是假绿」。⚠️ 它会临时改写工作区文件（有兜底还原），**不要塞进 verify/build:ci 主链**，要进 CI 请单开 job。
- **环境自检**：`npm run env:doctor`（35 项，实测；诊断档永远 exit 0，`--strict` 才当门禁）。⚠️ **刻意不进 `verify`** —— 工具缺席是环境事实、不是代码缺陷，接进去只会变成一条永远红的假门禁。要进 CI 请单开 job。
- **lint 归因**：`npm run lint:delta` —— 跑全量 eslint + **并发**对变更文件取 `HEAD` 基线（走 `eslint --stdin --stdin-filename`，**不碰工作区**），输出「新增了哪一条 / 哪个文件哪一行 / 离上限还剩几格」。默认只给「当前仍有警告」的文件做基线（约 1 分钟）；要连"消除"也完整统计加 `--full`（约 6 分钟）。
- **根目录沙盒棘轮**：`npm run check:root-clean`（已挂在 `verify` 与 `verify:fast`）。冻结现存 22 个根目录 html + 3 个临时脚本，**新增即红**。归拢到 `docs/demos/` 后跑 `check:root-clean:update` 下调基线。
- **提交门禁**：`.git/hooks/pre-commit` 跑 lint-staged，只处理本次暂存的文件（prettier + eslint --fix），规则见 `.lintstagedrc.json`。需要跳过时用 `git commit --no-verify`。
  - ⚠️ **钩子会改文件，所以「你验证的树」可能不是「提交的树」**。改完代码先 `npm run format` 再跑 verify；判绿一律以提交后的树为准（9-27 那次 CI 三连挂就是这么来的：prettier 重排让三个格式敏感的源码正则断言失配，本地全绿）。钩子现在会在改写文件后**把被改的文件名打出来**并提示重跑 verify —— 看到那段输出就说明你验证的树已经变了。
  - 为什么钩子不做成 `prettier --check`（只检查不修改）：实测有 **513 个文件**不符合 prettier，而 `npm run format` 是**全仓** `prettier --write .`。只检查的话碰任一未格式化文件都提交失败，而唯一修复命令会重排半个仓库 —— 那种钩子会被 `--no-verify` 习惯性绕过，比不改更糟。**自动格式化 + 显式报告改了什么**是这里性价比最高的形态。
  - 另：钩子跑 lint-staged 时会输出 `could not find any staged files` 且 `git commit` 返回非 0，**但提交其实成功了——判断成功看 `git log`，别信退出码**。
  - 钩子放在 `.git/hooks/` 下，不随 clone 分发。新环境手动装一次：
    `cp scripts/git-hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
  - 没用 husky 是刻意的：husky 会接管 `core.hooksPath`，而现有 `.git/hooks/post-commit` 是 Qoder 的 tracker，接管后它会静默失效。
- **MCP**：`~/.workbuddy/mcp.json` 配了三个 —— supabase（`--read-only`，project ref `nplnlefdwfgtyimfkyih`）、playwright（`--browser chrome`）、github。首次启用要在连接器管理页点「信任」。Supabase 那一个是只读档，写操作照旧走 migration SQL。
- **测试**：`npm run test` 覆盖 **211 个测试文件**（口径 `find tests -name '*.test.js' | wc -l`），跑满约 3 分钟。`pool: forks` + `maxWorkers: 2` 是定数**别调高**（CPU 密集任务抢不到时间片，只会互相拖累）。⚠️ `maxForks` 是 vitest 5 的**未知选项、被静默忽略**，曾致 project-structure 每次全量撞 45s 超时——2026-10-15 已修正名并合并 src 双读（17s→9.1s），对照实验与教训见 `vitest.config.js` 注释。
- **截图产物轮转**：`npm run clean:screenshots --keep-days=7`。`debug-screenshots/` 已 gitignore 但**只会涨**（2026-10-15 实测 757 个文件）。

## 6. 不要做的事

- 不要为了「跑起来」给现有代码加 `!important`、加 window 全局、或复制第二份 `.home-gate` 定义 —— 这类做法只是把债从一处挪到另一处。
- 不要往仓库根目录新增 `xxx-demo.html` 或临时脚本（`repro-*` / `diag-*` / `test_*` / `*-tmp.mjs`）。**现存 22 个 html + 3 个临时脚本是冻结的存量**（2026-10-15 复核；原文写"14 个"已过时，且这条规则**过去没有牙** ⇒ 现在由 `npm run check:root-clean` 拦，新增即红，在 `verify` 链内）。要视觉沙盒走 `docs/demos/`、`scripts/probes/` 或 `output/`。
- 不要提交 `.env`、`dist/`、`dist-check/` 和截图产物（`debug-screenshots/`、`output/` 已 gitignore，也别把未忽略的新截图目录加进去）。
- 不要把搜索词、未转义字符拼进 URL 或 SQL 字符串。
- 修改 Supabase 权限、表结构、Edge Function 属于对外部署行动，**先跟人确认**。
