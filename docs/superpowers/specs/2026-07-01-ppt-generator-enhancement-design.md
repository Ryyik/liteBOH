# PPT生成器增强设计方案

## 设计日期
2026-07-01

## 需求背景
当前实验室PPT生成器功能过于简单，存在以下限制：
- 只有4种基本布局类型（封面、内容页、两栏对比、结束页）
- 只有纯文字内容（要点列表），缺少可视化元素
- 预览功能仅显示结构化文本，缺少视觉化预览
- 生成后无法编辑修改

用户需求：
1. 内容丰富度 - 需要图表、流程图、时间线等可视化元素
2. 布局多样性 - 需要更多专业布局类型
3. 预览能力 - 需要图标和示意图的UI预览

## 设计方案（渐进增强版）

### 1. 新增布局类型

#### 1.1 chart - 数据图表页
- 支持柱状图（bar chart）和饼图（pie chart）
- AI自动生成模拟数据
- JSON格式：
```json
{
  "type": "chart",
  "title": "数据分析",
  "chartType": "bar",
  "data": {
    "categories": ["项目A", "项目B", "项目C"],
    "values": [85, 92, 78]
  }
}
```

#### 1.2 timeline - 时间线页
- 展示里程碑或流程步骤
- JSON格式：
```json
{
  "type": "timeline",
  "title": "项目里程碑",
  "events": [
    {"date": "2024Q1", "event": "启动阶段"},
    {"date": "2024Q2", "event": "开发阶段"}
  ]
}
```

#### 1.3 image-text - 图文混排页
- 支持左图右文或上图下文布局
- 使用占位符提示用户插入图片
- JSON格式：
```json
{
  "type": "image-text",
  "title": "产品展示",
  "layout": "left-image",
  "imagePlaceholder": "在此插入产品图片",
  "content": ["核心功能1", "核心功能2"]
}
```

#### 1.4 quote - 引用页
- 大字引用 + 说明文字
- JSON格式：
```json
{
  "type": "quote",
  "quote": "创新是引领发展的第一动力",
  "author": "习近平",
  "context": "关于科技创新的重要论述"
}
```

### 2. 预览功能增强

由于 pptxgenjs 不支持直接生成图片预览，采用增强型结构预览方案：

#### 2.1 图标化预览
为每种布局类型添加对应图标：
- chart → 📊 图表图标
- timeline → 📅 时间线图标
- image-text → 🖼️ 图片图标
- quote → 💬 引用图标

#### 2.2 可视化示意图
- 时间线：绘制简化时间轴示意图（使用CSS绘制）
- 图表：显示简化柱状图示意（使用CSS绘制）
- 图文：显示图片占位框 + 文字区域

### 3. AI Prompt 扩展

修改 `buildPrompt()` 函数，引导AI识别特殊布局场景：
- 主题涉及"数据分析、对比、统计" → 生成 chart 类型
- 主题涉及"历程、演进、时间" → 生成 timeline 类型
- 主题涉及"展示、产品、案例" → 生成 image-text 类型
- 主题涉及"理念、金句、核心思想" → 生成 quote 类型

### 4. 技术实现细节

#### 4.1 pptxgenjs 图表支持
pptxgenjs 原生支持图表功能：
```javascript
slide.addChart(pptx.ChartType.bar, data, options)
```

#### 4.2 时间线实现
使用形状和文本组合绘制时间线：
```javascript
// 绘制时间轴线条
slide.addShape(pptx.ShapeType.line, {...})
// 添加时间节点标记
slide.addShape(pptx.ShapeType.ellipse, {...})
```

#### 4.3 图文混排实现
左侧添加图片占位框，右侧添加文本：
```javascript
slide.addText('图片占位符', {
  x: 0.5, y: 1.5, w: 3, h: 4,
  shape: pptx.ShapeType.rect
})
```

## 文件改动清单

1. **`src/views/Lab/composables/usePPTGenerator.js`**
   - 添加 `renderChartSlide()` 函数
   - 添加 `renderTimelineSlide()` 函数
   - 添加 `renderImageTextSlide()` 函数
   - 添加 `renderQuoteSlide()` 函数

2. **`src/views/Lab/components/PPTGenerator.vue`**
   - 增强预览区域，添加图标和可视化示意图
   - 为每种新布局类型添加专用预览UI

3. **`src/views/Lab/config/ppt-templates.js`**
   - 为新布局类型添加样式配置（图表颜色、时间线样式等）

4. **`src/views/Lab/composables/usePPTGenerator.js`**
   - 扩展 `buildPrompt()` 函数，添加布局识别规则

## 成功标准
1. 生成的PPT包含至少1种新布局类型（图表、时间线、图文、引用）
2. 预览区域显示图标和可视化示意图，而非纯文字
3. 下载的PPT文件包含正确的可视化元素
4. AI能够根据主题自动识别合适的布局类型

## 风险与限制
1. pptxgenjs 图表功能有限，不支持复杂图表（如组合图、堆叠图）
2. 图片占位符需要用户手动插入真实图片
3. 预览功能为结构预览，非真实PPT渲染预览
4. AI生成的数据为模拟数据，需用户根据实际情况调整

## 实施计划
Phase 1: 扩展布局渲染函数（1-2小时）
Phase 2: 增强预览UI（1小时）
Phase 3: 扩展AI Prompt（30分钟）
Phase 4: 测试验证（30分钟）