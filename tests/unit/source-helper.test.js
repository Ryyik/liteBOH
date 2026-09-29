import { describe, expect, it } from 'vitest';
import { flattenSource, scriptSection, squeezeSource, stripComments } from '../helpers/source.js';

// 这两个函数是所有「读源码 + toContain」守卫的地基：它们错了，受影响的断言会**静默变松**
// 或**集体假红**（2026-09-28 就发生过：正则写成 `,(\s*[)\]}]?)`，把所有逗号都删了，
// 被测试当场抓到）。所以契约必须由测试锁住，不能只靠注释。
//
// 下面每组用例都取自真实源码的**格式化后**片段（不是构造的假例子）—— 它们是 2026-09-28
// 全量格式化 src 时实际踩到的 9 处假红。构造假例子容易得出「两个归一函数等价」的错觉。

describe('squeezeSource：空白压单空格 + 去尾逗号 + 去闭括号前空白', () => {
  it('把换行与缩进压成单个空格', () => {
    expect(squeezeSource('a\n  b\tc')).toBe('a b c');
  });

  it('去掉右括号/方括号/花括号前的尾逗号', () => {
    // 注意归一后 `}` 会紧贴前一个 token（ture} 而不是 true }）—— 这是**刻意的**：
    // 尾逗号规则会连逗号后的空格一起吃，若不把闭括号前的空格也去掉，
    // 「有尾逗号」与「没尾逗号」两种写法会归出两个不同的串（见下方一致性用例）。
    expect(squeezeSource('experimental: { passkey: true, },')).toBe(
      'experimental: { passkey: true},',
    );
    expect(squeezeSource('foo(a, b,)')).toBe('foo(a, b)');
    expect(squeezeSource('list[a, b,]')).toBe('list[a, b]');
  });

  it('**保留**中间逗号（早先的 bug 是把所有逗号都删了）', () => {
    expect(squeezeSource('import { a, b, c } from "x";')).toBe('import { a, b, c} from "x";');
  });

  it('**不**处理引号风格与分号（那两类要写成宽容正则，见 helpers/source.js 头注释）', () => {
    expect(squeezeSource('html[data-theme="dark"]')).not.toBe(
      squeezeSource("html[data-theme='dark']"),
    );
    expect(squeezeSource('return foo()')).not.toBe(squeezeSource('return foo();'));
  });

  it('幂等：再归一次不变', () => {
    const once = squeezeSource('{ a: 1,\n  b: 2, }');
    expect(squeezeSource(once)).toBe(once);
  });
});

describe('squeezeSource 能抹平的真实断行（每例都来自一次实际假红）', () => {
  const cases = [
    {
      name: 'import 被展开成多行（2026-09-28 bohai-settings-panel 假红）',
      source: `import {
  isAbortError,
  CHAT_ERROR_MESSAGES,
  getAbortMessage,
  safeErrorDetail,
} from '../utils/chatErrorMessages.js';`,
      literal:
        "import { isAbortError, CHAT_ERROR_MESSAGES, getAbortMessage, safeErrorDetail } from '../utils/chatErrorMessages.js'",
    },
    {
      name: '赋值号后被断行（home-heroes-partial-save 假红）',
      source: `        updatePayload[field] =
          field === 'showcase_config' && payload[field] == null ? {} : payload[field];`,
      literal: "updatePayload[field] = field === 'showcase_config' && payload[field] == null",
    },
    {
      name: '模板属性跨行（passkey-auth 假红）',
      source: `          <button
            v-if="passkeySupported"
            type="button"
            class="boh-passkey-btn"`,
      literal: 'type="button" class="boh-passkey-btn"',
    },
  ];

  for (const { name, source, literal } of cases) {
    it(name, () => {
      // 两边都过同一个归一函数 —— 只归源码不归期望串，等于没归。
      expect(squeezeSource(source)).toContain(squeezeSource(literal));
      // 并断言它**不是**恒真：把源码换成空串就该找不到
      expect(squeezeSource('')).not.toContain(squeezeSource(literal));
    });
  }
});

