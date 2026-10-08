/**
 * 头像框状态单源（一期 mock，Phase 2 接 profiles.avatar_frame_url）
 *
 * - 框清单 AVATAR_FRAMES 本地定义；url 为空表示素材未接入，渲染层用 ring 色 CSS 环兜底，
 *   素材到位后只填 url，UI 不动。url 走 public/avatars/frames/（见 plans/avatar-frame-integration-spec.md）。
 * - 佩戴状态双写：本机 localStorage（boh-avatar-frame-id，首屏即读）+ profiles.avatar_frame_url
 *   （跨设备真源）。云同步时机由 initAvatarFrameSync() 注册，**唯一入口**（详见文件尾部）。
 * - 解锁判断：纯本地按订阅档位推导（TIER_RANK），跟 useUserTier 的 tier 走，不新增权益真相源。
 *   限时免费框（freeUntil）由 utils/avatar-frame-campaign.js 统一判定，到期自动回落声明档位。
 *   Phase 2 换成服务端发放的 owned 列表（订阅/活动/商城多来源）。
 * - equippedId 是模块级单例 ref：资产中心顶卡、装扮 tab、弹层三处自动同步。
 */
import { computed, ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger.js';
import { freeUntilMs, resolveFrameTier } from '@/utils/avatar-frame-campaign.js';
import {
  listPublishedAvatarFrames,
  listMyAvatarFrameUnlocks,
} from '@/utils/api/avatar-frames-api.js';

export const AVATAR_FRAME_STORAGE_KEY = 'boh-avatar-frame-id';

/* ── 云同步用到的另外两个本机标记（都不对外暴露，仅本文件读写） ──
 * OWNER   本机佩戴态归属的 userId。换号保护：A 登出、B 登录时，
 *         若无条件「本机有框就上库」，A 的框会被搬到 B 头上（跨账号写脏）。
 * PENDING 尚未成功写进 profiles 的佩戴 id。写库失败、或请求还没回包用户就刷新，
 *         靠它在下次同步补写，不让一次网络抖动把「跨设备一致」永久打掉。
 *         ⚠️ 待补写的框若已不在清单里（运营下架），消费时直接丢弃，不反复重试。
 */
const SYNC_OWNER_KEY = 'boh-avatar-frame-owner';
const SYNC_PENDING_KEY = 'boh-avatar-frame-pending';

export { resolveFrameTier };

/** 框清单。已接入手绘框见 public/avatars/frames/。
 *  scale = 按框缩放（框层边长/头像边长），缺省 1.24（线框版内孔 86-87% 实测适配）；
 *  厚环白框内孔 67.5%，配 1.4（用户拍板）。
 *  口径：保证内孔内接圆 ≥ 头像直径（头像不被框压住），scale ≈ 1/内孔占比；
 *  装饰外扩大的素材先按孔心裁切收紧（sprite 系裁到占比 48%），再按 1/占比 取值。
 *  tier: 'free' = 人人可戴；档位框填 plus/pro/max/ultra 即按订阅档位解锁。
 *  freeUntil: 'YYYY-MM-DD' = 含当日全天限时免费，次日 00:00 起回落到 tier（判定见 avatar-frame-campaign.js）。 */
export const AVATAR_FRAMES = [
  { id: 'none', name: '无框', tier: 'free', ring: '', url: '', desc: '不佩戴任何头像框' },
  {
    id: 'orange-cat',
    name: '橙猫手绘',
    tier: 'free',
    ring: '#e8734a',
    url: '/avatars/frames/orange-cat-frame.png',
    desc: '手绘小猫环绕 · 全员可戴',
  },
  {
    id: 'blue-dog',
    name: '蓝狗手绘',
    tier: 'free',
    ring: '#4aa8e8',
    url: '/avatars/frames/blue-dog-frame.png',
    desc: '手绘小狗环绕 · 全员可戴',
  },
  {
    id: 'white-cat',
    name: '白绒猫',
    tier: 'free',
    ring: '#f0e8e0',
    url: '/avatars/frames/white-cat-frame.png',
    scale: 1.4,
    desc: '白色毛绒厚环 · 深色主题尤其出彩',
  },
  {
    id: 'hamster',
    name: '仓鼠瓜子',
    tier: 'free',
    ring: '#c9a06a',
    url: '/avatars/frames/hamster-frame.png?v=3',
    scale: 1.61,
    desc: '手绘仓鼠白盘嗑瓜子 · 全员可戴',
  },
  {
    id: 'cow',
    name: '奶牛抱抱',
    tier: 'free',
    ring: '#cfcfd6',
    url: '/avatars/frames/cow-frame.png',
    scale: 1.6,
    desc: '手绘奶牛趴圈环抱 · 深色主题尤其出彩',
  },
  // ── Ultra 专属（首发 7 天限时免费，到期自动转 Ultra）──
  {
    id: 'elf-flower',
    name: '菊花梨',
    tier: 'ultra',
    freeUntil: '2026-09-25',
    ring: '#e8734a',
    url: '/avatars/frames/elf-flower-frame.png',
    scale: 2.08,
    desc: '暖橙花瓣环绕 · 果子坐镇花芯',
  },
  {
    id: 'elf-grass',
    name: '奇丽草',
    tier: 'ultra',
    freeUntil: '2026-09-25',
    ring: '#7fb069',
    url: '/avatars/frames/elf-grass-frame.png',
    scale: 2.08,
    desc: '青绿草环 · 蝴蝶伴飞',
  },
  // ── 档位框候选（素材待定，取消注释即上架）──
  // { id: 'plus-ragdoll', name: '布偶蓝铃', tier: 'plus', ring: '#0071e3', url: '', desc: 'Plus 档专属 · 蓝色项圈小铃铛' },
  // { id: 'pro-silver', name: '银渐层', tier: 'pro', ring: '#9aa3b2', url: '', desc: 'Pro 档专属 · 银灰围脖猫爪' },
  // { id: 'max-golden', name: '金毛寻回', tier: 'max', ring: '#e8930c', url: '', desc: 'Max 档专属 · 金色项圈吊牌' },
  // { id: 'ultra-rainbow', name: '三花彩虹', tier: 'ultra', ring: 'rainbow', url: '', desc: 'Ultra 专属 · 彩虹围巾双拼' },
  // { id: 'limit-anniversary', name: '周年像素', tier: 'limit', ring: '#d85a30', url: '', limited: true, desc: '八周年活动限定' }
];

/** 解锁档位排序（limit 限定不走 rank，一期 mock 默认已解锁，Phase 2 由服务端发放） */
const TIER_RANK = { free: 0, plus: 1, pro: 2, max: 3, ultra: 4 };

/** 素材 URL 去版本参数（?v=N）——库中存量 url 无 query，反查清单时按路径匹配 */
const stripUrlQuery = (u) => String(u || '').split('?')[0];

/**
 * 时间片单例：限免框到期要自动切档，不能只在挂载时算一次。
 * 到期即刻刷新（+0.5s 余量），刷新后再排下一次，页面长开也能按时切换。
 */
const nowMs = ref(Date.now());
function scheduleFreeUntilRefresh() {
  const upcoming = AVATAR_FRAMES.map(freeUntilMs).filter((t) => t !== null && t > nowMs.value);
  if (!upcoming.length) return;
  const delay = Math.min(...upcoming) - Date.now() + 500;
  if (delay <= 0) return;
  setTimeout(
    () => {
      nowMs.value = Date.now();
      scheduleFreeUntilRefresh();
    },
    Math.min(delay, 2147480000),
  );
}
if (typeof window !== 'undefined') scheduleFreeUntilRefresh();

/* ─────────── 清单来源：DB 优先，内置兜底 ───────────
 * 内置 AVATAR_FRAMES 同时是「种子数据」和「降级路径」：DB 拉不到（未登录/离线/抖动）时
 * 全站框不能集体消失，此时直接返回内置清单。合并规则：
 *   - 'none'（无框占位）恒在最前，DB 里不存在
 *   - DB 行按 sort_order 排在中间，同 id 覆盖内置行（运营改了价/档位以 DB 为准）
 *   - 内置里 DB 没有的（尚未入库的兜底框）排到末尾
 */
const remoteFrames = ref([]);
const listState = ref('idle'); // idle | loading | ready | failed
const purchasedIds = ref(new Set()); // 服务端「积分解锁」集合（永久）

/** 合并后的清单（同步读，供 getFrameById / 渲染反查） */
export function allAvatarFrames() {
  const remote = remoteFrames.value;
  if (!remote.length) return AVATAR_FRAMES;
  const remoteIds = new Set(remote.map((f) => f.id));
  const builtinOnly = AVATAR_FRAMES.filter((f) => !remoteIds.has(f.id));
  return [
    ...builtinOnly.filter((f) => f.id === 'none'),
    ...remote,
    ...builtinOnly.filter((f) => f.id !== 'none'),
  ];
}

/** 加载清单与「我的已购」。失败只记日志并回退内置清单，绝不阻塞佩戴。
 *
 * single-flight：同一时刻的重复调用共用同一个在途 promise。
 * ⚠️ 云同步的 url→id 反查**依赖 DB 行**（内置清单里没有运营新增框，
 * 且同一 slug 的 url 可能已被运营在控制台改过），所以 sync 必须能真正「等到清单就位」——
 * 旧写法在 loading 时直接返回字符串 'loading'，调用方 await 到的是状态不是结果，等于没等。
 */
let loadInFlight = null;
export async function loadAvatarFrameData({ force = false } = {}) {
  if (loadInFlight) return loadInFlight;
  if (!force && listState.value === 'ready') return listState.value;
  listState.value = 'loading';
  loadInFlight = (async () => {
    try {
      const listRes = await listPublishedAvatarFrames();
      if (listRes?.ok && Array.isArray(listRes.data) && listRes.data.length) {
        remoteFrames.value = listRes.data;
      }
      await refreshMyAvatarFrameUnlocks();
      listState.value = 'ready';
    } catch (err) {
      listState.value = 'failed';
      logger.warn('avatar-frame', '清单加载失败，回退内置清单:', err);
    }
    return listState.value;
  })();
  try {
    return await loadInFlight;
  } finally {
    loadInFlight = null;
  }
}

/** 清单是否可用于 url→id 反查：必须含 DB 行（只有内置清单时不能拿它当真相源） */
function isFrameListAuthoritative() {
  return listState.value === 'ready' && remoteFrames.value.length > 0;
}

/** 刷新「我的积分解锁」（购买成功后调用；未登录静默跳过） */
export async function refreshMyAvatarFrameUnlocks() {
  // 未登录跳过：anon 调 list_my_avatar_frame_unlocks 恒返回 []（2026-09-29 线上实测），
  // 白付一个 RTT；此处注释历来写「未登录静默跳过」，本次让行为与注释对齐。
  // 同时清空本地集合，保证登出后不残留上一个账号的解锁态。
  if (!useAuthStore().isLoggedIn) {
    purchasedIds.value = new Set();
    return { ok: true, data: [] };
  }
  try {
    const res = await listMyAvatarFrameUnlocks();
    if (res?.ok) purchasedIds.value = new Set(res.data);
    return res;
  } catch (err) {
    logger.warn('avatar-frame', '已购清单加载失败:', err);
    return { ok: false, data: [] };
  }
}

/** 测试/管理端用：直接注入清单（避免为了跑一条断言去 mock 网络） */
export function __setRemoteFramesForTest(list) {
  remoteFrames.value = Array.isArray(list) ? list : [];
  listState.value = 'ready';
}

export function getFrameById(id) {
  const list = allAvatarFrames();
  return list.find((f) => f.id === id) || list[0] || AVATAR_FRAMES[0];
}

/** 已解锁判定：内置档位推导 ∪ 限免窗口 ∪ 服务端积分解锁（永久） */
export function ownedIdsForTier(tierCode, now = Date.now(), purchased = purchasedIds.value) {
  const tier = TIER_RANK[tierCode] >= 0 ? tierCode : 'free';
  return allAvatarFrames()
    .filter(
      (f) =>
        f.id === 'none' ||
        f.limited ||
        purchased.has(f.id) ||
        TIER_RANK[tier] >= TIER_RANK[resolveFrameTier(f, now)],
    )
    .map((f) => f.id);
}

/** 本机标记读写：隐私模式 / 配额满等场景一律静默，绝不让存储异常打断佩戴 */
function readRaw(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeRaw(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* 静默 */
  }
}

function readStoredId() {
  return getFrameById(readRaw(AVATAR_FRAME_STORAGE_KEY))?.id || 'none';
}

/** 佩戴 url 反查清单行：先按去版本参数的完整路径匹配，再退一步按文件名兜底 */
function findFrameByUrl(url) {
  const target = stripUrlQuery(url);
  if (!target) return null;
  const list = allAvatarFrames();
  const exact = list.find((f) => f.url && stripUrlQuery(f.url) === target);
  if (exact) return exact;
  const targetBase = target.split('/').pop();
  if (!targetBase) return null;
  return list.find((f) => f.url && stripUrlQuery(f.url).split('/').pop() === targetBase) || null;
}

/** 模块级单例：三处入口共享同一佩戴状态 */
const equippedId = ref(readStoredId());

/**
 * @param {import('vue').Ref<string>} [tierCodeRef] 档位 code ref（如 useUserTier 的 tierCode）。
 * 传入后 effectiveFrame 会做持有校验（档位降级/到期时自动回落到「无框」）；不传则原样返回 equipped。
 */
export function useAvatarFrame(tierCodeRef = ref('free')) {
  /** 响应式清单（DB 加载完成后组件自动重渲染） */
  const frames = computed(() => allAvatarFrames());

  // 依赖 nowMs（限免到期）与 purchasedIds（购买成功）自动重算持有列表
  const ownedIds = computed(() =>
    ownedIdsForTier(tierCodeRef.value, nowMs.value, purchasedIds.value),
  );

  /** 佩戴合法性校验后的当前框（不持有 → 回落无框）。Phase 2 的到期回收走同一出口 */
  const effectiveFrame = computed(() => {
    const frame = getFrameById(equippedId.value);
    return ownedIds.value.includes(frame.id) ? frame : AVATAR_FRAMES[0];
  });

  /** 框在当前时刻生效的档位：限免期内 'free'，到期回落到声明档位 */
  const tierOf = (frame) => resolveFrameTier(frame, nowMs.value);

  function equip(id) {
    const frame = getFrameById(id);
    if (frame.id !== 'none' && !ownedIds.value.includes(frame.id)) return false;
    equippedId.value = frame.id;
    writeRaw(AVATAR_FRAME_STORAGE_KEY, frame.id);
    // 意图先落盘：请求还没回包用户就刷新/关页，下次同步也会把这次佩戴补上库
    writeRaw(SYNC_PENDING_KEY, frame.id);
    void persistFrameToServer(frame);
    return true;
  }

  return {
    frames,
    purchasedIds,
    allFrames: allAvatarFrames,
    listState,
    loadAvatarFrameData,
    refreshMyAvatarFrameUnlocks,
    equippedId,
    effectiveFrame,
    nowMs,
    tierOf,
    ownedIds,
    equip,
    getFrameById,
  };
}

/** 佩戴框上库（profiles.avatar_frame_url）；未登录静默跳过。
 *  失败（含请求未回包就刷新）留下 PENDING 标记，由下次同步补写 —— 不回滚本地，
 *  本机仍是用户刚点的那个框，界面不会「点完自己弹回去」。 */
async function persistFrameToServer(frame) {
  const id = frame?.id || 'none';
  const url = id === 'none' ? '' : frame.url || '';
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    writeRaw(SYNC_OWNER_KEY, String(user.id || ''));
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_frame_url: url })
      .eq('id', user.id);
    if (error) {
      if (url) writeRaw(SYNC_PENDING_KEY, id);
      logger.warn('avatar-frame', '佩戴框上库失败:', error);
      return false;
    }
    writeRaw(SYNC_PENDING_KEY, '');
    return true;
  } catch (err) {
    if (url) writeRaw(SYNC_PENDING_KEY, id);
    logger.warn('avatar-frame', '佩戴框上库异常:', err);
    return false;
  }
}

