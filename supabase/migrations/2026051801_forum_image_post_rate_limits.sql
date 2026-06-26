-- Replace the old daily forum image quota with short-window image-post rate limits.
-- Rules after this migration:
-- - max 6 images per forum post
-- - no hidden daily image total cap
-- - image posts: 1 per 3 minutes, max 9 forum images per 10 minutes
-- - admins are exempt from image-post rate limits

begin;

drop function if exists public.create_forum_post_with_images(text, text, text, jsonb);
drop function if exists public.create_forum_post_with_images(text, text, text, jsonb, text);

create function public.create_forum_post_with_images(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb,
  p_tag text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_body text := trim(coalesce(p_body, ''));
  v_author_username text := left(trim(coalesce(p_author_username, '')), 80);
  v_tag text := lower(trim(coalesce(p_tag, 'daily')));
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
  v_image jsonb;
  v_image_count integer := 0;
  v_recent_image_count integer := 0;
  v_post_id uuid;
  v_cloud_entry_id uuid;
  v_content text;
  v_cover_url text := '';
  v_cloud_blocks jsonb := '[]'::jsonb;
  v_cloud_image_blocks jsonb := '[]'::jsonb;
  v_url text;
  v_public_id text;
  v_width_text text;
  v_height_text text;
  v_score_text text;
  v_width integer;
  v_height integer;
  v_format text;
  v_score numeric;
  v_reason text;
  v_order integer := 0;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if v_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_TITLE:请填写标题';
  end if;

  if v_body = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_BODY:请填写正文内容';
  end if;

  if v_tag not in ('server', 'activity', 'daily', 'question') then
    v_tag := 'daily';
  end if;

  if jsonb_typeof(v_images) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:INVALID_IMAGES:图片数据格式无效';
  end if;

  v_image_count := jsonb_array_length(v_images);
  if v_image_count > 6 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:POST_IMAGE_LIMIT:每个帖子最多发布 6 张图片';
  end if;

  if v_image_count > 0 and not public.current_user_is_admin() then
    if exists (
      select 1
        from public.posts p
       where p.author_id = v_user_id
         and coalesce(p.image_count, 0) > 0
         and coalesce(p.status, 'approved') <> 'rejected'
         and p.created_at >= now() - interval '3 minutes'
       limit 1
    ) then
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_POST_COOLDOWN', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_POST_COOLDOWN:图片帖发布太频繁了，请 3 分钟后再试';
    end if;

    select coalesce(sum(coalesce(p.image_count, 0)), 0)
      into v_recent_image_count
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '10 minutes';

    if v_recent_image_count + v_image_count > 9 then
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_10M_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_10M_LIMIT:短时间内发布图片较多，请稍后再试';
    end if;
  end if;

  v_content := '【' || v_title || '】' || chr(10) || v_body;

  if v_image_count > 0 then
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      if jsonb_typeof(v_image) <> 'object' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;

      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width_text := trim(coalesce(v_image ->> 'width', ''));
      v_height_text := trim(coalesce(v_image ->> 'height', ''));
      v_score_text := trim(coalesce(v_image ->> 'moderationScore', ''));
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);

      if trim(coalesce(v_image ->> 'moderationStatus', '')) <> 'approved' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:IMAGE_NOT_APPROVED:图片未通过发布前安全检测';
      end if;

      if char_length(v_url) > 2048
         or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
         or v_url !~* '[.](png|jpe?g|webp)([?#].*)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE_URL:图片来源异常，已阻止发布';
      end if;

      if v_public_id = ''
         or char_length(v_public_id) > 255
         or v_public_id like '/%'
         or v_public_id like '%..%'
         or position(chr(92) in v_public_id) > 0 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_PUBLIC_ID:图片资源标识异常，已阻止发布';
      end if;

      if v_width_text !~ '^[0-9]+$' or v_height_text !~ '^[0-9]+$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      v_width := v_width_text::integer;
      v_height := v_height_text::integer;

      if v_width <= 0
         or v_height <= 0
         or v_width > 8192
         or v_height > 8192
         or (v_width::bigint * v_height::bigint) > 25000000 then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_DIMENSIONS:图片尺寸异常，请换一张图片';
      end if;

      if v_score_text <> '' and v_score_text !~ '^[0-9]+([.][0-9]+)?$' then
        raise exception using
          errcode = 'P0001',
          message = 'FORUM_IMAGE:INVALID_IMAGE:图片数据无效';
      end if;
      v_score := nullif(v_score_text, '')::numeric;

      if v_cover_url = '' then
        v_cover_url := v_url;
      end if;

      v_cloud_image_blocks := v_cloud_image_blocks || jsonb_build_array(jsonb_build_object(
        'type', 'image',
        'url', v_url,
        'publicId', v_public_id,
        'width', v_width,
        'height', v_height,
        'alt', '论坛图片'
      ));
    end loop;
  end if;

  insert into public.posts (
    content,
    title,
    body,
    tag,
    author_id,
    author_username,
    status,
    image_count,
    cover_image_url
  )
  values (
    v_content,
    v_title,
    v_body,
    v_tag,
    v_user_id,
    v_author_username,
    'approved',
    v_image_count,
    v_cover_url
  )
  returning id into v_post_id;

  if v_image_count > 0 then
    v_cloud_blocks := jsonb_build_array(jsonb_build_object(
      'type', 'text',
      'text', v_content
    )) || v_cloud_image_blocks;

    insert into public.boh_cloud_entries (
      user_id,
      entry_date,
      title,
      entry_type,
      visibility,
      content_text,
      content_blocks,
      cover_image_url,
      mood,
      source
    )
    values (
      v_user_id,
      timezone('Asia/Shanghai', now())::date,
      left('论坛：' || v_title, 120),
      case when v_body = '' then 'image' else 'mixed' end,
      'private',
      v_content,
      v_cloud_blocks,
      v_cover_url,
      '',
      'forum'
    )
    returning id into v_cloud_entry_id;

    update public.posts
       set forum_cloud_entry_id = v_cloud_entry_id
     where id = v_post_id;

    v_order := 0;
    for v_image in select value from jsonb_array_elements(v_images)
    loop
      v_url := trim(coalesce(v_image ->> 'url', ''));
      v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
      v_width := trim(coalesce(v_image ->> 'width', ''))::integer;
      v_height := trim(coalesce(v_image ->> 'height', ''))::integer;
      v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
      v_score := nullif(trim(coalesce(v_image ->> 'moderationScore', '')), '')::numeric;
      v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);

      insert into public.forum_post_images (
        post_id,
        user_id,
        cloud_entry_id,
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
        v_post_id,
        v_user_id,
        v_cloud_entry_id,
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

      v_order := v_order + 1;
    end loop;
  end if;

  return (
    select to_jsonb(result_row)
      from (
        select
          p.*,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', i.id,
              'url', i.url,
              'publicId', i.public_id,
              'width', i.width,
              'height', i.height,
              'format', i.format,
              'sortOrder', i.sort_order
            ) order by i.sort_order, i.created_at)
              from public.forum_post_images i
             where i.post_id = p.id
               and i.moderation_status = 'approved'
          ), '[]'::jsonb) as images
        from public.posts p
        where p.id = v_post_id
      ) result_row
  );
end;
$$;

revoke all on function public.create_forum_post_with_images(text, text, text, jsonb, text) from public;
grant execute on function public.create_forum_post_with_images(text, text, text, jsonb, text) to authenticated;
grant execute on function public.create_forum_post_with_images(text, text, text, jsonb, text) to service_role;

comment on function public.create_forum_post_with_images(text, text, text, jsonb, text) is
  '创建论坛图片帖；单帖最多 6 张，图片帖按短窗口限频，不再使用每日 5 张总量限制。';

notify pgrst, 'reload schema';

commit;
