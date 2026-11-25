-- 事業ごとのカードの色を保存できるようにする
-- Supabase の SQL Editor に貼り付けて「Run」を押すだけで大丈夫です。何度実行しても問題ありません。
-- （実行する前でも、カードは事業ごとに自動で色が付きます。色を「変えて保存」するときに必要です）

alter table public.projects
  add column if not exists color text;
