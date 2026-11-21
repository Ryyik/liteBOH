# 043 · 主题适配现状与全站化计划（重点：方块小窝 / 八周年 MC）

- 状态：**A 方案已定；阶段 0–5 完成（阶段 5 为观察档；影集阅读页固定纸面）**（2026-11-20）
- 触发：用户「对各个主题对当前的适配程度进行查看，主要是八周年限定主题和方块小窝主题的适配性」
- 范围：阶段 1 已完成 token 层 + 首屏骨架 + 门禁；本轮未改任何页面级专属样式
- 关联：`src/utils/theme-manager.js`、`src/styles/common/tokens.css`、`src/views/Forum/styles/anniversary.css`

---

## 0. 一句话结论

两套自定义主题都是「页面级皮肤」而非「全站主题」：`方块小窝` 主要落在论坛/帖子详情/用户空间外壳，
`八周年 MC 限定` 主要落在论坛/帖子详情；其余页面（首页、资讯、商城、AI、影集、消息、云相册、
个人主页、管理后台）基本零适配，切换后视觉上约等于浅色模式。

---

## 1. 主题体系现状

### 1.1 五档偏好与真源

`VALID_THEMES` 只有一处定义：`src/utils/theme-manager.js` 第 10 行。

```
['light', 'dark', 'system', 'home-cat', 'anniversary-mc']
```

- `light`：`tokens.css` 的 `:root` 变量。
- `dark`：token 层覆写（`tokens.css` 的 `[data-theme="dark"]`）+ 8 个按需加载文件
  （`dark-mode / navbar-dark / forum-dark / post-detail-dark / user-space-dark /
  user-center-dark / bohai-dark / messages-dark`，见 `src/utils/theme-css-loader.js`）。
- `system`：解析为 light/dark，不引入新样式。
- `home-cat` / `anniversary-mc`：**没有 token 层**，全部是页面级选择器覆盖。

### 1.2 量级对比

| 主题 | 规则量 | 载体 | token 化 | 门禁 |
| --- | --- | --- | --- | --- |
| dark | 约 1750 处匹配 | 8 个专用文件 + 各页覆盖 | 是 | `check:dark-tokens:strict` 棘轮 |
| home-cat | 73 处 / 5 文件 | 全部页面级选择器 | 否 | 无 |
| anniversary-mc | 103 处 | 论坛 535 行（77 选择器）+ 详情 + 头像框 | 否 | 无 |

判据（2026-11-20 实测）：

```bash
grep -rc 'data-theme="home-cat"' src --include='*.css'
grep -rc 'data-anniversary-skin' src --include='*.css'
grep -rn "data-theme=\"dark\"\|data-theme='dark'" src --include='*.css' | wc -l
```

> 口径说明：上面是「grep 命中行数」，不是严格选择器数；用于量级对比，不用于精确断言。

### 1.3 现有落地位置

**方块小窝（home-cat）**

| 文件 | 规则 | 覆盖内容 |
| --- | --- | --- |
| `src/views/Forum/styles/drawers-skeletons.css`（291 起） | 42 | 论坛底色、header、卡片、输入框、筛选、空态、确认弹窗 |
| `src/views/Forum/styles/feed.css`（221 起） | 8 | 帖子卡悬停/新帖时的猫咪装饰 |
| `src/views/PostDetail/style.scoped.css`（2113 起） | 11 | 详情页底色、主栏、点赞、确认弹窗 |
| `src/views/user-center/UserSpace/styles/responsive-integrations.css`（831 起） | 8 | 用户空间背景 + 弹窗/主题卡/个人帖卡等 5 类 |
| `src/views/Profile/style.scoped.css`（2499 起） | 4 | **仅**公开主页帖子卡悬停猫 |
| `src/components/UnifiedNavbar/index.vue`（307 起） | — | **仅**手机端汉堡菜单里一只猫 |

**八周年 MC（anniversary-mc）**

| 文件 | 规则 | 覆盖内容 |
| --- | --- | --- |
| `src/views/Forum/styles/anniversary.css` | 535 行 / 77 | 完整 MC 材质：羊皮纸面板、苔藓边、方块角、像素头像、木质按钮、世界背景图 |
| `src/views/PostDetail/style.scoped.css`（88 起） | 13 | 主栏、标题、按钮、动作条 |
| `src/styles/common/avatar-frame.css`（50） | 1 | 头像框描边 |
| `src/views/user-center/UserSpace/styles/responsive-integrations.css`（825） | 1 | 只设 `--bg` / `--accent` |

