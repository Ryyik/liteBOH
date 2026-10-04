/**
 * supabase-admin-api.mjs — Supabase **Management API** 只读查询助手
 *
 * 背景：本仓有 8+ 个脚本（`check-anon-execute.mjs` 与 `scripts/probes/*.py|mjs`）各自
 * 复制了一份「读 token + 读 project-ref + POST /database/query」的实现。
 * 新脚本请**用这里**，别再抄第 9 份。
 *
 * 凭据解析顺序（与既有脚本一致）：
 *   1. 环境变量 `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF`
 *   2. macOS 钥匙串 `security find-generic-password -s "Supabase CLI" -a supabase -w`
 *      （go-keyring 格式：`go-keyring-base64:<base64>`，取冒号右边再 base64 解码）
 *   3. `supabase/.temp/project-ref`
 *
 * ⚠️ 用 Management API 需要 **access token**（能读 pg_catalog），**不是 anon key**。
 * 拿不到时调用方应**告警 + 跳过**，不要阻断发布（与 `cloudflare-security-headers.mjs` 同策略）。
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 读取 Management API access token；拿不到返回空串。 */
export const readAccessToken = () => {
  const fromEnv = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'darwin') return '';
  try {
    const raw = execSync('security find-generic-password -s "Supabase CLI" -a supabase -w', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const payload = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    return Buffer.from(payload, 'base64').toString('utf-8').trim();
  } catch {
    return '';
  }
};

/** 读取项目 ref；拿不到返回空串。 */
export const readProjectRef = (root = process.cwd()) => {
  const fromEnv = String(process.env.SUPABASE_PROJECT_REF || '').trim();
  if (fromEnv) return fromEnv;
  const refFile = join(root, 'supabase', '.temp', 'project-ref');
  return existsSync(refFile) ? readFileSync(refFile, 'utf-8').trim() : '';
};

/**
 * 在项目上跑一条 SQL。
 * @param {{ref:string, token:string, query:string, readOnly?:boolean}} opts
 * @returns {Promise<unknown[]>} 行数组
 */
export const runQuery = async ({ ref, token, query, readOnly = true }) => {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: readOnly }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `Management API HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Management API 返回了非数组：${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows;
};
