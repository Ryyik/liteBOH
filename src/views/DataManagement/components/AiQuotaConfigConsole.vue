<template>
  <section class="quota-config-page">
    <header class="quota-config-hero">
      <div>
        <span class="quota-kicker">AI Usage controls</span>
        <h2>AI 额度与计费</h2>
        <p>统一控制模型消耗倍率、每日 Token 和 Web Searching 次数。</p>
      </div>
      <div class="quota-hero-actions">
        <button
          class="quota-btn ghost"
          type="button"
          :disabled="loading || saving"
          @click="loadConfig"
        >
          <RefreshCw :size="15" :class="{ spinning: loading }" />刷新
        </button>
        <button
          class="quota-btn primary"
          type="button"
          :disabled="loading || saving"
          @click="saveConfig"
        >
          <Save :size="15" />{{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </header>

    <div v-if="message" class="quota-notice" :class="messageTone" role="status">{{ message }}</div>
    <div v-if="loading" class="quota-loading">正在读取额度策略…</div>

    <template v-else>
      <section class="quota-panel">
        <div class="quota-panel-heading">
          <div>
            <h3>模型计费倍率</h3>
            <p>
              实际 Token × 倍率 = 今日额度消耗。设为 0 即免费模型（不扣额度不扣积分）。模式 ID
              大小写不敏感。
            </p>
          </div>
          <span>{{ modes.length }} 个模式</span>
        </div>
        <div class="quota-table-wrap">
          <table class="quota-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>模式 ID</th>
                <th>模型</th>
                <th>状态</th>
                <th>消耗倍率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mode in modes" :key="mode.id">
                <td>
                  <strong>{{ mode.display_name }}</strong>
                </td>
                <td>
                  <code>{{ mode.mode_id }}</code>
                </td>
                <td class="muted">{{ mode.model_id }}</td>
                <td>
                  <span class="status-dot" :class="mode.status"></span
                  >{{ mode.status === 'active' ? '启用' : '停用' }}
                </td>
                <td>
                  <label class="multiplier-input">
                    <input
                      v-model.number="mode.quota_multiplier"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      aria-label="额度消耗倍率"
                    />
                    <span>×</span>
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="quota-panel">
        <div class="quota-panel-heading">
          <div>
            <h3>订阅每日限额与积分倍率</h3>
            <p>
              Token 按北京时间每日 0:00 重置，-1 不限；0 =
              纯积分模式（需开启下方积分计费）。积分倍率：超出额度后消耗积分的折扣，1.00 为原价。
            </p>
          </div>
        </div>
        <div class="tier-grid">
          <article v-for="tier in tiers" :key="tier.tier" class="tier-card">
            <div class="tier-card-title">
              <strong>{{ tierLabel(tier.tier) }}</strong
              ><code>{{ tier.tier }}</code>
            </div>
            <label
              ><span>Token / 日</span
              ><input v-model.number="tier.daily_token_limit" type="number" min="-1" step="1000"
            /></label>
            <label
              ><span>Web Searching / 日</span
              ><input v-model.number="tier.web_search_daily_limit" type="number" min="-1" step="1"
            /></label>
            <label
              ><span>积分倍率</span
              ><input
                v-model.number="tier.points_multiplier"
                type="number"
                min="0.1"
                max="2"
                step="0.05"
            /></label>
          </article>
        </div>
      </section>

      <section class="quota-panel">
        <div class="quota-panel-heading">
          <div>
            <h3>积分计费</h3>
            <p>
              额度不足 / 纯积分模式下，AI 用量按积分扣费：消耗积分 = 超额 Token × 档位倍率 ÷
              汇率。失败请求不扣分。
            </p>
          </div>
          <label class="pricing-toggle">
            <input v-model="pricing.enabled" type="checkbox" />
            <span>{{ pricing.enabled ? '已开启' : '已关闭' }}</span>
          </label>
        </div>
        <div class="pricing-grid">
          <label class="pricing-field">
            <span>汇率（1 积分 = 多少 Token）</span>
            <input
              v-model.number="pricing.rate_tokens_per_point"
              type="number"
              min="10000"
              step="10000"
            />
            <small>建议 1000000（1 分 = 100 万 billed_tokens）</small>
          </label>
          <label class="pricing-field">
            <span>单用户日消耗上限（积分）</span>
            <input v-model.number="pricing.daily_points_burn_cap" type="number" min="1" step="1" />
            <small>风控阀：含未结算预扣；-1 不限（不建议）</small>
          </label>
        </div>
      </section>

      <section v-if="packs.length" class="quota-panel">
        <div class="quota-panel-heading">
          <div>
            <h3>Coding 附加包价格（积分）</h3>
            <p>订阅页自助购买按此价服务端扣费，改动即时生效。附加包与主订阅共存，同档续费顺延。</p>
          </div>
        </div>
        <div class="quota-table-wrap">
          <table class="quota-table">
            <thead>
              <tr>
                <th>包</th>
                <th>月付（积分）</th>
                <th>月付时长（月）</th>
                <th>年付（积分）</th>
                <th>年付时长（月）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pack in packs" :key="pack.plan_code">
                <td>
                  <strong>{{ pack.label }}</strong> <code>{{ pack.plan_code }}</code>
                </td>
                <td>
                  <input
                    v-model.number="pack.cycles.monthly.points_cost"
                    class="pack-input"
                    type="number"
                    min="0"
                    step="1"
                  />
                </td>
                <td>
                  <input
                    v-model.number="pack.cycles.monthly.duration_months"
                    class="pack-input"
                    type="number"
                    min="1"
                    step="1"
                  />
                </td>
                <td>
                  <input
                    v-model.number="pack.cycles.yearly.points_cost"
                    class="pack-input"
                    type="number"
                    min="0"
                    step="1"
                  />
                </td>
                <td>
                  <input
                    v-model.number="pack.cycles.yearly.duration_months"
                    class="pack-input"
                    type="number"
                    min="1"
                    step="1"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="quota-danger-panel">
        <div>
          <h3>重置所有用户额度</h3>
          <p>
            立即清除所有用户今天的 Token 用量、预占记录和 Web Searching
            计数。历史数据、配置与订阅不会改变。
          </p>
        </div>
        <button class="quota-btn danger" type="button" :disabled="resetting" @click="resetAll">
          <RotateCcw :size="15" />{{ resetting ? '重置中…' : '一键重置全部额度' }}
        </button>
      </section>
    </template>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { RefreshCw, RotateCcw, Save } from 'lucide-vue-next';
import { useConfirmDialog } from '@/composables/useConfirmDialog.js';
import {
  getAiQuotaAdminConfig,
  getCodingPackPrices,
  resetAllAiQuotas,
  saveAiQuotaAdminConfig,
  saveCodingPackPrices,
} from '@/utils/api/ai-quota-admin-api.js';
import { clearVaultModelCache } from '@/utils/api/api-key-runtime-api.js';

const { confirm } = useConfirmDialog();
const loading = ref(false);
const saving = ref(false);
const resetting = ref(false);
const modes = ref([]);
const tiers = ref([]);
const pricing = ref({ enabled: false, rate_tokens_per_point: 1000000, daily_points_burn_cap: 20 });
const packs = ref([]);
const PACK_LABELS = {
  'coding-lite': 'Coding Lite',
  'coding-plus': 'Coding Plus',
  'coding-pro': 'Coding Pro',
  'coding-ultra': 'Coding Ultra',
};
const message = ref('');
const messageTone = ref('success');
const TIER_LABELS = {
  guest: '访客',
  free: '免费',
  plus: 'Plus',
  'boh-ai-plus': 'Plus',
  pro: 'Pro',
  'boh-pro': 'Pro',
  max: 'Max',
  'boh-max': 'Max',
  ultra: 'Ultra',
};
const tierLabel = (tier) => TIER_LABELS[String(tier).toLowerCase()] || tier;
const notify = (text, tone = 'success') => {
  message.value = text;
  messageTone.value = tone;
};

const toPackRows = (rows) => {
  const byCode = new Map();
  for (const row of rows) {
    if (!byCode.has(row.plan_code))
      byCode.set(row.plan_code, {
        plan_code: row.plan_code,
        label: PACK_LABELS[row.plan_code] || row.plan_code,
        cycles: {},
      });
    byCode.get(row.plan_code).cycles[row.billing_cycle] = {
      points_cost: Number(row.points_cost),
      duration_months: Number(row.duration_months),
    };
  }
  return [...byCode.values()];
};

const loadConfig = async () => {
  loading.value = true;
  try {
    const data = await getAiQuotaAdminConfig();
    modes.value = data.modes.map((row) => ({
      ...row,
      quota_multiplier: Number(row.quota_multiplier || 1),
    }));
    tiers.value = data.tiers.map((row) => ({
      ...row,
      daily_token_limit: Number(row.daily_token_limit),
      web_search_daily_limit: Number(row.web_search_daily_limit),
      points_multiplier: Number(row.points_multiplier ?? 1),
    }));
    if (data.pricing) {
      pricing.value = {
        enabled: Boolean(data.pricing.enabled),
        rate_tokens_per_point: Number(data.pricing.rate_tokens_per_point),
        daily_points_burn_cap: Number(data.pricing.daily_points_burn_cap),
      };
    }
    // 价格表在迁移未应用时不可读，降级为隐藏该面板而不是阻塞整页
    packs.value = await getCodingPackPrices()
      .then(toPackRows)
      .catch(() => []);
    message.value = '';
  } catch (error) {
    notify(error?.message || '读取 AI 额度配置失败', 'error');
  } finally {
    loading.value = false;
  }
};

const validate = () => {
  if (
    modes.value.some(
      (row) =>
        !Number.isFinite(Number(row.quota_multiplier)) ||
        Number(row.quota_multiplier) < 0 ||
        Number(row.quota_multiplier) > 100,
    )
  )
    return '模式倍率必须在 0–100 之间（0 = 免费模型）';
  if (
    tiers.value.some(
      (row) =>
        !Number.isInteger(Number(row.daily_token_limit)) || Number(row.daily_token_limit) < -1,
    )
  )
    return 'Token 限额必须是大于等于 -1 的整数';
  if (
    tiers.value.some(
      (row) =>
        !Number.isInteger(Number(row.web_search_daily_limit)) ||
        Number(row.web_search_daily_limit) < -1,
    )
  )
    return 'Web Searching 限额必须是大于等于 -1 的整数';
  if (
    tiers.value.some(
      (row) =>
        !Number.isFinite(Number(row.points_multiplier)) ||
        Number(row.points_multiplier) < 0.1 ||
        Number(row.points_multiplier) > 2,
    )
  )
    return '积分倍率必须在 0.1–2 之间';
  if (
    !Number.isFinite(Number(pricing.value.rate_tokens_per_point)) ||
    Number(pricing.value.rate_tokens_per_point) < 10000
  )
    return '汇率不能低于 10000 Token / 积分';
  if (
    !Number.isInteger(Number(pricing.value.daily_points_burn_cap)) ||
    Number(pricing.value.daily_points_burn_cap) < 1
  )
    return '日消耗上限必须是不小于 1 的整数';
  if (
    packs.value.some((pack) =>
      ['monthly', 'yearly'].some((cycle) => {
        const row = pack.cycles[cycle];
        return (
          !row ||
          !Number.isInteger(Number(row.points_cost)) ||
          Number(row.points_cost) < 0 ||
          !Number.isInteger(Number(row.duration_months)) ||
          Number(row.duration_months) < 1
        );
      }),
    )
  )
    return '附加包价格与时长必须是不小于 0 / 1 的整数';
  return '';
};

const saveConfig = async () => {
  const error = validate();
  if (error) return notify(error, 'error');
  saving.value = true;
  try {
    await saveAiQuotaAdminConfig({
      tiers: tiers.value,
      modes: modes.value,
      pricing: pricing.value,
    });
    if (packs.value.length) await saveCodingPackPrices(packs.value);
    // 让 Edge Function 的内存缓存（模型倍率 / 额度策略 / 积分开关）立即失效
    clearVaultModelCache().catch(() => undefined);
    notify('AI 额度与积分策略已保存，运行时缓存已即时刷新。');
  } catch (err) {
    notify(err?.message || '保存失败', 'error');
  } finally {
    saving.value = false;
  }
};

const resetAll = async () => {
  const accepted = await confirm({
    title: '重置所有用户 AI 额度？',
    message: '这会清除全部用户当前累计的 Token 与 Web Searching 用量，操作不可撤销。',
    tone: 'danger',
    confirmText: '确认全部重置',
    cancelText: '取消',
  });
  if (!accepted) return;
  resetting.value = true;
  try {
    const result = await resetAllAiQuotas();
    notify(
      `额度已重置：Token 记录 ${result?.tokenLogsDeleted || 0} 条，Web Searching 记录 ${result?.webSearchLogsDeleted || 0} 条。`,
    );
  } catch (error) {
    notify(error?.message || '重置额度失败', 'error');
  } finally {
    resetting.value = false;
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.quota-config-page {
  display: grid;
  gap: 16px;
  color: var(--foreground);
}
.quota-config-hero,
.quota-panel,
.quota-danger-panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--card);
}
.quota-config-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 22px;
}
.quota-kicker {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h2,
h3,
p {
  margin: 0;
}
h2 {
  margin-top: 4px;
  font-size: 22px;
}
h3 {
  font-size: 15px;
}
p {
  margin-top: 5px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}
.quota-hero-actions {
  display: flex;
  gap: 8px;
}
.quota-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--card);
  color: var(--foreground);
  font-weight: 650;
  cursor: pointer;
}
.quota-btn.primary {
  background: var(--foreground);
  color: var(--background);
  border-color: var(--foreground);
}
.quota-btn.danger {
  color: #b42318;
  border-color: #f3b7b1;
  background: #fff7f6;
}
.quota-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.quota-notice,
.quota-loading {
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.quota-notice.success {
  background: #ecfdf3;
  color: #067647;
}
.quota-notice.error {
  background: #fff1f0;
  color: #b42318;
}
.quota-loading {
  color: var(--muted-foreground);
  background: var(--muted);
}
.quota-panel {
  overflow: hidden;
}
.quota-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 18px;
  border-bottom: 1px solid var(--border);
}
.quota-panel-heading > span {
  color: var(--muted-foreground);
  font-size: 12px;
}
.quota-table-wrap {
  overflow-x: auto;
}
.quota-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.quota-table th,
.quota-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  white-space: nowrap;
}
.quota-table th {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
}
.quota-table tbody tr:last-child td {
  border-bottom: 0;
}
.quota-table code,
.tier-card code {
  color: var(--muted-foreground);
  font-size: 11px;
}
.muted {
  color: var(--muted-foreground);
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: #98a2b3;
}
.status-dot.active {
  background: #12b76a;
}
.multiplier-input {
  display: inline-flex;
  align-items: center;
  width: 94px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--background);
}
.multiplier-input input {
  width: 68px;
  height: 34px;
  padding: 0 8px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.multiplier-input span {
  color: var(--muted-foreground);
}
.pack-input {
  width: 84px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: inherit;
}
.tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
  padding: 14px;
}
.tier-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--background);
}
.tier-card-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.tier-card label {
  display: grid;
  gap: 6px;
  color: var(--muted-foreground);
  font-size: 11px;
}
.tier-card input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--foreground);
}
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  padding: 16px;
}
.pricing-field {
  display: grid;
  gap: 6px;
  color: var(--muted-foreground);
  font-size: 12px;
}
.pricing-field span {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 600;
}
.pricing-field input {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--foreground);
}
.pricing-field small {
  font-size: 11px;
  color: var(--muted-foreground);
}
.pricing-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.pricing-toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--foreground);
  cursor: pointer;
}
.quota-danger-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
  border-color: #f3b7b1;
}
@media (max-width: 720px) {
  .quota-config-hero,
  .quota-danger-panel {
    align-items: stretch;
    flex-direction: column;
  }
  .quota-hero-actions {
    width: 100%;
  }
  .quota-hero-actions .quota-btn {
    flex: 1;
  }
  .quota-btn.danger {
    width: 100%;
  }
}
</style>
