# 全局导航栏二级菜单重构 Spec

## Why
当前导航栏采用扁平结构，所有菜单项平铺显示，当菜单项增多时会导致导航栏拥挤，用户体验不佳。需要改为二级导航结构，通过点击展开二级菜单，优化导航栏布局和用户交互体验。

## What Changes
- 将扁平导航结构改为二级导航结构
- 新增导航分组：社区（新闻、论坛、活动）、探索（周边、BOH AI）、文档（教程）
- 横屏和竖屏模式下统一采用点击展开二级菜单的交互方式
- 竖屏模式下二级菜单展开后导航栏窗口大小保持不变
- 移除原有的直接跳转链接，改为点击展开/收起二级菜单

## Impact
- Affected specs: 全局导航栏组件
- Affected code: 
  - `src/components/UnifiedNavbar.vue`
  - `src/assets/styles/vendor/unified-nav.css`

## ADDED Requirements

### Requirement: 二级导航菜单结构
系统应提供二级导航菜单结构，支持点击展开/收起子菜单。

#### Scenario: 桌面端点击展开二级菜单
- **WHEN** 用户点击带有二级菜单的导航项（如"社区"）
- **THEN** 展开显示该导航项的二级菜单（新闻、论坛、活动）
- **AND** 再次点击时收起二级菜单

#### Scenario: 移动端点击展开二级菜单
- **WHEN** 用户在移动端点击带有二级菜单的导航项
- **THEN** 展开显示该导航项的二级菜单
- **AND** 导航栏窗口大小保持不变（不随菜单展开而变大）

### Requirement: 导航菜单分组配置
系统应按以下结构组织导航菜单：

#### 导航结构
| 一级菜单 | 二级菜单 | 路由路径 |
|---------|---------|---------|
| 首页 | - | / |
| 社区 | 新闻 | /newsroom |
| 社区 | 论坛 | /forum |
| 社区 | 活动 | /activities |
| 探索 | 周边 | /shop |
| 探索 | BOH AI | /ai-chat |
| 关于 | - | /about |
| 文档 | 教程 | /tutorial |

### Requirement: 竖屏模式导航栏固定高度
在竖屏模式下，导航栏展开二级菜单后，整体导航栏窗口高度应保持不变。

#### Scenario: 竖屏模式二级菜单展开
- **WHEN** 用户在竖屏模式下展开二级菜单
- **THEN** 导航栏容器高度保持固定
- **AND** 二级菜单在固定高度区域内滚动显示

### Requirement: 横屏模式二级菜单
横屏模式下，二级菜单应以悬浮下拉形式展示。

#### Scenario: 横屏模式点击展开
- **WHEN** 用户在横屏模式点击一级导航项
- **THEN** 以悬浮下拉形式展示二级菜单
- **AND** 点击其他区域或再次点击时收起菜单

## MODIFIED Requirements

### Requirement: 导航菜单数据结构
原有的扁平菜单结构需要改为嵌套结构，支持二级菜单配置。

**原结构：**
```javascript
const pages = [
  { name: "index", path: "/", label: "首页" },
  { name: "newsroom", path: "/newsroom", label: "新闻" },
  // ... 其他扁平项
];
```

**新结构：**
```javascript
const navItems = [
  { name: "index", path: "/", label: "首页" },
  { 
    name: "community", 
    label: "社区", 
    children: [
      { name: "newsroom", path: "/newsroom", label: "新闻" },
      { name: "forum", path: "/forum", label: "论坛" },
      { name: "activities", path: "/activities", label: "活动" }
    ]
  },
  // ... 其他分组
];
```

## REMOVED Requirements
无移除的需求，保留所有现有功能（用户登录状态、消息通知等）。
