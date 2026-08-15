import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================
// M7 修复验证：points-admin-api.js PostgREST 过滤器注入防护
// 新方案：参数化 .eq()/.ilike() 取代 .or() 表达式拼接，
// sanitizePostgrestQuery 仅负责 ilike 值转义（引号移除 + 通配符转义）
// ============================================================

import { sanitizePostgrestQuery } from '../../src/utils/api/points-admin-api.js'

const sourceCode = readFileSync(
  resolve(import.meta.dirname, '../../src/utils/api/points-admin-api.js'),
  'utf8'
)

describe('M7: PostgREST 过滤器注入防护', () => {
  describe('sanitizePostgrestQuery 单元测试', () => {
    it('移除引号，避免破坏查询串', () => {
      expect(sanitizePostgrestQuery("user's")).toBe('users')
      expect(sanitizePostgrestQuery('"admin"')).toBe('admin')
    })

    it('转义百分号（防止 % 匹配全部用户）', () => {
      expect(sanitizePostgrestQuery('100%')).toBe('100\\%')
    })

    it('转义下划线（防止 _ 单字符通配）', () => {
      expect(sanitizePostgrestQuery('a_b')).toBe('a\\_b')
    })

    it('转义反斜杠（防止破坏转义序列）', () => {
      expect(sanitizePostgrestQuery('a\\b')).toBe('a\\\\b')
    })

    it('保留正常搜索词（含中文）', () => {
      expect(sanitizePostgrestQuery('张三')).toBe('张三')
    })

    it('保留正常搜索词（含字母数字与合法标点）', () => {
      expect(sanitizePostgrestQuery('user123')).toBe('user123')
      expect(sanitizePostgrestQuery('user@host-test')).toBe('user@host-test')
    })

    it('空字符串 / null / undefined 返回空字符串', () => {
      expect(sanitizePostgrestQuery('')).toBe('')
      expect(sanitizePostgrestQuery(null)).toBe('')
      expect(sanitizePostgrestQuery(undefined)).toBe('')
    })

    it('注入尝试无法构造过滤表达式（逗号点括号仅作为字面量搜索词）', () => {
      const malicious = '%),username.eq.admin--'
      const result = sanitizePostgrestQuery(malicious)
      // % 被转义为 \%，失去通配能力；其余内容仅作为字面量传入参数化 ilike
      expect(result).toBe('\\%),username.eq.admin--')
    })
  })

  describe('searchGrantTargetUsers 源码验证（结构化防注入）', () => {
    it('导出了 sanitizePostgrestQuery 函数', () => {
      expect(sourceCode).toMatch(/export\s+function\s+sanitizePostgrestQuery/)
    })

    it('移除引号并转义 ilike 通配符（\\ % _）', () => {
      expect(sourceCode).toContain('.replace(/["\']/g')
      expect(sourceCode).toMatch(/replace\(\s*\/\[\\\\%_\]\//)
    })

    it('UUID 形态输入走参数化 .eq() 精确匹配', () => {
      expect(sourceCode).toMatch(/GRANT_SEARCH_UUID_RE\.test\(safeQuery\)/)
      expect(sourceCode).toMatch(/builder\.eq\('id',\s*safeQuery\)/)
    })

    it('非 UUID 输入走参数化 .ilike()（值经 sanitize 转义）', () => {
      expect(sourceCode).toMatch(/sanitizePostgrestQuery\(safeQuery\)/)
      expect(sourceCode).toMatch(/builder\.ilike\('username',\s*`%\$\{sanitized\}%`\)/)
    })

    it('不再拼接 .or() 过滤表达式（结构上杜绝表达式注入）', () => {
      expect(sourceCode).not.toMatch(/\.or\(/)
    })
  })
})
