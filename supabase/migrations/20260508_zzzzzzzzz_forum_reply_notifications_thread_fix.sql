begin;

-- Keep forum comment notifications reliable for both top-level comments and
-- replies inside a thread. Older deployments had the trigger name in schema
-- snapshots, but the function body was not part of the migration chain.
create or replace function public.create_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author_id uuid;
  v_parent_author_id uuid;
begin
  if coalesce(new.status, 'approved') <> 'approved' then
    return new;
  end if;

  select p.author_id
    into v_post_author_id
    from public.posts p
   where p.id = new.post_id;

  if new.parent_id is not null then
    select c.author_id
      into v_parent_author_id
      from public.comments c
     where c.id = new.parent_id
       and coalesce(c.status, 'approved') = 'approved';
  end if;

  if v_post_author_id is not null
     and (new.author_id is null or v_post_author_id <> new.author_id) then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status,
      post_id,
      comment_id
    )
    select
      v_post_author_id,
      new.author_id,
      'comment',
      'unread',
      new.post_id,
      new.id
    where not exists (
      select 1
        from public.notifications n
       where n.recipient_id = v_post_author_id
         and n.type = 'comment'
         and n.comment_id = new.id
    );
  end if;

  if v_parent_author_id is not null
     and (new.author_id is null or v_parent_author_id <> new.author_id)
     and (v_post_author_id is null or v_parent_author_id <> v_post_author_id) then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status,
      post_id,
      comment_id
    )
    select
      v_parent_author_id,
      new.author_id,
      'comment',
      'unread',
      new.post_id,
      new.id
    where not exists (
      select 1
        from public.notifications n
       where n.recipient_id = v_parent_author_id
         and n.type = 'comment'
         and n.comment_id = new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_on_comment on public.comments;
create trigger trigger_on_comment
  after insert on public.comments
  for each row
  execute function public.create_comment_notification();

-- Backfill recent missing notifications, mainly for replies on older posts
-- where the post author and the replied comment author can be different people.
insert into public.notifications (
  recipient_id,
  sender_id,
  type,
  status,
  post_id,
  comment_id,
  created_at
)
select
  p.author_id,
  c.author_id,
  'comment',
  'unread',
  c.post_id,
  c.id,
  c.created_at
from public.comments c
join public.posts p on p.id = c.post_id
where coalesce(c.status, 'approved') = 'approved'
  and c.created_at >= now() - interval '90 days'
  and p.author_id is not null
  and (c.author_id is null or p.author_id <> c.author_id)
  and not exists (
    select 1
      from public.notifications n
     where n.recipient_id = p.author_id
       and n.type = 'comment'
       and n.comment_id = c.id
  );

insert into public.notifications (
  recipient_id,
  sender_id,
  type,
  status,
  post_id,
  comment_id,
  created_at
)
select
  parent.author_id,
  c.author_id,
  'comment',
  'unread',
  c.post_id,
  c.id,
  c.created_at
from public.comments c
join public.comments parent on parent.id = c.parent_id
left join public.posts p on p.id = c.post_id
where coalesce(c.status, 'approved') = 'approved'
  and coalesce(parent.status, 'approved') = 'approved'
  and c.created_at >= now() - interval '90 days'
  and parent.author_id is not null
  and (c.author_id is null or parent.author_id <> c.author_id)
  and (p.author_id is null or parent.author_id <> p.author_id)
  and not exists (
    select 1
      from public.notifications n
     where n.recipient_id = parent.author_id
       and n.type = 'comment'
       and n.comment_id = c.id
  );

-- Older comments can have status = null. The public comment policy already
-- treats null as approved, so keep the thread RPC aligned with that behavior.
create or replace function public.list_forum_comment_thread(
  p_post_id uuid,
  p_root_comment_id uuid,
  p_page integer default 1,
  p_page_size integer default 50
)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  author_username text,
  content text,
  created_at timestamptz,
  status text,
  parent_id uuid,
  reply_to_username text,
  author_avatar_url text,
  has_more boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_fetch_size integer := v_page_size + 1;
  v_offset integer := (v_page - 1) * v_page_size;
begin
  return query
  with recursive thread as (
    select c.*
      from public.comments c
     where c.post_id = p_post_id
       and c.parent_id = p_root_comment_id
       and coalesce(c.status, 'approved') = 'approved'

    union all

    select child.*
      from public.comments child
      join thread parent_thread on parent_thread.id = child.parent_id
     where child.post_id = p_post_id
       and coalesce(child.status, 'approved') = 'approved'
  ),
  ranked as (
    select
      t.*,
      row_number() over (order by t.created_at asc, t.id asc) as row_num
    from thread t
  ),
  paged as (
    select *
    from ranked
    where row_num > v_offset
      and row_num <= v_offset + v_fetch_size
  ),
  page_meta as (
    select (count(*) > v_page_size) as has_more
    from paged
  )
  select
    p.id,
    p.post_id,
    p.author_id,
    p.author_username,
    p.content,
    coalesce(p.created_at, now()) as created_at,
    coalesce(p.status, 'approved') as status,
    p.parent_id,
    p.reply_to_username,
    pr.avatar_url as author_avatar_url,
    pm.has_more
  from paged p
  cross join page_meta pm
  left join public.profiles pr on pr.id = p.author_id
  where p.row_num <= v_offset + v_page_size
  order by p.row_num;
end;
$$;

grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to anon;
grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.list_forum_comment_thread(uuid, uuid, integer, integer) to service_role;

create or replace function public.refresh_forum_post_counters(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_id is null then
    return;
  end if;

  update public.posts p
     set comment_count = (
           select count(*)
             from public.comments c
            where c.post_id = p_post_id
              and coalesce(c.status, 'approved') = 'approved'
         ),
         like_count = (
           select count(*)
             from public.likes l
            where l.post_id = p_post_id
         )
   where p.id = p_post_id;
end;
$$;

grant execute on function public.refresh_forum_post_counters(uuid) to authenticated;
grant execute on function public.refresh_forum_post_counters(uuid) to service_role;

update public.posts p
   set comment_count = coalesce((
         select count(*)
           from public.comments c
          where c.post_id = p.id
            and coalesce(c.status, 'approved') = 'approved'
       ), 0),
       like_count = coalesce((
         select count(*)
           from public.likes l
          where l.post_id = p.id
       ), 0);

notify pgrst, 'reload schema';

commit;
