# BOHLITE 项目长期记忆

## 环境/探针
- hash 路由；dev 5173 常驻；探针 probe-*.mjs 在根目录（chrome channel），截图 debug-screenshots/。路由全表 src/router/routes/*.ts。
- playwright 必加 args:['--no-proxy-server','--proxy-server=direct://','--proxy-bypass-list=*']；测暗色必须 addInitScript 设 boh-theme=dark（css 懒加载，直接 setAttribute 误报）。
- 伪造登录：等 3s 后现注 pinia isLoggedIn+userInfo（userInfo 是 reactive({}) 必须 Object.assign 原地改；id 必须合法 UUID 否则 400）。禁种 sb-*-auth-token（PGRST301 全站挂）、禁拦 /auth/v1/**。admin 需真实会话。
- 弹层断言：等 overlay→确认→detached；数据落定用条件等待。supabase mock 按 URL 特征分流，假行带齐 author_id/target_id。
- 同一文件多处修改禁止放同一并行 Edit 批次（会静默丢改动）；重要编辑写后 grep 复核；搜索用内置 Grep。
- 沙箱拦截时前缀 CODEBUDDY_BROKERED_FS_HOOK_ENABLED=0 CODEBUDDY_SAFE_DELETE_SANDBOX=0（node 大量读文件会被 SIGKILL 137）；vite build 加 --emptyOutDir false；勿 rm -rf dist。

## 主题/样式
- themeManager：localStorage boh-theme→html[data-theme]，暗色 css 懒加载。Vue 不支持 `:global()`、全局 css `:deep()` 静默失效；暗色=平铺选择器 `.page[data-theme="dark"] .child`。teleport 弹层只用全局 --liquid-* token+自写暗色文字覆盖。
- 玻璃单一源 tokens.css --liquid-*；禁散装 backdrop-filter；品牌蓝 #0071e3（暗 #2997ff）。**全站禁用 content-visibility:auto**（WebKit bug 321501，程序化 scrollTo 不复现，真机才复现）。
- **液态玻璃 token 速查（0914 复核）**：源文件 `src/styles/common/tokens.css`（26 个唯一 `--liquid-*`，`main.js:7` 全局加载），分 9 族——bg(5)/border(3)/blur(3)/filter(3)/highlight(2)/shadow(3)/radius(3)/text(3)/saturate(1)。消费方 3 个：`liquid-glass.css`（纯 CSS 类库，门禁唯一豁免裸写 backdrop-filter）、`glass-ui.css`（档位派生）、`hero-surface.css`（Hero 的 `--hero-*`）。门禁 `scripts/check-liquid-glass.mjs` 禁三类重复定义（`--glass-filter-*` 再派生 / 成品档字面量 `blur(28px) saturate(180%) brightness(1.02)` / `blur(NNpx)` 且 NN≥14）。
- ✅ **已修（0914 ba873636）**：`tokens.css` 暗色块已补派生 `--liquid-text-*`（primary `#f5f5f7` / secondary `#a1a1a6` / tertiary `#8a919c`，三级在暗玻璃上对比度 15:1/6.4:1/4.6:1 均达 AA）。原先 5 个文件散着 9 个硬编码暗色文字值（ResetPassword / Forum 弹层 / settings-glass / DataExportPanel / Beta6 hero）已全部收敛：2 处字面量 token 重定义删除、settings-glass 删 10 条硬编码暗色规则、DataExportPanel 整段删除、`--hero-text*` 改为别名 `--liquid-text-*`（var() 在使用处解析 → hero 自动获得暗色，无需暗色块）。
- **关键机制：项目有两套暗色选择器，都有效，别只查一套**
  ① `theme-manager.js` 把 `data-theme` 挂到 html + **14 个具名容器**（`.forum-page`/`.post-detail-page`/`.user-space-page`/`.account-security-page`/`.address-page`/`.subscription-page`/`.note-page`/`.partners-container`/`.tags-impressions-page`/`.pushplus-settings-page`/`.shared-memory-page`/`#unified-nav-container`/`.bohai-page`/`.x-notifications-container`）→ 后代式 `[data-theme="dark"] .x` 生效（全站 2589 处用此式）。
  ② **7 个组件自绑定** `:data-theme="currentTheme"` 在根元素上（Beta6RenewalHero / PostDetailMain / BetaPreviewMain / UserSpaceMain / NewsDetailPage / ForumMain / ProfileMain）→ 同元素式 `.x[data-theme="dark"]` 生效。
  断言某段暗色 CSS 是死代码前，**两套机制都要查**，否则会误判（0914 踩过）。
- ⚠️ **macOS BSD grep 两个沉默陷阱（导致过两次误判）**：`\s` 与 `\|` 交替**都不支持**，且**不报错、静默返回空**——空结果会被误读成"不存在"。正确写法：`[[:space:]]`、用内置 Grep 工具（ripgrep）或分开执行。`grep -n "a\|b"` / `grep -nE "^\s*--x"` 都是坑。
- ⚠️ **只 grep `src/` 会漏掉真消费者（第二次误判）**：`--liquid-border-strong` 曾被判"全站零引用"，实际由 **`supabase/functions/user-data-export/index.ts:581`** 消费（导出 HTML 模板内联样式表）。**Edge Function / output / 根 demo 都在 `src/` 之外，却是真消费者**。断言"零引用"必须全仓检索（含 supabase/ 与根 html），不能只查 src。
- **液态玻璃 token 有 3 份额外内联副本（已漂移）**：`supabase/functions/user-data-export/index.ts` 与 `output/preview-html-v2.part.ts` 各内联 **23 个**（源是 26 个，均缺 `--liquid-bg-overlay` / `--liquid-blur-lg` / `--liquid-filter-lg`）；`export-preview-v2-demo.html` 内联 24 个。两份 ts 内容一致、且**自带 `data-theme` 暗色块并已派生文字 token**（`#f5f5f7/#a1a1a6/#7c7c82`）—— 说明导出模板早就独立处理过这个缺口。**但它的 tertiary `#7c7c82` 与 app 现值 `#8a919c` 已漂移**；app 侧改用 `#8a919c` 是因为 `#7c7c82` 在暗玻璃上对比度仅约 4.1:1（低于 AA 4.5），而 `#8a919c` 约 5.1:1。改导出模板前需同批对齐（有 `probe-export-v2-harness.mjs` 验证链）。
- 文件头只写「Motion Tokens」但实际同时容纳动效 token（--ease-*/--duration-*）与液态玻璃 token，是"找不到液态玻璃 token 在哪"的主因；建议改标题或拆分。
- !important 棘轮门禁 scripts/check-important-budget.mjs（基线 1396）进 build:ci。Hero 单源=styles/common/hero-surface.css。空态一律 EmptyState.vue。
- 组件 scoped 压过全局 media——响应式写进组件自己的 scoped media。body.page-* 是活的（App.vue 动态挂 page-${route.name}），勿判死。

