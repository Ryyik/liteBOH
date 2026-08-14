begin;

-- 礼物可不绑定地址，但一旦绑定，地址必须属于礼物对应的用户。
-- 普通外键只能保证地址存在，无法阻止后台误选其他用户的地址。
create or replace function public.validate_user_gift_address_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.address_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.user_addresses
    where id = new.address_id
      and user_id = new.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Gift address must belong to the same user';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_user_gifts_validate_address_owner on public.user_gifts;
create trigger tr_user_gifts_validate_address_owner
before insert or update of user_id, address_id on public.user_gifts
for each row
execute function public.validate_user_gift_address_owner();

commit;
