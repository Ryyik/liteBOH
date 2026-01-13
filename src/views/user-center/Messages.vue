<template>
  <div class="messages-container">
    <div class="messages-header">
      <div class="header-left">
        <h2 class="page-title">消息中心</h2>
        <span class="unread-count" v-if="unreadCount > 0">{{ unreadCount }} 条未读</span>
      </div>
      <button 
        class="mark-read-btn" 
        @click="markAllAsRead"
        v-if="unreadCount > 0"
      >
        全部已读
      </button>
    </div>

    <div class="messages-list">
      <div v-if="messages.length > 0">
        <div 
          v-for="msg in messages" 
          :key="msg.id" 
          class="message-item"
          :class="{ 'unread': !msg.read }"
          @click="showDetail(msg)"
        >
          <div class="message-status">
            <span class="red-dot" v-if="!msg.read"></span>
          </div>
          <div class="message-info">
            <div class="message-top">
              <span class="message-title">{{ msg.title }}</span>
              <span class="message-date">{{ msg.date }}</span>
            </div>
            <div class="message-preview">{{ msg.content }}</div>
          </div>
        </div>
      </div>
      <div v-else class="no-messages">
        <p>暂无消息记录</p>
      </div>
    </div>

    <!-- 消息详情弹窗 -->
    <Transition name="fade">
      <div v-if="selectedMessage" class="detail-overlay" @click="closeDetail">
        <div class="detail-modal" @click.stop>
          <div class="detail-header">
            <div class="detail-title-row">
              <span class="detail-type">{{ selectedMessage.type === 'system' ? '系统通知' : '消息' }}</span>
              <h3 class="detail-title">{{ selectedMessage.title }}</h3>
            </div>
            <span class="detail-date">{{ selectedMessage.date }}</span>
          </div>
          <div class="detail-body-wrapper">
            <div class="detail-content">
              {{ selectedMessage.content }}
            </div>
          </div>
          <div class="detail-footer">
            <div class="detail-source">来源：{{ selectedMessage.source }}</div>
            <button class="close-btn" @click="closeDetail">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const STORAGE_KEY = 'boh_read_messages';

const messages = ref([
  {
    id: 1,
    type: 'system',
    title: '系统通知',
    content: '方块之家全新的网页设计中！我们正在为您打造更加流畅、美观的交互体验。感谢您的支持与关注，更多新功能即将上线，敬请期待。此外，我们还将优化移动端的显示效果，确保您在任何设备上都能获得一致的优质体验。',
    source: '方块之家',
    date: '2026-01-09',
    read: false
  },
  {
    id: 2,
    type: 'normal',
    title: '欢迎来到个人中心',
    content: '您可以在这里管理您的个人信息、查看订阅状态以及处理收货地址。如果您有任何建议或反馈，欢迎通过消息中心告知我们。',
    source: '系统',
    date: '2026-01-08',
    read: false
  }
]);

const selectedMessage = ref(null);

// 初始化已读状态
onMounted(() => {
  const readIds = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  messages.value.forEach(msg => {
    if (readIds.includes(msg.id)) {
      msg.read = true;
    }
  });
});

// 保存已读状态
const saveReadStatus = () => {
  const readIds = messages.value.filter(m => m.read).map(m => m.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readIds));
};

const unreadCount = computed(() => {
  return messages.value.filter(m => !m.read).length;
});

const markAllAsRead = () => {
  messages.value.forEach(m => m.read = true);
  saveReadStatus();
};

const showDetail = (msg) => {
  selectedMessage.value = msg;
  msg.read = true;
  saveReadStatus();
};

const closeDetail = () => {
  selectedMessage.value = null;
};
</script>

<style scoped>
.messages-container {
  animation: fadeIn 0.5s ease-out;
  max-width: 800px;
  margin: 0 auto;
}

.messages-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 0 4px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 600;
  color: #24292e;
  margin: 0;
}

.unread-count {
  font-size: 13px;
  color: #007bff;
  background: rgba(0, 123, 255, 0.1);
  padding: 2px 8px;
  border-radius: 6px;
}

.mark-read-btn {
  font-size: 13px;
  color: #666;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.2s;
}

.mark-read-btn:hover {
  color: #007bff;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px; /* 增加列表项之间的距离 */
}

