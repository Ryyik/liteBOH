# Tasks

- [x] Task 1: 删除 OneSignal SDK 和配置文件
  - [x] SubTask 1.1: 从 `index.html` 移除 OneSignal SDK 引用和初始化代码
  - [x] SubTask 1.2: 删除 `public/OneSignalSDKWorker.js` 文件
  - [x] SubTask 1.3: 删除 `src/utils/onesignal.js` 文件

- [x] Task 2: 清理 useNotifications composable
  - [x] SubTask 2.1: 移除 `waitForOneSignalReady()` 函数
  - [x] SubTask 2.2: 移除 `getOneSignal()` 函数
  - [x] SubTask 2.3: 移除 `sendTag()` 和 `sendTags()` 函数
  - [x] SubTask 2.4: 移除 `loginOneSignalUser()` 和 `logoutOneSignalUser()` 函数
  - [x] SubTask 2.5: 简化 composable，只保留浏览器通知权限检查相关逻辑

- [x] Task 3: 清理 auth store
  - [x] SubTask 3.1: 移除 `loginOneSignalUser` 和 `logoutOneSignalUser` 导入
  - [x] SubTask 3.2: 移除 `syncOneSignalUser()` 函数
  - [x] SubTask 3.3: 移除登录流程中的 OneSignal 同步调用
  - [x] SubTask 3.4: 移除登出流程中的 OneSignal 登出调用
  - [x] SubTask 3.5: 移除 `initLoginState` 中的 OneSignal 同步逻辑
  - [x] SubTask 3.6: 移除 `resetState` 中的 OneSignal 登出调用

- [x] Task 4: 清理 notifications store
  - [x] SubTask 4.1: 移除 `sendPushNotification` 导入
  - [x] SubTask 4.2: 移除 `sendWebPush()` 函数
  - [x] SubTask 4.3: 移除通知监听器中的 `sendWebPush()` 调用
  - [x] SubTask 4.4: 从导出中移除 `sendWebPush`

- [x] Task 5: 清理 NotificationBell 组件
  - [x] SubTask 5.1: 移除 `authStore.syncOneSignalUser()` 调用
  - [x] SubTask 5.2: 简化订阅成功后的逻辑

- [x] Task 6: 清理环境变量
  - [x] SubTask 6.1: 从 `.env` 移除 `VITE_ONESIGNAL_REST_API_KEY`
  - [x] SubTask 6.2: 从 `.env.example` 移除 `VITE_ONESIGNAL_REST_API_KEY`

# Task Dependencies
- [Task 2] 可以与 [Task 1] 并行
- [Task 3] 依赖 [Task 2]
- [Task 4] 可以与 [Task 3] 并行
- [Task 5] 依赖 [Task 3]
- [Task 6] 可以与其他任务并行
