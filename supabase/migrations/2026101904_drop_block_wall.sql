-- 方块墙（BlockWall）2026-10-19 退场：表、触发器、函数一并删除。
-- 前端入口与管理面板「方块墙」tab 已同批下线；
-- user-data-export Edge Function 的导出块同步移除（表不存在后该查询必 404）。
-- 历史链路：2026071701_block_wall.sql 建表 + RLS + 触发器；
-- 2026101703_admin_batch_delete.sql / 2026101704_admin_hardening.sql 的清单引用随表消失。

drop table if exists public.block_wall_items;

drop function if exists public.touch_block_wall_item_updated_at();
