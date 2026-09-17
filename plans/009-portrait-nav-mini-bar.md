# 009 · 竖屏导航 Mini Bar 形态方案

> 状态：设计定稿，待实施。本文档是实施的唯一依据。
> 需求人：瑞一颗 · 2026-09-17

## 0. 需求与已拍板决策

竖屏（portrait ≤768px）顶部导航默认收成 **mini 胶囊**（logo + 头像 + 汉堡），点击展开为现状**长条**。

已拍板：
1. **点汉堡 = 一步到位**：mini 态点汉堡直接展开长条 **并弹出菜单**，不做"先展开再点一次"的两段式。
2. **岛连体**：任意岛型（通知卡 / 任务卡 / BOHAI AI 岛 / 自定义岛）唤起时强制展开为长条，岛卡与长条是**同一个 surface** 向下生长，视觉连体（现状岛卡本来就挂在 surface 内部，只是宽度必须先到位）。
3. **岛关闭一起回缩**：岛关闭后 height 回落与 width 收缩**同一段动画**直接变回 mini 长度，不经过"先回长条"的中间停留。
4. logo / 头像在 mini 态保留**直达**（首页 / 我的方块），不触发展开。
5. 交互再钻研（见 §3/§4），不再出 demo，直接按本文档实施。

## 1. 形态状态机：不新增状态，纯派生

核心设计：**不需要独立的 expanded 状态变量**。展开态是既有状态的纯派生，岛仲裁零成本接入：

```
isExpandedLooking = !navMini                    // 非竖屏（横屏/拉宽）→ 永远长条
                 || isMobileMenuOpen           // 菜单开 → 长条
                 || statusCardItem.visible     // 通知卡在 → 长条
                 || isTaskCardShown            // 任务卡在 → 长条
                 || isBohaiIslandOpen          // AI 岛在 → 长条
                 || !!islandCustomSlot.component  // 自定义岛在 → 长条

navMini = 竖屏 matchMedia('(orientation: portrait) and (max-width: 768px)').matches
```

- `navMini` 是唯一新增的 ref，由 matchMedia 监听驱动（进竖屏=true，退出=false）。
- 岛的四个判据全是现成 computed（`statusCardItem` / `isTaskCardShown` / `isBohaiIslandOpen` / `islandCustomSlot`），**岛组件零改动**。
- surface 模板绑定两个新类：`nav-mini-caps`（navMini）与 `nav-expanded`（isExpandedLooking），形态样式全部由这两个类 + 现有 `has-*` 类组合驱动。

行为表：

| 当前形态 | 用户动作 | 结果 |
|---|---|---|
| MINI | 点胶囊空白 / 点汉堡 | `toggleMobileMenu()` → 展开 + 菜单（一步到位） |
| MINI | 点 logo / 头像 | 直达（现有跳转逻辑），stopPropagation，不展开 |
| EXPANDED+菜单 | 点汉堡 | 关菜单 → 回缩 mini |
| EXPANDED+菜单 | 点菜单项 | `closeMobileMenu()` → 回缩 mini |
| EXPANDED+菜单 | 点胶囊外部 | 关菜单 → 回缩 mini |
| EXPANDED+菜单 | 页面纵向滚动 >140px | 关菜单 → 回缩 mini |
| MINI/EXPANDED | 任意岛唤起 | 强制 EXPANDED（派生类自动），岛卡随 surface 生长，连体 |
| EXPANDED+岛 | 岛关闭 | 双轴（height+width）同段动画回 mini；若通知队列非空则保持长条接下一张 |
| 任意 | 旋转到横屏 / 拉宽 >768 | navMini=false → 现状长条，行为与线上完全一致 |

## 2. 动画规格（全部走项目既有 token）

曲线统一 `--ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1)`。

| 元素 | 展开（进场） | 回缩（出场） |
|---|---|---|
| surface width（max-width 158px → calc(100% - 16px)） | 500ms，t=0 | 450ms，t=100ms（等文本先走） |
| surface height（岛态 ↔ 50px） | 与 width 同段并行（岛唤起/关闭双轴 morph） | 同左 |
| 圆角 | 岛态 24px（现状值）↔ mini/长条 100px，随 morph | 同左 |
| 「方块之家」/「我的方块」文本 | 220ms，delay 90ms | 160ms，delay 0，**先于宽度** |
| 菜单卡（`.nav-menu-mobile.active`） | 320ms，delay **180ms**（等宽度展开过半再落） | 200ms，delay 0，**先于宽度** |
| 汉堡 三线↔X | 300ms（现状已有） | 同左 |

