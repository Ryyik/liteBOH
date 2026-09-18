# 头像框控制台（avatar-frame-console）设计方案

> 2026-09-18 · 目标：在数据管理面板里把「做头像框」从改代码变成点鼠标。
> 前置事实全部来自 live 代码/迁移实测，非推测。**本文只给方案，未改任何代码。**

## 〇、一句话总纲

**管理员上传一张 PNG → 在固定头像上拖动缩放摆好位 → 系统把摆位结果烘焙成孔心居中的成品图并自动算出 scale → 填名字/归属/价格 → 发布。渲染层零改动。**

---

## 一、为什么要做（今天刚踩的坑就是需求说明书）

现流程是「设计师给图 → 人工测内孔占比 → 反推 scale → 裁切 → 手写清单一行 → 改代码上线」。
2026-09-18 接入菊花梨/奇丽草时，这套流程暴露了四个问题：

| 问题 | 今天实际发生的事 |
| --- | --- |
| **几何靠人眼** | 内孔内接圆要用脚本跑 DT 测；装饰外扩大的图自然 scale 到 2.90，在 116px 卡片里会重叠，得再手工裁到占比 48% |
| **参数与素材脱钩** | scale 是清单里的手填数字，和图像内容没有任何强制关联，填错没人拦（早上那个 `frame-scale` 静默失效的 bug 就是这么潜伏的） |
| **上架即改代码** | 加一个框必须改 `useAvatarFrame.js` + 走一次构建部署，运营无法自助 |
| **归属只有档位** | 只能绑订阅档，没有「限时免费」「积分解锁」这类运营手段（限免是今天临时加的字段） |

控制台把这四件事一次性收进 UI：**几何由摆位决定、参数由系统算、上架不改代码、归属支持档位/限免/积分三选多**。

---

## 二、现状与可复用资产（不重复造轮子）

| 能力 | 现成实现 | 复用方式 |
| --- | --- | --- |
| 管理端页面挂载 | `DataManagement/config/tabs.js` 的 `type: 'page'` + `useDataAdminNavigation.js` 的 module→route 映射 | 新增 `avatar-console` module，照 `hero-console` 写法 |
| 可视化编辑器范式 | `src/views/HeroConsole/index.vue`（2283 行）：预览画布 + 自由裁切弹窗 + offset clamp + 发布 | 交互骨架直接对齐，不另起 UI 语言 |
| 图片上传 | `uploadImageToCloudinary(file, { folder, pendingSource })`（`src/utils/cloudinary-client.js`） | folder 用 `boh-avatar-frames`，pendingSource 用 `avatar-console`（自动进「上传队列」日志） |
| 积分扣减 | `redeem_points_card_cats()`（迁移 2026081508）：`security definer` + `select … for update` + 幂等返回 + 余量校验 + 触发器强制 | 一键照抄这套骨架，改表名与价格来源 |
| 积分流水 | `points_transactions`（含 `balance_after` 原子快照） | 购买写一条 `reason='avatar_frame_purchase'` |
| 限免窗口 | `src/utils/avatar-frame-campaign.js`（今天新建，纯函数） | 直接消费，不写第二套时间判断 |
| 渲染链路 | `profiles.avatar_frame_url`（相对路径）+ `resolveFrameForAuthor()` 按 url 反查 scale | **保持不动**——见第四节的关键决策 |

---

## 三、功能模块划分

```
AvatarFrameConsole（页面壳，/admin/avatar-console）
├── FrameLibrary        框库列表：预览 / 状态 / 排序 / 上下架 / 删除
├── FrameEditor         编辑器（核心）
│   ├── StageCanvas       画布：固定头像 + 可变换素材层 + 参考准星
│   ├── SizePreviewer     多尺寸实时预览（36/42/52/96 + 116px 卡片装填检测）
│   ├── GeometryPanel     几何读数：scale / 内孔占比 / 溢出量 + 一键自动适配
│   └── AlphaResolver     无透明层处理：自动抠白底 / 手选背景色 / 手动擦除
├── FrameMeta           元数据：名称 / 描述 / slug / 排序 / 状态
├── FrameAccess         归属与定价：档位 / 限免窗口 / 积分价（三者可叠加）
└── FramePublish        发布：烘焙导出 → 上传云端 → 写库 → 进审计日志
```

