/**
 * 站点操作知识库 —— BOHAI 导航用户时的事实来源。
 *
 * ⚠️ 维护纪律（2026-10-15 修过一次全表漂移）：
 *   本文件描述的是**现行 IA**，不是历史。IA 改造（底栏席位、tab 语义、页面合并）
 *   必须同步改这里 —— 它没有自动化守卫，写错会让 AI 把用户领到重定向甚至死路上。
 *   路径真源：src/config/site-nav.ts（顶栏）+ src/config/bottom-nav.ts（底栏）
 *   + src/router/routes/*；改完用 RouteIndex（/#/__dev/routes）逐个点一遍核对。
 */
export const SITE_OPERATION_MEMORY = `
【站点操作知识库（路径 + 操作步骤）】

[路由说明]
- 项目使用 Hash 路由，浏览器实际地址通常形如: #/path
- 下文路径均为路由 path（例如 /profile/:username）
- 站内导航：底栏四席 = 内容（首页即论坛）/ 消息 / AI / 我

[核心入口]
- 我的空间（“我”页，含 空间 / 资产 / 印象 三段）: /user-space
- 我的主页: /profile/:username
- BOH AI: /ai-chat（底栏「AI」席直达；导航岛与右缘滑动也能唤起）
- 论坛（方块）: /（论坛落在首页；底栏「内容」与顶栏「社区 → 论坛」同款落点）
- 消息中心: /user-space?tab=messages（通知、点赞、评论、印象与系统消息）
- 社区伙伴: /user-space/partners
- 礼物与地址: /user-space/gifts
- 订阅计划: /user-space/subscriptions；积分与资产: /user-space?tab=posts&view=assets
- Pushplus 推送设置: /user-space/pushplus-settings
- 节目: /shows；/newsroom 的“新闻&节目”信息流里也混排精选节目
- 登录: /login

[用户高频操作]
1) 如何给别人写印象（推荐路径）
   - 打开对方主页: /profile/:username
   - 切换到“印象”标签（Impressions）
   - 在输入框“写下你对 TA 的印象...”填写内容
   - 点击“发布印象”
   - 注意: 需要已登录，且不能给自己写印象

2) 如何给别人写印象（社区伙伴路径）
   - 打开 /user-space/partners
   - 找到目标用户，点击“写印象”
   - 在弹窗输入框填写内容
   - 点击“发布印象”

3) 如何查看我收到的印象
   - 路径 A: /profile/:username -> “印象”标签
   - 路径 B: /user-space?tab=posts&view=impressions（“我”页 -> 印象分段）
   - 路径 C: /user-space?tab=messages -> “印象”分类

4) 如何进入 BOH AI
   - 路径 A: /ai-chat
   - 路径 B: 底栏“AI”席（全站任意页面均可直达）

5) 如何进入节目
   - 路径 A: /shows
   - 路径 B: /newsroom（“新闻&节目”信息流，节目与新闻混排）

6) 如何查看我的常用功能
   - /user-space “我”页：空间（动态）/ 资产（装扮、积分、订阅、订单、抽奖）/ 印象
   - 礼物与地址: /user-space/gifts；推送设置: /user-space/pushplus-settings
   - /profile/:username -> 查看帖子、评论、印象等个人主页内容
`;
