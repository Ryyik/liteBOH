/**
 * ai-answer-image-policy.test.js —— AI 回答「图文并茂」Phase 1 的策略守卫（2026-10-16）
 *
 * 锁三件事：
 *   1. **src 白名单判定**（`utils/image-origins.js`）—— 这是安全边界，逐条覆盖绕过手法：
 *      协议相对地址、非 https、userinfo 伪装、后缀伪装、`data:text/html`、相对路径。
 *   2. **两个白名单的不变量** —— AI 回答白名单必须是 CSP 图片白名单的**子集**，
 *      且 CSP 的域名不再手写（从同一常量插值）。少了这条，就会出现
 *      「渲染器放行、CSP 拦截」的静默裂图，而 CSP 当前是 Report-Only ⇒ 本地看不出来。
 *   3. **接线在位** —— markdown 渲染器放行了 img 且把白名单传给 sanitize；
 *      DOMPurify 侧真的注册了按 `config.allowedImageOrigins` 校验的钩子；
 *      论坛上下文真的把配图 URL 带给了模型、且带了「不得编造图片」的约束。
 *
 * ⚠️ 为什么 DOMPurify 的行为不在本文件里用 DOM 断言：
 *   仓库的 vitest 是 `environment: 'node'`，且没装 jsdom/happy-dom；
 *   `utils/dompurify.js` 在无 `window` 时走 escapeHtml 兜底分支，DOM 断言无从谈起。
 *   所以这里退化为**源码守卫**（与 `bohai-autogrow-wiring.test.js` 同款做法），
 *   真正的浏览器行为留给渲染路径的人工冒烟。
 *
 * ⚠️ 断言只认代码、不认注释：所有源码断言先过 `stripComments()`，
 *   否则我自己写的解释性注释会把断言「满足」（本仓库咬过这个坑）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AI_ANSWER_IMAGE_ORIGINS,
  CSP_IMAGE_ORIGINS,
  isAllowedImageSrc,
} from '../../src/utils/image-origins.js';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const codeOf = (rel) => flattenSource(stripComments(scriptSection(read(rel))));

const CDN = 'https://cdn.blockofhome.cn';

describe('isAllowedImageSrc —— 放行', () => {
  it('放行自建 CDN 的绝对地址（含变换参数与查询串）', () => {
    expect(
      isAllowedImageSrc(`${CDN}/image/upload/f_auto,q_auto:good,c_fill,w_640,h_440/v1/boh/x.webp`),
    ).toBe(true);
    expect(isAllowedImageSrc(`${CDN}/a.webp?v=2#frag`)).toBe(true);
  });

  it('放行同源绝对路径（站内打包资源）', () => {
    expect(isAllowedImageSrc('/assets/images/ryyik_style.webp')).toBe(true);
  });

  it('放行 data:image 的 base64 与 blob:（本地预览 / 粘贴上传）', () => {
    expect(isAllowedImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isAllowedImageSrc('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isAllowedImageSrc('blob:https://www.blockofhome.cn/abc-123')).toBe(true);
  });
});

describe('isAllowedImageSrc —— 拒绝（绕过手法逐条覆盖）', () => {
  it('拒绝空值与非字符串', () => {
    expect(isAllowedImageSrc('')).toBe(false);
    expect(isAllowedImageSrc('   ')).toBe(false);
    expect(isAllowedImageSrc(null)).toBe(false);
    expect(isAllowedImageSrc(undefined)).toBe(false);
    expect(isAllowedImageSrc(123)).toBe(false);
  });

  it('拒绝协议相对地址 //host/x（会指向任意外域）', () => {
    expect(isAllowedImageSrc('//evil.com/x.webp')).toBe(false);
    expect(isAllowedImageSrc(`//cdn.blockofhome.cn/x.webp`)).toBe(false);
  });

  it('拒绝非 https 协议', () => {
    expect(isAllowedImageSrc('http://cdn.blockofhome.cn/x.webp')).toBe(false);
    expect(isAllowedImageSrc('javascript:alert(1)')).toBe(false);
    expect(isAllowedImageSrc('file:///etc/passwd')).toBe(false);
  });

  it('拒绝非图片的 data URI（防 data:text/html 当图片注入）', () => {
    expect(isAllowedImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isAllowedImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
  });

  it('拒绝相对路径（AI 回答里的图片必须是可验证来源）', () => {
    expect(isAllowedImageSrc('x.webp')).toBe(false);
    expect(isAllowedImageSrc('./x.webp')).toBe(false);
    expect(isAllowedImageSrc('../x.webp')).toBe(false);
  });

  it('拒绝 userinfo 伪装：https://cdn.blockofhome.cn@evil.com/x', () => {
    expect(isAllowedImageSrc(`${CDN}@evil.com/x.webp`)).toBe(false);
  });

  it('拒绝后缀伪装：cdn.blockofhome.cn.evil.com', () => {
    expect(isAllowedImageSrc('https://cdn.blockofhome.cn.evil.com/x.webp')).toBe(false);
  });

  it('拒绝 Cloudinary 原址 —— AI 回答白名单刻意不含它（大陆实测不可达，宁可不出图）', () => {
    expect(isAllowedImageSrc('https://res.cloudinary.com/demo/image/upload/x.webp')).toBe(false);
    expect(AI_ANSWER_IMAGE_ORIGINS).not.toContain('https://res.cloudinary.com');
  });

  it('白名单为空数组时一律拒绝（防御性：调用方传错不放开）', () => {
    expect(isAllowedImageSrc(`${CDN}/x.webp`, [])).toBe(false);
    expect(isAllowedImageSrc(`${CDN}/x.webp`, null)).toBe(false);
  });
});

describe('两个白名单的不变量', () => {
  it('AI 回答白名单必须是 CSP 图片白名单的子集', () => {
    expect(AI_ANSWER_IMAGE_ORIGINS.length).toBeGreaterThan(0);
    for (const origin of AI_ANSWER_IMAGE_ORIGINS) {
      expect(CSP_IMAGE_ORIGINS).toContain(origin);
    }
  });

  it('CSP 的图片域名由 CSP_IMAGE_ORIGINS 插值，不再手写', () => {
    const script = stripComments(read('scripts/cloudflare-security-headers.mjs'));
    expect(script).toContain("import { CSP_IMAGE_ORIGINS } from '../src/utils/image-origins.js'");
    expect(script).toMatch(/img-src[^`\n]*\$\{CSP_IMAGE_ORIGINS\.join\(/);
    // 负向：域名清单不该再出现字面量（手写就会漂移）
    expect(script).not.toContain('res.cloudinary.com');
    expect(script).not.toContain('cdn.blockofhome.cn');
  });
});

describe('接线守卫', () => {
  it('markdown 渲染器放行 img，且把白名单交给 sanitize 校验', () => {
    const code = codeOf('src/views/BOHAI/BOHAI/components/boh-markdown.js');
    expect(code).toContain(
      flattenSource("import { AI_ANSWER_IMAGE_ORIGINS } from '@/utils/image-origins.js';"),
    );
    // ALLOWED_TAGS 里必须有 img（否则模型写 ![]() 会被整段删掉）
    expect(code).toMatch(/ALLOWED_TAGS:\[[^\]]*'img'/);
    // ALLOWED_ATTR 里必须有 src，否则 img 留下但没地址
    expect(code).toMatch(/ALLOWED_ATTR:\[[^\]]*'src'/);
    // 关键：把白名单传下去，否则钩子不生效 = 放开任意图
    // （不加尾逗号：flattenSource 会按 prettier 规则吃掉闭括号前的逗号，两侧必须同款）
    expect(code).toContain(flattenSource('allowedImageOrigins: AI_ANSWER_IMAGE_ORIGINS'));
  });

  it('DOMPurify 侧注册了按 config.allowedImageOrigins 校验 img 的钩子', () => {
    const code = codeOf('src/utils/dompurify.js');
    expect(code).toContain(
      flattenSource("import { isAllowedImageSrc } from './image-origins.js';"),
    );
    expect(code).toContain(flattenSource("purifier.addHook('afterSanitizeAttributes',"));
    expect(code).toContain(flattenSource('const origins = config?.allowedImageOrigins;'));
    expect(code).toContain(flattenSource('isAllowedImageSrc(src, origins)'));
    // 未声明白名单的调用方行为必须不变（钩子直接 return）。
    // 断言跑在 flattenSource 后的源码上 ⇒ 正则里不能带字面空格。
    expect(code).toMatch(/if\(!Array\.isArray\(origins\)\|\|origins\.length===0\)return/);
  });

  it('论坛上下文把配图 URL 带给模型，并附「不得编造图片」的约束', () => {
    const code = codeOf('src/views/BOHAI/composables/useKnowledgeRetrieval.js');
    // 用同一份白名单在**上下文构建期**先筛一遍（渲染侧是第二道防线，不是唯一一道）
    expect(code).toContain(
      flattenSource('isAllowedImageSrc(rawImageUrl, AI_ANSWER_IMAGE_ORIGINS)'),
    );
    expect(code).toContain('配图：');
    // 只在确实有可引用配图时才给约束，避免无图时白占预算、也避免诱导编图
    expect(code).toContain(flattenSource('postsWithImage > 0'));
    expect(code).toContain('不要编造图片');
  });
});
