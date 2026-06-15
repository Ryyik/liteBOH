<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
        <div class="post-create-modal glass-card">
          <header class="modal-header">
            <div class="modal-header-left">
              <button class="close-btn" @click="$emit('close')">×</button>
              <h3>发布新动态</h3>
            </div>
            <button class="save-btn" @click="handleSubmit" :disabled="!postContent.trim() || submitting">
              {{ submitting ? '发布中...' : '发布' }}
            </button>
          </header>
          <div class="modal-body">
            <input v-model="postTitle" placeholder="输入标题 (可选)" class="post-title-input" maxlength="100">
            <textarea v-model="postContent" placeholder="有什么新鲜事想分享？" rows="6" maxlength="1000"
              class="post-textarea-large"></textarea>
            <div class="post-modal-footer">
              <span class="char-count">{{ postContent.length }}/1000</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  submitting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'submit']);

const postTitle = ref('');
const postContent = ref('');

const handleSubmit = () => {
  if (!postContent.value.trim()) return;
  emit('submit', postTitle.value.trim(), postContent.value.trim());
};

// 弹窗关闭时清空表单
watch(() => props.show, (newVal) => {
  if (!newVal) {
    postTitle.value = '';
    postContent.value = '';
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 10001;
  display: flex;
  justify-content: center;
  align-items: center;
}

.post-create-modal {
  width: 100%;
  max-width: 600px;
  background: #fff;
  border-radius: 24px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.post-create-modal .modal-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eff3f4;
}

.post-create-modal .modal-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.post-create-modal .modal-header h3 {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
}

.close-btn {
  font-size: 24px;
  background: none;
  border: none;
  cursor: pointer;
}

.save-btn {
  background: #0f1419;
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 9999px;
  font-weight: 700;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.5;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 40px;
}

.post-title-input {
  width: 100%;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid #eff3f4;
  font-size: 18px;
  font-weight: 700;
  outline: none;
  margin-bottom: 12px;
  background: transparent;
}

.post-title-input::placeholder {
  color: #536471;
  font-weight: 500;
}

.post-textarea-large {
  width: 100%;
  border: none;
  padding: 20px;
  font-size: 18px;
  line-height: 1.5;
  resize: none;
  outline: none;
  min-height: 200px;
  background: transparent;
}

.post-modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #eff3f4;
  display: flex;
  justify-content: flex-end;
}

.char-count {
  text-align: right;
  font-size: 13px;
  color: #536471;
  margin-top: 2px;
}
</style>