### 3.1 与既有模块的边界

- **不接管 `useAvatarFrame.js` 的运行时逻辑**：它仍是佩戴状态的单源，只是清单来源从「纯硬编码」变成「DB + 内置兜底合并」。
- **不接管积分体系**：只调 RPC，不直接改 `profiles.points`。
- **不接管素材 CDN**：走既有 Cloudinary 通道，不新开存储。

---

## 四、关键架构决策（三个必须拍板的点）

### 决策 1：编辑器摆位 → **烘焙导出**，而不是运行时记 offset

渲染层现在是「方形 contain + 居中 + `scale` 倍」的极简模型（`avatar-frame.css` 只有 `--frame-scale` 一个变量）。
如果改成运行时也认 `offset_x/offset_y`，要动 8 个渲染点 + 全局 CSS + 存量框的兼容判断。

**选择烘焙**：编辑器里拖动缩放的是「原图图层」，点发布时把变换烧进像素，**保证成品图的内孔圆心正好落在画布中心**。
于是渲染层继续只认 `url + scale`，一行不改。

> 代价：重新调整摆位必须重新导出（原图留档在 `source_url`，可随时回编辑器改，不会累积画质损失，因为每次都是从原图重新烘焙）。

### 决策 2：清单存 DB，但**内置清单不删**

新增 `avatar_frames` 表作为清单真相源；`useAvatarFrame` 启动时拉取，与内置的 5 个 free 框**按 id 合并**（内置项可被 DB 同 id 覆盖）。

理由：若 DB 抖动/未登录/离线，全站头像框会集体消失——比"多几个兜底框"严重得多。内置 5 个框同时充当**种子数据**和**降级路径**。

### 决策 3：url 作为稳定标识，**不改 `avatar_frame_url` 的语义**

`profiles.avatar_frame_url` 存的是 url 字符串（迁移 2026091106 定的），而 `resolveFrameForAuthor` 靠 url 反查清单拿 scale。
如果发布时 url 会变，老用户佩戴立刻失效。

**规则**：发布后 **`slug` 与素材 url 永久不可变**。需要换图就覆盖同一路径（Cloudinary 可用固定 public_id 覆盖，或前端加 `?v=N` 版本参数——`stripUrlQuery` 已经处理了这个）。

> 不选「迁移成存 frame_id」：那要改 `profiles` 列 + 两个 RPC 出参 + 全部渲染点 + 存量数据回填，收益只是"url 可变"，不值得。

---

## 五、交互流程

### 5.1 管理员：新建一个框

```
① 点「新建」
     → 选择上传 PNG（支持带 alpha / 不带 alpha，见 5.2）
     → 上传走既有 Cloudinary 通道，落 source_url（原图留档，永不删）

② 进入编辑器
     → 画布中央固定头像圆（不可拖动，这是不变量）
     → 素材以原始比例铺满画布，可拖动 / 滚轮缩放 / 四角手柄缩放
     → 右侧实时读数：scale、内孔占比、各尺寸溢出量
     → 点「自动适配」= 以头像圆为基准求最大内接圆，一键摆到 scale 合理位

③ 多尺寸校验
     → 切 36/42/52/96 四档，每档显示「框层 Npx / 容器 Mpx」
     → 任意档位溢出容器 → 黄条警告 + 给出建议动作（缩小 / 裁掉外挂装饰）

④ 无 alpha 处理（仅当上传的图不带透明通道）
     → 默认「自动抠白底」（复刻今天用的算法：外部白 + 孔洞白透明化，保留主体内部高光）
     → 抠不干净时提供：手选背景色（取色器）/ 容差滑块 / 阈值预览（棋盘底）

⑤ 填元数据
     → 名称（必填，≤12 字）、描述（≤24 字）、slug（自动从名称拼音/手填，唯一校验）

⑥ 设归属（可多选叠加）
     → 档位：free / plus / pro / max / ultra（单选）
     → 限时免费：截止日（可选），到期自动回落上面的档位
     → 积分价：数值（可选，0/空 = 不售卖）

⑦ 发布
     → 烘焙导出 1223×1223 透明 PNG → 压体积 → 上传
     → 写 avatar_frames 行（含 system 算出的 scale）
     → 写 data-admin 变更日志（沿用 useDataAdminChangeLog）
```

