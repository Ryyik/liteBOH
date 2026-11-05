/**
 * 图片编辑器文档模型（发帖图片编辑，2026-11-05；P0 定稿 + P1 滤镜 + 贴纸遮挡）。
 *
 * ── 分层非破坏编辑 ────────────────────────────────────────────────────
 * 原始文件只解码一次（≤2560 的工作位图，见 utils/image-editor-export.js 的
 * createWorkingSource），此后所有编辑都是**命令**：rotate（90° 顺时针）/
 * flip（水平翻转）/ crop（归一化矩形）/ filter（预设 id）/ sticker-*（贴纸）。
 * 预览与导出永远从工作位图重新合成（renderDocToCanvas），中途不产生代际损耗
 * —— 连续旋转 4 次再全部撤销，导出仍与原始文件逐像素同源（唯一一次有损
 * 编码是最终 JPEG 导出）。
 *
 * ── 坐标归一化 0~1 ────────────────────────────────────────────────────
 * crop 的 rect 存 { x, y, width, height }，贴纸存中心点 { x, y } 与宽度比 size，
 * 均归一化到**该命令执行时刻**的画布（即之前所有命令合成后的尺寸）。
 * 归一化让命令语义与分辨率解耦：工作位图换一档尺寸，同一份命令序列仍有效。
 *
 * ⚠️ 裁切必须顺带搬运贴纸：贴纸语义是「贴在最终画面上」，所以 crop 之后再
 * 画贴纸必须落到裁后的坐标系里。foldStickers 在处理 crop 时按同一公式重映射
 * 已有贴纸（拆成两条命令的话，一次裁切要按两次撤销，交互上说不通）。
 *
 * ── 命令栈撤销（上限 30）──────────────────────────────────────────────
 * 命令按顺序 fold；撤销 = pop 尾部命令后整体重渲染。上限 30 是防呆（连点旋转
 * 20 次 + 连贴几张），不是内存预算 —— 单条命令只有几十字节。
 */
import { computed, ref } from 'vue';

/** 撤销栈上限：超过后丢弃最旧的命令（防止无限连点）。 */
export const IMAGE_EDITOR_MAX_COMMANDS = 30;

/** 判定「整幅矩形」的容差：宽高均 ≥ 0.999 视为没裁。 */
export const FULL_RECT_EPSILON = 0.999;

/** 单张贴纸的尺寸下限/上限（占画布宽度比例），模型层的防呆值。 */
export const STICKER_SIZE_RANGE = { min: 0.05, max: 2 };

/** 把任意输入收敛成合法的归一化矩形（越界截断、非法数字归零）。 */
export function clampNormalizedRect(rect = {}) {
  const rawX = Number(rect?.x ?? rect?.left ?? 0);
  const rawY = Number(rect?.y ?? rect?.top ?? 0);
  const rawWidth = Number(rect?.width ?? 0);
  const rawHeight = Number(rect?.height ?? 0);
  const x = Number.isFinite(rawX) ? Math.min(1, Math.max(0, rawX)) : 0;
  const y = Number.isFinite(rawY) ? Math.min(1, Math.max(0, rawY)) : 0;
  const width = Number.isFinite(rawWidth) ? Math.min(1 - x, Math.max(0, rawWidth)) : 0;
  const height = Number.isFinite(rawHeight) ? Math.min(1 - y, Math.max(0, rawHeight)) : 0;
  return { x, y, width, height };
}

/** 矩形是否覆盖整幅（宽高都贴到 1）—— 用于「裁切框没动过就不算编辑」。 */
export function isFullRect(rect = {}) {
  const safe = clampNormalizedRect(rect);
  return safe.width >= FULL_RECT_EPSILON && safe.height >= FULL_RECT_EPSILON;
}

/** 贴纸数值收敛：中心点夹到画面内，尺寸夹到合法区间。 */
export function clampSticker(sticker = {}) {
  const clamp = (value, min, max, fallback) => {
    // Number(null) === 0、Number('') === 0 —— 空值必须当成「没给」，不能当 0 用，
    // 否则贴纸会被静默贴到画面左上角
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };
  return {
    id: String(sticker?.id || ''),
    asset: String(sticker?.asset || ''),
    x: clamp(sticker?.x, 0, 1, 0.5),
    y: clamp(sticker?.y, 0, 1, 0.5),
    size: clamp(sticker?.size, STICKER_SIZE_RANGE.min, STICKER_SIZE_RANGE.max, 0.4),
  };
}

/**
 * 由命令序列推导输出尺寸（纯函数）。
 * 编辑器 UI 显示「导出后 WxH」、以及测试断言都用它，不必真跑 canvas。
 */
