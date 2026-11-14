/**
 * bohai-image-embed.test.js — 裸图片 URL 自动出图（2026-11-12）
 *
 * 用户口径：「如果有配图我希望是直接输出在对话流里」。
 *
 * 这条链路的两个失败模式都很难在界面上发现，所以必须钉住：
 *   ① **漏转** —— 用户看到一长串 URL 而不是图（就是报障本身）；
 *   ② **转多了** —— 把外域 URL 也转成 img，等于让模型能加载任意第三方图片
 *      （追踪像素 / 大陆不可达导致的裂图）。白名单是安全边界，不能"顺手放宽"。
 */
import { describe, expect, it } from 'vitest';
import { autoEmbedImageUrls } from '@/views/BOHAI/BOHAI/components/boh-image-embed.js';

const CDN = 'https://cdn.blockofhome.cn';
const IMG = `${CDN}/demo/image/upload/v1793857920/boh-cloud-plus/forum/abc.png`;

describe('白名单内的裸 URL → 图片', () => {
  it('孤立 URL 转成 markdown 图片', () => {
    const out = autoEmbedImageUrls(`帖子配图在这里：${IMG}`);
    expect(out).toContain(`![配图](${IMG})`);
  });

  it('「（配图：URL）」连包裹一起吃掉（不留孤立括号）', () => {
    const out = autoEmbedImageUrls(`近期动态（配图：${IMG}）获赞 12`);
    expect(out).toContain(`![配图](${IMG})`);
    expect(out).not.toContain('（配图：');
    expect(out).toContain('获赞 12');
  });

  it('英文括号包裹同样处理', () => {
    const out = autoEmbedImageUrls(`see (image: ${IMG}) for details`);
    expect(out).toContain(`![配图](${IMG})`);
    expect(out).not.toContain('(image:');
  });

  it('查询串与 webp/jpg/gif 都认', () => {
    for (const suffix of ['.webp?v=2', '.jpg', '.jpeg', '.gif']) {
      const url = `${CDN}/a/x${suffix}`;
      expect(autoEmbedImageUrls(`图：${url}`)).toContain(`![配图](${url})`);
    }
  });
});

describe('不该转的一律不转', () => {
  it('外域图片 URL 原样保留（仍是可点的链接，不出裂图）', () => {
    const evil = 'https://evil.example.com/track.png';
    const out = autoEmbedImageUrls(`配图：${evil}`);
    expect(out).toContain(evil);
    expect(out).not.toContain('![配图]');
  });

  it('Cloudinary 原址不转（大陆不可达，与渲染白名单同口径）', () => {
    const cloudinary = 'https://res.cloudinary.com/demo/image/upload/x.png';
    expect(autoEmbedImageUrls(cloudinary)).not.toContain('![配图]');
  });

  it('已经是 markdown 图片的不重复包裹', () => {
    const source = `![已有配图](${IMG})`;
    const out = autoEmbedImageUrls(source);
    expect(out).toBe(source);
  });

  it('已经是 markdown 链接的不动', () => {
    const source = `[点这里](${IMG})`;
    expect(autoEmbedImageUrls(source)).toBe(source);
  });

  it('围栏代码块内原样不动（那里是给人复制的）', () => {
    const source = ['```', `curl -O ${IMG}`, '```'].join('\n');
    expect(autoEmbedImageUrls(source)).toBe(source);
  });

  it('非图片链接（.pdf / 页面地址）不转', () => {
    const source = '详见 https://www.blockofhome.cn/cloud/report.pdf';
    expect(autoEmbedImageUrls(source)).toBe(source);
  });
});

describe('边界', () => {
  it('没有 URL / 空输入 → 原样返回', () => {
    expect(autoEmbedImageUrls('普通回答')).toBe('普通回答');
    expect(autoEmbedImageUrls('')).toBe('');
    expect(autoEmbedImageUrls(undefined)).toBe('');
    expect(autoEmbedImageUrls(null)).toBe('');
  });

  it('同一段里多张图都能转，且顺序不变', () => {
    const a = `${CDN}/a.png`;
    const b = `${CDN}/b.png`;
    const out = autoEmbedImageUrls(`第一张 ${a} 第二张 ${b}`);
    expect(out.indexOf(`![配图](${a})`)).toBeGreaterThan(-1);
    expect(out.indexOf(`![配图](${b})`)).toBeGreaterThan(out.indexOf(`![配图](${a})`));
  });
});