/** 登出 / 换号：清掉本机佩戴态与两个同步标记。
 *  归属随账号走 —— 框不能留在设备上被下一个登录的人继承。 */
export function resetAvatarFrameLocal() {
  equippedId.value = 'none';
  writeRaw(AVATAR_FRAME_STORAGE_KEY, 'none');
  writeRaw(SYNC_OWNER_KEY, '');
  writeRaw(SYNC_PENDING_KEY, '');
}

/** 登录后同步：库为准补本机，本机有而库空则上库（多设备一致性）。返回是否生效。
 *
 * 并发去重：auth 事件（SIGNED_IN / USER_UPDATED / INITIAL_SESSION）几乎同时到达，
 * 不去重会在同一秒内打出三份完全一样的读写。 */
let syncInFlight = null;
export function syncAvatarFrameFromServer() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSyncAvatarFrameFromServer().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSyncAvatarFrameFromServer() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const uid = String(user.id || '');

    // 换号保护：本机这份佩戴态属于上一个账号 → 丢弃，不让它有机会被上库
    const owner = readRaw(SYNC_OWNER_KEY);
    if (owner && owner !== uid) {
      equippedId.value = 'none';
      writeRaw(AVATAR_FRAME_STORAGE_KEY, 'none');
      writeRaw(SYNC_PENDING_KEY, '');
    }
    writeRaw(SYNC_OWNER_KEY, uid);

    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_frame_url')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    const serverUrl = String(data?.avatar_frame_url || '').trim();

    // 最后一次没写成功的佩戴：本机为准补写，否则服务端旧值会把本机新框盖回去
    const pendingId = readRaw(SYNC_PENDING_KEY);
    if (pendingId) {
      if (pendingId === 'none') {
        // 「卸下框」意图：不需要清单，服务端还挂着就清掉
        if (serverUrl) {
          await persistFrameToServer(getFrameById('none'));
          return true;
        }
        writeRaw(SYNC_PENDING_KEY, '');
      } else {
        // 判定「框是否已下架」要用含 DB 行的清单；拿不到就留着标记下次再判，
        // 不能拿内置清单硬判（运营新增框在内置清单里本来就不存在 → 会被误清）
        if (!isFrameListAuthoritative()) await loadAvatarFrameData({ force: true });
        if (!isFrameListAuthoritative()) return false;
        if (!allAvatarFrames().some((f) => f.id === pendingId)) {
          writeRaw(SYNC_PENDING_KEY, ''); // 框已下架：丢弃标记，不反复重试
        } else {
          const pf = getFrameById(pendingId);
          if (stripUrlQuery(pf.url || '') !== stripUrlQuery(serverUrl)) {
            await persistFrameToServer(pf);
            return true;
          }
          writeRaw(SYNC_PENDING_KEY, '');
        }
      }
    }

    if (serverUrl) {
      // 反查只能拿「含 DB 行」的清单做。清单还没到位（首屏 idle 拉取未回 / 上次失败）
      // 就强制补拉一次；再拿不到就**干脆不动本机** —— 内置清单缺运营新增框、
      // 也缺被改过 url 的老框，硬比会把「戴着的框」误判成「无框」再覆盖本机。
      if (!isFrameListAuthoritative()) await loadAvatarFrameData({ force: true });
      if (!isFrameListAuthoritative()) {
        logger.warn('avatar-frame', '清单不可用，跳过佩戴框反查（保留本机）');
        return false;
      }
      const frame = findFrameByUrl(serverUrl);
      if (!frame) {
        logger.warn('avatar-frame', '服务端佩戴 url 反查不到清单行，保留本机:', serverUrl);
        return false;
      }
      if (frame.id !== equippedId.value) {
        equippedId.value = frame.id;
        writeRaw(AVATAR_FRAME_STORAGE_KEY, frame.id);
      }
      return true;
    }

    // 库空而本机戴了框 → 首次上库（存量用户升级到带同步版本时的回填）
    const local = getFrameById(equippedId.value);
    if (local.id !== 'none' && local.url) {
      await persistFrameToServer(local);
    }
    return false;
  } catch (err) {
    logger.warn('avatar-frame', '佩戴框同步失败:', err);
    return false;
  }
}

