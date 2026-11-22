-- 防災Sowing 会員アプリ：イベント・お知らせ・参加者を「会員だけ」が見られるようにする
--
-- ※ 002_members_and_projects.sql を実行し、アプリを公開（Merge）して、
--    会員の登録とコード配りが済んでから実行してください。
--    実行すると、会員コードでログインしていない人には何も表示されなくなります。
-- 何度実行しても大丈夫です。

-- ── イベント ──
drop policy if exists "Public can view events" on public.events;
drop policy if exists "Members can view events" on public.events;
drop policy if exists "events_select_members" on public.events;
create policy "events_select_members" on public.events for select to authenticated
  using (public.is_member());
-- （登録・編集・削除は今まで通り「Admins can manage events」で管理者だけ）

-- ── お知らせ ──
drop policy if exists "Public can view announcements" on public.announcements;
drop policy if exists "Members can view announcements" on public.announcements;
drop policy if exists "announcements_select_members" on public.announcements;
create policy "announcements_select_members" on public.announcements for select to authenticated
  using (public.is_member());

-- ── 参加者（名前） ──
drop policy if exists "Public can register responses" on public.event_responses;
drop policy if exists "Public can view responses" on public.event_responses;
drop policy if exists "Public can cancel responses" on public.event_responses;
drop policy if exists "Public can update responses" on public.event_responses;
drop policy if exists "Members can view responses" on public.event_responses;
drop policy if exists "Members can register" on public.event_responses;
drop policy if exists "Authenticated users can cancel responses" on public.event_responses;
drop policy if exists "Authenticated users can update responses" on public.event_responses;
drop policy if exists "responses_select_members" on public.event_responses;
drop policy if exists "responses_insert_members" on public.event_responses;
drop policy if exists "responses_update_members" on public.event_responses;
drop policy if exists "responses_delete_members" on public.event_responses;
create policy "responses_select_members" on public.event_responses for select to authenticated
  using (public.is_member());
create policy "responses_insert_members" on public.event_responses for insert to authenticated
  with check (public.is_member());
create policy "responses_update_members" on public.event_responses for update to authenticated
  using (public.is_member()) with check (public.is_member());
create policy "responses_delete_members" on public.event_responses for delete to authenticated
  using (public.is_member());

-- ── サイト設定（トップ画像など）：変更は管理者だけ ──
drop policy if exists "Authenticated users can insert site settings" on public.site_settings;
drop policy if exists "Authenticated users can update site settings" on public.site_settings;

-- ── 画像のアップロード：会員（と管理者）だけ ──
drop policy if exists "Authenticated users can upload site images" on storage.objects;
drop policy if exists "Members can upload site images" on storage.objects;
create policy "Members can upload site images" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_member());
