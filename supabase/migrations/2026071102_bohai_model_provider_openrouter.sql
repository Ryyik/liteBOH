alter table public.bohai_model_configs
  drop constraint if exists bohai_model_configs_provider_check;

alter table public.bohai_model_configs
  add constraint bohai_model_configs_provider_check
  check (provider in ('siliconflow', 'zhipu', 'openrouter', 'custom'));
