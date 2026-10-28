<template>
  <div class="ep-shell" :class="{ 'is-inline': inline }">
    <!-- 独立页形态（历史入口，如某些深链）：整页页头 + 保存 -->
    <UserCenterPageHeader
      v-if="!inline"
      title="个人信息"
      back-label="返回"
      max-width="1200px"
      @back="$emit('close')"
    >
      <!-- 保存收进页头（2026-10-26）：Apple 的个人信息页没有底部大按钮，
           主操作就一个「完成 / 保存」落在标题栏右侧。底栏原先那对
           取消 / 保存资料按钮一并撤掉 —— 取消等于返回，用返回键即可。 -->
      <template #actions>
        <button
          type="button"
          class="ep-save"
          :disabled="isSubmittingProfileEdit"
          @click="$emit('save')"
        >
          {{ isSubmittingProfileEdit ? '保存中…' : '保存' }}
        </button>
      </template>
    </UserCenterPageHeader>

    <!-- 内联形态（2026-10-26）：设置页两栏时，个人信息在**右栏内就地展开** ——
         左目录不动，切到别的分类即离开。Apple 的 macOS 系统设置正是这样：
         右边换内容，左边始终在。 -->
    <div v-else class="ep-inline-head">
      <button type="button" class="ep-back" @click="$emit('close')">
        <ChevronLeft :size="15" :stroke-width="2.4" aria-hidden="true" />
        <span>返回</span>
      </button>
      <span class="ep-inline-title">个人信息</span>
      <button
        type="button"
        class="ep-save"
        :disabled="isSubmittingProfileEdit"
        @click="$emit('save')"
      >
        {{ isSubmittingProfileEdit ? '保存中…' : '保存' }}
      </button>
    </div>

    <div class="ep-body">
      <!-- 头像：Apple 的个人信息页第一行就是「照片」（右侧缩略图 + ›），
           这里再加一行「头像框」——它是本站特有的装扮，跟头像同源。 -->
      <section class="ep-group">
        <div class="gs-rows">
          <button type="button" class="gs-row" @click="$emit('avatar-click')">
            <span class="gs-text">
              <span class="gs-label">头像</span>
              <span class="gs-desc">点击更换照片，支持裁剪</span>
            </span>
            <span class="gs-side">
              <FramedAvatar
                :src="avatarUrl"
                :initial="initial"
                :size="36"
                :frame-url="frameUrl"
                :frame-scale="frameScale"
              />
              <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
          </button>
          <button type="button" class="gs-row" @click="$emit('open-avatar-frames')">
            <span class="gs-text">
              <span class="gs-label">头像框</span>
              <span class="gs-desc">试戴并佩戴装扮框</span>
            </span>
            <span class="gs-side">
              <span class="gs-value">{{ frameName }}</span>
              <ChevronRight class="gs-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
            </span>
          </button>
        </div>
      </section>

      <!-- 姓名 / 签名 -->
      <section class="ep-group">
        <div class="gs-rows">
          <label class="gs-row ep-row-field">
            <span class="gs-label ep-label">昵称</span>
            <input
              class="ep-input"
              type="text"
              maxlength="20"
              autocomplete="nickname"
              enterkeyhint="done"
              placeholder="最多 20 个字符"
              :value="username"
              @input="$emit('update-username', $event.target.value)"
            />
          </label>
          <label class="gs-row ep-row-stacked">
            <span class="ep-label-row">
              <span class="gs-label ep-label">个人简介</span>
              <span class="ep-counter">{{ String(bio || '').length }}/160</span>
            </span>
            <textarea
              ref="bioRef"
              class="ep-textarea"
              rows="2"
              maxlength="160"
              placeholder="写一句介绍自己或当前状态的话"
              :value="bio"
              @input="$emit('update-bio', $event.target.value)"
            ></textarea>
          </label>
        </div>
      </section>

      <!-- 日期：右对齐的原生下拉（Apple 用步进器，我们用 select —— 移动端可原生长按滚轮） -->
      <section class="ep-group">
        <div class="gs-rows">
          <div class="gs-row ep-row-field">
            <span class="gs-label ep-label">出生日期</span>
            <span class="gs-side ep-dates">
              <select
                class="ep-select"
                aria-label="出生月份"
                :value="birthMonth"
                @change="$emit('update-birth-month', $event.target.value)"
              >
                <option value="">月份</option>
                <option v-for="m in months" :key="`ep-birth-month-${m}`" :value="m">
                  {{ m }}月
                </option>
              </select>
              <select
                class="ep-select"
                aria-label="出生日期（日）"
                :value="birthDay"
                @change="$emit('update-birth-day', $event.target.value)"
              >
                <option value="">日</option>
                <option v-for="d in daysForEditProfile" :key="`ep-birth-day-${d}`" :value="d">
                  {{ d }}日
                </option>
              </select>
            </span>
          </div>
          <div class="gs-row ep-row-field">
            <span class="gs-label ep-label">入群时间</span>
            <span class="gs-side ep-dates">
              <select
                class="ep-select"
                aria-label="入群年份"
                :value="joinYear"
                @change="$emit('update-join-year', $event.target.value)"
              >
                <option value="">年</option>
                <option v-for="year in joinDateYears" :key="`ep-join-year-${year}`" :value="year">
                  {{ year }}年
                </option>
              </select>
              <select
                class="ep-select"
                aria-label="入群月份"
                :value="joinMonth"
                @change="$emit('update-join-month', $event.target.value)"
              >
                <option value="">月</option>
                <option v-for="m in months" :key="`ep-join-month-${m}`" :value="m">
                  {{ m }}月
                </option>
              </select>
              <select
                class="ep-select"
                aria-label="入群日期（日）"
                :value="joinDay"
                @change="$emit('update-join-day', $event.target.value)"
              >
                <option value="">日</option>
                <option v-for="d in daysForEditJoinDate" :key="`ep-join-day-${d}`" :value="d">
                  {{ d }}日
                </option>
              </select>
            </span>
          </div>
        </div>
      </section>

      <p class="ep-hint">昵称与简介会立即显示在你的主页；入群时间与生日用于个人资料展示。</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import UserCenterPageHeader from '@/components/UserCenterPageHeader.vue';
