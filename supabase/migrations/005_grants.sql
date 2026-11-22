-- 防災Sowing 会員アプリ：新しく作った表を、アプリから使えるようにする（読み書きの許可）
--
-- 「permission denied for table projects」などと出るときに実行します。
-- だれが何を見られるかは、002 で作ったルール（RLS）がこれまで通り守ります。
-- 何度実行しても大丈夫です。

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.projects        to authenticated;
grant select, insert, update, delete on public.project_stages  to authenticated;
grant select, insert, update, delete on public.project_reports to authenticated;
grant select, insert, update, delete on public.project_leads   to authenticated;

grant select, update, delete on public.members        to authenticated;
grant select                 on public.member_codes   to authenticated;
grant select, delete         on public.member_devices to authenticated;

grant all on public.members, public.member_codes, public.member_devices, public.login_attempts,
             public.projects, public.project_stages, public.project_reports, public.project_leads
  to service_role;
