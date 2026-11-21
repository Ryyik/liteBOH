# 网站稳定性检查报告

检查日期：2026-05-13  
项目：BOHLITEBeta2.5  
结论：当前站点核心读链路、构建链路和自动化测试整体稳定，可继续发布或作为下一轮测试基线。

## 总体结论

本次检查覆盖本地自动化测试、类型检查、结构检查、生产构建、Bundle 体积、k6 压测脚本语法，以及论坛/消息中心线上压测结果。所有阻断项均通过。

当前无需立刻执行数据库或代码层面的性能优化。建议优先做基线留档、定期复测，并处理少量低风险维护项。

## 检查结果汇总

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 单元测试 | 通过 | 16 个测试文件，73 个测试全部通过 |
| 类型检查 | 通过 | `vue-tsc --noEmit` 无错误 |
| 视图结构检查 | 通过 | 未发现 `.vue` 与同名目录碰撞 |
| 项目结构检查 | 通过，有警告 | 存在 `.DS_Store` 和若干超大文件拆分建议 |
| ESLint | 通过，有警告 | 1 个未使用变量警告，无错误 |
| 生产构建 | 通过 | Vite 构建成功 |
| Bundle 检查 | 通过 | `dist=13136KB`，`largest-js=284KB` |
| k6 脚本语法 | 通过 | 论坛、消息中心压测脚本均通过 `node --check` |

## 自动化测试

执行命令：

```bash
npm test
npm run type-check
npm run check:views
npm run check:structure
npm run lint
npm run build
npm run check:bundle
node --check scripts/loadtest/k6-auth-forum.js
node --check scripts/loadtest/k6-message-center.js
```

关键结果：

- `npm test`：16 个测试文件全部通过，73 个测试全部通过。
- `npm run type-check`：通过。
- `npm run build`：通过。
- `npm run check:bundle`：通过，最大 JS 文件约 `284KB`。
- `npm run lint`：无错误，仅 1 个 warning。

## 压测结果

### 论坛列表

压测脚本：

```text
scripts/loadtest/k6-auth-forum.js
```

最新 ramp 结果摘要：

| 指标 | 结果 |
| --- | --- |
| HTTP 失败率 | `0.00%` |
| 业务错误率 | `0.00%` |
| 请求数 | `13939` |
| 平均请求量 | 约 `29 req/s` |
| `forum_list_duration avg` | `274.66ms` |
| `forum_list_duration p95` | `385.75ms` |
| `forum_list_duration p99` | `732.95ms` |
| 最大耗时 | `15.21s` |
| dropped iterations | `10` |

判断：

- 论坛列表可用性稳定，无业务失败。
- `p95` 未达到脚本中较激进的 `300ms` 阈值，但整体表现健康。
- 极少数最大耗时偏高，需继续通过后续周期观察是否重复出现。

建议阈值：

```js
forum_list_duration: ['p(95)<450', 'p(99)<1000']
```

### 消息中心

压测脚本：

```text
scripts/loadtest/k6-message-center.js
```

覆盖链路：

- Supabase Auth 登录
- 通知列表
- 信件列表
- 未读通知/未读信件计数

#### Ramp 结果

| 指标 | 结果 |
| --- | --- |
| HTTP 失败率 | `0.00%` |
| 业务错误率 | `0.00%` |
| checks | `100.00%` |
| HTTP p95 | `350.17ms` |
| HTTP p99 | `1.13s` |
| message_list p95 | `295.88ms` |
| notification_list p95 | `411.53ms` |
| unread_count p95 | `247.72ms` |
| dropped iterations | `124` |

判断：

- 消息中心读路径稳定。
- `notification_list p99` 曾达到 `1.71s`，但 p95 正常，属于尾部波动。
- `auth_login_duration` 在 setup 中仅登录一次，不适合作为高置信度性能指标。

#### Spike 结果

