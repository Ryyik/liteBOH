<template>
  <div class="points-page">
    <div class="tabs-header">
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'points' }" 
        @click="handleTabChange('points')"
      >
        积分明细
      </div>
      <div 
        class="tab-item" 
        :class="{ active: activeTab === 'subscriptions' }" 
        @click="handleTabChange('subscriptions')"
      >
        订阅管理
      </div>
    </div>
    
    <div v-if="activeTab === 'points'" class="tab-content">
      <div class="points-overview-card">
        <div class="points-total">
          <div class="points-label">当前积分</div>
          <div class="points-value">{{ currentPoints }}</div>
        </div>
        <div class="points-description">
          积分可用于兑换周边商品、参与抽奖活动等，更多积分获取方式即将上线
        </div>
      </div>
      
      <div class="points-history-card">
        <h3 class="card-title">积分变动记录</h3>
        
        <div v-if="pointsHistory.length > 0" class="points-list">
          <div v-for="(item, index) in pointsHistory" :key="index" class="points-item">
            <div class="points-item-left">
              <div class="points-item-title">{{ item.title }}</div>
              <div class="points-item-date">{{ item.date }}</div>
            </div>
            <div class="points-item-right">
              <div :class="['points-item-amount', item.type === 'gain' ? 'points-gain' : 'points-loss']">
                {{ item.type === 'gain' ? '+' : '-' }}{{ item.amount }}
              </div>
            </div>
          </div>
        </div>
        
        <div v-else class="no-history">
          <div class="no-history-text">暂无积分变动记录</div>
        </div>
      </div>
    </div>

    <div v-else class="tab-content">
      <div class="subscriptions-overview">
        <div class="overview-item">
          <div class="overview-label">当前订阅</div>
          <div class="overview-value">{{ currentSubscriptions.length }} 项</div>
        </div>
        <div class="overview-item">
          <div class="overview-label">可用订阅</div>
          <div class="overview-value">{{ availableSubsList.length }} 项</div>
        </div>
      </div>

      <div class="subscriptions-card">
        <h3 class="card-title">当前订阅项目</h3>
        <div class="subscription-list">
          <div
            v-for="subscription in currentSubscriptions"
            :key="subscription.id"
            class="subscription-item"
          >
            <div class="subscription-item-content">
              <div class="subscription-item-title">{{ subscription.title }}</div>
              <div class="subscription-item-description">{{ subscription.description }}</div>
            </div>
            <div class="subscription-item-right">
              <div 
                class="subscription-item-tag"
                :class="{ 'tag-free': subscription.tag === 'Free' }"
              >
                {{ subscription.tag }}
              </div>
              <!-- 占位符，保持布局一致 -->
              <div class="subscribe-btn-placeholder"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="subscriptions-card">
        <h3 class="card-title">可用订阅项目</h3>
        <div class="subscription-list">
          <div v-if="availableSubsList.length > 0">
            <div
              v-for="subscription in availableSubsList"
              :key="subscription.id"
              class="subscription-item"
            >
              <div class="subscription-item-content">
                <div class="subscription-item-title">{{ subscription.title }}</div>
                <div class="subscription-item-description">{{ subscription.description }}</div>
              </div>
              <div class="subscription-item-right">
                <div 
                  class="subscription-item-tag"
                  :class="{ 'tag-free': subscription.tag === 'Free' }"
                >
                  {{ subscription.tag }}
                </div>
                <button class="subscribe-btn" @click="handleSubscribe(subscription)">立即订阅</button>
              </div>
            </div>
          </div>
          <div v-else class="no-history">
             <div class="no-history-text">暂无可用的订阅项目</div>
           </div>
         </div>
       </div>

     </div>

     <!-- 毛玻璃提示弹窗 -->
     <Transition name="glass-fade">
       <div v-if="showModal" class="glass-modal-overlay" @click="closeModal">
         <div class="glass-modal-content" @click.stop>
           <h3 class="glass-modal-title">积分不足</h3>
           <p class="glass-modal-message">{{ modalMessage }}</p>
           <button class="glass-modal-btn" @click="closeModal">知道了</button>
         </div>
       </div>
     </Transition>
   </div>
 </template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const activeTab = ref('points');