### 5.2 三条上传分支的判定

```
读 PNG header / canvas 取 alpha 通道
├─ 有 alpha 且存在全透明像素（>5%）→ 直接进编辑器
├─ 有 alpha 但全图不透明（实际是白底存成 RGBA）→ 提示「检测不到透明区，是否抠白底？」→ 走抠图
└─ 无 alpha（RGB / JPG 改名）→ 自动抠白底 + 强制过一遍棋盘底预览确认
```

判定不靠扩展名，靠**像素事实**（今天就是被「剪贴板 JPG vs 本地 PNG」坑过一次）。

### 5.3 用户侧解锁（三条来源，一个出口）

```
useAvatarFrame.ownedIds = 内置兜底 ∪ 档位推导 ∪ 服务端已购 ∪ 限免窗口
                                   ↑              ↑
                          (订阅 tier)      user_avatar_frames
```

- 积分购买：`purchase_avatar_frame(p_frame_id)` → 扣分 + 写 owned + 流水，**幂等**（重复调用返回 `already_owned`，不再扣费）
- 限免期内：所有人 `owned` 成立，不写表（到期自动收回，是运行时判定，不是删记录）
- 档位归属：不写表，登录后按 tier 推导（与现在一致）

---

## 六、界面布局

### 6.1 整体（左中右三栏，编辑器为主）

```
┌───────────────────────────────────────────────────────────────────────┐
│ 头像框控制台                    [上传 PNG 新建]  [预览用户侧]  [发布]  │
├──────────────┬────────────────────────────────────┬───────────────────┤
│ 框库 (260px) │  画布 (flex)                       │ 属性 (320px)      │
│              │                                    │                   │
│ ▸ 橙猫手绘   │   ┌──────────────────────────┐     │ 名称 [菊花梨    ] │
│   全员        │   │   ╭─ 容器 116px ─╮        │     │ 描述 [暖橙花瓣… ] │
│ ▸ 白绒猫     │   │   │  ╭ 框层 ╮    │        │     │ slug [elf-flower] │
│   Pro·1.4    │   │   │  │ ╭──╮ │    │  ← 素材 │ 归属  ○free ●ultra│
│ ▸ 菊花梨  ✎  │   │   │  │ │头│ │    │    层   │ 限免 [2026-09-25] │
│   Ultra·限免 │   │   │  │ ╰──╯ │    │  (可拖) │ 积分 [  120  ]    │
│ ▸ 奇丽草     │   │   │  ╰──────╯    │        │                   │
│   Ultra·限免 │   │   ╰──────────────╯        │ ── 几何读数 ──     │
│              │   └──────────────────────────┘     │ scale   2.08      │
│ [草稿箱 2]   │   头像固定 · 素材可拖 · 滚轮缩放   │ 内孔占比 48%      │
│ [已下架 1]   │                                    │ 卡片余量 +4px ✓   │
│              │   尺寸预览  36 42 [52] 96          │                   │
│              │   ┌──┐┌──┐┌──┐┌────┐               │ ⚠ 96px 下溢出 63px│
│              │   │  ││  ││▣ ││    │               │   → 建议缩到 1.92 │
│              │   └──┘└──┘└──┘└────┘               │ [一键自动适配]     │
└──────────────┴────────────────────────────────────┴───────────────────┘
```

