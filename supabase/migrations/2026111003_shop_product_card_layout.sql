-- 商品卡片形态（商城展示）：small 两列小卡 / banner 一行一个横幅 / large 通栏大图
--
-- 为什么是「档位」而不是自由坐标（2026-11-10 用户口径，参考 iOS 小组件）：
-- 商城是响应式的，竖屏 2 列、横屏 3 列。自由摆放的 x/y 一换屏就全乱；
-- 只存一档尺寸 + 现有的 sort_order（行内顺序），三端才能稳定复现。
--
-- 默认值刻意是 banner：新商品默认按「一行一个」展示（这是本次改版的形态基线），
-- 需要密排时再单独切成 small。

begin;

alter table public.products
  add column if not exists card_layout text not null default 'banner';

alter table public.products
  drop constraint if exists chk_products_card_layout;

alter table public.products
  add constraint chk_products_card_layout
    check (card_layout in ('small', 'banner', 'large'));

comment on column public.products.card_layout is
  '商城卡片形态：small 两列小卡 / banner 一行一个横幅 / large 通栏大图（对齐 iOS 小组件尺寸档）';

commit;
