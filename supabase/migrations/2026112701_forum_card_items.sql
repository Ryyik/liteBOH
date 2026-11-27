-- 2026112701_forum_card_items.sql
-- 论坛「最新」分区顶部卡位：运营卡配置（英雄/轮播），签到卡由前端按签到状态生成。
--
-- 为什么单开一张表：
--   home_heroes 是首页/官方英雄区流，论坛卡位只是引用其中一条作为紧凑宣传素材；
--   advertisements 是信息流广告台账，关闭/排序/版本语义都不同。
--   把论坛卡位独立出来后，后台和数据管理面板都只动这一张表。

begin;

create table if not exists public.forum_card_items (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  kind text not null default 'hero' check (kind in ('hero', 'carousel')),
  hero_id uuid references public.home_heroes(id) on delete set null,
  hero_ids uuid[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  priority integer not null default 100,
  starts_at timestamptz,
  ends_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forum_card_items_payload_check check (
    (kind = 'hero' and hero_id is not null)
    or (
      kind = 'carousel'
      and coalesce(array_length(hero_ids, 1), 0) between 2 and 5
    )
  )
);

comment on table public.forum_card_items is
  '论坛「最新」分区顶部运营卡配置。hero/carousel 只引用 home_heroes，不复制素材。';

create index if not exists idx_forum_card_items_public
  on public.forum_card_items (status, priority, starts_at, ends_at);

drop trigger if exists update_forum_card_items_updated_at on public.forum_card_items;
create trigger update_forum_card_items_updated_at
  before update on public.forum_card_items
  for each row
  execute function public.update_updated_at_column();

alter table public.forum_card_items enable row level security;

-- 公开读：只放行启用且在时间窗内的卡位；关闭后前台立即不可见。
drop policy if exists forum_card_items_public_read on public.forum_card_items;
create policy forum_card_items_public_read on public.forum_card_items
  for select
  to anon, authenticated
  using (
    status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- 管理员全权：数据管理面板可增删改、启停与调优先级。
drop policy if exists forum_card_items_admin_all on public.forum_card_items;
create policy forum_card_items_admin_all on public.forum_card_items
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

grant select on table public.forum_card_items to anon, authenticated;
grant select, insert, update, delete on table public.forum_card_items to authenticated;
grant all on table public.forum_card_items to service_role;

-- 当前首条：圣诞交换礼物。引用已发布 Hero，不复制标题/图片/链接。
insert into public.forum_card_items (label, kind, hero_id, status, priority, version)
select
  '圣诞交换礼物',
  'hero',
  h.id,
  'active',
  100,
  1
from public.home_heroes h
where h.builtin_key = 'christmas-xmas'
  and h.status = 'published'
  and h.is_archived = false
  and not exists (select 1 from public.forum_card_items)
order by h.sort_order asc
limit 1;

notify pgrst, 'reload schema';

commit;