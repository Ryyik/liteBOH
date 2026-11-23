<template>
  <AdminConsoleShell active-module="xmas-console">
    <div class="xc">
      <header class="xc-head">
        <div class="xc-heading">
          <span class="xc-mark" aria-hidden="true">🎄</span>
          <div>
            <h1>圣诞交换礼物</h1>
            <p>
              报名时间、容量、首页曝光都在这里改，保存即生效，不用发版。名单与配对由服务端裁决，
              揭晓前连管理员也只能看到「有多少人」，看不到「谁配到了谁」。
            </p>
          </div>
        </div>
        <div class="xc-actions">
          <a class="btn" href="/xmas" target="_blank" rel="noopener">
            <ExternalLink :size="14" aria-hidden="true" />
            打开活动页
          </a>
          <button type="button" class="btn" :disabled="busy" @click="load">
            <RefreshCw :size="14" aria-hidden="true" />
            重新读取
          </button>
          <button
            type="button"
            class="btn primary"
            :disabled="busy || saving || !draft"
            @click="saveConfig"
          >
            {{ saving ? '保存中…' : '保存配置' }}
          </button>
        </div>
      </header>

      <p v-if="notice" class="xc-notice" :class="notice.type" role="status">
        <AlertTriangle v-if="notice.type === 'error'" :size="14" aria-hidden="true" />
        <Check v-else-if="notice.type === 'ok'" :size="14" aria-hidden="true" />
        {{ notice.text }}
      </p>

      <!-- 后端未部署时不给假表单：直接告诉运维要跑哪份迁移 -->
      <section v-if="notReady" class="xc-blocked">
        <h2>数据表还没创建</h2>
        <p>
          这个模块依赖
          <code>supabase/migrations/2026112302_xmas_exchange.sql</code>
          里的三张表与六个函数。在项目根目录执行下面这条命令后刷新本页：
        </p>
        <pre><code>supabase db push</code></pre>
        <p class="muted">迁移是纯新增（三张表 + 函数），不会改动既有数据。</p>
      </section>

      <template v-else>
        <section class="xc-kpis">
          <article class="xc-kpi">
            <span class="xc-kpi-label">已挂上树</span>
            <strong class="xc-kpi-value"
              >{{ joinedCount }}<em>/{{ draft?.capacity || 0 }}</em></strong
            >
            <span class="xc-kpi-foot">退出的人不占位，挂位不会回收</span>
          </article>
          <article class="xc-kpi">
            <span class="xc-kpi-label">活动状态</span>
            <strong class="xc-kpi-value sm">{{ statusLabel }}</strong>
            <span class="xc-kpi-foot">{{ statusHint }}</span>
          </article>
          <article class="xc-kpi">
            <span class="xc-kpi-label">揭晓时刻</span>
            <strong class="xc-kpi-value sm">{{ revealLabel }}</strong>
            <span class="xc-kpi-foot">{{ revealHint }}</span>
          </article>
          <article class="xc-kpi">
            <span class="xc-kpi-label">首页曝光</span>
            <strong class="xc-kpi-value sm">{{ heroLabel }}</strong>
            <span class="xc-kpi-foot">{{ heroHint }}</span>
          </article>
        </section>

        <div class="xc-grid">
          <!-- ═════ 左：配置 ═════ -->
          <section class="xc-card">
            <div class="xc-card-head">
              <h2>活动配置</h2>
              <span class="muted">{{ state.exists ? '已创建' : '还没创建本轮活动' }}</span>
            </div>

            <div v-if="!state.exists" class="xc-empty">
              <p>还没有任何一轮活动。点下面的按钮按默认时间建一轮（12 月 20 日 20:00 揭晓）。</p>
              <button type="button" class="btn primary" :disabled="busy" @click="createRound">
                创建本轮活动
              </button>
            </div>

            <div v-else class="xc-form">
              <label class="xc-field">
                <span>活动标题</span>
                <input v-model="draft.title" type="text" maxlength="40" />
              </label>

              <div class="xc-row">
                <label class="xc-field">
                  <span>揭晓时刻</span>
                  <input v-model="draft.revealAt" type="datetime-local" />
                  <small>服务端按这个时间判定，前端倒计时只是展示</small>
                </label>
                <label class="xc-field">
                  <span>报名截止</span>
                  <input v-model="draft.signupDeadline" type="datetime-local" />
                  <small>必须早于揭晓，留出收尾时间</small>
                </label>
              </div>

              <div class="xc-row">
                <label class="xc-field">
                  <span>人数上限</span>
                  <input v-model.number="draft.capacity" type="number" min="2" max="60" />
                  <small>树上按 20 个挂位设计，超过会挤</small>
                </label>
                <label class="xc-field">
                  <span>状态</span>
                  <select v-model="draft.status">
                    <option value="draft">未上线（不可报名）</option>
                    <option value="open">报名中</option>
                    <option value="closed">已截止（等揭晓）</option>
                    <option value="revealed">已揭晓</option>
                  </select>
                  <small>「已揭晓」一般由系统自动写入</small>
                </label>
              </div>

              <label class="xc-switch">
                <input v-model="draft.isVisible" type="checkbox" class="boh-switch" />
                <span>
                  <strong>在活动页展示</strong>
                  <small>关掉后 /xmas 会显示「活动还没开始」，但不会清掉名单</small>
                </span>
              </label>

              <details class="xc-advanced">
                <summary>高级：官方兜底账号</summary>
                <label class="xc-field">
                  <span>署名用户 ID（可空）</span>
                  <input
                    v-model="draft.santaUserId"
                    type="text"
                    placeholder="留空则只显示「官方礼物」"
                  />
                  <small>奇数落单时显示「来自 TA」。填的是 profiles.id（UUID）</small>
                </label>
              </details>

              <!-- 首页曝光：直接写 home_heroes，与「首页装修」同一份数据 -->
              <div class="xc-hero-row">
                <div class="xc-hero-copy">
                  <strong>首页英雄区</strong>
                  <small>{{ heroLabel }} · {{ heroHint }}</small>
                </div>
                <button type="button" class="btn" :disabled="busy" @click="toggleHero">
                  {{ heroIsOnline ? '从首页下架' : '上架到首页' }}
                </button>
              </div>
            </div>
          </section>

          <!-- ═════ 右：预览 + 配对 ═════ -->
          <div class="xc-side">
            <section class="xc-card xc-preview">
              <div class="xc-card-head">
                <h2>活动预览</h2>
                <span class="muted">{{ joinedCount }} 人挂上树</span>
              </div>
              <div class="xc-tree">
                <img :src="treeUrl" alt="圣诞树预览" />
              </div>
              <div
                class="xc-meter"
                role="progressbar"
                :aria-valuenow="joinedCount"
                aria-valuemin="0"
                :aria-valuemax="draft?.capacity || 0"
              >
                <i
                  v-for="cell in meterCells"
                  :key="cell"
                  :class="{ on: cell < joinedCount }"
                  aria-hidden="true"
                ></i>
              </div>
              <p class="xc-preview-note">
                {{
                  joinedCount === 0
                    ? '树还空着，先让第一位朋友挂上头像。'
                    : `还有 ${Math.max(0, (draft?.capacity || 0) - joinedCount)} 个位置。`
                }}
              </p>
            </section>

            <section class="xc-card">
              <div class="xc-card-head">
                <h2>配对</h2>
                <span class="muted">{{ state.matches.length ? '已生成' : '未生成' }}</span>
              </div>

              <p class="xc-pair-hint">
                正常情况下不用手动操作：揭晓时刻一到，第一个打开结果页的请求会自动完成配对。
                手动配对只用于彩排；<strong>提前配对不会让用户看到</strong>（结果接口在揭晓前不返回任何内容）。
              </p>

              <div class="xc-pair-actions">
                <button type="button" class="btn" :disabled="busy" @click="drawPairs(false)">
                  <Shuffle :size="14" aria-hidden="true" />
                  立即配对
                </button>
                <button type="button" class="btn" :disabled="busy" @click="drawPairs(true)">
                  重新洗牌
                </button>
                <button
                  type="button"
                  class="btn danger"
                  :disabled="busy || !state.matches.length"
                  @click="resetMatches"
                >
                  清空结果
                </button>
              </div>

              <ul v-if="state.matches.length" class="xc-pairs">
                <li v-for="(pair, index) in pairList" :key="`${pair.aUserId}-${index}`">
                  <span class="xc-pair-a">{{ pair.aName }}</span>
                  <span class="xc-pair-arrow" aria-hidden="true">↔</span>
                  <span class="xc-pair-b" :class="{ santa: pair.santa }">
                    {{ pair.santa ? '官方礼物' : pair.bName }}
                  </span>
                </li>
              </ul>
              <p v-else class="muted xc-pairs-empty">还没有配对结果。</p>
            </section>
          </div>
        </div>

        <!-- ═════ 名单 ═════ -->
        <section class="xc-card">
          <div class="xc-card-head">
            <h2>参与者名单</h2>
            <span class="muted"
              >{{ joinedCount }} 人在树上 / 共 {{ state.participants.length }} 条记录</span
            >
          </div>

          <p v-if="!state.participants.length" class="muted xc-pairs-empty">
            还没有人参与。把 /xmas 发出去，第一位朋友挂上头像后这里就会出现。
          </p>

          <table v-else class="xc-table">
            <thead>
              <tr>
                <th>挂位</th>
                <th>昵称</th>
                <th>状态</th>
                <th>参与时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="person in state.participants" :key="person.userId">
                <td class="xc-mono">#{{ person.slot }}</td>
                <td>
                  <span class="xc-person">
                    <img v-if="person.avatarUrl" :src="person.avatarUrl" alt="" />
                    <i v-else class="xc-person-fallback" aria-hidden="true"></i>
                    {{ person.name }}
                  </span>
                </td>
                <td>
                  <span class="xc-tag" :class="person.status">
                    {{ person.status === 'joined' ? '在树上' : '已退出' }}
                  </span>
                </td>
                <td class="xc-mono">{{ formatTime(person.joinedAt) }}</td>
                <td class="xc-cell-right">
                  <button
                    v-if="person.status === 'joined'"
                    type="button"
                    class="btn sm danger"
                    :disabled="busy"
                    @click="removePerson(person)"
                  >
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>
  </AdminConsoleShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import { AlertTriangle, Check, ExternalLink, RefreshCw, Shuffle } from 'lucide-vue-next';

