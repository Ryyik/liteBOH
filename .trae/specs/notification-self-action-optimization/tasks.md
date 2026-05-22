# 通知逻辑优化 - 实施计划

## [x] Task 1: 修改 createNotification 函数增加自操作检查
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 在 `src/utils/auth.js` 中的 `createNotification` 函数开头添加判断逻辑
  - 检查 `recipientId` 是否等于 `senderId`
  - 如果相等，直接返回成功状态，不插入数据库
  - 添加日志记录以便调试
- **Acceptance Criteria Addressed**: 发送者与接收者相同时不创建通知
- **Test Requirements**:
  - `unit-test` TR-1.1: 当 recipientId === senderId 时，函数返回成功且不插入数据库
  - `unit-test` TR-1.2: 当 recipientId !== senderId 时，函数正常创建通知

## [x] Task 2: 验证点赞通知逻辑
- **Priority**: P1
- **Depends On**: Task 1
- **Description**: 
  - 检查点赞通知是否通过 createNotification 函数创建
  - 如果是通过数据库触发器创建，需要修改触发器逻辑
  - 如果是通过代码调用 createNotification，验证 Task 1 的修改是否生效
- **Acceptance Criteria Addressed**: 点赞自己的帖子不产生通知
- **Test Requirements**:
  - `human-judgement` TR-2.1: 用户点赞自己的帖子后，通知列表无新通知
  - `human-judgement` TR-2.2: 用户点赞他人帖子后，对方正常收到通知

## [x] Task 3: 验证评论通知逻辑
- **Priority**: P1
- **Depends On**: Task 1
- **Description**: 
  - 检查评论通知是否通过 createNotification 函数创建
  - 如果是通过数据库触发器创建，需要修改触发器逻辑
  - 如果是通过代码调用 createNotification，验证 Task 1 的修改是否生效
- **Acceptance Criteria Addressed**: 评论自己的帖子不产生通知
- **Test Requirements**:
  - `human-judgement` TR-3.1: 用户评论自己的帖子后，通知列表无新通知
  - `human-judgement` TR-3.2: 用户评论他人帖子后，对方正常收到通知

## [x] Task 4: 整体功能验证
- **Priority**: P1
- **Depends On**: Task 2, Task 3
- **Description**: 
  - 验证所有自操作场景都不产生通知
  - 验证他人操作正常产生通知
  - 验证通知中心的未读计数正确
- **Acceptance Criteria Addressed**: 所有场景
- **Test Requirements**:
  - `human-judgement` TR-4.1: 评论自己的帖子无通知
  - `human-judgement` TR-4.2: 点赞自己的帖子无通知
  - `human-judgement` TR-4.3: 回复自己的评论无通知
  - `human-judgement` TR-4.4: 他人操作正常产生通知
  - `human-judgement` TR-4.5: 未读计数正确

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2, Task 3
