# Tasks

- [x] Task 1: 在 UserCenterV2.vue 中引入通知 store 并获取未读计数
  - [x] SubTask 1.1: 导入 useNotificationStore 和 storeToRefs
  - [x] SubTask 1.2: 获取 unreadCount 响应式引用
  - [x] SubTask 1.3: 创建 hasUnreadMessages computed 属性

- [x] Task 2: 在底部导航"消息"项上添加红点组件
  - [x] SubTask 2.1: 在消息导航项模板中添加红点元素
  - [x] SubTask 2.2: 使用 v-if 控制红点显示（hasUnreadMessages）
  - [x] SubTask 2.3: 显示未读数量（超过99显示99+）

- [x] Task 3: 添加红点样式
  - [x] SubTask 3.1: 添加红点基础样式（参考 UnifiedNavbar.vue）
  - [x] SubTask 3.2: 确保红点位置正确（相对于导航项）
  - [x] SubTask 3.3: 添加响应式适配

- [x] Task 4: 添加事件监听实现实时更新
  - [x] SubTask 4.1: 在 onMounted 中添加 boh_unread_refresh 事件监听
  - [x] SubTask 4.2: 在 onUnmounted 中移除事件监听
  - [x] SubTask 4.3: 调用 refreshUnreadCount 刷新未读计数

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 1
