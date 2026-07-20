import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPausableTaskScheduler } from '../../src/utils/pausable-task-scheduler.js'

describe('pausable task scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves remaining delay while paused', () => {
    const callback = vi.fn()
    const scheduler = createPausableTaskScheduler()

    scheduler.schedule(callback, 1000)
    vi.advanceTimersByTime(400)
    scheduler.pause()
    vi.advanceTimersByTime(2000)

    expect(callback).not.toHaveBeenCalled()

    scheduler.resume()
    vi.advanceTimersByTime(599)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledOnce()
  })

  it('clears pending callbacks at the end of a round', () => {
    const callback = vi.fn()
    const scheduler = createPausableTaskScheduler()

    scheduler.schedule(callback, 350)
    scheduler.clear()
    vi.advanceTimersByTime(1000)

    expect(callback).not.toHaveBeenCalled()
    expect(scheduler.size).toBe(0)
  })

  it('can cancel one task without affecting the others', () => {
    const first = vi.fn()
    const second = vi.fn()
    const scheduler = createPausableTaskScheduler()
    const firstTask = scheduler.schedule(first, 200)
    scheduler.schedule(second, 200)

    scheduler.cancel(firstTask)
    vi.advanceTimersByTime(200)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
