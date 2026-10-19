# 门禁矩阵与事故级坑记录

> 本文件是 `AGENTS.md` §2「改动 → 必跑门禁」的**完整版**。
> AGENTS.md 里只留「改什么 → 跑什么」的速查表；**这里的坑记录才是为什么**——
> 每一条都对应一次真实事故，不要凭直觉删。
>
> 为什么单独成文（2026-10-15）：**减重 + 按需**。AGENTS.md 是「每次会话都会读」的入口，
> 而下面 §C 那三条的坑记录只在**真的改那块代码**时才需要 ⇒ 放在必读文件里是纯粹的上下文浪费
> （这次把 AGENTS.md 从 51.5KB 压到 45.1KB，约 -12%）。
>
> ⚠️ **一条需要澄清的判据**（2026-10-15 复核）：同日的 AI 环境审计报告 P0-2 声称
> 「AGENTS.md 有 3 行超 2000 字符 ⇒ 被读取工具按行截断，AI 拿到的是残规则」。
> **这条是错的，不要照抄。** 它的判据是 `awk 'length($0) > 2000'`，而 **macOS 的 awk 按字节计数**：
> 那三行确实是 2406 / 2214 / 2209 **字节**，但只有 1326 / 1258 / 1235 **字符**（CJK 一字三字节），
> 而截断线是 2000 **字符** ⇒ **从未发生过截断**（实测：用 Read 工具读那几行拿到的是完整内容，
> 行尾自然结束，无截断标记）。
> 教训与本仓库既有的那条一致：**判据要连「单位与口径」一起写下来**，否则一个 `length` 就能编出一整条结论。
>
> 🤖 新增一条门禁时：**必须在 `scripts/lib/gate-fixtures.mjs` 加样本**，
> 否则 `npm run check:gates-self-test` 会把它列成「未覆盖」——那是明账，不是噪声。

---

## A. 门禁链与自证纪律

`npm run verify` 是一条命令兜底（12 道 check → lint → type-check → test，末尾附**棘轮总账**，fail-fast：最贵的排最后，不需要构建）。
只改 CSS 或小改动用 `npm run verify:fast`；发布前用 `npm run verify:full`（含构建与产物门禁）。

> ⚠️ **判绿之前先确认门禁真的有牙**。这个仓库出过两次「检查在跑、但永远绿」：
> `check-project-structure` 曾只过滤 `.js`（路由全是 `.ts`，53 条一条没查）；`check:dark-tokens` 曾跑在观察模式（总量上升只打 ⚠️ 不 exit 1）。
> 两者都表现为「CI 全绿」。**改门禁或加门禁之后，跑 `npm run check:gates-self-test` 自证。**
> 它会给每条门禁注入一个已知违规样本、断言退出码非 0、再撤销；样本写在 `scripts/lib/gate-fixtures.mjs`。
> 没有 fixture 的门禁会在输出里被列成「未覆盖」——那是**明账**，不是可以忽略的噪声。

> ⭐ **两道「线上库」门禁（2026-10-04 新增，发布前跑，刻意不进 `verify`）**
>
> `npm run check:db-lint` —— `supabase db lint --linked`：查**函数体的运行期必错**
> （表/列/函数名写错、缺 cast、漏建临时表）。**首次跑就抓到 6 个线上坏函数**，
> 其中 `reserve_ai_points` 的 `hashtextext` 让 AI 积分预扣**从未成功**、`execute_lottery_draw`
> 让抽奖开奖不可用 —— 而 200+ 探针与 10 道构建门禁**一个都没发现**。
> 离线可用 `--report <保存的 json>` 回放（自证 fixture 走这条路）。
>
> `npm run check:db-advisors` —— 实现 splinter 里最有价值的三条（棘轮）：
> `function_search_path_mutable`（SECURITY DEFINER 未固定 search_path ⇒ **提权**）、
> `rls_disabled_in_public`、`rls_enabled_no_policy`。**首次跑就抓到 `handle_new_user`
> （注册触发器）未固定 search_path**，已修（`2026100404`）。清理后用 `check:db-advisors:update` 下调基线。
>
> ⚠️ 两者都需要 **Management API access token**（不是 anon key）；拿不到时**告警 + exit 0**，
> 与 `security:anon-check` 同策略。**不要接进 `verify` / `build:ci`** —— CI 没有 token，
> 接进去只会永远降级跳过，变成假门禁。