import treeUrl from '@/assets/images/xmas-hero-tree.svg';
import AdminConsoleShell from '@/views/DataManagement/components/AdminConsoleShell.vue';
import { useHomeHeroesStore } from '@/stores/homeHeroes';
import {
  XMAS_EVENT_FALLBACK,
  XMAS_STATUS_LABELS,
  drawXmas,
  fetchXmasAdminOverview,
  fromLocalInputValue,
  removeXmasParticipant,
  resetXmasMatches,
  saveXmasEvent,
  toLocalInputValue,
} from '@/utils/api/xmas-exchange-api.js';

const HERO_KEY = 'christmas-xmas';

const heroesStore = useHomeHeroesStore();

const state = reactive({ exists: false, event: null, participants: [], matches: [] });
const draft = ref(null);
const heroRecord = ref(null);
const { confirm: confirmDialog } = useConfirmDialog();

const busy = ref(false);
const saving = ref(false);
const notReady = ref(false);
const notice = ref(null);

let noticeTimer = null;
function showNotice(text, type = 'ok') {
  notice.value = { text, type };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 4200);
}

const joinedCount = computed(
  () => state.participants.filter((person) => person.status === 'joined').length,
);
const meterCells = computed(() =>
  Array.from({ length: Math.min(20, draft.value?.capacity || 20) }),
);

