import { ref, computed } from 'vue'

/**
 * 对话树管理器
 * 支持：分支创建、节点导航、分支对比、合并
 */
export function useConversationTree() {
  const nodes = ref([])
  const activeNodeId = ref(null)
  let nextId = 0

  // 当前分支路径
  const currentBranch = computed(() => {
    if (!activeNodeId.value) return []
    const branch = []
    let current = findNode(activeNodeId.value)
    while (current) {
      branch.unshift(current)
      current = current.parentId ? findNode(current.parentId) : null
    }
    return branch
  })

  // 所有分支列表
  const branches = computed(() => {
    const result = []
    const visited = new Set()
    function walk(node, path) {
      if (visited.has(node.id)) return
      visited.add(node.id)
      const newPath = [...path, node]
      if (node.children.length === 0) {
        result.push(newPath)
      } else {
        node.children.forEach(cid => {
          const child = findNode(cid)
          if (child) walk(child, newPath)
        })
      }
    }
    nodes.value.forEach(n => {
      if (!n.parentId) walk(n, [])
    })
    return result
  })

  let idCounter = 0
  function generateId() {
    return `node_${++idCounter}_${Date.now().toString(36)}`
  }

  function findNode(id) {
    return nodes.value.find(n => n.id === id) || null
  }

  /**
   * 创建根节点
   */
  function createRoot(message) {
    const node = {
      id: generateId(),
      parentId: null,
      children: [],
      message,
      timestamp: Date.now(),
      branchLabel: '主线',
    }
    nodes.value.push(node)
    activeNodeId.value = node.id
    return node
  }

  /**
   * 添加子节点（在当前活跃节点下）
   */
  function addNode(message) {
    if (!activeNodeId.value) return createRoot(message)

    const parent = findNode(activeNodeId.value)
    if (!parent) return null

    const node = {
      id: generateId(),
      parentId: parent.id,
      children: [],
      message,
      timestamp: Date.now(),
      branchLabel: '',
    }
    nodes.value.push(node)
    parent.children.push(node.id)
    activeNodeId.value = node.id
    return node
  }

  /**
   * 从指定节点创建分支
   */
  function fork(fromNodeId, message) {
    const parent = findNode(fromNodeId)
    if (!parent) return null

    const node = {
      id: generateId(),
      parentId: fromNodeId,
      children: [],
      message,
      timestamp: Date.now(),
      branchLabel: `分支 ${parent.children.length + 1}`,
    }
    nodes.value.push(node)
    parent.children.push(node.id)
    activeNodeId.value = node.id
    return node
  }

  /**
   * 导航到指定节点
   */
  function navigateTo(nodeId) {
    const node = findNode(nodeId)
    if (node) {
      activeNodeId.value = nodeId
    }
    return node
  }

  /**
   * 获取从根到当前节点的消息列表
   */
  function getMessages() {
    return currentBranch.value.map(n => n.message).filter(Boolean)
  }

  /**
   * 合并分支：将 source 分支的消息合并到 target 分支
   */
  function mergeBranches(sourceNodeId, targetNodeId) {
    const source = findNode(sourceNodeId)
    const target = findNode(targetNodeId)
    if (!source || !target) return false

    // 将 source 的子节点迁移到 target
    source.children.forEach(cid => {
      const child = findNode(cid)
      if (child) {
        child.parentId = targetNodeId
        target.children.push(cid)
      }
    })
    source.children = []
    return true
  }

  /**
   * 删除节点及其子树
   */
  function removeNode(nodeId) {
    const node = findNode(nodeId)
    if (!node) return

    // 从父节点移除引用
    if (node.parentId) {
      const parent = findNode(node.parentId)
      if (parent) {
        parent.children = parent.children.filter(cid => cid !== nodeId)
      }
    }

    // 递归删除子节点
    function removeSubtree(id) {
      const n = findNode(id)
      if (n) {
        n.children.forEach(removeSubtree)
        nodes.value = nodes.value.filter(nn => nn.id !== id)
      }
    }
    removeSubtree(nodeId)

    // 更新活跃节点
    if (activeNodeId.value === nodeId) {
      activeNodeId.value = node.parentId || (nodes.value.length > 0 ? nodes.value[nodes.value.length - 1].id : null)
    }
  }

  /**
   * 重置
   */
  function reset() {
    nodes.value = []
    activeNodeId.value = null
    idCounter = 0
  }

  return {
    nodes,
    activeNodeId,
    currentBranch,
    branches,
    createRoot,
    addNode,
    fork,
    navigateTo,
    getMessages,
    mergeBranches,
    removeNode,
    reset,
  }
}
