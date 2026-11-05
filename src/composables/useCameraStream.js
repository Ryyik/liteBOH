/**
 * 相机取流的唯一入口（BOH Camera Beta）。
 *
 * 职责边界：只管「拿到一路可用的 MediaStream / 把它彻底关掉」。
 * 取景框的尺寸、镜像、滤镜都不在这里 —— 那些是视图的事。
 *
 * ── 三条实测口径（iOS Safari 为主，安卓 Chrome 同向更宽松）──────────────
 * 1. `getUserMedia()` **必须在用户手势里调**。放进 onMounted / setTimeout /
 *    Promise.then 里，iOS 会静默拒绝（连授权弹窗都不出），错误名还常常是
 *    NotAllowedError —— 看起来像用户拒绝了，其实是手势链断了。
 * 2. 同一时刻只留一路流。重复 start() 前必须先 stop()，否则 iOS 偶发返回空轨道。
 * 3. 切后台/来电后旧流不可恢复。隐藏时主动 stop，回前台重新 start；
 *    不主动停的话，多数机型回来看到的是最后一帧静止画面，快门拍到的也是它。
 */

import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

/** 当前环境是否有摄像头 API（HTTPS 下才有 mediaDevices，HTTP 恒为 undefined）。 */
export function isCameraSupported() {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * 把 getUserMedia 抛出的错误归成四类，UI 文案按类给 ——
 * 「权限被拒」和「设备被其他应用占用」给同一句「相机不可用」等于没说话。
 */
export function describeCameraError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'error';
}

export function useCameraStream() {
  const stream = shallowRef(null);
  /** idle | requesting | live | unavailable */
  const status = ref('idle');
  const errorReason = ref('');
  const facing = ref('environment');
  const supports = isCameraSupported();
  /** 隐藏前是否在用 —— 只有「正在用」才在回前台时自动重取 */
  let resumeOnVisible = false;

  function stop() {
    const current = stream.value;
    stream.value = null;
    if (!current) return;
    for (const track of current.getTracks()) {
      try {
        track.stop();
      } catch {
        /* 已经结束的轨道再 stop 会抛，忽略 */
      }
    }
  }

  async function start() {
    if (!supports) {
      status.value = 'unavailable';
      errorReason.value = 'unsupported';
      return null;
    }
    if (status.value === 'requesting') return stream.value;
    // 单实例：先把旧流关干净，再要新的
    stop();
    status.value = 'requesting';
    errorReason.value = '';
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // iOS 只认 'environment' / 'user' 两个字符串，别传数组或 { exact }
          facingMode: facing.value,
          // 取景只需要够看清；成片上限 1600，1920 已经有余量
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
      stream.value = media;
      const [track] = media.getVideoTracks();
      track?.addEventListener?.('ended', () => {
        // 系统收回镜头（来电、别的 App 抢占）时不要静默黑屏
        if (stream.value === media) {
          status.value = 'unavailable';
          errorReason.value = 'in-use';
        }
      });
      status.value = 'live';
      return media;
    } catch (error) {
      errorReason.value = describeCameraError(error);
      status.value = 'unavailable';
      return null;
    }
  }

  async function flip() {
    facing.value = facing.value === 'user' ? 'environment' : 'user';
    if (status.value === 'live') await start();
  }

  function handleVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      if (status.value === 'live' || status.value === 'requesting') {
        resumeOnVisible = true;
        stop();
        status.value = 'idle';
      }
      return;
    }
    if (!resumeOnVisible) return;
    resumeOnVisible = false;
    // 回前台自动重取：失败就落到 unavailable，由视图给「重试」
    void start();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      stop();
    });
  }

  return { stream, status, errorReason, facing, supports, start, stop, flip };
}
