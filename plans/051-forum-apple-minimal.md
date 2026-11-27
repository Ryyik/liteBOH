# 051 — 论坛 Apple 极简重构：帖子卡片 / 卡内评论区 / 详情页

> **定稿（2026-11-26 用户逐条拍板）：**
> 1. 卡片评论「查看全部 N 条」→ **跳详情页**（放弃「就地加载更多」，评论通道随之收敛）
> 2. 详情页桌面**双栏保留**（正文列 + 评论侧栏），只做极简语言适配，不砍结构
> 3. **砍 icon 回复按钮**：卡片操作栏 = 赞 / 评 / ⋯ 三件
> 4. **砍评论排序模式**（CommentThread `change-sort-mode` 移除，只留默认序）
> 5. home-cat **全保留**（方案 A）：卡片装饰层 + 点赞/回复成功猫动画都在，需为极简卡重设装饰形态
> 6. Tier 卡色 **Ultra 独占**：pro/max 卡底色与引用框染色删除；**昵称色（gold/rainbow）保留**
> 7. ⋯ 菜单 = **分享 + 复制链接 + 举报**（+本人可见的编辑/删除）
> 8. 1/N 胶囊**只读**，「点段跳图」移交 ForumImageViewer；+N 尾卡极简化但**保留滚近补全链**
> 9. 正文截断 **4 行**，判据保留 `scrollHeight > clientHeight` 实测（**不跟 Demo 的字数估算**）
> 10. C 类页面组件（广告卡/专辑卡/问博莱克卡/签到舞台/已读分隔线/下拉刷新/发布会话）**不出本期**，只做「不出戏」检查
> 11. （14:26 追加）卡片右上角**分类/定位纯文本一并删除**——头部只剩「作者 · 时间」，分类信息只在详情页呈现
> 12. （14:36 追加，附截图）评论**删除入口**：不常驻 ×，**点击自己发的评论**浮出「删除」文字钮（回复钮保持常驻）；
>     本人口径 = 本人或 admin；再点一次收起
> 13. （14:39 追加）**Ultra 卡色降饱和**：`--appl-ultra-card` #fdf5f8 → #fcf7f8、暗色 rgba(60,32,45) → rgba(52,38,44)，只留一点暖意接近中性白
>
> ⚠️ 工程纪律备注：tokens.css 的属性选择器必须保持**双引号**（`check:first-paint` 的 pickDecl 按双引号字面量匹配；
> prettier singleQuote 会改写它 —— 该文件不要跑 prettier，本次已回修 5 处）。

**设计产物**：可交互 Demo 与构建脚本、真实帖子数据已归档至 `plans/051-assets/`（apple-minimal-forum-demo.html / build-demo.mjs / real-posts.json）。Demo 已对接线上 16 条真实帖子与实时评论接口，未动正式源码。

---

## 0. 设计语言（Demo 已定稿，直接引用）