import FramedAvatar from './FramedAvatar.vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { useAvatarFrame } from '@/composables/useAvatarFrame.js';
import { useAutoGrowTextarea } from '@/composables/useAutoGrowTextarea.js';

const props = defineProps({
  avatarUrl: { type: String, default: '' },
  username: { type: String, default: '' },
  bio: { type: String, default: '' },
  joinYear: { type: [String, Number], default: '' },
  joinMonth: { type: [String, Number], default: '' },
  joinDay: { type: [String, Number], default: '' },
  birthMonth: { type: [String, Number], default: '' },
  birthDay: { type: [String, Number], default: '' },
  joinDateYears: { type: Array, default: () => [] },
  months: { type: Array, default: () => [] },
  daysForEditJoinDate: { type: Array, default: () => [] },
  daysForEditProfile: { type: Array, default: () => [] },
  isSubmittingProfileEdit: { type: Boolean, default: false },
  /** true = 在设置页右栏里就地展开（无整页页头、无顶部导航偏移） */
  inline: { type: Boolean, default: false },
});

defineEmits([
  'close',
  'avatar-click',
  'open-avatar-frames',
  'save',
  'update-username',
  'update-bio',
  'update-join-year',
  'update-join-month',
  'update-join-day',
  'update-birth-month',
  'update-birth-day',
]);

// 头像框与「账户」页共用 useAvatarFrame 单例：弹层里换完框，这行的缩略图即时变
const { effectiveFrame } = useAvatarFrame();
const frameUrl = computed(() => effectiveFrame.value?.url || '');
const frameScale = computed(() => effectiveFrame.value?.scale || 0);
const frameName = computed(() => effectiveFrame.value?.name || '无框');
const initial = computed(() =>
  String(props.username || 'U')
    .charAt(0)
    .toUpperCase(),
);

