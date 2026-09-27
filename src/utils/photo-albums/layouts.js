/**
 * 摄影集版式库（数据即版式：引擎只认 slots 描述，扩展版式不动引擎）
 *
 * 设计文档：docs/superpowers/specs/2026-09-27-photo-albums-design.md §4/§9
 * - P1 六版式：full / duo / trio / grid4 / img-left-text / img-right-text
 * - P2 追加：hero-text（通栏题图）/ strip（胶片条）
 *
 * 渲染契约（编辑器画布与阅读页共用）：
 *   - layout.gridAreas → CSS grid-template-areas（含文字区 t 时由消费方渲染配文）
 *   - layout.maxPhotos → photo_refs 槽位上限
 *   - 未填满的槽位渲染为占位框（编辑器）/直接折叠（阅读页）
 */

export const PAGE_TYPES = {
  cover: '封面',
  chapter: '章节',
  content: '内容',
  end: '尾页'
};

export const ALBUM_LAYOUTS = {
  full: {
    id: 'full',
    name: '全幅',
    icon: '▭',
    description: '单张大图铺满整页',
    maxPhotos: 1,
    gridAreas: '"p0"',
    gridTemplate: '1fr / 1fr'
  },
  duo: {
    id: 'duo',
    name: '双图',
    icon: '◫◫',
    description: '左右两张并排',
    maxPhotos: 2,
    gridAreas: '"p0 p1"',
    gridTemplate: '1fr / 1fr 1fr',
    gap: 'md'
  },
  trio: {
    id: 'trio',
    name: '三图',
    icon: '⊞',
    description: '一横两竖组合',
    maxPhotos: 3,
    gridAreas: '"p0 p0" "p1 p2"',
    gridTemplate: '1.4fr 1fr / 1fr 1fr',
    gap: 'md'
  },
  grid4: {
    id: 'grid4',
    name: '四宫格',
    icon: '▦',
    description: '2×2 均衡排布',
    maxPhotos: 4,
    gridAreas: '"p0 p1" "p2 p3"',
    gridTemplate: '1fr 1fr / 1fr 1fr',
    gap: 'md'
  },
  'img-left-text': {
    id: 'img-left-text',
    name: '左图右文',
    icon: '▥',
    description: '左图右侧配文区',
    maxPhotos: 1,
    textArea: true,
    gridAreas: '"p0 t"',
    gridTemplate: '1fr / 1.5fr 1fr'
  },
  'img-right-text': {
    id: 'img-right-text',
    name: '右图左文',
    icon: '▤',
    description: '右图左侧配文区',
    maxPhotos: 1,
    textArea: true,
    gridAreas: '"t p0"',
    gridTemplate: '1fr / 1fr 1.5fr'
  },
  'hero-text': {
    id: 'hero-text',
    name: '题图页',
    icon: '▬',
    description: '通栏题图 + 下方大字配文',
    maxPhotos: 1,
    heroText: true,
    gridAreas: '"p0" "t"',
    gridTemplate: '1.7fr 1fr / 1fr'
  },
  strip: {
    id: 'strip',
    name: '胶片条',
    icon: '▤▤▤',
    description: '横向胶片带，最多五张',
    maxPhotos: 5,
    strip: true,
    gridAreas: '"p0 p1 p2 p3 p4"',
    gridTemplate: '1fr / repeat(5, 1fr)',
    gap: 'sm'
  }
};

/** 内容页可用版式（章节页/封面页不开放版式切换） */
export const CONTENT_LAYOUT_IDS = Object.keys(ALBUM_LAYOUTS);

export function getLayout(layoutId) {
  return ALBUM_LAYOUTS[layoutId] || ALBUM_LAYOUTS.full;
}

export function getLayoutOptions() {
  return Object.values(ALBUM_LAYOUTS).map(({ id, name, icon, description }) => ({
    id,
    name,
    icon,
    description
  }));
}
