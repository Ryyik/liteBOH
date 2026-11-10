/**
 * 生日邮件模板守卫（2026-11-10）。
 *
 * 为什么专门为一个模板写测试：这套模板是**纯函数**，出了错没有任何运行时信号 ——
 * 邮件发出去就发出去了，没有 500、没有日志、没人会去看已发送箱。
 * 而它错的代价很实在：
 *   1. 昵称是用户自己可改的不可信输入 ⇒ 漏转义 = 任何人能给别人的收件箱注入标签；
 *   2. 「来了多久」那一行在资料缺失时会变成 `NaN 天` / `已经 0 天`，一封一年只有一次的
 *      邮件里出现这种字，比不发更糟；
 *   3. 开关说「可在通知设置关闭」，模板里的链接就必须指到那个页面 —— 指错等于骗人。
 *
 * 断言刻意都打在**渲染出的字符串**上，而不是内部实现：模板重排、改文案都不该让它红，
 * 只有「这封邮件能不能安全发出去」变了才红。
 */
import { describe, expect, it } from 'vitest';
import { renderBirthdayMail } from '../../supabase/functions/_shared/birthday-mail.ts';

const ORIGIN = 'https://www.blockofhome.cn';
const render = (overrides = {}) =>
  renderBirthdayMail({ name: '阿方', daysTogether: 100, siteOrigin: ORIGIN, ...overrides });

describe('生日邮件模板', () => {
  it('标题带昵称，且不含任何 HTML 片段', () => {
    const { subject } = render();
    expect(subject).toBe('生日快乐，阿方');
    expect(subject).not.toContain('<');
  });

  it('昵称里的标签被转义，不能注入到 HTML 里', () => {
    // 刻意用短 payload：超过 24 字会被截断加省略号，那样断的是截断逻辑不是转义逻辑
    const evil = '<b>坏</b>';
    const { html, text } = render({ name: evil });
    // 原文不得出现在 html 中（转义后是 &lt;b&gt;坏…）
    expect(html).not.toContain('<b>坏</b>');
    expect(html).toContain('&lt;b&gt;坏');
    expect(text).toContain(evil); // 纯文本版不需要转义，照原样出现
  });

  it('preheader（收件箱摘要）里的昵称同样被转义', () => {
    const { html } = render({ name: '<b>坏</b>' });
    // preheader 藏在正文最上方，但客户端照样解析标签 —— 这是单测抓到过的真实漏洞
    expect(html).not.toContain('<b>坏</b>');
    expect(html).toContain('&lt;b&gt;坏&lt;/b&gt;，今天是你的生日');
  });

  it('空昵称回落到「朋友」，不留空标题', () => {
    const { subject, html } = render({ name: '   ' });
    expect(subject).toBe('生日快乐，朋友');
    expect(html).toContain('生日快乐，朋友');
  });

  it('超长昵称被截断到 24 个字符 + 省略号（标题不被撑爆）', () => {
    const long = '方'.repeat(40);
    const { subject } = render({ name: long });
    expect(subject).toBe(`生日快乐，${'方'.repeat(24)}…`);
  });

  it('天数未知时不渲染「来了多久」，也不出现 NaN / undefined', () => {
    const unknown = render({ daysTogether: null });
    expect(unknown.html).not.toContain('你来方块之家');
    expect(unknown.html).not.toContain('NaN');
    expect(unknown.text).not.toContain('NaN');
    expect(unknown.text).not.toContain('undefined');
    // 资料缺失时只少一行，正文骨架仍在
    expect(unknown.html).toContain('方块之家给你留了盏灯');
  });

  it('注册当天（0 天）说「第一个生日」，不说「已经 0 天」', () => {
    const today = render({ daysTogether: 0 });
    expect(today.html).toContain('今年是你在这里的第一个生日');
    expect(today.html).not.toContain('已经 0 天');
  });

  it('天数千分位显示（3650 → 3,650）', () => {
    const { html } = render({ daysTogether: 3650 });
    expect(html).toContain('3,650 天');
  });

  it('回到站点的按钮与「关闭生日邮件」的链接都指向正确地址', () => {
    const { html, text } = render();
    expect(html).toContain(`href="${ORIGIN}"`);
    expect(html).toContain(`${ORIGIN}/#/user-space/pushplus-settings`);
    expect(text).toContain(ORIGIN);
    expect(text).toContain(`${ORIGIN}/#/user-space/pushplus-settings`);
  });

  it('站点地址为空时不输出空 href=""（离线/未配置时不产生死链接）', () => {
    const { html, text } = render({ siteOrigin: '' });
    expect(html).not.toContain('href=""');
    expect(html).not.toContain('href="/"');
    expect(text).not.toContain('undefined');
    // 页脚仍然给出「去哪儿关」的文案，只是不带链接
    expect(text).toContain('关闭生日邮件');
  });

  it('站点地址结尾多余斜杠被收敛，不产生 //#/', () => {
    const { html } = render({ siteOrigin: `${ORIGIN}/` });
    expect(html).toContain(`${ORIGIN}/#/user-space/pushplus-settings`);
    expect(html).not.toContain(`${ORIGIN}//#/`);
  });
});

