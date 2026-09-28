import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/**',
      'dist-check/**', // 构建校验产物（minified），不参与 lint —— 与 dist 同性质，漏配会让 no-undef 在压缩产物上爆出海量误报
      '.build-verify/**', // 构建校验产物（minified），不参与 lint
      'node_modules/**',
      'coverage/**',
    ],
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
        defineModel: 'readonly',
      },
    },
    rules: {
      // 未声明变量在 <script setup>（严格模式）里是运行时 ReferenceError，
      // 而 tsconfig 的 checkJs:false 让 vue-tsc 对纯 JS SFC 跳过语义检查 —— 这是唯一能拦住它的关卡。
      // 注意：仅对 js/vue 生效；.ts 走 vue-tsc 全量检查，开 no-undef 会误报类型名（如 _GettersTree）。
      'no-undef': 'error',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/utils/auth', '@/utils/auth.js', '**/utils/auth', '**/utils/auth.js'],
              message:
                '请改为按需从 utils/api/* 或 utils/supabase-client.js 导入，避免聚合入口膨胀公共 chunk。',
            },
          ],
        },
      ],
      // 空 catch 必须写明理由。
      // ESLint 的 no-empty 认为「块内有注释就不算空」，所以打开它 = 强制每处空 catch
      // 都留下「为什么可以吞」的说明 —— 这正是「显性化」想要的效果，而且是**机器强制**的，
      // 不依赖后来者自觉（写在文档里的约定会被忘记，能被 CI 拦下的不会）。
      // 注意 allowEmptyCatch 必须显式设 false：默认 true 会放行空 catch。
      'no-empty': ['error', { allowEmptyCatch: false }],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      // .ts 走的是本块，**不会**继承上面 js/vue 块里的规则 —— 漏配会让 .ts 里的
      // 空 catch 悄悄逃过「必须写明理由」的约束（实测漏掉了 stores/products.ts 等 5 处）。
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
  {
    // k6 压测脚本：__ENV / __VU / __ITER / insecureSkipTLSVerify 由 k6 运行时注入，非 import
    files: ['scripts/loadtest/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        insecureSkipTLSVerify: 'readonly',
      },
    },
  },
  {
    // 浏览器探针（Playwright）：**明确豁免 no-empty**。
    // 理由：探针里 24 处空 catch 全是刻意的 best-effort（试写 localStorage、试开
    // PerformanceObserver、试点一个可能不存在的菜单），而且失败模式是「随后的断言红」，
    // 不是「静默 bug」—— 不构成假绿。把它们逐一注释只会变成噪声，并让人习惯性忽略
    // 这条规则，那才是规则腐烂的开始。
    // 这里选择**显式豁免并写明理由**，而不是假装它们不存在。
    // 注意：`scripts/` 下其余文件（尤其是 check-*.mjs 门禁）**不豁免** ——
    // 门禁里吞错会直接变成假绿，那正是本仓库最该防的东西。
    files: ['scripts/probes/**/*.mjs'],
    rules: { 'no-empty': 'off' },
  },
  // 必须压在最后：关掉所有与 Prettier 冲突的格式化类规则，
  // 否则 eslint --fix 和 prettier --write 会互相拉锯，diff 里一半是噪音。
  prettier,
];
