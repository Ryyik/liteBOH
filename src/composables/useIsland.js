import { computed, reactive, ref, shallowReactive, shallowRef } from 'vue'

/** navbar 监听的通知岛事件名（由 showIsland.notify 派发） */
export const GLOBAL_NAV_STATUS_EVENT = 'boh_global_nav_status'

/**
 * 灵动岛统一调度中心（useIsland）
 *
 * 顶部导航栏的三种岛形态统一从这里调度，任何页面一行调用：
 * - notify()  一次性通知岛（自动消失、可排队）——替代各页面手写的 showGlobalNavStatus 包装
 * - task()    常驻任务岛（进度环 / 操作按钮 / 缩略图堆叠）——发帖、上传、批量操作等
 * - ai()      BOH AI 对话岛（可带种子 prompt）
 * - custom()  自定义岛（任意组件渲染进导航 surface，高度自动上报）
 *
 * 优先级仲裁：AI 岛 > 任务岛 > 通知岛，同一时刻 surface 只展示一张卡。
 * 被高优先级岛占用时自动排队，待其收起后按序恢复展示。
 */

const NAV_HOST_ID = 'unified-nav-container'

const hasNavHost = () =>
  typeof document !== 'undefined' && !!document.getElementById(NAV_HOST_ID)

const clampProgress = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

const normalizeThumbs = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .slice(0, 3)

const normalizeActions = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((a) => a && (a.label || a.id))
    .slice(0, 2)
    .map((a) => ({
      id: String(a.id || a.label),
      label: String(a.label || a.id),
      kind: ['primary', 'danger', 'ghost'].includes(a.kind) ? a.kind : 'ghost'
    }))

