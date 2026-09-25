/**
 * 数据管理面板「跳转意图」跨重建暂存
 *
 * 为什么需要它：
 *   路由组件 key = route.fullPath（见 App.vue 的 <component :key>），而 DataAdmin 的
 *   switchTab 会把 section/tab 写回 URL query。于是「切表」这个动作本身就会让整个
 *   DataAdmin 组件销毁重建 —— 组件内的 searchQuery 不属于 URL，重建后归零，
 *   onMounted 的 fetchData() 会以空关键词再查一次，把刚带过滤的结果覆盖成全量列表。
 *   症状：抽奖列表点「名单」跳到报名记录后，看到的是全表数据、翻页也翻不到目标记录。
 *
 * 方案：
 *   把「显式跳转携带的关键词」放进模块级暂存（不随组件销毁），组件初始化时消费一次。
 *   刻意不写进 URL：URL 一旦带 search，用户每次改搜索词都会改 query 进而触发重建，
 *   而实时输入搜索是高频操作，不能承受组件重建。
 *
 * 过期保护：
 *   跳转引发的重建发生在几十毫秒内。若某次设置后组件并未重建（例如 URL 已一致、
 *   反向 watcher 提前 return），暂存会残留；用 TTL 让它自然失效，避免脏关键词
 *   污染后续某次无关的重建。
 */

const JUMP_INTENT_TTL_MS = 3000;

let pendingSearch = '';
let pendingAt = 0;

/** 记录一次显式跳转要落在的关键词（空值视为清除） */
export const setAdminTabJumpSearch = (value) => {
  const normalized = String(value || '').trim();
  pendingSearch = normalized;
  pendingAt = normalized ? Date.now() : 0;
};

/** 组件初始化时消费一次；过期或未设置时返回空串 */
export const consumeAdminTabJumpSearch = () => {
  const value = pendingSearch;
  const fresh = pendingAt > 0 && Date.now() - pendingAt <= JUMP_INTENT_TTL_MS;
  pendingSearch = '';
  pendingAt = 0;
  return fresh ? value : '';
};
