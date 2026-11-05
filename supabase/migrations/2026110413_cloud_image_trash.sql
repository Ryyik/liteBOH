-- ============================================================================
-- 图库单图删除（同步论坛原帖）+ 回收站 30 天（plans/039）
--
-- 产品口径（2026-11-04 用户定稿）：
--   ① 图库里按**单张图片**删（格子 = 一张图），不是删整条内容；
--   ② 若这张图属于论坛帖的备份（source='forum' + source_post_id），
--      删图 = 编辑帖子删掉那张图：forum_post_images 行要删、posts.image_count /
--      cover_image_url 要重算 —— **不是删帖**；
--   ③ 删除时**不销毁 Cloudinary 资产**，只把 image block 快照写进回收站；
--      30 天后由 purge-cloud-image-trash EF 真正销毁资产并清行；
--   ④ 恢复 = 图库 content_blocks 追加回去 + 原帖 forum_post_images 追加回去。
--
-- 为什么不用现有 deleteCloudEntryWithAssets：
--   那条路径是「整条删除 + 立刻删 Cloudinary」，与本需求的三条口径全冲突，
--   且它在 API 层被 FORUM_SYNCED_CLOUD_ENTRY_LOCKED 硬锁。
--
-- 为什么写成一个 SECURITY DEFINER RPC 而不是前端分三步调：
--   「图库 blocks / forum_post_images / posts.image_count / 回收站行」必须同事务，
--   任何一步失败都不能留下「图删了但帖子还显示」或「回收站有行但图还在」的半状态。
--
-- 注意：
--   1) 本迁移**不改**既有 update_forum_post_images，也不改 guard_boh_cloud_entry_upload；
--      恢复时的 9 图/配额校验复用既有 BEFORE 触发器（超限会以 CLOUD_IMAGE_LIMIT_EXCEEDED 抛出，
--      API 层再翻译成可读文案）。
--   2) `entry_id` 刻意**不加外键**：条目被整条删除后，回收站行仍要留着展示/审计。
--   3) purge cron 依赖已部署的 purge-cloud-image-trash EF；EF 未部署时 pg_net 只会得到 404，
--      不影响本迁移与前端功能。
-- ============================================================================

begin;

-- ── 1) 回收站表 ────────────────────────────────────────────────────────────
create table if not exists public.boh_cloud_image_trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null,
  source_post_id uuid null,
  source text not null default 'manual',
  block jsonb not null,
  block_index integer not null default 0,
  image_url text not null default '',
  public_id text not null default '',
  entry_title text not null default '',
  entry_date date not null,
  -- 整条内容被删（纯图片帖删光 / 纯图片手记删光）时，恢复需要靠它重建条目：
  -- 标题、日期、正文文字、mood、source 等都在这里存一份快照。
  entry_snapshot jsonb not null default '{}'::jsonb,
  deleted_at timestamp with time zone not null default now(),
  purge_after timestamp with time zone not null default (now() + interval '30 days'),
  state text not null default 'pending',
  restored_at timestamp with time zone null,
  purged_at timestamp with time zone null,
  purge_attempts integer not null default 0,
  constraint boh_cloud_image_trash_block_is_image
    check (coalesce(block ->> 'type', '') = 'image'),
  constraint boh_cloud_image_trash_state_check
    check (state = any (array['pending'::text, 'restored'::text, 'purged'::text])),
  constraint boh_cloud_image_trash_url_len
    check (char_length(image_url) <= 2048),
  constraint boh_cloud_image_trash_public_id_len
    check (char_length(public_id) <= 255)
);

create index if not exists boh_cloud_image_trash_user_state_idx
  on public.boh_cloud_image_trash (user_id, state, deleted_at desc);

create index if not exists boh_cloud_image_trash_purge_idx
  on public.boh_cloud_image_trash (purge_after)
  where state = 'pending';

alter table public.boh_cloud_image_trash enable row level security;

