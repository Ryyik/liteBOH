#!/usr/bin/env bash
# ============================================================
# Supabase 回归检查自动执行脚本
# 用法:
#   ./scripts/regression/run-regression.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ---- 获取 Supabase 项目信息 ----
echo "==> 正在获取 Supabase 项目信息..."
PROJECT_REF=$(cat "$PROJECT_DIR/supabase/.temp/project-ref" 2>/dev/null || echo "")
if [ -z "$PROJECT_REF" ]; then
  echo "错误: 未找到项目 ref，请先执行 supabase link"
  exit 1
fi

# 获取 access token (从 supabase CLI 配置或环境变量)
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "$ACCESS_TOKEN" ]; then
  # 尝试从 supabase CLI 的 token 文件获取
  TOKEN_FILE="$HOME/.supabase/access-token"
  if [ -f "$TOKEN_FILE" ]; then
    ACCESS_TOKEN="sbp_$(cat "$TOKEN_FILE")"
  fi
fi

if [ -z "$ACCESS_TOKEN" ]; then
  echo "错误: 无法获取 Supabase access token"
  echo "请设置环境变量 SUPABASE_ACCESS_TOKEN 或执行 supabase login"
  exit 1
fi

API_URL="https://api.supabase.com/v1/projects/$PROJECT_REF/sql"

# ---- 辅助函数 ----
run_sql() {
  local label="$1"
  local sql_file="$2"

  echo ""
  echo "============================================================"
  echo "==> $label"
  echo "   文件: $sql_file"
  echo "============================================================"

  if [ ! -f "$sql_file" ]; then
    echo "错误: 文件不存在: $sql_file"
    return 1
  fi

  # 读取 SQL 文件内容
  local sql_content
  sql_content=$(cat "$sql_file")

  # 调用 Management API
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -Rs '{query: .}' <<< "$sql_content")" 2>&1)

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    echo "错误: API 返回 HTTP $http_code"
    echo "$body" | head -20
    return 1
  fi

  # 解析并显示结果
  echo ""
  echo "--- 结果 ---"
  echo "$body" | jq -r '
    if type == "array" then
      (.[0] | keys_unsorted) as $cols |
      ($cols | map(length) | max + 2) as $w |
      "  " + ($cols | map(. + " " * ($w - length)) | join("")),
      "  " + ($cols | map("-" * ($w - 1) + " ") | join("")),
      (.[] | "  " + ($cols | map(.[.] | tostring | . + " " * ($w - length)) | join("")))
    else
      .
    end
  ' 2>/dev/null || echo "$body"

  # 统计失败数
  local fail_count
  fail_count=$(echo "$body" | jq '[.[] | select(.status == "FAIL")] | length' 2>/dev/null || echo "0")
  local warn_count
  warn_count=$(echo "$body" | jq '[.[] | select(.status == "WARN")] | length' 2>/dev/null || echo "0")

  echo ""
  if [ "$fail_count" -gt 0 ]; then
    echo "  失败: $fail_count 项"
  fi
  if [ "$warn_count" -gt 0 ]; then
    echo "  警告: $warn_count 项"
  fi
  if [ "$fail_count" -eq 0 ] && [ "$warn_count" -eq 0 ]; then
    echo "  全部通过!"
  fi
}

# ---- 执行检查 ----
echo ""
echo "=========================================="
echo "  Supabase 回归检查"
echo "  项目: Ryyik's Project ($PROJECT_REF)"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

PASSED=0
FAILED=0

# 1. RPC 函数存在性检查
if run_sql "RPC 函数存在性检查" "$SCRIPT_DIR/rpc-regression-check.sql"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

# 2. 表结构回归检查
if run_sql "表结构回归检查" "$SCRIPT_DIR/table-schema-regression.sql"; then
  PASSED=$((PASSED + 1))
else
  FAILED=$((FAILED + 1))
fi

# ---- 汇总 ----
echo ""
echo "=========================================="
echo "  检查完成: $PASSED 通过, $FAILED 失败"
echo "=========================================="

exit $FAILED