-- 转发（引用转发）通知：create_forum_quote_repost 在生成转发帖的同时，
-- 给原帖作者写一条 type='repost' 的未读通知（跳过自转发）。
-- 与 likes/comments 的 create_like_notification / create_comment_notification 触发器同款数据形态：
-- (recipient_id, sender_id, type, status, post_id)，前端通知列表按 post_id join 出《标题》。

begin;

create or replace function public.create_forum_quote_repost(
  p_post_id uuid,
  p_commentary text
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text;
  v_source public.posts;
  v_result public.posts;
  v_commentary text := nullif(trim(coalesce(p_commentary, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED:请先登录后再转发';
  end if;
  if v_commentary is null or char_length(v_commentary) > 2000 then
    raise exception using errcode = '22023', message = '转发留言不能为空且不能超过 2000 字';
  end if;

  select * into v_source
    from public.posts
   where id = p_post_id and status in ('approved', 'limited');
  if not found then
    raise exception using errcode = 'P0002', message = '原帖子不存在或暂不可见';
  end if;

  select username into v_username from public.profiles where id = v_user_id;
  insert into public.posts (
    content, title, body, author_id, author_username, status, tag,
    post_kind, repost_of_post_id
  ) values (
    v_commentary, null, v_commentary, v_user_id, coalesce(v_username, '用户'),
    'approved', coalesce(nullif(v_source.tag, ''), 'daily'), 'repost', v_source.id
  ) returning * into v_result;

  -- 通知原帖作者（自转发不通知；通知失败不阻断转发）
  if v_source.author_id is not null and v_source.author_id <> v_user_id then
    begin
      insert into public.notifications (
        recipient_id, sender_id, type, status, post_id
      ) values (
        v_source.author_id, v_user_id, 'repost', 'unread', v_source.id
      );
    exception when others then
      null;
    end;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_forum_quote_repost(uuid, text) from public, anon;
grant execute on function public.create_forum_quote_repost(uuid, text) to authenticated;
grant execute on function public.create_forum_quote_repost(uuid, text) to service_role;

comment on function public.create_forum_quote_repost(uuid, text) is
  '创建引用转发帖（content=转发留言，repost_of_post_id 指向原帖），并给原帖作者写 repost 通知（自转发跳过）';

commit;
