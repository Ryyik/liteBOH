# 消息中心帖子回复交互增强 - 产品需求文档

## Why
当前消息中心的通知详情页面只能查看通知内容，但用户在收到帖子回复通知时，无法直接在通知详情中回复评论者，也无法快速跳转到原帖查看上下文。这导致用户需要额外操作才能完成互动，降低了用户体验。

## What Changes
- 在通知详情抽屉中为评论类型通知添加"回复"功能按钮
- 在通知详情抽屉中为评论/点赞类型通知添加"查看原文"按钮，支持跳转到帖子详情页
- 复用现有的评论创建逻辑，确保回复功能与帖子详情页一致
- 回复成功后发送通知给被回复的用户

## Impact
- Affected specs: user-center-v2-messages
- Affected code: 
  - src/views/user-center/Messages.vue
  - src/utils/auth.js (可能需要确认createComment函数)

## ADDED Requirements

### Requirement: 评论通知快速回复功能
The system SHALL 在评论类型通知的详情抽屉中提供回复功能

#### Scenario: 显示回复按钮
- **WHEN** 用户查看评论类型通知的详情
- **THEN** 在通知详情抽屉底部显示"回复"按钮

#### Scenario: 回复输入框展开
- **WHEN** 用户点击"回复"按钮
- **THEN** 展开回复输入框，预填被回复用户的用户名（如 @username）

#### Scenario: 提交回复
- **WHEN** 用户输入回复内容并提交
- **THEN** 系统创建评论并发送通知给原评论者
- **AND** 显示回复成功提示
- **AND** 关闭回复输入框

#### Scenario: 回复内容审查
- **WHEN** 用户提交回复
- **THEN** 系统进行内容审查（复用现有quickModerate逻辑）
- **IF** 内容违规
- **THEN** 显示审查不通过提示，阻止发布

### Requirement: 查看原文跳转功能
The system SHALL 在评论/点赞类型通知的详情抽屉中提供跳转到原帖的功能

#### Scenario: 显示查看原文按钮
- **WHEN** 用户查看评论或点赞类型通知的详情
- **AND** 通知关联了帖子（post_id存在）
- **THEN** 在通知详情抽屉底部显示"查看原文"按钮

#### Scenario: 跳转到帖子详情
- **WHEN** 用户点击"查看原文"按钮
- **THEN** 关闭通知详情抽屉
- **AND** 导航到帖子详情页面（/forum/post/:id）

#### Scenario: 无关联帖子时隐藏按钮
- **WHEN** 通知没有关联帖子（post_id为空）
- **THEN** 不显示"查看原文"按钮

### Requirement: 回复操作按钮布局
The system SHALL 合理布局回复和查看原文按钮

#### Scenario: 按钮排列
- **WHEN** 评论类型通知同时显示"回复"和"查看原文"按钮
- **THEN** 两个按钮水平排列，"回复"按钮在左侧，"查看原文"按钮在右侧

#### Scenario: 按钮样式一致性
- **WHEN** 显示操作按钮
- **THEN** 按钮样式与现有邮件详情的操作按钮保持一致

## MODIFIED Requirements
无

## REMOVED Requirements
无
