<template>
  <BohModal v-model="modalOpen" :title="productTitle" max-width="560px" flush>
    <template #head>
      <header class="specs-head">
        <div class="specs-head-copy">
          <p class="specs-kicker">规格选项</p>
          <h2 id="specs-sheet-title" class="specs-title">{{ productTitle }}</h2>
        </div>
        <button type="button" class="specs-close" aria-label="关闭" @click="requestClose">
          <X :size="18" :stroke-width="2" aria-hidden="true" />
        </button>
      </header>
    </template>

    <div class="specs-body">
      <!-- 只有「可选值」一栏（2026-11-11）。原先的「名称 + 值」双栏是本面板
           最容易出错的地方：线上数据里既有把「配色」重复填三遍的（前台三个
           按钮全叫「配色」），也有名称对、值多加「外观」的。用户只需要点一个
           能看懂的名字，内部标识由前端自己写，不该是运营的负担。 -->
      <p class="specs-hint">
        填写用户可以选择的样式，例如 红 / 黄 / 蓝。没有多款式时留空即可；
        填了之后前台会先让用户选一项再下单。
      </p>

      <div v-for="(row, index) in rows" :key="row.key" class="specs-row">
        <input
          :value="row.name"
          type="text"
          class="specs-input"
          :maxlength="SPEC_NAME_MAX_LENGTH"
          :placeholder="index === 0 ? '可选值，如 红' : '下一个可选值'"
          :aria-label="`第 ${index + 1} 个可选值`"
          @input="row.name = $event.target.value"
          @paste="onPaste($event, index)"
          @keydown.enter.prevent="addRow"
        />
        <button
          type="button"
          class="specs-remove"
          :aria-label="`删除第 ${index + 1} 个可选值`"
          @click="removeRow(index)"
        >
          <Trash2 :size="15" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </div>

      <p v-if="!rows.length" class="specs-empty">
        还没有可选值。单一款式不需要添加；加了之后前台会先让用户选一项再下单。
        多个值可以一次粘贴「红,黄,蓝」。
      </p>

      <button
        type="button"
        class="specs-add"
        :disabled="rows.length >= SPEC_MAX_ROWS"
        @click="addRow"
      >
        <Plus :size="14" :stroke-width="2" aria-hidden="true" />
        <span>添加可选值</span>
      </button>

      <p v-if="error" class="specs-error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <div class="specs-foot">
        <button type="button" class="specs-btn ghost" @click="requestClose">取消</button>
        <button type="button" class="specs-btn primary" :disabled="saving" @click="submit">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
  </BohModal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Plus, Trash2, X } from 'lucide-vue-next';
import BohModal from '@/components/ui/BohModal.vue';
import {
  SPEC_MAX_ROWS,
  SPEC_NAME_MAX_LENGTH,
  normalizeProductSpecs,
  parseSpecInput,
  toSpecRecords,
  validateSpecNames,
} from '@/utils/product-specs.js';

/**
 * 商品「规格」编辑面板（**只在就地编辑态渲染**）。
 *
 * 为什么不直接塞进卡片里：竖屏商品卡只有 ~170px 宽，一行两个输入框根本放不下，
 * 而且规格是「列表级」字段 —— 增删一行会改变卡片高度，把整片网格挤得跳。
 * 用一个独立面板承接，卡片上只留一个「规格 N」入口，与 iOS 里「点小组件进
 * 详情再编辑」同一套心智。
 *
 * 外壳走 BohModal（2026-11-23，plans/045 阶段 2）：Teleport / 遮罩 / 滚锁 /
 * Esc / 焦点陷阱 / 窄屏 Sheet 化都在组件里，这里只留内容与两个动作按钮。
 *
 * 写库不在这里做：面板只产出**清洗后的数组**，由宿主经 `inlineEditor.commit`
 * 走既有通道（串行队列 / 撤销栈 / 失败回滚）。这样规格和标题、图片共用一套
 * 写入语义，不会再长出第二条「看起来能存但绕过校验」的路。
 */
