# 消息中心UI优化计划

## 项目背景

* **目标文件**: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Messages/index.vue`

* **样式文件**: `/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/user-center/Messages/style.scoped.css`

* **核心功能**: 通知列表、邮件列表、已读/未读状态管理、pushplus推送

## 现有功能分析

### 已读/未读功能现状

1. **单条标记已读**: `showDetail()` 函数中调用 `markNotificationAsRead()` API
2. **全部标记已读**: `markAllAsRead()` 函数调用 `markAllNotificationsAsRead()` API
3. **状态标识**: 通过 `msg.status === 'unread'` 判断，UI上显示蓝色圆点 `.x-unread-dot`
4. **未读数量**: 通过 `notificationStore` 的 `unreadCount` 统一管理
5. **邮件已读**: `selectMail()` 函数中单独处理邮件的已读状态

### Pushplus推送功能现状

1. **触发位置**: `notifications-api.js` 中的 `createNotification()` 函数
2. **推送类型**: like、comment、impression、message
3. **频率控制**: `pushplus.js` 中的 `canSend()` 函数控制（5秒间隔）
4. **Token管理**: `pushplus-api.js` 中的 `getUserPushplusToken()`

***

## 优化方案

### 阶段1: 未读状态视觉强化（不影响功能）

#### 1.1 左侧色条指示器

* **修改**: `.x-item.unread` 添加左侧蓝色色条

* **CSS**: `border-left: 3px solid #007aff;`

* **功能影响**: 无，仅视觉增强

#### 1.2 未读消息背景差异化

* **修改**: 未读消息使用轻微蓝色背景

* **CSS**: `background: linear-gradient(to right, rgba(0,122,255,0.03) 0%, #fff 100%);`

* **功能影响**: 无

#### 1.3 发件人名称加粗

* **修改**: `.x-item.unread .x-sender-name` 字体加粗

* **CSS**: `font-weight: 800;`

* **功能影响**: 无

### 阶段2: 标签筛选优化（不影响功能）

#### 2.1 添加未读数量徽章

* **修改**: 在每个标签后显示未读数量

* **实现**: 计算每个类型的未读数量，显示在标签上

* **功能影响**: 无，仅展示优化

#### 2.2 标签样式优化

* **修改**: 当前激活标签使用更明显的视觉指示

* **功能影响**: 无

### 阶段3: 消息项布局优化（不影响功能）

#### 3.1 增加间距和留白

* **修改**: `.x-list` 的 `gap` 从 12px 增加到 16px

* **修改**: `.x-item` 的 `padding` 优化

* **功能影响**: 无

#### 3.2 时间显示优化

* **修改**: 相对时间显示（已存在 `formatDate` 函数）

* **优化**: 调整时间文字颜色和位置

* **功能影响**: 无

#### 3.3 内容预览区域优化

* **修改**: `.x-preview-box` 样式优化，增加左边框

* **CSS**: 添加左侧蓝色边框，引用块样式

* **功能影响**: 无

### 阶段4: 交互体验优化（不影响功能）

#### 4.1 悬停效果增强

* **修改**: `.x-item:hover` 添加更明显的阴影和位移

* **功能影响**: 无

#### 4.2 空状态优化

* **修改**: `.x-empty` 视觉优化，保持现有逻辑

* **功能影响**: 无

### 阶段5: 邮件列表同步优化

#### 5.1 邮件未读状态样式统一

* **修改**: 邮件列表使用与通知列表一致的未读样式

* **功能影响**: 无

***

## 实施步骤

### 步骤1: 创建备份

* 备份 `index.vue` 和 `style.scoped.css`

### 步骤2: CSS样式优化

1. 添加未读状态左侧色条
2. 优化未读消息背景
3. 调整消息项间距
4. 优化预览框样式
5. 统一邮件列表未读样式

### 步骤3: Vue模板优化

1. 在标签上添加未读数量徽章
2. 优化时间显示位置
3. 调整头像和布局

### 步骤4: 功能验证

1. 验证已读/未读切换正常
2. 验证全部已读功能正常
3. 验证pushplus推送正常
4. 验证邮件功能正常

***

## 风险管控

### 核心功能保护清单

* [ ] `markNotificationAsRead()` API 调用保持不变

* [ ] `markAllNotificationsAsRead()` API 调用保持不变

* [ ] `msg.status` 状态判断逻辑保持不变

* [ ] `triggerUnreadRefresh()` 调用保持不变

* [ ] `createNotification()` 中的 pushplus 调用保持不变

* [ ] `sendPushplusForNotification()` 调用保持不变

* [ ] `sendPushplusForMessage()` 调用保持不变

### 禁止修改的内容

1. **JavaScript逻辑**: 不修改任何函数内部逻辑
2. **API调用**: 不修改任何API调用方式
3. **状态管理**: 不修改store的使用方式
4. **事件监听**: 不修改自定义事件

***

## 验证计划

### 功能验证

1. 打开消息中心，检查未读消息是否有视觉标识
2. 点击未读消息，检查是否标记为已读
3. 点击"全部已读"，检查所有消息是否变为已读
4. 发送测试通知，检查pushplus推送是否正常
5. 检查邮件列表的已读/未读功能

### UI验证

1. 检查未读消息的左侧色条
2. 检查标签上的未读数量徽章
3. 检查悬停效果
4. 检查响应式布局

***

## 回滚方案

如果出现问题，立即恢复备份文件：

* `index.vue` 恢复备份

* `style.scoped.css` 恢复备份

