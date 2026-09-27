-- 2026092704: activity_campaigns 草稿泄漏修复（plans/020 §2 备注 + §14 的「真正修复」）
--
-- 现状：activity_campaigns_select 为 using(true)，stage='draft' 的草稿能被 anon 直查
--       （此前只有前端 .neq('stage','draft') 兜底，见 src/utils/api/site-search-api.ts）。
-- 目标：非 draft 阶段全员可读；draft 仅管理端可见（current_user_is_admin()）。
--
-- ⚠️ current_user_is_admin() 被 RLS 引用：保持 security definer、不撤 anon execute
--    （撤了游客查询会 42501，见 2026092101 头注释）。
-- ⚠️ 应用方式：Management API（read_only:false）单事务执行 DDL + 手写 schema_migrations，
--    结尾 notify pgrst（见 docs/2026-09-22-首页改版实施交付说明.md 惯例）。
--    配套脚本：scripts/probes/probe-campaign-draft-rls.py（--apply 应用 + 前后验证）。

drop policy if exists activity_campaigns_select on public.activity_campaigns;

create policy activity_campaigns_select
  on public.activity_campaigns
  for select
  using (stage <> 'draft' or public.current_user_is_admin());

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '2026092704',
  '2026092704_activity_campaigns_draft_rls',
  array[
    'drop policy if exists activity_campaigns_select on public.activity_campaigns',
    $p$create policy activity_campaigns_select on public.activity_campaigns for select using (stage <> 'draft' or public.current_user_is_admin())$p$
  ]
);

notify pgrst, 'reload schema';