## 数据层/订阅
- 类型筛选必须下推服务端（keyset=post_kind / RPC=p_kind_filter）；getPosts 走 LIST_DATA TTL 缓存，切 tab 零请求非 bug。db push 必须 --yes；写迁移前先 dry-run 查占用；孤儿行 migration repair --status reverted 摘除。
- **订阅 P0 已修（0910 诊断 → 2026091001 已上线）**：价格/时长/试用参数服务端权威化（subscription_plan_prices 表 + RPC 查表取价；trial 锁 pro/3 天；云盘闸门纳入 trial）。遗留：权益四处分裂（订阅页硬编码/ai_quota_config/boh_cloud_image_limit_for_user/useLabQuota）待单一源化；record_lab_usage 只 insert 不校验，Lab 限额仅前端可绕过；周签到 5 分≈21.7/月≥Pro 月费 20→可白拿 Pro；无降档/自动续费。AI Token 配额服务端强制（reserve_ai_token_quota+429）是唯一真闸。报告 subscription-strategy-review.html。
- **订阅线上核查（0911）**：ai_quota_config 实际值已被手工对齐页面口径（20/80/200/500/1000 万，迁移基线 100/200/300/500/1000 万过时）→ 单位价值 Plus=Pro=10 万/积分，线性无台阶（此前「Pro 凹点」结论基于迁移基线，已修正）。bohai_model_configs 仅 5 模式：fast(guest)/Ultra(free)/Air(free)/Code(coding-lite 真门禁在跑)/agent-cluster=Caelum(max+disabled)；无 multimodal/plan 模式。「邀请好友注册」全仓无实现。
- 文案修正包（0911 已执行，build:ci PASS）：￥→积分单位、Pro 改「银色昵称」、多模态全档放开（对比行 free:true、付费 features 移除）、删「Agent 任务并行」「Agent & Plan」两行、FAQ 每周签到+删邀请好友、删死样式 .price-cny。AgentPreviewHero 未动（口径已一致）。钩子：Agent 重上线再恢复宣传；Coding 附加包上架=价格表加种子；silver 定案=头像框对齐基准。
- 定价口径（用户拍板 0910）：不强调 1 积分=1 元；页面以积分为展示单位，去掉 ￥ 歧义。