### 6.2 编辑器画布的三层叠加（这是本功能的核心视觉）

| 层 | 内容 | 是否可交互 | 作用 |
| --- | --- | --- | --- |
| 底层参考 | 头像圆（灰蓝占位或真实头像）+ 十字准星 | ❌ 不可拖 | **不变量**：头像位置永远固定，用户看到的就是佩戴时的相对关系 |
| 中层素材 | 上传的 PNG 图层 | ✅ 拖动 / 滚轮 / 四角手柄 | 摆位对象 |
| 顶层标注 | 容器边界框（红/绿）+ 内孔参考圆（虚线） | ❌ | 实时判"会不会溢出容器""头像会不会被压" |

交互细节：
- 拖动 = `pointerdown/move/up`（与 HeroConsole 同款），指针捕获，松手才写历史（支持 `⌘Z` 撤销）
- 缩放 = 滚轮（以指针为锚点）+ 四角手柄（保持比例）；`Shift + 滚轮` 微调 0.01
- `空格拖拽` = 平移视图（素材比画布大时的查看手段）
- 对齐吸附：素材几何中心接近画布中心时吸附（±2px），并有轻微"咔"的视觉反馈

### 6.3 多尺寸预览为什么必须做

今天实测的教训：**同一个框在 36/42/52/96 下是否溢出，结论完全不同**。
116px 卡片是最紧约束，而 hero 96px 放大到 200px 框层反而宽松。编辑器若只给一个尺寸，运营会把框做坏。

每档显示：`框层 Npx · 容器 Mpx · 余量 ±Kpx`，余量为负时红字 + 一键按最紧档回算建议 scale。

---

## 七、关键参数

### 7.1 素材与几何

| 参数 | 取值 | 依据 |
| --- | --- | --- |
| 成品边长 | **1223 × 1223** | 与存量 5 个框完全一致，不留两套规格 |
| 成品格式 | PNG（RGBA 或 256 色 P 模式） | P 模式可压到 100~200KB，200px 渲染下与原图最大通道差 ~16/255 |
| 体积上限 | **300KB**（超了自动量化，仍超则拒绝并提示） | 存量最大 384KB；本次量化后 180/102KB |
| scale 取值 | `画布边长 / 头像直径`，保留 2 位小数 | 与现有清单口径一致 |
| scale 合理区间 | **1.20 ~ 2.20** | 下限=框几乎贴不住头像；上限=116px 卡片装不下（52×2.2=114.4） |
| 内孔占比提醒线 | 低于 **45%** 提示（框层会超 116px） | 52/0.45 = 115.6 |
| 上传原图尺寸 | ≥ 512 且 ≤ 4096；比例任意（编辑器里再摆位） | 低于 512 放大后糊；高于 4096 浏览器画布有上限风险 |
| 抠图容差默认 | 白底 min-channel ≥ 244 | 今天的实测值 |

### 7.2 元数据与归属

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `slug` | `^[a-z0-9-]{3,32}$`，唯一，**发布后不可改** | 承载 url 稳定性 |
| `name` | 1~12 字 | 卡片宽度有限，超了要省略号 |
| `desc` | 0~24 字 | 预览条一行 |
| `tier` | free/plus/pro/max/ultra | 限免到期后回落到的档位 |
| `points_price` | 0 或 10~99999 整数；0 = 不售卖 | 服务端读，前端只展示 |
| `free_until` | date 或 null；须晚于今天 | 含当日全天，次日 00:00 回落 tier |
| `sort_order` | 整数，越小越前 | 列表排序 |
| `status` | draft / published / archived | 只有 published 进用户端 |

### 7.3 归属叠加的优先级（**必须写死，否则出现"买了还被锁"**）