describe('flattenSource：在 squeezeSource 基础上移除全部空白', () => {
  it('能跨过开括号后的断行（2026-09-28 bohai-quick-sidebar 假红）', () => {
    const source = `communitySearchActive.value = Boolean(
      communityNeedsEvidence || isForumSearchEnabled.value,
    );`;
    const literal =
      'communitySearchActive.value = Boolean(communityNeedsEvidence || isForumSearchEnabled.value)';
    expect(flattenSource(source)).toContain(flattenSource(literal));
    // 反证：同一对输入用 squeezeSource 会失配 —— 这正是需要第二个函数的原因。
    // 压成单空格后是 `Boolean( communityNeeds…`，`(` 后那个空格还原不掉。
    expect(squeezeSource(source)).not.toContain(squeezeSource(literal));
  });

  it('能跨过属性值引号后的断行（2026-09-28 home-heroes-partial-save 假红）', () => {
    const source = `      :key="
        (hero.template === 'builtin' ? 'builtin:' + hero.builtin_key : hero.id) +
        ':' +
        hero.sort_order
      "`;
    const literal =
      ":key=\"(hero.template === 'builtin' ? 'builtin:' + hero.builtin_key : hero.id) + ':' + hero.sort_order\"";
    expect(flattenSource(source)).toContain(flattenSource(literal));
    expect(squeezeSource(source)).not.toContain(squeezeSource(literal));
  });

  it('尾逗号规则只定义一处（复用 squeezeSource 而非重写正则）', () => {
    expect(flattenSource('{ a: 1, }')).toBe('{a:1}');
  });

  it('幂等：再归一次不变', () => {
    const once = flattenSource('a\n b({ c: 1, })');
    expect(flattenSource(once)).toBe(once);
  });
});

describe('scriptSection + stripComments：断言「弃用写法不再出现」前先剥注释（2026-09-29 加）', () => {
  // 素材取自真实文件：ProfileMain.vue 的模板里有 `accept="image/*"`，脚本里还要断言
  // `ref(getNotificationStoreSync())` 不再出现（而它会被**注释**合法复述）。
  const trapSample = `<template>
  <input class="hidden-file-input" accept="image/*" @change="onPick" />
</template>
<script setup>
const railNotificationStore = getNotificationStoreRef();
/* 全文剥注释时，这里的块注释结尾就是被错配的终点 */
</script>`;

  const commentSample = `<script setup>
// 旧写法：ref(getNotificationStoreSync()) —— 已删，改共享 ref
/* 另一处 ref(getNotificationStoreSync()) */
const railNotificationStore = getNotificationStoreRef();
</script>`;

  it('scriptSection 只取 <script> 区：模板里的 accept="image/*" 不进来', () => {
    const script = scriptSection(trapSample);
    expect(script).not.toContain('accept="image/*"');
    expect(script).toContain('getNotificationStoreRef');
  });

  it('反证：对 .vue 全文直接剥注释会把真实代码一起吃掉（否定断言因此假绿）', () => {
    // 这正是 2026-09-29 实测到的坑：`image/*` 的 `/*` 与块注释的 `*/` 跨区配对，
    // ProfileMain.vue 一次被删掉 42,458 字节，import 行消失 → 守卫静默变松。
    const naive = trapSample.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(naive).not.toContain('getNotificationStoreRef');
    // 两段式写法才能保住真实代码：
    expect(stripComments(scriptSection(trapSample))).toContain('getNotificationStoreRef');
  });

  it('stripComments 抹掉注释里复述的弃用写法，保留代码里的当前写法', () => {
    const code = stripComments(scriptSection(commentSample));
    expect(code).not.toContain('getNotificationStoreSync');
    expect(code).toContain('getNotificationStoreRef');
  });

  it('非 .vue（纯 js/ts）原样返回，不会被当成没有脚本', () => {
    expect(scriptSection('const a = 1;')).toBe('const a = 1;');
  });

  it('不把 https:// 里的双斜杠当注释起点', () => {
    const code = stripComments("const endpoint = 'https://example.com/a'; const b = 2;");
    expect(code).toContain("'https://example.com/a'");
    expect(code).toContain('const b = 2;');
  });
});