启用开关是属性而非主题名：
- 论坛：`ForumMain.vue` 根元素 `:data-anniversary-skin="isAnniversaryMcTheme ? 'active' : 'off'"`
- 详情：`PostDetailMain.vue` 同款
- 论坛背景图：`ForumMain.vue` 137 行 `blockschool.webp`，交叠观察后写 `--forum-anniversary-image`

---

## 2. 页面覆盖矩阵

图例：✓ 有完整适配；△ 部分；✗ 无（渲染为默认浅色）。

| 页面 | dark | 方块小窝 | 八周年 MC |
| --- | --- | --- | --- |
| 首页 `/` | 部分（子 Hero） | ✗ | ✗ |
| 智能概览 `/overview` | ✓ | ✗ | ✗ |
| 资讯 `/newsroom`、`/news/:id` | ✓ | ✗ | ✗ |
| 影集 `/albums` | ✗ | ✗ | ✗ |
| 论坛 `/forum`（含用户空间嵌入模式） | ✓ | ✓ | ✓ |
| 帖子详情 `/forum/post/:id` | ✓ | △ | △ |
| 个人主页 `/profile/:username` | ✓ | ✗（仅悬停猫） | ✗ |
| 用户空间 `/user-space` | ✓ | △ | △ |
| ├ 消息中心 | ✓（83 处） | ✗ | ✗ |
| ├ 云相册 Cloud+ | 部分（9 处） | ✗ | ✗ |
| └ 设置各三级页 | ✓ | ✗（仅主题选项卡） | ✗ |
| 商城 `/shop` | 部分 | ✗ | ✗ |
| BOH AI `/ai-chat` | ✓ | ✗ | ✗ |
| 八周年活动页 `/boh-8-years-*`、`/anniversary-cafe` | 部分 | ✗ | ✗（本身是活动页样式） |
| 关于 / 历史 / 下载 / 加入 | 部分 | ✗ | ✗ |
| 全局导航栏 | ✓（50 处） | △（仅手机菜单猫） | ✗ |
| 管理后台 | ✓ | ✗ | ✗ |

判据（2026-11-20 实测）：

```bash
# 逐目录检查两个自定义主题是否有任何引用；0 即零适配
for d in Home Newsroom Shop SmartOverview CommunityAlbums BOHAI \
         BOH8YearsEvent BOH8YearsJourney AnniversaryCafe Download AboutUs History; do
  echo -n "$d: "; grep -rc 'home-cat\|anniversary-mc' "src/views/$d" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}'
done
```

---

## 3. 漂移根因（四条）

1. **无 token 层**
   两套主题直接写 `.forum-page[data-theme=…]` 这类页面选择器，新页面不会继承。
   对比 dark 靠 `--liquid-*` / `--boh-page-bg` 自动铺满全站。

2. **无门禁**
   `tests/unit/theme-manager.test.js` 只测状态机（setTheme / 持久化 / 多实例），
   没有任何「页面 × 主题」的视觉覆盖契约；dark 则有 `check:dark-tokens:strict` 棘轮。

3. **新功能只写了 flat/glass 两个分支**
   典型：2026-10-29 签到重构的 `src/views/Forum/components/CheckinRewardStage.vue`，
   只有暗色注释，没有 home-cat / anniversary 分支；论坛里的 `checkin-cycle-panel`、
   `checkin-week-card`、`weekly-checkin-trigger` 也只有 `[data-ui-style]` 规则。
   发帖图片编辑器（`src/views/Forum/components/ImageEditorFilmFx.vue` 等）同理。

4. **容器挂了、样式没跟上**
   `theme-manager.js` 给 11 个容器写 `data-theme`：
   `.forum-page` / `.post-detail-page` / `.user-space-page` / `.account-security-page` /
   `.address-page` / `.subscription-page` / `.notification-settings-page` / `.shared-memory-page` /
   `#unified-nav-container` / `.bohai-page` / `.x-notifications-container`。
   其中只有前 3 个有自定义主题 CSS，其余 8 个是空挂。

---

## 4. 已知风险（动手前必读）

