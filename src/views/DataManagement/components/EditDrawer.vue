<template>
  <!-- 编辑/新增抽屉 -->
  <Transition name="drawer">
    <div v-if="show" class="drawer-overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId"
      @click.self="$emit('close')" @keydown.esc.stop="$emit('close')" tabindex="-1" ref="overlayRef">
      <div class="drawer" @keydown.esc.stop="$emit('close')">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <h3 :id="titleId">{{ isEditing ? '编辑数据' : '新增数据' }}</h3>
            <p>{{ currentTabLabel }}</p>
          </div>
          <button class="drawer-close" type="button" aria-label="关闭编辑抽屉" @click="$emit('close')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div v-if="isEditing" class="drawer-record-nav">
            <button type="button" class="record-nav-btn" @click="$emit('prev-record')" title="上一条"
              :disabled="!hasPrevRecord">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <span class="record-nav-label">{{ recordNavLabel }}</span>
            <button type="button" class="record-nav-btn" @click="$emit('next-record')" title="下一条"
              :disabled="!hasNextRecord">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="drawer-body">
          <form @submit.prevent="$emit('save')" class="edit-form">
            <div v-if="isNewsTab" class="news-assist-panel">
              <div class="assist-title">新闻录入助手</div>
              <div class="assist-actions">
                <button type="button" class="btn btn-secondary" :disabled="isEditing"
                  @click="$emit('regenerateNewsId')">
                  自动生成 ID
                </button>
                <button type="button" class="btn btn-secondary" @click="$emit('injectNewsTemplate', true)">
                  生成写作提纲
                </button>
                <button type="button" class="btn btn-secondary" @click="$emit('generateExcerpt', true)">
                  根据正文生成摘要
                </button>
              </div>
              <p class="assist-hint">
                新增新闻时会自动填充 ID、日期和基础提纲，正文按普通文章写即可，保存时会自动排版成新闻详情。
              </p>
            </div>

            <div v-else-if="canRegenerateAutoId" class="news-assist-panel">
              <div class="assist-title">自动编号助手</div>
              <div class="assist-actions">
                <button type="button" class="btn btn-secondary" @click="$emit('regenerateId')">
                  自动生成 ID
                </button>
              </div>
              <p class="assist-hint">
                当前模块新增时会自动分配数值 ID，你也可以点击按钮重新生成。
              </p>
            </div>

            <div v-if="currentTab === 'gifts'" class="gift-address-copy-box">
              <div class="gift-address-copy-header">
                <span>用户地址整段（便于复制）</span>
                <button type="button" class="btn btn-secondary address-copy-btn" @click="$emit('copyGiftAddress')">
                  复制整段
                </button>
              </div>
              <textarea class="form-textarea code-font address-copy-textarea" :value="giftAddressBundleText" rows="4"
                readonly></textarea>
            </div>

            <!-- 可折叠分组（accordion）-->
            <div v-for="group in fieldGroups" :key="group.key" class="field-group"
              :class="{ collapsed: isGroupCollapsed(group.key) }">
              <button v-if="fieldGroups.length > 1" type="button" class="field-group-header"
                @click="toggleGroup(group.key)">
                <span class="field-group-title">
                  {{ group.label }}
                  <span v-if="group.fields.length" class="field-group-count">{{ group.fields.length }}</span>
                </span>
                <svg class="field-group-toggle" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="field-group-body">
                <template v-for="field in group.fields" :key="field.key">
                  <div class="form-group" :class="[`field-${field.type}`, { 'full-width': isFullWidthField(field) }]">
                    <label class="form-label" :for="`f-${currentTab}-${field.key}`">
                      <span>{{ field.label }}</span>
                      <span v-if="field.required" class="required">*</span>
                      <button v-if="isEditing && editingItem[field.key]" type="button" class="field-copy-btn"
                        @click="copyFieldValue(field.key)" title="复制值">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                    </label>

                    <!-- 用户选择器（礼物专用） -->
                    <div v-if="field.type === 'user-picker'" class="user-picker-field">
                      <div v-if="selectedGiftUser" class="selected-user-card">
                        <div class="selected-user-main">
                          <div class="selected-user-name">{{ selectedGiftUser.username || '未命名用户' }}</div>
                          <div class="selected-user-id">{{ selectedGiftUser.id }}</div>
                        </div>
                        <div class="selected-user-meta">
                          <span>{{ selectedGiftUser.email || '无邮箱' }}</span>
                          <span>{{ selectedGiftUser.shipping_phone || '无联系电话' }}</span>
                        </div>
                      </div>
                      <div v-else class="selected-user-empty">
                        尚未选择用户，请点击下方按钮选择
                      </div>
                      <div class="user-picker-actions">
                        <button type="button" class="btn btn-secondary" :disabled="isFieldDisabled(field)"
                          @click="$emit('openUserPicker')">
                          选择用户
                        </button>
                        <button v-if="editingItem.user_id && !isFieldDisabled(field)" type="button"
                          class="btn btn-secondary" @click="$emit('clearGiftUser')">
                          清空
                        </button>
                      </div>
                    </div>

                    <!-- 文本输入 -->
                    <input v-else-if="field.type === 'text'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]" type="text"
                      :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                      :placeholder="field.placeholder" :disabled="isFieldDisabled(field)" :required="field.required"
                      :maxlength="field.maxLength"
                      @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)" />

                    <!-- 邮箱输入 -->
                    <input v-else-if="field.type === 'email'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]" type="email"
                      :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                      :placeholder="field.placeholder" :disabled="isFieldDisabled(field)" :required="field.required"
                      :maxlength="field.maxLength"
                      @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)" />

                    <!-- 数字输入 -->
                    <input v-else-if="field.type === 'number'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]" type="number"
                      :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                      :placeholder="field.placeholder" :disabled="isFieldDisabled(field)" :required="field.required"
                      :min="field.min" :max="field.max" :step="field.step || 1"
                      @input="setField(field.key, parseFloat($event.target.value) || 0); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)" />

                    <!-- 日期输入 -->
                    <input v-else-if="field.type === 'date'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]" type="date"
                      :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                      :disabled="isFieldDisabled(field)" :required="field.required"
                      @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)" />

                    <!-- 日期时间输入 -->
                    <input v-else-if="field.type === 'datetime'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]" type="datetime-local"
                      :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                      :disabled="isFieldDisabled(field)" :required="field.required"
                      @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)" />

                    <!-- 文本域 -->
                    <textarea v-else-if="field.type === 'textarea'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]"
                      :class="['form-textarea', { 'input-invalid': fieldErrors[field.key] }]"
                      :placeholder="field.placeholder" :disabled="isFieldDisabled(field)" :required="field.required"
                      :rows="field.rows || 4" :maxlength="field.maxLength"
                      @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)"></textarea>

                    <!-- 选择器 -->
                    <select v-else-if="field.type === 'select'" :id="`f-${currentTab}-${field.key}`"
                      :value="editingItem[field.key]"
                      :class="['form-select', { 'input-invalid': fieldErrors[field.key] }]"
                      :disabled="isFieldDisabled(field)" :required="field.required"
                      @change="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                      @blur="$emit('validateField', field.key)">
                      <option value="" disabled v-if="field.optionsSource">{{ isFieldOptionsLoading(field) ? '加载中...' : '请选择' }}</option>
                      <option v-for="opt in getFieldOptions(field)" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </option>
                    </select>

                    <!-- 图片输入 -->
                    <div v-else-if="field.type === 'image'" class="image-input">
                      <div class="image-preview" v-if="editingItem[field.key]">
                        <img :src="getImageUrl(editingItem[field.key])" alt="Preview" loading="lazy" />
                        <button type="button" class="remove-image"
                          @click="$emit('clearImageField', field.key)">×</button>
                      </div>
                      <div v-else class="image-placeholder">
                        <span>🖼️</span>
                        <p>上传或粘贴图片</p>
                      </div>
                      <div class="image-source-actions">
                        <label class="cloud-upload-btn"
                          :class="{ disabled: isImageUploadPending(field.key) || isFieldDisabled(field) }">
                          <input type="file" class="image-file-input" accept="image/png,image/jpeg,image/webp,image/gif"
                            :disabled="isImageUploadPending(field.key) || isFieldDisabled(field)"
                            @change="$emit('imageUpload', $event, field)" />
                          <span v-if="isImageUploadPending(field.key)" class="btn-spinner"></span>
                          <span>{{ isImageUploadPending(field.key) ? '上传中...' : '上传到 Cloud' }}</span>
                        </label>
                        <button v-if="editingItem[field.key]" type="button" class="image-link-btn"
                          @click="$emit('copyImageValue', field.key)">
                          复制链接
                        </button>
                      </div>
                      <input :value="editingItem[field.key]" type="text"
                        :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                        :placeholder="field.placeholder || 'https://... 或 @/assets/images/...'"
                        :disabled="isFieldDisabled(field)"
                        @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                        @blur="$emit('validateField', field.key)" />
                    </div>

                    <!-- 标签输入 -->
                    <div v-else-if="field.type === 'tags'" class="tags-input">
                      <div class="tags-list">
                        <span v-for="(tag, idx) in (editingItem[field.key] || [])" :key="idx" class="tag-item">
                          {{ tag }}
                          <button type="button" @click="$emit('removeTag', field.key, idx)">×</button>
                        </span>
                      </div>
                      <input type="text" class="form-input" placeholder="输入标签后按回车"
                        @keydown.enter.prevent="$emit('addTag', $event, field.key)" />
                    </div>

                    <!-- 规格输入 (商品专用) -->
                    <div v-else-if="field.type === 'specifications'" class="specs-input">
                      <div v-for="(spec, idx) in (editingItem[field.key] || [])" :key="idx" class="spec-item">
                        <input :value="spec.label" @input="setSpecField(field.key, idx, 'label', $event.target.value)"
                          type="text" class="form-input" placeholder="规格名称" />
                        <input :value="spec.value" @input="setSpecField(field.key, idx, 'value', $event.target.value)"
                          type="text" class="form-input" placeholder="规格值" />
                        <button type="button" class="btn-icon" @click="$emit('removeSpec', field.key, idx)">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                      <button type="button" class="btn-add-spec" @click="$emit('addSpec', field.key)">
                        + 添加规格
                      </button>
                    </div>

                    <!-- JSON 输入 -->
                    <div v-else-if="field.type === 'json'" class="json-input">
                      <textarea :value="jsonBuffers[field.key]" @input="setJsonBuffer(field.key, $event.target.value)"
                        class="form-textarea code-font" rows="6" placeholder="请输入有效的 JSON"></textarea>
                    </div>

                    <span v-if="fieldErrors[field.key]" class="field-error">{{ fieldErrors[field.key] }}</span>
                    <span v-else-if="field.hint" class="input-hint">{{ field.hint }}</span>
                  </div>
                </template>
              </div>
              <div v-if="isEditing" class="field-group-save-row">
                <button type="button" class="btn btn-secondary btn-sm" @click="$emit('saveGroup', group.key)">
                  保存「{{ group.label }}」
                </button>
              </div>
            </div>
          </form>
        </div>
        <div class="drawer-footer">
          <span class="drawer-footer-hint">
            <kbd>Esc</kbd> 关闭
          </span>
          <div class="drawer-footer-actions">
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
            <button class="btn btn-primary" @click="$emit('save')" :disabled="isSaving">
              {{ isSaving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 用户选择弹窗（礼物新增） -->
  <Transition name="picker">
    <div v-if="showUserPicker" class="user-picker-modal-overlay" @click.self="$emit('closeUserPicker')"
      @keydown.esc="$emit('closeUserPicker')">
      <div class="user-picker-modal">
        <div class="user-picker-header">
          <h3>选择用户</h3>
          <button class="drawer-close" @click="$emit('closeUserPicker')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="user-picker-search">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input :value="userPickerKeyword" @input="$emit('update:userPickerKeyword', ($event.target).value)"
            type="text" placeholder="搜索用户名 / 邮箱 / 用户ID" />
        </div>
        <div class="user-picker-list">
          <div v-if="userPickerLoading" class="user-picker-loading">
            <span class="btn-spinner"></span>
            <span>加载中...</span>
          </div>
          <button v-for="user in filteredGiftUsers" :key="user.id" v-else type="button" class="user-picker-item"
            @click="$emit('selectGiftUser', user)">
            <div class="user-picker-item-main">
              <span class="user-picker-name">{{ user.username || '未命名用户' }}</span>
              <span class="user-picker-id">{{ user.id }}</span>
            </div>
            <div class="user-picker-item-meta">
              <span>{{ user.email || '无邮箱' }}</span>
              <span>{{ user.shipping_recipient || '无收件人' }}</span>
            </div>
          </button>
          <div v-if="!userPickerLoading && filteredGiftUsers.length === 0" class="user-picker-empty">
            没有匹配的用户
          </div>
        </div>
      </div>
    </div>
  </Transition>

</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { getImageUrl } from '../../../utils/asset-helper';
import { supabase } from '../../../utils/supabase-client.js';

// 异步选项缓存：key = optionsSource标识，value = 选项数组
const asyncOptionsCache = ref({});
const asyncOptionsLoading = ref({});

const ASYNC_OPTIONS_LOADERS = {
  freemodels: async () => {
    const { data, error } = await supabase
      .from('freemodels')
      .select('model_id, name, family_label, is_active')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []).map((m) => ({
      value: m.model_id,
      label: `${m.name} (${m.model_id})${m.is_active ? '' : ' [已停用]'}`
    }));
  }
};

const loadAsyncOptions = async (source, force = false) => {
  if (!force && (asyncOptionsCache.value[source] || asyncOptionsLoading.value[source])) return;
  const loader = ASYNC_OPTIONS_LOADERS[source];
  if (!loader) return;
  asyncOptionsLoading.value = { ...asyncOptionsLoading.value, [source]: true };
  try {
    const options = await loader();
    asyncOptionsCache.value = { ...asyncOptionsCache.value, [source]: options };
  } catch (e) {
    console.warn(`[EditDrawer] 加载异步选项 ${source} 失败:`, e?.message || e);
  } finally {
    asyncOptionsLoading.value = { ...asyncOptionsLoading.value, [source]: false };
  }
};

const getFieldOptions = (field) => {
  if (field.options) return field.options;
  if (field.optionsSource && asyncOptionsCache.value[field.optionsSource]) {
    return asyncOptionsCache.value[field.optionsSource];
  }
  return [];
};

const isFieldOptionsLoading = (field) => {
  return !!(field.optionsSource && asyncOptionsLoading.value[field.optionsSource]);
};

const titleId = 'edit-drawer-title';
const overlayRef = ref(null);
let lastFocusedElement = null;
let bodyOverflow = '';

const FULL_WIDTH_TYPES = new Set([
  'textarea',
  'json',
  'tags',
  'specifications',
  'image',
  'user-picker'
]);

const isFullWidthField = (field) => FULL_WIDTH_TYPES.has(field?.type) || field?.fullWidth;

// 字段分组规则: 每个 tab 单独定义分组
const GROUP_RULES = {
  users: [
    { key: 'basic', label: '基础信息' },
    { key: 'stats', label: '数据' },
    { key: 'profile', label: '个人资料' }
  ],
  points: [
    { key: 'basic', label: '基础信息' },
    { key: 'stats', label: '积分数据' }
  ],
  subscriptions: [
    { key: 'user', label: '订阅用户' },
    { key: 'plan', label: '订阅方案' },
    { key: 'time', label: '时间与状态' },
    { key: 'extra', label: '附加信息' }
  ],
  gifts: [
    { key: 'user', label: '收件信息' },
    { key: 'detail', label: '礼物详情' },
    { key: 'time', label: '时间与状态' }
  ],
  forum: [
    { key: 'content', label: '帖子内容' },
    { key: 'meta', label: '作者与状态' }
  ],
  coreMemories: [
    { key: 'basic', label: '事实信息' },
    { key: 'source', label: '来源与分类' },
    { key: 'content', label: '事实内容' }
  ],
  bohaiModels: [
    { key: 'basic', label: '基础信息' },
    { key: 'provider', label: '模型供应' },
    { key: 'params', label: '模型参数' },
    { key: 'extra', label: '其他' }
  ],
  lotteries: [
    { key: 'basic', label: '抽奖信息' },
    { key: 'prize', label: '奖品描述' },
    { key: 'rule', label: '开奖规则' },
    { key: 'draw', label: '开奖结果' }
  ],
  news: [
    { key: 'basic', label: '基础信息' },
    { key: 'content', label: '新闻内容' },
    { key: 'media', label: '封面' }
  ],
  activities: [
    { key: 'basic', label: '活动信息' },
    { key: 'media', label: '活动图' }
  ],
  products: [
    { key: 'basic', label: '商品信息' },
    { key: 'detail', label: '商品描述' },
    { key: 'pricing', label: '定价与库存' },
    { key: 'specs', label: '规格选项' },
    { key: 'media', label: '商品图片' }
  ]
};

// 自动推断字段所属分组(未显式标注时)
const inferFieldGroup = (currentTab, field) => {
  if (field.group) return field.group;
  // 默认回退规则
  if (['date', 'datetime'].includes(field.type)) return 'time';
  if (['number'].includes(field.type)) return 'stats';
  if (['textarea', 'json', 'image', 'tags', 'specifications', 'user-picker'].includes(field.type)) return 'content';
  if (['select', 'email'].includes(field.type)) return 'basic';
  return 'basic';
};

const ensureGroups = (currentTab, fields) => {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  const rules = GROUP_RULES[currentTab] || null;
  // 没有规则时: 全部放进一个 default 组
  if (!rules) {
    return [{
      key: 'default',
      label: '',
      fields: [...fields]
    }];
  }
  const groupMap = new Map();
  rules.forEach((rule) => {
    groupMap.set(rule.key, { key: rule.key, label: rule.label, fields: [] });
  });
  // 兜底分组, 防止字段散落
  if (!groupMap.has('default')) {
    groupMap.set('default', { key: 'default', label: '', fields: [] });
  }
  fields.forEach((field) => {
    const groupKey = inferFieldGroup(currentTab, field);
    const target = groupMap.get(groupKey) || groupMap.get('default');
    target.fields.push(field);
  });
  return rules.map((rule) => groupMap.get(rule.key)).filter((g) => g.fields.length > 0);
};

// Placeholder declarations (will be reassigned after defineProps)
let fieldGroups = null;

const focusFirstInteractive = () => {
  if (!overlayRef.value) return;
  const target = overlayRef.value.querySelector(
    'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
  );
  if (target && typeof target.focus === 'function') {
    target.focus();
  } else {
    overlayRef.value.focus();
  }
};

const lockBodyScroll = (lock) => {
  if (typeof document === 'undefined') return;
  if (lock) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = bodyOverflow;
  }
};