> ⭐ **CI 侧新增（2026-10-04，四件）**
>
> | 新增 | 文件 | 说明 |
> | --- | --- | --- |
> | **CodeQL** | `.github/workflows/codeql.yml` | 本仓是 **public** ⇒ 免费。此前**零 SAST**。用 `security-extended`；每周一定时跑（新规则 × 存量代码）。 |
> | **Dependabot** | `.github/dependabot.yml` | 此前无依赖自动更新。minor/patch 分组、**major 一律人工**、限 5 个 PR。 |
> | **`deno check`** | `.github/workflows/deno-check.yml` | 补上「沙箱没有 deno ⇒ 改 EF 只能人工 review」这个缺口 —— **本地装不了 deno，但 CI 能装**（2026-10-16 复核：本地已可装 —— dl.deno.land 直下解压即用，推送前可本地预验 EF；原「本地装不了」结论作废）。✅ **2026-10-13 转正为阻断门禁**：观察档（`continue-on-error: true`）在 main 上连续跑绿（run 37759043572 / 37754022262 均 success），该行已删；现在任一 EF 类型检查失败即红。若转正后冒出既有类型错，逐条修或加 baseline，**不许把 `continue-on-error` 加回来**。 |
> | **`security:audit`** | `scripts/check-npm-audit.mjs` + ci.yml | 依赖漏洞**棘轮**。不用 `--audit-level=high` 是因为当前还剩 3 个 high 需 `--force` 才能修，卡阈值会永远红。基线 `scripts/npm-audit-baseline.json`，降完跑 `npm run security:audit:update`。有自证 fixture。 |
>
> 侦察依据与取舍见 `docs/2026-10-04-GitHub开源可引入方案调研.md` §8。

> ⚠️ **`verify` 绿 ≠ 干净**：`npm run lint` 自 2026-09-29 起带 `--max-warnings`（现为 **116**，2026-10-08 由 118 下调），
> 这是一道**警告棘轮**（`ci.yml:43` 与 `deploy.yml:45` 都跑 `npm run lint`，所以 CI 和发布链上都有牙）。
> 存量是 **116 条 unused-vars**（口径 `eslint . -f json`；**别 grep 文本数**）——
> **新增一条死代码当场 exit 1**，实测反证：往 `src/` 放一个 `const unusedX = 1` → `found too many warnings (maximum: 116)`。
> 三条纪律：① **清理后请把 116 改小**（下调永远是好方向，不用交代）；② 确需上调必须走 commit message 说明理由
> （与 `check:important-budget` 等棘轮同规矩）；③ 计数口径用 `eslint . -f json` 聚合，**别 grep 文本数**（会串）。
> 之所以是「棘轮」而不是「把规则翻成 error」：116 条直接翻红只会逼人把变量改名 `_x` 保住绿，死代码变成「有名字的僵尸」，
> 还可能引出 `--no-verify` 绕过。**计数归零之后才翻 error。**
>
> 🤖 **归因用一条命令**：`npm run lint:delta` —— 它跑全量 eslint + 对变更文件取 `HEAD` 版本做基线
> （走 `--stdin --stdin-filename`，**不碰你的工作区**），直接告诉你「新增了哪一条、在哪个文件哪一行、
> 离上限还剩几格」。别再造手工 set diff。

---

## B. 「改动 → 必跑门禁」的速查表在哪

> **仍在 `AGENTS.md` §2。** 刻意不搬过来：