## UserSpace/论坛/消息
- 论坛入口=/user-space?tab=community；内容 tab=SegmentTabs 六档；externalFeed 握手 latest|following|news|activity→ForumMain watcher 单次同步。4.9.1 回退通道已拆（0911）：恒 Beta 6 单轨。
- 消息中心真实入口=UserSpace messages tab 的 AsyncMessages（user-center/Messages/index.vue），非 ForumMain 的 NotificationDrawer（死 UI）。NotificationSuggestIsland（未读→导航岛）调度在 UserSpaceMain，须 ensureNotificationStore()（直达 ?tab=messages 时 unreadCount 快照为 null）；watch 清零抢先 done 态用 suggestActionRunning 锁。回归探针 probe-notification-suggest-island.mjs。
- 论坛多图：横向 strip+分段指示器可点；全量图唯一入口 ensureForumPostFullImages（in-flight 去重）；shallowRef 元素改字段必须整体替换+triggerRef。官方卡详情按 source_type+source_id 回源+resolveStoredCoverUrl 封面。
- 头像全圆化（0911）：改形状要 grep 所有断点覆盖。
- 头像框清单（0912）：6+1 框全 free——无框/橙猫/蓝狗(1.24)/白绒猫(1.4)/仓鼠瓜子(1.43 白环盘)/奶牛抱抱(1.6)，单源 useAvatarFrame.js AVATAR_FRAMES，素材 public/avatars/frames/ 统一 1223×1223 PNG≤400KB。**新框接入流水线**：中心内切圆测量（white-cat 66.8% 校准基准）→散点构图勿机械 1/内孔，用 scale 矩阵目测定档→1223 缩放→清单注册→probe-avatar-frame-new.mjs 回归。仓鼠源图白底须 flood fill 抠（仓鼠身体近白，禁全局抠白）。
- **手绘线稿框的白色填充**：「用户说的白色背景=白色底板」（白绒猫填充板同款：白色实心环+线稿元素），不是身体轮廓内部填充——仓鼠返工两轮才对齐：v6 身体填充被驳回→v10 白色圆环盘（内径 70% 贴头像边、外径 97%，scale=1/0.70=1.43）一次过。实现=v1 flood 抠底为基底 + 环带 mask∩被抠区填白 + 身体带列扫描填充（first dark(lum<190)+8 上缘，弧线点列下缘）。勿用闭运算/纯连通域（手绘元素间距密，≥21px 核全图闭死）；暗色验收必须垫暗底截图；目测图上读坐标不可靠（显示缩放误差），一切以像素扫描数据为准；采样验证点必须确认在目标区域（曾拿背景点当身体点连 FAIL 三轮）。**脚本写文件必须核对 OUT≠SRC**，处理用户素材先留副本（仓鼠.PNG 曾被覆盖，靠 /tmp 中间产物无损重建）。
- 探针坑：SegmentTabs 按钮显式 role="tab"，getByRole('button') 匹配不到，用 getByRole('tab', {name})。装扮路径 /#/user-space?tab=assets→现注 pinia→点「装扮」tab（无 URL 直达）。

