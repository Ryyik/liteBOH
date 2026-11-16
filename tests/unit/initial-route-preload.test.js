import { describe, it, expect } from 'vitest';
import { collectInitialRouteChunks } from '../../scripts/lib/initial-route-preload.mjs';

/**
 * 这段逻辑的价值全在「不能静默失效」：
 * 它算错时构建照样成功、页面照样能开，只是首访白白多等一跳，或者多发出一个必然 404
 * 的 modulepreload。所以每个用例都沿着「把它改错就会红」的方向写 ——
 * 第 3、4、5 例分别是三次真实踩坑的反证。
 */

const chunk = (facadeModuleId, imports = [], extra = {}) => ({
  type: 'chunk',
  facadeModuleId,
  imports,
  dynamicImports: [],
  ...extra,
});

/** 一个贴近真实产物的最小 bundle：入口闭包 + 首页独有依赖 + 一条动态导入 */
const buildBundle = () => ({
  'static/js/app-HASH.js': chunk(
    '/repo/src/main.js',
    ['static/js/vue-HASH.js', 'static/js/ui-HASH.js'],
    {
      isEntry: true,
    },
  ),
  'static/js/vue-HASH.js': chunk(null),
  'static/js/ui-HASH.js': chunk(null),
  'static/js/index-HOME.js': chunk(
    '/repo/src/views/Home/index.vue',
    [
      'static/js/vue-HASH.js',
      'static/js/ui-HASH.js',
      'static/js/post-api-HASH.js',
      'static/js/style.css_vue_type_style_index_2_src_true_lang-HASH.js',
    ],
    {
      dynamicImports: ['static/js/ForumMain-HASH.js'],
    },
  ),
  'static/js/post-api-HASH.js': chunk('/repo/src/utils/api/post-api.js'),
  'static/js/ForumMain-HASH.js': chunk('/repo/src/views/Forum/ForumMain.vue'),
  // 只含 CSS 的虚拟模块：名字以 .js 结尾，产物却是 .css（磁盘上不存在）
  'static/js/style.css_vue_type_style_index_2_src_true_lang-HASH.js': chunk(null),
});

const existsOnDisk = (fileName) => !fileName.includes('css_vue_type_style');

describe('collectInitialRouteChunks', () => {
  it('只收「首页独有」的 JS：入口闭包与动态导入都不进清单', () => {
    const { files, dropped } = collectInitialRouteChunks(buildBundle(), { exists: existsOnDisk });

    expect(files).toEqual(['static/js/index-HOME.js', 'static/js/post-api-HASH.js']);
    // CSS 虚拟模块被 exists 剔除，且要留下痕迹（不能悄悄消失）
    expect(dropped).toEqual(['static/js/style.css_vue_type_style_index_2_src_true_lang-HASH.js']);
  });

  it('找不到首页 chunk 时给出原因，而不是静默返回空清单', () => {
    const bundle = buildBundle();
    delete bundle['static/js/index-HOME.js'];

    expect(collectInitialRouteChunks(bundle, { exists: existsOnDisk }).reason).toBe(
      'no-home-chunk',
    );
  });

  it('反证：不排除入口闭包，vue/ui 这些已 preload 的大件会混进来', () => {
    const bundle = buildBundle();
    // 把「入口」标记去掉 ⇒ 入口闭包为空集
    bundle['static/js/app-HASH.js'].isEntry = false;

    const { files } = collectInitialRouteChunks(bundle, { exists: existsOnDisk });
    expect(files).toContain('static/js/vue-HASH.js');
    expect(files).toContain('static/js/ui-HASH.js');
  });

  it('反证：不过滤磁盘上不存在的文件，就会留下一个必然 404 的 preload', () => {
    // 不传 exists（等价于「不做兜绝」）
    const { files, dropped } = collectInitialRouteChunks(buildBundle());

    expect(files).toContain('static/js/style.css_vue_type_style_index_2_src_true_lang-HASH.js');
    expect(dropped).toEqual([]);
  });

  it('反证：动态导入若被当成静态依赖，论坛流那 146 KB 会被塞进首屏窗口', () => {
    const bundle = buildBundle();
    // 把首页对 ForumMain 的动态引用改成静态引用
    bundle['static/js/index-HOME.js'].imports.push('static/js/ForumMain-HASH.js');

    const { files } = collectInitialRouteChunks(bundle, { exists: existsOnDisk });
    expect(files).toContain('static/js/ForumMain-HASH.js');
  });

  it('递归：依赖的依赖也在清单里（顺序不敏感，保证传递闭包完整）', () => {
    const bundle = buildBundle();
    bundle['static/js/post-api-HASH.js'].imports = ['static/js/forum-format-HASH.js'];
    bundle['static/js/forum-format-HASH.js'] = chunk('/repo/src/utils/forum-post-format.js');

    const { files } = collectInitialRouteChunks(bundle, { exists: existsOnDisk });
    expect(files).toContain('static/js/forum-format-HASH.js');
  });

  it('循环引用不会死循环', () => {
    const bundle = buildBundle();
    bundle['static/js/post-api-HASH.js'].imports = ['static/js/index-HOME.js'];

    expect(() => collectInitialRouteChunks(bundle, { exists: existsOnDisk })).not.toThrow();
  });

  it('bundle 为空或非对象时安全降级', () => {
    expect(collectInitialRouteChunks(null).reason).toBe('no-bundle');
    expect(collectInitialRouteChunks(undefined).files).toEqual([]);
  });
});
