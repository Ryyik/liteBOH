/**
 * gate-fixtures.mjs — 门禁自检的**违规样本**声明
 *
 * 背景：本仓库出过两次「检查在跑、但永远绿」——
 *   ① check-project-structure 只过滤 .js，而路由全是 .ts → 53 条一条没查，却输出 clean；
 *   ② check:dark-tokens 跑在观察档（总量上升只打 ⚠️，exit 0）→ 永不阻断任何构建。
 * 两者都表现为「CI 全绿」。假绿是静默的，靠人盯是盯不住的。
 *
 * 所以每道门禁都要能回答一个问题：**「你凭什么证明自己会红？」**
 * 本文件就是那些证据。每条 fixture 声明「怎么造一个已知违规」，由
 * scripts/check-gates-self-test.mjs 注入 → 跑门禁 → 断言退出码非 0 → 撤销。
 *
 * 写 fixture 的三条纪律：
 *   1. **prepare() 必须返回 restore()**，且 restore 幂等 —— 崩溃时也要能还原干净；
 *   2. **注入必须真的改变内容**（editFile 会断言），否则 fixture 会静默失效，
 *      那种「样本没生效、门禁自然绿」的假阳性比没有自检更糟；
 *   3. 优先选**破坏面最小**的落点：能新建临时文件就别改已有文件，能改注释外的
 *      末行就别动文件中部。
 *
 * ⚠️ 第四条（2026-09-28 补，代价是一条 fixture 静默失效半天）：**落点名字要一眼看出是样本。**
 *    `SIGKILL` / 沙箱半跑会绕过所有信号与 exit 兜底，把样本文件留在工作区。此时：
 *   ① 若落点用的是真实名字（如 `src/views/Home.vue`），残留**看起来就是一个正常文件**，
 *      却让 `check:views` 在工作区里长期变红，没人能一眼看出源头；
 *   ② `createFile` 的存在性守卫会让该 fixture **永久失效**（每次自检都报「注入失败」）。
 *    所以：落点一律用 `__gates_probe*` 这类不可能被真实文件占用的名字，且 `createFile`
 *    对「内容与本样本逐字节相同」的残留**收编自愈**（见 createFile 注释）。
 */
