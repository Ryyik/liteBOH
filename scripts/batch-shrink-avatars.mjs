#!/usr/bin/env node
/**
 * 存量头像批处理：Supabase Storage 上的大 PNG 头像 → 512px webp 小档，并回写 profiles.avatar_url。
 *
 * 起因：docs/2026-09-29-加载速度与提速全面评测报告.md §4.1 —— 17 张 Supabase 托管头像
 * avg 315KB / max 508KB，展示只有 32-48px；2026-10-05 复测 `/` 冷首访传输 619KB 里
 * 头像占 603KB（97%）。服务端变换两条路均不可用（storage render 403 未开通、
 * Cloudinary fetch 401 域名不在白名单），故走「上传端小档」：未来上传经
 * prepareAvatarUpload（utils/api/avatar-storage.js 唯一真源），存量用本脚本一次性搬迁。
 *
 * 安全边界（写线上数据，用户 2026-10-05 已确认执行）：
 *   · 默认 dry-run，只打印计划；加 `--apply` 才真正上传 + 回写
 *   · **不删除原文件**（回滚 = 用映射表里的 oldUrl PATCH 回去）
 *   · 逐张校验新 URL 200 且字节小于原图后才回写；单张失败不影响其余
 *   · 映射表落 output/avatar-migration-<ts>.json（gitignored）
 *
 * 用法：
 *   node scripts/batch-shrink-avatars.mjs            # dry-run
 *   node scripts/batch-shrink-avatars.mjs --apply    # 真正执行
 *   node scripts/batch-shrink-avatars.mjs --rollback output/avatar-migration-xxx.json
 *
 * 凭据：Management API token 在钥匙串（同 AGENTS.md §4 约定），service_role 经
 * /v1/projects/{ref}/api-keys 现取现用，不落盘、不进 .env。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT_REF = 'nplnlefdwfgtyimfkyih';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const AVATAR_MAX_DIM = 512; // 与 prepareAvatarUpload 的 AVATAR_UPLOAD_MAX_DIM 同档
const WEBP_QUALITY = 85;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const rollbackIdx = args.indexOf('--rollback');
const ROLLBACK_FILE = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;

function getManagementToken() {
  const raw = execSync('security find-generic-password -s "Supabase CLI" -a supabase -w', {
    encoding: 'utf8',
  }).trim();
  const b64 = raw.replace(/^go-keyring-base64:/, '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

async function getServiceRoleKey() {
  const token = getManagementToken();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`api-keys ${res.status}`);
  const keys = await res.json();
  const key = keys.find((k) => k.id === 'service_role' || k.name === 'service_role');
  if (!key) throw new Error('service_role key not found');
  return key.api_key;
}

function isShrinkableAvatarUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.hostname !== `${PROJECT_REF}.supabase.co`) return false;
    if (!u.pathname.startsWith('/storage/v1/object/public/avatars/')) return false;
    return !/\.webp$/i.test(u.pathname); // 已是小档的跳过
  } catch {
    return false;
  }
}

async function main() {
  const serviceKey = await getServiceRoleKey();
  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  // 回滚模式：按映射表把 avatar_url PATCH 回 oldUrl
  if (ROLLBACK_FILE) {
    const mapping = JSON.parse(fs.readFileSync(ROLLBACK_FILE, 'utf8'));
    for (const row of mapping.filter((r) => r.applied)) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${row.uid}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ avatar_url: row.oldUrl }),
      });
      console.log(`rollback ${row.uid} → ${res.status}`);
    }
    return;
  }

  const listRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,avatar_url&avatar_url=not.is.null&limit=2000`,
    { headers: authHeaders },
  );
  if (!listRes.ok) throw new Error(`list profiles ${listRes.status}`);
  const profiles = await listRes.json();
  const targets = profiles.filter((p) => isShrinkableAvatarUrl(p.avatar_url));
  console.log(
    `profiles 有头像 ${profiles.length} 个，待搬迁 ${targets.length} 个（apply=${APPLY}）`,
  );

  const mapping = [];
  let savedBytes = 0;

  for (const [i, p] of targets.entries()) {
    const oldUrl = p.avatar_url;
    try {
      const imgRes = await fetch(oldUrl);
      if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
      const original = Buffer.from(await imgRes.arrayBuffer());

      const webp = await sharp(original)
        .resize(AVATAR_MAX_DIM, AVATAR_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const ts = Date.now();
      const storagePath = `${p.id}/avatar_${ts}.webp`;
      const newUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${storagePath}?t=${ts}`;

      if (!APPLY) {
        console.log(
          `[dry-run ${i + 1}/${targets.length}] ${p.id} ${original.length}B → ${webp.length}B`,
        );
        mapping.push({
          uid: p.id,
          oldUrl,
          newUrl,
          oldBytes: original.length,
          newBytes: webp.length,
          applied: false,
        });
        savedBytes += original.length - webp.length;
        continue;
      }

      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${storagePath}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'image/webp',
          'Cache-Control': '3600',
          'x-upsert': 'true',
        },
        body: webp,
      });
      if (!upRes.ok) throw new Error(`upload ${upRes.status} ${await upRes.text()}`);

      // 逐张校验：新 URL 必须可达且确实更小
      const verifyRes = await fetch(newUrl);
      const verifyBytes = Number(verifyRes.headers.get('content-length') || 0);
      if (!verifyRes.ok || (verifyBytes > 0 && verifyBytes >= original.length)) {
        throw new Error(`verify failed status=${verifyRes.status} bytes=${verifyBytes}`);
      }

      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ avatar_url: newUrl }),
      });
      if (!patchRes.ok) throw new Error(`patch ${patchRes.status}`);

      console.log(`[ok ${i + 1}/${targets.length}] ${p.id} ${original.length}B → ${webp.length}B`);
      mapping.push({
        uid: p.id,
        oldUrl,
        newUrl,
        oldBytes: original.length,
        newBytes: webp.length,
        applied: true,
      });
      savedBytes += original.length - webp.length;
    } catch (error) {
      console.error(`[fail ${i + 1}/${targets.length}] ${p.id}: ${error.message}`);
      mapping.push({ uid: p.id, oldUrl, newUrl: null, error: error.message, applied: false });
    }
  }

  const outDir = path.join(ROOT, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `avatar-migration-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(mapping, null, 2));

  const okCount = mapping.filter((m) => m.applied || (!APPLY && !m.error)).length;
  console.log(
    `\n完成：成功/计划 ${okCount}/${targets.length}，省 ${Math.round(savedBytes / 1024)}KB`,
  );
  console.log(`映射表（回滚用）：${outFile}`);
  if (!APPLY) console.log('这是 dry-run。确认无误后加 --apply 执行。');
}

main().catch((error) => {
  console.error('批处理失败:', error);
  process.exit(1);
});
