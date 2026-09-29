import sharp from 'sharp';
import { statSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// 超过此大小的文件需要压缩
const SIZE_THRESHOLD_KB = 50;

// 压缩目标。src/assets/images 的 webp 是既有口径；public/ 两个目录是 2026-09-29 加进去的 ——
// 加载性能评测报告（docs/2026-09-29-加载速度与提速全面评测报告.md §4.2/§6.4）实测这两处
// 「源字节 = 产物字节」：旧脚本目录写死 src/assets/images、glob 只认 *.webp，永远碰不到 public/，
// 而首屏 52% 的字节（头像框 PNG）正是从 public/avatars/frames 直出的。
//
// ⚠️ 框 PNG 只做「原地缩尺寸、保文件名与格式」：它们的 URL 被数据库 avatar_frames 表和
// src/composables/useAvatarFrame.js 按名字引用，改成 webp = 一次数据迁移，需另行确认。
// 1223px → 256px：实际渲染直径约 60–100px（--frame-scale 最大 2.08 × 头像 48px），2x DPR 仍充足。
const TARGETS = [
  {
    id: 'src/assets/images',
    dir: join(projectRoot, 'src', 'assets', 'images'),
    globs: ['**/*.webp'],
    maxEdge: null,
  },
  {
    id: 'public/avatars/frames',
    dir: join(projectRoot, 'public', 'avatars', 'frames'),
    globs: ['*.png'],
    maxEdge: 256,
  },
  {
    id: 'public/demo-album',
    dir: join(projectRoot, 'public', 'demo-album'),
    globs: ['*.jpg', '*.jpeg'],
    maxEdge: 2000,
  },
];

// 幂等守卫：记录已处理文件（相对路径 + 压缩后大小），避免每次构建都对同一批 >50KB 的图
// 反复有损重压（webp 多次重编码会代际劣化画质）。只有新增/变更过的图才会被压缩。
const MANIFEST_PATH = join(projectRoot, '.compress-images-cache.json');
const readManifest = () => {
  try {
    if (!existsSync(MANIFEST_PATH)) return {};
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
};
const writeManifest = (manifest) => {
  try {
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.warn(`⚠ 写入压缩清单失败（不影响构建）: ${err.message}`);
  }
};

// 清单 key = 相对仓库根的路径。对既有 webp 条目（src/assets/images/x.webp）与旧版
// fileKey 产生的字符串完全一致，历史清单不做废、已处理的图不会被重压一遍。
const fileKey = (absPath) => relative(projectRoot, absPath);
// 用文件大小作为幂等签名：可跨机器/CI 移植（mtime 不可移植）。
// 压缩后文件大小变化并写入清单；下次构建若大小一致则跳过，避免反复有损重压。
// 极小概率误判（不同图恰好同尺寸）只会导致该次跳过，无正确性问题。
const fileSignature = (absPath) => String(statSync(absPath).size);

const manifest = readManifest();

async function compressOne(imgPath, target, ext) {
  const { width = 0, height = 0 } = await sharp(imgPath).metadata();
  const overMaxEdge = target.maxEdge && Math.max(width, height) > target.maxEdge;
  if (ext === '.webp') {
    // 既有口径：宽 >1920 先缩到 1920（q75），其余原尺寸重编码（q70）
    if (width > 1920) {
      return sharp(imgPath)
        .resize(1920, undefined, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 6 })
        .toBuffer();
    }
    return sharp(imgPath).webp({ quality: 70, effort: 6 }).toBuffer();
  }
  let pipe = sharp(imgPath);
  if (overMaxEdge)
    pipe = pipe.resize(target.maxEdge, target.maxEdge, { fit: 'inside', withoutEnlargement: true });
  if (ext === '.png') {
    // palette（libimagequant）对线稿风的框图收益最大，且保留透明通道
    return pipe.png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer();
  }
  return pipe.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

const results = [];
let totalSaved = 0;

for (const target of TARGETS) {
  const images = target.globs.flatMap((g) => globSync(g, { cwd: target.dir, absolute: true }));
  const largeImages = images
    .map((p) => ({ path: p, size: statSync(p).size }))
    .filter(({ size }) => size > SIZE_THRESHOLD_KB * 1024)
    .sort((a, b) => b.size - a.size);
  const pendingImages = largeImages.filter(
    ({ path }) => manifest[fileKey(path)] !== fileSignature(path),
  );

  console.log(
    `[${target.id}] ${images.length} 张，其中 ${largeImages.length} 张超过 ${SIZE_THRESHOLD_KB}KB；本次需处理 ${pendingImages.length} 张（已处理未变更的 ${largeImages.length - pendingImages.length} 张跳过）`,
  );

  for (const { path: imgPath, size: origSize } of pendingImages) {
    const origKB = (origSize / 1024).toFixed(1);
    const basename = relative(target.dir, imgPath);
    const ext = extname(imgPath).toLowerCase();
    try {
      const buf = await compressOne(imgPath, target, ext);
      // 无收益（或反而变大）就不写文件，但仍记入清单 —— 别每次构建都空跑一遍
      if (buf.length >= origSize) {
        manifest[fileKey(imgPath)] = fileSignature(imgPath);
        console.log(`= ${target.id}/${basename}: ${origKB} KB，压缩无收益，保留原图`);
        continue;
      }
      writeFileSync(imgPath, buf);
      const newSize = statSync(imgPath).size;
      totalSaved += origSize - newSize;
      manifest[fileKey(imgPath)] = fileSignature(imgPath);
      results.push({ target: target.id, file: basename, before: origSize, after: newSize });
      console.log(`✓ ${target.id}/${basename}: ${origKB} KB → ${(newSize / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.error(`✗ ${target.id}/${basename}: ${err.message}`);
    }
  }
}

// 清理清单中已不存在的文件条目，避免清单无限膨胀
const knownKeys = new Set(
  TARGETS.flatMap((t) => t.globs.flatMap((g) => globSync(g, { cwd: t.dir, absolute: true }))).map(
    (p) => fileKey(p),
  ),
);
for (const key of Object.keys(manifest)) {
  if (!knownKeys.has(key)) delete manifest[key];
}
writeManifest(manifest);

console.log(
  `\n总计节省: ${(totalSaved / 1024).toFixed(1)} KB (${(totalSaved / 1024 / 1024).toFixed(2)} MB)`,
);
if (results.length === 0) {
  console.log('本次无新增/变更图片需要压缩（幂等守卫已跳过全部）。');
}
