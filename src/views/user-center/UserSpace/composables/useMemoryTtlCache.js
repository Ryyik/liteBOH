export const createMemoryTtlCache = () => {
  const cache = new Map();

  const get = (key, ttlMs) => {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.savedAt > ttlMs) {
      cache.delete(key);
      return null;
    }
    return cached.value;
  };

  const set = (key, value) => {
    cache.set(key, {
      savedAt: Date.now(),
      value
    });
  };

  const clear = () => {
    cache.clear();
  };

  return {
    get,
    set,
    clear
  };
};
