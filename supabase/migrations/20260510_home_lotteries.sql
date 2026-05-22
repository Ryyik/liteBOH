begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'admin'
  );
$$;

create table if not exists public.lotteries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  prize_title text not null,
  prize_description text null,
  cover_image_url text null,
  status text not null default 'open',
  is_home_visible boolean not null default false,
  is_community_visible boolean not null default true,
  max_entries integer null,
  winner_count integer not null default 1,
  entry_deadline_at timestamp with time zone null,
  draw_at timestamp with time zone null,
  drawn_at timestamp with time zone null,
  winner_entry_id uuid null,
  winner_user_id uuid null references public.profiles(id) on delete set null,
  winner_username text null,
  fulfillment_status text not null default 'pending_contact',
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lotteries_status_check check (status in ('draft', 'open', 'drawn', 'closed')),
  constraint lotteries_fulfillment_status_check check (fulfillment_status in ('pending_contact', 'confirmed', 'fulfilled', 'voided')),
  constraint lotteries_max_entries_check check (max_entries is null or max_entries > 0),
  constraint lotteries_winner_count_check check (winner_count > 0),
  constraint lotteries_entry_deadline_before_draw_check check (
    entry_deadline_at is null
    or draw_at is null
    or entry_deadline_at <= draw_at
  )
);

alter table public.lotteries
  add column if not exists entry_deadline_at timestamp with time zone null;

alter table public.lotteries
  add column if not exists fulfillment_status text not null default 'pending_contact';

alter table public.lotteries
  add column if not exists is_community_visible boolean not null default true;

alter table public.lotteries
  add column if not exists winner_count integer not null default 1;

alter table public.lotteries
  drop constraint if exists lotteries_winner_count_check;

alter table public.lotteries
  add constraint lotteries_winner_count_check check (winner_count > 0);

alter table public.lotteries
  drop constraint if exists lotteries_fulfillment_status_check;

alter table public.lotteries
  add constraint lotteries_fulfillment_status_check check (
    fulfillment_status in ('pending_contact', 'confirmed', 'fulfilled', 'voided')
  );

alter table public.lotteries
  drop constraint if exists lotteries_entry_deadline_before_draw_check;

alter table public.lotteries
  add constraint lotteries_entry_deadline_before_draw_check check (
    entry_deadline_at is null
    or draw_at is null
    or entry_deadline_at <= draw_at
  );

create table if not exists public.lottery_entries (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username_snapshot text null,
  created_at timestamp with time zone not null default now(),
  constraint lottery_entries_lottery_user_unique unique (lottery_id, user_id)
);

create table if not exists public.lottery_draw_logs (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  draw_no integer not null,
  entry_id uuid null references public.lottery_entries(id) on delete set null,
  user_id uuid null references public.profiles(id) on delete set null,
  username_snapshot text null,
  winner_position integer not null default 1,
  drawn_by uuid null references public.profiles(id) on delete set null,
  reason text null,
  created_at timestamp with time zone not null default now(),
  constraint lottery_draw_logs_draw_no_check check (draw_no > 0),
  constraint lottery_draw_logs_winner_position_check check (winner_position > 0),
  constraint lottery_draw_logs_reason_len check (char_length(coalesce(reason, '')) <= 500),
  unique (lottery_id, draw_no, winner_position)
);

alter table public.lottery_draw_logs
  add column if not exists winner_position integer not null default 1;

alter table public.lottery_draw_logs
  drop constraint if exists lottery_draw_logs_lottery_id_draw_no_key;

alter table public.lottery_draw_logs
  drop constraint if exists lottery_draw_logs_lottery_id_draw_no_winner_position_key;

alter table public.lottery_draw_logs
  drop constraint if exists lottery_draw_logs_winner_position_check;

alter table public.lottery_draw_logs
  add constraint lottery_draw_logs_winner_position_check check (winner_position > 0);

alter table public.lottery_draw_logs
  add constraint lottery_draw_logs_lottery_id_draw_no_winner_position_key
  unique (lottery_id, draw_no, winner_position);

