-- 被论坛 Hero 卡引用的活动 Hero 不允许直接删除。
-- 原外键 ON DELETE SET NULL 会撞上 hero 卡位 hero_id NOT NULL 的 payload CHECK，最终报 23514。

begin;

alter table public.forum_card_items
  drop constraint if exists forum_card_items_hero_id_fkey;

alter table public.forum_card_items
  add constraint forum_card_items_hero_id_fkey
  foreign key (hero_id) references public.home_heroes(id) on delete restrict;

notify pgrst, 'reload schema';

commit;