```
isOwned(frame) =
    frame.status === 'published'
 && ( frame.tier === 'free'
   || TIER_RANK[me] >= TIER_RANK[frame.tier]
   || (frame.free_until && now <= endOf(frame.free_until))     ← 限免
   || ownedSet.has(frame.id) )                                  ← 积分购买过
```

**关键**：积分购买是**永久**的，限免到期不清除已购记录。用户花积分买的框，即使之后档位降级也保留（写进产品规则，避免客诉）。

---

## 八、边界处理（逐条给"怎么判 / 怎么拦 / 用户看到什么"）

### 8.1 上传阶段

| 场景 | 判定 | 处置 |
| --- | --- | --- |
| 文件名是 .png 但实际无 alpha | 读像素：不存在 alpha<250 的像素 | 不报错，走「自动抠白底」分支并**弹出棋盘底预览要求确认** |
| 抠图把主体抠出洞（水彩内部白色高光连通到背景） | 抠完统计"内部透明连通域数量" > 阈值 | 提示"检测到 N 处内部被误透明"，提供容差滑块 + 一键回退到"不抠底·直接叠加" |
| 图超大（>4096 或 >8MB） | 读 header | 前端先等比压到 2048 再上传，提示"已自动压缩，原图仍保留" |
| 图过小（<512） | 读 header | 允许但警告"放大到推荐尺寸后会模糊" |
| 非图片文件 | MIME + 解码失败 | 拒绝 + 明确文案（不说"上传失败"这种废话） |
| 上传中断/超时 | Cloudinary 通道已有 pending 队列 | 复用既有重试；失败时保留本地 File 对象，按钮变「重试上传」 |

### 8.2 编辑阶段

| 场景 | 判定 | 处置 |
| --- | --- | --- |
| 素材被拖出画布完全不可见 | 素材 bbox 与画布无交集 | 禁止松手（拖动时实时 clamp，保证至少 20% 面积在画布内） |
| 缩放到内孔小于头像（头像被压） | `头像圆直径 > 当前内孔内接圆` | 黄条：「头像会被框压住 N%」+ 「一键自动适配」 |
| 缩放到框层超容器 | 任一预览档 `scale × 头像 > 容器宽` | 红条 + 给出建议 scale（按最紧档回算） |
| 素材比例极端（长条） | 宽高比 > 3 或 < 1/3 | 不拦，但默认改用"按最长边适配"，避免初始摆放就跑出画布 |
| 浏览器画布尺寸上限 | 导出目标 1223 固定，安全 | 无需特殊处理（若未来提到 4096+ 需分块） |
| 撤销/重做 | 每次松手写一条历史（含 transform 快照） | `⌘Z` / `⇧⌘Z`，上限 30 步，避免内存膨胀 |

### 8.3 元数据阶段

| 场景 | 判定 | 处置 |
| --- | --- | --- |
| slug 重复 | 前端即时查 + 服务端唯一索引兜底 | 提示并建议 `-2` 后缀 |
| slug 用了中文/大写 | 正则 | 自动转写并提示 |
| 名称含 emoji / 特殊字符 | 长度按**字素簇**算 | 避免"👨👩👧👦"被算成 7 个字 |
| 限免日期已过 | `free_until < today` | 拒绝保存（"限免已过期，请选未来日期或留空"） |
| 限免与档位矛盾（档位 free + 限免） | `tier === 'free' && free_until` | 允许但提示"档位已是全员可戴，限免无意义" |
| 积分价 + 档位同时设 | 两者可叠加 | 提示实际语义：「Ultra 直接可用；非 Ultra 也能花 120 积分买断」 |
| 积分价设为 0 与非 0 切换 | — | 0 保存为 `null`（不售卖），不是"免费" |

### 8.4 发布阶段

