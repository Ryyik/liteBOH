# AGENTS.md — 给 AI 编码助手的入口

> 本文件不是新规则，**是已有规则的索引**。规则真源在 `PROJECT_MANUAL.md`（完整手册）和本文件引到的各单点定义里。
> 写在这里的每一条，都能在仓库里找到产出它的那次事故或那个文件；不要凭直觉推翻。

## 0. 项目一句话

Vue 3 + Vite 7 + Supabase 的 SPA，hash 路由，产品名「方块之家 BOH」，迭代代号 Beta 2.5 / Beta 6。
`src/` 495 个源文件，约 207 个脚本（`scripts/` + `scripts/probes/`），131 个单元测试。

三条最高纲领：

1. **单一真源** —— 同一条规则、同一个数字只应有一处定义。发现「改一处要动四处」，那是缺陷，不是工作量。
2. **改完必须自证** —— 跑对应门禁/探针，跑绿才算改完。判「红」之前先跑一遍无改动基线。
3. **破坏性操作先确认** —— 权限回收、变更表结构、部署 Edge Function、对外发布，都要先跟人确认；读代码、跑只读查询、改本机文件不需要。

## 1. 上下文预算不够时，按这个顺序读

| 优先级 | 读什么 | 什么时候 |
| --- | --- | --- |
| 必读 | 本文件 | 每次 |
| 按需 | `PROJECT_MANUAL.md` 第 6 节（AI 修改指南）、第 8 节（表结构） | 改数据层或首次接手模块 |
| 按需 | `docs/PROBES.md` | 需要跑浏览器探针自证时 |
| 按需 | `docs/规范体系设计-2026-09-28.md` | 想知道「规则怎么才算生效」「为什么有些门禁是棘轮」「AI 交付必须提供哪些证据」 |
| 按需 | `plans/NNN-*.md` | 动效、左栏、搜索等已有既定方案的领域 |
| 回溯 | `.workbuddy/memory/MEMORY.md` 与同名目录下的日期日志 | 想知道某条规则为什么这么定 |

## 2. 改动 → 必跑门禁（不许跳过）

`npm run verify` 是一条命令兜底（lint + type-check + test + 8 道 check，末尾附**棘轮总账**，不需要构建）。
只改 CSS 或小改动用 `npm run verify:fast`；发布前用 `npm run verify:full`（含构建与产物门禁）。

> ⚠️ **判绿之前先确认门禁真的有牙**。这个仓库出过两次「检查在跑、但永远绿」：
> `check-project-structure` 曾只过滤 `.js`（路由全是 `.ts`，53 条一条没查）；`check:dark-tokens` 曾跑在观察模式（总量上升只打 ⚠️ 不 exit 1）。
> 两者都表现为「CI 全绿」。**改门禁或加门禁之后，跑 `npm run check:gates-self-test` 自证。**
> 它会给每条门禁注入一个已知违规样本、断言退出码非 0、再撤销；样本写在 `scripts/lib/gate-fixtures.mjs`。
> 没有 fixture 的门禁会在输出里被列成「未覆盖」——那是**明账**，不是可以忽略的噪声。

| 你改了什么 | 除了 verify，还要跑 |
| --- | --- |
| `.github/workflows/**`、部署链路 | `npm run build:ci` |
| `src/App.vue` 路由、`<RouterView>` | `npm run probe:route-switch` |
| 首页 / 底栏 / 左栏 / 论坛入口布局 | `node scripts/probes/probe-home-forum-rail.mjs`（21 断言）、`node scripts/probes/probe-rail-landing.mjs`（45） |
| 首页首屏拉动 / 落定动效 | `node scripts/probes/probe-home-gate-pull.mjs`（50） |
| 导航栏可见性 / 灵动岛 / 全局搜索 | 先改唯一真源 `utils/global-navbar-visibility.js` 的 `isGlobalNavbarVisible(route)`；再 `node scripts/probes/probe-global-search.mjs`（58） |
| 竖屏二级菜单 / 悬浮岛接缝（`.nav-menu-mobile` 的 `top`、岛的下投影） | `node scripts/probes/probe-nav-mobile-menu.mjs`（18）。⚠️ 菜单的包含块是那座**有 transform 的岛**、不是视口 —— 见该探针文件头的实测记录 |
| 论坛搜索 / 列表 RPC | `node scripts/probes/probe-forum-search.mjs`（27） |
| 订阅权益 / 摄影集配额 | `node scripts/probes/probe-subscription-benefits.mjs`（48） |
| 头像框发放 | `node scripts/probes/probe-avatar-frame-grant.mjs`（23） |
| 头像框控制台（新素材 / 变换） | `node scripts/probes/probe-avatar-frame-console.mjs`（44） |
| AI 面板 / BOHAI | `npm run probe:ai-panels` |
| 数据管理面板列定义 | `npm run audit:dm-columns` |
| `vite.config.js` 依赖别名 / optimizeDeps | `node scripts/probes/probe-vite-dep-scan.mjs`（6） |
| 权限策略 / 归档 SQL | `npm run security:anon-check`（棘轮，红了说明新增了 anon EXECUTE） |
| 暗色主题样式（新增裸色值） | 已在 verify 链内跑 `check:dark-tokens:strict`（棘轮，总量上升即红）。确需新增 token：写进 `src/styles/themes/dark-mode.css` 的 token 块再引用；只有「存量搬迁/新页面早期形态」才允许 `npm run check:dark-tokens:update` 登记，并在 commit message 里说明理由 |
| **在 `src/views`、`src/components`、`src/composables` 里写 `supabase.from/rpc/functions.invoke`** | 已在 verify 链内跑 `check:layering`（棘轮，基线 169 处 / 37 文件，**新文件违规即红**）。改法：复用 `src/utils/api/*` 已有封装，没有就在那儿新增一个模块收口。会话内省请用 `authStore` 而不是 `supabase.auth.getUser()`。清单：`npm run check:layering:list` |
| SW 预缓存改动上线前（**专项，没进自动化链**） | `npm run check:sw-upgrade`（对比 `dist` 与 `dist-check` 两份产物，CI 上没有 `dist-check` 所以只能在本地跑）；`npm run check:route-css-runtime` 还要先手工起 `npx vite preview --outDir dist-check --port 4180 --strictPort`，它是独立起服务的浏览器验收 |
| RPC / 触发器静默失败 | 审计表取 code → `DO` 块分步复现 → 修完把 `sqlstate` 落进审计 message |

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

