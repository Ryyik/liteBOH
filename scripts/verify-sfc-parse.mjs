// 快速 SFC 校验：parse + compileTemplate（模板编译错误）+ esbuild（script 语法）
import { parse, compileTemplate } from '@vue/compiler-sfc';
import { transform } from 'esbuild';
import { readFileSync } from 'node:fs';

const files = [
  '/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/DataManagement/DataAdmin.vue',
  '/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/views/DataManagement/components/AdminHeader.vue'
];

let failed = false;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const { descriptor, errors } = parse(source, { filename: file });
  if (errors.length) {
    failed = true;
    console.error(`[PARSE ERROR] ${file}`);
    for (const e of errors) console.error('  ', e.message ?? e);
    continue;
  }

  // 1) script 语法
  try {
    const script = descriptor.scriptSetup?.content || descriptor.script?.content || '';
    await transform(script, { loader: 'js', sourcefile: file });
  } catch (e) {
    failed = true;
    console.error(`[SCRIPT SYNTAX ERROR] ${file}`);
    console.error('  ', e.message);
  }

  // 2) 模板编译（含表达式/指令语法）
  try {
    const tpl = descriptor.template;
    if (tpl) {
      const res = compileTemplate({ source: tpl.content, filename: file, id: 'x', compilerOptions: { bindingMetadata: undefined } });
      if (res.errors?.length) {
        failed = true;
        console.error(`[TEMPLATE ERROR] ${file}`);
        for (const e of res.errors) console.error('  ', e.message ?? e);
      }
    }
  } catch (e) {
    failed = true;
    console.error(`[TEMPLATE THROW] ${file}`);
    console.error('  ', e.message);
  }

  if (!failed) console.log(`OK: ${file}`);
  failed = false;
}
process.exit(failed ? 1 : 0);
