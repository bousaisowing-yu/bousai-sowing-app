-- 今の Supabase の設定（表・読み書きのルール・関数）を確認するための SQL です。
-- 読み取るだけで、データは何も変えません。会員の名前などの中身も出ません。
-- Supabase の「SQL Editor」に貼り付けて「Run」を押し、出てきた結果をそのまま共有してください。

select json_build_object(
  'tables', (
    select json_agg(json_build_object('table', tablename, 'rls_on', rowsecurity) order by tablename)
    from pg_tables where schemaname = 'public'
  ),
  'columns', (
    select json_agg(json_build_object('table', table_name, 'column', column_name, 'type', data_type) order by table_name, ordinal_position)
    from information_schema.columns where table_schema = 'public'
  ),
  'policies', (
    select json_agg(json_build_object('schema', schemaname, 'table', tablename, 'name', policyname,
      'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by schemaname, tablename)
    from pg_policies where schemaname in ('public', 'storage')
  ),
  'functions', (
    select json_agg(json_build_object('name', p.proname, 'args', pg_get_function_arguments(p.oid),
      'security_definer', p.prosecdef, 'body', left(p.prosrc, 1500)) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'constraints', (
    select json_agg(json_build_object('table', conrelid::regclass::text, 'name', conname,
      'def', pg_get_constraintdef(oid)))
    from pg_constraint where connamespace = 'public'::regnamespace
  )
) as result;
