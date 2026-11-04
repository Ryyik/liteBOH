<template>
  <!-- 确认订单（2026-11-03）
       用户口径：「下单流程不像主流购物平台，就这样优化」。
       这一层替代了原来的「确认收货信息」表单弹窗：原来点结算只弹一张 420px 的地址表单，
       用户看不到自己买了什么、总共付多少、提交后会发生什么。

       形态与 ProductDetailSheet 对齐：竖屏全屏（手机上就是"下一页"），横屏 / 宽屏居中弹窗。
       两者都用同一个 z-index 档位（2147482400）—— 低于它会被全局导航里的灵动岛压住。

       ⚠️ 形态用 CSS 媒体查询而不是 JS 监听 orientation：弹窗打开期间旋转设备，
         只有样式能即时跟上，JS 监听会慢一帧且要自己清理。
       ⚠️ 不在此组件里改 document.body.style.overflow（父层拥有那把锁）：
         提交成功时父层要「关结算 → 开成功弹窗」同时完成，子组件在卸载时再写一次
         overflow 会把父层刚上的锁冲掉。 -->
  <Teleport to="body">
    <Transition name="ck">
      <div v-if="visible" class="ck-root shop-sheet-tokens">
        <div class="ck-scrim" @click="requestClose"></div>

        <section
          class="ck-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ck-title"
          tabindex="-1"
        >
          <header class="ck-head">
            <button type="button" class="ck-back" aria-label="返回购物袋" @click="requestClose">
              <ChevronLeft :size="22" :stroke-width="1.9" aria-hidden="true" />
            </button>
            <h2 id="ck-title" class="ck-title">确认订单</h2>
            <span class="ck-count">共 {{ summary.totalQty }} 件</span>
          </header>

          <div ref="bodyRef" class="ck-body">
            <!-- 收货地址：一张卡 + 更换。地址簿维护仍在「地址」分区，这里只做选择 -->
            <!-- 竖屏是单栏（地址 + 商品 + 金额顺序堆叠），横屏拆成左右两栏：
                 左边「要核对的东西」、右边「金额与说明」。用两个 .ck-col 包住，
                 切换方向只改容器，不在模板里写两套。 -->
            <div class="ck-col">
              <section class="ck-block ck-addr-block" aria-label="收货地址">
                <button v-if="selected" type="button" class="ck-addr" @click="openPicker('list')">
                  <span class="ck-addr-pin" aria-hidden="true">
                    <MapPin :size="15" :stroke-width="1.9" />
                  </span>
                  <span class="ck-addr-copy">
                    <span class="ck-addr-head">
                      <strong>{{ selected.recipient || '未填写收件人' }}</strong>
                      <span class="ck-addr-phone">{{ maskPhone(selected.phone) }}</span>
                    </span>
                    <span class="ck-addr-detail">{{ addressText(selected) }}</span>
                  </span>
                  <span class="ck-addr-change">更换</span>
                </button>

                <button v-else type="button" class="ck-addr is-empty" @click="openPicker('form')">
                  <span class="ck-addr-pin" aria-hidden="true">
                    <MapPin :size="15" :stroke-width="1.9" />
                  </span>
                  <span class="ck-addr-copy">
                    <strong>添加收货地址</strong>
                    <span class="ck-addr-detail">实物要用它寄出，填一次以后自动带出</span>
                  </span>
                  <span class="ck-addr-change">去填写</span>
                </button>
              </section>

              <!-- 商品清单：主流确认页的第一诉求就是"我现在到底在买什么"。
                 用 TransitionGroup：移除失效商品时整行淡出、其余行 FLIP 归位，
                 而不是"删完瞬间塌一下"。 -->
              <section class="ck-block ck-items-block" aria-label="商品清单">
                <TransitionGroup tag="ul" name="ck-line" class="ck-items">
                  <li v-for="line in summary.lines" :key="line.key" class="ck-item">
                    <span class="ck-item-thumb">
                      <img
                        v-if="lineImage(line) && !isImageFailed(`ck-${line.key}`)"
                        :src="lineImage(line)"
                        alt=""
                        loading="lazy"
                        @error="markImageFailed(`ck-${line.key}`)"
                      />
                      <Package v-else :size="18" :stroke-width="1.6" aria-hidden="true" />
                    </span>
                    <span class="ck-item-main">
                      <span class="ck-item-title">{{ line.title }}</span>
                      <span class="ck-item-sub">
                        {{ line.specLabel }}
                        <em v-if="lineIssueLabel(line)" class="ck-item-issue">
                          {{ lineIssueLabel(line) }}
                        </em>
                      </span>
                      <span v-if="line.quantity > 1" class="ck-item-price">
                        {{ line.priceText
                        }}<span class="ck-item-times"> × {{ line.quantity }}</span>
                      </span>
                    </span>
                    <span class="ck-item-subtotal">{{ line.subtotalText }}</span>
                  </li>
                </TransitionGroup>
              </section>
            </div>

            <div class="ck-col">
              <!-- 金额明细：一次把"付多少"说死。运费口径 2026-11-04 定档「全场包邮」——
                   原来那句「确认寄送方式时与管理员核对」看起来像还要另付邮费，
                   用户在结算页最怕的就是这种没写死的数字。 -->
              <section class="ck-block ck-amount" aria-label="金额明细">
                <div v-if="summary.totalPoints" class="ck-row">
                  <span>商品积分</span><strong>{{ summary.totalPoints }} 积分</strong>
                </div>
                <div v-if="summary.totalCents" class="ck-row">
                  <span>现金</span><strong>{{ rmbText(summary.totalCents) }}</strong>
                </div>
                <div class="ck-row"><span>运费</span><strong class="is-free">包邮</strong></div>
                <div class="ck-row is-total">
                  <span>应付</span><strong>{{ summary.totalText }}</strong>
                </div>
                <p
                  v-if="summary.totalPoints"
                  class="ck-balance"
                  :class="{ 'is-short': summary.insufficientPoints }"
                >
                  当前余额 {{ pointsBalance }} 积分，本单后剩
                  {{ Math.max(0, summary.remainingPoints) }}
                </p>
              </section>

              <p class="ck-note">
                提交后积分立即扣除，全场包邮。现金部分由管理员通过资料里的电话联系你收取，
                收款后安排寄送。
              </p>

              <!-- 订单备注（2026-11-04）：尺码、收货时间这类要求以前只能事后私聊，
                   商家备货时看不到、退款换货时也说不清当初要求过什么。
                   限 200 字（DB 侧同约束），随订单落库，不进用户资料。 -->
              <section class="ck-block ck-remark" aria-label="订单备注">
                <label class="ck-remark-head" for="ck-remark-input">
                  订单备注
                  <span class="ck-remark-opt">选填 · 最多 200 字</span>
                </label>
                <input
                  id="ck-remark-input"
                  v-model="remark"
                  class="ck-remark-input"
                  type="text"
                  maxlength="200"
                  autocomplete="off"
                  placeholder="尺码 / 收货时间 / 其他要求"
                />
              </section>
            </div>
          </div>

          <footer class="ck-foot">
            <div v-if="summary.issues.length" class="ck-issues" role="status">
              <p
                v-for="issue in summary.issues"
                :key="issue.code"
                class="ck-issue"
                :class="`is-${issue.level}`"
              >
                {{ issue.message }}
              </p>
              <button
                v-if="summary.removableKeys.length"
                type="button"
                class="ck-issue-fix"
                @click="$emit('remove-invalid', summary.removableKeys)"
              >
                移除失效商品
              </button>
            </div>

            <div class="ck-foot-row">
              <div class="ck-total">
                <span>合计</span>
                <strong>{{ summary.totalText }}</strong>
              </div>
              <button
                type="button"
                class="ck-submit"
                :disabled="!summary.canSubmit || submitting"
                @click="handleSubmit"
              >
                <span v-if="submitting" class="ck-spinner" aria-hidden="true"></span>
                {{ submitting ? '提交中…' : '提交订单' }}
              </button>
            </div>
          </footer>
        </section>

        <!-- 地址选择 / 新增：叠在结算页之上的第二层，不跳走、不丢当前订单。
             整层走 Transition（遮罩淡入 + 面板上滑），列表与表单之间再来一层
             out-in 的短过渡 —— 两处都不许硬切。 -->
        <Transition name="ck-layer">
          <div v-if="pickerOpen" class="ck-picker-root">
            <div class="ck-picker-scrim" @click="closePicker"></div>
            <section class="ck-picker" role="dialog" aria-modal="true" aria-label="选择收货地址">
              <header class="ck-picker-head">
                <h3>{{ pickerMode === 'form' ? '新增收货地址' : '选择收货地址' }}</h3>
                <button type="button" class="ck-icon-btn" aria-label="关闭" @click="closePicker">
                  <X :size="16" :stroke-width="2" aria-hidden="true" />
                </button>
              </header>

              <Transition name="ck-step" mode="out-in">
                <div v-if="pickerMode === 'list'" key="list" class="ck-picker-body">
                  <p v-if="addressLoading" class="ck-picker-hint">正在读取地址簿…</p>
                  <template v-else>
                    <button
                      v-for="addr in addresses"
                      :key="addr.id"
                      type="button"
                      class="ck-pick-row"
                      :class="{ 'is-active': selected && selected.id === addr.id }"
                      @click="chooseAddress(addr)"
                    >
                      <span class="ck-pick-radio" aria-hidden="true">
                        <Check
                          v-if="selected && selected.id === addr.id"
                          :size="12"
                          :stroke-width="3"
                        />
                      </span>
                      <span class="ck-pick-copy">
                        <span class="ck-pick-head">
                          <strong>{{ addr.recipient || '未填写' }}</strong>
                          <span>{{ maskPhone(addr.phone) }}</span>
                          <em v-if="addr.is_default" class="ck-pick-badge">默认</em>
                        </span>
                        <span class="ck-pick-detail">{{ addressText(addr) }}</span>
                      </span>
                    </button>
                    <p v-if="!addresses.length" class="ck-picker-hint">
                      地址簿还是空的，先添加一个。
                    </p>
                  </template>
                  <button type="button" class="ck-pick-add" @click="startCreate">
                    <Plus :size="15" :stroke-width="2" aria-hidden="true" />
                    新增收货地址
                  </button>
                  <button
                    v-if="addresses.length"
                    type="button"
                    class="ck-pick-manage"
                    @click="$emit('manage-addresses')"
                  >
                    在地址簿里编辑 / 删除
                  </button>
                </div>

                <div v-else key="form" class="ck-picker-body">
                  <div class="ck-form-grid">
                    <label class="ck-field">
                      <span>收件人</span>
                      <input v-model.trim="form.recipient" type="text" placeholder="收件人姓名" />
                    </label>
                    <label class="ck-field">
                      <span>电话</span>
                      <input
                        v-model.trim="form.phone"
                        type="tel"
                        inputmode="tel"
                        placeholder="手机号"
                      />
                    </label>
                  </div>

                  <div class="ck-field">
                    <span>收货地址</span>
                    <div class="ck-paste">
                      <input
                        ref="pasteInputRef"
                        v-model="form.pasteText"
                        type="text"
                        :placeholder="awaitingPaste ? '粘贴到这里' : '粘贴整段地址自动拆分'"
                        @paste="handleAddressPaste"
                        @input="handleAddressTyping"
                      />
                      <button
                        type="button"
                        class="ck-paste-btn"
                        :class="{ 'is-awaiting': awaitingPaste }"
                        :disabled="recognizing"
                        @click="readClipboardAddress"
                      >
                        <ClipboardPaste :size="14" :stroke-width="1.8" aria-hidden="true" />
                        {{ recognizing ? '识别中' : awaitingPaste ? '等待粘贴' : '识别' }}
                      </button>
                    </div>
                    <div class="ck-addr-grid">
                      <div class="ck-select">
                        <select v-model="form.province" aria-label="省份">
                          <option value="">省份</option>
                          <option v-for="province in PROVINCES" :key="province" :value="province">
                            {{ province }}
                          </option>
                        </select>
                      </div>
                      <input
                        v-model.trim="form.city"
                        type="text"
                        placeholder="城市"
                        aria-label="城市"
                      />
                    </div>
                    <textarea
                      v-model.trim="form.detail"
                      rows="2"
                      placeholder="区县 / 街道 / 门牌号"
                      aria-label="详细地址"
                    ></textarea>
                  </div>

                  <p v-if="formError" class="ck-form-error" role="alert">{{ formError }}</p>

                  <div class="ck-form-actions">
                    <button type="button" class="ck-btn-ghost" @click="closePicker">取消</button>
                    <button
                      type="button"
                      class="ck-btn-primary"
                      :disabled="saving"
                      @click="saveNewAddress"
                    >
                      {{ saving ? '保存中…' : '保存并使用' }}
                    </button>
                  </div>
                </div>
              </Transition>
            </section>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Check, ChevronLeft, ClipboardPaste, MapPin, Package, Plus, X } from 'lucide-vue-next';
