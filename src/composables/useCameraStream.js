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
import { DIGITAL_ZOOM_RANGE, normalizeZoom, splitZoom } from '@/utils/camera-capture.js';

/** 当前环境是否有摄像头 API（HTTPS 下才有 mediaDevices，HTTP 恒为 undefined）。 */
export function isCameraSupported() {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * 站内/App 内置浏览器（WebView）。这些环境的共同特征是**宿主 App 决定要不要给摄像头**，
 * 网页侧既拿不到弹窗也拿不到说明 —— 用户看到的就是「点了没反应」。
 * 必须提前判出来并给出「在浏览器中打开」，否则文案会误报成「权限被拒」。
 */
const WEBVIEW_UA =
  /MicroMessenger|QQ\/|Weibo|AlipayClient|DingTalk|aweme|Douyin|BytedanceWebview|FBAN|FBAV|Instagram|Line\//i;

/**
 * 起流前的**静态**预检（不发请求、不需要手势）。返回空串表示「值得一试」。
 *
 * 这三类问题都**不会**弹权限框，也永远不会因为用户点「允许」而变好，
 * 所以必须在调 getUserMedia 之前拦下来并说清原因：
 *   insecure  —— 非安全上下文（http、或 https 页面里嵌的 http iframe）
 *   webview   —— 微信/QQ 等内置浏览器
 *   unsupported —— 浏览器压根没有这个 API
 */
export function detectCameraBlocker() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) {
    return WEBVIEW_UA.test(navigator.userAgent || '') ? 'webview' : 'unsupported';
  }
  return '';
}

/**
 * 读本站的摄像头权限状态：`granted` / `denied` / `prompt` / `''`（读不到）。
 *
 * 用途不是「判断能不能用」，而是两个体验分叉：
 *   granted → 可以静默开（不用手势也不会弹窗），进页面直接出画面；
 *   denied  → **浏览器以后不会再弹窗了**，这时候只显示「重试」是骗人的，
 *             必须告诉用户去站点设置里改。
 * Safari 对 `camera` 这个名字支持不稳定，读不到就返回 '' 当作 prompt 处理。
 */
export async function readCameraPermission() {
  try {
    const status = await navigator.permissions?.query?.({ name: 'camera' });
    return String(status?.state || '');
  } catch {
    return '';
  }
}

/**
 * 把 getUserMedia 抛出的错误归类，UI 文案按类给 ——
 * 「权限被拒」和「设备被其他应用占用」给同一句「相机不可用」等于没说话。
 */
export function describeCameraError(error) {
  const name = String(error?.name || '');
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'error';
}

/**
 * 授权框的等待上限。超时按失败处理是**必要的**：
 * 部分安卓 WebView 会永远挂着不 resolve，界面就一直停在「正在打开相机」，
 * 用户看到的就是一块不动的黑屏，连「重试」都没有。
 */
const REQUEST_TIMEOUT_MS = 12000;

