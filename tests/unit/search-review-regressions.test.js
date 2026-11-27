import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const scriptOf = (relPath) => squeezeSource(stripComments(scriptSection(read(relPath))));
const wholeOf = (relPath) => squeezeSource(read(relPath));

describe('search review regressions', () => {
  it('论坛与全屏搜索共用同一份历史实现，不再各存一份快照', () => {
    const code = scriptOf('src/views/Forum/composables/useForumFeedQuery.js');
    expect(code).toContain('useSearchHistory');
    expect(code).not.toContain("const SEARCH_HISTORY_KEY = 'boh-forum-search-history'");
    expect(code).not.toContain('const readSearchHistory =');
  });

  it('帖子检索把 API error 当失败，不再伪装成空结果', () => {
    const code = scriptOf('src/views/Search/SearchPage.vue');
    expect(code).toMatch(/const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await\s+getPosts/);
    expect(code).toContain('if (error) throw error');
  });

  it('搜索页卸载时清防抖并作废在途响应', () => {
    const code = scriptOf('src/views/Search/SearchPage.vue');
    const unmount = code.slice(
      code.indexOf('onBeforeUnmount('),
      code.indexOf('watch(', code.indexOf('onBeforeUnmount(')),
    );
    expect(unmount).toContain('clearTimeout(debounceTimer)');
    expect(unmount).toContain('searchSeq += 1');
  });

  it('显式提交把查询词写入 URL，详情返回后可恢复', () => {
    const code = scriptOf('src/views/Search/SearchPage.vue');
    const start = code.indexOf('const onSubmit =');
    const end = code.indexOf('const applyHistoryKeyword =', start);
    const body = code.slice(start, end);
    expect(body).toContain('router.replace');
    expect(body).toContain('q: keyword.value');
  });

  it('搜索结果作者名可进入主页，不再被卡片吞掉点击', () => {
    const code = scriptOf('src/views/Search/SearchPage.vue');
    const whole = wholeOf('src/views/Search/SearchPage.vue');
    expect(whole).toContain('@go-to-profile="openProfile"');
    expect(code).toMatch(
      /const\s+openProfile\s*=\s*\(username\)\s*=>\s*\{[\s\S]*router\.push\(`\/profile\//,
    );
  });
});
