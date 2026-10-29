# 034 · 签到交互重构：卡面 3D 旋转 + 极简到账提示

> 状态：**已实施（2026-10-29）**，后续两处口径修订见文末 §9
> 目标：点「签到」一步完成，不再弹面板；用**用户自己的卡面**做 3D 旋转，落定后只留一行极简提示。
> 前提纪律：资源**解码完成**才起播（不是 `load` 完成）；面板删得干净，不留死 CSS / 死选择器。

---

## 1. 现状（2026-10-29 实测读码）

### 1.1 现在是两步，不是一步

```
ForumToolbar 两个入口（<1024 行内 .toolbar-checkin-inline / ≥1024 hero .toolbar-hero-pill）
  → emit('openWeeklyCheckin')
  → ForumMain.openWeeklyCheckinCalendar()      // 只做登录守卫 + 打开面板 + 重取状态
  → WeeklyCheckinCalendar 弹窗（159 行）
  → 用户在弹窗里再点 .checkin-submit-btn
  → ForumMain.handleWeeklyCheckin()            // 才真正提交
```

新交互要把「开面板 → 再点一次」压成「点一次 → 直接提交」。

### 1.2 提交与返回值

- `submitWeeklyCheckin()`（`src/utils/api/forum/post-api.js:1826`）→ RPC `submit_weekly_checkin`
- 关键返回：`alreadySigned` / `hasSignedThisWeek` / `pointsAwarded` / `currentPoints` / `currentStreak` / `nextRewardIn`
- 失败语义：后端在「本周已签」「未登录」时返回 `{ok:false}`（HTTP 200），**不能当失败弹错**，要归化成「已签到」

### 1.3 卡面三种皮肤（`PointsCard.vue`）

| skin | 资源 | 说明 |
| --- | --- | --- |
| `blank` | 无图，纯 CSS 底色（暗色有石墨渐变） | 默认 |
| `cats` | `HOME_CAT_ASSETS` 10 张打包 webp | 本地资源，仍要 decode |
| `custom` | `profiles.points_card_image_url` | 经 `resolveDbPointsCardImage()`：Cloudinary → 自建 CDN + `c_limit,w_1280` |

`<img loading="lazy">` —— 动画场景必须能改成 eager。

### 1.4 现有成功提示

`showCheckinSuccessIsland(message)`（`ForumMain.vue:3763`）→ 灵动岛，文案含「连续 N/4 周」这类长句。新 UI 不再用长句。

---

## 2. 必须先拍板的一件事：`+5` 的口径

仓库里两处口径**互相矛盾**：

- `supabase/migrations/2026033001_forum_weekly_checkin.sql`：`if mod(v_streak,4)=0 then v_points_awarded := 5` —— **每 4 周才发一次 5 分**
- `src/views/user-center/UserSpace/components/AssetsHubPanel.vue:902`：注释写「2026-06-30 订阅体系重构：周签到改为每周 +5」，并按「每周 +5」算台账

⇒ 仓库 migration 已落后于线上，线上函数到底哪一版**必须确认**（`select prosrc from pg_proc where proname='submit_weekly_checkin'`）。

**方案（不依赖确认结果也能正确）**：文案不硬编码 5，取后端 `pointsAwarded`：

- `pointsAwarded > 0` → 主文案 `+{{ awarded }} 积分`
- `pointsAwarded === 0` → 主文案 `已签到`，副文案 `连签 {{ streak }} 周`（**不谎报 +5**）

这样线上若已改成每周 +5，界面自然显示 +5；若没改，也不会出现「显示 +5 但余额没动」的投诉。`WEEKLY_CHECKIN_REWARD_POINTS` 退化成「后端没回字段时的兜底」，不再是文案真源。

---

## 3. 触发时机（时序）

```
t0  点击
    ├─ isWeeklyCheckinSubmitting = true（按钮 disabled，防连点）
    ├─ 守卫①：未登录 → 登录弹窗，退出
    ├─ 守卫②：hasSignedThisWeek 已 true → 不走动画，岛提示「本周已签到 · 下次 10.27」，退出
    └─ 并行两条线：
         A) submitWeeklyCheckin()          （网络，通常 200–600ms）
         B) preloadPointsCardAssets(...)   （图片，通常命中缓存 <50ms，冷启动 100–400ms）

t1  A 成功 && B 就绪 → 起播（正常路径）
    A 成功 && B 超时(1500ms) → 降级起播：custom 卡面回落 blank 纯色卡，文案不变
    A 失败（非 alreadySigned）→ 不出动画，showModal('error')
    A 返回 alreadySigned → 钉状态为已签 + 岛提示，不出动画
```

