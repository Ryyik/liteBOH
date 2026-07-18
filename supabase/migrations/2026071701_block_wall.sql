begin;
create table if not exists public.block_wall_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_username text not null,
  author_avatar_url text,
  item_type text not null check (item_type in ('note', 'photo')),
  content text not null default '',
  color text not null default 'butter' check (color in ('butter', 'blush', 'mint', 'sky', 'lilac', 'cream')),
  image_url text, image_public_id text, image_width integer, image_height integer,
  position_x numeric(5,2) not null default 50 check (position_x between 0 and 100),
  position_y numeric(5,2) not null default 50 check (position_y between 0 and 100),
  rotation numeric(4,1) not null default 0 check (rotation between -8 and 8),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint block_wall_content_length check (char_length(content) <= 420),
  constraint block_wall_author_name_length check (char_length(author_username) between 1 and 80),
  constraint block_wall_photo_fields check (
    (item_type = 'note' and char_length(trim(content)) > 0 and image_url is null and image_public_id is null)
    or (item_type = 'photo' and image_url is not null and image_public_id is not null and image_width > 0 and image_height > 0)
  )
);
create index if not exists idx_block_wall_items_created on public.block_wall_items (created_at asc);
create index if not exists idx_block_wall_items_author on public.block_wall_items (author_id, created_at desc);
alter table public.block_wall_items enable row level security;
drop policy if exists block_wall_public_read on public.block_wall_items;
create policy block_wall_public_read on public.block_wall_items for select to anon, authenticated using (true);
drop policy if exists block_wall_owner_insert on public.block_wall_items;
create policy block_wall_owner_insert on public.block_wall_items for insert to authenticated with check (author_id = auth.uid());
drop policy if exists block_wall_owner_update on public.block_wall_items;
create policy block_wall_owner_update on public.block_wall_items for update to authenticated using (author_id = auth.uid() or public.current_user_is_admin()) with check (author_id = auth.uid() or public.current_user_is_admin());
drop policy if exists block_wall_owner_delete on public.block_wall_items;
create policy block_wall_owner_delete on public.block_wall_items for delete to authenticated using (author_id = auth.uid() or public.current_user_is_admin());
grant select on public.block_wall_items to anon, authenticated;
grant insert, update, delete on public.block_wall_items to authenticated;
create or replace function public.touch_block_wall_item_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_touch_block_wall_item on public.block_wall_items;
create trigger trg_touch_block_wall_item before update on public.block_wall_items for each row execute function public.touch_block_wall_item_updated_at();
commit;
