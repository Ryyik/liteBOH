# BOHLITE 硬规则（细节见日期日志与 docs/plans）

## 环境 / 探针
- vite 默认只绑 IPv6；localhost 探针需双栈：`vite --port 5173 --host ::`；构建 `vite build --outDir dist-check`（勿动 dist；沙箱拦清目录先手动 rm）。vitest 加 `--pool=forks`；npx 被 SIGTERM→`./node_modules/.bin/<tool>`。
- playwright：chrome channel+`--proxy-server=direct:// --proxy-bypass-list=*`；同 path 单 route（逆序→catch-all 先注册）；mock Supabase 必回 Content-Range；伪造登录注 pinia。
- 归因：工作区常有未提交工作，**别裸 stash HEAD 当基线**；探针多次漂移=抖动非回归；改完必反证。
- ⚠️ **并行会话（多 agent 同一工作区）已实测**：① 文件级 **last-write-wins、无 merge 提示**——同区域后写覆盖先写（改不同区域能共存）；② **全仓总量棘轮跨会话共享**：`--max-warnings 189` 让任意会话新增 1 条警告就**全员 lint 红**，且红的原因不在你改的文件里 → 归因靠「`eslint . -f json` 前后做 `(文件,行,规则,消息)` set diff」（10 秒定位，比 grep 文本可靠）；③ **提交只给明确路径，永不 `git add -A`**（已中过一次：`82e4555f` 把别处的改动卷进自己的 commit，内容没丢但归因断了）；④ **产物级验证（L3）在树不安静时做不了** —— 需要「改动前/后」两份产物字节对比，中间任何第三方 `src/` 改动都会污染基线。
- BSD grep 不支持 BRE `\|` 交替与 `\b`（静默 0 命中）→交替用 `grep -E`、边界用朴素子串。pre-commit（lint-staged+prettier）首次触碰未格式化文件会全文件 churn，混入 refactor commit 属预期一次性。
- 通知 store 加载单源 `stores/notification-loader.ts`（含共享 ref + ensureNotificationStore，**七个**宿主绑定：App / UnifiedNavbar / Home / Messages / UserSpaceMain / ForumMain / **ProfileMain**——第 7 处 2026-09-29 才收敛，此前它自建 `ref(getNotificationStoreSync())` 局部 ref，登出态挂载后再登录且不重挂 → 横屏左栏角标恒空）；守卫 `tests/unit/notification-store-single-source.test.js`（黑名单式：任何宿主再写 `ref(getNotificationStoreSync())` 即红）。Tailwind 已移除（2026-09-28），preflight 补偿在 style.css `@layer base`，`--color-*/--radius-*` 24 变量唯一定义源在同文件 `:root`。

