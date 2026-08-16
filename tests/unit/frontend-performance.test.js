import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(import.meta.dirname, `../../${file}`), 'utf8');

describe('frontend performance guardrails', () => {
  it('does not initialize the third-party AI SDK during app boot', () => {
    const source = read('src/main.js');
    expect(source).not.toMatch(/initHiagentWidget\(/);
    expect(read('src/utils/hiagent-widget.js')).toMatch(/首次打开时初始化|toggleHiagentChat/);
  });

  it('defers below-the-fold home hero component mounting', () => {
    expect(read('src/views/Home/index.vue')).toMatch(/:eager="heroIndex === 0"/);
    expect(read('src/views/Home/components/HomeHeroRow.vue')).toMatch(/IntersectionObserver/);
    expect(read('src/views/Home/components/HomeHeroRow.vue')).toMatch(/rootMargin: '800px 0px'/);
    expect(read('src/views/Home/components/HomeHeroRow.vue')).toMatch(/min-height: min\(720px, 78vh\)/);
  });

  it('keeps document and PPT engines behind user actions', () => {
    expect(read('src/views/Lab/composables/usePPTGenerator.js')).not.toMatch(/from ['"]\.\.\/engine\/ppt-renderer/);
    expect(read('src/views/Lab/composables/useWordGenerator.js')).not.toMatch(/from ['"]\.\.\/engine\/word-builder/);
    expect(read('src/views/Lab/index.vue')).toMatch(/import\('\.\/engine\/docx-parser\.js'\)/);
  });

  it('pre-caches app shell plus first-screen dependency chunks', () => {
    const source = read('vite.config.js');
    // 离线白屏回归修复：main.js 静态依赖 @vueuse/motion 与首页 supabase，
    // 首屏依赖 chunk（supabase-vendor/ui-icons/vue-utils-vendor）必须随应用壳预缓存。
    expect(source).toMatch(
      /vue-vendor,state-vendor,auth-store,ui-components,supabase-vendor,ui-icons,vue-utils-vendor/,
    );
  });
});
