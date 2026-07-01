/**
 * 动态资源路径解析工具
 * 解决 Vite 无法直接解析数据绑定中的别名路径（如 @/assets/...）的问题
 */

// 使用 eager: true 在模块加载时同步解析所有图片 URL，保证同步 getImageUrl 可用
// glob 返回 { path: defaultExport } 形式，defaultExport 为 URL 字符串
const images = import.meta.glob('/src/assets/images/**/*.{webp,svg,WEBP,SVG}', {
  eager: true,
  import: 'default'
});

// 图片缓存 Map，存储已加载的图片 URL
const imageCache = new Map();

// 模块加载时立即预加载所有图片到缓存
// eager: true + import: 'default' 模式下 images[path] 已是 URL 字符串，直接入缓存
// eager: false（懒加载）模式下 images[path] 为加载函数，异步调用后入缓存
for (const [path, loader] of Object.entries(images)) {
  if (typeof loader === 'string') {
    imageCache.set(path, loader);
  } else if (typeof loader === 'function') {
    loader()
      .then(url => {
        if (typeof url === 'string') {
          imageCache.set(path, url);
        }
      })
      .catch(() => {
        // 静默处理预加载失败
      });
  }
}

// 开发环境下输出可用的图片路径（仅在开发环境）
if (import.meta.env.DEV) {
  console.log('[AssetHelper] 懒加载图片数量:', Object.keys(images).length, '个');
}

/**
 * 预加载图片到缓存
 * @param {string} path 图片路径
 * @returns {Promise<string>} 图片 URL
 */
export async function preloadImage(path) {
  if (!path) return '';

  // 处理别名路径
  let cleanPath = path;
  if (path.startsWith('@/')) {
    cleanPath = path.replace('@/', '/src/');
  } else if (path.startsWith('assets/')) {
    cleanPath = '/src/' + path;
  } else if (!path.startsWith('/src/')) {
    cleanPath = `/src/assets/images/${path}`;
  }

  cleanPath = cleanPath.replace(/\/+/g, '/');

  // 检查缓存
  if (imageCache.has(cleanPath)) {
    return imageCache.get(cleanPath);
  }

  // 尝试从 lazy glob 获取（eager: false 时值为加载函数，需 await 调用）
  if (images[cleanPath]) {
    try {
      const entry = images[cleanPath];
      const url = typeof entry === 'function' ? await entry() : entry;
      imageCache.set(cleanPath, url);
      return url;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`[AssetHelper] 预加载图片失败: ${cleanPath}`, error);
      }
    }
  }

  return '';
}

/**
 * 获取解析后的图片 URL（同步版本，用于模板绑定）
 * @param {string} path 原始路径，支持 @/assets/images/... 格式
 * @param {Object} options 可选配置
 * @param {string} options.fallback 备用图片路径
 * @param {boolean} options.silent 是否静默处理错误（不输出警告）
 * @returns {string} 解析后的 URL（如果未缓存则返回空字符串或 fallback）
 */
