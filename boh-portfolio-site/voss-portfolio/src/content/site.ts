export interface CaseImage {
  src: string;
  alt: string;
  caption: string;
}

export interface Project {
  slug: string;
  title: string;
  category: string;
  year: string;
  role: string;
  summary: string;
  cover: string;
  coverAlt: string;
  intro: string;
  challenge: string;
  approach: { heading: string; body: string }[];
  outcome: string;
  images: CaseImage[];
}

export const site = {
  name: '方块之家 BOH',
  monogram: 'BOH',
  role: '社群历史 · 数字叙事 · 创意开发',
  location: '中国 · 线上工作室',
  availability: '社群资料改编演示',
  email: 'hello@boh.example',
  socials: [] as { label: string; href: string }[],
  nav: [
    { label: '作品', href: '/#work' },
    { label: '关于', href: '/#about' },
    { label: '联系', href: '/#contact' },
  ],
};

export const hero = {
  line1: '方块之家',
  line2: '社群历史 & 数字叙事',
};

export const studies = {
  heading: '空间习作',
  intro: '七个历史片段，从第一座空岛到云上咖啡店，把方块之家的共同记忆重新排成一条可漫游的时间线。',
};

export const about = {
  heading: '关于',
  paragraphs: [
    '方块之家 BOH 的历史，由一张张地图、一场场活动与一次次重逢组成。这份作品集把散落在服务器里的共同记忆，整理成七个可阅读、可漫游的数字片段。',
    '我们保留原始社群资料的温度，再用字体、网格、色彩与动效建立当代表达。图片来自方块之家社群历史素材，项目叙事与页面编排为虚构演示。',
    '设计不只是回看过去，也是为下一次相遇留出位置。每个案例都围绕一个简单问题：如何让一段记忆，在新的媒介里继续发生。',
  ],
  experience: [
    { period: '01 / 回看', item: '服务器地图、周年庆与节日活动档案' },
    { period: '02 / 重组', item: '社群叙事、视觉系统与空间体验设计' },
    { period: '03 / 继续', item: '前端开发、交互动效与数字展览实验' },
  ],
  portrait: '/images/boh/about-anniversary.jpg',
  portraitAlt: '方块之家八周年校园设定集中的方块角色群像',
  caption: '八周年 · 方块之家社群资料',
};

export const capabilities = [
  {
    title: '社群视觉档案',
    body: '从历史截图、活动海报与服务器场景中提取视觉线索，建立可检索、可延展的数字档案。',
  },
  {
    title: '活动与空间叙事',
    body: '把地图、周年庆与节日活动转译成有节奏的浏览体验，让观众先感受到现场，再理解故事。',
  },
  {
    title: '创意前端开发',
    body: '使用 React、TypeScript 与 WebGL 构建沉浸式页面，兼顾加载性能、移动端与低性能设备。',
  },
  {
    title: '交互与动效',
    body: '用空间视差、横向画廊与页面转场连接不同年代；动效服务于记忆的连续感。',
  },
];

export const contact = {
  heading: '把记忆搭成下一座岛。',
  line: '这是一份基于方块之家社群历史资料制作的虚构作品集演示。若你也在整理社群、活动或品牌记忆，欢迎从一句「你好」开始。',
};

