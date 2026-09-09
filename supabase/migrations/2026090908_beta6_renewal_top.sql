begin;

-- ============================================
-- BETA 6 焕新主视觉置顶修正
--
-- 2026090907 首发时 sort_order=5，但远程存在动态英雄区占用 0/1/2
-- （方块设定集 / 全新订阅 / 福州回忆），Beta6 实际排在第 4 位。
-- 用户拍板：Beta6 焕新主视觉必须占据第一屏，改为负数排序置顶
-- （与 createHero「负数 sort_order 位于顶部」语义一致，不与动态区撞号）。
-- ============================================

update public.home_heroes
set sort_order = -10, updated_at = now()
where builtin_key = 'beta6-renewal';

commit;