const statusLabel = computed(() =>
  draft.value ? XMAS_STATUS_LABELS[draft.value.status] || draft.value.status : '—',
);

const statusHint = computed(() => {
  if (!state.exists) return '创建后才会出现在活动页';
  if (!draft.value?.isVisible) return '活动页当前对访客隐藏';
  if (draft.value.status === 'open') return '用户可以报名挂头像';
  if (draft.value.status === 'closed') return '停止报名，等待揭晓';
  if (draft.value.status === 'revealed') return '配对已完成，结果可查看';
  return '未上线，报名按钮会提示未开放';
});

const revealLabel = computed(() => {
  if (!draft.value?.revealAt) return '—';
  const date = new Date(draft.value.revealAt);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
});

const revealHint = computed(() => {
  if (!draft.value?.revealAt) return '还没设置';
  const diff = new Date(draft.value.revealAt).getTime() - Date.now();
  if (diff <= 0) return '已过揭晓时刻';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `还有 ${days} 天 ${hours} 小时` : `还有 ${hours} 小时`;
});

const heroLabel = computed(() => {
  if (!heroRecord.value) return '未上架';
  if (heroRecord.value.is_archived) return '已归档';
  if (heroRecord.value.status !== 'published') return '草稿';
  return '在首页';
});

const heroHint = computed(() => {
  if (!heroRecord.value) return '点右侧「上架到首页」创建一条内置英雄区';
  if (heroRecord.value.is_archived) return '归档后首页不再出现，可随时恢复';
  if (heroRecord.value.status !== 'published') return '还没发布，首页看不到';
  return '排序 ' + heroRecord.value.sort_order;
});

