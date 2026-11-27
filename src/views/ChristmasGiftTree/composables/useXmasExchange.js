/**
 * 圣诞交换礼物的状态机与数据适配层。
 *
 * 两条通道：
 *  · **远端**（默认在线上跑）：走 xmas_* 六个函数，报名/退出/揭晓全由服务端裁决，
 *    名单是所有人的公共状态 —— 换台设备、换个人打开，看到的是同一棵树。
 *  · **本地演示**：后端不可用时（本地没连库、迁移没推）保留一份假名单，
 *    让页面能看能点，但**不假装报名成功**——`backendReady` 会一直是 false，
 *    管理台据此提示「先执行迁移」。
 *
 * 关键约束（改代码前先读这三条）：
 *   · 揭晓前不请求对方身份。`xmas_my_result` 在 reveal_at 之前只返回时间，
 *     前端没有第二条路能拿到配对（matches 表没有 select 策略）。
 *   · 退出只把状态置 left，挂位不回收：`slotCount` 来自服务端的最大 slot + 1，
 *     否则中间有人一退，后面所有人的头像会整体往上挪一格。
 *   · 倒计时只是展示。到点必须重新问一次服务端，不能靠本地时钟自己把结果翻出来。
 */
import { computed, onScopeDispose, ref } from 'vue';

import {
  XMAS_EVENT_FALLBACK,
  fetchXmasMyResult,
  fetchXmasRoster,
  joinXmas,
  leaveXmas,
} from '@/utils/api/xmas-exchange-api.js';

export const XMAS_EVENT = {
  slug: 'christmas-2026',
  /** 圣诞前 5 天：12 月 20 日 20:00 揭晓 */
  revealAt: '2026-12-20T20:00:00+08:00',
  /** 留半小时收尾，避免有人 19:59 卡点进来导致配对正在进行 */
  signupDeadline: '2026-12-20T19:30:00+08:00',
  /** 活动规模就是二十来人，树按 20 个位置设计；再多会挤成一团 */
  treeCapacity: 20,
};

const REVEAL_MS = new Date(XMAS_EVENT.revealAt).getTime();
const DEADLINE_MS = new Date(XMAS_EVENT.signupDeadline).getTime();

/** 参与者最少 1 位，露出「已经有人挂上去了」，但不要抢主角 */
const MOCK_PEOPLE = [
  { id: 'u-zhi', name: '栀子', tone: ['#f2b8c6', '#c9728c'] },
  { id: 'u-man', name: '小满', tone: ['#f6d68a', '#d79b3e'] },
  { id: 'u-yu', name: '阿屿', tone: ['#9fd3e8', '#4d8fae'] },
  { id: 'u-lin', name: '林深', tone: ['#a9cf9b', '#5d8f4e'] },
  { id: 'u-ju', name: '橘子汽水', tone: ['#f7bd94', '#d07a45'] },
  { id: 'u-mei', name: '眉间雪', tone: ['#c4c1ee', '#7c78bb'] },
  { id: 'u-hai', name: '海盐', tone: ['#9fd8cf', '#4c9a8d'] },
  { id: 'u-qiu', name: '秋刀鱼', tone: ['#e8b2a1', '#b5664f'] },
];

/**
 * 三种发型模板，8×8 格。
 * 用像素人脸而不是"渐变底 + 一个字"：那个看起来像色卡，不像头像，
 * 挂在像素画上会立刻露馅（整棵树是格子，牌子里的脸却是矢量文字）。
 */
const FACE_TEMPLATES = [
  ['..hhhh..', '.hhhhhh.', '.hssssh.', '.ssssss.', '.seesse.', '.ssssss.', '..sMMs..', '...ss...'],
  ['..hhhh..', '.hhhhhh.', 'hhsssshh', 'hssssssh', 'hseesseh', 'hssssssh', '..sMMs..', '...ss...'],
  ['...hh...', '..hhhh..', '.hssssh.', '.ssssss.', '.seesse.', '.ssssss.', '..sMMs..', '...ss...'],
];

