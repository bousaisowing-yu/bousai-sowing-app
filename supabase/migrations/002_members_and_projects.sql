-- 防災Sowing 会員アプリ：会員ログイン（合言葉＋名前）と正会員ページ「事業の進み具合」
--
-- Supabase の「SQL Editor」に全部貼り付けて「Run」を1回押してください。
-- 新しい表と仕組みを足すだけで、今あるイベント・お知らせのデータは変えません。
-- 何度実行しても大丈夫なように書いてあります。

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────
-- 1. 会員
-- ─────────────────────────────

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  member_type text not null default '一般' check (member_type in ('一般', '正会員')),
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

-- 合言葉（暗号化して1つだけ保存。アプリからは直接読めない）
create table if not exists public.member_settings (
  id int primary key default 1 check (id = 1),
  passcode_hash text,
  updated_at timestamptz not null default now()
);
alter table public.member_settings enable row level security;

-- 合言葉の入力記録（何度も試されるのを防ぐため）
create table if not exists public.passcode_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  ok boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.passcode_attempts enable row level security;

-- だれが何者かを調べる関数
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.is_full_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.members
                 where user_id = auth.uid() and member_type = '正会員');
$$;

-- 合言葉と名前で会員になる
create or replace function public.join_with_passcode(p_passcode text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_name text := btrim(coalesce(p_name, ''));
  v_row public.members;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ログインの準備ができていません。アプリを開き直してください。');
  end if;

  if (select count(*) from public.passcode_attempts
      where user_id = v_uid and not ok and attempted_at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.passcode_attempts
      where not ok and attempted_at > now() - interval '15 minutes') >= 100 then
    return jsonb_build_object('ok', false, 'message', '合言葉の入力に何度も失敗しました。15分ほど待ってからもう一度お試しください。');
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'message', 'お名前を入力してください（40文字まで）。');
  end if;

  select passcode_hash into v_hash from public.member_settings where id = 1;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'message', '合言葉がまだ設定されていません。管理者にお問い合わせください。');
  end if;

  if crypt(btrim(coalesce(p_passcode, '')), v_hash) <> v_hash then
    insert into public.passcode_attempts (user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'message', '合言葉が違います。');
  end if;

  insert into public.passcode_attempts (user_id, ok) values (v_uid, true);

  insert into public.members (user_id, display_name)
  values (v_uid, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name
  returning * into v_row;

  return jsonb_build_object('ok', true, 'member', to_jsonb(v_row));
end;
$$;

-- 合言葉を変える（管理者だけ）
create or replace function public.set_member_passcode(p_passcode text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception '管理者だけが合言葉を変更できます';
  end if;
  if char_length(btrim(coalesce(p_passcode, ''))) < 4 then
    raise exception '合言葉は4文字以上にしてください';
  end if;
  insert into public.member_settings (id, passcode_hash, updated_at)
  values (1, crypt(btrim(p_passcode), gen_salt('bf')), now())
  on conflict (id) do update
    set passcode_hash = excluded.passcode_hash, updated_at = now();
end;
$$;

revoke all on function public.join_with_passcode(text, text) from public, anon;
revoke all on function public.set_member_passcode(text) from public, anon;
grant execute on function public.join_with_passcode(text, text) to authenticated;
grant execute on function public.set_member_passcode(text) to authenticated;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_member() to authenticated, anon;
grant execute on function public.is_full_member() to authenticated, anon;

drop policy if exists "members_select" on public.members;
create policy "members_select" on public.members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "members_update_admin" on public.members;
create policy "members_update_admin" on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members_delete_admin" on public.members;
create policy "members_delete_admin" on public.members for delete to authenticated
  using (public.is_admin());

-- ─────────────────────────────
-- 2. 事業の進み具合（正会員だけが見られる）
-- ─────────────────────────────

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  summary text,
  lead_names text[] not null default '{}',     -- 表示する担当者名（何人でも）
  status text not null default '準備中'
    check (status in ('準備中', '進行中', 'ひと休み中', '完了')),
  next_date date,
  next_plan text,
  help_wanted text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- アプリ上でその事業を更新できる担当者（会員と結びつける）
create table if not exists public.project_leads (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.members(user_id) on delete cascade,
  primary key (project_id, user_id)
);

create table if not exists public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order int not null default 0
);

create table if not exists public.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  image_url text,
  author_name text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.project_leads enable row level security;
alter table public.project_stages enable row level security;
alter table public.project_reports enable row level security;

create or replace function public.is_project_lead(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_leads
                 where project_id = p_project_id and user_id = auth.uid());
$$;
grant execute on function public.is_project_lead(uuid) to authenticated;

-- projects
drop policy if exists "projects_select" on public.projects;
create policy "projects_select" on public.projects for select to authenticated
  using (public.is_full_member());
drop policy if exists "projects_insert" on public.projects;
create policy "projects_insert" on public.projects for insert to authenticated
  with check (public.is_admin());
drop policy if exists "projects_update" on public.projects;
create policy "projects_update" on public.projects for update to authenticated
  using (public.is_admin() or public.is_project_lead(id))
  with check (public.is_admin() or public.is_project_lead(id));
drop policy if exists "projects_delete" on public.projects;
create policy "projects_delete" on public.projects for delete to authenticated
  using (public.is_admin());

-- project_leads
drop policy if exists "project_leads_select" on public.project_leads;
create policy "project_leads_select" on public.project_leads for select to authenticated
  using (public.is_full_member());
drop policy if exists "project_leads_write" on public.project_leads;
create policy "project_leads_write" on public.project_leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- project_stages
drop policy if exists "project_stages_select" on public.project_stages;
create policy "project_stages_select" on public.project_stages for select to authenticated
  using (public.is_full_member());
drop policy if exists "project_stages_write" on public.project_stages;
create policy "project_stages_write" on public.project_stages for all to authenticated
  using (public.is_admin() or public.is_project_lead(project_id))
  with check (public.is_admin() or public.is_project_lead(project_id));

-- project_reports
drop policy if exists "project_reports_select" on public.project_reports;
create policy "project_reports_select" on public.project_reports for select to authenticated
  using (public.is_full_member());
drop policy if exists "project_reports_insert" on public.project_reports;
create policy "project_reports_insert" on public.project_reports for insert to authenticated
  with check ((public.is_admin() or public.is_project_lead(project_id))
              and created_by = auth.uid());
drop policy if exists "project_reports_delete" on public.project_reports;
create policy "project_reports_delete" on public.project_reports for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- ─────────────────────────────
-- 3. 最初の5つの事業（まだ1つも無いときだけ入れる）
-- ─────────────────────────────

do $$
declare
  v_names text[] := array['備えの提供事業', '解体トレ事業', '防災教育事業',
                          '災害ボランティアサポート事業', '自治会対応事業'];
  v_stages text[] := array['企画', '準備', '実施', 'ふり返り'];
  v_id uuid;
  i int;
  j int;
begin
  if exists (select 1 from public.projects) then
    return;
  end if;
  for i in 1 .. array_length(v_names, 1) loop
    insert into public.projects (name, sort_order) values (v_names[i], i) returning id into v_id;
    for j in 1 .. array_length(v_stages, 1) loop
      insert into public.project_stages (project_id, title, sort_order) values (v_id, v_stages[j], j);
    end loop;
  end loop;
end;
$$;