import { resolveDbCardImage } from '@/utils/db-image-url.js';
import { useImageFailure } from '@/composables/useImageFailure.js';
import { createAddress, fetchMyAddresses } from '@/utils/api/address-api.js';
import {
  PROVINCES,
  composeAddress,
  looksLikeFullAddress,
  parseAddress,
} from '@/utils/address-parse.js';
import { logger } from '@/utils/logger.js';
import { buildCheckoutSummary, lineIssueLabel } from './checkout-summary.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  bagItems: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
  pointsBalance: { type: Number, default: 0 },
  userId: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  /* 老用户的兜底：地址簿一条都没有、但 profiles.shipping_* 有历史收货信息时的回落。
     没有它，2026-11-01 之前下过单的人打开结算会是一张空表 —— 明明填过。 */
  fallbackAddress: { type: Object, default: null },
});

const emit = defineEmits([
  'close',
  'submit',
  'update:address',
  'manage-addresses',
  'remove-invalid',
]);

const bodyRef = ref(null);
const addresses = ref([]);
const addressLoading = ref(false);
const selected = ref(null);
const pickerOpen = ref(false);
const pickerMode = ref('list');

const form = reactive({
  recipient: '',
  phone: '',
  province: '',
  city: '',
  detail: '',
  pasteText: '',
});
const formError = ref('');
const saving = ref(false);
/* 订单备注：跟着订单走，不属于用户资料。关闭面板时不清空 —— 用户可能只是去换个地址 */
const remark = ref('');

