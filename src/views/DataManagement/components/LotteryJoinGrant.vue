<template>
  <section class="ljg">
    <header class="ljg-head">
      <div>
        <h2>帮人报名</h2>
        <p>
          把某个用户加进抽奖报名名单。走的是与用户自助报名**同一套校验**（去重、名额、用户名快照），
          每次操作都会留痕：报名审计里记 <code>ADMIN_JOINED</code>，管理员审计里记
          <code>grant</code>。
        </p>
      </div>
    </header>

    <p v-if="notice" class="ljg-notice" :class="notice.type">
      {{ notice.text }}
      <template v-if="notice.reasons?.length">
        <span class="ljg-reasons">
          <span v-for="reason in notice.reasons" :key="reason" class="ljg-reason">{{
            reason
          }}</span>
        </span>
      </template>
    </p>

    <div class="ljg-body">
      <!-- 抽奖 -->
      <div class="ljg-col">
        <label class="ljg-label" for="ljg-lottery">1 · 选抽奖</label>
        <input
          id="ljg-lottery"
          v-model="lotteryKeyword"
          class="ljg-input"
          type="search"
          placeholder="按标题筛选…"
          autocomplete="off"
        />
        <ul class="ljg-list" role="listbox" aria-label="抽奖列表">
          <li v-if="!filteredLotteries.length" class="ljg-empty">
            {{ loadingLotteries ? '读取中…' : '没有匹配的抽奖' }}
          </li>
          <li v-for="item in filteredLotteries" :key="item.id">
            <button
              type="button"
              class="ljg-item"
              :class="{ on: item.id === lotteryId }"
              role="option"
              :aria-selected="item.id === lotteryId"
              @click="pickLottery(item)"
            >
              <span class="ljg-item-main">{{ item.title }}</span>
              <span class="ljg-item-meta">
                <span class="ljg-tag" :class="`is-${item.status}`">{{
                  statusText(item.status)
                }}</span>
                <span v-if="item.entry_deadline_at" class="ljg-sub">
                  截止 {{ fmt(item.entry_deadline_at) }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>

      <!-- 用户 + 提交 -->
      <div class="ljg-col">
        <label class="ljg-label" for="ljg-user">2 · 选用户</label>
        <input
          id="ljg-user"
          v-model="userKeyword"
          class="ljg-input"
          type="search"
          placeholder="输入用户名搜索…"
          autocomplete="off"
          @input="onUserInput"
        />

        <!-- 提交前把「加谁 → 加到哪」摆在同一行：两栏分开时最容易加错抽奖 -->
        <p v-if="selectedUser" class="ljg-picked">
          已选：<strong>{{ selectedUser.username }}</strong>
          <template v-if="currentLottery">
            → <strong>{{ currentLottery.title }}</strong>
          </template>
          <button type="button" class="ljg-link" @click="clearUser">换一个</button>
        </p>

        <ul
          v-else-if="userResults.length"
          class="ljg-list is-short"
          role="listbox"
          aria-label="用户搜索结果"
        >
          <li v-for="user in userResults" :key="user.id">
            <button type="button" class="ljg-item" @click="pickUser(user)">
              <span class="ljg-item-main">{{ user.username }}</span>
              <span class="ljg-item-meta ljg-sub">{{ user.id.slice(0, 8) }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="userKeyword.trim() && !searchingUsers" class="ljg-empty is-inline">
          没有匹配的用户
        </p>

        <label class="ljg-label" for="ljg-reason">3 · 原因（强制加人时必填）</label>
        <textarea
          id="ljg-reason"
          v-model="reason"
          class="ljg-input ljg-textarea"
          rows="3"
          placeholder="例如：用户反馈报名按钮报错，客服核实后代为补录"
        />

        <label v-if="needsForce" class="ljg-check">
          <input v-model="force" type="checkbox" />
          <span>
            确认强制加人
            <small v-if="notice?.reasons?.length">（{{ notice.reasons.join('；') }}）</small>
          </span>
        </label>

        <div class="ljg-actions">
          <button type="button" class="ljg-btn primary" :disabled="!canSubmit" @click="submit">
            {{ submitting ? '提交中…' : '加入报名名单' }}
          </button>
          <button type="button" class="ljg-btn" :disabled="submitting" @click="reset">清空</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  adminJoinLottery,
  listLotteriesForGrant,
  searchUsersForGrant,
} from '@/utils/api/lottery-admin-api.js';

const lotteries = ref([]);
const loadingLotteries = ref(false);
const lotteryKeyword = ref('');
const lotteryId = ref('');

const userKeyword = ref('');
const userResults = ref([]);
const searchingUsers = ref(false);
const selectedUser = ref(null);

const reason = ref('');
const force = ref(false);
const submitting = ref(false);
const notice = ref(null);

const STATUS_LABELS = {
  open: '报名中',
  closed: '已关闭',
  drawn: '已开奖',
  cancelled: '已取消',
};
const statusText = (status) => STATUS_LABELS[status] || status || '未知';

const fmt = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const filteredLotteries = computed(() => {
  const q = lotteryKeyword.value.trim().toLowerCase();
  if (!q) return lotteries.value;
  return lotteries.value.filter((item) => item.title.toLowerCase().includes(q));
});

const currentLottery = computed(
  () => lotteries.value.find((item) => item.id === lotteryId.value) || null,
);

/* 「需要强制」只在 RPC 明确说 BLOCKED 之后才亮出来：
   提前给一个「强制加人」勾选框，等于鼓励管理员先勾了再说。 */
const needsForce = computed(() => Boolean(notice.value?.reasons?.length));
const canSubmit = computed(() =>
  Boolean(lotteryId.value && selectedUser.value && !submitting.value),
);

const loadLotteries = async () => {
  loadingLotteries.value = true;
  try {
    const { data, error } = await listLotteriesForGrant();
    lotteries.value = data;
    if (error) notice.value = { type: 'bad', text: `读取抽奖列表失败：${error.message}` };
  } finally {
    loadingLotteries.value = false;
  }
};

const pickLottery = (item) => {
  lotteryId.value = item.id;
  force.value = false;
  notice.value = null;
};

const pickUser = (user) => {
  selectedUser.value = user;
  userResults.value = [];
  userKeyword.value = user.username;
  force.value = false;
  notice.value = null;
};

const clearUser = () => {
  selectedUser.value = null;
  userResults.value = [];
  userKeyword.value = '';
};

/* 防抖搜索：一次输入一个字符就发一次请求，会把 profiles 打得很难看 */
let searchTimer = 0;
const onUserInput = () => {
  selectedUser.value = null;
  window.clearTimeout(searchTimer);
  const keyword = userKeyword.value.trim();
  if (!keyword) {
    userResults.value = [];
    return;
  }
  searchTimer = window.setTimeout(async () => {
    searchingUsers.value = true;
    try {
      const { data, error } = await searchUsersForGrant(keyword);
      if (error) {
        notice.value = { type: 'bad', text: `搜索用户失败：${error.message}` };
        userResults.value = [];
        return;
      }
      userResults.value = data;
    } finally {
      searchingUsers.value = false;
    }
  }, 280);
};

const submit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  notice.value = null;
  try {
    const { data, error } = await adminJoinLottery({
      lotteryId: lotteryId.value,
      userId: selectedUser.value.id,
      reason: reason.value,
      force: force.value,
    });

    if (error) {
      notice.value = { type: 'bad', text: error.message };
      return;
    }

    if (data?.code === 'BLOCKED' || data?.code === 'REASON_REQUIRED') {
      notice.value = {
        type: 'warn',
        text: data.message,
        reasons: data.blocked_reasons || [],
      };
      force.value = false;
      return;
    }

    if (data?.ok === false) {
      notice.value = { type: 'bad', text: data.message || '代报名失败' };
      return;
    }

    notice.value = {
      type: data.code === 'ALREADY_JOINED' ? 'warn' : 'ok',
      text: `${data.message}${data.entry_count ? ` · 当前 ${data.entry_count} 人` : ''}`,
    };
    if (data.code !== 'ALREADY_JOINED') {
      reason.value = '';
      force.value = false;
    }
  } finally {
    submitting.value = false;
  }
};

