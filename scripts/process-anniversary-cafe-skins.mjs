import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const sourceDir = path.resolve('src/assets/images/Skin')
const outputDir = path.resolve('src/assets/images/anniversary-cafe/skins')
const skinNames = [
  'ryyik',
  'baiye',
  'chengzi',
  'hamburger',
  'xiaoniu',
  'thoik',
  'teacher-ding',
  'pufferfish',
  'eleven',
  'end',
  'yufuqu',
  'fivege'
]

await mkdir(outputDir, { recursive: true })

for (const name of skinNames) {
  const input = path.join(sourceDir, `${name}.webp`)
  const image = sharp(input)
  const metadata = await image.metadata()
  const width = metadata.width
  const height = metadata.height

  if (!width || !height) throw new Error(`Unable to read skin dimensions: ${input}`)

  const mask = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 100 100">
      <path fill="white" d="M40 14H60V35H40Z"/>
      <path fill="white" d="M41 33H59V60H41Z"/>
      <path fill="white" d="M34 35L42 33V60H34Z"/>
      <path fill="white" d="M58 33L66 35V60H58Z"/>
      <path fill="white" d="M42 58H50V83H42Z"/>
      <path fill="white" d="M50 58H58V83H50Z"/>
    </svg>
  `)

  await sharp(input)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(path.join(outputDir, `${name}-cutout.webp`))
}

console.log(`Processed ${skinNames.length} cafe skins into ${outputDir}`)
