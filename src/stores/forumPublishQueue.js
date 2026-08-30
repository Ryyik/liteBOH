import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useForumPublishQueueStore = defineStore('forumPublishQueue', () => {
  const items = ref([])

  const activeItem = computed(() => {
    if (!items.value.length) return null
    return items.value.find(i => ['queued','uploading','publishing'].includes(i.state))
        || items.value.find(i => i.state==='failed')
        || items.value[0]
  })

  const hasActive = computed(() => items.value.some(i => ['queued','uploading','publishing','failed'].includes(i.state)))

  const enqueue = (payload) => {
    // payload: { id, title, body, tag, location, images, authorId, authorUsername, authorAvatarUrl, submissionId, fingerprint, failedImageIndex? }
    const item = {
      id: payload.id,
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      location: payload.location || null,
      images: Array.isArray(payload.images) ? payload.images : [],
      authorId: payload.authorId,
      authorUsername: payload.authorUsername,
      authorAvatarUrl: String(payload.authorAvatarUrl || '').trim(),
      submissionId: payload.submissionId || '',
      fingerprint: payload.fingerprint || '',
      progress: 0,
      state: 'queued', // queued | uploading | publishing | success | failed
      failType: null, // null | 'network' | 'moderation'
      failedImageIndex: null,
      failedImageId: null,
      errorMessage: '',
      createdAt: Date.now(),
      retryCount: 0
    }
    items.value.unshift(item)
    return item
  }

  const updateItem = (id, patch) => {
    const idx = items.value.findIndex(i => i.id===id)
    if (idx<0) return
    items.value[idx] = { ...items.value[idx], ...patch }
  }

  const removeItem = (id) => {
    items.value = items.value.filter(i=>i.id!==id)
  }

  const setProgress = (id, progress) => {
    const v = Math.max(0, Math.min(100, Number(progress||0)))
    updateItem(id, { progress: v })
  }

  const setState = (id, state, extra={}) => updateItem(id, { state, ...extra })

  const incrementRetry = (id) => {
    const idx = items.value.findIndex(i=>i.id===id)
    if (idx>=0) items.value[idx].retryCount = (items.value[idx].retryCount||0)+1
  }

  const clearSucceeded = () => {
    items.value = items.value.filter(i=> i.state!=='success')
  }

  return {
    items,
    activeItem,
    hasActive,
    enqueue,
    updateItem,
    removeItem,
    setProgress,
    setState,
    incrementRetry,
    clearSucceeded
  }
})