// 弹窗状态
const showModal = ref(false);
const modalMessage = ref('');

// 关闭弹窗
const closeModal = () => {
  showModal.value = false;
};

// 处理订阅点击
const handleSubscribe = (subscription) => {
  // 从标签中解析积分数值，例如 "积分30" -> 30
  const pointsMatch = subscription.tag.match(/\d+/);
  const requiredPoints = pointsMatch ? parseInt(pointsMatch[0]) : 0;

  if (currentPoints.value < requiredPoints) {
    modalMessage.value = `订阅“${subscription.title}”需要 ${requiredPoints} 积分。`;
    showModal.value = true;
  } else {
    // 这里可以添加积分充足时的处理逻辑（如调用 API 等）
    alert('积分充足，订阅成功！（此处为演示逻辑）');
  }
};

// 根据路由设置当前标签
const updateTabFromRoute = () => {
  if (route.path.includes('subscriptions')) {
    activeTab.value = 'subscriptions';
  } else {
    activeTab.value = 'points';
  }
};

onMounted(() => {
  updateTabFromRoute();
});

// 监听路由变化
watch(() => route.path, () => {
  updateTabFromRoute();
});

// 处理标签切换
const handleTabChange = (tab) => {
  activeTab.value = tab;
  if (tab === 'points') {
    router.push('/user-center/points');
  } else {
    router.push('/user-center/subscriptions');
  }
};

// 积分变动记录
const pointsHistory = ref([]);

const currentPoints = ref(0);

// 订阅数据
const currentSubscriptions = ref([
  {
    id: 1,
    title: "方块之家生日会",
    description: "生日当天获得专属祝福和神秘礼物",
    tag: "Free",
  },
  {
    id: 2,
    title: "方块之家礼物抽奖",
    description: "定期参与抽奖活动，赢取精美周边",
    tag: "Free",
  },
]);

// 可用订阅项目
const availableSubsList = ref([
  {
    id: 101,
    title: "礼物定制",
    description: "不受限制的给出礼物定制的提示词，礼物最终不一定完全一致，但会尽量符合。",
    tag: "积分30",
  },
]);
</script>

<style scoped>
.points-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Tabs Header */
.tabs-header {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  border-bottom: 1px solid #e1e4e8;
  padding-bottom: 2px;
}

.tab-item {
  font-size: 18px;
  font-weight: 500;
  color: #656d76;
  padding: 12px 4px;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
}

.tab-item:hover {
  color: #24292e;
}

.tab-item.active {
  color: #007bff;
  font-weight: 600;
}

.tab-item.active::after {
  content: "";
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background-color: #007bff;
  border-radius: 3px;
}

/* Subscriptions Styles */
.subscriptions-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.overview-item {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  padding: 24px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.3s ease;
  text-align: left;
}

.overview-item:hover {
  background-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
}

.overview-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.overview-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
}

.subscriptions-card {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  border: 1px solid #e1e4e8;
}

.subscription-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subscription-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background-color: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.subscription-item:hover {
  background-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.4);
}

.subscription-item-content {
  flex: 1;
  margin-right: 24px;
}

.subscription-item-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 6px;
}

.subscription-item-description {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.subscription-item-tag {
  font-size: 12px;
  padding: 4px 10px;
  background-color: rgba(255, 255, 255, 0.5);
  color: #007bff;
  border-radius: 8px;
  font-weight: 600;
  border: 1px solid rgba(0, 123, 255, 0.1);
}

.subscription-item-tag.tag-free {
  background-color: #e8f5e9;
  color: #2e7d32;
  border: none;
}

.subscription-item-right {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 180px; /* 固定右侧区域宽度 */
  justify-content: flex-end;
}

.subscribe-btn, .subscribe-btn-placeholder {
  width: 90px; /* 固定按钮和占位符宽度 */
  flex-shrink: 0;
}

.subscribe-btn {
  padding: 8px 0; /* 宽度已固定，padding 仅设置上下 */
  background-color: #24292e;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.subscribe-btn:hover {
  background-color: #000000;
}

.points-overview-card {
  background-color: #fafbfc;
  color: #24292e;
  border-radius: 8px;
  padding: 30px;
  text-align: center;
  border: 1px solid #e1e4e8;
}

.points-total {
  margin-bottom: 12px;
}

.points-label {
  font-size: 14px;
  color: #656d76;
  margin-bottom: 8px;
  font-weight: 500;
}

.points-value {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
  color: #24292e;
}

.points-description {
  font-size: 13px;
  color: #656d76;
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto;
}

.points-history-card {
  background-color: #ffffff;
  border-radius: 8px;
  padding: 24px;
  border: 1px solid #e1e4e8;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #24292e;
  margin: 0 0 20px 0;
}

.points-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.points-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: #ffffff;
  border-radius: 6px;
  border: 1px solid #f0f2f5;
  transition: all 0.2s ease;
}

