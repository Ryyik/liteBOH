export const SITE_OPERATION_MEMORY = `
【站点操作知识库（路径 + 操作步骤）】

[路由说明]
- 项目使用 Hash 路由，浏览器实际地址通常形如: #/path
- 下文路径均为路由 path（例如 /profile/:username）

[核心入口]
- 我的方块（Userspace）: /user-space
- 我的主页: /profile/:username
- BOH AI: /ai-chat（同时已集成在 /user-space 的 AI 标签页）
- AI广场: /ai-plaza（多模型统一入口）
- 论坛: /forum
- 消息中心: /user-center/messages（当前仅保留通知、点赞、评论、印象与系统消息）
- 社区伙伴: /user-center/partners
- 标签与印象: /user-center/tags-impressions
- 礼物与地址: /user-center/address
- 订阅与积分: /user-center/points
- Pushplus 推送设置: /user-center/pushplus-settings
- 节目: /shows（在 /user-space 的“社区”页也可展开进入）
- 登录: /login

[用户高频操作]
1) 如何给别人写印象（推荐路径）
   - 打开对方主页: /profile/:username
   - 切换到“印象”标签（Impressions）
   - 在输入框“写下你对 TA 的印象...”填写内容
   - 点击“发布印象”
   - 注意: 需要已登录，且不能给自己写印象

2) 如何给别人写印象（社区伙伴路径）
   - 打开 /user-center/partners
   - 找到目标用户，点击“写印象”
   - 在弹窗输入框填写内容
   - 点击“发布印象”

3) 如何查看我收到的印象
   - 路径 A: /profile/:username -> “印象”标签
   - 路径 B: /user-center/tags-impressions
   - 路径 C: /user-center/messages -> “印象”标签

4) 如何进入 BOH AI
   - 路径 A: /ai-chat
   - 路径 B: /user-space -> 底部导航“AI”标签
   - 路径 C: /ai-plaza

5) 如何进入节目
   - 路径 A: /shows
   - 路径 B: /user-space -> 底部“社区” -> 展开“社区节目” -> 进入节目页

6) 如何查看我的方块常用功能
   - /user-space -> “个人”标签下可进入礼物、订阅与积分、Pushplus、生日等
   - /profile/:username -> 查看帖子、评论、印象等个人主页内容
`;
