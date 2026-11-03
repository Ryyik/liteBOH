/**
 * Apple 极简邮件主题 —— 订单 / 审核两类**用户侧**邮件共用。
 *
 * 设计纪律（不是风格偏好，是这套版式能成立的原因）：
 *   1. **只有一个强调色**（#0071e3）。状态不靠彩色徽章表达，靠标题文案 + 进度线位置。
 *      彩色徽章一旦出现，一封信里就有 2~3 个色块，Apple 的观感立刻消失。
 *   2. **没有边框**。卡片与页面靠 #f5f5f7 / #ffffff 的明度差分开，只有分隔用 0.5px 发丝线。
 *   3. **靠留白分组**，不靠横线分组。所以下面到处是显式的 spacer，不要随手删。
 *   4. **全部 inline style**。Gmail 会剥离 <style> 里的部分选择器，<style> 一旦失效整封信塌掉。
 *   5. **table 布局**，不用 flex/grid —— Outlook 桌面版不认 flex，用 flex 的商品行会塌成竖排。
 *
 * 为什么放进 _shared：这两个模板原本在两支 Edge Function 里各写一套，
 * 圆角 14 vs 16、主色 #2f6fed vs #0f9d58、底色 #f5f6f8 vs #f5f5f7 —— 用户一次收两封会觉得不像同一家。
 * 改这里，两边一起变；不要在各自文件里再复制一份 token。
 */

/** SF 优先，回落到系统无衬线。中文用苹方，Windows 退到微软雅黑 */
export const MAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

export const MAIL_COLOR = {
  /** 页面底色（Apple 官网灰） */
  page: '#f5f5f7',
  card: '#ffffff',
  /** 主文字 */
  ink: '#1d1d1f',
  /** 正文说明 */
  ink2: '#6e6e73',
  /** 页脚 / 未达节点 */
  ink3: '#86868b',
  /** 发丝线 */
  hairline: '#d2d2d7',
  /** 唯一强调色 */
  accent: '#0071e3',
} as const;

/** 竖向留白。靠它分组，替代横线 */
export const MAIL_GAP = {
  s: 12,
  m: 24,
  l: 32,
  xl: 40,
} as const;

const spacer = (size: number) =>
  `<div style="height:${size}px;line-height:${size}px;font-size:0">&nbsp;</div>`;

export const mailSpacer = spacer;

/** 页眉小标：字距拉开、全大写观感，用来区分「哪套系统发的」，不抢标题 */
export const mailEyebrow = (text: string) =>
  `<div style="font-size:12px;letter-spacing:.12em;color:${MAIL_COLOR.ink3}">${text}</div>`;

/** 主标题：28px / 600 / 负字距 —— Apple 标题的识别点就在这个负字距 */
export const mailTitle = (text: string, size = 28) =>
  `<div style="font-size:${size}px;font-weight:600;line-height:1.2;letter-spacing:-0.02em;color:${MAIL_COLOR.ink};margin-top:14px">${text}</div>`;

export const mailParagraph = (text: string) =>
  `<div style="font-size:16px;line-height:1.6;color:${MAIL_COLOR.ink2};margin-top:12px">${text}</div>`;

export const mailDivider = () =>
  `<div style="height:0.5px;line-height:0.5px;font-size:0;background:${MAIL_COLOR.hairline}">&nbsp;</div>`;

/**
 * 胶囊按钮。980px 圆角是 Apple 官网 CTA 的值，不是随便取的。
 *   primary —— 正向下一步（查看订单 / 处理发货）
 *   quiet   —— 负向或中性流程（审核拒绝后「查看帖子」）。坏消息配实心主色按钮会显得在推销，
 *              描边版本才是 Apple 处理拒绝/删除类流程的做法。
 */
export const mailButton = (
  href: string,
  label: string,
  variant: 'primary' | 'quiet' = 'primary',
) => {
  const paint =
    variant === 'primary'
      ? `background:${MAIL_COLOR.accent};border:1px solid ${MAIL_COLOR.accent};color:#ffffff`
      : `background:transparent;border:1px solid ${MAIL_COLOR.hairline};color:${MAIL_COLOR.ink}`;
  return `<a href="${href}" style="display:inline-block;${paint};text-decoration:none;font-size:16px;line-height:1;padding:15px 30px;border-radius:980px">${label}</a>`;
};

/**
 * 卡片：白底 + 18px 圆角 + 无边框。返回一行 <tr>，便于和页脚行并列拼进外壳。
 * @param inner 卡片内 HTML
 * @param padding 桌面端内边距；移动端窄屏会显得挤，必要时传更小的值
 */
export const mailCard = (inner: string, padding = '40px 36px') =>
  `<tr><td style="background:${MAIL_COLOR.card};border-radius:18px;padding:${padding}">${inner}</td></tr>`;

export const mailFooter = (inner: string) =>
  `<tr><td style="padding:20px 10px 0;font-size:12px;line-height:1.7;color:${MAIL_COLOR.ink3};text-align:center">${inner}</td></tr>`;

/**
 * 外壳。preheader 是收件箱列表里标题后面那行摘要 —— 必须显式隐藏，
 * 否则它会被渲染在正文最上方，把第一屏顶开。
 *
 * color-scheme: light 是刻意的：暗色模式下客户端会反色，白卡片变黑、深色字变浅，
 * 但这套版式大量依赖「纯白卡片 + #f5f5f7 页面」的明度差，一反转层次就没了。
 */
export const mailDocument = ({ preheader, body }: { preheader: string; body: string }) =>
  `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${MAIL_COLOR.page}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MAIL_COLOR.page}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${MAIL_FONT};color:${MAIL_COLOR.ink}">
${body}
</table>
</td></tr></table>
</body></html>`;
