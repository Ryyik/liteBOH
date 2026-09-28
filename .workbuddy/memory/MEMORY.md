# BOHLITE 硬规则（细节见日期日志与 docs/plans）

## 环境 / 探针
- vite 默认只绑 IPv6；localhost 探针需双栈：`vite --port 5173 --host ::`；构建 `vite build --outDir dist-check`（勿动 dist；沙箱拦清目录先手动 rm）。vitest 加 `--pool=forks`；npx 被 SIGTERM→`./node_modules/.bin/<tool>`。
- playwright：chrome channel+`--proxy-server=direct:// --proxy-bypass-list=*`；同 path 单 route（逆序→catch-all 先注册）；mock Supabase 必回 Content-Range；伪造登录注 pinia。
- 归因：工作区常有未提交工作，**别裸 stash HEAD 当基线**；探针多次漂移=抖动非回归；改完必反证。
- BSD grep 不支持 BRE `\|` 交替与 `\b`（静默 0 命中）→交替用 `grep -E`、边界用朴素子串。pre-commit（lint-staged+prettier）首次触碰未格式化文件会全文件 churn，混入 refactor commit 属预期一次性。
- 通知 store 加载单源 `stores/notification-loader.ts`（含共享 ref + ensureNotificationStore，六个宿主绑定）；Tailwind 已移除（2026-09-28），preflight 补偿在 style.css `@layer base`，`--color-*/--radius-*` 24 变量唯一定义源在同文件 `:root`。

## 测试 / 守卫断言（2026-09-28 起）
- 「读源码 + `toContain`」守卫**必须过 `tests/helpers/source.js` 的归一**，且**两边过同一个**：`squeezeSource`（空白压单空格+去尾逗号+去闭括号前空白）/ `flattenSource`（再去全部空白，用于开括号后、`="` 后的断行）。契约在 `tests/unit/source-helper.test.js`（12 条，含反证，别删）。
- prettier 影响逐字断言**四类**：换行缩进 / 补尾逗号 / **引号风格（`singleQuote` 亦作用于 CSS）** / **补分号**。前两类交归一，后两类写宽容正则（`/html\[data-theme=['"]dark['"]/`；边界 `\(\)[\s\S]*?\n\s*\}`）。
- 找脆弱断言的实证法：`prettier --write <目录>` → 跑单测 → 红的必然是格式敏感断言 → 修 → `git checkout` 还原源码。**还原前先自证可丢**：`git archive HEAD <目录> .prettierrc .prettierignore` 解到 tmp 再跑 prettier，与工作区 `diff -rq` 应为空（只差 `.DS_Store`）。

## CSS
- ⚠️ `:root` 严禁进 scoped @import（→`[data-v-x]:root` 全死，已修）；全局变量唯一入口 `styles/common/glass-aliases.css`（main.js 引）；CSS 批处理必须原位替换保空白。
- 论坛共享 css 多组件 scoped @import 是承重墙（PostDetail 独用 PostComposer）；全局单点引入被 175 撞名类否决，见 docs/forum-css-dedup-audit.md。
- `animation-fill-mode:both`→该属性不可过渡；动效单源 tokens.css；scoped=+1 特异性；`:global(#id[attr]) .cls` 不产出规则→暗色前缀写 ID 选择器；玻璃单源 tokens.css；暗色真源 theme-manager.js；锁滚动禁新增 !important（棘轮）；sticky 页挂 `html.<页>-scroll body{overflow:visible!important}`。

## 网络 / Supabase（ref nplnlefdwfgtyimfkyih）
- github.com 被 SNI 阻断→push 走 SSH(ssh.github.com:443)；迁移走 Management API+手写 schema_migrations（YYYYMMDDNN_snake.sql，尾 notify pgrst）；凭据在钥匙串（剥 `go-keyring-base64:` 再 b64 解）。
- 撤 EXECUTE 必须 `from anon,authenticated,public`；撤权优先于 drop；用户函数只撤权不加 auth.role() 门；新表 grant anon+authenticated（漏→42501）；撤权前五查 pg_depend/全库函数定义/EF/调用点/RLS；RPC 静默失败=when others 吞错→审计表取 code。