create table if not exists public.lottery_join_attempts (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid null references public.lotteries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  result_code text not null,
  message text null,
  created_at timestamp with time zone not null default now()
);

alter table public.lotteries
  drop constraint if exists lotteries_winner_entry_id_fkey;

alter table public.lotteries
  add constraint lotteries_winner_entry_id_fkey
  foreign key (winner_entry_id)
  references public.lottery_entries(id)
  on delete set null;

create index if not exists idx_lotteries_home_visible
  on public.lotteries (is_home_visible, status, created_at desc);

create index if not exists idx_lotteries_draw_at
  on public.lotteries (status, draw_at)
  where status = 'open' and draw_at is not null;

create index if not exists idx_lottery_entries_lottery_created
  on public.lottery_entries (lottery_id, created_at);

create index if not exists idx_lottery_entries_user_created
  on public.lottery_entries (user_id, created_at desc);

create index if not exists idx_lottery_draw_logs_lottery_created
  on public.lottery_draw_logs (lottery_id, created_at desc);

create index if not exists idx_lottery_join_attempts_user_created
  on public.lottery_join_attempts (user_id, created_at desc);

create index if not exists idx_lottery_join_attempts_lottery_created
  on public.lottery_join_attempts (lottery_id, created_at desc);

create or replace function public.touch_lotteries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lotteries_updated_at on public.lotteries;
create trigger trg_lotteries_updated_at
before update on public.lotteries
for each row
execute function public.touch_lotteries_updated_at();

alter table public.lotteries enable row level security;
alter table public.lottery_entries enable row level security;
alter table public.lottery_draw_logs enable row level security;
alter table public.lottery_join_attempts enable row level security;

alter table public.notifications
  add column if not exists content text null;

drop policy if exists lotteries_public_select_home on public.lotteries;
create policy lotteries_public_select_home
  on public.lotteries
  for select
  to public
  using (
    (is_home_visible = true and status in ('open', 'drawn'))
    or (is_community_visible = true and status in ('open', 'drawn', 'closed'))
    or public.current_user_is_admin()
  );

drop policy if exists lotteries_admin_insert on public.lotteries;
create policy lotteries_admin_insert
  on public.lotteries
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists lotteries_admin_update on public.lotteries;
create policy lotteries_admin_update
  on public.lotteries
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists lotteries_admin_delete on public.lotteries;
create policy lotteries_admin_delete
  on public.lotteries
  for delete
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_entries_select_self_or_admin on public.lottery_entries;
create policy lottery_entries_select_self_or_admin
  on public.lottery_entries
  for select
  to authenticated
  using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists lottery_entries_admin_delete on public.lottery_entries;
create policy lottery_entries_admin_delete
  on public.lottery_entries
  for delete
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_draw_logs_select_admin on public.lottery_draw_logs;
create policy lottery_draw_logs_select_admin
  on public.lottery_draw_logs
  for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists lottery_join_attempts_select_admin on public.lottery_join_attempts;
create policy lottery_join_attempts_select_admin
  on public.lottery_join_attempts
  for select
  to authenticated
  using (public.current_user_is_admin());

