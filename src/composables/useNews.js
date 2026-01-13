import { ref } from "vue";

// 新闻数据 - 与Newsroom.vue保持一致
export const newsData = ref([
  {
    id: 12,
    category: "update",
    title: "网站更新：BOH网站Beta3",
    excerpt: "网站更新，页面重构",
    date: "2026-01-08",
    author: "blockofhome",
    image:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" style="background-color:white"><text x="50%" y="50%" font-size="48" text-anchor="middle" dominant-baseline="middle" fill="black">BOHBeta3</text></svg>',
    content: `
              <p><strong>2026/1/08</strong>，方块之家网站页面重构</p>
              <ul>
                  <li><strong>理念</strong>：删除了花哨，只留下极简设计和必须功能，提高了信息可读性和浏览视觉体验。</li>
                  <li><strong>首页</strong>：照片墙，拼图，多个内容合成。</li>
                  <li><strong>个人中心</strong>：重构，优化了个人中心体验。</li>
                  <li><strong>新内容</strong>：BOH BAG上架。</li>
              
              </ul>
              <p>网站性能再优化，删除了繁琐的内容。为大家带来更好的使用体验！</p>
          `,
  },
  {
    id: 11,
    category: "update",
    title: "网站更新：全新UI与周边上线",
    excerpt: "网站更新，全新的UI和全新的活动面板，商城面板",
    date: "2026-01-06",
    author: "blockofhome",
    image:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" style="background-color:white"><text x="50%" y="50%" font-size="48" text-anchor="middle" dominant-baseline="middle" fill="black">BOH网站Beta2</text></svg>',
    content: `
              <p><strong>2026/1/6</strong>，方块之家网站迎来重大更新！</p>
              <ul>
                  <li><strong>全新UI设计</strong>：玻璃UI，带来更加清爽的视觉体验</li>
                  <li><strong>活动面板</strong>：新增照片墙，方块之家活动的点点滴滴都在里面</li>
                  <li><strong>商城面板</strong>：全新的商城面板，礼物蓄势待发。</li>
                  <li><strong>新内容</strong>：BOH BAG上架。</li>
              
              </ul>
              <p>网站性能再优化，删除了繁琐的内容。为大家带来更好的使用体验！</p>
          `,
  },
  {
    id: 8,
    category: "event",
    title: "方块街12月特别活动",
    excerpt: "2025年12月12日，方块街将举办圣诞&生日会特别活动。",
    date: "2025-12-12",
    author: "blockofhome",
    image: "@/assets/images/2025wintermuseam.webp",
    content: `
              <p><strong>2025年12月12日</strong>，方块街将举办圣诞&生日会特别活动！</p>
              <ul>
                  <li>方块街冬季特别装饰</li>
                  <li>生日会特别活动环节</li>
                  <li>方块之家全新博物馆</li>
                  <li>黑白和小牛携手共建。</li>
              </ul>
              <p>感谢Everyone的参与！QA完美进行！</p>
          `,
  },
  {
    id: 6,
    category: "update",
    title: "官网重大更新：新增多项功能与UI优化",
    excerpt:
      "2025年12月7日，方块之家官网进行重大更新，新增了服务、健康支持和MBTI功能，UI界面焕然一新。",
    date: "2025-12-07",
    author: "blockofhome",
    image: "@/assets/images/Apple.png",
    content: `
              <p><strong>2025年12月7日</strong>，方块之家官网迎来重大更新！本次更新内容包括：</p>
              <ul>
                  <li><strong>新增服务功能</strong>：为用户提供更多便捷服务</li>
                  <li><strong>健康支持系统</strong>：关注用户身心健康</li>
                  <li><strong>MBTI测试功能</strong>：新增方块之家MC版本MBTI测试</li>
                  <li><strong>UI界面优化</strong>：整体界面焕然一新，提升用户体验</li>
              </ul>
              <p>感谢开发团队的辛勤付出，为大家带来更好的使用体验！</p>
          `,
  },
  {
    id: 1,
    category: "event",
    title: "方块之家7周年庆典圆满落幕",
    excerpt:
      "2025年7月21日，方块之家迎来了7周年生日，大家共同参与小牛特别制作回忆地图。",
    date: "2025-07-21",
    author: "Ryyik",
    image: "@/assets/images/2025-7years.png",
    content: `
              <p><strong>2025年7月21日</strong>，方块之家迎来了7周年生日。本次庆典活动内容包括：</p>
              <ul>
                  <li>小牛特别制作回忆地图</li>
                  <li>方块之家七周年礼物</li>
                  <li>方块之家纪念册上线，推出《方块之家·遇见》系列短片-厦门站。</li>
                  <li>大合照环节，纪念册封面由此诞生</li>
              </ul>
              <p>感谢每一位参与的玩家，方块之家因你们而精彩！</p>
          `,
  },
  {
    id: 2,
    category: "announce",
    title: "官网登录功能正式上线公告",
    excerpt:
      "方块之家官网个人功能于2025年11月13日上线，所有在12月25日前注册的用户都将收到年终回顾...",
    date: "2025-11-13",
    author: "LF",
    image: "@/assets/images/Writable_Book.png",
    content: `
              <p>亲爱的方块之家成员们，我们很高兴宣布：<strong>个人页功能</strong>即将于2025年11月13日正式上线！</p>
              <p>2025/12/31你将收到专属信件，这是由LF和Ryyik亲自撰写的，将为每位成员生成独一无二的年度回顾信件，内容包括：</p>
              <ul>
                  <li>📅 你的入群时长统计</li>
                  <li>🏷️ 你的专属称号标签</li>
                  <li>🎮 你参与过的项目与活动</li>
                  <li>💌 来自运营团队的私人寄语</li>
              </ul>
              <p>获取方式：登录官网 → 进入个人页面即可查看。</p>
          `,
  },
  {
    id: 3,
    category: "update",
    title: "冬季方块街更新：粒子效果与NPC系统",
    excerpt:
      "2025年冬季特别版本中加入全新粒子特效，并新增了互动NPC，还有神秘地图内容...",
    date: "2025-11-15",
    author: "小牛无聊",
    image: "@/assets/images/main3.png",
    content: `
              <h4>重大更新内容</h4>
              <p>本次冬季版本为方块街带来了前所未有的升级：</p>
              <ul>
                  <li><strong>粒子系统</strong>：雪花飘落❄️</li>
                  <li><strong>NPC互动</strong>：全新NPC，每位都有独特对话和任务线</li>
                  <li><strong>建筑扩展</strong>新增我和黑白特别制作的内容。</li>
              </ul>
              <p>感谢<b>小牛无聊</b>和<b>黑白</b>的辛苦建设！</p>
          `,
  },
  {
    id: 4,
    category: "community",
    title: "新成员雨芙蕖喵正式加入方块之家",
    excerpt:
      "欢迎新成员雨芙蕖喵于2025年8月27日加入方块之家大家庭，亮相方块街...",
    date: "2025-08-27",
    author: "blockofhome",
    image: "@/assets/images/qiuqian.PNG",
    content: `
              <p>热烈欢迎新成员<b>雨芙蕖喵</b>加入方块之家！</p>
              <p>入群日期：<strong>2025年8月27日</strong></p>
              <p>初始称号：<i>氛围组、很有梗、牛牛派</i></p>
              <p>雨芙蕖喵擅长氛围营造，期待她未来带来精彩作品！</p>
          `,
  },
  {
    id: 5,
    category: "event",
    title: "2025/12/5特别活动",
    excerpt:
      "方块之家首次举办礼物交换活动，玩家将随机抽签决定交换对象，方块街和圣诞小镇特别活动...",
    date: "2025-12-05",
    author: "LF",
    image: "@/assets/images/2024-newyears.png",
    content: `
              <p>🎁 <strong>首届礼物交换活动</strong>正式开启！</p>
              <p><b>活动时间</b>：2025年12月5日</p>
              <p><b>参与方式</b>：</p>
              <ul>
                  <li>在社群内填写报名表</li>
                  <li>12月5日系统随机分配交换对象</li>
                  <li>准备价值30-50元的礼物（实体或虚拟）</li>
              </ul>
              <p>目前已有6名玩家报名，快来参与吧！</p>
          `,
  },
  {
    id: 9,
    category: "update",
    title: "官网周边商城上线：纪念册与明信片等多项内容上线",
    excerpt:
      "方块之家周边商城正式上线，首批商品包括7周年纪念册、明信片套装等，所有周边均可免费获取...",
    date: "2025-11-20",
    author: "Ryyik",
    image: "@/assets/images/Commemorative-album.PNG",
    content: `
              <p>🛍️ <strong>周边正式上线！</strong></p>
              <p>首批上架商品：</p>
              <ul>
                  <li>📔 <b>7周年纪念册</b>（硬壳精装）- ¥34.99参考价</li>
                  <li>💌 <b>明信片套装*8张</b> - ¥8.99参考价</li>
                  <li>🖼️ <b>7周年海报</b> - ¥12.99参考价</li>
                  <li>🔧 <b>小牛定制系列</b>（吧唧、流麻等）- ¥6.99起</li>
              </ul>
              <p><b>获取方式</b>：所有周边均可通过活动抽奖或免费获取，仅需支付邮费。</p>
              <p>详情查看：<a href="shop.html" target="_blank">周边商城</a></p>
          `,
  },
  {
    id: 7,
    category: "announce",
    title: "2026年服务器发展路线图公布",
    excerpt: "运营团队公布2026年发展计划，包括模组生存服务器...",
    date: "2025-11-01",
    author: "admin",
    image: "@/assets/images/main2.webp",
    content: `
              <p>📋 <strong>2026年方块之家发展规划</strong></p>
              <p>运营团队经过深入讨论，确定了新一年的五大发展方向：</p>
              <ol>
                  <li><b>模组生存服务器</b>：年底启动</li>
                  <li><b>资金筹备</b>：服务器开设需要大家共同筹备资金</li>
                  <li><b>官网功能升级</b>：未来官网会加入更多新功能</li>
              </ol>
              <p>更多细节将在2026公布。欢迎成员提出建议！</p>
          `,
  },
]);

// 按日期降序排序
export const sortedNews = ref([]);

// 初始化新闻数据
export const initNews = () => {
  // 按日期降序排序
  sortedNews.value = [...newsData.value].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
};

// 获取最新新闻
export const getLatestNews = () => {
  if (sortedNews.value.length === 0) {
    initNews();
  }
  return sortedNews.value[0] || null;
};

// 获取所有新闻
export const getAllNews = () => {
  if (sortedNews.value.length === 0) {
    initNews();
  }
  return sortedNews.value;
};

// 获取分类名称
export const getCategoryName = (category) => {
  const names = {
    event: "活动公告",
    update: "更新日志",
    community: "社区动态",
    announce: "官方通知",
  };
  return names[category] || "其他";
};

// 初始化新闻数据
initNews();
