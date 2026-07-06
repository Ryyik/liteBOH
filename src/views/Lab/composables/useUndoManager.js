import { ref, computed } from 'vue'

/**
 * Undo/Redo 快照管理器
 * 管理文档状态的历史快照，支持撤销和重做
 */
export function useUndoManager() {
  const MAX_SNAPSHOTS = 50
  const snapshots = ref([])
  const currentIndex = ref(-1)

  const canUndo = computed(() => currentIndex.value > 0)
  const canRedo = computed(() => currentIndex.value < snapshots.value.length - 1)

  /**
   * 保存当前文档快照
   */
  function takeSnapshot(docData, label = '修改') {
    if (!docData) return

    // 如果当前位置不是最新，丢弃后面的快照
    if (currentIndex.value < snapshots.value.length - 1) {
      snapshots.value = snapshots.value.slice(0, currentIndex.value + 1)
    }

    const snapshot = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      label,
      timestamp: new Date().toISOString(),
      stylesDoc: docData.stylesDoc?.cloneNode(true) || null,
      documentDoc: docData.documentDoc?.cloneNode(true) || null,
      styles: docData.styles ? JSON.parse(JSON.stringify(docData.styles)) : null,
      content: docData.content ? JSON.parse(JSON.stringify(docData.content)) : null,
      historyItems: null, // 由调用方传入
    }

    snapshots.value.push(snapshot)

    // 限制快照数量
    if (snapshots.value.length > MAX_SNAPSHOTS) {
      snapshots.value = snapshots.value.slice(-MAX_SNAPSHOTS)
    }

    currentIndex.value = snapshots.value.length - 1
    return snapshot.id
  }

  /**
   * 撤销：返回上一个快照
   */
  function undo() {
    if (!canUndo.value) return null
    currentIndex.value--
    return getCurrentSnapshot()
  }

  /**
   * 重做：返回下一个快照
   */
  function redo() {
    if (!canRedo.value) return null
    currentIndex.value++
    return getCurrentSnapshot()
  }

  /**
   * 获取当前快照数据
   */
  function getCurrentSnapshot() {
    if (currentIndex.value < 0 || currentIndex.value >= snapshots.value.length) return null
    return snapshots.value[currentIndex.value]
  }

  /**
   * 获取当前快照索引和标签（用于 UI 显示）
   */
  function getStatus() {
    return {
      canUndo: canUndo.value,
      canRedo: canRedo.value,
      currentLabel: currentIndex.value >= 0 ? snapshots.value[currentIndex.value]?.label : '',
      undoLabel: canUndo.value ? snapshots.value[currentIndex.value - 1]?.label : '',
      redoLabel: canRedo.value ? snapshots.value[currentIndex.value + 1]?.label : '',
      total: snapshots.value.length,
      index: currentIndex.value,
    }
  }

  /**
   * 重置
   */
  function reset() {
    snapshots.value = []
    currentIndex.value = -1
  }

  return {
    canUndo,
    canRedo,
    takeSnapshot,
    undo,
    redo,
    getCurrentSnapshot,
    getStatus,
    reset,
  }
}