| Token | 浅色 | 深色 |
| --- | --- | --- |
| 画布 `--bg-canvas` | `#F5F5F7` | `#000000` |
| 卡片 `--bg-card` | `#FFFFFF` | `#1C1C1E` |
| 降阶灰底 `--bg-subtle` | `#F2F2F7` | `#2C2C2E` |
| 正文 / 次级 / 三级字色 | `#1D1D1F` / `#6E6E73` / `#86868B` | `#F5F5F7` / `#98989D` / `#636366` |
| 强调蓝 `--accent-blue` | `#0071E3` | `#0A84FF` |
| 发丝线 `--border-hairline` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.08)` |
| 卡片阴影 | `0 1px 3px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.02)` | `0 1px 2px rgba(0,0,0,.3)` |

- **去外边框、去毛玻璃卡壳、去大阴影**，只留极轻接触阴影（`glass-panel` 基类不再上卡，注意 `contain: paint` 不随玻璃一起消失带来的裁剪行为变化）
- **同心圆角**：外卡 22px（padding 20px），内部媒体/引用块 12px
- **头像三档尺度**：作者 40 / 评论 28 / 子回复 20（收敛现行 42/40/36/24/20 五种）
- 字号阶梯：卡片标题 18/600、正文 15/1.58；详情标题 25/Display、正文 16/1.68；元信息 13
- 计数用 `tabular-nums`；计数为 0 隐藏数字

---

## 1. 拍板 → 机制对冲表（每条决策的工程后果）

| 拍板 | 现行机制 | 落码动作 |
| --- | --- | --- |
| 1 评论跳详情 | `more-replies` 事件 + `loadPostReplyPreview` 就地追加 | 卡片内保留预览（首批若干条）；「查看全部 N 条 ›」改为跳详情并定位评论区；`load-more-images` 式的评论追加路径只在详情保留 |
| 2 双栏保留 | 路由页 `1.6fr + 1fr`（max-width 1400）；弹窗为小红书式 | 结构不动；两栏各自做「去壳」：正文列变纯阅读画布（列内 max-width 680 居中），评论侧栏去灰底框、发丝线分隔 |
| 3 砍回复 icon | `reply-btn-v2`（icon-only）+ WAAPI transform-origin 取它的位置 | 删按钮；`toggle-reply-input` 改由评论按钮承担（展开评论区并聚焦输入框）；**onReplyEnter 的 origin 兜底逻辑保留**（origin 来源按钮没了就走 0.86 默认值） |
| 4 砍排序 | CommentThread `change-sort-mode` + 父级排序状态 | 删控件与状态；接口 `getComments` 的排序参数固定默认值 |
| 5 home-cat 保留 | `post-card-theme-cat` / `post-card-background-cat` / `like-pop-cat-img` / `reply-success-pop-cat-img` | 装饰形态重设：极简白卡上猫装饰降为低饱和小尺寸贴边元素（具体视觉见 §3.4），动画触发链不改 |
| 6 Ultra 独占 | feed.css:311-319 三档卡色、:673-679 三档引用框色（含暗色段） | 删 pro/max 两档（卡片+引用框+暗色）；`tier-ultra` 卡色改用新 token（极简底上的低饱和粉）；`tier-pro/max` class 从卡片 class 绑定移除，`useUserTier` 数据流不动 |
| 7 ⋯ 菜单 | 卡片无菜单；详情有举报/编辑/删除，卡片分享是独立按钮 | 新增 `CardActionsMenu`；卡片级**举报**为新增能力（走详情页同一 report API）；复制链接/分享反馈态收敛为一处 |
| 8 胶囊只读 | `image-strip-dots` 点击跳段（`goToStripIndex` + 锁定窗口 + pendingStripScrollIndex 补全联动） | 删分段横条与点击跳段 UI；**滚动补全链完整保留**（`onStripScroll` 近右端触发 `load-more-images`）；跳段能力由 ForumImageViewer 承接 |
| 9 4 行 + 实测 | `.post-text-v2` 5 行 max-height + `bodyOverflowing`（scrollHeight 实测，P2-4 事故修） | max-height 改 4 行；**实测判据与 ResizeObserver 原样保留**；Demo 的 `body.length > 130` 不落地 |
| 10 C 类不动 | AdSlot / AlbumPostCard / BohForumAnswerCard / ForumSeenDivider / CheckinRewardStage / pull-to-refresh / 发布会话 | 本期不改它们的内部实现；只验收新卡语言下「不出戏」（间距/圆角/阴影不冲突），适配另行开批 |

---

## 2. 组件拆分（真源收敛，见功能极简审查结论）

### 2.1 新增共享组件（都放 `src/views/Forum/components/` 或提升到共享层）

1. **`ReplyIdentityRow.vue`** —— 评论身份行唯一真源：头像（含 `boh-avatar-frame` 佩戴态）+ 昵称（tier 昵称色）+ 封禁 pill + `回复 ▸ @目标 · 时间`（**沿用 `shouldShowReplyTarget` 的折叠语义**：顶层回复不 @ 自己）。消费方：PostCard 预览区、CommentThread、详情侧栏。
2. **`ReplyComposer.vue`** —— iMessage 无框输入唯一真源，**三态补齐**：发送中（箭头转圈）、冷却（`replyCooldownSeconds` 禁用+秒数）、未登录（点箭头弹登录浮层不弹框）。受控 `value` 走 `useAutoGrowTextarea` 的 **getter 契约**（切换回复对象必须收缩）。取消 = 清空内容，不再提供取消按钮。消费方：卡片输入区、CommentThread 回复框、详情页输入（弹窗 + 路由页两宿主复用同一组件，消灭 4 份输入框实现）。
3. **`LikeButton.vue`** —— 心形 + 脉冲 + `tabular-nums` 计数唯一真源。消费方：卡片主楼、详情主楼、评论行（**评论点赞是 Demo 漏项，本期补上**，走现行 `toggle-comment-like` API）。
4. **`CardActionsMenu.vue`** —— ⋯ 毛玻璃小面板：分享 / 复制链接 / 举报 /（本人或 admin：编辑、删除-红色 destructive）。菜单内操作完成不跳转、不打断阅读位置。
5. **`DetailArticle.vue`** —— 详情**内容层**（作者栏含关注按钮+已编辑标记、Display 标题、正文、媒体条、评论区挂载点），弹窗壳与路由页共同套用它。`!modalMode` 的两份 actionbar 模板合并：宿主只决定容器与底部栏位置，内容单一真源。

### 2.2 现有组件的改动

- **PostCard.vue**：删 icon 回复按钮、分段横条 UI、pro/max tier class；正文 4 行；媒体条换 1/N 只读胶囊；引用框换灰底 `--bg-subtle` 降阶块（仅 Ultra 染色）；评论区顶部改发丝线；回复列表换 `ReplyIdentityRow`；骨架屏保留（灰条形态，**与列表同形铁律不动**）
- **CommentThread.vue**：删排序 UI；回复框换 `ReplyComposer`；身份行换 `ReplyIdentityRow`；点赞换 `LikeButton`；分页交互只留「加载更多」（子回复分页保留）
- **PostDetailMain.vue / PostDetailModal.vue**：内容层抽到 `DetailArticle`；操作栏与输入区换共享组件；morph 转场、z-index 体系（2147482400 一系）、`initialEdit` / `?edit=1` 编辑入口**全部不动**

---

## 3. 视觉规格补笔（Demo 未设计部分）

### 3.1 卡片微头部
24px 头像（官方卡=站点 favicon，佩戴头像框时 28px 外扩）；单行 `作者 · 时间`；右侧纯文本分类/定位（MapPin 图标可留，12px 线性）。封禁 pill 保留但降饱和（细边框字色式，非红底渐变）。

### 3.2 Ultra 卡色
极简底上的 Ultra 卡：浅色 `#FDF5F8` 实色、深色 `rgba(60,32,45,.55)` 叠卡底；不再用透明度叠加玻璃。引用框 Ultra 染色同源。pro/max 删除后 `tier-pro/max` class 不再上卡（useUserTier/getNicknameClass 保留给昵称色）。

