# BOHLITE 分册规则：AI 配置页 / 密钥与模型
> 主文件是 `MEMORY.md`（常驻注入）。本册按需读取 —— 动「AI 配置 / 密钥与模型合并页 / 平台接入 / 额度」时先读这里。
> 需求基线（用户定 2026-10-12）+ 该页全部已实测陷阱。原型产物 `ai-config-demo.html`（根目录）。

## 需求基线（用户定，2026-10-12）
- **添加平台＝选平台→贴 Key→自动拉取模型**（界面不出现 base_url）；**手动建平台只有 名称/地址/Key 三字段**；**添加模型＝只选平台 + 填模型信息**。页面 6 tab → 3 tab（密钥与模型 / 场景绑定 / 额度）。
- 原型产物：`ai-config-demo.html`（根目录单文件）+ `scripts/probes/probe-ai-config-demo.mjs`（支持 `DEMO_FILE` / `EXPECT_RED` / `SHOT_DIR`）。
- ⚠️ **「配置不明确」三根因**：① 一个词指多个东西；② 编辑器按**代码结构**分组（basic/provider/params/extra）而不是按人的心智；③ 界面把内部枚举名当文案（`chat/multimodal`、`min_tier` 10 个扁平值）。修法：一字段一名字 + 分组按「要干什么」+ 枚举换人话 + 每字段一句「改了会怎样」。
- ⚠️ 模型类字段用统一工厂 `mkModel()` 兜默认值，否则漏字段＝界面空白。

## 「密钥与模型」合并页（2026-10-12）
- 原「API Key」+「免费模型库」→ 一个 tab `keys-models`（左栏平台、右栏密钥+模型）。文件：`components/KeysAndModels.vue`、`composables/useKeyVault.js`（**provider 元数据唯一声明点 `PROVIDER_META`**）、`composables/useFreemodels.js`、`utils/api/freemodels-api.js`、`tests/unit/keys-models-merge.test.js`。
- ⚠️ **分层棘轮管 composables**：在 `src/views|components|composables` 写 `supabase.from(...)` ⇒ layering 162 上升即失败，表访问收口到 `src/utils/api/**`。
- ⚠️ **provider 分两类**：模型平台（siliconflow/openrouter/zhipu/custom，有模型+可发现）/ 工具服务（tavily/cloudinary/turnstile，**只有密钥没有模型**，界面不得显示「该平台的模型」）。
- ⚠️ **一列只能有一个写入口**：`bohai_model_configs.quota_multiplier` 曾有两个（面板表格编辑器 + AI 额度页），面板保存是**整行 UPDATE** ⇒ 在 A 页改完、去 B 页保存别的字段就把 A 覆盖回旧值。修法两条**缺一不可**：① 字段 `disabled: true`；② 保存策略**编辑时不写该列**（`if (!isEditing) payload.quota_multiplier = 1;`，新建仍给初值因 NOT NULL）。改「只读化」前先看有没有既有测试断言旧语义（`bohai-model-quota-multiplier-zero.test.js` 按新契约重写而非删）。
- ⚠️ **同源约束**：写入口字面量与列表排除条件必须同源 —— `config/bohai-internal-modes.js`（审核两行 mode_id 只在那里出现一次；列表与**计数**查询必须用同一个 `excludeInternalBohaiModes`，否则「列表 8 行、计数 10 条」）。
- ⚠️ `ADMIN_SECTION_DEFAULT_TABS` 必须显式列出所有页面型 section（否则从 `/admin/api-keys` 进来 defaultTab 为 undefined ⇒ 不切 tab、停在上次表）。旧别名（api-keys/freemodels）映射到新 tab。
- ⚠️ **`provider` ≠ 平台名**：provider 是接入方式枚举，平台名在 `api_key_vault.label` ⇒ 左栏/列表**对 custom 必须用 label**，写 `providerLabel(provider)` 会把用户配的「公司内网网关」藏起来。
- ⚠️ **`api_key_vault` 唯一键＝`(provider, purpose)`**（迁移 `2026061001:17`；EF 亦 `upsert(onConflict:'provider,purpose')`）⇒ 同平台同用途**只能一行**，再保存＝**替换**。预设平台是预期的，`custom` 则是灾难（以为在加第二个网关，实际覆盖第一个，界面还提示「已加密保存」）⇒ 保存前必须点名「将被覆盖的是哪一行」+ 二次确认 + 按钮写「覆盖保存」。守卫 `keys-models-merge.test.js` 的「不能静默覆盖」组。
- ⚠️ `freemodels` 只记 provider、不记「属于哪个自定义网关」⇒ 多网关**共用同一份模型清单**（界面明说，不假装分得清）。要真拆分需动唯一键 + 加平台标识（破坏性，先确认）。
