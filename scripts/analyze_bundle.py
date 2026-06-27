#!/usr/bin/env python3
"""
构建产物分析脚本
分析 index-XFFXz8D0.js 包含的模块
"""

import json
import re
import sys
from pathlib import Path

# 读取 stats.html 文件
stats_path = Path.cwd() / 'stats.html'
stats_content = stats_path.read_text(encoding='utf-8')

# 提取 JSON 数据
data_match = re.search(r'const data = ({.*?});', stats_content, re.DOTALL)
if not data_match:
    print('无法找到数据')
    sys.exit(1)

# 解析 JSON 数据
data = json.loads(data_match.group(1))

# 检查数据结构
print(f'数据类型: {type(data).__name__}')
print(f'主要属性: {list(data.keys())}')

# 使用 tree 数据
tree_data = data.get('tree', data)

# 递归查找 chunk
def find_chunk(data, chunk_name):
    if isinstance(data, list):
        for item in data:
            found = find_chunk(item, chunk_name)
            if found:
                return found
    elif isinstance(data, dict):
        if 'name' in data and chunk_name in data['name']:
            return data
        if 'groups' in data:
            for group in data['groups']:
                found = find_chunk(group, chunk_name)
                if found:
                    return found
    return None

# 分析 index-XFFXz8D0.js
index_chunk = find_chunk(tree_data, 'index-XFFXz8D0.js')

if not index_chunk:
    print('无法找到 index-XFFXz8D0.js')
    print('尝试查找其他 chunk...')
    # 如果找不到，尝试分析整个数据
    print('\n所有 chunk:')
    def list_chunks(data, depth=0):
        if isinstance(data, list):
            for item in data:
                list_chunks(item, depth)
        elif isinstance(data, dict):
            if 'name' in data:
                size_kb = data.get('size', 'N/A')
                if isinstance(size_kb, (int, float)):
                    size_kb = f'{size_kb / 1024:.2f}'
                print(f"{' ' * depth * 2}{data['name']} ({size_kb} KB)")
                if 'groups' in data:
                    for group in data['groups']:
                        list_chunks(group, depth + 1)
            elif 'groups' in data:
                for group in data['groups']:
                    list_chunks(group, depth)
    list_chunks(tree_data)
    sys.exit(1)

print('\n========================================')
print('index-XFFXz8D0.js 分析结果')
print('========================================\n')

size_kb = index_chunk.get('size', 0) / 1024
gzip_kb = index_chunk.get('gzipSize', 0) / 1024
print(f'文件大小: {size_kb:.2f} KB')
print(f'gzip 大小: {gzip_kb:.2f} KB\n')

# 分析包含的模块
if 'groups' in index_chunk:
    print('包含的模块:\n')

    modules = []

    # 递归收集所有模块
    def collect_modules(group, parent_path=''):
        if 'groups' in group:
            for sub_group in group['groups']:
                collect_modules(sub_group, parent_path + '/' + group.get('name', ''))
        else:
            modules.append({
                'name': group.get('name', ''),
                'size': group.get('size', 0),
                'gzipSize': group.get('gzipSize', 0),
                'path': parent_path
            })

    for group in index_chunk['groups']:
        collect_modules(group)

    # 按大小排序
    modules.sort(key=lambda x: x['size'], reverse=True)

    # 显示前 50 个最大的模块
    print('最大的 50 个模块:\n')
    for i, module in enumerate(modules[:50], 1):
        print(f"{i}. {module['name']}")
        print(f"   大小: {module['size'] / 1024:.2f} KB")
        print(f"   gzip: {module['gzipSize'] / 1024:.2f} KB")
        print(f"   路径: {module['path']}\n")

    # 分析 node_modules 中的模块
    node_modules = [m for m in modules if 'node_modules' in m['name']]
    print('\n========================================')
    print('node_modules 模块分析')
    print('========================================\n')

    print(f'总计: {len(node_modules)} 个模块')
    total_size = sum(m['size'] for m in node_modules) / 1024
    print(f'总大小: {total_size:.2f} KB\n')

    # 按包名分组
    packages = {}
    for module in node_modules:
        match = re.search(r'node_modules/([^/]+)', module['name'])
        if match:
            package_name = match.group(1)
            if package_name not in packages:
                packages[package_name] = {
                    'modules': [],
                    'totalSize': 0,
                    'totalGzipSize': 0
                }
            packages[package_name]['modules'].append(module)
            packages[package_name]['totalSize'] += module['size']
            packages[package_name]['totalGzipSize'] += module['gzipSize']

    # 按总大小排序
    sorted_packages = sorted(packages.items(), key=lambda x: x[1]['totalSize'], reverse=True)

    print('最大的包:\n')
    for i, (package_name, data) in enumerate(sorted_packages[:20], 1):
        print(f"{i}. {package_name}")
        print(f"   总大小: {data['totalSize'] / 1024:.2f} KB")
        print(f"   gzip: {data['totalGzipSize'] / 1024:.2f} KB")
        print(f"   模块数: {len(data['modules'])}\n")

    # 分析本地模块
    local_modules = [m for m in modules if 'node_modules' not in m['name']]
    print('\n========================================')
    print('本地模块分析')
    print('========================================\n')

    print(f'总计: {len(local_modules)} 个模块')
    total_local_size = sum(m['size'] for m in local_modules) / 1024
    print(f'总大小: {total_local_size:.2f} KB\n')

    # 按大小排序
    local_modules.sort(key=lambda x: x['size'], reverse=True)

    print('最大的本地模块:\n')
    for i, module in enumerate(local_modules[:20], 1):
        print(f"{i}. {module['name']}")
        print(f"   大小: {module['size'] / 1024:.2f} KB")
        print(f"   gzip: {module['gzipSize'] / 1024:.2f} KB\n")