**morph 舒服的关键（必守）**：
- 展开：宽度先行，文本/菜单后进（delay 递增）——"胶囊长出来，内容从里面浮现"。
- 回缩：文本/菜单先出，宽度后收——否则 14px 文本在收窄容器里被 `overflow:hidden` 生硬截断。
- 实现方式：同一元素的 transition 在"展开类在/不在"两个方向写不同的 duration+delay（CSS 双向声明，天然实现进慢出快）。

**尺寸**：mini 宽度用 CSS 变量 `--nav-mini-width: 148px`（≤480px 降 138px；最终数值实施时用探针实测内容宽 + 红点外溢微调）。mini 居中悬浮：现状 surface 已是 `margin: 0 auto` + `max-width` 控宽，**只改 max-width 即可居中收缩**，不动 left/transform。

**动画中断**：CSS transition 天然可中断插值（从当前值续跑），连击汉堡、动画中途唤起/关闭岛都无需加锁——状态驱动 + transition 自适应，这是不加 debounce 的依据。

## 3. 交互钻研：竞态与边界（实施时逐条对照）

1. **岛队列不闪断**：通知卡 `after-leave → flushNavStatusQueue()` 是**同步** shift + present（index.vue 现状），队列非空时同一 tick 内 `statusCardItem.visible` 重新为 true，`isExpandedLooking` 不产生 false 帧 → 不会出现"回缩动画启动又被拉回"。**无需加防抖**；实施后用探针连发两条通知验证一次。
2. **点外部回缩 = 复用现有监听**：现状移动菜单**没有**外点关闭（`handleClickOutside` 只关桌面下拉 expandedMenu）。在 `handleClickOutside`（index.vue:919）加一个分支：`isMobileMenuOpen && !target.closest('.unified-nav-surface, .nav-menu-mobile') → closeMobileMenu()`。零新增 document 监听器。
3. **滚动回缩的监听面**：竖屏滚动源不止 window（论坛是 `.tab-page.community-shell` 容器滚动）。用 `window.addEventListener('scroll', fn, { capture: true, passive: true })` 一个监听覆盖所有滚动源；判定 `e.target.scrollTop` 增长 >140 才收——**横向轮播的 scrollLeft 变化不触发**。rAF 去重复用 `handleResize` 的 `resizeRafId` 模式。
4. **岛态下滚动**：不收。岛态时菜单必然关闭（仲裁），滚动分支的 `closeMobileMenu()` 是 no-op，`isExpandedLooking` 由岛判据撑住，天然安全，无需特判。
5. **菜单开着时唤起岛**（如菜单开着时通知弹出）：现状无此仲裁。规则：岛唤起时菜单立即收（`setIslandAiPaused` 附近的 watch 链已有岛→菜单互斥的接入点，通知卡路径在 `presentNavStatus` 加一行 `isMobileMenuOpen.value = false`），不打断岛动画。
6. **横竖屏切换带岛**：岛开着旋转到横屏 → navMini=false，岛态照旧（现状行为），transition 从竖屏值平滑插值，无跳变。
7. **DEV 测试按钮**（`nav-dev-island-btn`）：mini 态会挤宽胶囊 → mini 态 CSS `display:none`（dev-only，纯形态层）。
8. **未登录**：mini = logo + 登录按钮（`nav-login-btn`，保留现状小尺寸）+ 汉堡；展开/回缩逻辑同构，无特判。
9. **信息不丢**：未读红点（`unread-badge-nav`）与头像帧（`boh-avatar-frame`）mini 态保留原位。
10. **首帧无闪烁**：mini 是默认派生态（竖屏 matchMedia 同步求值），首帧即 mini，无"先长条再收"的闪动。
11. **`prefers-reduced-motion`**：竖屏 mini 的 transition 全部并入现有 reduced-motion 覆盖块（style.scoped.css:360），直切无动画。

## 4. 连体岛的形态链（现状已支撑，只需补竖屏 transition）

