-- =====================================================
-- 修复 PostgreSQL round(double precision, integer) 缺失问题
-- 
-- PostgreSQL 内置 round() 函数：
--   - round(double precision) → double precision  ✓
--   - round(numeric, integer) → numeric           ✓
--   - round(double precision, integer) → ?         ✗（不存在）
-- 
-- 当数据库中存在 round(double_precision_col, n) 调用时会报错：
--   "function round(double precision, integer) does not exist"
-- 
-- 此迁移添加缺失的重载，内部将 double precision 转为 numeric 再调用 round
-- =====================================================

create or replace function round(input double precision, decimal_places integer)
returns numeric
language sql
immutable
parallel safe
as $$
  select round(input::numeric, decimal_places);
$$;

-- 授予所有用户执行权限（与内置 round 兼容）
revoke all on function round(double precision, integer) from public;
grant execute on function round(double precision, integer) to public;
grant execute on function round(double precision, integer) to anon;
grant execute on function round(double precision, integer) to authenticated;
grant execute on function round(double precision, integer) to service_role;

comment on function round(double precision, integer) is 'round 重载：支持 double precision 类型指定小数位数';
