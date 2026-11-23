-- ============================================================================
-- 2026-11-23 圣诞交换礼物（/xmas）数据层
--
-- 背景：页面视觉与交互早已完成，但报名/退出/配对全在浏览器内存里 ——
--   刷新即清零、换个人打开互相看不见，也就是说「交换」这件事从来没有真正发生过。
--   本迁移补上它，并顺带解决三件必须由服务端裁决的事：
--     ① 揭晓前**任何接口都不返回对方身份**（不是前端藏起来）；
--     ② 退出的人挂位不回收，别人头像不会突然跳格；
--     ③ 到达揭晓时刻由**服务端**判定，前端倒计时只是展示。
--
-- 设计要点：
--   · 三表：events / participants / matches。participants 存**快照**（昵称/头像/头像框），
--     否则对方事后换头像，树上已经「挂好」的牌子会跟着变形。
--   · 全部写操作走 SECURITY DEFINER 函数，表上不给 insert/update/delete 策略 ——
--     裸写一律被 RLS 拒掉，报名/退出/开奖只有一条路径。
--   · 配对**惰性生成**：第一个在 reveal_at 之后读结果的请求触发，用 advisory xact lock
--     串行化。不引入 pg_cron —— 少一个必须记得配的定时任务，就少一个线上静默失败点。
--   · 奇数落单的人配「官方礼物」（b_user_id = null），不会空手。
--
-- 幂等：全部 if not exists / create or replace / drop policy if exists。
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 活动
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.xmas_exchange_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null default '圣诞交换礼物',
  -- 揭晓时刻（服务端唯一判据）与报名截止（比揭晓早，留出收尾时间）
  reveal_at timestamptz not null,
  signup_deadline timestamptz not null,
  capacity integer not null default 20,
  -- draft = 还没上线；open = 可报名；closed = 停止报名但未揭晓；revealed = 已配对
  status text not null default 'draft',
  -- 首页 Hero 是否展示。与 status 分开：可以先上线造势、过几天再开报名
  is_visible boolean not null default false,
  -- 官方兜底礼物的署名账号（奇数落单时展示「来自 BOHLITE 官方」）。
  -- 允许为空：为空就只显示「官方礼物」，不指名账号。
  santa_user_id uuid references auth.users (id) on delete set null,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint xmas_events_status_check
    check (status in ('draft', 'open', 'closed', 'revealed')),
  constraint xmas_events_capacity_check
    check (capacity between 2 and 60),
  constraint xmas_events_window_check
    check (signup_deadline <= reveal_at)
);

comment on table public.xmas_exchange_events is
  '圣诞交换礼物活动。单行一个 slug，前端按 slug 读取；揭晓时间由本表决定，前端倒计时只作展示。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 参与者
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.xmas_exchange_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.xmas_exchange_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 挂位序号。**永不回收**：有人退出只把 status 置 left，序号仍占着，
  -- 这样别人已经挂好的位置不会被顶掉（这是「头像突然换位置」的唯一根因）。
  slot_index integer not null,
  status text not null default 'joined',
  -- 报名瞬间的快照：对方之后改昵称/头像，不会影响已经挂在树上的牌子
  display_name text not null default '',
  avatar_url text,
  avatar_frame_url text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint xmas_participants_status_check check (status in ('joined', 'left')),
  constraint xmas_participants_event_user_key unique (event_id, user_id),
  constraint xmas_participants_event_slot_key unique (event_id, slot_index)
);

create index if not exists xmas_participants_event_status_idx
  on public.xmas_exchange_participants (event_id, status);

comment on table public.xmas_exchange_participants is
  '圣诞交换礼物参与者。slot_index 是挂位，退出不回收；display_name/avatar_* 是报名时快照。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 配对结果
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.xmas_exchange_matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.xmas_exchange_events (id) on delete cascade,
  a_user_id uuid not null references auth.users (id) on delete cascade,
  -- null = 奇数落单，由官方礼物兜底
  b_user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 双向各存一行（A→B 与 B→A），查询自己那份只需一次索引命中
  constraint xmas_matches_event_user_key unique (event_id, a_user_id)
);