const heroIsOnline = computed(
  () =>
    Boolean(heroRecord.value) &&
    heroRecord.value.status === 'published' &&
    !heroRecord.value.is_archived,
);

/** 配对去重：表里是双向两行，面板只需要展示一次 */
const pairList = computed(() => {
  const seen = new Set();
  const list = [];
  for (const pair of state.matches) {
    const key = [pair.aUserId, pair.bUserId || 'santa'].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(pair);
  }
  return list;
});

function syncDraft(event) {
  if (!event) {
    draft.value = null;
    return;
  }
  draft.value = {
    title: event.title,
    revealAt: toLocalInputValue(event.revealAt),
    signupDeadline: toLocalInputValue(event.signupDeadline),
    capacity: event.capacity,
    status: event.status,
    isVisible: event.isVisible,
    santaUserId: event.santaUserId || '',
  };
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function loadHeroRecord() {
  const list = await heroesStore.fetchAllForAdmin({ force: true });
  heroRecord.value = (list || []).find((hero) => hero.builtin_key === HERO_KEY) || null;
}

async function load() {
  busy.value = true;
  try {
    const [overview] = await Promise.all([fetchXmasAdminOverview(), loadHeroRecord()]);
    if (overview.notReady) {
      notReady.value = true;
      showNotice('数据表还没创建，先执行迁移', 'error');
      return;
    }
    notReady.value = false;
    if (!overview.ok) {
      showNotice(overview.message || '读取失败，请确认当前账号是管理员', 'error');
      return;
    }
    state.exists = overview.exists;
    state.event = overview.event;
    state.participants = overview.participants;
    state.matches = overview.matches;
    syncDraft(overview.event);
  } catch (error) {
    showNotice(error?.message || '读取失败', 'error');
  } finally {
    busy.value = false;
  }
}

async function createRound() {
  busy.value = true;
  try {
    const result = await saveXmasEvent({
      title: XMAS_EVENT_FALLBACK.title,
      revealAt: XMAS_EVENT_FALLBACK.revealAt,
      signupDeadline: XMAS_EVENT_FALLBACK.signupDeadline,
      capacity: XMAS_EVENT_FALLBACK.capacity,
      status: 'open',
      isVisible: true,
    });
    if (result.notReady) {
      notReady.value = true;
      return;
    }
    showNotice(
      result.ok ? '本轮活动已创建' : result.message || '创建失败',
      result.ok ? 'ok' : 'error',
    );
    if (result.ok) await load();
  } finally {
    busy.value = false;
  }
}

async function saveConfig() {
  if (!draft.value) return;
  const revealAt = fromLocalInputValue(draft.value.revealAt);
  const signupDeadline = fromLocalInputValue(draft.value.signupDeadline);
  if (!revealAt || !signupDeadline) {
    showNotice('揭晓时间与报名截止都要填', 'error');
    return;
  }
  if (new Date(signupDeadline) >= new Date(revealAt)) {
    showNotice('报名截止必须早于揭晓时间', 'error');
    return;
  }
  saving.value = true;
  try {
    const result = await saveXmasEvent({
      title: draft.value.title,
      revealAt,
      signupDeadline,
      capacity: Number(draft.value.capacity),
      status: draft.value.status,
      isVisible: draft.value.isVisible,
      santaUserId: draft.value.santaUserId.trim() || null,
    });
    if (result.notReady) {
      notReady.value = true;
      return;
    }
    showNotice(result.ok ? '已保存' : result.message || '保存失败', result.ok ? 'ok' : 'error');
    if (result.ok) await load();
  } finally {
    saving.value = false;
  }
}

async function toggleHero() {
  busy.value = true;
  try {
    const existing = heroRecord.value;
    if (!existing) {
      const created = await heroesStore.createHero({
        template: 'builtin',
        variant: 'light',
        builtin_key: HERO_KEY,
        title: '把头像挂上树',
        eyebrow: 'BOH · CHRISTMAS 2026',
        subtitle: '交换一份圣诞礼物',
        aria_label: '圣诞交换礼物',
        sort_order: 50,
        is_archived: false,
      });
      if (!created) {
        showNotice('创建英雄区失败，请到「首页装修」手动新建', 'error');
        return;
      }
      const published = await heroesStore.publishHero(created.id);
      showNotice(published ? '已上架到首页' : '已创建，但发布失败', published ? 'ok' : 'error');
    } else if (existing.is_archived || existing.status !== 'published') {
      await heroesStore.saveHero(existing.id, { is_archived: false });
      const published = await heroesStore.publishHero(existing.id);
      showNotice(published ? '已恢复到首页' : '恢复失败', published ? 'ok' : 'error');
    } else {
      const ok = await heroesStore.saveHero(existing.id, { is_archived: true });
      showNotice(ok ? '已从首页下架（历史区仍保留）' : '下架失败', ok ? 'ok' : 'error');
    }
    await loadHeroRecord();
  } finally {
    busy.value = false;
  }
}

async function drawPairs(force) {
  busy.value = true;
  try {
    const result = await drawXmas(force === true);
    if (result.notReady) {
      notReady.value = true;
      return;
    }
    showNotice(
      result.ok ? result.message : result.message || '配对失败',
      result.ok ? 'ok' : 'error',
    );
    if (result.ok) await load();
  } finally {
    busy.value = false;
  }
}

async function resetMatches() {
  const ok = await confirmDialog({
    title: '清空配对',
    message: '清空本轮配对？参与者与挂位不受影响，但已生成的结果会丢失。',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const result = await resetXmasMatches();
    showNotice(result.ok ? '已清空配对' : result.message || '操作失败', result.ok ? 'ok' : 'error');
    if (result.ok) await load();
  } finally {
    busy.value = false;
  }
}

async function removePerson(person) {
  const ok = await confirmDialog({
    title: '摘下此人',
    message: `把「${person.name}」从树上摘下来？挂位会留空，不会被后面的人顶掉。`,
  });
  if (!ok) return;
  busy.value = true;
  try {
    const result = await removeXmasParticipant(person.userId, '管理员移除');
    showNotice(result.ok ? '已移除' : result.message || '操作失败', result.ok ? 'ok' : 'error');
    if (result.ok) await load();
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.xc {
  min-height: 100vh;
  background: #f6f4f1;
  color: #17130e;
  padding: 24px clamp(16px, 3vw, 40px) 56px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
}

.xc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.xc-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.xc-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 11px;
  background: #e8f0e6;
  font-size: 19px;
}

.xc-head h1 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
}

.xc-head p {
  margin: 0;
  max-width: 640px;
  font-size: 12px;
  line-height: 1.75;
  color: #7c756c;
}

.xc-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 9px;
  border: 0.5px solid rgba(0, 0, 0, 0.16);
  background: #fff;
  color: #17130e;
  font-family: inherit;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn:hover:not(:disabled) {
  background: #f1eee9;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  border-color: transparent;
  background: #1f6b46;
  color: #fff;
}

.btn.primary:hover:not(:disabled) {
  background: #1a5c3c;
}

.btn.danger {
  border-color: rgba(180, 45, 45, 0.28);
  color: #b23030;
}

.btn.danger:hover:not(:disabled) {
  background: #fdeceb;
}

.btn.sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.xc-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  padding: 9px 13px;
  border-radius: 9px;
  font-size: 12px;
  background: #eef5ee;
  color: #27663f;
}

.xc-notice.error {
  background: #fdeceb;
  color: #a02b2b;
}

.xc-blocked {
  padding: 22px 24px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
}

.xc-blocked h2 {
  margin: 0 0 10px;
  font-size: 15px;
}

.xc-blocked p {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.8;
  color: #5c554d;
}

.xc-blocked pre {
  margin: 0 0 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #17130e;
  color: #d9f0dd;
  font-size: 12px;
  overflow-x: auto;
}

.xc-blocked code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.xc-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.xc-kpi {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.xc-kpi-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: #8a8279;
}

.xc-kpi-value {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.xc-kpi-value.sm {
  font-size: 16px;
}

.xc-kpi-value em {
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
  color: #a49b90;
}

.xc-kpi-foot {
  font-size: 11px;
  line-height: 1.5;
  color: #a49b90;
}

.xc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 14px;
  align-items: start;
}

.xc-side {
  display: grid;
  gap: 14px;
}

.xc-card {
  padding: 16px 18px 18px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  margin-bottom: 14px;
}

.xc-grid .xc-card {
  margin-bottom: 0;
}

.xc-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.xc-card-head h2 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
}

