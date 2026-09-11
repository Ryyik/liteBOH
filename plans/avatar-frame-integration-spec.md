# 自制头像框 · 全站接入技术方案与绘制规格

> 目标：自己绘制一张透明背景头像框图片，叠加在全站用户头像上。
> 基于对当前代码的全量普查（2026-09-10），先给事实，再给决策、接入步骤与绘制参数清单。

---

## 一、现状普查结论

### 1.1 核心事实

- **没有统一头像组件**：全站约 31 处头像渲染点各自写 `<img>` + 各自的 class，样式散落在各 vue scoped css 与少量共享 css（`feed.css`、`profile-panels.css`、`shell-community.css`）。
- **形状不统一，你的感觉是对的**：圆形约 21 处，圆角矩形约 10 处（9–24px 圆角）。
- **URL 也不统一**：`getAvatarUrl`（Cloudinary 裁剪，xs32/sm48/md96/lg256）只有 5 处在用，其余直接用原始 `avatar_url`。
- **已存在功能型叠加层**（在线绿点、编辑铅笔徽章、导航红点），但**不存在任何装饰性头像框层**，需从零建设。

### 1.2 圆形 vs 圆角矩形清单

**圆形（约 21 处，主流形态）**

| 场景 | 文件 | 尺寸 |
|---|---|---|
| 导航栏 | UnifiedNavbar `.nav-avatar` | 32 |
| 帖子详情作者 | PostDetailMain `.author-avatar` | 48 |
| 论坛列表作者 | PostCard `.post-author-avatar` | 42 |
| 关注列表 | FollowListModal | 40 |
| 概览卡 | OverviewCard | 22 |
| 用户空间资产面板 | AssetsHubPanel `.ah-avatar` | 52 |
| 个人主页大头像 | ProfileMain `.profile-avatar-large` | **180** |
| 个人主页评论/印象 | ProfileMain `.avatar-mini` / `.imp-avatar` | 48 / 30 |
| 商店 | Shop `.avatar-button` | 42 |
| Cloud+ 共享者 | CloudPlusMain | 34 |
| BOHAI 侧栏 | adaptive-layout.css | 40 |
| 生日英雄/翻牌 | BirthdayHero 96 / Birthday 56·48 | — |
| 其他（成员详情/授权台/中奖者等） | — | 32–100 |

**圆角矩形（约 10 处，需统一）**

| 场景 | 文件 · class | 尺寸 | 圆角 |
|---|---|---|---|
| 论坛回复 | PostCard `.reply-avatar` | 36 | 12px |
| 帖子详情评论回复 | CommentThread `.mini-avatar` | 30 | 9px |
| 用户空间英雄/编辑头像 | profile-panels.css `.apple-avatar` | 80 | 24px |
| 封禁墙 | BlockWall `.mini-avatar` | 42 | 10px |
| 合作伙伴 | Partners `.mini-avatar` / `.partner-avatar-img` | 44 / — | 12 / 18px |
| 消息 | Messages `.x-avatar` | 52 | 18px |
| 内测预览 | BetaPreview `.release-avatar` | 46 | 14px |
| 社区成员列表 | shell-community.css `.user-avatar` | 44 | var(--radius-avatar)=14px |
| Lab 对话 | Lab `.message-avatar` | 24 | var(--radius-sm)=6px |

**三个动态形状陷阱（普查发现，接入时必须处理）**

1. `PostDetail/style.scoped.css:53`：周年皮肤激活时把详情页作者头像改成 **2px 方形**（像素风主题）。
2. `PostCard.vue:446`：移动端 `@media(max-width:768px)` 把作者头像从 50% 改回 12px。
3. `shell-community.css` 与 `Lab` 用共享 CSS 变量控制圆角，**不能直接改变量**（会波及其他组件），要改各自 class。

---

## 二、决策一：是否先统一圆形？→ 是，强烈建议

理由：头像框是环形/中心挖孔设计，叠在圆角矩形上会露角、错位、遮字；且圆形是全站 2/3 场景的现状，也是 Apple 风视觉基准。**先统一形状，再叠加框**，否则同一张框在两种底形状上效果不可控。

**统一圆形改造清单（10 处 class + 2 个陷阱）**，统一改为 `border-radius: 50%`，并确认容器 `overflow: hidden` + img `object-fit: cover`：

