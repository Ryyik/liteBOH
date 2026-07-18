-- User Space 首屏摘要：用一次数据库往返替代多次 count 和 Cloud+ 全量拉取。

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

  select count(*)::integer
    into v_posts
    from public.posts p
   where p.author_id = v_user_id
      or (v_username <> '' and p.author_username = v_username);

  select count(*)::integer
    into v_followers
    from public.user_follows f
   where f.following_id = v_user_id;

  select count(*)::integer
    into v_following
    from public.user_follows f
   where f.follower_id = v_user_id;

  select count(*)::integer + 1
    into v_rank
    from public.profiles p
   where coalesce(p.points, 0) > v_points;

  select coalesce(sum(
    (select count(*)
       from jsonb_array_elements(coalesce(e.content_blocks, '[]'::jsonb)) block
      where block ->> 'type' = 'image')
  ), 0)::integer
    into v_cloud_images
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

comment on function public.get_my_user_space_summary() is
  '返回当前用户 User Space 首屏统计与 Cloud 图片额度，避免客户端多次 count 和全量内容扫描。';

