import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { squeezeSource } from '../helpers/source.js';

/**
 * 图片异步复审 + 帖子「已编辑」标记的契约守卫（2026-10-29）
 *
 * 这套改动的风险不在「写了没」，而在**三个不变量被悄悄改回去**：
 *
 *   ① 放行条件必须严格：只有「模型没就绪」才放行。
 *      image-moderation-pipeline 的本机行为由 image-moderation-pipeline.test.js 用
 *      行为断言锁住（含坏图必须仍抛错的反证）；这里只锁源码层面不能把判定简化成
 *      「只看 error.code」—— 那会把图片本身解析失败也一起放行。
 *
 *   ② 复审未配置时**绝不能默认 approved**。
 *      没有视觉模型却在 text 模型上跑图片，会得到「看不懂图但硬答通过」的结果，
 *      比不审更危险（用户以为审过了）。所以源码里必须有「缺配置就跳过」的分支。
 *
 *   ③ 拒绝必须同时「软删图 + 通知」，且只能在真正应用成功后才计数。
 *      只写 recheck_status 不改 moderation_status ⇒ 违规图仍然公开可见，等于没撤。
 *
 * 反证方式（改一处必红）：
 *   · 把 imageApiUrl 的配置缺失分支删掉 → 「缺配置跳过」那条红；
 *   · 把 apply_forum_image_recheck_verdict 里的 moderation_status 分支删掉 → 迁移守卫红；
 *   · 把 updatePost 的 edited_at 删掉 → edited_at 守卫红。
 */

const read = (relativePath) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const MIGRATION = 'supabase/migrations/2026102908_forum_image_async_recheck.sql';

describe('图片异步复审：数据库迁移契约', () => {
  const sql = squeezeSource(read(MIGRATION));

  it('复审状态与帖子编辑时间都新增为独立列（不复用 moderation_status / updated_at）', () => {
    // 为什么必须独立：moderation_status='pending' 会让图片立刻不可见（列表只查 approved），
    // 与「放行后立即可见」相反；updated_at 会被状态流转污染，做编辑标记会到处冒「已编辑」。
    expect(sql).toContain(squeezeSource('add column if not exists recheck_status text null'));
    expect(sql).toContain(squeezeSource('add column if not exists edited_at timestamptz null'));
  });

  it('recheck_status 有取值约束，且三个取值都在', () => {
    expect(sql).toContain('forum_post_images_recheck_status_check');
    for (const value of ['pending', 'approved', 'rejected']) {
      expect(sql).toContain(`'${value}'::text`);
    }
  });

  it('任务类型放宽为超集（保留旧的 post_moderation，新增 image_recheck）', () => {
    // 只放宽不收紧：删掉 post_moderation 会让既有的文本审核任务全部违反约束。
    expect(sql).toContain("'post_moderation'::text");
    expect(sql).toContain("'image_recheck'::text");
  });

  it('复审裁决函数必须在拒绝时同时软删图片', () => {
    // 这条是「事后撤」的落地点：只写 recheck_status 不改 moderation_status，
    // 违规图仍会被列表返回 ⇒ 撤了个寂寞。
    const fn = sql.slice(sql.indexOf('apply_forum_image_recheck_verdict'));
    expect(fn).toContain(
      squeezeSource(
        "moderation_status = case when v_verdict = 'rejected' then 'rejected' else moderation_status end",
      ),
    );
    // 且只处理仍在 pending 的行（幂等：重复裁决不该把已 approved 的图改回 rejected）
    expect(fn).toContain(squeezeSource("and recheck_status = 'pending'"));
  });

  it('三个函数都只给到最小权限面：用户函数 authenticated、裁决函数 service_role', () => {
    expect(sql).toContain(
      squeezeSource(
        'grant execute on function public.mark_forum_images_pending_recheck(uuid, text[]) to authenticated',
      ),
    );
    expect(sql).toContain(
      squeezeSource(
        'grant execute on function public.enqueue_forum_image_recheck(uuid, integer) to authenticated',
      ),
    );
    expect(sql).toContain(
      squeezeSource(
        'grant execute on function public.apply_forum_image_recheck_verdict(uuid, text, numeric, text) to service_role',
      ),
    );
    // 裁决函数绝不能给 authenticated：否则作者可以自己把 rejected 洗成 approved
    expect(sql).toContain(
      squeezeSource(
        'revoke all on function public.apply_forum_image_recheck_verdict(uuid, text, numeric, text) from public, anon, authenticated',
      ),
    );
  });

  it('邮件开关是新列，且补了列级 UPDATE 授权（profiles 已收窄敏感列）', () => {
    expect(sql).toContain(
      squeezeSource(
        'add column if not exists moderation_mail_enabled boolean not null default false',
      ),
    );
    expect(sql).toContain(
      squeezeSource(
        'grant update (moderation_mail_enabled) on table public.profiles to authenticated',
      ),
    );
  });
});

