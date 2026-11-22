-- 防災Sowing 会員アプリ：会員ログイン（個人コード）と正会員ページ「事業の進み具合」
--
-- Supabase の「SQL Editor」に全部貼り付けて「Run」を1回押してください。
-- 新しい表と仕組みを足すだけで、今あるイベント・お知らせのデータは変えません。
-- 何度実行しても大丈夫なように書いてあります。
--
-- しくみ
--  ・管理者が会員を「協働会員」か「正会員」として登録すると、その人専用の「会員コード」ができる
--  ・会員はアプリを初めて開いたとき、会員コードを1回入れるだけ（端末ごとに1回）
--  ・正会員として登録された人には、正会員ページ（事業の進み具合）が表示される

create extension if not exists pgcrypto with schema extensions;  -- コードの乱数づくりに使う

-- ─────────────────────────────
-- 1. 会員
-- ─────────────────────────────

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 40),
  member_type text not null default '協働会員' check (member_type in ('協働会員', '正会員')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

-- 会員コード（管理者だけが見られる）
create table if not exists public.member_codes (
  member_id uuid primary key references public.members(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.member_codes enable row level security;

-- どの端末（ログイン）がどの会員か
create table if not exists public.member_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.member_devices enable row level security;

-- 会員コードの入力記録（何度も試されるのを防ぐ）
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  ok boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.login_attempts enable row level security;

-- だれが何者かを調べる関数
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.id
  from public.member_devices d
  join public.members m on m.id = d.member_id
  where d.user_id = auth.uid() and m.active;
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.current_member_id() is not null;
$$;

create or replace function public.is_full_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.members
                 where id = public.current_member_id() and member_type = '正会員');
$$;

create or replace function public.too_many_attempts(p_kind text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.login_attempts
          where user_id = auth.uid() and kind = p_kind and not ok
            and attempted_at > now() - interval '15 minutes') >= 5
      or (select count(*) from public.login_attempts
          where kind = p_kind and not ok
            and attempted_at > now() - interval '15 minutes') >= 100;
$$;

-- 自分の会員情報
create or replace function public.get_my_member() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(m) from public.members m where m.id = public.current_member_id();
$$;

-- 会員コードでログインする
create or replace function public.login_with_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_member public.members;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', 'ログインの準備ができていません。アプリを開き直してください。');
  end if;

  if public.too_many_attempts('code') then
    return jsonb_build_object('ok', false, 'message', '何度も間違えたため、15分ほど待ってからもう一度お試しください。');
  end if;

  select m.* into v_member
  from public.member_codes c
  join public.members m on m.id = c.member_id
  where c.code = v_code and m.active;

  if v_member.id is null then
    insert into public.login_attempts (user_id, kind, ok) values (v_uid, 'code', false);
    return jsonb_build_object('ok', false, 'message', '会員コードが違います。もう一度確かめてください。');
  end if;

  insert into public.login_attempts (user_id, kind, ok) values (v_uid, 'code', true);

  insert into public.member_devices (user_id, member_id) values (v_uid, v_member.id)
  on conflict (user_id) do update set member_id = excluded.member_id, created_at = now();

  return jsonb_build_object('ok', true, 'member', to_jsonb(v_member));
end;
$$;

-- 会員を登録して会員コードを作る（管理者だけ）
create or replace function public.create_member(p_name text, p_member_type text default '協働会員')
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_member public.members;
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not public.is_admin() then
    raise exception '管理者だけが会員を登録できます';
  end if;

  insert into public.members (display_name, member_type)
  values (btrim(p_name), case when p_member_type = '正会員' then '正会員' else '協働会員' end)
  returning * into v_member;

  loop
    v_code := '';
    for i in 1 .. 8 loop
      v_code := v_code || substr(v_chars, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.member_codes where code = v_code);
  end loop;

  insert into public.member_codes (member_id, code) values (v_member.id, v_code);

  return jsonb_build_object('member', to_jsonb(v_member), 'code', v_code);
end;
$$;

-- 会員コードを作り直す（なくした・漏れたとき。管理者だけ）
create or replace function public.reset_member_code(p_member_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
begin
  if not public.is_admin() then
    raise exception '管理者だけがコードを作り直せます';
  end if;

  loop
    v_code := '';
    for i in 1 .. 8 loop
      v_code := v_code || substr(v_chars, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.member_codes where code = v_code);
  end loop;

  insert into public.member_codes (member_id, code) values (p_member_id, v_code)
  on conflict (member_id) do update set code = excluded.code, created_at = now();

  return v_code;
end;
$$;

revoke all on function public.login_with_code(text) from public, anon;
revoke all on function public.create_member(text, text) from public, anon;
revoke all on function public.reset_member_code(uuid) from public, anon;
revoke all on function public.too_many_attempts(text) from public, anon, authenticated;
grant execute on function public.login_with_code(text) to authenticated;
grant execute on function public.create_member(text, text) to authenticated;
grant execute on function public.reset_member_code(uuid) to authenticated;
grant execute on function public.get_my_member() to authenticated;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.current_member_id() to authenticated, anon;
grant execute on function public.is_member() to authenticated, anon;
grant execute on function public.is_full_member() to authenticated, anon;

-- members：自分の行と、管理者は全員分
drop policy if exists "members_select" on public.members;
create policy "members_select" on public.members for select to authenticated
  using (id = public.current_member_id() or public.is_admin());
drop policy if exists "members_update_admin" on public.members;
create policy "members_update_admin" on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "members_delete_admin" on public.members;
create policy "members_delete_admin" on public.members for delete to authenticated
  using (public.is_admin());

-- member_codes：管理者だけ
drop policy if exists "member_codes_admin" on public.member_codes;
create policy "member_codes_admin" on public.member_codes for select to authenticated
  using (public.is_admin());

-- member_devices：管理者だけが見て消せる（自分の端末を解除するのは関数経由で不要）
drop policy if exists "member_devices_admin" on public.member_devices;
create policy "member_devices_admin" on public.member_devices for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
drop policy if exists "member_devices_delete_admin" on public.member_devices;
create policy "member_devices_delete_admin" on public.member_devices for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

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

-- アプリ上でその事業を更新できる担当者
create table if not exists public.project_leads (
  project_id uuid not null references public.projects(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  primary key (project_id, member_id)
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
                 where project_id = p_project_id
                   and member_id = public.current_member_id());
$$;
grant execute on function public.is_project_lead(uuid) to authenticated;

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

drop policy if exists "project_leads_select" on public.project_leads;
create policy "project_leads_select" on public.project_leads for select to authenticated
  using (public.is_full_member());
drop policy if exists "project_leads_write" on public.project_leads;
create policy "project_leads_write" on public.project_leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "project_stages_select" on public.project_stages;
create policy "project_stages_select" on public.project_stages for select to authenticated
  using (public.is_full_member());
drop policy if exists "project_stages_write" on public.project_stages;
create policy "project_stages_write" on public.project_stages for all to authenticated
  using (public.is_admin() or public.is_project_lead(project_id))
  with check (public.is_admin() or public.is_project_lead(project_id));

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

-- ─────────────────────────────
-- 4. アプリから使えるようにする（読み書きの許可。中身の制限は上のルールで守る）
-- ─────────────────────────────
grant select, insert, update, delete on public.projects, public.project_stages,
  public.project_reports, public.project_leads to authenticated;
grant select, update, delete on public.members to authenticated;
grant select on public.member_codes to authenticated;
grant select, delete on public.member_devices to authenticated;
