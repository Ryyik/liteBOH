# BOHLITE 硬规则速查
> 2026-09-29 精简；全文（含推演与实测过程）归档在同目录 `MEMORY-full-2026-09-29.md`。

## 环境
vite 只绑 IPv6 → `--host ::`；构建 `--outDir dist-check`（勿动 dist）；vitest `--pool=forks`；npx 被 SIGTERM → `./node_modules/.bin/<tool>`。
⚠️ safe-delete 守卫对 `--outDir dist-check` **同样生效**（目标目录里 >50 个文件就拦，`npm run build` 和 `vite build --outDir` 都拦）→ 先 `mv dist-check /tmp/xxx` 让位再 build；`mv` 不算删、不会被拦。
⚠️ 后台起 dev/preview 服务必须用托管后台任务；`nohup … &` / `& disown` 起的进程会在那次工具调用结束时被杀，症状是「curl 刚 200，下一次探针就 ERR_CONNECTION_REFUSED」。
playwright：chrome channel + `--proxy-server=direct:// --proxy-bypass-list=*`；伪造登录注 pinia；mock Supabase 必回 Content-Range。
⚠️ BSD grep 的 `\|` `\b` `\s` 全不支持（静默 0 命中）→ 用 `grep -E` / `[[:space:]]`，或直接用 Grep 工具。
⚠️ macOS 无 `timeout` 命令 → 限时用 `ssh -o ConnectTimeout=N`、`GIT_SSH_COMMAND="ssh -o ConnectTimeout=15"`。
推 GitHub：`~/.ssh/config` 已把 `github.com` 指向 `ssh.github.com:443`（绕 HTTPS/SNI 阻断），`git push` 直连即可；`gh run watch <id> --exit-status` 看 CI。
⚠️ 并行会话同工作区：文件 last-write-wins；棘轮跨会话共享（他人新增警告也让你红）→ 用 `eslint . -f json` 做 (文件,行,规则) set diff 归因；**提交只给明确路径，永不 `git add -A`**。
改完必反证；探针偶发漂移=抖动非回归。

## 提交
pre-commit hook 在 `.git/hooks/pre-commit`（**不在 husky、不随 clone 分发**；新环境 `cp scripts/git-hooks/pre-commit .git/hooks/ && chmod +x`），跑 lint-staged = prettier --write + eslint --fix。
🔴 **lint-staged 会把无关的未暂存文件卷进本次提交**（stash/restore 副作用）→ **每次 commit 后必须核对 `git show --stat HEAD`**；误入的修法：`git reset --soft HEAD~1` → `git restore --staged <侵入文件>` → 重新 commit。
⚠️ 钩子会重排文件 → **提交后要对「提交后的树」再跑一次 verify**（验证过的 ≠ 提交的）；别把钩子改成 `prettier --check`（本仓 513 文件不合 prettier）。「改门禁」与「提交门禁脚本」必须同一 commit（`38dec8c1` 曾漏掉 check 脚本 → HEAD 本身跑 verify 就红）。
判「还有并行写入者」：`find … -newermt '-3 minutes' -type f`，**连续看两次**才算。

## 门禁 / 测试
`npm run verify`（lint + type-check + test + 8 check + 棘轮总账）。
⚠️ verify 绿 ≠ 干净：`lint` 带 `--max-warnings 183` 棘轮（2026-10-01 自 189 → 187 → 185 → 183 三轮下调）→ **报绿必须同时报警告条数**，口径用 `eslint . -f json` 聚合。unused-vars 是 `'warn'`，计数归零前别翻 error；`fix-unused-vars.mjs` 已删（2026-09-29，零引用且带 `X as ,` latent 洞），手法见 `docs/重构验证协议.md` §五。
⚠️ 提交前先手动跑一遍钩子同款（`prettier --write` + `eslint --fix --no-warn-ignored`，只给改动文件），否则「验证过的树 ≠ 提交的树」；提交后仍要核对 `git show --stat HEAD`（lint-staged 的 stash/restore 会卷进无关未暂存文件），并对**提交后的树**再跑一次 verify。
⚠️ 探针切「窄浮层」（<300px 面板/菜单）里的选项，要用页面内 `element.click()`；Playwright 坐标点击会落到遮罩上被 `handleClickOutside` 关掉面板 —— 看起来「面板收起了」，其实业务 handler 根本没跑，反证会假绿。
新增门禁必须在 `scripts/lib/gate-fixtures.mjs` 加样本，否则被 `check:gates-self-test` 列「未覆盖」；棘轮 baseline 只许下调。
源码守卫必须过 `tests/helpers/source.js` 归一且**两边同一个**（`squeezeSource`/`flattenSource`）；否定断言先 `scriptSection()`+`stripComments()`（对 .vue 全文剥注释会吃掉真实代码）；注释里别写「星号+斜杠」连写。prettier 对逐字断言的影响：换行/尾逗号交归一，**引号风格（含 CSS）/补分号**要写宽容正则。

