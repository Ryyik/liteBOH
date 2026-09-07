import { chromium } from 'playwright';

// 直测 image-compression.js 的 WebP 输出与文件名归一化（提交改动的核心点之一）
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5173/#/forum', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

const results = await page.evaluate(async () => {
  const mod = await import('/src/utils/image-compression.js');
  const out = [];

  const makePng = (w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3a7bd5';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  // 用例1：PNG → 应输出 .webp / image/webp
  const pngBlob = await makePng(1200, 900);
  const pngFile = new File([pngBlob], 'screenshot.png', { type: 'image/png' });
  const out1 = await mod.compressImageFileToUploadLimit(pngFile);
  out.push({
    case: 'PNG→WebP',
    inName: pngFile.name, inSize: pngFile.size,
    outName: out1.name, outType: out1.type, outSize: out1.size,
    nameOk: /\.webp$/i.test(out1.name),
    typeOk: out1.type === 'image/webp',
    smaller: out1.size < pngFile.size,
  });

  // 用例2：JPEG → 应输出 .webp
  const canvas2 = document.createElement('canvas');
  canvas2.width = 1000; canvas2.height = 700;
  const ctx2 = canvas2.getContext('2d');
  ctx2.fillStyle = '#e74c3c'; ctx2.fillRect(0, 0, 1000, 700);
  const jpegBlob = await new Promise((r) => canvas2.toBlob(r, 'image/jpeg', 0.9));
  const jpegFile = new File([jpegBlob], 'photo.jpg', { type: 'image/jpeg' });
  const out2 = await mod.compressImageFileToUploadLimit(jpegFile);
  out.push({
    case: 'JPEG→WebP',
    inName: jpegFile.name, inSize: jpegFile.size,
    outName: out2.name, outType: out2.type, outSize: out2.size,
    nameOk: /\.webp$/i.test(out2.name),
    typeOk: out2.type === 'image/webp',
    smaller: out2.size < jpegFile.size,
  });

  return out;
});

console.log('=== compressImageFileToUploadLimit WebP 归一化 ===');
for (const r of results) {
  console.log(`${r.case}: ${r.inName}(${(r.inSize/1024).toFixed(0)}KB) → ${r.outName}(${(r.outSize/1024).toFixed(0)}KB) type=${r.outType}`);
  console.log(`  文件名.webp: ${r.nameOk ? '✓' : '✗'}  MIME=image/webp: ${r.typeOk ? '✓' : '✗'}  体积变小: ${r.smaller ? '✓' : '✗'}`);
}
const allOk = results.every(r => r.nameOk && r.typeOk && r.smaller);
console.log('RESULT:', allOk ? 'PASS' : 'FAIL');
await browser.close();
process.exit(allOk ? 0 : 1);
