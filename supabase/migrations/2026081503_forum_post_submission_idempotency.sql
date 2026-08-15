-- Beta 5 image publishing retries the same client submission id after a network timeout.
-- Keep this as a wrapper so the established image-post RPC remains compatible with old clients.

begin;

create table if not exists public.forum_post_submissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

alter table public.forum_post_submissions enable row level security;

revoke all on table public.forum_post_submissions from anon, authenticated;
grant all on table public.forum_post_submissions to service_role;

create or replace function public.create_forum_post_with_images_idempotent(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb,
  p_tag text default null,
  p_location_name text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if p_submission_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:INVALID_SUBMISSION_ID:发布请求标识无效，请重试';
  end if;

  -- ON CONFLICT locks until the first request commits, so a concurrent retry reads
  -- the completed result rather than creating a duplicate post.
  insert into public.forum_post_submissions (user_id, submission_id)
  values (v_user_id, p_submission_id)
  on conflict (user_id, submission_id) do update
    set updated_at = now()
  returning result into v_result;

  if v_result is not null then
    return v_result;
  end if;

  v_result := public.create_forum_post_with_images(
    p_title,
    p_body,
    p_author_username,
    p_images,
    p_tag,
    p_location_name,
    p_location_lat,
    p_location_lng
  );

  update public.forum_post_submissions
     set result = v_result,
         updated_at = now()
   where user_id = v_user_id
     and submission_id = p_submission_id;

  return v_result;
end;
$$;

revoke all on function public.create_forum_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, uuid) from public;
grant execute on function public.create_forum_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, uuid) to authenticated;
grant execute on function public.create_forum_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, uuid) to service_role;

comment on function public.create_forum_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, uuid) is
  '幂等创建论坛图片帖子；相同用户和 submission id 返回初次创建的帖子。';

notify pgrst, 'reload schema';

commit;
