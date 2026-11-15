<script setup>
/**
 * MyAlbumBook.vue — 我的影集（一人一本）
 *
 * 形态（2026-11-15 定稿）：**一个用户就一本影集**。
 *   · 不建「书」表、不加 album_book_id：这本 = `该 author_id 的全部影集帖按时间倒序`；
 *   · 所以「本内帖数无上限」是天然成立的，也没有书位配额/换架交互；
 *   · 数据仍是一条条普通帖子（A 投影），零复制、零漂移。
 *
 * 与 `/albums`（社区影集分区）的区别只是过滤条件不同：
 *   这里固定 author = 自己；社区那边读全部 is_album 的帖子。
 *
 * 点开复用 AlbumReader（同一份 post，不发新请求）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { BookOpen, Loader2 } from 'lucide-vue-next';
import { supabase } from '@/utils/supabase-client.js';
import { getUserPosts, getAlbumBook, toggleLike } from '@/utils/api/forum-api.js';
import AlbumPostCard from './AlbumPostCard.vue';
import AlbumReader from './AlbumReader.vue';

const props = defineProps({
  /** 不传则读当前登录用户；传了就读那位用户的影集（个人主页看别人时用） */
  authorId: { type: String, default: '' },
});

const currentUserId = ref('');
const posts = ref([]);
const loading = ref(true);
const errorText = ref('');
const activePost = ref(null);
/** 影集本体（一人一本）：名称 + 简介存在 profiles，只在这里回显，不由帖子推导。 */
const bookTitle = ref('');
const bookIntro = ref('');

const authorName = computed(() => {
  const first = posts.value[0];
  return String(first?.author_username || first?.author?.username || '').trim();
});
/** 全书照片总数（「篇」按帖子数算，照片才是 album_entries 的长度）。 */
const totalPhotos = computed(() =>
  posts.value.reduce((sum, post) => {
    const list = post?.album_entries;
    return sum + (Array.isArray(list) ? list.length : 0);
  }, 0),
);

async function resolveUserId() {
  if (props.authorId) return props.authorId;
  const { data } = await supabase.auth.getUser();
  currentUserId.value = data?.user?.id || '';
  return currentUserId.value;
}

async function load() {
  loading.value = true;
  errorText.value = '';
  try {
    const targetId = await resolveUserId();
    if (!targetId) {
      posts.value = [];
      return;
    }
    const result = await getUserPosts(targetId, currentUserId.value || null, {
      page: 1,
      pageSize: 30,
      albumOnly: true,
    });
    if (result?.error) {
      errorText.value = '影集载入失败，请稍后重试';
      posts.value = [];
      return;
    }
    posts.value = Array.isArray(result?.data) ? result.data : [];
    // 本子的名字与简介：初次创建时写进 profiles，这里只读
    const book = await getAlbumBook(targetId);
    if (book.ok && book.data) {
      bookTitle.value = book.data.title;
      bookIntro.value = book.data.intro;
    }
  } catch (_error) {
    errorText.value = '影集载入失败，请稍后重试';
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

async function handleLike(post) {
  if (!currentUserId.value || !post?.id) return;
  const prevLiked = Boolean(post.isLiked);
  const prevCount = Number(post.like_count || 0);
  post.isLiked = !prevLiked;
  post.like_count = prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
  const { error } = await toggleLike(post.id, currentUserId.value);
  if (error) {
    post.isLiked = prevLiked;
    post.like_count = prevCount;
  }
}

onMounted(load);
watch(() => props.authorId, load);
</script>

<template>
  <div class="my-album">
    <header class="my-album-head">
      <h2 class="my-album-title">
        <template v-if="bookTitle">{{ bookTitle }}</template>
        <template v-else>{{
          props.authorId ? `${authorName || 'TA'}的影集` : '我的影集'
        }}</template>
      </h2>
      <p v-if="bookIntro" class="my-album-intro">{{ bookIntro }}</p>
      <p class="my-album-sub">
        <template v-if="posts.length">
          共 {{ posts.length }} 篇 · {{ totalPhotos }} 张照片
        </template>
        <template v-else>一人一本 · 发过的影集帖都会收在这里</template>
      </p>
    </header>

    <div v-if="loading" class="my-album-state">
      <Loader2 :size="16" class="spin" aria-hidden="true" />
      <span>正在翻开…</span>
    </div>

    <div v-else-if="errorText" class="my-album-state">{{ errorText }}</div>

    <div v-else-if="!posts.length" class="my-album-empty">
      <BookOpen :size="26" aria-hidden="true" />
      <p class="my-album-empty-title">这一本还是空的</p>
      <p class="my-album-empty-sub">
        第一次发影集帖时给它起个名字，之后每次发都只写配文 + 图，会自动收进这一本。
      </p>
    </div>

    <div v-else class="my-album-list">
      <AlbumPostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        :is-logged-in="Boolean(currentUserId)"
        @open="activePost = $event"
        @like="handleLike"
      />
    </div>

    <AlbumReader
      v-if="activePost"
      :post="activePost"
      :is-logged-in="Boolean(currentUserId)"
      @close="activePost = null"
      @like="handleLike"
    />
  </div>
</template>

<style scoped>
.my-album {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.my-album-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 2px 0;
}

.my-album-title {
  margin: 0;
  font-family: var(--serif, 'Songti SC', 'Noto Serif SC', serif);
  font-size: 22px;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: var(--liquid-text-primary, #1d1d1f);
}

.my-album-intro {
  margin: 0;
  font-family: var(--serif, 'Songti SC', 'Noto Serif SC', serif);
  font-size: 13.5px;
  line-height: 1.9;
  letter-spacing: 0.02em;
  color: var(--liquid-text-secondary, #6b6b70);
}

.my-album-sub {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--liquid-text-secondary, #6e6e73);
}

.my-album-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 22px;
}

/* 横屏给两列：影集卡是竖长的，一列会留下大片空白 */
@media (min-width: 1024px) {
  .my-album-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 26px;
  }
}

.my-album-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 22px 4px;
  font-size: 13px;
  color: var(--liquid-text-secondary, #6e6e73);
}

.spin {
  animation: my-album-spin 1s linear infinite;
}

@keyframes my-album-spin {
  to {
    transform: rotate(360deg);
  }
}

.my-album-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 52px 20px 60px;
  text-align: center;
  color: var(--liquid-text-tertiary, #8e8e93);
}

.my-album-empty-title {
  margin: 6px 0 0;
  font-family: var(--serif, 'Songti SC', 'Noto Serif SC', serif);
  font-size: 16px;
  letter-spacing: 0.08em;
  color: var(--liquid-text-secondary, #6e6e73);
}

.my-album-empty-sub {
  margin: 0;
  max-width: 24em;
  font-size: 12.5px;
  line-height: 1.9;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