comment on table public.xmas_exchange_matches is
  '圣诞交换礼物配对结果。双向各一行；b_user_id 为 null 表示落到官方礼物。';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS：读开放、写全封闭
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.xmas_exchange_events enable row level security;
alter table public.xmas_exchange_participants enable row level security;
alter table public.xmas_exchange_matches enable row level security;

-- 活动配置与参与者名单是「公开墙」：未登录访客也要能看到树上挂了谁。
-- 表里没有任何联系方式，昵称/头像本来就是公开资料。
drop policy if exists xmas_events_read on public.xmas_exchange_events;
create policy xmas_events_read on public.xmas_exchange_events
  for select using (is_visible or public.current_user_is_admin());

drop policy if exists xmas_participants_read on public.xmas_exchange_participants;
create policy xmas_participants_read on public.xmas_exchange_participants
  for select using (true);

/*
 * 配对结果**不给任何 select 策略**：只能通过 xmas_my_result 拿到自己那一条。
 * 否则抓一次 REST 接口就能在揭晓前把所有人的配对全看光 —— 「随机产生」就成了摆设。
 */
drop policy if exists xmas_matches_read on public.xmas_exchange_matches;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 公开 RPC
-- ─────────────────────────────────────────────────────────────────────────────

/** 取当前活动（按 slug）。前端首屏既要名单也要时间窗，所以合成一个函数。 */
create or replace function public.xmas_roster(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
stable
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_people jsonb := '[]'::jsonb;
  v_joined integer := 0;
  v_me jsonb := null;
begin
  select * into v_event from public.xmas_exchange_events where slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  select coalesce(jsonb_agg(item order by slot), '[]'::jsonb)
    into v_people
    from (
      select
        p.slot_index as slot,
        jsonb_build_object(
          'user_id', p.user_id,
          'slot', p.slot_index,
          'name', coalesce(nullif(p.display_name, ''), '朋友'),
          'avatar_url', p.avatar_url,
          'frame_url', p.avatar_frame_url
        ) as item
        from public.xmas_exchange_participants p
       where p.event_id = v_event.id
         and p.status = 'joined'
    ) t;

  select count(*) into v_joined
    from public.xmas_exchange_participants
   where event_id = v_event.id and status = 'joined';

  if auth.uid() is not null then
    select jsonb_build_object('joined', true, 'slot', p.slot_index)
      into v_me
      from public.xmas_exchange_participants p
     where p.event_id = v_event.id
       and p.user_id = auth.uid()
       and p.status = 'joined';
  end if;

  return jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'slug', v_event.slug,
      'title', v_event.title,
      'reveal_at', v_event.reveal_at,
      'signup_deadline', v_event.signup_deadline,
      'capacity', v_event.capacity,
      'status', v_event.status,
      'is_visible', v_event.is_visible,
      'revealed_at', v_event.revealed_at
    ),
    'participants', v_people,
    'joined_count', v_joined,
    -- 已退役的挂位数（退出的人占着号不回填），前端据此把空位留出来
    'slot_count', coalesce((select max(slot_index) + 1 from public.xmas_exchange_participants where event_id = v_event.id), 0),
    'me', v_me
  );
end;
$$;

