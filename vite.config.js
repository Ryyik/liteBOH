import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import tailwindcss from '@tailwindcss/vite'
import cssnano from 'cssnano'

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
    // 构建产物可视化分析（生成 stats.html）
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'stats.html',
    }),
    // PWA Service Worker（静态资源预缓存 + 运行时缓存）
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // 预缓存所有静态资源（Cache-First）
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,webp,svg,ico}'],
        // 运行时缓存策略
        runtimeCaching: [
          {
            // Supabase API 请求：Network-First
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-supabase',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            // Cloudinary 图片：Stale-While-Revalidate
            urlPattern: /^https:\/\/cdn\.blockofhome\.cn\/.*/i,
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
        theme_color: '#42b983',
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
    // 提高 chunk 大小警告阈值（view-bohai 约 546 kB 略超默认 500 kB）
    chunkSizeWarningLimit: 1000,
    // 代码分割
    rollupOptions: {
      output: {
        // 优化 chunk 文件名
        chunkFileNames: 'static/js/[name]-[hash].js',
        entryFileNames: 'static/js/[name]-[hash].js',
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
          // 已有的命名 chunk
          if (id.includes('node_modules/vue') || id.includes('node_modules/vue-router')) return 'vue-vendor';
          if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor';
          if (id.includes('node_modules/lucide-vue-next')) return 'ui-icons';
          if (id.includes('node_modules/dompurify')) return 'ui-sanitize';
          if (id.includes('src/components/UnifiedNavbar')) return 'ui-components';
          if (id.includes('src/components/Footer.vue')) return 'ui-components';
          if (id.includes('src/stores/auth.ts')) return 'auth-store';
          if (id.includes('src/data/products.js') || id.includes('src/data/news.js') || id.includes('src/data/activities.js')) return 'content-datasets';

          // 大视图独立 chunk（经排查 BOHAI 与 DataManagement 无循环依赖，拆分为独立 chunk 降低单文件体积）
          if (id.includes('src/views/user-center/UserSpace/')) return 'view-userspace';
          if (id.includes('src/views/BOHAI/')) return 'view-bohai';
          if (id.includes('src/views/DataManagement/')) return 'view-admin';
          if (id.includes('src/views/Profile/')) return 'view-profile';
          if (id.includes('src/views/user-center/Cloud+/')) return 'view-cloudplus';
          if (id.includes('src/views/PostDetail/')) return 'view-postdetail';
          if (id.includes('src/views/Forum/')) return 'view-forum';
        },
        // 自动代码分割
        experimentalMinChunkSize: 20000,
      },
      // 优化依赖打包
      cache: true,
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
        // 优化代码
        pure_funcs: ['console.log', 'console.warn'],
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
    target: 'es2021',
    // 启用 modulepreload polyfill，确保关键 chunk (auth-store, supabase-vendor) 预加载
    modulePreload: {
      polyfill: true,
      // 不预加载 view 级别 chunk，它们由路由懒加载按需触发，避免首屏下载冗余 JS
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/view-(bohai|admin|postdetail|profile|userspace|forum|cloudplus)/.test(dep)),
    },
    // 启用图片优化 - 4KB以下的资源内联为 base64
    assetsInlineLimit: 4096,
    // 优化静态资源处理
    emptyOutDir: true,
  },

  // 开发服务器配置
  server: {
    port: 5173,
    open: false,
    // 启用 CORS
    cors: true,
  },

  // 预览服务器配置
  preview: {
    port: 4173,
  }
})
