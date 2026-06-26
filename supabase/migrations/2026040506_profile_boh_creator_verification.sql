-- Profile: BOH 创作者认证能力
-- 目标：
-- 1) 在 profiles 上存储“是否为 BOH 创作者”与“平台账号 ID 映射”；
-- 2) 限制平台仅允许 bilibili / xiaohongshu / douyin；
-- 3) 自动同步 is_boh_creator，避免前端与数据库状态不一致。

begin;

create or replace function public.boh_creator_platform_ids_are_valid(p_ids jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_ids is not null
    and jsonb_typeof(p_ids) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(p_ids) as k(key)
      where k.key not in ('bilibili', 'xiaohongshu', 'douyin')
    )
    and not exists (
      select 1
      from jsonb_each(p_ids) as e(key, value)
      where jsonb_typeof(e.value) <> 'string'
    )
    and not exists (
      select 1
      from jsonb_each_text(p_ids) as t(key, value)
      where char_length(trim(t.value)) = 0 or char_length(trim(t.value)) > 64
    );
$$;

alter table public.profiles
  add column if not exists is_boh_creator boolean not null default false,
  add column if not exists creator_platform_ids jsonb not null default '{}'::jsonb;

alter table public.profiles
  alter column is_boh_creator set default false,
  alter column creator_platform_ids set default '{}'::jsonb;

create or replace function public.sync_profile_creator_fields()
returns trigger
language plpgsql
as $$
declare
  v_platform_ids jsonb;
begin
  v_platform_ids := coalesce(new.creator_platform_ids, '{}'::jsonb);

  if jsonb_typeof(v_platform_ids) <> 'object' then
    v_platform_ids := '{}'::jsonb;
  end if;

  v_platform_ids := (
    select coalesce(
      jsonb_object_agg(filtered.key, filtered.value),
      '{}'::jsonb
    )
    from (
      select e.key, trim(e.value) as value
      from jsonb_each_text(v_platform_ids) as e(key, value)
      where e.key in ('bilibili', 'xiaohongshu', 'douyin')
        and char_length(trim(e.value)) between 1 and 64
    ) as filtered
  );

  new.creator_platform_ids := v_platform_ids;
  new.is_boh_creator := exists (
    select 1
    from jsonb_each(v_platform_ids)
  );
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_creator_fields on public.profiles;
create trigger trg_profiles_sync_creator_fields
before insert or update of creator_platform_ids, is_boh_creator on public.profiles
for each row
execute function public.sync_profile_creator_fields();

-- 触发一次规范化，兼容已有行（即使此前没有该字段也安全）。
update public.profiles
set creator_platform_ids = coalesce(creator_platform_ids, '{}'::jsonb),
    is_boh_creator = coalesce(is_boh_creator, false);

alter table public.profiles
  alter column is_boh_creator set not null,
  alter column creator_platform_ids set not null;

alter table public.profiles
  drop constraint if exists profiles_creator_platform_ids_valid;

alter table public.profiles
  add constraint profiles_creator_platform_ids_valid
  check (public.boh_creator_platform_ids_are_valid(creator_platform_ids))
  not valid;

alter table public.profiles
  validate constraint profiles_creator_platform_ids_valid;

create index if not exists idx_profiles_is_boh_creator
  on public.profiles (is_boh_creator)
  where is_boh_creator = true;

commit;
