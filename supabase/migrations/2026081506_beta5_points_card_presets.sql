-- Beta5: persistent custom presets for 方块积分 cards.
begin;

create table if not exists public.points_card_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  image_public_id text null,
  created_at timestamptz not null default now(),
  constraint points_card_presets_image_url_len
    check (char_length(image_url) <= 2048),
  constraint points_card_presets_image_public_id_len
    check (image_public_id is null or char_length(image_public_id) <= 512),
  constraint points_card_presets_user_image_unique
    unique (user_id, image_url)
);

create index if not exists idx_points_card_presets_user_created_at
  on public.points_card_presets (user_id, created_at desc);

-- Preserve the one-off custom card saved by the first Beta5 implementation.
insert into public.points_card_presets (user_id, image_url, image_public_id)
select id, points_card_image_url, points_card_image_public_id
from public.profiles
where points_card_skin = 'custom'
  and nullif(trim(points_card_image_url), '') is not null
on conflict (user_id, image_url) do nothing;

alter table public.points_card_presets enable row level security;

drop policy if exists points_card_presets_select_own on public.points_card_presets;
create policy points_card_presets_select_own on public.points_card_presets
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists points_card_presets_insert_own on public.points_card_presets;
create policy points_card_presets_insert_own on public.points_card_presets
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists points_card_presets_delete_own on public.points_card_presets;
create policy points_card_presets_delete_own on public.points_card_presets
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on table public.points_card_presets to authenticated;
grant all on table public.points_card_presets to service_role;

comment on table public.points_card_presets is 'Beta5 方块积分用户自定义卡面预设';

commit;