create or replace function public.record_lottery_join_attempt(
  p_lottery_id uuid,
  p_user_id uuid,
  p_result_code text,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.lottery_join_attempts (lottery_id, user_id, result_code, message)
  values (p_lottery_id, p_user_id, left(coalesce(p_result_code, 'unknown'), 64), left(coalesce(p_message, ''), 500));
exception
  when others then
    return;
end;
$$;

create or replace function public.record_lottery_auto_draw_failure(
  p_lottery_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_no integer := 1;
begin
  if p_lottery_id is null then
    return;
  end if;

  if exists (
    select 1
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id
       and reason like 'auto_draw_failed:%'
       and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  select coalesce(max(draw_no), 0) + 1
    into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  insert into public.lottery_draw_logs (
    lottery_id,
    draw_no,
    entry_id,
    user_id,
    username_snapshot,
    winner_position,
    drawn_by,
    reason
  )
  values (
    p_lottery_id,
    v_draw_no,
    null,
    null,
    null,
    1,
    auth.uid(),
    left(concat('auto_draw_failed: ', coalesce(p_message, 'unknown')), 500)
  );
exception
  when others then
    return;
end;
$$;

drop function if exists public.execute_lottery_draw(uuid, boolean);

create or replace function public.execute_lottery_draw(
  p_lottery_id uuid,
  p_force boolean default false,
  p_redraw boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_winner public.lottery_entries%rowtype;
  v_first_winner public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_no integer := 1;
  v_previous_draw_no integer := null;
  v_previous_winner_count integer := 0;
  v_winner_limit integer := 0;
  v_actual_winner_count integer := 0;
  v_winners jsonb := '[]'::jsonb;
begin
  if p_force and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可手动开奖');
  end if;

  if p_redraw and not public.current_user_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN', 'message', '仅管理员可重抽');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在');
  end if;

  if v_lottery.status = 'drawn' and not p_redraw then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_DRAWN',
      'message', '抽奖已经开奖',
      'winner_user_id', v_lottery.winner_user_id,
      'winner_username', v_lottery.winner_username
    );
  end if;

  if v_lottery.status not in ('open', 'drawn') then
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '当前抽奖不在开放状态');
  end if;

  if not p_force and not p_redraw and (v_lottery.draw_at is null or v_lottery.draw_at > now()) then
    return jsonb_build_object('ok', true, 'code', 'NOT_DUE', 'message', '尚未到开奖时间');
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  select max(draw_no)
    into v_previous_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_previous_draw_no is not null then
    select count(*)
      into v_previous_winner_count
      from public.lottery_draw_logs
     where lottery_id = p_lottery_id
       and draw_no = v_previous_draw_no
       and user_id is not null;
  end if;

  select coalesce(max(draw_no), 0) + 1
    into v_draw_no
    from public.lottery_draw_logs
   where lottery_id = p_lottery_id;

  if v_entry_count > 0 then
    v_winner_limit := least(greatest(coalesce(v_lottery.winner_count, 1), 1), v_entry_count);

    for v_winner in
      select *
        from public.lottery_entries e
       where e.lottery_id = p_lottery_id
         and (
           not p_redraw
           or v_previous_draw_no is null
           or v_previous_winner_count = 0
           or v_entry_count <= v_previous_winner_count
           or (v_entry_count - v_previous_winner_count) < v_winner_limit
           or not exists (
             select 1
               from public.lottery_draw_logs l
              where l.lottery_id = p_lottery_id
                and l.draw_no = v_previous_draw_no
                and l.user_id = e.user_id
           )
         )
       order by random()
       limit v_winner_limit
    loop
      v_actual_winner_count := v_actual_winner_count + 1;

      if v_actual_winner_count = 1 then
        v_first_winner := v_winner;
      end if;

      v_winners := v_winners || jsonb_build_array(jsonb_build_object(
        'position', v_actual_winner_count,
        'entry_id', v_winner.id,
        'user_id', v_winner.user_id,
        'username', v_winner.username_snapshot
      ));

      insert into public.lottery_draw_logs (
        lottery_id,
        draw_no,
        entry_id,
        user_id,
        username_snapshot,
        winner_position,
        drawn_by,
        reason
      )
      values (
        p_lottery_id,
        v_draw_no,
        v_winner.id,
        v_winner.user_id,
        v_winner.username_snapshot,
        v_actual_winner_count,
        auth.uid(),
        nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '')
      );

      begin
        insert into public.notifications (recipient_id, sender_id, type, status, content)
        values (
          v_winner.user_id,
          auth.uid(),
          'lottery_win',
          'unread',
          concat('你在「', v_lottery.title, '」中中奖啦！奖品：', v_lottery.prize_title)
        );
      exception
        when others then
          null;
      end;
    end loop;
  end if;

  update public.lotteries
     set status = 'drawn',
         drawn_at = now(),
         winner_entry_id = case when v_actual_winner_count > 0 then v_first_winner.id else null end,
         winner_user_id = case when v_actual_winner_count > 0 then v_first_winner.user_id else null end,
         winner_username = case when v_actual_winner_count > 0 then v_first_winner.username_snapshot else null end,
         fulfillment_status = 'pending_contact',
         updated_by = case when p_force then auth.uid() else updated_by end
   where id = p_lottery_id
   returning *
    into v_lottery;

  if v_actual_winner_count = 0 then
    insert into public.lottery_draw_logs (
      lottery_id,
      draw_no,
      entry_id,
      user_id,
      username_snapshot,
      winner_position,
      drawn_by,
      reason
    )
    values (
      p_lottery_id,
      v_draw_no,
      null,
      null,
      null,
      1,
      auth.uid(),
      nullif(trim(coalesce(p_reason, case when p_redraw then 'redraw' else 'initial_draw' end)), '')
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'DRAWN',
    'message', '开奖完成',
    'entry_count', v_entry_count,
    'draw_no', v_draw_no,
    'winner_count', v_lottery.winner_count,
    'actual_winner_count', v_actual_winner_count,
    'winners', v_winners,
    'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username,
    'drawn_at', v_lottery.drawn_at
  );
