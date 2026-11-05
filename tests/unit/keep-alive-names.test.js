/**
 * keep-alive-names.test.js —— 路由缓存白名单的「两处必须逐字相同」
 *
 * 背景（2026-11-05 用户报障「底部导航栏切换到图库还是会整页重载」）：
 * App.vue 的 <KeepAlive :include> 是按**组件名**匹配的。include 名单由路由表的
 * `meta.keepAliveName` 生成，而真正的名字写在路由组件里的 `defineOptions({ name })`。
 * 两处不一致时**不会有任何报错**，只会静默不缓存 —— 表现就是「页面每次整页重挂」，
 * 而且看起来跟「没加 keepAlive」一模一样，排查代价极高（本次就是这么来的）。
 *
 * 所以这里用源码级断言把两者钉在一起：
 *   ① 每条 `meta.keepAlive` 的路由都必须给 `keepAliveName`（字符串、非空、不重复）；
 *   ② 该路由组件的文件里必须真有 `defineOptions({ name: '<同一个名字>' })`；
 *   ③ App.vue 的 KeepAlive 必须**常驻**（不许再挂回 v-if）且用 include 白名单。
 *
 * 为什么不 import 组件本身：环境是 node（vitest.config 的 environment: 'node'），
 * 路由组件是 SFC + 一堆浏览器依赖，import 会把整棵图拖进来。这里只读源码文本，
 * 正则刻意放宽空白与引号，避免 prettier 重排把断言弄红。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicRoutes } from '../../src/router/routes/public.js';
import { userSpaceRoutes } from '../../src/router/routes/user-space.js';

const ROOT = resolve(import.meta.dirname, '../..');

const ALL_ROUTE_TABLES = { publicRoutes, userSpaceRoutes };

const collectKeepAliveRoutes = () => {
  const out = [];
  for (const [tableName, table] of Object.entries(ALL_ROUTE_TABLES)) {
    for (const record of table) {
      if (!record?.meta?.keepAlive) continue;
      out.push({ tableName, record });
    }
  }
  return out;
};

/**
 * 取路由组件文件的路径。
 * ⚠️ 两种形态都要认：源码里是 `() => import('../../views/x.vue')`，而 vitest 的
 * SSR 转换会把它改写成 `() => __vite_ssr_dynamic_import__("/src/views/x.vue")`
 * （实测字符串就是后者），只按 `import(` 匹配会全部落空。
 */
const componentSpecOf = (record) => {
  const source = typeof record.component === 'function' ? String(record.component) : '';
  const matched =
    source.match(/__vite_ssr_dynamic_import__\(\s*['"]([^'"]+)['"]\s*\)/) ||
    source.match(/import\(\s*['"]([^'"]+)['"]\s*\)/);
  return matched ? matched[1] : '';
};

const readSource = (spec) => {
  if (!spec) return '';
  // SSR 形态是项目根绝对路径（/src/views/…），源码形态是相对 src/router/routes 的 ../..
  const full = spec.startsWith('/')
    ? resolve(ROOT, `.${spec}`)
    : resolve(ROOT, 'src/router/routes', spec);
  return readFileSync(full, 'utf8');
};

/** 容忍 prettier 的换行/引号风格：defineOptions( { name: 'X' } ) */
const declaredNameOf = (source) => {
  const matched = source.match(
    /defineOptions\(\s*\{[\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?\}\s*\)/,
  );
  return matched ? matched[1] : '';
};

describe('KeepAlive 白名单（meta.keepAliveName ↔ defineOptions.name）', () => {
  const keepAliveRoutes = collectKeepAliveRoutes();

  it('至少存在一条缓存路由：名单为空说明这条测试已经不会再拦任何东西', () => {
    expect(keepAliveRoutes.length).toBeGreaterThan(0);
  });

  it('每条 keepAlive 路由都声明了 keepAliveName（字符串、非空）', () => {
    for (const { tableName, record } of keepAliveRoutes) {
      const name = record.meta?.keepAliveName;
      expect(
        typeof name === 'string' && name.trim().length > 0,
        `${tableName} 的 ${record.path} 声明了 meta.keepAlive 却没有 meta.keepAliveName —— ` +
          'include 名单里没有它，页面会静默退回「每次整页重挂」',
      ).toBe(true);
    }
  });

  it('keepAliveName 不重复：重名会让两个页面共用同一份缓存槽', () => {
    const seen = new Map();
    for (const { tableName, record } of keepAliveRoutes) {
      const name = String(record.meta?.keepAliveName || '');
      if (!name) continue;
      expect(
        seen.has(name),
        `keepAliveName「${name}」重复：${seen.get(name)} 与 ${tableName}/${record.path}`,
      ).toBe(false);
      seen.set(name, `${tableName}/${record.path}`);
    }
  });

  it('路由组件的 defineOptions.name 与 keepAliveName 逐字一致', () => {
    for (const { tableName, record } of keepAliveRoutes) {
      const expected = String(record.meta?.keepAliveName || '');
      if (!expected) continue;
      const spec = componentSpecOf(record);
      expect(spec, `${tableName} 的 ${record.path} 组件不是 () => import('…') 形态`).not.toBe('');
      const actual = declaredNameOf(readSource(spec));
      expect(
        actual,
        `${spec} 缺少 defineOptions({ name: '${expected}' }) —— ` +
          'KeepAlive 的 include 匹配的是组件名，缺了它这条路由就不会被缓存',
      ).toBe(expected);
    }
  });
});

describe('App.vue 的 KeepAlive 结构（回归护栏）', () => {
  const appSource = readFileSync(resolve(ROOT, 'src/App.vue'), 'utf8');

  it('KeepAlive 常驻，不许再挂 v-if', () => {
    // 2026-11-05 的根因：v-if 让容器随「当前页是否缓存」销毁 ⇒ 经过首页/周边时
    // 把图库、我、/ai-chat 的缓存一起带走。这条断言就是防它被写回去。
    expect(appSource).toMatch(/<KeepAlive\b(?![^>]*\bv-if\b)/);
  });

  it('缓存与否由 include 白名单决定，且名单来自路由表', () => {
    expect(appSource).toMatch(/<KeepAlive[^>]*:include="keepAliveNames"/);
    expect(appSource).toMatch(/meta\?\.keepAliveName/);
  });

  it(':key 对缓存页用 name、对不缓存页用 path（保住 /news/1 → /news/2 重建）', () => {
    expect(appSource).toMatch(
      /:key="activeRoute\.meta\?\.keepAlive \? activeRoute\.name : activeRoute\.path"/,
    );
  });
});
