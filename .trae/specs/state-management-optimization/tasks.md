# Tasks

- [x] Task 1: 安装并配置 pinia-plugin-persistedstate
  - [x] SubTask 1.1: 安装 pinia-plugin-persistedstate 依赖
  - [x] SubTask 1.2: 在 main.js 中配置插件
  - [x] SubTask 1.3: 为 authStore 添加持久化配置

- [x] Task 2: 扩展 authStore 用户状态管理
  - [x] SubTask 2.1: 添加缺失的用户字段 (bio, experience, tags)
  - [x] SubTask 2.2: 实现 updateUserProfile action 统一更新用户资料
  - [x] SubTask 2.3: 实现 resetState action 用于登出时重置状态
  - [x] SubTask 2.4: 完善 updateLocalState 方法，确保所有字段都被正确更新

- [x] Task 3: 扩展 notificationsStore
  - [x] SubTask 3.1: 实现 resetState action 用于登出时重置状态
  - [x] SubTask 3.2: 确保未读计数为唯一数据源

- [x] Task 4: 重构 Profile.vue 组件
  - [x] SubTask 4.1: 移除本地 profile ref，改用 storeToRefs 从 authStore 获取
  - [x] SubTask 4.2: 使用 authStore.updateUserProfile 更新用户资料
  - [x] SubTask 4.3: 移除深度 watch，改用具体属性监听

- [x] Task 5: 重构 UserSpace.vue 组件
  - [x] SubTask 5.1: 移除本地用户信息 ref (userBirthday, avatarUrl, joinDate 等)
  - [x] SubTask 5.2: 改用 storeToRefs 从 authStore 获取用户信息
  - [x] SubTask 5.3: 移除深度 watch userInfo，改用具体属性监听或事件驱动
  - [x] SubTask 5.4: 使用 authStore.updateUserProfile 更新用户资料

- [x] Task 6: 重构 Messages.vue 组件
  - [x] SubTask 6.1: 移除本地 messages ref，改用 notificationsStore
  - [x] SubTask 6.2: 确保未读计数从 notificationsStore.unreadCount 获取
  - [x] SubTask 6.3: 移除重复的未读计数计算逻辑

- [x] Task 7: 完善登出流程
  - [x] SubTask 7.1: 在 logout action 中调用 resetState
  - [x] SubTask 7.2: 确保清理 localStorage 中的相关数据
  - [x] SubTask 7.3: 停止所有实时订阅

- [x] Task 8: 验证和测试
  - [x] SubTask 8.1: 测试用户登录后状态持久化
  - [x] SubTask 8.2: 测试页面刷新后状态恢复
  - [x] SubTask 8.3: 测试用户登出后状态清理
  - [x] SubTask 8.4: 测试用户资料更新后多组件同步

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 2]
- [Task 6] depends on [Task 3]
- [Task 7] depends on [Task 2, Task 3]
- [Task 8] depends on [Task 4, Task 5, Task 6, Task 7]

# Parallelizable Tasks
- Task 2 和 Task 3 可以并行执行
- Task 4、Task 5、Task 6 在各自依赖完成后可以并行执行
