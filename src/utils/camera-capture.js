/**
 * 相机抓帧的几何计算（BOH Camera Beta，plans/041）。
 *
 * 纯函数，无 DOM 依赖 —— 单测直接吃，视图只管画。
 *
 * 为什么单独抽出来：抓帧要同时满足两件事，混在组件里最容易错：
 *  1. **按取景框宽高比裁切**：取景是 `object-fit: cover`，成片若取整帧，
 *     用户会发现「拍出来比看到的多两条边」。
 *  2. **扣掉数码变焦**：硬件变焦（`applyConstraints({ zoom })`）已经改变了
 *     画面内容，不能重复裁；数码变焦（CSS `scale()`）只是把画面放大，抓帧必须
 *     把放大的那一块裁出来，否则成片比预览「缩回去」了。
 */

/** 纯数码变焦的档位（设备不开放 `zoom` 约束时使用）。 */
export const CAMERA_ZOOM_STEPS = [1, 2, 3];

/** 默认范围：1~3× 数码。真实范围由 `track.getCapabilities().zoom` 覆盖。 */
export const DIGITAL_ZOOM_RANGE = { min: 1, max: 3, step: 0.1, supported: false };

/** 变焦倍率收敛到给定范围；范围非法时退回数码档。 */
export function normalizeZoom(value, range = DIGITAL_ZOOM_RANGE) {
  const rawMin = Number(range?.min);
  const rawMax = Number(range?.max);
  const min = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 1;
  const max = Number.isFinite(rawMax) && rawMax >= min ? rawMax : Math.max(min, 3);
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

/**
 * 一台相机的变焦拆成「硬件 + 数码」两段。
 *
 * ⚠️ 先说清楚边界：**浏览器拿不到物理焦段**（0.5×/1×/3× 是哪几片镜片、
 * 各自等效多少毫米，`getCapabilities()` 不暴露）。能拿到的是当前视频轨道的
 * `zoom` 约束范围 {min, max, step} —— 这个范围**每台机器不一样**，它才是
 * 「本机能到多少倍」的唯一真实信号。
 *
 * iOS Safari 基本不给 `zoom`（范围为空 ⇒ 全走数码），安卓 Chrome 常见 1~8×。
 * 两段叠加才是用户看到的倍率，**别把同一个倍率同时喂给两边**（会变成 z²）。
 */
export function splitZoom(requested, range = DIGITAL_ZOOM_RANGE) {
  const target = normalizeZoom(requested, range);
  if (!range?.supported) return { hardware: 1, digital: target };
  // 硬件能吃下就全给硬件，数码段保持 1（成片才不会被二次裁切）
  return { hardware: target, digital: 1 };
}

/**
 * 网页取景的倍率上限。
 *
 * 安卓上报的 `zoom.max` 常常是**数码**上限（128× 这类），不是光学上限：
 * 成片宽度封顶 1600px，10× 时有效像素只剩 160px，再往上纯属马赛克。
 * 所以能力再大也只做到 10× —— 这不是"保守"，是把用户从无意义的档位里捞出来。
 */
export const MAX_USABLE_ZOOM = 10;

/**
 * 按设备能力生成档位。
 *
 * 有硬件变焦：列出 min（<1 时是超广角）、1×、设备上限以内的 2/3/5/10；
 * 设备上限本身若在可用区间内（如 4.3×），再单独列一档 —— 只列 2/3 会让人以为
 * 这机器只能到 3×。上限超出 10× 则不列：那是数码上限，列出来等于引导用户拍马赛克。
 * 没有硬件变焦：退回 1/2/3× 数码档，UI 会标注「数码」。
 */
export function buildZoomSteps(range = DIGITAL_ZOOM_RANGE) {
  if (!range?.supported) return [...CAMERA_ZOOM_STEPS];
  const min = Number(range.min) || 1;
  const rawMax = Number(range.max) || 1;
  const max = Math.min(rawMax, MAX_USABLE_ZOOM);
  const round1 = (value) => Math.round(value * 10) / 10;
  const steps = new Set();
  if (min < 0.95) steps.add(round1(min));
  if (min <= 1 && max >= 1) steps.add(1);
  for (const preset of [2, 3, 5, 10]) {
    if (preset <= max + 1e-6) steps.add(preset);
  }
  if (rawMax > 1 && rawMax <= MAX_USABLE_ZOOM) steps.add(round1(rawMax));
  return [...steps]
    .filter((value) => value >= min - 1e-6 && value <= max + 1e-6)
    .sort((a, b) => a - b)
    .slice(0, 6);
}

/**
 * 计算抓帧的源矩形（`drawImage` 的 9 参版本前四个）。
 *
 * @param {number} sourceWidth  视频原始宽（videoWidth）
 * @param {number} sourceHeight 视频原始高（videoHeight）
 * @param {number} aspect       取景框宽高比（offsetWidth / offsetHeight）
 * @param {number} zoom         数码变焦倍率（**不含**硬件变焦：那部分已在画面里）
 * @returns {{sx:number, sy:number, sw:number, sh:number}|null}
 *          尺寸非法时返回 null，调用方直接放弃这一帧（不要拍出一张 1×1 的黑图）
 */
export function computeCaptureRect(sourceWidth, sourceHeight, aspect, zoom = 1) {
  const width = Number(sourceWidth) || 0;
  const height = Number(sourceHeight) || 0;
  if (width < 2 || height < 2) return null;

  const targetAspect = Number(aspect) > 0 ? Number(aspect) : width / height;
  const z = normalizeZoom(zoom);

  // 先扣数码变焦：取中心 1/z 的那块
  let sw = width / z;
  let sh = height / z;

  // 再收成取景框的宽高比：比目标更宽就裁宽，更高就裁高（永远中心对齐）
  if (sw / sh > targetAspect) sw = sh * targetAspect;
  else sh = sw / targetAspect;

  // 四舍五入后再夹一次：浮点误差不该让 sw 越过源宽
  sw = Math.min(width, Math.max(1, Math.round(sw)));
  sh = Math.min(height, Math.max(1, Math.round(sh)));

  return {
    sx: Math.max(0, Math.round((width - sw) / 2)),
    sy: Math.max(0, Math.round((height - sh) / 2)),
    sw,
    sh,
  };
}