/** 报名：幂等。已 joined 直返回；已 left 复用原挂位重新挂上。 */
create or replace function public.xmas_join(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_user uuid := auth.uid();
  v_existing public.xmas_exchange_participants%rowtype;
  v_slot integer;
  v_joined integer;
  v_name text := '朋友';
  v_avatar text;
  v_frame text;
  -- 必须先存下来：下面查 profiles 会重置 FOUND，用它判断「是不是复出」会永远为假
  v_has_existing boolean := false;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHED', 'message', '先登录再来挂头像');
  end if;

  -- for update：与并发报名抢同一把行锁，避免「查名额 → 插入」之间被插队
  select * into v_event from public.xmas_exchange_events where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  select * into v_existing
    from public.xmas_exchange_participants
   where event_id = v_event.id and user_id = v_user;

  v_has_existing := v_existing.id is not null;

  if v_has_existing and v_existing.status = 'joined' then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'slot', v_existing.slot_index,
      'message', '你已经挂在树上了'
    );
  end if;

  if v_event.status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'CLOSED', 'message', '这次活动没有开放报名');
  end if;

  if now() >= v_event.signup_deadline then
    return jsonb_build_object('ok', false, 'code', 'DEADLINE', 'message', '报名已经截止啦，明年早点来');
  end if;

  select count(*) into v_joined
    from public.xmas_exchange_participants
   where event_id = v_event.id and status = 'joined';

  if v_joined >= v_event.capacity then
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '树上挂满啦，等有人退出再来');
  end if;

  -- 快照改名/头像；缺资料也允许参加，只是显示成「朋友」
  select coalesce(nullif(btrim(p.username), ''), '朋友'), p.avatar_url, p.avatar_frame_url
    into v_name, v_avatar, v_frame
    from public.profiles p
   where p.id = v_user;

  if v_has_existing then
    -- 复出：沿用原挂位，别人已经稳定的位置不受影响
    update public.xmas_exchange_participants
       set status = 'joined',
           left_at = null,
           display_name = v_name,
           avatar_url = v_avatar,
           avatar_frame_url = v_frame,
           joined_at = now()
     where id = v_existing.id;
    v_slot := v_existing.slot_index;
  else
    select coalesce(max(slot_index) + 1, 0) into v_slot
      from public.xmas_exchange_participants
     where event_id = v_event.id;

    insert into public.xmas_exchange_participants
      (event_id, user_id, slot_index, status, display_name, avatar_url, avatar_frame_url)
    values
      (v_event.id, v_user, v_slot, 'joined', v_name, v_avatar, v_frame);
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'slot', v_slot,
    'joined_count', v_joined + 1,
    'message', '头像已经挂上树了'
  );
exception
  when unique_violation then
    -- 并发双击：唯一约束兜底，读回已有挂位即可
    select slot_index into v_slot
      from public.xmas_exchange_participants
     where event_id = v_event.id and user_id = v_user;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_JOINED', 'slot', v_slot);
end;
$$;