end;
$$;

create or replace function public.get_home_lottery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
begin
  select *
    into v_lottery
    from public.lotteries
   where is_home_visible = true
     and status in ('open', 'drawn')
   order by
     case when status = 'open' then 0 else 1 end,
     created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  if v_lottery.status = 'open'
     and v_lottery.draw_at is not null
     and v_lottery.draw_at <= now() then
    begin
      perform public.execute_lottery_draw(v_lottery.id, false, false, null);
    exception
      when others then
        perform public.record_lottery_auto_draw_failure(
          v_lottery.id,
          concat(coalesce(sqlstate, 'AUTO_DRAW_FAILED'), ' ', coalesce(sqlerrm, '自动开奖失败'))
        );
    end;

    select *
      into v_lottery
      from public.lotteries
     where id = v_lottery.id;
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = v_lottery.id;

  if v_lottery.status = 'drawn' then
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'position', l.winner_position,
                 'entry_id', l.entry_id,
                 'user_id', l.user_id,
                 'username', l.username_snapshot
               )
               order by l.winner_position
             ) filter (where l.user_id is not null),
             '[]'::jsonb
           )
      into v_winners
      from public.lottery_draw_logs l
     where l.lottery_id = v_lottery.id
       and l.draw_no = (
         select max(draw_no)
           from public.lottery_draw_logs
          where lottery_id = v_lottery.id
       );
  end if;

  if auth.uid() is not null then
    select id, created_at
      into v_current_user_entry_id, v_current_user_entry_created_at
      from public.lottery_entries
     where lottery_id = v_lottery.id
       and user_id = auth.uid()
     limit 1;

    if v_current_user_entry_id is not null then
      select count(*)::integer
        into v_current_user_entry_number
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and created_at <= v_current_user_entry_created_at;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_lottery.id,
    'title', v_lottery.title,
    'description', v_lottery.description,
    'prize_title', v_lottery.prize_title,
    'prize_description', v_lottery.prize_description,
    'cover_image_url', v_lottery.cover_image_url,
    'status', v_lottery.status,
    'fulfillment_status', v_lottery.fulfillment_status,
    'max_entries', v_lottery.max_entries,
    'winner_count', v_lottery.winner_count,
    'entry_count', v_entry_count,
    'entry_deadline_at', v_lottery.entry_deadline_at,
    'draw_at', v_lottery.draw_at,
    'drawn_at', v_lottery.drawn_at,
    'winner_user_id', v_lottery.winner_user_id,
    'winner_username', v_lottery.winner_username,
    'winners', v_winners,
    'current_user_entry_id', v_current_user_entry_id,
    'current_user_entry_created_at', v_current_user_entry_created_at,
    'current_user_entry_number', v_current_user_entry_number,
    'created_at', v_lottery.created_at,
    'updated_at', v_lottery.updated_at
  );
end;
$$;

create or replace function public.get_community_lotteries()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lottery public.lotteries%rowtype;
  v_entry_count integer := 0;
  v_current_user_entry_id uuid := null;
  v_current_user_entry_created_at timestamp with time zone := null;
  v_current_user_entry_number integer := null;
  v_winners jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
