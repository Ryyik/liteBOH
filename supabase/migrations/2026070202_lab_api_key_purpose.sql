alter table public.lab_ai_model_configs
  add column if not exists api_key_purpose text not null default 'chat';

comment on column public.lab_ai_model_configs.api_key_purpose is 'API Key Vault 的 purpose，用于选择使用哪个 SiliconFlow API Key';
