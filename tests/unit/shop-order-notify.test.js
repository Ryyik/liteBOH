/**
 * 商城订单「通知」链路（2026-11-03）
 *
 * 起因：用户问「用户取消也要通知管理员吧？有新进度会通知用户，这些实现了吗」。
 * 当时的真实状态是：
 *   · 下单邮件收件人读 `ORDER_NOTICE_EMAIL`，线上没配 ⇒ 回落 `MAIL_KEEPALIVE_RECIPIENT`
 *     （站长个人 Gmail），订单通知全进了私人邮箱；
 *   · 取消订单只退积分改状态，**没有任何通知**；
 *   · 礼物有进度通知（2026110202），商城订单一个触发器都没有。
 *
 * 三处修复各锁一条，防止「改回去」：
 *   1. 收件人 = 管理员账号绑定邮箱（动态解析，不写死环境变量）；
 *   2. 取消 → 邮件通知管理员（模板 shop_order_cancelled）；
 *   3. 订单状态变化 → 站内通知下单人（type='order'，前端要认得这个类型）。
 *
 * ⚠️ 断言用 flattenSource 归一（去掉全部空白）—— 这些是「读源码 + toContain」
 *    的守卫，prettier 重排会让逐字断言假红，见 tests/helpers/source.js。
 * ⚠️ 否定断言先 stripComments：注释里会**合法地**提到被禁的旧写法
 *    （email-send 的头部注释就是在解释「为什么不再回落 MAIL_KEEPALIVE_RECIPIENT」）。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, scriptSection, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

const MIGRATION = 'supabase/migrations/2026110322_shop_order_progress_notification.sql';
const EF_PATH = 'supabase/functions/email-send/index.ts';

const migration = existsSync(resolve(root, MIGRATION)) ? read(MIGRATION) : '';
const efBare = stripComments(read(EF_PATH));
const emailService = stripComments(read('src/utils/email-service.js'));
const detailBare = stripComments(scriptSection(read('src/views/Shop/OrderDetailSheet.vue')));
const messagesBare = stripComments(scriptSection(read('src/views/user-center/Messages/index.vue')));
const digest = stripComments(read('src/utils/notification-digest.js'));

/** 截取触发器的函数体，避免把注释/注释里的示例算进断言 */
const functionBody = () => {
  const start = migration.indexOf('create or replace function public.notify_shop_order_progress()');
  expect(start, '必须定义 notify_shop_order_progress()').toBeGreaterThan(-1);
  const end = migration.indexOf('$$;', start);
  expect(end, '函数体必须有结束符').toBeGreaterThan(start);
  return migration.slice(start, end);
};

describe('① 收件人 = 管理员账号绑定邮箱', () => {
  it('按 profiles.role=admin 反查，再从 auth 取邮箱（profiles.email 早已收口）', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource(`.from('profiles').select('id').eq('role', 'admin')`));
    expect(flat).toContain(flattenSource('client.auth.admin.getUserById(id)'));
    expect(flat).toContain(flattenSource("String(data?.user?.email || '')"));
  });

  it('不再回落到保活收件人（那正是私人 Gmail 的来源）', () => {
    expect(efBare).not.toContain('MAIL_KEEPALIVE_RECIPIENT');
  });

  it('没有收件人时明确失败，而不是静默发到别处', () => {
    expect(flattenSource(efBare)).toContain(
      flattenSource("return { ok: false, detail: '未解析到管理员收件邮箱' }"),
    );
  });
});

describe('② 取消订单 → 通知管理员', () => {
  it('EF 接受 shop_order_cancelled 模板', () => {
    expect(flattenSource(efBare)).toContain(
      flattenSource(
        `const allowedTemplates = ['gift', 'merchandise_settlement', 'shop_order_cancelled']`,
      ),
    );
  });

  it('只对「确实已取消」的订单发，防止模板变成任意订单群发口子', () => {
    expect(flattenSource(efBare)).toContain(
      flattenSource(
        `if (kind === 'shop_order_cancelled' && String(order.status || '') !== 'cancelled')`,
      ),
    );
  });

  it('邮件正文带上退款信息，管理员不用回后台算', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource('已退回'));
    expect(flat).toContain(flattenSource('取消时间'));
  });

  it('前端服务提供对应入口，且只传订单 ID', () => {
    expect(flattenSource(emailService)).toContain(
      flattenSource(`callSendEmailFunction('shop_order_cancelled', { orderId })`),
    );
    expect(emailService).toContain('export const sendShopOrderCancelledEmail');
  });

  it('详情弹层在取消成功后触发，且幂等重放不重复发', () => {
    const flat = flattenSource(detailBare);
    expect(flat).toContain(
      flattenSource('sendShopOrderCancelledEmail({ orderId: props.order.id })'),
    );
    expect(flat).toContain(flattenSource('!result.alreadyCancelled'));
    // 礼物取消不走这封（它是另一种记录，标题会串）
    expect(flat).toContain(flattenSource("kind.value !== 'gift'"));
  });
});

