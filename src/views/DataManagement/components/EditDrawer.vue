<template>
  <!-- 编辑/新增抽屉 -->
  <Transition name="drawer">
    <div v-if="show" class="drawer-overlay" @click.self="$emit('close')">
      <div class="drawer">
        <div class="drawer-header">
          <div class="drawer-title-group">
            <h3>{{ isEditing ? '编辑数据' : '新增数据' }}</h3>
            <p>{{ currentTabLabel }}</p>
          </div>
          <button class="drawer-close" @click="$emit('close')">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="drawer-body">
          <form @submit.prevent="$emit('save')" class="edit-form">
            <div v-if="isNewsTab" class="news-assist-panel">
              <div class="assist-title">新闻录入助手</div>
              <div class="assist-actions">
                <button type="button" class="btn btn-secondary" :disabled="isEditing" @click="$emit('regenerateNewsId')">
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
              <textarea
                class="form-textarea code-font address-copy-textarea"
                :value="giftAddressBundleText"
                rows="4"
                readonly
              ></textarea>
            </div>

            <div v-for="field in currentFields" :key="field.key" class="form-group" :class="`field-${field.type}`">
              <label class="form-label">
                {{ field.label }}
                <span v-if="field.required" class="required">*</span>
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
                  <button type="button" class="btn btn-secondary" :disabled="isFieldDisabled(field)" @click="$emit('openUserPicker')">
                    选择用户
                  </button>
                  <button
                    v-if="editingItem.user_id && !isFieldDisabled(field)"
                    type="button"
                    class="btn btn-secondary"
                    @click="$emit('clearGiftUser')"
                  >
                    清空
                  </button>
                </div>
              </div>

              <!-- 文本输入 -->
              <input v-else-if="field.type === 'text'" :value="editingItem[field.key]" type="text"
                :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                :disabled="isFieldDisabled(field)" :required="field.required" :maxlength="field.maxLength"
                @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                @blur="$emit('validateField', field.key)" />

              <!-- 邮箱输入 -->
              <input v-else-if="field.type === 'email'" :value="editingItem[field.key]" type="email"
                :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                :disabled="isFieldDisabled(field)" :required="field.required" :maxlength="field.maxLength"
                @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)"
                @blur="$emit('validateField', field.key)" />

              <!-- 数字输入 -->
              <input v-else-if="field.type === 'number'" :value="editingItem[field.key]" type="number"
                :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                :disabled="isFieldDisabled(field)" :required="field.required" :min="field.min" :max="field.max"
                :step="field.step || 1" @input="setField(field.key, parseFloat($event.target.value) || 0); $emit('clearFieldError', field.key)"
                @blur="$emit('validateField', field.key)" />

              <!-- 日期输入 -->
              <input v-else-if="field.type === 'date'" :value="editingItem[field.key]" type="date"
                :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                :required="field.required" @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)" @blur="$emit('validateField', field.key)" />

              <!-- 日期时间输入 -->
              <input v-else-if="field.type === 'datetime'" :value="editingItem[field.key]" type="datetime-local"
                :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                :required="field.required" @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)" @blur="$emit('validateField', field.key)" />

              <!-- 文本域 -->
              <textarea v-else-if="field.type === 'textarea'" :value="editingItem[field.key]"
                :class="['form-textarea', { 'input-invalid': fieldErrors[field.key] }]" :placeholder="field.placeholder"
                :disabled="isFieldDisabled(field)" :required="field.required" :rows="field.rows || 4"
                :maxlength="field.maxLength"
                @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)" @blur="$emit('validateField', field.key)"></textarea>

              <!-- 选择器 -->
              <select v-else-if="field.type === 'select'" :value="editingItem[field.key]"
                :class="['form-select', { 'input-invalid': fieldErrors[field.key] }]" :disabled="isFieldDisabled(field)"
                :required="field.required" @change="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)" @blur="$emit('validateField', field.key)">
                <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>

              <!-- 图片输入 -->
              <div v-else-if="field.type === 'image'" class="image-input">
                <div class="image-preview" v-if="editingItem[field.key]">
                  <img :src="getImageUrl(editingItem[field.key])" alt="Preview" loading="lazy" />
                  <button type="button" class="remove-image" @click="$emit('clearImageField', field.key)">×</button>
                </div>
                <div v-else class="image-placeholder">
                  <span>🖼️</span>
                  <p>上传或粘贴图片</p>
                </div>
                <div class="image-source-actions">
                  <label
                    class="cloud-upload-btn"
                    :class="{ disabled: isImageUploadPending(field.key) || isFieldDisabled(field) }"
                  >
                    <input
                      type="file"
                      class="image-file-input"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      :disabled="isImageUploadPending(field.key) || isFieldDisabled(field)"
                      @change="$emit('imageUpload', $event, field)"
                    />
                    <span v-if="isImageUploadPending(field.key)" class="btn-spinner"></span>
                    <span>{{ isImageUploadPending(field.key) ? '上传中...' : '上传到 Cloud' }}</span>
                  </label>
                  <button
                    v-if="editingItem[field.key]"
                    type="button"
                    class="image-link-btn"
                    @click="$emit('copyImageValue', field.key)"
                  >
                    复制链接
                  </button>
                </div>
                <input :value="editingItem[field.key]" type="text"
                  :class="['form-input', { 'input-invalid': fieldErrors[field.key] }]"
                  :placeholder="field.placeholder || 'https://... 或 @/assets/images/...'"
                  :disabled="isFieldDisabled(field)"
                  @input="setField(field.key, $event.target.value); $emit('clearFieldError', field.key)" @blur="$emit('validateField', field.key)" />
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
                  <input :value="spec.label" @input="setSpecField(field.key, idx, 'label', $event.target.value)" type="text" class="form-input" placeholder="规格名称" />
                  <input :value="spec.value" @input="setSpecField(field.key, idx, 'value', $event.target.value)" type="text" class="form-input" placeholder="规格值" />
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
                <textarea :value="jsonBuffers[field.key]" @input="setJsonBuffer(field.key, $event.target.value)" class="form-textarea code-font" rows="6"
                  placeholder="请输入有效的 JSON"></textarea>
              </div>

              <span v-if="fieldErrors[field.key]" class="field-error">{{ fieldErrors[field.key] }}</span>
              <span v-else-if="field.hint" class="input-hint">{{ field.hint }}</span>
            </div>
          </form>
        </div>
        <div class="drawer-footer">
          <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          <button class="btn btn-primary" @click="$emit('save')" :disabled="isSaving">
            {{ isSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 用户选择弹窗（礼物新增） -->
  <Transition name="picker">
    <div v-if="showUserPicker" class="user-picker-modal-overlay" @click.self="$emit('closeUserPicker')">
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
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
                :value="userPickerKeyword"
                @input="emit('update:userPickerKeyword', ($event.target).value)"
                type="text"
            placeholder="搜索用户名 / 邮箱 / 用户ID"
          />
        </div>
        <div class="user-picker-list">
          <button
            v-for="user in filteredGiftUsers"
            :key="user.id"
            type="button"
            class="user-picker-item"
            @click="$emit('selectGiftUser', user)"
          >
            <div class="user-picker-item-main">
              <span class="user-picker-name">{{ user.username || '未命名用户' }}</span>
              <span class="user-picker-id">{{ user.id }}</span>
            </div>
            <div class="user-picker-item-meta">
              <span>{{ user.email || '无邮箱' }}</span>
              <span>{{ user.shipping_recipient || '无收件人' }}</span>
            </div>
          </button>
          <div v-if="filteredGiftUsers.length === 0" class="user-picker-empty">
            没有匹配的用户
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 提示消息 -->
  <Transition name="toast">
    <div v-if="toast.show" class="toast" :class="`toast-${toast.type}`">
      <span class="toast-icon">{{ toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : 'ℹ' }}</span>
      <span class="toast-message">{{ toast.message }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { getImageUrl } from '../../../utils/asset-helper';

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
  uploadingImageFields: Object,
  toast: Object,
  isFieldDisabled: { type: Function, default: () => false },
  isImageUploadPending: { type: Function, default: () => false },
});

const emit = defineEmits([
  'close',
  'save',
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
]);

function setField(fieldKey, value) {
  emit('updateField', fieldKey, value);
}

function setJsonBuffer(fieldKey, value) {
  emit('updateJsonBuffer', fieldKey, value);
}

function setSpecField(fieldKey, index, prop, value) {
  emit('updateSpecField', fieldKey, index, prop, value);
}
</script>