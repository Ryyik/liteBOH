# Checklist

## OneSignal 移除
- [ ] OneSignal SDK 已从 index.html 移除
- [ ] OneSignalSDKWorker.js 文件已删除
- [ ] OneSignal 相关环境变量已移除
- [ ] onesignal.js 文件已删除或重命名

## 个推 SDK 集成
- [ ] 个推 SDK 已正确加载
- [ ] 个推 SDK 初始化成功
- [ ] Service Worker 配置正确（如需要）

## 用户关联功能
- [ ] 用户登录后 CID 与用户 ID 成功绑定
- [ ] 用户登出后绑定关系解除
- [ ] 页面刷新后用户关联状态保持

## Web Push 通知
- [ ] 点赞通知能触发 Web Push
- [ ] 评论通知能触发 Web Push
- [ ] 印象通知能触发 Web Push
- [ ] 私信通知能触发 Web Push
- [ ] 用户未订阅 Push 时不报错

## 站内通知兼容
- [ ] 原有 Toast 提示功能正常
- [ ] 未读计数显示正确
- [ ] 实时通知监听正常
- [ ] 通知列表加载正常

## 环境配置
- [ ] .env 包含所有个推配置
- [ ] .env.example 已更新