> 单一真源。那张表是 AI 每次会话**都会读到**的东西（`AGENTS.md` 是必读入口），
> 搬到一份"按需才读"的文档里，只会让它从"每次看到"退化成"可能永远看不到"。
> 本文件只承载**从那一节外置出来的**那三条超长坑记录（见下方 §C），以及纪律细节（§A）。

所以：**要查「改 X 该跑什么」→ 看 `AGENTS.md` §2**；某一行写着「见 C-n」→ 回这里读那一条的坑。

## C. 三个超长条目（原 AGENTS.md 103/104/108 行，现已外置）

> 外置理由：这三行的坑记录只在改对应代码时才需要，而它们的字节数（2406 / 2214 / 2209）
> 占了 AGENTS.md 里相当一块体积。**注意——不是因为"被截断"**：它们的字符数是
> 1326 / 1258 / 1235，**都在 2000 字符的截断线以内，从来没有被截断过**（详见文件开头的澄清）。

### C-1 BOH AI 输入区 composer

改 `views/BOHAI/BOHAI/components/BohComposer.vue` + `styles/boh-composer.css`（底行两胶囊（模型 / 工具）/ 模型与工具浮层 / 用量圆钮）：
跑 `node scripts/probes/probe-bohai-composer.mjs`（32，含独立页 + AI 岛两形态 + 设置面板）。

⚠️ 三条已实测的坑：
1. 探针里切换选项要用**页面内 `element.click()`**，Playwright 坐标点击在窄浮层边缘会落到遮罩上、被 `handleClickOutside` 关掉面板，看起来「面板收起了」其实动作没跑；
2. 断言零 pageerror 之外还要断言**零「模板引用未定义绑定」的 Vue warning**（`is not defined on instance` / `accessed during render`）——
   这是唯一能抓住「壳漏解构一个被模板读到的状态」的信号；
3. 模型清单是**异步**拉的，开面板那一刻往往还在骨架态，必须等 `.boh-mm-item[data-mode-id]` 落地再读，否则拿到 `modes: []` 是竞态不是坏了。

另（2026-10-02）：用量圆钮已改**单环**（= 上下文，额度吃紧 ≥85/95% 由 quota-warn/danger 接管环色），
额度与上下文数字都在 hover / 点击浮层里 —— A10-A13 锁这条契约，A10-A13 依赖先发一条消息
（模型与 quota-status 均被 mock），mock 额度 88000/100000 = 88% 故意踩进 warn 档。

另（2026-10-03，plans/023 步骤 ④）：新增 **C1-C4 覆盖设置面板**（4 卡 + 折叠高级 + 数据卡）与
**退役的额度侧板**（`.quota-drawer` 必须为 0），C1 走的是「圆钮浮层『完整用量』→ 设置面板 +
`scrollIntoView` 到用量卡」这条链。⚠️ 两条已实测的坑：
1. 用量卡是**数据到了才变高**的 —— 只在打开时滚一次会停在半路（实测 `usageVisible=false`），必须在 `fetchQuota` 落定后再滚一次；
2. C3 只认**数据**（`88%` / `已用 3 次` / `共 10 次`），别写成 `includes('Web Searching')` ——
   面板底部那句说明文案里也有这个词，会假绿（反证实测：把段标题改成 WEB SEARCH，C3 仍 PASS）。

**2026-10-11：思考强度控件整体下线**（5 个在用模式里只有 gemini 支持调，且服务端 `buildRuntimePayload`
会用 DB 值覆盖客户端采样参数 ⇒ 空转）⇒ A1 不再断言强度胶囊、原 A4（换档）改成两颗胶囊的互斥断言；
无残骸由 `tests/unit/bohai-glass-surfaces.test.js` 在源码层锁死。

### C-2 BOH AI 输入区两胶囊 + 空态

