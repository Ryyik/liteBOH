#!/bin/bash

# 消息中心修复验证测试运行脚本

echo "========================================="
echo "消息中心修复验证测试"
echo "========================================="
echo ""

# 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js 环境"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo ""

# 检查项目依赖
if [ ! -d "node_modules" ]; then
    echo "⚠️  未找到 node_modules，正在安装依赖..."
    npm install
fi

# 检查 Vitest
if ! command -v vitest &> /dev/null; then
    echo "⚠️  未找到 Vitest，使用 npm 运行..."
fi

echo "========================================="
echo "开始运行测试..."
echo "========================================="
echo ""

# 运行测试
npm run test:unit notifications-fix-validation.test.js

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
echo ""

# 提示用户
echo "💡 提示:"
echo "  - 如果测试失败，请检查 mock 数据和测试配置"
echo "  - 可以使用 'npm run test:unit -- --reporter=verbose' 查看详细输出"
echo "  - 可以修改 tests/mock/notifications-mock-data.js 自定义测试数据"
echo ""