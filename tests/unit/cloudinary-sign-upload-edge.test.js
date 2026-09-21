/**
 * cloudinary-sign-upload EF 的接线断言。
 *
 * 这里守的是一条**行为性不变量**，不是名字：
 *   「Cloudinary 相关环境变量必须按请求读取，不得在模块顶层立即求值」
 *
 * 为什么值得单独写测试：Edge Function 的 isolate 会被复用。若把
 * `const MODE = Deno.env.get('CLOUDINARY_UPLOAD_MODE')` 写在模块顶层，
 * 之后用 `supabase secrets set` 把 mode 从 unsigned 改成 signed 时，
 * 复用中的 isolate 仍持有旧值 → 切换**看起来没生效**，极易被误判为
 * 「secret 设错了」并反复重设（2026-09-21 实际踩到，故补此测试）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';

const EF_PATH = 'supabase/functions/cloudinary-sign-upload/index.ts';

let source = '';
let handlerBody = '';

beforeAll(async () => {
  source = await readFile(EF_PATH, 'utf-8');
  // 只看请求处理部分：Deno.serve 之后的内容
  handlerBody = source.slice(source.indexOf('Deno.serve'));
});

describe('cloudinary-sign-upload：env 读取时机', () => {
  it('不存在模块顶层立即求值的 CLOUDINARY_* 常量（防 isolate 缓存旧值）', () => {
    // 形如 `const CLOUDINARY_UPLOAD_MODE = resolveUploadMode(Deno.env.get(...))`
    const topLevelConstants = source.match(/^const CLOUDINARY_[A-Z_]+\s*=/gm) || [];
    expect(topLevelConstants).toEqual([]);
  });

  it('环境变量集中在一个按需调用的读取函数里', () => {
    expect(source).toMatch(/const readCloudinaryEnv\s*=\s*\(\s*\)\s*=>\s*\(\{/);
    const fnBody = source.slice(
      source.indexOf('const readCloudinaryEnv'),
      source.indexOf('type AuthenticatedUser'),
    );
    // 六个变量都要在这里读，且都来自 Deno.env
    for (const key of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_UPLOAD_PRESET',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
      'CLOUDINARY_UPLOAD_MODE',
      'CLOUDINARY_DEFAULT_FOLDER',
    ]) {
      expect(fnBody).toContain(`Deno.env.get('${key}')`);
    }
  });

  it('请求处理里调用该读取函数，而不是引用顶层常量', () => {
    expect(handlerBody).toMatch(/const env = readCloudinaryEnv\(\)/);
    // 处理体内不应再直接读 CLOUDINARY_* 环境变量
    expect(handlerBody).not.toMatch(/Deno\.env\.get\('CLOUDINARY_/);
    // 也不应引用裸标识符。先剥掉字符串字面量 —— ENV_MISSING 的提示文案里
    // 会列出变量名，那是给人看的，不是求值，不该被判成引用。
    const code = handlerBody.replace(/'[^']*'/g, "''");
    expect(code).not.toMatch(/\bCLOUDINARY_[A-Z_]+\b/);
  });

  it('模式判断与下发都取自按请求读取的 env', () => {
    expect(handlerBody).toMatch(/env\.mode === 'unsigned'/);
    expect(handlerBody).toMatch(/uploadPreset: env\.uploadPreset/);
    expect(handlerBody).toMatch(/signCloudinaryParams\(\s*\{[\s\S]*?upload_preset: env\.uploadPreset/);
    expect(handlerBody).toMatch(/env\.apiSecret,/);
  });

  it('signed 分支缺配置时返回 ENV_MISSING（而不是崩溃或下发空签名）', () => {
    expect(handlerBody).toMatch(/!env\.cloudName \|\| !env\.uploadPreset \|\| !env\.apiKey \|\| !env\.apiSecret/);
    expect(handlerBody).toMatch(/code: 'ENV_MISSING'/);
  });
});
