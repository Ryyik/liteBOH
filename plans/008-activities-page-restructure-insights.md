# 008 · 活动页面重构关键设计洞察

> 目标形态：页面顶部 = 活动报名卡；其下 = 按月份分组的横向滚动卡片区。
> 本文只做设计洞察与决策梳理，不含实现代码。
> 调研基线：2026-09-17，代码 + 真库（REST 直查）双向核对。

---

## 0. 结论先行：三个必须开工前定死的决策

| # | 决策点 | 不定的后果 |
|---|---|---|
| **D1** | 报名卡数据源 = `activity_campaigns`（非 `activities`） | `activities` 表**没有任何报名/阶段/时间窗字段**，硬加列违背 2026090802 迁移立的铁律 |
| **D2** | 月份分组必须先把 `date` 归一成 **`{year, month, day, hasDay}`**，不做字符串切分 | `date` 是 3 种格式混杂的 varchar，切分必崩（下方 §2.1 有实测）。归一放在前端纯函数还是 DB 生成列见 §8 |
| **D3** | 报名卡与历史区**保持两个数据源、两块 UI**，不做"统一 list" | 两者时间语义相反（进行时 vs 已举办），合并后月份分组自相矛盾 |

---

## 1. 现状事实（实测，非推断）

### 1.1 页面归属链

```
/unified-nav 入口 "活动&方块墙" → /activities-wall
  └─ src/views/ActivitiesWall/index.vue        (157 行 · 宿主 + 灵动岛挂载)
       ├─ WallIslandCard.vue                   (241 行 · 导航栏自定义岛，分段切换)
       ├─ src/views/activities/ActivitiesList.vue (680 行 · 活动面板 ← 本次重构主体)
       └─ src/views/BlockWall/index.vue        (embedded 方块墙，本次不动)

旧深链全部 302 到 /activities-wall：/activities · /activities/photowall · /activities/list · /block-wall
```

### 1.2 `ActivitiesList.vue` 当前兼任 6 件事（680 行）

1. 页头（kicker + 大标题 + 管理员投稿按钮）
2. `campaign-section`「进行中活动」报名网格（多卡 grid）
3. 历史活动卡片网格 `grid auto-fill minmax(380px,1fr)`
4. 详情灵动岛 `ContentDetailIsland` 开合 + `remountWallIsland` 回调
5. 管理员发布弹窗 `AdminContentPublishModal`
6. 导航真实高度测量 → `--nav-h` 写回

### 1.3 数据源现状

| 表 | 行数（真库实测） | 关键列 |
|---|---|---|
| `activities` | **17** | `id bigint` / `title` / **`date varchar(50)`** / `image` / `description` |
| `activity_campaigns` | **0** | `id uuid` / `slug` / `stage` / `signup_start_at` / `signup_end_at` / `start_at` / `end_at` / `config jsonb` |
| `activity_entries` | **0** | `campaign_id` / `user_id` / `kind(signup\|submission)` / `payload` / `status`，`unique(campaign_id,user_id,kind)` |
| `activity_rewards` | 0 | 发放台账 |

**为什么 campaigns 是 0 行**：`2026090901_probe_seed.sql` 插过一条 `probe-test-campaign`，随后被 `2026090902_probe_cleanup.sql` 删掉了。表结构在线、数据为空。

> 直接后果：`campaign-section` 有 `v-if="ongoingCampaigns.length"`，**线上永不渲染**。用户现在看到的活动页，顶部是空的。

---

## 2. 数据层洞察

### 2.1 `activities.date` 是脏数据 —— 月份分组的最大障碍

全 17 条实测格式分布：

| 格式 | 条数 | 样例 | 影响 |
|---|---|---|---|
| `YYYY/M/D` | 9 | `2026/2/3` `2025/12/12` | 可解析出「日」 |
| `YYYY/M` | **6** | `2025/10` `2024/7` `2023/8` `2022/10` `2023/10` `2024/2` | **只有年月，无「日」** |
| `YYYY-MM-DD` | 2 | `2026-07-21` `2026-08-10` | 连字符，与上两类不兼容 |

三条由此推出的风险：

**R1 · 字符串切分必然出错。**
`date.split('/')[1]` 对 `2026-08-10` 返回 `undefined`；`date.slice(0,7)` 对 `2026/2/3` 返回 `2026/2/`。两种结果都进不了统一分组。

