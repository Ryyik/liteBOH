# Tasks

- [x] Task 1: 创建 OneSignal API 服务模块
  - [x] SubTask 1.1: 创建 `src/utils/onesignal.js` 文件，封装 OneSignal REST API 调用
  - [x] SubTask 1.2: 实现发送通知给特定用户的方法 `sendPushNotification`
  - [x] SubTask 1.3: 添加环境变量 `VITE_ONESIGNAL_REST_API_KEY` 到 `.env.example`

- [x] Task 2: 扩展 useNotifications composable
  - [x] SubTask 2.1: 添加 `loginOneSignalUser(userId, userInfo)` 方法，关联用户 ID 和设置标签
  - [x] SubTask 2.2: 添加 `logoutOneSignalUser()` 方法，解除用户关联
  - [x] SubTask 2.3: 导出新增方法供外部使用

- [x] Task 3: 集成到用户认证流程
  - [x] SubTask 3.1: 在用户登录成功后调用 `loginOneSignalUser`
  - [x] SubTask 3.2: 在用户登出时调用 `logoutOneSignalUser`
  - [x] SubTask 3.3: 处理页面刷新时的用户关联恢复

- [x] Task 4: 集成 Web Push 到通知系统
  - [x] SubTask 4.1: 在 `notifications.js` store 中添加 `sendWebPush` 方法
  - [x] SubTask 4.2: 在收到实时通知时调用 Web Push 发送
  - [x] SubTask 4.3: 处理发送失败情况，确保不影响站内通知

- [x] Task 5: 更新环境变量和配置
  - [x] SubTask 5.1: 添加 `VITE_ONESIGNAL_REST_API_KEY` 到 `.env`
  - [x] SubTask 5.2: 更新 `.env.example` 文档

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 1]
