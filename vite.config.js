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

// ============================================
// NSFW 模型裁剪插件（B1 补丁，修复 bundle 体积闸门）
// 业务仅加载 MobileNetV2（forum-image-moderation.js 默认模型），但 nsfwjs 的
// default_models.js 静态注册全部三个模型，rollup 会把 inception_v3（约 30MB）与
// mobilenet_v2_mid（约 5.7MB）的权重分片全量打进 dist，超出 check-bundle-size.sh
// 的 30MB 总体积闸门——dist 磁盘大小与是否被浏览器加载无关。
// 这里将两个未用模型的权重入口模块替换为空实现，使其权重分片不再产出；
// 运行时行为不变（这两个模型本就不会被加载）。
// 注意：若未来要启用 InceptionV3 / MobileNetV2Mid，需先移除此插件。
// ============================================
function nsfwjsTreeShakePlugin() {
  const VIRTUAL_ID = '\0nsfwjs-unused-model-stub'
  const UNUSED_MODEL_IMPORTS = /model_imports\/(inception_v3|mobilenet_v2_mid)\.js$/
  return {
    name: 'nsfwjs-tree-shake',
    enforce: 'pre',
    resolveId(source) {
      if (UNUSED_MODEL_IMPORTS.test(source)) return VIRTUAL_ID
      return null
    },
    load(id) {
      if (id !== VIRTUAL_ID) return null
      return 'export const modelJson = () => Promise.resolve({});\nexport const weightBundles = [];\n'
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // 设置基础路径，使用相对路径 './' 以支持 Hash 路由和任意部署路径
  base: './',

  plugins: [
    nsfwjsTreeShakePlugin(),
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
        //
        // ⚠️ 这里的名单必须覆盖「入口 app-*.js 的全部静态 import（应用壳）」。
        // 当前壳依赖共 9 个：app、vue-vendor、vue-utils-vendor、ui-icons、
        // ui-components（导航栏/页脚）、supabase-vendor、state-vendor、auth-store、
        // ui-sanitize。漏掉任何一个，旧壳在弱网/离线时都会因缺模块而整个起不来
        // （表现为全白，连导航栏都没有）——ui-sanitize 就曾因后加入 manualChunks
        // 而未同步到此名单。改动 manualChunks 后请同步核对本名单。
        globPatterns: [
          'index.html',
          'static/js/app-*.js',
          'static/js/{vue-vendor,state-vendor,auth-store,ui-components,supabase-vendor,ui-icons,vue-utils-vendor,ui-sanitize}-*.js',
          'static/css/*.css',
          // 无自托管字体（首屏走系统字体栈，见 index.html），故不列 static/fonts——
          // 列了会匹配 0 文件，workbox 每次构建都吐一条 warning，掩盖真正的不匹配。
        ],
        cleanupOutdatedCaches: true,
        // 强制更新：新 Service Worker 立即激活，不等待旧页面关闭
        skipWaiting: true,
        clientsClaim: true,
        // Web Push 的 push / notificationclick 处理器。
        //
        // generateSW 策略不给写自定义 SW 代码，importScripts 是唯一的注入入口：
        // 生成器会在 sw.js 顶部加一行 importScripts('/push-sw.js')，浏览器安装
        // SW 时按普通请求拉取该文件（所以它的缓存策略在 public/_headers 里单独钉住）。
        //
        // ⚠️ 这份文件同时是「删不得」的：删掉 public/push-sw.js 后线上 sw.js 会
        //    importScripts 到一个 404，整个 SW 装不上 → PWA 直接失效（离线全白）。
        //    要下线推送请改成空文件，不要删除。
        //
        // ⚠️ 改 push-sw.js 本身**不会触发 SW 更新**：浏览器靠比对 sw.js 的字节判断有没有
        //    新版本，而 push-sw.js 只是它 importScripts 进来的运行时依赖 —— sw.js 字节
        //    不变就永远不会重新安装。所以改完推送逻辑，必须让 sw.js 也产生一次变化
        //    （例如在此处加一行注释、或调整任一 workbox 选项）再发布。
        importScripts: ['push-sw.js'],
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
          {
            // B2：NSFW 检测模型链缓存。权重 + tfjs/nsfwjs 运行时 chunk 均为 hash 文件名
            // （内容不可变），CacheFirst 永久缓存后二次会话零下载，SW 重装也不重复拉取
            urlPattern: /\/static\/js\/(tfjs-vendor|nsfw-vendor|nsfw-weights)-[A-Za-z0-9_-]+\.js$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nsfw-model-vendor',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // ⚠️ 图标必须走 scripts/generate-app-icons.mjs 的产物，不要再指向 favicon.png：
      // 那是 1024×1024 的透明底方图，图形本体只占中间 768×896，
      // 声明成 192/512 属于谎报尺寸（桌面图标发虚），直接当 maskable 用
      // 还会被系统裁圆切掉苹果的梗和底部。
      manifest: {
        // id 用于在浏览器/系统里唯一标识这个已安装应用，改它会变成另一个应用
        id: '/',
        name: 'Block of Home',
        short_name: 'BOH',
        description: 'Block of Home - 你的家居灵感社区',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        theme_color: '#79a947',
        background_color: '#ffffff',
        categories: ['social', 'lifestyle'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
        ],
        // 长按桌面图标弹出的快捷入口。hash 路由，所以是 /#/xxx。
        shortcuts: [
          {
            name: '论坛',
            short_name: '论坛',
            url: '/#/forum',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: '活动',
            short_name: '活动',
            url: '/#/activities-wall',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: '消息',
            short_name: '消息',
            url: '/#/user-space/messages',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
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
          // NSFW 检测模型链（模型本地化 B1/B2）
          // tfjs 运行时 / nsfwjs 运行时 / 包内权重脚本（UMD，由 nsfwjs 动态 import）
          // 只固定 MobileNetV2 权重 chunk 名（默认模型）；inception_v3 / mobilenet_v2_mid
          // 的权重入口已被 nsfwjsTreeShakePlugin 替换为空实现，不会产出任何 chunk
          // ============================================
          if (id.includes('nsfwjs/dist/models/mobilenet_v2/')) return 'nsfw-weights';
          if (id.includes('node_modules/nsfwjs')) return 'nsfw-vendor';
          if (id.includes('node_modules/@tensorflow')) return 'tfjs-vendor';

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
