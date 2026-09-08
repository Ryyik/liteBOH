-- 2026090901_probe_seed.sql（临时探针数据，由 2026090902_probe_cleanup.sql 清理）
insert into public.activity_campaigns (slug, title, description, stage)
values ('probe-test-campaign', '【探针】平台化冒烟活动', '端到端探针临时数据', 'signup')
on conflict (slug) do nothing;
