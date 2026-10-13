import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scriptSection, stripComments, flattenSource } from '../helpers/source.js';

// plans/021 阶段 3 · BOHAI 部分：输入框（BohComposer）的「多字扩展」收敛到
// composables/useAutoGrowTextarea.js 单源。本文件锁四类事：
//   1. 接线在位（模板 ref + script 里的 useAutoGrowTextarea 调用，value 传 getter）；
//   2. 自研实现已删（BohComposer 的 autoResize + modelValue watch、壳层三处手动调用、
//      useMessageManager / useMemoryCapture 的 style.height poke）；
//   3. 聚焦链路未被误伤（textareaRef 回填 + useChatEngine 的 focus 仍在）；
//   4. 真源划分不被破坏（上限只住 CSS 的 max-height，JS 不写第二份像素值）。
// 真实布局由 scripts/probes/probe-reply-autogrow.mjs 在浏览器里验，两边不重复。

const root = resolve(import.meta.dirname, '../..');
const read = (rel) => readFileSync(resolve(root, rel), 'utf8');
const codeOf = (rel) => flattenSource(stripComments(scriptSection(read(rel))));

const COMPOSER = 'src/views/BOHAI/BOHAI/components/BohComposer.vue';
const COMPOSER_CSS = 'src/views/BOHAI/BOHAI/components/styles/boh-composer.css';
const SHELL = 'src/views/BOHAI/composables/useBohShell.js';
const MSG_MANAGER = 'src/views/BOHAI/composables/useMessageManager.js';
const MEM_CAPTURE = 'src/views/BOHAI/composables/useMemoryCapture.js';
const CHAT_ENGINE = 'src/views/BOHAI/composables/useChatEngine.js';

describe('BOHAI 输入框增高：BohComposer 接入单源', () => {
  it('接线：模板 ref + value getter（受控 modelValue，清空/预填都走 prop 变更）', () => {
    const raw = read(COMPOSER);
    expect(raw).toContain('ref="textareaEl"');
    const code = codeOf(COMPOSER);
    // getter 直接透传：包一层 unref 会让 watcher 永不触发（composable 头部的坑）
    expect(code).toContain(
      'const{textareaRef:textareaEl}=useAutoGrowTextarea({value:()=>props.modelValue});',
    );
    expect(code).not.toContain('unref');
  });

  it('import 自单源路径，不引第二份实现', () => {
    const code = codeOf(COMPOSER);
    expect(code).toContain(
      "import{useAutoGrowTextarea}from'@/composables/useAutoGrowTextarea.js';",
    );
  });

  it('自研 autoResize 与 modelValue watch 已删（函数体 / expose / 手动量高）', () => {
    const code = codeOf(COMPOSER);
    expect(code).not.toContain('autoResize');
    expect(code).not.toMatch(/scrollHeight/);
    expect(code).not.toMatch(/style\.height/);
    // defineExpose 保留 focus / textareaEl（聚焦链路与元素回填仍依赖它）
    expect(code).toContain('focus:()=>textareaEl.value?.focus(),');
    expect(code).toMatch(/defineExpose\(\{.*textareaEl/);
  });

  it('输入框上限仍只住 CSS（min(40vh, 340px)，boh-composer.css）', () => {
    const css = read(COMPOSER_CSS);
    expect(css).toMatch(/\.boh-composer-input\s*\{[^}]*max-height:\s*min\(40vh,\s*340px\)/);
  });
});

describe('BOHAI 输入框增高：壳层与引擎侧收敛', () => {
  it('useBohShell 三处手动 autoResize 调用已删（appendToComposer / executeSlashCommand / seedAsk）', () => {
    const code = codeOf(SHELL);
    expect(code).not.toContain('autoResize');
    // 回落由 BohComposer 的 modelValue watch 自闭环完成；focus 调用保留
    expect(code).toContain('composerRef.value?.focus();');
  });

  it('useMessageManager / useMemoryCapture 的 style.height poke 已删', () => {
    expect(codeOf(MSG_MANAGER)).not.toMatch(/style\.height/);
    expect(codeOf(MEM_CAPTURE)).not.toMatch(/style\.height/);
    // useMemoryCapture 不再需要 textareaRef（唯一用处就是 poke 高度）
    expect(codeOf(MEM_CAPTURE)).not.toContain('textareaRef');
    // 清空输入的逻辑仍在（只删高度直写）
    expect(codeOf(MSG_MANAGER)).toContain("constresetComposerInput=()=>{inputMessage.value='';};");
    expect(codeOf(MEM_CAPTURE)).toContain("inputMessage.value='';");
  });

  it('聚焦链路未被误伤：元素回填 + useChatEngine focus 仍在', () => {
    // 子组件 textarea 元素回填给引擎 ref（发送后聚焦）
    expect(codeOf(SHELL)).toContain('textareaRef.value=instance?.textareaEl||null;');
    // useChatEngine 仍按 textareaRef 聚焦
    expect(codeOf(CHAT_ENGINE)).toContain('if(textareaRef.value)textareaRef.value.focus();');
  });
});
