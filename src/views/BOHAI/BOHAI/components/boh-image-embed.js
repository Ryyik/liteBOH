/**
 * boh-image-embed.js — 把「裸图片 URL」转成 markdown 图片语法（2026-11-12）
 *
 * 用户口径：「如果有配图我希望是直接输出在对话流里」。
 *
 * 现状问题：模型常把配图写成 `（配图：https://…/x.png）` 这种**纯文本 URL**，
 * marked 只把它渲染成一条链接，用户看到一长串网址而不是图。
 * 修法放在渲染层而不是 prompt：模型输出形态不稳定，而「一段形如图片地址的文本」
 * 在渲染层是可以确定性识别的。
 *
 * ⚠️ 单独成文件的唯一原因：它是**纯函数**，要能被单测直接 import。
 *    `boh-markdown.js` 会连带加载 highlight.js 与 .css，在 node 环境的测试里跑不起来。
 *
 * 四条约束（改之前先读）：
 *   ① **必须过 `isAllowedImageSrc`**（白名单＝自建 CDN）。随便一个外域 URL 都转图，
 *      等于把「模型能让你加载任意第三方图片」开放出去（追踪像素 / 裂图 / 漏 Referer）。
 *      不在白名单的 URL **原样保留**，仍是可点的链接。
 *   ② 已在 markdown 图片/链接语法里的 URL 不重复包裹（先占位保护，最后还原）。
 *   ③ 围栏代码块 ```` ``` ```` 内原样不动 —— 那里展示的 URL 是给人复制的。
 *   ④ 逐段处理时用占位符（NUL 包裹的序号），**不要**用「先替换再回填字符串」的写法：
 *      正文里很可能再出现同样的 URL，回填会把两处串味。
 */
import { isAllowedImageSrc } from '@/utils/image-origins.js';

/** 裸图片 URL：HTTP(S) + 图片扩展名（可带查询串），排除括号引号空白 */
const BARE_IMAGE_URL_PATTERN =
  /https?:\/\/[^\s<>"'（）()]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s<>"'（）()]*)?/gi;

/** `![alt](url)` / `[text](url)`：整段先换成占位符，避免被当成裸 URL 二次包裹 */
const EXISTING_MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;

/** 占位符用 NUL 包裹：URL 正则不可能命中它（没有 scheme），且不会出现在正常正文里 */
const PROTECT_MARKER = '\u0000';

/**
 * 「（配图：URL）」「(image: URL)」—— 连包裹一起吃掉，否则图片上下会各留一对孤立括号。
 * 中英混写在模型输出里都出现过（中文场景以「配图」为主，英文 `image:` 也会漏出来）。
 */
const WRAPPED_IMAGE_PATTERN =
  /[（(]\s*(?:配图|图片|截图|配图地址|image|photo)\s*[：:]\s*(https?:\/\/[^\s<>"'）)]+)\s*[）)]/gi;

const embedImagesInChunk = (chunk) => {
  const kept = [];
  const protectedText = chunk.replace(EXISTING_MARKDOWN_LINK_PATTERN, (full) => {
    kept.push(full);
    return `${PROTECT_MARKER}${kept.length - 1}${PROTECT_MARKER}`;
  });

  const unwrapped = protectedText.replace(WRAPPED_IMAGE_PATTERN, (full, url) =>
    isAllowedImageSrc(url) ? `\n\n![配图](${url})\n\n` : full,
  );

  const withImages = unwrapped.replace(BARE_IMAGE_URL_PATTERN, (url) =>
    isAllowedImageSrc(url) ? `\n\n![配图](${url})\n\n` : url,
  );

  return withImages.replace(
    new RegExp(`${PROTECT_MARKER}(\\d+)${PROTECT_MARKER}`, 'g'),
    (_, index) => kept[Number(index)] ?? '',
  );
};

/**
 * @param {string} source markdown 正文
 * @returns {string} 已把「可出图的裸 URL」转成 `![配图](url)` 的正文
 */
export const autoEmbedImageUrls = (source) => {
  const text = String(source ?? '');
  if (!text || !/https?:\/\//i.test(text)) return text;
  // split 后奇数下标是代码块，原样保留
  return text
    .split(/(```[\s\S]*?```)/)
    .map((part, index) => (index % 2 === 1 ? part : embedImagesInChunk(part)))
    .join('');
};
