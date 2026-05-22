# Checklist

## OneSignal 用户关联
- [x] 用户登录后 OneSignal 后台显示 External User ID
- [x] 用户登出后 External User ID 被移除
- [x] 页面刷新后用户关联状态保持

## Web Push 通知
- [x] 点赞通知能触发 Web Push
- [x] 评论通知能触发 Web Push
- [x] 印象通知能触发 Web Push
- [x] 私信通知能触发 Web Push
- [x] 用户未订阅 Push 时不报错

## 站内通知兼容
- [x] 原有 Toast 提示功能正常
- [x] 未读计数显示正确
- [x] 实时通知监听正常
- [x] 通知列表加载正常

## 环境配置
- [x] .env 包含 VITE_ONESIGNAL_REST_API_KEY
- [x] .env.example 已更新
