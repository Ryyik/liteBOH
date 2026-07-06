<template>
  <div class="admin-birthday">
    <main class="shell">
      <header class="page-header">
        <div>
          <span class="eyebrow">Birthday Admin</span>
          <h1>生日管理</h1>
          <p>配置生日活动、管理祝福语、控制页面文案。</p>
        </div>
        <div class="header-actions">
          <button class="ghost-btn" @click="loadAll" :disabled="isLoading">
            <span>{{ isLoading ? '加载中...' : '刷新' }}</span>
          </button>
        </div>
      </header>

      <div v-if="errorMessage" class="notice error">{{ errorMessage }}</div>
      <div v-if="successMessage" class="notice success">{{ successMessage }}</div>

      <nav class="tab-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'event'" class="tab-content">
        <div class="form-card">
          <h3>生日活动设置</h3>

          <label class="field">
            <span>目标用户 ID</span>
            <input v-model="form.targetUserId" placeholder="输入用户 UUID" class="input" />
          </label>

          <label class="field">
            <span>标题</span>
            <input v-model="form.title" placeholder="生日快乐" class="input" />
          </label>

          <label class="field">
            <span>副标题</span>
            <input v-model="form.subtitle" placeholder="今天是最特别的一天" class="input" />
          </label>

          <label class="field">
            <span>首页引语</span>
            <textarea v-model="form.heroQuote" rows="3" placeholder="输入展示在 Hero 区域的引语" class="input" />
          </label>

          <label class="field">
            <span>庆祝日期</span>
            <input v-model="form.celebrationDate" type="date" class="input" />
          </label>

          <label class="field row">
            <span>启用</span>
            <label class="switch">
              <input v-model="form.isActive" type="checkbox" />
              <span class="slider"></span>
            </label>
          </label>

          <div class="form-actions">
            <button class="primary-btn" @click="saveEvent" :disabled="isSaving">
              {{ isSaving ? '保存中...' : '保存设置' }}
            </button>
            <button class="ghost-btn" @click="createNewEvent" :disabled="isSaving">
              新建活动
            </button>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'wishes'" class="tab-content">
        <div class="toolbar">
          <span class="wish-count">共 {{ wishes.length }} 条祝福</span>
          <div class="toolbar-actions">
            <select v-model="wishFilter" class="input sm">
              <option value="all">全部</option>
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
        </div>

        <div v-if="filteredWishes.length === 0" class="empty-state">{{ isLoading ? '加载中...' : '暂无祝福数据' }}</div>

        <div v-else class="wish-table">
          <article v-for="wish in filteredWishes" :key="wish.id" class="wish-row" :class="wish.status">
            <div class="wish-author">
              <div class="wish-avatar">{{ wish.author_name.slice(0, 1).toUpperCase() }}</div>
              <div>
                <strong>{{ wish.author_name }}</strong>
                <time>{{ formatDate(wish.created_at) }}</time>
              </div>
            </div>
            <p class="wish-content">{{ wish.content }}</p>
            <div class="wish-actions">
              <template v-if="wish.status === 'pending'">
                <button class="btn-sm approve" @click="approveWish(wish.id)">通过</button>
                <button class="btn-sm reject" @click="rejectWish(wish.id)">拒绝</button>
              </template>
              <template v-if="wish.status === 'approved'">
                <button class="btn-sm" :class="{ featured: wish.is_featured }" @click="toggleFeatured(wish.id)">
                  {{ wish.is_featured ? '已精选' : '设为精选' }}
                </button>
                <button class="btn-sm reject" @click="rejectWish(wish.id)">撤回</button>
              </template>
              <template v-if="wish.status === 'rejected'">
                <button class="btn-sm approve" @click="approveWish(wish.id)">恢复</button>
              </template>
              <button class="btn-sm danger" @click="deleteWish(wish.id)">删除</button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="activeTab === 'copy'" class="tab-content">
        <div class="form-card">
          <h3>页面文案编辑</h3>
          <p class="field-hint">以下文案将显示在生日页面上。</p>

          <label class="field">
            <span>蜡烛区域标题</span>
            <input v-model="pageCopy.candleTitle" placeholder="Make A Wish" class="input" />
          </label>
          <label class="field">
            <span>蜡烛区域描述</span>
            <textarea v-model="pageCopy.candleDesc" rows="2" placeholder="点击蜡烛，许个愿吧" class="input" />
          </label>
          <label class="field">
            <span>留言区域标题</span>
            <input v-model="pageCopy.messagesTitle" placeholder="祝福留言" class="input" />
          </label>
          <label class="field">
            <span>留言区域描述</span>
            <textarea v-model="pageCopy.messagesDesc" rows="2" placeholder="写下你的祝福" class="input" />
          </label>
          <label class="field">
            <span>记忆区域标题</span>
            <input v-model="pageCopy.memoriesTitle" placeholder="回忆相册" class="input" />
          </label>
          <label class="field">
            <span>礼品卡区域标题</span>
            <input v-model="pageCopy.giftTitle" placeholder="生日礼品卡" class="input" />
          </label>
          <label class="field">
            <span>礼品卡码</span>
            <input v-model="pageCopy.giftCode" placeholder="BOH-2026-BIRTHDAY" class="input" />
          </label>

          <div class="form-actions">
            <button class="primary-btn" @click="savePageCopy" :disabled="isSaving">
              {{ isSaving ? '保存中...' : '保存文案' }}
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { supabase } from "@/utils/supabase-client.js";
import { logger } from "@/utils/logger.js";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

