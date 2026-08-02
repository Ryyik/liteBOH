-- 移除 HiAgent Turbo 模型（内网不可达，回退该集成）
-- 1) 删除 Turbo 模式下基于 hiagent provider 的模型配置
delete from public.bohai_model_configs
  where mode_id = 'Turbo' and provider = 'hiagent';

-- 2) 收紧 provider check，移除 hiagent
alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_provider_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_provider_check
  check (provider in ('siliconflow', 'zhipu', 'openrouter', 'custom'));