## 测试 / 守卫断言（2026-09-28 起）
- 「读源码 + `toContain`」守卫**必须过 `tests/helpers/source.js` 的归一**，且**两边过同一个**：`squeezeSource`（空白压单空格+去尾逗号+去闭括号前空白）/ `flattenSource`（再去全部空白，用于开括号后、`="` 后的断行）。契约在 `tests/unit/source-helper.test.js`（**17 条**，含反证，别删）。
- ⚠️ **否定断言（「某弃用写法不再出现」）必须先剥注释，且 `.vue` 必须先取 `<script>` 区**：用 `scriptSection()` + `stripComments()`（`tests/helpers/source.js`，2026-09-29 加）。两个坑都实测过：① 注释里会**合法复述**弃用写法 → 不剥注释是假红；② 对 `.vue` **全文**跑 `/\*[\s\S]*?\*\//g` 会因模板里的 `accept="image/*"` 与远处的闭注释符**错配**，`ProfileMain.vue` 一次被删 42,458 字节（84,605→42,147）、import 行消失 → 断言**静默变松（假绿）**。7 个通知宿主里 6 个含裸开注释符。
- ⚠️ 注释里**不要写字面的「星号+斜杠」连写**（会提前闭合块注释；`tests/helpers/source.js` 与 `notification-store-single-source.test.js` 各中一次）→ 用文字描述「开注释符/闭注释符」。
- prettier 影响逐字断言**四类**：换行缩进 / 补尾逗号 / **引号风格（`singleQuote` 亦作用于 CSS）** / **补分号**。前两类交归一，后两类写宽容正则（`/html\[data-theme=['"]dark['"]/`；边界 `\(\)[\s\S]*?\n\s*\}`）。
- 找脆弱断言的实证法：`prettier --write <目录>` → 跑单测 → 红的必然是格式敏感断言 → 修 → `git checkout` 还原源码。**还原前先自证可丢**：`git archive HEAD <目录> .prettierrc .prettierignore` 解到 tmp 再跑 prettier，与工作区 `diff -rq` 应为空（只差 `.DS_Store`）。
- ⚠️ **`verify` 绿 ≠ 干净**：unused-vars 在 `eslint.config.js:38`（js/vue）与 `:80`（ts）都配成 **`'warn'`** → 死代码只告警不 exit 1。**实测 191 条**（js 185 + ts 6；落点 `src/` 146 / `scripts/probes` 31 / `tests/` 8 / `supabase/functions` 4 / `output/` 2）。形态**以「多行解构里解出来却没用上的项」为主**（如 `const { pptx, preset } = ctx;`），其次死 const/ref/死函数、死 import —— 所以手法不能一刀切（见 `docs` 里的清法）。`fix-unused-vars.mjs` 按**设计**只做 A 裸 catch 形参 / B **具名导入**说明符 / D `_x`（文件头第 6 行 + 第 175 行「只处理具名导入」）→ 局部变量**从来不在它的范围**，别把它当「一键清 unused-vars」跑（会删坏解构）。**报「verify 绿」时必须同时报警告条数。**
- `eslint .` 会扫进 `output/`（`.gitignore:48` 的产物目录、未跟踪）→ 那里 2 条幽灵警告；给 `eslint.config.js` 的 `ignores` 补 `'output/**'` 即可（与 dist 同性质）。
- 另一个 lint 盲区：`eslint.config.js:91` 的 `no-empty`（`allowEmptyCatch:false`）只治 `catch {}` **语句**，治不了 Promise 的 `.catch(()=>{})`（js 全仓 **37 处**）+ `offline-export.js` 模板串内的 catch（彻底脱离 lint）。
- **`npm run lint` 自 2026-09-29 起带 `--max-warnings 189`** —— 这就是 unused-vars 的**警告棘轮**（比新写一个第 5 份 baseline 脚本便宜一个数量级：ESLint 原生支持，1 行；`ci.yml:43` / `deploy.yml:45` 都跑 `npm run lint`，所以 CI 与发布链上都有牙）。反证实测：往 `src/` 放一个 `const unusedX = 1` → exit 1「found too many warnings (maximum: 189)」。clean 后把 189 改小；上调要在 commit message 交代（同 important-budget 规矩）。口径用 `eslint . -f json` 聚合，别 grep 文本。
- **别把 unused-vars 直接翻 `error`**（189 条会立刻全红）：仓内有 `^_` 约定 → 只会逼人改名 `_thinkingTimer` 保住绿，死代码变「有名字的僵尸」，还容易引出 `--no-verify` 绕过。**计数归零后再翻 error。**
- `eslint .` 会扫进 `output/`（`.gitignore:48` 的产物目录、未跟踪）→ 已在 `eslint.config.js` 的 `ignores` 补 `'output/**'`（与 dist 同性质），那 2 条幽灵警告消失（191→189）。
- **`.catch(()=>{})`（js 全仓 37 处）与 unused-vars 不同**：它是「活代码吞错」而非死代码。多数是刻意的（`router.push('/x').catch(()=>{})`＝导航被中断；队列链 `p.catch(()=>{})`＝不让单点失败炸整条链）→ **别批量加注释**。做法：棘轮锁 37 + **只人工审「吞掉的异常会不会让用户看不到失败」的 9 处**（`ForumMain` 草稿/上传队列 `1893/1936/1947`、`AssetsHubPanel` 6 处）。⚠️ `no-empty`（`eslint.config.js:91`，`allowEmptyCatch:false`）只治 `catch{}` **语句**，治不了 Promise 的；`offline-export.js` 模板串里的 catch 彻底脱离 lint（只能靠人）。
- 既有棘轮 baseline 共 4 份（`important-budget.json` / `anon-execute-baseline.json` / `layering-baseline.json` / `dark-token-budget.json`）+ `dark-gate-scopes.json`；新增门禁**必须**在 `scripts/lib/gate-fixtures.mjs` 加自检样本，否则会被 `check:gates-self-test` 列成「未覆盖」。
- BSD grep 的 **`\s` 在 `-E` 下同样无效**（不只 `\|`）→ 一律用 `[[:space:]]`。我因此先得出「裸 catch 全仓 0 处」的假结论。