/**
 * 品牌图 + 极简贺卡的兼容底线（2026-11-10 第三版）。
 *
 * 前两版教训：
 *   ① 全静态、无外链图的那版被站长评为「太寡淡」；
 *   ② 加了彩虹彩带 + 纸屑 + 🎂 的节日版被否掉——**「彩虹元素不好看」**。
 * 定稿方向是「品牌图 + 大量留白 + 一句话」。下面这些断言锁三件事：
 *   · 品牌图是全信唯一的图片，且必须是**绝对地址**（相对路径在邮件里就是裂图）；
 *   · 装饰性的彩色不能偷偷加回来（渐变 / 纸屑 / emoji 一律红）；
 *   · 仍然不许出现 <style> 与动画（Gmail App / Outlook 会剥，剥了整版就塌）。
 */
describe('生日邮件：品牌图与极简版式的兼容底线', () => {
  it('品牌图存在、绝对地址、带 alt 与写死的 64px 尺寸（防塌版）', () => {
    const { html } = render();
    const imgs = html.match(/<img\b[^>]*>/g) || [];
    expect(imgs).toHaveLength(1); // 全信只允许这一张图
    const img = imgs[0];
    expect(img).toContain(`src="${ORIGIN}/icons/icon-512-transparent.png"`);
    expect(img).toContain('alt="方块之家 BOH"');
    expect(img).toContain('width="64"');
    expect(img).toContain('height="64"');
    expect(img).toContain('style="display:block');
  });

  it('品牌图用 table + align="center" 居中（Outlook 不认 margin:0 auto）', () => {
    const { html } = render();
    expect(html).toMatch(/<table role="presentation"[^>]*align="center"/);
  });

  it('站点地址缺失时不输出 <img>（不产生相对路径，宁缺不裂）', () => {
    const { html } = render({ siteOrigin: '' });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('/icons/icon-512-transparent.png');
  });

  it('被否掉的彩色装饰不许加回来（渐变 / 纸屑 / 蛋糕 emoji）', () => {
    const { html } = render();
    expect(html).not.toContain('linear-gradient');
    expect(html).not.toContain('border-radius:50%');
    expect(html).not.toContain('🎂');
    // 节日版的暖色徽章底也一并退场
    expect(html).not.toContain('#fff4e6');
  });

  it('排版是纯静态：不含 animation / @keyframes / <style> 块', () => {
    const { html } = render();
    // Gmail App 与 Outlook 会把这三样剥掉；本版式全靠 inline style，
    // 一旦依赖 <style> 就等于放弃「所有客户端长得一样」这个前提。
    expect(html).not.toContain('@keyframes');
    expect(html).not.toContain('animation');
    expect(html).not.toContain('<style');
  });

  it('按钮用墨色而不是品牌蓝：全信唯一的彩色是品牌图', () => {
    const { html } = render();
    expect(html).toContain('background:#1d1d1f'); // MAIL_COLOR.ink 胶囊
    // 主色蓝只允许出现在页脚「关闭生日邮件」那个文字链上
    expect(html).not.toContain('background:#0071e3');
  });

  it('三句祝福语都在，且折行用 <br> 钉死（不交给客户端）', () => {
    const { html, text } = render();
    expect(html).toContain('方块之家给你留了盏灯');
    expect(html).toContain('生日快乐，平安顺遂');
    expect(html).toContain('新的一岁，慢一点也没关系');
    expect(html).toContain('愿你今年少些将就');
    /* 正文两处 + 页脚一处 = 3 个 <br>。
       少了正文那两个，390px 上会自动折成「…平安 / 顺遂」「…都没关 / 系」——
       把「平安」「关系」劈成两半，这是第一版实测踩过的坑。 */
    expect((html.match(/<br>/g) || []).length).toBe(3);
    expect(text).toContain('方块之家给你留了盏灯，生日快乐，平安顺遂。');
  });

  it('天数是一行灰字，且无天数时不画那条多余的发丝线', () => {
    /* 不能用「不含 #86868b」判定：kicker（HAPPY BIRTHDAY）和页脚也是 ink3。
       也不能数 `height:0.5px` —— 同一行里的 `line-height:0.5px` 会一起被数进去。
       真正的结构差异是那条发丝线（hairline 色 #d2d2d7 只服务「天数」这一段）。 */
    const hairlines = (html) => (html.match(/#d2d2d7/g) || []).length;

    const withDays = render({ daysTogether: 365 });
    expect(withDays.html).toContain('365 天');
    expect(hairlines(withDays.html)).toBe(1);

    const without = render({ daysTogether: null });
    expect(without.html).not.toContain('你来方块之家');
    expect(hairlines(without.html)).toBe(0);
  });
});
