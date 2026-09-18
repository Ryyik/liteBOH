-- 头像框控制台（数据管理面板）：清单真相源 + 积分解锁台账 + 购买 RPC
--
-- 背景与口径（详见 plans/010-avatar-frame-console.md）：
--   1) 此前框清单硬编码在前端 useAvatarFrame.js，加一个框要走一次构建部署；
--      本迁移把清单落库，前端保留内置清单仅作「种子 + DB 抖动时的降级路径」。
--   2) 归属三来源叠加：订阅档位（推导）/ 限时免费（free_until）/ 积分买断（user_avatar_frames）。
--      限免到期**不删除**已购记录 —— 用户花积分买的框永久保留。
--   3) 渲染层继续只认 url + scale（profiles.avatar_frame_url 存量存的就是 url 字符串），
--      因此 slug 与 url 发布后不可变，否则老用户佩戴立即失效。
--   4) 档位判定服务端唯一出口 = is_avatar_frame_owned_by()；前端只做 UX 层即时反馈。

begin;

-- ============================================================
-- 1) 清单真相源
-- ============================================================
create table if not exists public.avatar_frames (
  id            text primary key,                -- slug，发布后不可变
  name          text not null,
  description   text not null default '',
  source_url    text,                            -- 原图留档（供重新摆位，永不删）
  url           text not null,                   -- 成品图 URL，发布后不可变
  scale         numeric(4,2) not null check (scale between 1.0 and 3.0),
  tier          text not null default 'free'
                check (tier in ('free', 'plus', 'pro', 'max', 'ultra', 'limit')),
  free_until    date,                            -- 含当日全天限免，次日回落 tier
  points_price  integer check (points_price is null or points_price >= 10),
  sort_order    integer not null default 100,
  status        text not null default 'draft'
                check (status in ('draft', 'published', 'archived')),
  ring          text not null default '',        -- 素材缺失时的兜底色环
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_avatar_frames_list
  on public.avatar_frames (status, sort_order, created_at);

comment on table public.avatar_frames is
  '头像框清单真相源。前端 useAvatarFrame 合并本表 published 行与内置 5 框（内置仅作种子与降级兜底）。';

-- ============================================================
-- 2) 积分解锁台账（append-only，限免到期不删）
-- ============================================================
create table if not exists public.user_avatar_frames (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  frame_id    text not null references public.avatar_frames(id) on delete restrict,
  source      text not null default 'points',    -- points / grant / event
  cost_points integer not null default 0,
  acquired_at timestamptz not null default now(),
  primary key (user_id, frame_id)
);

create index if not exists idx_user_avatar_frames_user
  on public.user_avatar_frames (user_id, acquired_at desc);

comment on table public.user_avatar_frames is
  '头像框积分解锁台账。积分买断为永久权益，不随限免到期或档位降级回收。';

-- ============================================================
-- 3) RLS
-- ============================================================
alter table public.avatar_frames enable row level security;
alter table public.user_avatar_frames enable row level security;

-- 清单：所有人可读已发布；管理员全权（走 current_user_is_admin）
drop policy if exists avatar_frames_public_read on public.avatar_frames;
create policy avatar_frames_public_read on public.avatar_frames
  for select to anon, authenticated
  using (status = 'published' or public.current_user_is_admin());

drop policy if exists avatar_frames_admin_write on public.avatar_frames;
create policy avatar_frames_admin_write on public.avatar_frames
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- 台账：本人可读自己的；管理员可读全部；写只经 RPC / service_role
drop policy if exists user_avatar_frames_own_read on public.user_avatar_frames;
create policy user_avatar_frames_own_read on public.user_avatar_frames
  for select to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());

revoke all on table public.avatar_frames from anon, authenticated;
grant select, insert, update, delete on table public.avatar_frames to authenticated;
grant all on table public.avatar_frames to service_role;

revoke all on table public.user_avatar_frames from anon, authenticated;
grant select on table public.user_avatar_frames to authenticated;
grant all on table public.user_avatar_frames to service_role;

