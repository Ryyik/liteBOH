/**
 * 生日邮件模板 —— 生日本人一年一封。
 *
 * 为什么单独成文件而不是塞进 follow-mail-send：
 *   1. 它是**纯函数**（无 Deno 全局、无网络），可以被 vitest 直接 import 断言，
 *      模板回归（漏转义、文案串号）才有测试能抓 —— EF 里的内联模板一条都测不到。
 *   2. 版式虽复用 _shared/mail-theme.ts 的 Apple 极简语言，但**语气完全不同**：
 *      订单邮件在报事实，审核邮件在道歉，生日邮件在说话给一个人听。
 *      混在一个文件里，后来者改订单文案时很容易顺手把生日那封也改成通报体。
 *
 * ── 版式：极简贺卡（2026-11-10 定稿，第二版）────────────────────────
 * 第一版试过节日装饰（四色渐变彩带 + 纸屑圆点 + 🎂 emoji + 暖色徽章），
 * 站长看了一眼否掉：**"彩虹元素不好看"**。教训写在这里，别再加回来 ——
 * 生日邮件的高级感来自「留白 + 品牌 + 一句话」，不是来自彩色装饰。
 *
 * 现在的构图（自上而下，全部居中）：
 *   品牌图（64px，站点自己的静态资源）
 *   HAPPY BIRTHDAY（11px，字距 .28em，灰）
 *   生日快乐，{昵称}（28px，墨色）
 *   两段短正文
 *   ——— 发丝线 ———
 *   你来方块之家已经 N 天（13px 灰）
 *   按钮（墨色胶囊）
 *
 * 三条硬约束：
 *   · **全信唯一的彩色是品牌图本身**（红苹果）。所以按钮刻意用墨色不用主色蓝 ——
 *     蓝按钮 + 红 logo 是两个强调色在打架，页面立刻显得廉价。
 *     这同时守住了 mail-theme 「一封信只有一个强调色」的纪律。
 *   · **不用 CSS 动画**：animation / @keyframes 在 Gmail App、Outlook（Word 引擎）
 *     都会被剥，而本版式建立在「全部 inline style」上（Gmail 连 <style> 都不保证留）。
 *     真要动效只能是 GIF，那是另一件事。
 *   · **只有一张图，且必须是绝对地址**。邮件里的相对路径 = 裂图；
 *     data URI 会被 Outlook/Gmail 剥；附件内嵌图在正文里拿不到 cid。
 *     图被客户端默认拦住时靠 alt 文本兜底，所以 width/height 必须写死（防塌版）。
 *
 * ⚠️ 用户昵称是**不可信输入**（用户自己可改），进 HTML 必须转义。
 *    这里刻意自备一份 escape 而不是从调用方传：模板不该依赖调用方记得转义，
 *    忘传一次就是一个人能在所有人的收件箱里注入标签。
 */

import {
  MAIL_COLOR,
  MAIL_GAP,
  mailCard,
  mailDivider,
  mailDocument,
  mailFooter,
  mailParagraph,
  mailSpacer,
  mailTitle,
} from './mail-theme.ts';

export type BirthdayMailInput = {
  /** 收件人昵称（未转义原文，函数内部负责转义） */
  name: string;
  /** 加入站点天数；null = 未知（不渲染那一行，不要显示「0 天」） */
  daysTogether: number | null;
  /** 站点绝对地址，用于品牌图 / 按钮 / 页脚链接 */
  siteOrigin: string;
};

export type BirthdayMail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * 品牌图标路径 —— 与站点 og:image 同一份资产（PWA 图标），
 * 落在站点域名下由 Cloudflare 直接吐（实测 200 / image/png / 6KB / 允许跨域）。
 * 换品牌图标时**这里要跟着改**，否则已发出的模板会指到一个 404。
 */
const BRAND_ICON_PATH = '/icons/icon-512-transparent.png';
/** 64px 是贺卡上方「印章」的尺寸：再大就像 App 启动页，再小认不出是苹果 */
const BRAND_ICON_SIZE = 64;

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** 昵称做一次收敛：去首尾空白、空值回落、超长截断（避免标题被撑爆） */
const normalizeName = (value: unknown) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '朋友';
  return [...text].length > 24 ? `${[...text].slice(0, 24).join('')}…` : text;
};

const normalizeOrigin = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\/+$/, '');

/**
 * 「你来了多久」那一行。
 *
 * 口径：daysTogether 是**已经过的整天数**（注册当天由调用方传 0）。
 *   · null  → 不渲染（资料缺失时不要编一个数字出来）
 *   · <= 0  → 第一次生日，单独一句（比「已经 0 天」体面）
 */
const daysLine = (daysTogether: number | null) => {
  if (daysTogether == null || !Number.isFinite(daysTogether)) return '';
  const days = Math.max(0, Math.trunc(daysTogether));
  return days <= 0
    ? '今年是你在这里的第一个生日'
    : `你来方块之家已经 ${days.toLocaleString('zh-CN')} 天`;
};

/** 居中包装：mailTitle / mailParagraph 自身不设 text-align，靠外层继承即可，不复制样式 */
const center = (inner: string) => `<div style="text-align:center">${inner}</div>`;

/**
 * 品牌图。
 *
 * 为什么套一层 table：Outlook 不认 `margin:0 auto`，img 会贴左；
 * `align="center"` 在 Word 引擎里才是稳的居中方式。
 * width/height 同时写属性和 style —— 图片被拦时盒子还在，正文不会跳一下。
 */