.muted {
  font-size: 11.5px;
  color: #9c948a;
}

.xc-empty {
  padding: 10px 0 2px;
}

.xc-empty p {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.8;
  color: #5c554d;
}

.xc-form {
  display: grid;
  gap: 12px;
}

.xc-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.xc-field {
  display: grid;
  gap: 5px;
}

.xc-field > span {
  font-size: 11.5px;
  color: #6f675e;
}

.xc-field input,
.xc-field select {
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: #fdfcfa;
  color: #17130e;
  font-family: inherit;
  font-size: 12.5px;
}

.xc-field input:focus,
.xc-field select:focus {
  outline: 2px solid rgba(31, 107, 70, 0.28);
  outline-offset: 0;
  border-color: #1f6b46;
}

.xc-field small {
  font-size: 10.5px;
  color: #a49b90;
}

.xc-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  background: #faf8f4;
  cursor: pointer;
}

.xc-switch span {
  display: grid;
  gap: 3px;
  font-size: 12px;
}

.xc-switch small {
  font-size: 10.5px;
  color: #9c948a;
}

.xc-advanced {
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
  padding-top: 10px;
}

.xc-advanced summary {
  font-size: 11.5px;
  color: #8a8279;
  cursor: pointer;
  margin-bottom: 10px;
}