const { isFailed, markFailed } = useImageFailure();
const lineImage = (line) => resolveDbCardImage(line?.image) || '';
const isImageFailed = (key) => isFailed(key);
const markImageFailed = (key) => markFailed(key);

const summary = computed(() =>
  buildCheckoutSummary({
    bagItems: props.bagItems,
    products: props.products,
    pointsBalance: props.pointsBalance,
    addressReady: Boolean(
      selected.value && selected.value.recipient && addressText(selected.value),
    ),
  }),
);

const rmbText = (cents) => `¥${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
/* 电话脱敏：确认页是要给旁边人看也不尴尬的一屏，中间四位打码，尾号仍可核对 */
const maskPhone = (value) => {
  const text = String(value || '').replace(/\s/g, '');
  if (text.length < 7) return text || '—';
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
};
const addressText = (addr) =>
  [String(addr?.region || '').trim(), String(addr?.detail || '').trim()].filter(Boolean).join(' ');

const syncAddress = (addr) => {
  selected.value = addr || null;
  emit('update:address', addr || null);
};

const refreshAddresses = async () => {
  addressLoading.value = true;
  try {
    const { data, error } = await fetchMyAddresses(props.userId);
    if (error) logger.warn('shop-checkout', '读取地址簿失败', error);
    addresses.value = Array.isArray(data) ? data : [];
    // 已选的那条还在就保留（用户可能刚在地址簿里改了它），否则退回默认/第一条
    if (selected.value?.id) {
      const fresh = addresses.value.find((row) => row.id === selected.value.id);
      if (fresh) {
        syncAddress(fresh);
        return;
      }
    }
    if (!selected.value && addresses.value.length) syncAddress(addresses.value[0]);
    /* 地址簿空 → 回落 profiles 里的历史收货信息（它会以「虚拟地址」出现在卡上：
       id 为空，submit 时父层照旧写回 profiles，行为与旧结算一致）。 */
    if (!addresses.value.length && !selected.value && props.fallbackAddress?.recipient) {
      syncAddress({ ...props.fallbackAddress, id: '', is_default: false });
    }
  } finally {
    addressLoading.value = false;
  }
};

const openPicker = (mode) => {
  pickerMode.value = mode;
  pickerOpen.value = true;
  if (mode === 'form') resetForm();
  if (mode === 'list' && !addresses.value.length) void refreshAddresses();
};

const closePicker = () => {
  pickerOpen.value = false;
  stopPasteWatch();
};

const chooseAddress = (addr) => {
  // 只改「这一单选谁」，不反写地址簿默认 —— 选一次新地址不该悄悄改掉用户的默认
  syncAddress(addr);
  closePicker();
};

const resetForm = () => {
  form.recipient = String(selected.value?.recipient || '');
  form.phone = String(selected.value?.phone || '');
  const parsed = parseAddress(addressText(selected.value));
  form.province = parsed.province;
  form.city = parsed.city;
  form.detail = parsed.detail;
  form.pasteText = '';
  formError.value = '';
};

const startCreate = () => {
  pickerMode.value = 'form';
  resetForm();
};

const isPhoneLike = (value) => /^[+]?[\d\s()-]{7,20}$/.test(String(value || '').trim());

const saveNewAddress = async () => {
  if (saving.value) return;
  const recipient = form.recipient.trim();
  const phone = form.phone.trim();
  const province = form.province.trim();
  const detail = form.detail.trim();
  if (!recipient) {
    formError.value = '请填写收件人';
    return;
  }
  if (!isPhoneLike(phone)) {
    formError.value = '请填写有效电话';
    return;
  }
  if (!province) {
    formError.value = '请选择省份';
    return;
  }
  if (detail.length < 4) {
    formError.value = '请填写详细地址（区县 / 街道 / 门牌号）';
    return;
  }
  formError.value = '';

  saving.value = true;
  try {
    const result = await createAddress({
      userId: props.userId,
      recipient,
      phone,
      region: composeAddress({ province, city: form.city.trim(), detail: '' }),
      detail,
    });
    if (!result.ok) {
      formError.value = '地址保存失败，请稍后重试';
      return;
    }
    await refreshAddresses();
    const matched =
      addresses.value.find(
        (row) => row.recipient === recipient && row.phone === phone && row.detail === detail,
      ) || addresses.value[0];
    if (matched) syncAddress(matched);
    closePicker();
  } finally {
    saving.value = false;
  }
};

/* ── 粘贴识别（从原结算弹窗整体搬过来，降级链原样保留）─────────────
   1) navigator.clipboard.readText() 标准路径；
   2) 读不到 / 被拒（iOS WKWebView、iframe、未授权、剪贴板空）→ 进入「等待粘贴」，
      在文档捕获阶段挂一次性 paste 监听（移动端点完按钮焦点常常跑掉，不能依赖焦点）；
   3) 15s 无操作自动解除，避免长期劫持全局粘贴。 */
const pasteInputRef = ref(null);
const recognizing = ref(false);
const awaitingPaste = ref(false);
let pasteWatchTimer = null;

function stopPasteWatch() {
  awaitingPaste.value = false;
  if (pasteWatchTimer) {
    clearTimeout(pasteWatchTimer);
    pasteWatchTimer = null;
  }
  document.removeEventListener('paste', onDocumentPaste, true);
}

function onDocumentPaste(event) {
  if (!pickerOpen.value || pickerMode.value !== 'form') {
    stopPasteWatch();
    return;
  }
  if (event.target === pasteInputRef.value) return;
  const text = String(event?.clipboardData?.getData('text') || '').trim();
  if (!text) return;
  event.preventDefault();
  const ok = applyAddressText(text);
  form.pasteText = ok ? '' : text;
  stopPasteWatch();
}

const applyAddressText = (text) => {
  const parsed = parseAddress(text);
  if (!parsed.province && !parsed.city && !parsed.detail) return false;
  form.province = parsed.province || form.province;
  form.city = parsed.city;
  form.detail = parsed.detail;
  return true;
};

const handleAddressPaste = (event) => {
  const text = event?.clipboardData?.getData('text') || '';
  if (!looksLikeFullAddress(text)) return;
  event.preventDefault();
  if (applyAddressText(text)) form.pasteText = '';
};

const handleAddressTyping = () => {
  if (!looksLikeFullAddress(form.pasteText)) return;
  if (applyAddressText(form.pasteText)) form.pasteText = '';
};

const armPasteWatch = async () => {
  await nextTick();
  pasteInputRef.value?.focus?.();
  awaitingPaste.value = true;
  document.addEventListener('paste', onDocumentPaste, true);
  if (pasteWatchTimer) clearTimeout(pasteWatchTimer);
  pasteWatchTimer = setTimeout(stopPasteWatch, 15000);
};

const readClipboardAddress = async () => {
  if (recognizing.value) return;
  recognizing.value = true;
  try {
    let text = '';
    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (error) {
        logger.warn('shop-checkout', '读取剪贴板失败，转手动粘贴引导', error);
      }
    }
    text = String(text || '').trim();
    if (text) {
      if (!applyAddressText(text)) form.pasteText = text;
      else form.pasteText = '';
      return;
    }
    await armPasteWatch();
  } finally {
    recognizing.value = false;
  }
};

const handleSubmit = () => {
  if (!summary.value.canSubmit || props.submitting) return;
  if (!selected.value) {
    openPicker(addresses.value.length ? 'list' : 'form');
    return;
  }
  emit('submit', {
    id: selected.value.id || '',
    recipient: String(selected.value.recipient || '').trim(),
    phone: String(selected.value.phone || '').trim(),
    region: String(selected.value.region || '').trim(),
    detail: String(selected.value.detail || '').trim(),
    remark: String(remark.value || '')
      .trim()
      .slice(0, 200),
  });
};

const requestClose = () => {
  if (props.submitting) return;
  closePicker();
  emit('close');
};

const onKeydown = (event) => {
  if (event.key !== 'Escape' || !props.visible) return;
  if (pickerOpen.value) {
    closePicker();
    return;
  }
  requestClose();
};

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      pickerOpen.value = false;
      stopPasteWatch();
      return;
    }
    await refreshAddresses();
    // 一条地址都没有（也没有历史回落）⇒ 直接把新增表单摆出来，别让用户先点一次「去填写」
    if (!selected.value) openPicker('form');
    /* 键盘/读屏的滚动指令要落在弹层里：结算页是覆盖全屏的一层，
       焦点留在背后页面上会让阅读顺序错位（与商品详情 playOpen 同一处理）。 */
    void nextTick(() => bodyRef.value?.parentElement?.focus?.({ preventScroll: true }));
  },
);

watch(
  () => props.userId,
  () => {
    selected.value = null;
    emit('update:address', null);
    addresses.value = [];
  },
);

if (typeof document !== 'undefined') document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  stopPasteWatch();
});
</script>

<style scoped>
.ck-root {
  position: fixed;
  inset: 0;
  /* 与商品详情 / 抽奖详情 / 支付成功同档：压过全局导航（9999）与左栏 */
  z-index: 2147482400;
  color: var(--boh-text-primary, #1d1d1f);
}

.ck-scrim {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

/* 竖屏是**一整页**，不是盖在购物袋上的弹窗：遮罩根本不参与（留着它会在
   进出场的那 30ms 里闪一层灰）。只有横屏弹窗形态才需要遮罩。 */
@media (orientation: portrait) {
  .ck-scrim {
    display: none;
  }
}

/* ── 竖屏：整页（手机上是"下一页"，不是弹窗） ── */
.ck-sheet {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ck-sheet:focus {
  outline: none;
}

.ck-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px;
  border-bottom: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  background: var(--boh-bg-primary, #fff);
}

.ck-back {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  cursor: pointer;
}

.ck-back:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ck-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.ck-count {
  margin-left: auto;
  padding-right: 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ck-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 竖屏就是"一栏装所有内容"；横屏把它横过来变成两栏（见媒体查询） */
.ck-col {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.ck-block {
  border-radius: 14px;
  background: var(--boh-bg-primary, #fff);
  padding: 4px;
}

/* ── 地址卡 ── */
.ck-addr {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ck-addr:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ck-addr.is-empty {
  border: 1px dashed var(--boh-border-primary, rgba(0, 0, 0, 0.16));
}

.ck-addr-pin {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.08));
  color: var(--boh-brand-blue, #0071e3);
}

.ck-addr-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ck-addr-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.ck-addr-head strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ck-addr-phone {
  flex: none;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ck-addr-copy > strong {
  font-size: 14px;
  font-weight: 500;
}

.ck-addr-detail {
  overflow: hidden;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ck-addr-change {
  flex: none;
  color: var(--boh-brand-blue, #0071e3);
  font-size: 12px;
}

/* ── 商品清单 ── */
.ck-items {
  position: relative; /* leave 的绝对定位基准（.ck-line-leave-active） */
  margin: 0;
  padding: 0;
  list-style: none;
}

.ck-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 10px;
}

.ck-item + .ck-item {
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
}

.ck-item-thumb {
  display: grid;
  flex: none;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-tertiary, #a1a1a6);
}

.ck-item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ck-item-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ck-item-title {
  overflow: hidden;
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.ck-item-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
}

.ck-item-issue {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--boh-danger-soft, rgba(255, 59, 48, 0.1));
  color: var(--boh-danger, #d70015);
  font-size: 10px;
  font-style: normal;
}

.ck-item-price {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ck-item-times {
  color: var(--boh-text-tertiary, #a1a1a6);
}

.ck-item-subtotal {
  flex: none;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

/* ── 金额明细 ── */
.ck-amount {
  padding: 12px 14px;
}

.ck-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.ck-row strong {
  color: var(--boh-text-primary, #1d1d1f);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.ck-row strong.is-free {
  /* 包邮是「让用户放心」的信息，用品牌色而不是灰色 —— 灰色等于告诉用户"这项还没定" */
  color: var(--boh-brand-blue, #0071e3);
  font-size: 13px;
  font-weight: 600;
}

.ck-row.is-total {
  margin-top: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
}

.ck-row.is-total strong {
  font-size: 16px;
  font-weight: 500;
}

.ck-balance {
  margin: 6px 0 0;
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  text-align: right;
}

.ck-balance.is-short {
  color: var(--boh-danger, #d70015);
}

/* 订单备注：和金额区同宽、同圆角，视觉上属于"这一单的信息"而不是另一个表单 */
.ck-remark {
  padding: 10px 12px;
}

.ck-remark-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 12.5px;
  font-weight: 500;
}

.ck-remark-opt {
  color: var(--boh-text-tertiary, #a1a1a6);
  font-size: 11px;
  font-weight: 400;
}

.ck-remark-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 9px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.4;
}

.ck-remark-input::placeholder {
  color: var(--boh-text-tertiary, #a1a1a6);
}

.ck-remark-input:focus {
  border-color: var(--boh-brand-blue, #0071e3);
  outline: none;
}

.ck-note {
  margin: 0 4px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
  line-height: 1.6;
}

/* ── 底部固定条 ── */
.ck-foot {
  flex: none;
  border-top: 1px solid var(--boh-divider, rgba(0, 0, 0, 0.06));
  background: var(--boh-bg-primary, #fff);
  padding: 8px 14px calc(10px + env(safe-area-inset-bottom, 0px));
}

.ck-issues {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 4px 0 8px;
}

.ck-issue {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
}

.ck-issue.is-block {
  color: var(--boh-danger, #d70015);
}

.ck-issue.is-warn {
  color: var(--boh-warning, #8a5a00);
}

.ck-issue-fix {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--boh-brand-blue, #0071e3);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ck-foot-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ck-total {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.ck-total span {
  color: var(--boh-text-secondary, #86868b);
  font-size: 11px;
}

.ck-total strong {
  font-size: 16px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.ck-submit {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 136px;
  height: 44px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  transition:
    filter 160ms ease,
    transform 120ms ease;
}

.ck-submit:hover:not(:disabled) {
  filter: brightness(1.06);
}

.ck-submit:active:not(:disabled) {
  transform: scale(0.985);
}

.ck-submit:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.ck-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ckSpin 720ms linear infinite;
}

@keyframes ckSpin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 地址选择 / 新增 ── */
.ck-picker-root {
  position: absolute;
  inset: 0;
}

.ck-picker-scrim {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.34);
}

.ck-picker {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  max-height: min(78vh, 640px);
  overflow: hidden;
  border-radius: 18px 18px 0 0;
  background: var(--boh-bg-primary, #fff);
}

.ck-picker-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 8px;
}

/* 地址选择层：遮罩淡入 + 面板上滑（横屏居中面板改为轻推 12px）。
   两层过渡必须分开写 —— 整层只动 opacity，位移交给面板，
   否则遮罩会跟着一起位移，边缘露出背景。 */
.ck-layer-enter-active,
.ck-layer-leave-active {
  transition: opacity 180ms ease;
}

.ck-layer-enter-from,
.ck-layer-leave-to {
  opacity: 0;
}

.ck-layer-enter-active .ck-picker,
.ck-layer-leave-active .ck-picker {
  transition: transform 260ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ck-layer-enter-from .ck-picker,
.ck-layer-leave-to .ck-picker {
  transform: translateY(28px);
}

/* 列表 ⇄ 新增表单：out-in 的短横向滑动，避免整块内容瞬间换掉 */
.ck-step-enter-active,
.ck-step-leave-active {
  transition:
    opacity 140ms ease,
    transform 160ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ck-step-enter-from {
  opacity: 0;
  transform: translateX(10px);
}

.ck-step-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* 商品行的增删：移除失效商品时整行淡出、其余行不跳位 */
.ck-line-enter-from,
.ck-line-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.ck-line-enter-active,
.ck-line-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ck-line-leave-active {
  position: absolute;
  left: 0;
  right: 0;
}

.ck-line-move {
  transition: transform 220ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ck-picker-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}

.ck-icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: var(--boh-text-secondary, #86868b);
  cursor: pointer;
}

.ck-picker-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 12px calc(14px + env(safe-area-inset-bottom, 0px));
}

.ck-picker-hint {
  margin: 12px 4px;
  color: var(--boh-text-secondary, #86868b);
  font-size: 13px;
}

.ck-pick-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ck-pick-row + .ck-pick-row {
  margin-top: 2px;
}

.ck-pick-row:hover {
  background: var(--boh-bg-secondary, #f5f5f7);
}

.ck-pick-row.is-active {
  border-color: var(--boh-brand-blue, #0071e3);
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.06));
}

.ck-pick-radio {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border: 1.5px solid var(--boh-border-primary, rgba(0, 0, 0, 0.2));
  border-radius: 50%;
  color: #fff;
}

.ck-pick-row.is-active .ck-pick-radio {
  border-color: var(--boh-brand-blue, #0071e3);
  background: var(--boh-brand-blue, #0071e3);
}

.ck-pick-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ck-pick-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.ck-pick-head strong {
  font-weight: 500;
}

.ck-pick-head span {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ck-pick-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--boh-brand-blue-soft, rgba(0, 113, 227, 0.1));
  color: var(--boh-brand-blue, #0071e3);
  font-size: 10px;
  font-style: normal;
}

.ck-pick-detail {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  line-height: 1.45;
}

.ck-pick-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 42px;
  margin-top: 10px;
  border: 1px dashed var(--boh-border-primary, rgba(0, 0, 0, 0.16));
  border-radius: 12px;
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
  font-size: 13px;
  cursor: pointer;
}

.ck-pick-manage {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── 新增地址表单 ── */
.ck-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.ck-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 10px;
}

.ck-field > span {
  color: var(--boh-text-secondary, #86868b);
  font-size: 12px;
}

.ck-field input,
.ck-field textarea,
.ck-select select {
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  background: var(--boh-bg-secondary, #f5f5f7);
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.ck-field input,
.ck-select select {
  height: 40px;
}

.ck-field textarea {
  margin-top: 8px;
  height: 60px;
  padding: 9px 12px;
  line-height: 1.45;
  resize: none;
}

.ck-paste {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ck-paste input {
  flex: 1;
  min-width: 0;
  border-style: dashed;
}

.ck-paste-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  background: var(--boh-bg-primary, #fff);
  color: var(--boh-brand-blue, #0071e3);
  font-size: 12px;
  cursor: pointer;
}

.ck-paste-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.ck-paste-btn.is-awaiting {
  border-color: var(--boh-brand-blue, #0071e3);
  font-weight: 500;
}

.ck-addr-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  margin-top: 8px;
}

/* 原生 select 去掉外观后必须自绘箭头（边框旋转 45°），颜色跟 token 走、亮暗自适应 */
.ck-select {
  position: relative;
  display: flex;
  min-width: 0;
}

.ck-select::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 14px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid var(--boh-text-secondary, #86868b);
  border-bottom: 1.5px solid var(--boh-text-secondary, #86868b);
  transform: translateY(-72%) rotate(45deg);
  pointer-events: none;
}

.ck-select select {
  padding-right: 30px;
  appearance: none;
  -webkit-appearance: none;
  color-scheme: light dark;
}

.ck-form-error {
  margin: 10px 0 0;
  color: var(--boh-danger, #d70015);
  font-size: 12px;
}

.ck-form-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.ck-btn-ghost,
.ck-btn-primary {
  flex: 1;
  height: 42px;
  border-radius: 999px;
  font-size: 14px;
  cursor: pointer;
}

.ck-btn-ghost {
  border: 1px solid var(--boh-border-primary, rgba(0, 0, 0, 0.12));
  background: transparent;
  color: var(--boh-text-primary, #1d1d1f);
}

.ck-btn-primary {
  border: 0;
  background: var(--boh-brand-blue, #0071e3);
  color: #fff;
}

.ck-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── 横屏 / 宽屏：与论坛详情、商品详情同一套居中弹窗语言 ──
   内容改成两栏：左「地址 + 商品」（要核对的东西），右「金额 + 说明」。
   横屏高度只有 300~400px，单栏会把商品清单挤成"露出半行"的样子。 */
@media (orientation: landscape) {
  .ck-sheet {
    inset: auto;
    top: 50%;
    left: 50%;
    width: min(880px, calc(100vw - 64px));
    height: min(620px, calc(100vh - 40px));
    transform: translate(-50%, -50%);
    border-radius: var(--liquid-radius-lg, 24px);
    overflow: hidden;
    box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
  }

  /* 内容拆成左右两栏：左「地址 + 商品」（要核对的东西），右「金额 + 说明」。
     横屏高度只有 300~400px，单栏会把商品清单挤成"露出半行"的样子。
     用 flex 而不是 grid：两栏各自按内容排，谁也不去抢对方的高度。 */
  .ck-body {
    flex-direction: row;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px 14px;
  }

  .ck-col {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    flex-direction: column;
    gap: 10px;
  }

  .ck-col:first-child {
    flex-grow: 1.15;
  }

  /* 横屏可用高度只有 ~210px（扣掉头尾）：行高整体压一档，
     目标是在 844×390 这种手机上「两件商品 + 金额」一屏放得下。 */
  .ck-addr {
    padding: 9px 8px;
  }

  .ck-item {
    padding: 7px 8px;
    gap: 8px;
  }

  .ck-item-thumb {
    width: 42px;
    height: 42px;
  }

  .ck-item-sub {
    font-size: 10px;
  }

  .ck-amount {
    padding: 10px 12px;
  }

  .ck-row {
    padding: 3px 0;
  }

  .ck-picker {
    left: 50%;
    right: auto;
    bottom: auto;
    top: 50%;
    width: min(460px, calc(100vw - 64px));
    max-height: min(88vh, 620px);
    transform: translate(-50%, -50%);
    border-radius: 18px;
  }
}

/* ── 进出场 ──
   竖屏：整页**从右推进来**（iOS 的"下一页"手感），不是底部上浮的抽屉；
   横屏：居中弹窗淡入 + 轻推 10px。减少动态时压到瞬时。 */
.ck-enter-active,
.ck-leave-active {
  transition: opacity 180ms ease;
}

.ck-enter-from,
.ck-leave-to {
  opacity: 0;
}

.ck-enter-active .ck-sheet,
.ck-leave-active .ck-sheet {
  transition: transform 300ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}

.ck-enter-from .ck-sheet,
.ck-leave-to .ck-sheet {
  transform: translateX(100%);
}

@media (orientation: landscape) {
  .ck-enter-from .ck-sheet,
  .ck-leave-to .ck-sheet {
    transform: translate(-50%, calc(-50% + 10px));
  }

  .ck-layer-enter-from .ck-picker,
  .ck-layer-leave-to .ck-picker {
    transform: translate(-50%, calc(-50% + 12px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ck-enter-active,
  .ck-leave-active,
  .ck-enter-active .ck-sheet,
  .ck-leave-active .ck-sheet,
  .ck-layer-enter-active,
  .ck-layer-leave-active,
  .ck-layer-enter-active .ck-picker,
  .ck-layer-leave-active .ck-picker,
  .ck-step-enter-active,
  .ck-step-leave-active,
  .ck-line-enter-active,
  .ck-line-leave-active,
  .ck-line-move {
    transition-duration: 1ms;
  }

  .ck-spinner {
    animation-duration: 1.6s;
  }
}
</style>