export const projects: Project[] = [
  {
    slug: 'origin-map',
    title: 'Origin Map',
    category: '服务器地图',
    year: '2018',
    role: '档案整理、视觉叙事、空间原型',
    summary: '回到云海上的第一座方块空岛，用一张地图记录方块之家的起点。',
    cover: '/images/boh/origin-map.jpg',
    coverAlt: '2018 年云海上的第一座方块空岛与出生点桥梁',
    intro:
      'Origin Map 从 2018 年的第一张自制地图开始。画面里的空岛、桥梁与出生点，是社群最早共同拥有的空间记忆。',
    challenge:
      '原始截图信息有限，如何让不熟悉服务器的观众也能理解“起点”，而不是只看到一片方块景观？',
    approach: [
      {
        heading: '先找到坐标',
        body: '把空岛、桥梁与出生点整理成三个视觉锚点，让第一屏就能建立空间关系。',
      },
      {
        heading: '保留时间质感',
        body: '不覆盖原图的颗粒与光线，用排版和留白把历史感留给画面本身。',
      },
      {
        heading: '让地图可漫游',
        body: '通过视差与缩放模拟在岛屿上方缓慢移动，而不是把截图放进静态卡片。',
      },
    ],
    outcome: '形成一段可从首页进入的空间叙事原型，所有图片来自方块之家社群历史资料。',
    images: [
      {
        src: '/images/boh/origin-map-detail.jpg',
        alt: '2019 年扩展后的空岛道路与建筑',
        caption: '一年后 — 道路、平台与聚落开始生长。',
      },
      {
        src: '/images/boh/origin-map.jpg',
        alt: '2018 年第一座方块空岛',
        caption: '原点 — 云海上的第一座桥，也是故事的开始。',
      },
    ],
  },
  {
    slug: 'server-play',
    title: 'Server Play',
    category: '服务器玩法',
    year: '2019',
    role: '内容策划、视觉系统、交互设计',
    summary: '把神奇宝贝服务器与四周年舞台放在同一条玩法时间线上，回看社群如何一起玩。',
    cover: '/images/boh/server-play.jpg',
    coverAlt: '2019 年方块世界中的精灵球与服务器场景',
    intro:
      'Server Play 记录服务器玩法的一次转向：从自由建造到主题玩法，再到周年庆舞台。变化的是内容，不变的是成员一起参与的方式。',
    challenge: '不同年份、不同主题的素材很容易变成零散相册；需要找到一条能贯穿玩法变化的叙事线。',
    approach: [
      {
        heading: '用玩法串联',
        body: '以探索、收集、庆典三个动作组织素材，让观众跟随参与方式而不是日期阅读。',
      },
      {
        heading: '统一视觉节奏',
        body: '通过一致的标题层级与色彩标记区分主题，同时保留每张原图的现场氛围。',
      },
      { heading: '留下参与入口', body: '每个章节都以一个可操作的动作收尾，暗示故事还可以继续。' },
    ],
    outcome: '完成一套跨年份的玩法档案演示，把服务器历史从截图集合变成可阅读的社群故事。',
    images: [
      {
        src: '/images/boh/server-play-detail.jpg',
        alt: '2022 年四周年红色舞台与烟花',
        caption: '四周年 — 舞台、烟花与成员共同完成的现场。',
      },
      {
        src: '/images/boh/server-play.jpg',
        alt: '2019 年神奇宝贝服务器场景',
        caption: '玩法分支 — 探索、收集与新的共同话题。',
      },
    ],
  },
  {
    slug: 'anniversary',
    title: 'Anniversary',
    category: '周年庆典',
    year: '2022',
    role: '活动视觉、数字展览、叙事设计',
    summary: '以四周年舞台与圣诞生日会为线索，把庆典的热闹整理成可以回看的数字现场。',
    cover: '/images/boh/anniversary.jpg',
    coverAlt: '2022 年四周年红色舞台、烟花与方块成员',
    intro:
      'Anniversary 关注周年庆如何成为社群的共同节点。舞台、烟花、礼物与合影，不只是活动装饰，而是成员关系的可见证据。',
    challenge: '庆典素材往往强烈、密集；数字展示需要保留现场能量，同时给故事留出呼吸。',
    approach: [
      {
        heading: '先看人，再看舞台',
        body: '用群像建立情绪，再逐步展开舞台与细节，避免一开始就淹没在烟花里。',
      },
      {
        heading: '让颜色承载年份',
        body: '四周年使用红色作为记忆标记，圣诞章节转向暖色，形成清晰的时间变化。',
      },
      { heading: '控制动效速度', body: '转场缓慢、克制，让原图的节日气氛成为主角。' },
    ],
    outcome: '形成四周年与生日会的双章节数字展览原型，所有画面均来自社群活动资料。',
    images: [
      {
        src: '/images/boh/anniversary-detail.jpg',
        alt: '2023 年圣诞树、礼物与暖灯群像',
        caption: '生日会 — 灯光、礼物与又一次相聚。',
      },
      {
        src: '/images/boh/anniversary.jpg',
        alt: '2022 年四周年舞台',
        caption: '四周年 — 把同一晚的热闹留在画面里。',
      },
    ],
  },
  {
    slug: 'new-year',
    title: 'New Year',
    category: '节日活动',
    year: '2022',
    role: '活动策划、动态视觉、网页体验',
    summary: '从绿色极光到新年舞台，把跨年烟花重新编排成一条明亮的时间线。',
    cover: '/images/boh/new-year.jpg',
    coverAlt: '2022 年末绿色极光、彩色烟花与黄色舞台',
    intro:
      'New Year 把不同年份的跨年记忆放在一起。极光、烟花、舞台与游乐设施，构成社群对“一起过年”的共同印象。',
    challenge: '夜景素材普遍曝光强、颜色多；需要统一视觉，同时不削弱节日现场的丰富度。',
    approach: [
      { heading: '用夜色统一', body: '深色背景连接所有截图，让烟花与灯光自然成为视觉焦点。' },
      {
        heading: '让节奏由疏到密',
        body: '从单张夜景逐步进入群像与舞台，模拟烟花从远处到身边的过程。',
      },
      { heading: '保留一点安静', body: '在章节之间加入短促留白，让强烈的色彩有时间沉淀。' },
    ],
    outcome: '完成跨年活动的网页叙事原型，以慢速空间转场连接不同年份的共同记忆。',
    images: [
      {
        src: '/images/boh/new-year-detail.jpg',
        alt: '2024 年新年游乐园舞台与成员集合',
        caption: '2024 — 舞台变成一座临时游乐园。',
      },
      {
        src: '/images/boh/new-year.jpg',
        alt: '2022 年末极光烟花活动',
        caption: '2022 — 极光、烟花与一起倒数的人。',
      },
    ],
  },
  {
    slug: 'block-street',
    title: 'Block Street',
    category: '活动地图',
    year: '2024',
    role: '空间设计、内容系统、交互原型',
    summary: '走进农夫乐事方块街，用店铺、暖灯与节日舞台拼出一条可以逛街的数字街道。',
    cover: '/images/boh/block-street.jpg',
    coverAlt: '2024 年农夫乐事方块街的雪地建筑与暖灯商铺',
    intro:
      'Block Street 来自 2024 年农夫乐事活动地图。雪地、街铺、暖灯与跑酷舞台，让服务器暂时变成一座有生活感的小镇。',
    challenge: '活动地图空间跨度大、店铺信息密集；网页需要像逛街一样自然，而不是做成一张说明图。',
    approach: [
      { heading: '沿街道推进', body: '用横向移动模拟逛街，让建筑与摊位按空间顺序出现。' },
      { heading: '细节构成故事', body: '价目牌、灯笼与暖灯成为内容锚点，帮助观众理解小镇的日常。' },
      { heading: '移动端优先', body: '触屏使用原生滑动，桌面端再加入视差与玻璃边缘效果。' },
    ],
    outcome: '形成活动地图的响应式浏览原型，手机与桌面共享同一套街道叙事。',
    images: [
      {
        src: '/images/boh/block-street-detail.jpg',
        alt: '2024 年新年跑酷舞台与灯笼礼物',
        caption: '街尾 — 节日舞台把逛街变成一场活动。',
      },
      {
        src: '/images/boh/block-street.jpg',
        alt: '2024 年农夫乐事方块街',
        caption: '街景 — 雪、暖灯与一间间共同搭建的店铺。',
      },
    ],
  },
  {
    slug: 'winter-community',
    title: 'Winter Community',
    category: '季节社群',
    year: '2024',
    role: '社群叙事、视觉设计、交互体验',
    summary: '从新年雪山跑酷到冬季地图，把寒冷季节里的重逢做成一段温暖的空间记忆。',
    cover: '/images/boh/winter-community.jpg',
    coverAlt: '2024 年新年雪山跑酷场景与方块成员',
    intro:
      'Winter Community 记录冬季社群的两条线索：一条是雪山跑酷的活力，另一条是灯笼、竹林与夜景里的安静重逢。',
    challenge: '“动”和“静”来自不同活动，需要让它们在同一个故事里自然切换。',
    approach: [
      {
        heading: '用温度组织',
        body: '跑酷章节明亮、轻快，冬季地图章节克制、温暖，形成情绪上的呼吸。',
      },
      { heading: '让季节成为线索', body: '雪、灯笼与夜色反复出现，把不同年份连接到同一个冬天。' },
      { heading: '慢一点阅读', body: '减少浮层与按钮，让画面和短句承担主要叙事。' },
    ],
    outcome: '完成冬季社群的双场景演示，以节奏变化表达活动与日常的不同温度。',
    images: [
      {
        src: '/images/boh/winter-community-detail.jpg',
        alt: '2025 年冬季地图的灯笼、花木与建筑夜景',
        caption: '冬眠与重逢 — 灯笼亮起，大家又回到这里。',
      },
      {
        src: '/images/boh/winter-community.jpg',
        alt: '2024 年新年雪山跑酷',
        caption: '雪山跑酷 — 寒冷季节里的一次共同出发。',
      },
    ],
  },
  {
    slug: 'cloud-cafe',
    title: 'Cloud Cafe',
    category: '八周年活动',
    year: '2026',
    role: '空间叙事、品牌体验、创意开发',
    summary: '在云上咖啡店走一圈，从露台、回忆墙到制作台，重新遇见八周年的日常。',
    cover: '/images/boh/cloud-cafe.jpg',
    coverAlt: '2026 年八周年云上咖啡店露台与蓝天',
    intro:
      'Cloud Cafe 把八周年云上咖啡店拆成几个可以停留的空间：露台、入口、回忆墙与制作区。它们共同构成一个关于相聚的微型世界。',
    challenge: '咖啡馆不是单一画面，而是一组有功能、有回忆的空间；数字体验需要保留这种行走感。',
    approach: [
      { heading: '按空间顺序讲述', body: '从室外进入室内，再到制作区，让浏览像一次真实到访。' },
      { heading: '让回忆成为主角', body: '照片墙与群像比装饰更重要，视觉系统尽量退后。' },
      { heading: '用转场连接空间', body: '页面之间使用缓慢擦除，保持云上世界的连续感。' },
    ],
    outcome: '完成云上咖啡店的空间叙事原型，以真实社群资料讲述八周年的相聚日常。',
    images: [
      {
        src: '/images/boh/cloud-cafe-detail.jpg',
        alt: '2026 年云上咖啡店室内桌椅、吊灯与回忆墙',
        caption: '店内 — 坐下、聊天，把这一刻变成回忆。',
      },
      {
        src: '/images/boh/cloud-cafe.jpg',
        alt: '2026 年云上咖啡店露台',
        caption: '露台 — 云上见面，从一句“来了？”开始。',
      },
    ],
  },
];

export const motion = {
  ease: 'power3.out',
  heroReveal: { duration: 1.1, stagger: 0.12 },
  transition: { duration: 0.55 },
};

export const getProject = (slug: string) => projects.find((project) => project.slug === slug);
export const nextProject = (slug: string) => {
  const index = projects.findIndex((project) => project.slug === slug);
  return projects[(index + 1) % projects.length];
};
