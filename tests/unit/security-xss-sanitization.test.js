import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DOMPurify from '@/utils/dompurify.js'

// ============================================================
// M1 修复验证：首页英雄区 v-html XSS 防护
// 验证4个组件已使用 DOMPurify.sanitize 而非直接 v-html="title"
// ============================================================

const components = [
  {
    name: 'DynamicHomeHero',
    path: 'src/views/Home/components/DynamicHomeHero.vue'
  },
  {
    name: 'AppleGridCard',
    path: 'src/components/AppleGridCard.vue'
  },
  {
    name: 'AppleHeroBanner',
    path: 'src/components/AppleHeroBanner.vue'
  },
  {
    name: 'HeroSection',
    path: 'src/components/HeroSection.vue'
  }
]

describe('M1: 首页英雄区 XSS 防护', () => {
  describe('源码静态扫描 - 所有组件已接入 DOMPurify', () => {
    for (const { name, path } of components) {
      describe(`${name} 组件`, () => {
        const source = readFileSync(resolve(import.meta.dirname, `../../${path}`), 'utf8')

        it('模板中使用 sanitizedTitle 而非原始 title', () => {
          expect(source).toContain('v-html="sanitizedTitle"')
          expect(source).not.toMatch(/v-html="title"/)
          expect(source).not.toMatch(/v-html="hero\.title"/)
        })

        it('导入了 DOMPurify', () => {
          expect(source).toMatch(/import\s+DOMPurify\s+from\s+['"]@\/utils\/dompurify\.js['"]/)
        })

        it('定义了 sanitizedTitle computed 属性', () => {
          expect(source).toContain('sanitizedTitle')
          expect(source).toMatch(/DOMPurify\.sanitize/)
        })

        it('使用白名单限制允许的标签和属性', () => {
          expect(source).toContain('ALLOWED_TAGS')
          expect(source).toContain('ALLOWED_ATTR')
        })
      })
    }
  })

  describe('DOMPurify 安全兜底行为验证（Node 环境）', () => {
    // 在 Node 环境（无 DOM）下，dompurify.js 走 escapeHtml 兜底，
    // 将所有 HTML 标签转义为文本。这是比浏览器环境更保守的安全行为。
    // 浏览器环境下 DOMPurify.sanitize 会按白名单净化，保留 <br> 等安全标签。

    it('纯文本保持不变', () => {
      expect(DOMPurify.sanitize('这是纯文本标题')).toBe('这是纯文本标题')
    })

    it('空字符串返回空字符串', () => {
      expect(DOMPurify.sanitize('')).toBe('')
    })

    it('null 返回空字符串', () => {
      expect(DOMPurify.sanitize(null)).toBe('')
    })

    it('undefined 返回空字符串', () => {
      expect(DOMPurify.sanitize(undefined)).toBe('')
    })

    it('<script> 标签被转义为文本（不执行）', () => {
      const result = DOMPurify.sanitize('<script>alert(1)</script>文字')
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('文字')
    })

    it('<img onerror> XSS payload 被转义为文本', () => {
      const result = DOMPurify.sanitize('<img src=x onerror=alert(1)>文字')
      expect(result).not.toContain('<img')
      expect(result).toContain('&lt;img')
      expect(result).toContain('文字')
    })

    it('<svg onload> XSS payload 被转义为文本', () => {
      const result = DOMPurify.sanitize('<svg onload=alert(1)>文字')
      expect(result).not.toContain('<svg>')
      expect(result).toContain('&lt;svg')
      expect(result).toContain('文字')
    })

    it('<iframe> 标签被转义为文本', () => {
      const result = DOMPurify.sanitize('<iframe src="evil.com"></iframe>文字')
      expect(result).not.toContain('<iframe')
      expect(result).toContain('&lt;iframe')
      expect(result).toContain('文字')
    })

    it('onclick 属性所在的标签被整体转义', () => {
      const payload = '<span onclick=alert(1) class="ok">文字</span>'
      const result = DOMPurify.sanitize(payload)
      // 在 Node 环境下整个标签被转义，onclick 不会作为属性执行
      expect(result).not.toMatch(/<span\s+onclick/)
      expect(result).toContain('&lt;span')
      expect(result).toContain('文字')
    })

    it('javascript: 协议所在的标签被整体转义', () => {
      const payload = '<a href="javascript:alert(1)">链接</a>'
      const result = DOMPurify.sanitize(payload)
      expect(result).not.toMatch(/<a\s+href="javascript:/)
      expect(result).toContain('&lt;a')
      expect(result).toContain('链接')
    })

    it('嵌套注入尝试被转义为文本', () => {
      const payload = '<<script>script>alert(1)<</script>/script>'
      const result = DOMPurify.sanitize(payload)
      expect(result).not.toMatch(/<script/i)
      expect(result).toContain('&lt;')
    })

    it('保留 <br> 标签的文本内容', () => {
      // Node 环境下 <br> 被转义，但文本内容保留
      const result = DOMPurify.sanitize('了解，<br>什么是BOH')
      expect(result).toContain('了解，')
      expect(result).toContain('什么是BOH')
      expect(result).toContain('&lt;br&gt;')
    })

    it('引号被转义防止属性注入', () => {
      const result = DOMPurify.sanitize('<a href="x">test</a>')
      expect(result).toContain('&quot;')
      expect(result).not.toMatch(/<a\s+href="/)
    })
  })
})
