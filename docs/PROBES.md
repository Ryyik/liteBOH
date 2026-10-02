# PROBES.md — 浏览器探针索引

`scripts/probes/` 是 Playwright 探针的自留地：本地起 dev 服务，用真实 Chrome 跑一遍目标 UI，
把「肉眼可见但不进构建产物」的回归钉住。它们不参与 CI，靠人和 AI 在改动前后主动跑。

用法：`node scripts/probes/<文件名>`。本机 Playwright 必须是 `channel: 'chrome'` + `--no-proxy-server`，详见 AGENTS.md 第 4 节。

> 本表由文件头注释自动提取后人工归类，脚本描述可能不准 —— **跑之前先看一眼文件头**。

## 速查（改了什么 → 跑哪个）

| 改动范围 | 探针 | 断言数 |
| --- | --- | --- |
| 首页布局 / 左栏 / 底栏 | `probe-home-forum-rail.mjs` | 21 |
| 横屏左栏落位 | `probe-rail-landing.mjs` | 45 |
| 首屏拉动入场动效 | `probe-home-gate-pull.mjs` | 50 |
| 全局搜索 / 灵动岛 | `probe-global-search.mjs` | 58 |
| 论坛搜索 | `probe-forum-search.mjs` | 27 |
| **帖子详情弹窗 chunk 加载失败兜底**（部署窗口期旧入口 import 旧 chunk 404：错误态出现、不再无声空白、DEV 不强刷、正常路径内容完整渲染） | `probe-pd-modal-chunk-fail.mjs` | 12 |
| 评论/回复输入框「多字扩展」（竖屏不随内容长高） | `probe-reply-autogrow.mjs` | 10 |
| **移动端发帖选图反馈口径**（选图→发布保持安静、4s 卡顿观察器一次性提示、blob 首帧 / 无 lazy、徽章仅 failed；入口在首页 `/#/`，`/#/forum` 已被 IA 改版重定向） | `probe-composer-image-stall.mjs` | 6 |
| **Cloud+ 图库竖屏顶栏 + 设置页玻璃**（工具行不折字/不溢出、页头不吸顶、底栏玻璃、卡片玻璃材质） | `probe-cloud-portrait.mjs` | 27 |
| **Cloud+ 相册形态**（iOS 图库式密铺：去月份分组、多图铺开、捏合切列、宽屏铺满） | `probe-cloud-album.mjs` | 22 |
| **BOH AI 输入区**（底行胶囊 / 三行面板 / 左右二级菜单 / 高级工具组 / 用量圆钮单环+hover 浮层）—— 独立页 + AI 岛两形态 | `probe-bohai-composer.mjs` | 18 |
| 活动页封面图 / 活动页报名区与月份轨道 | `probe-activities-images.mjs` / `probe-campaign-ui.mjs` | 7 / 35 |
| 方块积分卡自定义卡面裂图 | `probe-points-card-image.mjs` | 7 |
| 订阅权益 / 配额 | `probe-subscription-benefits.mjs` | 49 |
| 竖屏导航菜单的接缝与内部几何（一级/二级/三级 + 窄横屏档） | `probe-nav-mobile-menu.mjs` | 48 |
| 头像框发放 | `probe-avatar-frame-grant.mjs` | 23 |
| 头像框控制台 | `probe-avatar-frame-console.mjs` | 44 |
| 加载性能基线（线上冷首访 CWV / 资源账本 / DB RTT；只读打线上，**不进 verify**） | `probe-perf-baseline.mjs` | 4 |
| AI 积分计费配置与对账（线上只读；配置真值 / 14 日用量分布 / ai_usage 流水对账；**不进 verify**） | `probe-ai-billing-config.mjs`（`npm run ai:config`，支持 `--json`） | 视配置 |
| vite 依赖预构建 | `probe-vite-dep-scan.mjs` | 6 |
| AI 面板 | `probe-ai-panels.mjs` | — |
| 路由切换 | `probe-route-switch.mjs` | — |

## 分组清单

