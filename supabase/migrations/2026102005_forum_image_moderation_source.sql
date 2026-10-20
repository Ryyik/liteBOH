-- 论坛图片审核来源落库：从「服务端硬编码 client_nsfwjs」改为「接受客户端裁决来源（白名单）」
--
-- 起因（2026-10-20 线上只读实测，判据可重跑）：
--   select coalesce(moderation_source,'(null)'), count(*) from public.forum_post_images group by 1;
--   → 128 行**只有** 'client_nsfwjs' 一个值；
--   while 同期 ai_quota_log 里 mode='moderation-image' 有 6 次 status='success' 的云端调用，
--   而落库 moderation_reason 里云端原文只有 1 条（2026-09-18），其余全是「本地兜底检测通过」。
--   ⇒ 云端判定即便成功也无法体现来源：**两个 RPC 都把 'client_nsfwjs' 写死了**，
--     而客户端链路（forum-format.js / forum-images-api.js）此前根本不传该字段。
--     结果「来源」列恒等于同一个值，等于没有；排查审核降级率时无法用 SQL 区分云端/本地。
--
-- 本次改动：
--   1. 放宽 forum_post_images_moderation_source_check 为超集（**只放宽，绝不收紧**，不改任何既有行）；
--   2. create_forum_post_with_images / update_forum_post_images 两个 RPC：
--      从入参读 moderationSource → 白名单校验 → 落库；缺失/非法回落 'client_nsfwjs'（安全默认）。
--
-- ⚠️ 白名单与前端 source 取值对齐（真源 src/utils/image-moderation-pipeline.js）：
--   'gemini'                     云端裁决成功
--   'local_fallback'             本地兜底通过
--   'local_fallback_borderline'  本地兜底低置信放行（needs_review 从宽）
--   'local_fallback_error'       本地兜底自身报错
--   'client_nsfwjs'              历史/缺省（旧客户端、旧行）
--   'manual' / 'none'            既有约束里的值，保持不变
--
-- 函数体来源：**以线上 pg_get_functiondef 为基线做最小替换**（不手抄，避免漂移）。
--   替换点共 3 处：声明区 +1 个 v_source、图片循环内白名单解析、insert 的硬编码来源。
--
-- 破坏性说明：仅放宽 CHECK + 替换两个函数的来源取值；不改状态机、不改额度/Cloud+ 同步逻辑。
-- 尚未 apply —— 需要人工确认后执行（见交付说明）。

begin;

-- ── 1) 放宽 moderation_source 的 CHECK（超集）────────────────────────────────
alter table public.forum_post_images
  drop constraint if exists forum_post_images_moderation_source_check;

alter table public.forum_post_images
  add constraint forum_post_images_moderation_source_check
  check (moderation_source = any (array[
    'gemini'::text,
    'local_fallback'::text,
    'local_fallback_borderline'::text,
    'local_fallback_error'::text,
    'client_nsfwjs'::text,
    'manual'::text,
    'none'::text
  ]));

