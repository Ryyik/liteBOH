-- 论坛内容审核状态收敛：仅允许 approved / rejected，清理历史 pending 等异常值

begin;

-- 1) 先清理历史数据（null / pending / 其他意外值）
update public.posts
set status = 'approved'
where status is null
   or lower(status) not in ('approved', 'rejected');

update public.comments
set status = 'approved'
where status is null
   or lower(status) not in ('approved', 'rejected');

-- 2) 标准化大小写，避免出现 APPROVED / Rejected 这类变体
update public.posts
set status = lower(status)
where status is not null
  and lower(status) in ('approved', 'rejected')
  and status <> lower(status);

update public.comments
set status = lower(status)
where status is not null
  and lower(status) in ('approved', 'rejected')
  and status <> lower(status);

-- 3) 移除旧的 status 相关 check（名称不固定，统一按表达式匹配）
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.posts'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.posts drop constraint %I', rec.conname);
  end loop;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.comments'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.comments drop constraint %I', rec.conname);
  end loop;
end;
$$;

-- 4) 固化默认值与约束：仅 approved / rejected
alter table public.posts
  alter column status set default 'approved',
  alter column status set not null;

alter table public.comments
  alter column status set default 'approved',
  alter column status set not null;

alter table public.posts
  add constraint posts_status_check
  check (status in ('approved', 'rejected'));

alter table public.comments
  add constraint comments_status_check
  check (status in ('approved', 'rejected'));

commit;
