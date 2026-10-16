/**
 * bohai-slash-commands.js — 斜杠命令的**唯一真源**：定义 + 解析 + 菜单构造 + 过滤。
 *
 * ── 为什么必须抽出来（2026-10-08 事故）────────────────────────────────
 * 原实现把「执行」挂在 `BOHAIMain.vue` 的 keydown 拦截器与菜单项 mousedown 上，
 * 而发送按钮走的是完全独立的一条线（`BohComposer.emit('send')` → `sendMessage`），
 * **零斜杠分支** ⇒ 点发送键把 `/cloud` 当普通文本发给了模型（复现见
 * `scripts/probes/probe-bohai-slash-commands.mjs`，修复前 1/7）。
 * 规则散在两处 ⇒ 入口一多必然漏 —— 这正是本仓最高纲领 1（单一真源）要消灭的形态。
 *
 * ── 本模块的边界（**纯函数，零副作用**）──────────────────────────────
 * 只回答两个问题：① 这段输入是不是命令、是哪个命令、参数是什么；
 * ② 菜单该列哪些项。**执行**（改开关 / 切模式 / 清对话）留在壳里 ——
 * 它需要访问壳里那一堆 ref 与子组件句柄，放进本模块会把纯函数污染成有状态模块。
 *
 * ⚠️ 不许在别处再写第二份 `startsWith('/')` 判断：解析入口只有 `parseSlashInput`，
 * 菜单开关只有 `slashMenuQuery`。
 */

/**
 * 全角斜杠 `／`（U+FF0F）归一成半角 —— 中文输入法下极易打出，
 * 不归一的话「输入 ／web」会既不开菜单、也不被识别成命令。
 */
const normalizeSlash = (raw) => String(raw ?? '').replace(/／/g, '/');

/**
 * 固定命令表。
 *
 * ⚠️ 纪律：**每条命令都指向一个已经存在的函数**（`BOHAIMain.executeSlashCommand`
 * 里逐个接线），本次修复只把已有能力接全，不引入新行为。
 * `action` 是壳里的分派键；`surface` 只对 `action: 'surface'` 有意义；
 * `modeId` 只对 `action: 'mode'` 的**动态模式项**有意义（固定项 `/model` 没有）。
 */
export const BOH_SLASH_COMMANDS = [
  {
    id: 'web',
    keyword: 'web',
    label: '联网搜索',
    description: '为下一条消息获取最新网络信息',
    action: 'web',
  },
  {
    id: 'community',
    keyword: 'community',
    label: '社区搜索',
    description: '为下一条消息查找 BOH 社区内容',
    action: 'community',
  },
  {
    id: 'cloud',
    keyword: 'cloud',
    label: '个人 Cloud+',
    description: '允许下一条回答参考你的 Cloud+ 内容',
    action: 'cloud',
  },
  // 2026-10-16 补：这两个开关原本只有设置面板入口、没有斜杠命令
  // （`/web` `/community` `/cloud` 三个同族开关都有；`/health` 随健康功能整体下线）。
  // ⚠️ 纪律不变：action 必须在壳里 `executeSlashCommand` 的 switch 里有对应 case ——
  //    单测 `bohai-slash-commands.test.js` 会逐条断言「每个 action 都有 case」，
  //    就是为了防「加了命令却没接线」（本次补的正是这个缺口）。
  {
    id: 'memory',
    keyword: 'memory',
    label: '官方记忆',
    description: '让下一条回答参考 BOH 官方事实与论坛记忆',
    action: 'memory',
  },
  {
    id: 'shared',
    keyword: 'shared',
    label: '社区知识',
    description: '让下一条回答参考社区共享内容',
    action: 'shared',
  },
  {
    id: 'chat',
    keyword: 'chat',
    label: 'Chat 形态',
    description: '切回对话形态',
    action: 'surface',
    surface: 'chat',
  },
  {
    id: 'work',
    keyword: 'work',
    label: 'Work 形态',
    description: '切到工作形态，产物落在右侧工作台',
    action: 'surface',
    surface: 'work',
  },
  {
    id: 'new',
    keyword: 'new',
    label: '新对话',
    description: '开启一个全新会话',
    action: 'new',
  },
  {
    id: 'temp',
    keyword: 'temp',
    label: '临时对话',
    description: '开启一个不写入长期记忆的临时会话',
    action: 'temp',
  },
  {
    id: 'model',
    keyword: 'model',
    label: '切换对话模式',
    description: '用法：/model 模式名，例如 /model 深度思考',
    action: 'mode',
  },
  {
    id: 'clear',
    keyword: 'clear',
    label: '清除当前对话',
    description: '清空当前会话（会二次确认）',
    action: 'clear',
  },
  {
    id: 'settings',
    keyword: 'settings',
    label: '打开设置',
    description: '打开 BOHAI 设置面板',
    action: 'settings',
  },
  {
    id: 'usage',
    keyword: 'usage',
    label: '用量详情',
    description: '打开设置并定位到用量卡',
    action: 'usage',
  },
  {
    id: 'compress',
    keyword: 'compress',
    label: '整理上下文',
    description: '把较早的对话压成摘要，释放上下文预算',
    action: 'compress',
  },
  {
    id: 'stop',
    keyword: 'stop',
    label: '停止生成',
    description: '停止当前正在生成的回答',
    action: 'stop',
  },
  {
    id: 'help',
    keyword: 'help',
    label: '查看全部命令',
    description: '列出所有可用的斜杠命令',
    action: 'help',
  },
];