const brandMark = (origin: string) => {
  if (!origin) return '';
  const src = escapeHtml(`${origin}${BRAND_ICON_PATH}`);
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr><td align="center" style="font-size:0;line-height:0"><img src="${src}" width="${BRAND_ICON_SIZE}" height="${BRAND_ICON_SIZE}" alt="方块之家 BOH" style="display:block;width:${BRAND_ICON_SIZE}px;height:${BRAND_ICON_SIZE}px;border:0;outline:none;text-decoration:none" /></td></tr></table>`;
};

/** 英文小标：只做「信纸抬头」的层次，不抢中文标题 */
const kicker = () =>
  `<div style="font-size:11px;letter-spacing:.28em;color:${MAIL_COLOR.ink3}">HAPPY BIRTHDAY</div>`;

/**
 * 墨色胶囊按钮。
 *
 * 刻意**不用** mailButton 的 primary（品牌蓝）：这封信里唯一的彩色是品牌图，
 * 再加一个蓝按钮就变成两个强调色。mailButton 只有 primary/quiet 两档，
 * 为一种邮件去改共享主题的 API 不划算，所以这里自带一个。
 */
const inkButton = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${MAIL_COLOR.ink};border:1px solid ${MAIL_COLOR.ink};color:#ffffff;text-decoration:none;font-size:16px;line-height:1;padding:15px 30px;border-radius:980px">${label}</a>`;

export const renderBirthdayMail = (input: BirthdayMailInput): BirthdayMail => {
  const name = normalizeName(input.name);
  const safeName = escapeHtml(name);
  const origin = normalizeOrigin(input.siteOrigin);
  const homeUrl = origin || '';
  const settingsUrl = origin ? `${origin}/#/user-space/pushplus-settings` : '';
  const days = daysLine(input.daysTogether);
  const subject = `生日快乐，${name}`;

  const tail = [
    days
      ? [
          mailSpacer(MAIL_GAP.l),
          mailDivider(),
          mailSpacer(MAIL_GAP.m),
          center(
            `<div style="font-size:13px;line-height:1.6;color:${MAIL_COLOR.ink3}">${escapeHtml(days)}</div>`,
          ),
        ].join('')
      : '',
    homeUrl ? [mailSpacer(MAIL_GAP.l), center(inkButton(homeUrl, '回方块之家看看'))].join('') : '',
  ].join('');

  const body = [
    mailCard(
      [
        brandMark(origin),
        /* 品牌图与英文小标之间必须有这段留白：漏掉过一次，
           截图里 logo 直接贴到 "HAPPY BIRTHDAY" 上，像两个挤在一行的元素。 */
        origin ? mailSpacer(MAIL_GAP.m) : '',
        center(kicker()),
        center(mailTitle(`生日快乐，${safeName}`)),
        /* 标题（28px）下方必须多给一点：mailParagraph 自带 12px 对这么大号的标题
           显得贴脸，16px 才是「标题 → 正文」的呼吸。 */
        mailSpacer(4),
        /* 文案刻意短：居中排版下，一段如果折成「第一行 17 字 + 第二行 2 字」，
           那两个字会孤零零吊在中间，比不折行还难看（390px 实测踩过：
           「很久」被拆成「还很 / 久」、「做成」被拆成「做 / 成」）。
           邮件宽度由客户端决定、不能改字号去凑，只能靠文案长度与内边距控制。 */
        /* 文案（2026-11-10 站长亲自挑的三句）：
             · 方块之家给你留了盏灯，/ 生日快乐，平安顺遂。
             · 新的一岁，慢一点也没关系。/ 愿你今年少些将就。
           换行是**写死的 `<br>`**，不是交给客户端自动折行：
           这两句在 390px 上自动折会把「平安」「关系」劈成两半
           （第一版实测踩过「很久」→「还很 / 久」），断点只能自己钉。 */
        center(mailParagraph('方块之家给你留了盏灯，<br>生日快乐，平安顺遂。')),
        /* 段间距：line-height 1.6 下段内行距约 26px，段间只给 18px 会读成「连续四行」。
           24px（自带 12 + 额外 12）才让「1/2」和「3/4」明确成两组。 */
        mailSpacer(12),
        center(mailParagraph('新的一岁，慢一点也没关系。<br>愿你今年少些将就。')),
        tail,
      ].join(''),
      /* 内边距比 mail-theme 默认的 40/36 收窄：贺卡在 390px 手机上，
         36px 的左右留白会把正文挤到每行 17 字，短文案也会被折成两行。 */
      '40px 28px',
    ),
    mailFooter(
      /* 断行放在语义边界：单行太长会在 375px 手机上把「生日邮件」拆成两半 */
      `这封邮件在你生日当天 00:00 自动发送到账号绑定邮箱<br>${
        settingsUrl
          ? `不想再收到？在「通知设置」里关闭<a href="${escapeHtml(settingsUrl)}" style="color:${MAIL_COLOR.accent};text-decoration:none">生日邮件</a>`
          : '不想再收到？在「通知设置」里关闭生日邮件'
      }`,
    ),
  ].join('');

  const html = mailDocument({
    /* preheader 也是 HTML —— 它会被藏在正文最上方，但**照样解析标签**。
       这里必须用 safeName，2026-11-10 单测就是在这条上抓到的漏转义。 */
    preheader: `${safeName}，今天是你的生日 · 方块之家 BOH`,
    body,
  });

  const text = [
    `生日快乐，${name}`,
    '',
    '方块之家给你留了盏灯，生日快乐，平安顺遂。',
    '新的一岁，慢一点也没关系。愿你今年少些将就。',
    days ? `\n${days}` : '',
    homeUrl ? `\n回方块之家看看：${homeUrl}` : '',
    '',
    '这封邮件在你生日当天 00:00 自动发送到账号绑定邮箱。',
    settingsUrl
      ? `不想再收到？去 ${settingsUrl} 关闭生日邮件。`
      : '不想再收到？在「通知设置」里关闭生日邮件。',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { subject, html, text };
};