onBeforeUnmount(() => lockBodyScroll(false));

const props = defineProps({
  show: Boolean,
  isEditing: Boolean,
  editingItem: Object,
  currentTab: String,
  currentFields: Array,
  isSaving: Boolean,
  isNewsTab: Boolean,
  canRegenerateAutoId: Boolean,
  currentTabLabel: String,
  fieldErrors: Object,
  jsonBuffers: Object,
  selectedGiftUser: Object,
  showUserPicker: Boolean,
  userPickerKeyword: String,
  filteredGiftUsers: Array,
  giftAddressBundleText: String,
  uploadingImageFields: Array,
  userPickerLoading: { type: Boolean, default: false },
  isFieldDisabled: { type: Function, default: () => false },
  isImageUploadPending: { type: Function, default: () => false },
  hasPrevRecord: { type: Boolean, default: false },
  hasNextRecord: { type: Boolean, default: false },
  recordNavLabel: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'save',
  'saveGroup',
  'regenerateId',
  'regenerateNewsId',
  'injectNewsTemplate',
  'generateExcerpt',
  'copyGiftAddress',
  'openUserPicker',
  'closeUserPicker',
  'selectGiftUser',
  'clearGiftUser',
  'clearImageField',
  'copyImageValue',
  'imageUpload',
  'addTag',
  'removeTag',
  'addSpec',
  'removeSpec',
  'clearFieldError',
  'validateField',
  'updateField',
  'updateJsonBuffer',
  'updateSpecField',
  'update:userPickerKeyword',
  'prev-record',
  'next-record',
]);

