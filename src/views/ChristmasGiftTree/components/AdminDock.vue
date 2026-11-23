<script setup>
/**
 * 页面内管理面板（仅管理员可见）。
 *
 * 为什么不在 /admin/xmas-console 里做：活动页是运营唯一会盯着的界面 ——
 * 「有人刷报名」「临时改时间」「看看配上了没」都发生在这里，跳后台要经过
 * 侧栏 → 数据管理 → 圣诞活动三层，来回一次就懒得改了。
 *
 * 但它**不是**第二套接口：所有写操作仍然走同一批 SECURITY DEFINER 函数，
 * 权限判定也在服务端（current_user_is_admin），这里隐藏按钮只是少给误触。
 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue';

import {
  XMAS_STATUS_LABELS,
  drawXmas,
  fetchXmasAdminOverview,
  removeXmasParticipant,
  resetXmasMatches,
  saveXmasEvent,
  toLocalInputValue,
  fromLocalInputValue,
} from '@/utils/api/xmas-exchange-api.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'changed']);

const loading = ref(false);
const busy = ref(false);
const notReady = ref(false);
const notice = ref('');
const state = reactive({ exists: false, event: null, participants: [], matches: [] });
const revealInput = ref('');
const deadlineInput = ref('');

let noticeTimer = null;
function flash(text) {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = '';
  }, 3600);
}

const joined = computed(() => state.participants.filter((p) => p.status === 'joined'));
const activeCount = computed(() => joined.value.length);
const statusLabel = computed(() =>
  state.event ? XMAS_STATUS_LABELS[state.event.status] || state.event.status : '—',
);
const isVisible = computed(() => state.event?.isVisible === true);

async function load() {
  loading.value = true;
  try {
    const res = await fetchXmasAdminOverview();
    if (res.notReady) {
      notReady.value = true;
      return;
    }
    notReady.value = false;
    if (!res.ok) {
      flash(res.message || '读取失败，确认一下当前账号是不是管理员');
      return;
    }
    state.exists = res.exists;
    state.event = res.event;
    state.participants = res.participants;
    state.matches = res.matches;
    revealInput.value = toLocalInputValue(res.event?.revealAt);
    deadlineInput.value = toLocalInputValue(res.event?.signupDeadline);
  } finally {
    loading.value = false;
  }
}

/** 任何一次写操作之后：先重读面板，再让页面重拉名单（树上的头像要立刻变） */
async function afterWrite(ok, message) {
  flash(message);
  if (!ok) return;
  await load();
  emit('changed');
}

async function removePerson(person) {
  if (busy.value) return;
  if (!window.confirm(`把「${person.name}」从树上摘下来？挂位会留空，不会被后面的人顶掉。`)) {
    return;
  }
  busy.value = true;
  try {
    const res = await removeXmasParticipant(person.userId, '页面内管理移除');
    await afterWrite(res.ok, res.ok ? '已移除' : res.message || '移除失败');
  } finally {
    busy.value = false;
  }
}

async function draw(force) {
  if (busy.value) return;
  const tip = force
    ? '重新洗牌？已有配对会被丢弃并重新生成。'
    : '现在生成配对？不会让用户提前看到（结果接口在揭晓前不返回内容）。';
  if (!window.confirm(tip)) return;
  busy.value = true;
  try {
    const res = await drawXmas(force);
    await afterWrite(res.ok, res.ok ? res.message || '已配对' : res.message || '配对失败');
  } finally {
    busy.value = false;
  }
}

async function resetMatches() {
  if (busy.value) return;
  if (!window.confirm('清空本轮配对？参与者与挂位不受影响。')) return;
  busy.value = true;
  try {
    const res = await resetXmasMatches();
    await afterWrite(res.ok, res.ok ? '已清空配对' : res.message || '操作失败');
  } finally {
    busy.value = false;
  }
}

async function patchEvent(patch) {
  if (busy.value || !state.event) return;
  busy.value = true;
  try {
    const res = await saveXmasEvent({
      title: state.event.title,
      revealAt: fromLocalInputValue(revealInput.value) || state.event.revealAt,
      signupDeadline: fromLocalInputValue(deadlineInput.value) || state.event.signupDeadline,
      capacity: state.event.capacity,
      status: patch.status ?? state.event.status,
      isVisible: patch.isVisible ?? state.event.isVisible,
      santaUserId: state.event.santaUserId,
    });
    await afterWrite(res.ok, res.ok ? '已保存' : res.message || '保存失败');
  } finally {
    busy.value = false;
  }
}

