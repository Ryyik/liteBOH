/**
 * 积分余额写回的纯函数契约层。
 *
 * 为什么单独成模块：这里的两个规则各对应一次线上事故，必须能被单测钉住，
 * 而它们原本散落在 5000+ 行的 ForumMain.vue 里，测试够不着。
 *
 * 规则一（区分「缺失」与「真的是 0」）：
 *   JS 里 Number(null) === 0、Number('') === 0，而 Number(undefined) === NaN。
 *   「后端没给余额」与「余额确实是 0」必须能区分开，否则会把用户界面余额清成 0。
 *
 * 规则二（只有上游真给了才写回）：
 *   写回必须由本模块收口，不能靠每个调用点自觉 —— 事故就是「调用点无条件赋值」造成的。
 */

/**
 * 把上游 payload 里的余额读成 number | null。
 * @param {unknown} value 上游字段值（RPC 的 current_points / 本地 userInfo.points）
 * @returns {number|null} 合法余额；缺失或非法一律 null（**不是 0**）
 */
export function readPoints(value) {
  if (value === null || value === undefined || value === '') return null;
  const points = Number(value);
  return Number.isFinite(points) ? points : null;
}

/**
 * 把上游余额写回 userInfo —— 只在「上游真的给了」时才写。
 * @param {{ points?: number }|null|undefined} userInfo 响应式用户对象
 * @param {unknown} value 上游字段值
 * @returns {boolean} 是否发生了写回
 */
export function applyPoints(userInfo, value) {
  const points = readPoints(value);
  if (points === null || !userInfo || typeof userInfo !== 'object') return false;
  userInfo.points = points;
  return true;
}
