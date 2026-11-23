-- ============================================================================
-- 2026-11-23 圣诞交换礼物：建立本轮活动行
--
-- 为什么单独一条迁移，而不是写进 2026112302：
--   · 建表与建活动是两件事 —— 表结构是长期资产，活动行是「本轮运营数据」；
--   · 迁移可重复执行，on conflict do nothing 保证手滑重跑不会覆盖运营已经改过的
--     时间窗（那张表随时可能被 /admin/xmas-console 改）。
--
-- 时间口径：12 月 20 日 20:00 揭晓，19:30 截止报名（半小时收尾）。
-- 要改时间请走管理台，不要改这里再推一遍 —— 会与线上值打架。
-- ============================================================================

begin;

insert into public.xmas_exchange_events
  (slug, title, reveal_at, signup_deadline, capacity, status, is_visible)
values
  (
    'christmas-2026',
    '圣诞交换礼物',
    timestamptz '2026-12-20 20:00:00+08',
    timestamptz '2026-12-20 19:30:00+08',
    20,
    'open',
    true
  )
on conflict (slug) do nothing;

commit;
