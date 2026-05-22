# Tasks

- [ ] Task 1: 移除 OneSignal 相关代码
  - [ ] SubTask 1.1: 从 `index.html` 移除 OneSignal SDK 引用和初始化代码
  - [ ] SubTask 1.2: 删除 `public/OneSignalSDKWorker.js` 文件
  - [ ] SubTask 1.3: 从 `.env` 和 `.env.example` 移除 OneSignal 相关环境变量

- [ ] Task 2: 创建个推工具模块
  - [ ] SubTask 2.1: 创建 `src/utils/getui.js` 文件，封装个推 REST API 调用
  - [ ] SubTask 2.2: 实现个推鉴权 Token 获取方法
  - [ ] SubTask 2.3: 实现发送通知给特定用户的方法 `sendPushNotification`
  - [ ] SubTask 2.4: 实现用户别名绑定方法 `bindUserAlias`
  - [ ] SubTask 2.5: 添加个推相关环境变量到 `.env.example`

- [ ] Task 3: 集成个推 Web Push SDK
  - [ ] SubTask 3.1: 在 `index.html` 添加个推 SDK 引用
  - [ ] SubTask 3.2: 配置个推 SDK 初始化参数
  - [ ] SubTask 3.3: 配置 Service Worker（如需要）

- [ ] Task 4: 重构 useNotifications composable
  - [ ] SubTask 4.1: 移除 OneSignal 相关方法
  - [ ] SubTask 4.2: 添加个推 CID 获取方法
  - [ ] SubTask 4.3: 重写 `loginGetuiUser(userId, userInfo)` 方法
  - [ ] SubTask 4.4: 重写 `logoutGetuiUser()` 方法
  - [ ] SubTask 4.5: 重写标签管理方法

- [ ] Task 5: 更新认证流程集成
  - [ ] SubTask 5.1: 更新 `src/stores/auth.js` 中的用户关联逻辑
  - [ ] SubTask 5.2: 更新 `src/stores/notifications.js` 中的推送发送逻辑
  - [ ] SubTask 5.3: 删除旧的 `src/utils/onesignal.js` 文件

- [ ] Task 6: 更新环境变量配置
  - [ ] SubTask 6.1: 添加个推配置到 `.env`
  - [ ] SubTask 6.2: 更新 `.env.example` 文档

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] 可以与 Task 2 并行
