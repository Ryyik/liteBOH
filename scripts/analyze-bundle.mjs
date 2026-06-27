#!/usr/bin/env node

/**
 * 构建产物分析脚本
 * 分析 index-XFFXz8D0.js 包含的模块
 */

import fs from 'fs';
import path from 'path';

// 读取 stats.html 文件
const statsPath = path.join(process.cwd(), 'stats.html');
const statsContent = fs.readFileSync(statsPath, 'utf-8');

// 提取 JSON 数据
const dataMatch = statsContent.match(/const data = ({.*?});/);
if (!dataMatch) {
  console.error('无法找到数据');
  process.exit(1);
}

// 解析 JSON 数据
const data = JSON.parse(dataMatch[1]);

// 检查数据结构
console.log('数据类型:', typeof data);
console.log('数据结构:', Array.isArray(data) ? 'Array' : 'Object');

// 打印数据的主要属性
if (typeof data === 'object' && !Array.isArray(data)) {
  console.log('主要属性:', Object.keys(data));
  if (data.tree) {
    console.log('tree 类型:', typeof data.tree);
    console.log('tree 结构:', Array.isArray(data.tree) ? 'Array' : 'Object');
    if (Array.isArray(data.tree)) {
      console.log('tree 数量:', data.tree.length);
    } else if (data.tree.name) {
      console.log('tree name:', data.tree.name);
    }
  }
}

// 使用 tree 数据
const treeData = data.tree || data;

// 如果数据是对象，可能需要递归查找
function findChunk(data, chunkName) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findChunk(item, chunkName);
      if (found) return found;
    }
  } else if (data.name && data.name.includes(chunkName)) {
    return data;
  } else if (data.groups) {
    for (const group of data.groups) {
      const found = findChunk(group, chunkName);
      if (found) return found;
    }
  }
  return null;
}

// 分析 index-XFFXz8D0.js
const indexChunk = findChunk(treeData, 'index-XFFXz8D0.js');

if (!indexChunk) {
  console.error('无法找到 index-XFFXz8D0.js');
  console.log('尝试查找其他 chunk...');
  // 如果找不到，尝试分析整个数据
  console.log('\n所有 chunk:');
  function listChunks(data, depth = 0) {
    if (Array.isArray(data)) {
      data.forEach(item => listChunks(item, depth));
    } else if (data.name) {
      const sizeKB = data.size ? (data.size / 1024).toFixed(2) : 'N/A';
      console.log(`${' '.repeat(depth * 2)}${data.name} (${sizeKB} KB)`);
      if (data.groups) {
        data.groups.forEach(group => listChunks(group, depth + 1));
      }
    } else if (data.groups) {
      data.groups.forEach(group => listChunks(group, depth));
    }
  }
  listChunks(treeData);
  process.exit(1);
}

console.log('\n========================================');
console.log('index-XFFXz8D0.js 分析结果');
console.log('========================================\n');

console.log(`文件大小: ${(indexChunk.size / 1024).toFixed(2)} KB`);
console.log(`gzip 大小: ${(indexChunk.gzipSize / 1024).toFixed(2)} KB\n`);

// 分析包含的模块
if (indexChunk.groups) {
  console.log('包含的模块:\n');

  const modules = [];

  // 递归收集所有模块
  function collectModules(group, parentPath = '') {
    if (group.groups) {
      group.groups.forEach(subGroup => {
        collectModules(subGroup, parentPath + '/' + group.name);
      });
    } else {
      modules.push({
        name: group.name,
        size: group.size,
        gzipSize: group.gzipSize,
        path: parentPath
      });
    }
  }

  indexChunk.groups.forEach(group => {
    collectModules(group);
  });

  // 按大小排序
  modules.sort((a, b) => b.size - a.size);

  // 显示前 50 个最大的模块
  console.log('最大的 50 个模块:\n');
  modules.slice(0, 50).forEach((module, index) => {
    console.log(`${index + 1}. ${module.name}`);
    console.log(`   大小: ${(module.size / 1024).toFixed(2)} KB`);
    console.log(`   gzip: ${(module.gzipSize / 1024).toFixed(2)} KB`);
    console.log(`   路径: ${module.path}\n`);
  });

  // 分析 node_modules 中的模块
  const nodeModules = modules.filter(m => m.name.includes('node_modules'));
  console.log('\n========================================');
  console.log('node_modules 模块分析');
  console.log('========================================\n');

  console.log(`总计: ${nodeModules.length} 个模块`);
  console.log(`总大小: ${(nodeModules.reduce((sum, m) => sum + m.size, 0) / 1024).toFixed(2)} KB\n`);

  // 按包名分组
  const packages = {};
  nodeModules.forEach(module => {
    const match = module.name.match(/node_modules\/([^/]+)/);
    if (match) {
      const packageName = match[1];
      if (!packages[packageName]) {
        packages[packageName] = {
          modules: [],
          totalSize: 0,
          totalGzipSize: 0
        };
      }
      packages[packageName].modules.push(module);
      packages[packageName].totalSize += module.size;
      packages[packageName].totalGzipSize += module.gzipSize;
    }
  });

  // 按总大小排序
  const sortedPackages = Object.entries(packages)
    .sort((a, b) => b[1].totalSize - a[1].totalSize);

  console.log('最大的包:\n');
  sortedPackages.slice(0, 20).forEach(([packageName, data], index) => {
    console.log(`${index + 1}. ${packageName}`);
    console.log(`   总大小: ${(data.totalSize / 1024).toFixed(2)} KB`);
    console.log(`   gzip: ${(data.totalGzipSize / 1024).toFixed(2)} KB`);
    console.log(`   模块数: ${data.modules.length}\n`);
  });

  // 分析本地模块
  const localModules = modules.filter(m => !m.name.includes('node_modules'));
  console.log('\n========================================');
  console.log('本地模块分析');
  console.log('========================================\n');

  console.log(`总计: ${localModules.length} 个模块`);
  console.log(`总大小: ${(localModules.reduce((sum, m) => sum + m.size, 0) / 1024).toFixed(2)} KB\n`);

  // 按大小排序
  localModules.sort((a, b) => b.size - a.size);

  console.log('最大的本地模块:\n');
  localModules.slice(0, 20).forEach((module, index) => {
    console.log(`${index + 1}. ${module.name}`);
    console.log(`   大小: ${(module.size / 1024).toFixed(2)} KB`);
    console.log(`   gzip: ${(module.gzipSize / 1024).toFixed(2)} KB\n`);
  });
}