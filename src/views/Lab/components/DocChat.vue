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
  border: 1px solid #dad9d4;
  border-radius: 20px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  color: #6e6d68;
}
.chat-empty-icon { font-size: 40px; margin-bottom: 14px; }
.chat-empty p { font-size: 15px; margin: 0 0 18px; font-weight: 500; }
.chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.chip {
  font-size: 13px; color: #3d3929;
  background: #f5f4ef; border: 1px solid #dad9d4;
  border-radius: 16px; padding: 8px 16px; cursor: pointer;
  font-weight: 500;
  transition: all 0.16s ease;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.05);
}
.chip:hover {
  background: #C96442; color: #ffffff;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}
.chat-msgs {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.12) transparent;
}
.chat-msgs::-webkit-scrollbar { width: 6px; }
.chat-msgs::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 3px; }
.msg { display: flex; max-width: 85%; }
.msg.user { align-self: flex-end; }
.msg.assistant { align-self: flex-start; }
.msg-body { min-width: 0; }
.msg-content {
  padding: 0;
  font-size: 15px;
  color: #3d3929;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.user .msg-content {
  padding: 12px 18px;
  border-radius: 18px;
  border-bottom-right-radius: 6px;
  background: #C96442;
  color: #ffffff;
  line-height: 1.6;
}
.msg.assistant .msg-content {
  padding: 12px 18px;
  border-radius: 18px;
  border-bottom-left-radius: 6px;
  background: #ffffff;
  color: #3d3929;
  border: 1px solid #dad9d4;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.05);
}
.msg-ops {
  margin-top: 6px; font-size: 12px; color: #C96442;
  background: #fbf2ed; display: inline-block;
  padding: 3px 10px; border-radius: 6px; font-weight: 500;
}
.thinking {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  min-height: 0;
  margin: 10px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #3d3929;
  box-shadow: none;

}
.thinking-dot {
  flex: 0 0 10px;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #C96442;
  animation: bohaiThinkingBreath 1.45s ease-in-out infinite;
}
@keyframes bohaiThinkingBreath {
  0%, 100% {
    opacity: 0.4;
    transform: scale(0.72);
  }
  50% {
    opacity: 1;
    transform: scale(1.22);
  }
}
.chat-input-area {
  display: flex; gap: 10px; padding: 14px 16px;
  border-top: 1px solid #e3e0d4;
  background: #faf9f5;
}
.chat-input {
  flex: 1; background: #ffffff; border: 1px solid #dad9d4;
  border-radius: 16px; padding: 10px 18px;
  font-size: 14px; color: #3d3929; outline: none; font-family: inherit;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.05);
}
.chat-input:focus { border-color: #C96442; box-shadow: 0 0 0 3px rgba(201, 100, 66, 0.12); }
.chat-input:disabled { opacity: 0.5; }
.chat-btn {
  background: #C96442; color: #fff; border: none;
  border-radius: 16px; padding: 10px 22px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background-color 0.16s ease, box-shadow 0.16s ease;
  min-height: 44px;
  box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}
.chat-btn:hover:not(:disabled) { background: #d6866a; box-shadow: 0 1px 3px 0px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.1); }
.chat-btn:active:not(:disabled) { background: #b0562f; }
.chat-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
