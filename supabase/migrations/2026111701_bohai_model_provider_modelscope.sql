-- 2026-11-17：接入魔搭 ModelScope（API-Inference）作为 bohai_model_configs 的合法 provider。
-- 与 2026071102（加 openrouter）同一套路：先删旧 CHECK 再建新的，避免「后台选得到、
-- DB 拒绝写入」。EF 侧白名单（api-key-vault 的 PROVIDER_OPTIONS）与前端枚举在同一提交内同步。
alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_provider_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_provider_check
  check (provider in ('siliconflow', 'zhipu', 'openrouter', 'modelscope', 'custom'));