describe('③ 订单进度 → 通知下单人', () => {
  it('迁移文件存在，触发器挂在 status 上', () => {
    expect(migration, `${MIGRATION} 必须存在`).not.toBe('');
    expect(flattenSource(migration)).toContain(
      flattenSource(
        `create trigger trg_notify_shop_order_progress after update of status on public.shop_points_orders for each row execute function public.notify_shop_order_progress()`,
      ),
    );
  });

  it('控制消息本只对外暴露触发器执行权限', () => {
    const flat = flattenSource(migration);
    expect(flat).toContain(
      flattenSource(
        'revoke all on function public.notify_shop_order_progress() from authenticated',
      ),
    );
    expect(flat).toContain(
      flattenSource('revoke all on function public.notify_shop_order_progress() from anon'),
    );
  });

  it('写 notifications 时用独立类型 order（不是借道 gift）', () => {
    const fn = flattenSource(functionBody());
    expect(fn).toContain(
      flattenSource(
        `insert into public.notifications (recipient_id, sender_id, type, status, content)`,
      ),
    );
    expect(fn).toContain(flattenSource(`'order', 'unread',`));
    expect(fn).not.toContain(flattenSource(`'gift'`));
  });

  it('状态没变不发（后台重复保存不刷屏）', () => {
    expect(flattenSource(functionBody())).toContain(
      flattenSource('if new.status is not distinct from old.status then return new; end if;'),
    );
  });

  it('本人自助取消不再给自己推一条（管理员取消仍会通知）', () => {
    const fn = flattenSource(functionBody());
    expect(fn).toContain(
      flattenSource(
        `if new.status = 'cancelled' and v_actor is not null and v_actor = new.user_id then return new; end if;`,
      ),
    );
  });

  it('通知失败不回滚订单（异常兜住）', () => {
    expect(flattenSource(functionBody())).toContain(
      flattenSource('exception when others then null;'),
    );
  });

  it('前端认得 order 类型：系统分组 + 四张文案表', () => {
    const flat = flattenSource(messagesBare);
    expect(flat).toContain(flattenSource("const ORDER_NOTIFICATION_TYPE = 'order'"));
    expect(flat).toContain(flattenSource(`'system', 'gift', ORDER_NOTIFICATION_TYPE`));
    expect(flat).toContain(flattenSource('订单进度更新'));
    expect(flat).toContain(flattenSource('前往购物袋查看'));
    // 两个类型表各补一条（getTypeLabel / getNotificationTypeLabel）
    expect(flat.match(/\[ORDER_NOTIFICATION_TYPE\]:'订单通知'/g)?.length).toBe(2);
  });

  it('未读聚合文案把 order 归入系统组（否则落到「消息」兜底）', () => {
    expect(flattenSource(digest)).toContain(flattenSource(`'system', 'gift', 'order',`));
  });
});

describe('④ 管理员邮件版式（与用户侧同一套 Apple 极简主题）', () => {
  /** ⚠️ 这一组全部对 efBare（已去注释）断言：注释里**合法地**提到了旧写法 `<pre>`，
   *  以及源码里 `'https://...'` 会被 stripComments 当成行注释从 `//` 截断
   *  （见 tests/helpers/source.js 的边界说明）。所以只断言不含 `//` 的片段。 */

  it('用共享主题渲染，不再自成一套壳', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource(`from'../_shared/mail-theme.ts'`));
    expect(flat).toContain(flattenSource('mailDocument({'));
    expect(flat).toContain(flattenSource('mailCard('));
  });

  it('带后台深链（原来一个链接都没有，管理员得回后台按单号翻）', () => {
    expect(flattenSource(efBare)).toContain(
      flattenSource('/#/admin/data-management/shopOrders/${orderId}'),
    );
  });

  it('深链只对合法订单 ID 拼 —— 脏值不许进 URL', () => {
    expect(flattenSource(efBare)).toContain(
      flattenSource('const adminLink = ORDER_ID_PATTERN.test(orderId) ?'),
    );
    expect(flattenSource(efBare)).toContain(flattenSource(`: '';`));
  });

  it('不再用等宽 <pre> 明细块（中文等宽字体是回落的，看着并不等宽）', () => {
    expect(efBare).not.toContain('<pre');
    expect(efBare).not.toContain('white-space:pre-wrap');
  });

  it('联系方式拆成两列，多行值显式换行（<td> 不认 \\n）', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource(`.split('\\n')`));
    expect(flat).toContain(flattenSource(`replace(/\\n/g, '<br>')`));
  });

  it('订单编号进 preheader 之外的正文可见位置（标题下第一块就是商品与金额）', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource(`['商品', safeParams.product || '—']`));
    expect(flat).toContain(flattenSource(`['支付',`));
    expect(flat).toContain(flattenSource(`['配送', safeParams.deliveryMethod || '—']`));
  });

  it('取消三行与商品金额同一块 —— 不埋在「联系方式」尾部', () => {
    const flat = flattenSource(efBare);
    expect(flat).toContain(flattenSource('renderRows([...orderRows, ...cancelRows])'));
    expect(flat).toContain(
      flattenSource(`const CANCEL_LABELS = ['当前状态', '取消时间', '已退回']`),
    );
    expect(flat).toContain(flattenSource('const contactOnly = contactRows.filter'));
  });
});
