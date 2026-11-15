-- 影集帖（album post）—— 数据层
--
-- 形态：**A 投影**（2026-11-14 定稿）
--   影集帖就是一条普通帖子，不新建表、不复制图片：
--     posts.title           影集名
--     posts.body            卷首语（可空）
--     forum_post_images     每一篇的照片（同一套 Cloudinary + 审核 + 画质管线）
--     posts.album_entries   每一篇的文字 [{image_index,title,date,place,body}]，
--                           按 sort_order 与图片一一对齐，**不存图片地址**
--   个人影集页/Cloud+ 影集分区直接按 `album_entries <> '[]'` 读帖子（零复制、零漂移）。
--
-- 为什么不在 RPC 里写 boh_cloud_entries：
--   投影语义下「帖子的每一篇」本来就是 Cloud+ 里的一天，再物化一份就是第三份副本
--   （plans/039 §9.2 实测过 forum_post_images ↔ boh_cloud_entries 的单向漂移）。
--   图片额度仍按既有 `boh_cloud_count_forum_images` 口径计入（forum_post_images 行本身），
--   所以「Cloud+ 接管」的配额/回收站语义不变，只是不再复制一份条目。
--   ⚠️ 若产品决定「影集也要进 Cloud+ 图库」，正确做法是**一条日记一篇图**（1 图/条），
--      不要往单条目里塞 10 张 —— `guard_boh_cloud_entry_upload` 硬限单条目 ≤9 图。
--
-- 形态补充（2026-11-15 定稿）：**一个用户就一本影集**
--   不建「书」表、不加 album_book_id：某人的那本 = `该 author_id 的全部影集帖按时间倒序`。
--   「无上限」天然成立（一本里的帖子数不设限），也不需要书位配额/换架交互。
--
-- 限额（影集 vs 普通图帖）：
--   单本 10 张（普通帖 6 张）｜ 与所有带图内容共享 **每天 30 张图** 的池子
--   ｜ 与所有带图内容共享 3 分钟冷却 ｜ 10 分钟窗口 ≤20 张（普通帖是 9 张）
--   ⚠️ 「每天 30 图」由本文件的 `guard_forum_daily_image_quota` 触发器统一执行，
--      普通帖与影集共用同一池 —— 不按「条数」算，否则 5 条影集 × 10 图 = 50 图会超过普通帖的 30 图。
--   ⚠️ 前端真源 `src/utils/forum-album.js` 的 ALBUM_MAX_ENTRIES 必须与本文件同步改。
--
-- ✅ 已 apply（2026-11-15 13:1x，经 Management API `/database/query` 执行，
--    并已登记到 supabase_migrations.schema_migrations(version=2026111402)）。
-- ⚠️ 已知待补：`list_forum_posts` v2（2026110305）的返回体里有显式列清单，没有 `album_entries`。
--    前端主链路走直连表 `.select('*')`（能读到新列 + `is_album`），「影集」分区与个人影集页
--    也走直连表过滤 `is_album`，所以**不受影响**；只有搜索/游标那条 RPC 分支返回的影集帖
--    会退化成普通卡（能看能点，只是不是影集外观）。要补需重写那个 350 行函数，留作后续。

begin;

-- ── 1) 列 + 约束 ────────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists album_entries jsonb not null default '[]'::jsonb;

alter table public.posts
  drop constraint if exists posts_album_entries_shape;

alter table public.posts
  add constraint posts_album_entries_shape
  check (
    jsonb_typeof(album_entries) = 'array'
    and jsonb_array_length(album_entries) <= 10
  );

-- 「是不是影集帖」做成生成列：前端过滤只写 `.eq('is_album', true)`，
-- 不用在 PostgREST 里比 JSONB 字面量（`album_entries=neq.[]` 的 URL 编码很容易出错）。
-- 生成列是 STORED，可直接建部分索引；jsonb_array_length 是 immutable，满足生成列要求。
alter table public.posts
  add column if not exists is_album boolean
  generated always as (jsonb_array_length(album_entries) > 0) stored;

-- 个人影集页高频查询：本人的、是影集的帖子
create index if not exists idx_posts_album_author
  on public.posts (author_id, created_at desc)
  where is_album;

-- 社区「影集」分区：全体影集帖按时间倒序
create index if not exists idx_posts_album_recent
  on public.posts (created_at desc, id desc)
  where is_album;

comment on column public.posts.album_entries is
  '影集帖每篇的文字：[{image_index,title,date,place,body}]，与 forum_post_images.sort_order 对齐；空数组=普通帖。';

