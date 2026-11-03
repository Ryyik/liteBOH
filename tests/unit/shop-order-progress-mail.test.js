/**
 * 订单进度邮件（2026-11-03）
 *
 * 用户口径：「下单确认不需要发邮件，而是订单有新进度的时候发邮件给用户」。
 *
 * 这里锁四件事，每一件错了都会静默失效（邮件没发出、发重了、或被错误开关挡掉）：
 *   1. 账本扩容：mail_outbox 允许 kind='shop_order' 且带 order_id；
 *   2. 入账口径：同一单同一状态只入账一次（dedupe_key），本人自助取消不入账；
 *   3. 投递分流：订单分支必须在 follow_mail_enabled 判定**之前** ——
 *      否则用户关了「关注邮件」就连「已发货」一起收不到；
 *   4. 至少有一条重投兜底路径（立刻投递失败时靠 5 分钟 cron）。
 *
 * ⚠️ 断言用 flattenSource 归一（去全部空白）：这些是「读源码 + toContain」的守卫，
 *    prettier 重排会让逐字断言假红，见 tests/helpers/source.js。
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flattenSource, stripComments } from '../helpers/source.js';

const root = resolve(import.meta.dirname, '../..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

const MIGRATION = 'supabase/migrations/2026110323_shop_order_progress_mail.sql';
const EF_PATH = 'supabase/functions/follow-mail-send/index.ts';

const migration = existsSync(resolve(root, MIGRATION)) ? read(MIGRATION) : '';
const efRaw = read(EF_PATH);
/* ⚠️ 这里必须同时留两份：`stripComments` 不认正则字面量，
   源码里的 `/^https?:\/\//i` 会被它当成行注释从 `//` 处截断。
   所以**正向**断言一律用 efRaw，只有**否定**断言（「不该出现 X」）才用 stripComments
   —— 那正是 tests/helpers/source.js 文件头说的用法边界。 */
const ef = stripComments(efRaw);

/** 截取一段源码（到下一个锚点为止），避免跨函数误判 */
const slice = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  expect(start, `${startMarker} 必须存在`).toBeGreaterThan(-1);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? source.length : end);
};

describe('① 账本扩容：mail_outbox 支持订单类', () => {
  it('迁移文件存在', () => {
    expect(migration, `${MIGRATION} 必须存在`).not.toBe('');
  });

  it('kind 白名单加 shop_order（否则 insert 直接违反 check 约束）', () => {
    expect(flattenSource(migration)).toContain(
      flattenSource(`check (kind in ('follow_post', 'follow_reply', 'shop_order'))`),
    );
  });

  it('新增 order_id 列，订单被删时连带清掉待发邮件', () => {
    expect(flattenSource(migration)).toContain(
      flattenSource('alter table public.mail_outbox add column if not exists order_id uuid'),
    );
    expect(flattenSource(migration)).toContain(
      flattenSource(
        'foreign key (order_id) references public.shop_points_orders (id) on delete cascade',
      ),
    );
  });
});

describe('② 入账口径', () => {
  const triggerFn = () =>
    slice(migration, 'create or replace function public.notify_shop_order_progress');

  it('写账本时带上 kind / order_id / dedupe_key / due_at', () => {
    expect(flattenSource(triggerFn())).toContain(
      flattenSource(
        `insert into public.mail_outbox ( recipient_id, sender_id, kind, order_id, dedupe_key, due_at ) values ( new.user_id, null, 'shop_order', new.id, v_dedupe, now() )`,
      ),
    );
  });

  it('同一单同一状态只入账一次（状态来回切不重复发）', () => {
    const fn = flattenSource(triggerFn());
    expect(fn).toContain(flattenSource(`'shop_order:' || new.id::text || ':' || new.status`));
    expect(fn).toContain(flattenSource('on conflict (dedupe_key) do nothing'));
  });

  it('本人自助取消不入账（站内信与邮件同口径）', () => {
    expect(flattenSource(triggerFn())).toContain(
      flattenSource(
        `if new.status = 'cancelled' and v_actor is not null and v_actor = new.user_id`,
      ),
    );
  });

  it('入账失败不阻断订单状态落库', () => {
    // 账本 insert 在自己的 begin/exception 里，异常只置空 outbox id
    expect(flattenSource(triggerFn())).toContain(flattenSource('v_outbox_id := null;'));
  });

  it('尽力立刻投递：调的是本投递端的 send 动作', () => {
    const fn = flattenSource(triggerFn());
    expect(fn).toContain(
      flattenSource(`jsonb_build_object('action', 'send', 'outboxId', v_outbox_id)`),
    );
    expect(fn).toContain(flattenSource(`/functions/v1/follow-mail-send`));
  });
});

