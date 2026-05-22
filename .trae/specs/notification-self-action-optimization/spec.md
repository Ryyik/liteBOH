# 通知逻辑优化 - 用户评论自己帖子不发送通知

## Why
当前系统中，用户评论自己的帖子时会产生一条通知发送给自己，这是不必要的通知噪音。用户不需要收到自己对自己内容的操作通知，这会降低用户体验。

## What Changes
- 在评论通知创建逻辑中添加判断：如果评论者是帖子作者，则不创建通知
- 在点赞通知创建逻辑中添加判断：如果点赞者是帖子作者，则不创建通知
- 修改 `createNotification` 函数或相关触发逻辑，增加发送者和接收者是否相同的检查

## Impact
- Affected specs: user-center-v2-messages, message-center-reply-enhancement
- Affected code: 
  - src/utils/auth.js (createNotification 函数)
  - 数据库触发器 (如果通知是通过触发器创建的)

## ADDED Requirements

### Requirement: 自操作不产生通知
The system SHALL 在用户对自己的内容进行操作时不产生通知

#### Scenario: 评论自己的帖子不产生通知
- **WHEN** 用户评论自己发布的帖子
- **THEN** 系统不创建评论类型的通知
- **AND** 用户不会在自己的通知列表中看到该操作的通知

#### Scenario: 点赞自己的帖子不产生通知
- **WHEN** 用户点赞自己发布的帖子
- **THEN** 系统不创建点赞类型的通知
- **AND** 用户不会在自己的通知列表中看到该操作的通知

#### Scenario: 回复自己的评论不产生通知
- **WHEN** 用户回复自己的评论
- **THEN** 系统不创建评论类型的通知

#### Scenario: 他人操作正常产生通知
- **WHEN** 用户A评论或点赞用户B的帖子
- **THEN** 系统正常创建通知给用户B
- **AND** 用户B能在通知列表中看到该通知

## MODIFIED Requirements

### Requirement: createNotification 函数增加自操作检查
The system SHALL 在 createNotification 函数中增加发送者和接收者是否相同的检查

#### Scenario: 发送者与接收者相同时不创建通知
- **WHEN** 调用 createNotification 函数
- **AND** recipient_id 等于 sender_id
- **THEN** 函数直接返回，不插入通知记录
- **AND** 返回成功状态（无错误）

## REMOVED Requirements
无