改模型/工具两颗独立胶囊、浮层玻璃材质、空态居中与 FLIP、输入框底色与横屏高度：
跑 `node scripts/probes/probe-bohai-composer.mjs`（**31 条**：A1 两胶囊（含强度控件已下线）/ A2a 模型菜单 /
A2b hover 卡 / A4 两胶囊互斥 / A5 选模式 / A6 工具四件）
+ `node scripts/probes/probe-bohai-shell.mjs`（**39 条**，含场景 D：第一条消息的 FLIP 位移 +
场景 E：AI 回复靠左/宽 880、用户气泡贴右且白底、输入框玻璃与浮层重叠）
+ `node scripts/probes/probe-bohai-slash-commands.mjs`（C1 空态只剩虚影字）。

2026-10-11 用户口径：
1. 底行拆成「模型名 ⌄ / 工具 ⌄」**两颗**独立胶囊（原来是**一颗**「模型名+强度」→ 单浮层两视图 + 滑杆，那套已下线），状态收敛成**一颗 `activeMenu`**；同日**思考强度整体下线**（只有 gemini 支持调、且服务端覆盖客户端采样参数 ⇒ 空转），不再是「3 档」；
2. 空态只剩一行虚影 BOHAI（`--boh-ghost-word`），输入框整组居中，靠 `.boh-stream{margin-top:auto}` + `.boh-composer-wrap{margin-bottom:auto}` 分工（**两处都写 auto 会在两者之间裂开 309px 空洞**），第一条消息的位移靠 `BOHAIMain.animateComposerHome` 做 FLIP（watcher 必须 `flush:'pre'`，否则差值恒 0）；
3. 输入框：2026-10-11 是「纯白底（令牌 `--boh-composer-bg`，别改 `--boh-bg-card`）+ 灰框线」；**2026-10-12 用户口径反转成液态玻璃**（「带点透明，滚动的时候会透出下面的内容」）⇒ 进 `@supports` 玻璃组（第 6 个消费者），基础规则仍保留 `--boh-composer-bg` 作不支持 backdrop-filter 时的实色兜底；**同时输入区改成浮在消息流之上**（否则底下没有可透的内容）—— 壳实测高度写 `--boh-composer-h`，输入区 `margin-top` 负掉它、消息区补等高的 `padding-bottom`。横屏（>600 高）`min-height:44px` 不变。

玻璃材质**六个**消费者共用一组，引用 `--liquid-filter-sm` + `--boh-glass-*`（BOHAI 主题不跟站点主题联动）。
单测：`tests/unit/bohai-glass-surfaces.test.js`。

### C-3 BOH AI 斜杠命令

改 `/` 命令表、命令解析、或**新增任何「用户发出这条输入」的入口**：
跑 `node scripts/probes/probe-bohai-slash-commands.mjs`（7）。

⚠️ **2026-10-08 用户报障**：输入 `/cloud` 后 AI 回「你发送了 /cloud 指令」—— 命令被当**普通文本**发了。
根因：**执行逻辑只挂在 2 个入口**（菜单项 `mousedown`、菜单开着时的 Enter 拦截），**发送路径零斜杠分支**
⇒ 点发送键必然把字面量交给模型；逻辑层（`composables/` `engine/` `domain/`）里 `slash` 命中 **0** 次。
⇒ **新增入口时必须在同一个解析函数上过闸**，别再加第三处 `if (event.key === 'Enter')`。

四条已实测的坑：
1. **带参数命令菜单永不开** —— `slashQuery` 要求整条输入不含空白（`.vue:1644`），`/cloud 素材盘点成表格` 直接退化成普通消息；
2. **移动端全入口失效** —— `isCoarsePointer` 让 `handleEnter` 直接 return（`:1502`），触屏只剩「点菜单项」，而带参数时菜单不开 ⇒ 唯一畅通的路径恰好是错的那条；
3. **空态建议卡在教用户写错** —— Work 形态第 4 张卡带 `command: '/cloud'`（`BohEmptyState.vue:97-110`），点击填入 `/cloud 素材盘点成表格`，而实现只认「整条输入是一个命令字」；
4. **老探针抓不到** —— `probe-bohai-composer.mjs` 的 A8 只断言菜单**文案**存在、**从未点击过命令项**（`grep -c boh-slash-item` → 0），所以 22 条全绿而功能不可用。