const tabs = [
  { key: "event", label: "活动设置" },
  { key: "wishes", label: "祝福管理" },
  { key: "copy", label: "文案编辑" }
];

const activeTab = ref("event");
const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const eventId = ref(null);
const wishes = ref([]);
const wishFilter = ref("all");

const form = reactive({
  targetUserId: "",
  title: "生日快乐",
  subtitle: "",
  heroQuote: "",
  celebrationDate: "",
  isActive: false
});

const pageCopy = reactive({
  candleTitle: "Make A Wish",
  candleDesc: "点击蜡烛，许个愿吧",
  messagesTitle: "祝福留言",
  messagesDesc: "写下你的生日祝福",
  memoriesTitle: "回忆相册",
  giftTitle: "生日礼品卡",
  giftCode: "BOH-2026-BIRTHDAY"
});

const filteredWishes = computed(() => {
  if (wishFilter.value === "all") return wishes.value;
  return wishes.value.filter((w) => w.status === wishFilter.value);
});

const formatDate = (iso) => {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "--";
  }
};

const showSuccess = (msg) => {
  successMessage.value = msg;
  setTimeout(() => { successMessage.value = ""; }, 3000);
};

const showError = (msg) => {
  errorMessage.value = msg;
  setTimeout(() => { errorMessage.value = ""; }, 5000);
};

const loadEvent = async () => {
  try {
    const { data, error } = await supabase
      .from("birthday_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    if (data) {
      eventId.value = data.id;
      form.targetUserId = data.target_user_id || "";
      form.title = data.title || "生日快乐";
      form.subtitle = data.subtitle || "";
      form.heroQuote = data.hero_quote || "";
      form.celebrationDate = data.celebration_date || "";
      form.isActive = data.is_active || false;

      const copy = data.page_copy || {};
      pageCopy.candleTitle = copy.candleTitle || "Make A Wish";
      pageCopy.candleDesc = copy.candleDesc || "点击蜡烛，许个愿吧";
      pageCopy.messagesTitle = copy.messagesTitle || "祝福留言";
      pageCopy.messagesDesc = copy.messagesDesc || "写下你的生日祝福";
      pageCopy.memoriesTitle = copy.memoriesTitle || "回忆相册";
      pageCopy.giftTitle = copy.giftTitle || "生日礼品卡";
      pageCopy.giftCode = copy.giftCode || "BOH-2026-BIRTHDAY";
    }
  } catch (err) {
    logger.error("birthday-admin", "加载活动失败", err);
  }
};

