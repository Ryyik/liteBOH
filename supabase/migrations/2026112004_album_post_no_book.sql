-- 图文帖发布不再要求「影集本」（2026-11-20）
--
-- 背景：2026-11-16 影集降级为发帖**格式**（常规 / 图文），「一人一本」取消
-- （见 src/utils/forum-album.js 头注与 src/views/Forum/components/MyAlbumBook.vue）。
-- 但线上 `create_album_post_with_images`（2026111402）仍保留两条旧语义，导致图文模式发布被拦：
--   ① `profiles.album_title` 为空 ⇒ 抛 `FORUM_ALBUM:NO_BOOK:先给影集起个名字和简介，再发布第一篇`
--      —— 降级后前端不再建本，任何没建过本的用户（含全部新用户）都无法发布图文；
--   ② `v_title := left(v_book_title, 120)` —— 标题被强行替换成影集本名，
--      用户在发帖器里填的篇名被丢弃（信息流卡片显示的是老的本名）。
--
-- 本迁移 create or replace 该函数（签名不变，幂等包装函数与授权不受影响）：
--   · 删除 NO_BOOK 闸门与 profiles 读取（album_title/album_intro 列保留，老数据不动，留给以后可能的重建）；
--   · 标题改用客户端 p_title（trim + 120 截断），空标题报
--     `FORUM_ALBUM:EMPTY_TITLE:请填写标题`，与 create_forum_post_with_images 的
--     `FORUM_IMAGE:EMPTY_TITLE` 同口径（前端 ForumMain.handlePost 本就先拦空标题）。
-- 其余校验（图必传 1..10、entries 与图一一对齐、冷却与每日图池、图片域名白名单）全部原样保留。

begin;

