-- 商品卡片形态默认档：banner → small
--
-- 2026-11-10 首批上线时默认是 banner（一行一个）。用户随后改口径：
-- 「默认新建都是小卡」—— 新建商品应当落在密排的两列网格里，需要一行一个时再切。
--
-- 为什么要动列默认值，而不是只在代码里传 'small'：
--   1. 新增商品有三条链路（就地编辑 / 商城控制台 / 数据管理表单），
--      只在其中一条传值就会出现「同一个操作，商品形态不一样」；
--   2. 任何绕过前端的手工 SQL / 导入，也该落到同一个默认档。
--
-- 单一真源是 src/config/product-card-layout.js 的 DEFAULT_CARD_LAYOUT，
-- 本迁移的值必须与它一致（改动时两边一起改）。
--
-- 注：已有行不打回填 —— 之前按 banner 展示的商品是运营看到并认可的样子，
--     改默认值只影响之后新增的行。

begin;

alter table public.products
  alter column card_layout set default 'small';

comment on column public.products.card_layout is
  '商城卡片形态：small 两列小卡（默认，新建商品落这一档）/ banner 一行一个横幅 / large 通栏大图（对齐 iOS 小组件尺寸档）';

commit;
