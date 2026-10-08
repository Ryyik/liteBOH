/**
 * 音效 —— plans/026 P0-6
 *
 * 旧实现的问题：`playTone` 里`catch { soundEnabled.value = false }`。
 * 一次 AudioContext 创建失败（用户还没交互过、或系统限流）就会**永久静默**，
 * 而且没有提示 —— 玩家会以为「这游戏没声音」而不是「浏览器拦了」。
 * 现在：失败只标记 unavailable 并由UI 提示，不再篡改用户的音效开关。
 *
 * 音色也从纯正弦「哔」改成按语义区分的包络，让听觉反馈能承载信息：
 * 成功是上行大三度、失败是下行小二度、设备声是低频噪声感。
 */

const TONES = {
  tap: { freq: 520, type: 'sine', duration: 0.08, gain: 0.024 },
  machine: { freq: 128, type: 'triangle', duration: 0.16, gain: 0.03 },
  pump: { freq: 260, type: 'square', duration: 0.06, gain: 0.018 },
  success: { freq: 660, type: 'sine', duration: 0.16, gain: 0.03, glide: 1.33 },
  perfect: { freq: 784, type: 'sine', duration: 0.22, gain: 0.032, glide: 1.5 },
  error: { freq: 160, type: 'sawtooth', duration: 0.18, gain: 0.026, glide: 0.75 },
  purr: { freq: 104, type: 'triangle', duration: 0.24, gain: 0.022 },
};

let audioContext = null;
let unavailable = false;

function ensureContext() {
  if (unavailable || typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    audioContext = new Ctor();
    return audioContext;
  } catch {
    // 只标记不可用，不动调用方的开关状态
    unavailable = true;
    return null;
  }
}

/**
 * 播一个音。
 * @param {keyof TONES} kind
 * @param {boolean} enabled 用户的音效开关
 * @returns {boolean} 是否真的发声了
 */
export function playSfx(kind, enabled) {
  if (!enabled) return false;
  const context = ensureContext();
  if (!context) return false;
  const tone = TONES[kind] || TONES.tap;
  // 浏览器常在未交互时挂起 context，resume 失败就跳过这一声
  if (context.state === 'suspended') context.resume?.().catch(() => {});
  try {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.freq, now);
    if (tone.glide)
      oscillator.frequency.exponentialRampToValueAtTime(
        tone.freq * tone.glide,
        now + tone.duration * 0.8,
      );
    // 快起慢落包络，避免「咔哒」声
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(tone.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + tone.duration + 0.02);
    return true;
  } catch {
    return false;
  }
}

/** 供 UI 判断是否要提示「音效不可用」 */
export function isSfxUnavailable() {
  return unavailable;
}

/** 测试用：重置模块内状态 */
export function resetSfxForTest() {
  audioContext = null;
  unavailable = false;
}

export const SFX_KINDS = Object.keys(TONES);