**R2 · DB 侧排序是错的，但被前端掩盖。**
`order=date.desc` 走**字符串**比较，实测返回 id 顺序 `15,17,16,12,14,13,9,8,10,11,4,5`，其中：

```
'2025/7/21'  >  '2025/12/12'    ← 错，7月排到了12月前面
'2026/2/3'   >  '2026-08-10'    ← 错，'/' (0x2F) 恒大于 '-' (0x2D)
```

前端 `useActivities.js` 用 `new Date(date.replace(/\//g,'-'))` 重新排了一遍，**侥幸正确**——因为 V8 的宽松解析把 `2024-7` 补成 `2024-07-01`（不是 `Invalid Date`，所以不会报错，只会静默取到错误日期）。这是典型的"假绿"：一旦有人删掉前端重排、只信 DB `order`，页面立即错乱且无任何报错。

**R3 · 同一字段存在两套时区语义。**
`new Date('2026-08-10')` 走 ISO 分支 → UTC 00:00 → 本地 **08:00**；`new Date('2026-2-3')` 走宽松分支 → 本地 **00:00**。当前不跨月所以看不出问题，但任何"按天比较/相邻日聚合"的逻辑都会在月初月末漂移。

**R4 · 同日多条相对顺序不稳定。**
`2024/12/31` 有两条（`新年跑酷`、`2024新年活动`），`Array.prototype.sort` 不稳定，顺序会随引擎/数据量漂移。

### 2.2 两张表之间没有关联键 —— 长期架构缺口

```
activities    : id(bigint 自增) · title · date · image · description
activity_campaigns : id(uuid) · slug · title · stage · 时间窗 · config
```

**没有任何外键或 slug 字段可以互相指向**（`ForumMain.vue:2349` 只能靠 `title` 字符串匹配来认领官方镜像帖，本身就是脆弱设计）。

含义：campaign 走完生命周期到 `fulfilled` 后，**没有办法"毕业"进入下方的历史回顾区**。这是本次重构必须顺带想清楚的事，否则会长成一个新的"幽灵入口"——正是 `2026090802` 迁移开篇想消灭的问题。

**建议方向**：给 `activities` 加 `campaign_slug text`（可空，唯一约束），作为归档通道的锚点。归档动作可以是"admin 手动把 fulfilled campaign 落一行 activities"，也可以是 `stage → fulfilled` 触发器自动落。

### 2.3 RLS 有一处注释与实现不符（顺带发现的真实缺口）

`supabase/migrations/2026090802_activity_campaign_platform.sql`：

```sql
create policy activity_campaigns_select on public.activity_campaigns
  for select using (true);          -- ← draft 对 anon 同样可读
```

而 `src/utils/api/activities-platform-api.js:25` 的注释写着：

> `活动列表（公开；includeDrafts=true 需管理员身份，由 RLS 兜底）`

**"由 RLS 兜底"不成立。** 草稿过滤实际只靠 API 层的 `query.neq('stage','draft')`——任何人拿 anon key 直查 `/rest/v1/activity_campaigns` 都能读到 `draft` 行。要么把 policy 改成 `using (stage <> 'draft' or public.current_user_is_admin())`，要么改掉那条注释别误导后人。报名系统一旦真上线，未公开的活动预热文案会从这里漏出去。

### 2.4 报名状态查询是 N+1

`ActivitiesList.vue:122-141`：

```js
await Promise.all(ongoingCampaigns.value.map(async (camp) => {
  const mine = await getMyCampaignEntries(camp.id, uid);   // 每卡一次往返
  camp.signedUp = mine.ok && mine.data.some((e) => e.kind === 'signup');
}));
```

12 个活动 = 12 次请求。`activities-platform-api.js` 里没有批量接口。重构报名卡时应补一个 `getMyCampaignSignups(campaignIds[], userId)`，用一次 `.in('campaign_id', ids)` 收口。

---

## 3. SQL 调整方向（三选项，推荐 A）

### 方案 A（推荐）：生成列 + 视图，零数据改动

