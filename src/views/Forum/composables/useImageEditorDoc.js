/**
 * 图片编辑器文档模型（发帖图片编辑 P0，2026-11-05 定稿方案）。
 *
 * ── 分层非破坏编辑 ────────────────────────────────────────────────────
 * 原始文件只解码一次（≤2560 的工作位图，见 utils/image-editor-export.js 的
 * createWorkingSource），此后所有编辑都是**命令**：rotate（90° 顺时针）/
 * flip（水平翻转）/ crop（归一化矩形）。预览与导出永远从工作位图重新合成
 * （renderDocToCanvas），中途不产生代际损耗 —— 连续旋转 4 次再全部撤销，
 * 导出仍与原始文件逐像素同源（唯一一次有损编码是最终 JPEG 导出）。
 *
 * ── 坐标归一化 0~1 ────────────────────────────────────────────────────
 * crop 的 rect 存 { x, y, width, height }，均归一化到**该命令执行时刻**的画布
 * （即之前所有命令合成后的尺寸）。归一化让命令语义与分辨率解耦：工作位图
 * 换一档尺寸，同一份命令序列仍有效。
 *
 * ── 命令栈撤销（上限 30）──────────────────────────────────────────────
 * 命令按顺序 fold；撤销 = pop 尾部命令后整体重渲染。上限 30 是防呆（连点旋转
 * 20 次），不是内存预算 —— 单条命令只有几十字节。
 */
import { computed, ref } from 'vue';

/** 撤销栈上限：超过后丢弃最旧的命令（防止无限连点）。 */
export const IMAGE_EDITOR_MAX_COMMANDS = 30;

/** 判定「整幅矩形」的容差：宽高均 ≥ 0.999 视为没裁。 */
export const FULL_RECT_EPSILON = 0.999;

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

/** 命令是否结构合法（防外部注入畸形命令进栈）。 */
export function isValidEditorCommand(command) {
  if (!command || typeof command !== 'object') return false;
  if (command.type === 'rotate' || command.type === 'flip') return true;
  if (command.type === 'crop') {
    const rect = clampNormalizedRect(command.rect);
    return rect.width > 0 && rect.height > 0;
  }
  return false;
}

/**
 * 命令栈（响应式壳，纯逻辑在上面四个纯函数里）。
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