### CI 常驻 / 高价值守卫（16）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-ai-panels.mjs` | `npm run probe:ai-panels` | probe-ai-panels.mjs — AI 页（/ai-chat）面板可用性探针 |
| `probe-bohai-composer.mjs` | — | 探针：BOH AI 输入区（composer）新面板 —— 胶囊 / 三行面板 / 左右二级菜单 / 高级工具组；独立页 + AI 岛两形态。⚠️ 含反证说明：撤 `selectThinkingSpeed` 的 `closeComposerPanel` → A5 红；撤 `currentThinkingSpeed` 解构 → A5/A9/B5 红；把内环 `<circle class="orb-quota">` 加回 SVG → A10 红（2026-10-02 实测）。A10-A13 锁用量圆钮单环 + hover 浮层（需先发一条消息，模型与 quota-status 被 mock，额度 88% 故意踩 warn 档） |
| `probe-avatar-frame-console-demo.mjs` | — | 探针：头像框控制台方案 demo（avatar-frame-console-demo.html） |
| `probe-avatar-frame-console.mjs` | — | 探针：头像框控制台（管理端）/admin/avatar-console + 用户侧积分解锁 |
| `probe-avatar-frame-grant.mjs` | — | 探针：头像框「按人发放」 |
| `probe-datamanagement-errors.mjs` | `npm run probe:dm-errors` | 数据管理面板「一键查错」运行时探针 做法：伪造 admin 登录 → 遍历侧栏每个模块 + 每个页签 → 采集 |
| `probe-datamanagement-smoke.mjs` | — | 直接请求数据管理页模块，让 vite 现场编译，验证修复后的文件无编译错误 |
| `probe-datamanagement-validator.mjs` | — | 数据管理面板校验器回归测试：复现"新闻模板保存报 Cannot read properties of undefined (reading 'includes')" |
| `probe-forum-search.mjs` | — | 探针：论坛搜索体验增强（清除按钮 / ⌘K 聚焦 / 最近搜索 / 结果计数 / 无结果引导），网络全程 mock |
| `probe-global-search.mjs` | — | 探针：全局搜索（导航栏灵动岛形态）—— plans/020-site-global-search.md |
| `probe-home-forum-rail.mjs` | — | 探针：首页（论坛层）横屏左栏 —— 修复「换个入口进论坛，左右栏结构就没了」 |
| `probe-home-gate-pull.mjs` | — | 探针：首页开场画「跟手拖拽」入场（2026-09-27 由阈值触发改为 progress 派生） |
| `probe-rail-landing.mjs` | — | 探针：横屏左栏改造落地验收（plans/011 B 组 + C1/C2） |
| `probe-route-switch.mjs` | `npm run probe:route-switch` | probe-route-switch.mjs — 路由级切换巡检（逐路由，不抽样） |
| `probe-subscription-benefits.mjs` | — | 探针：订阅页（/user-space/subscriptions）· 权益单源对齐回归 |
| `probe-vite-dep-scan.mjs` | — | 探针：dev server 依赖预构建不炸（node 内置模块 / node-fetch 那条链） |

### 暗色模式 / 主题 / 毛玻璃（15）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-assets-glass.mjs` | — | 资产页液态玻璃化最终验证 |
| `probe-composer-dark.mjs` | — | （无头部说明） |
| `probe-dark-admin-theme.mjs` | — | 探针：DataManagement 暗色主题归因（P0 验收） 修的两个确定性 bug： |
| `probe-dark-audit.mjs` | — | 暗色模式全站审查探针 v2（保真版） |
| `probe-dark-counter-blindspot.mjs` | — | 量化 dark-token-counter 的计数盲区（它现在是门禁，口径必须站得住）。 |
| `probe-dark-gate-demo.mjs` | — | 探针：暗色裸色门禁评审 demo（dark-gate-demo.html） 用 file:// 直开，不需要 dev server。 |
| `probe-dark-note-verify.mjs` | — | A1 验收探针：暗色下底栏 .nav-label 的文字色（区分激活/非激活）。 修正前序探针缺陷：原写法只取 querySelectorAll[0]，而 UserSpace 首个 nav-label |
| `probe-dark-themes-shots.mjs` | — | A2 截图对比探针：暗色下覆盖 7 个暗色主题文件涉及的全部页面。 用同一份清单在删除前后各跑一次，逐文件比对渲染结果。 |
| `probe-dark-token-split.mjs` | — | 拆分「暗色块内字面量」的两类来源： 定义侧 --x: #hex / rgba() —— token 的家，字面量**必须**写在这里，是正确写法 |
| `probe-dark2-demo.mjs` | — | 验证 docs/dark-mode-demo.html：截图 + 控制台错误 + 抓出两侧实测对比度。 |
| `probe-glass-regression.mjs` | — | 全站玻璃视觉回归探针（plan 007 P0-0 收尾）： 1) token 计算值可解析 —— --liquid-filter* 与 --glass-filter* 含 blur()（自引用 bug 复发即空） |
| `probe-heatmap-tiers.mjs` | — | 热力图探针：动态四分位分档 + 月份/星期/中文日期标注（真实数据，需 dev server） |
| `probe-liquid-token-dark.mjs` | — | 液态玻璃 token 统一后：暗色实测（读计算值，不靠肉眼） |
| `probe-nav-dark.mjs` | — | 探针：暗色模式下导航栏 logo/链接文字颜色（vendor 无暗色规则的修复验证） |
| `probe-settings-glass.mjs` | — | 探针：设置子页液态玻璃统一验证。2026-09-30 起带 12 条断言（骨架 5 + 搜索 7，失败 exit 1）：iOS 式分组卡片骨架（容器 gap / 卡片圆角 / 组间留白 / 标题在卡片外 / 分隔线内缩越过图标）+ 设置搜索（命中、跨子页命中、空态、清除、输入框未被顶部固定导航遮挡的 elementFromPoint 命中测试） |