1. **`--liquid-*` 是 20+ 个消费者的共享 token**（`.liquid-glass` 系、顶栏、Cloud+、Island 家族）。
   在 token 层加主题覆写会「一改全变」，必须做视觉回归：
   `npm run compare:builds` + `docs/重构验证协议.md` 的 L3–L6。
2. **首屏骨架是硬编码的**
   `index.html` 127–137 行只写了 light/dark 两套底色；
   `scripts/check-first-paint.mjs` 会断言骨架色 === token 值。
   加自定义主题底色必须同步 `index.html` + 该脚本，否则门禁红或出现白闪。
3. **`public/boot.js` 的 VALID_THEMES 是第二份白名单**
   （必须早于模块执行，故刻意重复），由 `check-first-paint` 守住与 `theme-manager.js` 一致。
4. **`.liquid-glass` 在 ≤768px 会被强制成近实白**（见 AGENTS.md 记录），
   移动端自定义主题可能被压回默认观感，需要实测。
5. **`contain: paint` 会裁后代**（`.liquid-glass` 基础类；左栏靠 `contain: none` 例外）。
   主题换肤若动材质要复查。
6. **论坛内规则顺序决定胜负**：`drawers-skeletons.css` 在前、`anniversary.css` 在后
   （`ForumMain.vue` 4568–4577 行）；`home-cat` 块位于 flat/glass 之后。token 化后要重新核顺序。
7. **自定义主题没有暗色变体**（设计上互斥）。
   `themeManager.applyTheme` 会移除 `.dark` 类，所以不会串档，但未适配的页面就是浅色。

---

## 5. 计划（按阶段）

### 阶段 0 · 定范围（阻塞项）

- **A. 全站主题化**：补齐主页面 + 建 token + 加门禁。
- **B. 收窄为局部彩蛋**：保留论坛/详情，在主题选择页标注「仅方块社区生效」，
  并修掉个人主页「只有悬停猫、其余不变」的孤岛。

> 未定之前不要进入阶段 1：A 和 B 的改动量差一个数量级。

### 阶段 1 · 建 token 层（A 方案，收益最大）

改动：
- `src/styles/common/tokens.css`：新增两个块
  `[data-theme="home-cat"]` / `[data-theme="anniversary-mc"]`，覆盖
  `--boh-page-bg`、`--liquid-bg` / `-strong` / `-subtle` / `-nested` / `-overlay`、
  `--liquid-border*`、`--liquid-highlight*`、`--liquid-shadow*`、`--liquid-text-*`、
  `--refract-tint-rgb`。
- `index.html` 骨架：补两套主题的页面底色（与 token 值一致）。
- `scripts/check-first-paint.mjs`：同步白名单与期望色。

效果：body 底色、全站玻璃面、玻璃上的文字色立即跟随主题；
未写专属规则的页面也不再是纯白。

自证：
```bash
node scripts/check-first-paint.mjs
npm run verify:fast
```
+ 人工核对 3 个页面（论坛 / 个人主页 / 消息）。

#### 阶段 1 落地记录（2026-11-20）

已改文件：

| 文件 | 改动 |
| --- | --- |
| `src/styles/common/tokens.css` | 新增 `:root[data-theme="home-cat"]` / `:root[data-theme="anniversary-mc"]` 两块 token：页面底、登录岛底、`--liquid-*` 全组、`--refract-tint-rgb`、`--boh-bg-*` / `--boh-text-*` / 边框 / 阴影 / `--apple-*` 语义映射 |
| `index.html` | 骨架补两套主题的页面底、body 兜底、加载点、文案色、重试按钮色 |
| `src/style.css` | 自定义主题下 `body` 继承 `--liquid-text-primary`（原全局 `color:#000` 不会自动跟随） |
| `scripts/check-first-paint.mjs` | 新增 8 组自定义主题骨架对账断言（底色 / body 兜底 / 文案 / 重试按钮 × 2 主题） |

关键选择：token 块选择器写成 `:root[data-theme="…"]`，而不是裸 `[data-theme="…"]`。
原因：`dark-mode.css` 懒加载后仍是文档里的活样式，里面有 `:root` 亮色默认值；
用户从暗色切自定义主题时，裸选择器同特异性且被后加载的 `:root` 覆盖，页面会静默掉回亮色。

自证（2026-11-20 实测）：

