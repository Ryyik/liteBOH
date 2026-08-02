begin;

-- 补 user_gifts 的本人 select 策略
-- 背景: 2026042801 仅建了 admin 的 insert/update/delete 策略, 漏了 select,
-- 导致普通用户 from('user_gifts').select() 返回空集, 历史礼物列表与 gift_image 无法展示。
-- 现允许认证用户 select 自己 user_id 的行; admin 策略不受影响, 仍可全权管理。

drop policy if exists user_gifts_owner_select on public.user_gifts;
create policy user_gifts_owner_select on public.user_gifts
  for select to authenticated
  using (user_id = auth.uid());

commit;