## 路由 / 页面
- App.vue 非 keepAlive key=**route.path**（禁 fullPath/name）；实时搜索不写 URL；论坛入口=首页 /；底栏单源 bottom-nav.ts；七席单源 forum-sections.ts；横屏详情走弹窗。
- ⚠️ `<script setup>` 运行时 API 必须显式 import（macro 才免）；ForumMain 的 watch immediate 禁同步调下方 const（TDZ）→`Promise.resolve().then(...)`；slug 发布后不可变。

## 论坛搜索（已收敛）
- `list_forum_posts` 单实现 9 参数+两 wrapper，**禁新增签名**（PG 42725）；搜索必须登录；中文真源=RPC ILIKE 兜底（转义 %/_）；相关度恒优先；高亮 forum_search_excerpt()；降级必须带搜索词（buildFallbackSearchOr×3）；`.or()` 是追加；改搜索跑 probe-forum-search。

## 导航栏 / 灵动岛
- 可见性唯一真源 `isGlobalNavbarVisible(route)`：v-if 控宿主的能力都必须调它（护栏单测 8 条）；全局搜索源注册表 site-search-sources.ts；高亮 `[[..]]`→splitMarks；快捷键 `/`（⌘K 被 AI 岛占）。
- 岛 API useIsland notify/task/ai/custom；优先级 AI>任务>通知；两高度分槽不可混用；点击目标派发中途会换下树→先判 `!target.isConnected`；修饰键判据用 event.code；视觉动效看不见必须定格截图；视觉需求先出原型。

## 首页首屏入场
- 真源 `.home` inline `--gate-p`+派生 `--forum-p`；时长唯一真源 GATE_TIMINGS（CSS 禁写时长）；跟手 `{passive:false}`+preventDefault；RATIO=1.2 与 COMMIT=0.08 成对调；虚化=静态 blur 副本；落定 `.home-forum-settled{transform:none}`；wheel/touch 绑 .home-gate 不绑 window。护栏 probe-home-gate-pull(50)。

## 帖子图片 / 头像框
- 帖图两半治：is-loaded 前 opacity:0+imageLoadingGiveUp 3.2s 纯 CSS；LQIP 参数单源 utils/api/forum-format.js；LQIP→CacheFirst、正文→StaleWhileRevalidate；cloudinary_pending_uploads 是台账非队列。
- 头像框：归属唯一出口 is_avatar_frame_owned_by；发放唯一入口 grant_avatar_frame（幂等）；⚠️ 新增 tier 必须同步 avatar_frame_tier_rank（else -1→全员解锁）；未测出内孔禁存草稿。

## 注册 / Push / AI
- GoTrue：gmail 剥 +tag；密码≥8 唯一真源 auth-validation.js（门禁 check:auth-validation）；Push：push_outbox→pg_net→EF push-send→push-sw.js（经典脚本）；VAPID 用 jsr:@negrel/webpush；SUBJECT mailto:；绝不自动 unsubscribe。
- AI：唯一生效 bohai_model_configs.api_url；只解析 choices[0]；限流 10/分/用户；改 AI 页跑 probe-ai-panels；降级必须档位感知；treehole 表已废（→boh_note_entries）。

## 性能 / PWA / CI / 订阅
- CI 仅 deploy 秒挂=Pages 撞车→`gh run rerun --failed`；SW 预缓存两半一对；node-fetch 必须留在 vite alias（护栏 probe-vite-dep-scan(6)）；.bohai-page 高度三处真源同步。
- 订阅权益单源 subscription-benefits.js；摄影集配额单源 photo-albums/quota.js（超限阻断不降级；展示层勿 import quota.js）；AI 访谈 expertState 唯一写入点 BOHAIMain.vue:1898（路径 B 不建属产品决策）。