要点：

- **预取与提交并行**，不是「等提交成功再开始下载图片」—— 否则白等一个 RTT。
- 遮罩 `t0` 就挂上（`v-if="open"`），但**卡片阶段等双就绪才挂载**。遮罩本身给"已响应"的反馈，通常只存在 200–400ms。
- 动画期间锁滚动：`document.body.classList.add('boh-checkin-stage-open')`，CSS `overflow: hidden`。**不要**在 iOS 上改 `position: fixed`（会跳）。

---

## 4. 资源加载等待策略（本次的核心风险点）

### 4.1 `load` ≠ 可渲染

`img.onload` 只代表字节到手。**解码发生在首次绘制**，所以直接起播会在第一帧卡一下（1280px 大图 + 中低端机尤其明显）——这正是需求里「避免因加载未完成导致视觉效果差」的真正含义。

⇒ 必须 `await img.decode()`；`decode()` 不被支持或 reject 时退回 `onload` 语义。

### 4.2 实现

新增 `src/utils/points-card-assets.js`：

```js
// 纯函数：可单测，无 DOM 依赖
export function collectPointsCardAssetUrls({ skin, imageUrl } = {}) {
  if (skin === 'cats') return Object.values(HOME_CAT_ASSETS);
  if (skin === 'custom' && imageUrl) return [resolveDbPointsCardImage(imageUrl)];
  return []; // blank 无图
}

const cache = new Map(); // url -> Promise<boolean>，模块级，重复签到不重复下载

export function preloadImage(url, { timeoutMs = 8000 } = {}) { ... }

/**
 * 返回 { ready: boolean, failed: string[] }
 * 外层 race 一个较短的 budget（默认 1500ms）：超时 resolve { ready:false } 而不是 reject，
 * 调用方据此决定「降级起播」还是「等」。
 */
export async function preloadPointsCardAssets(target, { budgetMs = 1500 } = {}) { ... }
```

细节：

- 并发 `Promise.all`，单张失败不阻塞其它张（cats 10 张里坏 1 张不该整块不播）。
- 超时**不 reject**：签到钱已经到账了，动画晚到可以，不能因为图片挂了就吞掉成功反馈。
- 模块级 `Map` 缓存 Promise（不是结果），并发调用自然去重。

### 4.3 `PointsCard` 的一处小改

```diff
- eager: { type: Boolean, default: false },
+ // 3D 舞台需要在起播前确保可绘制：lazy 会让 img 推迟到布局后才发起请求
+ eager: { type: Boolean, default: false },
- :loading="lazy"
+ :loading="eager ? 'eager' : 'lazy'"
+ :fetchpriority="eager ? 'high' : undefined"
```

---

## 5. 动画与极简布局

### 5.1 布局（唯一结构）

```
Teleport to body
└─ .checkin-stage (fixed inset:0, z-index:200050, grid center, scrim)
   ├─ .checkin-stage-scrim        rgba(18,28,38,.34) + blur(14px)   ← 静止层，blur 只在这
   ├─ .checkin-stage-body (perspective: 1200px)
   │   └─ .checkin-card-3d (preserve-3d, will-change:transform)
   │      ├─ .face-front  ← <PointsCard eager :skin :image-url :points="pointsAfter" />
   │      └─ .face-back   ← 纯色卡背 + BOH 字标（必须有，见 5.3）
   └─ .checkin-stage-copy
       ├─ .copy-title   签到成功           13px / 500 / 三级文字
       └─ .copy-points  +5 积分            28px / 650 / tabular-nums / 主文字
          .copy-sub     连签 4 周          11.5px / 三级文字（awarded=0 时才有意义）
```

- 卡宽 `min(360px, 78vw)`，`aspect-ratio: 8/5`，`border-radius: 18px`（与 PointsCard 一致）。
- 无按钮、无关闭 ×、无日历、无边框容器。点任意处或 2.4s 后自动收。
- `role="status" aria-live="polite"`，整块 `aria-label="签到成功，获得 N 积分"`；卡面装饰性内容 `aria-hidden="true"`（避免读屏把「方块积分 / 可用积分」念一遍）。

### 5.2 时间轴（总 ~2.7s）

| 时间 | 事件 |
| --- | --- |
| 0–180ms | scrim `opacity 0→1`；卡 `scale .92→1`、`opacity 0→1`、`rotateY -24°` |
| 180–1180ms | 主旋转：`rotateY -24°→336°`，`rotateX 8°→0`，`scale 1→1.04→1`；sheen 光扫 `translateX(-120%→120%)` |
| 1180–1320ms | 落定回弹：`rotateY →360°(≡0)`，`scale 1.04→1`，缓动 `cubic-bezier(.2,1.4,.4,1)` |
| 1160–1500ms | 文案入场：标题先、积分数 80ms 后，`translateY 8px→0` + `opacity 0→1` |
| 1500–2400ms | 静止停留 |
| 2400–2700ms | 整体 `opacity→0`、`scale→.98`，卸载 |