### 首页 / 入场闸门 / 导航栏 / 灵动岛（21）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-ai-island-rail.mjs` | — | 探针：AI 岛展开时左侧横屏栏不随容器高度下移（--userspace-rail-top-h） |
| `probe-detail-island.mjs` | — | 探针：新闻/活动详情灵动岛 + 管理员投稿弹窗（玻璃/层级/上传入口） |
| `probe-forum-toolbar-hero.mjs` | — | 探针：论坛工具栏横屏 hero 改版（2026-09-15） |
| `probe-gate-bottomnav.mjs` | — | 首屏底栏浮现诊断：量化「位置偏移」到底偏在哪。 流程：新会话打开首页 → 滚轮触发进论坛 → 在底栏浮现动画的多个时刻采样 |
| `probe-gate-marker-reduce.mjs` | — | 验证 2026-09-24 晚修复： A. gate 标记 localStorage + 24h 窗口（同窗口跳过、清标记重播） |
| `probe-gate-scroll-lock.mjs` | — | 过渡期滚动锁 + 模糊渐显 验证探针。 断言： 1 触发进论坛后立刻猛滚（模拟长滑/惯性），滚动锁期间 scrollY 恒为 0 |
| `probe-header-audit.mjs` | — | 页头审查探针（ActivitiesList ↔ Newsroom 设计对齐 + 导航避让 + 响应式）： |
| `probe-home-revamp.mjs` | — | probe-home-revamp.mjs —— 首屏「一次性开场层 + 下滑直达方块论坛」验收探针 |
| `probe-lab-island-fixes.mjs` | — | 探针：灵动岛交互修复回归 |
| `probe-lab-quota-island.mjs` | — | 探针：Lab 页灵动岛综合管理 回归（配额/生成状态/模型/样式集/思考预算 全接入导航灵动岛） |
| `probe-login-island-retract.mjs` | — | 探针：灵动岛登录的「回收」（收起）动画必须逐帧插值，不能单帧闪掉 |
| `probe-login-island-width.mjs` | — | 登录岛宽度探针（只读，不改源码） 用途：横屏（orientation: landscape 且 min-width 769px）点击导航「登录」后， |
| `probe-nav-mini-bar.mjs` | — | 探针：竖屏导航 Mini Bar 形态（plans/009-portrait-nav-mini-bar.md） |
| `probe-nav-mobile-menu.mjs` | — | 探针：竖屏导航菜单的几何护栏（**48 断言** = 竖屏 3 个宽度档 × 14 + 窄横屏 707×354 × 6）。① 接缝：菜单上沿与岛底边齐平、展开时岛无下投影；② **菜单内部**：一级态收起态子菜单不占位（底余量落在 **[0, 24]**）、二级态面板从顶部开始、返回条在顶部、最后一项不被裁；③ **三级（分组）态**（2026-09-29 补，此前只有 `groupBackTop` 被量出来却没有任何断言、文档却宣称覆盖「一级/二级/三级」）：分组返回条真的出现、三级内容与二级**同基**（同一个容器内的偏移差 ≤1px）、最后一项不被裁；④ 窄横屏档只断接缝/投影/横向 —— 那一档走 vendor 的 `top: calc(10px + var(--global-nav-rest-height, 58px))`，与竖屏不是同一套几何（竖屏修正全在 `@media (orientation: portrait) and (max-width: 768px)` 内）。**实测记录四条**：`position: fixed` 遇 transform 祖先时包含块变化；`visibility: hidden` 不释放高度；**「父级 vs 它自己的第一个子元素」这类差值对 margin 折叠完全不敏感**（M 的第一版就是「分组返回条 vs 分组面板顶」，注入 `margin-top: 60px` 后父子一起下移、差值恒 0，断言当场失效）→ 必须换成「同一容器内、二级态 vs 三级态」的跨态对比（改后同一次注入 → 差 36px，M 红）；本探针**全程不滚动**，所以 `.scrolled` 那一类回归它抓不到 —— 由 `tests/unit/unified-nav-scrolled-guard.test.js` 在源码层锁死 |
| `probe-nav-mini-width.mjs` | — | 量 mini 胶囊的「固有内容宽」→ 反推合适的 --nav-mini-width（内容 + 两侧各 ~8px 余量） |
| `probe-nav-optical-center.mjs` | — | 探针：竖屏 mini 胶囊的「视觉居中」回归护栏 |
| `probe-notification-suggest-island-extra.mjs` | — | 探针：消息中心智能建议岛补充回归 —— 暗色主题 + 移动端视口 |
| `probe-notification-suggest-island.mjs` | — | 探针：消息中心智能建议岛回归（进入「消息 tab·收件箱」且有未读 → 导航岛自动弹「N 条未读·全部已读」） |
| `probe-overview-island-guards.mjs` | — | 智能概览（灵动岛 + /overview 页）守卫回归探针（Playwright + 伪造登录，不需要真实账号） |
| `probe-pity-island.mjs` | — | 探针：社区抽奖保底进度自定义岛（PityIslandCard） |
| `probe-rail-indicator-diag.mjs` | — | （无头部说明） |
| `probe-share-island.mjs` | — | （无头部说明） |

