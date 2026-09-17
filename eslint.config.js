import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'dist-check/**', // 构建校验产物（minified），不参与 lint —— 与 dist 同性质，漏配会让 no-undef 在压缩产物上爆出海量误报
      '.build-verify/**', // 构建校验产物（minified），不参与 lint
      'node_modules/**',
      'coverage/**'
    ]
  },
  ...vue.configs['flat/base'],
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,cjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        defineProps: 'readonly',
        defineEmits: 'readonly',
        defineExpose: 'readonly',
        withDefaults: 'readonly',
        defineModel: 'readonly'
      }
    },
    rules: {
      // 未声明变量在 <script setup>（严格模式）里是运行时 ReferenceError，
      // 而 tsconfig 的 checkJs:false 让 vue-tsc 对纯 JS SFC 跳过语义检查 —— 这是唯一能拦住它的关卡。
      // 注意：仅对 js/vue 生效；.ts 走 vue-tsc 全量检查，开 no-undef 会误报类型名（如 _GettersTree）。
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/utils/auth', '@/utils/auth.js', '**/utils/auth', '**/utils/auth.js'],
            message: '请改为按需从 utils/api/* 或 utils/supabase-client.js 导入，避免聚合入口膨胀公共 chunk。'
          }
        ]
      }],
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-unused-vars': 'off'
    }
  },
  {
    // k6 压测脚本：__ENV / __VU / __ITER / insecureSkipTLSVerify 由 k6 运行时注入，非 import
    files: ['scripts/loadtest/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        insecureSkipTLSVerify: 'readonly'
      }
    }
  }
];
