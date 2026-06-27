#!/usr/bin/env python3
"""
构建产物分析脚本
分析 index-XFFXz8D0.js 包含的模块
"""

import sys
import re
from pathlib import Path
from collections import defaultdict

# 读取 YAML 格式的文件
yaml_path = Path('/tmp/bundle-analysis.json')
yaml_content = yaml_path.read_text(encoding='utf-8')

# 解析 YAML 格式（简单的行解析）
chunks = {}
current_chunk = None
current_module = None

for line in yaml_content.split('\n'):
    # 检测 chunk 名称
    if line and not line.startswith(' ') and ':' in line and not line.startswith('/'):
        chunk_name = line.split(':')[0].strip()
        current_chunk = chunk_name
        chunks[current_chunk] = {}
    # 检测模块名称
    elif line.startswith('  /') and ':' in line:
        module_name = line.split(':')[0].strip()
        current_module = module_name
        chunks[current_chunk][current_module] = {}
    # 检测大小信息
    elif line.startswith('    ') and ':' in line:
        key_value = line.strip().split(':')
        key = key_value[0].strip()
        value = int(key_value[1].strip())
        if current_chunk and current_module:
            chunks[current_chunk][current_module][key] = value

# 分析 index-XFFXz8D0.js
index_chunk_name = 'static/js/index-XFFXz8D0.js'
if index_chunk_name not in chunks:
    print(f'无法找到 {index_chunk_name}')
    print('可用的 chunk:')
    for chunk_name in sorted(chunks.keys()):
        modules_count = len(chunks[chunk_name])
        total_size = sum(m.get('rendered', 0) for m in chunks[chunk_name].values())
        print(f"  {chunk_name}: {modules_count} modules, {total_size / 1024:.2f} KB")
    sys.exit(1)

print('\n========================================')
print('index-XFFXz8D0.js 分析结果')
print('========================================\n')

index_chunk = chunks[index_chunk_name]
total_size = sum(m.get('rendered', 0) for m in index_chunk.values())
total_gzip = sum(m.get('gzip', 0) for m in index_chunk.values())

print(f'文件大小: {total_size / 1024:.2f} KB')
print(f'gzip 大小: {total_gzip / 1024:.2f} KB')
print(f'模块数量: {len(index_chunk)}\n')

# 按大小排序
modules = []
for module_name, sizes in index_chunk.items():
    modules.append({
        'name': module_name,
        'size': sizes.get('rendered', 0),
        'gzip': sizes.get('gzip', 0),
        'brotli': sizes.get('brotli', 0)
    })

modules.sort(key=lambda x: x['size'], reverse=True)

# 显示前 50 个最大的模块
print('最大的 50 个模块:\n')
for i, module in enumerate(modules[:50], 1):
    print(f"{i}. {module['name']}")
    print(f"   大小: {module['size'] / 1024:.2f} KB")
    print(f"   gzip: {module['gzip'] / 1024:.2f} KB")
    print(f"   brotli: {module['brotli'] / 1024:.2f} KB\n")

# 分析 node_modules 中的模块
node_modules = [m for m in modules if 'node_modules' in m['name']]
print('\n========================================')
print('node_modules 模块分析')
print('========================================\n')

print(f'总计: {len(node_modules)} 个模块')
node_total_size = sum(m['size'] for m in node_modules) / 1024
node_total_gzip = sum(m['gzip'] for m in node_modules) / 1024
print(f'总大小: {node_total_size:.2f} KB')
print(f'总 gzip: {node_total_gzip:.2f} KB\n')

# 按包名分组
packages = defaultdict(lambda: {'modules': [], 'totalSize': 0, 'totalGzip': 0})
for module in node_modules:
    match = re.search(r'/node_modules/([^/]+)', module['name'])
    if match:
        package_name = match.group(1)
        packages[package_name]['modules'].append(module)
        packages[package_name]['totalSize'] += module['size']
        packages[package_name]['totalGzip'] += module['gzip']

# 按总大小排序
sorted_packages = sorted(packages.items(), key=lambda x: x[1]['totalSize'], reverse=True)

print('最大的包:\n')
for i, (package_name, pkg_data) in enumerate(sorted_packages[:20], 1):
    print(f"{i}. {package_name}")
    print(f"   总大小: {pkg_data['totalSize'] / 1024:.2f} KB")
    print(f"   gzip: {pkg_data['totalGzip'] / 1024:.2f} KB")
    print(f"   模块数: {len(pkg_data['modules'])}\n")

# 分析本地模块
local_modules = [m for m in modules if 'node_modules' not in m['name']]
print('\n========================================')
print('本地模块分析')
print('========================================\n')

print(f'总计: {len(local_modules)} 个模块')
local_total_size = sum(m['size'] for m in local_modules) / 1024
local_total_gzip = sum(m['gzip'] for m in local_modules) / 1024
print(f'总大小: {local_total_size:.2f} KB')
print(f'总 gzip: {local_total_gzip:.2f} KB\n')

# 按大小排序
local_modules.sort(key=lambda x: x['size'], reverse=True)

print('最大的本地模块:\n')
for i, module in enumerate(local_modules[:20], 1):
    print(f"{i}. {module['name']}")
    print(f"   大小: {module['size'] / 1024:.2f} KB")
    print(f"   gzip: {module['gzip'] / 1024:.2f} KB\n")