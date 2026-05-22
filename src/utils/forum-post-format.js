const DEFAULT_POST_TITLE = '无标题';

function stripLegacyTitlePrefix(body = '', title = '') {
  const safeBody = String(body || '').trim();
  const safeTitle = String(title || '').trim();
  if (!safeBody) return '';
  if (!safeTitle) return safeBody.replace(/^【[^】]+】\s*/, '');
  const titlePattern = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safeBody.replace(new RegExp(`^【\\s*${titlePattern}\\s*】\\s*`), '');
}

export function splitForumPostContent(content = '', title = '', body = '') {
  const explicitTitle = String(title || '').trim();
  const explicitBody = String(body || '').trim();

  if (explicitTitle || explicitBody) {
    return {
      title: explicitTitle || DEFAULT_POST_TITLE,
      body: stripLegacyTitlePrefix(explicitBody, explicitTitle)
    };
  }

  const raw = String(content || '').trim();
  if (!raw) {
    return { title: DEFAULT_POST_TITLE, body: '' };
  }

  const match = raw.match(/^【(.*?)】\n?([\s\S]*)$/);
  if (!match) {
    return { title: DEFAULT_POST_TITLE, body: raw };
  }

  const parsedTitle = String(match[1] || '').trim();
  return {
    title: parsedTitle || DEFAULT_POST_TITLE,
    body: stripLegacyTitlePrefix(String(match[2] || '').trim(), parsedTitle)
  };
}

export function getForumPostParts(postOrContent = {}) {
  if (postOrContent && typeof postOrContent === 'object') {
    return splitForumPostContent(postOrContent.content, postOrContent.title, postOrContent.body);
  }
  return splitForumPostContent(postOrContent);
}

export function getForumPostTitle(postOrContent = {}) {
  return getForumPostParts(postOrContent).title;
}

export function getForumPostBody(postOrContent = {}) {
  return getForumPostParts(postOrContent).body;
}

export function getForumPostExcerpt(postOrContent = {}, maxLength = 80) {
  const body = getForumPostBody(postOrContent);
  const title = getForumPostTitle(postOrContent);
  const text = String(body || title || '').trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
