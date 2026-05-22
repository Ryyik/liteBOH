# 个人中心迁移与整合 - 实施计划

## [x] Task 1: 创建新的个人空间页面 UserSpace.vue
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 基于 UserCenterV2.vue 创建 UserSpace.vue
  - 将"个人"标签页内容替换为 UserInfo.vue 的完整功能
  - 包含：头像管理、生日设置、加群时间、功能入口卡片、退出登录等
  - 更新页面标题为"个人空间"
- **Acceptance Criteria Addressed**: 个人空间页面整合需求
- **Test Requirements**:
  - `human-judgement` TR-1.1: UserSpace.vue 文件创建成功
  - `human-judgement` TR-1.2: "个人"标签页包含所有 UserInfo.vue 功能
  - `human-judgement` TR-1.3: 页面标题显示为"个人空间"

## [x] Task 2: 更新路由配置
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 添加新路由 `/user-space` 指向 UserSpace.vue
  - 将 `/user-center-v2` 重定向到 `/user-space`
  - 将 `/user-center/info` 重定向到 `/user-space`
  - 保留 `/user-center/*` 其他子路由不变
- **Acceptance Criteria Addressed**: 旧路由重定向需求
- **Test Requirements**:
  - `human-judgement` TR-2.1: 访问 `/user-space` 显示个人空间页面
  - `human-judgement` TR-2.2: 访问 `/user-center-v2` 重定向到 `/user-space`
  - `human-judgement` TR-2.3: 访问 `/user-center/info` 重定向到 `/user-space`

## [x] Task 3: 更新 UnifiedNavbar.vue 导航入口
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 查找所有指向 `/user-center/info` 或 `/user-center-v2` 的链接
  - 更新为 `/user-space`
  - 更新链接文字为"个人空间"
- **Acceptance Criteria Addressed**: 导航入口更新需求
- **Test Requirements**:
  - `human-judgement` TR-3.1: 导航栏入口链接正确
  - `human-judgement` TR-3.2: 链接文字显示为"个人空间"

## [x] Task 4: 更新 UserCenterNav.vue 导航链接
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 更新"个人信息"链接指向 `/user-space`
  - 或考虑移除该导航组件（因为功能已整合）
- **Acceptance Criteria Addressed**: 导航入口更新需求
- **Test Requirements**:
  - `human-judgement` TR-4.1: 导航链接指向正确路由

## [x] Task 5: 更新 UserCenterIndex.vue 导航页面
- **Priority**: P1
- **Depends On**: Task 2
- **Description**: 
  - 更新个人中心导航页面的链接
  - 移除对废弃页面的引用
  - 更新路由路径显示
- **Acceptance Criteria Addressed**: 导航入口更新需求
- **Test Requirements**:
  - `human-judgement` TR-5.1: 导航页面链接正确

## [x] Task 6: 清理废弃代码
- **Priority**: P2
- **Depends On**: Task 1, Task 2, Task 3, Task 4, Task 5
- **Description**: 
  - 删除 UserCenterV2.vue 文件（已重命名为 UserSpace.vue）
  - 保留 UserInfo.vue 文件但标记为废弃（添加注释）
  - 清理未使用的导入和代码
- **Acceptance Criteria Addressed**: 代码整洁
- **Test Requirements**:
  - `human-judgement` TR-6.1: 无死代码残留
  - `human-judgement` TR-6.2: 项目可正常编译运行

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 2]
- [Task 6] depends on [Task 1, Task 2, Task 3, Task 4, Task 5]