/** 云同步的唯一注册点：登录态确立后对齐本机，登出清本机。
 *
 * ⚠️ 此前同步只挂在 UserSpace 页 onMounted —— 新设备登录后不进「我的」页就永远不同步，
 * 表现为「换个设备头像框没了」（2026-10-06 修复）。挂到 auth 事件上后，任何页面都一致。
 */
let syncInitDone = false;
export function initAvatarFrameSync() {
  if (syncInitDone) return;
  syncInitDone = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      resetAvatarFrameLocal();
      return;
    }
    if (!session?.user) return;
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
      // supabase-js 明令：回调里不要 await 其它 auth 调用（可能死锁）→ 挪出当前调用栈
      setTimeout(() => {
        void syncAvatarFrameFromServer();
      }, 0);
    }
  });

  // 冷启动已登录：INITIAL_SESSION 可能在订阅之前就发过了，这里补一次兜底。
  void syncAvatarFrameFromServer();
}

/**
 * 渲染点通用解析：作者头像该不该带框、带哪个。
 * - 自己（authorId === 当前用户）→ 本地佩戴状态（即换即见，不等上库）
 * - 他人 → 数据里的 frame_url 反查清单拿 scale；未知 url 兜底 1.24
 * @returns {{ url: string, scale: number } | null} null = 不渲染框
 */
export function resolveFrameForAuthor(frameUrl, authorId) {
  const authStore = useAuthStore();
  const meId = authStore.userInfo?.id;
  if (meId && authorId && authorId === meId) {
    const frame = getFrameById(equippedId.value);
    return frame.url ? { url: frame.url, scale: frame.scale || 1.24 } : null;
  }
  const url = String(frameUrl || '').trim();
  if (!url) return null;
  return { url, scale: findFrameByUrl(url)?.scale || 1.24 };
}
