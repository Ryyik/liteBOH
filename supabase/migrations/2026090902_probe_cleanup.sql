-- 2026090902_probe_cleanup.sql（清理 090901 的探针数据）
delete from public.activity_entries where campaign_id in (select id from public.activity_campaigns where slug = 'probe-test-campaign');
delete from public.activity_campaigns where slug = 'probe-test-campaign';