describe('③ 投递分流（最要紧的一条）', () => {
  it('订单分支出现在 follow_mail_enabled 判定之前', () => {
    const sendOne = flattenSource(slice(ef, 'const sendOne = async (outboxId: string) =>'));
    const branchAt = sendOne.indexOf(flattenSource(`if (row.kind === 'shop_order')`));
    const prefAt = sendOne.indexOf(flattenSource('follow_mail_enabled'));
    expect(branchAt, '订单分支必须存在').toBeGreaterThan(-1);
    expect(prefAt, '关注开关判定必须存在').toBeGreaterThan(-1);
    expect(branchAt, '订单分支必须早于关注开关判定').toBeLessThan(prefAt);
  });

  it('订单分支内部不读关注邮件开关（事务性邮件不该被订阅开关关掉）', () => {
    const orderFn = slice(ef, 'const sendShopOrderMail = async', 'const sendOne = async');
    expect(orderFn).not.toContain('follow_mail_enabled');
  });

  it('订单分支不读 moderation_mail_enabled，也不复用关注正文加载', () => {
    const orderFn = slice(ef, 'const sendShopOrderMail = async', 'const sendOne = async');
    expect(orderFn).not.toContain('moderation_mail_enabled');
    expect(orderFn).not.toContain('loadMailEntry');
  });

  it('回写账本状态与关注分支同构（sent / pending / failed + attempts）', () => {
    const flat = flattenSource(
      slice(ef, 'const sendShopOrderMail = async', 'const sendOne = async'),
    );
    expect(flat).toContain(flattenSource(`status: 'sent', attempts, sent_at:`));
    expect(flat).toContain(flattenSource(`status: exhausted ? 'failed' : 'pending', attempts`));
  });
});

describe('④ 邮件内容', () => {
  const payloadFn = () =>
    slice(efRaw, 'const buildShopOrderPayload =', 'const sendShopOrderMail =');
  /* 状态文案表在 payload 函数之前，单独切一段 */
  const statusMeta = () => slice(efRaw, 'const ORDER_STATUS_META', 'const ORDER_STEPS');

  it('四种状态都有文案，未知值兜底准备中', () => {
    const flat = flattenSource(statusMeta());
    for (const key of ['preparing', 'shipped', 'completed', 'cancelled']) {
      expect(flat).toContain(flattenSource(`${key}: {`));
    }
    expect(flattenSource(efRaw)).toContain(
      flattenSource(`return key in ORDER_STATUS_META ? key : 'preparing'`),
    );
  });

  it('CTA 指向购物袋的订单分区', () => {
    expect(flattenSource(payloadFn())).toContain(flattenSource('/#/shop?tab=order'));
  });

  it('事务性邮件声明不可退订，不给「去关闭」误导链接', () => {
    const flat = flattenSource(payloadFn());
    expect(flat).toContain(flattenSource('无法单独退订'));
    expect(flat).not.toContain(flattenSource('pushplus-settings'));
  });

  it('只渲染绝对地址的图（相对路径在邮件里必然裂图）', () => {
    expect(flattenSource(efRaw)).toContain(flattenSource('/^https?:\\/\\//i.test(image)'));
  });

  it('订单号与商品文案全部转义', () => {
    const flat = flattenSource(payloadFn());
    expect(flat).toContain(flattenSource('escapeHtml(meta.headline)'));
    expect(flat).toContain(flattenSource('escapeHtml(orderNo)'));
  });

  /* 2026-11-03 用户明确要求：「订单发货什么进度不要有进度条」。
     状态由标题文案承担，不画流程图 —— 抓到就删，别加回来。 */
  it('不画进度条：没有时间轴函数，也没有三格等分的节点表', () => {
    expect(flattenSource(ef)).not.toContain('buildOrderTimeline');
    expect(flattenSource(ef)).not.toContain('ORDER_STEPS');
    expect(flattenSource(payloadFn())).not.toContain(flattenSource('width:33.33%'));
  });

  it('状态只靠标题表达：meta 里不再配徽章色与节点标签', () => {
    const flat = flattenSource(statusMeta());
    expect(flat).not.toContain('tone:');
    expect(flat).not.toContain('bg:');
    expect(flat).not.toContain('label:');
  });
});
