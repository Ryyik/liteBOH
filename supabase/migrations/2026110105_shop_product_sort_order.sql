-- 2026-11-01 周边商品排序位
--
-- 用户口径：小狗第 1、海报第 2、纪念册第 3，其余「继续按顺序」。
--
-- 为什么新开一列而不是改 id：id 是业务主键（历史订单 items 快照、积分流水都引用它），
-- 排序是纯展示属性，必须能随时调、且不牵动任何引用。
--
-- 默认值取 1000 而不是 0：0 会让「以后新增的商品」抢到最前面 ——
-- 未显式排位的商品应当排在有排位的之后，彼此之间再按 id 升序。
-- 这条口径前端（stores/products.ts）与数据管理后台（TAB_DEFAULT_SORT）完全一致。

alter table public.products
  add column if not exists sort_order integer not null default 1000;

comment on column public.products.sort_order is
  '商城展示排序：值小的在前；未排位=1000，同值时按 id 升序（2026-11-01 引入）';

update public.products set sort_order = 1 where id = 501; -- BOH特别礼物围巾小狗（2026+）
update public.products set sort_order = 2 where id = 301; -- 8周年纪念海报
update public.products set sort_order = 3 where id = 304; -- 方块之家7周年纪念册