```sql
-- 2026091701_activities_event_date_normalize.sql
begin;

alter table public.activities
  add column if not exists event_date date
  generated always as (
    case
      when date ~ '^\d{4}[/-]\d{1,2}[/-]\d{1,2}$'
        then to_date(replace(date, '/', '-'), 'YYYY-MM-DD')
      when date ~ '^\d{4}[/-]\d{1,2}$'
        then to_date(replace(date, '/', '-'), 'YYYY-MM')   -- 缺「日」→ 归 1 号
      else null
    end
  ) stored;

create index if not exists idx_activities_event_date
  on public.activities (event_date desc nulls last);

-- 时间轴视图：把 month_key / month_ord 的推导从 JS 收进 SQL
create or replace view public.activity_timeline as
select
  id, title, image, description,
  date as date_raw,
  event_date,
  to_char(event_date, 'YYYY-MM') as month_key,
  (extract(year from event_date)::int * 100
   + extract(month from event_date)::int) as month_ord
from public.activities
where event_date is not null;

grant select on public.activity_timeline to anon, authenticated;

commit;
```

- **优点**：不动任何历史数据；`date` 原文保留可继续显示（"2025/10" 这种只有年月的，本来就该原样展示）；月份分组与排序变成 SQL 的确定行为；生成列只读，不会被应用层写歪。
- **注意点**：
  - `to_date`/`regexp` 在 PG 里是 IMMUTABLE，可用于生成列（执行前请在本地 `supabase db reset` 验一遍）。
  - 生成列会**重写全表**，`activities` 仅 17 行，无压力。
  - 6 条缺「日」的记录会被归到当月 1 号：**排序键会与显示文本不一致**，需要在 UI 上明确"仅标注年月"而不是显示"2025年10月1日"。

**前端改动随之确定**：`useActivities.js` 的 `.from('activities')` → `.from('activity_timeline')`，`order('date.desc')` → `order('event_date.desc')`，并在 select 里显式带上 `event_date, month_key, month_ord`（保持最小载荷，别用 `select('*')`）。前端那段 `new Date(replace)` 的手工重排可以整段删掉。

### 方案 B（最轻）：不加列，只做视图

视图里用 `regexp_replace` 现算 `month_key` / `month_ord`。不动表结构，但每次查询都做正则计算，且无法建索引，且**排序仍是字符串语义**——只解决"分组显示"，不解决"排序正确"。适合"先出效果、后面再补 D2"的过渡期。

### 方案 C（不推荐）：把 `date` 改成 `date` 类型

看起来最干净，实际风险最高，明确不建议：

- 6 条缺「日」的记录必须先补一个假日期，属于**伪造数据**；
- `sync_official_forum_card('activity')` 触发器监听 `insert or update of title, description, date` → 改列类型会触发**全表镜像卡重建**；
- `ForumMain.vue:2349` 的 `activities.select('title, image')` + title 匹配逻辑需一并回归验证；
- 旧深链/缓存里存的 `date_raw` 展示文案（"2025/10"）会全部变味。

---

## 4. 组件职责划分

### 4.1 拆分后的结构

```
src/views/ActivitiesWall/
  index.vue                        [改] 宿主：tab 切换 + 灵动岛 + --aw-nav-h（保持）
  WallIslandCard.vue               [不动]
  components/
    ActivitySignupSection.vue      [新] 顶部报名区容器
      ├ ActivitySignupCard.vue     [新] 单张报名卡（主卡大 / 次卡小）
      └ EmptyState.vue             [复用] campaigns 为空时的空态（当前 0 行，必然命中）
    ActivityTimeline.vue           [新] 月份分组横向滚动区容器
      ├ ActivityMonthRail.vue      [新] 单个月份轨道（scroll-snap 宿主）
      └ ActivityCard.vue           [新] 单张历史活动卡（从 ActivitiesList 抽出）
src/views/activities/ActivitiesList.vue
                                   [改] 退化为编排壳：页头 + 上两区 + 详情岛 + 发布弹窗
src/composables/
  useActivities.js                 [改] 数据源切 activity_timeline；新增纯函数 groupByMonth()
  useCampaigns.js                  [新] loadOngoingCampaigns / signupCampaign / stageLabel / window
src/utils/api/activities-platform-api.js
                                   [改] 新增 getMyCampaignSignups(ids, uid) 批量报名状态
```

### 4.2 职责边界的三条硬线

