/**
 * 生成 PWA / TWA(Android APK) / iOS 所需的全部应用图标。
 *
 * 为什么需要专门生成，而不是直接把 public/favicon.png 塞进 manifest：
 * 1. favicon.png 是 1024×1024 白底方图，图形本体只占中间一块（且竖向偏高）。
 *    manifest 里把它声明成 192x192 / 512x512 属于**谎报尺寸**，Android 桌面图标会发虚。
 * 2. maskable 图标会被系统按圆形/圆角矩形裁切，可视区域只有画布中心约 66%。
 *    直接把方图交给 maskable，苹果的梗和底部会被切掉。必须先 trim 再缩进安全区。
 * 3. Android 通知委托（TWA notification delegation）需要 monochrome 单色剪影，
 *    否则通知里会出现一块彩色方块。
 *
 * 用法：node scripts/generate-app-icons.mjs
 * 输出：public/icons/*.png（幂等，可重复执行）
 */

import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'public/favicon.png');
const OUT_DIR = resolve(ROOT, 'public/icons');

/** any 图标：内容占画布比例。图标本体天然带内边距，这里只做轻微收边。 */
const ANY_CONTENT_RATIO = 0.86;
/**
 * maskable 图标：内容必须落在中心安全圆内。
 * 视觉上 Android 自适应图标的可视区是 66% 直径的圆，但苹果轮廓是圆润的、
 * 四角是空的，所以按最长边 72% 放（最远不透明像素仍 < 80% 直径圆的半径），
 * 既塞得下又不显得空。写成 66% 会让图标在桌面上明显偏小。
 */
const MASKABLE_CONTENT_RATIO = 0.72;
/** 图标底板色：与 manifest background_color / 启动屏保持一致，避免冷启动闪色。 */
const BACKDROP = { r: 255, g: 255, b: 255, alpha: 1 };
/**
 * 源图是**透明底**的像素画（不是白底方图），所以裁边必须按 alpha 走。
 * 传 '#ffffff' 会匹配不上任何像素导致 trim 空转——这是第一版踩到的坑。
 */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * 把源图 trim 掉四周纯色边距，再按目标比例居中合成到方形画布上。
 * @param {sharp.Sharp} trimmed 已 trim 的源图
 * @param {number} size 输出边长
 * @param {number} ratio 内容最长边占画布的比例
 */
async function composeIcon(trimmed, size, ratio) {
  const inner = Math.round(size * ratio);
  const scaled = await trimmed
    .resize(inner, inner, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(scaled).metadata();
  return {
    buffer: await sharp({
      create: { width: size, height: size, channels: 4, background: BACKDROP },
    })
      .composite([{ input: scaled, gravity: 'center' }])
      .png({ compressionLevel: 9 })
      .toBuffer(),
    contentWidth: meta.width,
    contentHeight: meta.height,
  };
}

/**
 * 由源图生成单色剪影（白色图形 + 透明底），供 Android 通知图标使用。
 * 遮罩取源图自己的 alpha：苹果内部有深浅不一的红色，但剪影要的是「实心轮廓」，
 * 用亮度当遮罩会把内部的深红格打成半透明，通知里会变成筛子。
 */
async function buildMonochrome(size) {
  const alpha = await sharp(SOURCE)
    .trim({ background: TRANSPARENT, threshold: 1 })
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .ensureAlpha()
    .extractChannel('alpha')
    .raw()
    .toBuffer();

  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const sourceMeta = await sharp(SOURCE).metadata();
  const trimmedBuffer = await sharp(SOURCE)
    .trim({ background: TRANSPARENT, threshold: 1 })
    .png()
    .toBuffer();
  const trimmedMeta = await sharp(trimmedBuffer).metadata();

  console.log(`源图 ${sourceMeta.width}×${sourceMeta.height} → trim 后 ${trimmedMeta.width}×${trimmedMeta.height}`);

  const targets = [
    { name: 'icon-180.png', size: 180, ratio: ANY_CONTENT_RATIO, note: 'iOS apple-touch-icon' },
    { name: 'icon-192.png', size: 192, ratio: ANY_CONTENT_RATIO, note: 'Android 桌面 (any)' },
    { name: 'icon-512.png', size: 512, ratio: ANY_CONTENT_RATIO, note: 'PWA 安装 (any)' },
    {
      name: 'icon-maskable-512.png',
      size: 512,
      ratio: MASKABLE_CONTENT_RATIO,
      note: 'Android 自适应图标 (maskable)',
    },
  ];

  for (const target of targets) {
    const { buffer, contentWidth, contentHeight } = await composeIcon(
      sharp(trimmedBuffer),
      target.size,
      target.ratio,
    );
    const outPath = resolve(OUT_DIR, target.name);
    await sharp(buffer).toFile(outPath);
    const share = ((Math.max(contentWidth, contentHeight) / target.size) * 100).toFixed(1);
    console.log(
      `✓ ${target.name.padEnd(26)} ${target.size}×${target.size}  内容 ${contentWidth}×${contentHeight} (占 ${share}%)  ${target.note}`,
    );
  }

  const monochrome = await buildMonochrome(512);
  await sharp(monochrome).toFile(resolve(OUT_DIR, 'icon-monochrome-512.png'));
  console.log(`✓ ${'icon-monochrome-512.png'.padEnd(26)} 512×512  白色剪影 + 透明底  Android 通知图标`);

  console.log(`\n输出目录：${OUT_DIR}`);
}

main().catch((err) => {
  console.error('图标生成失败：', err);
  process.exit(1);
});
