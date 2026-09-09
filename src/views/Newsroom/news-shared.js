/**
 * 新闻板块共享常量 —— 列表页（index.vue）/ 详情灵动岛 / 独立详情页（NewsDetailPage）共用。
 * 收口到这里，避免「详情页再抄一份消毒选项」导致两处白名单漂移。
 */

// 富文本正文白名单：与 AdminContentPublishModal 产出的内容形态对齐
export const NEWS_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'span', 'b', 'i', 'u'],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
};

// 列表卡片封面：裁切填充
export const NEWS_CARD_IMAGE_TRANSFORM = 'f_auto,q_auto,c_fill,g_auto,w_900,h_540';
// 详情大图：限制宽度不裁切（详情岛「modal」与独立详情页同用此档）
export const NEWS_DETAIL_IMAGE_TRANSFORM = 'f_auto,q_auto,c_limit,w_1600';