1. **`groupByMonth()` 必须是纯函数**，放在 `useActivities.js` 里单独 export，输入 `rows` 输出 `[{ monthKey, monthOrd, label, items[] }]`。它是本次重构唯一真正有逻辑的地方，必须能脱离 Vue 单测（项目已有"源码级单元断言 + 探针"的双层验证习惯）。
2. **报名卡不感知历史数据**，时间轴不感知 campaigns。两个组件各自独立请求、独立 loading、独立空态。唯一共享的是页面级布局容器。
3. **详情岛契约保持不变**：`ContentDetailIsland` + `showIsland.custom` + `provide('remountWallIsland')` 三件套必须原样保留。这是历史上踩过的坑——详情卡会占用活动墙常驻岛的槽位，关闭时若不回调重挂载，常驻岛就永久消失（`ActivitiesWall/index.vue:69-75` 有完整注释）。抽 `ActivityCard` 时把 `onOpenDetail` 作为事件往上抛，不要在卡片内部自己开岛。

### 4.3 顺带收敛的技术债

- `.activity-admin-publish-btn` 与 `.campaign-signup-btn` 都是"散装玻璃胶囊按钮"，按项目约定应收敛到 `components/ui/GlassPillButton.vue`。
- `ActivitiesList.vue` 里 `loading-spinner` / `loading-text` / `.loading-container` 三段样式已无对应模板（模板已改用 skeleton），属死样式，重构时一并清掉。

---

## 5. 布局适配要点

### 5.1 最关键的一个交互决策（先定这个，才谈组件几层）

「按月份分组的横向滚动」有两种截然不同的实现，**组件层数与样式写法完全不同**：

| 方案 | 结构 | 横向滚动范围 | 优点 | 代价 |
|---|---|---|---|---|
| **M1 单轨 + 粘性月份分隔** | 1 个 `overflow-x:auto` 轨道，月份标题是轨道内的 `sticky left` 分隔块 | 贯穿全部历史 | 一个滚动条到底，观感连续 | `scroll-snap` 与月份锚点会互相打架，snap 只能按卡片对齐，月份定位需要 JS 补齐 |
| **M2 每月一轨** | 每月一个独立 `overflow-x:auto` 轨道，纵向堆叠月份 | 每月独立 | 分组语义清晰，snap 天然按月对齐 | 多条滚动条垂直排布，滚动手感分段；月份多时页面很长 |

17 条数据按年月分组后是 **16 个月份组，其中 15 个只有 1 张卡**（仅 2024-12 有 2 张）——M2 会退化成「15 条不滚动的轨道」，视觉上偏松散。**M1 更适配当前数据密度**，如果预期未来每月活动量会上来（≥4 条/月），M2 才是对的。

> **决策（2026-09-17）：选 M2（每月一轨）**，并已按 M2 实施。对「单卡轨道」做了专门处理：不参与 scroll-snap（`scroll-snap-type: none`）、卡片放宽到 `min(420px, 100%)`，避免「一个月占一行却只有一小块内容」。落地细节见 §8。

### 5.2 横滑轨道的既有范式（直接复用，别新造）

`src/views/Forum/styles/feed.css:632-653` 的 `.image-post-strip` 是本项目已验证的横滑范式（多图帖 carousel）：

```css
overflow-x: auto;
overscroll-behavior-x: contain;        /* 防页面横滑溢出 */
scroll-snap-type: x mandatory;
-webkit-overflow-scrolling: touch;
scrollbar-width: none;                 /* 隐藏滚动条，靠露边暗示可滑 */
/* 露边：左缝 14px、右缘贴边 */
margin: 16px -24px 18px -10px;
```

两个要点：
- **露边负 margin 必须按新容器的 padding 反推**。`feed.css` 的 `-24px` 是相对论坛卡片内边距算的；活动页容器是 `max-width: 1400px / padding: 0 40px`（移动端 `0 20px`），数值不能照抄，否则右侧卡片会贴不到边或溢出。
- **隐藏滚动条后必须有替代的位置暗示**，`feed.css` 用 `.image-strip-indicator`（n/N 胶囊）。新轨道同样需要，别只隐藏不补。

### 5.3 导航高度：两套变量并存，别只改一个

```
ActivitiesWall/index.vue  →  --aw-nav-h   （外层页面 padding-top，JS 实测导航高度写入）
ActivitiesList.vue        →  --nav-h      （内层页头 padding-top，自己又测了一遍）
```

