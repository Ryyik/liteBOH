-- 头像框：把 cow（奶牛抱抱）被顶掉的素材改回仓库内置的奶牛图
--
-- 起因（2026-09-20 排查）：
--   avatar_frames 里 id='cow' 这一行的 url 指向
--     .../admin-avatar-frames/xlonftfv2icxmq8fbziy.png
--   而该图**就是 id='white-cat'（白绒猫）那一行的成品图**：
--     cow.url      与 white-cat.url      字节完全相同（sha256 10b049d0…）
--     cow.source_url 与 white-cat.source_url 字节完全相同（sha256 0dd81319…）
--   即运营在头像框控制台把白绒猫的原图/成品图发布到了 cow 这个 slug 上（cow 的 scale 1.60
--   还是老值），而前端清单是「DB 优先、内置兜底」（useAvatarFrame.js allAvatarFrames()），
--   DB 行会覆盖同 id 的内置行 —— 于是仓库里正确的 /avatars/frames/cow-frame.png 被顶掉，
--   个人资料 / 装扮网格 / 论坛头像里的「奶牛抱抱」渲染出来是猫。
--
-- 修复：把 cow 的 url 恢复成与内置清单一致的仓库素材（scale 1.60 与内置口径相同，无需改）。
--   source_url 一并清空：那张图属于 white-cat，留着会误导下一次重摆位。
--   白绒猫（white-cat）的 Cloudinary url 是对的（图就是白绒猫），不动。
--
-- 复现/验收：scripts/probes/probe-four-issues.mjs 的 D 组——D1 直接比对 cow/white-cat 两个
--   成品图字节、D2 断言 cow 行 url 已回到 cow-frame.png；前端渲染断言见同探针 D3。

begin;

update public.avatar_frames
   set url = '/avatars/frames/cow-frame.png',
       scale = 1.60,
       source_url = null,
       updated_at = now()
 where id = 'cow';

-- 自检：不应再有任何一行指向那张猫图
do $$
declare
  leaked int;
begin
  select count(*) into leaked
    from public.avatar_frames
   where url like '%xlonftfv2icxmq8fbziy%';
  if leaked > 0 then
    raise exception 'avatar_frames 仍存在指向白绒猫素材的行: % 行', leaked;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
