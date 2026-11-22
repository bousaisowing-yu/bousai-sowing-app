-- 会員ごとに「代わりに登録」できる人（子どもなど）の名前を入れておく
-- Supabase の SQL Editor に貼り付けて「Run」を押すだけで大丈夫です。何度実行しても問題ありません。

alter table public.members
  add column if not exists proxy_names text[] not null default '{}';
