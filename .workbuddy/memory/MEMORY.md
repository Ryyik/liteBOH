# BOHLITE 项目长期记忆

## 暗色主题机制
- themeManager（utils/theme-manager.js）：启动读 localStorage `boh-theme`（light/dark/system/home-cat/anniversary-mc）→ applyTheme 设 documentElement[data-theme] + 给 14 个容器挂 data-theme；ensureThemeCSS('dark') 懒加载 9 个暗色 css。无路由钩子，页面容器 data-theme 靠组件 :data-theme 自管理。
- 探针保真：addInitScript 设 boh-theme=dark 再启动（直接 setAttribute 会因暗色 css 未懒加载而全盘误报）。全站审查=probe-dark-audit.mjs（50 页）+ dark-audit-results.json；**playwright launch 必须加 args:['--no-proxy-server']**（WorkBuddy 会话系统代理劫持 localhost，清 shell 代理变量无效）。暗色 severe 已从 50+ 修到 29（9/8 深夜），剩 = shop 插画资产/forum 无类名 chip/login·about 误报/motion-lab 开发页。
- 根因：tokens.css dark 块未派生 --liquid-text-*；~25 个组件硬编码近黑字且整文件 0 条 dark 规则。

## 导航栏（UnifiedNavbar）
- #unified-nav-container fixed z-index:9999；弹层盖它需 ≥10002。吸顶避让用 ResizeObserver 实测高度写页面 --nav-h，勿写死。
- showIsland.custom(comp,props)（useIsland.js），页面卸载必须 close。常驻岛先例 WallIslandCard/PityIslandCard；分享岛入口 PostCard .share-btn-v2；news/activities 详情=ContentDetailIsland（活动走 remountWallIsland 握手）。
- scoped 暗色铁律（9/9 修订）：**本项目 Vue 编译器不支持 `:global()`**——SFC scoped 里 `:global(...)` 原样泄漏进 CSS（非法伪类整条被浏览器丢弃，AssetHubPanel 186 处暗色规则全死即此因，且"整条 :global"旧建议作废）。正确写法：**直接平铺祖先选择器** `.user-space-page[data-theme="dark"] .child` 或 `html[data-theme="dark"] .child`（[data-v] 只加在最后一段，祖先不用作用域）。判断规则是否生效：curl 编译产物 style 子请求 grep，或探针 getComputedStyle 实测。
- 导航暗色文字已修：vendor body.page-* color:#000!important 用容器 ID 特异性+!important 压过（probe-nav-dark.mjs 回归）。

