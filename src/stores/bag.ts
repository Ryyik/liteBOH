import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logger } from '@/utils/logger.js'
import type { BagItem, BagOpResult } from '@/types'

// debounce helper for localStorage writes
let saveBagTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_BAG_DELAY_MS = 300

export const useBagStore = defineStore('bag', () => {
  const shoppingBag = ref<BagItem[]>([])

  const parseExchangeablePoints = (pointsCost: unknown): number | null => {
    const normalized = Number(pointsCost)
    if (!Number.isFinite(normalized) || normalized <= 0) return null
    return Math.round(normalized)
  }

  const normalizeBagItems = (items: unknown): BagItem[] => {
    if (!Array.isArray(items)) return []
    return items
      .map((item) => {
        const pointsCost = parseExchangeablePoints(item?.points_cost)
        const quantity = Number(item?.quantity)
        return {
          ...item,
          points_cost: pointsCost || 0,
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
        } as BagItem
      })
      .filter((item) => item.points_cost > 0)
  }

  const loadShoppingBag = (): void => {
    const savedBag = localStorage.getItem('boh_shopping_bag')
    if (savedBag) {
      try {
        shoppingBag.value = normalizeBagItems(JSON.parse(savedBag))
      } catch (e) {
        logger.error('bag-store', '解析本地购物纸袋数据失败', e)
        shoppingBag.value = []
      }
    } else {
      shoppingBag.value = []
    }
  }

  const saveShoppingBag = (): void => {
    if (saveBagTimer) {
      clearTimeout(saveBagTimer)
    }
    saveBagTimer = setTimeout(() => {
      saveBagTimer = null
      localStorage.setItem('boh_shopping_bag', JSON.stringify(shoppingBag.value))
    }, SAVE_BAG_DELAY_MS)
  }

  // 立即保存（用于页面卸载前）
  const flushShoppingBag = (): void => {
    if (saveBagTimer) {
      clearTimeout(saveBagTimer)
      saveBagTimer = null
    }
    localStorage.setItem('boh_shopping_bag', JSON.stringify(shoppingBag.value))
  }

  const addToBag = (product: Record<string, unknown>, specValue: string, specLabel: string): BagOpResult => {
    const normalizedPoints = parseExchangeablePoints(product?.points_cost)
    if (normalizedPoints === null) {
      return { ok: false, reason: 'PRODUCT_NOT_EXCHANGEABLE' }
    }

    const existingItemIndex = shoppingBag.value.findIndex(
      (item) => item.id === product.id && item.selectedSpec === specValue
    )

    if (existingItemIndex !== -1) {
      shoppingBag.value[existingItemIndex].quantity += 1
    } else {
      shoppingBag.value.push({
        ...product,
        points_cost: normalizedPoints,
        quantity: 1,
        selectedSpec: specValue,
        selectedSpecLabel: specLabel,
      } as BagItem)
    }
    saveShoppingBag()
    return { ok: true }
  }

  const updateBagItemQuantity = (productId: number, specValue: string, delta: number): void => {
    const itemIndex = shoppingBag.value.findIndex(
      (item) => item.id === productId && item.selectedSpec === specValue
    )

    if (itemIndex !== -1) {
      const newQuantity = shoppingBag.value[itemIndex].quantity + delta
      if (newQuantity > 0) {
        shoppingBag.value[itemIndex].quantity = newQuantity
      } else {
        shoppingBag.value.splice(itemIndex, 1)
      }
      saveShoppingBag()
    }
  }

  const removeFromBag = (productId: number, specValue: string): void => {
    shoppingBag.value = shoppingBag.value.filter(
      (item) => !(item.id === productId && item.selectedSpec === specValue)
    )
    saveShoppingBag()
  }

  const clearBag = (): void => {
    shoppingBag.value = []
    saveShoppingBag()
  }

  const resetState = (): void => {
    shoppingBag.value = []
    localStorage.removeItem('boh_shopping_bag')
  }

  return {
    shoppingBag,
    loadShoppingBag,
    saveShoppingBag,
    flushShoppingBag,
    addToBag,
    updateBagItemQuantity,
    removeFromBag,
    clearBag,
    resetState,
  }
})