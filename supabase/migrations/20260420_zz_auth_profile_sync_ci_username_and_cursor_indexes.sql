-- Auth / Profile sync + case-insensitive username uniqueness + keyset pagination indexes
-- 目标：
-- 1) 由 auth.users 触发器自动写入 profiles，减少注册链路一次 RTT 与补偿删除逻辑；
-- 2) 用户名大小写唯一（Tom 与 tom 视为冲突）；
-- 3) 为 keyset 分页补充复合索引（created_at/updated_at + id）。

begin;

-- 先检查大小写重复用户名，避免索引创建到一半才报错。
do language plpgsql $$
begin
  if exists (
    select 1
    from public.profiles p
    where p.username is not null
    group by lower(trim(p.username))
    having count(*) > 1
  ) then
    raise exception
      using message = (
        select format(
          '无法创建大小写唯一索引：用户名存在大小写重复（normalized=%s, count=%s, values=%s）',
          coalesce(d.normalized_username, 'NULL'),
          coalesce(d.dup_count::text, '0'),
          coalesce(d.raw_usernames, 'N/A')
        )
        from (
          select
            lower(trim(p.username)) as normalized_username,
            count(*) as dup_count,
            string_agg(p.username, ', ' order by p.username) as raw_usernames
          from public.profiles p
          where p.username is not null
          group by lower(trim(p.username))
          having count(*) > 1
          limit 1
        ) d
      ),
      hint = '请先清理重复用户名，再重新执行该迁移。';
  end if;
end
$$;

create unique index if not exists idx_profiles_username_lower_unique
  on public.profiles ((lower(trim(username))));

create or replace function public.sync_profile_from_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_role text;
  v_points integer := 0;
  v_points_text text;
  v_join_date date := current_date;
  v_join_date_text text;
  v_birth_month text;
  v_birth_day text;
begin
  v_username := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  if v_username is null then
    v_username := nullif(trim(split_part(lower(coalesce(new.email, '')), '@', 1)), '');
  end if;
  if v_username is null then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  v_role := nullif(trim(coalesce(new.raw_user_meta_data ->> 'role', '')), '');
  if v_role is null then
    v_role := 'user';
  end if;

  v_points_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'points', '')), '');
  if v_points_text is not null and v_points_text ~ '^-?\\d+$' then
    v_points := v_points_text::integer;
  end if;

  v_join_date_text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'join_date', '')), '');
  if v_join_date_text is not null and v_join_date_text ~ '^\\d{4}-\\d{2}-\\d{2}$' then
    v_join_date := v_join_date_text::date;
  end if;

  v_birth_month := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_month', '')), '');
  v_birth_day := nullif(trim(coalesce(new.raw_user_meta_data ->> 'birth_day', '')), '');

  insert into public.profiles (
    id,
    username,
    email,
    role,
    points,
    join_date,
    birth_month,
    birth_day
  ) values (
    new.id,
    v_username,
    lower(nullif(trim(coalesce(new.email, '')), '')),
    v_role,
    v_points,
    v_join_date,
    v_birth_month,
    v_birth_day
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(nullif(trim(public.profiles.username), ''), excluded.username),
        join_date = coalesce(public.profiles.join_date, excluded.join_date),
        role = coalesce(nullif(trim(public.profiles.role), ''), excluded.role),
        birth_month = coalesce(public.profiles.birth_month, excluded.birth_month),
        birth_day = coalesce(public.profiles.birth_day, excluded.birth_day);

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_from_auth_user_insert on auth.users;
create trigger trg_sync_profile_from_auth_user_insert
after insert on auth.users
for each row
execute function public.sync_profile_from_auth_user_insert();

-- keyset 分页索引（论坛）
create index if not exists idx_posts_status_created_at_id
  on public.posts (status, created_at desc, id desc);

-- keyset 分页索引（树洞）
do language plpgsql $$
begin
  if to_regclass('public.boh_treehole_memories') is not null then
    execute 'create index if not exists idx_boh_treehole_memories_user_updated_id on public.boh_treehole_memories (user_id, updated_at desc, id desc)';
  end if;
end
$$;

-- keyset 分页索引（共享记忆）
do language plpgsql $$
begin
  if to_regclass('public.boh_ai_shared_memories') is not null then
    execute 'create index if not exists idx_boh_ai_shared_memories_owner_updated_id on public.boh_ai_shared_memories (owner_user_id, updated_at desc, id desc)';
  end if;
end
$$;

commit;