begin
  for v_lottery in
    select *
      from public.lotteries
     where is_community_visible = true
       and status in ('open', 'drawn', 'closed')
     order by
       case when status = 'open' then 0 else 1 end,
       coalesce(draw_at, drawn_at, created_at) desc,
       created_at desc
  loop
    if v_lottery.status = 'open'
       and v_lottery.draw_at is not null
       and v_lottery.draw_at <= now() then
      begin
        perform public.execute_lottery_draw(v_lottery.id, false, false, null);
      exception
        when others then
          perform public.record_lottery_auto_draw_failure(
            v_lottery.id,
            concat(coalesce(sqlstate, 'AUTO_DRAW_FAILED'), ' ', coalesce(sqlerrm, '自动开奖失败'))
          );
      end;

      select *
        into v_lottery
        from public.lotteries
       where id = v_lottery.id;
    end if;

    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = v_lottery.id;

    v_current_user_entry_id := null;
    v_current_user_entry_created_at := null;
    v_current_user_entry_number := null;
    v_winners := '[]'::jsonb;

    if v_lottery.status = 'drawn' then
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'position', l.winner_position,
                   'entry_id', l.entry_id,
                   'user_id', l.user_id,
                   'username', l.username_snapshot
                 )
                 order by l.winner_position
               ) filter (where l.user_id is not null),
               '[]'::jsonb
             )
        into v_winners
        from public.lottery_draw_logs l
       where l.lottery_id = v_lottery.id
         and l.draw_no = (
           select max(draw_no)
             from public.lottery_draw_logs
            where lottery_id = v_lottery.id
         );
    end if;

    if auth.uid() is not null then
      select id, created_at
        into v_current_user_entry_id, v_current_user_entry_created_at
        from public.lottery_entries
       where lottery_id = v_lottery.id
         and user_id = auth.uid()
       limit 1;

      if v_current_user_entry_id is not null then
        select count(*)::integer
          into v_current_user_entry_number
          from public.lottery_entries
         where lottery_id = v_lottery.id
           and created_at <= v_current_user_entry_created_at;
      end if;
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_lottery.id,
      'title', v_lottery.title,
      'description', v_lottery.description,
      'prize_title', v_lottery.prize_title,
      'prize_description', v_lottery.prize_description,
      'cover_image_url', v_lottery.cover_image_url,
      'status', v_lottery.status,
      'fulfillment_status', v_lottery.fulfillment_status,
      'max_entries', v_lottery.max_entries,
      'winner_count', v_lottery.winner_count,
      'entry_count', v_entry_count,
      'entry_deadline_at', v_lottery.entry_deadline_at,
      'draw_at', v_lottery.draw_at,
      'drawn_at', v_lottery.drawn_at,
      'winner_user_id', v_lottery.winner_user_id,
      'winner_username', v_lottery.winner_username,
      'winners', v_winners,
      'current_user_entry_id', v_current_user_entry_id,
      'current_user_entry_created_at', v_current_user_entry_created_at,
      'current_user_entry_number', v_current_user_entry_number,
      'created_at', v_lottery.created_at,
      'updated_at', v_lottery.updated_at
    ));
  end loop;

  return v_items;
end;
$$;