同一件事测了两遍、写了两个变量。重构时若把页头搬进新组件，`--nav-h` 的测量逻辑（`ResizeObserver` 观察 `#unified-nav-container`）和 `:deep()` 补丁都要跟着走。**建议这次统一成一个变量**，两个 ResizeObserver 也是冗余。省掉的是"改一处要动四处"的老问题。

### 5.4 会一起失效的 `:deep()` 补丁

`ActivitiesWall/index.vue:127-147` 用宿主页面覆盖子页面留白：

```css
.aw-pane--activities :deep(.activities-list-page) { background: transparent; min-height: auto; }
.aw-pane--activities :deep(.activities-header)    { padding: 52px 20px 40px; }
.aw-pane--activities :deep(.activities-container) { padding-bottom: 96px; }
```

`.activities-container` 一旦改名为滚动轨道类名，第三条补丁**静默失效**（`:deep()` 匹配不到就只是不生效，不报错）。重构时必须同步改这三条。

### 5.5 其余适配清单

- **响应式断点**：活动页现在只有 `1200 / 768` 两个断点。现有网格 `minmax(380px,1fr)` 在单列断点下是 `1fr`；轨道卡片宽度建议 `clamp(260px, 78vw, 340px)` + `flex: 0 0 auto`，与 `feed.css` 的 `clamp(200px,48%,340px)` 保持家族感。
- **横屏/竖屏**：本项目存在 `landscape + min-width:1024 + min-height:600` 的横屏判据（UserSpace 侧栏先例）。活动页目前没有横屏分支，若报名主卡在大屏要转为左右布局，需明确是否引入该判据，并同步探针（历史上改断点要同步 3 处）。
- **暗色主题**：新组件必须补 `html[data-theme="dark"]` 分支。注意项目约定——Teleport 到 body 的元素要用 `html` 级选择器；组件 scoped 样式能压过全局 media query，所以响应式要写进组件自己的 scoped。
- **月份标题 sticky 的毛玻璃**：sticky 标题在滚动时会与卡片内容重叠，需要 `backdrop-filter` + 不透明底色，否则暗色下会糊成一片。有既有范式可抄：`.image-strip-indicator` 的 `rgba + backdrop-filter` 组合。
- **空态**：`campaigns` 当前 0 行 → 报名区必然命中空态。用 `components/ui/EmptyState.vue`，不要现写（项目约定）。
- **`prefers-reduced-motion`**：`scroll-snap` 与入场动画都要关（`WallIslandCard.vue:232-240` 有现成写法）。

---

## 6. 回归风险清单（改前必看）

| 风险 | 位置 | 说明 |
|---|---|---|
| **探针必然 FAIL** | `scripts/probes/probe-campaign-ui.mjs` | 断言 5 个老类名（`.campaign-section` / `.campaign-title` / `.campaign-stage-chip` / `.campaign-desc` / `.campaign-signup-btn`）。改类名 = 探针全红，必须同步改。且因为它依赖 seed 数据（已被 cleanup 删除），**现在跑就是 FAIL**——重构后要一并修好数据前提 |
| 探针无断言 | `scripts/probes/probe-activities-wall.mjs` | 只截图 + 打印，没有任何 `check()`。属于"看起来有测试"的空壳，重构后建议补真断言 |
| 触发器重算 | `sync_official_forum_card('activity')` | 监听 `insert or update of title, description, date`。方案 A 只加列不动 `date`，**不会触发**；方案 C 会触发全表重建 |
| 论坛官方卡判定 | `src/views/Forum/ForumMain.vue:2349` | 用 `activities.select('title, image')` 按 **title 字符串**匹配认领官方帖。改 title 显示格式会连带影响 |
| 守卫基线 | `npm run check:structure` | 当前 **Passed**（仅 WARN 大文件）。注意规则：`src/views` 顶层不允许单文件页面，必须 `PageName/index.vue` —— 新建组件放 `ActivitiesWall/components/` 是合规的 |
| 视图命名冲突 | `npm run check:views` | 当前 Passed。检测 `.vue` 与同名目录冲突，新增组件目录时别撞名 |
| `!important` 预算 | `npm run check:important-budget` | 基线 1332。新增样式**不要**加 `!important`；注意该脚本是纯文本匹配，注释里出现字面量也会被计入 |
| 首屏体积 | `npm run check:bundle` / `check:first-paint` | 新增 4~5 个组件，确认不进入入口壳的静态 import 集合（`check:shell-precache` 反推预缓存清单会检出） |

