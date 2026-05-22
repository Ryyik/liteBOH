# Database Organization

本项目数据库文件统一采用以下分层：

## 1) 可执行迁移

目录：`supabase/migrations/`

规则：
- 这里仅放**需要在数据库执行**的 SQL 迁移脚本。
- 文件名使用 `YYYYMMDD_描述.sql`。
- 如需回滚脚本，使用同日期前缀并显式标注 `rollback`。

当前示例：
- `20260324_add_pushplus.sql`
- `20260324_performance_indexes.sql`
- `20260324_performance_indexes_rollback.sql`

## 2) 结构文档（非迁移）

目录：`docs/database/schema/`

规则：
- 这里放**文档用途** SQL，不作为迁移执行入口。
- `full_schema_snapshot.sql`：某一时刻完整结构快照。
- `tables/*.sql`：按表拆分的结构定义，便于查阅和对比。
- `database-structure.json`：结构快照的 JSON 版本，便于脚本或外部工具读取。

## 3) 权限策略文档（非迁移）

目录：`docs/database/policies/`

规则：
- 这里放 RLS、权限策略等快照文档，不作为迁移执行入口。
- `policies.json`：策略快照。
- `detailed-policies.json`：详细策略快照。

## 4) 新增文件约定

- 新增数据库变更：优先放到 `supabase/migrations/`。
- 需要沉淀结构说明：同步更新 `docs/database/schema/`。
- 需要沉淀权限说明：同步更新 `docs/database/policies/`。
- 避免在项目根目录新增零散 `*.sql`。
