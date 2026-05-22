# Tasks
- [x] Task 1: 从 package.json 移除毛玻璃依赖
  - [x] SubTask 1.1: 移除 `glass-ui-vue` 依赖
  - [x] SubTask 1.2: 移除 `@wxperia/liquid-glass-vue` 依赖

- [x] Task 2: 从 main.js 移除 GlassUI 相关代码
  - [x] SubTask 2.1: 移除 `import GlassUI from 'glass-ui-vue'`
  - [x] SubTask 2.2: 移除 `import 'glass-ui-vue/styles'`
  - [x] SubTask 2.3: 移除 `app.use(GlassUI)`

- [x] Task 3: 删除本地 liquid-glass-vue-main 目录
  - 注：该目录不存在，无需删除

- [x] Task 4: 运行 npm install 更新依赖

- [x] Task 5: 验证项目正常运行

# Task Dependencies
- Task 2 depends on Task 1
- Task 4 depends on Task 1, Task 2, Task 3
- Task 5 depends on Task 4
