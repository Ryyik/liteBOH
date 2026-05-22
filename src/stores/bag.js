import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logger } from '@/utils/logger.js';

export const useBagStore = defineStore('bag', () => {
  const shoppingBag = ref([]);

  const parseExchangeablePoints = (pointsCost) => {
    const normalized = Number(pointsCost);
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    return Math.round(normalized);
  };

  const normalizeBagItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const pointsCost = parseExchangeablePoints(item?.points_cost);
        const quantity = Number(item?.quantity);
        return {
          ...item,
          points_cost: pointsCost || 0,
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1
        };
      })
      .filter((item) => item.points_cost > 0);
  };

  const loadShoppingBag = () => {
    const savedBag = localStorage.getItem('boh_shopping_bag');
    if (savedBag) {
      try {
        shoppingBag.value = normalizeBagItems(JSON.parse(savedBag));
      } catch (e) {
        logger.error('bag-store', '解析本地购物纸袋数据失败', e);
        shoppingBag.value = [];
      }
    } else {
      shoppingBag.value = [];
    }
  };

  const saveShoppingBag = () => {
    localStorage.setItem('boh_shopping_bag', JSON.stringify(shoppingBag.value));
  };

  const addToBag = (product, specValue, specLabel) => {
    const normalizedPoints = parseExchangeablePoints(product?.points_cost);
    if (normalizedPoints === null) {
      return { ok: false, reason: 'PRODUCT_NOT_EXCHANGEABLE' };
    }

    const existingItemIndex = shoppingBag.value.findIndex(
      item => item.id === product.id && item.selectedSpec === specValue
    );

    if (existingItemIndex !== -1) {
      shoppingBag.value[existingItemIndex].quantity += 1;
    } else {
      shoppingBag.value.push({
        ...product,
        points_cost: normalizedPoints,
        quantity: 1,
        selectedSpec: specValue,
        selectedSpecLabel: specLabel
      });
    }
    saveShoppingBag();
    return { ok: true };
  };

  const updateBagItemQuantity = (productId, specValue, delta) => {
    const itemIndex = shoppingBag.value.findIndex(
      item => item.id === productId && item.selectedSpec === specValue
    );

    if (itemIndex !== -1) {
      const newQuantity = shoppingBag.value[itemIndex].quantity + delta;
      if (newQuantity > 0) {
        shoppingBag.value[itemIndex].quantity = newQuantity;
      } else {
        shoppingBag.value.splice(itemIndex, 1);
      }
      saveShoppingBag();
    }
  };

  const removeFromBag = (productId, specValue) => {
    shoppingBag.value = shoppingBag.value.filter(
      item => !(item.id === productId && item.selectedSpec === specValue)
    );
    saveShoppingBag();
  };

  const clearBag = () => {
    shoppingBag.value = [];
    saveShoppingBag();
  };

  const resetState = () => {
    shoppingBag.value = [];
    localStorage.removeItem('boh_shopping_bag');
  };

  return {
    shoppingBag,
    loadShoppingBag,
    saveShoppingBag,
    addToBag,
    updateBagItemQuantity,
    removeFromBag,
    clearBag,
    resetState
  };
});
