export const formatPostDraftPreview = (draft = {}) => ([
  '我已为你起草发帖内容。',
  draft.postTitle || '（未填写标题）',
  draft.postContent || '（未填写正文）',
  '',
  '你可以继续发来新的标题或正文。',
  '确认后回复“确认发布”，放弃回复“取消”。'
].join('\n'));

export const formatPageDraftPreview = (draft = {}) => ([
  '我已为你生成网页代码。',
  `页面类型：${draft.pageType || '展示页'}`,
  '',
  draft.pageHtml || '（正在生成代码...）',
  '',
  '你可以继续描述修改要求。',
  '确认后回复"发送到创作工作台"进入可视化编辑，或直接复制代码。'
].join('\n'));