### 论坛 / 帖子 / 发布器（16）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-composer-chips.mjs` | — | composer 工具 chips 探针：横屏（UserSpace 社区 tab → 左栏「发布」→ 全屏发布会话） |
| `probe-composer-publish-dedupe.mjs` | — | 探针：发布会话底部整条工具栏去重（只保留上方顶栏 取消 / 草稿 / 发布） |
| `probe-composer-publish-fix.mjs` | — | 发帖修复验证探针（对应提交 a180938 引入的三个回归）： |
| `probe-desktop-composer.mjs` | — | 桌面端发帖编辑器回归：标题 textarea 化后布局无变形 |
| `probe-forum-content-tabs.mjs` | — | 探针：社区段控新增 新闻/活动 页签（用户空间 → 社区）+ 筛选栏只留排序/标签 |
| `probe-forum-filter.mjs` | — | 登录注入：/user-space 未登录时社区 tab 不渲染论坛（会看到「登录以查看」空态）， |
| `probe-forum-ux-fixes.mjs` | — | 探针：论坛交互感知修复（5 项）+ 竖屏导航修复 |
| `probe-forum-viewport.mjs` | — | 探针：论坛横竖屏单源判据 + 993/992 → 1024/1023 裂缝带修复 |
| `probe-lab-composer-pill.mjs` | — | 探针：输入框参数列表框回归（思考五档列表框 / 样式集 8 套列表框 / 双向同步 / 外点关闭） |
| `probe-mobile-composer.mjs` | — | 竖屏发帖器 UI 修复验证探针。⚠️ 2026-10-02 起**入口已过时**：`/#/forum` 被 IA 改版重定向到 `#/user-space?tab=posts`，需走首页 `/#/` 的 FAB（见 `probe-composer-image-stall.mjs` 的做法） |
| `probe-composer-image-stall.mjs` | — | 移动端发帖「选图反馈口径」探针（2026-10-02）。锁：A1 blob 首帧 ≤1500ms、A2 网格 img 无 `loading=lazy`（P1）、A3 3s 内底部状态行安静、A5 徽章仅 failed（产品口径：不给常驻反馈）、A4 4s 卡顿观察器一次性提示。⚠️ 反证：加回 `loading="lazy"` → A2 红；`IMAGE_STALL_HINT_DELAY_MS` 调大 → A4 红（均实测）。⚠️ mock 手法：api-key-vault 断流要**延迟 6s 再 abort**——秒败会让图过早 failed settle，A4 永不触发（踩过）。⚠️ A4 与「全部快速 settle」互斥，大图（2000² 噪声 PNG）+ 云端延迟断流是稳定性前提 |
| `probe-news-detail-route.mjs` | — | 探针：S4 新闻独立详情路由（/news/:id） |
| `probe-official-avatar.mjs` | — | （无头部说明） |
| `probe-official-card-images.mjs` | — | （无头部说明） |
| `probe-official-publish.mjs` | — | ===== Newsroom ===== |
| `probe-post-detail-fix.mjs` | — | probe-post-detail-fix.mjs — 论坛帖子详情两问题复现探针 |
| `probe-post-detail-verify.mjs` | — | probe-post-detail-verify.mjs — 修复后验证 P1: 活动/新闻帖详情显示封面图（@/assets 引用 + Cloudinary cover 两种） |
| `probe-reply-autogrow.mjs` | — | **评论/回复输入框「多字扩展」（10 断言，2026-09-30 新增 / 2026-10-01 场景 B 改回 A–D）**：竖屏 390×844，场景 A 打在用户空间内嵌论坛的卡片内联回复框（`PostCard` 的 `.reply-textarea-v2`）：A 空内容高度 = `rows` 撑出的高度且无内部滚动 / B 逐行加内容高度单调不减且未到上限时 `scrollHeight ≤ clientHeight + 1` / C 超上限后停在上限并框内滚动 / D 清空后回落 / E 父组件改写内容（同卡切嵌套回复，`replyContent` 被 `buildReplyDraft` 换成 `@user `）后必须回落。**E 是 `:value` 受控写法下唯一会命中 `watch(value)` 的真实路径**，只绑 `@input` 的实现不会收缩；前 6 张卡都没回复时记 SKIP 不记红。另有 F「键盘遮挡」仅测量上报（`plans/021` §8：先测再改）。场景 B（**2026-10-01 起已从绊线改回 A–D 断言**）：详情页底部评论输入已由单行 `input.pd-reply-input` 换成自动增高 `<textarea rows="1">`（产品口径「输入时自动扩充、输入完成自动收回」），所以它现在跑「形态 + A–D」共 5 条；`rows` 与内嵌 `.reply-textarea-x` 不渲染两条保留。⚠️ 两条口径坑：① 上限比较必须用 `offsetHeight` —— CSS `max-height` 约束 border-box，`clientHeight` 扣掉 1px 边框后会恒差 1~2px；② 该框只有 ~107px 宽，一行中文折两行，第 2 个采样点就触顶，故该场景 `minBelowCap: 1`（不变量是「存在一段无内部滚动的增长区间」，采样计数只是强度）。**反证已做**：`git checkout`/本地替换撤掉详情页接线后 B/C 红（高度恒为 42，即报障原状）；`git checkout -- src/views/Forum/components/PostCard.vue` 撤掉卡片接线后 B/C/E 红（高度恒为 85）。需先起本地 dev（默认 `http://[::1]:5173`，可用 `BASE` 覆盖） |

