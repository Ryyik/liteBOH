/**
 * 底栏选中态跨页接力（2026-10-26）。
 *
 * 底栏在首页 / 我 / 图库各自挂一份。跨模块切换（如首页「内容」→「我」）时，
 * 旧实例卸载、新实例挂载，CSS 的 translateX 过渡没有起点，用户只会看到
 * 选中态直接出现在终点。这里记录点击时的起点，目标底栏挂载/激活后先从起点
 * 渲染一帧，再滑到自己的真实选中席。
 *
 * 契约：
 *   · 只在一次导航内有效；目标不匹配或超时即丢弃，不能影响后续无关导航。
 *   · 状态挂 window：dev 下 UserSpaceBottomNav 有相对路径 / @ 别名两条 import，
 *     模块级变量会各记各的（与入场闩锁同因）。
 *   · prefers-reduced-motion 下不启用接力，直接落终点。
 */

const HANDOFF_KEY = '__bohBottomNavHandoff';
/* 3s：跨页目标可能是异步 chunk（如 Cloud+ 的整页组件），慢网络下底栏会晚于
   路由切换出现。消费端仍用目标席 + 席位数双重校验，过期/不匹配即丢弃。 */
const HANDOFF_TTL_MS = 3000;

const getWindow = () => (typeof window === 'undefined' ? null : window);

const readHandoff = () => {
  const win = getWindow();
  return win ? win[HANDOFF_KEY] || null : null;
};

const writeHandoff = (value) => {
  const win = getWindow();
  if (win) win[HANDOFF_KEY] = value;
};

const clearHandoff = () => {
  const win = getWindow();
  if (win) delete win[HANDOFF_KEY];
};

const prefersReducedMotion = () => {
  const win = getWindow();
  return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
};

/**
 * 记录一次底栏点击的出发点。目标与当前相同则视为无导航，直接清掉旧状态。
 */
export const beginBottomNavHandoff = ({ fromId, toId, fromIndex, navCount }) => {
  if (!getWindow() || fromId === toId || !Number.isInteger(fromIndex) || prefersReducedMotion()) {
    clearHandoff();
    return;
  }
  writeHandoff({
    fromId,
    toId,
    fromIndex,
    navCount: Number(navCount),
    at: Date.now(),
  });
};

/**
 * 源实例卸载 / 被 KeepAlive 停用时刷新时间戳。
 * 点击后可能还要等「保存草稿」确认，真正导航会明显晚于点击；
 * 不刷新会让接力在用户确认期间过期。
 */
export const refreshBottomNavHandoff = ({ fromId, toId } = {}) => {
  const handoff = readHandoff();
  if (!handoff) return;
  if (fromId !== undefined && handoff.fromId !== fromId) return;
  if (toId !== undefined && handoff.toId !== toId) return;
  writeHandoff({ ...handoff, at: Date.now() });
};

/**
 * 目标底栏消费接力。只返回与当前席、当前席数匹配且未超时的记录；
 * 无论是否命中都会清掉，避免脏状态跨导航存活。
 */
export const consumeBottomNavHandoff = ({ toId, navCount }) => {
  const handoff = readHandoff();
  if (!handoff) return null;
  clearHandoff();

  if (Date.now() - Number(handoff.at || 0) > HANDOFF_TTL_MS) return null;
  if (handoff.toId !== toId) return null;
  if (Number(handoff.navCount) !== Number(navCount)) return null;

  const fromIndex = Number(handoff.fromIndex);
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= Number(navCount)) return null;

  return {
    fromId: handoff.fromId,
    toId: handoff.toId,
    fromIndex,
  };
};

/** 仅供单测清理；业务代码不要调用。 */
export const __resetBottomNavHandoffForTests = clearHandoff;