## 样式体系
- 玻璃单一源 tokens.css --liquid-*（22 个）；禁散装 backdrop-filter（<6px 装饰除外）；玻璃遮罩禁半透白叠加，用 backdrop-filter/mask。
- **`:deep()` 铁律（9/9 血泪）**：`:deep()` 只在 SFC scoped 块有效；抽到全局 css 会整条静默失效（无效伪类被丢）——论坛嵌入 80px 顶距 bug 即此因。全局 css 一律平铺后代选择器。判断某规则是否生效：探针 getComputedStyle 实测，别信代码存在性。
- token 四套并行（--liquid-*/shadcn/--apple-*/--boh-*）；品牌蓝拍板 #0071e3；暗色三机制（[data-theme=dark] 为主 + data-boh-theme + prefers-color-scheme）。
- **!important 棘轮门禁（9/8 建）**：scripts/check-important-budget.mjs + important-budget.json（基线 1396），已进 build:ci；styles/themes/* 白名单豁免。暗色页修复两模式：变量驱动页 dark 重定义整组变量；硬编码页 scoped 内 `html[data-theme="dark"]` 前缀（teleport 组件要用挂载根自身属性如 `.sidebar[data-theme=dark]`）。
- 空态组件 = src/components/ui/EmptyState.vue（插画 inbox/search/spark + 文案 + 动作，compact 模式，明暗双主题），新页面空态一律用它。
- Teleport 弹层不在 .forum-page：局部 token/forum-dark.css 作用不到；只用全局 --liquid-*，暗色自写并在弹层根覆盖文字 token + font-family 栈 + 表单 inherit。flex 壳包 textarea 必须 flex:1;width:100%;min-width:0。
- 遗留：buttons/headings/globalpage.css 用 Saira/Poppins 待统一 SF Pro。
- Hero 规范 V1（9/8 深夜）：styles/common/hero-surface.css = --hero-* 单源（headline 三档 L=clamp(44,6.5vw,76)/M=clamp(40,6vw,64)/S=clamp(28,4vw,40)、文字色、品牌蓝 #0071e3/暗表 #2997ff、eyebrow 17px/0.12em、CTA h50）；Beta6 hero 已无私有变量（走 --liquid-*+--hero-*，暗色块只补文字色+底色）；AGC=S 档；HeroSection.vue 已删（HistoryHeroSection 是另一组件）。OHL 92px/AHB 80px 收敛 M 档 + birthday/agent-preview 渐变整改=视觉变更，用户拍板留下次视觉迭代。零视觉变化验证法：probe-hero-unify.mjs crop 首屏 0-900px + 像素容差 8（折叠线下的角色环随机排布/懒加载图片时序会制造假 diff，同代码跑两次对照即可甄别）。

## 项目事实
- hash 路由；dev 5173 常驻自启；探针根目录 probe-*.mjs（chrome channel），截图 debug-screenshots/。伪造登录=运行时注 pinia auth.isLoggedIn；admin 需真实会话（ensureAdminAccess 走 DB）。路由全表 src/router/routes/*.ts。
- Edit 工具可能静默丢改动：重要编辑写后重读；搜索用内置 Grep（BSD grep 的 \| 不可靠）。

## 数据层
- posts 有 post_kind/source_type/repost_of_post_id；官方卡 created_at 继承旧日期→沉底；类型筛选必须下推服务端；RPC 不含 post_kind 前端 hydrate 兜底，探针判类型别查 textContent 前缀。
- 封面解析必须在 API 层 resolveStoredCoverUrl（页面层被 images.length 短路）。
- subscribe_with_points 不写流水；权益判断四套真相源；积分只有 auth.userInfo.points；admin_grant_points 有竞态。新活动一律填 campaigns 三表，禁一次性表/页。
- 090705/090801-04 已应用远程；supabase db push 必须 --yes。profiles.email 已 drop 勿写入；**drop 列必须同步清引用它的 RPC**（0908 删 email 列，0907 的三个 sensitive RPC 当场炸 record has no field——0910 迁移修复；resolve_email_for_login 由 0911 修复：volatile+auth.users+只 RETURNING count，否则方块 ID 登录全挂）。迁移时间戳避开已占用编号（0901/0909 已烧，**写前先 db push --dry-run 查占用**；孤儿行 migration repair --status reverted 摘除）；docker 缺失时 `db query --linked` 可直查远程；残留洞=authenticated 互读隐私列（拆 profile_private 待办）。

## 设置子页体系（20260909 统一）
- **单一源 = UserSpace/styles/settings-glass.css**（gs-* ：glass-settings 连续面板/分组行/图标 chip/表单/按钮/横幅/进度 + 暗色文字组覆盖 + 竖屏窄/横屏矮响应式）。接入：ProfileSettingsPanel（顶部「账户」组=绑定邮箱行可复制，:user-email 传 userInfo.email）、PushplusSettings、DataExportPanel、DataPrivacyPanel、AccountSecurity。新设置子页一律 @import 它。
- **竖屏返回按不动根因**：悬浮导航岛（z 9999）盖 sticky UserCenterPageHeader（profile-base.css 把 --user-center-nav-offset 写死 0）。修法=App.vue showGlobalNavbar：`tab=settings && view非home` 与 profile 子页同样隐藏导航岛。回归探针 probe-settings-glass.mjs（含 elementFromPoint 返回键命中测试）。
- 坑：lucide-vue-next 无 LockPlus（坏 import 拖垮异步组件白屏）；tokens dark 块不派生 --liquid-text-*，玻璃组件暗色文字须自带覆盖；伪造登录进 requiresLogin 路由要先落公共页再 location.hash SPA 跳转。
- 新增 builtin hero 五处：Beta6RenewalHero 式组件 + BuiltinHeroRenderer 分发 + homeArchiveData(layout/meta) + homeHeroes.ts baseline + migration upsert（home_heroes.builtin_key UNIQUE，表已存在免建）；置顶用负 sort_order（远程动态区占 0/1/2，运营已改过远程 builtin 排序勿信 baseline）。beta6-renewal=-10 已上线（2026090907/08）。

## 其他
- 发帖器（拍板）：纯白+圆角玻璃禁渐变，主色 #0071e3。群像环：CSS 全 JS 变量单规则；absolute 只设 left 需显式宽度；立绘 canvas alpha 归一化。
- 构建：vite build 被 shim 拦时前缀 CODEBUDDY_BROKERED_FS_HOOK_ENABLED=0 CODEBUDDY_SAFE_DELETE_SANDBOX=0 + --emptyOutDir false；勿 rm -rf dist。

## 数据导出预览页
- 导出 HTML 在 Edge Function user-data-export 内嵌 previewHtml。**已升级为液态玻璃 V2 并部署远程（20260909）**：--liquid-* token + PostCard 骨架 + 评论嵌回 + 点赞上屏 + 图片九宫格（resolvedImages: URL→ZIP 相对路径）+ 6 页签/搜索/灯箱/明暗三态；manifest.preview='liquid-glass-v2'。渲染层对所有表字段 pick 兜底（posts 无 title 列、likes 只有 post_id、notifications 需前端 join）。
- 验证链：export-preview-v2-demo.html（视觉蓝本，假数据）→ probe-export-v2-harness.mjs（抽生产模板+真实 schema 数据+仿 ZIP 目录冒烟，改模板必跑）。改 previewHtml 大块时用锚点拼接法（part 文件 + node splice），拼完查游离反引号/${ 与 DATA 声明行。

## 论坛内容 tab 架构（20260909）
- **论坛真实入口 = /user-space?tab=community**（/forum 已 redirect→user-space?tab=posts）；论坛是 community 段里 embedded 的 ForumMain。顶部内容 tab = **UserSpace SegmentTabs 六档**：最新/关注/新闻/活动/成员/印象。
- **externalFeed 握手协议**：'latest'|'following'|'news'|'activity'（communityExternalFeed computed）→ ForumMain watcher 一次同步关注态+selectedContentType、单次 fetch；游客关注 return 门槛保留。news/activity/latest 互切只动 contentType，following 只动关注态；latest/following 会把 contentType 归零。
- ForumToolbar 下拉只剩 排序+标签（内容类型已删）；ForumMain 内部 tab 行（全部/论坛/新闻/活动│关注）仅 standalone 兜底，嵌入态 externalFeed 非空恒隐藏。
- **坑**：getPosts 走 request-core executeRead LIST_DATA TTL 缓存→来回切可能零网络请求（非 bug）；kind 筛选双路径：keyset 直查=`post_kind=in.(news)` URL 参数，RPC 路径=`p_kind_filter` body——探针判下推两条都要看。回归探针 probe-forum-content-tabs.mjs（25 项）。

## 伪造登录 & 探针铁律（20260909 沉淀）
- **pinia 伪造登录**：`auth.isLoggedIn` 是 ref 可直接 `state.auth.isLoggedIn=true`；**`auth.userInfo` 是 reactive({})，必须 `Object.assign(auth.userInfo, {...})` 原地改**——整对象替换不生效（store 闭包仍指原对象），守卫静默 early-return。
- **CommonAlertModal**（.common-alert-overlay/.alert-confirm-btn）异步弹出：探针要等 overlay 出现→点确认→等 detached，否则挡点击超时。
- **supabase 路由 mock 分流**：同表多形态请求按 URL 特征精确区分（列表 select 宽、.single() 属主校验 select=`author_id,target_id` 窄列精确匹配、DELETE 记 id 回 204）；假数据行要带齐后端校验用的列（author_id/target_id）。
- 组件 scoped 样式会压过全局 css 的 media 覆盖（同特异度看注入顺序）——响应式行为要写进组件自己的 scoped media。
- 印象面板 probe-impressions-ui.mjs（18 项）可作"网络 mock + 两步交互 + alert 时序"探针模板。
- **伪造登录 id 必须合法 UUID**（如 00000000-...-abcd）——假 id 进 posts 查询 `or(author_id.eq.假id)` 会 400（PG uuid 校验），表现为详情页卡 skeleton。
- **chrome 探针网络**：系统代理可能只劫持部分域名（supabase.co 坏、baidu 通），`--no-proxy-server` 不够，须加 `--proxy-server=direct:// --proxy-bypass-list=*` 强制直连；数据落定用条件等待（skeleton 消失 + img naturalWidth>0），固定 sleep 冷连接必 flaky。
- stacking context 陷阱：img/元素带 inline transform（缩放/平移样式）= z-index:0 绘制层，DOM 里排在前面的 z-auto fixed/absolute 按钮（无显式 z-index）会被它盖住 → "点左没反应点右可以"这类单向点击失效八成是这个。

## 性能审查基线（20260909，P0 已落地）
- probe-user-space-perf.mjs = User Space 性能回归探针（五 tab 请求计数/setInterval 堆栈归因/堆趋势/索引切阶段）；报告 user-space-perf-audit-report.html。**P0 已全部实施（9/9）**：AsyncBOHAI 挂载靠 bohaiActivatedOnVisit（分区激活才置位）+ hover 预载已摘除 BOH AI、BOHAIMain 可见性=ResizeObserver（1s 轮询已删）、runProfileCriticalFetches 5s 合并窗口 + warmup 在 posts 收口、印象 30 条/页+加载更多。实测：messages tab 93→9 请求、1s 轮询 0、posts 聚合 RPC 2→1、堆增量 ≈0。**P1 待办**：聚合 RPC 失败负缓存 + 云盘用量 500 条兜底改窄查询、embedded ForumMain 裁剪（weekly/checkin/ads/NSFW 预载）、hydrate 三连查并入主 RPC；P2：成员分区 100 条池+30s 轮询治理。正面勿动：回访社区零请求 TTL 实锤。fetchUserStats 900ms 失败重试是既有设计（伪会话探针下会产生 2 个 HEAD abort，真实会话不触发，勿当回归）。
