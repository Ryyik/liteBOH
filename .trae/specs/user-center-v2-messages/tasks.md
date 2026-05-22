# 个人空间V2消息页面 - 实施计划

## [x] Task 1: 修改 Messages.vue 组件支持极简模式
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 添加 `minimal` props 控制极简模式
  - 当 minimal=true 时，隐藏返回按钮和"通知"标题
  - 调整样式适配嵌入布局（移除多余padding和margin）
- **Acceptance Criteria Addressed**: 极简模式、全屏布局
- **Test Requirements**:
  - `human-judgement` TR-1.1: minimal=true 时隐藏标题栏
  - `human-judgement` TR-1.2: minimal=false 时正常显示标题栏
  - `human-judgement` TR-1.3: 样式适配无溢出或错位

## [x] Task 2: 在 UserCenterV2.vue 中引入 Messages 组件
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 导入 Messages.vue 组件
  - 在 messages tab 中使用 Messages 组件替换占位符
  - 传递 minimal=true 启用极简模式
- **Acceptance Criteria Addressed**: 消息中心组件集成、正常显示
- **Test Requirements**:
  - `human-judgement` TR-2.1: 切换到消息 tab 显示消息列表
  - `human-judgement` TR-2.2: 消息列表正常加载
  - `human-judgement` TR-2.3: 与 UserCenterV2 风格一致

## [x] Task 3: 验证交互功能
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 验证点击消息项显示详情抽屉
  - 验证"全部已读"功能正常工作
  - 验证标签筛选（全部/点赞/回复/印象）正常工作
- **Acceptance Criteria Addressed**: 交互功能、标记已读
- **Test Requirements**:
  - `human-judgement` TR-3.1: 点击消息项弹出详情抽屉
  - `human-judgement` TR-3.2: 全部已读按钮正常工作
  - `human-judgement` TR-3.3: 标签筛选正常工作

## [x] Task 4: 多设备适配验证
- **Priority**: P1
- **Depends On**: Task 2
- **Description**: 
  - 验证桌面端（>1024px）显示正常
  - 验证平板（768px-1024px）显示正常
  - 验证移动端（<768px）显示正常
- **Acceptance Criteria Addressed**: 全屏布局
- **Test Requirements**:
  - `human-judgement` TR-4.1: 桌面端布局正常
  - `human-judgement` TR-4.2: 平板布局正常
  - `human-judgement` TR-4.3: 移动端布局正常

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2