export function useCameraStream() {
  const stream = shallowRef(null);
  /** idle | requesting | live | unavailable */
  const status = ref('idle');
  const errorReason = ref('');
  const facing = ref('environment');
  const supports = isCameraSupported();
  /** 用户选的倍率 */
  const zoom = ref(1);
  /**
   * 本机这一路流的变焦能力（`getCapabilities().zoom`）。
   * 这是**唯一**能真实反映「这台手机能到多少倍」的信号：
   * iOS Safari 多数没有这个约束 ⇒ supported=false，退回数码档；
   * 安卓 Chrome 常见 1~8×，有些机型还能到 0.5×（超广角）。
   */
  const zoomRange = ref({ ...DIGITAL_ZOOM_RANGE });
  /** 硬件吃不下、要靠 CSS scale 兑现的那一段倍率（抓帧时按它裁切） */
  const digitalZoom = ref(1);
  /** 隐藏前是否在用 —— 只有「正在用」才在回前台时自动重取 */
  let resumeOnVisible = false;
  /** 请求代号：stop() / 再次 start() 都会 +1，用来作废还在路上的那一路上 */
  let requestTicket = 0;

  /** 读变焦能力：读不到就当没有（别瞎调 applyConstraints） */
  function readZoomRange(track) {
    try {
      const caps = track?.getCapabilities?.() || {};
      const min = Number(caps.zoom?.min);
      const max = Number(caps.zoom?.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return { ...DIGITAL_ZOOM_RANGE };
      }
      return { min, max, step: Number(caps.zoom?.step) || 0.1, supported: true };
    } catch {
      return { ...DIGITAL_ZOOM_RANGE };
    }
  }

  /**
   * 设置倍率：先喂硬件、剩下的交给数码（CSS scale + 抓帧裁切）。
   * ⚠️ 两段必须分开，不能把同一个倍率同时喂给两边（会变成 z²）。
   */
  async function setZoom(next) {
    const range = zoomRange.value;
    const target = normalizeZoom(next, range);
    zoom.value = target;
    const { hardware, digital } = splitZoom(target, range);
    const track = stream.value?.getVideoTracks?.()[0];
    if (range.supported && track) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: hardware }] });
        // 回读真实生效值：有的机型会吸到最近档位，差额用数码补，才是「真的到这个倍率」
        const actual = Number(track.getSettings?.().zoom);
        const applied = Number.isFinite(actual) && actual > 0 ? actual : hardware;
        digitalZoom.value = Math.max(1, target / applied);
        return;
      } catch {
        // 声明支持但实际拒绝（部分安卓机型）：整段退回数码变焦
      }
    }
    digitalZoom.value = digital;
  }

  /**
   * 点按对焦 —— 先说清能做到的上限，别夸大：
   * 浏览器**没有**「对到手指那一点」的 API（`pointsOfInterest` 只存在于
   * ImageCapture 规范草案，至今没有浏览器实现）。能做的最多是：
   * 设备声明支持 `focusMode: 'single-shot'` 时，**重新触发一次自动对焦**。
   *   · 安卓 Chrome 部分机型：会真的重新对一次（对画面中心，不是点击点）；
   *   · iOS Safari：没有 focusMode 约束 ⇒ 什么都不做，界面只显示对焦框。
   *
   * 返回「本次点击是否真的触发了 AF」——调用方据此决定反馈，别对没发生的对焦
   * 说「已对上」。
   */
  async function focusAt() {
    const track = stream.value?.getVideoTracks?.()[0];
    if (!track) return false;
    let modes = [];
    try {
      modes = track.getCapabilities?.().focusMode || [];
    } catch {
      modes = [];
    }
    if (!modes.includes('single-shot')) return false;
    try {
      await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      // 必须切回连续对焦，否则第二次点击不会再触发单次对焦
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          void track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }, 600);
      }
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    // 作废在途请求：迟到返回的那路流会在 start() 里被自己停掉
    requestTicket += 1;
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
    // 每次请求一个代号：超时后若原 promise 迟到返回，要能认出「这路流没人要了」
    const ticket = ++requestTicket;
    let settled = false;
    const request = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // iOS 只认 'environment' / 'user' 两个字符串，别传数组或 { exact }
        facingMode: facing.value,
        // 取景只需要够看清；成片上限 1600，1920 已经有余量
        width: { ideal: 1920 },
        height: { ideal: 1440 },
      },
    });
    // 迟到的流必须自己停掉，否则相机指示灯会一直亮着（信任问题）
    request.then(
      (late) => {
        if (settled && ticket === requestTicket) {
          for (const track of late.getTracks()) track.stop();
        }
      },
      () => {},
    );
    try {
      const media = await Promise.race([
        request,
        new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('camera request timeout');
            error.name = 'TimeoutError';
            reject(error);
          }, REQUEST_TIMEOUT_MS);
        }),
      ]);
      settled = true;
      if (ticket !== requestTicket) {
        // 期间被 stop() 或重新 start()：这路流已经过期，直接还回去
        for (const track of media.getTracks()) track.stop();
        return null;
      }
      stream.value = media;
      const [track] = media.getVideoTracks();
      zoomRange.value = readZoomRange(track);
      track?.addEventListener?.('ended', () => {
        // 系统收回镜头（来电、别的 App 抢占）时不要静默黑屏
        if (stream.value === media) {
          status.value = 'unavailable';
          errorReason.value = 'in-use';
        }
      });
      status.value = 'live';
      // 新流是一条新的轨道，之前的 zoom 约束不会跟过来 —— 重新施加一次
      void setZoom(zoom.value);
      return media;
    } catch (error) {
      settled = true;
      if (ticket !== requestTicket) return null;
      errorReason.value = describeCameraError(error);
      status.value = 'unavailable';
      return null;
    }
  }

  async function flip() {
    facing.value = facing.value === 'user' ? 'environment' : 'user';
    // 换镜头 = 换物理模组，倍率与硬件能力都不再成立
    zoom.value = 1;
    digitalZoom.value = 1;
    zoomRange.value = { ...DIGITAL_ZOOM_RANGE };
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

  return {
    stream,
    status,
    errorReason,
    facing,
    supports,
    zoom,
    zoomRange,
    digitalZoom,
    start,
    stop,
    flip,
    setZoom,
    focusAt,
  };
}