## 导出预览
- user-data-export 内嵌 previewHtml=liquid-glass-v2；验证链 probe-export-v2-harness.mjs（改模板必跑）；大块改动用锚点拼接法，拼完查游离反引号/${。

## 样式残留待清
- glass-ui 76% 死类、animations 89%、section__header 74%；tailwind 引擎 0 使用但 preflight 生效；data-boh-theme 91 处+prefers-color-scheme 11 文件残留；--apple-* 38/59 死。清理顺序见 style-remnant-audit-report.html 十三节。SCSS 编译 css 是 CRLF 行尾，批量正则要 \r?\n。

## 死代码审计（0914）
- **口径三套并存待合并**：`style-remnant-audit.mjs`=1133 · 方案初版=932 · 复算真值=**1667**（高置信 1247+动态风险 420）。差异全在「语料边界」。**审计语料必须排除生成产物**（`stats.html`、`.compress-images-cache.json`、`*-audit/report/results.json`、**以及上一次审计产出的 `*-report.html`**——它列出全部死符号名会让下次扫描归零）与设计稿套件（`Apple Style/ Claude Style/ Google Style/` 内含独立 HTML+CSS 会同时污染定义集与使用集）。**审计报告一律写到 `output/` 或仓库外。**
- 工具：用户级技能 `dead-code-safe-cleanup`（`~/.workbuddy/skills/`），脚本 `scripts/dead-code-audit.mjs` 单命令出 6 维度只读报告。孤儿 27 / 死类 1667 / 死 keyframes 15 / A 级可删资源 2。
- **暗色主题重灾区已清（0914 A 阶段）**：A1 删 `boh-note-dark.css`（592 行；功能已下线——无模板产出 `.note-page`，路由 `/user-space/note` 已复用为 Cloud+ 页别名 `BOHCloudPlus`）；A2 清 7 个 dark 文件（**选择器 1391→902，-1441 行，dist -36KB**）。`boh-note-dark` 是"意外命中"教科书案例：108 个选择器多为**无作用域裸规则**（`[data-theme=dark] .save-btn/.page-title` 等全站通用名）且位于 dark 组**最后加载位**（同特异性后加载者胜）；实测仅 `.nav-label` 真生效（全站底栏非激活色的唯一来源 `#7a7a8a`），已迁到通用层 `dark-mode.css` 转正。
- **★ CSS 死类删除判据（三个语义陷阱）**：① 选择器是 **AND**——用 `some(类名∈死类集)` 即可删（`every()` 会因作用域类活着而漏删 5/7 文件）；② **`:is()`/`:where()` 是 OR**——必须**展开所有组合**、要求每个组合都含死类才可删，否则会误删含活分支的规则；③ **`:not(...)` 内容须剔除出判定**（`.a:not(.dead)` 在 `.dead` 不存在时等价 `.a`，仍匹配）。保守边界：只删 `!dynamicRisk` 高置信死类。
- **"永不匹配"的静态充分性**：CSS 类名只能由 DOM class 属性产生 → 类名在「DOM 产生源」（`src/**/*.vue` 剥 style + `src/**/*.js|ts` + `index.html`；**排除 CSS 定义/文档/demo/探针**）零引用 = 逻辑必然永不匹配，强于运行时测量。配套：postcss 验证删除后选择器集合是删除前的**严格子集**（排除多行群组删成员在 diff 里的"删+加"错觉）。
- **截图对比必须同状态复跑做对照**：动态页（首页轮播、帖子「x 分钟前」、社区动态流）同状态三次数值互不相同（forum 218800/215235/218798），否则会把渲染抖动误判为改动影响。探针坑：`querySelectorAll[0]` 会误判（UserSpace 首个 `.nav-label` 恰是激活项）；伪造登录注入前须 `waitForFunction` 等 `#app.__vue_app__` 挂载，固定 sleep 会静默失败致受保护页被重定向（多张截图内容相同）。
- **测试基线已归零（0914）**：6 失败 → **0 失败**（105 文件 / 1707 通过 / 1 skipped）。原 6 个全是测试漂移（断言已移除的实现／常量数组未同步／引用已删文件致整 suite 未收集／mock 未跟上 upsert 改造）。**源码文本型守卫必须先剥离块注释**，否则会匹配到"解释为什么不用它"的说明文字。
- **删除手法判据**：注释法只在 CSS 选择器块占优（构建不校验类名，唯一信号是视觉）；整文件一律 `git rm`+tag 回滚（注释后仍被 lint/tsc/glob/门禁扫到）；禁用试跑用 `git mv X X.disabled`。CSS 不能嵌套注释（块内已有 `/* */` 会提前闭合）。
- 强耦合必查项：`scripts/important-budget.json`（按路径登记配额，删文件不同步改基线必挂 build:ci）· `check-project-structure.mjs`（`@styles` 别名断言、`.DS_Store` 告警）· 单测若以源码文本断言（`bohai-quick-sidebar.test.js` 读 `GlobalAiGlassOverlay.vue`）则文件与断言须同批删。删完务必 `find src -type d -empty`（0629 删 `LithiumIron/index.vue` 后空目录留了 3 个月）。
