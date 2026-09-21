#!/usr/bin/env node
/**
 * Cloudflare 凭据接入 + 安全响应头下发（一键）
 *
 * 用途：在拿到一个有效的 Cloudflare API Token 后，一次性完成
 *   ① 验证 token 有效性
 *   ② 下发 6 个安全响应头（调用 scripts/cloudflare-security-headers.mjs）
 *   ③ 把 token 写进 GitHub Secret CLOUDFLARE_API_TOKEN（让 CI 也修好）
 *   ④ 抓线上响应头确认真的生效
 *
 * 凭据来源：~/.cloudflare-auto（不进对话、不进仓库）
 *     api_token=<Cloudflare API Token>
 *     zone_id=<Zone ID>
 *
 * 用法：
 *   node scripts/cloudflare-setup.mjs            # 全流程
 *   node scripts/cloudflare-setup.mjs --no-secret # 跳过写 GitHub Secret
 *
 * 为什么不用 wrangler 的 OAuth：其 scope 里 zone 级只有 zone:read，
 * 没有改 zone 配置的写权限 → 下发响应头会 403。
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const HOST = 'www.blockofhome.cn';
const SECRET_NAME = 'CLOUDFLARE_API_TOKEN';
const SKIP_SECRET = process.argv.includes('--no-secret');

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function loadCreds() {
  // 默认 ~/.cloudflare-auto；可用 CF_SETUP_CRED_FILE 指定（便于测试/多账号）
  const path = process.env.CF_SETUP_CRED_FILE || resolve(homedir(), '.cloudflare-auto');
  if (!existsSync(path)) {
    console.error(bad(`❌ 找不到 ${path}`));
    console.error('   请先创建：');
    console.error("   cat > ~/.cloudflare-auto <<'EOF'");
    console.error('   api_token=<你的 Cloudflare API Token>');
    console.error('   zone_id=<你的 Zone ID>');
    console.error('   EOF');
    console.error('   chmod 600 ~/.cloudflare-auto');
    process.exit(2);
  }
  const creds = {};
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    creds[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!creds.api_token || !creds.zone_id) {
    console.error(bad('❌ 文件里缺少 api_token 或 zone_id'));
    process.exit(2);
  }
  return creds;
}

async function cf(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, body };
}

function cfError(body) {
  const errs = body?.errors;
  if (Array.isArray(errs) && errs.length) {
    return errs.map((e) => `[${e.code}] ${e.message}`).join(' / ');
  }
  return JSON.stringify(body)?.slice(0, 200) || '(无详情)';
}

const { api_token, zone_id } = loadCreds();
console.log(dim(`凭据文件已读取：token ${api_token.length} 字符，zone ${zone_id.slice(0, 8)}…`));
console.log();

// ── ① 验证 token ────────────────────────────────────────────────
console.log('① 验证 token 有效性');
const verify = await cf('/user/tokens/verify', api_token);
if (verify.status === 200 && verify.body?.success) {
  console.log(`   ${ok('✅ token 有效')}  状态=${verify.body.result?.status ?? 'active'}`);
} else {
  console.log(`   ${bad('❌ token 无效或不可用')}  HTTP ${verify.status}  ${cfError(verify.body)}`);
  console.log(dim('   → 400/6003/401/10000 多为「值不对或格式不对」；403 才是「值对但权限不足」'));
  process.exit(1);
}

// ── 读 zone（顺带证明 token 至少能访问该 zone）────────────────────
console.log();
console.log('② 读目标 zone');
const zone = await cf(`/zones/${zone_id}`, api_token);
if (zone.status === 200 && zone.body?.success) {
  console.log(`   ${ok('✅')} ${zone.body.result?.name}  (status=${zone.body.result?.status})`);
} else {
  console.log(`   ${bad('❌ 读 zone 失败')}  HTTP ${zone.status}  ${cfError(zone.body)}`);
  console.log(dim('   → zone_id 是否正确？token 的 Zone Resources 是否包含它？'));
  process.exit(1);
}

// ── ③ 下发响应头 ────────────────────────────────────────────────
console.log();
console.log('③ 下发 6 个安全响应头（scripts/cloudflare-security-headers.mjs）');
let headersApplied = false;
try {
  const out = execFileSync('node', [resolve('scripts/cloudflare-security-headers.mjs')], {
    env: { ...process.env, CLOUDFLARE_API_TOKEN: api_token, CLOUDFLARE_ZONE_ID: zone_id },
    encoding: 'utf-8',
  });
  console.log(out.trim().split('\n').map((l) => `   ${l}`).join('\n'));
  headersApplied = /已应用|Applied/.test(out);
} catch (err) {
  console.log(`   ${bad('❌ 下发失败')}`);
  console.log((err.stdout || '').trim().split('\n').map((l) => `   ${l}`).join('\n'));
  console.log((err.stderr || '').trim().split('\n').map((l) => `   ${l}`).join('\n'));
}

// ── ④ 更新 GitHub Secret ────────────────────────────────────────
console.log();
if (SKIP_SECRET) {
  console.log(dim('④ 已跳过写 GitHub Secret（--no-secret）'));
} else {
  console.log('④ 更新 GitHub Secret（让 CI 也修好）');
  try {
    execFileSync('gh', ['secret', 'set', SECRET_NAME, '--body', api_token], { encoding: 'utf-8' });
    console.log(`   ${ok(`✅ 已更新 ${SECRET_NAME}`)}`);
  } catch (err) {
    console.log(`   ${bad('❌ 更新失败')}  ${(err.stderr || err.message || '').trim().slice(0, 200)}`);
    console.log(dim('   → 可手动更新：GitHub → Settings → Secrets and variables → Actions'));
  }
}

// ── ⑤ 抓线上响应头 ──────────────────────────────────────────────
console.log();
console.log('⑤ 抓线上响应头（最终判据）');
const WANT = [
  'content-security-policy-report-only',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'permissions-policy',
  'strict-transport-security',
];
let raw = '';
try {
  raw = execSync(`curl -sI --max-time 20 "https://${HOST}/"`, { encoding: 'utf-8' });
} catch {
  console.log(dim('   curl 失败，稍后可手动复查：curl -sI https://' + HOST + '/'));
}
const lower = raw.toLowerCase();
let hit = 0;
for (const h of WANT) {
  const found = lower.includes(`\n${h}:`);
  if (found) hit += 1;
  console.log(`   ${found ? ok('✅') : bad('❌')} ${h}`);
}
console.log();
console.log(`   ${hit}/${WANT.length} 命中`);
if (hit === 0) {
  console.log(dim('   → 规则下发后边缘缓存可能需要几秒；亦可 curl 加 ?cb=随机数 绕缓存'));
} else if (hit === WANT.length) {
  console.log(`   ${ok('🎉 全部到位')}`);
}

// ③ 明确失败则以非 0 退出（便于将来接入 CI；⑤ 的 0 命中可能只是缓存延迟，不判失败）
if (!headersApplied) {
  console.log();
  console.log(bad('⚠️ 响应头下发未成功 —— 见上方 ③ 的输出'));
  process.exit(1);
}