- `will-change: transform` **只在 `is-playing` 期间挂**，`animationend` 后移除。
- 动效曲线本地常量（仓库 `tokens.css` 未定义 easing token，不要为此新建全局 token）。
- `prefers-reduced-motion: reduce`：跳过旋转与光扫，scrim/卡/文案各 160ms 淡入，停留 1.6s 淡出。

### 5.3 必须做背面（这是「视觉差」的最大来源）

单面卡转 360°，在 90°–270° 区间用户看到的是**镜像的文字**（"方块积分" 左右反）。所以：

- `.face-front { backface-visibility: hidden }`
- `.face-back { transform: rotateY(180deg); backface-visibility: hidden }`，内容是皮肤主色纯色 + 「BOH」字标（不渲染第二个 PointsCard，避免双份大图双重解码）。

### 5.4 暗色

舞台是 `Teleport to body` ⇒ 节点不在页根里，暗色覆盖前缀**必须**是 `html[data-theme='dark'] .xxx`，不能写 `.forum-page[data-theme=dark]`（仓库已踩过的坑）。
`PointsCard` 自身的暗色规则已经是 `html[data-theme='dark']` 前缀，可直接复用；只需为卡背、文案、scrim 补暗色值。

---

## 6. 改动点清单

| # | 文件 | 动作 |
| --- | --- | --- |
| 1 | `src/utils/points-card-assets.js` | **新增**：`collectPointsCardAssetUrls` / `preloadImage` / `preloadPointsCardAssets` + 模块级缓存 |
| 2 | `src/views/Forum/components/CheckinRewardStage.vue` | **新增**：遮罩 + 3D 双面卡 + 极简文案 |
| 3 | `src/views/Forum/components/WeeklyCheckinCalendar.vue` | **删除**（159 行；无第二入口） |
| 4 | `src/views/Forum/ForumMain.vue` | 删 `import WeeklyCheckinCalendar`、`isWeeklyCheckinCalendarOpen`、`closeWeeklyCheckinCalendar`、模板挂载块（5556–5568）、`handleWeeklyCheckin` 里的两处 `closeWeeklyCheckinCalendar()`；`openWeeklyCheckinCalendar` → `handleCheckinClick`（守卫 + 并行预取 + 提交 + 起播）；新增 `checkinReward` 状态；成功路径去掉 `showCheckinSuccessIsland`，`nextTick()` 一并删 |
| 5 | `src/views/Forum/styles/composer.css` | 删 `.checkin-overlay` … `.checkin-submit-btn.is-done` 整段（874–~1190，含 `.checkin-skeleton-label`）。实测这些类名只有 WeeklyCheckinCalendar 用 |
| 6 | `src/views/Forum/styles/anniversary.css` | 删 `.weekly-checkin-btn` / `.calendar-submit-btn` / `.checkin-submit-btn` 三处死引用；⚠️ 顺带发现：该文件覆盖的是 `.toolbar-checkin-btn`，而组件实际类名是 `.toolbar-checkin-inline` ⇒ 周年皮肤的签到钮**一直没生效**，需确认是否补上 |
| 7 | `src/views/user-center/UserSpace/components/PointsCard.vue` | 加 `eager` prop（`loading` / `fetchpriority`），其它不动 |
| 8 | `scripts/probes/probe-checkin-reward-stage.mjs` | **新增**（断言见 §7） |
| 9 | `scripts/lib/gate-map.json` + `AGENTS.md §2` | 加一行：改 `src/views/Forum/**` 签到交互 → 新探针 + `probe-points-card-image` |
| 10 | `tests/unit/points-card-assets.test.js` | **新增**：URL 收集（3 皮肤）/ 缓存去重 / 超时返回 `ready:false` 不抛 |
| 11 | `scripts/lib/gate-fixtures.mjs` | 若新增门禁则补样本（本次只加探针，不加 check，可不动） |

---

## 7. 验证与反证

```
npm run verify:fast
npm run gate:plan
node scripts/probes/probe-checkin-reward-stage.mjs
node scripts/probes/probe-points-card-image.mjs   # 动了 PointsCard 必跑
npm run prepush
```

探针断言（建议 14 条，竖屏 390×844 + 横屏 1440×900 两档）：