| 指标 | 结果 |
| --- | --- |
| HTTP 失败率 | `0.00%` |
| 业务错误率 | `0.00%` |
| checks | `100.00%` |
| HTTP p95 | `409.8ms` |
| HTTP p99 | `865.95ms` |
| message_list p95 | `383.73ms` |
| notification_list p95 | `496.18ms` |
| unread_count p95 | `388.41ms` |
| dropped iterations | `52` |

判断：

- 消息中心尖峰测试通过。
- 突发流量下没有接口失败和业务失败。
- 少量 dropped iterations 可接受，建议在后续 soak 中继续观察。

## 风险与问题

### P1：无阻断风险

本次未发现会阻断发布或导致核心链路不可用的问题。

### P2：低风险维护项

1. `.DS_Store` 存在于仓库或工作区中。

   建议清理并确保 `.gitignore` 覆盖。

2. 存在多个超大文件。

   当前不影响构建，但会降低维护效率。结构检查提示的文件包括：

   - `src/styles/vendor/bootstrap.css`
   - `src/views/BOHAI/composables/useChatEngine.js`
   - `src/views/Home/style.scoped.1.css`
   - `src/views/DataManagement/index.vue`
   - `src/views/Forum/style.scoped.css`
   - `src/views/user-center/Cloud+/style.scoped.css`

3. ESLint 有 1 个 warning。

   文件：

   ```text
   src/views/DataManagement/index.vue
   ```

   问题：

   ```text
   getNextNewsId is assigned a value but never used
   ```

4. 压测截图曾暴露测试账号信息和 Publishable key。

   Publishable key 本身可公开，但测试账号密码应视为已暴露。建议更换测试账号密码；如不确定截图传播范围，可在 Supabase 中轮换相关 key。

### P3：观察项

1. 论坛列表和消息中心均出现过少量尾部慢请求。

   当前 p95/p99 整体可接受，但建议在高峰前后观察 Supabase Dashboard：

   - Postgres CPU
   - 数据库连接数
   - 慢查询
   - Edge/API 延迟

2. 消息中心和论坛压测尚未完成长时间 soak。

   建议后续跑 30 分钟 soak，验证是否存在延迟漂移或连接积压。

## 建议后续动作

### 立即建议

1. 保留当前压测结果作为性能基线。
2. 调整论坛压测脚本中偏严格的论坛 p95 阈值。
3. 更换测试账号密码。
4. 清理 `.DS_Store`。
5. 修复 ESLint warning。

### 后续建议

1. 每次上线前执行：

   ```bash
   npm test
   npm run type-check
   npm run build
   ```

2. 每次涉及论坛、消息中心、数据库查询变更时执行：

   ```bash
   k6 run -e TEST_MODE=smoke scripts/loadtest/k6-auth-forum.js
   k6 run -e TEST_MODE=smoke scripts/loadtest/k6-message-center.js
   ```

3. 重要版本上线前执行：

   ```bash
   k6 run -e TEST_MODE=ramp scripts/loadtest/k6-auth-forum.js
   k6 run -e TEST_MODE=ramp scripts/loadtest/k6-message-center.js
   ```

4. 大活动或预期流量上涨前执行 spike 与 soak：

   ```bash
   k6 run -e TEST_MODE=spike scripts/loadtest/k6-message-center.js
   k6 run -e TEST_MODE=soak scripts/loadtest/k6-message-center.js
   ```

## 是否需要立即优化

不需要立即进行重型优化。

当前指标显示核心读链路稳定，失败率为 0，业务错误率为 0。除非后续出现以下信号，否则不建议贸然添加索引或大规模重构：

- `http_req_failed > 0.5%`
- `business_error_rate > 0.5%`
- p95 长期超过 `800ms`
- p99 长期超过 `2s`
- dropped iterations 大量增加
- Supabase 慢查询或数据库 CPU/连接数持续异常

## 最终结论

网站当前稳定性状态良好。论坛和消息中心均已通过核心读路径压测，自动化测试与生产构建通过。建议按低风险维护项收尾，并将本报告作为 2026-05-13 的稳定性基线。
