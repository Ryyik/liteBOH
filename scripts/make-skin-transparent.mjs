// 将 Skin 目录下的 _style 立绘去白底，输出透明 webp
// 算法：从图片边界做泛洪填充（flood fill），只移除与边界连通的近白背景，
// 衣服内部的白色高亮不与边界连通，保持不透明。
// 输出：src/assets/images/Skin/transparent/<原名>.webp（train 子目录结构保持）
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const sourceRoot = path.resolve('src/assets/images/Skin')
const outputRoot = path.resolve('src/assets/images/Skin/transparent')

// 近白背景判定：三通道均 >= BG_MIN 且通道差 <= SPREAD_MAX（排除彩色高光）
const BG_MIN = 250
const SPREAD_MAX = 8
// 边缘羽化：与背景相邻的像素按"着色度"计算部分透明
const FEATHER_TINT_RANGE = 12

const collectImages = async (dir, prefix = '') => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'transparent') continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...await collectImages(path.join(dir, entry.name), rel))
    } else if (/\.webp$/i.test(entry.name)) {
      files.push(rel)
    }
  }
  return files
}

const removeWhiteMatte = async (inputFile, outputFile) => {
  const image = sharp(inputFile).ensureAlpha()
  const { width, height } = await image.metadata()
  const { data } = await image.raw().toBuffer({ resolveWithObject: true })

  const total = width * height
  const isBg = new Uint8Array(total)
  const stack = []

  const isBgCandidate = (i) => {
    const o = i * 4
    const r = data[o]
    const g = data[o + 1]
    const b = data[o + 2]
    const min = Math.min(r, g, b)
    return min >= BG_MIN && (Math.max(r, g, b) - min) <= SPREAD_MAX
  }

  // 种子：四条边
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const i = y * width + x
      if (!isBg[i] && isBgCandidate(i)) { isBg[i] = 1; stack.push(i) }
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const i = y * width + x
      if (!isBg[i] && isBgCandidate(i)) { isBg[i] = 1; stack.push(i) }
    }
  }

  // 4 连通泛洪
  while (stack.length) {
    const i = stack.pop()
    const x = i % width
    const y = (i - x) / width
    const neighbors = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1
    ]
    for (const n of neighbors) {
      if (n >= 0 && !isBg[n] && isBgCandidate(n)) { isBg[n] = 1; stack.push(n) }
    }
  }

  // 写入 alpha：背景全透明；与背景相邻的边缘像素按着色度做羽化
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const o = i * 4
      if (isBg[i]) {
        data[o + 3] = 0
        continue
      }
      const touchesBg = (x > 0 && isBg[i - 1])
        || (x < width - 1 && isBg[i + 1])
        || (y > 0 && isBg[i - width])
        || (y < height - 1 && isBg[i + width])
      if (!touchesBg) continue

      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      const tint = 255 - Math.min(r, g, b)
      const alpha = Math.max(0, Math.min(255, Math.round(tint * 255 / FEATHER_TINT_RANGE)))
      if (alpha >= 255) continue
      data[o + 3] = alpha
      if (alpha > 0) {
        // 反白混合：c_orig = 255 - (255 - c_out) / a
        const a = alpha / 255
        data[o] = Math.round(255 - (255 - r) / a)
        data[o + 1] = Math.round(255 - (255 - g) / a)
        data[o + 2] = Math.round(255 - (255 - b) / a)
      }
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(outputFile)
}

const files = await collectImages(sourceRoot)
console.log(`processing ${files.length} images -> ${outputRoot}`)

await mkdir(outputRoot, { recursive: true })
for (const rel of files) {
  const input = path.join(sourceRoot, rel)
  const output = path.join(outputRoot, rel)
  await mkdir(path.dirname(output), { recursive: true })
  await removeWhiteMatte(input, output)
  console.log(`  ok ${rel}`)
}
console.log('done')
