/**
 * 生成 CSV 文本（含表头）。纯函数，不碰 DOM / 网络，供单测直接调用。
 * 不放进 useDataAdminExport.js：那个模块顶层会初始化 Supabase 客户端，
 * 单测 import 时会因为没有 env 直接抛错（plans/027 S2）。
 * @param {Array<Object>} rows     数据行
 * @param {Array<Object>} columns  [{ key, label }]
 * @returns {string} 不含 BOM 的纯 CSV 文本（BOM 由调用方加）
 */
export const buildCsvContent = (rows = [], columns = []) => {
  const header = columns.map((col) => `"${String(col.label ?? '').replace(/"/g, '""')}"`).join(',');
  const lines = (rows || []).map((item) =>
    columns
      .map((col) => {
        let val = item?.[col.key];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        let cell = String(val ?? '');
        // CSV 注入防护: 以 = + - @ 开头的值前缀单引号
        if (/^[=+\-@]/.test(cell)) cell = "'" + cell;
        return `"${cell.replace(/"/g, '""')}"`;
      })
      .join(','),
  );
  return [header, ...lines].join('\n');
};