判据/修复设计见 `docs/2026-10-08-BOHAI对齐Codex优化方案与斜杠命令修复.md`。

**2026-10-10 已修**：真源抽成 `src/views/BOHAI/BOHAI/bohai-slash-commands.js`（定义 + 解析 + 菜单构造），
三个入口（发送键 / Enter / 菜单点击）统一过 `BOHAIMain` 的 `handleSend` 闸门；未知命令**拦住 + 提示**
（`//` 前缀是转义逃生口），带参数命令剥掉命令字再发；探针 **7/7**，单测
`tests/unit/bohai-slash-commands.test.js`（18）。
⇒ 新增「用户发出这条输入」的入口只许汇到 `handleSend` / `executeSlashCommand`，**不许再写第三处 `startsWith('/')`**。

**2026-10-16 补两条命令 + 一条不变量断言**

补 `/memory`（官方记忆，→ `handleKnowledgeBaseToggle`）与 `/shared`（社区知识，→ `handleSharedMemoryToggle`）：
这两个开关原本只有设置面板入口，而同族的 `/web` `/community` `/cloud` 都有命令
（`/health` 随 BOH Health 功能整体下线，2026-10-16）。

⚠️ **当时的真实形态**：先加了「官方记忆」的设置面板开关与 `handleKnowledgeBaseToggle`，
**却忘了在 `executeSlashCommand` 的 switch 里加 case** ⇒ 用户敲 `/memory` 只会得到「未知命令」。
这类「加了开关没加命令」在测试里原本没有任何东西能发现。

⇒ 已补的不变量断言（`tests/unit/bohai-slash-commands.test.js`，18 → **21** 条）：
**每条固定命令的 `action` 都必须在壳的 switch 里有对应 `case`** —— 逐条遍历 `BOH_SLASH_COMMANDS`
去壳源码里找 `case '<action>':`。反证已做（注释掉 `case 'memory':` → 断言 FAIL 且报的正是它）。
**新增命令时两处都要动**（真源表 + 壳里 case），单测会兜住漏掉的那处。

### C-9 Cloud+ 发布面板 + 图库（2026-10-18 新增）

改 `src/views/user-center/Cloud+/CloudPlusMain.vue` 的发布面板（`.composer-*`：浮层 / 情绪抽屉 /
图片条 / 上传链路 / 草稿保护）或相册外壳：跑下面四条。

| 探针 | 断言 | 覆盖 |
| --- | --- | --- |
| `scripts/probes/probe-cloud-composer.mjs` | **65** | 五档视口（390×844 / 844×390 / 740×320 / 1024×768 / 1440×900）的按钮数、发布按钮恒在视口内、遮罩半透明、玻璃材质、多字扩展、草稿保护、Esc、暗色、**上传链路对齐全站、失败原因上屏、开合过渡动画** |
| `scripts/probes/probe-cloud-portrait.mjs` | 27 | 竖屏顶栏工具行（不折字/不溢出）、页头不吸顶、底栏与设置卡玻璃 |
| `scripts/probes/probe-cloud-album.mjs` | 22 | iOS 图库式密铺（去月份分组、多图铺开、捏合切列、宽屏铺满） |
| `scripts/probes/probe-cloud-motion.mjs` | 16 | 格子放大/缩小、详情从点中的格子放大展开并缩回、三档切换、切列落定回弹 |

源码层守卫：`tests/unit/cloud-plus-upload-concurrency.test.js`（**15** 条：并发池与保序 +
上传链路对齐 + 失败原因渲染 + 上传前压缩）、`tests/unit/cloud-album-order.test.js`（降序与列数单源）。

⚠️ **六条硬约束**（改前先读，都有实测来源）：

1. **常驻按钮只许 4 个**（关闭 / 图片 / 心情 / 发布），9 个情绪胶囊必须收在 `.mood-tray` 抽屉里 ——
   改造前全量平铺：竖屏占 3 行 117px、横屏把发布按钮顶到 y=818（要滚 450px 才够得着）。