create or replace function public.join_home_lottery(p_lottery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_lottery public.lotteries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_result jsonb;
  v_profile_id uuid := null;
  v_account_created_at timestamp with time zone := null;
  v_recent_attempt_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录后再报名抽奖');
  end if;

  select count(*)
    into v_recent_attempt_count
    from public.lottery_join_attempts
   where user_id = v_user_id
     and created_at > now() - interval '1 minute';

  if v_recent_attempt_count >= 5 then
    perform public.record_lottery_join_attempt(null, v_user_id, 'RATE_LIMITED', '报名请求过于频繁，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', '报名请求过于频繁，请稍后再试');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found or not v_lottery.is_home_visible then
    perform public.record_lottery_join_attempt(null, v_user_id, 'NOT_FOUND', '抽奖不存在或暂未开放');
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在或暂未开放');
  end if;

  if v_lottery.status <> 'open' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'NOT_OPEN', '抽奖报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '抽奖报名已关闭');
  end if;

  if v_lottery.draw_at is not null and v_lottery.draw_at <= now() then
    v_draw_result := public.execute_lottery_draw(v_lottery.id, false, false, null);
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'DRAWN', '抽奖已到开奖时间，报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'DRAWN', 'message', '抽奖已到开奖时间，报名已关闭', 'draw_result', v_draw_result);
  end if;

  if v_lottery.entry_deadline_at is not null and v_lottery.entry_deadline_at <= now() then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ENTRY_CLOSED', '本次抽奖报名已截止');
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CLOSED', 'message', '本次抽奖报名已截止');
  end if;

  select *
    into v_entry
    from public.lottery_entries
   where lottery_id = p_lottery_id
     and user_id = v_user_id
   limit 1;

  if found then
    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = p_lottery_id;

    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '你已经报名过本次抽奖',
      'entry_id', v_entry.id,
      'entry_count', v_entry_count
    );
  end if;

  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id
   limit 1;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  select created_at
    into v_account_created_at
    from auth.users
   where id = v_user_id
   limit 1;

  if v_account_created_at is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
  end if;

  if v_account_created_at > now() - interval '24 hours' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号创建满 24 小时后才可报名抽奖');
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号创建满 24 小时后才可报名抽奖');
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '本次抽奖报名人数已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '本次抽奖报名人数已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, coalesce(v_username, 'BOH 用户'))
  returning *
   into v_entry;

  perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'JOINED', '报名成功');

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'message', '报名成功',
    'entry_id', v_entry.id,
    'entry_count', v_entry_count + 1,
    'entry_created_at', v_entry.created_at
  );
exception
  when unique_violation then
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object('ok', true, 'code', 'ALREADY_JOINED', 'message', '你已经报名过本次抽奖');
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'JOIN_FAILED'), 'message', coalesce(sqlerrm, '报名失败'));
end;
$$;

