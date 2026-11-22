-- 防災Sowing 会員アプリ：11月はじめに作った古い通知の仕組みを止める
--
-- 通知はアプリから Edge Function「send-push」で送る形に一本化したので、
-- データベース側で自動で通知を送っていた古い仕組み（トリガー）を外します。
-- これをしないと、同じ通知が二重に届くことがあります。
-- イベントやお知らせのデータそのものは何も変わりません。何度実行しても大丈夫です。

drop trigger if exists trg_notify_event_insert on public.events;
drop trigger if exists trg_notify_event_update on public.events;
drop trigger if exists trg_notify_event_changes on public.events;
drop trigger if exists trg_notify_announcement_insert on public.announcements;
drop trigger if exists trg_notify_response_insert on public.event_responses;
drop trigger if exists trg_notify_response_delete on public.event_responses;

drop function if exists public.send_onesignal_notification();
drop function if exists public.notify_onesignal_from_db();
