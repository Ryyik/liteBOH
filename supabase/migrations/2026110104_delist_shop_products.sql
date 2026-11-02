-- 2026-11-01 周边商城：下架 6 个 SKU（用户口径）
--
-- 「下架」的落地口径（三件事一起做，缺一条就会出现半下架状态）：
--   · is_active = false       → stores/products.ts 按它过滤，商城不再展示
--   · is_purchasable = false  → 前端 isProductExchangeable 与下单 RPC 双重拦截，
--                               购物袋里残留的旧条目也不会被结算
--   · 不物理删除：历史订单（shop_points_orders.items 存的是下单时的快照）与积分
--     流水需要能回指商品，「下架」是可逆的运营动作，delete 不是
--
-- 定位一律用 id，不按标题匹配 —— 标题在后台随时可能改字
-- （例如 302 现在叫「明信片套装（8张）」、303 叫「BOH 特制贴纸」）。
--
-- 下架清单：
--   101  BOH BAG Air
--   102  BOH BAG Pro
--   201  BOH 纪念勋章
--   302  明信片套装（8张）
--   303  BOH 特制贴纸
--   402  小牛定制流麻
--
-- 幂等：重复执行结果一致（已下架的再置 false 不变）。

update public.products
set is_active = false,
    is_purchasable = false,
    updated_at = now()
where id in (101, 102, 201, 302, 303, 402);
