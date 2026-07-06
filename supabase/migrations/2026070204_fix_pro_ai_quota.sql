-- 修正 Pro 等级的 AI 日配额：200 → 300
-- 同时调整整体梯度：Free 100 / Plus 200 / Pro 300 / Max 500 / Ultra 不限

update public.ai_quota_config
set daily_limit = 300
where tier = 'pro';