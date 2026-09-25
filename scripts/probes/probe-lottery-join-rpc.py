#!/usr/bin/env python3
"""抽奖报名修复验证脚本（可重复运行）。

用法：
  python3 scripts/probes/probe-lottery-join-rpc.py            # 只读验证（默认，事务内 rollback）
  python3 scripts/probes/probe-lottery-join-rpc.py --apply    # 应用迁移（真写库）

凭据：macOS 钥匙串「Supabase CLI」（与 fetch-db-schema.py 同源）。
"""
import base64, json, pathlib, subprocess, sys, urllib.error, urllib.request

REF = "nplnlefdwfgtyimfkyih"
ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/2026092501_fix_lottery_join_profiles_email.sql"

# 线上「中秋节抽奖」（2026-09-25 新建，报名全挂的那一期）
LOTTERY_ID = "e270e91d-2357-40db-8721-b7f17a32ab0a"
# 报过名失败的真实用户，用它在事务里模拟 authenticated 调用
TEST_USER_ID = "51bfaddb-b3ad-4f3d-ae43-56ca37837779"

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
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return {"ok": True, "data": json.load(r)}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode()[:2000]}

def as_authenticated(call_sql):
    """在事务内以 authenticated 身份调用 RPC，结束前 rollback，不脏写数据。"""
    return (
        "begin;\n"
        "set local role authenticated;\n"
        f"set local request.jwt.claims = '{{\"sub\":\"{TEST_USER_ID}\",\"role\":\"authenticated\"}}';\n"
        f"select {call_sql} as result;\n"
        "rollback;\n"
    )

def show(title, res):
    print("=" * 20, title, "=" * 20)
    print(json.dumps(res, ensure_ascii=False, indent=2, default=str))

apply_mode = "--apply" in sys.argv
passed, failed = [], []

def check(name, cond, detail=""):
    (passed if cond else failed).append(f"{name}{(' — ' + detail) if detail else ''}")
    print(("  ✅ " if cond else "  ❌ ") + name + (f" — {detail}" if detail else ""))

# ---------- T1 修复后：社区抽奖报名应成功 ----------
r = sql(as_authenticated(f"public.join_community_lottery('{LOTTERY_ID}')"), read_only=False)
show("T1 join_community_lottery（authenticated 模拟）", r)
t1 = r.get("data")
if isinstance(t1, list):
    t1 = t1[0].get("result") if t1 else None
check("T1 调用无 SQL 异常", r["ok"], r.get("error", ""))
check("T1 返回 ok=true", bool(t1 and t1.get("ok")), json.dumps(t1, ensure_ascii=False))
check("T1 code ∈ {JOINED, ALREADY_JOINED}", bool(t1 and t1.get("code") in ("JOINED", "ALREADY_JOINED")),
      str(t1 and t1.get("code")))

# ---------- T2 首页抽奖同源缺陷 ----------
r2 = sql(as_authenticated(f"public.join_home_lottery('{LOTTERY_ID}')"), read_only=False)
show("T2 join_home_lottery（同一期，非首页抽奖 → 期望 NOT_FOUND 而非 JOIN_FAILED）", r2)
t2 = r2.get("data")
if isinstance(t2, list):
    t2 = t2[0].get("result") if t2 else None
check("T2 未落到 JOIN_FAILED（说明不再撞 profiles.email）",
      bool(t2 and t2.get("code") != "JOIN_FAILED"), json.dumps(t2, ensure_ascii=False))

# ---------- T3 反证：把旧实现塞回去，报名必须重新变红 ----------
OLD_LEGACY = """begin;
create or replace function public.join_community_lottery(p_lottery_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $legacy$
declare v_user_id uuid := auth.uid();
begin
  perform (select coalesce(nullif(trim(username), ''), email, 'BOH 用户')
             from public.profiles where id = v_user_id);
  return jsonb_build_object('ok', true, 'code', 'LEGACY_OK');
exception when others then
  return jsonb_build_object('ok', false, 'code', 'JOIN_FAILED', 'message', '报名失败，请稍后重试',
                            'sqlstate', sqlstate);
end;
$legacy$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"%s","role":"authenticated"}';
select public.join_community_lottery('%s') as legacy_result;
rollback;
""" % (TEST_USER_ID, LOTTERY_ID)
r3 = sql(OLD_LEGACY, read_only=False)
show("T3 反证（旧 profiles.email 写法，事务内 rollback）", r3)
t3 = r3.get("data")
if isinstance(t3, list):
    t3 = t3[0].get("legacy_result") if t3 else None
check("T3 旧写法确实落到 JOIN_FAILED（反证成立）",
      bool(t3 and t3.get("code") == "JOIN_FAILED"), json.dumps(t3, ensure_ascii=False))

# ---------- T4 快照函数已严格撤权 ----------
r4 = sql("""
select p.oid::regprocedure::text as sig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'lottery_entry_profile_snapshot';
""")
show("T4 lottery_entry_profile_snapshot 授权", r4)
rows = r4.get("data") if r4["ok"] else None
check("T4 函数存在且 anon/authenticated 均无 EXECUTE",
      bool(rows) and rows[0]["anon_can"] is False and rows[0]["auth_can"] is False,
      json.dumps(rows, ensure_ascii=False))

# ---------- T5 全库复扫：报名类函数不再引用 profiles.email ----------
# 口径：先剥掉 SQL 注释行（-- 到行尾），再找 email 标识符，
#       否则「原实现直读 profiles.email」这类说明注释会造成假红。
r5 = sql("""
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('join_home_lottery', 'join_community_lottery')
  and regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') ~* '\\memail\\M'
order by 1;
""")
show("T5 仍引用 email 的报名函数（期望空集）", r5)
check("T5 两个报名函数均已不引用 email", r5["ok"] and r5["data"] == [], json.dumps(r5.get("data")))

# ---------- 迁移应用记录 ----------
r6 = sql("select version, name from supabase_migrations.schema_migrations where version = '2026092501';")
show("T6 迁移记录", r6)

print()
print("-" * 60)
print(f"通过 {len(passed)} 项，失败 {len(failed)} 项")
for f in failed:
    print("  FAIL:", f)
sys.exit(0 if not failed else 1)
