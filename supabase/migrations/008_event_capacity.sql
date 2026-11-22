-- イベントに「募集人数」を入れられるようにする
-- Supabase の SQL Editor に貼り付けて「Run」を押すだけで大丈夫です。何度実行しても問題ありません。

alter table public.events
  add column if not exists capacity integer;
