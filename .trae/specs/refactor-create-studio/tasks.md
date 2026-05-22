# Create Studio 重构 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 重构项目管理面板（简化版）
- **Priority**: P0
- **Depends On**: None
- **Description**: 
  - 简化现有的StudioHub，保留核心功能：项目列表、创建新项目、打开项目
  - 移除团队项目、复杂侧边栏等功能
  - 保持云端/本地项目展示
- **Acceptance Criteria Addressed**: [AC-1]
- **Test Requirements**:
  - `programmatic` TR-1.1: 项目列表正确加载并展示
  - `programmatic` TR-1.2: 创建新项目功能正常
  - `programmatic` TR-1.3: 点击项目可正确导航到编辑页面
- **Notes**: 重用现有studioData.js中的数据结构

## [ ] Task 2: 创建新的三栏编辑页面组件
- **Priority**: P0
- **Depends On**: Task 1
- **Description**: 
  - 创建全新的编辑器组件，替代现有的CreatorStudioEditor
  - 实现三栏布局框架（左、中、右）
  - 左侧：AI对话面板
  - 中间：分镜编写区域（上方）+ 项目思路编写区（下方）
  - 右侧：保存与导出面板
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `human-judgement` TR-2.1: 三栏布局视觉呈现正确
  - `programmatic` TR-2.2: 各面板容器正确渲染
- **Notes**: 保持响应式布局

## [ ] Task 3: 实现分镜编写功能
- **Priority**: P0
- **Depends On**: Task 2
- **Description**: 
  - 实现卡片模式展示分镜
  - 实现表格模式展示分镜
  - 支持切换视图模式
  - 支持新增、删除、编辑分镜
  - 下方添加项目思路编写区（textarea）
- **Acceptance Criteria Addressed**: [AC-3]
- **Test Requirements**:
  - `programmatic` TR-3.1: 卡片和表格模式可以切换
  - `programmatic` TR-3.2: 分镜数据可以正确编辑和保存
  - `programmatic` TR-3.3: 项目思路区域可以编辑
- **Notes**: 复用现有分镜数据结构

## [ ] Task 4: 实现卡片模式拖动排序
- **Priority**: P1
- **Depends On**: Task 3
- **Description**: 
  - 在卡片模式下实现拖动功能
  - 支持拖放调整分镜顺序
  - 排序后自动保存
- **Acceptance Criteria Addressed**: [AC-4]
- **Test Requirements**:
  - `programmatic` TR-4.1: 拖动操作可以改变分镜顺序
  - `programmatic` TR-4.2: 顺序变化后正确保存
- **Notes**: 使用原生HTML5 drag & drop API

## [ ] Task 5: 实现导出功能（txt + Excel）
- **Priority**: P1
- **Depends On**: Task 3
- **Description**: 
  - 实现导出为txt格式功能（包含项目信息和分镜）
  - 实现分镜表导出为Excel功能
  - 添加必要的导出库（如xlsx）
- **Acceptance Criteria Addressed**: [AC-5, AC-6]
- **Test Requirements**:
  - `programmatic` TR-5.1: 点击导出txt可以下载包含完整内容的文件
  - `programmatic` TR-5.2: 点击导出Excel可以下载分镜表文件
- **Notes**: 考虑使用xlsx库用于Excel导出

## [ ] Task 6: 实现右侧保存与导出面板
- **Priority**: P1
- **Depends On**: Task 2
- **Description**: 
  - 实现保存按钮和状态显示
  - 集成导出功能按钮
  - 显示项目基本信息
- **Acceptance Criteria Addressed**: [AC-2, AC-5, AC-6]
- **Test Requirements**:
  - `programmatic` TR-6.1: 保存按钮可以触发保存
  - `programmatic` TR-6.2: 保存状态正确显示
  - `programmatic` TR-6.3: 导出按钮正常工作

## [ ] Task 7: 实现左侧AI对话面板
- **Priority**: P2
- **Depends On**: Task 2
- **Description**: 
  - 实现简化的AI对话界面
  - 支持发送消息和显示回复
  - 可以复用现有BOHAI逻辑或简化实现
- **Acceptance Criteria Addressed**: [AC-2]
- **Test Requirements**:
  - `human-judgement` TR-7.1: AI对话界面完整呈现
  - `programmatic` TR-7.2: 可以发送消息
- **Notes**: 暂不实现复杂的AI功能，先确保界面完整

## [ ] Task 8: 完善云端保存逻辑
- **Priority**: P0
- **Depends On**: Task 3, Task 6
- **Description**: 
  - 确保修改后的数据正确保存到云端
  - 实现自动保存（防抖）
  - 显示保存状态（已保存/保存中/保存失败）
- **Acceptance Criteria Addressed**: [AC-7]
- **Test Requirements**:
  - `programmatic` TR-8.1: 修改内容后可以正确保存到云端
  - `programmatic` TR-8.2: 保存状态正确显示
  - `programmatic` TR-8.3: 刷新页面后数据正确恢复
- **Notes**: 重用现有的creator-workflow-api.js和studioData.js

## [x] Task 9: 更新路由配置
- **Priority**: P1
- **Depends On**: Task 1, Task 2
- **Description**: 
  - 更新路由指向新的组件
  - 保持URL结构不变，确保项目ID参数正确传递
- **Acceptance Criteria Addressed**: [AC-1, AC-2]
- **Test Requirements**:
  - `programmatic` TR-9.1: 路由正确导航到项目管理面板
  - `programmatic` TR-9.2: 项目ID路由正确打开编辑页面