-- ============================================================
-- 4) 档位排序 + owned 判定（服务端唯一出口）
-- ============================================================
create or replace function public.avatar_frame_tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(p_tier, '')))
    when 'free'  then 0
    when 'plus'  then 1
    when 'pro'   then 2
    when 'max'   then 3
    when 'ultra' then 4
    else -1
  end;
$$;

create or replace function public.is_avatar_frame_owned_by(p_user_id uuid, p_frame_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_frame_tier  text;
  v_free_until  date;
  v_status      text;
begin
  if p_frame_id is null or p_frame_id = '' then
    return false;
  end if;

  select f.tier, f.free_until, f.status
    into v_frame_tier, v_free_until, v_status
    from public.avatar_frames f
   where f.id = p_frame_id;

  if not found or v_status <> 'published' then
    return false;
  end if;

  -- ① 全站可戴
  if v_frame_tier = 'free' then
    return true;
  end if;

  -- ② 限时免费期内（含当日）
  if v_free_until is not null and current_date <= v_free_until then
    return true;
  end if;

  -- ③ 积分买断（永久）
  if p_user_id is not null and exists (
    select 1 from public.user_avatar_frames uaf
     where uaf.user_id = p_user_id and uaf.frame_id = p_frame_id
  ) then
    return true;
  end if;

  -- ④ 订阅档位达成
  if p_user_id is not null
     and public.avatar_frame_tier_rank(public.get_user_subscription_tier(p_user_id))
         >= public.avatar_frame_tier_rank(v_frame_tier) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.avatar_frame_tier_rank(text) to anon, authenticated;
grant execute on function public.is_avatar_frame_owned_by(uuid, text) to anon, authenticated;

-- ============================================================
-- 5) 购买 RPC（照 redeem_points_card_cats 骨架：for update + 幂等 + 余量校验）
-- ============================================================
create or replace function public.purchase_avatar_frame(p_frame_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_price        integer;
  v_frame_status text;
  v_points       integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_AUTHENTICATED');
  end if;

  -- 价格只从服务端读；前端传的任何金额一律忽略
  select f.points_price, f.status
    into v_price, v_frame_status
    from public.avatar_frames f
   where f.id = p_frame_id;

  if not found or v_frame_status <> 'published' then
    return jsonb_build_object('ok', false, 'message', 'FRAME_NOT_FOUND');
  end if;

  if v_price is null then
    return jsonb_build_object('ok', false, 'message', 'NOT_PURCHASABLE');
  end if;

  -- 幂等：已持有（含此前通过活动发放的）直接返回，不重复扣分
  if exists (
    select 1 from public.user_avatar_frames
     where user_id = v_uid and frame_id = p_frame_id
  ) then
    select coalesce(points, 0) into v_points from public.profiles where id = v_uid;
    return jsonb_build_object(
      'ok', true,
      'already_owned', true,
      'points_deducted', 0,
      'current_points', v_points
    );
  end if;

  -- 锁行，避免并发双扣
  select coalesce(points, 0) into v_points
    from public.profiles where id = v_uid for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'PROFILE_NOT_FOUND');
  end if;

  if v_points < v_price then
    return jsonb_build_object(
      'ok', false,
      'message', 'INSUFFICIENT_POINTS',
      'required_points', v_price,
      'current_points', v_points
    );
  end if;

  update public.profiles
     set points = points - v_price
   where id = v_uid;

  insert into public.user_avatar_frames (user_id, frame_id, source, cost_points)
  values (v_uid, p_frame_id, 'points', v_price)
  on conflict (user_id, frame_id) do nothing;

  insert into public.points_transactions (user_id, amount, balance_after, reason, remark)
  values (v_uid, -v_price, v_points - v_price, 'avatar_frame_purchase', p_frame_id);

  return jsonb_build_object(
    'ok', true,
    'already_owned', false,
    'points_deducted', v_price,
    'current_points', v_points - v_price
  );
