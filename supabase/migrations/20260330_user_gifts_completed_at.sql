-- user_gifts: 独立完成时间字段 completed_at

alter table public.user_gifts
  add column if not exists completed_at timestamp with time zone null;

-- 历史数据回填：已完成礼物补齐 completed_at
update public.user_gifts
   set completed_at = coalesce(completed_at, updated_at, created_at)
 where gift_status = 'completed'
   and completed_at is null;

-- 非完成状态不保留完成时间
update public.user_gifts
   set completed_at = null
 where gift_status <> 'completed'
   and completed_at is not null;

create or replace function public.sync_user_gifts_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.gift_status = 'completed' then
    if new.completed_at is null then
      if tg_op = 'UPDATE' then
        new.completed_at := coalesce(old.completed_at, now());
      else
        new.completed_at := now();
      end if;
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_user_gifts_sync_completed_at on public.user_gifts;

create trigger tr_user_gifts_sync_completed_at
before insert or update on public.user_gifts
for each row
execute function public.sync_user_gifts_completed_at();