## DB 图片地址（裂图重灾区）
DB 图片列混存 `@/assets/...` 别名与 `res.cloudinary.com` 绝对地址，后者大陆不可达（curl 000；`cdn.blockofhome.cn` 200）。
**统一走 `utils/db-image-url.js`**：`resolveDbCardImage` / `resolveDbDetailImage` / `resolveDbPointsCardImage` / `resolveDbImageUrl`；顺序固定「先 getImageUrl 再改写」。**只调 `getImageUrl` 就是裂图**。
已修：活动页、积分卡面（PointsCard 内收口）、自定义预设缩略图。**未修**：`CommunityLotteries/index.vue`、`Shop/index.vue`；头像框 9 处 `url(${frame.url})` 直绑（其中 3 个素材是 cloudinary 直链，实测加载失败）。
积分卡面用 `c_limit` 不 `c_fill`（卡面是整幅画，服务端预裁砍主体）；预设 `:class` 的 active 判断仍比**原始** url。
护栏：`probe-activities-images`(7)、`probe-points-card-image`(7)、`tests/unit/db-image-url.test.js`、`points-card-image-source.test.js`。

## CSS
`:root` 禁进 scoped @import（`[data-v-x]:root` 全死）；全局变量唯一入口 `styles/common/glass-aliases.css`；论坛共享 css 的 scoped @import 是承重墙。
`animation-fill-mode:both` → 该属性不可过渡；动效/玻璃单源 `tokens.css`；暗色真源 `theme-manager.js`；scoped 特异性 +1；`:global(#id[attr]) .cls` 不产出规则。
⚠️ **液态玻璃三铁律**（2026-10-01 实测）：① 材质单源 `styles/common/liquid-glass.css`，**只挂基础类 `.liquid-glass`** —— `--subtle/--strong/--inset/--pill` 变体在 ≤768px 被强制 `backdrop-filter:none` + 近实白（移动端只留外层模糊）；② scoped 选择器特异性**高于**全局类，组件里任何 `background:` 都会把玻璃盖回实色 → 让位写 `:not(.liquid-glass)`（症状是「blur 生效了但卡片还是 #f5f5f7」）；③ **白底上玻璃不可感知**（白玻璃+纯白底=白），需底衬：`.cloud-page::before` 极淡 `color-mix(in srgb, var(--apple-blue) 11%/6%, transparent)` 环境光 + 父级 `isolation: isolate`（否则负 z-index 伪元素掉到 body 背景下、整层不可见）；色值走 `color-mix` 不增暗色棘轮。
Cloud+ 整页**无暗色适配**（`.cloud-page` 硬编码亮色 token，`[data-theme="dark"]` 出现 0 次）；顶栏标题暗色下白字不可见 = 既有缺陷。
⚠️ **抬升靠内边距，不靠减高度**：全屏遮罩/面板避让软键盘时写 `height:100dvh; padding-bottom:calc(env(safe-area-inset-bottom)+var(--kb-inset))`，**不要**写 `height:calc(100dvh - var(--kb-inset))` —— 后者一旦 `--kb-inset` 量出偏大值就只剩半屏、下半屏露出底下的页面（2026-10-01 发帖遮罩实测：inset=380 → 遮罩 464px）。
⚠️ **`max-height` 约束 border-box**：断言/比较元素高度上限用 `offsetHeight`，`clientHeight` 会扣掉边框（1px 边框 = 恒差 2px）。
⚠️ **窄屏一行的「硬压」三连**：`flex-wrap: nowrap` + 子项 `min-width:0` + 某个子项 `flex-shrink:0`，会同时产出「有的被压到 0 宽」「有的文字折行成竖排」「不收缩那个溢出被裁」。Cloud+ 工具行即此（2026-10-01）。修法是**折行**，不是继续压。另：`.primary-btn { width: 100% }` 在 `@media (max-width:640px)`（不是 ≤900）且与两列网格共用 → 单行场景要局部 `width: auto`。

## 路由 / 交互
`key=route.path`（禁 fullPath/name）；实时搜索不写 URL；`<script setup>` 运行时 API 必须显式 import；ForumMain watch immediate 禁同步调下方 const（TDZ）。
`useConfirmDialog` 互斥**会 reject**（判据单源 `isDialogBusy`）；调用点须把预期拒绝归化成「取消」，别删那条 reject（`PWAUpdateToast` 靠它）。焦点遮罩 z-index:12000 → 弹窗一开底下按钮点不到。
⚠️ UserSpace 旧 tab 映射**必须单源**：`resolveRequestedUserSpaceTab()`（UserSpaceMain）同时供 `initialUserSpaceTab` / `onMounted` 同步 / `watch(route.query.tab)` 三处。三处里任一处直接用裸 `route.query.tab`，只要某个旧值（如 `assets`）失去自己的 tab-page 就**整页白屏**（2026-10-01 实测）。
「我」页 = 三段 `空间/资产/印象`；`assets` 不再是 tab（`?tab=assets` 经映射落 `?tab=posts&view=assets`）；印象数据层单源 `composables/useProfileImpressions.js`。