const loadWishes = async () => {
  if (!eventId.value) return;
  try {
    const { data, error } = await supabase
      .from("birthday_wishes")
      .select("*")
      .eq("event_id", eventId.value)
      .order("created_at", { ascending: false });
    if (error) throw error;
    wishes.value = data || [];
  } catch (err) {
    logger.error("birthday-admin", "加载祝福失败", err);
  }
};

const loadAll = async () => {
  if (!authStore.isAdmin) {
    showError("仅管理员可访问");
    return;
  }
  isLoading.value = true;
  errorMessage.value = "";
  await loadEvent();
  await loadWishes();
  isLoading.value = false;
};

const saveEvent = async () => {
  if (!authStore.isAdmin) return;
  isSaving.value = true;
  errorMessage.value = "";
  try {
    const payload = {
      target_user_id: form.targetUserId,
      title: form.title,
      subtitle: form.subtitle,
      hero_quote: form.heroQuote,
      celebration_date: form.celebrationDate,
      is_active: form.isActive,
      updated_at: new Date().toISOString()
    };

    if (eventId.value) {
      const { error } = await supabase
        .from("birthday_events")
        .update(payload)
        .eq("id", eventId.value);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("birthday_events")
        .insert({ ...payload, page_copy: {} })
        .select()
        .single();
      if (error) throw error;
      eventId.value = data.id;
    }
    showSuccess("活动设置已保存");
  } catch (err) {
    showError("保存失败: " + (err.message || "未知错误"));
    logger.error("birthday-admin", "保存活动失败", err);
  } finally {
    isSaving.value = false;
  }
};

const createNewEvent = async () => {
  eventId.value = null;
  form.targetUserId = "";
  form.title = "生日快乐";
  form.subtitle = "";
  form.heroQuote = "";
  form.celebrationDate = "";
  form.isActive = false;
  wishes.value = [];
  showSuccess("已清空，可创建新活动");
};

const approveWish = async (id) => {
  await updateWishStatus(id, "approved");
};

const rejectWish = async (id) => {
  await updateWishStatus(id, "rejected");
};

const updateWishStatus = async (id, status) => {
  isSaving.value = true;
  try {
    const { error } = await supabase
      .from("birthday_wishes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    const wish = wishes.value.find((w) => w.id === id);
    if (wish) wish.status = status;
    showSuccess("状态已更新");
  } catch (err) {
    showError("操作失败: " + (err.message || "未知错误"));
  } finally {
    isSaving.value = false;
  }
};

const toggleFeatured = async (id) => {
  isSaving.value = true;
  try {
    const wish = wishes.value.find((w) => w.id === id);
    if (!wish) return;
    const newVal = !wish.is_featured;
    const { error } = await supabase
      .from("birthday_wishes")
      .update({ is_featured: newVal })
      .eq("id", id);
    if (error) throw error;
    wish.is_featured = newVal;
    showSuccess(newVal ? "已设为精选" : "已取消精选");
  } catch (err) {
    showError("操作失败");
  } finally {
    isSaving.value = false;
  }
};

const deleteWish = async (id) => {
  if (!confirm("确定删除这条祝福？")) return;
  isSaving.value = true;
  try {
    const { error } = await supabase
      .from("birthday_wishes")
      .delete()
      .eq("id", id);
    if (error) throw error;
    wishes.value = wishes.value.filter((w) => w.id !== id);
    showSuccess("已删除");
  } catch (err) {
    showError("删除失败");
  } finally {
    isSaving.value = false;
  }
};

const savePageCopy = async () => {
  if (!eventId.value) {
    showError("请先保存活动设置");
    return;
  }
  isSaving.value = true;
  try {
    const { error } = await supabase
      .from("birthday_events")
      .update({
        page_copy: { ...pageCopy },
        updated_at: new Date().toISOString()
      })
      .eq("id", eventId.value);
    if (error) throw error;
    showSuccess("文案已保存");
  } catch (err) {
    showError("保存失败: " + (err.message || "未知错误"));
  } finally {
    isSaving.value = false;
  }
};

onMounted(loadAll);
</script>

<style scoped>
.admin-birthday {
  min-height: 100vh;
  background: #f5f5f7;
  color: #1d1d1f;
  font-family: "SF Pro Text", system-ui, -apple-system, sans-serif;
}

.shell {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 32px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #ff453a;
}

.page-header h1 {
  margin: 8px 0 0;
  font-size: 36px;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.page-header p {
  margin: 8px 0 0;
  color: #86868b;
  font-size: 15px;
}

.header-actions {
  flex-shrink: 0;
}

.ghost-btn {
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 999px;
  background: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.ghost-btn:hover {
  transform: translateY(-1px);
}

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.notice {
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 600;
}

.notice.error {
  color: #ff453a;
  background: rgba(255, 69, 58, 0.08);
  border: 1px solid rgba(255, 69, 58, 0.15);
}

.notice.success {
  color: #30d158;
  background: rgba(48, 209, 88, 0.08);
  border: 1px solid rgba(48, 209, 88, 0.15);
}

.tab-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 28px;
  padding: 4px;
  border-radius: 12px;
  background: rgba(0,0,0,0.04);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #86868b;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  color: #1d1d1f;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.tab-content {
  animation: fadeIn 0.25s ease;
}

.form-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}

.form-card h3 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 800;
}

