<script setup>
/**
 * 作品卡右上角「⋯」菜单（2026-11-05）。
 *
 * 为什么是独立组件：置顶动作原先在两个页面各写一套按钮（ProfileHomePanel 的
 * `.profile-post-pin`、ProfileMain 的 `.pin-post-btn`），一个在卡右上角铺一整块
 * 文字按钮、一个固定在卡内顶部，视觉完全不一致；而且文字按钮压在封面上会挡住图。
 * 现在统一收进「⋯」，两页共用这一份实现。
 *
 * 为什么菜单要 Teleport：作品卡是 `overflow: hidden`（封面圆角需要），
 * 菜单挂在卡内一定会被裁掉；所以挂到 body + fixed 定位，按触发按钮的位置算坐标。
 */
import { nextTick, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
  /** 当前帖子是否已置顶（决定菜单文案：置顶 / 取消置顶） */
  pinned: { type: Boolean, default: false },
  /** 已置顶满额且本条未置顶 ⇒ 菜单项置灰 */
  limitReached: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle', 'edit', 'delete']);

const MENU_WIDTH = 156;
const MENU_HEIGHT = 118;
const EDGE = 8;

const open = ref(false);
const triggerRef = ref(null);
const menuStyle = ref({});

const placeMenu = () => {
  const el = triggerRef.value;
  if (!el || typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const left = Math.min(
    Math.max(EDGE, rect.right - MENU_WIDTH),
    Math.max(EDGE, window.innerWidth - MENU_WIDTH - EDGE),
  );
  const below = rect.bottom + 6;
  const top =
    below + MENU_HEIGHT > window.innerHeight - EDGE
      ? Math.max(EDGE, rect.top - 6 - MENU_HEIGHT)
      : below;
  menuStyle.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` };
};

const close = () => {
  open.value = false;
  unbind();
};

const onKeydown = (event) => {
  if (event.key === 'Escape') close();
};

const bind = () => {
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('keydown', onKeydown);
};

const unbind = () => {
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('resize', close);
  window.removeEventListener('keydown', onKeydown);
};

const toggleMenu = () => {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  nextTick(placeMenu);
  bind();
};

const onAction = () => {
  if (props.limitReached && !props.pinned) return;
  close();
  emit('toggle');
};

/** 编辑 / 删除同样是「点完就关菜单，动作交给宿主页面」——本组件不碰路由与接口。 */
const onEdit = () => {
  close();
  emit('edit');
};

const onDelete = () => {
  close();
  emit('delete');
};

onBeforeUnmount(unbind);
</script>

<template>
  <div class="profile-post-menu">
    <button
      ref="triggerRef"
      type="button"
      class="profile-post-menu-trigger"
      :class="{ 'is-open': open }"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-label="更多操作"
      @click.stop.prevent="toggleMenu"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="19" cy="12" r="1.7" />
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="open" class="profile-post-menu-scrim" @click="close" @pointerdown.stop></div>
      <div
        v-if="open"
        class="profile-post-menu-list"
        role="menu"
        :style="menuStyle"
        @click.stop
        @pointerdown.stop
      >
        <button
          type="button"
          role="menuitem"
          class="profile-post-menu-item"
          :disabled="limitReached && !pinned"
          @click="onAction"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path
              d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.87L12 16.9l-5.25 2.77 1-5.87L3.5 9.66l5.9-.86z"
            />
          </svg>
          <span>{{ pinned ? '取消置顶' : '置顶' }}</span>
          <span v-if="limitReached && !pinned" class="profile-post-menu-hint">已满 3 条</span>
        </button>

        <div class="profile-post-menu-divider" role="separator"></div>

        <button type="button" role="menuitem" class="profile-post-menu-item" @click="onEdit">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z" stroke-linejoin="round" />
            <path d="M13.5 6.5l4 4" stroke-linecap="round" />
          </svg>
          <span>编辑</span>
        </button>

        <button
          type="button"
          role="menuitem"
          class="profile-post-menu-item is-danger"
          @click="onDelete"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path d="M4 7h16" stroke-linecap="round" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke-linejoin="round" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke-linejoin="round" />
            <path d="M10 11v6M14 11v6" stroke-linecap="round" />
          </svg>
          <span>删除</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.profile-post-menu {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}

.profile-post-menu-trigger {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #1d1d1f;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(10px) saturate(1.6);
  -webkit-backdrop-filter: blur(10px) saturate(1.6);
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.profile-post-menu-trigger:hover {
  background: rgba(255, 255, 255, 0.98);
}

.profile-post-menu-trigger:active {
  transform: scale(0.94);
}

.profile-post-menu-trigger svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.profile-post-menu-trigger.is-open {
  background: rgba(15, 23, 42, 0.82);
  color: #ffffff;
}

.profile-post-menu-scrim {
  position: fixed;
  inset: 0;
  z-index: 2147482000;
}

.profile-post-menu-list {
  position: fixed;
  z-index: 2147482001;
  width: 156px;
  padding: 5px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
  animation: profile-post-menu-in 140ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.profile-post-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #1d1d1f;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  text-align: left;
  cursor: pointer;
}

.profile-post-menu-item svg {
  width: 15px;
  height: 15px;
  flex: none;
  color: #6b7280;
}

.profile-post-menu-item:hover:not(:disabled) {
  background: rgba(15, 23, 42, 0.05);
}

.profile-post-menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.profile-post-menu-divider {
  height: 1px;
  margin: 4px 6px;
  background: rgba(15, 23, 42, 0.08);
}

/* 删除是破坏性动作：整项染红，且与上面两项隔一条细线，避免连点误触 */
.profile-post-menu-item.is-danger,
.profile-post-menu-item.is-danger svg {
  color: #d92c20;
}

.profile-post-menu-item.is-danger:hover:not(:disabled) {
  background: rgba(217, 44, 32, 0.08);
}

.profile-post-menu-hint {
  margin-left: auto;
  color: #8a8f98;
  font-size: 11px;
  font-weight: 500;
}

html[data-theme='dark'] .profile-post-menu-trigger {
  background: rgba(28, 28, 30, 0.78);
  color: #f5f5f7;
}

html[data-theme='dark'] .profile-post-menu-trigger:hover {
  background: rgba(44, 44, 46, 0.94);
}

html[data-theme='dark'] .profile-post-menu-trigger.is-open {
  background: rgba(245, 245, 247, 0.92);
  color: #1d1d1f;
}

html[data-theme='dark'] .profile-post-menu-list {
  border-color: rgba(255, 255, 255, 0.1);
  background: #2c2c2e;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

html[data-theme='dark'] .profile-post-menu-item {
  color: #f5f5f7;
}

html[data-theme='dark'] .profile-post-menu-item svg {
  color: #a1a1a6;
}

html[data-theme='dark'] .profile-post-menu-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

html[data-theme='dark'] .profile-post-menu-divider {
  background: rgba(255, 255, 255, 0.1);
}

html[data-theme='dark'] .profile-post-menu-item.is-danger,
html[data-theme='dark'] .profile-post-menu-item.is-danger svg {
  color: #ff6b60;
}

html[data-theme='dark'] .profile-post-menu-item.is-danger:hover:not(:disabled) {
  background: rgba(255, 107, 96, 0.14);
}

html[data-theme='dark'] .profile-post-menu-hint {
  color: #8e8e93;
}

@keyframes profile-post-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-post-menu-list {
    animation: none;
  }
}
</style>