### 活动 / 方块墙 / 内容运营（4）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-activities-images.mjs` | — | **活动页封面图可用性（7 断言，2026-09-29 新增）**：逐张 `.activity-card__img` 断言「无 `@/` 别名残留 / `naturalWidth > 0` / 无一张仍指向 `res.cloudinary.com` / 无卡卡在未完成加载」。基线实测 **4 passed / 3 failed**（id=16 八周年、id=17 剧本杀两张裂图，`net::ERR_CONNECTION_RESET`），修复后 7/7。**用途**：`activities.image` 混存 `@/assets/...` 别名与 Cloudinary 绝对地址，只调 `getImageUrl` 会让后者裂图 —— 这条守卫就是钉住这个混合形态的。需先 `npx vite --port 5178 --strictPort`，可用 `PROBE_BASE` 覆盖 |
| `probe-activities-wall.mjs` | — | 活动&方块墙（/activities-wall）截图 + 打印。**无任何断言**，属「看起来有测试」的空壳（AGENTS.md 第 6 节已记为待补） |
| `probe-campaign-ui.mjs` | — | 活动页探针 v3（35 断言，mock + 真库双路）：报名卡/阶段徽章/报名反馈、月份轨道分组与精度角标、窄屏横滑、管理员投稿双路径（报名活动 vs 往期活动的字段差异与 payload 形状）。⚠️ 场景 B 原断言「真库 campaigns 恒为 0 行 → 空态必然命中」已于 2026-09-29 作废（真库有进行中活动），改为「主卡或空态恰好命中一种」 |
| `probe-campaign-draft-rls.py` | — | 只读校验 `activity_campaigns` 的 draft 行是否对 anon 可读（plans/008 §2.3 记的安全缺口） |

### AI / BOHAI / 心理访谈（4）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-bohai-mode-loading.mjs` | — | QA probe: BOHAI 模式选择器 Loading 动画验证 |
| `probe-lab-bohai-mode-chat.mjs` | — | 实测：Lab 选 BOHAI 模型（Air）后发普通聊天 → 抓 vault runtime 请求验证 provider/mode/model 分流 |
| `probe-psych-dialog-quality.mjs` | — | 心理访谈 · 对话质量评估探针 做法：探针扮演一个来访者，按「剧本」逐轮回答，每轮抓下 AI 的提问并自动判分。 |
| `probe-psych-interview-wiring.mjs` | — | 心理访谈接线验证探针 验证「点加号 → 心理分析」之后，真正发给模型的 payload 是否符合设计： |