// Reassign fieldGroups and related computeds/watches after defineProps
fieldGroups = computed(() => ensureGroups(props.currentTab, props.currentFields || []));

// 可折叠分组状态：默认第一个展开，其余折叠（仅多分组时）
const collapsedGroups = ref(new Set());

const isGroupCollapsed = (key) => collapsedGroups.value.has(key);

const toggleGroup = (key) => {
  const next = new Set(collapsedGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  collapsedGroups.value = next;
};

watch(() => props.currentTab, () => {
  // 切换 tab 时重置：仅展开第一组
  const groups = fieldGroups.value;
  if (groups.length > 1) {
    collapsedGroups.value = new Set(groups.slice(1).map(g => g.key));
  } else {
    collapsedGroups.value = new Set();
  }
}, { immediate: true });

// 当字段列表变化时，预加载异步选项（如免费模型列表）
watch(() => props.currentFields, (fields) => {
  if (!fields) return;
  const sources = new Set();
  fields.forEach((f) => {
    if (f.optionsSource) sources.add(f.optionsSource);
  });
  sources.forEach((source) => loadAsyncOptions(source));
}, { immediate: true });

watch(() => props.show, async (visible) => {
  if (visible) {
    // 抽屉打开时，强制重新加载异步选项，确保拿到最新数据
    const fields = props.currentFields || [];
    const sources = new Set();
    fields.forEach((f) => {
      if (f.optionsSource) sources.add(f.optionsSource);
    });
    sources.forEach((source) => loadAsyncOptions(source, true));

    if (typeof document !== 'undefined') {
      lastFocusedElement = document.activeElement;
    }
    lockBodyScroll(true);
    await nextTick();
    focusFirstInteractive();
  } else {
    lockBodyScroll(false);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }
});

function setField(fieldKey, value) {
  emit('updateField', fieldKey, value);
}

function setJsonBuffer(fieldKey, value) {
  emit('updateJsonBuffer', fieldKey, value);
}

function setSpecField(fieldKey, index, prop, value) {
  emit('updateSpecField', fieldKey, index, prop, value);
}

const copyFieldValue = (fieldKey) => {
  const val = props.editingItem?.[fieldKey];
  if (val == null) return;
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(String(val)).catch(() => {});
};
</script>

<style scoped>
@import '../styles/console.css';
@import '../styles/responsive.css';
</style>