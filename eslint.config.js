import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
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
  }
];