2. **高度上限只声明在 CSS**（`.composer-text-input{max-height}` / `.composer-panel{max-height:…dvh}`），
   JS 走 `useAutoGrowTextarea` 读 `getComputedStyle`，**不许写第二份像素值**（会把「I 正文高度不超上限」变成 `NaN` 红）。
   面板高度必须同时扣 `--kb-inset`（键盘）与 `env(safe-area-inset-bottom)`，否则 iOS 键盘盖住底栏。
3. **材质只用 `.composer-panel.liquid-glass` 两段式选择器 + `--liquid-*` token** ——
   单类 `.composer-panel` 与全局 `.liquid-glass` 特异性同为 (0,1,0)，谁后加载谁赢，不可依赖；
   遮罩用同一档深色（亮暗两套主题通用），**不写** `[data-theme='dark']` 分支（整块因此零暗色裸色值）。
4. **关闭的三条路径（× / 点遮罩 / Esc）都必须过 `closeComposer`** 的草稿确认，绕过任一条都会静默丢正文与已上传图片。
5. **上传链路必须与论坛发帖同一套参数**：`folder: CLOUD_PLUS_CLOUDINARY_FOLDER` +
   `pendingSource: CLOUD_PLUS_UPLOAD_SOURCE`（真源在 `src/utils/api/boh-cloud-api.js`）+
   `skipUploadPreflight: true`（预检整批只做一次）+ `onProgress`（真实字节进度，代替旧的「settled/total」假进度）。
   改造前 Cloud+ 一个都不传 ⇒ source 落 'generic'（与装修台共用限流桶）、成功的图不进
   `cloudinary_pending_uploads`（放弃发布的草稿图变孤儿）。
6. **失败必须把真实原因渲染到面板上**（文件名 + 归一化文案，`role="alert"`）。错误先过
   `normalizeDbError`（它已会剥 `CLOUDINARY_UPLOAD_RATE_LIMIT:<规则码>:` 前缀）——
   不要把裸 `error.message` 直接写进失败列表。
7. **上传前必须走压缩管线**（2026-10-19 补，与论坛/影集同一条）：动态 import
   `image-compression.js` → `getImageCompressionPlan(file, { optimizeForUpload: true })` →
   `shouldCompress` 时 `compressImageFileToUploadLimit`（Web Worker，输出 ≤2MB WebP）→
   压缩后体积二次校验。⚠️ `optimizeForUpload` 白名单只有 **JPEG/WebP** —— PNG 不主动重编码
   （2026-10-19 实测：5.5MB PNG 原样上传是**正确行为**，别当 bug 修）；GIF 动图不可压缩，
   超限时报「请换成 JPG、PNG 或 WebP」。进度条压缩占前一半、上传占后一半
   （`compressPctByIndex`/`uploadPctByIndex` 各 0.5 加权），阶段文案「压缩中/上传中」随压缩段切换。

⚠️ **两条反证没做成（如实记录，别照错的写法改回去）**：
- 只删 `folder:` 参数时 R 仍绿 —— `cloudinary-client` 的 `DEFAULT_FOLDER` 也是同一个目录，
  请求体看不出区别；**能区分的是 `source`**（删 `pendingSource` → 签名网关 body 变 `{"source":"generic"}`，R 当场红）。
- 只删 `.composer-panel` 的 `max-height` 时 B/C/D/J 仍绿 —— 新布局足够紧凑，收敛实际由
  `.composer-body{overflow-y:auto}` + 面板 `overflow:hidden` 承担；那四条锁的是**报障现象**，不是某一条 CSS。

> 📌 AGENTS.md §2 没有 Cloud+ 行：该表有**必读面字节棘轮**（`check:doc-truth`，只许降不许涨），
> 2026-10-18 实测把这一节写进去会让文件超出基线 +2KB。维护者改这块时**从本文件进**。