.xc-hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 13px;
  border-radius: 9px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: #faf8f4;
}

.xc-hero-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.xc-hero-copy strong {
  font-size: 12px;
  font-weight: 600;
}

.xc-hero-copy small {
  font-size: 10.5px;
  color: #9c948a;
}

.xc-preview .xc-tree {
  display: grid;
  place-items: center;
  height: 148px;
  margin-bottom: 12px;
  border-radius: 10px;
  background: radial-gradient(circle at 50% 30%, #1b2a4a 0%, #0b1224 70%);
  overflow: hidden;
}

.xc-preview .xc-tree img {
  height: 138px;
  width: auto;
}

.xc-meter {
  display: flex;
  gap: 3px;
  margin-bottom: 8px;
}

.xc-meter i {
  flex: 1;
  height: 6px;
  border-radius: 1px;
  background: #ece8e1;
}

.xc-meter i.on {
  background: #2f8f5b;
}

.xc-preview-note {
  margin: 0;
  font-size: 11.5px;
  color: #8a8279;
}

.xc-pair-hint {
  margin: 0 0 12px;
  font-size: 11.5px;
  line-height: 1.75;
  color: #7c756c;
}

.xc-pair-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.xc-pairs {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.xc-pairs li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #faf8f4;
  font-size: 12px;
}

.xc-pair-arrow {
  color: #b9b1a6;
}

.xc-pair-b.santa {
  color: #a8761c;
  font-weight: 600;
}

.xc-pairs-empty {
  margin: 0;
}

.xc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.xc-table th {
  padding: 0 8px 8px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #9c948a;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.xc-table td {
  padding: 9px 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.xc-table tr:last-child td {
  border-bottom: 0;
}

.xc-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #7c756c;
}

.xc-person {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.xc-person img,
.xc-person-fallback {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  background: #ece8e1;
}

.xc-tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 10.5px;
  background: #eef5ee;
  color: #27663f;
}

.xc-tag.left {
  background: #f1eee9;
  color: #8a8279;
}

.xc-cell-right {
  text-align: right;
}

@media (max-width: 1080px) {
  .xc-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .xc-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .xc-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .xc-table thead {
    display: none;
  }

  .xc-table tr {
    display: grid;
    /* 四列一行：挂位 / 昵称 / 状态 / 操作。少一列会让「移除」掉到第二行、
       跟状态上下错位，看起来像两行不同的记录。 */
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 4px 10px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .xc-table td {
    padding: 0;
    border: 0;
  }

  .xc-table td:nth-child(4) {
    display: none;
  }
}
</style>