import { readFileSync, writeFileSync, rmSync, rmdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 改写已有文件，返回还原函数。
 * 若 mutate 没改变任何内容 → 抛错（说明 fixture 已失效，例如上游把锚点改了）。
 */
const editFile = (file, mutate, label) => {
  if (!existsSync(file)) throw new Error(`落点不存在：${file}`);
  const original = readFileSync(file, 'utf8');
  const next = mutate(original);
  if (next === original) {
    throw new Error(`注入无效（fixture 已失效，锚点可能被上游改掉了）：${label} @ ${file}`);
  }
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};

/** 新建临时文件，返回删除函数。 */
const createFile = (file, content) => {
  if (existsSync(file)) {
    // 落点已存在：内容与本样本**逐字节相同** ⇒ 是上次被硬杀（SIGKILL / 沙箱半跑，
    // 信号与 exit 兜底都不会执行）留下的残留 → 收编它、还原时删掉。
    // 内容不同 ⇒ 是真实文件，拒绝覆盖。
    //
    // 为什么必须自愈而不是一律拒绝：一味拒绝会让这条 fixture **永久失效** ——
    // 每次自检都报「注入失败」，而残留还会让对应门禁在工作区里长期变红却看不出源头。
    // 2026-09-28 `check:views` 的 `src/views/Home.vue` 就是这么失效的。
    const current = readFileSync(file);
    const expected = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (!current.equals(expected)) {
      throw new Error(`落点已存在且内容与本样本不同，拒绝覆盖：${file}`);
    }
    process.stdout.write(`↺ 收编上次残留(${file})  `);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return () => rmSync(file, { force: true });
};

/**
 * 新建临时目录，返回删除函数。
 * 与 createFile 不同：这里**不借用**。落点必须是 `__gates_probe*` 这类不可能被真实内容
 * 占用的名字，所以无论本次是不是我们建的，还原时都要删 —— 否则一次硬杀残留会让它永久
 * 留在工作区（空目录 git 根本看不见，`git status` 干净也发现不了）。
 * 删除用**非递归** rmdirSync：目录为空才删得掉；万一里面真有东西就告警留着，不递归删。
 */
const createDir = (dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return () => {
    try {
      rmdirSync(dir);
    } catch (err) {
      console.warn(`   ⚠️ 临时目录未删除（非空？请人工确认）：${dir}（${err.code}）`);
    }
  };
};

/** 在文件末尾追加（比改中部安全） */
const appendTo = (file, snippet, label) =>
  editFile(file, (s) => (s.endsWith(snippet) ? s : `${s}\n${snippet}\n`), label);

/**
 * 每条：
 *   gate        package.json 里的 npm script 名（自检直接跑它，确保测的是真实入口）
 *   why         这条门禁防的是什么（写给人看，避免 fixture 被当成噪声删掉）
 *   prepare()   注入违规，返回还原函数
 */
export const FIXTURES = [
  {
    gate: 'check:views',
    why: 'src/views 下 .vue 与同名目录并存会让路由解析歧义',
    // 落点用 `__gates_probe` 一对（.vue 文件 + 同名空目录），**不**借用真实目录：
    // ① 不依赖仓库既有布局（原来借用 `src/views/Home/`，一旦仓库改名就静默失效）；
    // ② 真实文件永远不会占用这个名字 → 被硬杀留下的残留一眼可辨（见文件头第 4 条）。
    prepare: () => {
      const removeFile = createFile(
        'src/views/__gates_probe.vue',
        '<!-- gates-self-test 临时样本：与同名目录制造冲突（用完即删） -->\n',
      );
      const removeDir = createDir('src/views/__gates_probe');
      return () => {
        removeFile();
        removeDir();
      };
    },
  },
  {
    gate: 'check:structure',
    why: '运行时图片目录混入 png/jpg 原图会让打包体积失控（应归档到 docs/assets-source）',
    prepare: () =>
      createFile('src/assets/images/__gates_probe.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  },
  {
    gate: 'check:auth-validation',
    why: '前端与服务端的密码长度下限必须一致，否则前端校验形同虚设（2026-06 出过 8 vs 6 的漂移）',
    prepare: () =>
      editFile(
        'src/utils/auth-validation.js',
        (s) => s.replace(/(PASSWORD_MIN_LENGTH\s*=\s*)8\b/, '$19'),
        'PASSWORD_MIN_LENGTH 8 → 9',
      ),
  },
  {
    gate: 'check:liquid-glass',
    why: '毛玻璃材质只能有一处实现，别处手写 blur() 会与 tokens 分叉、改一处漏一处',
    prepare: () =>
      appendTo(
        'src/styles/components/buttons.css',
        '.__gates_probe { backdrop-filter: blur(20px); }',
        '手写 backdrop-filter blur(20px)',
      ),
  },
  {
    gate: 'check:important-budget',
    why: '!important 是存量债棘轮，只许降不许升（靠它拦「用 !important 抢特异性」这种绕过）',
    prepare: () =>
      appendTo(
        'src/styles/common/glass-aliases.css',
        '.__gates_probe { color: red !important; }',
        '新增 1 处 !important（该文件基线为 0）',
      ),
  },
  {
    gate: 'check:dark-tokens:strict',
    why: '暗色裸色值棘轮：新增裸色值意味着以后调色要改 N 处，只许降不许升',
    prepare: () =>
      editFile(
        'src/styles/themes/dark-mode.css',
        (s) =>
          s.replace(
            '[data-theme="dark"] {',
            '[data-theme="dark"] {\n  --gates-probe-naked-color: #ff00ff;',
          ),
        '暗色块内注入裸色值',
      ),
  },
  {
    gate: 'check:layering',
    why: 'UI/视图层直连数据层出口（from/rpc/functions.invoke）会让「表结构改名」要改 N 处；新代码必须走 utils/api 或 stores',
    prepare: () =>
      appendTo(
        'src/composables/useNews.js',
        "export const __gatesProbe = () => supabase.from('gates_probe').select();",
        '在 UI 层新增 1 处 supabase.from()',
      ),
  },
  {
    gate: 'check:first-paint',
    why: '首屏骨架色值必须与 token 同步，否则会白屏闪烁或主题错色',
    prepare: () =>
      editFile(
        'src/styles/common/tokens.css',
        (s) => s.replace(/(--boh-page-bg:\s*)#[0-9a-fA-F]{3,8}/, '$1#123456'),
        '--boh-page-bg 改成与骨架不一致的值',
      ),
  },
  {
    gate: 'check:bohai-params',
    why: 'BOH AI 生成参数只许在真源表里出现（generation-params.js / chat-engine-config.js），内联字面量会让调参改一处漏一处',
    prepare: () =>
      appendTo(
        'src/views/BOHAI/composables/useMessageManager.js',
        'export const __gatesProbeParams = { temperature: 0.9, max_tokens: 99 };',
        '内联生成参数字面量 temperature: 0.9 / max_tokens: 99',
      ),
  },
  {
    gate: 'check:db-lint',
    why: '线上 DB 函数体引用了不存在的列/表/函数 ⇒ **每次调用都抛运行期异常**，而 200+ 前端探针与 10 道构建门禁一个都看不到（2026-10-04 首跑实测：一次抓出 6 个坏函数，含 reserve_ai_points 让 AI 积分预扣从未成功、execute_lottery_draw 让抽奖开奖不可用）',
    // 本门禁的正常路径要连线上库（`supabase db lint --linked`），离线造不出违规。
    // 但它支持 `--report <path>` / 环境变量 `BOH_DB_LINT_REPORT` 回放一份已保存的报告，
    // 于是这里用**合成报告**证明「有 error 时确实 exit 1」。
    // ⚠️ 若将来上游改了环境变量名或 --report 语义，本条会以「❌ 没红（exit 0）—— 假绿嫌疑」
    //    **大声失败**，不会静默失效（这是选 env 注入而非静默文件的原因）。
    prepare: () => {
      const report = JSON.stringify([
        {
          function: 'public.__gates_probe_fn',
          issues: [
            {
              level: 'error',
              message: 'column "nope" does not exist',
              sqlState: '42703',
              query: { text: 'select nope from public.__gates_probe_table' },
            },
          ],
        },
      ]);
      const removeFile = createFile('scripts/__gates_probe_db_lint_report.json', report);
      process.env.BOH_DB_LINT_REPORT = 'scripts/__gates_probe_db_lint_report.json';
      return () => {
        delete process.env.BOH_DB_LINT_REPORT;
        removeFile();
      };
    },
  },
];

/**
 * 已知**无法**自证的门禁及原因 —— 列出来是为了让「未覆盖」变成明账，
 * 而不是留一块没人知道的盲区。
 */
export const UNTESTABLE = [
  {
    gate: 'check:ratchets',
    why: '信息性汇总（棘轮总账），永远 exit 0、不做判定 —— 没有「违规」可造',
  },
  {
    gate: 'security:anon-check',
    why: '需要 Supabase Management API token 读 pg_catalog，离线无法造违规',
  },
  {
    gate: 'check:db-advisors',
    why: '同上：要 Management API token 读 pg_catalog 比对基线，离线造不出「新增违规」（与 security:anon-check 同策略）',
  },
  { gate: 'check:shell-precache', why: '读 dist/ 产物，需先构建' },
  {
    gate: 'compress-images',
    why: '构建转换步骤而非门禁：没有「违规」可注入，sharp 抛错会自然非零退出；幂等性由「连跑两次第二次全跳过、产物字节不变」自证（2026-09-29 实测）',
  },
  { gate: 'check:bundle-size', why: '读 dist/ 产物，需先构建' },
  { gate: 'check:route-css-runtime', why: '要起 preview 服务 + 浏览器，属手工专项' },
  { gate: 'check:sw-upgrade', why: '要 dist 与 dist-check 双产物对比，属手工专项' },
  { gate: 'lint / type-check / test', why: '本身即测试套件，红不红由用例决定，无需造样本' },
  { gate: '各类 probe:*', why: '要浏览器环境（Playwright），样本即测试用例本身' },
];