```bash
npm run check:first-paint          # 通过；门禁断言 7 → 15 组
npm run check:dark-tokens:strict   # 通过：2414 / 基线 2430
npm run check:important-budget     # 通过：606 / 基线 606
npm run verify:fast                # 通过（同时修正 AGENTS 的 layering 133 → 实测 132）
npm run check:gates-self-test      # 通过：19/19 已覆盖门禁均会红
```

真实浏览器核对（Playwright + Chrome，dev server）：3 主题 × 资讯/论坛 + 运行时切换 +
暗色切自定义，共 54 条断言全绿；方块小窝实测 `body #fffdf8` / 玻璃 `rgba(255,255,255,.78)`，
八周年实测 `body #e9eee3` / 玻璃 `rgba(251,247,233,.96)`，均无 pageerror。
截图：`debug-screenshots/theme-check-{home-cat,anniversary-mc}-{newsroom,forum}.png`。

未覆盖（不得写成已验证）：

- 个人主页、消息中心、Cloud+、管理后台的**视觉**仍未逐页核对；阶段 1 只保证 token 生效，
  这些页面的硬编码白卡仍归阶段 2/3。
- ≤768px 下 `.liquid-glass` 被强制近实白时，两套自定义主题的实际观感仍未实测。

### 阶段 2 · 三个最割裂的壳

- `src/components/UnifiedNavbar/style.scoped.css`：
  两套主题的 surface 底、logo 文字、菜单 hover/active、岛底。
- `src/views/Home/style.global.css`（+ 必要的子组件）：
  页面底与主内容卡片，优先复用阶段 1 的 token。
- `src/views/Profile/style.scoped.css`：
  补背景、卡片、空态；现有 4 条只有悬停猫。

完成后，`论坛 → 个人主页 → 全局导航` 的跳转不再「掉回白底」。

#### 阶段 2 落地记录（2026-11-20）

实测结论（判据：Playwright + Chrome，1440×900，dev server，读 computed style）：

- **全局导航栏**：`.unified-nav-surface` 的底色/描边已经直接读 `--liquid-bg` / `--liquid-border`；
  两套自定义主题下实测分别为 `rgba(255,255,255,.78)` / `rgba(251,247,233,.96)`，
  **无需新增页面级规则**（加规则反而会变成第二份材质真源）。
- **首页**：`.home` 背景读 `--boh-page-bg`，论坛卡片读 `--liquid-*` / `--boh-bg-*`；
  实测 home-cat `#fffdf8`、anniversary `#e9eee3`，卡片同步变色，**无需新增页面级规则**。
- **个人主页**：真缺口在 `Profile/style.scoped.css` 的页面级变量体系（`--bg/--surface/--text-*`）。
  已新增两个主题块，并补一条 `.profile-post-card` 的硬编码白覆盖。
  实测：home-cat `profile-page #fffdf8`、`surface #fffdf8`、作品卡 `#fff`、文字 `#2f2f2f`；
  anniversary `profile-page #e9eee3`、`surface #fbf7e9`、作品卡 `#fffdf4`、文字 `#292923`。
  截图：`debug-screenshots/theme-stage2-{home-cat,anniversary-mc}-profile.png`。

门禁（2026-11-20）：

```bash
npm run check:dark-tokens:strict   # 通过：2414 / 基线 2430
npm run check:important-budget     # 通过：606 / 基线 606
npm run verify:fast                # 通过
```

仍未验证：个人主页的折叠/空态/编辑态、移动端 ≤768px 的玻璃观感；阶段 3 的消息中心与 Cloud+ 仍未逐页核对。

### 阶段 3 · 用户空间内部

- `src/views/user-center/Messages/style.scoped.css`：
  83 条全是 dark，按同一结构补一组自定义主题色（列表、详情、选择模式动作条）。
- `src/views/user-center/Cloud+/style.scoped.css`：同样是 dark 体系。
- 设置各面板（`settings-glass.css` / `gs-*`）：优先靠 token，只补硬编码白卡。

#### 阶段 3 落地记录（2026-11-20）

- **消息中心**（`src/views/user-center/Messages/style.scoped.css`）：
  列表/详情/动作条主体已读 `--liquid-*`，没有复制整套 dark 规则；只补了
  根底色、空态图标/标题/说明、刷新按钮、全选按钮、选中行、未读行/圆点/日期这一组定向映射。
