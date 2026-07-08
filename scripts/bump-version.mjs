#!/usr/bin/env node
// ============================================
// 版本号控制脚本（单一数据源管理）
// 用法：
//   node scripts/bump-version.mjs                # 查看当前版本
//   node scripts/bump-version.mjs patch          # 4.7.2 -> 4.7.3
//   node scripts/bump-version.mjs minor          # 4.7.2 -> 4.8.0
//   node scripts/bump-version.mjs major          # 4.7.2 -> 5.0.0
//   node scripts/bump-version.mjs 4.8.1          # 直接指定版本
//
// 同步更新的文件：
//   1. VERSION               （语义版本单一源，构建时由 vite.config.js 读取）
//   2. package.json          （version 字段）
//   3. PROJECT_MANUAL.md     （适用版本行）
//
// 注意：此脚本仅修改版本号，不执行 git 操作，也不触发构建。
// 修改后请手动执行 npm run build 验证，再提交。
// ============================================

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VERSION_FILE = resolve(ROOT, 'VERSION');
const PACKAGE_FILE = resolve(ROOT, 'package.json');
const MANUAL_FILE = resolve(ROOT, 'PROJECT_MANUAL.md');

// ============================================
// 工具函数
// ============================================

const readVersionFile = () => readFileSync(VERSION_FILE, 'utf8').trim();

const writeVersionFile = (version) => writeFileSync(VERSION_FILE, `${version}\n`);

const readPackageJson = () => JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));

const writePackageJson = (pkg) =>
  writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 2) + '\n');

// 解析语义版本号 x.y.z
const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`版本号格式错误，应为 x.y.z，实际为: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    perpatch: parseInt(match[3], 10), // 避免与 patch 关键字冲突
  };
};

// 按规则递增版本号
const bumpVersion = (current, level) => {
  const { major, minor, perpatch } = parseVersion(current);
  switch (level) {
    case 'patch':
      return `${major}.${minor}.${perpatch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      throw new Error(`未知的递增级别: ${level}，应为 patch/minor/major`);
  }
};

// 更新 PROJECT_MANUAL.md 中的"适用版本"行
const updateManual = (version) => {
  let content = readFileSync(MANUAL_FILE, 'utf8');
  const before = content;
  // 匹配 "> **适用版本**: BOH Beta x.y.z"
  content = content.replace(
    /^> \*\*适用版本\*\*: BOH Beta \d+\.\d+\.\d+/m,
    `> **适用版本**: BOH Beta ${version}`
  );
  if (content === before) {
    console.warn(`[bump-version] 警告：未在 PROJECT_MANUAL.md 中匹配到"适用版本"行，请手动检查`);
    return false;
  }
  writeFileSync(MANUAL_FILE, content);
  return true;
};

// ============================================
// 主流程
// ============================================

const args = process.argv.slice(2);
const currentVersion = readVersionFile();

// 无参数：仅查看当前版本
if (args.length === 0) {
  console.log(`当前版本: ${currentVersion}`);
  console.log('');
  console.log('用法:');
  console.log('  node scripts/bump-version.mjs patch   # 补丁版本 +1');
  console.log('  node scripts/bump-version.mjs minor   # 次版本 +1');
  console.log('  node scripts/bump-version.mjs major   # 主版本 +1');
  console.log('  node scripts/bump-version.mjs 4.8.1   # 直接指定版本');
  process.exit(0);
}

const input = args[0];
let newVersion;

if (/^patch|minor|major$/.test(input)) {
  // 按规则递增
  newVersion = bumpVersion(currentVersion, input);
} else if (/^\d+\.\d+\.\d+$/.test(input)) {
  // 直接指定版本
  newVersion = input;
  if (newVersion === currentVersion) {
    console.error(`[bump-version] 错误：新版本号与当前版本号相同 (${currentVersion})`);
    process.exit(1);
  }
  // 校验新版本不小于当前版本（避免回退）
  const current = parseVersion(currentVersion);
  const next = parseVersion(newVersion);
  const currentNum = current.major * 10000 + current.minor * 100 + current.perpatch;
  const nextNum = next.major * 10000 + next.minor * 100 + next.perpatch;
  if (nextNum < currentNum) {
    console.error(`[bump-version] 错误：新版本 ${newVersion} 小于当前版本 ${currentVersion}，不允许回退`);
    process.exit(1);
  }
} else {
  console.error(`[bump-version] 错误：无效参数 "${input}"`);
  console.error('应为 patch / minor / major，或 x.y.z 格式的版本号');
  process.exit(1);
}

// 执行更新
console.log(`[bump-version] ${currentVersion} -> ${newVersion}`);

// 1. VERSION 文件
writeVersionFile(newVersion);
console.log(`  ✓ VERSION`);

// 2. package.json
const pkg = readPackageJson();
pkg.version = newVersion;
writePackageJson(pkg);
console.log(`  ✓ package.json`);

// 3. PROJECT_MANUAL.md
const manualUpdated = updateManual(newVersion);
if (manualUpdated) {
  console.log(`  ✓ PROJECT_MANUAL.md`);
}

console.log('');
console.log('版本号已更新。后续步骤：');
console.log('  1. npm run build      # 验证构建');
console.log('  2. npm test           # 验证测试');
console.log('  3. git add VERSION package.json PROJECT_MANUAL.md && git commit -m "chore: bump version to ' + newVersion + '"');