end;
$$;

grant execute on function public.purchase_avatar_frame(text) to authenticated;

-- ============================================================
-- 6) 我的积分解锁列表（前端 owned 集合的「已购」来源）
-- ============================================================
create or replace function public.list_my_avatar_frame_unlocks()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(uaf.frame_id order by uaf.acquired_at), '{}'::text[])
    from public.user_avatar_frames uaf
   where uaf.user_id = auth.uid();
$$;

grant execute on function public.list_my_avatar_frame_unlocks() to authenticated;

-- ============================================================
-- 7) 佩戴强校验：不持有就不能把 avatar_frame_url 指过去
--    仅校验「在 avatar_frames 里存在的线上框」；内置相对路径（/avatars/frames/*.png）
--    与历史值一律放行，避免迁移期误伤存量佩戴。
-- ============================================================
create or replace function public.enforce_avatar_frame_owned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frame_id text;
begin
  if new.avatar_frame_url is null or new.avatar_frame_url = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.avatar_frame_url is not distinct from old.avatar_frame_url then
    return new;
  end if;

  select f.id into v_frame_id
    from public.avatar_frames f
   where f.url = new.avatar_frame_url and f.status = 'published'
   limit 1;

  -- 不在清单里（内置素材 / 未知 url）→ 放行
  if v_frame_id is null then
    return new;
  end if;

  if not public.is_avatar_frame_owned_by(new.id, v_frame_id) then
    raise exception 'AVATAR_FRAME_NOT_OWNED'
      using hint = '该头像框未解锁：需要达成订阅档位、在限免期内，或先用积分解锁。';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_avatar_frame_owned on public.profiles;
create trigger trg_profiles_enforce_avatar_frame_owned
  before insert or update of avatar_frame_url on public.profiles
  for each row
  execute function public.enforce_avatar_frame_owned();

-- ============================================================
-- 8) 种子：把现有 7 个框写进清单（管理端可立即管理，前端内置清单作为兜底）
--    on conflict do nothing —— 已存在（被运营改过价/档位）的行不会被覆盖
-- ============================================================
insert into public.avatar_frames
  (id, name, description, url, scale, tier, free_until, points_price, sort_order, status, ring)
values
  ('orange-cat', '橙猫手绘', '手绘小猫环绕 · 全员可戴',   '/avatars/frames/orange-cat-frame.png', 1.24, 'free',  null,  null, 10, 'published', '#e8734a'),
  ('blue-dog',   '蓝狗手绘', '手绘小狗环绕 · 全员可戴',   '/avatars/frames/blue-dog-frame.png',   1.24, 'free',  null,  null, 20, 'published', '#4aa8e8'),
  ('white-cat',  '白绒猫',   '白色毛绒厚环 · 深色主题尤其出彩', '/avatars/frames/white-cat-frame.png', 1.40, 'free', null, null, 30, 'published', '#f0e8e0'),
  ('hamster',    '仓鼠瓜子', '手绘仓鼠白盘嗑瓜子 · 全员可戴', '/avatars/frames/hamster-frame.png?v=3', 1.61, 'free', null, null, 40, 'published', '#c9a06a'),
  ('cow',        '奶牛抱抱', '手绘奶牛趴圈环抱 · 深色主题尤其出彩', '/avatars/frames/cow-frame.png',  1.60, 'free',  null,  null, 50, 'published', '#cfcfd6'),
  ('elf-flower', '菊花梨',   '暖橙花瓣环绕 · 果子坐镇花芯', '/avatars/frames/elf-flower-frame.png', 2.08, 'ultra', '2026-09-25', null, 60, 'published', '#e8734a'),
  ('elf-grass',  '奇丽草',   '青绿草环 · 蝴蝶伴飞',       '/avatars/frames/elf-grass-frame.png',  2.08, 'ultra', '2026-09-25', null, 70, 'published', '#7fb069')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
