export function createPausableTaskScheduler({
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
  now = () => Date.now()
} = {}) {
  const tasks = new Set()
  let paused = false

  function arm(task) {
    task.startedAt = now()
    task.timer = setTimeoutFn(() => {
      tasks.delete(task)
      task.timer = null
      task.callback()
    }, task.remaining)
  }

  function schedule(callback, delay) {
    const task = {
      callback,
      remaining: Math.max(0, delay),
      startedAt: now(),
      timer: null
    }
    tasks.add(task)
    if (!paused) arm(task)
    return task
  }

  function cancel(task) {
    if (!task || !tasks.has(task)) return
    if (task.timer != null) clearTimeoutFn(task.timer)
    tasks.delete(task)
    task.timer = null
  }

  function pause() {
    if (paused) return
    paused = true
    const pausedAt = now()
    tasks.forEach((task) => {
      if (task.timer == null) return
      clearTimeoutFn(task.timer)
      task.timer = null
      task.remaining = Math.max(0, task.remaining - (pausedAt - task.startedAt))
    })
  }

  function resume() {
    if (!paused) return
    paused = false
    tasks.forEach(arm)
  }

  function clear() {
    tasks.forEach((task) => {
      if (task.timer != null) clearTimeoutFn(task.timer)
    })
    tasks.clear()
  }

  return {
    schedule,
    cancel,
    pause,
    resume,
    clear,
    get paused() { return paused },
    get size() { return tasks.size }
  }
}
