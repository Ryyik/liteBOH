# 040 · 他人空间 ↔「我的」资料页对齐

- 状态：进行中（2026-11-05 开工）
- 触发：用户「他人空间的 UI 似乎没有对齐最新版的『我的』」
- 真源：「我的」= `views/user-center/UserSpace/components/ProfileHomePanel.vue` + `styles/*.css`；
  他人空间 = `views/Profile/ProfileMain.vue` + 私有 `style.scoped.css`（3935 行）

## 1. 诊断（2026-11-05 实测 390×844 + 源码核对）

`Profile/index.vue` 已经把「我的」的四份共享 CSS 全局 `@import` 进来了，所以**底层样式早就共用**，
`ProfileMain.vue` 的模板却仍在用旧类名，再由自己的 `style.scoped.css` 覆盖一遍。具体漂移：

| 区域 | 我的（目标） | 他人空间（改前） |
| --- | --- | --- |
| 页面骨架 | 竖屏 edge-to-edge：封面贴顶、方角、无边框无投影，8px 底色缝 | 14px 边距 + 20px 圆角白卡 + `0 8px 32px` 投影 |
| 封面 | `calc(200px + nav-h)`，从 y=0 起铺 | 148px（竖屏实测 112px） |
| 昵称行 | 昵称 + tier | 昵称 + tier + Lv + `@昵称` + 在线圆点（两行） |
| 统计 | bio 下方纯文本三项「粉丝 / 关注 / 发帖」 | 独立 `border-top` 区块，四项「帖子·积分·粉丝·关注」 |
| 积分卡 | 无壳 `compact`，点卡即设置 | 白壳 + 标题行 + 提示语 + 非 compact |
| 服务面板 | 已移除（进设置页） | 4 行卡片（平台主页 / 加入 / 天数 / 生日） |
| 页签 | `.profile-content-tabs` 无壳左对齐 + 计数气泡 | `.profile-tabs` 白壳 20 圆角 + 深色实心选中 |
| 作品网格 | 竖屏单列 24px 内边距、卡片无壳 | auto-fill 280 单列大卡、白底描边 16 圆角 |
| 代表作置顶 | **无**（功能只存在于他人空间 ⇒ 自己设了主页看不见） | 有，且带 owner 编辑 |

私有 CSS 内部也已经漂了：`.profile-tabs` 三份互相覆盖（542 / 2142 / 3012 行）。

## 2. 信息架构结论（用户 2026-11-05 拍板）

**只该在他人空间有**：关注/发印象、在线状态、关注·粉丝列表（访客态）、代表作**展示位**、加入时间/天数/生日、
平台主页**文字链接**。

**两边都有（同一组件）**：身份卡、三项统计、活跃轨迹、内容三段（作品/回复/印象）、作品网格、
积分卡（访客只读）、代表作（我的可管理）。

**只该在我的空间有**：编辑资料/换封面/换头像/设置卡面/头像框、设置页五组（账户/通知/账户与隐私/内容与存储/通用）、
底栏四席（社区/消息/周边/图库）、草稿、代表作**设置入口**。

**要收敛的重复**：统计里的「积分」、`@昵称` 行、积分卡白壳+标题行+提示、服务面板 4 行卡片、「帖子/作品」命名。

## 3. 落地顺序

1. 抽 `ProfileIdentityHero.vue`（身份卡 + 封面 + 统计 + 操作行），两边共用；
   视觉规则随组件走（scoped），页级 edge-to-edge 由 `.profile-home-shell > .profile-hero-panel` 全局几条兜。
2. 他人空间：删 `@昵称` 行、统计改三项、积分卡改 `compact` 无壳、服务面板折成一行 meta、
   页签换 `.profile-content-*`、网格沿用共享几何。
3. 代表作：抽 `ProfileShowcaseStrip.vue`；他人空间只读展示（无空提示），
   我的空间作品 tab 顶部可编辑（选 3 条 + 取消置顶），上限 3、帖被删自动回落。
4. 删 `Profile/style.scoped.css` 里对应的重复段（`.profile-tabs` / `.profile-hero-*` / `.profile-post-*` /
   `.profile-points-card-section`），目标 3935 → ~2600 行。
5. 守卫：`tests/unit/profile-hero-parity.test.js` 断言两页渲染出的身份卡选择器一致；
   `check:shell-grep` 式规则拦 `.profile-tabs` 回流。

## 4. 验收

- `npm run verify:fast` + `npm run type-check`
- 390×844 / 844×390 截图对比（他人空间公开可测；「我的」需登录，用假会话 + REST 打桩补证）
- 探针：现有 `probe-dark-audit` / axe 对比度抽查身份卡区域
