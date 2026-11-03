-- 防災Sowing 会員アプリ用 Supabase 初期テーブル案
-- 注意：このSQLを実行する前に、会員認証とアクセス制御の設計を確定してください。
-- 会員名・参加者一覧を一般公開しないため、RLSを有効にした状態で運用します。

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  place text,
  description text,
  capacity integer,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_name text not null,
  attendance text not null check (attendance in ('参加','不参加')),
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.announcements enable row level security;
alter table public.event_responses enable row level security;

-- ここではポリシーを意図的に作成していません。
-- 誰でも読める/書けるポリシーを先に設定すると、氏名や管理機能が公開される恐れがあるためです。
-- 会員だけが閲覧・登録でき、管理者だけが編集できる認証方式を設定してから追加します。