现状结构（style.scoped.css）：
- Beta6 surface 块（:66-78）刻意 `transition: none`（常驻冻结）→ **竖屏块内需重新声明** `transition: max-width/height 500ms var(--ease-emphasized)`（不带 !important）。
- 岛态块（:80-95）带 `!important` 的 transition（duration 走 `--global-nav-status-duration`）→ 优先级更高，**岛唤起动画沿用现有 620ms 体系不动**。
- 岛关闭：`has-*` 类摘除瞬间适用竖屏 transition → height（open-height → 50px）与 width（全宽 → 148px）**同一帧开始、同一段曲线回 mini**，即决策 3 的"一起回缩"，无需新代码路径。
- 岛卡本体（`GlobalNavStatusCard` 等挂在 surface 内部 `top: var(--global-nav-status-top)`）随 surface 宽度同步缩放定位 → 连体天然成立。

## 5. 实施落点（仅两个文件，业务逻辑零改动）

### `src/components/UnifiedNavbar/index.vue`（~40 行）
| 位置 | 改动 |
|---|---|
| script 新增（`handleResize` 附近） | `navMini` ref + `portraitMiniQuery` matchMedia listener（onMounted 挂 / onUnmounted 摘，同现有 themeManager listener 模式） |
| script 新增 computed | `isExpandedLooking`（§1 派生式） |
| template surface（:2-24） | `:class` 加 `nav-mini-caps: navMini, nav-expanded: isExpandedLooking` |
| template surface（:5） | mini 态 `@click` → `toggleMobileMenu()`（logo/头像回调补 `e.stopPropagation()`） |
| `handleClickOutside`（:919） | 加移动菜单外点关闭分支（§3-2） |
| `presentNavStatus`（:398） | 首行加 `isMobileMenuOpen.value = false`（§3-5） |
| script 新增（onMounted/onUnmounted） | capture scroll 监听 + 140px 阈值 + rAF 去重（§3-3） |

### `src/components/UnifiedNavbar/style.scoped.css`（~80 行，全部收进现有竖屏 media 块 :233 起新增小节）
- `--nav-mini-width` 变量 + mini 态 surface `max-width` / transition 重声明（§2/§4）。
- `.nav-logo-text` / `.nav-username` 的双向 max-width+opacity 动画（`white-space: nowrap` 需确认，vendor :63 logo-text 已有，username 补）。
- `.nav-menu-mobile.active` 进出双向 delay（§2）。
- mini 态 dev 按钮 display:none、reduced-motion 并入（§3-7/11）。
- **不动 vendor `unified-nav.css`；不动任何岛组件；不新增 !important**（权重用 `:global(#unified-nav-container …)` 前缀，项目惯例），预算守住 1332。

## 6. 验收与反证（探针 `scripts/probes/probe-nav-mini-bar.mjs`）

| 场景 | 断言 |
|---|---|
| A 竖屏 390×844 首帧 | surface max-width=148px、两处文本 opacity 0、logo/头像/汉堡可见、红点可见 |
| B 点汉堡 | surface 全宽 + 菜单卡可见 + 文本 opacity 1（等 700ms 后量） |
| C 点胶囊外部 | 回 mini（max-width 回 148、菜单隐藏） |
| D 通知岛唤起 | surface 全宽 + height≈status-top+卡高+gap、岛卡与 surface 同宽连体（岛卡 left/right 相对 surface）、圆角 24px |
| E 岛关闭 | 终态 max-width=148（双轴回缩，不测中间帧，测 800ms 后终值）；连发两条通知 → 全程保持长条不闪断 |
| F 滚动 >140px | 回 mini；横向轮播 scrollLeft 变化 → 不回缩 |
| G 横屏 1400×900 | 现状零影响：surface 无 mini 类、宽度 = 现有 max-width(min(860px,…)) |
| H ≤480px | mini 宽 138px 档 |

**反证（必做，防假绿）**：摘掉竖屏 mini 形态块 → A/D/E 至少各 1 条红；恢复全绿。门禁：eslint 0 errors · `check:first-paint`（UnifiedNavbar 在首屏 manualChunks，改样式必须跑）· `!important` 1332 不新增 · vitest 无回归。

## 7. 明确不做

- 不改横屏/桌面任何形态（isExpandedLooking 在非竖屏恒 false 的另一面：navMini=false 时全部新规则不适用）。
- 不加空闲定时器自动回缩（推荐砍掉：展开态本身是"用户刚表达意图"的状态，外点/滚动已覆盖收起场景，定时器只会制造"菜单没看清就收走"）。
- 不做 mini 态的拖拽/贴边（超出本次范围）。
- 不动岛组件、不动 vendor css、不动登录/菜单业务逻辑。
