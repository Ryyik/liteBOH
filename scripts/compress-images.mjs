import sharp from 'sharp';
import { readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const assetsDir = join(projectRoot, 'src', 'assets', 'images');

// 超过此大小的文件需要压缩
const SIZE_THRESHOLD_KB = 200;

// 查找所有 webp 图片
const images = globSync('**/*.webp', { cwd: assetsDir, absolute: true });

const largeImages = images
  .map((path) => ({ path, size: statSync(path).size }))
  .filter(({ size }) => size > SIZE_THRESHOLD_KB * 1024)
  .sort((a, b) => b.size - a.size);

console.log(`找到 ${images.length} 张 webp 图片，其中 ${largeImages.length} 张超过 ${SIZE_THRESHOLD_KB}KB\n`);

// 压缩配置：不同尺寸上限的图片用不同策略
const MAX_WIDTHS = [480, 768, 1280, 1920];

const results = [];
let totalSaved = 0;

for (const { path: imgPath, size: origSize } of largeImages) {
  const origKB = (origSize / 1024).toFixed(1);
  const basename = imgPath.replace(assetsDir + '/', '');
  
  try {
    const metadata = await sharp(imgPath).metadata();
    const { width, height } = metadata;
    
    // 确定目标宽度：不超过 1920，且不超过原始宽度
    let targetWidth = Math.min(width, 1920);
    
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
  } catch (err) {
    console.error(`✗ ${basename}: ${err.message}`);
  }
}

console.log(`\n总计节省: ${(totalSaved / 1024).toFixed(1)} KB (${(totalSaved / 1024 / 1024).toFixed(2)} MB)`);