/* 简介多行自动增高：全站唯一实现，上限写在 CSS 的 max-height（JS 不写第二份像素值）。
   composable 内部已经 watch 受控 value —— 父组件改写内容（清空 / 回填）时同样重算，
   这里不再补第二份 watch（重复调度只会白跑一次测量）。 */
const { textareaRef: bioRef } = useAutoGrowTextarea({
  value: () => props.bio,
});
</script>

<style scoped>
@import '../styles/settings-glass.css';

/* 顶部不补导航偏移：本页是「全屏式」子页，宿主的全局导航岛在这条路径上整个不渲染
   （实测 #unified-nav-container 不存在），补 78px 只会白留一道空档。
   与改造前 `.profile-edit-page-shell { padding-top: 0 }` 同一口径。 */
.ep-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 40px;
  animation: ep-in 240ms var(--ease-out) both;
}

@keyframes ep-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.ep-body {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* ---------- 内联形态：在设置页右栏就地展开 ---------- */
.ep-shell.is-inline {
  gap: 12px;
  padding-bottom: 0;
  animation: ep-inline-in 200ms var(--ease-out) both;
}

@keyframes ep-inline-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 右栏没有独立页头，就地给一条「‹ 返回　个人信息　　保存」工具行 */
.ep-inline-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.ep-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 0 12px 0 6px;
  border: 1px solid var(--liquid-border);
  border-radius: 999px;
  background: var(--liquid-bg-strong);
  color: var(--liquid-text-secondary, #6e6e73);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.ep-back:hover {
  color: var(--liquid-text-primary, #1d1d1f);
}

.ep-inline-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 700;
  color: var(--liquid-text-primary, #1d1d1f);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 页头右侧的保存按钮（2026-10-27 用户反馈「不明显不清晰」）：
   原来是**无底纯蓝字**（Apple 的「完成」位），落在白色页头上与一行普通链接没有区别，
   而它其实是这一页唯一能落地的动作 —— 用户不知道点哪保存。
   现在改成实心蓝药丸（白字 + 999 圆角 + hover 加深/danger 态禁用）。
   ⚠️ 宽度必须算着写：页头是 `grid-template-columns: 52px 1fr 52px`，
   actions 列只有 52px，药丸一超就把「保存」压成两行（2026-10-26 已踩过一次）。
   13px 下「保存」≈ 26px + 左右各 10px 内边距 = 46px，留在 52px 以内。 */
.ep-save {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #0071e3;
  color: #ffffff;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 71, 143, 0.24);
  transition:
    background-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms var(--ease-out, ease-out),
    opacity 150ms ease;
}

.ep-save:hover:not(:disabled) {
  background: #0077ed;
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.32);
}

.ep-save:active:not(:disabled) {
  transform: scale(0.97);
}

.ep-save:focus-visible {
  outline: 2px solid #0071e3;
  outline-offset: 2px;
}

.ep-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

/* 内联形态（设置页右栏）宽度富余，药丸可以给足内边距 —— 它是这一栏的主操作。 */
.ep-shell.is-inline .ep-save {
  height: 34px;
  padding: 0 16px;
  font-size: 13.5px;
  font-weight: 700;
}

/* 竖屏：设置页的内容层是全宽（无左右内边距，行分割线一路铺到屏幕边），
   工具行若不加内边距，实心「保存」药丸会**贴着屏幕右缘**画出去（实测 right=390）。
   给它和下面各行同样的 16px，返回/标题/保存三者才在同一条竖线上。 */
@media (max-width: 767px) {
  .ep-inline-head {
    padding: 0 16px;
  }
}

/* 暗色：实心蓝在深底上偏暗，整支提亮一档。
   ⚠️ 这里**刻意不写第二个亮蓝 hex**：用 filter 提亮同一个 #0071e3，
   暗色块里因此不新增任何颜色字面量 —— check:dark-tokens 的棘轮只降不升
   （实测写 `background:#0a84ff` 会让总数 2465 → 2466，门禁虽为观察模式不判红，
   但那条记账会一直挂着，且「上调基线」= 凭空造余量，明令禁止）。 */
html[data-theme='dark'] .ep-save {
  filter: brightness(1.2) saturate(1.06);
  box-shadow: none;
}

html[data-theme='dark'] .ep-save:hover:not(:disabled) {
  filter: brightness(1.34) saturate(1.06);
}

html[data-theme='dark'] .ep-save:focus-visible {
  outline-color: var(--liquid-text-primary);
}

/* ---------- 行内控件 ---------- */
/* 输入行：标签在左、控件吃满剩余宽度并右对齐（macOS 系统设置的行内编辑） */
.ep-row-field {
  cursor: text;
}

.ep-label {
  flex: 0 0 auto;
}

/* 输入类行：标签吃满剩余宽度，控件才被推到最右（否则「出生日期」后面的两个下拉
   会贴着标签排，右侧留一大片空 —— 2026-10-26 实测） */
.ep-row-field .ep-label {
  flex: 1 1 auto;
  min-width: 0;
}

.ep-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.4;
  text-align: right;
  outline: none;
}

.ep-input::placeholder {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* 聚焦时给一条底色而不是描边：整行是卡片的一部分，描边会把行切断 */
.ep-row-field:focus-within {
  background: var(--liquid-bg-nested);
}

/* 简介行：上下结构（标签行 + 多行框），不能沿用 .gs-row 的居中横排 */
.ep-row-stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  cursor: text;
}

.ep-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.ep-counter {
  font-size: 12px;
  font-weight: 500;
  color: var(--liquid-text-tertiary, #8b9098);
  font-variant-numeric: tabular-nums;
}

.ep-textarea {
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--liquid-border-hairline, rgba(15, 23, 42, 0.08));
  border-radius: 10px;
  background: var(--liquid-bg-nested);
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.5;
  /* 高度由 useAutoGrowTextarea 写；上限只在这里声明 */
  max-height: 148px;
  resize: none;
  outline: none;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background-color 150ms ease;
}

.ep-textarea:focus {
  background: var(--liquid-bg-strong);
  border-color: rgba(0, 113, 227, 0.55);
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.12);
}