### 用户空间 / 资料 / 登录注册（20）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-account-bind-prompt.mjs` | — | probe-account-bind-prompt.mjs —— 账户绑定引导弹窗（AccountBindPrompt）的可视化探针 |
| `probe-cloud-portrait.mjs` | — | **Cloud+ 竖屏顶栏 + 设置页玻璃（27 断言，2026-10-01 新增）**：三档竖屏（390×844 / 375×667 / 320×568）走真实入口（用户空间设置 → Cloud+ → 底栏「内容」）后逐档断言 —— A 工具行 `flex-wrap: wrap`；B 搜索框 ≥150px 且内部 input ≥80px（报障原状 30px/0px，placeholder 与已输入内容全不可见）；C「筛选」「刷新」单行不折字（折行时 h≈69）；D「＋新建」不越出视口右缘（报障原状 right=518 > 390，右半边被祖先 overflow 裁掉）；E 无横向滚动；F 页头不吸顶；G 底栏液态玻璃未丢；H 零页面错误；I 设置页卡片为液态玻璃（`backdrop-filter` 真在 **且** 背景是半透明白 —— 只看 blur 会被 scoped 的实色底骗过去，改版前正是「blur 生效了但底色仍 #f5f5f7」）。⚠️ 三条取舍：① 必须走真实入口，直接 `goto('/user-space/note')` 会被路由守卫拦回首页（注入登录太晚）；② Cloud+ 整页无暗色适配，玻璃在暗色下主动退回页面实色底，故探针只测亮色档；③ 相册网格断言需 mock 带图条目（探测账号 0 条内容），未纳入本探针。**反证已做**：把 ≤640 块修复整段还原成 `flex-wrap: nowrap` + 搜索框 `flex: 1`，三档 B/C/D 全红（搜索框 30px、筛选 h=69、新建 right=518/503/448） |
| `probe-cloud-album.mjs` | — | **Cloud+ 相册「iOS 图库式密铺」（22 断言，2026-10-02 新增）**：两档视口（390×844 / 1280×900），用 `page.route` 拦 `boh_cloud_entries` 回 23 条 （20 单图 + 一条 3 图 + 一条 2 图 + 一条纯文字），**期望渲染 26 格** —— 这一个数字同时证明「多图贴摊平成 N 格」与「纯文字条目仍占 1 格纸片」。断言：去月份分组（`.album-month-heading` 必须为 0）/ 格子正方形 / 直角 0 圆角 / 无「N 图」角标 / 图片全加载 / 无横向滚动；竖屏另测固定 5 列 + 通栏贴边 + 1px 缝；横屏测自动多列（>5）；并模拟两指 TouchEvent 锁「捏合 5→4→3→4」与 localStorage 落盘。⚠️ 四条实测坑：① 必须 mock —— 探测账号 Cloud+ 是 0 条内容，空态不渲染网格；② 图片用 `data:image/svg+xml` 带序号，绕开外网与 `utils/db-image-url.js` 的云图改写；③ 探针开头要 `localStorage.removeItem('boh-cloud-album-columns')` —— 列数会落盘，不清起点会让「5 列」断言读到上一轮的 4 列而假红；④ 列数读的是 `--album-columns` 变量，不是 `grid-template-columns` 字面量（列数已由 JS 算，CSS 只消费变量）。**反证已做**：把 `albumTiles` 的 `flatMap` 换回「一条目一格」→ tiles 26→23、两档「多图贴铺开」当场变红 |
| `probe-impressions-ui.mjs` | — | 探针：我的印象面板液态玻璃重设计 |
| `probe-join-audit.mjs` | — | 探针：注册页（/#/join）现状取证 —— 截图 + 关键计算样式实测 |
| `probe-join-mobile-metrics.mjs` | — | 探针：注册页移动端横向溢出 / 触控目标 / 对比度实测（为改版方案提供数据依据） |
| `probe-join-real-layout.mjs` | — | （无头部说明） |
| `probe-join-real.mjs` | — | 探针：真实注册页（src/views/Join/index.vue，路由 /#/join）验收 |
| `probe-join-wizard-demo.mjs` | — | 探针：注册页方案 B（三步向导）demo 的行为验收 |
| `probe-lottery-join-rpc.py` | — | （无头部说明） |
| `probe-passkey-login.mjs` | `npm run probe:passkey` | probe-passkey-login.mjs — 登录页通行密钥入口 E2E 探针 |
| `probe-profile-impressions.mjs` | — | 探针：他人空间（/profile/:username）印象 tab 液态玻璃重设计 |
| `probe-profile-info-row.mjs` | — | probe-profile-info-row.mjs — 他人主页「积分卡 + 用户信息」横屏并排验证 |
| `probe-profile-rail.mjs` | — | 探针：他人空间（/profile/:username）横屏同体系分栏验收（2026-09-19） |
| `probe-reset-password-liquid.mjs` | — | 探针：重置密码页 liquid 改造验证（亮/暗两态截图） |
| `probe-user-space-ia.mjs` | — | 探针：用户空间 IA 回归（2026-09 面板上提 + 抖音式文字页签） |
| `probe-user-space-perf.mjs` | — | 探针：User Space 系统性性能审查 v2（索引切阶段 + 定时器堆栈归因） |
| `probe-userspace-pages.mjs` | `npm run probe:userspace-pages` | probe-userspace-pages.mjs — UserSpace **全页面**切换审计（逐页，不抽样） |
| `probe-userspace-switch.mjs` | `npm run probe:userspace-switch` | probe-userspace-switch.mjs — UserSpace 分区切换流畅度实测 |
| `repro-join-wizard-demo.mjs` | — | 反证：把每处修复改回缺陷版本，确认对应断言真的变红。 |

### 订阅 / 抽奖 / 积分 / 台账（7）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-campaign-draft-rls.py` | — | （无头部说明） |
| `probe-points-card-image.mjs` | — | 方块积分卡「自定义卡面」裂图探针（7 断言，真 CDN 端到端，非 mock）：DB 的 `points_card_image_url` 存 Cloudinary 直链（大陆实测 http 000），渲染必须经 `resolveDbPointsCardImage` 改写。覆盖概览/装扮两个宿主的 PointsCard；预设缩略图需真实会话（无则 SKIP） |
| `probe-campaign-ui.mjs` | — | 活动页面探针 v3（2026-09-17 活动页重构：顶部报名卡 + 按月份分组横向轨道） |
| `probe-dm-lottery-entries-jump.mjs` | — | 探针：数据管理面板「名单」按钮 → 抽奖报名记录跳转 + 翻页 |
| `probe-ledger-shop-checkin.mjs` | — | 探针：2026090905 商城/签到流水改造的远程契约验证（anon 视角） |
| `probe-ledger-verify.mjs` | — | 积分账本补全验证探针（2026090903 迁移后）： 1) subscribe_with_points anon 调用 → 期望 NOT_AUTHENTICATED（函数已替换且入口活着） |
| `probe-production-preview.mjs` | — | 生产预览验证探针（vite preview @4173，覆盖 dev 探针覆盖不到的盲区）： |