---

## 7. 待确认清单

1. **M1 还是 M2**（§5.1）——需要一个月活动量级的预期。
2. **`event_date` 归 1 号后，UI 是否只显示「2025年10月」**（不显示"1日"）——影响卡片角标文案。
3. **归档通道是否本次一起做**（§2.2 的 `campaign_slug`）——不做的话，fulfilled 活动没有去向。
4. **`activity_campaigns` 的 draft RLS 是否本次一并收紧**（§2.3）——独立小改动，但属于安全缺口。
5. **报名卡展示几条**——主卡 1 张 + 次卡横滑？还是全部网格？（现有 `campaign-grid` 是 auto-fill 网格）

---

## 8. 实施记录（2026-09-17）

### 8.1 决策落地

| 决策点 | 结论 |
|---|---|
| 横向滚动结构 | **M2 每月一轨**（§5.1） |
| 缺「日」处理 | **省略**，不补位。卡片角标按精度渲染：有「日」→ `2月3日`；只有年月 → `10月` |
| 归一位置 | **前端纯函数**（`src/utils/activity-date.js`）。暂不加 DB 生成列，理由见 8.4 |

### 8.2 新增 / 改动文件

**新增**

- `src/utils/activity-date.js` — 日期解析单一真相源：`parseActivityDate` / `groupActivitiesByMonth` / `formatActivityDate` / `normalizeActivityDateInput` / `composeActivityDateInput`
- `src/composables/useCampaigns.js` — 报名逻辑从 ActivitiesList 抽出 + 批量报名态查询
- `src/views/activities/components/ActivitySignupSection.vue` — 顶部报名区（主卡 + 次卡横滑 + EmptyState 兜底）
- `src/views/activities/components/ActivityMonthRail.vue` — 单月轨道（scroll-snap / 单卡降级 / 位置指示点）
- `src/views/activities/components/ActivityCard.vue` — 历史活动卡（精度自适应角标）
- `tests/unit/activity-date.test.js` — 22 项

**改动**

- `src/views/activities/ActivitiesList.vue` — 680 行 → 编排壳（页头 / 两区装配 / 详情岛 / 发布弹窗 / nav 高度）
- `src/composables/useActivities.js` — 新增 `groupedActivities` / `undatedActivities`；删掉 `new Date(date.replace(/\//g,'-'))` 手工兜底
- `src/utils/api/activities-platform-api.js` — 新增 `getMyCampaignSignupIds`（批量）；修正「由 RLS 兜底」的错误注释
- `src/views/ActivitiesWall/index.vue` — `:deep(.activities-container)` → `:deep(.activities-timeline)`（类名改名后不同步改会静默失效）
- `scripts/probes/probe-campaign-ui.mjs` — v2 → v3

**数据管理**

- `config/tables.js` — activities 换用 `activity-date` 控件 + 精度 badge 列；campaigns 四个时间字段 `text`（手填 ISO）→ `datetime`；campaignEntries 由「无法编辑」→ 可审核 status、payload 可读
- `config/fields.js` — 新增 ENTRY_KIND / ENTRY_STATUS / REWARD_TYPE 选项；`campaignEntries: ['status']` 进 TAB_WRITABLE_FIELDS
- `config/saveStrategies.js` — activities 改用 `normalizeActivityDateInput` 保精度；campaigns datetime-local → 带时区 ISO + 时间段先后校验；新增 campaignEntries 策略
- `components/EditDrawer.vue` — 新增 `activity-date` 字段类型（`type="month"` + 可选「日」）
- `config/tabs.js` — `campaignEntries: ['view', 'edit']`

### 8.3 顺手修掉的问题

- **数据管理在持续销毁日期精度**：`toDateInputValue('2025/10')` → `'2025-10-01'`。管理员打开任意一条缺「日」的历史活动、什么都不改直接保存，就会永久钉上「1 日」——这正是这个字段越来越脏的机制来源。
- **报名状态 N+1** → 一次 `.in()` 批量查询。
- **时间字段会存错 8 小时**：campaigns 时间原为手填 ISO 字符串，改成 datetime 选择器后必须转带时区 ISO，否则 `2026-09-10T00:00` 被当 UTC 解释。
- **`activity_campaigns_select using (true)` 的真缺口**（§2.3）已写进 API 注释，但**未动 RLS**。

