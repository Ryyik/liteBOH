import assert from 'node:assert/strict';
import test from 'node:test';
import { about, capabilities, projects, site } from '../src/content/site.ts';

test('方块之家内容与七个精选项目已就位', () => {
  assert.equal(site.name, '方块之家 BOH');
  assert.deepEqual(
    site.nav.map((item) => item.label),
    ['作品', '关于', '联系'],
  );
  assert.equal(projects.length, 7);
  assert.equal(about.paragraphs.length, 3);
  assert.equal(capabilities.length, 4);
  assert.deepEqual(
    projects.map((project) => project.title),
    [
      'Origin Map',
      'Server Play',
      'Anniversary',
      'New Year',
      'Block Street',
      'Winter Community',
      'Cloud Cafe',
    ],
  );
  assert.equal(about.portrait, '/images/boh/about-anniversary.jpg');
  assert.ok(projects.every((project) => project.cover.startsWith('/images/boh/')));
  assert.ok(projects.every((project) => project.images.length === 2));
});
