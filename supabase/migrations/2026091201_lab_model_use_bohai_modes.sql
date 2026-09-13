-- 实验室 AI 模型配置切换到 BOH AI 现有模型库
-- model_id 列语义变更：不再存 freemodels.model_id，改为存 bohai_model_configs.mode_id。
-- 前端 Lab（PPT/Word/Code/文档排版）调用 runtime-chat-stream 时将该值作为 mode 传入，
-- 由 api-key-vault 按 bohai_model_configs 配置路由 provider/model/参数（服务端已原生支持）。
-- 论坛周报 Edge Function 同步改为按 mode_id 从 bohai_model_configs 解析模型。

comment on table public.lab_ai_model_configs is
  '实验室 AI 功能模型配置。model_id 存 bohai_model_configs.mode_id（BOH AI 现有模型模式）；temperature/max_tokens 为前端展示参考值，运行时以 bohai_model_configs 配置为准。';

-- 历史数据迁移：仅当仍为旧默认模型时改写为 'fast'（管理员已自定义的配置不动，由管理员在面板重新选择）
update public.lab_ai_model_configs
set model_id = 'fast'
where model_id = 'Qwen/Qwen3-8B';