create or replace function public.create_album_post_with_images(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb,
  p_tag text default null,
  p_location_name text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_album_entries jsonb default '[]'::jsonb
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
  v_entries_in jsonb := coalesce(p_album_entries, '[]'::jsonb);
  v_entries jsonb := '[]'::jsonb;
  v_image jsonb;
  v_image_count integer := 0;
  v_entry_count integer := 0;
  v_filled_entry_count integer := 0;
  v_recent_image_count integer := 0;
  v_oldest_recent_image_at timestamptz;
  v_retry_after_seconds integer := 60;
  v_post_id uuid;
  v_content text;
  v_cover_url text := '';
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
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  -- 2026-11-16 影集降级为发帖格式（图文）后不再有「本」：标题就是这一篇的标题，
  -- 由客户端必填（发帖器先拦空标题）；这里与 create_forum_post_with_images 同口径兜底。
  if v_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:EMPTY_TITLE:请填写标题';
  end if;

  if v_tag not in ('server', 'activity', 'daily', 'question') then
    v_tag := 'daily';
  end if;

  if jsonb_typeof(v_images) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:INVALID_IMAGES:图片数据格式无效';
  end if;

  v_image_count := jsonb_array_length(v_images);
  if v_image_count < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:NO_IMAGE:影集至少需要一张照片';
  end if;

  if v_image_count > 10 then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:POST_IMAGE_LIMIT:一本影集最多 10 张照片';
  end if;

  -- 篇与图必须一一对齐：前端删图时会同步压缩 entries，数量不一致说明客户端状态坏了，
  -- 静默截断会造成「图和字错位」，比报错更难查。
  if jsonb_typeof(v_entries_in) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:INVALID_ENTRIES:影集内容格式无效';
  end if;

  v_entry_count := jsonb_array_length(v_entries_in);

  -- 允许「只传图 + 一句配文」的轻量发布：entries 为空时按图片数量生成占位篇，
  -- 保证 image_index 与 sort_order 始终对齐（阅读层按 index 取图注）。
  if v_entry_count = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'image_index', (t.ord - 1)::integer,
          'title', '',
          'date', '',
          'place', '',
          'body', ''
        )
        order by t.ord
      ),
      '[]'::jsonb
    )
    into v_entries
    from jsonb_array_elements(v_images) with ordinality as t(value, ord);
  elsif v_entry_count <> v_image_count then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:ENTRY_MISMATCH:照片与文字数量不一致，请重新编辑后再发';
  end if;

  -- 只在客户端真的传了 entries 时才归一化（否则会把上一步生成的占位篇冲成空数组）
  if v_entry_count > 0 then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'image_index', (t.ord - 1)::integer,
            'title', left(btrim(coalesce(t.value ->> 'title', '')), 16),
            'date', left(btrim(coalesce(t.value ->> 'date', '')), 12),
            'place', left(btrim(coalesce(t.value ->> 'place', '')), 16),
            'body', left(btrim(coalesce(t.value ->> 'body', '')), 2000)
          )
          order by t.ord
        ),
        '[]'::jsonb
      ),
      count(*) filter (
        where btrim(coalesce(t.value ->> 'title', '')) <> ''
           or btrim(coalesce(t.value ->> 'body', '')) <> ''
      )
    into v_entries, v_filled_entry_count
    from jsonb_array_elements(v_entries_in) with ordinality as t(value, ord)
    where jsonb_typeof(t.value) = 'object';
  end if;

  -- 配文可空（「每次发布可以写配文」= 允许只传图），图片是硬要求（上面已校验 ≥1 张）。

  -- 限额（管理员不受限，与普通图帖口径一致）
  -- 每日发图额度由 posts 上的 guard_forum_daily_image_quota 触发器统一执行
  -- （普通帖 + 影集共用一个池）。
  if not public.current_user_is_admin() then

    -- 与普通带图内容共享 3 分钟冷却（防「连点发布」把队列打爆）
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

    -- 单帖 10 张 > 普通帖 10 分钟窗口的 9 张，所以单给图文帖一条更宽的窗口
    select coalesce(sum(coalesce(p.image_count, 0)), 0), min(p.created_at)
      into v_recent_image_count, v_oldest_recent_image_at
      from public.posts p
     where p.author_id = v_user_id
       and coalesce(p.status, 'approved') <> 'rejected'
       and p.created_at >= now() - interval '10 minutes';

    if v_recent_image_count + v_image_count > 20 then
      v_retry_after_seconds := greatest(1, ceil(extract(epoch from (v_oldest_recent_image_at + interval '10 minutes' - now())))::integer);
      perform public.log_forum_rate_limit_event(v_user_id, 'post', 'ALBUM_10M_LIMIT', null);
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_RATE_LIMIT:ALBUM_10M_LIMIT:短时间内发布图片较多，请稍后再试',
        hint = v_retry_after_seconds::text;
    end if;
  end if;

  v_content := '【' || v_title || '】' || chr(10) || v_body;

  -- 图片校验（与 create_forum_post_with_images 同口径：来源域名、审核状态、尺寸）
  for v_image in select value from jsonb_array_elements(v_images)
  loop
    if jsonb_typeof(v_image) <> 'object' then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_ALBUM:INVALID_IMAGE:图片数据无效';
    end if;

    if trim(coalesce(v_image ->> 'moderationStatus', '')) <> 'approved' then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_ALBUM:IMAGE_NOT_APPROVED:图片未通过发布前安全检测';
    end if;

    v_url := trim(coalesce(v_image ->> 'url', ''));
    if char_length(v_url) > 2048
       or v_url !~ '^https://res[.]cloudinary[.]com/[A-Za-z0-9_-]+/image/upload/'
       or v_url !~* '[.](png|jpe?g|webp)([?#].*)?$' then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_ALBUM:INVALID_IMAGE_URL:图片来源异常，已阻止发布';
    end if;

    v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
    if char_length(v_public_id) > 255 or position(chr(92) in v_public_id) > 0 then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_ALBUM:INVALID_PUBLIC_ID:图片标识异常，已阻止发布';
    end if;

    v_width_text := trim(coalesce(v_image ->> 'width', ''));
    v_height_text := trim(coalesce(v_image ->> 'height', ''));
    if v_width_text !~ '^[0-9]+$' or v_height_text !~ '^[0-9]+$' then
      raise exception using
        errcode = 'P0001',
        message = 'FORUM_ALBUM:INVALID_IMAGE_SIZE:图片尺寸无效';
    end if;

    if trim(coalesce(v_image ->> 'isCover', v_image ->> 'is_cover', 'false')) in ('true', 't', '1') then
      v_cover_url := v_url;
    end if;

    if v_order = 0 and v_cover_url = '' then
      v_cover_url := v_url;
    end if;

    v_order := v_order + 1;
  end loop;

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
    location_lng,
    album_entries
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
    case when p_location_lng is not null and p_location_lng between -180 and 180 then p_location_lng else null end,
    v_entries
  )
  returning id into v_post_id;

  v_order := 0;
  for v_image in select value from jsonb_array_elements(v_images)
  loop
    v_url := trim(coalesce(v_image ->> 'url', ''));
    v_public_id := trim(coalesce(v_image ->> 'publicId', v_image ->> 'public_id', ''));
    v_width := trim(coalesce(v_image ->> 'width', '0'))::integer;
    v_height := trim(coalesce(v_image ->> 'height', '0'))::integer;
    v_format := left(lower(trim(coalesce(v_image ->> 'format', ''))), 16);
    v_score_text := trim(coalesce(v_image ->> 'moderationScore', ''));
    v_score := nullif(v_score_text, '')::numeric;
    v_reason := left(trim(coalesce(v_image ->> 'moderationReason', '')), 160);
    v_source := lower(btrim(coalesce(v_image ->> 'moderationSource', v_image ->> 'moderation_source', '')));
    if v_source not in ('gemini', 'local_fallback', 'local_fallback_borderline', 'local_fallback_error', 'client_nsfwjs', 'manual', 'none') then
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
      null,
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

  select to_jsonb(p) into v_result from public.posts p where p.id = v_post_id;
  return v_result;
end;
$$;

comment on function public.create_album_post_with_images(text, text, text, jsonb, text, text, double precision, double precision, jsonb) is
  '创建图文帖（原影集帖，2026-11-16 降级为发帖格式）：单帖最多 10 张图，每张图配一段文字（posts.album_entries）；标题为该篇标题，不要求影集本（2026112004）。';

commit;