async function saveTimes() {
  if (busy.value || !state.event) return;
  const revealAt = fromLocalInputValue(revealInput.value);
  const signupDeadline = fromLocalInputValue(deadlineInput.value);
  if (!revealAt || !signupDeadline) {
    flash('两个时间都要填');
    return;
  }
  if (new Date(signupDeadline) >= new Date(revealAt)) {
    flash('报名截止必须早于揭晓');
    return;
  }
  busy.value = true;
  try {
    const res = await saveXmasEvent({
      title: state.event.title,
      revealAt,
      signupDeadline,
      capacity: state.event.capacity,
      status: state.event.status,
      isVisible: state.event.isVisible,
      santaUserId: state.event.santaUserId,
    });
    await afterWrite(res.ok, res.ok ? '时间已更新' : res.message || '保存失败');
  } finally {
    busy.value = false;
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && !busy.value) emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown);
      load();
      return;
    }
    window.removeEventListener('keydown', onKeydown);
  },
);

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(noticeTimer);
});
</script>

<template>
  <Transition name="xmas-sheet">
    <div v-if="open" class="dock-mask" @click.self="!busy && emit('close')">
      <section class="dock-card" role="dialog" aria-modal="true" aria-labelledby="dock-title">
        <header class="dock-head">
          <div>
            <h2 id="dock-title" class="dock-title">名单管理</h2>
            <p class="dock-sub">仅管理员可见 · 改完即时生效</p>
          </div>
          <button type="button" class="dock-close" aria-label="关闭" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>

        <p v-if="notice" class="dock-notice" role="status">{{ notice }}</p>

        <p v-if="notReady" class="dock-empty">
          数据表还没创建，先在项目根目录执行 <code>supabase db push</code>。
        </p>

        <p v-else-if="loading" class="dock-empty">读取中…</p>

        <p v-else-if="!state.exists" class="dock-empty">这一轮活动还没创建。</p>

        <template v-else>
          <div class="dock-chips">
            <span class="dock-chip">{{ activeCount }} / {{ state.event.capacity }} 在树上</span>
            <span class="dock-chip" :class="{ 'is-off': !isVisible }">
              {{ isVisible ? '页面对访客可见' : '页面已隐藏' }}
            </span>
            <span class="dock-chip is-gold">{{ statusLabel }}</span>
          </div>

          <div class="dock-block">
            <p class="dock-block-title">开关</p>
            <div class="dock-toggles">
              <!-- 按钮文字是「将要做什么」，不是「现在是什么」；
                   当前状态交给上面那排标签，两处都写成状态会互相矛盾 -->
              <button
                type="button"
                class="dock-btn"
                :disabled="busy"
                @click="patchEvent({ isVisible: !isVisible })"
              >
                {{ isVisible ? '隐藏活动页' : '放出活动页' }}
              </button>
              <button
                type="button"
                class="dock-btn"
                :disabled="busy || state.event.status === 'revealed'"
                @click="patchEvent({ status: state.event.status === 'open' ? 'closed' : 'open' })"
              >
                {{ state.event.status === 'open' ? '停止报名' : '开放报名' }}
              </button>
            </div>
            <p class="dock-hint">
              隐藏后 /xmas 只显示「活动还没开始」，名单一并收起；已参与的记录不会丢。
            </p>
          </div>

          <details class="dock-block dock-times">
            <summary>改时间</summary>
            <label class="dock-field">
              <span>揭晓时刻</span>
              <input v-model="revealInput" type="datetime-local" />
            </label>
            <label class="dock-field">
              <span>报名截止</span>
              <input v-model="deadlineInput" type="datetime-local" />
            </label>
            <button type="button" class="dock-btn" :disabled="busy" @click="saveTimes">
              保存时间
            </button>
          </details>

          <div class="dock-block">
            <p class="dock-block-title">配对</p>
            <div class="dock-toggles">
              <button type="button" class="dock-btn" :disabled="busy" @click="draw(false)">
                立即配对
              </button>
              <button type="button" class="dock-btn" :disabled="busy" @click="draw(true)">
                重新洗牌
              </button>
              <button
                type="button"
                class="dock-btn dock-btn--danger"
                :disabled="busy || !state.matches.length"
                @click="resetMatches"
              >
                清空结果
              </button>
            </div>
            <p class="dock-hint">到点会自动配对，一般不用手动。提前配对不会让用户提前看到。</p>
          </div>

          <div class="dock-block">
            <p class="dock-block-title">在树上 {{ activeCount }} 人</p>
            <ul v-if="joined.length" class="dock-list">
              <li v-for="person in joined" :key="person.userId" class="dock-person">
                <span class="dock-slot">#{{ person.slot }}</span>
                <img v-if="person.avatarUrl" class="dock-avatar" :src="person.avatarUrl" alt="" />
                <i v-else class="dock-avatar dock-avatar--empty" aria-hidden="true"></i>
                <span class="dock-name">{{ person.name }}</span>
                <button
                  type="button"
                  class="dock-remove"
                  :disabled="busy"
                  :aria-label="`移除 ${person.name}`"
                  @click="removePerson(person)"
                >
                  移除
                </button>
              </li>
            </ul>
            <p v-else class="dock-empty">还没有人挂上去。</p>

            <p v-if="state.participants.length !== joined.length" class="dock-hint">
              另有
              {{ state.participants.length - joined.length }} 位已退出，记录保留但不再参与配对。
            </p>
          </div>
        </template>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
@import './admin-dock.css';
</style>