### 3.3 ⋯ 菜单 / 骨架 / 失败态
- ⋯ 菜单：`--bg-card` 底 + 发丝线边 + 极轻阴影，菜单项 15px 纯文字，destructive 红 `--accent-red`
- 骨架屏：`--bg-subtle` 灰条 + `prefers-reduced-motion` 降级（保留现有 pulse 机制）
- 图片失败态：`--bg-subtle` 底 + 细线 ImageOff + 12px 文案，按钮 disabled 保留

### 3.4 home-cat 装饰的极简形态
- 卡角猫装饰：尺寸上限 64px、透明度 ≤ 0.9、贴卡右下角避让文字区；背景猫保持整卡但叠加层降不透明度到 ≤ 0.12
- 点赞/回复成功猫动画：保留原尺寸与触发链，仅容器层级校准到新卡片结构

### 3.5 详情页
- 正文列：列内 max-width 680 居中；毛玻璃粘性导航（‹ 返回 + 标题）浅色 `rgba(245,245,247,.78)` / 深色 `rgba(0,0,0,.78)`
- 评论侧栏（桌面）：去灰底框，顶部发丝线，`ReplyIdentityRow` + `LikeButton`；移动端折为正文流内联（现行行为）
- 底部悬浮 iMessage 评论栏：safe-area 适配保留；弹窗模式下与 morph 出场动画协同验证

---

## 4. 工程契约红线（动结构前逐条对照）

