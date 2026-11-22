-- 防災Sowing 会員アプリ：会員が入室済みか・通知を許可しているかを管理画面で見られるようにする
-- 何度実行しても大丈夫です。

alter table public.member_devices add column if not exists push_enabled boolean;
alter table public.member_devices add column if not exists last_seen_at timestamptz;

-- アプリを開いたときに、自分の端末の「最後に開いた日時」と「通知の許可」を記録する
create or replace function public.report_my_device(p_push_enabled boolean)
returns void
language sql security definer set search_path = public as $$
  update public.member_devices
     set push_enabled = p_push_enabled,
         last_seen_at = now()
   where user_id = auth.uid();
$$;

revoke all on function public.report_my_device(boolean) from public, anon;
grant execute on function public.report_my_device(boolean) to authenticated;
grant select, delete on public.member_devices to authenticated;
