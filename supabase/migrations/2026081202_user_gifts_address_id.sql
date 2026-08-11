begin;

-- 为 user_gifts 增加 address_id 字段，关联 user_addresses，支持为每个礼物指定收货地址
-- 语义：地址管理（user_addresses）是唯一地址源；礼物通过 address_id 绑定具体地址
-- 兼容：address_id 可空，旧数据无 address_id 时回退取用户默认地址
alter table public.user_gifts
  add column if not exists address_id uuid references public.user_addresses(id) on delete set null;

-- 按地址查询礼物的索引（可选，便于后台按地址汇总）
create index if not exists idx_user_gifts_address_id
  on public.user_gifts (address_id);

-- 管理员已有 user_gifts 的全权策略，无需额外授权

commit;
