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
    group: '检索',
    keyword: 'web',
    label: '联网搜索',
    description: '为下一条消息获取最新网络信息',
    action: 'web',
  },
  {
    id: 'cloud',
    group: '检索',
    keyword: 'cloud',
    label: '个人 Cloud+',
    // 2026-10-20 用户口径：不是「下一条」——Cloud+ 是会话级开关，开了就一直生效。
    // 旧文案「允许下一条回答参考」会让人以为发一条就自动关掉（实际不会）。
    description: '允许 AI 参考你的云空间内容',
    action: 'cloud',
  },
  // ⚠️ 2026-10-20 用户口径：「你这检索一堆重复啊，直接保留一个 memory 开启 BOHAI 社区知识库」。
  //    `/community`（社区搜索）/ `/memory`（官方记忆）/ `/shared`（社区知识）三个命令
  //    自 2026-10-19 起就**切换同一个**站内知识总开关（壳里三个 case 全汇到
  //    `handleKnowledgeBaseToggle`）—— 一个开关配三个入口，是纯重复。
  //    现只保留 `/memory` 作为唯一入口，另外两个从命令表移除。
  //    ⚠️ 壳里的 `case 'community'` / `case 'shared'` **保留**：老用户手打
  //       `/community` 仍应生效（命令表决定菜单显示，解析器还认旧关键字）。
  {
    id: 'memory',
    group: '检索',
    keyword: 'memory',
    label: 'BOHAI 社区知识库',
    description: '开启后可检索官方事实、社区帖子与社区共享知识',
    action: 'memory',
  },
  {
    id: 'chat',
    group: '对话',
    keyword: 'chat',
    label: 'Chat 形态',
    description: '切回对话形态',
    action: 'surface',
    surface: 'chat',
  },
  {
    id: 'work',
    group: '对话',
    keyword: 'work',
    label: 'Work 形态',
    description: '切到工作形态，产物落在右侧工作台',
    action: 'surface',
    surface: 'work',
  },
  {
    id: 'new',
    group: '对话',
    keyword: 'new',
    label: '新对话',
    description: '开启一个全新会话',
    action: 'new',
  },
  {
    id: 'temp',
    group: '对话',
    keyword: 'temp',
    label: '临时对话',
    description: '开启一个不写入长期记忆的临时会话',
    action: 'temp',
  },
  {
    id: 'model',
    group: '模型',
    keyword: 'model',
    label: '切换对话模式',
    description: '用法：/model 模式名，例如 /model 深度思考',
    action: 'mode',
  },
  {
    id: 'clear',
    group: '会话',
    keyword: 'clear',
    label: '清除当前对话',
    description: '清空当前会话（会二次确认）',
    action: 'clear',
  },
  {
    id: 'settings',
    group: '设置',
    keyword: 'settings',
    label: '打开设置',
    description: '打开 BOHAI 设置面板',
    action: 'settings',
  },
  {
    id: 'usage',
    group: '设置',
    keyword: 'usage',
    label: '用量详情',
    description: '打开设置并定位到用量卡',
    action: 'usage',
  },
  {
    id: 'compress',
    group: '会话',
    keyword: 'compress',
    label: '整理上下文',
    description: '把较早的对话压成摘要，释放上下文预算',
    action: 'compress',
  },
  {
    id: 'stop',
    group: '会话',
    keyword: 'stop',
    label: '停止生成',
    description: '停止当前正在生成的回答',
    action: 'stop',
  },
  {
    id: 'help',
    group: '设置',
    keyword: 'help',
    label: '查看全部命令',
    description: '列出所有可用的斜杠命令',
    action: 'help',
  },
];

/**
 * 菜单项构造。
 *
 * ⚠️ 2026-10-20 用户口径：「/模型名这种不要」。
 *    原先这里会把每个对话模式（含策略 Cost/Balance/Intelligence 与全部模型）
 *    翻译成一条 `/cost`、`/glm4flash`… 命令 —— 菜单里混进十几条同名同构的项。
 *    现在模式切换只走 UI 胶囊（底行「GLM4 ⌄」那颗），斜杠菜单不再镜像它。
 *    `/model <模式名>` 这条命令仍在（见 BOH_SLASH_COMMANDS），它带参数，
 *    是「一个入口」，不是「每个模式一条命令」。
 * ⚠️ `chatModes` 形参**保留**：调用方签名不变，将来若要恢复按需（例如给
 *    `/model` 做补全建议）不必再改签名。
 */
export const buildSlashMenuItems = ({ chatModes = [] } = {}) => {
  // ⚠️ 2026-10-20 用户口径：「/模型名这种不要」。
  //    原先每个对话模式（含策略 Cost/Balance/Intelligence 与全部模型）都会被翻译成
  //    一条 `/cost`、`/glm4flash`… 命令 —— 菜单里混进十几条同名同构的项，
  //    「检索」那组的重复问题在「模型」组更严重。
  //    现在模式切换只走 UI 胶囊（底行「GLM4 ⌄」那颗），斜杠菜单不再镜像它。
  //    ⚠️ `chatModes` 形参**保留**：调用方签名不变（壳传了就传了），
  //       且将来若要恢复按需（例如 `/model` 后面跟参数）不必再改签名。
  void chatModes;
  return [...BOH_SLASH_COMMANDS];
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
/**
 * 旧关键字别名（2026-10-20 检索组去重时补）。
 *
 * `/community` 与 `/shared` 从菜单移除（三者本就切换同一个站内知识总开关），
 * 但**老用户的手不会跟着改** —— 手打 `/shared` 得到「未知命令」是体验断层。
 * 这里把旧关键字映射到保留下来的那条命令（`/memory`）。
 *
 * ⚠️ 别名只影响**解析**，不进菜单：`buildSlashMenuItems` 仍只返回 `BOH_SLASH_COMMANDS`，
 *    所以菜单里不会出现三个同义项（用户口径要的正是这个）。
 * ⚠️ 别名表不要扩张成"任意历史命令" —— 每多一条都是一份要长期维护的兼容债。
 *    加之前先问：这个关键字有没有被真实用户用过（`ai_quota_log` 之类能查则查）。
 */
const LEGACY_KEYWORD_ALIASES = Object.freeze({
  community: 'memory',
  shared: 'memory',
});

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

  const list = Array.isArray(commands) ? commands : [];
  const normalize = (v) => String(v || '').toLowerCase();
  // 先按菜单里的关键字找；找不到再查旧关键字别名（别名指向现役命令的 keyword）
  const lookup = LEGACY_KEYWORD_ALIASES[keyword] || keyword;
  const command = list.find((item) => normalize(item?.keyword) === lookup);

  if (!command) return { ...base, kind: 'unknown', keyword, args };
  return { ...base, kind: 'command', keyword, args, command };
};

/** 帮助文案：把命令清单拼成一行（`/help` 与空态提示共用，保证两处不漂移） */
export const formatSlashHelp = () => BOH_SLASH_COMMANDS.map((c) => `/${c.keyword}`).join('  ');
