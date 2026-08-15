-- User Space 查询性能：避免地址排序退化，并让首页摘要不再重复展开 Cloud JSON。

create index if not exists idx_user_addresses_user_default_created
  on public.user_addresses (user_id, is_default desc, created_at desc);

alter table public.boh_cloud_entries
  add column if not exists image_count integer not null default 0;

update public.boh_cloud_entries
   set image_count = public.boh_cloud_count_entry_images(content_blocks)
 where image_count is distinct from public.boh_cloud_count_entry_images(content_blocks);

alter table public.boh_cloud_entries
  drop constraint if exists boh_cloud_entries_image_count_nonnegative,
  add constraint boh_cloud_entries_image_count_nonnegative check (image_count >= 0);

create or replace function public.boh_cloud_entries_set_image_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.image_count := public.boh_cloud_count_entry_images(new.content_blocks);
  return new;
end;
$$;

drop trigger if exists trg_00_boh_cloud_entries_set_image_count on public.boh_cloud_entries;
create trigger trg_00_boh_cloud_entries_set_image_count
before insert or update of content_blocks on public.boh_cloud_entries
for each row execute function public.boh_cloud_entries_set_image_count();

create or replace function public.get_my_user_space_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_points integer := 0;
  v_posts integer := 0;
  v_followers integer := 0;
  v_following integer := 0;
  v_rank integer := 0;
  v_cloud_images integer := 0;
  v_cloud_limit integer := 150;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(p.username, ''), coalesce(p.points, 0)
    into v_username, v_points
    from public.profiles p
   where p.id = v_user_id;

  select count(*)::integer into v_posts
    from public.posts p
   where p.author_id = v_user_id
      or (v_username <> '' and p.author_username = v_username);

  select count(*)::integer into v_followers
    from public.user_follows f
   where f.following_id = v_user_id;

  select count(*)::integer into v_following
    from public.user_follows f
   where f.follower_id = v_user_id;

  select count(*)::integer + 1 into v_rank
    from public.profiles p
   where p.points > v_points;

  select coalesce(sum(e.image_count), 0)::integer into v_cloud_images
    from public.boh_cloud_entries e
   where e.user_id = v_user_id;

  v_cloud_limit := public.boh_cloud_image_limit_for_user(v_user_id);

  return jsonb_build_object(
    'posts', v_posts,
    'points', v_points,
    'rank', v_rank,
    'followers', v_followers,
    'following', v_following,
    'cloud_image_used', v_cloud_images,
    'cloud_image_limit', v_cloud_limit
  );
end;
$$;

revoke all on function public.get_my_user_space_summary() from public;
grant execute on function public.get_my_user_space_summary() to authenticated;
grant execute on function public.get_my_user_space_summary() to service_role;

notify pgrst, 'reload schema';