const SKIN_TONES = ['#f5d0ae', '#e8b98d', '#cf9a6b', '#a97549'];
const HAIR_TONES = ['#2e2018', '#4a2f1e', '#7a5230', '#17110d'];

/** data URI 生成占位头像：不依赖外网图床，加载也不会受 CSP 影响 */
function mockAvatarUrl(index, tone) {
  const template = FACE_TEMPLATES[index % FACE_TEMPLATES.length];
  const skin = SKIN_TONES[index % SKIN_TONES.length];
  const hair = HAIR_TONES[(index * 3) % HAIR_TONES.length];
  const palette = { h: hair, s: skin, e: '#2f2118', M: '#b8534f' };
  const cells = [];
  template.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (!fill) return;
      cells.push(`<rect x="${x * 12}" y="${y * 12}" width="12" height="12" fill="${fill}"/>`);
    });
  });
  // 底色压暗一档，脸才从牌子里浮出来
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges"><rect width="96" height="96" fill="${tone[1]}"/>${cells.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildMockRoster() {
  return MOCK_PEOPLE.map((person, index) => ({
    id: person.id,
    name: person.name,
    avatarUrl: mockAvatarUrl(index, person.tone),
    // 每三个人里有一个戴头像框，用来验证「框也要挂上树」
    frameUrl: index % 3 === 0 ? '/avatars/frames/orange-cat-frame.png' : '',
    // 挂点由服务端分配后长期固定：有人退出只留空洞，后面的人不会被顶上来
    slot: index,
    joinedAt: index,
  }));
}

const pad2 = (value) => String(value).padStart(2, '0');

