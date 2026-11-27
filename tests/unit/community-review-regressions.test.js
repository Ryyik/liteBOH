import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

const read = (relPath) => readFileSync(resolve(import.meta.dirname, '../..', relPath), 'utf8');
const scriptOf = (relPath) => squeezeSource(stripComments(scriptSection(read(relPath))));
const wholeOf = (relPath) => squeezeSource(read(relPath));

describe('community and theme review regressions', () => {
  it('从三级设置页切另一组时，一次 replace 同时清掉 view/panel', () => {
    const code = scriptOf('src/views/user-center/UserSpace/UserSpaceMain.vue');
    const start = code.indexOf('const openSettingsGroup =');
    const end = code.indexOf('const closeSettingsGroup =', start);
    const body = code.slice(start, end);
    expect(body).toContain('delete nextQuery.view');
    expect(body).toContain('delete nextQuery.panel');
    expect(body).toContain('hasStaleLayers');
    expect(body.match(/router\.replace/g)).toHaveLength(1);
  });

  it('更多菜单打开时左栏堆叠层级高于 AI 会话侧栏', () => {
    const whole = wholeOf('src/views/user-center/UserSpace/components/UserSpaceSideRail.vue');
    const css = wholeOf('src/views/user-center/UserSpace/components/side-rail.css');
    expect(whole).toContain("'is-more-open': moreOpen");
    expect(css).toMatch(
      /\.userspace-rail\.is-more-open\s*\{[^}]*z-index:\s*(?:4\d|[5-9]\d|\d{3,})/,
    );
  });

  it('暗色成员页不再使用蓝紫旧表面色', () => {
    const css = wholeOf('src/views/user-center/UserSpace/styles/shell-community.css');
    expect(css).not.toContain('#181a20');
    expect(css).not.toContain('#1a1a24');
    expect(css).not.toContain('#252532');
  });

  it('暗色账户安全页使用纯黑页底而不是蓝色渐变', () => {
    const css = wholeOf('src/styles/themes/user-center-dark.css');
    expect(css).not.toContain('#09111d');
    expect(css).not.toContain('#0c1625');
    expect(css).not.toContain('#0f1a2b');
    expect(css).toContain('background: var(--boh-page-bg) !important');
  });
});