### 全局搜索

- 搜索源注册表 `config/site-search-sources.ts`，**拒绝 eval**；actions 的执行权归 navbar。高亮用 `[[..]]` → `splitMarks`，**不许 v-html**。快捷键是 `/`（⌘K 被 AI 岛占用）。

## 4. 环境事实（省得每次试）

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
  - ⚠️ 它**只报告**。删 CSS 必须配视觉回归，这个工具不提供那个能力。
- **棘轮总账**：`npm run check:ratchets`（已挂在 `verify` 末尾）。把 4 个棘轮的「当前 / 基线 / 余量」汇成一张表，让「债务在减少还是增加」一眼可见。
  - 它**不复制计数逻辑** —— 只调各棘轮的 `--json` 机读出口拿数（自己再数一遍就成了第二份真源，迟早和真正的门禁给出不同的数）。
  - 它**只报数、不判定、永远 exit 0**；判定是各棘轮自己的职责，否则「总账」会变成第 5 个门禁，出问题时反而分不清是谁红的。
  - `anon-execute` 需 Management API token，离线只显示基线并标注原因 —— 不留一个看起来像 0 的假数字。
- **门禁自检**：`npm run check:gates-self-test`（约 45s）。给每道门禁注入一个已知违规样本 → 断言它 `exit` 非 0 → 撤销；样本在 `scripts/lib/gate-fixtures.mjs`。**改了门禁就跑它**，否则你无法区分「门禁通过」和「门禁是假绿」。⚠️ 它会临时改写工作区文件（有兜底还原），**不要塞进 verify/build:ci 主链**，要进 CI 请单开 job。
- **提交门禁**：`.git/hooks/pre-commit` 跑 lint-staged，只处理本次暂存的文件（prettier + eslint --fix），规则见 `.lintstagedrc.json`。需要跳过时用 `git commit --no-verify`。
  - ⚠️ **钩子会改文件，所以「你验证的树」可能不是「提交的树」**。改完代码先 `npm run format` 再跑 verify；判绿一律以提交后的树为准（9-27 那次 CI 三连挂就是这么来的：prettier 重排让三个格式敏感的源码正则断言失配，本地全绿）。钩子现在会在改写文件后**把被改的文件名打出来**并提示重跑 verify —— 看到那段输出就说明你验证的树已经变了。
  - 为什么钩子不做成 `prettier --check`（只检查不修改）：实测有 **513 个文件**不符合 prettier，而 `npm run format` 是**全仓** `prettier --write .`。只检查的话碰任一未格式化文件都提交失败，而唯一修复命令会重排半个仓库 —— 那种钩子会被 `--no-verify` 习惯性绕过，比不改更糟。**自动格式化 + 显式报告改了什么**是这里性价比最高的形态。
  - 另：钩子跑 lint-staged 时会输出 `could not find any staged files` 且 `git commit` 返回非 0，**但提交其实成功了——判断成功看 `git log`，别信退出码**。
  - 钩子放在 `.git/hooks/` 下，不随 clone 分发。新环境手动装一次：
    `cp scripts/git-hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
  - 没用 husky 是刻意的：husky 会接管 `core.hooksPath`，而现有 `.git/hooks/post-commit` 是 Qoder 的 tracker，接管后它会静默失效。
- **MCP**：`~/.workbuddy/mcp.json` 配了三个 —— supabase（`--read-only`，project ref `nplnlefdwfgtyimfkyih`）、playwright（`--browser chrome`）、github。首次启用要在连接器管理页点「信任」。Supabase 那一个是只读档，写操作照旧走 migration SQL。
- **测试**：`npm run test` 覆盖 130 个文件 / 2150 个断言，跑满约 2 分钟。`pool: forks` 与 `maxForks: 2` 是 `vitest.config.js` 里的定数，**不要调高并发** —— 配置里写了实测数据：默认并发会把 `project-structure.test.js` 里那条同步全仓扫描拖到超时，压到 2 之后反而整套更快。要再降它的耗时，改 `scripts/check-project-structure.mjs` 的 `DEFAULT_IGNORES`（别把 gitignore 的产物目录再扫一遍）。

## 6. 不要做的事

- 不要为了「跑起来」给现有代码加 `!important`、加 window 全局、或复制第二份 `.home-gate` 定义 —— 这类做法只是把债从一处挪到另一处。
- 不要往仓库根目录新增 `xxx-demo.html`（已有 14 个是历史债，不再增加）。要视觉沙盒走 `scripts/probes/` 或 `output/`。
- 不要提交 `.env`、`dist/`、`dist-check/` 和截图产物（`debug-screenshots/`、`output/` 已 gitignore，也别把未忽略的新截图目录加进去）。
- 不要把搜索词、未转义字符拼进 URL 或 SQL 字符串。
- 修改 Supabase 权限、表结构、Edge Function 属于对外部署行动，**先跟人确认**。