## 导航 / 首页 / 论坛 / 头像框
可见性单源 `isGlobalNavbarVisible(route)`；岛优先级 AI>任务>通知；`.scrolled` 整套已废（守卫 `unified-nav-scrolled-guard`）。
首页入场真源 `.home --gate-p`、时长真源 GATE_TIMINGS；护栏 `probe-home-gate-pull`(50)。竖屏菜单 `probe-nav-mobile-menu`(48)；几何断言别用「父级 vs 首个子元素」差值（margin 折叠会恒 0）。
论坛搜索 `list_forum_posts` 单实现 9 参数，禁新增签名（PG 42725）；必须登录；中文走 RPC ILIKE。
头像框：归属 `is_avatar_frame_owned_by`、发放 `grant_avatar_frame`；新增 tier 必须同步 `avatar_frame_tier_rank`。

## Supabase / 网络
ref `nplnlefdwfgtyimfkyih`。github.com 被 SNI 阻断 → SSH(`ssh.github.com:443`) 或 Git Data API；迁移走 Management API + 手写 `schema_migrations`；凭据在钥匙串（剥 `go-keyring-base64:`）。
撤 EXECUTE 用 `from anon,authenticated,public`；撤权优先于 drop；新表 grant anon+authenticated；撤权前五查；RPC 静默失败=审计表取 code。

## 输入框自动增高
真源 `composables/useAutoGrowTextarea.js`（**不要再加第 5 份**）；上限只声明在 CSS `max-height`，JS 读 `getComputedStyle`。
⚠️ 空内容时必须**临时摘掉 placeholder 再量**：浏览器把折行后的占位文字算进 `scrollHeight`，窄框里 "说点什么" 折两行会把空态撑成两行高（详情页评论框 107px 宽，实测 66px vs 应有 42px）。
⚠️ `height='auto'` 之后必须**无条件写回**，写「next 相等就 return」会把元素永久留在 `auto`。护栏 `probe-reply-autogrow`(10)。

## Cloud+ = 私密备份库（2026-10-02 口径，plans/023）
「设为公开」入口**已取消**（详情无该按钮，makeEntryPublic 已删）；对外可见只有 token 令牌分享 / 转为帖子。
相册显示**全部备份**（不再按可见性过滤）；底账（source='forum'）禁止单独删/公开（FORUM_SYNCED_CLOUD_ENTRY_LOCKED）。
发帖成功 → `backupPostImagesToCloud`（best-effort，void 前缀，无图帖不备份）创建底账并带 `source_post_id`；
删帖删备份 = **DB cascade**（迁移 2026100202 **已执行**：Management API + 事务内手写 schema_migrations 台账；列缺失降级逻辑保留作新环境兜底）。
转为帖子 = sessionStorage `boh-cloud-convert-draft` 一次性预填 + ForumMain `convertPrefillApplied` 抑制草稿恢复（防旧草稿覆盖预填）。
守卫：`cloud-album-order.test.js`（10 条）。

## Cloud+ 相册（iOS 图库式，2026-10-02）
形态：**去月份分组**（单网格 `.album-flow`，`.album-month-*` 已删）、竖屏固定 **5 列**通栏 1px 缝直角、宽屏 `.cloud-shell.is-gallery` 解除 980 上限铺满（1280 → 10 列）。
多图贴**一张图一格**：`albumTiles` 用 `flatMap` 摊平，key 必须 `` `${entry.id}::${index}` ``（只写 `entry.id` 会撞 key、Vue 复用节点**串图**）；「N 图」角标已废，心情角标只留第一格。
排序：**API 层** `.order('entry_date', { ascending: false, nullsFirst: false })` + `updated_at` 做次级。**不能按 `updated_at` 主排**（症状＝编辑旧内容跳到最前，用户看着像「日期错乱」）；**别在视图层补 sort**（查询带 limit(240)，客户端只能排已截断的一页）；`nullsFirst:false` 必写（PG 在 DESC 时默认 NULLS FIRST）。产品口径 = **降序**（最新在最上），讨论过两次，别再翻。
列数：`--album-columns` 由 JS 算（`resolvedAlbumColumns` = 用户选择 ?? 视口自动），**不能退回 CSS `auto-fill`** —— 那样手势覆盖不了。捏合＝**阶梯**切档（阈值 1.25 / 0.8，跨过即重置基线，一次张手连切 5→4→3）；`touchmove` 必须非 passive 才拦得住默认缩放，宿主还要 `touch-action: pan-y`。列数测量用 **ResizeObserver**（切分页时窗口不 resize，只监听 window 会留错值）。
护栏：`probe-cloud-album.mjs`(22)、`tests/unit/cloud-album-order.test.js`(7)。

⚠️ **Edit 多行替换时 old_string 必须覆盖夹在中间的不变量**（where 子句、`.eq()` 过滤条件…）。2026-10-02 改排序时漏抄 `.eq('user_id', safeUserId)`，整行过滤被替换掉 → legacy 回退会**跨用户拉数据**；是 lint 的 `unused vars` 抓回来的。unused 警告在这个仓库不只提示死代码，还兜「少抄一行」。

## 其它单源
`subscription-benefits.js`；`photo-albums/quota.js`；AI 唯一生效 `bohai_model_configs.api_url`、只解析 `choices[0]`；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`（七宿主）。
