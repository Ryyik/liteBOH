import { defineStore } from 'pinia'
import { ref } from 'vue'
import { logger } from '@/utils/logger.js'
import type { BagItem, BagOpResult } from '@/types'

let saveBagTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_BAG_DELAY_MS = 300

export const useBagStore = defineStore('bag', () => {
  const shoppingBag = ref<BagItem[]>([])

  const parseExchangeablePoints = (pointsCost: unknown): number | null => {
    const normalized = Number(pointsCost)
    if (!Number.isFinite(normalized) || normalized <= 0) return null
    return Math.round(normalized)
  }

  const parseRmbPrice = (rmbPrice: unknown): number | null => {
    const normalized = Number(rmbPrice)
    if (!Number.isFinite(normalized) || normalized <= 0) return null
    return Math.round(normalized) // cents
  }

  const isPurchasable = (product: Record<string, unknown>): boolean => {
    if (product?.is_purchasable === false) return false
    const mode = String(product?.payment_mode || 'points_only')

    if (mode === 'points_only') {
      return parseExchangeablePoints(product?.points_cost) !== null
    }
    if (mode === 'rmb_only') {
      return parseRmbPrice(product?.rmb_price) !== null
    }
    if (mode === 'combined') {
      return parseExchangeablePoints(product?.points_cost) !== null
        && parseRmbPrice(product?.rmb_price) !== null
    }
    return false
  }

  const normalizeBagItems = (items: unknown): BagItem[] => {
    if (!Array.isArray(items)) return []
    return items
      .map((item) => {
        const pointsCost = parseExchangeablePoints(item?.points_cost)
        const rmbPrice = parseRmbPrice(item?.rmb_price)
        const quantity = Number(item?.quantity)
        return {
          ...item,
          points_cost: pointsCost || 0,
          rmb_price: rmbPrice ?? null,
          payment_mode: item?.payment_mode || 'points_only',
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
        } as BagItem
      })
      .filter((item) => (item.is_purchasable !== false) && isPurchasable(item))
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
    if (saveBagTimer) clearTimeout(saveBagTimer)
    saveBagTimer = setTimeout(() => {
      saveBagTimer = null
      localStorage.setItem('boh_shopping_bag', JSON.stringify(shoppingBag.value))
    }, SAVE_BAG_DELAY_MS)
  }

  const flushShoppingBag = (): void => {
    if (saveBagTimer) {
      clearTimeout(saveBagTimer)
      saveBagTimer = null
    }
    localStorage.setItem('boh_shopping_bag', JSON.stringify(shoppingBag.value))
  }

  const addToBag = (product: Record<string, unknown>, specValue: string, specLabel: string): BagOpResult => {
    if (!isPurchasable(product)) {
      const mode = String(product?.payment_mode || 'points_only')
      if (mode === 'rmb_only') return { ok: false, reason: 'PRODUCT_NOT_PURCHASABLE' }
      return { ok: false, reason: 'PRODUCT_NOT_EXCHANGEABLE' }
    }

    const pointsCost = parseExchangeablePoints(product?.points_cost) || 0
    const rmbPrice = parseRmbPrice(product?.rmb_price) ?? null
    const mode = String(product?.payment_mode || 'points_only')

    const existingItemIndex = shoppingBag.value.findIndex(
      (item) => item.id === product.id && item.selectedSpec === specValue
    )

    if (existingItemIndex !== -1) {
      shoppingBag.value[existingItemIndex].quantity += 1
    } else {
      shoppingBag.value.push({
        ...product,
        points_cost: pointsCost,
        rmb_price: rmbPrice,
        payment_mode: mode,
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
