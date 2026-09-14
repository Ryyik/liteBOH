// 探针：2026090905 商城/签到流水改造的远程契约验证（anon 视角）
// 期望：
//   1) create_shop_order_with_points 对 anon 拒绝（原本 revoke anon，保持拒绝）
//   2) submit_weekly_checkin 对 anon 拒绝（063003 版未 revoke，改造后新增 revoke → 应从 200 变拒绝）
//   3) get_points_ledger_drift 对 anon 仍拒绝（0904 门回归检查）
const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  console.error("缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  process.exit(1);
}

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);
  if (!ok) failed += 1;
};

async function callRpc(fn, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  let text = await res.text();
  return { status: res.status, text: text.slice(0, 120) };
}

// 1) 商城下单 RPC：anon 拒绝（42501 / 404）
const shop = await callRpc("create_shop_order_with_points", { p_items: [], p_contact_type: "qq", p_contact_value: "x" });
check("create_shop_order_with_points 对 anon 拒绝", [404, 401, 403].includes(shop.status) || shop.text.includes("permission denied"), `status=${shop.status}`);

// 2) 周签到 RPC：改造前 anon 可拿到 200 NOT_AUTHENTICATED，现在应拒绝
const checkin = await callRpc("submit_weekly_checkin");
check("submit_weekly_checkin 对 anon 拒绝（revoke 生效）", [404, 401, 403].includes(checkin.status) || checkin.text.includes("permission denied"), `status=${checkin.status}`);

// 3) 对账 RPC：0904 修复后仍拒绝（回归门）
const drift = await callRpc("get_points_ledger_drift");
check("get_points_ledger_drift 对 anon 仍拒绝", [404, 401, 403].includes(drift.status) || drift.text.includes("permission denied"), `status=${drift.status}`);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
