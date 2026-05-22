# Tasks

- [x] Task 1: 重构导航菜单数据结构
  - [x] SubTask 1.1: 修改 pages 数组为嵌套结构，支持二级菜单
  - [x] SubTask 1.2: 添加展开状态管理变量（记录当前展开的一级菜单）
  - [x] SubTask 1.3: 实现点击展开/收起二级菜单的逻辑函数

- [x] Task 2: 重构桌面端导航栏模板
  - [x] SubTask 2.1: 修改 nav-menu 模板，支持一级菜单和二级菜单的渲染
  - [x] SubTask 2.2: 添加二级菜单展开指示器（箭头图标）
  - [x] SubTask 2.3: 实现点击展开二级菜单的交互

- [x] Task 3: 重构移动端导航栏模板
  - [x] SubTask 3.1: 修改 nav-menu-mobile 模板，支持嵌套二级菜单
  - [x] SubTask 3.2: 实现竖屏模式下二级菜单在固定高度区域内展开
  - [x] SubTask 3.3: 确保展开二级菜单时导航栏窗口大小不变

- [x] Task 4: 添加二级菜单样式
  - [x] SubTask 4.1: 添加桌面端二级菜单下拉样式（悬浮显示）
  - [x] SubTask 4.2: 添加移动端二级菜单样式（内嵌展开）
  - [x] SubTask 4.3: 添加展开/收起动画效果
  - [x] SubTask 4.4: 添加竖屏模式固定高度样式

- [x] Task 5: 添加点击外部关闭菜单功能
  - [x] SubTask 5.1: 实现点击导航栏外部区域关闭展开的二级菜单

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1
- Task 4 依赖 Task 2 和 Task 3
- Task 5 依赖 Task 2
