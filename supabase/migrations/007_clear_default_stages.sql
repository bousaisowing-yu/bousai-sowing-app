-- 正会員ページ：最初に自動で入っていた「企画・準備・実施・ふり返り」を消す
-- （「いまの動き」を文で書く形に変えたため。ほかに書いた動きは消えません）
-- Supabase の SQL Editor に貼り付けて「Run」を押すだけで大丈夫です。何度実行しても問題ありません。

delete from public.project_stages
where title in ('企画', '準備', '実施', 'ふり返り');
