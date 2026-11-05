/**
 * 相机成片的一次性交接（BOH Camera Beta）。
 *
 * 相机是独立路由，拍完要回到图库并自动进「新建」面板的上传队列。
 * File 通过这里递一次手 —— **只放内存，不落 storage**：
 *  · 一张 JPEG 动辄几 MB，塞 localStorage 直接撞配额；
 *  · 跨会话复用没有意义（拍完就该马上用掉，刷新即丢）。
 *
 * 消费方必须「取一次就清空」：不清空会让用户下次进图库时莫名多出一张旧照片。
 */

let pending = null;

export function stashCameraCapture(file) {
  pending = file && typeof file === 'object' ? file : null;
}

export function hasCameraCapture() {
  return Boolean(pending);
}

/** 取出并清空；没有则返回 null（调用方按「正常进图库」处理）。 */
export function takeCameraCapture() {
  const file = pending;
  pending = null;
  return file;
}

/** 仅供测试：重置模块级状态。 */
export function __resetCameraCapture() {
  pending = null;
}
