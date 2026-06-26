-- Profile 增强：
-- 1) 个人空间代表作置顶（1-3 条）
-- 2) 社交平台可见性（public/private）
-- 3) 社交平台展示顺序（拖拽排序）

begin;

create or replace function public.boh_creator_platform_visibility_is_valid(p_visibility jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_visibility is not null
    and jsonb_typeof(p_visibility) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(p_visibility) as k(key)
      where k.key not in ('bilibili', 'xiaohongshu', 'douyin')
    )
    and not exists (
      select 1
      from jsonb_each_text(p_visibility) as e(key, value)
      where lower(trim(e.value)) not in ('public', 'private')
    );
$$;

create or replace function public.boh_creator_platform_order_is_valid(p_order jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_order is not null
    and jsonb_typeof(p_order) = 'array'
    and jsonb_array_length(p_order) <= 3
    and not exists (
      select 1
      from jsonb_array_elements_text(p_order) as e(value)
      where e.value not in ('bilibili', 'xiaohongshu', 'douyin')
    )
    and (
      select count(*) = count(distinct value)
      from jsonb_array_elements_text(p_order) as e(value)
    );
$$;

create or replace function public.profile_showcase_post_ids_are_valid(p_ids jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_ids is not null
    and jsonb_typeof(p_ids) = 'array'
    and jsonb_array_length(p_ids) <= 3
    and not exists (
      select 1
      from jsonb_array_elements_text(p_ids) as e(value)
      where e.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    and (
      select count(*) = count(distinct value)
      from jsonb_array_elements_text(p_ids) as e(value)
    );
$$;

alter table public.profiles
  add column if not exists creator_platform_visibility jsonb not null default '{}'::jsonb,
  add column if not exists creator_platform_order jsonb not null default '[]'::jsonb,
  add column if not exists showcase_post_ids jsonb not null default '[]'::jsonb;

alter table public.profiles
  alter column creator_platform_visibility set default '{}'::jsonb,
  alter column creator_platform_order set default '[]'::jsonb,
  alter column showcase_post_ids set default '[]'::jsonb;

create or replace function public.sync_profile_creator_fields()
returns trigger
language plpgsql
as $$
declare
  v_platform_ids jsonb;
  v_visibility jsonb;
  v_order jsonb;
  v_showcase jsonb;
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

  v_visibility := coalesce(new.creator_platform_visibility, '{}'::jsonb);
  if jsonb_typeof(v_visibility) <> 'object' then
    v_visibility := '{}'::jsonb;
  end if;

  v_visibility := (
    select coalesce(
      jsonb_object_agg(k.key, case lower(trim(coalesce(v_visibility ->> k.key, 'public')))
        when 'private' then 'private'
        else 'public'
      end),
      '{}'::jsonb
    )
    from jsonb_each_text(v_platform_ids) as k(key, value)
  );

  v_order := coalesce(new.creator_platform_order, '[]'::jsonb);
  if jsonb_typeof(v_order) <> 'array' then
    v_order := '[]'::jsonb;
  end if;

  v_order := (
    with raw_order as (
      select e.value as key, e.ordinality as ord
      from jsonb_array_elements_text(v_order) with ordinality as e(value, ordinality)
      where e.value in ('bilibili', 'xiaohongshu', 'douyin')
        and v_platform_ids ? e.value
    ),
    dedup_order as (
      select distinct on (key) key, ord
      from raw_order
      order by key, ord
    ),
    remained as (
      select p.key,
             100 + case p.key
               when 'bilibili' then 1
               when 'xiaohongshu' then 2
               when 'douyin' then 3
               else 999
             end as ord
      from jsonb_each_text(v_platform_ids) as p(key, value)
      where not exists (
        select 1
        from dedup_order d
        where d.key = p.key
      )
    )
    select coalesce(
      jsonb_agg(to_jsonb(merged.key) order by merged.ord),
      '[]'::jsonb
    )
    from (
      select key, ord from dedup_order
      union all
      select key, ord from remained
    ) as merged
  );

  v_showcase := coalesce(new.showcase_post_ids, '[]'::jsonb);
  if jsonb_typeof(v_showcase) <> 'array' then
    v_showcase := '[]'::jsonb;
  end if;

  v_showcase := (
    with raw_showcase as (
      select e.value as post_id_text, e.ordinality as ord
      from jsonb_array_elements_text(v_showcase) with ordinality as e(value, ordinality)
      where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
    dedup_showcase as (
      select distinct on (post_id_text) post_id_text, ord
      from raw_showcase
      order by post_id_text, ord
    ),
    owned_posts as (
      select d.post_id_text, d.ord
      from dedup_showcase d
      join public.posts p on p.id = d.post_id_text::uuid
      where p.author_id = new.id
    )
    select coalesce(
      jsonb_agg(to_jsonb(post_id_text) order by ord),
      '[]'::jsonb
    )
    from (
      select post_id_text, ord
      from owned_posts
      order by ord
      limit 3
    ) as limited
  );

  new.creator_platform_ids := v_platform_ids;
  new.creator_platform_visibility := v_visibility;
  new.creator_platform_order := v_order;
  new.showcase_post_ids := v_showcase;
  new.is_boh_creator := exists (
    select 1
    from jsonb_each(v_platform_ids)
  );

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_creator_fields on public.profiles;
create trigger trg_profiles_sync_creator_fields
before insert or update of creator_platform_ids, is_boh_creator, creator_platform_visibility, creator_platform_order, showcase_post_ids
on public.profiles
for each row
execute function public.sync_profile_creator_fields();

update public.profiles
set creator_platform_ids = coalesce(creator_platform_ids, '{}'::jsonb),
    creator_platform_visibility = coalesce(creator_platform_visibility, '{}'::jsonb),
    creator_platform_order = coalesce(creator_platform_order, '[]'::jsonb),
    showcase_post_ids = coalesce(showcase_post_ids, '[]'::jsonb),
    is_boh_creator = coalesce(is_boh_creator, false);

alter table public.profiles
  alter column creator_platform_visibility set not null,
  alter column creator_platform_order set not null,
  alter column showcase_post_ids set not null;

alter table public.profiles
  drop constraint if exists profiles_creator_platform_visibility_valid,
  drop constraint if exists profiles_creator_platform_order_valid,
  drop constraint if exists profiles_showcase_post_ids_valid;

alter table public.profiles
  add constraint profiles_creator_platform_visibility_valid
    check (public.boh_creator_platform_visibility_is_valid(creator_platform_visibility))
    not valid,
  add constraint profiles_creator_platform_order_valid
    check (public.boh_creator_platform_order_is_valid(creator_platform_order))
    not valid,
  add constraint profiles_showcase_post_ids_valid
    check (public.profile_showcase_post_ids_are_valid(showcase_post_ids))
    not valid;

alter table public.profiles
  validate constraint profiles_creator_platform_visibility_valid;
alter table public.profiles
  validate constraint profiles_creator_platform_order_valid;
alter table public.profiles
  validate constraint profiles_showcase_post_ids_valid;

commit;
