-- 2026082801_update_forum_post_images.sql
-- 帖子编辑：更新帖子的图片集合（删除被移除的图、插入新图、按传入顺序重排），
-- 并同步 posts.image_count / posts.cover_image_url。
-- 因 forum_post_images 的 insert/update/delete 仅授予 service_role，
-- 编辑场景必须走 security definer 函数完成（与 create_forum_post_with_images 同模式）。

begin;

create or replace function public.update_forum_post_images(
  p_post_id uuid,
  p_images jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.posts%rowtype;
  v_is_admin boolean;
  v_item jsonb;
  v_kept_ids uuid[] := '{}'::uuid[];
  v_url text;
  v_public_id text;
  v_width integer;
  v_height integer;
  v_format text;
  v_score numeric;
  v_reason text;
  v_order integer := 0;
  v_image_count integer := 0;
  v_cover_url text := '';
  v_kept_id uuid;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'NOT_AUTHENTICATED:登录状态已失效，请重新登录后再编辑';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if v_post.id is null then
    raise exception using
      errcode = 'P0001',
      message = 'POST_NOT_FOUND:帖子不存在或已被删除';
  end if;

  select public.current_user_is_admin() into v_is_admin;
  if v_post.author_id <> v_user_id and not coalesce(v_is_admin, false) then
    raise exception using
      errcode = 'P0001',
      message = 'FORBIDDEN:没有权限编辑此帖子的图片';
  end if;

  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:INVALID_PAYLOAD:图片数据无效';
  end if;

  if (select jsonb_array_length(coalesce(p_images, '[]'::jsonb))) > 6 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:IMAGE_LIMIT:每个帖子最多发布 6 张图片';
  end if;

  -- 1) 收集保留的旧图 id
  for v_item in select value from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) loop
    continue when jsonb_typeof(v_item) <> 'object';
    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      begin
        v_kept_id := (v_item ->> 'id')::uuid;
        v_kept_ids := v_kept_ids || v_kept_id;
      exception when others then
        null; -- 忽略非法 id，避免伪造 id 干扰
      end;
    end if;
  end loop;

  -- 2) 删除被移除的旧图记录
  delete from public.forum_post_images
   where post_id = p_post_id
     and not (id = any(v_kept_ids));

  -- 3) 逐条处理：保留图更新顺序；新图校验后插入
  for v_item in select value from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) loop
    continue when jsonb_typeof(v_item) <> 'object';

    if v_item ? 'id' and jsonb_typeof(v_item -> 'id') = 'string' then
      -- 保留的旧图：仅重排 sort_order
      update public.forum_post_images
         set sort_order = v_order
       where id = ((v_item ->> 'id')::uuid)
         and post_id = p_post_id;
      if found then
        if v_order = 0 then
          select url into v_cover_url
            from public.forum_post_images
           where id = ((v_item ->> 'id')::uuid)
             and post_id = p_post_id;
        end if;
        v_image_count := v_image_count + 1;
      end if;
    else
      -- 新图：与 create_forum_post_with_images 一致的安全校验
      v_url := trim(coalesce(v_item ->> 'url', ''));
      v_public_id := trim(coalesce(v_item ->> 'publicId', v_item ->> 'public_id', ''));
      v_format := left(lower(trim(coalesce(v_item ->> 'format', ''))), 16);
      v_score := nullif(trim(coalesce(v_item ->> 'moderationScore', v_item ->> 'moderation_score', '')), '')::numeric;
      v_reason := left(trim(coalesce(v_item ->> 'moderationReason', v_item ->> 'moderation_reason', '')), 160);

      if char_length(v_url) > 2048
         or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
         or v_url !~* '[.](png|jpe?g|webp)([?#].*)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE_URL:图片来源异常，已阻止保存';
      end if;

      if v_public_id = ''
         or char_length(v_public_id) > 255
         or v_public_id like '/%'
         or v_public_id like '%..%'
         or position(chr(92) in v_public_id) > 0 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_PUBLIC_ID:图片资源标识异常，已阻止保存';
      end if;

      if trim(coalesce(v_item ->> 'width', '')) !~ '^[0-9]+$'
         or trim(coalesce(v_item ->> 'height', '')) !~ '^[0-9]+$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      v_width := trim(coalesce(v_item ->> 'width', ''))::integer;
      v_height := trim(coalesce(v_item ->> 'height', ''))::integer;

      if v_width <= 0 or v_height <= 0
         or v_width > 8192 or v_height > 8192
         or (v_width::bigint * v_height::bigint) > 25000000 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      insert into public.forum_post_images (
        post_id,
        user_id,
        url,
        public_id,
        width,
        height,
        format,
        moderation_status,
        moderation_source,
        moderation_score,
        moderation_reason,
        sort_order
      )
      values (
        p_post_id,
        v_user_id,
        v_url,
        v_public_id,
        v_width,
        v_height,
        v_format,
        'approved',
        'client_nsfwjs',
        v_score,
        v_reason,
        v_order
      );

      if v_order = 0 then
        v_cover_url := v_url;
      end if;
      v_image_count := v_image_count + 1;
    end if;

    v_order := v_order + 1;
  end loop;

  -- 4) 同步帖子的封面与图片数
  update public.posts
     set image_count = v_image_count,
         cover_image_url = nullif(v_cover_url, '')
   where id = p_post_id;

  return jsonb_build_object(
    'ok', true,
    'postId', p_post_id,
    'imageCount', v_image_count
  );
end;
$$;

revoke all on function public.update_forum_post_images(uuid, jsonb) from public;
grant execute on function public.update_forum_post_images(uuid, jsonb) to authenticated;
grant execute on function public.update_forum_post_images(uuid, jsonb) to service_role;

comment on function public.update_forum_post_images(uuid, jsonb) is
  '更新帖子的图片集合：删除被移除的旧图、插入新图、按传入顺序重排，并同步封面与图片数。';

notify pgrst, 'reload schema';

commit;
