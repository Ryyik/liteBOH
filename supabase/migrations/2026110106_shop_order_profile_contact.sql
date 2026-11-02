-- 2026-11-01 周边下单：联系方式从「手填 QQ/微信」改为「资料内的收件信息」
--
-- 用户口径：结算不再让用户填联系方式，直接用资料里的昵称 / 邮箱 / 电话 / 地址，
-- 下单后直接邮件通知管理员。资料表已有 shipping_recipient / shipping_phone /
-- shipping_address 三列（邮箱来自 auth.users），前端在缺项时就地补填并写回资料。
--
-- 两处要动：
--   ① 表约束 shop_points_orders_contact_type_check 只允许 qq / vx
--   ② 函数 create_shop_order 内部还有一条同样的白名单校验
-- 都要放开 'profile'。'qq' / 'vx' 保留 —— 历史订单与旧入口仍在用。

alter table public.shop_points_orders
  drop constraint if exists shop_points_orders_contact_type_check;

alter table public.shop_points_orders
  add constraint shop_points_orders_contact_type_check
  check (contact_type = any (array['qq'::text, 'vx'::text, 'profile'::text]));

-- 函数体不整段复制（200 行，抄错一个字就是线上事故）：
-- 取出当前定义、只替换白名单那一处、再 execute 回去，并前后做断言。
-- 幂等：已经放开过就直接 return；替换没命中就 raise（说明函数被改过，需人工核对）。
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_shop_order';

  if v_def is null then
    raise exception 'create_shop_order 不存在，无法放开 profile 联系方式';
  end if;

  if position($q$'profile'$q$ in v_def) > 0 then
    return;
  end if;

  v_def := replace(
    v_def,
    $q$not in ('qq', 'vx')$q$,
    $q$not in ('qq', 'vx', 'profile')$q$
  );

  if position($q$'profile'$q$ in v_def) = 0 then
    raise exception '未匹配到 contact_type 白名单，函数体已变更，请人工核对后再放开';
  end if;

  execute v_def;
end $$;