.field-hint {
  margin: 0 0 20px;
  color: #86868b;
  font-size: 13px;
}

.field {
  display: block;
  margin-bottom: 18px;
}

.field > span {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #636366;
}

.field.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.field.row > span {
  margin-bottom: 0;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: #fafafa;
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.input:focus {
  border-color: #ff453a;
  box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.1);
}

.input.sm {
  width: auto;
  padding: 6px 12px;
  font-size: 13px;
}

textarea.input {
  resize: vertical;
  min-height: 60px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #e8e8ed;
  cursor: pointer;
  transition: background 0.2s ease;
}

.slider::before {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s ease;
}

.switch input:checked + .slider {
  background: #ff453a;
}

.switch input:checked + .slider::before {
  transform: translateX(18px);
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.primary-btn {
  min-height: 42px;
  padding: 0 22px;
  border: 0;
  border-radius: 999px;
  background: #1d1d1f;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.primary-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.wish-count {
  font-size: 14px;
  font-weight: 600;
  color: #636366;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #86868b;
  font-size: 15px;
}

.wish-table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wish-row {
  padding: 16px 18px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.06);
  border-left: 4px solid transparent;
}

.wish-row.pending {
  border-left-color: #ff9f0a;
}

.wish-row.approved {
  border-left-color: #30d158;
}

.wish-row.rejected {
  border-left-color: #ff453a;
  opacity: 0.55;
}

.wish-author {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.wish-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #ff453a;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 800;
}

.wish-author strong {
  display: block;
  font-size: 14px;
}

.wish-author time {
  font-size: 12px;
  color: #86868b;
}

.wish-content {
  margin: 0 0 10px;
  font-size: 15px;
  line-height: 1.5;
  color: #1d1d1f;
}

.wish-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 5px 12px;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-sm.approve {
  color: #30d158;
  border-color: rgba(48, 209, 88, 0.2);
  background: rgba(48, 209, 88, 0.06);
}

.btn-sm.reject {
  color: #ff453a;
  border-color: rgba(255, 69, 58, 0.2);
  background: rgba(255, 69, 58, 0.06);
}

.btn-sm.danger {
  color: #ff453a;
  border-color: rgba(255, 69, 58, 0.2);
}

.btn-sm.featured {
  color: #ff9f0a;
  border-color: rgba(255, 159, 10, 0.3);
  background: rgba(255, 159, 10, 0.08);
}

.btn-sm:hover {
  transform: translateY(-1px);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 640px) {
  .shell { padding: 24px 16px 60px; }
  .page-header h1 { font-size: 28px; }
  .form-card { padding: 20px; }
}
</style>
