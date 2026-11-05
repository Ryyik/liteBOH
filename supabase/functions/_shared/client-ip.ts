/**
 * 客户端 IP 的**唯一**取值口径（2026-11-05 安全审查补）。
 *
 * 为什么收成一份：限流 key 全部按 IP 计（登录 10 次/分、注册 5 次/分、游客日额度），
 * 而 `x-forwarded-for` 的**首段是客户端可写的**。原实现里 api-key-vault 已经改成
 * 「cf-connecting-ip → x-real-ip → XFF 最后一跳」，另外四个函数却还在取首段 ——
 * 同一仓库两套口径，前者被绕过、后者没有，属于「改一处漏三处」的典型。
 *
 * 取值顺序（可信度从高到低）：
 *   1. `cf-connecting-ip` —— Cloudflare 网关写入，客户端改不动；
 *   2. `x-real-ip` —— 反向代理写入（nginx 默认 `$remote_addr`）；
 *   3. `x-forwarded-for` 的**最后一跳** —— 由最近的代理追加，比首段难伪造；
 *      首段永远是「客户端自己说的」，绝不能用来做限流 key。
 *   4. 都没有 ⇒ 'unknown'（所有无头请求共用一个桶，宁可误伤也不要放行）。
 *
 * ⚠️ 仍非万无一失：真实用户在 NAT 后共享出口 IP，代理池也能轮换出口。
 *    要更严需叠加设备指纹 / C 段聚合，属于风控范畴，不在本文件职责内。
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  return 'unknown';
}
