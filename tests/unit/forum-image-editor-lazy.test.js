import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 守住「裁剪器不进首屏」这条（2026-11-16）。
 *
 * 为什么要有源码级守卫：`vue-advanced-cropper` gzip 19.2 KB，只在用户点「编辑」
 * 且当前工具是 crop 时才渲染。它一旦被写成静态 import，就会被
 * ForumMain → PostComposer → ImageEditModal 一路静态带进首屏闭包 ——
 * 首访只想看看论坛的人也要为它付带宽。而这件事**没有任何运行时症状**：
 * 构建成功、页面正常、测试全绿，只有抓 waterfall 才看得见。
 *
 * ⚠️ 断言都按「能被 prettier 重排」的写法来：`import {` 与 `from` 之间可能是
 * 换行 + 缩进、引号可能被改成单引号带分号。所以统一用 /s + 宽松空白匹配，
 * 不要写成逐字字符串（那会在某次格式化后变成假红）。
 */

const SRC = readFileSync(
  resolve(__dirname, '../../src/views/Forum/components/ImageEditModal.vue'),
  'utf8',
);

describe('ImageEditModal 的裁剪器必须是按需加载', () => {
  it('不得静态 import vue-advanced-cropper 的组件', () => {
    const staticImport =
      /(^|\n)\s*import\s*(?!\()[\s\S]{0,200}?from\s*['"]vue-advanced-cropper['"]/;
    expect(staticImport.test(SRC)).toBe(false);
  });

  it('不得静态 import vue-advanced-cropper 的样式（副作用导入同样进首屏）', () => {
    const staticCss = /(^|\n)\s*import\s+['"]vue-advanced-cropper\/dist\/style\.css['"]/;
    expect(staticCss.test(SRC)).toBe(false);
  });

  it('必须通过动态 import 取组件，且样式与组件同一批（否则会先渲染出无样式裁切框）', () => {
    expect(/import\(\s*['"]vue-advanced-cropper['"]\s*\)/.test(SRC)).toBe(true);
    expect(/import\(\s*['"]vue-advanced-cropper\/dist\/style\.css['"]\s*\)/.test(SRC)).toBe(true);
  });

  it('懒加载包装必须走 defineAsyncComponent（不能只写 import() 却同步使用）', () => {
    expect(/defineAsyncComponent\(/.test(SRC)).toBe(true);
    // 变量名被改掉也不影响这条：只要 Cropper 这个名字仍被 async 包装定义
    expect(/const\s+Cropper\s*=\s*defineAsyncComponent\(/.test(SRC)).toBe(true);
  });

  it('加载失败必须能重试（promise 被清空），否则一次网络抖动就永久失效', () => {
    expect(/cropperModulePromise\s*=\s*null;/.test(SRC)).toBe(true);
  });

  it('反证：把静态 import 写回去，第 1、2 条必须变红', () => {
    // 用最小样片验证守卫本身有效 —— 守卫失效比被守卫的代码坏掉更难发现
    const broken = `import { Cropper } from 'vue-advanced-cropper';\nimport 'vue-advanced-cropper/dist/style.css';\n`;
    expect(
      /(^|\n)\s*import\s*(?!\()[\s\S]{0,200}?from\s*['"]vue-advanced-cropper['"]/.test(broken),
    ).toBe(true);
    expect(/(^|\n)\s*import\s+['"]vue-advanced-cropper\/dist\/style\.css['"]/.test(broken)).toBe(
      true,
    );
  });
});
