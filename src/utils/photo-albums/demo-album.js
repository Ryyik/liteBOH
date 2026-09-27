/**
 * 摄影集示例数据（Demo）
 *
 * 用途：影集列表页「查看 Demo」入口 —— 让新用户在创建第一本影集前，
 * 直接体验阅读页的翻页 / 章节 / 配文 / 版式效果。
 * 纯前端静态数据，不写库、不占配额；阅读页对 id === 'demo' 走本模块。
 * 图片为仓库内置素材（public/demo-album/，来源 picsum.photos），离线可用。
 */

const PHOTOS = [
  {
    id: 'demo-p1',
    url: '/demo-album/p1.jpg',
    ratio: 'landscape',
    caption: '沿海公路一直开，海就在右手边。',
  },
  {
    id: 'demo-p2',
    url: '/demo-album/p2.jpg',
    ratio: 'landscape',
    caption: '清晨的山谷还睡着，雾是从林子里长出来的。',
  },
  {
    id: 'demo-p3',
    url: '/demo-album/p3.jpg',
    ratio: 'portrait',
    caption: '老巷子的石板路被走得发亮。',
  },
  {
    id: 'demo-p4',
    url: '/demo-album/p4.jpg',
    ratio: 'square',
    caption: '靠窗的位置，一杯咖啡一个上午。',
  },
  {
    id: 'demo-p5',
    url: '/demo-album/p5.jpg',
    ratio: 'landscape',
    caption: '灯塔亮起来的时候，天是紫色的。',
  },
  {
    id: 'demo-p6',
    url: '/demo-album/p6.jpg',
    ratio: 'square',
    caption: '集市的水果摊，颜色比招牌还响。',
  },
  {
    id: 'demo-p7',
    url: '/demo-album/p7.jpg',
    ratio: 'portrait',
    caption: '雨后的霓虹，落在地上就捡不起来。',
  },
  {
    id: 'demo-p8',
    url: '/demo-album/p8.jpg',
    ratio: 'landscape',
    caption: '沙滩上只有我一串脚印。',
  },
];

const photo = (id) => PHOTOS.find((item) => item.id === id);

/** 组装一本示例影集（结构与 photo-albums-api 的 normalizeAlbumBundle 一致） */
export function buildDemoAlbumBundle() {
  return {
    album: {
      id: 'demo',
      userId: '',
      title: '山与海的一周',
      subtitle: '示例影集 · 体验翻页、章节与排版',
      coverUrl: photo('demo-p1').url,
      status: 'published',
      sharedToCommunity: false,
      photoCount: PHOTOS.length,
      createdAt: '',
      updatedAt: '',
    },
    photos: PHOTOS,
    pages: [
      {
        id: 'demo-page-0',
        pageIndex: 0,
        pageType: 'cover',
        layoutId: 'full',
        chapterTitle: '',
        note: '',
        photoRefs: [],
      },
      {
        id: 'demo-page-1',
        pageIndex: 1,
        pageType: 'content',
        layoutId: 'img-left-text',
        chapterTitle: '',
        note: '出发的头两天都在山里。雾散得慢，我们走得也慢，正好。',
        photoRefs: ['demo-p2'],
      },
      {
        id: 'demo-page-2',
        pageIndex: 2,
        pageType: 'content',
        layoutId: 'duo',
        chapterTitle: '',
        note: '',
        photoRefs: ['demo-p3', 'demo-p4'],
      },
      {
        id: 'demo-page-3',
        pageIndex: 3,
        pageType: 'chapter',
        layoutId: 'full',
        chapterTitle: '市井与烟火',
        note: '下山之后，一头扎进了热闹里。',
        photoRefs: [],
      },
      {
        id: 'demo-page-4',
        pageIndex: 4,
        pageType: 'content',
        layoutId: 'trio',
        chapterTitle: '',
        note: '',
        photoRefs: ['demo-p6', 'demo-p7', 'demo-p4'],
      },
      {
        id: 'demo-page-5',
        pageIndex: 5,
        pageType: 'content',
        layoutId: 'grid4',
        chapterTitle: '',
        note: '',
        photoRefs: ['demo-p4', 'demo-p6', 'demo-p7', 'demo-p8'],
      },
      {
        id: 'demo-page-6',
        pageIndex: 6,
        pageType: 'content',
        layoutId: 'hero-text',
        chapterTitle: '',
        note: '把一周走成了两季：山里是安静的春天，海边是明亮的夏天。',
        photoRefs: ['demo-p5'],
      },
      {
        id: 'demo-page-7',
        pageIndex: 7,
        pageType: 'end',
        layoutId: 'full',
        chapterTitle: '',
        note: '感谢翻阅 —— 这是示例影集，去装帧一本你自己的吧。',
        photoRefs: [],
      },
    ],
  };
}
