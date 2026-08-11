-- 将前端 fallback 的 BOH 吉祥物公仔写入 products 表
-- 支付模式: combined（积分+RMB）

insert into public.products (id, category, title, description, points_cost, payment_mode, rmb_price, stock, image, specifications, is_active, is_purchasable)
values (
  501,
  'BOH 装饰',
  'BOH 吉祥物公仔',
  '软乎乎的全新吉祥物玩偶，陪你走过方块之家的每一天。手感软糯，治愈满满。',
  45,
  'combined',
  2900,
  100,
  'mascot-new-landscape-orig.webp',
  '[
    {"label": "标准版 20cm", "value": "Standard"},
    {"label": "大号 30cm",   "value": "Large"}
  ]'::jsonb,
  true,
  true
)
on conflict (id) do update set
  category       = excluded.category,
  title          = excluded.title,
  description    = excluded.description,
  points_cost    = excluded.points_cost,
  payment_mode   = excluded.payment_mode,
  rmb_price      = excluded.rmb_price,
  stock          = excluded.stock,
  image          = excluded.image,
  specifications = excluded.specifications,
  is_active      = excluded.is_active,
  is_purchasable = excluded.is_purchasable;