drop policy if exists boh_cloud_image_trash_select_own on public.boh_cloud_image_trash;
create policy boh_cloud_image_trash_select_own
  on public.boh_cloud_image_trash
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 写操作只经 RPC（SECURITY DEFINER）；不给 authenticated 直接 insert/update/delete 策略。
revoke all on table public.boh_cloud_image_trash from anon;
grant select on table public.boh_cloud_image_trash to authenticated;

-- ── 2) 删除：图库 blocks + 论坛帖子图片 + 回收站行（同事务）────────────────
create or replace function public.delete_cloud_entry_images(
  p_entry_id uuid,
  p_block_indexes integer[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_entry public.boh_cloud_entries%rowtype;
  v_indexes integer[] := '{}'::integer[];
  v_kept jsonb := '[]'::jsonb;
  v_block jsonb;
  v_position integer := 0;
  v_block_count integer := 0;
  v_removed integer := 0;
  v_remaining_images integer := 0;
  v_new_cover text := '';
  v_removed_public_ids text[] := '{}'::text[];
  v_post_synced boolean := false;
  v_post_image_count integer := 0;
  v_post_cover text := '';
  v_entry_deleted boolean := false;
  v_post_deleted boolean := false;
  v_delete_whole boolean := false;
  v_post_body text := '';
  v_remaining_text text := '';
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'NOT_AUTHENTICATED:登录状态已失效，请重新登录后再试';
  end if;

  select * into v_entry
    from public.boh_cloud_entries
   where id = p_entry_id
   for update;

  if v_entry.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ENTRY_NOT_FOUND:内容不存在或已被删除';
  end if;

  if v_entry.user_id <> v_user_id then
    raise exception using
      errcode = 'P0001',
      message = 'FORBIDDEN:没有权限删除这张图片';
  end if;

  v_block_count := jsonb_array_length(coalesce(v_entry.content_blocks, '[]'::jsonb));

  -- 去重 + 只接受数组范围内的下标（越界/负数静默丢弃，避免伪造参数打崩）
  select coalesce(array_agg(distinct value order by value), '{}'::integer[])
    into v_indexes
    from unnest(coalesce(p_block_indexes, '{}'::integer[])) as value
   where value >= 0
     and value < v_block_count;

  if coalesce(array_length(v_indexes, 1), 0) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_BLOCK:没有选中可删除的图片';
  end if;

  for v_position in 0 .. v_block_count - 1 loop
    v_block := v_entry.content_blocks -> v_position;

    if v_position = any(v_indexes) then
      if coalesce(v_block ->> 'type', '') <> 'image' then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_BLOCK:只能删除图片';
      end if;

      v_removed := v_removed + 1;
      v_removed_public_ids := v_removed_public_ids
        || coalesce(v_block ->> 'publicId', v_block ->> 'public_id', '');

      insert into public.boh_cloud_image_trash (
        user_id, entry_id, source_post_id, source, block, block_index,
        image_url, public_id, entry_title, entry_date, entry_snapshot
      ) values (
        v_user_id,
        v_entry.id,
        v_entry.source_post_id,
        coalesce(v_entry.source, 'manual'),
        v_block,
        v_position,
        coalesce(v_block ->> 'url', ''),
        coalesce(v_block ->> 'publicId', v_block ->> 'public_id', ''),
        coalesce(v_entry.title, ''),
        v_entry.entry_date,
        jsonb_build_object(
          'title', coalesce(v_entry.title, ''),
          'entryDate', v_entry.entry_date,
          'entryType', coalesce(v_entry.entry_type, 'image'),
          'contentText', coalesce(v_entry.content_text, ''),
          'mood', coalesce(v_entry.mood, ''),
          'source', coalesce(v_entry.source, 'manual'),
          'visibility', coalesce(v_entry.visibility, 'private')
        )
      );
    else
      v_kept := v_kept || jsonb_build_array(v_block);
      if coalesce(v_block ->> 'type', '') = 'image' then
        v_remaining_images := v_remaining_images + 1;
        if v_new_cover = '' then
          v_new_cover := coalesce(v_block ->> 'url', '');
        end if;
      end if;
    end if;
  end loop;

  -- 图片删光后的两种归宿（2026-11-04 用户口径）：
  --   · 帖子没有正文（body 为空）⇒ 整帖一起消失（CASCADE 连带删备份条目），回收站快照可重建；
  --     手记没有可用文字 ⇒ 删条目行。
  --   · 帖子还有正文 ⇒ 条目与帖子都保留，只把 image_count/封面清零。
  --
  -- ⚠️ 判据**不能**用 entry_type：论坛备份的 content_blocks 里永远有一个「【标题】」文字块，
  --    删掉第一张图后守卫会把 entry_type 从 image 改写成 mixed，第二张（最后一张）就判不出来了
  --    （2026-11-04 事务内实测踩到）。以 posts.body 是否为空为准。
  v_delete_whole := false;
  if v_remaining_images = 0 then
    if coalesce(v_entry.source, '') = 'forum' and v_entry.source_post_id is not null then
      -- 归属校验：source_post_id 是客户端可写的。
      if not exists (
        select 1
          from public.posts
         where id = v_entry.source_post_id
           and author_id = v_user_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'FORBIDDEN:没有权限把这张图片同步到论坛原帖';
      end if;

      select coalesce(btrim(body), '')
        into v_post_body
        from public.posts
       where id = v_entry.source_post_id;

      v_delete_whole := (v_post_body = '');
    elsif coalesce(v_entry.source, '') = 'forum' then
      -- 历史遗留：备份存在但没挂上帖子（回填前的老数据）。退回 entry_type 判据。
      v_delete_whole := (coalesce(v_entry.entry_type, 'image') = 'image');
    else
      -- 手记：看剩下还有没有非空文字块
      select coalesce(string_agg(btrim(coalesce(b ->> 'text', '')), ''), '')
        into v_remaining_text
        from jsonb_array_elements(v_kept) b
       where b ->> 'type' = 'text';

      v_delete_whole := (v_remaining_text = '');
    end if;
  end if;

  if v_delete_whole then
    if coalesce(v_entry.source, '') = 'forum' and v_entry.source_post_id is not null then
      -- 只删行，**不删 Cloudinary 资产**：资产留给 30 天回收站。
      delete from public.posts where id = v_entry.source_post_id;
      v_post_deleted := true;
    else
      delete from public.boh_cloud_entries where id = v_entry.id;
    end if;

    v_entry_deleted := true;
  else
    update public.boh_cloud_entries
       set content_blocks = v_kept,
           cover_image_url = v_new_cover,
           updated_at = now()
     where id = v_entry.id;

    if coalesce(v_entry.source, '') = 'forum'
       and v_entry.source_post_id is not null
       and coalesce(array_length(v_removed_public_ids, 1), 0) > 0 then
      -- 归属校验：source_post_id 由客户端写入（没有「指向别人的帖子」的约束），
      -- 不校验就能拿自己条目里的 public_id 去删别人的帖子图片。
      if not exists (
        select 1
          from public.posts
         where id = v_entry.source_post_id
           and author_id = v_user_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'FORBIDDEN:没有权限把这张图片同步到论坛原帖';
      end if;

      delete from public.forum_post_images
       where post_id = v_entry.source_post_id
         and public_id = any(v_removed_public_ids);

      -- 剩余图片重排 sort_order，避免出现空洞（帖子编辑页按 sort_order 渲染）
      with ordered as (
        select id, row_number() over (order by sort_order, created_at) - 1 as rn
          from public.forum_post_images
         where post_id = v_entry.source_post_id
      )
      update public.forum_post_images i
         set sort_order = o.rn
        from ordered o
       where i.id = o.id
         and i.sort_order <> o.rn;

      select count(*)
        into v_post_image_count
        from public.forum_post_images
       where post_id = v_entry.source_post_id
         and moderation_status = 'approved';

      v_post_cover := null;
      select i.url
        into v_post_cover
        from public.forum_post_images i
       where i.post_id = v_entry.source_post_id
         and i.moderation_status = 'approved'
       order by i.sort_order, i.created_at
       limit 1;

      update public.posts
         set image_count = v_post_image_count,
             cover_image_url = coalesce(v_post_cover, ''),
             updated_at = now(),
             edited_at = now()
       where id = v_entry.source_post_id;

      v_post_synced := true;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'entryId', v_entry.id,
    'removed', v_removed,
    'remainingImages', v_remaining_images,
    'entryDeleted', v_entry_deleted,
    'postDeleted', v_post_deleted,
    'postSynced', v_post_synced,
    'postImageCount', v_post_image_count
  );
end;
$fn$;

revoke all on function public.delete_cloud_entry_images(uuid, integer[]) from public;
revoke all on function public.delete_cloud_entry_images(uuid, integer[]) from anon;
grant execute on function public.delete_cloud_entry_images(uuid, integer[]) to authenticated;

-- ── 3) 恢复：回收站行 → 图库 blocks + 原帖图片 ──────────────────────────────
create or replace function public.restore_cloud_image_trash(p_trash_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user_id uuid := auth.uid();
  v_ids uuid[] := '{}'::uuid[];
  v_total integer := 0;
  v_restored integer := 0;
  v_entry_id uuid;
  v_entry public.boh_cloud_entries%rowtype;
  v_blocks jsonb := '[]'::jsonb;
  v_added integer := 0;
  v_images integer := 0;
  v_post_images integer := 0;
  v_next_order integer := 0;
  v_snapshot jsonb := '{}'::jsonb;
  v_snapshot_post_id uuid;
  v_restore_source text := 'migrated';
  v_restore_post_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'NOT_AUTHENTICATED:登录状态已失效，请重新登录后再试';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
    into v_ids
    from unnest(coalesce(p_trash_ids, '{}'::uuid[])) as value;

  select count(*)
    into v_total
    from public.boh_cloud_image_trash
   where id = any(v_ids)
     and user_id = v_user_id
     and state = 'pending';

  if v_total = 0 or v_total < coalesce(array_length(v_ids, 1), 0) then
    raise exception using
      errcode = 'P0001',
      message = 'TRASH_NOT_FOUND:回收站里没有这些图片，或已被恢复/清理';
  end if;

  if exists (
    select 1
      from public.boh_cloud_image_trash
     where id = any(v_ids)
       and purge_after <= now()
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'TRASH_EXPIRED:超过 30 天保留期，图片已被清理';
  end if;

  for v_entry_id in
    select distinct entry_id
      from public.boh_cloud_image_trash
     where id = any(v_ids)
       and user_id = v_user_id
       and state = 'pending'
  loop
    select * into v_entry
      from public.boh_cloud_entries
     where id = v_entry_id
     for update;

    select coalesce(jsonb_agg(block order by block_index), '[]'::jsonb), count(*)
      into v_blocks, v_added
      from public.boh_cloud_image_trash
     where id = any(v_ids)
       and entry_id = v_entry_id
       and user_id = v_user_id
       and state = 'pending';

    if v_entry.id is null then
      -- 条目随「删光」一起消失了（纯图片帖删光 / 纯图片手记删光）⇒ 按快照重建。
      -- 帖子若还在（且是本人的），重建后继续挂回原帖；帖子没了就降级成 migrated，
      -- 不能保留 source='forum' + 空 source_post_id —— 那会被「整条删除」守卫误锁。
      select coalesce(entry_snapshot, '{}'::jsonb), source_post_id
        into v_snapshot, v_snapshot_post_id
        from public.boh_cloud_image_trash
       where id = any(v_ids)
         and entry_id = v_entry_id
         and user_id = v_user_id
       order by block_index
       limit 1;

      if coalesce(v_snapshot, '{}'::jsonb) = '{}'::jsonb then
        raise exception using
          errcode = 'P0001',
          message = 'ENTRY_NOT_FOUND:原内容已被删除，且没有可用的恢复快照';
      end if;

      v_restore_post_id := null;
      v_restore_source := 'migrated';
      if coalesce(v_snapshot ->> 'source', '') = 'forum'
         and v_snapshot_post_id is not null
         and exists (
           select 1
             from public.posts
            where id = v_snapshot_post_id
              and author_id = v_user_id
         ) then
        v_restore_source := 'forum';
        v_restore_post_id := v_snapshot_post_id;
      end if;

      begin
        insert into public.boh_cloud_entries (
          user_id, entry_date, title, entry_type, visibility, content_text,
          content_blocks, cover_image_url, mood, source, source_post_id
        ) values (
          v_user_id,
          coalesce((v_snapshot ->> 'entryDate')::date, timezone('Asia/Shanghai', now())::date),
          left(coalesce(v_snapshot ->> 'title', ''), 120),
          'image',
          'private',
          coalesce(v_snapshot ->> 'contentText', ''),
          v_blocks,
          coalesce(v_blocks -> 0 ->> 'url', ''),
          coalesce(v_snapshot ->> 'mood', ''),
          v_restore_source,
          v_restore_post_id
        )
        returning * into v_entry;
      exception
        when others then
          if sqlerrm ilike '%CLOUD_IMAGE_LIMIT_EXCEEDED%' then
            raise exception using
              errcode = 'P0001',
              message = 'QUOTA_EXCEEDED:Cloud+ 图片额度不足，请先清理其他图片再恢复';
          end if;
          raise;
      end;

      update public.boh_cloud_image_trash
         set entry_id = v_entry.id
       where id = any(v_ids)
         and entry_id = v_entry_id
         and user_id = v_user_id
         and state = 'pending';
    else
      select count(*)
        into v_images
        from jsonb_array_elements(coalesce(v_entry.content_blocks, '[]'::jsonb)) b
       where b ->> 'type' = 'image';

      if v_images + v_added > 9 then
        raise exception using
          errcode = 'P0001',
          message = 'ENTRY_IMAGE_LIMIT:这条内容最多 9 张图片，请先删掉一些再恢复';
      end if;

      begin
        update public.boh_cloud_entries
           set content_blocks = coalesce(v_entry.content_blocks, '[]'::jsonb) || v_blocks,
               cover_image_url = case
                 when coalesce(v_entry.cover_image_url, '') = ''
                   then coalesce(v_blocks -> 0 ->> 'url', '')
                 else v_entry.cover_image_url
               end,
               updated_at = now()
         where id = v_entry.id;
      exception
        when others then
          if sqlerrm ilike '%CLOUD_IMAGE_LIMIT_EXCEEDED%' then
            raise exception using
              errcode = 'P0001',
              message = 'QUOTA_EXCEEDED:Cloud+ 图片额度不足，请先清理其他图片再恢复';
          end if;
          raise;
      end;
    end if;

    -- 原帖仍在 → 图片追加回帖子末尾（不还原原始位次：帖子编辑本身也不保留中间插入位次）
    if v_entry.source_post_id is not null
       and exists (select 1 from public.posts where id = v_entry.source_post_id) then
      -- 与删除侧同一条归属校验：source_post_id 是客户端可写的，不校验就能把图塞进别人的帖子。
      if not exists (
        select 1
          from public.posts
         where id = v_entry.source_post_id
           and author_id = v_user_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'FORBIDDEN:没有权限把这张图片恢复到论坛原帖';
      end if;

      select count(*)
        into v_post_images
        from public.forum_post_images
       where post_id = v_entry.source_post_id
         and moderation_status = 'approved';

      if v_post_images + v_added > 6 then
        raise exception using
          errcode = 'P0001',
          message = 'POST_IMAGE_LIMIT:原帖已有 6 张图片，无法恢复更多';
      end if;

      select coalesce(max(sort_order), -1) + 1
        into v_next_order
        from public.forum_post_images
       where post_id = v_entry.source_post_id;

      insert into public.forum_post_images (
        post_id, user_id, cloud_entry_id, url, public_id, width, height,
        format, moderation_status, moderation_source, moderation_score,
        moderation_reason, sort_order
      )
      select
        v_entry.source_post_id,
        v_user_id,
        v_entry.id,
        coalesce(t.block ->> 'url', ''),
        coalesce(t.block ->> 'publicId', t.block ->> 'public_id', ''),
        greatest(coalesce(nullif(t.block ->> 'width', '')::integer, 1), 1),
        greatest(coalesce(nullif(t.block ->> 'height', '')::integer, 1), 1),
        '',
        'approved',
        'manual',
        null,
        '',
        v_next_order + row_number() over (order by t.block_index)
      from public.boh_cloud_image_trash t
       where t.id = any(v_ids)
         and t.entry_id = v_entry_id
         and t.user_id = v_user_id
         and t.state = 'pending';

      update public.posts p
         set image_count = (
               select count(*)
                 from public.forum_post_images i
                where i.post_id = p.id
                  and i.moderation_status = 'approved'
             ),
             cover_image_url = coalesce((
               select i.url
                 from public.forum_post_images i
                where i.post_id = p.id
                  and i.moderation_status = 'approved'
                order by i.sort_order, i.created_at
                limit 1
             ), ''),
             updated_at = now(),
             edited_at = now()
       where p.id = v_entry.source_post_id;
    end if;

    update public.boh_cloud_image_trash
       set state = 'restored',
           restored_at = now()
     where id = any(v_ids)
       and entry_id = v_entry_id
       and user_id = v_user_id
       and state = 'pending';

    v_restored := v_restored + v_added;
  end loop;

  return jsonb_build_object('ok', true, 'restored', v_restored);
end;
$fn$;

revoke all on function public.restore_cloud_image_trash(uuid[]) from public;
revoke all on function public.restore_cloud_image_trash(uuid[]) from anon;
grant execute on function public.restore_cloud_image_trash(uuid[]) to authenticated;

-- ── 4) 30 天清理任务（依赖 purge-cloud-image-trash EF 已部署）───────────────
do $cron$
declare
  v_has_pg_cron boolean := false;
  v_has_pg_net boolean := false;
  v_has_secret boolean := false;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_pg_cron;
  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_pg_net;

  if not v_has_pg_cron or not v_has_pg_net then
    raise notice 'pg_cron / pg_net 未启用，跳过图库回收站清理任务。';
    return;
  end if;

  begin
    select exists (
      select 1 from vault.decrypted_secrets where name = 'push_dispatch_key'
    ) into v_has_secret;
  exception when undefined_table or insufficient_privilege then
    v_has_secret := false;
  end;

  if not v_has_secret then
    raise notice 'vault.push_dispatch_key 不存在，跳过图库回收站清理任务。';
    return;
  end if;

  begin
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'purge_cloud_image_trash_daily';
  exception when undefined_table or undefined_function or invalid_schema_name then
    null;
  end;

  -- 每天 04:50（避开既有的 03:20 / 03:40 / 04:10 / 04:35 任务）
  perform cron.schedule(
    'purge_cloud_image_trash_daily',
    '50 4 * * *',
    $cmd$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url'), '/')
               || '/functions/v1/purge-cloud-image-trash',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'pg_cron'),
        timeout_milliseconds := 30000
      );
    $cmd$
  );
exception when others then
  raise notice '创建图库回收站清理任务失败：%', coalesce(sqlerrm, 'UNKNOWN_ERROR');
end;
$cron$;

commit;
