-- 2026112201 更名迁移漏掉的约束：bohai_strategy_candidates_shape 不带表名前缀，
-- 其 DO 块只枚举 bohai_model_configs 前缀；线上 2026-11-23 已手动补改，
-- 此迁移保证全新环境按序执行时结果一致。
alter table public.bolek_model_configs
  rename constraint bohai_strategy_candidates_shape to bolek_strategy_candidates_shape;
