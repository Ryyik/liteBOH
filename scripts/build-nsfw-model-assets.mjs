#!/usr/bin/env node
/**
 * 生成 NSFW 检测模型的自托管二进制资产（2026-10-29）
 *
 * 为什么需要它
 * ───────────
 * nsfwjs 只以「JS 打包权重」的形态分发：`dist/models/mobilenet_v2/group1-shard1of1.min.js`
 * 是一个 3.49MB 的 UMD 包，权重是**内联 base64 字符串**。浏览器要先下载、再把它当 JS 解析
 * （单行 349 万字符）、再 base64 解码、最后才交给 tf 解码成 tensor —— 这四步全在主线程。
 * 这是「预热会让输入卡顿」与「兜底时模型初始化 30s 超时」的主要成本来源。
 *
 * 本脚本把同一份权重转成 tf 原生的二进制形态：
 *   · model.json  —— 从 model.min.js 导出的 modelTopology + weightsManifest（约 115KB）
 *   · group1-shard1of1.bin —— 由那串 base64 直接解码（2.50MB / gzip 1.99MB）
 * 之后 `nsfwjs.load(<目录 URL>)` 走的是 `tf.loadLayersModel(url)`：权重以 ArrayBuffer
 * 下载，**不经过 JS 解析**，传输体积也比 base64 版本小约 20%。
 *
 * 精度不变（重要）
 * ───────────────
 * 这是**字节级同一份权重**：.bin 就是那个 base64 串解码的结果，model.json 就是同一个
 * topology 对象。tf 解码出的 tensor 与走 JS 包时完全一致 ⇒ 判定结果一格不变。
 * 变的只有加载成本，不是模型本身。
 *
 * 产物是生成物，不入库（见 .gitignore 的 public/models/）；构建链与 dev 前置会自动生成。
 * 生成失败或产物缺失时运行时**自动退回** JS 包路径（forum-image-moderation.js 里的兜底），
 * 所以这个脚本坏掉不会让审核失效，只是慢回去。
 *
 * 用法：node scripts/build-nsfw-model-assets.mjs [--quiet]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_NAME = 'mobilenet_v2';
const SRC_DIR = resolve(ROOT, 'node_modules/nsfwjs/dist/models', MODEL_NAME);
const DEFAULT_OUT_DIR = resolve(ROOT, 'public/models/nsfw', MODEL_NAME);
const WEIGHT_FILE = 'group1-shard1of1.bin';
const quiet = process.argv.includes('--quiet');

const log = (...args) => {
  if (!quiet) console.log('[nsfw-assets]', ...args);
};

// UMD 包在 vm 沙箱里跑一遍拿导出对象：包内用
// `("object"==typeof exports&&"undefined"!=typeof module)?module.exports=e():window.xxx=e()`
// 分支，因此沙箱必须**不提供** module/exports，让它挂到 window 上。
function runUmd(file, globalKey) {
  const code = readFileSync(file, 'utf8');
  const sandbox = { window: {}, self: {}, console: { info() {}, warn() {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file, timeout: 20000 });
  const value = sandbox.window?.[globalKey] ?? sandbox[globalKey];
  if (value == null) throw new Error(`[nsfw-assets] 未能从 ${file} 取到全局 ${globalKey}`);
  return value;
}

/**
 * @param {{ outDir?: string }} [options] 测试用：可指定输出目录，默认写 public/models/nsfw/<模型>
 */
function main(options = {}) {
  const OUT_DIR = options.outDir ? resolve(options.outDir) : DEFAULT_OUT_DIR;
  if (!existsSync(SRC_DIR)) {
    throw new Error(`[nsfw-assets] 找不到 nsfwjs 模型目录：${SRC_DIR}（是不是没装依赖？）`);
  }

  const modelJsonPath = resolve(SRC_DIR, 'model.min.js');
  const weightsPath = resolve(SRC_DIR, 'group1-shard1of1.min.js');

  const model = runUmd(modelJsonPath, 'model');
  if (!model || typeof model !== 'object' || !model.modelTopology) {
    throw new Error('[nsfw-assets] model.min.js 导出结构异常（缺 modelTopology）');
  }

  const base64 = runUmd(weightsPath, 'group1_shard1of1');
  if (typeof base64 !== 'string' || base64.length < 1024) {
    throw new Error('[nsfw-assets] group1-shard1of1.min.js 导出异常（不是 base64 字符串）');
  }
  const bin = Buffer.from(base64, 'base64');
  if (bin.length === 0) throw new Error('[nsfw-assets] 权重 base64 解码得到 0 字节');

  // 权重路径必须与产物同名，否则 tf 会按 model.json 所在目录去取 group1-shard1of1（无扩展名）
  const manifest = Array.isArray(model.weightsManifest) ? model.weightsManifest : [];
  if (manifest.length !== 1) {
    throw new Error(`[nsfw-assets] 预期 1 个权重分片，实际 ${manifest.length}（模型换了？）`);
  }
  const out = {
    modelTopology: model.modelTopology,
    weightsManifest: [{ ...manifest[0], paths: [WEIGHT_FILE] }],
  };
  const jsonText = JSON.stringify(out);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, WEIGHT_FILE), bin);
  writeFileSync(resolve(OUT_DIR, 'model.json'), jsonText);

  const pkgVersion = JSON.parse(
    readFileSync(resolve(ROOT, 'node_modules/nsfwjs/package.json'), 'utf8'),
  ).version;
  writeFileSync(
    resolve(OUT_DIR, 'manifest.meta.json'),
    `${JSON.stringify(
      {
        // 仅供排错/守卫读取：来源包版本 + 产物尺寸。运行时不需要它。
        source: `nsfwjs@${pkgVersion}`,
        modelName: MODEL_NAME,
        weightsFile: WEIGHT_FILE,
        weightsBytes: bin.length,
        weightsGzipBytes: zlib.gzipSync(bin, { level: 6 }).length,
        modelJsonBytes: Buffer.byteLength(jsonText),
      },
      null,
      2,
    )}\n`,
  );

  log(
    `已生成 ${OUT_DIR.replace(`${ROOT}/`, '')}：` +
      `model.json ${(Buffer.byteLength(jsonText) / 1024).toFixed(0)}KB，` +
      `权重 ${(bin.length / 1048576).toFixed(2)}MB（gzip ${(zlib.gzipSync(bin, { level: 6 }).length / 1048576).toFixed(2)}MB）`,
  );

  return { outDir: OUT_DIR, bytes: bin.length, jsonBytes: Buffer.byteLength(jsonText) };
}

// 供单元测试与其它脚本 import；命令行直接跑时输出结果。
export { main as buildNsfwModelAssets };

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  }
}
