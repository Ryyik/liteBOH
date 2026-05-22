<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import UnifiedNavbar from '../../components/UnifiedNavbar/index.vue';

const router = useRouter();

// 频道数据
const channelInfo = ref({
  name: '锂铁分子',
  description: '探索锂铁分子的奥秘，分享化学与材料科学的精彩世界',
  followerCount: 0,
  postCount: 0
});

// 编辑状态
const isEditing = ref(false);
const editForm = ref({
  name: '',
  description: ''
});

// 内容列表
const contentList = ref([]);
const isLoading = ref(false);
const hasMore = ref(true);
const currentPage = ref(1);
const sortMode = ref('latest');
const viewMode = ref('grid');

// 开始编辑
const startEdit = () => {
  editForm.value = {
    name: channelInfo.value.name,
    description: channelInfo.value.description
  };
  isEditing.value = true;
};

// 保存编辑
const saveEdit = () => {
  if (!editForm.value.name.trim()) return;
  channelInfo.value.name = editForm.value.name.trim();
  channelInfo.value.description = editForm.value.description.trim();
  isEditing.value = false;
  // TODO: 调用API保存
};

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
};

// 获取内容列表
const fetchContentList = async (page = 1) => {
  isLoading.value = true;
  try {
    setTimeout(() => {
      const mockData = generateMockData(page);
      contentList.value = page === 1 ? mockData : [...contentList.value, ...mockData];
      hasMore.value = page < 3;
      isLoading.value = false;
    }, 500);
  } catch (error) {
    console.error('获取内容列表失败:', error);
    isLoading.value = false;
  }
};

const generateMockData = (page) => {
  const mockItems = [];
  const startIndex = (page - 1) * 10;
  for (let i = 0; i < 10; i++) {
    const index = startIndex + i;
    mockItems.push({
      id: `post-${index}`,
      title: `锂铁分子探索文章 ${index + 1}`,
      summary: '这是一篇关于锂铁分子的精彩文章，探索化学与材料科学的奥秘...',
      author: { name: '化学爱好者' },
      publishTime: new Date(Date.now() - index * 86400000).toISOString(),
      viewCount: Math.floor(Math.random() * 1000),
    });
  }
  return mockItems;
};

const loadMore = () => {
  if (isLoading.value || !hasMore.value) return;
  currentPage.value++;
  fetchContentList(currentPage.value);
};

const handleSortChange = (mode) => {
  sortMode.value = mode;
  currentPage.value = 1;
  fetchContentList(1);
};

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid';
};

const goToDetail = (item) => {
  router.push(`/lithium-iron/${item.id}`);
};

const formatTime = (time) => {
  return new Date(time).toLocaleDateString('zh-CN');
};

onMounted(() => {
  fetchContentList();
});
</script>

<template>
  <div class="lithium-iron-channel">
    <UnifiedNavbar />

    <section class="channel-header">
      <div class="header-content">
        <!-- 查看模式 -->
        <div v-if="!isEditing" class="view-mode">
          <div class="header-top">
            <div>
              <h1 class="channel-name">{{ channelInfo.name }}</h1>
              <p class="channel-description">{{ channelInfo.description }}</p>
              <div class="channel-stats">
                <span>{{ channelInfo.followerCount }} 关注</span>
                <span class="divider">·</span>
                <span>{{ channelInfo.postCount }} 内容</span>
              </div>
            </div>
            <button class="edit-btn" @click="startEdit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              编辑
            </button>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="edit-mode">
          <div class="form-group">
            <label>频道名称</label>
            <input
              v-model="editForm.name"
              type="text"
              placeholder="输入频道名称"
              maxlength="20"
            />
          </div>
          <div class="form-group">
            <label>频道简介</label>
            <textarea
              v-model="editForm.description"
              placeholder="输入频道简介"
              rows="2"
              maxlength="100"
            ></textarea>
          </div>
          <div class="form-actions">
            <button class="btn-save" @click="saveEdit">保存</button>
            <button class="btn-cancel" @click="cancelEdit">取消</button>
          </div>
        </div>
      </div>
    </section>

    <section class="content-section">
      <div class="content-container">
        <div class="filter-bar">
          <div class="sort-options">
            <button :class="{ active: sortMode === 'latest' }" @click="handleSortChange('latest')">
              最新
            </button>
            <button :class="{ active: sortMode === 'hottest' }" @click="handleSortChange('hottest')">
              最热
            </button>
          </div>
          <button class="view-toggle" @click="toggleViewMode">
            {{ viewMode === 'grid' ? '列表' : '网格' }}
          </button>
        </div>

        <div class="content-list" :class="viewMode">
          <article v-for="item in contentList" :key="item.id" class="content-card" @click="goToDetail(item)">
            <div class="card-cover">
              <div class="cover-placeholder"></div>
            </div>
            <div class="card-body">
              <h3 class="card-title">{{ item.title }}</h3>
              <p class="card-summary">{{ item.summary }}</p>
              <div class="card-meta">
                <span>{{ item.author.name }}</span>
                <span class="dot">·</span>
                <span>{{ formatTime(item.publishTime) }}</span>
                <span class="dot">·</span>
                <span>{{ item.viewCount }} 阅读</span>
              </div>
            </div>
          </article>
        </div>

        <div class="load-more">
          <button v-if="hasMore && !isLoading" @click="loadMore">加载更多</button>
          <span v-if="isLoading">加载中...</span>
          <span v-if="!hasMore && contentList.length > 0">没有更多内容</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lithium-iron-channel {
  min-height: 100vh;
  background: #fff;
  color: #1a1a1a;
}