## CSS
- ⚠️ `:root` 严禁进 scoped @import（→`[data-v-x]:root` 全死，已修）；全局变量唯一入口 `styles/common/glass-aliases.css`（main.js 引）；CSS 批处理必须原位替换保空白。
- 论坛共享 css 多组件 scoped @import 是承重墙（PostDetail 独用 PostComposer）；全局单点引入被 175 撞名类否决，见 docs/forum-css-dedup-audit.md。
- `animation-fill-mode:both`→该属性不可过渡；动效单源 tokens.css；scoped=+1 特异性；`:global(#id[attr]) .cls` 不产出规则→暗色前缀写 ID 选择器；玻璃单源 tokens.css；暗色真源 theme-manager.js；锁滚动禁新增 !important（棘轮）；sticky 页挂 `html.<页>-scroll body{overflow:visible!important}`。

## 网络 / Supabase（ref nplnlefdwfgtyimfkyih）
- github.com 被 SNI 阻断→push 走 SSH(ssh.github.com:443)；迁移走 Management API+手写 schema_migrations（YYYYMMDDNN_snake.sql，尾 notify pgrst）；凭据在钥匙串（剥 `go-keyring-base64:` 再 b64 解）。
- 撤 EXECUTE 必须 `from anon,authenticated,public`；撤权优先于 drop；用户函数只撤权不加 auth.role() 门；新表 grant anon+authenticated（漏→42501）；撤权前五查 pg_depend/全库函数定义/EF/调用点/RLS；RPC 静默失败=when others 吞错→审计表取 code。

## 路由 / 页面
- App.vue 非 keepAlive key=**route.path**（禁 fullPath/name）；实时搜索不写 URL；论坛入口=首页 /；底栏单源 bottom-nav.ts；七席单源 forum-sections.ts；横屏详情走弹窗。
- `useConfirmDialog`（`composables/useConfirmDialog.js`）：弹窗互斥时**会 reject**，判据与文案是单一真源 `isDialogBusy` / `DIALOG_BUSY_MESSAGE`（2026-09-29 收敛，`SharedMemoryManagement` 原先自写一份已删）。调用点必须把这一类**预期内**拒绝归化成「用户取消」，其它异常**原样冒泡**（否则真错误被吞成「点了没反应」）。⚠️ 别去掉那条 reject：`PWAUpdateToast` 靠它判断「弹窗被占用、稍后重试」。契约 `tests/unit/confirm-dialog-busy.test.js`。
- ⚠️ 焦点层遮罩是 `position:fixed; inset:0; z-index:12000`（`AdminConfirmModal`）→ **弹窗一开，底下按钮点不到**，所以「同一个按钮连点两次触发 reject」基本不可达（第二次点会被遮罩吃掉、当成取消）。评估此类「互斥 reject」缺陷先算可达性，别按「连点即崩溃」排期。
- ⚠️ `<script setup>` 运行时 API 必须显式 import（macro 才免）；ForumMain 的 watch immediate 禁同步调下方 const（TDZ）→`Promise.resolve().then(...)`；slug 发布后不可变。

## 论坛搜索（已收敛）
- `list_forum_posts` 单实现 9 参数+两 wrapper，**禁新增签名**（PG 42725）；搜索必须登录；中文真源=RPC ILIKE 兜底（转义 %/_）；相关度恒优先；高亮 forum_search_excerpt()；降级必须带搜索词（buildFallbackSearchOr×3）；`.or()` 是追加；改搜索跑 probe-forum-search。

## 导航栏 / 灵动岛
- 可见性唯一真源 `isGlobalNavbarVisible(route)`：v-if 控宿主的能力都必须调它（护栏单测 8 条）；全局搜索源注册表 site-search-sources.ts；高亮 `[[..]]`→splitMarks；快捷键 `/`（⌘K 被 AI 岛占）。
- 岛 API useIsland notify/task/ai/custom；优先级 AI>任务>通知；两高度分槽不可混用；点击目标派发中途会换下树→先判 `!target.isConnected`；修饰键判据用 event.code；视觉动效看不见必须定格截图；视觉需求先出原型。
- ⚠️ **`.scrolled` 整套已废（Beta 6 起导航是常驻悬浮岛）**：2026-09-29 把 vendor `unified-nav.css` 里三组休眠规则删净（1015-1070 / `@media portrait` 整块 1694-1787 / **1796-1799**——最后这条在 `@supports not (height:100dvh)` 里，只删前两块删不干净）。危险点是 `#unified-nav-container.scrolled .nav-menu-mobile{top:64px}` 特异性 (1,2,0) > scoped `top:100%` 的 (1,1,0)：**加回这个 class 就会让 17px 接缝回归**，而探针全程不滚动抓不到 → 改由源码守卫 `tests/unit/unified-nav-scrolled-guard.test.js` 锁死（含「必须先剥注释」的反证）。
- 竖屏导航菜单探针 = `probe-nav-mobile-menu.mjs` **48 断言**（3 竖屏档 × 14 + 窄横屏 707×354 × 6）。竖屏修正全在 `@media (orientation: portrait) and (max-width: 768px)` 内；窄横屏走 vendor 的 `top: calc(10px + var(--global-nav-rest-height,58px))`（实测接缝 1px），是另一套几何。⚠️ **写几何断言别用「父级 vs 它自己的第一个子元素」的差值**——margin 折叠会让父子一起位移、差值恒 0（M 的第一版就这样，注入 `margin-top:60px` 仍全绿）；要改成「同一容器内，二级态 vs 三级态」的跨态对比。

