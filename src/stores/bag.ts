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

  /**
   * 拿实时商品表给购物袋对账（2026-11-04）。
   *
   * 袋子里的每一项都是**加购那一刻的快照**（价格、库存、是否在售全存在浏览器里），
   * 而服务端下单是按 products 表重算的。所以只要不在进商城时对一次账，
   * 就会出现两种用户能直接看到的错：
   *   ① 显示价 ≠ 实扣价（页面 ¥11.90、扣款 ¥13.90），且没有任何提示；
   *   ② 已下架 / 已售罄的商品一直躺在袋里，用户数着「共 4 件」，到结算页才被拦。
   *
   * 这里只做三件确定的事：**下架/不可兑换的移出**、**价格与标题同步成实时值**、
   * **数量夹到库存上限**。售罄（stock = 0）不删 —— 删了用户会以为"自己点错了"，
   * 留着并标注「已售罄」更诚实，移除入口由界面给（见 BagPanel 的清理条）。
   *
   * 只在传入非空商品表时才动袋子：商品请求失败拿到空数组，不能当成"全部下架"，
   * 那会把用户的袋子整个清空。
   *
   * @returns {{ removed: number, updated: number }} 移出与改写的件数（0/0 表示无需落盘）
   */
  const reconcileBag = (products: unknown[]): { removed: number; updated: number } => {
    if (!Array.isArray(products) || !products.length) return { removed: 0, updated: 0 }
    if (!shoppingBag.value.length) return { removed: 0, updated: 0 }

    const live = new Map<number, Record<string, unknown>>()
    for (const product of products) {
      const id = Number((product as Record<string, unknown>)?.id)
      if (Number.isFinite(id)) live.set(id, product as Record<string, unknown>)
    }
    if (!live.size) return { removed: 0, updated: 0 }

    let removed = 0
    let updated = 0
    const next: BagItem[] = []

    for (const item of shoppingBag.value) {
      const product = live.get(Number(item.id))
      // 商品已从在售列表消失（下架 / 删除 / 不再可兑换）⇒ 移出袋子
      if (!product || !isPurchasable(product)) {
        removed += 1
        continue
      }

      const pointsCost = parseExchangeablePoints(product.points_cost) || 0
      const rmbPrice = parseRmbPrice(product.rmb_price) ?? null
      const paymentMode = String(product.payment_mode || 'points_only')
      /* 标题只在商品表真给了才覆盖；否则保留袋里的（不要把 undefined 写成 ''，
         那会让「价格没变」也被算成 updated，每次进站都弹一次"已更新"） */
      const liveTitle = String(product.title || '').trim()
      const title = liveTitle || item.title
      const stockRaw = Number(product.stock)
      const stock = Number.isFinite(stockRaw) ? Math.max(0, Math.round(stockRaw)) : null
      // 数量夹到库存上限；库存 0 时保留 1 件并标注售罄（不静默删）
      const quantity =
        stock === null ? item.quantity : Math.max(1, Math.min(item.quantity, Math.max(1, stock)))

      if (
        pointsCost !== item.points_cost ||
        rmbPrice !== item.rmb_price ||
        paymentMode !== item.payment_mode ||
        quantity !== item.quantity ||
        title !== item.title ||
        stock !== item.stock
      ) {
        updated += 1
      }

      next.push({
        ...item,
        title,
        points_cost: pointsCost,
        rmb_price: rmbPrice,
        payment_mode: paymentMode,
        quantity,
        stock,
      } as BagItem)
    }

    if (removed || updated) {
      shoppingBag.value = next
      saveShoppingBag()
    }
    return { removed, updated }
  }

  return {
    shoppingBag,
    loadShoppingBag,
    saveShoppingBag,
    flushShoppingBag,
    reconcileBag,
    addToBag,
    updateBagItemQuantity,
    removeFromBag,
    clearBag,
    resetState,
  }
})