-- ── 2) create_forum_post_with_images（线上定义 + 最小替换）──────────────────
CREATE OR REPLACE FUNCTION public.create_forum_post_with_images(p_title text, p_body text, p_author_username text DEFAULT ''::text, p_images jsonb DEFAULT '[]'::jsonb, p_tag text DEFAULT NULL::text, p_location_name text DEFAULT NULL::text, p_location_lat double precision DEFAULT NULL::double precision, p_location_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_daily_image_post_count integer := 0;
  v_oldest_recent_image_at timestamptz;
  v_today_start timestamptz := ((timezone('Asia/Shanghai', now())::date)::timestamp at time zone 'Asia/Shanghai');
  v_tomorrow_start timestamptz := (((timezone('Asia/Shanghai', now())::date + 1)::timestamp) at time zone 'Asia/Shanghai');
  v_retry_after_seconds integer := 60;
  v_post_id uuid;
  v_cloud_entry_id uuid;
  v_content text;
  v_first_image_url text := '';
  v_manual_cover_url text := '';
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
  v_source text;
  v_is_cover boolean;
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

  -- 带图帖允许正文为空：仅当正文与图片都为空时才拒绝
  if v_body = '' and not (jsonb_typeof(v_images) = 'array' and jsonb_array_length(v_images) > 0) then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_IMAGE:EMPTY_BODY:请填写正文内容或添加图片';
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
    select count(*)
      into v_daily_image_post_count
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.image_count, 0) > 0
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= v_today_start
       and p.created_at < v_tomorrow_start;

    if v_daily_image_post_count >= 5 then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_tomorrow_start - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'DAILY_IMAGE_POST_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:DAILY_IMAGE_POST_LIMIT:今天带图帖子发布额度已满，每天最多 5 条',
        hint = v_retry_after_seconds::text;
    end if;

    select min(p.created_at)
      into v_oldest_recent_image_at
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.image_count, 0) > 0
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '3 minutes';

    if v_oldest_recent_image_at is not null then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_image_at + interval '3 minutes' - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_POST_COOLDOWN', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_POST_COOLDOWN:图片帖发布太频繁了，请 3 分钟后再试',
        hint = v_retry_after_seconds::text;
    end if;

    select coalesce(sum(coalesce(p.image_count, 0)), 0), min(p.created_at)
      into v_recent_image_count, v_oldest_recent_image_at
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '10 minutes';

    if v_recent_image_count + v_image_count > 9 then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_image_at + interval '10 minutes' - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'IMAGE_10M_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:IMAGE_10M_LIMIT:短时间内发布图片较多，请稍后再试',
        hint = v_retry_after_seconds::text;
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
      v_is_cover := lower(trim(coalesce(v_image ->> 'isCover', v_image ->> 'is_cover', 'false'))) in ('true', '1', 'yes');

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

      if v_first_image_url = '' then
        v_first_image_url := v_url;
      end if;

      if v_is_cover and v_manual_cover_url = '' then
        v_manual_cover_url := v_url;
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

  v_cover_url := coalesce(nullif(v_manual_cover_url, ''), v_first_image_url);

  insert into public.posts (
    content,
    title,
    body,
    tag,
    author_id,
    author_username,
    status,
    image_count,
    cover_image_url,
    location_name,
    location_lat,
    location_lng
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
    v_cover_url,
    trim(coalesce(p_location_name, '')),
    case when p_location_lat is not null and p_location_lat between -90 and 90 then p_location_lat else null end,
    case when p_location_lng is not null and p_location_lng between -180 and 180 then p_location_lng else null end
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
      -- 审核来源：接受客户端裁决来源，白名单外一律回落 client_nsfwjs（安全默认）。
      -- 为什么要载入：云端（gemini）与本地兜底（local_fallback*）必须可区分，
      -- 否则「云端成功率」在 SQL 层无从统计（2026-10-20 实测 128 行只有一个值）。
      v_source := lower(btrim(coalesce(v_image ->> 'moderationSource', v_image ->> 'moderation_source', '')));
      if v_source not in ('gemini','local_fallback','local_fallback_borderline','local_fallback_error','client_nsfwjs','manual','none') then
        v_source := 'client_nsfwjs';
      end if;

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
        v_source,
        v_score,
        v_reason,
        v_order
      );

      if to_regclass('public.cloudinary_pending_uploads') is not null then
        update public.cloudinary_pending_uploads
           set claimed_at = coalesce(claimed_at, now()),
               updated_at = now()
         where user_id = v_user_id
           and public_id = v_public_id
           and deleted_at is null;
      end if;

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
              'sortOrder', i.sort_order,
              'isCover', i.url = p.cover_image_url
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
$function$;

-- ── 3) update_forum_post_images（线上定义 + 最小替换）───────────────────────
CREATE OR REPLACE FUNCTION public.update_forum_post_images(p_post_id uuid, p_images jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_source text;
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
      -- 与 create_forum_post_with_images 同口径：接受客户端来源，白名单外回落安全默认。
      v_source := lower(btrim(coalesce(v_item ->> 'moderationSource', v_item ->> 'moderation_source', '')));
      if v_source not in ('gemini','local_fallback','local_fallback_borderline','local_fallback_error','client_nsfwjs','manual','none') then
        v_source := 'client_nsfwjs';
      end if;

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
        v_source,
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
$function$;

commit;

notify pgrst, 'reload schema';