.ep-textarea::placeholder {
  color: var(--liquid-text-tertiary, #8b9098);
}

/* 日期行：右对齐的一组原生下拉。去掉默认外观只留自绘箭头，
   否则每个 select 自带一个按钮框，三个挨在一起像三个小方块 */
.ep-dates {
  gap: 2px;
  flex-wrap: nowrap;
}

.ep-select {
  max-width: 96px;
  padding: 6px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--liquid-text-primary, #1d1d1f);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.4;
  text-align: right;
  text-align-last: right;
  cursor: pointer;
  outline: none;
}

.ep-select option {
  color: #1d1d1f;
  background: #fff;
}

.ep-select:hover {
  background: var(--liquid-bg-nested);
}

.ep-select:focus-visible {
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.22);
}

.ep-hint {
  margin: -6px 4px 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--liquid-text-tertiary, #8b9098);
}

/* ---------- 暗色 ---------- */
/* ⚠️ `.ep-save` 的暗色档统一写在上方按钮本体那一块（实心亮蓝 + 白字）。
   这里原先还有一条 `[data-theme='dark'] .ep-save { background: rgba(41,151,255,.16);
   color: #2997ff }`（半透明底 + 蓝字的「暗色链接」形态），本次改用实心药丸后
   它会把白字压成蓝字 ⇒ 已删除，别再补回来。 */

[data-theme='dark'] .ep-textarea:focus {
  border-color: rgba(41, 151, 255, 0.6);
  box-shadow: 0 0 0 4px rgba(41, 151, 255, 0.14);
}

[data-theme='dark'] .ep-select option {
  color: #f4f6f8;
  background: #1b1d22;
}

/* ---------- 竖屏 ---------- */
@media (max-width: 767px) {
  .ep-shell {
    gap: 14px;
  }

  .ep-body {
    gap: 14px;
  }

  /* 竖屏三档日期挤在一行会压到 60px 以下，允许换行 */
  .ep-dates {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .ep-select {
    max-width: 84px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ep-shell {
    animation-duration: 1ms;
  }
}
</style>