// ---------- 任务岛状态（调度中心持有，navbar 只负责渲染） ----------
const buildTaskState = (init = {}) =>
  reactive({
    id: String(init.id || `island-task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    title: String(init.title || '').trim() || '处理中',
    message: String(init.message || ''),
    state: 'running', // running | success | fail
    progress: clampProgress(init.progress),
    tone: String(init.tone || ''), // fail 时的语义色：warning | danger
    thumbs: normalizeThumbs(init.thumbs),
    actions: normalizeActions(init.actions),
    onAction: typeof init.onAction === 'function' ? init.onAction : null,
    visible: false,
    closed: false
  })

const currentTask = shallowRef(null)
const pendingTasks = []
// AI 岛占用标记：必须是响应式的，islandTaskView computed 依赖它触发卡片隐藏/恢复
const aiPaused = ref(false)

// ---------- 自定义岛槽位 ----------
const customSlot = shallowReactive({ key: 0, component: null, props: null })

// ---------- AI 岛 opener（由 UnifiedNavbar 注册，规避路由上下文依赖） ----------
let aiOpener = null

const presentTask = (task) => {
  currentTask.value = task
  task.visible = !aiPaused.value
}

const shiftTaskAfterLeave = () => {
  if (aiPaused.value) return
  const next = pendingTasks.shift() || null
  currentTask.value = next
  if (next) next.visible = true
}

const attachHandle = (task) => {
  let successTimer = null
  const finish = () => {
    if (task.closed) return
    task.closed = true
    if (successTimer) {
      clearTimeout(successTimer)
      successTimer = null
    }
    const queuedIdx = pendingTasks.indexOf(task)
    if (queuedIdx >= 0) {
      pendingTasks.splice(queuedIdx, 1)
      return
    }
    if (currentTask.value === task) {
      if (aiPaused.value || !task.visible) {
        // AI 岛占用中（或尚未展示过）：卡本就不可见，直接让位给队列
        shiftTaskAfterLeave()
      } else {
        task.visible = false // 播放退场动画，由 islandTaskCardLeft() 接续队列
      }
    }
  }
  return {
    id: task.id,
    /** 合并更新任务内容；任务已结束则静默忽略 */
    update(patch = {}) {
      if (task.closed) return this
      if (patch.title != null) task.title = String(patch.title).trim() || task.title
      if (patch.message != null) task.message = String(patch.message)
      if (patch.progress != null) task.progress = clampProgress(patch.progress)
      if (patch.tone != null) task.tone = String(patch.tone)
      if (patch.thumbs != null) task.thumbs = normalizeThumbs(patch.thumbs)
      if (patch.actions != null) task.actions = normalizeActions(patch.actions)
      if (patch.onAction != null) task.onAction = typeof patch.onAction === 'function' ? patch.onAction : null
      return this
    },
    /** 快捷更新进度（0-100），可附带新文案 */
    progress(pct, message) {
      return this.update({ progress: pct, ...(message != null ? { message } : {}) })
    },
    /** 标记成功：进度环满格变绿，停留 durationMs 后自动收起（600-8000ms，默认 1800） */
    success(opts = {}) {
      if (task.closed) return this
      task.state = 'success'
      task.progress = 100
      task.actions = []
      task.tone = ''
      if (opts.title != null) task.title = String(opts.title).trim() || task.title
      if (opts.message != null) task.message = String(opts.message)
      const ms = Math.min(Math.max(Number(opts.durationMs) || 1800, 600), 8000)
      if (successTimer) clearTimeout(successTimer)
      successTimer = setTimeout(finish, ms)
      return this
    },
    /** 标记失败：转为常驻态，可带最多 2 个操作按钮；tone: 'warning' | 'danger' */
    fail(opts = {}) {
      if (task.closed) return this
      if (successTimer) {
        clearTimeout(successTimer)
        successTimer = null
      }
      task.state = 'fail'
      task.tone = String(opts.tone || 'danger')
      if (opts.title != null) task.title = String(opts.title).trim() || task.title
      if (opts.message != null) task.message = String(opts.message)
      task.actions = normalizeActions(opts.actions)
      return this
    },
    /** 手动收起（失败态恢复 / 提前结束） */
    close: finish
  }
}

/**
 * 统一灵动岛 API（模块级单例，无需在 setup 中调用）
 */
export const showIsland = {
  /**
   * 一次性通知岛。
   * @returns {boolean} navbar 存在且已派发返回 true；否则触发 payload.fallback（如有）并返回 false
   */
  notify(payload = {}) {
    if (!hasNavHost()) {
      if (typeof payload.fallback === 'function') payload.fallback(payload)
      return false
    }
    window.dispatchEvent(new CustomEvent(GLOBAL_NAV_STATUS_EVENT, { detail: payload }))
    return true
  },

  /**
   * 常驻任务岛。重复调用相同业务时各自独立；同一时刻只展示一张任务卡，其余排队。
   * @returns {{ id, update, progress, success, fail, close }}
   */
  task(init = {}) {
    const task = buildTaskState(init)
    if (currentTask.value && !currentTask.value.closed && (currentTask.value.visible || aiPaused.value)) {
      // 已有任务在展示（或被 AI 岛暂停隐藏）：排队，保持先进先出
      pendingTasks.push(task)
    } else {
      presentTask(task)
    }
    return attachHandle(task)
  },

  /**
   * 打开 BOH AI 对话岛，可带种子 prompt。
   * @returns {boolean} 成功交给 AI 岛返回 true；opener 未注册或当前路由不可开返回 false（调用方可自行降级，如跳 /ai-chat）
   */
  ai(options = {}) {
    if (typeof aiOpener !== 'function') return false
    return aiOpener(options) === true
  },

  /**
   * 自定义岛：把任意组件渲染进导航 surface（绝对定位于状态卡同位，高度自动上报）。
   * @returns {{ update, close } | null}
   */
  custom(component, props = {}) {
    if (!component) return null
    customSlot.key += 1
    customSlot.component = component
    customSlot.props = props || {}
    const self = {
      update(patch = {}) {
        if (customSlot.component !== component) return self
        customSlot.props = { ...customSlot.props, ...patch }
        return self
      },
      close() {
        if (customSlot.component !== component) return
        customSlot.component = null
        customSlot.props = null
      }
    }
    return self
  }
}

/** UnifiedNavbar 挂载时注册 AI 岛 opener；卸载时传 null 注销。 */
export const registerIslandAiOpener = (fn) => {
  aiOpener = typeof fn === 'function' ? fn : null
}

/** AI 岛开/关时由 navbar 调用：占用期间任务卡隐藏并暂停队列。 */
export const setIslandAiPaused = (paused) => {
  aiPaused.value = Boolean(paused)
  if (!aiPaused.value) {
    const task = currentTask.value
    if (!task) return
    if (task.closed) {
      // 暂停期间已结束：让位给队列中的下一个
      shiftTaskAfterLeave()
    } else if (!task.visible) {
      task.visible = true
    }
  }
}

/** 任务卡退场动画结束后的接续（由 navbar 的 after-leave 回调触发）。 */
export const islandTaskCardLeft = () => {
  const task = currentTask.value
  if (!task || task.visible) return
  if (task.closed) shiftTaskAfterLeave()
}

/** 任务卡操作按钮点击（由 navbar 转发）。 */
export const islandTaskAction = (actionId) => {
  const task = currentTask.value
  if (!task || task.closed) return
  task.onAction?.(String(actionId), task.id)
}

/** navbar 渲染任务卡使用的视图（AI 岛占用或任务不可见时为 null）。 */
export const islandTaskView = computed(() => {
  const task = currentTask.value
  if (!task || task.closed || !task.visible || aiPaused.value) return null
  return task
})

/** navbar 渲染自定义岛使用的槽位。 */
export const islandCustomSlot = customSlot
