<template>
  <div class="user-info-page">
    <h2 class="page-title">个人信息</h2>
    
    <div class="info-card">
      <!-- 用户头像和 ID 区域 -->
      <div class="user-header-section">
        <div class="user-avatar-large">
          {{ username.charAt(0).toUpperCase() }}
        </div>
        <div class="user-name-info">
          <h3 class="user-nickname">{{ username }}</h3>
          <span class="user-id-label">方块ID: {{ username }}</span>
        </div>
      </div>

      <div class="info-section">
        <h3 class="section-title">基本信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">入群时间</span>
            <span class="info-value">{{ joinDate }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">方块年龄</span>
            <span class="info-value">{{ blockAge }} 天</span>
          </div>
          <div class="info-item">
            <span class="info-label">用户角色</span>
            <span class="info-value">{{ userRole }}</span>
          </div>
        </div>
      </div>
      
      <div class="info-section">
        <h3 class="section-title">个人标签</h3>
        <div class="tags-container">
          <span v-for="tag in userTags" :key="tag" class="tag-item">
            {{ tag }}
          </span>
          <span v-if="userTags.length === 0" class="no-tags">暂无标签</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getUserByUsername } from '@config/users.config.js';

// 从localStorage获取当前登录用户名
const username = ref(localStorage.getItem('username') || '');

// 用户数据
const user = ref(null);
const joinDate = ref('');
const blockAge = ref(0);
const userRole = ref('普通用户');
const userTags = ref([]);

// 计算方块年龄
const calculateBlockAge = (joinDateStr) => {
  const joinDate = new Date(joinDateStr);
  const now = new Date();
  const diffTime = Math.abs(now - joinDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// 初始化用户数据
onMounted(() => {
  if (username.value) {
    user.value = getUserByUsername(username.value);
    if (user.value) {
      joinDate.value = user.value.joinDate;
      blockAge.value = calculateBlockAge(user.value.joinDate);
      userRole.value = user.value.role === 'admin' ? '管理员' : '普通用户';
      userTags.value = user.value.tags || [];
    }
  }
});
</script>

<style scoped>
.user-info-page {
  width: 100%;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: #24292e;
  margin: 0 0 24px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid #e1e4e8;
}

.info-card {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
  padding: 30px;
}

.user-header-section {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.user-avatar-large {
  width: 80px;
  height: 80px;
  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
  color: white;
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(0, 123, 255, 0.2);
}

.user-name-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-nickname {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0;
}

.user-id-label {
  font-size: 14px;
  color: #666;
}

.info-section {
  margin-bottom: 24px;
}

.info-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 16px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background-color: rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  padding: 16px 20px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.info-item:hover {
  background-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
}

.info-label {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.info-value {
  font-size: 16px;
  color: #1a1a1a;
  font-weight: 600;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  background-color: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  color: #333;
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.tag-item:hover {
  background-color: rgba(0, 123, 255, 0.1);
  color: #007bff;
  border-color: rgba(0, 123, 255, 0.2);
  transform: translateY(-2px);
}

.no-tags {
  color: #656d76;
  font-size: 14px;
  font-style: italic;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .page-title {
    font-size: 20px;
    margin-bottom: 20px;
  }
  
  .info-card {
    padding: 20px;
  }

  .user-header-section {
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 20px;
  }

  .user-avatar-large {
    width: 60px;
    height: 60px;
    font-size: 24px;
  }

  .user-nickname {
    font-size: 20px;
  }
  
  .info-section {
    margin-bottom: 20px;
  }
  
  .section-title {
    font-size: 16px;
    margin-bottom: 12px;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .info-item {
    padding: 10px 14px;
  }
}

@media (max-width: 480px) {
  .info-card {
    padding: 16px;
  }

  .user-header-section {
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
  }

  .user-avatar-large {
    width: 50px;
    height: 50px;
    font-size: 20px;
  }

  .user-nickname {
    font-size: 18px;
  }

  .user-id-label {
    font-size: 12px;
  }
}
</style>