const reset = () => {
  lotteryId.value = '';
  lotteryKeyword.value = '';
  clearUser();
  reason.value = '';
  force.value = false;
  notice.value = null;
};

onMounted(loadLotteries);
onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<style scoped>
.ljg {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  padding: calc(var(--spacing) * 5);
  color: var(--foreground);
}

.ljg-head h2 {
  margin: 0 0 calc(var(--spacing) * 1);
  font-size: 16px;
  font-weight: 600;
}

.ljg-head p {
  margin: 0;
  max-width: 760px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted-foreground);
}

.ljg-head code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.ljg-notice {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  margin: 0;
  padding: calc(var(--spacing) * 3) calc(var(--spacing) * 4);
  border-radius: var(--radius);
  font-size: 12px;
  line-height: 1.6;
}

.ljg-notice.ok {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--foreground);
}

.ljg-notice.warn {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: var(--foreground);
}

.ljg-notice.bad {
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: var(--foreground);
}

.ljg-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
}

.ljg-reason {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--background);
  border: 1px solid var(--border);
  font-size: 11px;
}

.ljg-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: calc(var(--spacing) * 4);
  align-items: start;
}

@media (max-width: 900px) {
  .ljg-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

.ljg-col {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  min-width: 0;
}

.ljg-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
}

.ljg-input {
  width: 100%;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 13px;
}

.ljg-input:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 1px;
}

.ljg-textarea {
  resize: vertical;
  line-height: 1.6;
}

.ljg-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card, var(--background));
}

.ljg-list.is-short {
  max-height: 200px;
}

.ljg-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 3);
  width: 100%;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.ljg-item:hover {
  background: var(--accent);
}

.ljg-item.on {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.ljg-item-main {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ljg-item-meta {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  flex: none;
  font-size: 11px;
  color: var(--muted-foreground);
}

.ljg-tag {
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 11px;
}

.ljg-tag.is-open {
  border-color: color-mix(in srgb, #22c55e 50%, var(--border));
  color: color-mix(in srgb, #16a34a 80%, var(--foreground));
}

.ljg-tag.is-drawn,
.ljg-tag.is-closed,
.ljg-tag.is-cancelled {
  opacity: 0.75;
}

.ljg-sub {
  white-space: nowrap;
}

.ljg-empty {
  margin: 0;
  padding: calc(var(--spacing) * 3);
  font-size: 12px;
  color: var(--muted-foreground);
}

.ljg-empty.is-inline {
  padding: 0;
}

.ljg-picked {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  margin: 0;
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  font-size: 13px;
}

.ljg-link {
  border: 0;
  background: transparent;
  color: var(--primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.ljg-check {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--spacing) * 2);
  font-size: 12px;
  line-height: 1.6;
}

.ljg-check small {
  color: var(--muted-foreground);
}

.ljg-actions {
  display: flex;
  gap: calc(var(--spacing) * 2);
  margin-top: calc(var(--spacing) * 1);
}

.ljg-btn {
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  color: var(--foreground);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ljg-btn.primary {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground, #fff);
}

.ljg-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
