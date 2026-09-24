#!/usr/bin/env python3
"""只读拉取远端 Supabase public schema 的表/列清单，落成 JSON。

输出：docs/db-schema-snapshot.json（供 audit-datamanagement-columns.mjs 比对）

用法：python3 scripts/probes/fetch-db-schema.py
凭据：macOS 钥匙串 Supabase CLI（go-keyring-base64 壳，须 base64 解码）
"""
import base64, json, subprocess, urllib.request, urllib.error, sys, os

REF = "nplnlefdwfgtyimfkyih"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "db-schema-snapshot.json")

raw = subprocess.run(
    ["security", "find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
    capture_output=True, text=True).stdout.strip()
if not raw:
    print("NO_TOKEN"); sys.exit(2)
TOKEN = base64.b64decode(raw.split(":", 1)[1]).decode().strip()

URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"

def sql(q):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": q, "read_only": True}).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"__error__": e.read().decode()[:500]}

q_cols = """
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
"""
q_tables = """
select c.relname as table_name, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','v','m','p')
order by 1;
"""

cols = sql(q_cols)
tables = sql(q_tables)
if isinstance(cols, dict) and cols.get("__error__"):
    print("COLS_ERROR", cols["__error__"]); sys.exit(3)

schema = {}
for row in cols:
    schema.setdefault(row["table_name"], []).append({
        "column": row["column_name"],
        "type": row["data_type"],
        "nullable": row["is_nullable"],
    })

payload = {
    "schema": schema,
    "objects": tables if isinstance(tables, list) else [],
}
with open(OUT, "w") as f:
    json.dump(payload, f, ensure_ascii=False, indent=1)

print(f"tables={len(schema)} cols={sum(len(v) for v in schema.values())} -> {OUT}")
print("relkinds:", sorted({o["relkind"] for o in payload["objects"]}) if payload["objects"] else "n/a")
