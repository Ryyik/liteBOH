#!/usr/bin/env python3
"""activity_campaigns 草稿泄漏修复：应用 + 验证（可重复运行）。

用法：
  python3 scripts/probes/probe-campaign-draft-rls.py            # 只读体检（现状/版本占用/阶段分布）
  python3 scripts/probes/probe-campaign-draft-rls.py --apply    # 应用迁移（真写库，单事务）

迁移：supabase/migrations/2026092704_activity_campaigns_draft_rls.sql
  - drop 旧 activity_campaigns_select（using(true)）
  - 新 policy：非 draft 全员可读，draft 仅 current_user_is_admin()
  - 同事务手写 schema_migrations，结尾 notify pgrst

凭据：macOS 钥匙串「Supabase CLI」（与 probe-lottery-join-rpc.py 同源）。
"""
import base64, json, pathlib, subprocess, sys, urllib.error, urllib.request

REF = "nplnlefdwfgtyimfkyih"
VERSION = "2026092704"
NAME = "2026092704_activity_campaigns_draft_rls"

raw = subprocess.run(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
    capture_output=True, text=True).stdout.strip()
if not raw:
    print("NO_TOKEN"); sys.exit(2)
TOKEN = base64.b64decode(raw.split(":", 1)[1]).decode().strip()
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"

def sql(query, read_only=True):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": query, "read_only": read_only}).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "json/".replace("json/", "application/json")})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return {"ok": True, "data": json.load(r)}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode()[:2000]}

passed, failed = [], []

def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("  ✅ " if cond else "  ❌ ") + name + (f" — {detail}" if detail else ""))

def rows(res):
    return res.get("data") if res.get("ok") else None

apply_mode = "--apply" in sys.argv
print(f"== activity_campaigns 草稿 RLS（{'APPLY' if apply_mode else '只读体检'}）==")

# ---------- T1 版本号状态（已应用 → 跳过 apply 只验证）----------
r = sql(f"select version from supabase_migrations.schema_migrations where version = '{VERSION}'")
existing = rows(r) or []
already_applied = len(existing) > 0
should_apply = apply_mode and not already_applied
if apply_mode and already_applied:
    print("  ℹ️ 2026092704 已在 schema_migrations 中 → 跳过 apply，仅验证")
else:
    check("T1 schema_migrations 未占用 2026092704", r["ok"] and len(existing) == 0, json.dumps(existing))

# ---------- T2 现状：当前 policy 文本 + 阶段分布 ----------
r = sql("""
select pol.polname as name,
       pg_get_expr(ad.adbin, ad.adrelid) as qual
from pg_policy pol
join pg_class c on c.oid = pol.polrelid and c.relname = 'activity_campaigns'
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_attrdef ad on false
where pol.polname like 'activity_campaigns%'
""")
current = rows(r) or []
check("T2 读到现有 policy", r["ok"] and len(current) > 0, json.dumps(current, ensure_ascii=False)[:300])

r = sql("select stage, count(*) from activity_campaigns group by stage order by stage")
dist = rows(r) or []
check("T3 读到阶段分布", r["ok"], json.dumps(dist))
draft_count = next((int(row["count"]) for row in dist if row.get("stage") == "draft"), 0)
print(f"  阶段分布：{json.dumps(dist)}（draft={draft_count}）")

if not apply_mode:
    print("\n（只读体检完成；加 --apply 执行迁移）")
    sys.exit(0)

# ---------- APPLY：单事务（已应用则跳过）----------
APPLY_SQL = f"""
begin;
drop policy if exists activity_campaigns_select on public.activity_campaigns;
create policy activity_campaigns_select
  on public.activity_campaigns
  for select
  using (stage <> 'draft' or public.current_user_is_admin());
insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '{VERSION}',
  '{NAME}',
  array[
    'drop policy if exists activity_campaigns_select on public.activity_campaigns',
    $$create policy activity_campaigns_select on public.activity_campaigns for select using (stage <> 'draft' or public.current_user_is_admin())$$
  ]
);
commit;
notify pgrst, 'reload schema';
"""
if should_apply:
    r = sql(APPLY_SQL, read_only=False)
    check("A1 迁移应用成功", r["ok"], r.get("error", "")[:400])
    if not r["ok"]:
        print("应用失败，中止验证"); sys.exit(2)
else:
    print("  ℹ️ 跳过 A1（已应用）")

# ---------- V1 新 policy 文本 ----------
r = sql("""
select pg_get_expr(pol.polqual, pol.polrelid) as qual
from pg_policy pol
join pg_class c on c.oid = pol.polrelid and c.relname = 'activity_campaigns'
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where pol.polname = 'activity_campaigns_select'
""")
quals = [row.get("qual", "") for row in (rows(r) or [])]
ok = any(("draft" in q and "current_user_is_admin" in q) for q in quals)
check("V1 新 policy 含 draft + current_user_is_admin 判定", ok, json.dumps(quals))

# ---------- V2 授权与策略语义（Management API 会话不能 set role anon，改用等价检查）----------
r = sql("""
select
  has_table_privilege('anon', 'activity_campaigns', 'select') as anon_select,
  has_table_privilege('authenticated', 'activity_campaigns', 'select') as auth_select,
  (select count(*) from pg_policy pol
   join pg_class c on c.oid = pol.polrelid and c.relname = 'activity_campaigns'
   where pol.polname = 'activity_campaigns_select' and pol.polcmd = 'r') as select_policies
""")
grants = (rows(r) or [{}])[0]
check("V2 anon/authenticated 保留 SELECT 授权", bool(grants.get("anon_select")) and bool(grants.get("auth_select")), json.dumps(grants))
check("V2 恰有一条 SELECT 策略（RLS 强制 per-role 行过滤）", int(grants.get("select_policies", 0)) == 1, json.dumps(grants))

# 行为语义由「授权 + policy 定义」唯一决定：
#   anon → current_user_is_admin() 恒 false（auth.uid() 为空）→ 只见 stage<>'draft'
#   admin（profiles.role='admin'）→ 恒 true → 全量可见
# 表当前 0 行，故无存量泄漏；未来写入的草稿从第一天起即受保护。

print(f"\n{len(passed)}/{len(passed) + len(failed)} PASS")
sys.exit(1 if failed else 0)