/* Header */
.channel-header {
  padding: 100px 40px 40px;
  border-bottom: 1px solid #e5e5e5;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
}

/* View Mode */
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.channel-name {
  font-size: 32px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #000;
  letter-spacing: -0.5px;
}

.channel-description {
  font-size: 15px;
  color: #666;
  margin: 0 0 16px;
  line-height: 1.5;
}

.channel-stats {
  font-size: 13px;
  color: #999;
}

.channel-stats .divider {
  margin: 0 8px;
}

.edit-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  color: #666;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.edit-btn:hover {
  border-color: #999;
  color: #000;
}

.edit-btn svg {
  width: 14px;
  height: 14px;
}

/* Edit Mode */
.edit-mode {
  max-width: 600px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #1a1a1a;
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: #999;
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-actions {
  display: flex;
  gap: 12px;
}

.btn-save,
.btn-cancel {
  padding: 8px 20px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-save {
  color: #fff;
  background: #1a1a1a;
  border: none;
}

.btn-save:hover {
  background: #000;
}

.btn-cancel {
  color: #666;
  background: none;
  border: 1px solid #ddd;
}

.btn-cancel:hover {
  border-color: #999;
  color: #000;
}

/* Content Section */
.content-section {
  padding: 32px 40px;
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e5e5e5;
}

.sort-options {
  display: flex;
  gap: 4px;
}

.sort-options button {
  padding: 6px 12px;
  font-size: 13px;
  color: #666;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.sort-options button:hover {
  color: #000;
}

.sort-options button.active {
  color: #000;
  font-weight: 500;
}

.view-toggle {
  padding: 6px 12px;
  font-size: 13px;
  color: #666;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-toggle:hover {
  border-color: #999;
  color: #000;
}

/* Content List - Grid */
.content-list.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

/* Content List - List */
.content-list.list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.content-list.list .content-card {
  display: flex;
  gap: 20px;
  padding: 20px 0;
  border-bottom: 1px solid #e5e5e5;
  border-radius: 0;
  background: none;
}

.content-list.list .content-card:hover {
  background: none;
}

.content-list.list .card-cover {
  width: 200px;
  height: 120px;
  flex-shrink: 0;
  border-radius: 4px;
}

.content-list.list .card-body {
  flex: 1;
  padding: 0;
}

/* Content Card */
.content-card {
  background: #fafafa;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.2s;
}

.content-card:hover {
  background: #f0f0f0;
}

.card-cover {
  width: 100%;
  height: 160px;
  background: #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-placeholder {
  width: 48px;
  height: 48px;
  background: #ccc;
  border-radius: 4px;
}

.card-body {
  padding: 16px;
}

.card-title {
  font-size: 15px;
  font-weight: 500;
  margin: 0 0 8px;
  color: #1a1a1a;
  line-height: 1.4;
}

.card-summary {
  font-size: 13px;
  color: #666;
  margin: 0 0 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  font-size: 12px;
  color: #999;
}

.card-meta .dot {
  margin: 0 6px;
}

/* Load More */
.load-more {
  text-align: center;
  padding: 40px 0;
}

.load-more button {
  padding: 10px 24px;
  font-size: 13px;
  color: #666;
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.load-more button:hover {
  border-color: #999;
  color: #000;
}

.load-more span {
  font-size: 13px;
  color: #999;
}

/* Responsive */
@media (max-width: 768px) {
  .channel-header {
    padding: 80px 20px 24px;
  }

  .header-top {
    flex-direction: column;
    gap: 16px;
  }

  .channel-name {
    font-size: 24px;
  }

  .edit-btn {
    align-self: flex-start;
  }

  .content-section {
    padding: 20px;
  }

  .content-list.grid {
    grid-template-columns: 1fr;
  }

  .content-list.list .content-card {
    flex-direction: column;
    gap: 12px;
  }

  .content-list.list .card-cover {
    width: 100%;
    height: 160px;
  }

  .filter-bar {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
</style>