1. `PostCard.vue` `.reply-avatar`（12px → 50%）
2. `PostCard.vue:446` 移动端 media 内 `.post-author-avatar` 的 12px（删除该覆盖，保持 50%）
3. `CommentThread.vue` `.mini-avatar`（9px → 50%）
4. `profile-panels.css` `.apple-avatar`（24px → 50%，UserSpace 英雄 + 编辑头像两处引用）
5. `BlockWall` `.mini-avatar`（10px → 50%）
6. `Partners.vue` `.mini-avatar` 与 `.partner-avatar-img`（12/18px → 50%）
7. `Messages` `.x-avatar`（18px → 50%）
8. `BetaPreview` `.release-avatar`（14px → 50%）
9. `shell-community.css` `.user-avatar`（直接写 50%，不动 `--radius-avatar` 变量）
10. `Lab` `.message-avatar`（直接写 50%，不动 `--radius-sm` 变量）
11. 周年皮肤 `2px` 方形：**皮肤优先**——活动期间通过 `.boh-avatar-frame { display:none }` 隐藏头像框，避免像素风与圆框打架

---

## 三、决策二：头像框叠加实现方式

### 3.1 推荐方案：CSS 叠加层（最小侵入），后续可收敛为组件

结构：头像外包一层定位容器，框作为绝对定位的兄弟层盖在 img 上方。

```
<span class="boh-avatar-wrap">            ← position:relative（不裁剪溢出！）
  <img class="avatar" src="...">          ← 保持圆形 border-radius:50%; overflow:hidden
  <span class="boh-avatar-frame"></span>  ← 框图层，absolute，pointer-events:none
</span>
```

全局样式（新增 `styles/common/avatar-frame.css`，在 main.js 引入）核心参数：

```css
.boh-avatar-wrap { position: relative; display: inline-block; }
.boh-avatar-frame {
  position: absolute;
  top: -12%; left: -12%;
  width: 124%; height: 124%;           /* 框层比头像大 24%，对应源图内孔占比 80.5% */
  background: var(--boh-avatar-frame-url) center / contain no-repeat;
  pointer-events: none;                 /* 不拦截点击 */
  z-index: 3;                           /* 盖过头像 img */
}
```

- 已有的在线绿点/编辑徽章类叠加层 z-index 提到 4（框之上）。
- 头像 img 自身保持 `border-radius:50%`（圆在 img 上，不在 wrap 上，wrap 必须 `overflow: visible`，否则框的溢出部分会被裁掉）。

### 3.2 接入步骤（分两阶段）

**Phase 1 · 自己可见的最小闭环（不动数据库）**
1. 画好图（规格见第四节）→ 放 `public/avatars/frames/my-avatar-frame.png`
2. 新增全局 `avatar-frame.css`（上面参数）
3. 在自身用户信息处（如登录后 `userInfo.id` 判断）给头像容器挂 `--boh-avatar-frame-url: url('/avatars/frames/my-avatar-frame.png')`
4. 按 6.2 优先级逐处包裹标记

**Phase 2 · 全站他人可见（数据链路）**
1. `profiles` 表新增 `avatar_frame_url text`（走迁移，先 `db push --dry-run` 查占用）
2. 帖子/评论等作者序列化时带出 `author_avatar_frame_url`（相关 select 列表加列）
3. 渲染端：有 frame URL → 渲染框层；无 → 不渲染
4. 穿戴入口：用户空间资产面板 + 个人主页头像点击；到期/等级回收逻辑复用现有订阅 RPC
5. 不显示框的场景：树洞匿名、官方账号（官方用专用框）、周年像素皮肤激活期间

---

## 四、绘制规格（按这个画就行）🎨

### 4.1 核心参数清单

| 参数 | 规格 | 说明 |
|---|---|---|
| 画布 | **1024 × 1024 px 正方形** | 一张图通吃全站尺寸与 3x 高分屏（见表 5.1） |
| 背景 | **全透明**（RGBA） | 中心挖孔区必须全透明，不能垫白底 |
| 中心内孔直径 | **824 px**（圆心 512,512） | 即半径 412。内孔以内=头像露出区，**必须全透明**；渲染后恰好=头像直径，无缝无白边 |
| 框主体外沿 | ≤ 984 px（留 20px 边距） | 防止渲染边缘裁切；耳朵/铃铛等装饰顶到 984 为止 |
| 主环带厚度 | 64–120 px | 太细没存在感，太粗吃头像 |
| 装饰元素特征尺寸 | ≥ 80 px | 耳朵/爪子/铃铛等单元素的最小尺寸 |
| 最细线条 | ≥ 24 px | 更细的线在 24–42px 小头像上会平滑消失（属正常，不是画错） |
| 格式 | **PNG-24（8-bit RGBA 透明通道）** | 禁 JPEG；用 Figma/AI 画的可另存 SVG（体积更小、无限清晰），SVG 内禁用滤镜 |
| 体积 | 压缩后 ≤ 400 KB | TinyPNG / 压图工具过一遍 |
| 命名与放置 | kebab-case，如 `my-avatar-frame.png` → `public/avatars/frames/` | |

### 4.2 绘制自检清单

