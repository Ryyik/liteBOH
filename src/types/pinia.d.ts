// ============================================
// pinia-plugin-persistedstate 类型扩充
// 为 DefineSetupStoreOptions 添加 persist 选项
// ============================================

import 'pinia'

declare module 'pinia' {
  export interface DefineSetupStoreOptions<
    Id extends string,
    S extends StateTree,
    G extends _GettersTree<S>,
    A
  > {
    /**
     * pinia-plugin-persistedstate 持久化配置
     * @see https://prazdevs.github.io/pinia-plugin-persistedstate/
     */
    persist?: boolean | {
      key?: string
      paths?: string[]
      storage?: Storage
      beforeRestore?: (ctx: { store: ReturnType<typeof import('pinia')['defineStore']> }) => void
      afterRestore?: (ctx: { store: ReturnType<typeof import('pinia')['defineStore']> }) => void
      serializer?: {
        serialize: (value: unknown) => string
        deserialize: (value: string) => unknown
      }
      debug?: boolean
    }
  }
}