.message-item {
  display: flex;
  gap: 16px; /* 增加红点与文字之间的距离 */
  padding: 20px 24px; /* 增加内边距 */
  background-color: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 20px; /* 圆角稍微调大一点 */
  cursor: pointer;
  transition: all 0.2s ease;
}

.message-item:hover {
  background-color: rgba(255, 255, 255, 0.65);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.message-status {
  padding-top: 6px;
  width: 8px;
}

.red-dot {
  display: block;
  width: 8px;
  height: 8px;
  background-color: #ff4d4f;
  border-radius: 50%;
}

.message-info {
  flex: 1;
  min-width: 0;
}

.message-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.message-title {
  font-size: 16px;
  font-weight: 600;
  color: #24292e;
}

.unread .message-title {
  color: #1a1a1a;
}

.message-date {
  font-size: 12px;
  color: #999;
}

.message-preview {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.no-messages {
  text-align: center;
  padding: 80px 0;
  color: #999;
  font-size: 14px;
}

/* 详情弹窗样式 */
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.05); /* 取消黑色遮罩，改用极浅的白色背景 */
  backdrop-filter: blur(10px); /* 保持并稍微增强模糊效果，确保弹窗内容可读 */
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 80px 20px 40px; /* 增加顶部间距 (80px)，确保避开菜单栏 */
  pointer-events: auto;
}

.detail-modal {
  width: 100%;
  max-width: 500px;
  max-height: 90vh; /* 限制最大高度 */
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  display: flex;
  flex-direction: column; /* 弹性布局 */
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.2); /* 加强阴影，补偿黑色滤镜的缺失 */
  overflow: hidden;
}

.detail-header {
  padding: 32px 40px 24px; /* 增加顶部和侧边间距 */
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px; /* 增加标题下方的间距 */
}

.detail-type {
  font-size: 12px;
  color: #007bff;
  background: rgba(0, 123, 255, 0.1);
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.detail-title {
  font-size: 20px; /* 标题稍微调大 */
  font-weight: 700;
  color: #24292e;
  margin: 0;
  line-height: 1.4;
}

.detail-date {
  font-size: 13px;
  color: #999;
}

.detail-body-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px 40px; /* 增加正文区域间距 */
}

.detail-content {
  font-size: 16px; /* 字体稍微调大，更易读 */
  color: #333;
  line-height: 1.8;
  word-break: break-word;
}

.detail-footer {
  padding: 28px 40px 36px; /* 增加底部间距 */
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  flex-shrink: 0;
}

.detail-source {
  font-size: 13px;
  color: #888;
  margin-right: auto; /* 将来源推向左侧，保持按钮在右侧 */
}

.close-btn {
  height: 44px; /* 固定高度确保文字居中 */
  min-width: 100px; /* 确保按钮有足够宽度包裹文字 */
  padding: 0 24px;
  background: #24292e;
  color: #ffffff !important;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

/* 确保没有任何伪元素图标 */
.close-btn::before,
.close-btn::after {
  display: none !important;
  content: none !important;
}

.close-btn:hover {
  background: #000000;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .messages-container {
    width: 100%;
    padding: 0 4px; /* 增加容器边距防止贴边 */
    box-sizing: border-box;
  }

  .messages-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
  }

  .header-left {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mark-read-btn {
    align-self: flex-end;
    margin-top: -4px;
  }

  .message-item {
    padding: 14px 16px;
    gap: 10px;
    width: 100%;
    box-sizing: border-box; /* 确保内边距不撑开宽度 */
  }

  .message-preview {
    font-size: 13px;
    width: 100%;
    white-space: normal; /* 移动端允许换行显示更多内容，或者使用两行截断 */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .detail-overlay {
    padding: 100px 12px 20px; /* 移动端增加更多顶部间距，避开移动端切换按钮 */
    align-items: flex-start; /* 移动端靠上对齐，方便滚动 */
  }

  .detail-modal {
    width: 100%;
    max-width: none; /* 移除最大宽度限制 */
    max-height: 85vh;
    margin: 0;
    border-radius: 20px;
  }

  .detail-header {
    padding: 20px 20px 12px;
  }

  .detail-body-wrapper {
    padding: 12px 20px;
  }

  .detail-content {
    font-size: 14px;
    line-height: 1.7;
  }

  .detail-footer {
    padding: 12px 20px 20px;
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .close-btn {
    width: 100%;
    height: 48px; /* 移动端按钮稍微高一点更好按 */
    padding: 0;
    margin-top: 8px;
  }
}
</style>
