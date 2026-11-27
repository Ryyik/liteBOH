<script setup>
/**
 * ReplyIdentityRow — 评论/回复身份行唯一真源（plans/051 §2.1-1）。
 *
 * 收敛前它有三份手写实现：PostCard 内联回复、CommentThread（详情线程）、
 * 详情侧栏 —— 各自维护头像框佩戴 / tier 昵称色 / 封禁 pill / 「回复 ▸ @目标」。
 * 收敛后只此一份。语义红线：
 *   · 「回复 @目标」的显隐必须走 utils/forum-helpers.js 的 shouldShowReplyTarget
 *     （顶层回复不 @ 自己）—— 别在本组件重新发明折叠规则；
 *   · 头像框走 resolveFrameForAuthor（官方卡不渲染，由父级不传 avatarFrameUrl 即可）；
 *   · 头像尺寸三档：lg 40（帖子作者）/ md 28（评论）/ sm 20（子回复），别加第四档。
 *
 * ⚠️ 测试环境是 node（无 jsdom），本组件的行为由 tests/unit/forum-minimal-components.test.js
 *    的源码守卫锁（import 来源断言），改契约前先看那组断言。
 */
import { computed } from 'vue';
import { resolveFrameForAuthor } from '@/composables/useAvatarFrame.js';
import { shouldShowReplyTarget } from '@/utils/forum-helpers.js';

const props = defineProps({
  username: { type: String, default: '' },
  /** 已按档位解析过的头像 URL（官方卡/favicon 等特例由父级决定） */
  avatarUrl: { type: String, default: '' },
  /** 原始头像框 URL（组件内部统一走 resolveFrameForAuthor，不要求父级解析） */
  avatarFrameUrl: { type: String, default: '' },
  authorId: { type: [String, Number], default: '' },
  banned: { type: Boolean, default: false },
  /** 已格式化的时间串（formatSmartTime 真源在父级，避免组件重复引工具） */
  time: { type: String, default: '' },
  /** 被回复人用户名（无则不渲染 ▸ 段） */
  replyTo: { type: String, default: '' },
  /** 帖子根作者用户名 —— shouldShowReplyTarget 的第二参（顶层回复不 @ 自己） */
  rootAuthor: { type: String, default: '' },
  /** tier 昵称色 class（nickname-gold / nickname-rainbow，真源 useTierMap） */
  tierClass: { type: String, default: '' },
  /** 尺寸档：lg=40 帖子作者 / md=28 评论 / sm=20 子回复 */
  size: { type: String, default: 'md', validator: (v) => ['lg', 'md', 'sm'].includes(v) },
  /** 昵称是否可点进主页（官方卡等场景父级传 false） */
  profileClickable: { type: Boolean, default: true },
  /** 身份徽标文本（如「楼主」；空串不渲染） */
  badge: { type: String, default: '' },
});

const emit = defineEmits(['go-to-profile']);

const frame = computed(() => {
  if (!props.avatarFrameUrl) return null;
  return resolveFrameForAuthor(props.avatarFrameUrl, props.authorId);
});

const showReplyTo = computed(() => shouldShowReplyTarget(props.replyTo, props.rootAuthor));

const onNameClick = () => {
  if (!props.profileClickable || !props.username) return;
  emit('go-to-profile', props.username);
};
</script>

<template>
  <div class="identity-row" :class="`is-${size}`">
    <span class="boh-avatar-wrap">
      <span class="identity-avatar">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="username ? `${username} 的头像` : '用户头像'"
          class="identity-avatar-img"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
        />
        <span v-else class="identity-avatar-fallback">{{
          username ? username.charAt(0).toUpperCase() : 'U'
        }}</span>
      </span>
      <span
        v-if="frame"
        class="boh-avatar-frame"
        :style="{
          '--boh-avatar-frame-url': `url(${frame.url})`,
          '--boh-avatar-frame-scale': String(frame.scale),
        }"
        aria-hidden="true"
      ></span>
    </span>
    <span class="identity-line">
      <span
        class="identity-name"
        :class="[tierClass, { 'is-clickable': profileClickable && username }]"
        @click.stop="onNameClick"
        >{{ username || '方块之家' }}</span
      >
      <span v-if="banned" class="identity-banned" title="该账号已被封禁">已封禁</span>
      <span v-if="badge" class="identity-badge">{{ badge }}</span>
      <span v-if="showReplyTo" class="identity-reply-arrow" aria-hidden="true">▸</span>
      <span v-if="showReplyTo" class="identity-reply-target">@{{ replyTo }}</span>
      <span v-if="time" class="identity-time">· {{ time }}</span>
    </span>
  </div>
</template>

<style scoped>
.identity-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.identity-row.is-lg {
  --identity-avatar: var(--appl-avatar-lg);
}
.identity-row.is-md {
  --identity-avatar: var(--appl-avatar-md);
}
.identity-row.is-sm {
  --identity-avatar: var(--appl-avatar-sm);
}

.boh-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
}

.identity-avatar {
  width: var(--identity-avatar);
  height: var(--identity-avatar);
  border-radius: 50%;
  background: var(--appl-subtle);
  color: var(--appl-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: calc(var(--identity-avatar) * 0.42);
  overflow: hidden;
  flex-shrink: 0;
}

.identity-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.identity-line {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.3;
  color: var(--appl-text-3);
}

.is-lg .identity-line {
  font-size: 14px;
}

.identity-name {
  font-weight: 600;
  color: var(--appl-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.identity-name.is-clickable {
  cursor: pointer;
}

.identity-banned {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--appl-red);
  border: 1px solid var(--appl-red);
  border-radius: 5px;
  padding: 0 4px;
  line-height: 1.5;
}

.identity-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--appl-blue);
  background: color-mix(in srgb, var(--appl-blue) 8%, transparent);
  border-radius: 5px;
  padding: 1px 5px;
  line-height: 1.5;
}

.identity-reply-arrow {
  color: var(--appl-text-4);
  flex-shrink: 0;
}

.identity-reply-target {
  color: var(--appl-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.identity-time {
  white-space: nowrap;
  color: var(--appl-text-4);
}
</style>