describe('图片异步复审：worker 契约', () => {
  const worker = squeezeSource(read('supabase/functions/forum-async-worker/index.ts'));

  it('按 job_type 分派，且 image_recheck 有独立处理函数', () => {
    expect(worker).toContain(squeezeSource("job.job_type === 'image_recheck'"));
    expect(worker).toContain('processImageRecheck');
  });

  it('图片模型未配置时必须跳过，绝不借用文本模型去审图', () => {
    // 反面：把 `if (!imageApiUrl || !imageApiKey || !imageModelId)` 去掉，
    // 就会用文本模型请求图片 → 返回「看不懂但说通过」的假绿。
    expect(worker).toContain(squeezeSource('if (!imageApiUrl || !imageApiKey || !imageModelId) {'));
    expect(worker).toContain("'image_moderation_not_configured'");
  });

  it('解析不出裁决时抛错重试，不默认 approved', () => {
    expect(worker).toContain(
      squeezeSource("if (!verdict) throw new Error('图片复审结果无法解析');"),
    );
  });

  it('兼容上游只回 {"nsfw":false} 的形态（否则复审永远解析失败）', () => {
    expect(worker).toContain(squeezeSource("if (typeof parsed.nsfw === 'boolean')"));
  });

  it('只有真正应用成功且判 rejected 才计入拒绝数', () => {
    // 反面：直接 `if (verdict.status === 'rejected') rejected += 1` —— 若 RPC 因为是
    // 幂等空转（图已被处理）返回 false，就会给用户发一封「图被撤了」但其实没撤的邮件。
    expect(worker).toContain(
      squeezeSource("if (applied === true && verdict.status === 'rejected') rejected += 1;"),
    );
  });

  it('站内通知按「帖子 + 类型」去重，多张图被拒不刷屏', () => {
    expect(worker).toContain("eq('type', 'post_image_rejected')");
  });

  it('cron 通道单次最多处理 3 个（5 分钟一轮 × 1 个会突破 6 分钟承诺）', () => {
    expect(worker).toContain(squeezeSource('for (let i = 0; i < 3; i += 1)'));
  });
});

describe('图片异步复审：客户端放行接线', () => {
  it('本地兜底只在「模型没就绪」时放行（判定必须看文案，不能只看 code）', () => {
    const pipeline = squeezeSource(read('src/utils/image-moderation-pipeline.js'));
    expect(pipeline).toContain('isLocalModelUnavailableError');
    // 关键：同一个 code 也覆盖「图片尺寸无效」等真错误，必须靠文案收紧
    expect(pipeline).toContain(
      squeezeSource('检测模型|模型初始化|初始化超时|初始化失败|模块初始化'),
    );
    expect(pipeline).toContain(squeezeSource("status: 'pending_review'"));
  });

  it('上传图层接受 pending_review，但仍以 approved 落库（保证立即可见）', () => {
    const api = squeezeSource(read('src/utils/api/forum-images-api.js'));
    expect(api).toContain(squeezeSource('moderation.status === PENDING_REVIEW_STATUS'));
    expect(api).toContain(squeezeSource('moderationStatus: APPROVED_STATUS'));
    expect(api).toContain('needsRecheck');
  });

  it('发帖成功后标记待复审并入队（best-effort，失败不阻断发布）', () => {
    const forum = squeezeSource(read('src/views/Forum/ForumMain.vue'));
    expect(forum).toContain('markForumImagesPendingRecheck');
    expect(forum).toContain('enqueueForumImageRecheck');
  });

  it('编辑帖子时新增的图同样入队复审', () => {
    const detail = squeezeSource(read('src/views/PostDetail/PostDetailMain.vue'));
    expect(detail).toContain('markForumImagesPendingRecheck');
    expect(detail).toContain('enqueueForumImageRecheck');
  });
});

describe('帖子「已编辑」标记契约', () => {
  it('updatePost 写 edited_at（与 updated_at 分开）', () => {
    const api = squeezeSource(read('src/utils/api/forum/post-api.js'));
    expect(api).toContain(squeezeSource('edited_at: now'));
    expect(api).toContain(squeezeSource('updated_at: now'));
  });

  it('迁移未应用时编辑帖子仍能保存（edited_at 缺失要降级重试，不能整体失败）', () => {
    // 顺序风险：前端 CI 自动部署、迁移人工 apply。若前端先上线，updatePost 带一个
    // 不存在的列会被 PostgREST 直接 400 ⇒ 用户「编辑帖子」整个挂掉。
    const api = squeezeSource(read('src/utils/api/forum/post-api.js'));
    expect(api).toContain(squeezeSource("isMissingColumnError(updateError, 'edited_at')"));
    // 降级后必须真的重试一次，而不是只打日志
    expect(api).toContain(squeezeSource('update(fallbackData)'));
  });

  it('详情页三处时间位都挂了编辑标记', () => {
    const detail = read('src/views/PostDetail/PostDetailMain.vue');
    const editedTags = detail.match(/v-if="post\.edited_at"/g) || [];
    // 作者条 1 处 + 内容区两种布局各 1 处 = 3
    expect(editedTags.length).toBe(3);
  });

  it('通知中心认得新类型（否则会掉进「新消息」兜底文案）', () => {
    const messages = squeezeSource(read('src/views/user-center/Messages/index.vue'));
    expect(messages).toContain('POST_IMAGE_REJECTED_NOTIFICATION_TYPE');
    expect(messages).toContain('POST_IMAGE_REJECTED_NOTICE_TEXT');
  });
});
