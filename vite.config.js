import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { visualizer } from 'rollup-plugin-visualizer'
import tailwindcss from '@tailwindcss/vite'
import cssnano from 'cssnano'

// ============================================
// 版本指纹生成插件
// 单一数据源：根目录 VERSION 文件（语义版本，如 4.7.2）
// 构建时生成 version.json 并在 index.html 注入版本 meta
// - version: 语义版本（用户可见，如 4.7.2）
// - buildId: 构建指纹（commit+timestamp，内部比对，确保每次构建唯一）
// 运行时由 version-checker.js 独立拉取比对 buildId，绕过 SW 缓存死循环
// ============================================
function bohVersionPlugin() {
  let versionInfo = null

  const buildVersionInfo = () => {
    if (versionInfo) return versionInfo
    // 读取语义版本单一源（VERSION 文件）
    const APP_VERSION = readFileSync(resolve(__dirname, 'VERSION'), 'utf8').trim() || '0.0.0'
    let commitHash = 'unknown'
    try {
      commitHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch { /* 非 git 环境降级 */ }
    const timestamp = Date.now()
    const buildTime = new Date(timestamp).toISOString()
    // 构建指纹：commit + 时间戳，确保每次构建唯一（同版本重新部署也能触发更新）
    const buildId = `${commitHash}-${timestamp}`
    versionInfo = {
      version: APP_VERSION,
      buildId,
      commitHash,
      timestamp,
      buildTime,
    }
    return versionInfo
  }

  return {
    name: 'boh-version-plugin',
    apply: 'build',
    buildStart() {
      buildVersionInfo()
    },
    transformIndexHtml(html) {
      const info = buildVersionInfo()
      // 在 </head> 前注入版本 meta：
      // - boh-version: 语义版本（用户可见展示）
      // - boh-build-id: 构建指纹（运行时比对基准）
      // - boh-build-time: 构建时间戳（调试参考）
      const metaTags = `    <meta name="boh-version" content="${info.version}" />\n    <meta name="boh-build-id" content="${info.buildId}" />\n    <meta name="boh-build-time" content="${info.timestamp}" />\n  </head>`
      return html.replace(/\s*<\/head>/i, `\n${metaTags}`)
    },
    generateBundle() {
      const info = buildVersionInfo()
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(info, null, 2),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 设置基础路径，使用相对路径 './' 以支持 Hash 路由和任意部署路径
  base: './',

  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'altcha-widget',
        },
      },
    }),
    tailwindcss(),
    bohVersionPlugin(),
    // 构建产物可视化分析（生成 stats.html，仅 ANALYZE 环境变量开启时加载）
    ...(process.env.ANALYZE ? [visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'stats.html',
    })] : []),
    // PWA Service Worker（静态资源预缓存 + 运行时缓存）
    VitePWA({
      // 确保使用 generateSW 策略自动生成 sw.js
      strategies: 'generateSW',
      // 由 main.js 以 updateViaCache: 'none' 注册，不能让 CDN 的旧 sw.js
      // 延迟数小时才被浏览器检查到更新。
      injectRegister: false,
      // Service Worker 文件名（确保生成到 dist 根目录）
      filename: 'sw.js',
      // 启用开发环境 SW（用于调试，生产环境自动禁用）
      devOptions: {
        enabled: false, // 开发环境禁用 SW，避免干扰调试
      },
      workbox: {
        // 预缓存文件大小上限（4MB，避免大文件静默跳过）
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // 预缓存应用壳、首屏依赖和所有 CSS。发布会替换旧 hash 文件；若旧 SW
        // 仍提供旧 index.html/JS 而 CSS 未缓存，页面会退化为浏览器默认样式。
        // CSS 通常远小于图片和页面 JS，完整预缓存可保证应用壳版本一致。
        globPatterns: [
          'index.html',
          'static/js/app-*.js',
          'static/js/{vue-vendor,state-vendor,auth-store,ui-components,supabase-vendor,ui-icons,vue-utils-vendor}-*.js',
          'static/css/*.css',
          'static/fonts/*.{woff,woff2}',
        ],
        cleanupOutdatedCaches: true,
        // 强制更新：新 Service Worker 立即激活，不等待旧页面关闭
        skipWaiting: true,
        clientsClaim: true,
        // 运行时缓存策略
        runtimeCaching: [
          {
            // M-5 修复：仅缓存 Supabase Storage 公开对象（图片等），
            // /auth/v1/ 和 /rest/v1/ 完全不缓存，防止跨用户数据泄露。
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage-public',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cloudinary 图片：Stale-While-Revalidate
            urlPattern: /^https:\/\/(cdn\.blockofhome\.cn|res\.cloudinary\.com)\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cloudinary',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'Block of Home',
        short_name: 'BOH',
        description: 'Block of Home - 你的家居灵感社区',
        theme_color: '#79a947',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],

  // CSS 后处理：压缩（Tailwind v4 已内置 autoprefixer）
  css: {
    postcss: {
      plugins: [
        cssnano({ preset: 'default' }),
      ],
    },
  },

  // 路径别名配置
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@views': resolve(__dirname, 'src/views'),
      '@data': resolve(__dirname, 'src/data'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@styles': resolve(__dirname, 'src/styles'),
    }
  },

  // 构建配置
  build: {
    // 指定输出目录
    outDir: 'dist',
    // 指定静态资源目录
    assetsDir: 'static',
    // 提高 chunk 大小警告阈值（与 check-bundle-size.sh 保持一致）
    chunkSizeWarningLimit: 600,
    // 代码分割
    rollupOptions: {
      output: {
        // 优化 chunk 文件名
        chunkFileNames: 'static/js/[name]-[hash].js',
        entryFileNames: 'static/js/app-[hash].js',
        // 优化长期缓存
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          const ext = name.split('.').pop();
          let extType = ext;

          if (/^(mp4|webm|ogg|mp3|wav|flac|aac)$/.test(extType)) {
            extType = 'media';
          } else if (/^(png|jpe?g|gif|svg|ico|webp)$/.test(extType)) {
            extType = 'images';
          } else if (/^(woff2?|eot|ttf|otf)$/.test(extType)) {
            extType = 'fonts';
          } else if (/^(css)$/.test(extType)) {
            extType = 'css';
          }
          return `static/${extType}/[name]-[hash].[ext]`;
        },
        // 代码分割
        manualChunks(id) {
          // ============================================
          // 文档处理库（拆分为多个 chunk，避免单 chunk 超过 800KB）
          // ============================================
          // docx 库独立（约 500KB+）
          if (id.includes('node_modules/docx')) return 'docx-vendor';
          // mammoth 库独立（约 200KB+）
          if (id.includes('node_modules/mammoth')) return 'mammoth-vendor';
          // jszip + xmlbuilder + @xmldoc 等辅助库
          if (id.includes('node_modules/jszip')) return 'doc-utils-vendor';
          if (id.includes('node_modules/xmlbuilder')) return 'doc-utils-vendor';
          if (id.includes('node_modules/@xmldom/xmldom')) return 'doc-utils-vendor';
          if (id.includes('node_modules/bluebird')) return 'doc-utils-vendor';
          if (id.includes('node_modules/underscore')) return 'doc-utils-vendor';
          if (id.includes('node_modules/dingbat-to-unicode')) return 'doc-utils-vendor';

          // ============================================
          // 状态管理（首屏必需，但独立缓存）
          // ============================================
          if (id.includes('node_modules/pinia')) return 'state-vendor';
          if (id.includes('node_modules/pinia-plugin-persistedstate')) return 'state-vendor';

          // ============================================
          // Vue 工具库（多页面使用）
          // ============================================
          if (id.includes('node_modules/@vueuse/core')) return 'vue-utils-vendor';
          if (id.includes('node_modules/@vueuse/shared')) return 'vue-utils-vendor';
          if (id.includes('node_modules/@vueuse/motion')) return 'vue-utils-vendor';

          // ============================================
          // Markdown 和代码高亮（BOHAI/论坛使用）
          // ============================================
          if (id.includes('node_modules/marked')) return 'markdown-vendor';
          if (id.includes('node_modules/highlight.js')) return 'markdown-vendor';

          // ============================================
          // 图片处理库（特定功能使用）
          // ============================================
          if (id.includes('node_modules/html2canvas')) return 'image-processing-vendor';
          if (id.includes('node_modules/file-saver')) return 'image-processing-vendor';
          // canvas-confetti（庆祝动画，特定功能使用）
          if (id.includes('node_modules/canvas-confetti')) return 'confetti-vendor';
          // 图片压缩库（特定功能使用）
          if (id.includes('node_modules/browser-image-compression')) return 'image-compression-vendor';
          // 图片裁剪库（头像裁剪使用）
          if (id.includes('node_modules/vue-advanced-cropper')) return 'cropper-vendor';

          // ============================================
          // 已有的命名 chunk
          // ============================================
          if (id.includes('node_modules/pptxgenjs')) return 'ppt-vendor';
          if (id.includes('node_modules/vue/') || id.includes('node_modules/vue-router/') || id.includes('node_modules/@vue/')) return 'vue-vendor';
          if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor';
          if (id.includes('node_modules/lucide-vue-next')) return 'ui-icons';
          if (id.includes('node_modules/dompurify')) return 'ui-sanitize';
          if (id.includes('src/components/UnifiedNavbar')) return 'ui-components';
          if (id.includes('src/components/Footer.vue')) return 'ui-components';
          if (id.includes('src/stores/auth.ts')) return 'auth-store';
          if (id.includes('src/data/products.js')) return 'content-datasets';

        },
      },
    },
    // 启用 CSS 分割，降低首屏阻塞体积
    cssCodeSplit: true,
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        // 生产环境移除 console 和 debugger
        drop_console: true,
        drop_debugger: true,
        passes: 2, // 进行两遍压缩
        toplevel: true, // 在顶级作用域压缩
      },
      // 混淆代码
      mangle: true,
      // 模块化压缩
      module: true,
      // 生成source map
      sourceMap: false,
    },
    // 目标浏览器
    target: 'es2022',
    // 禁用 modulepreload polyfill（target es2022 浏览器原生支持）
    modulePreload: {
      polyfill: false,
    },
    // 启用图片优化 - 4KB以下的资源内联为 base64
    assetsInlineLimit: 4096,
    // 优化静态资源处理
    emptyOutDir: true,
  },

  // 依赖预构建优化
  optimizeDeps: {
    include: [
      'vue', 'vue-router', 'pinia', 'pinia-plugin-persistedstate',
      '@supabase/supabase-js', '@vueuse/core', '@vueuse/motion',
      'marked', 'highlight.js', 'dompurify', 'lucide-vue-next',
    ],
  },

  // 开发服务器配置
  server: {
    port: 5173,
    // 避免已有开发服务时静默启动到 5174，导致浏览器仍停留在旧实例。
    strictPort: true,
    open: false,
    // 启用 CORS
    cors: true,
    // 开发环境必须始终从 Vite 读取最新入口与模块。
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },

  // 预览服务器配置
  preview: {
    port: 4173,
  }
})