create or replace function public.join_community_lottery(p_lottery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := '';
  v_lottery public.lotteries%rowtype;
  v_entry public.lottery_entries%rowtype;
  v_entry_count integer := 0;
  v_draw_result jsonb;
  v_profile_id uuid := null;
  v_account_created_at timestamp with time zone := null;
  v_recent_attempt_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', '请先登录后再报名抽奖');
  end if;

  select count(*)
    into v_recent_attempt_count
    from public.lottery_join_attempts
   where user_id = v_user_id
     and created_at > now() - interval '1 minute';

  if v_recent_attempt_count >= 5 then
    perform public.record_lottery_join_attempt(null, v_user_id, 'RATE_LIMITED', '报名请求过于频繁，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'message', '报名请求过于频繁，请稍后再试');
  end if;

  select *
    into v_lottery
    from public.lotteries
   where id = p_lottery_id
   for update;

  if not found or not v_lottery.is_community_visible then
    perform public.record_lottery_join_attempt(null, v_user_id, 'NOT_FOUND', '抽奖不存在或暂未开放');
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', '抽奖不存在或暂未开放');
  end if;

  if v_lottery.status <> 'open' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'NOT_OPEN', '抽奖报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'NOT_OPEN', 'message', '抽奖报名已关闭');
  end if;

  if v_lottery.draw_at is not null and v_lottery.draw_at <= now() then
    v_draw_result := public.execute_lottery_draw(v_lottery.id, false, false, null);
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'DRAWN', '抽奖已到开奖时间，报名已关闭');
    return jsonb_build_object('ok', false, 'code', 'DRAWN', 'message', '抽奖已到开奖时间，报名已关闭', 'draw_result', v_draw_result);
  end if;

  if v_lottery.entry_deadline_at is not null and v_lottery.entry_deadline_at <= now() then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ENTRY_CLOSED', '本次抽奖报名已截止');
    return jsonb_build_object('ok', false, 'code', 'ENTRY_CLOSED', 'message', '本次抽奖报名已截止');
  end if;

  select *
    into v_entry
    from public.lottery_entries
   where lottery_id = p_lottery_id
     and user_id = v_user_id
   limit 1;

  if found then
    select count(*)
      into v_entry_count
      from public.lottery_entries
     where lottery_id = p_lottery_id;

    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_JOINED',
      'message', '你已经报名过本次抽奖',
      'entry_id', v_entry.id,
      'entry_count', v_entry_count
    );
  end if;

  select id,
         coalesce(nullif(trim(username), ''), email, 'BOH 用户')
    into v_profile_id,
         v_username
    from public.profiles
   where id = v_user_id
   limit 1;

  if v_profile_id is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'PROFILE_NOT_FOUND', '账号资料尚未初始化，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', '账号资料尚未初始化，请稍后再试');
  end if;

  select created_at
    into v_account_created_at
    from auth.users
   where id = v_user_id
   limit 1;

  if v_account_created_at is null then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_CREATED_AT_MISSING', '账号创建时间不可用，请稍后再试');
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_CREATED_AT_MISSING', 'message', '账号创建时间不可用，请稍后再试');
  end if;

  if v_account_created_at > now() - interval '24 hours' then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'ACCOUNT_TOO_NEW', '账号创建满 24 小时后才可报名抽奖');
    return jsonb_build_object('ok', false, 'code', 'ACCOUNT_TOO_NEW', 'message', '账号创建满 24 小时后才可报名抽奖');
  end if;

  select count(*)
    into v_entry_count
    from public.lottery_entries
   where lottery_id = p_lottery_id;

  if v_lottery.max_entries is not null and v_entry_count >= v_lottery.max_entries then
    perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'FULL', '本次抽奖报名人数已满');
    return jsonb_build_object('ok', false, 'code', 'FULL', 'message', '本次抽奖报名人数已满');
  end if;

  insert into public.lottery_entries (lottery_id, user_id, username_snapshot)
  values (p_lottery_id, v_user_id, coalesce(v_username, 'BOH 用户'))
  returning *
   into v_entry;

  perform public.record_lottery_join_attempt(v_lottery.id, v_user_id, 'JOINED', '报名成功');

  return jsonb_build_object(
    'ok', true,
    'code', 'JOINED',
    'message', '报名成功',
    'entry_id', v_entry.id,
    'entry_count', v_entry_count + 1,
    'entry_created_at', v_entry.created_at
  );
exception
  when unique_violation then
    perform public.record_lottery_join_attempt(p_lottery_id, v_user_id, 'ALREADY_JOINED', '你已经报名过本次抽奖');
    return jsonb_build_object('ok', true, 'code', 'ALREADY_JOINED', 'message', '你已经报名过本次抽奖');
  when others then
    return jsonb_build_object('ok', false, 'code', coalesce(sqlstate, 'JOIN_FAILED'), 'message', coalesce(sqlerrm, '报名失败'));
end;
$$;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.touch_lotteries_updated_at() from public;
revoke all on function public.record_lottery_join_attempt(uuid, uuid, text, text) from public;
revoke all on function public.record_lottery_auto_draw_failure(uuid, text) from public;
revoke all on function public.execute_lottery_draw(uuid, boolean, boolean, text) from public;
revoke all on function public.get_home_lottery() from public;
revoke all on function public.join_home_lottery(uuid) from public;
revoke all on function public.get_community_lotteries() from public;
revoke all on function public.join_community_lottery(uuid) from public;

grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_admin() to service_role;

grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.execute_lottery_draw(uuid, boolean, boolean, text) to service_role;

grant execute on function public.get_home_lottery() to anon;
grant execute on function public.get_home_lottery() to authenticated;
grant execute on function public.get_home_lottery() to service_role;

grant execute on function public.get_community_lotteries() to anon;
grant execute on function public.get_community_lotteries() to authenticated;
grant execute on function public.get_community_lotteries() to service_role;

grant execute on function public.join_home_lottery(uuid) to authenticated;
grant execute on function public.join_home_lottery(uuid) to service_role;

grant execute on function public.join_community_lottery(uuid) to authenticated;
grant execute on function public.join_community_lottery(uuid) to service_role;

commit;
