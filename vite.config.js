import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import viteImagemin from 'vite-plugin-imagemin'

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
    // 图片压缩插件 - 优化构建后的图片体积
    viteImagemin({
      // GIF 优化
      gifsicle: {
        optimizationLevel: 7,
        interlaced: false,
      },
      // PNG 优化
      optipng: {
        optimizationLevel: 7,
      },
      // JPEG 优化
      mozjpeg: {
        quality: 80,
        progressive: true,
      },
      // PNG 量化压缩
      pngquant: {
        quality: [0.7, 0.9],
        speed: 4,
      },
      // SVG 优化（icomoon.svg 为字体资源，关闭 svgo 以避免构建噪音报错）
      svgo: false,
      // WebP 转换和压缩
      webp: {
        quality: 80,
        method: 6,
      },
    }),
  ],

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
          const lowerName = name.toLowerCase();

          // icomoon.svg 实际是字体资源，放入 fonts 目录以避免按图片链路处理
          if (lowerName.includes('icomoon.svg')) {
            return 'static/fonts/[name]-[hash].[ext]';
          }

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
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'ui-components': [
            resolve(__dirname, 'src/components/UnifiedNavbar/index.vue'),
            resolve(__dirname, 'src/components/Footer.vue'),
          ],
          'auth-store': [
            resolve(__dirname, 'src/stores/auth.js'),
          ],
          'content-datasets': [
            resolve(__dirname, 'src/data/products.js'),
            resolve(__dirname, 'src/data/news.js'),
            resolve(__dirname, 'src/data/activities.js'),
          ],
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
    // chunk 大小警告限制
    chunkSizeWarningLimit: 1000,
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