export function getImageUrl(path, options = {}) {
  if (!path) {
    if (!options.silent && import.meta.env.DEV) {
      console.warn('[AssetHelper] 图片路径为空');
    }
    return options.fallback || '';
  }

  // 处理已解析的路径、Base64 或外部链接
  if (
    path.startsWith('data:') ||
    path.startsWith('http') ||
    path.startsWith('blob:') ||
    path.startsWith('/static/')
  ) {
    return path;
  }

  // 处理别名路径
  let cleanPath = path;
  if (path.startsWith('@/')) {
    cleanPath = path.replace('@/', '/src/');
  } else if (path.startsWith('assets/')) {
    cleanPath = '/src/' + path;
  } else if (!path.startsWith('/src/')) {
    // 假设是相对于 assets/images 的路径
    cleanPath = `/src/assets/images/${path}`;
  }

  // 确保路径格式正确
  cleanPath = cleanPath.replace(/\/+/g, '/');

  // 1. 检查缓存
  if (imageCache.has(cleanPath)) {
    return imageCache.get(cleanPath);
  }

  // 2. 对 png/jpg/jpeg 自动尝试同名 webp
  const webpPath = cleanPath.replace(/\.(png|jpe?g)$/i, '.webp');
  if (imageCache.has(webpPath)) {
    return imageCache.get(webpPath);
  }

  // 3. 如果未缓存，优先返回 eager 模式下已就绪的 URL 字符串
  if (typeof images[cleanPath] === 'string') {
    imageCache.set(cleanPath, images[cleanPath]);
    return images[cleanPath];
  }
  if (typeof images[webpPath] === 'string') {
    imageCache.set(webpPath, images[webpPath]);
    return images[webpPath];
  }

  // 4. 触发异步加载（不等待结果，用于 eager: false 懒加载模式）
  if (typeof images[cleanPath] === 'function') {
    images[cleanPath]().then(module => {
      const url = module.default || module;
      imageCache.set(cleanPath, url);
    }).catch(error => {
      if (!options.silent && import.meta.env.DEV) {
        console.warn(`[AssetHelper] 动态加载图片失败: ${cleanPath}`, error);
      }
    });
  } else if (typeof images[webpPath] === 'function') {
    images[webpPath]().then(module => {
      const url = module.default || module;
      imageCache.set(webpPath, url);
    }).catch(error => {
      if (!options.silent && import.meta.env.DEV) {
        console.warn(`[AssetHelper] 动态加载 WebP 图片失败: ${webpPath}`, error);
      }
    });
  }

  // 5. 如果仍未命中，尝试作为 public 目录下的静态资源
  let publicPath = cleanPath;
  if (cleanPath.startsWith('/src/assets/')) {
    publicPath = cleanPath.replace('/src/assets/', 'assets/');
  } else if (cleanPath.startsWith('/src/')) {
    publicPath = cleanPath.replace('/src/', '');
  }

  // 移除开头的斜杠
  publicPath = publicPath.startsWith('/') ? publicPath.substring(1) : publicPath;

  // 开发环境下输出警告
  if (!options.silent && import.meta.env.DEV) {
    console.warn(`[AssetHelper] 图片未在缓存中找到: ${path}，尝试作为静态资源: ${publicPath}`);
  }

  // 返回相对于 base 的路径
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${publicPath}`.replace(/\/+/g, '/');
}

/**
 * 获取解析后的图片 URL（异步版本，用于需要等待图片加载的场景）
 * @param {string} path 原始路径，支持 @/assets/images/... 格式
 * @param {Object} options 可选配置
 * @param {string} options.fallback 备用图片路径
 * @param {boolean} options.silent 是否静默处理错误（不输出警告）
 * @returns {Promise<string>} 解析后的 URL
 */
export async function getImageUrlAsync(path, options = {}) {
  if (!path) {
    if (!options.silent && import.meta.env.DEV) {
      console.warn('[AssetHelper] 图片路径为空');
    }
    return options.fallback || '';
  }

  // 处理已解析的路径、Base64 或外部链接
  if (
    path.startsWith('data:') ||
    path.startsWith('http') ||
    path.startsWith('blob:') ||
    path.startsWith('/static/')
  ) {
    return path;
  }

  // 处理别名路径
  let cleanPath = path;
  if (path.startsWith('@/')) {
    cleanPath = path.replace('@/', '/src/');
  } else if (path.startsWith('assets/')) {
    cleanPath = '/src/' + path;
  } else if (!path.startsWith('/src/')) {
    cleanPath = `/src/assets/images/${path}`;
  }

  cleanPath = cleanPath.replace(/\/+/g, '/');

  // 检查缓存
  if (imageCache.has(cleanPath)) {
    return imageCache.get(cleanPath);
  }

  // 尝试从 lazy glob 获取（eager: false 时值为加载函数，需 await 调用）
  if (images[cleanPath]) {
    try {
      const entry = images[cleanPath];
      const url = typeof entry === 'function' ? await entry() : entry;
      imageCache.set(cleanPath, url);
      return url;
    } catch (error) {
      if (!options.silent && import.meta.env.DEV) {
        console.warn(`[AssetHelper] 动态导入图片失败: ${cleanPath}`, error);
      }
    }
  }

  // 尝试 webp
  const webpPath = cleanPath.replace(/\.(png|jpe?g)$/i, '.webp');
  if (imageCache.has(webpPath)) {
    return imageCache.get(webpPath);
  }

  if (images[webpPath]) {
    try {
      const entry = images[webpPath];
      const url = typeof entry === 'function' ? await entry() : entry;
      imageCache.set(webpPath, url);
      return url;
    } catch (error) {
      if (!options.silent && import.meta.env.DEV) {
        console.warn(`[AssetHelper] 动态导入 WebP 图片失败: ${webpPath}`, error);
      }
    }
  }

  // 返回静态资源路径
  let publicPath = cleanPath;
  if (cleanPath.startsWith('/src/assets/')) {
    publicPath = cleanPath.replace('/src/assets/', 'assets/');
  } else if (cleanPath.startsWith('/src/')) {
    publicPath = cleanPath.replace('/src/', '');
  }

  publicPath = publicPath.startsWith('/') ? publicPath.substring(1) : publicPath;

  if (!options.silent && import.meta.env.DEV) {
    console.warn(`[AssetHelper] 图片未在构建映射中找到: ${path}，尝试作为静态资源: ${publicPath}`);
  }

  const base = import.meta.env.BASE_URL || '/';
  return `${base}${publicPath}`.replace(/\/+/g, '/');
}

/**
 * 批量获取图片 URL（异步版本）
 * @param {string[]} paths 图片路径数组
 * @param {Object} options 可选配置
 * @returns {Promise<string[]>} 解析后的 URL 数组
 */
export async function getImageUrls(paths, options = {}) {
  return Promise.all(paths.map(path => getImageUrlAsync(path, options)));
}

/**
 * 批量预加载图片
 * @param {string[]} paths 图片路径数组
 * @returns {Promise<void>}
 */
export async function preloadImages(paths) {
  await Promise.all(paths.map(path => preloadImage(path)));
}

/**
 * 检查图片是否存在
 * @param {string} path 图片路径
 * @returns {boolean} 是否存在
 */
export function hasImage(path) {
  if (!path) return false;

  let cleanPath = path;
  if (path.startsWith('@/')) {
    cleanPath = path.replace('@/', '/src/');
  } else if (path.startsWith('assets/')) {
    cleanPath = '/src/' + path;
  } else if (!path.startsWith('/src/')) {
    cleanPath = `/src/assets/images/${path}`;
  }

  cleanPath = cleanPath.replace(/\/+/g, '/');

  // 检查缓存或可用路径
  if (imageCache.has(cleanPath) || images[cleanPath]) return true;

  const webpPath = cleanPath.replace(/\.(png|jpe?g)$/i, '.webp');
  if (imageCache.has(webpPath) || images[webpPath]) return true;

  return false;
}

/**
 * 获取图片映射统计信息（开发调试用）
 * @returns {Object} 统计信息
 */
export function getImageStats() {
  const allPaths = Object.keys(images);
  const cachedPaths = Array.from(imageCache.keys());
  const webpCount = allPaths.filter(p => /\.webp$/i.test(p)).length;
  const svgCount = allPaths.filter(p => /\.svg$/i.test(p)).length;
  const pngCount = allPaths.filter(p => /\.png$/i.test(p)).length;
  const jpgCount = allPaths.filter(p => /\.(jpg|jpeg)$/i.test(p)).length;

  return {
    total: allPaths.length,
    cached: cachedPaths.length,
    webp: webpCount,
    svg: svgCount,
    png: pngCount,
    jpg: jpgCount,
    paths: import.meta.env.DEV ? allPaths : undefined,
    cachedPaths: import.meta.env.DEV ? cachedPaths : undefined
  };
}

// 默认导出
export default {
  getImageUrl,
  getImageUrlAsync,
  getImageUrls,
  preloadImage,
  preloadImages,
  hasImage,
  getImageStats
};
