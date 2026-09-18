#!/usr/bin/env node
/**
 * 生成 Web Push 的 VAPID 密钥对（一次性操作，生成后长期不变）。
 *
 * ⚠️ 输出格式必须与 @negrel/webpush 的 `ExportedVapidKeys` 完全同构，
 *    否则 supabase/functions/push-send 里的 importVapidKeys 会直接抛错：
 *        { publicKey: JsonWebKey, privateKey: JsonWebKey }
 *
 * ⚠️ 两个刻意的「不写」：
 *    1. 不输出 ext / key_ops —— webpush 内部 importKey 时对公钥固定传
 *       extractable=true、usages=["verify"]，JWK 里若带 ext:false 或
 *       key_ops:["sign"] 会直接抛 InvalidAccessError / DataError。
 *       去掉这两个字段让它在 Node / Deno 两边都能导入。
 *    2. applicationServerKey 是派生的（base64url(0x04||x||y)），不单独存第二份 ——
 *       前端也不硬编码它，而是由 push-send 的 action=config 运行时下发。
 *       所以密钥轮换只需要改一个 secret，前端不用重新部署。
 *
 * 用法：
 *   node scripts/generate-vapid-keys.mjs              # 打印到终端
 *   node scripts/generate-vapid-keys.mjs --out /tmp/vapid.json
 */

import { writeFileSync } from 'node:fs';

const base64Url = (bytes) => Buffer.from(bytes)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const normalizeJwk = (jwk, { includePrivate }) => {
  const out = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  if (includePrivate) out.d = jwk.d;
  return out;
};

const main = async () => {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : '';

  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const [publicJwk, privateJwk, rawPublic] = await Promise.all([
    globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey),
    globalThis.crypto.subtle.exportKey('jwk', keyPair.privateKey),
    globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  ]);

  const exported = {
    publicKey: normalizeJwk(publicJwk, { includePrivate: false }),
    privateKey: normalizeJwk(privateJwk, { includePrivate: true }),
  };

  // 与 webpush.exportApplicationServerKey 等价：raw 公钥就是 0x04 || x || y
  const applicationServerKey = base64Url(new Uint8Array(rawPublic));

  const serialized = JSON.stringify(exported);

  console.log('=== VAPID_KEYS_JSON（单行，直接喂给 secret）===\n');
  console.log(serialized);
  console.log('\n=== applicationServerKey（前端 subscribe 用；正常情况下不用手抄）===\n');
  console.log(applicationServerKey);
  console.log('\n=== 部署命令 ===\n');
  console.log('supabase secrets set VAPID_KEYS_JSON=\'' + serialized + '\'');
  console.log('supabase secrets set VAPID_SUBJECT=\'mailto:你的邮箱@example.com\'');
  console.log('\n⚠️ 密钥一旦上线就不要再改：改了会让所有已订阅设备失效（需要用户重新开启通知）。');

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(exported, null, 2) + '\n', 'utf8');
    console.log(`\n已写入 ${outPath}`);
  }
};

main().catch((error) => {
  console.error('生成失败：', error);
  process.exit(1);
});
