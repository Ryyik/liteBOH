begin;

-- Tighten comment visibility for frontend async moderation mode.
-- Public/post-author reads should still follow post visibility, but rejected
-- comments must not become visible to the post author through direct reads.
drop policy if exists comments_select_visible on public.comments;
create policy comments_select_visible
  on public.comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.posts p
       where p.id = comments.post_id
         and (
           public.current_user_is_admin()
           or auth.uid() = comments.author_id
           or (
             coalesce(comments.status, 'approved') = 'approved'
             and (
               coalesce(p.status, 'approved') = 'approved'
               or auth.uid() = p.author_id
             )
           )
         )
    )
  );

commit;
