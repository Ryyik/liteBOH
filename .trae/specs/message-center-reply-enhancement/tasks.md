# 消息中心帖子回复交互增强 - 实施计划

## [x] Task 1: 在通知详情抽屉中添加操作按钮区域
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 Messages.vue 的通知详情抽屉（x-detail-drawer）中添加操作按钮区域
  - 为评论类型通知添加"回复"按钮
  - 为评论/点赞类型通知添加"查看原文"按钮
  - 按钮样式与邮件详情的操作按钮保持一致
- **Acceptance Criteria Addressed**: 显示回复按钮、显示查看原文按钮、按钮排列、按钮样式一致性
- **Test Requirements**:
  - `human-judgement` TR-1.1: 评论通知显示"回复"和"查看原文"按钮
  - `human-judgement` TR-1.2: 点赞通知显示"查看原文"按钮
  - `human-judgement` TR-1.3: 其他类型通知不显示操作按钮
  - `human-judgement` TR-1.4: 无关联帖子时不显示"查看原文"按钮

## [x] Task 2: 实现查看原文跳转功能
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 实现"查看原文"按钮点击事件
  - 关闭通知详情抽屉
  - 使用 router.push 跳转到帖子详情页（/forum/post/:id）
  - 从 selectedMessage.post.id 获取帖子ID
- **Acceptance Criteria Addressed**: 跳转到帖子详情
- **Test Requirements**:
  - `human-judgement` TR-2.1: 点击"查看原文"后关闭抽屉
  - `human-judgement` TR-2.2: 正确跳转到帖子详情页
  - `human-judgement` TR-2.3: 帖子详情页显示正确内容

## [x] Task 3: 实现回复输入框展开功能
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 添加回复输入框的展开/收起状态管理
  - 点击"回复"按钮时展开输入框
  - 输入框预填被回复用户的用户名（如 @username）
  - 添加取消和发送按钮
- **Acceptance Criteria Addressed**: 回复输入框展开
- **Test Requirements**:
  - `human-judgement` TR-3.1: 点击"回复"按钮展开输入框
  - `human-judgement` TR-3.2: 输入框预填被回复用户名
  - `human-judgement` TR-3.3: 取消按钮可收起输入框

## [x] Task 4: 实现回复提交功能
- **Priority**: P0
- **Depends On**: Task 3
- **Description**: 
  - 导入 createComment 函数和 quickModerate 函数
  - 实现回复提交逻辑
  - 调用内容审查 API
  - 创建评论（设置 parent_id 为原评论ID，reply_to_username 为原评论者用户名）
  - 显示成功/失败提示
- **Acceptance Criteria Addressed**: 提交回复、回复内容审查
- **Test Requirements**:
  - `human-judgement` TR-4.1: 正常回复成功发布
  - `human-judgement` TR-4.2: 违规内容被拦截
  - `human-judgement` TR-4.3: 回复成功后输入框关闭
  - `human-judgement` TR-4.4: 原评论者收到通知

## [x] Task 5: 验证整体功能
- **Priority**: P1
- **Depends On**: Task 2, Task 4
- **Description**: 
  - 验证评论通知的完整回复流程
  - 验证查看原文跳转功能
  - 验证按钮布局和样式
  - 验证移动端响应式布局
- **Acceptance Criteria Addressed**: 所有场景
- **Test Requirements**:
  - `human-judgement` TR-5.1: 完整回复流程正常工作
  - `human-judgement` TR-5.2: 查看原文跳转正常工作
  - `human-judgement` TR-5.3: 移动端布局正常

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 3
- Task 5 depends on Task 2, Task 4