/** 退出：只在揭晓前允许。挂位不回收。 */
create or replace function public.xmas_leave(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHED', 'message', '先登录再操作');
  end if;

  select * into v_event from public.xmas_exchange_events where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  if now() >= v_event.reveal_at or v_event.status = 'revealed' then
    return jsonb_build_object('ok', false, 'code', 'REVEALED', 'message', '已经揭晓了，这时候退出就没意义了');
  end if;

  update public.xmas_exchange_participants
     set status = 'left', left_at = now()
   where event_id = v_event.id
     and user_id = v_user
     and status = 'joined';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_JOINED', 'message', '你还没有参与');
  end if;

  return jsonb_build_object('ok', true, 'code', 'LEFT', 'message', '头像已经摘下来了');
end;
$$;

/**
 * 惰性配对：第一个过点的读请求触发，之后所有人读同一份。
 * 用 advisory xact lock 串行化 —— 两个人同时点开结果时，第二个人等第一个人写完再读，
 * 不会各自洗一次牌生成两套互相矛盾的配对。
 */
create or replace function public.xmas_draw_internal(p_event_id uuid, p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path to public
as $$
declare
  v_ids uuid[];
  v_count integer := 0;
  v_i integer;
  v_pairs integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('xmas-draw:' || p_event_id::text));

  if p_force then
    delete from public.xmas_exchange_matches where event_id = p_event_id;
  elsif exists (select 1 from public.xmas_exchange_matches where event_id = p_event_id) then
    select count(*) into v_pairs from public.xmas_exchange_matches where event_id = p_event_id;
    return v_pairs;
  end if;

  -- 洗牌交给 order by random()：一次扫描完成，比在 plpgsql 里手写 Fisher-Yates 可靠
  select array_agg(user_id) into v_ids
    from (
      select user_id
        from public.xmas_exchange_participants
       where event_id = p_event_id and status = 'joined'
       order by random()
    ) shuffled;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < 2 then
    return 0;
  end if;

  for v_i in 0 .. (v_count / 2) - 1 loop
    insert into public.xmas_exchange_matches (event_id, a_user_id, b_user_id)
    values (p_event_id, v_ids[v_i * 2 + 1], v_ids[v_i * 2 + 2]),
           (p_event_id, v_ids[v_i * 2 + 2], v_ids[v_i * 2 + 1]);
    v_pairs := v_pairs + 2;
  end loop;

  if v_count % 2 = 1 then
    -- 奇数落单：配官方礼物（b_user_id 为空），不让任何一个人空手
    insert into public.xmas_exchange_matches (event_id, a_user_id, b_user_id)
    values (p_event_id, v_ids[v_count], null);
    v_pairs := v_pairs + 1;
  end if;

  update public.xmas_exchange_events
     set status = 'revealed',
         revealed_at = coalesce(revealed_at, now()),
         updated_at = now()
   where id = p_event_id
     and status <> 'revealed';

  return v_pairs;
end;
$$;

/** 查自己的结果。未到点：只返回时间，**连字段都不给**对方。 */
create or replace function public.xmas_my_result(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_user uuid := auth.uid();
  v_row public.xmas_exchange_matches%rowtype;
  v_partner jsonb := null;
begin
  select * into v_event from public.xmas_exchange_events where slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if now() < v_event.reveal_at then
    return jsonb_build_object(
      'ok', true,
      'revealed', false,
      'reveal_at', v_event.reveal_at,
      'message', '还没到揭晓时刻'
    );
  end if;

  if v_user is null then
    return jsonb_build_object('ok', true, 'revealed', true, 'code', 'NOT_AUTHED', 'partner', null);
  end if;

  -- 到点了才开始配对。只有真正读结果的人会触发，避免空跑。
  perform public.xmas_draw_internal(v_event.id, false);

  select * into v_row
    from public.xmas_exchange_matches
   where event_id = v_event.id and a_user_id = v_user;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'revealed', true,
      'code', 'NOT_PARTICIPATING',
      'partner', null,
      'message', '这一轮你没有参与'
    );
  end if;

  if v_row.b_user_id is null then
    return jsonb_build_object(
      'ok', true,
      'revealed', true,
      'code', 'SANTA',
      'partner', null,
      'message', '这一轮你是落单的那位，官方礼物会送到你手上'
    );
  end if;

  select jsonb_build_object(
      'user_id', p.id,
      'username', coalesce(nullif(btrim(p.username), ''), '朋友'),
      'avatar_url', p.avatar_url,
      'frame_url', p.avatar_frame_url
    )
    into v_partner
    from public.profiles p
   where p.id = v_row.b_user_id;

  return jsonb_build_object(
    'ok', true,
    'revealed', true,
    'code', 'MATCHED',
    'partner', coalesce(v_partner, jsonb_build_object('username', '朋友')),
    'message', '你的礼物对象已经揭晓'
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 管理端 RPC（仅管理员）
-- ─────────────────────────────────────────────────────────────────────────────

/** 读取管理面板需要的一切：配置 + 全部参与者（含已退出）+ 配对。 */
create or replace function public.xmas_admin_overview(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
stable
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_people jsonb := '[]'::jsonb;
  v_matches jsonb := '[]'::jsonb;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可访问');
  end if;

  select * into v_event from public.xmas_exchange_events where slug = p_slug;
  if not found then
    return jsonb_build_object('ok', true, 'exists', false, 'slug', p_slug);
  end if;

  select coalesce(jsonb_agg(item order by slot), '[]'::jsonb)
    into v_people
    from (
      select p.slot_index as slot,
             jsonb_build_object(
               'user_id', p.user_id,
               'slot', p.slot_index,
               'status', p.status,
               'name', coalesce(nullif(p.display_name, ''), '朋友'),
               'avatar_url', p.avatar_url,
               'joined_at', p.joined_at,
               'left_at', p.left_at
             ) as item
        from public.xmas_exchange_participants p
       where p.event_id = v_event.id
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'a_user_id', m.a_user_id,
           'a_name', coalesce(nullif(pa.display_name, ''), '朋友'),
           'b_user_id', m.b_user_id,
           'b_name', coalesce(nullif(pb.display_name, ''), '朋友'),
           'santa', m.b_user_id is null
         )), '[]'::jsonb)
    into v_matches
    from public.xmas_exchange_matches m
    left join public.xmas_exchange_participants pa
      on pa.event_id = m.event_id and pa.user_id = m.a_user_id
    left join public.xmas_exchange_participants pb
      on pb.event_id = m.event_id and pb.user_id = m.b_user_id
   where m.event_id = v_event.id;

  return jsonb_build_object(
    'ok', true,
    'exists', true,
    'event', jsonb_build_object(
      'slug', v_event.slug,
      'title', v_event.title,
      'reveal_at', v_event.reveal_at,
      'signup_deadline', v_event.signup_deadline,
      'capacity', v_event.capacity,
      'status', v_event.status,
      'is_visible', v_event.is_visible,
      'santa_user_id', v_event.santa_user_id,
      'revealed_at', v_event.revealed_at,
      'updated_at', v_event.updated_at
    ),
    'participants', v_people,
    'matches', v_matches
  );
end;
$$;

/**
 * 保存活动配置（新建或更新）。
 * 传 null 的时间字段一律拒绝，不做「猜一个默认值」—— 时间写错会让整场活动静默失效。
 */
create or replace function public.xmas_admin_save_event(
  p_slug text,
  p_title text,
  p_reveal_at timestamptz,
  p_signup_deadline timestamptz,
  p_capacity integer,
  p_status text,
  p_is_visible boolean,
  p_santa_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_before public.xmas_exchange_events%rowtype;
  v_after public.xmas_exchange_events%rowtype;
  v_slug text := coalesce(nullif(btrim(p_slug), ''), 'christmas-2026');
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可修改');
  end if;

  if p_reveal_at is null or p_signup_deadline is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIME', 'message', '揭晓时间与报名截止都必须填写');
  end if;

  if p_signup_deadline > p_reveal_at then
    return jsonb_build_object('ok', false, 'code', 'INVALID_WINDOW', 'message', '报名截止不能晚于揭晓时间');
  end if;

  if p_capacity is null or p_capacity < 2 or p_capacity > 60 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CAPACITY', 'message', '容量需在 2 到 60 之间');
  end if;

  if p_status is null or p_status not in ('draft', 'open', 'closed', 'revealed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', '状态取值不合法');
  end if;

  select * into v_before from public.xmas_exchange_events where slug = v_slug for update;

  insert into public.xmas_exchange_events
    (slug, title, reveal_at, signup_deadline, capacity, status, is_visible, santa_user_id)
  values
    (v_slug,
     coalesce(nullif(btrim(p_title), ''), '圣诞交换礼物'),
     p_reveal_at, p_signup_deadline, p_capacity, p_status, coalesce(p_is_visible, false), p_santa_user_id)
  on conflict (slug) do update
    set title = excluded.title,
        reveal_at = excluded.reveal_at,
        signup_deadline = excluded.signup_deadline,
        capacity = excluded.capacity,
        status = excluded.status,
        is_visible = excluded.is_visible,
        santa_user_id = excluded.santa_user_id,
        updated_at = now()
  returning * into v_after;

  perform public.log_admin_action(
    'update',
    'xmas_exchange_events',
    v_after.id::text,
    jsonb_build_object(
      'before', jsonb_build_object(
        'reveal_at', v_before.reveal_at,
        'signup_deadline', v_before.signup_deadline,
        'capacity', v_before.capacity,
        'status', v_before.status,
        'is_visible', v_before.is_visible
      ),
      'after', jsonb_build_object(
        'reveal_at', v_after.reveal_at,
        'signup_deadline', v_after.signup_deadline,
        'capacity', v_after.capacity,
        'status', v_after.status,
        'is_visible', v_after.is_visible
      )
    ),
    jsonb_build_object('source', 'xmas_admin_save_event')
  );

  return jsonb_build_object('ok', true, 'code', 'SAVED', 'message', '活动配置已保存');
end;
$$;

/** 手动开奖 / 重新洗牌。force=true 会丢弃已有结果重新配（仅揭晓前有意义）。 */
create or replace function public.xmas_admin_draw(p_slug text default 'christmas-2026', p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
  v_pairs integer;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可操作');
  end if;

  select * into v_event from public.xmas_exchange_events where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  v_pairs := public.xmas_draw_internal(v_event.id, coalesce(p_force, false));

  perform public.log_admin_action(
    'update',
    'xmas_exchange_events',
    v_event.id::text,
    jsonb_build_object('pairs', v_pairs, 'forced', coalesce(p_force, false)),
    jsonb_build_object('source', 'xmas_admin_draw')
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'DRAWN',
    'pairs', v_pairs,
    'message', case when v_pairs = 0 then '可参与人数不足 2 人，没有生成配对' else '配对已完成' end
  );
end;
$$;

/** 清空本轮配对（重新开奖前用）。不动参与者与挂位。 */
create or replace function public.xmas_admin_reset_matches(p_slug text default 'christmas-2026')
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可操作');
  end if;

  select * into v_event from public.xmas_exchange_events where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  delete from public.xmas_exchange_matches where event_id = v_event.id;

  update public.xmas_exchange_events
     set status = 'closed', revealed_at = null, updated_at = now()
   where id = v_event.id;

  perform public.log_admin_action(
    'delete',
    'xmas_exchange_events',
    v_event.id::text,
    jsonb_build_object('matches_cleared', true),
    jsonb_build_object('source', 'xmas_admin_reset_matches')
  );

  return jsonb_build_object('ok', true, 'code', 'RESET', 'message', '已清空本轮配对');
end;
$$;

/** 移除某个参与者（防刷号 / 测试账号）。挂位同样不回收。 */
create or replace function public.xmas_admin_remove_participant(
  p_slug text,
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_event public.xmas_exchange_events%rowtype;
begin
  if not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可操作');
  end if;

  select * into v_event from public.xmas_exchange_events where slug = p_slug for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '活动还没创建');
  end if;

  update public.xmas_exchange_participants
     set status = 'left', left_at = now()
   where event_id = v_event.id and user_id = p_user_id and status = 'joined';

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_JOINED', 'message', '该用户当前不在名单里');
  end if;

  perform public.log_admin_action(
    'delete',
    'xmas_exchange_participants',
    p_user_id::text,
    jsonb_build_object('event_id', v_event.id, 'reason', p_reason),
    jsonb_build_object('source', 'xmas_admin_remove_participant')
  );

  return jsonb_build_object('ok', true, 'code', 'REMOVED', 'message', '已从名单中移除');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 权限：只给登录用户 / 匿名读名单的口子
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ 内部洗牌函数**必须收回执行权**：它接收 p_force，任何人能直接调就能在揭晓前
--    把配对算出来，整场活动的「随机产生」当场作废。只有 SECURITY DEFINER 的调用方
--    （以 owner 身份运行）才该碰它。
revoke all on function public.xmas_draw_internal(uuid, boolean) from public;
revoke all on function public.xmas_draw_internal(uuid, boolean) from anon;
revoke all on function public.xmas_draw_internal(uuid, boolean) from authenticated;

revoke all on function public.xmas_roster(text) from public;
revoke all on function public.xmas_join(text) from public;
revoke all on function public.xmas_leave(text) from public;
revoke all on function public.xmas_my_result(text) from public;
revoke all on function public.xmas_admin_overview(text) from public;
revoke all on function public.xmas_admin_save_event(text, text, timestamptz, timestamptz, integer, text, boolean, uuid) from public;
revoke all on function public.xmas_admin_draw(text, boolean) from public;
revoke all on function public.xmas_admin_reset_matches(text) from public;
revoke all on function public.xmas_admin_remove_participant(text, uuid, text) from public;

-- 名单匿名可读：活动页在未登录时也要能展示「已经挂了谁」
grant execute on function public.xmas_roster(text) to anon, authenticated;
grant execute on function public.xmas_my_result(text) to anon, authenticated;
grant execute on function public.xmas_join(text) to authenticated;
grant execute on function public.xmas_leave(text) to authenticated;
grant execute on function public.xmas_admin_overview(text) to authenticated;
grant execute on function public.xmas_admin_save_event(text, text, timestamptz, timestamptz, integer, text, boolean, uuid) to authenticated;
grant execute on function public.xmas_admin_draw(text, boolean) to authenticated;
grant execute on function public.xmas_admin_reset_matches(text) to authenticated;
grant execute on function public.xmas_admin_remove_participant(text, uuid, text) to authenticated;

commit;

-- ============================================================================
-- 首次上线（管理员在 SQL Editor 跑一次，或用控制台「创建本轮活动」按钮）：
--
--   select public.xmas_admin_save_event(
--     'christmas-2026', '圣诞交换礼物',
--     '2026-12-20 20:00:00+08', '2026-12-20 19:30:00+08',
--     20, 'open', true, null
--   );
--
-- 之后所有改动都走 /admin/xmas-console，不需要再进 SQL Editor。
-- ============================================================================
