/**
 * useImageLoaded —— 图片「解码完成」的记账开关，用来做淡入而不是硬跳出来
 *
 * 为什么需要：`<img src>` 插进 DOM 时是空的，浏览器解码完成后**一次性**把像素画上去。
 * 在商品卡 / 抽奖封面 / 订单缩略图里，这一下就是用户能看见的「硬切」：灰底突然
 * 变成一张图。加一层 260ms 的透明度过渡就能把它抹平。
 *
 * 为什么默认是「已加载」而不是「加载中」：
 *   如果把 `opacity: 0` 写成基础样式、只靠 `@load` 解封，一旦 load 事件没来
 *   （缓存命中不派发、被 bfcache 恢复、图片在离屏时被浏览器推迟解码……）
 *   图片就会**永远隐形** —— 那是比硬切严重得多的事故。
 *   所以基础样式是可见的，只有模板明确标了 `is-loading` 才透明：
 *   最坏情况退回今天的「直接出现」，不会出现「图不见了」。
 *
 * 用法：
 *   const { isImageLoaded, markImageLoaded } = useImageLoaded();
 *   <img :class="{ 'is-loading': !isImageLoaded(key) }" @load="markImageLoaded(key)" />
 *   CSS: img.is-loading { opacity: 0 } / img { transition: opacity 260ms var(--ease-out) }
 *
 * key 与 useImageFailure 同规：用稳定标识，不要用数组下标。
 */
import { ref } from 'vue';

export function useImageLoaded() {
  const loadedKeys = ref(new Set());

  const isImageLoaded = (key) => loadedKeys.value.has(key);

  const markImageLoaded = (key) => {
    if (loadedKeys.value.has(key)) return;
    const next = new Set(loadedKeys.value);
    next.add(key);
    loadedKeys.value = next;
  };

  const resetLoaded = () => {
    loadedKeys.value = new Set();
  };

  return { isImageLoaded, markImageLoaded, resetLoaded };
}

export default useImageLoaded;