/** 固定命令的关键字集合（构造菜单时用来给动态模式项让路，见下） */
const FIXED_KEYWORDS = new Set(BOH_SLASH_COMMANDS.map((command) => command.keyword));

/** 模式名 → slug（`深度思考` 保持原样；`Deep Think` → `deep-think`） */
const modeKeywordOf = (mode) =>
  String(mode?.name || mode?.id || '')
    .toLowerCase()
    .replace(/\s+/g, '-');

/**
 * 菜单项构造：固定命令 + 动态对话模式。
 *
 * ⚠️ **固定命令优先**：模式关键字由模式名 slug 而来，若某个模式恰好叫
 * 「stop」/「new」/「chat」… 就会与固定命令**撞名**（解析器里固定命令先命中，
 * 用户敲 `/stop` 得到的是「停止生成」而不是「切模式」）。这种模式项**直接跳过**，
 * 否则菜单里会出现两条 `/stop`，且第二条永远点不出预期效果。
 */
export const buildSlashMenuItems = ({ chatModes = [] } = {}) => {
  const modeItems = (Array.isArray(chatModes) ? chatModes : [])
    .map((mode) => ({
      id: `mode-${mode?.id}`,
      keyword: modeKeywordOf(mode),
      label: `切换到 ${mode?.name || mode?.id}`,
      description: mode?.tagline || '更改当前响应模式',
      action: 'mode',
      modeId: mode?.id,
    }))
    .filter((item) => item.keyword && !FIXED_KEYWORDS.has(item.keyword));

  return [...BOH_SLASH_COMMANDS, ...modeItems];
};

/**
 * 菜单查询串：**决定菜单开不开**的唯一入口。
 * 返回 `null` = 不开菜单；返回字符串 = 开菜单并按它过滤（空串 = 列出全部）。
 *
 * 口径（与修复前一致，只多排除 `//` 转义前缀）：
 *   · 不以 `/` 开头 ⇒ 不开；
 *   · `//` 开头（转义）⇒ 不开；
 *   · 含空白 / 换行 ⇒ 不开（用户已经在写参数了，不是在挑命令）。
 */
export const slashMenuQuery = (raw) => {
  const value = normalizeSlash(raw);
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/\s/.test(value)) return null;
  return value.slice(1).toLowerCase();
};

/** 菜单过滤：关键字 + 标签模糊匹配（供 `BohComposer` 的菜单用） */
export const filterSlashItems = (items, query) => {
  const list = Array.isArray(items) ? items : [];
  const needle = String(query ?? '').toLowerCase();
  if (!needle) return list;
  return list.filter(
    (item) =>
      String(item?.keyword || '').includes(needle) ||
      String(item?.label || '')
        .toLowerCase()
        .includes(needle),
  );
};

/**
 * 解析：**任何输入 → 结构化结果**。这是唯一的解析入口，三个发送入口共用。
 *
 * 返回契约：
 * | kind        | 何时                      | 调用方该做什么 |
 * | ----------- | ------------------------- | -------------- |
 * | `'none'`    | 不是斜杠输入（普通消息）  | 正常发送 |
 * | `'literal'` | `//foo` 转义              | 把 `text`（=`/foo`）当普通消息发 |
 * | `'command'` | 命中已知命令              | 执行；`args` 非空时**剥掉命令字**，把 `args` 当消息发 |
 * | `'unknown'` | 以 `/` 开头但没命中       | **不发**，提示未知命令并保留输入框内容 |
 *
 * 分隔规则：**第一个空白之前是命令字，之后是参数**
 * （`/cloud 素材盘点成表格` ⇒ `keyword='cloud'`, `args='素材盘点成表格'`）。
 * 这直接修掉「带参数时菜单必关 ⇒ 无路可走」。
 *
 * @param {string} raw 输入框原文
 * @param {{ commands?: Array }} [options] 命令清单（壳传入 `buildSlashMenuItems` 的结果，
 *        以便把动态模式项也纳入解析；缺省只用固定命令）
 */
export const parseSlashInput = (raw, { commands = BOH_SLASH_COMMANDS } = {}) => {
  const original = String(raw ?? '');
  const value = normalizeSlash(original);
  const base = { keyword: '', args: '', command: null, text: original };

  if (!value.startsWith('/')) return { ...base, kind: 'none' };
  // `//foo` ⇒ 转义：发送字面量 `/foo`（护栏不能把用户的正常输入也拦掉）
  if (value.startsWith('//')) return { ...base, kind: 'literal', text: value.slice(1) };

  const matched = value.slice(1).match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const keyword = (matched?.[1] || '').toLowerCase();
  const args = (matched?.[2] || '').trim();

  const command = (Array.isArray(commands) ? commands : []).find(
    (item) => String(item?.keyword || '').toLowerCase() === keyword,
  );

  if (!command) return { ...base, kind: 'unknown', keyword, args };
  return { ...base, kind: 'command', keyword, args, command };
};

/** 帮助文案：把命令清单拼成一行（`/help` 与空态提示共用，保证两处不漂移） */
export const formatSlashHelp = () => BOH_SLASH_COMMANDS.map((c) => `/${c.keyword}`).join('  ');
