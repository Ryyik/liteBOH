/**
 * 商城「拖拽排序」的纯逻辑 —— 与 DOM / 网络无关，单独放出来是为了能被单测钉住。
 *
 * 为什么值得单独一个文件：落点计算是这套交互里唯一「错了也不报错」的部分 ——
 * 算偏一格的表现是「拖到 A 和 B 之间，结果插到了 B 后面」，没有异常、没有红字，
 * 只能靠人反复拖才发现。把它抽成纯函数 + 单测，比在组件里点一百次都可靠。
 */

/**
 * 根据各卡片的包围盒与指针纵坐标，算出「松手后应该插到第几位」。
 *
 * @param {Array<{top:number,height:number}>} rects 拖拽开始时各卡片的包围盒（**含**被拖那张）
 * @param {number} fromIndex 被拖卡片在列表里的下标
 * @param {number} pointerY 当前指针的纵坐标（clientY）
 * @returns {number} 插入下标，语义 = 「先 splice(fromIndex,1) 再 splice(结果,0,item)」
 *
 * 口径：以**其他卡片的中线**为分界 —— 指针越过谁的中间，就落到谁的那一侧。
 * 不用固定步长，是因为三种卡片形态高度不同（小卡 / 横幅 / 大图），
 * 固定步长在混排里必然算错。
 */
export const resolveDropIndex = (rects, fromIndex, pointerY) => {
  const list = Array.isArray(rects) ? rects : [];
  if (list.length <= 1) return 0;

  const others = list
    .map((rect, i) => ({ i, mid: Number(rect?.top || 0) + Number(rect?.height || 0) / 2 }))
    .filter((item) => item.i !== fromIndex);

  const insertAt = others.findIndex((item) => pointerY < item.mid);
  return insertAt === -1 ? others.length : insertAt;
};

/**
 * 把一行从 `from` 移动到 `to`（splice 语义：先删后插）。
 * 返回新数组，不改原数组 —— 调用方拿到的 `next` 可以直接喂给落库流程。
 * 越界下标一律夹到合法区间：一次异常手势不该把整张表写成乱序。
 *
 * @param {Array} list 原列表
 * @param {number} from 被移动行的下标
 * @param {number} to 目标下标（去掉该行之后的插入位置）
 */
export const reorderList = (list, from, to) => {
  const source = Array.isArray(list) ? list.slice() : [];
  if (source.length <= 1) return source;
  const start = Math.max(0, Math.min(Number(from) || 0, source.length - 1));
  const target = Math.max(0, Math.min(Number(to) || 0, source.length - 1));
  if (start === target) return source;
  const [moved] = source.splice(start, 1);
  source.splice(target, 0, moved);
  return source;
};