comment on column public.posts.is_album is
  '生成列：album_entries 非空即为影集帖。前端过滤一律用它，不要比 JSONB 字面量。';

-- ── 1a) 影集本体的元数据（一人一本，存 profiles，零新表）─────────────────────
-- 2026-11-15 流程定稿：
--   ① **初次创建/发布**时必须填「影集名称 + 简介」；
--   ② 之后每次发布只写**配文 + 图**（图必传，配文可空）。
-- 所以名称与简介必须有一个「只存一次」的地方 —— profiles 与 auth.users 是 1:1，
-- 且已有 `profiles_select_public`（任何人可读）与 `profiles_update_self`（本人可写）
-- 两条策略，加两列即可，不需要新表 / 新策略 / 新触发器。
-- 帖子上的 title 仍写这份名称（denormalized，信息流卡片直接读，省掉 join）；
-- 改名由 set_forum_album_book 一并回写，避免出现两处不一致。
alter table public.profiles
  add column if not exists album_title text not null default '';

alter table public.profiles
  add column if not exists album_intro text not null default '';

alter table public.profiles
  drop constraint if exists profiles_album_meta_shape;

alter table public.profiles
  add constraint profiles_album_meta_shape
  check (
    char_length(album_title) <= 30
    and char_length(album_intro) <= 200
  );

comment on column public.profiles.album_title is
  '影集名称（一人一本，初次创建时填写；空字符串=还没建过影集）。';
comment on column public.profiles.album_intro is
  '影集简介（初次创建时填写，可空）。';

-- ── 1b) 每日发图额度（普通帖 + 影集共用同一池）──────────────────────────────
-- 为什么用触发器而不是改 RPC：
--   ① 两条发布路径（create_forum_post_with_images / create_album_post_with_images）
--      各自都有一份限额代码，改两处必然漂移；
--   ② 挂在 posts 上，任何来源（含以后新增的路径）自动受管，不会再漏一条。
-- 口径：Asia/Shanghai 自然日，该用户当天已写入的 image_count 之和 + 本次 ≤ 30。
--   普通帖自身「每天 5 条图帖」× 6 图 = 30，恰好不冲突；影集因此最多 3 本（3×10）。
create or replace function public.guard_forum_daily_image_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz := ((timezone('Asia/Shanghai', now())::date)::timestamp at time zone 'Asia/Shanghai');
  v_tomorrow_start timestamptz := (((timezone('Asia/Shanghai', now())::date + 1)::timestamp) at time zone 'Asia/Shanghai');
  v_used integer := 0;
  v_retry integer := 60;
begin
  if coalesce(new.image_count, 0) <= 0 then
    return new;
  end if;

  -- 没有用户会话（service_role / 后台脚本 / 迁移回填）时不参与额度判定：
  -- 那些路径由运营或系统发起，不该被个人日额度拦，也不该让 auth.uid() 为空的调用去查额度。
  if auth.uid() is null then
    return new;
  end if;

  if public.current_user_is_admin() then
    return new;
  end if;

  select coalesce(sum(coalesce(p.image_count, 0)), 0)
    into v_used
    from public.posts p
   where p.author_id = new.author_id
     and coalesce(p.status, 'approved') <> 'rejected'
     and p.created_at >= v_today_start
     and p.created_at < v_tomorrow_start;

  if v_used + coalesce(new.image_count, 0) > 30 then
    v_retry := greatest(1, ceil(extract(epoch from (v_tomorrow_start - now())))::integer);
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_RATE_LIMIT:DAILY_IMAGE_QUOTA:今天的发图额度已满，每天最多 30 张',
      hint = v_retry::text;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_forum_daily_image_quota on public.posts;
create trigger trg_guard_forum_daily_image_quota
  before insert on public.posts
  for each row
  execute function public.guard_forum_daily_image_quota();

