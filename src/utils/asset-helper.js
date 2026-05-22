/**
 * 动态资源路径解析工具
 * 解决 Vite 无法直接解析数据绑定中的别名路径（如 @/assets/...）的问题
 */

// 仅将运行时需要的 webp/svg 纳入映射，PNG/JPG 原图归档到 docs/assets-source。
const images = import.meta.glob('/src/assets/images/**/*.{webp,svg,WEBP,SVG}', {
  eager: true,
  import: 'default'
});

const imageMap = images;

// 开发环境下输出已加载的图片映射（仅在开发环境）
if (import.meta.env.DEV) {
  console.log('[AssetHelper] 已加载图片映射:', Object.keys(imageMap).length, '个');
}

/**
 * 获取解析后的图片 URL
 * @param {string} path 原始路径，支持 @/assets/images/... 格式
 * @param {Object} options 可选配置
 * @param {string} options.fallback 备用图片路径
 * @param {boolean} options.silent 是否静默处理错误（不输出警告）
 * @returns {string} 解析后的 URL
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

  // 1. 优先尝试直接命中映射
  const resolvedUrl = imageMap[cleanPath];
  if (resolvedUrl) return resolvedUrl;

  // 2. 对 png/jpg/jpeg 自动尝试同名 webp，减少大图资源开销
  const webpPath = cleanPath.replace(/\.(png|jpe?g)$/i, '.webp');
  const resolvedWebpUrl = imageMap[webpPath];
  if (resolvedWebpUrl) {
    return resolvedWebpUrl;
  }

  // 3. 如果仍未命中，尝试作为 public 目录下的静态资源
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
    console.warn(`[AssetHelper] 图片未在构建映射中找到: ${path}，尝试作为静态资源: ${publicPath}`);
  }

  // 返回相对于 base 的路径
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${publicPath}`.replace(/\/+/g, '/');
}

/**
 * 批量获取图片 URL
 * @param {string[]} paths 图片路径数组
 * @param {Object} options 可选配置
 * @returns {string[]} 解析后的 URL 数组
 */
export function getImageUrls(paths, options = {}) {
  return paths.map(path => getImageUrl(path, options));
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

  if (imageMap[cleanPath]) return true;

  const webpPath = cleanPath.replace(/\.(png|jpe?g)$/i, '.webp');
  if (imageMap[webpPath]) return true;

  return false;
}

/**
 * 获取图片映射统计信息（开发调试用）
 * @returns {Object} 统计信息
 */
export function getImageStats() {
  const allPaths = Object.keys(imageMap);
  const webpCount = allPaths.filter(p => /\.webp$/i.test(p)).length;
  const svgCount = allPaths.filter(p => /\.svg$/i.test(p)).length;
  const pngCount = allPaths.filter(p => /\.png$/i.test(p)).length;
  const jpgCount = allPaths.filter(p => /\.(jpg|jpeg)$/i.test(p)).length;

  return {
    total: allPaths.length,
    webp: webpCount,
    svg: svgCount,
    png: pngCount,
    jpg: jpgCount,
    paths: import.meta.env.DEV ? allPaths : undefined
  };
}

// 默认导出
export default {
  getImageUrl,
  getImageUrls,
  hasImage,
  getImageStats
};
