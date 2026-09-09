/**
 * 积分账本补全验证探针（2026090903 迁移后）：
 * 1) subscribe_with_points anon 调用 → 期望 NOT_AUTHENTICATED（函数已替换且入口活着）
 * 2) get_points_ledger_drift anon 调用 → 期望 [] 空集（对账 RPC 存在，非管理员被 WHERE 门挡住）
 * 3) admin_grant_points anon 调用 → 期望异常"仅管理员可发放积分"
 * 4) anon 直查 points_transactions → 期望 [] （RLS 拦截）
 * 用法：node --env-file=.env probe-ledger-verify.mjs
 */
const BASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

if (!BASE || !ANON) {
  console.error("缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

const results = [];
const check = (name, pass, extra = "") => {
  results.push(pass);
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (extra ? "  " + extra : ""));
};

const callRpc = async (fn, args) => {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};

// 1) 订阅 RPC：未登录 → NOT_AUTHENTICATED（新版函数入口存活）
const sub = await callRpc("subscribe_with_points", {
  p_plan_code: "plus", p_plan_name: "Plus", p_billing_cycle: "monthly",
  p_points_cost: 100, p_duration_months: 1,
});
check(
  "subscribe_with_points 存活且要求登录",
  sub.status === 200 && sub.body?.ok === false && sub.body?.message === "NOT_AUTHENTICATED",
  `status=${sub.status} body=${JSON.stringify(sub.body).slice(0, 80)}`
);

// 2) 对账 RPC：anon → EXECUTE 已回收，期望 404（函数不可见）或 401（permission denied）
const drift = await callRpc("get_points_ledger_drift", {});
check(
  "get_points_ledger_drift 对 anon 拒绝执行",
  drift.status === 404 || drift.status === 401,
  `status=${drift.status} body=${JSON.stringify(drift.body).slice(0, 80)}`
);

// 3) 发放 RPC：anon → 拒绝
const grant = await callRpc("admin_grant_points", { p_user_ids: null, p_amount: 10, p_remark: "probe" });
const grantDenied = grant.status >= 400 || /仅管理员/.test(String(grant.body?.message || grant.body));
check("admin_grant_points 拒绝非管理员", grantDenied, `status=${grant.status} body=${JSON.stringify(grant.body).slice(0, 80)}`);

// 4) anon 直查流水表 → RLS 空集
const txRes = await fetch(`${BASE}/rest/v1/points_transactions?select=id&limit=1`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
});
const txBody = await txRes.json().catch(() => null);
check(
  "points_transactions RLS 拦截 anon",
  txRes.status === 200 && Array.isArray(txBody) && txBody.length === 0,
  `status=${txRes.status} len=${Array.isArray(txBody) ? txBody.length : "n/a"}`
);

const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "\nLEDGER VERIFY: ALL PASS" : `\nLEDGER VERIFY: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 2);