const props = defineProps({
  visible: { type: Boolean, default: false },
  product: { type: Object, default: null },
  saving: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save']);

/* BohModal 的 v-model 是「关得比开得快」的：Esc / 遮罩 / 关闭钮都只发 false。
   真源仍是宿主的 visible，所以 setter 只处理关闭，并沿用 requestClose 的
   保存期闸门（saving 时忽略关闭请求，防止半截写入丢面板）。 */
const modalOpen = computed({
  get: () => props.visible,
  set: (next) => {
    if (!next) requestClose();
  },
});

/** 一行 = 一个可选值。`key` 只服务于 v-for，不进库（库里仍是 { label, value }） */
let rowSeq = 0;
const rows = ref([]);
const error = ref('');

const productTitle = ref('');

const makeRow = (name = '') => ({
  key: `spec-${(rowSeq += 1)}`,
  name,
});

const resetFromProduct = () => {
  // `normalizeProductSpecs` 会把旧数据（名称栏填「配色」、真实选项在 value 里）归一成
  // 「蓝色的那一个词」，所以运营打开面板看到的就是干净的可选值，不必再手改历史数据。
  rows.value = normalizeProductSpecs(props.product?.specifications).map((item) =>
    makeRow(item.label),
  );
  productTitle.value = String(props.product?.title || '未命名商品');
  error.value = '';
};

/* 每次打开都从当前行重建：面板关闭期间别人（数据管理、另一台设备）可能改过，
   沿用上一次的本地副本会把这些改动覆盖掉。 */
watch(
  () => [props.visible, props.product?.id],
  ([visible]) => {
    if (!visible) return;
    resetFromProduct();
    /* 焦点陷阱在 overlay mounted 时也会用 rAF 把焦点放到第一个可聚焦元素（关闭钮）。
       本 watcher 的 rAF 比陷阱那条先注册 ⇒ 单层 rAF 会被盖回去，必须再等一帧。 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!props.visible) return;
        document.querySelector('.specs-body .specs-input')?.focus?.();
      });
    });
  },
  { immediate: true },
);

const addRow = () => {
  if (rows.value.length >= SPEC_MAX_ROWS) return;
  error.value = '';
  rows.value = [...rows.value, makeRow()];
};

const removeRow = (index) => {
  error.value = '';
  rows.value = rows.value.filter((_, idx) => idx !== index);
};

/** 粘贴「红,黄,蓝」拆成三行；单个词不拦截，走原生粘贴 */
const onPaste = (event, index) => {
  const names = parseSpecInput(event.clipboardData?.getData('text') || '');
  if (names.length < 2) return;
  event.preventDefault();
  const head = rows.value.slice(0, index).filter((row) => row.name.trim());
  const tail = rows.value.slice(index + 1);
  error.value = '';
  rows.value = [...head, ...names.map((name) => makeRow(name)), ...tail].slice(0, SPEC_MAX_ROWS);
};

const requestClose = () => {
  if (props.saving) return;
  emit('close');
};

const submit = () => {
  if (props.saving) return;

  /* 空行（新增了没填）当作用户放弃的草稿丢掉，其余按「可选值」校验：
     重复 / 超长 / 超个数都由 validateSpecNames 给中文原因。
     写入形态仍是 { label, value } 且两者同值 —— 下游加购去重与订单快照读 value。 */
  const names = rows.value.map((row) => String(row.name || '').trim()).filter(Boolean);
  const validationError = validateSpecNames(names);
  if (validationError) {
    error.value = validationError;
    return;
  }

  error.value = '';
  emit('save', toSpecRecords(names));
};
</script>

<style scoped>
.specs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  /* #head 槽外面那层是 flex 容器：不给满宽的话 space-between 没东西可推，
     关闭钮会贴着标题而不是待在右上角 */
  width: 100%;
  padding: 18px 18px 10px;
}

.specs-head-copy {
  min-width: 0;
}

.specs-kicker {
  margin: 0 0 4px;
  color: var(--liquid-text-tertiary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.specs-title {
  margin: 0;
  overflow: hidden;
  color: var(--liquid-text-primary);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.specs-close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-secondary);
  cursor: pointer;
}

.specs-body {
  padding: 0 18px 8px;
}

.specs-hint {
  margin: 0 0 12px;
  color: var(--liquid-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.specs-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 8px;
  margin-bottom: 8px;
}

.specs-input {
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--liquid-border);
  border-radius: 10px;
  background: var(--liquid-bg-nested);
  color: inherit;
  font: inherit;
  font-size: 14px;
}

.specs-input:focus {
  border-color: var(--boh-accent);
  outline: none;
  background: var(--liquid-bg);
}

.specs-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 38px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--liquid-text-tertiary);
  cursor: pointer;
}

.specs-remove:hover {
  background: var(--liquid-bg);
  color: var(--boh-danger);
}

.specs-empty {
  margin: 4px 0 10px;
  color: var(--liquid-text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.specs-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 12px;
  border: 1px dashed var(--liquid-border);
  border-radius: 10px;
  background: transparent;
  color: var(--liquid-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.specs-add:disabled {
  opacity: 0.4;
  cursor: default;
}

.specs-error {
  margin: 10px 0 0;
  color: var(--boh-danger);
  font-size: 12px;
  line-height: 1.5;
}

/* 父层 .boh-modal__foot 已给内衬；这里只负责两枚按钮等分 + 安全区
   （竖屏 Sheet 贴着屏幕底，没有 env() 会被 Home 条盖住） */
.specs-foot {
  display: flex;
  gap: 10px;
  width: 100%;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.specs-btn {
  flex: 1;
  height: 42px;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.specs-btn.ghost {
  background: var(--liquid-bg);
  color: var(--liquid-text-primary);
}

.specs-btn.primary {
  background: var(--boh-accent);
  color: #fff;
}

.specs-btn.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