1. `data-forum-post-id`（虚拟列表与长图滚动定位）、`data-forum-virtual-index`（IntersectionObserver）**不改名不挪位**
2. `isOfficialCard`、`loadedImageKeys` / `getForumImageKey`（与 ForumMain 共用实现）**语义不动**；官方卡判定抽到 `forum-helpers.js` 时两处消费方同步换
3. `useAutoGrowTextarea` 必须传 **getter 形式的 value**（父级主动改写时收缩）
4. WAAPI 展开动画：`:css="false"` + `done()` 无条件放行 + 按实测高度算时长（plans/035 §4）；改形态前先跑 `probe-reply-autogrow`
5. 图片补全链：`hiddenImageCount` → 滚近触发 `load-more-images` → `allImages` 变化接力滚动，**一段都不能断**（分段横条删除后，`goToStripIndex`/`pendingStripScrollIndex`/`lockStripIndex` 中纯跳段逻辑随之删除，补全触发保留在 `onStripScroll`）
6. 截断判据：`scrollHeight > clientHeight + 1` + ResizeObserver + watch 双通道（P2-4），只改行数不改判据
7. 虚拟列表高度估算：卡片 padding 从现行改 20px、图片条通栏形态变化会影响 `contain-intrinsic-size` 与 spacer 估算 → 批 2 必须实测长 feed 滚动无跳动
8. 官方卡 `getComments`/举报等 API 复用现行 comment-api / report API，**不新增后端调用形状**
9. 深链与 compat：帖子详情的 modal/route 双宿主、`?edit=1` 入口不动

---

## 5. forum-dark.css 衔接策略

现行 forum-dark.css（929 行）按旧类名黑名单覆盖。策略：
- **本期新增/改名的类一律用 §0 token 自适应**，不进 forum-dark 黑名单
- 被删除的类（`image-strip-dots`、`reply-btn-v2`、`tier-pro/max` 卡色段等）的暗色覆盖段**同步删除**（这是本轮暗色债的净下降，棘轮 `dark-tokens` 读数应下降）
- 收尾批对 forum-dark 做一次孤儿段清理（配合 `audit:css`），但**不在卡片改造同批做**，避免归因混淆

---

## 6. 实施批次与验收门禁

> 前置：批 0（SmartOverview 在途收口）必须先落地，工作区干净后再动本方案——两边都会大改 Forum 相关文件，混批无法归因。

| 批 | 内容 | 验收 |
| --- | --- | --- |
| 1 | 共享组件 5 件（ReplyIdentityRow / ReplyComposer / LikeButton / CardActionsMenu / DetailArticle）+ 单测 | `npm run verify`；新组件源码守卫测试（受控收缩、done() 放行、@目标折叠语义各 1 条反证式断言） |
| 2 | PostCard 极简化 + 卡内评论区换装 | `verify` + `probe-reply-autogrow`（场景 A 断言随形态更新，先跑基线）+ `probe-home-forum-rail`（21 断言）+ 竖屏视觉巡检截图肉眼过（**样式类改动必须肉眼**） |
| 3 | 详情页：DetailArticle 接入双宿主、双栏去壳、评论侧栏极简、⋯ 菜单/举报落卡片 | `verify` + `probe-forum-search`（39，内联回答卡不回归）+ `probe-route-switch` + 弹窗 morph 手测 + 双栏桌面截图 |
| 4 | forum-dark 清理 + C 类「不出戏」检查 + 头像五档→三档全局校准 | `verify` + `audit:css`（新增孤儿应为删类名的净下降）+ `check:dark-tokens` + 暗色截图对比 |
| 收尾 | 棘轮基线下调（在提交树口径上 `--update`）+ plans/035 相关验收注释更新 | `npm run prepush`（动过基线必跑） |

纪律：每批一次独立提交（commit message 写明棘轮变化理由）；`lint:delta` 归因新增警告；样式差分只报 1 项时肉眼复查。

---

## 7. 风险清单

1. **probe-reply-autogrow 场景 B**：详情页 `pd-reply-input` 是死 UI（两处 CommentThread 均硬编码 `:hide-composer="true"`）——换 `ReplyComposer` 时**不要顺手"修"它**，断言口径同步到新组件
2. **Demo 数据形状 ≠ 源码形状**：real-posts.json 是为 Demo 造的简化形状，落码以 `forum-format` / comment-api 真源为准，不从 Demo 抄数据处理
3. **双栏 + 弹窗 + 内容层共用**是本方案工作量最大的一块（PostDetailMain 3809 行），批 3 可能需要再拆两步提交
4. **WAAPI origin 依赖**：reply 输入框 transform-origin 取「回复」按钮位置，按钮删除后走默认 0.86——展开动画观感变化要在截图验收里确认
5. **卡片级举报是新增能力**：需确认举报 API 的防刷/频控在列表场景下可复用（详情页已有完整实现，预计直接复用）
6. **Ultra 独占卡色后 tier 视觉骤降**：pro/max 用户感知问题——已由拍板确认，发布说明里带一句即可
