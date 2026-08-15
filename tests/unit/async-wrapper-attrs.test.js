import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/**
 * 验证所有异步懒加载入口 wrapper 是否正确透传 $attrs。
 */
 
 const projectRoot = resolve(import.meta.dirname, '../..');
 
 const entries = [
  {
    name: 'UserSpace',
    path: 'src/views/user-center/UserSpace/index.vue',
    mainFile: 'UserSpaceMain.vue',
    mainVar: 'UserSpaceMain',
    // UserSpace 已改为静态导入 + v-bind="$attrs" 直接透传（嵌入式 tab 容器，无异步边界）
    async: false,
  },
  {
    name: 'BOHAI',
    path: 'src/views/BOHAI/BOHAI/index.vue',
    mainFile: 'BOHAIMain.vue',
    mainVar: 'BOHAIMain',
    // BOHAI uses direct import instead of defineAsyncComponent + Suspense
    async: false,
  },
  {
    name: 'Profile',
    path: 'src/views/Profile/index.vue',
    mainFile: 'ProfileMain.vue',
    mainVar: 'ProfileMain',
  },
  {
    name: 'Cloud+',
    path: 'src/views/user-center/Cloud+/index.vue',
    mainFile: 'CloudPlusMain.vue',
    mainVar: 'CloudPlusMain',
  },
  {
    name: 'PostDetail',
    path: 'src/views/PostDetail/index.vue',
    mainFile: 'PostDetailMain.vue',
    mainVar: 'PostDetailMain',
  },
  {
    name: 'DataManagement',
    path: 'src/views/DataManagement/index.vue',
    mainFile: 'DataAdmin.vue',
    mainVar: 'DataAdmin',
  },
];

function readEntryFile(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

function extractTemplate(content) {
  // Greedy match to handle nested <template #default> / <template #fallback> inside <Suspense>
  const match = content.match(/<template>([\s\S]*)<\/template>/);
  return match ? match[1].trim() : '';
}

function extractScriptSetup(content) {
  const match = content.match(/<script setup>([\s\S]*?)<\/script>/);
  return match ? match[1].trim() : '';
}

describe('async wrapper attrs pass-through', () => {
  entries.forEach((entry) => {
    const isAsync = entry.async !== false;

    describe(`${entry.name} (${entry.path})`, () => {
      const content = readEntryFile(entry.path);
      const template = extractTemplate(content);
      const script = extractScriptSetup(content);

      it('uses defineAsyncComponent for lazy loading', () => {
        if (!isAsync) return;
        expect(script).toMatch(/defineAsyncComponent/);
      });

      it(`imports ${entry.mainFile} via dynamic import`, () => {
        if (!isAsync) return;
        const escapedFile = entry.mainFile.replace(/\./g, '\\.');
        const importPattern = new RegExp(`import\\(['"]\\.\\/${escapedFile}['"]\\)`);
        expect(script).toMatch(importPattern);
      });

      it('wraps the main component in <Suspense>', () => {
        if (!isAsync) return;
        expect(template).toMatch(/<Suspense>/);
        expect(template).toMatch(/<\/Suspense>/);
      });

      it('renders the main component inside <Suspense>', () => {
        if (!isAsync) return;
        const suspenseContent = template.match(/<Suspense>([\s\S]*?)<\/Suspense>/);
        expect(suspenseContent).not.toBeNull();
        const tagPattern = new RegExp(`<${entry.mainVar}[\\s/>]`);
        expect(suspenseContent[1]).toMatch(tagPattern);
      });

      it('has v-bind="$attrs" to pass through props and event listeners', () => {
        const attrsPattern = new RegExp(`<${entry.mainVar}\\s[^>]*v-bind="\\\\?\\$attrs"`);
        expect(template).toMatch(attrsPattern);
      });

      it('has main component inside <Suspense> default slot', () => {
        if (!isAsync) return;
        const suspenseMatch = template.match(/<Suspense>([\s\S]*?)<\/Suspense>/);
        const inner = suspenseMatch[1].trim();
        const tagPattern = new RegExp(`<${entry.mainVar}[\\s/>]`);
        expect(inner).toMatch(tagPattern);
      });
    });
  });

  describe('backup files do NOT have v-bind="$attrs" (discriminating power)', () => {
    it('_archive backup directory has been cleaned up', () => {
      const archivePath = resolve(projectRoot, 'src/views/_archive');
      expect(existsSync(archivePath)).toBe(false);
    });
  });

  describe('known consumers pass props/emits (regression guard)', () => {
    it('async-loaders.js loads ForumMain.vue directly (no double-wrap)', () => {
      const asyncLoaders = readEntryFile('src/views/user-center/UserSpace/async-loaders.js');
      expect(asyncLoaders).toMatch(/import\(['"]@\/views\/Forum\/ForumMain\.vue['"]\)/);
      expect(asyncLoaders).not.toMatch(/import\(['"]@\/views\/Forum\/index\.vue['"]\)/);
    });

    it('async-loaders.js loads BOHAIMain.vue directly (no double-wrap)', () => {
      const asyncLoaders = readEntryFile('src/views/user-center/UserSpace/async-loaders.js');
      expect(asyncLoaders).toMatch(/import\(['"]@\/views\/BOHAI\/BOHAI\/BOHAIMain\.vue['"]\)/);
      expect(asyncLoaders).not.toMatch(/import\(['"]@\/views\/BOHAI\/BOHAI\/index\.vue['"]\)/);
    });

    it('async-loaders.js loads CloudPlusMain.vue directly (no double-wrap)', () => {
      const asyncLoaders = readEntryFile('src/views/user-center/UserSpace/async-loaders.js');
      expect(asyncLoaders).toMatch(/import\(['"]@\/views\/user-center\/Cloud\+\/CloudPlusMain\.vue['"]\)/);
      expect(asyncLoaders).not.toMatch(/import\(['"]@\/views\/user-center\/Cloud\+\/index\.vue['"]\)/);
    });
  });
});