## 首页首屏入场
- 真源 `.home` inline `--gate-p`+派生 `--forum-p`；时长唯一真源 GATE_TIMINGS（CSS 禁写时长）；跟手 `{passive:false}`+preventDefault；RATIO=1.2 与 COMMIT=0.08 成对调；虚化=静态 blur 副本；落定 `.home-forum-settled{transform:none}`；wheel/touch 绑 .home-gate 不绑 window。护栏 probe-home-gate-pull(50)。

## 帖子图片 / 头像框
- 帖图两半治：is-loaded 前 opacity:0+imageLoadingGiveUp 3.2s 纯 CSS；LQIP 参数单源 utils/api/forum-format.js；LQIP→CacheFirst、正文→StaleWhileRevalidate；cloudinary_pending_uploads 是台账非队列。
- 头像框：归属唯一出口 is_avatar_frame_owned_by；发放唯一入口 grant_avatar_frame（幂等）；⚠️ 新增 tier 必须同步 avatar_frame_tier_rank（else -1→全员解锁）；未测出内孔禁存草稿。

## DB 图片地址解析（2026-09-29 立）
- ⚠️ **DB 图片列混存两种形态**：`@/assets/images/*.webp` 别名（走打包映射）与 `https://res.cloudinary.com/...` 绝对地址（**大陆不可达**，实测直连 000 / 走 cdn.blockofhome.cn 200）。
- **渲染 DB 图片统一用 `utils/db-image-url.js`**（`resolveDbCardImage` / `resolveDbDetailImage` / `resolveDbImageUrl`）——顺序固定「先 getImageUrl 再 Cloudinary 改写」，反过来 `@/assets/...` 会进不了本地解析分支。**只调 `getImageUrl` 就是裂图**：2026-09-29 活动页 id=16/17 即此成因（恰好是最新两条，排在最前）。AGENTS.md 那条「图片资源必须走 getImageUrl()」已按此补正。
- 实测形态分布：`activities.image` 15 别名 + 2 cloudinary；`news.image` 10 别名 + 4 相对 + 2 cloudinary；`lotteries.cover_image_url` 3 cloudinary + 3 空；`products.image` 2 cloudinary + 11 相对。**后两个页面的调用点尚未修**（`CommunityLotteries/index.vue`、`Shop/index.vue`）。
- 同类内联副本待收敛：`Newsroom/index.vue#getNewsImageUrl`、`Newsroom/NewsDetailPage.vue#coverUrl`（逻辑等价，无缺陷）。
- 护栏：`probe-activities-images.mjs`（7 断言，含「不得残留 res.cloudinary.com」）+ `tests/unit/db-image-url.test.js`（12 例，含幂等与反证）。
- Cloudinary 变换档：卡片 `f_auto,q_auto:good,c_fill,w_640,h_440`；详情 `f_auto,q_auto:good,c_limit,w_1600`。实测同一张 PNG 原图 1,162,521 B → 加 `f_auto,q_auto,w_600` 后 40,135 B（1/29）。

## 注册 / Push / AI
- GoTrue：gmail 剥 +tag；密码≥8 唯一真源 auth-validation.js（门禁 check:auth-validation）；Push：push_outbox→pg_net→EF push-send→push-sw.js（经典脚本）；VAPID 用 jsr:@negrel/webpush；SUBJECT mailto:；绝不自动 unsubscribe。
- AI：唯一生效 bohai_model_configs.api_url；只解析 choices[0]；限流 10/分/用户；改 AI 页跑 probe-ai-panels；降级必须档位感知；treehole 表已废（→boh_note_entries）。

## 性能 / PWA / CI / 订阅
- CI 仅 deploy 秒挂=Pages 撞车→`gh run rerun --failed`；SW 预缓存两半一对；node-fetch 必须留在 vite alias（护栏 probe-vite-dep-scan(6)）；.bohai-page 高度三处真源同步。
- 订阅权益单源 subscription-benefits.js；摄影集配额单源 photo-albums/quota.js（超限阻断不降级；展示层勿 import quota.js）；AI 访谈 expertState 唯一写入点 BOHAIMain.vue:1898（路径 B 不建属产品决策）。
