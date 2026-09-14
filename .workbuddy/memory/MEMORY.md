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
- **暗色主题是死类重灾区**：`src/styles/themes/*-dark.css` 5 个文件占 305 个死类（→ B3 首批）。`boh-note-dark.css` 整文件服务已不存在的 BOH Note，却仍被 theme-css-loader 的 dark 组动态加载。
- **删除手法判据**：注释法只在 CSS 选择器块占优（构建不校验类名，唯一信号是视觉）；整文件一律 `git rm`+tag 回滚（注释后仍被 lint/tsc/glob/门禁扫到）；禁用试跑用 `git mv X X.disabled`。CSS 不能嵌套注释（块内已有 `/* */` 会提前闭合）。
- 强耦合必查项：`scripts/important-budget.json`（按路径登记配额，删文件不同步改基线必挂 build:ci）· `check-project-structure.mjs`（`@styles` 别名断言、`.DS_Store` 告警）· 单测若以源码文本断言（`bohai-quick-sidebar.test.js` 读 `GlobalAiGlassOverlay.vue`）则文件与断言须同批删。删完务必 `find src -type d -empty`（0629 删 `LithiumIron/index.vue` 后空目录留了 3 个月）。
