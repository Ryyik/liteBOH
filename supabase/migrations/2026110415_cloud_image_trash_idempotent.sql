-- ============================================================================
-- 图库单图删除：改为按 publicId 幂等定位（plans/039 审查补丁，2026-11-04）
--
-- 为什么补这一版：
--   原实现按 contentBlocks 下标删。删成功之后 blocks 会重排，下标整体前移；
--   此时任何重试（响应超时、双端同时点、用户失败后再点一次）都会命中**下一张图**，
--   在事务内实测确认：blocks=[text,a,b,c] 连删两次 index 1 ⇒ a、b 都没了。
--
-- 改法：客户端传 publicId 列表，服务端按 publicId 定位 block。
--   匹配不到 ⇒ 说明这批图已经删过，直接返回 { removed: 0, alreadyDeleted: true }，
--   不删任何东西。幂等。
--
-- 向后兼容：p_public_ids 为空时退回原来的下标路径（旧客户端仍可工作）。
-- 旧签名 (uuid, integer[]) 被替换成 (uuid, integer[], text[])，因此旧前端
-- 需要一起发布；PWA 旧缓存由既有的强制刷新机制兜底。
-- ============================================================================

begin;

drop function if exists public.delete_cloud_entry_images(uuid, integer[]);

create or replace function public.delete_cloud_entry_images(
  p_entry_id uuid,
  p_block_indexes integer[],
  p_public_ids text[] default null
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
  v_public_ids text[] := '{}'::text[];
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

  -- 幂等定位（2026-11-04 审查补）：客户端传 publicId 时按 publicId 找 block，
  -- **不按下标**。重试同一批请求时，已删的图匹配不到 ⇒ removed=0 直接返回，
  -- 不会因为删除后下标前移而误删下一张。
  select coalesce(array_agg(distinct trim(value)), '{}'::text[])
    into v_public_ids
    from unnest(coalesce(p_public_ids, '{}'::text[])) as value
   where trim(coalesce(value, '')) <> '';

  if coalesce(array_length(v_public_ids, 1), 0) > 0 then
    select coalesce(array_agg(pos order by pos), '{}'::integer[])
      into v_indexes
      from (
        select (t.ordinality - 1) as pos,
               coalesce(t.value ->> 'publicId', t.value ->> 'public_id', '') as pid,
               coalesce(t.value ->> 'type', '') as btype
          from jsonb_array_elements(coalesce(v_entry.content_blocks, '[]'::jsonb))
               with ordinality as t(value, ordinality)
      ) s
     where s.btype = 'image'
       and s.pid = any(v_public_ids);

    -- 全部匹配不到 = 这批图早就删过了（重试/双端同时点）⇒ 幂等成功，什么都不动。
    if coalesce(array_length(v_indexes, 1), 0) = 0 then
      select count(*)
        into v_remaining_images
        from jsonb_array_elements(coalesce(v_entry.content_blocks, '[]'::jsonb)) b
       where b ->> 'type' = 'image';

      return jsonb_build_object(
        'ok', true,
        'entryId', v_entry.id,
        'removed', 0,
        'remainingImages', v_remaining_images,
        'entryDeleted', false,
        'postDeleted', false,
        'postSynced', false,
        'postImageCount', 0,
        'alreadyDeleted', true
      );
    end if;
  else
    -- 兼容路径：没有 publicId 时退回下标（旧客户端）。这条不幂等，
    -- 新前端一律传 publicId，正常不会走到这里。
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


revoke all on function public.delete_cloud_entry_images(uuid, integer[], text[]) from public;
revoke all on function public.delete_cloud_entry_images(uuid, integer[], text[]) from anon;
grant execute on function public.delete_cloud_entry_images(uuid, integer[], text[]) to authenticated;

commit;
