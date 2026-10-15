-- 2026101301: 修复「楼中楼里回复某条子评论时，实际被回复者收不到通知」
--
-- 问题：create_comment_notification() 只按 `parent_id` 反查父评论作者发通知。
--   但评论区是两层结构，前端约定 `parent_id` 恒为「楼」的根评论 id
--   （见 src/views/PostDetail/PostDetailMain.vue 的 submitReply：parentId = activeReplyId），
--   实际被回复者只记在 `comments.reply_to_username`（纯用户名，无 user_id）。
--   ⇒ 在楼中楼里回复某条子评论时，通知只会投给根评论作者（楼主），
--     被回复的那位子评论作者收不到。
--
-- 修法：补一段「实际被回复者」的通知，按唯一用户名反查 profiles.id。
--   - 直接回复主评论：reply_to_username == 根评论作者 → 与既有 parent 分支重合 → 跳过（不重复）。
--   - 回复子评论：reply_to_username == 子评论作者 → 新增一位 recipient。
--   三个 recipient（帖子作者 / 根评论作者 / 实际被回复者）各自按 comment_id 去重。
--
-- 幂等：create or replace，签名与返回类型（trigger）不变；触发器重建同名。
-- 线上部署：走 Management API + 手写 schema_migrations。
-- 注意：本迁移只让触发器对未来评论生效；历史评论不补发（避免通知暴增），如需补发另跑受控 SQL。
-- 回滚：恢复 2026050809 版本的函数体即可。

create or replace function public.create_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author_id uuid;
  v_parent_author_id uuid;
  v_replied_user_id uuid;
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

  -- 「实际被回复者」：库里只存了用户名（无 user_id），按唯一用户名反查。
  -- profiles.username 有 UNIQUE 约束（profiles_username_key），limit 1 仅为防御。
  if new.reply_to_username is not null and btrim(new.reply_to_username) <> '' then
    select pr.id
      into v_replied_user_id
      from public.profiles pr
     where pr.username = btrim(new.reply_to_username)
     limit 1;
  end if;

  -- 1) 帖子作者
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

  -- 2) 根评论（楼）作者
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

  -- 3) 实际被回复者（楼中楼里回复某条子评论的作者）——本次新增
  if v_replied_user_id is not null
     and (new.author_id is null or v_replied_user_id <> new.author_id)
     and (v_post_author_id is null or v_replied_user_id <> v_post_author_id)
     and (v_parent_author_id is null or v_replied_user_id <> v_parent_author_id) then
    insert into public.notifications (
      recipient_id,
      sender_id,
      type,
      status,
      post_id,
      comment_id
    )
    select
      v_replied_user_id,
      new.author_id,
      'comment',
      'unread',
      new.post_id,
      new.id
    where not exists (
      select 1
        from public.notifications n
       where n.recipient_id = v_replied_user_id
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

notify pgrst, 'reload schema';