export function formatRevealLabel(timestamp = REVEAL_MS) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${Number(value('month'))} 月 ${Number(value('day'))} 日 ${value('hour')}:${value('minute')}`;
}

export function useXmasExchange() {
  /** idle | joined | revealed | closed */
  const phase = ref('idle');
  const roster = ref(buildMockRoster());
  /**
   * 历史最大挂位数。退出的人不回收占位 —— 否则后面所有人会整体往上挪一格，
   * 表现就是「别人一退，我的头像突然换了个位置」，很出戏。
   */
  const slotCount = ref(roster.value.length);
  const submitting = ref(false);
  const error = ref('');
  const now = ref(Date.now());

  /** 服务端是否可用。false 时 join/leave 走本地演示分支 */
  const backendReady = ref(false);
  const remoteParticipation = ref(false);
  const loadingRemote = ref(false);
  const capacity = ref(XMAS_EVENT_FALLBACK.capacity);
  const eventTitle = ref(XMAS_EVENT_FALLBACK.title);
  const eventStatus = ref(XMAS_EVENT_FALLBACK.status);
  const isVisible = ref(XMAS_EVENT_FALLBACK.isVisible);
  const revealMs = ref(REVEAL_MS);
  const deadlineMs = ref(DEADLINE_MS);
  /** 当前登录用户 id。用于把名单里的自己标出来（远端名单里没有 isSelf 字段） */
  const viewerId = ref('');
  /** 揭晓后的结果：{ code, partner, message } */
  const result = ref(null);
  let refreshSeq = 0;
  let resultSeq = 0;

  // 倒计时按秒走。用 onScopeDispose 而不是 onUnmounted：单测在 effectScope 里跑也能清掉，
  // 否则一个测试泄漏一个定时器，跑完不退出。
  const timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  onScopeDispose(() => clearInterval(timer));

  const isSignedUp = computed(() => phase.value === 'joined' || phase.value === 'revealed');
  const remainingMs = computed(() => Math.max(0, revealMs.value - now.value));
  const isPastDeadline = computed(
    () =>
      eventStatus.value === 'closed' ||
      eventStatus.value === 'revealed' ||
      now.value >= deadlineMs.value,
  );
  const revealDue = computed(() => now.value >= revealMs.value && phase.value !== 'closed');
  const isRevealed = computed(() => phase.value === 'revealed');

  const countdown = computed(() => {
    const total = remainingMs.value;
    return {
      days: Math.floor(total / 86400000),
      hours: Math.floor((total % 86400000) / 3600000),
      minutes: Math.floor((total % 3600000) / 60000),
      seconds: Math.floor((total % 60000) / 1000),
    };
  });

  const countdownText = computed(() => {
    const { days, hours, minutes, seconds } = countdown.value;
    if (remainingMs.value <= 0) return '已揭晓';
    if (days > 0) return `${days} 天 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  });

  const revealLabel = computed(() => formatRevealLabel(revealMs.value));

  /** 页面挂载后由 index.vue 传入，避免 composable 依赖 pinia（单测里没有 app 上下文） */
  function setViewer(userId) {
    const nextViewer = String(userId || '');
    if (nextViewer === viewerId.value) return;
    viewerId.value = nextViewer;
    refreshSeq += 1;
    resultSeq += 1;
    phase.value = 'idle';
    result.value = null;
    remoteParticipation.value = false;
  }

  function mapRemotePeople(list) {
    return list.map((person) => ({
      id: person.userId,
      name: person.name,
      avatarUrl: person.avatarUrl || '',
      frameUrl: person.frameUrl || '',
      slot: person.slot,
      isSelf: Boolean(viewerId.value) && String(person.userId) === viewerId.value,
    }));
  }

  /**
   * 拉一次服务端状态。页面进站、报名成功、退出成功、到点之后都要调它 ——
   * 本地状态永远不作为「我参与了」的依据。
   */
  async function refresh() {
    const requestViewer = viewerId.value;
    const requestSeq = ++refreshSeq;
    resultSeq += 1;
    loadingRemote.value = true;
    try {
      const res = await fetchXmasRoster();
      if (requestSeq !== refreshSeq || requestViewer !== viewerId.value) return { ok: false };
      if (!res.ok) {
        backendReady.value = false;
        return { ok: false, notReady: res.notReady === true, message: res.message || '' };
      }

      backendReady.value = true;
      revealMs.value = new Date(res.event.revealAt).getTime() || REVEAL_MS;
      deadlineMs.value = new Date(res.event.signupDeadline).getTime() || DEADLINE_MS;
      capacity.value = res.event.capacity || XMAS_EVENT.treeCapacity;
      eventTitle.value = res.event.title;
      eventStatus.value = res.event.status;
      isVisible.value = res.event.isVisible;

      /*
       * 运营关掉「在活动页展示」（或活动还是 draft）时，页面只显示「还没开始」，
       * 并且**不把名单放出来** —— 半下线状态最容易出现「页面还在、名单被看到一半」。
       * 报名/退出的最终闸门仍在服务端（status 不是 open 就直接拒绝）。
       */
      if (!res.event.isVisible || res.event.status === 'draft') {
        roster.value = [];
        slotCount.value = 0;
        result.value = null;
        phase.value = 'closed';
        return { ok: true, hidden: true };
      }

      roster.value = mapRemotePeople(res.participants);
      slotCount.value = Math.max(res.slotCount, res.participants.length);

      if (res.me?.joined) {
        remoteParticipation.value = true;
        phase.value = 'joined';
        // 远端名单里没有「我」，靠 slot 反标一次，保证自己的头像用实时头像/头像框
        const selfSlot = res.me.slot;
        roster.value = roster.value.map((person) =>
          person.slot === selfSlot ? { ...person, isSelf: true } : person,
        );
      } else if (phase.value !== 'closed') {
        phase.value = 'idle';
        remoteParticipation.value = false;
      }

      if ((revealDue.value || eventStatus.value === 'revealed') && res.me?.joined) {
        await loadResult();
      }
      if (requestSeq !== refreshSeq || requestViewer !== viewerId.value) return { ok: false };
      return { ok: true };
    } finally {
      if (requestSeq === refreshSeq) loadingRemote.value = false;
    }
  }

  /** 揭晓后取自己的配对。未到点时服务端只返回时间，partner 一定为空 */
  async function loadResult() {
    const requestViewer = viewerId.value;
    const requestSeq = ++resultSeq;
    const res = await fetchXmasMyResult();
    if (requestSeq !== resultSeq || requestViewer !== viewerId.value)
      return { ok: false, revealed: false };
    if (res.ok && res.revealAt) {
      const serverRevealMs = new Date(res.revealAt).getTime();
      if (serverRevealMs) revealMs.value = serverRevealMs;
    }
    if (res.ok && res.revealed) {
      result.value = {
        code: res.code,
        partner: res.partner,
        message: res.message,
      };
      if (res.partner || res.code === 'SANTA') phase.value = 'revealed';
      return { ok: true, revealed: true, result: result.value };
    }
    return { ok: false, revealed: false };
  }

  async function join() {
    if (submitting.value || isSignedUp.value) return { ok: false };
    submitting.value = true;
    error.value = '';
    const requestViewer = viewerId.value;
    try {
      if (backendReady.value) {
        const res = await joinXmas();
        if (requestViewer !== viewerId.value) return { ok: false };
        if (!res.ok) {
          const reasonMap = { DEADLINE: 'deadline', FULL: 'full', CLOSED: 'closed' };
          if (res.notReady) backendReady.value = false;
          error.value = res.message || '参与失败，请稍后重试';
          return { ok: false, reason: reasonMap[res.code] || res.code || 'failed' };
        }
        remoteParticipation.value = true;
        await refresh();
        if (requestViewer !== viewerId.value) return { ok: false };
        phase.value = 'joined';
        return { ok: true, slot: res.slot };
      }

      // 本地演示分支：故意保留 260ms 延迟，把 loading 态也一起验证掉
      await new Promise((resolve) => setTimeout(resolve, 260));
      if (requestViewer !== viewerId.value) return { ok: false };
      if (Date.now() >= deadlineMs.value) {
        error.value = '报名已截止';
        return { ok: false, reason: 'deadline' };
      }
      if (roster.value.length >= capacity.value) {
        error.value = '参与人数已满';
        return { ok: false, reason: 'full' };
      }
      roster.value = [
        ...roster.value,
        {
          id: 'u-me',
          name: '我',
          avatarUrl: '',
          frameUrl: '',
          slot: slotCount.value,
          joinedAt: slotCount.value,
          isSelf: true,
        },
      ];
      slotCount.value += 1;
      phase.value = 'joined';
      return { ok: true };
    } finally {
      submitting.value = false;
    }
  }

  async function leave() {
    if (submitting.value || !isSignedUp.value) return { ok: false };
    if (isRevealed.value) {
      error.value = '结果已揭晓，无法退出';
      return { ok: false, reason: 'revealed' };
    }
    submitting.value = true;
    const requestViewer = viewerId.value;
    try {
      if (backendReady.value || remoteParticipation.value) {
        const res = await leaveXmas();
        if (requestViewer !== viewerId.value) return { ok: false };
        if (!res.ok) {
          if (res.notReady) backendReady.value = false;
          error.value = res.message || '退出失败，请稍后重试';
          return { ok: false, reason: res.code || 'failed' };
        }
        await refresh();
        if (requestViewer !== viewerId.value) return { ok: false };
        remoteParticipation.value = false;
        phase.value = 'idle';
        result.value = null;
        return { ok: true };
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      if (requestViewer !== viewerId.value) return { ok: false };
      roster.value = roster.value.filter((person) => !person.isSelf);
      phase.value = 'idle';
      return { ok: true };
    } finally {
      submitting.value = false;
    }
  }

  return {
    phase,
    roster,
    slotCount,
    submitting,
    error,
    countdown,
    countdownText,
    remainingMs,
    isSignedUp,
    isPastDeadline,
    revealDue,
    isRevealed,
    revealLabel,
    capacity,
    eventTitle,
    eventStatus,
    isVisible,
    backendReady,
    loadingRemote,
    result,
    setViewer,
    refresh,
    loadResult,
    join,
    leave,
  };
}
