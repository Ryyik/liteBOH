<template>
  <div class="chat">
    <div v-if="messages.length === 0" class="chat-empty">
      <div class="chat-empty-icon">💬</div>
      <p>上传文档后，在这里和我对话修改样式</p>
      <div class="chat-suggestions">
        <button v-for="s in suggestions" :key="s" class="chip" @click="$emit('send', s)">{{ s }}</button>
      </div>
    </div>
    <div v-else ref="scrollRef" class="chat-msgs">
      <div v-for="(msg, i) in messages" :key="i" class="msg" :class="msg.role">
        <div class="msg-body">
          <div class="msg-content">{{ msg.content }}</div>
          <div v-if="msg.operations?.length" class="msg-ops">
            已修改 {{ msg.operations.length }} 项样式
          </div>
        </div>
      </div>
      <div v-if="loading" class="msg assistant">
        <div class="msg-body">
          <div class="thinking" aria-live="polite" aria-label="正在处理">
            <span class="thinking-dot" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <input
        ref="inputRef"
        v-model="text"
        class="chat-input"
        placeholder="告诉 AI 你想怎么改..."
        :disabled="loading"
        @keydown.enter.prevent="send"
      />
      <button class="chat-btn" :disabled="!text.trim() || loading" @click="send">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
const props = defineProps({ messages: { type: Array, default: () => [] }, loading: { type: Boolean, default: false } })
const emit = defineEmits(['send'])
const text = ref('')
const inputRef = ref(null)
const scrollRef = ref(null)
const suggestions = ['标题黑体加粗', '正文宋体12pt', '首行缩进2字符', '1.5倍行距', '正式报告风格']
function send() {
  if (!text.value.trim() || props.loading) return
  emit('send', text.value.trim()); text.value = ''
}
watch(() => props.messages.length, () => nextTick(() => scrollRef.value && (scrollRef.value.scrollTop = scrollRef.value.scrollHeight)))
watch(() => props.loading, () => nextTick(() => scrollRef.value && (scrollRef.value.scrollTop = scrollRef.value.scrollHeight)))
</script>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 280px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.98),
    inset 0 -1px 0 rgba(148, 163, 184, 0.12),
    inset 1px 0 0 rgba(255, 255, 255, 0.58),
    inset -1px 0 0 rgba(255, 255, 255, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.38),
    0 14px 34px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
}
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(17, 17, 17, 0.58);
}
.chat-empty-icon { font-size: 36px; margin-bottom: 12px; }
.chat-empty p { font-size: 14px; margin: 0 0 16px; }
.chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.chip {
  font-size: 12px; color: rgba(17, 17, 17, 0.58);
  background: rgba(255, 255, 255, 0.88); border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px; padding: 6px 14px; cursor: pointer;
  transition: all 0.15s;
}
.chip:hover { color: #0f9f7a; border-color: rgba(15, 159, 122, 0.4); background: rgba(15, 159, 122, 0.1); }
.chat-msgs {
  flex: 1; overflow-y: auto; padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.msg { display: flex; max-width: 90%; }
.msg.user { align-self: flex-end; }
.msg.assistant { align-self: flex-start; }
.msg-body { min-width: 0; }
.msg-content {
  padding: 0;
  font-size: 15px;
  color: #202123;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.user .msg-content {
  padding: 9px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(148, 163, 184, 0.42);
  line-height: 1.55;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.98),
    inset 0 -1px 0 rgba(148, 163, 184, 0.12),
    inset 1px 0 0 rgba(255, 255, 255, 0.58),
    inset -1px 0 0 rgba(255, 255, 255, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.38),
    0 14px 34px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(26px) saturate(1.45);
  -webkit-backdrop-filter: blur(26px) saturate(1.45);
}
.msg-ops {
  margin-top: 6px; font-size: 11px; color: #0f9f7a;
  background: rgba(15, 159, 122, 0.1); display: inline-block;
  padding: 2px 8px; border-radius: 4px;
}
.thinking {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-height: 0;
  margin: 8px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #202123;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.thinking-dot {
  flex: 0 0 10px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #202123;
  animation: bohaiThinkingBreath 1.45s ease-in-out infinite;
}
@keyframes bohaiThinkingBreath {
  0%, 100% {
    opacity: 0.55;
    transform: scale(0.72);
  }
  50% {
    opacity: 1;
    transform: scale(1.22);
  }
}
.chat-input-area {
  display: flex; gap: 8px; padding: 12px 14px;
  border-top: 1px solid rgba(17, 24, 39, 0.08);
}
.chat-input {
  flex: 1; background: #ffffff; border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px; padding: 10px 18px;
  font-size: 13px; color: #202123; outline: none; font-family: inherit;
}
.chat-input:focus { border-color: #0f9f7a; }
.chat-input:disabled { opacity: 0.5; }
.chat-btn {
  background: #0f9f7a; color: #fff; border: none;
  border-radius: 999px; padding: 10px 20px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.chat-btn:hover:not(:disabled) { background: #0e8a6a; }
.chat-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
