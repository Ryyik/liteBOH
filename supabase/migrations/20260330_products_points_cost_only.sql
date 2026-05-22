-- 商城商品定价统一改为 points_cost（移除 price）

begin;

alter table public.products
  add column if not exists points_cost integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  ) then
    update public.products
       set points_cost = greatest(
         0,
         round(
           coalesce(
             nullif(regexp_replace(price::text, '[^0-9.]', '', 'g'), '')::numeric,
             0
           )
         )::integer
       )
     where points_cost is null;
  end if;
end $$;

update public.products
   set points_cost = 0
 where points_cost is null;

alter table public.products
  alter column points_cost set default 0,
  alter column points_cost set not null;

alter table public.products
  drop constraint if exists products_points_cost_check;

alter table public.products
  add constraint products_points_cost_check check (points_cost >= 0);

alter table public.products
  drop column if exists price;

commit;