.points-item:hover {
  border-color: #e1e4e8;
  background-color: #fafbfc;
}

.points-item-left {
  flex: 1;
}

.points-item-title {
  font-size: 16px;
  font-weight: 500;
  color: #24292e;
  margin-bottom: 4px;
}

.points-item-date {
  font-size: 13px;
  color: #656d76;
}

.points-item-right {
  text-align: right;
}

.points-item-amount {
  font-size: 18px;
  font-weight: 600;
}

.points-gain {
  color: #28a745;
}

.points-loss {
  color: #dc3545;
}

.no-history {
  text-align: center;
  padding: 40px 20px;
  color: #656d76;
}

.no-history-text {
  font-size: 16px;
  font-weight: 500;
}

/* 毛玻璃弹窗样式 */
.glass-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.05); /* 取消黑色遮罩 */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 80px 20px 40px; /* 增加顶部间距，避开菜单栏 */
}

.glass-modal-content {
  background-color: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 24px;
  padding: 48px 40px; /* 增加上下边距 */
  width: 90%;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.12);
}

.glass-modal-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.glass-modal-title {
  font-size: 24px; /* 稍微调大 */
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 16px; /* 增加下方间距 */
}

.glass-modal-message {
  font-size: 16px;
  color: #4a4a4a;
  line-height: 1.6;
  margin-bottom: 36px; /* 增加下方间距 */
}

.glass-modal-btn {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #24292e;
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

/* 彻底禁用任何可能产生的伪元素图标 */
.glass-modal-btn::before,
.glass-modal-btn::after,
.glass-modal-content::before,
.glass-modal-content::after {
  display: none !important;
  content: none !important;
}

.glass-modal-btn:hover {
  background-color: #000;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 弹窗动画 */
.glass-fade-enter-active,
.glass-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-fade-enter-from,
.glass-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tabs-header {
    gap: 16px;
    margin-bottom: 20px;
    padding-bottom: 4px;
    /* 确保在移动端不会太靠近顶部菜单按钮 */
    margin-top: 10px;
  }

  .tab-item {
    font-size: 16px;
    padding: 10px 2px;
  }

  .page-title {
    font-size: 20px;
    margin-bottom: 16px;
  }
  
  .points-overview-card {
    padding: 24px;
  }
  
  .points-value {
    font-size: 36px;
  }
  
  .points-history-card {
    padding: 20px;
  }
  
  .card-title {
    font-size: 16px;
    margin-bottom: 16px;
  }
  
  .points-item {
    padding: 12px;
  }
  
  .points-item-title {
    font-size: 15px;
  }
  
  .points-item-date {
    font-size: 12px;
  }
  
  .points-item-amount {
    font-size: 16px;
  }

  /* Subscriptions Responsive */
  .subscription-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 20px;
  }

  .subscription-item-content {
    margin-right: 0;
  }

  .subscription-item-right {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .subscribe-btn {
    margin-left: 0;
    flex: 1;
    text-align: center;
  }
}

@media (max-width: 480px) {
  .points-overview-card {
    padding: 20px;
  }
  
  .points-value {
    font-size: 32px;
  }
  
  .points-description {
    font-size: 13px;
  }
  
  .points-history-card {
    padding: 16px;
  }
  
  .no-history {
    padding: 30px 16px;
  }
  
  .no-history-text {
    font-size: 14px;
  }
}
</style>