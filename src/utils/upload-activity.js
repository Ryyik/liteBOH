/**
 * upload-activity.js — 全站「是否有上传正在进行」的单一信号
 *
 * 为什么单独开一个文件：version-checker.js 属于首屏模块，它的判断需要知道
 * 「此刻有没有上传在跑」。如果把计数器塞进 cloud-upload-guard.js（268 行常量 +
 * 图片校验逻辑），首屏就会多拖进一整个模块。这里只放一个整数和三个函数，
 * 被打包进首屏也只有几百字节，不碰首屏预算门禁。
 *
 * 为什么需要这个信号（2026-11-01 审计结论）：
 *   自动强刷只在「页面隐藏 ≥30s 后切回」和「冷启动」两个时机发生。冷启动时不可能
 *   有上传；真正危险的是前者 —— 用户选了十几张大图开始上传，切去回消息，几分钟后
 *   切回来，页面隐藏已超 30s，于是自动强刷 → 传输中断。Cloudinary 的 unsigned/
 *   signed 上传都不支持断点续传，用户必须从头重传，且中断前的分片会留下孤儿资源。
 *
 *   原有的三个护栏（typing / media / editing）恰好覆盖不了这个场景：
 *   只传文件、一个字都没打的那种（相册补图、Cloud+ 传素材、换封面），
 *   activeElement 是 body、没有脏输入、也没有媒体在播。
 *
 * 为什么计数而不是布尔：并发上传上限是 3（CLOUD_UPLOAD_MAX_CONCURRENCY），
 * 布尔量会在第一个请求结束时就把状态清掉，剩下的请求还在跑却已放行强刷。
 */

let activeUploadCount = 0;

export function beginUpload() {
  activeUploadCount += 1;
}

export function endUpload() {
  // 防御不对称调用（重复 end / 异常路径多调一次）：计数不降到负数，
  // 否则一次多余的 endUpload 会让护栏永久失效。
  activeUploadCount = Math.max(0, activeUploadCount - 1);
}

export function hasActiveUpload() {
  return activeUploadCount > 0;
}

/** 仅供单测清理全局状态，业务代码不要调用。 */
export function __resetUploadActivityForTests() {
  activeUploadCount = 0;
}