### 数据管理面板 / RLS / 权限（8）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `audit-datamanagement-columns.mjs` | `npm run audit:dm-columns` | 数据管理面板「列错误」静态查错 原理：后台每个 tab 点击后会向 PostgREST 发一条带 select/filter/order 的查询。 |
| `probe-privacy-cols.mjs` | — | （无头部说明） |
| `probe-resolve-email-rpc.mjs` | — | 探测远程 resolve_email_for_login 是否已修复（email 从 auth.users 取） |
| `probe-rest-spec.mjs` | — | （无头部说明） |
| `probe-rls-audit.mjs` | — | RLS 实测探针：拦截页面发出的 Supabase REST 请求抓取 anon apikey， |
| `probe-rls-verify.mjs` | — | RLS 加固复测：090803 应用后 anon 视角的权限验证。 |
| `verify-datamanagement-columns-live.mjs` | `npm run audit:dm-columns:live` | 数据管理面板 · 列引用「真打」验证 静态比对只能说明「前端声明了某个列，而 schema 快照里没有」。 |
| `verify-datamanagement-writable-fields.mjs` | `npm run audit:dm-writable` | 数据管理面板 · 写入白名单真打验证 `TAB_WRITABLE_FIELDS`（config/fields.js）是「编辑/新建保存」时真正的列白名单 —— |

### 构建 / 性能 / 产物验证（12）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `probe-blank-screen-diagnosis.mjs` | — | 白屏诊断探针（只读，不改任何源码） 精确区分两类 chunk： 应用壳依赖 = 入口 app-*.js 的静态 import（8 个，Vue mount 之前必须全部到位） |
| `probe-boot-perf.mjs` | — | 首屏性能对比：改造前(dist) vs 改造后(dist-check) 目的：确认内联启动骨架**让首帧内容提前出现**，并且不拖慢挂载/可交互。 |
| `probe-commit-pipeline.mjs` | — | 提交 a180938 验证探针：Beta5 选图预热管线（压缩→检测→3路并发上传） |
| `probe-console-entries.mjs` | — | 装修台入口探针 —— 验证数据管理面板里「商城装修 / 首页装修 / 头像框」 三个 page 类页签的接入与功能是否正常。 |
| `probe-core-pages-errors.mjs` | — | 核心路径运行时错误扫描：逐页访问并收集 pageerror / console.error， |
| `probe-final-check.mjs` | — | 1. 页面顶部：侧栏不应遮 Hero（top 应等于其自然位置） |
| `probe-first-paint-real.mjs` | — | 首屏测量受 Service Worker 安装态影响很大（第一次裸跑、第二次已被 SW 接管， |
| `probe-perf-baseline.mjs` | — | 加载性能基线（2026-09-29，源自 docs/2026-09-29-加载速度与提速全面评测报告.md 附录 A）：线上冷首访 CWV + 资源账本 + 入口闭包 BFS + 游客态 DB RTT/头像字节。只读打线上，**不进 verify/build:ci 主链**；改图片管线 / 预缓存 / 请求收敛后重跑对比，`--json` 落盘前后对照 |
| `probe-four-issues.mjs` | — | 探针：四个问题修复后的验收（每个断言都对应本次修复的一条不变式） |
| `probe-release-p0-fixes.mjs` | — | probe-release-p0-fixes.mjs 验证 release 报告批次 0 的两处修复，逐条对应报告里的「验收」条款： |
| `probe-top.mjs` | — | （无头部说明） |
| `probe-verify-boot-changes.mjs` | — | 启动骨架回归探针（只读，不改源码） 三个场景，覆盖首屏骨架的全部不变量： V1 暗色首帧：data-theme 是否在首帧就已就绪、骨架/body 底色是否为暗色 |
| `probe-webp-compression.mjs` | — | 直测 image-compression.js 的 WebP 输出与文件名归一化（提交改动的核心点之一） |

### 一次性排障（大概率已过期）（9）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `_tmp-album-book-shot.mjs` | — | （无头部说明） |
| `_tmp-album-debug.mjs` | — | （无头部说明） |
| `_tmp-fetch-demo-images.mjs` | — | [文件名, picsum id, 宽, 高] —— 尺寸与 demo-album.js 的 ratio 对应（横/竖/方） |
| `_tmp-immersive-debug.mjs` | — | 枚举样式表里含 nav-immer |
| `probe-avatar-frame-new.mjs` | — | 探针：仓鼠瓜子 / 奶牛抱抱 两新头像框接入回归 |
| `probe-aw-z.mjs` | — | 点击第一张墙上的纸条 → 详情弹窗（.modal-backdrop） |
| `probe-blob.mjs` | — | （无头部说明） |
| `probe-fix-three-bugs.mjs` | — | 三 bug 修复验证探针： |
| `refute-avatar-frame-purchase.mjs` | — | 反证脚本：只验证一条因果 —— 「积分解锁成功后立即佩戴，且不再劝买」。 |

