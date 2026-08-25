import sharp from 'sharp';
import { statSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const assetsDir = join(projectRoot, 'src', 'assets', 'images');

// 超过此大小的文件需要压缩
const SIZE_THRESHOLD_KB = 50;

// 幂等守卫：记录已处理文件（相对路径 + mtimeMs + size），避免每次构建都对
// 同一批 >50KB 的图反复有损重压（webp 多次重编码会代际劣化画质）。
// 只有新增/变更过的图才会被压缩；已处理且未变更的跳过。
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

const fileKey = (absPath) => join('src', 'assets', 'images', absPath.replace(assetsDir + '/', ''));
// 用文件大小作为幂等签名：可跨机器/CI 移植（mtime 不可移植）。
// 压缩后文件大小变化并写入清单；下次构建若大小一致则跳过，避免反复有损重压。
// 极小概率误判（不同图恰好同尺寸）只会导致该次跳过，无正确性问题。
const fileSignature = (absPath) => String(statSync(absPath).size);

const manifest = readManifest();

// 查找所有 webp 图片
const images = globSync('**/*.webp', { cwd: assetsDir, absolute: true });

const largeImages = images
  .map((path) => ({ path, size: statSync(path).size }))
  .filter(({ size }) => size > SIZE_THRESHOLD_KB * 1024)
  .sort((a, b) => b.size - a.size);

// 仅保留新增/变更过的图（幂等守卫）
const pendingImages = largeImages.filter(({ path }) => {
  const sig = fileSignature(path);
  return manifest[fileKey(path)] !== sig;
});

console.log(`找到 ${images.length} 张 webp 图片，其中 ${largeImages.length} 张超过 ${SIZE_THRESHOLD_KB}KB；本次需处理 ${pendingImages.length} 张（已处理未变更的 ${largeImages.length - pendingImages.length} 张跳过）\n`);

const results = [];
let totalSaved = 0;

for (const { path: imgPath, size: origSize } of pendingImages) {
  const origKB = (origSize / 1024).toFixed(1);
  const basename = imgPath.replace(assetsDir + '/', '');
  
  try {
    const metadata = await sharp(imgPath).metadata();
    const { width, height } = metadata;
    
    // 对于超大分辨率图片（>4K），生成多尺寸版本
    if (width > 2560) {
      // 压缩主文件到 1920 宽
      const compressed = await sharp(imgPath)
        .resize(1920, undefined, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 6 })
        .toBuffer();
      
      writeFileSync(imgPath, compressed);
      const newSize = statSync(imgPath).size;
      const saved = origSize - newSize;
      totalSaved += saved;
      
      results.push({
        file: basename,
        dimensions: `${width}×${height} → 1920×?`,
        before: `${origKB} KB`,
        after: `${(newSize / 1024).toFixed(1)} KB`,
        saved: `${(saved / 1024).toFixed(1)} KB`,
      });
    } else if (width > 1920) {
      // 1920-2560 之间的图片缩放到 1920
      const compressed = await sharp(imgPath)
        .resize(1920, undefined, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 6 })
        .toBuffer();
      
      writeFileSync(imgPath, compressed);
      const newSize = statSync(imgPath).size;
      const saved = origSize - newSize;
      totalSaved += saved;
      
      results.push({
        file: basename,
        dimensions: `${width}×${height} → 1920×?`,
        before: `${origKB} KB`,
        after: `${(newSize / 1024).toFixed(1)} KB`,
        saved: `${(saved / 1024).toFixed(1)} KB`,
      });
    } else {
      // 中等尺寸图片：仅提高压缩率
      const compressed = await sharp(imgPath)
        .webp({ quality: 70, effort: 6 })
        .toBuffer();
      
      writeFileSync(imgPath, compressed);
      const newSize = statSync(imgPath).size;
      const saved = origSize - newSize;
      totalSaved += saved;
      
      results.push({
        file: basename,
        dimensions: `${width}×${height}`,
        before: `${origKB} KB`,
        after: `${(newSize / 1024).toFixed(1)} KB`,
        saved: `${(saved / 1024).toFixed(1)} KB`,
      });
    }
    
    console.log(`✓ ${basename}: ${origKB} KB → ${(statSync(imgPath).size / 1024).toFixed(1)} KB`);
    // 压缩成功后更新清单签名，下次构建跳过（幂等守卫）
    manifest[fileKey(imgPath)] = fileSignature(imgPath);
  } catch (err) {
    console.error(`✗ ${basename}: ${err.message}`);
  }
}

// 清理清单中已不存在的文件条目，避免清单无限膨胀
const knownKeys = new Set(images.map((p) => fileKey(p)));
for (const key of Object.keys(manifest)) {
  if (!knownKeys.has(key)) delete manifest[key];
}
writeManifest(manifest);

console.log(`\n总计节省: ${(totalSaved / 1024).toFixed(1)} KB (${(totalSaved / 1024 / 1024).toFixed(2)} MB)`);
if (pendingImages.length === 0) {
  console.log('本次无新增/变更图片需要压缩（幂等守卫已跳过全部）。');
}