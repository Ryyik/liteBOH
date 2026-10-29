import { describe, expect, it, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { squeezeSource } from '../helpers/source.js';
import { buildNsfwModelAssets } from '../../scripts/build-nsfw-model-assets.mjs';

/**
 * 自托管二进制模型资产（2026-10-29）
 *
 * 锁的是三件事，缺一条这个改造就是白做：
 *   ① **产物结构**：model.json 的 weightsManifest 必须指向 .bin（tf 按 model.json 所在目录
 *      解析 paths，名字对不上就是 404 → 静默退回慢路径）；
 *   ② **字节一致**：.bin 必须等于包内那串 base64 的解码结果 —— 这是「换加载方式不换精度」
 *      的唯一硬证据（浏览器实测两条路径的 5 个概率逐位相同，见 scripts 注释）；
 *   ③ **接线**：build / build:ci / predev 都必须跑生成脚本。漏了 build:ci 的后果是
 *      线上产物里根本没有这个目录 ⇒ 永久退回 3.49MB JS 解析路径（不报错、只是慢）。
 *
 * 反证方式（改一处必红）：
 *   · 把 weightsManifest 的 paths 改回 ['group1-shard1of1'] ⇒ ① 红；
 *   · 生成时改用 `base64.slice(0, -4)` 解码 ⇒ ② 红；
 *   · 从 build:ci 里删掉 `npm run nsfw:assets` ⇒ ③ 红。
 */

const ROOT = resolve(__dirname, '../..');
const PKG_MODEL_DIR = join(ROOT, 'node_modules/nsfwjs/dist/models/mobilenet_v2');
const WEIGHT_FILE = 'group1-shard1of1.bin';

const tempDirs = [];
const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'boh-nsfw-asset-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败：临时目录 */
    }
  }
});

// 独立解码包内 base64（不复用脚本实现），作为「字节一致」的对照真值
const readPackageWeightBytes = () => {
  const file = join(PKG_MODEL_DIR, 'group1-shard1of1.min.js');
  const sandbox = { window: {}, self: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file, timeout: 20000 });
  const base64 = sandbox.window.group1_shard1of1;
  expect(typeof base64).toBe('string');
  return Buffer.from(base64, 'base64');
};

describe('NSFW 自托管二进制资产', () => {
  it('生成 model.json + .bin，且 weightsManifest 指向 .bin', () => {
    const outDir = makeTempDir();
    buildNsfwModelAssets({ outDir });

    const modelJsonPath = join(outDir, 'model.json');
    const weightsPath = join(outDir, WEIGHT_FILE);
    expect(existsSync(modelJsonPath)).toBe(true);
    expect(existsSync(weightsPath)).toBe(true);

    const model = JSON.parse(readFileSync(modelJsonPath, 'utf8'));
    expect(model.modelTopology).toBeTruthy();
    expect(model.weightsManifest).toHaveLength(1);
    // tf 用 `new URL(path, model.json 的 URL)` 取权重：paths 里写成不带扩展名的
    // 'group1-shard1of1'（包内 UMD 的原样）会 404。
    expect(model.weightsManifest[0].paths).toEqual([WEIGHT_FILE]);
    expect(Array.isArray(model.weightsManifest[0].weights)).toBe(true);
    expect(model.weightsManifest[0].weights.length).toBeGreaterThan(100);
  });

  it('.bin 与包内 base64 解码结果字节一致（换加载方式不换精度）', () => {
    const outDir = makeTempDir();
    buildNsfwModelAssets({ outDir });

    const generated = readFileSync(join(outDir, WEIGHT_FILE));
    const expected = readPackageWeightBytes();

    expect(generated.length).toBe(expected.length);
    expect(generated.equals(expected)).toBe(true);
    // 体积下限：权重是 2.5MB 级；掉到 KB 级说明读到的是空串/被截断
    expect(generated.length).toBeGreaterThan(2 * 1024 * 1024);
  });

  it('加载器优先走资产 URL，并保留 nsfwjs 内置 JS 包兜底', () => {
    const source = squeezeSource(
      readFileSync(join(ROOT, 'src/utils/forum-image-moderation.js'), 'utf8'),
    );
    // 资产 URL 必须用 document.baseURI 解析（vite base 是 './'，写死 '/models/...' 会在子路径部署 404）
    expect(source).toContain('new URL(NSFW_MODEL_ASSET_PATH, document.baseURI)');
    // 两条路径都必须在：先资产、后 JS 包
    expect(source).toContain('nsfwjs.load(assetUrl)');
    expect(source).toContain('nsfwjs.load(modelName)');
    // 兜底只拿剩余预算：不许出现「资产 12s + 兜底 30s」的 42s 形态
    expect(source).toMatch(/Math\.max\(\s*3000\s*,\s*deadline - Date\.now\(\)\s*\)/);
  });

  it('build / build:ci / predev 都接上了生成脚本', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['nsfw:assets']).toBe('node scripts/build-nsfw-model-assets.mjs');
    // 漏 build:ci ⇒ 线上 dist 没有资产目录（不报错，静默退回慢路径）
    expect(pkg.scripts['build:ci']).toContain('npm run nsfw:assets');
    expect(pkg.scripts.build).toContain('npm run nsfw:assets');
    // dev 也要有：否则本地起服务后 404，排查时误以为加载器坏了
    expect(pkg.scripts.predev).toContain('nsfw:assets');
  });

  it('资产目录是生成物，不入库', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toContain('public/models/');
  });

  it('生成物落盘尺寸与包版本登记在 meta 里（供升级排错）', () => {
    const outDir = makeTempDir();
    buildNsfwModelAssets({ outDir });
    const meta = JSON.parse(readFileSync(join(outDir, 'manifest.meta.json'), 'utf8'));
    const pkgVersion = JSON.parse(
      readFileSync(join(ROOT, 'node_modules/nsfwjs/package.json'), 'utf8'),
    ).version;
    expect(meta.source).toBe(`nsfwjs@${pkgVersion}`);
    expect(meta.weightsBytes).toBe(statSync(join(outDir, WEIGHT_FILE)).size);
  });
});
