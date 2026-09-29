# BOHLITE 硬规则速查
> 2026-09-29 精简；全文（含推演与实测过程）归档在同目录 `MEMORY-full-2026-09-29.md`。

## 环境
vite 只绑 IPv6 → `--host ::`；构建 `--outDir dist-check`（勿动 dist）；vitest `--pool=forks`；npx 被 SIGTERM → `./node_modules/.bin/<tool>`。
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
⚠️ verify 绿 ≠ 干净：`lint` 带 `--max-warnings 189` 棘轮 → **报绿必须同时报警告条数**，口径用 `eslint . -f json` 聚合。unused-vars 是 `'warn'`，计数归零前别翻 error；`fix-unused-vars.mjs` 已删（2026-09-29，零引用且带 `X as ,` latent 洞），手法见 `docs/重构验证协议.md` §五。
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

## 路由 / 交互
`key=route.path`（禁 fullPath/name）；实时搜索不写 URL；`<script setup>` 运行时 API 必须显式 import；ForumMain watch immediate 禁同步调下方 const（TDZ）。
`useConfirmDialog` 互斥**会 reject**（判据单源 `isDialogBusy`）；调用点须把预期拒绝归化成「取消」，别删那条 reject（`PWAUpdateToast` 靠它）。焦点遮罩 z-index:12000 → 弹窗一开底下按钮点不到。

## 导航 / 首页 / 论坛 / 头像框
可见性单源 `isGlobalNavbarVisible(route)`；岛优先级 AI>任务>通知；`.scrolled` 整套已废（守卫 `unified-nav-scrolled-guard`）。
首页入场真源 `.home --gate-p`、时长真源 GATE_TIMINGS；护栏 `probe-home-gate-pull`(50)。竖屏菜单 `probe-nav-mobile-menu`(48)；几何断言别用「父级 vs 首个子元素」差值（margin 折叠会恒 0）。
论坛搜索 `list_forum_posts` 单实现 9 参数，禁新增签名（PG 42725）；必须登录；中文走 RPC ILIKE。
头像框：归属 `is_avatar_frame_owned_by`、发放 `grant_avatar_frame`；新增 tier 必须同步 `avatar_frame_tier_rank`。

## Supabase / 网络
ref `nplnlefdwfgtyimfkyih`。github.com 被 SNI 阻断 → SSH(`ssh.github.com:443`) 或 Git Data API；迁移走 Management API + 手写 `schema_migrations`；凭据在钥匙串（剥 `go-keyring-base64:`）。
撤 EXECUTE 用 `from anon,authenticated,public`；撤权优先于 drop；新表 grant anon+authenticated；撤权前五查；RPC 静默失败=审计表取 code。

## 其它单源
`subscription-benefits.js`；`photo-albums/quota.js`；AI 唯一生效 `bohai_model_configs.api_url`、只解析 `choices[0]`；密码 ≥8 `auth-validation.js`；通知 store `stores/notification-loader.ts`（七宿主）。