1. 点「签到」后 `.checkin-overlay` 不存在（旧弹窗已下线）
2. 起点：`.checkin-stage` 在 1 个 rAF 内出现（遮罩即时）
3. `.checkin-card-3d[data-asset-ready="1"]` 在**首帧旋转开始前**已置位（用 `data-*` 钩子，不数动画帧）
4. 卡面 `<img>`：`complete === true && naturalWidth > 0`（真解码完成，不是只 load）
5. 卡包围盒 `width > 200 && height > 0` 且在视口内
6. 旋转期间至少一帧 `transform` 含 `rotateY` 且 `|angle| > 30°`（证明真的在转，不是只淡入）
7. `.checkin-stage-copy` 文案含「签到成功」与积分数字
8. `aria-live` / `role=status` 存在
9. 点任意处 → stage 在 400ms 内消失
10. 自动消失：不点也 ≤3s 内消失
11. `body` 滚动锁在开时生效、关后恢复（`getComputedStyle(document.body).overflow`）
12. 已签状态再点 → 不出 stage，出提示（island / 文案）
13. `reduced-motion` 模拟下：卡无 `rotateY` 动画（`animationName` 为空或仅 fade）
14. 暗色：#toggle dark 后 scrim 与文案对比度 ≥ 4.5（axe 或手算），卡背有暗色值

反证（必做一次）：把 `await preloadPointsCardAssets(...)` 临时改成不等待 → 断言 4 必须变红。若不变红，说明门禁没牙。

---

## 8. 风险与取舍

| 风险 | 取舍 |
| --- | --- |
| 删弹窗后丢掉「本周哪天签的 / 下次什么时候」 | `AssetsHubPanel` 已有签到台账；**建议** stage 底部加一行 11.5px（「连签 N 周 · 下次 10.27」），成本一行，信息不丢 |
| 自定义卡面 1280px 大图 decode 慢 | 预算 1500ms；超时降级 blank 纯色卡（文案不变），不让用户看白框 |
| iOS `preserve-3d` + `overflow:hidden` + 圆角偶发撕裂 | 圆角挂在内层 img 容器，外层只做旋转；真机验一次 |
| 动画期间路由切换 | 组件 `onUnmounted` 里清定时器 + 摘 `body` class，不依赖外部 |
| `+5` 口径未定 | §2：文案取后端字段，不硬编码 |

---

## 9. 实施后的两处口径修订（2026-10-29）

### 9.1 奖励口径：每周固定 +5，不看连签

用户拍板（2026-10-29）：线上已是「每周签到 +5」，不再有「每 4 周结算一次」的周期间隔。
因此舞台**不显示**连签周数 / 下次签到日期，只留：

```
签到成功
+5 积分
当前积分 105
```

`+N` 仍读后端 `pointsAwarded`，**不硬编码 5** —— 万一某周函数没结算（返回 0），
主文案退回「本周已记录」，避免「显示 +5 但余额没动」的假账。
`weeklyCheckinNextCheckin` 计算属性随之删除（它只服务旧弹窗与提示岛文案）。

### 9.2 已签到再点 = 「再看一遍」

用户要的是「卡面旋转本身是彩蛋，不该一周只能看一次」。所以：

| 状态 | 行为 |
| --- | --- |
| 未签 | 提交 RPC → 舞台（`alreadySigned=false`，标题「签到成功」+ 到账数字） |
| 本地已签 | **不提交**，直接重播舞台（`alreadySigned=true`，标题「已签到」+「本周已签到」） |
| 本地未签但后端回 `alreadySigned` | 钉成已签 + 重播舞台（同一套反馈，不再弹提示岛） |

实现要点：

- 组件复用同一个 `CheckinRewardStage`，只加 `alreadySigned` prop —— 用户要看的就是这张卡再转一圈，
  没必要做第二个组件。`v-if` 保证每次都是全新挂载 ⇒ 动画自然重播。
- 重播同样走 `preloadPointsCardAssets()`，命中模块级缓存时几乎瞬时；**仍然等 decode**，
  所以「先白框后旋转」不会在重播时复现。
- `replayCheckinStage()` 用 `if (checkinReward.value.open) return` 防连点。
- 旧的 `showCheckinIsland()`（已签/撞 ALREADY_SIGNED 的轻提示）随之删除，避免死代码。

探针相应从「已签再点不重播」翻成 6 条新断言（重播挂载 / `data-already-signed="1"` /
`data-award="0"` / 文案是「已签到」且不含「+N 积分」/ 仍用本人卡面 / 峰值角 > 30° /
**submit RPC 次数不涨**），共 30 条。
