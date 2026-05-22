# 专业级视频拍摄脚本编辑器 - 验证清单

## 数据库和数据持久化验证
- [x] Checkpoint 1: 视频脚本项目数据库表结构创建成功
- [x] Checkpoint 2: RLS 策略配置正确，用户只能访问自己的项目
- [ ] Checkpoint 3: 项目数据可以正确保存到 Supabase
- [ ] Checkpoint 4: 项目数据可以从 Supabase 正确加载
- [x] Checkpoint 5: 每个用户最多只能创建3个云端项目
- [x] Checkpoint 6: 数据库触发器/约束正确限制项目数量

## 核心编辑器功能验证
- [x] Checkpoint 7: 多面板布局正确显示且可调整大小
- [x] Checkpoint 8: 可以创建、打开、删除项目
- [x] Checkpoint 9: 可以添加、删除、编辑场景
- [x] Checkpoint 10: 可以添加、删除、编辑镜头
- [x] Checkpoint 11: 场景和镜头可以重排序
- [x] Checkpoint 12: 撤销/重做功能正常工作
- [x] Checkpoint 13: 富文本基础编辑工具栏可用
- [x] Checkpoint 14: 搜索和替换功能正常
- [x] Checkpoint 15: 编辑界面固定白色主题且风格一致
- [x] Checkpoint 16: 项目数量配额在界面上正确显示
- [x] Checkpoint 17: 达到3个项目上限时无法创建新项目

## 时间线可视化验证
- [x] Checkpoint 18: 时间线正确显示场景和镜头
- [x] Checkpoint 19: 场景/镜头可以在时间线上拖拽重排序
- [x] Checkpoint 20: 时间缩放功能正常
- [x] Checkpoint 21: 时间线与编辑区数据同步

## AI 功能验证
- [x] Checkpoint 22: AI 智能脚本建议功能可以正常调用
- [x] Checkpoint 23: AI 生成的脚本建议符合上下文
- [x] Checkpoint 24: 场景自动识别功能可以正确识别场景要素
- [x] Checkpoint 25: 镜头类型推荐功能提供合理的推荐并支持一键应用
- [x] Checkpoint 26: 对白优化功能支持原文/优化版对比并可部分接受
- [x] Checkpoint 27: 拍摄提示生成功能提供详细实用的指导并可保存到镜头元数据
- [x] Checkpoint 28: AI 功能错误处理正常
- [x] Checkpoint 29: AI 对话式交互面板可以正常使用

## 导出功能验证
- [x] Checkpoint 30: Markdown 格式导出成功且格式正确
- [x] Checkpoint 31: PDF 格式导出成功
- [x] Checkpoint 32: 行业标准脚本格式导出成功（Fountain）

## 性能和用户体验验证
- [x] Checkpoint 33: 界面响应时间 < 100ms
- [ ] Checkpoint 34: 100+场景的大脚本编辑流畅
- [x] Checkpoint 35: 自动保存功能正常工作
- [ ] Checkpoint 36: 无障碍支持符合 WCAG 2.1 AA 标准
- [x] Checkpoint 37: 界面布局符合专业非线性编辑软件风格
- [x] Checkpoint 38: 操作流程直观高效

## 集成验证
- [x] Checkpoint 39: 编辑器与现有路由系统正确集成
- [x] Checkpoint 40: 编辑器与现有 BOHAI 生态系统无缝集成
- [x] Checkpoint 41: Pinia Store 状态管理正确工作
