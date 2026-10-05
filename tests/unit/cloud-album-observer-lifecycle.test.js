import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const view = stripComments(
  scriptSection(
    readFileSync(resolve(root, 'src/views/user-center/Cloud+/CloudPlusMain.vue'), 'utf8'),
  ),
);

describe('Cloud+ 图库 ResizeObserver 生命周期', () => {
  it('条件渲染节点重建后重新测量并绑定 observer', () => {
    expect(view).toMatch(/watch\(\s*albumSectionRef[\s\S]*?observeAlbumSection\(section\)/);
    expect(view).toContain('lastAlbumSectionWidth = 0');
    expect(view).toMatch(/function observeAlbumSection\(section\)[\s\S]*?new ResizeObserver/);
    expect(view).toContain('disconnectAlbumResizeObserver();');
  });
});