- **Cloud+**（`src/views/user-center/Cloud+/style.scoped.css`）：
  沿用暗色块「只重映射 `--apple-*`、不写组件级覆盖」的结构，新增两主题共享块，
  值全部指向阶段 1 的 `--boh-*` / `--liquid-*`，没有新增裸色值。
  ⚠️ **Cloud+ 真路由是 `/user-space/note`**；`/user-space/albums` 是「我的摄影集」，别混。
- **设置页**（`src/views/user-center/UserSpace/styles/settings-glass.css`）：
  卡片/行/描边已走 token，只补独立设置路由的硬编码灰底；用 `:not(.is-inline)` 保护
  设置右栏内嵌形态，避免把 `.account-security-page.is-inline` 的透明底涂成整块主题底。

实测（Playwright + Chrome，1440×900；消息页用伪造会话 + `notifications` mock）：

| 页面 | home-cat | anniversary-mc |
| --- | --- | --- |
| 消息根底 | `#fffdf8` | `#e9eee3` |
| 消息列表 | `rgba(255,255,255,.78)` | `rgba(251,247,233,.96)` |
| 消息强调 | `#2f2f2f` | `#5f7d49` |
| Cloud+ 页底 | `#fffdf8` | `#e9eee3` |
| Cloud+ 强调 | `#2f2f2f` | `#5f7d49` |
| 独立设置页底 | `#fffdf8` | `#e9eee3` |
| 内嵌账户安全底 | transparent | transparent |

截图：`debug-screenshots/theme-stage3-{home-cat,anniversary-mc}-{messages,cloud,settings}.png`。

门禁（2026-11-20）：`check:liquid-glass`、`check:dark-tokens:strict`、`check:important-budget`、
`verify:fast` 全通过。

仍未验证：消息选择模式/归档底条、Cloud+ 设置/分享子页、摄影集页面（`/user-space/albums`，
属阶段 4）；≤768px 的玻璃观感。

### 阶段 4 · 新功能补分支

- `CheckinRewardStage.vue`（3D 签到舞台）：两套主题的卡面、边框、文案色。
- 发帖图片编辑器：若判定为全屏深色控件，则明确「不补」，并在本文件记录理由。
- 影集 / 云相册的格子与详情。

#### 阶段 4 落地记录（2026-11-20）

已补：

- `src/views/PhotoAlbums/index.vue`：根上新增 `--surface / --surface-primary / --text-* / --stroke / --brand`
  到站点 token 的映射。实测 home-cat 页底 `#fffdf8`、品牌色 `#2f2f2f`、主按钮 `rgb(47,47,47)`；
  anniversary 页底 `#e9eee3`、品牌色 `#5f7d49`、主按钮 `rgb(95,125,73)`。
- `src/views/PhotoAlbumEditor/index.vue`：补了同一套根变量映射（工具栏/表单/主按钮的消费点）；
  **未做浏览器逐项视觉核对**，交付说明里按“待确认”处理，不写成已验证。
- `src/views/Newsroom/style.scoped.css`：覆盖盘点抓出的零钩子页；根变量接
  `--boh-text-* / --boh-border-primary / --boh-brand-blue`，页底接 `--boh-page-bg`，
  加载更多按钮接 `--brand`。资讯卡片原本已走 `--glass-card` 的 `--liquid-*`。

明确不补（均已核对理由）：

- `CheckinRewardStage.vue`：全屏深色遮罩 + 白字是刻意的可读性设计（源码注释实测约 7:1）；
  卡面本体是用户的积分卡，不随站点主题换色。强行改成浅底会破坏对比度。
- `ImageEditModal.vue`：主卡片已经读 `--liquid-bg*`，会跟随主题；剩余白色是裁切框/贴纸手柄等
  图像操作控件，改成主题色会降低在照片上的可见性，故不补。
- `PhotoAlbumReader/index.vue`：阅读页的设计口径就是「纸面就是视口」的固定白纸 + 宋体，
  属于内容阅读材质，不随站点主题翻转。

截图：`debug-screenshots/theme-stage4-{home-cat,anniversary-mc}-photoalbums.png`。

### 阶段 5 · 防漂移

- 新增 `scripts/check-theme-coverage.mjs`：
  页面根类名清单 × 主题选择器，输出未覆盖页面；先 observe，稳定后 strict 入 verify。
- 新增 `scripts/probes/probe-theme-adaptation.mjs`：
  2 主题 × 4 页面，断言 body 底色与关键卡片背景 ≠ 默认白。