- [ ] 内孔 824px 以内全透明（拿纯色底垫着检查）
- [ ] 白底、黑底各铺一遍看效果（暗色主题不换图，绘制时双背景自测）
- [ ] 避免大面积半透明白（暗色下会泛白发灰）；半透明阴影/高光 OK
- [ ] 装饰元素没有超出 984px 外沿
- [ ] 24px 缩小预览看一眼：主轮廓与主色仍可辨
- [ ] 导出 RGBA PNG 并压缩 ≤ 400KB

---

## 五、分辨率与高分屏适配

### 5.1 为什么选 1024：DPR 覆盖计算

框层渲染尺寸 = 头像 CSS 尺寸 × 124%。要清晰需满足：`源图 1024 ≥ 渲染尺寸 × 设备像素比`。

| 场景 | 头像 CSS | 框层渲染 | 3x 屏所需像素 | 1024 够吗 |
|---|---|---|---|---|
| 概览卡 | 22 | 27 | 82 | ✅ |
| 导航栏 | 32 | 40 | 119 | ✅ |
| 评论回复 | 30 | 37 | 112 | ✅ |
| 论坛作者/回复 | 42/36 | 52/45 | 156/134 | ✅ |
| 详情作者/资产面板 | 48/52 | 60/64 | 179/193 | ✅ |
| UserSpace 英雄 | 80 | 99 | 298 | ✅ |
| 个人主页大头像 | **180** | **223** | **669** | ✅（512 源在此欠采样，故主推 1024） |

结论：**1024×1024 一张通吃**（1x/2x/3x 全部场景无损）。512 可作为体积敏感时的备选，但个人主页 3x 屏会轻微发虚，需另出主页专用 @2x 图。

### 5.2 各场景接入尺寸对照（包裹时无需改尺寸）

框层按百分比自适应，接入时只加 wrap+frame 两个标记，**不改任何现有 width/height**：

导航 32 · 概览 22 · 评论 30 · 回复 36 · 帖卡作者 42 · 商店 42 · 详情作者 48 · 资产面板 52 · 消息 52 · 英雄 80 · 主页大头像 180。

---

## 六、全站接入位置与优先级

### 6.1 接入方式回顾
每处 = 外包 `boh-avatar-wrap` + 追加 `boh-avatar-frame` 兄弟层，两行改动。

### 6.2 优先级清单

| 优先级 | 位置 | 文件 | 头像尺寸 |
|---|---|---|---|
| P0 | 导航栏 | UnifiedNavbar | 32 |
| P0 | 论坛帖子卡作者 | PostCard.vue | 42 |
| P0 | 帖子详情作者 | PostDetailMain.vue | 48 |
| P0 | 评论与回复楼层 | CommentThread.vue（30）/ PostCard 回复（36） | 30/36 |
| P0 | 个人主页大头像 | ProfileMain.vue | 180 |
| P1 | UserSpace 英雄/编辑头像 | ProfileHomePanel / EditProfilePanel（apple-avatar） | 80 |
| P1 | 资产面板（也是穿戴入口） | AssetsHubPanel.vue | 52 |
| P1 | 商店头像按钮 | Shop/index.vue | 42 |
| P1 | 关注/粉丝列表 | FollowListModal.vue | 40 |
| P2 | 概览卡 | OverviewCard.vue | 22 |
| P2 | 个人主页评论/印象 | ProfileMain.vue | 48/30 |
| P2 | Cloud+ 共享者 / BOHAI 侧栏 / 生日系列 / 抽奖中奖者 | 各自文件 | 32–100 |
| 不接入 | 树洞匿名、官方账号、Lab 对话占位、周年皮肤期间 | — | — |

### 6.3 风险与陷阱备忘

1. wrap 不设 `overflow:hidden`（框溢出靠它显示）；圆角在 img 上。
2. 三处动态形状陷阱（周年皮肤 / 移动端 media / CSS 变量圆角）按第二节清单处理。
3. `!important` 有预算门禁——新样式走全局 css + 类名，别用 `!important` 硬压。
4. 暗色主题：PNG 不随主题切换，靠绘制阶段双背景自测兜底。
5. 列表页性能：框是纯 CSS background，无额外网络请求逻辑；Phase 2 下发 frame_url 时跟随现有作者字段查询，不新增逐头像请求。

---

## 七、最小落地顺序（Summary）

1. 按**第四节参数**画图（1024×1024 RGBA，内孔 824，最细线 ≥24）
2. 统一 10 处圆角矩形为圆形（第二节清单）
3. 全局 `avatar-frame.css` + 自己头像点亮（Phase 1）
4. P0 五处接入 → 验收暗色与 24px 场景 → P1/P2 铺开
5. 需要他人可见时再上 `avatar_frame_url` 字段（Phase 2）