-- ── 1c) 影集本体：建/改名（一人一本）────────────────────────────────────────
-- 初次发布前调用；之后改名也走这里（会同步回写已发布影集帖的 title，
-- 保证信息流卡片与「我的影集」标题一致）。
create or replace function public.set_forum_album_book(
  p_title text,
  p_intro text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := left(btrim(coalesce(p_title, '')), 30);
  v_intro text := left(btrim(coalesce(p_intro, '')), 200);
begin
  if v_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:NOT_AUTHENTICATED:请先登录后再创建影集';
  end if;

  if v_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:EMPTY_TITLE:请给影集起个名字';
  end if;

  update public.profiles
     set album_title = v_title,
         album_intro = v_intro
   where id = v_user_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:PROFILE_MISSING:账号资料尚未就绪，请稍后重试';
  end if;

  -- 展示字段回写：已发布的影集帖共用同一本的名字
  update public.posts p
     set title = v_title
   where p.author_id = v_user_id
     and p.album_entries is not null
     and jsonb_array_length(p.album_entries) > 0;

  return jsonb_build_object('title', v_title, 'intro', v_intro);
end;
$$;

revoke all on function public.set_forum_album_book(text, text) from public;
grant execute on function public.set_forum_album_book(text, text) to authenticated;
grant execute on function public.set_forum_album_book(text, text) to service_role;

comment on function public.set_forum_album_book(text, text) is
  '创建/修改本人的影集名称与简介（一人一本），并回写已发布影集帖的展示标题。';

-- ── 2) 创建影集帖 ───────────────────────────────────────────────────────────
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
  v_book_title text := '';
  v_book_intro text := '';
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

  -- 影集名称与简介在「初次创建」时写进 profiles（一人一本），
  -- 之后每次发布只写配文 + 图 —— 所以这里不再要求 p_title，而是要求「本子已存在」。
  select btrim(coalesce(album_title, '')), btrim(coalesce(album_intro, ''))
    into v_book_title, v_book_intro
    from public.profiles
   where id = v_user_id;

  v_book_title := coalesce(v_book_title, '');
  if v_book_title = '' then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:NO_BOOK:先给影集起个名字和简介，再发布第一篇';
  end if;

  -- 展示标题统一取本子的名字（改名走 set_forum_album_book 回写）
  v_title := left(v_book_title, 120);

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
  -- （普通帖 + 影集共用一个池）。这里**不再**限制「每天几本」——
  -- 一个用户只有一本影集、本内帖数无上限，按本数限额会把「普通功能」变成付费闸门。
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

    -- 影集单本 10 张 > 普通帖 10 分钟窗口的 9 张，所以单给影集一条更宽的窗口
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

revoke all on function public.create_album_post_with_images(text, text, text, jsonb, text, text, double precision, double precision, jsonb) from public;
grant execute on function public.create_album_post_with_images(text, text, text, jsonb, text, text, double precision, double precision, jsonb) to authenticated;
grant execute on function public.create_album_post_with_images(text, text, text, jsonb, text, text, double precision, double precision, jsonb) to service_role;

comment on function public.create_album_post_with_images(text, text, text, jsonb, text, text, double precision, double precision, jsonb) is
  '创建影集帖：单本最多 10 张图，每张图配一段文字（posts.album_entries），不复制 Cloud+ 条目（A 投影）。';

-- ── 3) 幂等包装（与 create_forum_post_with_images_idempotent 同构）─────────
create or replace function public.create_album_post_with_images_idempotent(
  p_title text,
  p_body text,
  p_author_username text default '',
  p_images jsonb default '[]'::jsonb,
  p_tag text default null,
  p_location_name text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_album_entries jsonb default '[]'::jsonb,
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
      message = 'FORUM_ALBUM:NOT_AUTHENTICATED:请先登录后再发布';
  end if;

  if p_submission_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'FORUM_ALBUM:INVALID_SUBMISSION_ID:发布请求标识无效，请重试';
  end if;

  insert into public.forum_post_submissions (user_id, submission_id)
  values (v_user_id, p_submission_id)
  on conflict (user_id, submission_id) do update
    set updated_at = now()
  returning result into v_result;

  if v_result is not null then
    return v_result;
  end if;

  v_result := public.create_album_post_with_images(
    p_title,
    p_body,
    p_author_username,
    p_images,
    p_tag,
    p_location_name,
    p_location_lat,
    p_location_lng,
    p_album_entries
  );

  update public.forum_post_submissions
     set result = v_result,
         updated_at = now()
   where user_id = v_user_id
     and submission_id = p_submission_id;

  return v_result;
end;
$$;

revoke all on function public.create_album_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, jsonb, uuid) from public;
grant execute on function public.create_album_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, jsonb, uuid) to authenticated;
grant execute on function public.create_album_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, jsonb, uuid) to service_role;

comment on function public.create_album_post_with_images_idempotent(text, text, text, jsonb, text, text, double precision, double precision, jsonb, uuid) is
  '幂等创建影集帖；相同用户与 submission id 返回初次创建结果。';

notify pgrst, 'reload schema';

commit;