### 其它（32）

| 文件 | npm script | 说明 |
| --- | --- | --- |
| `fetch-db-schema.py` | `npm run audit:dm-schema-refresh` | （无头部说明） |
| `probe-about-heatmap.mjs` | — | 探针：关于我们页（/about）· GitHub 热力图加入后的回归 |
| `probe-activities-wall.mjs` | — | 1. 落地活动 tab |
| `probe-admin-drawer-fix.mjs` | — | 探针：DataManagement 编辑抽屉错位诊断 + 横竖屏回归 |
| `probe-avatar-circle.mjs` | — | 探针：论坛头像全圆化回归（发帖编辑器横/竖屏 + 列表 + 回复） |
| `probe-avatar-frame-elf.mjs` | — | 探针：Ultra 专属「菊花梨 / 奇丽草」两头像框接入回归（首发 7 天限时免费 → 到期转 Ultra） |
| `probe-avatar-hero-frame.mjs` | — | 探针：我的空间 / 他人空间 hero 大头像 圆形 + 佩戴框 回归 |
| `probe-beta6-hero.mjs` | — | BETA 6 焕新 Hero 探针： |
| `probe-beta6-removal.mjs` | — | 探针：4.9.1 回退通道移除 + Beta 6 版本页冒烟 |
| `probe-boh-app-page.mjs` | — | 探针：BOH App 产品介绍页（/app） |
| `probe-card-image-check.mjs` | — | 用内容类型筛选捞出全部活动官方卡 |
| `probe-cf-config-demo.mjs` | — | 1. 面板一：资源列表渲染 |
| `probe-character-ring-fix.mjs` | — | （无头部说明） |
| `probe-compact.mjs` | — | （无头部说明） |
| `probe-email-count.mjs` | — | （无头部说明） |
| `probe-export-demo.mjs` | — | ---------- 浅色 ---------- |
| `probe-export-v2-harness.mjs` | — | ---------- 1. 从 index.ts 抽出生产 previewHtml 模板并插值 ---------- |
| `probe-health-ai.mjs` | — | （无头部说明） |
| `probe-hero-console-street-scene.mjs` | — | 首屏可编辑性探针 —— 验证「数据管理 → 首页装修 → 首屏街景」这条控制链路是否真的可点通。 |
| `probe-hero-unify.mjs` | — | Hero 规范 V1 代码统一回归探针（零视觉变化验证）： 1) 关键计算样式数值快照（Beta6 headline/玻璃卡/AGC S 档标题/CTA 颜色） |
| `probe-keyboard-inset.mjs` | — | 键盘 inset 全链路探针（2026-09-24） 验证目标（桌面 Chrome 无法真弹键盘，用 mock visualViewport 模拟「键盘占 300px」）： |
| `probe-landscape-rail-demo.mjs` | — | 探针：横屏左栏改造 demo（landscape-rail-demo.html） |
| `probe-messages-metrics.mjs` | — | 量测：消息页顶部每一层的实际占位（竖屏 + 横屏） |
| `probe-messages-ui.mjs` | — | 探针：消息中心 UI 现状截图（注入 mock 通知数据） |
| `probe-news-image-check.mjs` | — | （无头部说明） |
| `probe-overview-day-marker.mjs` | — | 离线总结「上次在线日 / 当日已检查」天粒度游标 — 纯函数单元验证 |
| `probe-pd-modal.mjs` | — | 探针：横屏帖子详情弹窗化（openForumPost 单源分流 + 小红书式布局） |
| `probe-ppt-quality.mjs` | — | 探针：PPT 质量优化全链路回归（mock vault 流 + 模型配置，直调 usePPTGenerator） |
| `probe-resources-hub.mjs` | — | 1. 下载分段 |
| `probe-street-scene-brand.mjs` | — | 品牌兜底首屏（白底 + 红苹果 logo + 黑字）视觉专项探针。 场景： A 竖屏（无街景图）：纯白底、logo 居中且完整、问候/提示为黑色且无阴影、无黑色渐晕 |
| `probe-street-scene-copy.mjs` | — | 首屏文案可配 ── 端到端探针（不写库，靠 mock home_heroes 响应驱动） |
| `probe-version-update-click.mjs` | — | probe-version-update-click.mjs — 「发现新版本 → 立即更新」点击后是否真的拿到新应用壳 |

---

生成自 156 个脚本文件。带 `_tmp-` 前缀的是一次性排障脚本，可以直接删。
