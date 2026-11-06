/**
 * 相机成片的交接通道（BOH Camera Beta，plans/041）。
 *
 * 相机是独立路由；拍完的照片先暂存在取景页的「层叠相册」里，用户点「完成」
 * 后整批交给图库的「新建」上传队列。
 *
 * 口径：
 *  · **只放内存，不落 storage** —— 一张 JPEG 动辄几 MB，塞 localStorage 直接撞配额；
 *    跨会话复用也没有意义（拍完就该马上用掉，刷新即丢）。
 *  · **取一次就清空** —— 不清空会让用户下次进图库时莫名多出一批旧照片。
 *  · 传数组而不是单个 File —— 「拍多张再挑」是既定方向，上层协议先定成一批，
 *    以后加筛选只改相机页，不用再改交接协议。
 */

/** @type {File[]} */
let pending = [];

/** @param {File[]|File|null} files */
export function stashCameraCapture(files) {
  const list = Array.isArray(files) ? files : [files];
  pending = list.filter((file) => file && typeof file === 'object');
}

export function hasCameraCapture() {
  return pending.length > 0;
}

/** 取出并清空；没有则返回空数组（调用方按「正常进图库」处理）。 */
export function takeCameraCaptures() {
  const files = pending;
  pending = [];
  return files;
}

/** 仅供测试：重置模块级状态。 */
export function __resetCameraCapture() {
  pending = [];
}