| 场景 | 判定 | 处置 |
| --- | --- | --- |
| 编辑期间该框被他人改动 | 乐观锁：保存时比对 `updated_at` | 拒绝并提示"该框已被修改，请刷新后重试" |
| 素材 URL 变更 | 发布后 slug/url 锁定 | 覆盖同名文件；**禁止改名**（否则存量佩戴失效） |
| 有人正佩戴时被下架/删除 | 删除前查 `profiles where avatar_frame_url = 该框` | 有佩戴者时**禁止物理删除**，只能 `archived`（佩戴者自动回落「无框」，与限免到期同一条出口） |
| 烘焙失败（canvas 污染/内存） | `toBlob` 返回 null 或抛错 | 不清空编辑器状态，提示重试；草稿存 localStorage（`boh-avatar-frame-draft`） |
| 发布成功但前端清单缓存旧 | — | 发布后调既有 `invalidateProductsCache` 同款模式：写 `boh-avatar-frames-updated-at` 时间戳，前端 5 分钟 TTL 失效 |

### 8.5 用户侧解锁阶段

| 场景 | 判定 | 处置 |
| --- | --- | --- |
| 并发购买（双击/多端） | RPC 内 `select … for update` 锁 profiles 行 | 第二笔进入时余额已变，正确拒绝或幂等返回 |
| 积分不足 | 服务端算，返回 `INSUFFICIENT_POINTS` + 差额 | 前端提示"还差 N 积分"+ 去充值/签到入口 |
| 重复购买 | `user_avatar_frames` 主键冲突 | 幂等：返回 `already_owned: true`，**不重复扣分** |
| 前端篡改 frame_id 买便宜框 | RPC 只认 `p_frame_id`，价格从 `avatar_frames.points_price` 读 | 前端传的任何价格参数一律忽略 |
| 限免期内购买 | 限免期间价格仍显示但按钮文案改「永久解锁（限免结束后仍可用）」 | 避免用户以为"免费的为什么要花钱"——**这是最容易挨骂的点** |
| 限免到期且未购买且档位不足 | 运行时判定 | 自动落回「无框」（今天已验证的出口） |
| 佩戴的框被 admin 下架 | 前端 `effectiveFrame` 校验不通过 | 回落「无框」 |
| 老用户 url 反查不到（素材被误删） | `resolveFrameForAuthor` 找不到 | 现有逻辑已兜底 `scale: 1.24` 并照常渲染 → 产品上要求素材**永不物理删除** |

### 8.6 权限与安全

| 点 | 做法 |
| --- | --- |
| 控制台入口 | 复用 `DataManagement` 的 RBAC（`config/rbac.js`），只对 admin 可见 |
| 写 `avatar_frames` | 仅 `service_role`（前端经 Edge Function / 管理端 RPC），不给 authenticated 直写 |
| 用户侧读清单 | `published` 行对 anon/authenticated 只读；`draft` 仅管理员可见 |
| 积分扣减 | 只有 `security definer` RPC 能改，`profiles.points` 不给前端直写（沿用现状） |
| 审计 | 每次发布/上下架/改价写 `data_admin_change_logs` |

---

## 九、数据层

### 9.1 表

```sql
-- 清单真相源（前端内置 5 框作兜底与种子）
create table public.avatar_frames (
  id             text primary key,             -- slug，发布后不可变
  name           text not null,
  description    text not null default '',
  source_url     text,                         -- 原图留档（可重新编辑摆位）
  url            text not null,                -- 成品图 URL，发布后不可变
  scale          numeric(4,2) not null check (scale between 1.0 and 3.0),
  tier           text not null default 'free'
                 check (tier in ('free','plus','pro','max','ultra','limit')),
  free_until     date,
  points_price   integer check (points_price is null or points_price >= 10),
  sort_order     integer not null default 100,
  status         text not null default 'draft'
                 check (status in ('draft','published','archived')),
  ring           text not null default '',      -- 素材缺失时的兜底色环
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 积分解锁台账（永久，限免到期不清除）
create table public.user_avatar_frames (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  frame_id   text not null references public.avatar_frames(id) on delete restrict,
  source     text not null default 'points',   -- points / grant / event
  cost_points integer not null default 0,
  acquired_at timestamptz not null default now(),
  primary key (user_id, frame_id)
);
```

