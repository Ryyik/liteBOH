import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import purgecss from 'vite-plugin-purgecss'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  // 设置基础路径为相对路径，确保在开发和构建后都能正确加载资源
  base: './',
  
  plugins: [
    vue(),
  ],
  
  // 路径别名配置
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@views': resolve(__dirname, 'src/views'),
      '@config': resolve(__dirname, 'src/config'),
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
          let extType = assetInfo.name.split('.').pop();
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
            resolve(__dirname, 'src/components/UnifiedNavbar.vue'),
            resolve(__dirname, 'src/components/Footer.vue'),
          ],
        },
        // 自动代码分割
        experimentalMinChunkSize: 20000,
      },
      // 优化依赖打包
      cache: true,
    },
    // 启用 CSS 代码分割
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
    // 启用图片优化
    assetsInlineLimit: 4096, // 4KB以下的资源内联
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
