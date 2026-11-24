-- Minimal stand-in for a Supabase project, matching the live setup script
-- (2026-11-24) closely enough to run the migration and RLS tests in PGlite.
-- NOT for the live database.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text unique);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role'
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table public.players (
  id text primary key,
  name text not null,
  type text not null,
  created_at timestamptz default now(),
  phone text default '',
  address text default '',
  notes text default '',
  is_admin boolean default false,
  password_hash text,
  active boolean default true
);

create table public.matches (
  id text primary key,
  date text,
  opponent text,
  location text,
  is_home boolean,
  status text,
  created_at timestamptz default now(),
  selected_player_ids jsonb default '[]'::jsonb,
  declined_player_ids jsonb default '[]'::jsonb,
  rounds jsonb default '[]'::jsonb,
  final_result jsonb default '{"homeScore": 0, "awayScore": 0, "outcome": "PENDING"}'::jsonb
);

-- Supabase's default grants, plus the user's open policies.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;

alter table public.players enable row level security;
alter table public.matches enable row level security;
create policy "Public access to players" on public.players for all to anon, authenticated using (true) with check (true);
create policy "Public access to matches" on public.matches for all to anon, authenticated using (true) with check (true);

-- Existing "real" data shape: one admin, one regular, one substitute.
insert into public.players (id, name, type, active, is_admin, password_hash) values
  ('p-1', 'Lars van Dijk', 'VAST', true, true, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'),
  ('p-2', 'Daan Meijer', 'VAST', true, false, 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'),
  ('p-5', 'Thijs Visser', 'WISSEL', true, false, null);
insert into public.matches (id, date, opponent, location, is_home, status) values
  ('m-1', '01-10-2026', 'BC Test', 'Apollo Sporthal', true, 'GEPLAND');
