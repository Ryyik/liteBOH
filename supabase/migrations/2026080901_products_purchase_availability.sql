begin;

alter table public.products
  add column if not exists is_purchasable boolean not null default true;

update public.products
set is_purchasable = false
where points_cost <= 0;

commit;
