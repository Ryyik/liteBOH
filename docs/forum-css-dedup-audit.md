# 论坛共享 CSS 去重审计（2026-09-27）

> 结论先行：`styles/*.css` 多组件 scoped @import 的现状是**承重墙**，不能一刀切改单点全局引入。
> 本轮已完成的「变量层全局化」（glass-aliases.css）消除了最坏问题（死 `:root` × N 份副本）；
> 选择器层去重需要先做类名规范化，见文末路线。

## 现状

| 文件 | 行数 | scoped 引入方 |
|---|---|---|
| composer.css | 1898 | ForumMain / PostComposer / WeeklyCheckinCalendar |
| replies-responsive.css | 1813 | ForumMain / PostCard / PostComposer |
| feed.css | 1497 | ForumMain / PostCard |
| drawers-skeletons.css | 603 | ForumMain |
| anniversary.css | 545 | ForumMain |
| base.css | 211 | ForumMain / PostCard / WeeklyCheckinCalendar |
| weekly-report.css | 84 | ForumMain |

- 同一文件在产物中带各组件 data-v 复制 2~4 份（同 chunk，gzip 后重复文本压缩率高，实际带宽损失有限）。
- 变量层已迁 `src/styles/common/glass-aliases.css`（main.js 全局引一次），base.css 不再含 `:root`。
- **功能性依赖**：PostComposer 被 `views/PostDetail/PostDetailMain.vue` 独立使用（脱离 ForumMain 路由），
  其 `@import composer.css / replies-responsive.css` 是 PostDetail 页的唯一样式来源，**勿删**。
- 跨组件选择器的坑已有先例记载：base.css 搜索框注释（ForumToolbar 的桌面档样式必须留在 Toolbar scoped 内）。

## 为什么不能改单点全局引入

对 7 个文件共 468 个类名做了全站冲突审计：**175 个类名**与 Forum 之外的其他 css 撞名。高危样本：

| 类名 | 撞名处 | 风险 |
|---|---|---|
| `.forum-toolbar` | Home/style.scoped.css | 首页论坛轨元素会被论坛工具栏样式误伤 |
| `.forum-container` / `.forum-header` / `.forum-left-column` / `.forum-main-grid` | UserSpace shell-community / landscape-rail | 用户空间社区壳有自己的布局定义 |
| `.fade-in-up` / `.fade-slide-*` | PostDetail、Messages、Birthday 等 7+ 处 | 全局动画规则互相叠加 |
| `.glass-panel` | PostDetail / ShopConsole | 全站玻璃卡片语义不同 |
| `.active` / `.danger` / `.empty` / `.completed` / `.failed` 等状态词 | 30+ 文件 | 需逐条确认论坛侧是否为复合选择器 |

scoped 现状下这些撞名天然隔离（data-v 匹配）；改全局后层叠由「加载顺序 + 特异性」决定，
特异性整体降一级（`[data-v]` 消失），回归面覆盖论坛/首页/用户空间/帖子详情四个页面。

## 去重路线（按推荐顺序）

1. **类名规范化**（前置，工作量最大）：把 `styles/*.css` 里无 `.forum-page` 前缀的裸类名
   统一加 `forum-` 命名空间或收拢到 `.forum-page` 作用域下；撞名状态词逐条确认。
2. **前缀包裹**：对 7 个文件做 `.forum-page` 包裹（`:root`/`@keyframes` 除外），
   然后所有组件删 @import，ForumMain 单点非 scoped 引入。注意特异性变化需全量探针回归。
3. **维持现状 + 增量纪律**：新增选择器一律 `.forum-page` 前缀；不再往共享文件里加全局裸类。
   （最省力，重复体积维持现状）

审计明细生成脚本：`node -e`（见 2026-09-27 工作日志）；类名清单曾落 `/tmp/forum-classes.txt`（临时）。