### 9.2 RPC（照抄 `redeem_points_card_cats` 骨架）

```sql
create or replace function public.purchase_avatar_frame(p_frame_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_price integer; v_points integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED'); end if;

  select points_price into v_price from public.avatar_frames
   where id = p_frame_id and status = 'published';
  if v_price is null then            -- 不存在 / 未上架 / 不售卖
    return jsonb_build_object('ok', false, 'message', 'NOT_PURCHASABLE');
  end if;

  if exists (select 1 from public.user_avatar_frames
              where user_id = v_uid and frame_id = p_frame_id) then
    return jsonb_build_object('ok', true, 'already_owned', true, 'points_deducted', 0);
  end if;

  select coalesce(points, 0) into v_points from public.profiles where id = v_uid for update;
  if v_points < v_price then
    return jsonb_build_object('ok', false, 'message', 'INSUFFICIENT_POINTS',
                              'required_points', v_price, 'current_points', v_points);
  end if;

  update public.profiles set points = points - v_price where id = v_uid;
  insert into public.user_avatar_frames(user_id, frame_id, source, cost_points)
       values (v_uid, p_frame_id, 'points', v_price);
  insert into public.points_transactions(user_id, amount, reason, balance_after)
       values (v_uid, -v_price, 'avatar_frame_purchase', v_points - v_price);

  return jsonb_build_object('ok', true, 'points_deducted', v_price, 'current_points', v_points - v_price);
end $$;
```

（另需 `list_my_avatar_frames()` 拉已购集合；两个函数都 `grant execute to authenticated`）

---

## 十、分期落地

| 期 | 范围 | 产出 | 风险 |
| --- | --- | --- | --- |
| **P0** | 上传 + 摆位 + 自动算 scale + 烘焙导出 + 写 DB，清单前端合并 DB | 运营能自助上架「全员框」 | 低。渲染层零改动，最坏情况是清单拉取失败→内置兜底 |
| **P1** | 归属（档位）+ 限免 + 多尺寸预览 + 草稿箱 | 覆盖今天的菊花梨/奇丽草场景 | 低 |
| **P2** | 积分解锁 + 购买 RPC + 用户侧购买入口 + 已购清单 | 商业化闭环 | 中。涉及扣分，必须先跑通并发/幂等/余额不足三条反证 |
| **P3** | 无 alpha 抠图高级选项（容差/取色/擦除）、素材重编辑、批量导入 | 体验打磨 | 低 |

---

## 十一、验收方式

沿用项目既有纪律（探针 + 反证）：

1. **编辑器几何探针**：给定固定 transform，断言导出的 scale 与内孔占比等于手算值（浮点容差 0.02）
2. **边界探针**：逐条跑第 8 节的拦截项，断言 UI 出现对应警告文案、且发布按钮在红条状态下**不可点**
3. **RPC 反证**：`purchase_avatar_frame` 的并发双调用、余额不足、重复购买三条；
   反证方式 = 去掉 `for update` 与幂等判断，确认并发用例变红
4. **渲染回归**：新框发布后跑既有 `probe-avatar-frame-elf.mjs` 的同类断言（框层宽度 = 头像 × scale）
5. **降级验证**：断网/DB 不可达时，内置 5 框必须照常渲染（这是决策 2 的存在意义）

---

## 十二、不做什么（防止范围蔓延）

- ❌ 不做在线绘图（画笔/图层混合），只做**摆位与抠底**
- ❌ 不做用户自定义上传头像框（UGC 审核成本远超收益）
- ❌ 不改 `avatar_frame_url` 的存储语义，不做 frame_id 迁移
- ❌ 不做素材的 CDN 变换（Cloudinary 已够用，前端只存最终 url）
- ❌ 不做实时多人协同编辑（乐观锁足够）
