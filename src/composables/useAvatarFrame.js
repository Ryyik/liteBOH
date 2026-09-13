/**
 * 头像框状态单源（一期 mock，Phase 2 接 profiles.avatar_frame_url）
 *
 * - 框清单 AVATAR_FRAMES 本地定义；url 为空表示素材未接入，渲染层用 ring 色 CSS 环兜底，
 *   素材到位后只填 url，UI 不动。url 走 public/avatars/frames/（见 plans/avatar-frame-integration-spec.md）。
 * - 佩戴状态持久化 localStorage（boh-avatar-frame-id）；Phase 2 换成 profiles 表字段 + 服务端校验。
 * - 解锁判断：纯本地按订阅档位推导（TIER_RANK），跟 useUserTier 的 tier 走，不新增权益真相源。
 *   Phase 2 换成服务端发放的 owned 列表（订阅/活动/商城多来源）。
 * - equippedId 是模块级单例 ref：资产中心顶卡、装扮 tab、弹层三处自动同步。
 */
import { computed, ref } from 'vue';
import { supabase } from '@/utils/supabase-client.js';
import { useAuthStore } from '@/stores/auth';
import { logger } from '@/utils/logger.js';

export const AVATAR_FRAME_STORAGE_KEY = 'boh-avatar-frame-id';

/** 框清单。已接入手绘框见 public/avatars/frames/。
 *  scale = 按框缩放（框层边长/头像边长），缺省 1.24（线框版内孔 86-87% 实测适配）；
 *  厚环白框内孔 67.5%，配 1.4（用户拍板）。
 *  用户指示：暂不做档位归属，tier: 'free' = 人人可戴；要绑档位改 tier 字段即可（plus/pro/max/ultra）。 */
export const AVATAR_FRAMES = [
  { id: 'none', name: '无框', tier: 'free', ring: '', url: '', desc: '不佩戴任何头像框' },
  { id: 'orange-cat', name: '橙猫手绘', tier: 'free', ring: '#e8734a', url: '/avatars/frames/orange-cat-frame.png', desc: '手绘小猫环绕 · 全员可戴' },
  { id: 'blue-dog', name: '蓝狗手绘', tier: 'free', ring: '#4aa8e8', url: '/avatars/frames/blue-dog-frame.png', desc: '手绘小狗环绕 · 全员可戴' },
  { id: 'white-cat', name: '白绒猫', tier: 'free', ring: '#f0e8e0', url: '/avatars/frames/white-cat-frame.png', scale: 1.4, desc: '白色毛绒厚环 · 深色主题尤其出彩' },
  { id: 'hamster', name: '仓鼠瓜子', tier: 'free', ring: '#c9a06a', url: '/avatars/frames/hamster-frame.png?v=3', scale: 1.61, desc: '手绘仓鼠白盘嗑瓜子 · 全员可戴' },
  { id: 'cow', name: '奶牛抱抱', tier: 'free', ring: '#cfcfd6', url: '/avatars/frames/cow-frame.png', scale: 1.6, desc: '手绘奶牛趴圈环抱 · 深色主题尤其出彩' }
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

export function getFrameById(id) {
  return AVATAR_FRAMES.find((f) => f.id === id) || AVATAR_FRAMES[0];
}

/** 一期 mock：按档位推导已解锁列表。Phase 2 替换为服务端 owned 数据 */
export function ownedIdsForTier(tierCode) {
  const tier = TIER_RANK[tierCode] >= 0 ? tierCode : 'free';
  return AVATAR_FRAMES
    .filter((f) => f.id === 'none' || f.limited || TIER_RANK[tier] >= TIER_RANK[f.tier])
    .map((f) => f.id);
}

function readStoredId() {
  try {
    const id = localStorage.getItem(AVATAR_FRAME_STORAGE_KEY);
    return getFrameById(id)?.id || 'none';
  } catch {
    return 'none';
  }
}

/** 模块级单例：三处入口共享同一佩戴状态 */
const equippedId = ref(readStoredId());

/**
 * @param {import('vue').Ref<string>} [tierCodeRef] 档位 code ref（如 useUserTier 的 tierCode）。
 * 传入后 effectiveFrame 会做持有校验（档位降级/到期时自动回落到「无框」）；不传则原样返回 equipped。
 */
export function useAvatarFrame(tierCodeRef = ref('free')) {
  const ownedIds = computed(() => ownedIdsForTier(tierCodeRef.value));

  /** 佩戴合法性校验后的当前框（不持有 → 回落无框）。Phase 2 的到期回收走同一出口 */
  const effectiveFrame = computed(() => {
    const frame = getFrameById(equippedId.value);
    return ownedIds.value.includes(frame.id) ? frame : AVATAR_FRAMES[0];
  });

  function equip(id) {
    const frame = getFrameById(id);
    if (frame.id !== 'none' && !ownedIds.value.includes(frame.id)) return false;
    equippedId.value = frame.id;
    try {
      localStorage.setItem(AVATAR_FRAME_STORAGE_KEY, frame.id);
    } catch { /* 隐私模式等场景静默 */ }
    void persistFrameToServer(frame);
    return true;
  }

  return {
    frames: AVATAR_FRAMES,
    equippedId,
    effectiveFrame,
    ownedIds,
    equip,
    getFrameById
  };
}

/** 佩戴框上库（profiles.avatar_frame_url）；未登录静默跳过。失败仅记日志，不回滚本地（下次登录同步会纠正） */
async function persistFrameToServer(frame) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_frame_url: frame.id === 'none' ? '' : (frame.url || '') })
      .eq('id', user.id);
    if (error) logger.warn('avatar-frame', '佩戴框上库失败:', error);
  } catch (err) {
    logger.warn('avatar-frame', '佩戴框上库异常:', err);
  }
}

/** 登录后同步：库为准补本地，本地有而库空则上库（多设备一致性）。返回是否生效 */
export async function syncAvatarFrameFromServer() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_frame_url')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    const serverUrl = String(data?.avatar_frame_url || '').trim();
    if (serverUrl) {
      const frame = AVATAR_FRAMES.find((f) => stripUrlQuery(f.url) === stripUrlQuery(serverUrl));
      const serverId = frame?.id || 'none';
      if (serverId !== equippedId.value) {
        equippedId.value = serverId;
        try { localStorage.setItem(AVATAR_FRAME_STORAGE_KEY, serverId); } catch { /* 静默 */ }
      }
      return true;
    }
    // 库空而本地戴了框 → 首次上库
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
    const known = AVATAR_FRAMES.find((f) => stripUrlQuery(f.url) === stripUrlQuery(url));
    return { url, scale: known?.scale || 1.24 };
}
