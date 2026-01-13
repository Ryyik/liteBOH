/**
 * 动态资源路径解析工具
 * 解决 Vite 无法直接解析数据绑定中的别名路径（如 @/assets/...）的问题
 */

// 使用 import.meta.glob 预加载所有图片资源
const images = import.meta.glob('/src/assets/images/**/*.{png,jpg,jpeg,webp,svg,PNG,JPG,JPEG}', { 
  eager: true, 
  import: 'default' 
});

/**
 * 获取解析后的图片 URL
 * @param {string} path 原始路径，支持 @/assets/images/... 格式
 * @returns {string} 解析后的 URL
 */
export function getImageUrl(path) {
  if (!path) return '';
  
  // 处理已解析的路径、Base64 或外部链接
  if (
    path.startsWith('data:') || 
    path.startsWith('http') || 
    path.startsWith('blob:')
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

  // 1. 尝试从 src/assets (经 Vite 处理) 中查找
  const resolved = images[cleanPath];
  if (resolved) {
    return resolved;
  }

  // 2. 如果没找到，尝试作为 public 目录下的静态资源
  // 将 /src/assets/ 转换为 assets/
  let publicPath = cleanPath;
  if (cleanPath.startsWith('/src/assets/')) {
    publicPath = cleanPath.replace('/src/assets/', 'assets/');
  } else if (cleanPath.startsWith('/src/')) {
    publicPath = cleanPath.replace('/src/', '');
  }
  
  // 移除开头的斜杠
  publicPath = publicPath.startsWith('/') ? publicPath.substring(1) : publicPath;
  
  // 返回相对于 base 的路径
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${publicPath}`.replace(/\/+/g, '/');
}