- 可选二期：把 `drawers-skeletons.css` 里 42 条 `!important` 迁移到 token，
  独立提交、便于回滚。

#### 阶段 5 落地记录（2026-11-20）

- `scripts/check-theme-coverage.mjs`：10 个页面根 × 主题选择器 / token 钩子盘点。
  当前结果 **专属 6 / token 4 / 无钩子 0 / 缺文件 0**。
  `--strict` 可把「无钩子」判红；**暂不挂进 verify**（观察档，避免把“有 token”误当“视觉全适配”）。
  入口：`npm run check:theme-coverage`。
- `scripts/probes/probe-theme-adaptation.mjs`：2 主题 × 4 公开页（首页/论坛/资讯/商城），
  54 条断言全绿（body 底、`--boh-page-bg`、`--liquid-bg`、玻璃面 computed、页面根、零 pageerror）。
  入口：`npm run probe:theme-adaptation`。已登记 `docs/PROBES.md`。
- 未做（保留为二期）：`drawers-skeletons.css` 的 42 条 `!important` 迁移；
  coverage 的 strict 入 verify；登录态页面（消息/Cloud+/个人主页）纳入探针。

---

## 6. 验收标准与自证命令

验收：
1. 每个引入主题的页面：页根底色 = 主题底色，主要卡片表面 = 主题表面色。
2. 正文文字对比度 ≥ 4.5:1。
3. 不新增 `!important`、不抬 `check:important-budget` 基线。
4. 未验证的部分在交付说明里写「待确认」，不许写成「已验证」。

自证：
```bash
npm run verify            # 主门禁
node scripts/check-first-paint.mjs
npm run check:important-budget
npm run check:dark-tokens:strict
npm run compare:builds -- /tmp/dist-before dist-check   # 若动 token / 材质
node scripts/probes/probe-theme-adaptation.mjs          # 阶段 5 之后
```

---

## 7. 交接速查

### 7.1 手工切换主题（验证用）

浏览器控制台：
```js
const { themeManager } = await import('/src/utils/theme-manager.js');
themeManager.setTheme('home-cat');        // 或 'anniversary-mc'
themeManager.setTheme('light');           // 复位
```
或改 localStorage 的 `boh-theme` 后刷新。

### 7.2 关键文件

| 用途 | 文件 |
| --- | --- |
| 主题真源 / 容器挂载 | `src/utils/theme-manager.js` |
| 全站 token | `src/styles/common/tokens.css` |
| 暗色按需加载 | `src/utils/theme-css-loader.js` |
| 主题选择 UI | `src/views/user-center/UserSpace/components/ThemePanel.vue` |
| 旧的弹窗版（仍在首页使用） | `src/views/user-center/UserSpace/components/ThemeModal.vue` |
| 方块小窝主样式 | `src/views/Forum/styles/drawers-skeletons.css` |
| 八周年主样式 | `src/views/Forum/styles/anniversary.css` |
| 详情页主题段 | `src/views/PostDetail/style.scoped.css`（88 / 2113 行） |
| 首屏骨架 | `index.html` + `public/boot.js` |
| 首屏门禁 | `scripts/check-first-paint.mjs` |

### 7.3 易踩的坑

- 改主题底色后**一定**跑 `check-first-paint`，它会拿骨架和 token 对账。
- 论坛样式是 `@import` 进 scoped 的（`ForumMain.vue` 4568–4577），文件顺序即优先级。
- 主题选择页现在有两个实现：设置页用 `ThemePanel`，首页 `ThemeModal` 仍在用；
  改选项文案时两处都要动（这是已知的第二份真源）。
- `anniversary-mc` 不靠 `data-theme` 生效，靠 `data-anniversary-skin="active"`；
  新增页面想接这个皮肤，要同时加属性绑定和 `anniversary.css` 里的选择器。

---

## 8. 未验证 / 待确认

- 移动端（≤768px）下自定义主题被 `.liquid-glass` 强制实白后的实际观感：**未实测**。
- Cloud+ 的 9 处 `data-theme` 是否构成完整暗色适配：**未逐个核对**。
- 影集（`/albums`）与关于/历史等页在 dark 下的完整度：本次只做了规则计数，**未做视觉验收**。
- 首页 Hero 是运营配置（`homeHeroes`），与站点主题是两套机制；
  是否要让 Hero 跟随主题，属于产品决策，**未定**。
