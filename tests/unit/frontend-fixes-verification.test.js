import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================
// 前端修复验证测试
// 覆盖：M5 分页竞态、M6+L14 SSE错误处理、L11 stopGeneration 清理、
//       L12 watch条件创建、L13 force绕过、L15 补偿删除
// ============================================================

const readFile = (relPath) => readFileSync(resolve(import.meta.dirname, `../../${relPath}`), 'utf8')

describe('M5: PointsGrantConsole 分页竞态守卫', () => {
  const source = readFile('src/views/DataManagement/components/PointsGrantConsole.vue')

  it('定义了请求序号变量 recentRequestId', () => {
    expect(source).toMatch(/recentRequestId/)
  })

  it('loadRecent 入口递增 requestId', () => {
    expect(source).toMatch(/\+\+recentRequestId|recentRequestId\s*\+=\s*1/)
  })

  it('响应返回后检查序号以丢弃过期响应', () => {
    expect(source).toMatch(/myRequestId\s*!==\s*recentRequestId|myRequestId\s*===\s*recentRequestId/)
  })

  it('finally 块仅在最新请求时重置 loading', () => {
    // 验证 finally 中检查序号后才重置 recentLoading
    expect(source).toMatch(/recentLoading\.value\s*=\s*false/)
    // 确保不是无条件重置（有序号守卫）
    const finallyMatch = source.match(/finally\s*\{[^}]*recentRequestId[^}]*\}/s)
    expect(finallyMatch).toBeTruthy()
  })
})

describe('M6+L14: useCodeGenerator SSE 错误处理', () => {
  const source = readFile('src/views/Lab/composables/useCodeGenerator.js')

  it('定义了 sseError 标志变量', () => {
    expect(source).toMatch(/sseError/)
  })

  it('收到 event: error 时设置 sseError 标志', () => {
    expect(source).toMatch(/event:\s*error/)
    expect(source).toMatch(/sseError\s*=\s*true/)
  })

  it('M6: while 循环结束后检查 sseError（无 data 行的 error 也被捕获）', () => {
    // 验证循环外有 sseError 检查
    expect(source).toMatch(/if\s*\(sseError\)\s*\{[\s\S]*throw\s+new\s+Error\(['"]AI 服务返回错误事件但未提供详细错误信息['"]\)/)
  })

  it('L14: catch 块中保留原始错误文本而非抛出 SyntaxError', () => {
    // 验证不再直接 throw parseErr
    expect(source).not.toMatch(/throw\s+parseErr/)
    // 验证构造包含原始 dataStr 的 Error
    expect(source).toMatch(/throw\s+new\s+Error\(`AI 服务返回错误：\$\{dataStr\}`\)/)
  })
})

describe('L11: useChatEngine stopGeneration 清理 generationTimeoutTimer', () => {
  const source = readFile('src/views/BOHAI/composables/useChatEngine.js')
  // stopGeneration 为箭头函数，函数体以 2 空格缩进的 `};` 结束。
  // 使用 \n  \}; 作为边界可跨过内部嵌套的 4 空格 `}`，匹配到完整函数体。
  const stopGenBody = source.match(/const\s+stopGeneration\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n  \};/)?.[0] || ''

  it('stopGeneration 函数中调用 clearTimeout(generationTimeoutTimer)', () => {
    expect(stopGenBody).toBeTruthy()
    expect(stopGenBody).toContain('clearTimeout(generationTimeoutTimer)')
  })

  it('清空后置为 null 避免重复清理', () => {
    expect(stopGenBody).toMatch(/generationTimeoutTimer\s*=\s*null/)
  })

  it('clearTimeout 在 abort() 调用之后', () => {
    const abortIdx = stopGenBody.indexOf('abort()')
    const clearIdx = stopGenBody.indexOf('clearTimeout(generationTimeoutTimer)')
    expect(abortIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(abortIdx)
  })
})

describe('L12: useMemoryCapture watch 条件创建修复', () => {
  const source = readFile('src/views/BOHAI/composables/useMemoryCapture.js')

  it('watch 创建条件不再检查 typeof isLoggedIn.value !== undefined', () => {
    expect(source).not.toMatch(/typeof\s+isLoggedIn\.value\s*!==\s*['"]undefined['"]/)
  })

  it('仅检查 if (isLoggedIn) 确保 watcher 总是被创建', () => {
    expect(source).toMatch(/if\s*\(isLoggedIn\)\s*\{[\s\S]*watch\(/)
  })
})

describe('L13: homeHeroes force=true 绕过在途请求', () => {
  const source = readFile('src/stores/homeHeroes.ts')
  // fetchPublished 以 `return fetchPublishedFromRemote()` 结尾，后跟 2 空格缩进的 `}`。
  // 用该结构作为边界，避免非贪婪正则在内层 `}` 处过早截断。
  const fetchPubBody = source.match(/const\s+fetchPublished\s*=\s*async[\s\S]*?return\s+fetchPublishedFromRemote\(\)\n  \}/)?.[0] || ''

  it('fetchPublished 函数中 force=true 时置空 publishedFetchPromise', () => {
    expect(fetchPubBody).toBeTruthy()
    expect(fetchPubBody).toMatch(/if\s*\(force\)\s*\{[\s\S]*?publishedFetchPromise\s*=\s*null/)
  })

  it('force 置空在调用 fetchPublishedFromRemote 之前', () => {
    const forceNullIdx = fetchPubBody.indexOf('publishedFetchPromise = null')
    // 取最后一次 fetchPublishedFromRemote 调用的位置（函数末尾的 return）
    const lastRemoteIdx = fetchPubBody.lastIndexOf('fetchPublishedFromRemote()')
    expect(forceNullIdx).toBeGreaterThan(-1)
    expect(lastRemoteIdx).toBeGreaterThan(-1)
    // force null 应在最后的 fetchPublishedFromRemote 调用之前
    expect(forceNullIdx).toBeLessThan(lastRemoteIdx)
  })

  it('fetchPublishedFromRemote 仍有在途去重逻辑', () => {
    const fetchRemoteMatch = source.match(/const\s+fetchPublishedFromRemote[\s\S]*?\n\s*\n\s*return\s+publishedFetchPromise/)
    expect(fetchRemoteMatch).toBeTruthy()
    expect(fetchRemoteMatch[0]).toMatch(/if\s*\(publishedFetchPromise\)\s*return\s+publishedFetchPromise/)
  })
})

describe('L15: homeHeroes publishHero 补偿性删除孤立 revision', () => {
  const source = readFile('src/stores/homeHeroes.ts')

  it('publishHero 函数捕获 revision insert 返回的 id', () => {
    expect(source).toMatch(/data:\s*revisionData/)
    expect(source).toMatch(/\.select\(['"]id['"]\)/)
    expect(source).toMatch(/revisionId\s*=\s*revisionData\?\.id/)
  })

  it('update 失败时补偿删除已写入的 revision', () => {
    // 源码实际结构：await supabase.from('home_heroes_revisions').delete().eq('id', revisionId)
    // 顺序为 home_heroes_revisions → delete → .eq('id', revisionId)
    expect(source).toMatch(/if\s*\(revisionId\)\s*\{[\s\S]*home_heroes_revisions[\s\S]*delete[\s\S]*\.eq\(['"]id['"],\s*revisionId\)/)
  })

  it('补偿删除后重新抛出错误', () => {
    expect(source).toMatch(/throw\s+updateErr/)
  })
})