### 8.4 未做（留给后续）

- **DB 生成列 `event_date` + `activity_timeline` 视图**（§3 方案 A）：当前排序/分组全部在前端纯函数完成，正确性与可测性都够，且**前端不依赖该列**，随时可加。加它的收益是让 DB 侧 `order` 也正确，代价是一次 DB push。
- campaigns 的 draft RLS 收紧（§2.3）
- 归档通道 `activities.campaign_slug`（§2.2）
- `probe-activities-wall.mjs` 仍是无断言的空壳（§6）

### 8.5 验证

- `npx vitest run` — **1817 passed / 1 skipped**（含新增 22 项）
- `npx eslint` — 0 errors
- `npm run type-check` — 干净
- `check:views` / `check:structure` — Passed
- `check:important-budget` — **1332 / 1332**（未新增）
- `npx vite build --outDir dist-check` — 成功
- `probe-campaign-ui.mjs` — **18 项全 PASS**
- **反证**：把 `parseActivityDate` 的 YM 分支改成补 `day = 1` → 单测 7 项变红、探针 2 项变红（角标真的渲染成「10月1日」）；恢复后全绿。证明日期相关断言不是空断言。

---

## 9. 管理员投稿双路径（2026-09-17 追加）

需求：管理员在活动页投稿时，可选择「新建报名活动」或「新建活动」——两者写的是**两张完全不同的表**。

### 9.1 表差异（决定了表单字段差异，不是设计选择）

| | news | activity_campaigns（报名活动） | activities（往期活动） |
|---|---|---|---|
| id | 自增数字 | **uuid（DB 生成）** | 自增数字 |
| 封面图 | 有 | **无 image 列** | 有 |
| 时间 | 单个 date | **4 个时间窗**（报名开始/截止 + 活动开始/结束） | 单个 date（varchar） |
| slug | — | **必填且唯一** | — |
| 论坛同步触发器 | 有 | **无** | 有（`trg_sync_activity_forum_card`） |

两条由表结构决定的硬约束：

1. **报名活动不提供封面图** —— `activity_campaigns` 没有 image 列。弹窗里明确写出来，而不是给一个存不进去的字段。
2. **报名活动不会同步论坛官方帖** —— 该表没有镜像触发器。所以 toast 文案按类型区分：报名活动说「已进入报名中，活动页顶部即可看到」，往期活动才说「论坛官方帖已自动同步」。此前只有一条文案，套在报名活动上就是假话。

### 9.2 单一真相源

`slug` 归一 / `datetime-local → 带时区 ISO` / 时间窗先后校验，此前只存在于数据管理的 `saveStrategies.js`。
现已提到 `src/utils/activity-campaign.js`，**前台弹窗与后台共用**，避免「后台存得进、前台存不进」的漂移。

### 9.3 顺手修掉的三处

- **slug 提示与实际不一致**：表单提示「留空将自动生成为 boh-xxx」，但提交时又调了一次生成函数，时间戳与随机后缀都变了 —— 提示是骗人的。改为复用打开弹窗时生成的那个 fallback。
- **同毫秒 slug 碰撞**：纯 `Date.now()` 的 base36 在同一毫秒内会生成相同 slug，撞 unique 约束导致发布失败。补 3 位随机后缀。
- **说明文字对比度**：`.ap-help` / `.ap-hint` 从 `#7a8aa0` 提到 `#5b6879`（原值在白玻璃上约 3.5:1，低于 AA）。

### 9.4 验证

- `probe-campaign-ui.mjs` 新增 **场景 D（17 项断言）**：注入 admin → 投稿入口可见 → 弹窗打开 → 默认选中报名活动 → 字段差异（4 个 datetime / 无封面 / 有 slug）→ 切换后整体换面 → **时间窗逆序被拦截且不发请求** → 提交打到 `activity_campaigns` → payload 形状（无 id、无 image、stage=signup、介绍落 description、时间转 ISO）→ 提示 slug 与实际写入一致。
- 探针合计 **35 项全 PASS**。
- `vitest` **1839 passed / 1 skipped**（新增 activity-campaign 22 项）。
- **反证**：撤销 slug fallback 复用 → 仅「提示与实际一致」一条变红，其余仍绿；恢复后全绿。
