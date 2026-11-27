import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');

describe('portfolio review regressions', () => {
  it('手动关闭动效后桌面画廊退化为可横滑状态', () => {
    const gallery = read('boh-portfolio-site/voss-portfolio/src/components/HorizontalGallery.tsx');
    const css = read('boh-portfolio-site/voss-portfolio/src/styles/global.css');
    expect(gallery).toContain('useMotionControl');
    expect(gallery).toContain('!enabled');
    expect(css).toContain("html[data-motion='off'] .h-viewport");
    expect(css).toMatch(/html\[data-motion='off'\] \.h-viewport\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('页面擦除定时器可取消，外部返回不会再把用户推走', () => {
    const code = read('boh-portfolio-site/voss-portfolio/src/lib/transition.tsx');
    expect(code).toContain('useNavigationType');
    expect(code).toContain('startLocationKey');
    expect(code).toContain("navigationType === 'POP'");
    expect(code).toContain('pendingDestination');
    expect(code).toContain('clearTimeout');
    expect(code).toContain('cancelAnimationFrame');
  });

  it('手机菜单打开后焦点进入对话框并循环 Tab', () => {
    const code = read('boh-portfolio-site/voss-portfolio/src/components/Nav.tsx');
    expect(code).toContain('dialogRef');
    expect(code).toContain("event.key !== 'Tab'");
    expect(code).toContain('focusable');
    expect(code).toContain('.focus()');
  });

  it('TSX 纳入根 lint，作品集进入门禁映射且失效探针已移除', () => {
    const eslint = read('eslint.config.js');
    const map = JSON.parse(read('scripts/lib/gate-map.json'));
    expect(eslint).toContain('**/*.{ts,tsx}');
    expect(JSON.stringify(map)).not.toContain('probe-global-search.mjs');
    expect(map.entries.some((entry) => entry.glob.startsWith('boh-portfolio-site/'))).toBe(true);
  });

  it('作品集 README 与 BOH 中文站点及 Node 版本一致', () => {
    const readme = read('boh-portfolio-site/voss-portfolio/README.md');
    expect(readme).not.toContain('Elias Voss');
    expect(readme).not.toContain('vossRoll');
    expect(readme).toContain('bohRoll');
    expect(readme).toContain('Node.js ≥ 22.6');
    expect(readme).toContain('中文');
  });
});