export function deriveEditorOutputSize(commands = [], baseWidth = 0, baseHeight = 0) {
  let width = Math.max(0, Math.round(Number(baseWidth) || 0));
  let height = Math.max(0, Math.round(Number(baseHeight) || 0));
  for (const command of Array.isArray(commands) ? commands : []) {
    if (!command || typeof command !== 'object') continue;
    if (command.type === 'rotate') {
      [width, height] = [height, width];
    } else if (command.type === 'crop') {
      const rect = clampNormalizedRect(command.rect);
      width = Math.max(1, Math.round(rect.width * width));
      height = Math.max(1, Math.round(rect.height * height));
    }
  }
  return { width, height };
}

/**
 * 折叠贴纸命令，得到「当前该画在最终画面上的贴纸列表」（纯函数）。
 * crop 会把已有贴纸按裁切矩形重映射（见文件头的坐标口径说明）。
 */
export function foldStickers(commands = []) {
  const stickers = new Map();
  for (const command of Array.isArray(commands) ? commands : []) {
    if (!command || typeof command !== 'object') continue;
    if (command.type === 'sticker-add') {
      const sticker = clampSticker(command);
      if (!sticker.id || !sticker.asset) continue;
      stickers.set(sticker.id, sticker);
    } else if (command.type === 'sticker-update') {
      const current = stickers.get(command.id);
      if (!current) continue;
      stickers.set(command.id, clampSticker({ ...current, ...command }));
    } else if (command.type === 'sticker-remove') {
      stickers.delete(command.id);
    } else if (command.type === 'crop') {
      const rect = clampNormalizedRect(command.rect);
      if (!(rect.width > 0) || !(rect.height > 0)) continue;
      for (const [id, sticker] of stickers) {
        stickers.set(
          id,
          clampSticker({
            ...sticker,
            x: (sticker.x - rect.x) / rect.width,
            y: (sticker.y - rect.y) / rect.height,
            size: sticker.size / rect.width,
          }),
        );
      }
    }
  }
  return [...stickers.values()];
}

/** 当前生效的滤镜 id（后写的覆盖先写的；没有则 'none'）。 */
export function resolveFilterId(commands = []) {
  let filterId = 'none';
  for (const command of Array.isArray(commands) ? commands : []) {
    if (command?.type === 'filter' && typeof command.id === 'string') filterId = command.id;
  }
  return filterId;
}

/**
 * 当前滤镜强度（0~1）。
 * 缺省 1 —— 老数据里没有 strength 字段，按满强度解释才不会让已存的帖子变样。
 * 后写的覆盖先写的，与 resolveFilterId 同一条规则（同一档滤镜反复调强度只留最后一条）。
 */
export function resolveFilterStrength(commands = []) {
  let strength = 1;
  for (const command of Array.isArray(commands) ? commands : []) {
    if (command?.type !== 'filter') continue;
    const value = Number(command.strength);
    strength = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  }
  return strength;
}

/** 命令是否结构合法（防外部注入畸形命令进栈）。 */
export function isValidEditorCommand(command) {
  if (!command || typeof command !== 'object') return false;
  if (command.type === 'rotate' || command.type === 'flip') return true;
  if (command.type === 'crop') {
    const rect = clampNormalizedRect(command.rect);
    return rect.width > 0 && rect.height > 0;
  }
  if (command.type === 'filter') return typeof command.id === 'string' && command.id.length > 0;
  if (command.type === 'sticker-add') {
    const sticker = clampSticker(command);
    return Boolean(sticker.id && sticker.asset);
  }
  if (command.type === 'sticker-update' || command.type === 'sticker-remove') {
    return typeof command.id === 'string' && command.id.length > 0;
  }
  return false;
}

/**
 * 命令栈（响应式壳，纯逻辑在上面几个纯函数里）。
 * `commands` 是 ref 数组；渲染方 watch 它重算预览。
 */
export function useImageEditorDoc() {
  const commands = ref([]);
  const canUndo = computed(() => commands.value.length > 0);
  const commandCount = computed(() => commands.value.length);

  const pushCommand = (command) => {
    if (!isValidEditorCommand(command)) return false;
    const next = [...commands.value, command];
    // 棘轮式截断：只保留最近 MAX 条，最旧的被挤出（不可再撤销）
    if (next.length > IMAGE_EDITOR_MAX_COMMANDS) {
      next.splice(0, next.length - IMAGE_EDITOR_MAX_COMMANDS);
    }
    commands.value = next;
    return true;
  };

  const undo = () => {
    if (!commands.value.length) return null;
    const next = [...commands.value];
    const [removed] = next.splice(next.length - 1, 1);
    commands.value = next;
    return removed || null;
  };

  const reset = () => {
    commands.value = [];
  };

  return { commands, canUndo, commandCount, pushCommand, undo, reset };
}
